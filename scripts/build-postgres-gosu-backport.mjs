import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { assertNativeArchitecture, runBoundedCommand, verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";
import { resolveLocalContainerRuntime } from "./local-container-runtime.mjs";

export { assertNativeArchitecture, runBoundedCommand, verifyPinnedFile };
const directory = fileURLToPath(new URL("../infra/postgres-gosu-backport/", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const operationLabel = "io.vivalatax.qualification.operation";
const immutableImage = /^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64})$/;

export function parseBuilderArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    assert.ok(["--runtime", "--architecture", "--source-cache", "--output", "--base-image"].includes(key), "Unknown builder option.");
    assert.ok(args[i + 1] && !values[key], "Missing or repeated builder option.");
    values[key] = args[i + 1];
  }
  assert.ok(values["--base-image"], "An explicit base image is required.");
  assert.match(values["--base-image"], immutableImage, "An immutable base image identity is required.");
  assert.ok(["docker", "podman"].includes(values["--runtime"]), "Choose docker or podman explicitly.");
  assert.ok(["arm64", "amd64"].includes(values["--architecture"]), "Choose a native architecture explicitly.");
  assert.ok(values["--source-cache"] && values["--output"], "Specify source-cache and fresh output.");
  return { runtime: values["--runtime"], architecture: values["--architecture"], sourceCache: resolve(values["--source-cache"]), output: resolve(values["--output"]), baseImage: values["--base-image"] };
}

export function assertGosuChecksPassed(status) {
  for (const field of ["moduleDownloadExit", "moduleVerifyExit", "compileCheckExit", "buildExit", "metadataCheckExit", "functionalCheckExit"]) assert.equal(status[field], 0, `Required gosu check ${field} failed or is absent.`);
  assert.equal(status.candidateReleaseQualified, false, "Build success is not release qualification.");
  assert.equal(status.riskAccepted, false, "Build success is not risk acceptance.");
}

export function assertGosuMetadata(text, architecture) {
  assert.match(text.split("\n")[0], /^\S+: go1\.27\.4$/, "Wrong gosu compiler.");
  const lines = text.split("\n").map(line => line.trim());
  for (const line of ["path\tgithub.com/tianon/gosu", "mod\tgithub.com/tianon/gosu\t(devel)", "dep\tgithub.com/moby/sys/user\tv0.4.1\th1:RgjRlaDKi/Xmyrz4t8lyzXT6v2ooFeO/7xtchmhVWE0=", "dep\tgolang.org/x/sys\tv0.1.0\th1:kunALQeHf1/185U1i0GOB/fy1IPRDDpuoOOqRReG57U=", "build\tCGO_ENABLED=0", "build\tGOOS=linux", `build\tGOARCH=${architecture}`]) assert.ok(lines.includes(line), "Missing or altered gosu build/module metadata.");
  assert.equal(lines.filter(line => line.startsWith("dep\t")).length, 2, "Unexpected dependency in candidate.");
  assert.ok(!lines.some(line => line.startsWith("=>")), "Module replacement is not admitted.");
}

export function assertStaticGosuElf(bytes, architecture) {
  assert.ok(bytes.length >= 64 && bytes.length < 64 * 1024 ** 2, "Invalid executable length.");
  assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46", "Missing ELF magic.");
  assert.equal(bytes[4], 2, "Require 64-bit ELF.");
  assert.equal(bytes[5], 1, "Require little-endian ELF.");
  assert.equal(bytes.readUInt16LE(18), { arm64: 183, amd64: 62 }[architecture], "Wrong executable architecture.");
  const offset = Number(bytes.readBigUInt64LE(32));
  const size = bytes.readUInt16LE(54);
  const count = bytes.readUInt16LE(56);
  assert.ok(Number.isSafeInteger(offset) && offset >= 64 && size >= 56 && count > 0 && offset + size * count <= bytes.length, "Invalid ELF program headers.");
  for (let i = 0; i < count; i++) assert.ok(![2, 3].includes(bytes.readUInt32LE(offset + i * size)), "Gosu must not have a dynamic section or ELF interpreter.");
}

async function copyPinned(source, target, pin) {
  await verifyPinnedFile(source, pin);
  await copyFile(source, target, constants.COPYFILE_EXCL);
  await verifyPinnedFile(target, pin);
}

export async function verifyGosuArtifacts(path, architecture) {
  const expected = new Set(["gosu", "LICENSE", "THIRD-PARTY-LICENSES.txt", "go-metadata.txt", "status.json"]);
  const manifestPath = join(path, "ARTIFACTS.sha256");
  const manifestStat = await lstat(manifestPath);
  assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.nlink === 1 && manifestStat.size < 1024, "Invalid artifact manifest file.");
  const manifest = await readFile(manifestPath, "utf8");
  for (const line of manifest.trim().split("\n")) {
    const match = /^([a-f0-9]{64}) {2}(gosu|LICENSE|THIRD-PARTY-LICENSES\.txt|go-metadata\.txt|status\.json)$/.exec(line);
    assert.ok(match && expected.delete(match[2]), "Unexpected or repeated artifact manifest entry.");
    const metadata = await lstat(join(path, match[2]));
    const limit = { gosu: 64 * 1024 ** 2, LICENSE: 1024 ** 2, "THIRD-PARTY-LICENSES.txt": 1024 ** 2, "go-metadata.txt": 1024 ** 2, "status.json": 8192 }[match[2]];
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1 && metadata.size > 0 && metadata.size < limit, "Invalid artifact file or length.");
    const bytes = await readFile(join(path, match[2]));
    await verifyPinnedFile(join(path, match[2]), { bytes: bytes.length, sha256: match[1] });
  }
  assert.equal(expected.size, 0, "Missing required gosu artifact.");
  const binary = await readFile(join(path, "gosu"));
  assertStaticGosuElf(binary, architecture);
  assertGosuMetadata(await readFile(join(path, "go-metadata.txt"), "utf8"), architecture);
  const status = JSON.parse(await readFile(join(path, "status.json"), "utf8"));
  assertGosuChecksPassed(status);
  return { binarySha256: hash(binary), manifestSha256: hash(manifest), status };
}

export async function buildCandidate(options) {
  // Public callers get the same option admission as the CLI, before any daemon access.
  parseBuilderArguments(["--runtime", options.runtime, "--architecture", options.architecture, "--source-cache", options.sourceCache, "--output", options.output, "--base-image", options.baseImage]);
  const manifestBytes = await readFile(join(directory, "sources.json"));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.candidateReleaseQualified, false);
  assert.equal(manifest.riskAccepted, false);
  const sdk = manifest.toolchain.platforms[options.architecture];
  const sources = [...manifest.sources, sdk];
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) {
    assert.equal(basename(name), name, "Recipe inputs must be leaf filenames.");
    await verifyPinnedFile(join(directory, name), pin);
  }
  for (const pin of sources) {
    assert.equal(basename(pin.name), pin.name, "Source inputs must be leaf filenames.");
    await verifyPinnedFile(join(options.sourceCache, pin.name), pin);
  }
  await mkdir(options.output, { mode: 0o700 });
  const context = join(options.output, "context");
  const inputs = join(context, "inputs");
  const artifacts = join(options.output, "artifacts");
  await mkdir(context, { mode: 0o700 }); await mkdir(inputs, { mode: 0o700 }); await mkdir(artifacts, { mode: 0o700 });
  for (const pin of sources) await copyPinned(join(options.sourceCache, pin.name), join(inputs, pin.name), pin);
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) await copyPinned(join(directory, name), join(context, name), pin);
  await writeFile(join(inputs, "SHA256SUMS"), sources.map(pin => `${pin.sha256}  ${pin.name}\n`).join(""), { flag: "wx", mode: 0o600 });
  await writeFile(join(options.output, "source-manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
  const operation = randomUUID();
  const deadline = performance.now() + 45 * 60_000;
  const receipt = { operation, architecture: options.architecture, requestedBase: options.baseImage, sourceManifestSha256: hash(manifestBytes), checks: [], cleanupErrors: [], candidateReleaseQualified: false, riskAccepted: false, physicalHostProvenanceVerified: false, nativeFunctionalQualificationComplete: false, rawImageScanComplete: false, bitwiseReproducibilityProved: false };
  const images = [];
  let connection; let exporter; let candidateTag; let success = false; let failure;
  await writeFile(join(options.output, "build-admission.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  async function command(label, args, timeoutMs = 60_000, cleanup = false, scope = connection) {
    const remaining = deadline - performance.now() - (cleanup ? 0 : 5 * 60_000);
    assert.ok(remaining > 3_000, "Builder deadline exhausted.");
    let stdout = ""; let stderr = ""; let code = 0;
    try {
      const result = await runBoundedCommand(options.runtime, [...scope.args, ...args], { env: scope.env, timeoutMs: Math.min(timeoutMs, remaining - 2_000) });
      stdout = result.stdout; stderr = result.stderr;
    } catch (error) {
      stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; code = error.code ?? "unknown";
      if (error.childExitConfirmed === false) { receipt.unconfirmedChildren ??= []; receipt.unconfirmedChildren.push({ step: label, pid: error.ownedChildPid }); }
      throw new Error(`Candidate builder step ${label} failed; inspect private logs.`, { cause: error });
    } finally {
      await writeFile(join(options.output, label + ".stdout"), stdout, { flag: "wx", mode: 0o600 });
      await writeFile(join(options.output, label + ".stderr"), stderr, { flag: "wx", mode: 0o600 });
      receipt.checks.push({ step: label, exit: code });
    }
    return stdout;
  }
  async function inspect(label, image) {
    const [result] = JSON.parse(await command(label, ["image", "inspect", image]));
    assert.equal(result.Architecture, options.architecture); assert.equal(result.Os, "linux");
    const id = result.Id.replace(/^sha256:/, ""); assert.match(id, /^[a-f0-9]{64}$/);
    return { result, id };
  }
  async function build(label, file, tag, args) {
    images.push(tag);
    await command(label, ["build", "--force-rm", options.runtime === "podman" ? "--pull=never" : "--pull=false", "--network", "none", "--platform", `linux/${options.architecture}`, "--label", `${operationLabel}=${operation}`, "--build-arg", `EXPECTED_ARCH=${options.architecture}`, "--build-arg", `BASE=sha256:${receipt.baseImage}`, ...args, "--file", join(context, file), "--tag", tag, context], 30 * 60_000);
    const image = await inspect(label + "-inspect", tag); assert.equal(image.result.Config.Labels[operationLabel], operation); return image;
  }
  try {
    const args = options.runtime === "docker" ? ["context", "inspect", ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : [])] : ["system", "connection", "list", "--format", "json"];
    const needs = options.runtime === "docker" ? process.env.DOCKER_CONTEXT || !process.env.DOCKER_HOST : !process.env.CONTAINER_HOST;
    const selector = needs ? await command("runtime-selector", args, 15_000, false, { args: [], env: process.env }) : "";
    connection = resolveLocalContainerRuntime(options.runtime, process.env, (executable, requested) => { assert.equal(executable, options.runtime); assert.deepEqual(requested, args); return selector; });
    receipt.transportEndpoint = connection.endpoint;
    assertNativeArchitecture(JSON.parse(await command("native-daemon", ["info", "--format", "{{json .}}"])), options.architecture);
    const base = await inspect("base-inspect", options.baseImage);
    receipt.baseImage = base.id;
    if (options.baseImage.startsWith("sha256:")) assert.equal(options.baseImage, `sha256:${base.id}`, "Local base identity changed.");
    const built = await build("gosu-build", "Dockerfile.build", `localhost/tax-gosu-build:${operation}`, []);
    exporter = `tax-gosu-export-${operation}`;
    await command("exporter-create", ["create", ...(options.runtime === "podman" ? ["--image-volume=ignore"] : ["--mount", "type=tmpfs,destination=/var/lib/postgresql/data"]), "--name", exporter, "--label", `${operationLabel}=${operation}`, "--entrypoint", "/bin/true", `sha256:${built.id}`]);
    const [container] = JSON.parse(await command("exporter-inspect", ["container", "inspect", exporter]));
    assert.equal(container.Config.Labels[operationLabel], operation); assert.equal(container.Image.replace(/^sha256:/, ""), built.id);
    assert.ok(container.Mounts.every(mount => options.runtime === "docker" && mount.Type === "tmpfs" && mount.Destination === "/var/lib/postgresql/data"), "Unexpected exporter mount.");
    await command("artifacts-export", ["cp", `${exporter}:/qualification-out/.`, artifacts], 180_000);
    receipt.artifacts = await verifyGosuArtifacts(artifacts, options.architecture);
    for (const name of ["gosu", "LICENSE", "THIRD-PARTY-LICENSES.txt"]) { const bytes = await readFile(join(artifacts, name)); await copyPinned(join(artifacts, name), join(context, name), { bytes: bytes.length, sha256: hash(bytes) }); }
    candidateTag = `localhost/tax-gosu-candidate:${operation}`;
    const candidate = await build("candidate-build", "Dockerfile", candidateTag, ["--build-arg", `SOURCE_MANIFEST_SHA=${receipt.sourceManifestSha256}`, "--build-arg", `GOSU_SHA256=${receipt.artifacts.binarySha256}`]);
    for (const key of ["candidate-release-qualified", "risk-accepted"]) assert.equal(candidate.result.Config.Labels[`io.vivalatax.${key}`], "false");
    assert.equal(candidate.result.Config.Labels["io.vivalatax.source-manifest-sha256"], receipt.sourceManifestSha256);
    assert.equal(candidate.result.Config.Labels["io.vivalatax.gosu-sha256"], receipt.artifacts.binarySha256);
    receipt.candidateImage = candidate.id; receipt.candidateTag = candidateTag; success = true;
  } catch (error) { receipt.failure = error.message; failure = error; }
  finally {
    if (exporter && !receipt.unconfirmedChildren?.length) {
      try {
        const present = await command("exporter-cleanup-present", ["container", "ls", "--all", "--quiet", "--filter", `name=${exporter}`], 30_000, true);
        if (present.trim()) { const [container] = JSON.parse(await command("exporter-cleanup-inspect", ["container", "inspect", exporter], 30_000, true)); assert.equal(container.Config.Labels[operationLabel], operation); await command("exporter-cleanup", ["rm", "--volumes", exporter], 60_000, true); }
      } catch { receipt.cleanupErrors.push("owned-exporter"); }
    }
    for (const [index, tag] of images.reverse().entries()) {
      if (receipt.unconfirmedChildren?.length) break;
      if (success && tag === candidateTag) continue;
      try {
        const present = await command(`image-cleanup-present-${index}`, ["image", "ls", "--quiet", "--filter", `reference=${tag}`], 30_000, true);
        if (present.trim()) { const [image] = JSON.parse(await command(`image-cleanup-inspect-${index}`, ["image", "inspect", tag], 30_000, true)); assert.equal(image.Config.Labels[operationLabel], operation); await command(`image-cleanup-${index}`, ["image", "rm", tag], 60_000, true); }
      } catch { receipt.cleanupErrors.push(`owned-image-${index}`); }
    }
    if (receipt.unconfirmedChildren?.length) receipt.cleanupErrors.push("unconfirmed-owned-child");
    receipt.deadlineExceeded = performance.now() > deadline;
    receipt.success = success && receipt.cleanupErrors.length === 0 && !receipt.deadlineExceeded;
    await writeFile(join(options.output, "build-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (failure) throw failure;
  if (!receipt.success) throw new Error("Candidate cleanup or deadline requires review.");
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseBuilderArguments(process.argv.slice(2));
  const result = await buildCandidate(options);
  console.log(JSON.stringify({ candidateImage: result.candidateImage, output: options.output, candidateReleaseQualified: false, riskAccepted: false }));
}

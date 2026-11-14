import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { clearTimeout, setTimeout } from "node:timers";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { resolveLocalContainerRuntime } from "./local-container-runtime.mjs";

const recipeDirectory = fileURLToPath(new URL("../infra/postgres-libxml2-backport/", import.meta.url));
const operationLabel = "io.vivalatax.qualification.operation";
const cleanupReserveMs = 15 * 60_000;
const usage = "node scripts/build-postgres-libxml2-backport.mjs --runtime docker|podman --architecture arm64|amd64 --source-cache PATH --output NEW_PATH";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function runBoundedCommand(executable, arguments_, { env, timeoutMs, closeGraceMs = 2_000 }) {
  assert.ok(timeoutMs > 0 && closeGraceMs > 0, "Command time bounds must be positive.");
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(executable, arguments_, { env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = { stdout: [], stderr: [] };
    let bytes = 0;
    let settled = false;
    let termination;
    let closeTimer;

    function finish(error, childExitConfirmed = true) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(closeTimer);
      const output = { stdout: Buffer.concat(chunks.stdout).toString("utf8"), stderr: Buffer.concat(chunks.stderr).toString("utf8") };
      if (error) {
        Object.assign(error, output, { childExitConfirmed });
        if (!childExitConfirmed) {
          error.ownedChildPid = child.pid;
          error.ownedChild = child;
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        }
        rejectCommand(error);
      } else resolveCommand(output);
    }

    function terminate(reason) {
      if (termination || settled) return;
      termination = new Error(reason);
      termination.code = "BOUNDED_COMMAND_TERMINATED";
      child.kill("SIGTERM");
      closeTimer = setTimeout(() => finish(termination, false), closeGraceMs);
    }

    function collect(stream, chunk) {
      const remaining = 64 * 1024 ** 2 - bytes;
      if (remaining > 0) chunks[stream].push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > 64 * 1024 ** 2) terminate("Container command exceeded its output limit.");
    }

    child.stdout.on("data", chunk => collect("stdout", chunk));
    child.stderr.on("data", chunk => collect("stderr", chunk));
    child.on("error", error => finish(error));
    child.on("close", (code, signal) => {
      const error = termination ?? (code === 0 ? null : Object.assign(new Error("Container command exited unsuccessfully."), { code: code ?? signal }));
      finish(error);
    });
    const timeoutTimer = setTimeout(() => terminate("Container command exceeded its time limit."), timeoutMs);
  });
}

export function parseBuilderArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    if (!["--runtime", "--architecture", "--source-cache", "--output"].includes(flag)) throw new Error(`Unknown builder option. Usage ${usage}`);
    if (!arguments_[index + 1] || values[flag]) throw new Error(`Missing or repeated builder option. Usage ${usage}`);
    values[flag] = arguments_[index + 1];
  }
  if (!values["--architecture"] || !values["--source-cache"] || !values["--output"]) throw new Error(`Specify architecture, source-cache and output. Usage ${usage}`);
  if (!["docker", "podman"].includes(values["--runtime"])) throw new Error("Choose docker or podman explicitly.");
  if (!["arm64", "amd64"].includes(values["--architecture"])) throw new Error("Choose arm64 or amd64 explicitly.");
  return { runtime: values["--runtime"], architecture: values["--architecture"], sourceCache: resolve(values["--source-cache"]), output: resolve(values["--output"]) };
}

export function assertNativeArchitecture(info, architecture) {
  const os = info.host?.os ?? info.OSType;
  const actual = info.host?.arch ?? info.Architecture;
  const normalized = { arm64: "arm64", aarch64: "arm64", amd64: "amd64", x86_64: "amd64" }[actual];
  assert.equal(os, "linux", "The builder requires a Linux container daemon.");
  assert.equal(normalized, architecture, "The selected daemon must provide the requested native architecture.");
}

export async function verifyPinnedFile(path, pin) {
  const metadata = await lstat(path);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1, "Source must be a regular file without symlink or hardlink aliases.");
  assert.equal(metadata.size, pin.bytes, "Pinned source length differs.");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    assert.equal(opened.ino, metadata.ino, "Pinned source changed during admission.");
    assert.equal(opened.dev, metadata.dev, "Pinned source changed during admission.");
    const digest = hash(await file.readFile());
    assert.equal(digest, pin.sha256, "Pinned source checksum differs.");
    return digest;
  } finally {
    await file.close();
  }
}

export function assertPackageChecksPassed(status) {
  for (const field of ["baselinePackageBuildExit", "baselineOptimizedCheckExit", "candidatePackageBuildExit", "candidateOptimizedCheckExit", "baselineSanitizerExit", "candidateSanitizerExit", "packageOrSanitizerFailure"]) {
    assert.equal(status[field], 0, `Required package check ${field} failed or is absent.`);
  }
  assert.ok([0, 4].includes(status.abidiffExit), "ABI diagnostics failed or are absent.");
  assert.equal(status.genericAbiApproval, false, "Generic ABI approval requires separate qualification.");
}

async function copyPinnedFile(source, destination, pin) {
  await verifyPinnedFile(source, pin);
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  await verifyPinnedFile(destination, pin);
}

async function verifyExportedArtifacts(directory) {
  const root = await realpath(directory);
  const manifest = await readFile(join(directory, "ARTIFACTS.sha256"), "utf8");
  let entries = 0;
  for (const line of manifest.trim().split("\n")) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    assert.ok(match, "Invalid package artifact manifest.");
    const file = await realpath(resolve(directory, match[2]));
    assert.ok(file.startsWith(root + sep), "Package artifact escapes its export directory.");
    const metadata = await lstat(file);
    assert.ok(metadata.isFile() && metadata.size < 1024 ** 3, "Invalid package artifact.");
    assert.equal(hash(await readFile(file)), match[1], "Exported package artifact checksum differs.");
    entries += 1;
  }
  assert.ok(entries > 0, "Empty package artifact manifest.");
  return { entries, sha256: hash(manifest) };
}

export async function buildCandidate(options) {
  const manifestPath = join(recipeDirectory, "sources.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.candidateReleaseQualified, false);
  const platform = manifest.postgres.platforms[options.architecture];
  assert.ok(platform && /^sha256:[a-f0-9]{64}$/.test(platform.digest), "Missing official platform pin.");
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) {
    assert.equal(basename(name), name, "Recipe inputs must be leaf filenames.");
    await verifyPinnedFile(join(recipeDirectory, name), pin);
  }
  for (const source of manifest.sources) {
    assert.equal(basename(source.name), source.name, "Source inputs must be leaf filenames.");
    await verifyPinnedFile(join(options.sourceCache, source.name), source);
  }
  await mkdir(options.output, { mode: 0o700 });
  const operation = randomUUID();
  const context = join(options.output, "context");
  const inputs = join(context, "inputs");
  const artifacts = join(options.output, "artifacts");
  await mkdir(context, { mode: 0o700 });
  await mkdir(inputs, { mode: 0o700 });
  await mkdir(artifacts, { mode: 0o700 });
  for (const source of manifest.sources) await copyPinnedFile(join(options.sourceCache, source.name), join(inputs, source.name), source);
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) {
    await copyPinnedFile(join(recipeDirectory, name), join(["CVE-2026-6653.patch", "exslt.c"].includes(name) ? inputs : context, name), pin);
  }
  const inputNames = [...manifest.sources.map(source => source.name), "CVE-2026-6653.patch", "exslt.c"];
  const checksums = await Promise.all(inputNames.map(async name => `${hash(await readFile(join(inputs, name)))}  ${name}\n`));
  await writeFile(join(inputs, "SHA256SUMS"), checksums.join(""), { flag: "wx", mode: 0o600 });
  await writeFile(join(options.output, "source-manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
  let connection;
  const deadline = performance.now() + 150 * 60_000;
  const receipt = { operation, runtime: options.runtime, architecture: options.architecture, sourceManifestSha256: hash(manifestBytes), postgresBase: `${manifest.postgres.repository}@${platform.digest}`, checks: [], cleanupErrors: [], physicalHostProvenanceVerified: false, candidateReleaseQualified: false, genericAbiApproval: false, riskAccepted: false, bitwiseReproducibilityProved: false };
  const images = [];
  let exporter;
  let candidateTag;
  let success = false;
  let failure;
  await writeFile(join(options.output, "build-admission.json"), JSON.stringify({ operation, architecture: options.architecture, sourceManifestSha256: receipt.sourceManifestSha256, postgresBase: receipt.postgresBase, candidateReleaseQualified: false }, null, 2) + "\n", { flag: "wx", mode: 0o600 });

  async function command(label, arguments_, timeoutMs = 60_000, cleanup = false, scope = connection) {
    const remaining = deadline - performance.now() - (cleanup ? 0 : cleanupReserveMs);
    assert.ok(remaining > 3_000, "Builder deadline exhausted.");
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      const result = await runBoundedCommand(options.runtime, [...scope.args, ...arguments_], { env: scope.env, timeoutMs: Math.min(timeoutMs, remaining - 2_000) });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      stdout = error.stdout ?? "";
      stderr = error.stderr ?? "";
      code = error.code ?? "unknown";
      if (error.childExitConfirmed === false) {
        receipt.unconfirmedChildren ??= [];
        receipt.unconfirmedChildren.push({ step: label, pid: error.ownedChildPid });
      }
      throw new Error(`Container builder step ${label} failed. Inspect its private logs.`, { cause: error });
    } finally {
      await writeFile(join(options.output, label + ".stdout"), stdout, { flag: "wx", mode: 0o600 });
      await writeFile(join(options.output, label + ".stderr"), stderr, { flag: "wx", mode: 0o600 });
      receipt.checks.push({ step: label, exit: code });
    }
    return stdout;
  }

  async function inspectImage(label, image) {
    const [result] = JSON.parse(await command(label, ["image", "inspect", image]));
    assert.equal(result.Architecture, options.architecture);
    assert.equal(result.Os, "linux");
    const id = result.Id.replace(/^sha256:/, "");
    assert.match(id, /^[a-f0-9]{64}$/);
    return { result, id };
  }

  async function build(label, file, tag, args) {
    images.push(tag);
    await command(label, ["build", "--force-rm", options.runtime === "podman" ? "--pull=never" : "--pull=false", "--platform", `linux/${options.architecture}`, "--label", `${operationLabel}=${operation}`, "--build-arg", `EXPECTED_ARCH=${options.architecture}`, ...args, "--file", join(context, file), "--tag", tag, context], label === "package-build" ? 90 * 60_000 : 20 * 60_000);
    const image = await inspectImage(label + "-inspect", tag);
    assert.equal(image.result.Config.Labels[operationLabel], operation);
    return image.id;
  }

  try {
    const selectorArgs = options.runtime === "docker"
      ? ["context", "inspect", ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : [])]
      : ["system", "connection", "list", "--format", "json"];
    const needsSelector = options.runtime === "docker" ? process.env.DOCKER_CONTEXT || !process.env.DOCKER_HOST : !process.env.CONTAINER_HOST;
    const selector = needsSelector ? await command("runtime-selector", selectorArgs, 15_000, false, { args: [], env: process.env }) : "";
    connection = resolveLocalContainerRuntime(options.runtime, process.env, (executable, arguments_) => {
      assert.equal(executable, options.runtime);
      assert.deepEqual(arguments_, selectorArgs);
      return selector;
    });
    receipt.transportEndpoint = connection.endpoint;
    assertNativeArchitecture(JSON.parse(await command("native-daemon", ["info", "--format", "{{json .}}"])), options.architecture);
    await command("base-pull", ["pull", receipt.postgresBase], 180_000);
    await inspectImage("base-inspect", receipt.postgresBase);
    const toolchain = await build("toolchain-build", "Dockerfile.toolchain", `localhost/tax-libxml2-toolchain:${operation}`, ["--build-arg", `BASE=${receipt.postgresBase}`]);
    const packages = await build("package-build", "Dockerfile.packages", `localhost/tax-libxml2-packages:${operation}`, ["--network", "none", "--build-arg", `TOOLCHAIN=${toolchain}`]);
    exporter = `tax-libxml2-export-${operation}`;
    await command("exporter-create", ["create", ...(options.runtime === "podman" ? ["--image-volume=ignore"] : []), "--name", exporter, "--label", `${operationLabel}=${operation}`, "--entrypoint", "/bin/true", packages]);
    const [container] = JSON.parse(await command("exporter-inspect", ["container", "inspect", exporter]));
    assert.equal(container.Config.Labels[operationLabel], operation);
    assert.equal(container.Image.replace(/^sha256:/, ""), packages);
    assert.ok(container.Mounts.every(mount => options.runtime === "docker" && mount.Type === "volume" && mount.Destination === "/var/lib/postgresql/data"), "Unexpected exporter mount.");
    await command("artifacts-export", ["cp", `${exporter}:/qualification-out/.`, artifacts], 180_000);
    receipt.artifactManifest = await verifyExportedArtifacts(artifacts);
    const status = JSON.parse(await readFile(join(artifacts, "status.json"), "utf8"));
    receipt.packageStatus = status;
    assertPackageChecksPassed(status);
    const packagePath = join(artifacts, "candidate", `libxml2_${manifest.privateCandidateVersion}_${options.architecture}.deb`);
    const packageBytes = await readFile(packagePath);
    receipt.runtimePackageSha256 = hash(packageBytes);
    await writeFile(join(context, "runtime-package.deb"), packageBytes, { flag: "wx", mode: 0o600 });
    candidateTag = `localhost/tax-libxml2-candidate:${operation}`;
    const id = await build("candidate-build", "Dockerfile", candidateTag, ["--network", "none", "--build-arg", `BASE=${receipt.postgresBase}`, "--build-arg", `DEBIAN_MULTIARCH=${platform.multiarch}`, "--build-arg", `SOURCE_MANIFEST_SHA=${receipt.sourceManifestSha256}`]);
    const candidate = await inspectImage("candidate-labels", id);
    assert.equal(candidate.result.Config.Labels["io.vivalatax.candidate-release-qualified"], "false");
    assert.equal(candidate.result.Config.Labels["io.vivalatax.risk-accepted"], "false");
    assert.equal(candidate.result.Config.Labels["io.vivalatax.source-manifest-sha256"], receipt.sourceManifestSha256);
    receipt.candidateImage = id;
    receipt.candidateTag = candidateTag;
    success = true;
  } catch (error) {
    receipt.failure = error.message;
    failure = error;
  } finally {
    if (exporter && !receipt.unconfirmedChildren?.length) {
      try {
        const present = await command("exporter-cleanup-present", ["container", "ls", "--all", "--quiet", "--filter", `name=${exporter}`], 30_000, true);
        if (present.trim()) {
          const [container] = JSON.parse(await command("exporter-cleanup-inspect", ["container", "inspect", exporter], 30_000, true));
          assert.equal(container.Config.Labels[operationLabel], operation);
          await command("exporter-cleanup", ["rm", "--volumes", exporter], 60_000, true);
        }
      } catch { receipt.cleanupErrors.push("owned-exporter"); }
    }
    for (const [index, tag] of images.reverse().entries()) {
      if (receipt.unconfirmedChildren?.length) break;
      if (success && tag === candidateTag) continue;
      try {
        const present = await command(`image-cleanup-present-${index}`, ["image", "ls", "--quiet", "--filter", `reference=${tag}`], 30_000, true);
        if (present.trim()) {
          const [image] = JSON.parse(await command(`image-cleanup-inspect-${index}`, ["image", "inspect", tag], 30_000, true));
          assert.equal(image.Config.Labels[operationLabel], operation);
          await command(`image-cleanup-${index}`, ["image", "rm", tag], 60_000, true);
        }
      } catch { receipt.cleanupErrors.push(`owned-image-${index}`); }
    }
    if (receipt.unconfirmedChildren?.length) receipt.cleanupErrors.push("unconfirmed-owned-child");
    receipt.deadlineExceeded = performance.now() > deadline;
    receipt.success = success && receipt.cleanupErrors.length === 0 && !receipt.deadlineExceeded;
    await writeFile(join(options.output, "build-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (failure) throw failure;
  if (!receipt.success) throw new Error("Candidate builder cleanup or deadline needs review. Inspect its private receipt.");
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseBuilderArguments(process.argv.slice(2));
  const receipt = await buildCandidate(options);
  console.log(JSON.stringify({ candidateImage: receipt.candidateImage, output: options.output, candidateReleaseQualified: false, riskAccepted: false }));
}

import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, statfs, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { arch, platform } from "node:os";
import { performance } from "node:perf_hooks";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { assertGosuMetadata, assertStaticGosuElf } from "./build-postgres-gosu-backport.mjs";
import { runBoundedCommand, verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";
import { resolveLocalContainerRuntime } from "./local-container-runtime.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const GIB = 1024 ** 3;
const LABEL = "io.vivalatax.qualification.operation";
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RESERVE = 2 * GIB;
// The extra workflow time permits final publication after the controller exits.
export const JOB_LIMITS = { package: { minutes: 165, controllerMinutes: 155, cleanupMinutes: 15, diskGiB: 20 }, runtime: { minutes: 90, controllerMinutes: 80, cleanupMinutes: 15, diskGiB: 12 }, independent: { minutes: 15, controllerMinutes: 10, cleanupMinutes: 3, diskGiB: 8 } };
const PUBLIC = new Set(["result.json", "handoff.json", "candidate.tar", "runtime-image.cdx.json", "runtime-scan.json", "build-receipt.json", "source-manifest.json", "admission.json", "runtime-summary.json", "scan-binding.json", "database-listing.json", "package-status.json", "gosu", "go-metadata.txt", "LICENSE", "THIRD-PARTY-LICENSES.txt", "gosu-status.json", "artifact-hashes.txt", "abidiff.txt", "toolchain-packages.tsv", "toolchain-compiler.txt", "toolchain-linker.txt", "toolchain-buildflags.txt", "candidate-package.deb", "baseline-package.deb"]);
const HOSTS = new Set(["deb.debian.org", "download.gnome.org", "go.dev", "dl.google.com", "codeload.github.com", "proxy.golang.org", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "grype.anchore.io", "toolbox-data.anchore.io"]);
const SCANNERS = [
  { name: "syft", version: "1.57.1", url: "https://github.com/anchore/syft/releases/download/v1.57.1/syft_1.57.1_linux_amd64.tar.gz", sha256: "bf52519eb57f675d47c07d43213cb6dff6449f3d6d1147ff6701ed91f44eef0c" },
  { name: "grype", version: "0.121.3", url: "https://github.com/anchore/grype/releases/download/v0.121.3/grype_0.121.3_linux_amd64.tar.gz", sha256: "e9da18cc1429e786722e32161288103600efffd8e483c90761f90485bd1bec85" },
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const exclusive = (path, value) => writeFile(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const imageId = value => { const id = value.replace(/^sha256:/, ""); assert.match(id, SHA); return id; };

export function publicationAllowed(name) { return PUBLIC.has(name) && basename(name) === name; }
export function admitExecution(env, event, host) {
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(event.repository.private, false); assert.equal(event.repository.fork, false);
  assert.equal(event.repository.full_name, env.GITHUB_REPOSITORY);
  assert.equal(env.GITHUB_REF, "refs/heads/" + event.repository.default_branch);
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted"); assert.equal(env.RUNNER_OS, "Linux"); assert.equal(env.RUNNER_ARCH, "X64");
  assert.match(env.GITHUB_SHA, COMMIT); assert.equal(event.inputs.source_sha, env.GITHUB_SHA);
  assert.match(env.GITHUB_RUN_ID, /^\d+$/); assert.equal(env.GITHUB_RUN_ATTEMPT, "1", "Automatic or manual retries require a new dispatch.");
  assert.equal(host.platform, "linux"); assert.equal(host.arch, "x64");
  assert.equal(host.docker.OSType, "linux"); assert.ok(["amd64", "x86_64"].includes(host.docker.Architecture));
  assert.match(host.endpoint, /^unix:\/\/\/[^?#]+$/); assert.equal(host.head, env.GITHUB_SHA); assert.equal(host.trackedUnchanged, true);
  assert.deepEqual(host.runningContainers, [], "An active container prevents admission.");
}
export function assertCapacity(mode, workspaceBytes, dockerBytes, checkpoint = false) {
  assert.ok(Object.hasOwn(JOB_LIMITS, mode));
  const required = checkpoint ? RESERVE : JOB_LIMITS[mode].diskGiB * GIB;
  assert.ok(Number.isSafeInteger(workspaceBytes) && Number.isSafeInteger(dockerBytes) && Math.min(workspaceBytes, dockerBytes) >= required, "Insufficient admitted capacity; no paid fallback or unrelated cleanup.");
  return { workspaceBytes, dockerBytes, requiredBytes: required, untouchedReserveBytes: RESERVE };
}
export function boundedTimeout(deadline, requested, cleanupReserve, cleanup = false, now = performance.now()) {
  const available = deadline - now - (cleanup ? 0 : cleanupReserve);
  assert.ok(available > 2000, "Monotonic controller deadline exhausted.");
  return Math.min(requested, available);
}
export function validatePublicUrl(text) {
  const url = new URL(text);
  assert.ok(url.protocol === "https:" && HOSTS.has(url.hostname) && !url.username && !url.password && !url.hash, "Unapproved public download URL.");
  // GitHub release redirects use signed query parameters; those URLs are handled
  // internally, never user-supplied or retained in evidence.
  assert.ok(!url.search, "Queries are not admitted as public source inputs.");
  return url;
}
export function validateDatabaseListing(value, now = Date.now()) {
  assert.equal(value.status, "active"); assert.equal(value.schemaVersion, "v6.1.10");
  assert.match(value.path, /^vulnerability-db_v6\.1\.10_[0-9TZ:_-]+\.tar\.zst$/);
  assert.match(value.checksum, /^sha256:[a-f0-9]{64}$/);
  const age = now - Date.parse(value.built);
  assert.ok(Number.isFinite(age) && age >= 0 && age <= 120 * 60 * 60_000, "Advisory database is stale or future dated.");
  return value;
}
export function assertAmdGosu(bytes, metadata) { assertStaticGosuElf(bytes, "amd64"); assertGosuMetadata(metadata, "amd64"); }

async function regular(path, maxBytes = 2 * GIB) {
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size > 0 && info.size <= maxBytes, "Artifact must be a bounded regular file without aliases.");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const current = await file.stat(); assert.equal(info.dev, current.dev); assert.equal(info.ino, current.ino); return { bytes: info.size, sha256: sha256(await file.readFile()) }; } finally { await file.close(); }
}
export async function writeHandoff(directory, identity, names) {
  assert.ok(names.length && new Set(names).size === names.length);
  const files = [];
  for (const name of names) { assert.ok(publicationAllowed(name) && name !== "handoff.json", "Publication allowlist rejected handoff leaf."); files.push({ name, ...await regular(join(directory, name)) }); }
  const value = { version: 1, ...identity, platform: "linux/amd64", candidateReleaseQualified: false, riskAccepted: false, genericAbiApproval: false, files };
  await exclusive(join(directory, "handoff.json"), value); return value;
}
export async function verifyHandoff(directory, expected) {
  assert.ok(!(await lstat(directory)).isSymbolicLink(), "Indirect artifact root.");
  await regular(join(directory, "handoff.json"), 65536);
  const value = await json(join(directory, "handoff.json"));
  for (const key of ["source", "runId", "attempt", "kind"]) assert.equal(value[key], expected[key], "Foreign handoff identity.");
  if (expected.image) assert.equal(value.image, expected.image, "Foreign image identity.");
  assert.match(value.image, SHA); assert.equal(value.version, 1); assert.equal(value.platform, "linux/amd64");
  for (const key of ["candidateReleaseQualified", "riskAccepted", "genericAbiApproval"]) assert.equal(value[key], false);
  assert.ok(Array.isArray(value.files) && value.files.length > 0 && value.files.length < 25);
  const names = new Set(["handoff.json"]);
  for (const row of value.files) {
    assert.ok(publicationAllowed(row.name) && !names.has(row.name), "Unknown or duplicate allowlist leaf."); names.add(row.name);
    assert.deepEqual(await regular(join(directory, row.name)), { bytes: row.bytes, sha256: row.sha256 }, "Artifact length/hash mismatch.");
  }
  assert.deepEqual((await readdir(directory)).sort(), [...names].sort(), "Extra files outside handoff allowlist.");
  for (const required of ["candidate.tar", "result.json", "build-receipt.json", "source-manifest.json"]) assert.ok(names.has(required), "Required immutable handoff artifact missing.");
  const outcome = await json(join(directory, "result.json"));
  for (const key of ["source", "runId", "attempt", "kind"]) assert.equal(outcome[key], value[key], "Foreign result identity.");
  assert.equal(outcome.image, value.image); assert.equal(outcome.passed, true); assert.equal(outcome.failure, false); assert.deepEqual(outcome.cleanupErrors, []); assert.equal(outcome.deadlineExceeded, false);
  const receipt = await json(join(directory, "build-receipt.json"));
  assert.equal(receipt.candidateImage, value.image); assert.equal(receipt.success, true); assert.equal(receipt.architecture, "amd64"); assert.deepEqual(receipt.cleanupErrors, []); assert.equal(receipt.deadlineExceeded, false);
  assert.equal(receipt.sourceManifestSha256, sha256(await readFile(join(directory, "source-manifest.json"))));
  for (const row of [outcome, receipt]) { assert.equal(row.candidateReleaseQualified, false); assert.equal(row.riskAccepted, false); }
  return value;
}
export async function cleanupOwned(io, operation) {
  const errors = [];
  try {
    for (const container of await io.list()) {
      if (container.operation !== operation) continue;
      try {
        if (container.running) await io.stop(container.id);
        const current = await io.inspect(container.id);
        assert.equal(current.operation, operation); assert.equal(current.running, false);
        assert.equal(current.oomKilled, false, "OOM closure is not an ordinary workload exit.");
        assert.ok(Number.isInteger(current.exitCode) && current.exitCode >= 0 && current.exitCode <= 125, "Normal closure unverified.");
        await io.remove(container.id);
      } catch { errors.push("owned-container-cleanup"); }
      if (io.isUncertain?.()) break;
    }
  } catch { errors.push("owned-inventory-cleanup"); }
  return errors;
}
export function assertScanBinding(sbom, scan, binding, archivePath) {
  assert.equal(sbom.bomFormat, "CycloneDX");
  const component = sbom.metadata.component;
  assert.equal(component.type, "container"); assert.equal(component.name, archivePath);
  assert.match(component.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(component.version, binding.manifestDigest); assert.equal(component["bom-ref"], binding.imageId);
  assert.ok(sbom.metadata.tools.components.some(x => x.name === "syft" && x.version === "1.57.1"));
  assert.equal(scan.descriptor.name, "grype"); assert.equal(scan.descriptor.version, "0.121.3");
  const configuration = scan.descriptor.configuration;
  assert.deepEqual(configuration?.ignore, [], "Effective Grype ignore rules must be empty.");
  assert.equal(configuration["match-upstream-kernel-headers"], true);
  assert.equal(configuration["include-matcher-suppressions"], true);
  assert.equal(scan.source.type, "image");
  const target = scan.source.target;
  assert.equal(target.userInput, archivePath); assert.equal(target.manifestDigest, component.version); assert.equal(target.imageID, component["bom-ref"]);
  // Syft's bom-ref/imageID is an opaque catalog identifier (currently16hex),
  // not Docker's config digest. Archive/config SHA binding is independent.
  assert.match(binding.image, SHA); assert.match(binding.archiveSha256, SHA);
  if (binding.sourceManifestSha256) assert.equal(target.labels["io.vivalatax.source-manifest-sha256"], binding.sourceManifestSha256);
  if (binding.gosuSha256) assert.equal(target.labels["io.vivalatax.gosu-sha256"], binding.gosuSha256);
  assert.ok(Array.isArray(scan.matches));
  const ignored = scan.ignoredMatches ?? [];
  assert.ok(Array.isArray(ignored));
  return { scanCompleted: true, critical: scan.matches.filter(x => x.vulnerability.severity === "Critical").length, matches: scan.matches.length, ignoredMatches: ignored.length, ignoredCritical: ignored.filter(x => x.vulnerability.severity === "Critical").length, candidateReleaseQualified: false, riskAccepted: false, genericAbiApproval: false };
}

// Fetch to a new bounded file. Never send inherited credentials or persist signed
// redirect URLs. Explicit redirect validation prevents a trusted URL pivot.
async function download(urlText, destination, pin, maxBytes = 128 * 1024 ** 2, timeLimitMs = 120_000) {
  assert.ok(timeLimitMs > 0 && timeLimitMs <= 120_000);
  let url = validatePublicUrl(urlText); const deadline = Date.now() + timeLimitMs;
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await fetch(url, { redirect: "manual", signal: globalThis.AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get("location"), url);
      assert.ok(next.protocol === "https:" && HOSTS.has(next.hostname) && !next.username && !next.password && !next.hash, "Unapproved public redirect.");
      url = next; await response.body?.cancel(); response = undefined; continue;
    }
    break;
  }
  assert.ok(response?.ok && response.body, "Public input unavailable.");
  const file = await open(destination, "wx", 0o600); const digest = createHash("sha256"); let count = 0;
  try {
    for await (const chunk of response.body) {
      assert.ok(Date.now() < deadline, "Public download deadline exhausted.");
      count += chunk.length; assert.ok(count <= (pin?.bytes ?? maxBytes), "Public download exceeds its admitted bound."); digest.update(chunk);
      let written = 0; while (written < chunk.length) { const result = await file.write(chunk, written, chunk.length - written); assert.ok(result.bytesWritten > 0); written += result.bytesWritten; }
    }
  } finally { await file.close(); }
  if (pin?.bytes !== undefined) assert.equal(count, pin.bytes);
  const actual = digest.digest("hex"); if (pin?.sha256) assert.equal(actual, pin.sha256, "Public source checksum mismatch.");
  assert.ok(count > 0); return { url: urlText, bytes: count, sha256: actual };
}

export class Controller {
  constructor(mode, output, input, env = process.env) {
    this.mode = mode; this.output = output; this.input = input; this.env = env;
    this.operation = randomUUID(); this.checks = []; this.cleanupErrors = [];
    this.limit = JOB_LIMITS[mode]; this.deadline = performance.now() + this.limit.controllerMinutes * 60_000;
    this.cleanupReserve = this.limit.cleanupMinutes * 60_000;
    this.private = join(output, "private"); this.public = join(output, "public");
    this.identity = { source: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, kind: mode };
  }
  async capacity(initial = false) {
    const free = async path => { const s = await statfs(path); return s.bavail * s.bsize; };
    return assertCapacity(this.mode, await free(this.output), await free(this.dockerRoot), !initial);
  }
  async command(step, exe, args, requested = 60_000, { cleanup = false, allow = [0], env = this.commandEnv } = {}) {
    assert.ok(!this.unconfirmedChild, "Owned child closure is unconfirmed; all further commands are held.");
    if (this.dockerRoot && !cleanup) await this.capacity();
    let code = 0; let stdout = ""; let stderr = "";
    try {
      // Two seconds of close grace remain inside the monotonic deadline.
      const timeoutMs = boundedTimeout(this.deadline, requested + 2000, this.cleanupReserve, cleanup) - 2000;
      try { ({ stdout, stderr } = await runBoundedCommand(exe, args, { env, timeoutMs })); }
      catch (error) {
        stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; code = error.code ?? "unavailable";
        if (error.childExitConfirmed === false || code === "BOUNDED_COMMAND_TERMINATED" || /^SIG[A-Z0-9]+$/.test(String(code))) { this.unconfirmedChild = true; throw error; }
        if (!allow.includes(code)) throw error;
      }
      assert.ok(allow.includes(code)); return stdout;
    } finally {
      // Command logs may contain generated database credentials and are private.
      await exclusive(join(this.private, step + ".stdout"), stdout || "\n"); await exclusive(join(this.private, step + ".stderr"), stderr || "\n");
      this.checks.push({ step, exit: code });
    }
  }
  docker(step, args, seconds = 60, options) {
    assert.ok(!this.unconfirmedChild, "Owned child closure is unconfirmed; all daemon commands are held.");
    return this.command(step, "docker", [...this.connection.args, ...args], seconds * 1000, options);
  }
  async download(url, destination, pin, limit) {
    await this.capacity();
    const milliseconds = boundedTimeout(this.deadline, 120_000, this.cleanupReserve, false) - 2000;
    return download(url, destination, pin, limit, milliseconds);
  }
  async inspect(step, id) { const [value] = JSON.parse(await this.docker(step, ["image", "inspect", id])); assert.equal(value.Os, "linux"); assert.equal(value.Architecture, "amd64"); return value; }
  async normalStop(step, name) {
    await this.docker(step, ["stop", "--timeout", "-1", name], 40);
    const [v] = JSON.parse(await this.docker(step + "-verified", ["inspect", name]));
    assert.equal(v.Config.Labels[LABEL], this.operation); assert.equal(v.State.Running, false); assert.equal(v.State.OOMKilled, false); assert.equal(v.State.ExitCode, 0);
  }
  async publish(source, name) { assert.ok(publicationAllowed(name)); await regular(source); await copyFile(source, join(this.public, name), constants.COPYFILE_EXCL); }
  async initialize() {
    await mkdir(this.output, { mode: 0o700 }); await mkdir(this.private, { mode: 0o700 }); await mkdir(this.public, { mode: 0o700 });
    // Refuse non-hosted/local calls before even reading Docker metadata.
    assert.equal(this.env.RUNNER_ENVIRONMENT, "github-hosted"); assert.equal(this.env.GITHUB_EVENT_NAME, "workflow_dispatch");
    const event = await json(this.env.GITHUB_EVENT_PATH);
    this.commandEnv = Object.fromEntries(Object.entries(this.env).filter(([k]) => ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "RUNNER_TEMP"].includes(k)));
    this.commandEnv.DOCKER_BUILDKIT = "0";
    this.connection = resolveLocalContainerRuntime("docker", this.commandEnv);
    const docker = JSON.parse(await this.docker("host-daemon", ["info", "--format", "{{json .}}"]));
    this.dockerRoot = await realpath(docker.DockerRootDir);
    const head = (await this.command("source-head", "git", ["-C", REPO, "rev-parse", "HEAD"])).trim();
    const tree = (await this.command("source-tree", "git", ["-C", REPO, "rev-parse", "HEAD^{tree}"])).trim(); assert.match(tree, COMMIT);
    await this.command("source-drift-initial", "git", ["-C", REPO, "diff", "--exit-code", "HEAD", "--"]);
    const runningContainers = (await this.docker("initial-containers", ["ps", "--quiet"])).trim().split("\n").filter(Boolean);
    const host = { platform: platform(), arch: arch(), docker, endpoint: this.connection.endpoint, head, trackedUnchanged: true, runningContainers };
    admitExecution(this.env, event, host);
    const capacity = await this.capacity(true);
    await exclusive(join(this.public, "admission.json"), { ...this.identity, tree, operation: this.operation, platform: "linux/amd64", node: process.version, runnerImage: this.env.ImageOS ?? null, runnerVersion: this.env.ImageVersion ?? null, dockerVersion: docker.ServerVersion, dockerRoot: this.dockerRoot, endpoint: this.connection.endpoint, capacity, deadlineMinutes: this.limit.controllerMinutes, cleanupReserveMinutes: this.limit.cleanupMinutes, retries: 0 });
  }
  async sources(kind) {
    const manifestPath = join(REPO, "infra", `postgres-${kind}-backport`, "sources.json");
    const manifest = await json(manifestPath); const cache = join(this.private, kind + "-sources"); await mkdir(cache, { mode: 0o700 });
    for (const pin of [...manifest.sources, ...(kind === "gosu" ? [manifest.toolchain.platforms.amd64] : [])]) { assert.equal(basename(pin.name), pin.name); await this.download(pin.url, join(cache, pin.name), pin); await verifyPinnedFile(join(cache, pin.name), pin); }
    return { manifest, cache };
  }
  async archive(step, id) {
    const archive = join(this.public, "candidate.tar");
    await this.docker(step, ["save", "--output", archive, "sha256:" + id], 180); await regular(archive);
    await this.archiveIdentity(archive, id);
  }
  async archiveIdentity(archive, id) {
    // Python tarfile reads data only; no archive extraction or path interpretation.
    const script = "import sys,tarfile,json,hashlib\np=sys.argv[1];want=sys.argv[2]\nwith tarfile.open(p) as t:\n def member(name):\n  rows=[m for m in t.getmembers() if m.name==name];assert len(rows)==1 and rows[0].isreg() and rows[0].size<10485760\n  return t.extractfile(rows[0]).read()\n [m]=json.loads(member('manifest.json'));raw=member(m['Config']);assert hashlib.sha256(raw).hexdigest()==want\n c=json.loads(raw);assert c['os']=='linux' and c['architecture']=='amd64';assert len(c['rootfs']['diff_ids'])==len(m['Layers'])\n print(json.dumps({'image':want,'layers':c['rootfs']['diff_ids']}))\n";
    return JSON.parse(await this.command("archive-identity-" + this.checks.length, "python3", ["-c", script, archive, id], 60_000));
  }
  async loadInput(kind) {
    const admitted = await verifyHandoff(this.input, { ...this.identity, kind });
    const archive = join(this.input, "candidate.tar"); const config = await this.archiveIdentity(archive, admitted.image);
    const prior = (await this.docker("before-load-images", ["image", "ls", "--quiet", "--no-trunc"])).split("\n").filter(Boolean);
    assert.ok(!prior.some(x => imageId(x) === admitted.image), "Candidate already exists; import is not independent.");
    await this.docker("input-load", ["load", "--input", archive], 180);
    const image = await this.inspect("input-inspect", "sha256:" + admitted.image);
    assert.equal(imageId(image.Id), admitted.image); assert.deepEqual(image.RootFS.Layers, config.layers);
    assert.equal(image.Config.Labels["io.vivalatax.candidate-release-qualified"], "false"); assert.equal(image.Config.Labels["io.vivalatax.risk-accepted"], "false");
    const manifestHash = sha256(await readFile(join(this.input, "source-manifest.json")));
    assert.equal(image.Config.Labels["io.vivalatax.source-manifest-sha256"], manifestHash);
    const receipt = await json(join(this.input, "build-receipt.json"));
    assert.equal(receipt.sourceManifestSha256, manifestHash); assert.equal(receipt.candidateImage, admitted.image); assert.equal(receipt.success, true); assert.equal(receipt.architecture, "amd64"); assert.deepEqual(receipt.cleanupErrors, []); assert.equal(receipt.deadlineExceeded, false);
    assert.match(receipt.operation, /^[a-f0-9-]{36}$/); assert.equal(image.Config.Labels[LABEL], receipt.operation);
    this.imported = admitted.image; this.importedOperation = receipt.operation; return admitted;
  }
  async packageBuild() {
    const { cache, manifest } = await this.sources("libxml2");
    const output = join(this.private, "libxml2-build");
    const minutes = Math.min(135, Math.floor((this.deadline - performance.now() - this.cleanupReserve) / 60_000) - 5);
    assert.ok(minutes >= 30, "Insufficient remaining window for the package builder and cleanup.");
    const receipt = await this.builder("libxml2-builder", output, [join(REPO, "scripts/build-postgres-libxml2-backport.mjs"), "--runtime", "docker", "--architecture", "amd64", "--source-cache", cache, "--output", output, "--time-limit-minutes", String(minutes)], (minutes + 1) * 60_000);
    const image = await this.inspect("package-image", "sha256:" + this.candidate); assert.equal(image.Config.Labels[LABEL], receipt.operation);
    await this.archive("package-save", this.candidate);
    await this.publish(join(output, "source-manifest.json"), "source-manifest.json");
    await this.publish(join(output, "artifacts/status.json"), "package-status.json"); await this.publish(join(output, "artifacts/abidiff.txt"), "abidiff.txt");
    await this.publish(join(output, "artifacts/ARTIFACTS.sha256"), "artifact-hashes.txt");
    for (const [source, name] of [["packages.tsv", "toolchain-packages.tsv"], ["compiler.txt", "toolchain-compiler.txt"], ["linker.txt", "toolchain-linker.txt"], ["buildflags.txt", "toolchain-buildflags.txt"]]) await this.publish(join(output, "artifacts/toolchain", source), name);
    await this.publish(join(output, "artifacts/candidate", `libxml2_${manifest.privateCandidateVersion}_amd64.deb`), "candidate-package.deb");
    await this.publish(join(output, "artifacts/baseline", `libxml2_${manifest.baselineVersion}_amd64.deb`), "baseline-package.deb");
  }
  async consumers(step, image) {
    const paths = ["/usr/lib/x86_64-linux-gnu/libxml2.so.2.9.14", "/usr/lib/x86_64-linux-gnu/libLLVM.so.19.1", "/usr/lib/x86_64-linux-gnu/libexslt.so.0.8.20", "/usr/lib/x86_64-linux-gnu/libxslt.so.1.1.35", "/usr/lib/postgresql/16/bin/postgres", "/usr/lib/postgresql/16/lib/pgxml.so"];
    return this.utility(step, image, "sha256sum", paths);
  }
  async utility(step, image, exe, args = []) {
    const name = "tax-amd-" + this.operation + "-" + step;
    // Docker's official PostgreSQL image declares a data volume: replace it with
    // an ephemeral tmpfs even for file-only utility containers.
    await this.docker(step + "-create", ["create", "--name", name, "--label", `${LABEL}=${this.operation}`, "--network", "none", "--read-only", "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "--entrypoint", exe, "sha256:" + image, ...args]);
    const result = await this.docker(step + "-run", ["start", "--attach", name], 90);
    const [container] = JSON.parse(await this.docker(step + "-inspect", ["inspect", name]));
    assert.equal(container.Config.Labels[LABEL], this.operation); assert.equal(imageId(container.Image), image);
    assert.equal(container.State.Running, false); assert.equal(container.State.ExitCode, 0);
    return result;
  }
  async runtimeBuild() {
    const base = await this.loadInput("package"); const { cache } = await this.sources("gosu");
    const output = join(this.private, "gosu-build");
    assert.ok(this.deadline - performance.now() - this.cleanupReserve > 50 * 60_000, "Insufficient remaining window for gosu and runtime checks.");
    await this.builder("gosu-builder", output, [join(REPO, "scripts/build-postgres-gosu-backport.mjs"), "--runtime", "docker", "--architecture", "amd64", "--source-cache", cache, "--output", output, "--base-image", "sha256:" + base.image], 46 * 60_000);
    assertAmdGosu(await readFile(join(output, "artifacts/gosu")), await readFile(join(output, "artifacts/go-metadata.txt"), "utf8"));
    const baseline = await this.consumers("base-consumers", base.image); const candidate = await this.consumers("candidate-consumers", this.candidate); assert.equal(candidate, baseline);
    const notices = await this.utility("candidate-notices", this.candidate, "cat", ["/usr/local/share/doc/gosu/THIRD-PARTY-LICENSES.txt"]);
    assert.equal(sha256(notices), sha256(await readFile(join(output, "artifacts/THIRD-PARTY-LICENSES.txt"))));
    await this.privilegeChecks(); await this.databaseChecks(base.image);
    await this.archive("runtime-save", this.candidate);
    for (const [src, name] of [["source-manifest.json", "source-manifest.json"], ["artifacts/gosu", "gosu"], ["artifacts/go-metadata.txt", "go-metadata.txt"], ["artifacts/LICENSE", "LICENSE"], ["artifacts/THIRD-PARTY-LICENSES.txt", "THIRD-PARTY-LICENSES.txt"], ["artifacts/status.json", "gosu-status.json"], ["artifacts/ARTIFACTS.sha256", "artifact-hashes.txt"]]) await this.publish(join(output, src), name);
    await exclusive(join(this.public, "runtime-summary.json"), { ...this.identity, baseImage: base.image, image: this.candidate, sixConsumersUnchanged: true, consumerHashesSha256: sha256(candidate), noticesSha256: sha256(notices), privilegeChecks: true, postgresRecoveryChecks: true, candidateReleaseQualified: false, riskAccepted: false });
  }
  async privilegeChecks() {
    const script = 'set -eu; test "$(gosu --version)" = "1.20 (go1.27.4 on linux/amd64; gc)"; test "$(gosu postgres id -u)" = "$(id -u postgres)"; test "$(gosu postgres id -g)" = "$(id -g postgres)"; test "$(gosu postgres id -G)" = "$(id -G postgres)"; test "$(gosu postgres sh -ec \'printf %s "$HOME"\')" = "$(getent passwd postgres | cut -d: -f6)"; test "$(gosu "$(id -u postgres):$(id -g postgres)" id -u)" = "$(id -u postgres)"';
    await this.utility("privilege-facts", this.candidate, "sh", ["-ec", script]);
    const name = "tax-amd-" + this.operation + "-term";
    await this.docker("term-create", ["create", "--name", name, "--label", `${LABEL}=${this.operation}`, "--network", "none", "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "--entrypoint", "gosu", "sha256:" + this.candidate, "postgres", "sh", "-ec", 'test "$$" = 1; trap "exit 42" TERM; echo ready; while :; do sleep 1; done']);
    await this.docker("term-start", ["start", name]);
    // An exec handshake proves PID1 initialized its TERM handler before stop.
    for (let n = 0; n < 30; n++) { const logs = await this.docker("term-ready-" + n, ["logs", name]); if (logs.trim() === "ready") break; assert.ok(n < 29); await new Promise(r => setTimeout(r, 100)); }
    await this.docker("term-stop", ["stop", "--signal", "SIGTERM", "--timeout", "-1", name], 20);
    const [stopped] = JSON.parse(await this.docker("term-inspect", ["inspect", name])); assert.equal(stopped.State.Running, false); assert.equal(stopped.State.ExitCode, 42);
  }
  async builder(step, output, args, timeout) {
    let commandError;
    try { await this.command(step, process.execPath, args, timeout); } catch (error) { commandError = error; }
    const receipt = await json(join(output, "build-receipt.json")).catch(() => null);
    if (!receipt) { this.unconfirmedChild = true; throw new Error("Builder custody receipt unavailable."); }
    assert.match(receipt.operation, /^[a-f0-9-]{36}$/); this.builderOperation = receipt.operation;
    if (receipt.unconfirmedChildren?.length) this.unconfirmedChild = true;
    if (receipt.candidateImage) { assert.match(receipt.candidateImage, SHA); this.candidate = receipt.candidateImage; }
    // Preserve the builder's bounded nonsecret receipt even when build/checks fail.
    await this.publish(join(output, "build-receipt.json"), "build-receipt.json");
    if (commandError) throw commandError;
    assert.equal(receipt.success, true); assert.deepEqual(receipt.cleanupErrors, []); assert.equal(receipt.deadlineExceeded, false);
    assert.equal(receipt.architecture, "amd64"); assert.equal(receipt.candidateReleaseQualified, false); assert.equal(receipt.riskAccepted, false);
    return receipt;
  }
  async databaseChecks(base) {
    const envFile = join(this.private, "database.env");
    await exclusive(envFile, "POSTGRES_USER=qualification\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=" + randomBytes(32).toString("hex") + "\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n");
    this.volumes = ["data", "restore"].map(x => "tax-amd-" + this.operation + "-" + x);
    for (const [n, volume] of this.volumes.entries()) await this.docker("volume-create-" + n, ["volume", "create", "--label", `${LABEL}=${this.operation}`, volume]);
    const start = async (suffix, image, volume) => {
      const name = "tax-amd-" + this.operation + "-" + suffix;
      await this.docker(suffix + "-create", ["create", "--name", name, "--label", `${LABEL}=${this.operation}`, "--network", "none", "--env-file", envFile, "--volume", volume + ":/var/lib/postgresql/data", "sha256:" + image]);
      await this.docker(suffix + "-start", ["start", name]);
      for (let n = 0; n < 45; n++) {
        const output = await this.docker(suffix + "-ready-" + n, ["exec", name, "sh", "-ec", 'pg_isready -h 127.0.0.1 -U qualification -d postgres >/dev/null 2>&1 && printf ready || true']);
        if (output === "ready") break; assert.ok(n < 44, "PostgreSQL readiness bound."); await new Promise(r => setTimeout(r, 1000));
      }
      await this.docker(suffix + "-uid", ["exec", name, "sh", "-ec", 'test "$(sed -n "s/^Uid:[[:space:]]*\\([0-9]*\\).*/\\1/p" /proc/1/status)" = "$(id -u postgres)"; test "$(cat /proc/1/comm)" = postgres']);
      return name;
    };
    const sql = (step, name, statement) => this.docker(step, ["exec", name, "sh", "-ec", 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X --no-password -h 127.0.0.1 -U qualification -d postgres -v ON_ERROR_STOP=1 -c "$1"', "sh", statement]);
    const primary = await start("primary", this.candidate, this.volumes[0]);
    await sql("scram", primary, "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE rolname='qualification' AND rolpassword LIKE 'SCRAM-SHA-256$%') THEN RAISE EXCEPTION 'SCRAM mismatch'; END IF; END $$;");
    await sql("seed", primary, "CREATE TABLE public.qualification(id integer PRIMARY KEY,amount numeric(38,8),declaration xml,body bytea); INSERT INTO public.qualification VALUES(17,9007199254740991.01000001,'<probe><value>xml-restore</value></probe>',decode('00010aff00f1','hex'));");
    const assertion = "DO $$ BEGIN IF (SELECT count(*) FROM public.qualification)<>1 OR NOT EXISTS(SELECT 1 FROM public.qualification WHERE id=17 AND amount=9007199254740991.01000001 AND xpath('string(/probe/value)',declaration)::text='{xml-restore}' AND body=decode('00010aff00f1','hex')) THEN RAISE EXCEPTION 'synthetic mismatch'; END IF; END $$;";
    await sql("initial-assert", primary, assertion);
    await this.normalStop("primary-stop", primary); await this.docker("primary-restart", ["start", primary]);
    // start's readiness helper has not run again; a bounded connection retry is
    // inside psql's shell and records only a fixed pass/fail result.
    await this.docker("restart-ready", ["exec", primary, "sh", "-ec", 'for n in $(seq 1 30); do pg_isready -h 127.0.0.1 -U qualification -d postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'], 35);
    await sql("restart-assert", primary, assertion);
    await this.docker("dump", ["exec", primary, "sh", "-ec", 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U qualification -Fc -f /tmp/qualification.dump postgres']);
    const dump = join(this.private, "recovery.dump"); await this.docker("dump-copy-out", ["cp", primary + ":/tmp/qualification.dump", dump]); await regular(dump, 16 * 1024 ** 2);
    const restored = await start("restored", this.candidate, this.volumes[1]);
    await this.docker("dump-copy-in", ["cp", dump, restored + ":/tmp/qualification.dump"]);
    await this.docker("restore", ["exec", restored, "sh", "-ec", 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U qualification --exit-on-error --single-transaction -d postgres /tmp/qualification.dump']); await sql("restore-assert", restored, assertion);
    await this.normalStop("before-rollback-stop", primary);
    const rollback = await start("rollback", base, this.volumes[0]); await sql("rollback-assert", rollback, assertion);
  }
  async independent() {
    const input = await this.loadInput("runtime"); this.candidate = input.image;
    const actual = await this.utility("independent-gosu-hash", input.image, "sha256sum", ["/usr/local/bin/gosu"]);
    assert.equal(actual.split(/\s+/)[0], sha256(await readFile(join(this.input, "gosu"))));
    const notices = await this.utility("independent-notices", input.image, "cat", ["/usr/local/share/doc/gosu/THIRD-PARTY-LICENSES.txt"]); assert.equal(sha256(notices), sha256(await readFile(join(this.input, "THIRD-PARTY-LICENSES.txt"))));
    assertAmdGosu(await readFile(join(this.input, "gosu")), await readFile(join(this.input, "go-metadata.txt"), "utf8"));
    const summary = await json(join(this.input, "runtime-summary.json")); const consumers = await this.consumers("independent-consumers", input.image); assert.equal(sha256(consumers), summary.consumerHashesSha256);
    await this.scan(join(this.input, "candidate.tar"), input.image, input.files.find(x => x.name === "candidate.tar").sha256);
  }
  async scan(archive, image, expectedHash) {
    assert.match(expectedHash, SHA); assert.equal((await regular(archive)).sha256, expectedHash);
    const tools = join(this.private, "scanner-tools"); await mkdir(tools, { mode: 0o700 });
    for (const pin of SCANNERS) {
      const path = join(tools, pin.name + ".tar.gz"); await this.download(pin.url, path, pin);
      // Extract only the exact binary, never arbitrary archive paths.
      await this.command(pin.name + "-extract", "tar", ["--extract", "--gzip", "--file", path, "--directory", tools, pin.name]);
    }
    const listingPath = join(this.private, "db-listing.json"); await this.download("https://grype.anchore.io/databases/v6/latest.json", listingPath, undefined, 8192);
    const listing = validateDatabaseListing(await json(listingPath)); await this.publish(listingPath, "database-listing.json");
    const archiveDb = join(tools, "db.tar.zst"); await this.download("https://grype.anchore.io/databases/v6/" + listing.path, archiveDb, { sha256: listing.checksum.slice(7) }, 512 * 1024 ** 2);
    const empty = join(this.private, "empty-scanner-config"); await mkdir(empty, { mode: 0o700 });
    const syftConfig = join(empty, "syft.yaml"); await exclusive(syftConfig, "{}\n");
    const config = join(empty, "grype.yaml"); await exclusive(config, "ignore: []\nmatch-upstream-kernel-headers: true\ninclude-matcher-suppressions: true\n");
    const env = { ...this.commandEnv, XDG_CONFIG_HOME: empty, SYFT_CHECK_FOR_APP_UPDATE: "false", GRYPE_CHECK_FOR_APP_UPDATE: "false", GRYPE_DB_AUTO_UPDATE: "false", GRYPE_DB_VALIDATE_AGE: "true", GRYPE_DB_MAX_ALLOWED_BUILT_AGE: "120h", GRYPE_DB_CACHE_DIR: join(tools, "db") };
    await this.command("database-import", join(tools, "grype"), ["--config", config, "db", "import", archiveDb], 60_000, { env });
    const status = JSON.parse(await this.command("database-status", join(tools, "grype"), ["--config", config, "db", "status", "-o", "json"], 30_000, { env }));
    assert.equal(status.valid, true); assert.equal(status.built, listing.built); assert.equal(status.schemaVersion, listing.schemaVersion);
    const sbom = join(this.public, "runtime-image.cdx.json");
    await this.command("sbom", join(tools, "syft"), ["--config", syftConfig, "docker-archive:" + archive, "-o", "cyclonedx-json=" + sbom], 120_000, { env });
    const output = await this.command("raw-scan", join(tools, "grype"), ["--config", config, "sbom:" + sbom, "-o", "json"], 120_000, { env });
    await exclusive(join(this.public, "runtime-scan.json"), output);
    const cdx = await json(sbom); const scan = JSON.parse(output);
    assert.equal((await regular(archive)).sha256, expectedHash);
    const binding = { source: this.identity.source, image, archiveSha256: expectedHash, manifestDigest: cdx.metadata.component.version, imageId: cdx.metadata.component["bom-ref"], sourceManifestSha256: sha256(await readFile(join(this.input, "source-manifest.json"))), gosuSha256: sha256(await readFile(join(this.input, "gosu"))) };
    const result = assertScanBinding(cdx, scan, binding, archive);
    await exclusive(join(this.public, "scan-binding.json"), { ...binding, ...result, sbomSha256: (await regular(sbom)).sha256, rawScanSha256: sha256(output), database: listing });
  }
  async cleanup() {
    if (!this.connection || !this.commandEnv) return;
    if (this.unconfirmedChild) { this.cleanupErrors.push("unconfirmed-owned-child"); return; }
    let counter = 0;
    const command = (step, args) => this.docker("cleanup-" + step + "-" + counter++, args, 45, { cleanup: true });
    const labels = [this.operation, this.builderOperation].filter(Boolean);
    for (const operation of labels) {
      const io = {
        isUncertain: () => this.unconfirmedChild === true,
        list: async () => { const ids = (await command("containers", ["ps", "--all", "--quiet", "--filter", `label=${LABEL}=${operation}`])).trim().split("\n").filter(Boolean); const result = []; for (const id of ids) { const [v] = JSON.parse(await command("container-inspect", ["inspect", id])); result.push({ id, operation: v.Config.Labels[LABEL], running: v.State.Running }); } return result; },
        stop: id => command("normal-stop", ["stop", "--timeout", "-1", id]),
        inspect: async id => { const [v] = JSON.parse(await command("stopped-inspect", ["inspect", id])); return { id, operation: v.Config.Labels[LABEL], running: v.State.Running, exitCode: v.State.ExitCode, oomKilled: v.State.OOMKilled }; },
        remove: id => command("container-remove", ["rm", "--volumes", id]),
      };
      this.cleanupErrors.push(...await cleanupOwned(io, operation));
      if (this.unconfirmedChild) { this.cleanupErrors.push("unconfirmed-owned-child"); return; }
    }
    for (const volume of this.volumes ?? []) {
      try { const [v] = JSON.parse(await command("volume-inspect", ["volume", "inspect", volume])); assert.equal(v.Labels[LABEL], this.operation); await command("volume-remove", ["volume", "rm", volume]); } catch { this.cleanupErrors.push("owned-volume-cleanup"); }
    }
    // Candidate images are removed only after all own containers close normally.
    if (!this.cleanupErrors.length && this.candidate && this.builderOperation) {
      try { const [v] = JSON.parse(await command("candidate-inspect", ["image", "inspect", "sha256:" + this.candidate])); assert.equal(v.Config.Labels[LABEL], this.builderOperation); await command("candidate-remove", ["image", "rm", "--no-prune", "sha256:" + this.candidate]); } catch { this.cleanupErrors.push("owned-image-cleanup"); }
    }
    if (!this.cleanupErrors.length && this.imported) {
      try { const [v] = JSON.parse(await command("import-inspect", ["image", "inspect", "sha256:" + this.imported])); assert.equal(imageId(v.Id), this.imported); assert.equal(v.Config.Labels[LABEL], this.importedOperation); await command("import-remove", ["image", "rm", "--no-prune", "sha256:" + this.imported]); } catch { this.cleanupErrors.push("imported-image-cleanup"); }
    }
  }
  async run() {
    let failure = false; let passed = false;
    try { await this.initialize(); if (this.mode === "package") await this.packageBuild(); else if (this.mode === "runtime") await this.runtimeBuild(); else await this.independent(); await this.command("source-drift-final", "git", ["-C", REPO, "diff", "--exit-code", "HEAD", "--"]); }
    catch { failure = true; }
    finally {
      if (await lstat(this.public).catch(() => null)) {
        try { await this.cleanup(); } catch { this.cleanupErrors.push("cleanup-unavailable"); }
        const result = { ...this.identity, operation: this.operation, image: this.candidate ?? null, checks: this.checks, failure, cleanupErrors: this.cleanupErrors, deadlineExceeded: performance.now() > this.deadline, candidateReleaseQualified: false, riskAccepted: false, genericAbiApproval: false, bitwiseReproducibilityProved: false, physicalHostProvenanceVerified: false };
        result.passed = !failure && !result.deadlineExceeded && !this.cleanupErrors.length;
        await exclusive(join(this.public, "result.json"), result);
        if (result.passed && this.mode !== "independent") { const names = await readdir(this.public); await writeHandoff(this.public, { ...this.identity, image: this.candidate }, names); }
        passed = result.passed;
      }
    }
    return passed;
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  assert.ok([2, 3].includes(args.length), "MODE NEW_OUTPUT [INPUT_HANDOFF]");
  const [mode, rawOutput, rawInput] = args; assert.ok(Object.hasOwn(JOB_LIMITS, mode)); assert.equal(Boolean(rawInput), mode !== "package");
  const output = resolve(rawOutput); const runnerTemp = await realpath(env.RUNNER_TEMP);
  assert.ok(output.startsWith(runnerTemp + "/") && dirname(output) === runnerTemp, "Output must be a fresh runner-temp child.");
  assert.equal(await lstat(output).catch(() => null), null, "Output must not already exist.");
  const controller = new Controller(mode, output, rawInput ? resolve(rawInput) : undefined, env);
  return controller.run();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(passed => { process.exitCode = passed ? 0 : 1; }, () => { console.error("Native AMD64 rehearsal admission failed; inspect its public fixed-schema receipt."); process.exitCode = 1; });
}

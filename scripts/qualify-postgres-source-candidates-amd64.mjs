// Standalone opt-in source experiment. Never installs or promotes a runtime image.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { Controller, cleanupOwned } from "./qualify-postgres-backports-amd64.mjs";
import { assertSqliteChecksPassed, prepareBuildContext as prepareSqlite, verifySourceCache } from "./build-postgres-sqlite-backport.mjs";
import { verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";
export { admitExecution as admitSourceExecution, cleanupOwned as cleanupSourceOwned } from "./qualify-postgres-backports-amd64.mjs";
const REPO = fileURLToPath(new URL("../", import.meta.url));
const LABEL = "io.vivalatax.qualification.operation";
const digest = value => createHash("sha256").update(value).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const id = value => { assert.match(value, /^sha256:[a-f0-9]{64}$/); return value; };
export const SOURCE_LIMITS = { jobMinutes: 315, controllerMinutes: 300, cleanupMinutes: 15, packageBuildMinutes: 240, exportMinutes: 5, initialDiskGiB: 20, reserveDiskGiB: 2 };
export function sourcePackageBuildSeconds(remainingOrdinaryMs) {
  assert.ok(Number.isFinite(remainingOrdinaryMs) && remainingOrdinaryMs >= (SOURCE_LIMITS.packageBuildMinutes + SOURCE_LIMITS.exportMinutes) * 60_000 + 2000, "Insufficient remaining full package and artifact-export window.");
  return SOURCE_LIMITS.packageBuildMinutes * 60;
}
export const KEYRING_SOURCE = {
  url: "https://deb.debian.org/debian/pool/main/d/debian-archive-keyring/debian-archive-keyring_2023.3+deb12u2_all.deb",
  bytes: 178572, sha256: "f699e2f88dca05212f2a452b58475f2993cb6993dfbafb1d0205a3291eb8b4b8",
  member: "./usr/share/keyrings/debian-archive-keyring.gpg", memberBytes: 55918,
  memberSha256: "506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017",
};
// glibc is an explicit reserved source candidate, not an implemented execution path.
export function admitCandidate(candidate) { assert.equal(candidate, "sqlite", "Only the reviewed SQLite source recipe is executable; glibc awaits a separate runner delta."); return candidate; }
export function validateSourceUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:"); assert.equal(url.hostname, "deb.debian.org");
  assert.equal(url.port + url.username + url.password + url.search + url.hash, "");
  assert.ok(url.pathname.startsWith("/debian/")); return url;
}
export function assertKeyringMember(rows) {
  assert.equal(rows.length, 1); const [row] = rows;
  assert.deepEqual(row, { name: KEYRING_SOURCE.member, regular: true, bytes: KEYRING_SOURCE.memberBytes, sha256: KEYRING_SOURCE.memberSha256 }); return true;
}
export function assertCandidateStatus(candidate, status) { admitCandidate(candidate); assertSqliteChecksPassed(status); return true; }
export function assertOwnedImage(image, operation, preexisting) {
  id(image.Id); assert.ok(!preexisting.has(image.Id), "Preexisting image cannot be removed.");
  assert.equal(image.Os, "linux"); assert.equal(image.Architecture, "amd64"); assert.equal(image.Config.Labels?.[LABEL], operation);
  assert.ok((image.RepoTags ?? []).every(tag => tag === `tax-source-${operation}:toolchain` || tag === `tax-source-${operation}:package`), "Foreign image tag prevents removal.");
  assert.deepEqual(image.RepoDigests ?? [], []); return image.Id;
}
export function labelRecipe(text, operation) {
  assert.match(operation, /^[a-f0-9-]{36}$/);
  const lines = text.split("\n"); const from = lines.filter(line => line.startsWith("FROM "));
  assert.equal(from.length, 1); assert.ok(["FROM ${BASE}", "FROM ${TOOLCHAIN}"].includes(from[0]));
  return text.replace(from[0] + "\n", from[0] + `\nLABEL ${LABEL}="${operation}"\n`);
}
export const KEYRING_EXTRACTOR = `import sys,io,tarfile,hashlib,json,os
raw=open(sys.argv[1],'rb').read();assert raw[:8]==b'!<arch>\\n';at=8;data=[]
while at<len(raw):
 h=raw[at:at+60];assert len(h)==60 and h[58:]==b'\\x60\\n';name=h[:16].decode('ascii').strip().rstrip('/');size=int(h[48:58]);body=raw[at+60:at+60+size];assert len(body)==size;at+=60+size+size%2
 if name in ('data.tar.xz','data.tar.zst','data.tar.gz'):data.append(body)
assert at==len(raw) and len(data)==1
with tarfile.open(fileobj=io.BytesIO(data[0]),mode='r:*')as t:
 rows=[m for m in t.getmembers()if m.name=='./usr/share/keyrings/debian-archive-keyring.gpg'];assert len(rows)==1;member=rows[0];assert member.isreg()and member.size==55918;b=t.extractfile(member).read();assert hashlib.sha256(b).hexdigest()=='506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017'
 fd=os.open(sys.argv[2],os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb')as f:f.write(b)
 print(json.dumps([{'name':member.name,'regular':True,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}]))
`;
export async function publishArtifacts(source, destination) {
  const files = new Map(); let total = 0;
  const walk = async (directory, prefix = "") => {
    const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
    for (const entry of await readdir(directory)) {
      assert.ok(![".", ".."].includes(entry) && basename(entry) === entry);
      const path = join(directory, entry), name = prefix + entry, value = await lstat(path);
      if (value.isDirectory()) await walk(path, name + "/");
      else { assert.ok(value.isFile() && !value.isSymbolicLink() && value.nlink === 1 && value.size <= 512 * 1024 ** 2, "Aliased or oversized source artifact."); total += value.size; assert.ok(total <= 8 * 1024 ** 3 && files.size < 100000); files.set(name, { bytes: value.size, sha256: digest(await readFile(path)) }); }
    }
  };
  await walk(source);
  assert.ok(files.has("status.json") && files.has("ARTIFACTS.sha256"));
  const ledger = new Map();
  for (const line of (await readFile(join(source, "ARTIFACTS.sha256"), "utf8")).trimEnd().split("\n")) {
    const row = /^([a-f0-9]{64}) {2}\.\/(.+)$/.exec(line); assert.ok(row && !row[2].split("/").some(x => ["", ".", ".."].includes(x)) && !ledger.has(row[2])); ledger.set(row[2], row[1]);
  }
  assert.deepEqual([...ledger.keys()].sort(), [...files.keys()].filter(x => x !== "ARTIFACTS.sha256").sort());
  for (const [name, hash] of ledger) assert.equal(files.get(name).sha256, hash);
  await mkdir(destination, { mode: 0o700 });
  for (const [name, pin] of files) {
    const target = join(destination, name); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await verifyPinnedFile(join(source, name), pin); await copyFile(join(source, name), target, constants.COPYFILE_EXCL); await verifyPinnedFile(target, pin);
  }
  await save(join(destination, "export-binding.json"), { totalBytes: total, files: Object.fromEntries(files), noAliases: true, originalArtifactLedgerVerified: true });
}
export class SourceCandidateController extends Controller {
  constructor(candidate, output, env = process.env) {
    super("package", output, undefined, env);
    this.limit = { ...this.limit, minutes: SOURCE_LIMITS.jobMinutes, controllerMinutes: SOURCE_LIMITS.controllerMinutes, cleanupMinutes: SOURCE_LIMITS.cleanupMinutes };
    this.deadline = performance.now() + this.limit.controllerMinutes * 60_000;
    this.cleanupReserve = this.limit.cleanupMinutes * 60_000;
    this.sourceCandidate = admitCandidate(candidate); this.stage = "admission";
  }
  async initialize() {
    assert.equal(await realpath(dirname(this.output)), await realpath(this.env.RUNNER_TEMP), "Output must be one fresh direct RUNNER_TEMP child.");
    assert.equal(basename(this.output), "postgres-source-candidate");
    await super.initialize();
    this.evidence = join(this.output, "evidence"); await mkdir(this.evidence, { mode: 0o700 });
    await copyFile(join(this.public, "admission.json"), join(this.evidence, "admission.json"), constants.COPYFILE_EXCL);
    this.commandEnv.DOCKER_CONFIG = join(this.private, "docker-config"); await mkdir(this.commandEnv.DOCKER_CONFIG, { mode: 0o700 });
    await save(join(this.commandEnv.DOCKER_CONFIG, "config.json"), {});
    this.preexistingImages = new Set((await this.docker("source-before-images", ["image", "ls", "--all", "--quiet", "--no-trunc"])).trim().split("\n").filter(Boolean).map(id));
  }
  async sources() {
    this.stage = "authenticated-source";
    const recipe = join(REPO, "infra/postgres-sqlite-backport"), manifest = await json(join(recipe, "sources.json"));
    this.cache = join(this.private, "source-cache"); await mkdir(this.cache, { mode: 0o700 });
    for (const pin of [...manifest.sources, manifest.release, manifest.sourceIndex]) { assert.equal(basename(pin.name), pin.name); validateSourceUrl(pin.url); await this.download(pin.url, join(this.cache, pin.name), pin); await verifyPinnedFile(join(this.cache, pin.name), pin); }
    const deb = join(this.private, "keyring.deb"); await this.download(KEYRING_SOURCE.url, deb, KEYRING_SOURCE); await verifyPinnedFile(deb, KEYRING_SOURCE);
    const rows = JSON.parse(await this.command("source-keyring-member", "python3", ["-I", "-B", "-c", KEYRING_EXTRACTOR, deb, join(this.cache, manifest.archiveKeyring.name)])); assertKeyringMember(rows);
    await verifySourceCache(this.cache, { run: (exe, args, options) => this.command("source-verification-" + this.checks.length, exe, args, options.timeoutMs).then(stdout => ({ stdout })) });
    for (const [name, pin] of Object.entries(manifest.recipeFiles)) await verifyPinnedFile(join(recipe, name), pin);
    await copyFile(join(recipe, "sources.json"), join(this.evidence, "source-manifest.json"), constants.COPYFILE_EXCL);
    await save(join(this.evidence, "keyring-provenance.json"), { ...KEYRING_SOURCE, extracted: rows, officialAuthority: "https://ftp-master.debian.org/keys.html", packageBytesExact: true, previousCachedKeyringBytesReproduced: true });
    return { recipe, manifest };
  }
  async build() {
    const { recipe, manifest } = await this.sources();
    this.stage = "toolchain";
    // Exact official native platform manifest, never a mutable tag or emulation.
    const base = "docker.io/library/postgres@sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848";
    await this.docker("source-base-pull", ["pull", "--platform", "linux/amd64", base], 180);
    await this.inspect("source-base-native", base);
    const toolContext = join(this.private, "toolchain-context"); await mkdir(toolContext, { mode: 0o700 });
    await writeFile(join(toolContext, "Dockerfile"), labelRecipe(await readFile(join(recipe, "Dockerfile.toolchain"), "utf8"), this.operation), { flag: "wx", mode: 0o600 });
    const toolIdFile = join(this.private, "toolchain.id");
    this.nativeBuildCommandAttempted = true;
    await this.docker("source-toolchain-build", ["build", "--rm=true", "--force-rm=false", "--platform", "linux/amd64", "--build-arg", "BASE=" + base, "--build-arg", "EXPECTED_ARCH=amd64", "--iidfile", toolIdFile, "--tag", `tax-source-${this.operation}:toolchain`, toolContext], 20 * 60);
    const toolchain = id((await readFile(toolIdFile, "utf8")).trim()); assertOwnedImage(await this.inspect("source-toolchain-native", toolchain), this.operation, this.preexistingImages);
    this.stage = "offline-package";
    // Both bounded verifier subprocesses finish within this pre-reserved window.
    assert.ok(this.deadline - performance.now() - this.cleanupReserve > 120_000);
    const prepared = join(this.private, "prepared"); const plan = await prepareSqlite({ architecture: "amd64", sourceCache: this.cache, output: prepared, toolchain }, { run: (exe, args, options) => this.command("context-verification-" + this.checks.length, exe, args, options.timeoutMs).then(stdout => ({ stdout })) });
    const context = join(prepared, "context"), dockerfile = join(context, "Dockerfile.packages");
    await writeFile(dockerfile, labelRecipe(await readFile(dockerfile, "utf8"), this.operation));
    await save(join(this.evidence, "source-plan.json"), { ...plan, contextDockerfileSha256: digest(await readFile(dockerfile)), operationLabelOnlyDelta: true, source: this.identity.source });
    const packageIdFile = join(this.private, "package.id");
    const packageBuildSeconds = sourcePackageBuildSeconds(this.deadline - performance.now() - this.cleanupReserve);
    await this.docker("source-package-build", ["build", "--rm=true", "--force-rm=false", "--network=none", "--platform", "linux/amd64", "--build-arg", "TOOLCHAIN=" + toolchain, "--build-arg", "EXPECTED_ARCH=amd64", "--iidfile", packageIdFile, "--tag", `tax-source-${this.operation}:package`, "--file", dockerfile, context], packageBuildSeconds);
    const image = id((await readFile(packageIdFile, "utf8")).trim()); assertOwnedImage(await this.inspect("source-package-native", image), this.operation, this.preexistingImages);
    this.stage = "export-actual-checks";
    const name = "tax-source-" + this.operation + "-export";
    await this.docker("source-export-create", ["create", "--name", name, "--label", `${LABEL}=${this.operation}`, "--network", "none", "--read-only", "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "--entrypoint", "/bin/true", image]);
    const [container] = JSON.parse(await this.docker("source-export-identity", ["inspect", name]));
    assert.equal(container.Config.Labels[LABEL], this.operation); assert.equal(container.Image, image); assert.equal(container.State.Running, false);
    const artifacts = join(this.private, "artifacts"); await this.docker("source-export-artifacts", ["cp", name + ":/qualification-out", artifacts], 120);
    await publishArtifacts(artifacts, join(this.evidence, "artifacts"));
    const status = await json(join(artifacts, "status.json")); await save(join(this.evidence, "actual-status.json"), status);
    // Exporting an early failure's evidence does not qualify its artifact carrier.
    assertCandidateStatus(this.sourceCandidate, status);
    await save(join(this.evidence, "package-checks.json"), { actualChecksPassed: true, packageImage: image, toolchainImage: toolchain, sourceManifestSha256: digest(await readFile(join(recipe, "sources.json"))), privateCandidateVersion: manifest.privateCandidateVersion, architecture: "amd64", runtimeIntegrationExecuted: false, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false });
  }
  async cleanup() {
    if (!this.connection || this.unconfirmedChild) { if (this.unconfirmedChild) this.cleanupErrors.push("unconfirmed-owned-child"); return; }
    const command = (step, args) => this.docker("source-cleanup-" + step + "-" + this.checks.length, args, 60, { cleanup: true });
    const io = {
      list: async () => { const ids = (await command("containers", ["ps", "--all", "--quiet", "--filter", `label=${LABEL}=${this.operation}`])).trim().split("\n").filter(Boolean); const rows = []; for (const value of ids) { const [v] = JSON.parse(await command("inspect", ["inspect", value])); rows.push({ id: v.Id, operation: v.Config.Labels[LABEL], running: v.State.Running }); } return rows; },
      stop: value => command("stop", ["stop", "--timeout", "-1", value]),
      inspect: async value => { const [v] = JSON.parse(await command("stopped", ["inspect", value])); return { operation: v.Config.Labels[LABEL], running: v.State.Running, exitCode: v.State.ExitCode, oomKilled: v.State.OOMKilled }; },
      remove: value => command("remove", ["rm", "--volumes", value]), isUncertain: () => this.unconfirmedChild,
    };
    this.cleanupErrors.push(...await cleanupOwned(io, this.operation));
    if (this.cleanupErrors.length || this.unconfirmedChild) return;
    const ids = [...new Set((await command("images", ["image", "ls", "--all", "--quiet", "--no-trunc", "--filter", `label=${LABEL}=${this.operation}`])).trim().split("\n").filter(Boolean))];
    const images = [];
    for (const value of ids) { const [v] = JSON.parse(await command("image-inspect", ["image", "inspect", value])); assertOwnedImage(v, this.operation, this.preexistingImages); images.push(v); }
    // Legacy builder parent edges are real image IDs, not names or labels alone.
    const pending = new Map(images.map(v => [v.Id, v]));
    while (pending.size) {
      const leaves = [...pending.values()].filter(v => ![...pending.values()].some(child => child.Parent === v.Id)); assert.ok(leaves.length, "Image graph cycle/unknown custody.");
      for (const previous of leaves) {
        const [current] = JSON.parse(await command("image-current", ["image", "inspect", previous.Id])); assertOwnedImage(current, this.operation, this.preexistingImages); assert.equal(current.Parent, previous.Parent);
        assert.equal((await command("image-users", ["ps", "--all", "--quiet", "--filter", "ancestor=" + previous.Id])).trim(), "");
        await command("image-remove", ["image", "rm", "--no-prune", previous.Id]); pending.delete(previous.Id);
      }
    }
    assert.equal((await command("remaining-containers", ["ps", "--all", "--quiet", "--filter", `label=${LABEL}=${this.operation}`])).trim(), "");
    assert.equal((await command("remaining-images", ["image", "ls", "--all", "--quiet", "--filter", `label=${LABEL}=${this.operation}`])).trim(), "");
    const after = new Set((await command("preserved-images", ["image", "ls", "--all", "--quiet", "--no-trunc"])).trim().split("\n").filter(Boolean));
    for (const previous of this.preexistingImages) assert.ok(after.has(previous), "An unrelated initial image disappeared.");
  }
  async run() {
    let failure = true; let result = { passed: false, admissionFailed: true };
    try { await this.initialize(); await this.build(); await this.command("source-unchanged-final", "git", ["-C", REPO, "diff", "--exit-code", "HEAD", "--"]); failure = false; }
    catch { /* Only fixed stage and exit metadata are public, never exception text. */ }
    finally {
      if (await lstat(this.private).catch(() => null)) { try { await this.cleanup(); } catch { this.cleanupErrors.push("owned-cleanup-unverified"); } }
      if (this.evidence) {
        const logs = join(this.evidence, "command-logs"); await mkdir(logs, { mode: 0o700 });
        for (const name of await readdir(this.private)) if (/^[a-z0-9-]+\.(?:stdout|stderr)$/.test(name)) await copyFile(join(this.private, name), join(logs, name), constants.COPYFILE_EXCL);
        result = { ...this.identity, sourceCandidate: this.sourceCandidate, operation: this.operation, checks: this.checks, failureStage: failure ? this.stage : null, failure, cleanupErrors: this.cleanupErrors, deadlineExceeded: performance.now() > this.deadline, nativeBuildCommandAttempted: this.nativeBuildCommandAttempted === true, runtimeIntegrationExecuted: false, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false };
        result.passed = !failure && !result.deadlineExceeded && !this.cleanupErrors.length; await save(join(this.evidence, "result.json"), result);
      }
    }
    return result;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4); const result = await new SourceCandidateController(process.argv[2], resolve(process.argv[3])).run();
  console.log(JSON.stringify({ passed: result.passed, candidateReleaseQualified: false, riskAccepted: false })); if (!result.passed) process.exitCode = 1;
}

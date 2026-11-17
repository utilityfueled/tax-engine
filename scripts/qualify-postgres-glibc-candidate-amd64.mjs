// Separate glibc source experiment; never installs or promotes a runtime image.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, readlink, realpath, statfs, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { SourceCandidateController, assertOwnedImage, labelRecipe, validateSourceUrl } from "./qualify-postgres-source-candidates-amd64.mjs";
import { assertSuiteSummary, prepareBuildContext, validateManifest } from "./build-postgres-glibc-backport.mjs";
import { verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";
import { buildGlibcProfile, glibcEnvironment, validateGlibcEngine, validateGlibcSandbox } from "./lib/glibc-package-seccomp.mjs";
const REPO = fileURLToPath(new URL("../", import.meta.url));
const LABEL = "io.vivalatax.qualification.operation", TARGET = "stdio-common/tst-vfscanf-bz34008", GIB = 1024 ** 3;
const hash = value => createHash("sha256").update(value).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const imageId = value => { assert.match(value, /^sha256:[a-f0-9]{64}$/); return value; };
export const GLIBC_LIMITS = { jobMinutes: 350, controllerMinutes: 340, cleanupMinutes: 20, initialDiskGiB: 40, reserveDiskGiB: 2 };
export function assertGlibcCapacity(workspaceBytes, daemonBytes, initial) {
  const requiredBytes = (initial ? GLIBC_LIMITS.initialDiskGiB : GLIBC_LIMITS.reserveDiskGiB) * GIB;
  assert.ok([workspaceBytes, daemonBytes].every(v => Number.isSafeInteger(v) && v >= requiredBytes), "Insufficient glibc capacity; no unrelated cleanup or paid fallback.");
  return { workspaceBytes, dockerBytes: daemonBytes, requiredBytes, untouchedReserveBytes: GLIBC_LIMITS.reserveDiskGiB * GIB };
}
async function text(root, name, max = 256 * 1024 ** 2) {
  const path = join(root, name), info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= max, "Bounded regular glibc evidence required.");
  return readFile(path, "utf8");
}
export async function validateGlibcEvidence(root, scriptExit) {
  assert.equal(scriptExit, 0, "An ordinary failed package script is not a passing candidate.");
  const execution = JSON.parse(await text(root, "execution-status.json", 65536));
  assert.deepEqual(execution, { stage: "complete", exit: 0, packageExecutionCompleted: true, candidateReleaseQualified: false, riskAccepted: false });
  const status = JSON.parse(await text(root, "package-status.json", 65536));
  assert.deepEqual(status, { baselineBuildExit: 0, candidateBuildExit: 0, pairedRegressionVerified: true, fullOriginalSuitesRetained: true, abidiffExit: 0, sixConsumersExecuted: false, genericAbiApproval: false, riskAccepted: false, candidateReleaseQualified: false });
  for (const variant of ["baseline", "candidate"]) {
    const paths = (await text(root, variant + "/suite-paths.txt", 65536)).trim().split("\n");
    assert.ok(paths.length > 0 && paths.length <= 8 && new Set(paths).size === paths.length);
    assert.ok(paths.includes("build-tree/amd64-libc/tests.sum"));
    for (const path of paths) {
      assert.match(path, /^build-tree\/amd64-[a-z0-9-]+\/tests\.sum$/);
      const flavor = path.split("/")[1];
      assertSuiteSummary(await text(root, variant + "/" + flavor + "-tests.sum"), { requireRegression: variant === "candidate" && flavor === "amd64-libc" });
    }
    const regressionExitText = await text(root, variant + "/upstream-regression.exit", 64); assert.match(regressionExitText, /^(?:0|[1-9][0-9]*)\n$/);
    const regressionExit = Number(regressionExitText.trim());
    assert.ok(variant === "baseline" ? regressionExit > 0 && regressionExit <= 125 : regressionExit === 0);
    const expected = variant === "baseline" ? `FAIL: ${TARGET}\noriginal exit status 1\n` : `PASS: ${TARGET}\noriginal exit status 0\n`;
    assert.equal(await text(root, variant + "/upstream-regression.test-result", 4096), expected);
    const output = await text(root, variant + "/upstream-regression.out");
    assert.ok(!/Timed out:|error while loading shared libraries|cannot be preloaded|Segmentation fault|Bus error/.test(output), "Timeout, loader failure or unknown fault is not positive regression evidence.");
    if (variant === "baseline") assert.ok(output.split("\n").includes("memory clobbered past end of allocated block"), "Require the original mcheck tail-corruption diagnostic, not an arbitrary failed test.");
    // Candidate may already have executed in the mandatory full suite. Require
    // its actual expanded allocator command, not just Makefile registration.
    const commandLog = await text(root, variant + "/upstream-regression.log") + "\n" + await text(root, variant + "/package-build.log");
    const prefix = `/qualification-work/${variant}/build-tree/amd64-libc/`;
    assert.ok(commandLog.split("\n").some(line => line.includes("MALLOC_CHECK_=3") && line.includes("LD_PRELOAD=") && line.includes(prefix) && line.includes("/malloc/libc_malloc_debug.so") && line.includes("/" + TARGET)), "Actual named allocator-checking command is absent.");
  }
  const providers = JSON.parse(await text(root, "abi-providers.json", 65536));
  assert.ok(Array.isArray(providers) && providers.length >= 5 && providers.length <= 100 && new Set(providers).size === providers.length);
  for (const path of providers) assert.ok(typeof path === "string" && !path.startsWith("/") && !path.split("/").some(v => ["", ".", ".."].includes(v)));
  for (let n = 1; n <= providers.length; n++) { await text(root, `abi-${n}.stdout`); await text(root, `abi-${n}.stderr`); }
  return { packageChecksPassed: true, fullOriginalSuitesVerified: true, actualAllocatorCommandsVerified: true, specificBaselineTailCorruptionReproduced: true, namedCandidateRegressionPassed: true, abiProviderCount: providers.length, abidiffExit: 0, sixConsumersExecuted: false, runtimeIntegrationExecuted: false, genericAbiApproval: false, riskAccepted: false, candidateReleaseQualified: false };
}
export async function publishGlibcArtifacts(source, destination) {
  const files = new Map(), links = []; let total = 0;
  const unpacked = name => /^(?:baseline|candidate)\/unpacked\//.test(name);
  const walk = async (directory, prefix = "") => {
    const dir = await lstat(directory); assert.ok(dir.isDirectory() && !dir.isSymbolicLink());
    for (const entry of await readdir(directory)) {
      assert.ok(![".", ".."].includes(entry) && basename(entry) === entry);
      const path = join(directory, entry), name = prefix + entry, info = await lstat(path);
      if (info.isDirectory()) await walk(path, name + "/");
      else if (info.isSymbolicLink()) { assert.ok(unpacked(name), "Only unuploaded package unpacked links are allowed."); const target = await readlink(path); assert.ok(Buffer.byteLength(target) <= 4096); links.push({ name, targetBytes: Buffer.byteLength(target), targetSha256: hash(target) }); }
      else { assert.ok(info.isFile() && info.nlink === 1 && info.size <= GIB); total += info.size; assert.ok(total <= 16 * GIB && files.size < 200000); files.set(name, { bytes: info.size, sha256: hash(await readFile(path)) }); }
    }
  };
  await walk(source); assert.ok(files.has("execution-status.json") && files.has("ARTIFACTS.sha256"));
  const ledger = new Map();
  for (const line of (await readFile(join(source, "ARTIFACTS.sha256"), "utf8")).trimEnd().split("\n")) { const row = /^([a-f0-9]{64}) {2}\.\/(.+)$/.exec(line); assert.ok(row && !row[2].split("/").some(v => ["", ".", ".."].includes(v)) && !ledger.has(row[2])); ledger.set(row[2], row[1]); }
  assert.deepEqual([...ledger.keys()].sort(), [...files.keys()].filter(v => v !== "ARTIFACTS.sha256").sort());
  for (const [name, digest] of ledger) assert.equal(files.get(name).sha256, digest);
  await mkdir(destination, { mode: 0o700 }); let omitted = 0;
  for (const [name, pin] of files) {
    if (unpacked(name)) { omitted++; continue; }
    const target = join(destination, name); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await verifyPinnedFile(join(source, name), pin); await copyFile(join(source, name), target, constants.COPYFILE_EXCL); await verifyPinnedFile(target, pin);
  }
  const binding = { completeOriginalLedgerVerified: true, totalRegularBytes: total, allRawRegularFiles: Object.fromEntries(files), omittedUnpackedRegularFiles: omitted, excludedUnpackedSymlinks: links.length, symlinkMetadataOnly: links, noSymlinksFollowedOrUploaded: true };
  await save(join(destination, "export-binding.json"), binding); return binding;
}
export class GlibcCandidateController extends SourceCandidateController {
  constructor(output, env = process.env) {
    // Reuse the frozen generic execution/custody/cleanup implementation. The
    // inherited SQLite build/sources methods are both overridden below.
    super("sqlite", output, env); this.sourceCandidate = "glibc";
    this.limit = { minutes: GLIBC_LIMITS.jobMinutes, controllerMinutes: GLIBC_LIMITS.controllerMinutes, cleanupMinutes: GLIBC_LIMITS.cleanupMinutes };
    this.deadline = performance.now() + GLIBC_LIMITS.controllerMinutes * 60_000; this.cleanupReserve = GLIBC_LIMITS.cleanupMinutes * 60_000;
  }
  async capacity(initial = false) { const free = async path => { const v = await statfs(path); return v.bavail * v.bsize; }; return assertGlibcCapacity(await free(this.output), await free(this.dockerRoot), initial); }
  async sources() {
    this.stage = "authenticated-source";
    const recipe = join(REPO, "infra/postgres-glibc-backport"), manifest = validateManifest(await json(join(recipe, "sources.json")));
    const cache = join(this.private, "glibc-sources"); await mkdir(cache, { mode: 0o700 });
    for (const pin of manifest.sources) { validateSourceUrl(pin.url); await this.download(pin.url, join(cache, pin.name), pin); await verifyPinnedFile(join(cache, pin.name), pin); }
    const prepared = join(this.private, "glibc-prepared");
    const receipt = await prepareBuildContext({ architecture: "amd64", sourceCache: cache, output: prepared }, { run: (exe, args, options) => this.command("glibc-verifier-" + this.checks.length, exe, args, options.timeoutMs).then(stdout => ({ stdout })) });
    assert.equal(receipt.sourcePreparationPassed, true); assert.equal(receipt.binaryBuildExecuted, false);
    await copyFile(join(prepared, "source-manifest.json"), join(this.evidence, "source-manifest.json"), constants.COPYFILE_EXCL);
    await copyFile(join(prepared, "preparation-receipt.json"), join(this.evidence, "preparation-receipt.json"), constants.COPYFILE_EXCL);
    return { recipe, manifest, prepared };
  }
  async build() {
    const { recipe, manifest, prepared } = await this.sources(); this.stage = "toolchain";
    const base = "docker.io/library/postgres@" + manifest.postgres.platforms.amd64.digest;
    await this.docker("glibc-base-pull", ["pull", "--platform", "linux/amd64", base], 180); await this.inspect("glibc-base-native", base);
    const tool = join(this.private, "glibc-toolchain"); await mkdir(tool, { mode: 0o700 });
    await writeFile(join(tool, "Dockerfile"), labelRecipe(await readFile(join(prepared, "Dockerfile.toolchain"), "utf8"), this.operation), { flag: "wx", mode: 0o600 });
    const iid = join(this.private, "glibc-toolchain.id"); this.nativeBuildCommandAttempted = true;
    await this.docker("glibc-toolchain-build", ["build", "--rm=true", "--force-rm=false", "--platform", "linux/amd64", "--build-arg", "BASE=" + base, "--build-arg", "EXPECTED_ARCH=amd64", "--iidfile", iid, "--tag", `tax-source-${this.operation}:toolchain`, tool], 25 * 60);
    const toolchain = imageId((await readFile(iid, "utf8")).trim()); assertOwnedImage(await this.inspect("glibc-toolchain-native", toolchain), this.operation, this.preexistingImages);
    this.stage = "offline-package";
    validateGlibcEngine(JSON.parse(await this.docker("glibc-exact-engine", ["info", "--format", "{{json .}}"])));
    const officialProfile = await readFile(join(REPO, "infra/glibc-syscall-probe/default-seccomp.json"), "utf8"), packageProfile = buildGlibcProfile(officialProfile);
    const profilePath = join(this.private, "glibc-package-seccomp.json"); await save(profilePath, packageProfile);
    await save(join(this.evidence, "glibc-package-seccomp.json"), packageProfile);
    const [toolchainConfig] = JSON.parse(await this.docker("glibc-toolchain-environment", ["image", "inspect", toolchain])); assertOwnedImage(toolchainConfig, this.operation, this.preexistingImages); assert.equal(toolchainConfig.Id, toolchain);
    const expectedEnvironment = glibcEnvironment(toolchainConfig.Config.Env);
    const inputs = await realpath(join(prepared, "inputs")); assert.ok(!/[,\r\n]/.test(inputs));
    const name = "tax-source-" + this.operation + "-glibc";
    await this.docker("glibc-package-create", ["create", "--name", name, "--label", `${LABEL}=${this.operation}`, "--network", "none", "--security-opt", "seccomp=" + profilePath, "--mount", `type=bind,src=${inputs},dst=/qualification-inputs,readonly`, "--mount", "type=tmpfs,destination=/var/lib/postgresql/data", "--env", "EXPECTED_ARCH=amd64", "--env", "LC_ALL=C", "--env", "LANG=C", "--entrypoint", "/bin/bash", toolchain, "/qualification-build.sh"]);
    await this.docker("glibc-script-copy", ["cp", join(prepared, "build-packages.sh"), name + ":/qualification-build.sh"]);
    const scriptCopy = join(this.private, "glibc-container-script.sh"); await this.docker("glibc-script-readback", ["cp", name + ":/qualification-build.sh", scriptCopy]); await verifyPinnedFile(scriptCopy, manifest.recipeFiles["build-packages.sh"]);
    const [before] = JSON.parse(await this.docker("glibc-package-before", ["inspect", name])); assert.equal(before.Image, toolchain); assert.equal(before.Config.Labels[LABEL], this.operation); assert.equal(before.State.Running, false); assert.equal(before.HostConfig.NetworkMode, "none");
    assert.ok(before.Mounts.some(v => v.Type === "bind" && v.Source === inputs && v.Destination === "/qualification-inputs" && v.RW === false));
    validateGlibcSandbox(before, inputs, packageProfile, expectedEnvironment);
    const inventoryPath = join(this.evidence, "glibc-toolchain-packages.tsv"); await this.docker("glibc-toolchain-inventory", ["cp", name + ":/qualification-toolchain/packages.tsv", inventoryPath]);
    assert.equal(await readFile(inventoryPath, "utf8"), await readFile(join(REPO, "infra/glibc-syscall-probe/expected-packages.tsv"), "utf8"));
    await save(join(this.evidence, "glibc-sandbox-binding.json"), { source: this.identity.source, toolchain, profileSha256: hash(await readFile(profilePath)), officialProfileSha256: hash(officialProfile), packageInventorySha256: hash(await readFile(inventoryPath)), exactArgumentRules: [{ syscall: "personality", argument: 0, value: 4294967274 }, { syscall: "clock_settime", argument: 0, value: 1 }], addedCapabilities: false, privileged: false, network: "none", originalPackageScriptSha256: manifest.recipeFiles["build-packages.sh"].sha256, candidateReleaseQualified: false, riskAccepted: false });
    await this.docker("glibc-package-run", ["start", "--attach", name], 290 * 60, { allow: Array.from({ length: 126 }, (_, n) => n) });
    const scriptExit = this.checks.at(-1).exit;
    const [after] = JSON.parse(await this.docker("glibc-package-after", ["inspect", name])); assert.equal(after.Image, toolchain); assert.equal(after.Config.Labels[LABEL], this.operation); assert.equal(after.State.Running, false); assert.equal(after.State.OOMKilled, false); assert.equal(after.State.ExitCode, scriptExit); assert.equal(after.State.Error, "");
    validateGlibcSandbox(after, inputs, packageProfile, expectedEnvironment);
    // childExitConfirmed/BOUNDED_COMMAND_TERMINATED uncertainty is propagated by
    // the unchanged inherited Controller.command; no further daemon action then.
    this.stage = "export-actual-checks";
    const raw = join(this.private, "glibc-artifacts"); await this.docker("glibc-package-artifacts", ["cp", name + ":/qualification-out", raw], 180);
    await publishGlibcArtifacts(raw, join(this.evidence, "artifacts"));
    const checks = await validateGlibcEvidence(raw, scriptExit);
    await save(join(this.evidence, "package-checks.json"), { ...checks, source: this.identity.source, toolchainImage: toolchain, scriptExit, unchangedScriptSha256: manifest.recipeFiles["build-packages.sh"].sha256, sourceManifestSha256: hash(await readFile(join(recipe, "sources.json"))) });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3); const result = await new GlibcCandidateController(resolve(process.argv[2])).run();
  console.log(JSON.stringify({ passed: result.passed, sourceCandidate: "glibc", candidateReleaseQualified: false, riskAccepted: false })); if (!result.passed) process.exitCode = 1;
}

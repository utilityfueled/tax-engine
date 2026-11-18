import { describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { Controller, JOB_LIMITS, boundedTimeout } from "../../scripts/qualify-postgres-backports-amd64.mjs";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { admitCandidate, assertCandidateStatus, assertOwnedImage, assertKeyringMember, SOURCE_LIMITS, SourceCandidateController, sourcePackageBuildSeconds, KEYRING_SOURCE, validateSourceUrl, admitSourceExecution, cleanupSourceOwned, labelRecipe, publishArtifacts } from "../../scripts/qualify-postgres-source-candidates-amd64.mjs";
vi.mock("../../scripts/build-postgres-sqlite-backport.mjs", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, prepareBuildContext: async ({ output }: { output: string }) => {
    await mkdir(join(output, "context"), { recursive: true });
    await writeFile(join(output, "context", "Dockerfile.packages"), "FROM ${TOOLCHAIN}\nRUN true\n");
    return {};
  } };
});
const spec = "spec/federal/postgres-source-candidates-amd64.yaml";
void spec;
describe("standalone native source candidates", () => {
  it("admits only exact manual native source execution", () => {
    expect(admitCandidate("sqlite")).toBe("sqlite");
    for (const v of ["../sqlite", "SQLITE", "glibc;echo x", "", "sqlite/glibc"]) expect(() => admitCandidate(v)).toThrow();
    const env = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "utilityfueled/tax-engine", GITHUB_REF: "refs/heads/main", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", RUNNER_ARCH: "X64", GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" };
    const event = { repository: { private: false, fork: false, full_name: env.GITHUB_REPOSITORY, default_branch: "main" }, inputs: { source_sha: env.GITHUB_SHA } };
    const host = { platform: "linux", arch: "x64", docker: { OSType: "linux", Architecture: "amd64" }, endpoint: "unix:///var/run/docker.sock", head: env.GITHUB_SHA, trackedUnchanged: true, runningContainers: [] };
    expect(() => admitSourceExecution(env, event, host)).not.toThrow();
    for (const patch of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_REF: "refs/heads/other" }, { RUNNER_ENVIRONMENT: "self-hosted" }, { RUNNER_ARCH: "ARM64" }, { GITHUB_RUN_ATTEMPT: "2" }]) expect(() => admitSourceExecution({ ...env, ...patch }, event, host)).toThrow();
    expect(() => admitSourceExecution(env, { ...event, inputs: { source_sha: "b".repeat(40) } }, host)).toThrow();
    for (const patch of [{ arch: "arm64" }, { endpoint: "tcp://127.0.0.1:2375" }, { trackedUnchanged: false }, { runningContainers: ["foreign"] }]) expect(() => admitSourceExecution(env, event, { ...host, ...patch })).toThrow();
    for (const patch of [{ private: true }, { fork: true }]) expect(() => admitSourceExecution(env, { ...event, repository: { ...event.repository, ...patch } }, host)).toThrow();
    expect(SOURCE_LIMITS).toEqual({ jobMinutes: 315, controllerMinutes: 300, cleanupMinutes: 15, packageBuildMinutes: 240, exportMinutes: 5, initialDiskGiB: 20, reserveDiskGiB: 2 });
  });
  it("uses a live source-only full-package deadline and preserves cleanup reserves", () => {
    const source = new SourceCandidateController("sqlite", "/private/tmp/not-executed", {});
    const remaining = source.deadline - performance.now();
    expect(source.limit.controllerMinutes).toBe(300); expect(source.cleanupReserve).toBe(15 * 60_000);
    expect(remaining).toBeLessThanOrEqual(300 * 60_000); expect(remaining).toBeGreaterThan(300 * 60_000 - 1000);
    const ordinary = new Controller("package", "/private/tmp/not-executed", undefined, {});
    expect(ordinary.limit).toBe(JOB_LIMITS.package); expect(ordinary.limit.controllerMinutes).toBe(155);
    const threshold = (240 + 5) * 60_000 + 2000;
    expect(sourcePackageBuildSeconds(threshold)).toBe(240 * 60);
    for (const invalid of [threshold - 1, 0, -1, NaN, Infinity]) expect(() => sourcePackageBuildSeconds(invalid)).toThrow();
    expect(boundedTimeout(300 * 60_000, 240 * 60_000, 15 * 60_000, false, 30 * 60_000)).toBe(240 * 60_000);
    expect(boundedTimeout(300 * 60_000, 60_000, 15 * 60_000, true, 299 * 60_000)).toBe(60_000);
  });
 async function capturePackageCommand(ordinaryMinutes:number){
  const recipe = join(process.cwd(), 'infra/postgres-sqlite-backport');
  const directory=await mkdtemp(join(tmpdir(),'sqlite-source-budget-private-'));
  const c=new SourceCandidateController('sqlite',directory,{});c.private=join(directory,'private');c.evidence=join(directory,'evidence');
  await mkdir(c.private);await mkdir(c.evidence);c.preexistingImages=new Set();c.cleanupReserve=15*60000;c.deadline=performance.now()+(ordinaryMinutes+15)*60000;
  c.sources=async()=>({recipe,manifest:{privateCandidateVersion:'unused'}});
  const calls:Array<{step:string,seconds:number}>=[];const fake='sha256:'+'a'.repeat(64);
  c.inspect=async()=>({Id:fake,Os:'linux',Architecture:'amd64',Config:{Labels:{'io.vivalatax.qualification.operation':c.operation}},RepoTags:[],RepoDigests:[]});
  c.docker=async(step:string,args:string[],seconds=60)=>{
   calls.push({step,seconds});if(step==='source-toolchain-build')await writeFile(args[args.indexOf('--iidfile')+1],fake+'\n');
   if(step==='source-package-build')throw Error('PRIVATE_PACKAGE_COMMAND_CAPTURED');return '';
  };
  let error:unknown;try{await c.build();}catch(e){error=e;}finally{await rm(directory,{recursive:true,force:true});}return {calls,error};
 }
 it('actual build holds before a package command without full240+export5 window',async()=>{
  const {calls,error}=await capturePackageCommand(244);expect(error).toBeTruthy();expect(calls.filter(c=>c.step==='source-package-build')).toEqual([]);
 });
 it('actual build submits the complete240minute command with sufficient window',async()=>{
  const {calls,error}=await capturePackageCommand(250);expect(String(error)).toContain('PRIVATE_PACKAGE_COMMAND_CAPTURED');expect(calls.find(c=>c.step==='source-package-build')?.seconds).toBe(240*60);
 });
  it("pins reproducible official keyring and rejects foreign source inputs", () => {
    expect(KEYRING_SOURCE.url).toBe("https://deb.debian.org/debian/pool/main/d/debian-archive-keyring/debian-archive-keyring_2023.3+deb12u2_all.deb");
    expect(KEYRING_SOURCE.sha256).toBe("f699e2f88dca05212f2a452b58475f2993cb6993dfbafb1d0205a3291eb8b4b8");
    const good = { name: "./usr/share/keyrings/debian-archive-keyring.gpg", regular: true, bytes: 55918, sha256: "506b815cbb32d9b6066b4a2aa524071e071761e7e7f68c3ac74f3061ba852017" };
    expect(assertKeyringMember([good])).toBe(true);
    for (const bad of [[good, good], [{ ...good, regular: false }], [{ ...good, name: "../keyring" }], [{ ...good, bytes: 1 }], [{ ...good, sha256: "0".repeat(64) }]]) expect(() => assertKeyringMember(bad)).toThrow();
    expect(validateSourceUrl(KEYRING_SOURCE.url).hostname).toBe("deb.debian.org");
    for (const url of ["https://deb.debian.org.evil/x", "http://deb.debian.org/x", "https://a@deb.debian.org/x", "https://deb.debian.org/x?q=x", "https://github.com/x"]) expect(() => validateSourceUrl(url)).toThrow();
  });
  it("requires every actual SQLite check and never grants release authority", () => {
    const good = { recipeExit: 0, baselinePackageBuildExit: 0, candidatePackageBuildExit: 0, baselineFullTestExit: 0, candidateFullTestExit: 0, candidateRegressionExit: 0, candidateSanitizerRegressionExit: 0, candidateRegressionCasesPassed: 5, candidateSanitizerRegressionCasesPassed: 5, baselineRegressionReproduced: true, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false };
    expect(() => assertCandidateStatus("sqlite", good)).not.toThrow();
    for (const key of Object.keys(good)) { const bad = { ...good }; delete bad[key as keyof typeof bad]; expect(() => assertCandidateStatus("sqlite", bad)).toThrow(); }
    expect(() => assertCandidateStatus("sqlite", { ...good, recipeExit: 1 })).toThrow();
  });
  it("bounds cleanup to exact owned new identities", () => {
    const good = { Id: "sha256:" + "a".repeat(64), Os: "linux", Architecture: "amd64", Config: { Labels: { "io.vivalatax.qualification.operation": "op" } }, RepoTags: [] };
    expect(assertOwnedImage(good, "op", new Set())).toBe(good.Id);
    for (const [v, old] of [[good, new Set([good.Id])], [{ ...good, Architecture: "arm64" }, new Set()], [{ ...good, Config: { Labels: {} } }, new Set()], [{ ...good, RepoTags: ["foreign:latest"] }, new Set()]] as const) expect(() => assertOwnedImage(v, "op", old)).toThrow();
  });
  it("replays only the original owned normal cleanup protocol", async () => {
    const actions: string[] = [];
    const io = { list: async () => [{ id: "foreign", operation: "other", running: true }, { id: "own", operation: "op", running: true }], stop: async (id: string) => { actions.push("stop:" + id); }, inspect: async () => ({ operation: "op", running: false, exitCode: 1, oomKilled: false }), remove: async (id: string) => { actions.push("remove:" + id); } };
    expect(await cleanupSourceOwned(io, "op")).toEqual([]); expect(actions).toEqual(["stop:own", "remove:own"]);
    actions.length = 0; expect(await cleanupSourceOwned({ ...io, inspect: async () => ({ operation: "op", running: false, exitCode: 137, oomKilled: true }) }, "op")).toEqual(["owned-container-cleanup"]); expect(actions).toEqual(["stop:own"]);
  });
  it("labels the exact original recipe without changing its code", () => {
    const operation = "a".repeat(8) + "-" + "b".repeat(4) + "-" + "c".repeat(4) + "-" + "d".repeat(4) + "-" + "e".repeat(12);
    for (const name of ["Dockerfile.toolchain", "Dockerfile.packages"]) { const original = readFileSync("infra/postgres-sqlite-backport/" + name, "utf8"); const labelled = labelRecipe(original, operation); expect(labelled.replace(`LABEL io.vivalatax.qualification.operation="${operation}"\n`, "")).toBe(original); }
    expect(() => labelRecipe("FROM foreign\nRUN true\n", operation)).toThrow();
    expect(() => labelRecipe("FROM ${BASE}\nFROM ${TOOLCHAIN}\n", operation)).toThrow();
  });
  it("publishes only complete hash-bound regular artifact trees", async () => {
    const root = await mkdtemp(join(tmpdir(), "source-artifact-test-"));
    try {
      const source = join(root, "source"); await mkdir(source); const body = "{\"recipeExit\":1}\n";
      await writeFile(join(source, "status.json"), body); await writeFile(join(source, "ARTIFACTS.sha256"), createHash("sha256").update(body).digest("hex") + "  ./status.json\n");
      await publishArtifacts(source, join(root, "published"));
      expect(readFileSync(join(root, "published/status.json"), "utf8")).toBe(body);
      await symlink(join(source, "status.json"), join(source, "alias")); await expect(publishArtifacts(source, join(root, "bad-alias"))).rejects.toThrow();
      await rm(join(source, "alias")); await writeFile(join(source, "status.json"), "changed"); await expect(publishArtifacts(source, join(root, "bad-hash"))).rejects.toThrow();
      await writeFile(join(source, "ARTIFACTS.sha256"), "a".repeat(64) + "  ./../escape\n"); await expect(publishArtifacts(source, join(root, "bad-escape"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("keeps workflow manual read only bounded and unpromoted", () => {
    const w = readFileSync(".github/workflows/postgres-source-candidates-amd64.yml", "utf8");
    expect(w).toContain("workflow_dispatch:"); expect(w).toContain("timeout-minutes: 315"); expect(w).toContain("contents: read"); expect(w).toContain("retention-days: 3"); expect(w).toContain("persist-credentials: false"); expect(w).toContain("cancel-in-progress: false");
    expect(w).not.toMatch(/\b(?:push|pull_request|schedule):|docker\s+push|secrets\./);
  });
});

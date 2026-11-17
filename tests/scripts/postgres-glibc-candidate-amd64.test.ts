import { describe, expect, it } from "vitest";
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { SourceCandidateController } from "../../scripts/qualify-postgres-source-candidates-amd64.mjs";
import { GLIBC_LIMITS, GlibcCandidateController, assertGlibcCapacity, validateGlibcEvidence, publishGlibcArtifacts } from "../../scripts/qualify-postgres-glibc-candidate-amd64.mjs";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function fixture(root: string) {
  const put = async (name: string, body: string) => { await mkdir(join(root, name, ".."), { recursive: true }); await writeFile(join(root, name), body); };
  await put("execution-status.json", JSON.stringify({ stage: "complete", exit: 0, packageExecutionCompleted: true, candidateReleaseQualified: false, riskAccepted: false }));
  await put("package-status.json", JSON.stringify({ baselineBuildExit: 0, candidateBuildExit: 0, pairedRegressionVerified: true, fullOriginalSuitesRetained: true, abidiffExit: 0, sixConsumersExecuted: false, genericAbiApproval: false, riskAccepted: false, candidateReleaseQualified: false }));
  for (const variant of ["baseline", "candidate"]) {
    const result = variant === "baseline" ? "FAIL" : "PASS", exit = variant === "baseline" ? 1 : 0;
    await put(variant + "/suite-paths.txt", "build-tree/amd64-libc/tests.sum\n");
    await put(variant + "/amd64-libc-tests.sum", "PASS: other\n" + (variant === "candidate" ? "PASS: stdio-common/tst-vfscanf-bz34008\n" : ""));
    await put(variant + "/upstream-regression.exit", variant === "baseline" ? "2\n" : "0\n");
    await put(variant + "/upstream-regression.test-result", `${result}: stdio-common/tst-vfscanf-bz34008\noriginal exit status ${exit}\n`);
    await put(variant + "/upstream-regression.out", variant === "baseline" ? "memory clobbered past end of allocated block\nDidn't expect signal from child: got `Aborted'\n" : "");
    await put(variant + "/upstream-regression.log", `env MALLOC_CHECK_=3 LD_PRELOAD=/qualification-work/${variant}/build-tree/amd64-libc//malloc/libc_malloc_debug.so /qualification-work/${variant}/build-tree/amd64-libc/stdio-common/tst-vfscanf-bz34008\n`);
    await put(variant + "/package-build.log", "full source build\n");
  }
  await put("abi-providers.json", JSON.stringify(["lib/a.so", "lib/b.so", "lib/c.so", "lib/d.so", "lib/e.so"]));
  for (let n = 1; n <= 5; n++) { await put(`abi-${n}.stdout`, ""); await put(`abi-${n}.stderr`, ""); }
  return put;
}
describe("standalone AMD64 glibc source experiment", () => {
  it("enforces actual glibc time and disk limits", () => {
    const instance = new GlibcCandidateController("/synthetic/postgres-source-candidate", {});
    expect(instance.limit).toEqual({ minutes: 350, controllerMinutes: 340, cleanupMinutes: 20 });
    expect(instance.cleanupReserve).toBe(20 * 60000); expect(instance.deadline - performance.now()).toBeGreaterThan(339 * 60000); expect(instance.deadline - performance.now()).toBeLessThanOrEqual(340 * 60000);
    expect(instance.cleanup).toBe(SourceCandidateController.prototype.cleanup); expect(instance.run).toBe(SourceCandidateController.prototype.run); expect(instance.initialize).toBe(SourceCandidateController.prototype.initialize); expect(instance.capacity).not.toBe(SourceCandidateController.prototype.capacity);
    expect(GLIBC_LIMITS).toEqual({ jobMinutes: 350, controllerMinutes: 340, cleanupMinutes: 20, initialDiskGiB: 40, reserveDiskGiB: 2 });
    expect(() => assertGlibcCapacity(40 * 1024 ** 3, 40 * 1024 ** 3, true)).not.toThrow();
    expect(() => assertGlibcCapacity(39 * 1024 ** 3, 40 * 1024 ** 3, true)).toThrow();
    expect(() => assertGlibcCapacity(40 * 1024 ** 3, 1024 ** 3, false)).toThrow();
  });
  it("preserves source and package execution boundaries", async () => {
    const source = await readFile("scripts/qualify-postgres-glibc-candidate-amd64.mjs", "utf8");
    expect(source).toContain("--network"); expect(source).toContain("readonly"); expect(source).toContain("childExitConfirmed");
    const workflow = await readFile(".github/workflows/postgres-glibc-candidate-amd64.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:"); expect(workflow).toContain("timeout-minutes: 350"); expect(workflow).toContain("contents: read"); expect(workflow).toContain("retention-days: 3");
    expect(workflow).not.toMatch(/\b(?:push|pull_request|schedule):|docker\s+push|secrets\./);
  });
  it("requires positive actual allocator full suite and ABI evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "glibc-raw-evidence-"));
    try {
      const put = await fixture(root); await expect(validateGlibcEvidence(root, 0)).resolves.toMatchObject({ packageChecksPassed: true, sixConsumersExecuted: false, candidateReleaseQualified: false });
      for (const [name, bad] of [["baseline/upstream-regression.out", "arbitrary crash\n"], ["baseline/upstream-regression.out", "memory clobbered past end of allocated block\nTimed out: killed the child process\n"], ["candidate/upstream-regression.test-result", "UNSUPPORTED: stdio-common/tst-vfscanf-bz34008\noriginal exit status 77\n"], ["candidate/upstream-regression.log", "MALLOC_CHECK_=3 in a Makefile only\n"], ["candidate/amd64-libc-tests.sum", "FAIL: unexpected\n"], ["abi-providers.json", "[]"], ["execution-status.json", JSON.stringify({ stage: "patch", exit: 1 })]]) {
        await fixture(root); await put(name, bad); await expect(validateGlibcEvidence(root, 0), name).rejects.toThrow();
      }
      await fixture(root); await expect(validateGlibcEvidence(root, 1)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("exports hash bound ordinary failure while excluding unpacked aliases", async () => {
    const root = await mkdtemp(join(tmpdir(), "glibc-export-"));
    try {
      const source = join(root, "raw"); await mkdir(join(source, "baseline/unpacked"), { recursive: true });
      const body = '{"stage":"baseline-full-build","exit":1}\n'; await writeFile(join(source, "execution-status.json"), body); await writeFile(join(source, "baseline/unpacked/a"), "ELF fixture"); await symlink("/usr/lib/public-package-target", join(source, "baseline/unpacked/link"));
      await writeFile(join(source, "ARTIFACTS.sha256"), `${hash(body)}  ./execution-status.json\n${hash("ELF fixture")}  ./baseline/unpacked/a\n`);
      await expect(publishGlibcArtifacts(source, join(root, "published"))).resolves.toMatchObject({ omittedUnpackedRegularFiles: 1, excludedUnpackedSymlinks: 1 });
      await expect(readFile(join(root, "published/baseline/unpacked/a"))).rejects.toThrow(); expect(await readFile(join(root, "published/execution-status.json"), "utf8")).toBe(body);
      await symlink("/etc/passwd", join(source, "unsafe")); await expect(publishGlibcArtifacts(source, join(root, "bad"))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

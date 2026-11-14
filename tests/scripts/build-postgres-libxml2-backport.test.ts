import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNativeArchitecture,
  assertPackageChecksPassed,
  buildCandidate,
  commandTimeoutMs,
  parseBuilderArguments,
  runBoundedCommand,
  verifyPinnedFile,
} from "../../scripts/build-postgres-libxml2-backport.mjs";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const passingStatus = {
  baselinePackageBuildExit: 0,
  baselineOptimizedCheckExit: 0,
  candidatePackageBuildExit: 0,
  candidateOptimizedCheckExit: 0,
  baselineSanitizerExit: 0,
  candidateSanitizerExit: 0,
  packageOrSanitizerFailure: 0,
  abidiffExit: 4,
  genericAbiApproval: false,
};

describe("private PostgreSQL libxml2 source build admission", () => {
  it("requires an explicit native architecture and fresh output destination", () => {
    const result = parseBuilderArguments([
      "--runtime", "podman", "--architecture", "arm64", "--source-cache", "cache", "--output", "evidence",
    ]);
    expect(result).toEqual({ runtime: "podman", architecture: "arm64", sourceCache: resolve("cache"), output: resolve("evidence"), timeLimitMinutes: 150 });
    expect(() => parseBuilderArguments(["--runtime", "podman"])).toThrow(/architecture|source-cache|output/);
    expect(() => parseBuilderArguments(["--runtime", "remote", "--architecture", "arm64", "--source-cache", "cache", "--output", "evidence"])).toThrow(/docker or podman/);
    expect(() => parseBuilderArguments(["--unexpected", "value"])).toThrow(/Unknown/);
  });

  it.each(["29", "151", "30.5", "NaN", "Infinity", "0", "-1"])("rejects invalid explicit time limit %s", value => {
    expect(() => parseBuilderArguments([
      "--runtime", "podman", "--architecture", "arm64", "--source-cache", "cache", "--output", "evidence", "--time-limit-minutes", value,
    ])).toThrow(/integer from 30 to 150/);
  });

  it.each([30, 120, 150])("accepts a bounded explicit %s-minute window", value => {
    expect(parseBuilderArguments([
      "--runtime", "podman", "--architecture", "arm64", "--source-cache", "cache", "--output", "evidence", "--time-limit-minutes", String(value),
    ]).timeLimitMinutes).toBe(value);
  });

  it("reserves cleanup and finite TERM grace within the selected monotonic window", () => {
    const minute = 60_000;
    const started = 1_000;
    const now = started + 25 * minute;
    expect(commandTimeoutMs(started + 150 * minute, 90 * minute, false, now)).toBe(90 * minute);
    expect(commandTimeoutMs(started + 120 * minute, 90 * minute, false, now)).toBe(80 * minute - 2_000);
    expect(() => commandTimeoutMs(started + 120 * minute, minute, false, started + 119 * minute)).toThrow(/deadline/);
    expect(commandTimeoutMs(started + 120 * minute, 2 * minute, true, started + 119 * minute)).toBe(minute - 2_000);
    expect(() => commandTimeoutMs(started + 120 * minute, minute, true, started + 120 * minute)).toThrow(/deadline/);
  });

  it("rejects emulation, unknown daemon architecture and a non-Linux daemon before building", () => {
    expect(() => assertNativeArchitecture({ host: { arch: "amd64", os: "linux" } }, "arm64")).toThrow(/native/);
    expect(() => assertNativeArchitecture({ Architecture: "mystery", OSType: "linux" }, "arm64")).toThrow(/native/);
    expect(() => assertNativeArchitecture({ Architecture: "arm64", OSType: "windows" }, "arm64")).toThrow(/Linux/);
    expect(() => assertNativeArchitecture({ host: { arch: "arm64", os: "linux" } }, "arm64")).not.toThrow();
    expect(() => assertNativeArchitecture({ Architecture: "x86_64", OSType: "linux" }, "amd64")).not.toThrow();
  });

  it("checks actual cached bytes and rejects a different same-length archive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tax-libxml2-source-"));
    directories.push(directory);
    const file = join(directory, "source.tar.xz");
    const bytes = Buffer.from("official synthetic fixture");
    const pinned = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    await writeFile(file, bytes);
    await expect(verifyPinnedFile(file, pinned)).resolves.toBe(pinned.sha256);
    await writeFile(file, Buffer.alloc(bytes.length, 0));
    await expect(verifyPinnedFile(file, pinned)).rejects.toThrow(/checksum/);
  });

  it("rejects missing, symlinked and wrong-length cache inputs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tax-libxml2-source-"));
    directories.push(directory);
    const file = join(directory, "source");
    const link = join(directory, "alias");
    const pinned = { bytes: 3, sha256: createHash("sha256").update("abc").digest("hex") };
    await expect(verifyPinnedFile(file, pinned)).rejects.toThrow();
    await writeFile(file, "abc");
    await symlink(file, link);
    await expect(verifyPinnedFile(link, pinned)).rejects.toThrow(/regular|symlink/);
    await writeFile(file, "abcd");
    await expect(verifyPinnedFile(file, pinned)).rejects.toThrow(/length/);
  });

  it("rejects a corrupted cached source through the real entry before output or daemon access", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tax-libxml2-entry-"));
    directories.push(directory);
    const manifest = JSON.parse(await readFile(resolve("infra/postgres-libxml2-backport/sources.json"), "utf8"));
    const source = manifest.sources[0];
    await writeFile(join(directory, source.name), Buffer.alloc(source.bytes));
    const output = join(directory, "new-output");
    await expect(buildCandidate({ runtime: "podman", architecture: "arm64", sourceCache: directory, output })).rejects.toThrow(/checksum/);
    await expect(readFile(join(output, "build-admission.json"))).rejects.toThrow();
  });

  it("returns after a finite TERM grace when its own synthetic child ignores TERM", async () => {
    const started = performance.now();
    const error = await runBoundedCommand(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000);'], {
      env: process.env, timeoutMs: 500, closeGraceMs: 100,
    }).catch(error => error);
    try {
      expect(error.childExitConfirmed).toBe(false);
      expect(error.stdout).toContain("ready");
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(error.ownedChildPid).toBeGreaterThan(0);
    } finally {
      if (error.ownedChild) {
        const exited = once(error.ownedChild, "exit");
        error.ownedChild.kill("SIGKILL");
        await exited;
      }
    }
  });

  it("records confirmed termination for an ordinary timed-out child", async () => {
    const error = await runBoundedCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      env: process.env, timeoutMs: 250, closeGraceMs: 200,
    }).catch(error => error);
    expect(error.childExitConfirmed).toBe(true);
    expect(error.ownedChildPid).toBeUndefined();
  });

  it.each([
    "baselinePackageBuildExit", "baselineOptimizedCheckExit", "candidatePackageBuildExit",
    "candidateOptimizedCheckExit", "baselineSanitizerExit", "candidateSanitizerExit", "packageOrSanitizerFailure",
  ])("enforces %s even when the aggregate claims success", field => {
    expect(() => assertPackageChecksPassed({ ...passingStatus, [field]: 1 })).toThrow(/check/);
    const missing = { ...passingStatus } as Record<string, unknown>;
    delete missing[field];
    expect(() => assertPackageChecksPassed(missing)).toThrow(/check/);
  });

  it("retains an ABI difference while rejecting failed ABI diagnostics or approval claims", () => {
    expect(() => assertPackageChecksPassed(passingStatus)).not.toThrow();
    expect(() => assertPackageChecksPassed({ ...passingStatus, abidiffExit: 1 })).toThrow(/ABI/);
    expect(() => assertPackageChecksPassed({ ...passingStatus, genericAbiApproval: true })).toThrow(/ABI/);
  });

  it("pins both official platform children, maintained patch and restored fixture provenance", async () => {
    const manifest = JSON.parse(await readFile(resolve("infra/postgres-libxml2-backport/sources.json"), "utf8"));
    expect(manifest.postgres.index).toBe("sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca");
    expect(manifest.postgres.platforms.arm64.digest).toBe("sha256:586813eb2f2d5491a992541f7f0b91bf837e7ae43ec1c42af5a9639483e068c7");
    expect(manifest.postgres.platforms.amd64.digest).toBe("sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848");
    expect(manifest.recipeFiles["CVE-2026-6653.patch"].sha256).toBe("6c2b8a7b6fa470efcb1854e5c73bd7e1ae1663d8b111e27ce9232bbc1fe44f54");
    expect(manifest.sources.find((source: { name: string }) => source.name === "upstream-fixtures.tar.xz").sha256)
      .toBe("60d74a257d1ccec0475e749cba2f21559e48139efba6ff28224357c7c798dfee");
    expect(manifest.candidateReleaseQualified).toBe(false);
    for (const [name, pin] of Object.entries(manifest.recipeFiles)) {
      await expect(verifyPinnedFile(resolve("infra/postgres-libxml2-backport", name), pin)).resolves.toBe((pin as { sha256: string }).sha256);
    }
  });

  it("preserves explicit package checks, paired sanitizers and non-overwriting fixture restoration", async () => {
    const script = await readFile(resolve("infra/postgres-libxml2-backport/build-packages.sh"), "utf8");
    expect(script).toContain("make -C builddir/main check");
    expect(script).toContain("cp -an upstream-fixtures/libxml2-2.9.14/test upstream-fixtures/libxml2-2.9.14/result baseline/");
    expect(script).toContain("-fsanitize=address,undefined");
    expect(script).toContain("ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1");
    expect(script).toContain("timeout --kill-after=5s 240 ./testrecurse");
    expect(script).toContain("timeout --kill-after=5s 240 ./runtest");
  });
});

import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReleaseSignature, assertSqliteChecksPassed, parseBuilderArguments, parseSqliteSourceStanza, prepareBuildContext, verifySourceCache } from "../../scripts/build-postgres-sqlite-backport.mjs";
const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const recipe = new URL("../../infra/postgres-sqlite-backport/", import.meta.url);
describe("private PostgreSQL SQLite backport source admission", () => {
  it("requires the complete signed source chain before preparing a context", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tax-sqlite-source-")); folders.push(dir);
    await expect(verifySourceCache(dir)).rejects.toThrow();
    const stanza = "Package: sqlite3\nVersion: 3.40.1-2+deb12u2\nDirectory: pool/main/s/sqlite3\nChecksums-Sha256:\n";
    expect(() => parseSqliteSourceStanza(stanza)).toThrow();
    expect(() => parseSqliteSourceStanza(stanza + "\n" + stanza)).toThrow();
    expect(() => parseSqliteSourceStanza(stanza.replace("sqlite3", "other"))).toThrow();
  });
  it("checks the archive signing fingerprint and rejects invalid signature categories", () => {
    const fingerprint = "4CB50190207B4758A3F73A796ED0E7B82643E131";
    const valid = `[GNUPG:] VALIDSIG ${fingerprint} 2026-07-11 1 0 4 0 1 10 01 ${fingerprint}\n`;
    expect(() => assertReleaseSignature(valid, [fingerprint])).not.toThrow();
    for (const status of ["", valid.replace(fingerprint, "0".repeat(40)), ...["BADSIG", "REVKEYSIG", "EXPKEYSIG"].map(key => valid + `[GNUPG:] ${key} denied\n`)]) expect(() => assertReleaseSignature(status, [fingerprint])).toThrow();
  });
  it("binds every source archive exactly once in the only matching Debian stanza", async () => {
    const manifest = JSON.parse(await readFile(new URL("sources.json", recipe), "utf8"));
    const rows = manifest.sources.map((v: { sha256: string; bytes: number; name: string }) => ` ${v.sha256} ${v.bytes} ${v.name}\n`).join("");
    const valid = `Package: sqlite3\nVersion: 3.40.1-2+deb12u2\nChecksums-Sha256:\n${rows}Directory: pool/main/s/sqlite3\n`;
    expect(parseSqliteSourceStanza(valid).size).toBe(4);
    for (const invalid of [valid.replace("3.40.1-2+deb12u2", "3.46.1-7"), valid.replace("pool/main/s/sqlite3", "pool/foreign"), valid.replace(rows, rows + rows.split("\n")[0] + "\n"), valid.replace(manifest.sources[0].name, "../foreign.dsc"), valid.replace(manifest.sources[0].name, "foreign.dsc")]) expect(() => parseSqliteSourceStanza(invalid)).toThrow();
  });
  it("retains exact upstream patch scope and all original regression cases", async () => {
    const patch = await readFile(new URL("CVE-2025-7458.patch", recipe), "utf8");
    expect([...patch.matchAll(/^diff --git a\/(\S+) b\/\S+$/gm)].map(m => m[1])).toEqual(["src/where.c", "test/distinct.test"]);
    expect(patch).toContain("pWInfo->nOBSat > pWInfo->pSelect->pOrderBy->nExpr");
    for (let n = 1; n <= 5; n++) expect(patch).toContain(`+do_execsql_test 10.${n} {`);
    const script = await readFile(new URL("build-packages.sh", recipe), "utf8");
    expect(script).toContain("--fuzz=0"); expect(script).toContain("baselineRegressionReproduced");
    expect(script).toContain("ASAN_OPTIONS"); expect(script).toContain("dpkg-buildpackage");
  });
  it("selects the upstream amalgamation harness without duplicating extension sources or reducing suites", async () => {
    // These four branch rules are verbatim from the authenticated 3.40.1
    // Makefile.in. The minimal source lists retain its real fts3_term collision.
    const fixture = [
      "TOP = source", "USE_AMALGAMATION = 0",
      "TESTSRC = $(TOP)/src/test1.c $(TOP)/ext/fts3/fts3_term.c",
      "TESTSRC2 = $(TOP)/src/main.c $(TOP)/ext/fts3/fts3_term.c",
      "TESTFIXTURE_SRC0 = $(TESTSRC2) libsqlite3.la",
      "TESTFIXTURE_SRC1 = sqlite3.c",
      "TESTFIXTURE_SRC = $(TESTSRC) $(TOP)/src/tclsqlite.c",
      "TESTFIXTURE_SRC += $(TESTFIXTURE_SRC$(USE_AMALGAMATION))",
      "print-plan:", "\t@printf '%s\\n' '$(TESTFIXTURE_SRC)'", "",
    ].join("\n");
    const dir = await mkdtemp(join(tmpdir(), "tax-sqlite-make-plan-")); folders.push(dir);
    const makefile = join(dir, "Makefile"); await writeFile(makefile, fixture);
    const plan = (args: string[]) => execFileSync("make", ["-rR", "-f", makefile, ...args, "print-plan"], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, TMPDIR: tmpdir(), LC_ALL: "C" } }).trim().split(/\s+/);
    const original = plan([]);
    expect(original.filter(p => p.endsWith("/fts3_term.c"))).toHaveLength(2);
    const script = await readFile(new URL("build-packages.sh", recipe), "utf8");
    const commands = [...script.matchAll(/^\s*(?:as_test_user )?make -j2 (.*?) (?:>|\\)/gm)].map(m => m[1].split(/\s+/));
    expect(commands).toHaveLength(3);
    expect(commands.map(args => args.at(-1))).toEqual(["fulltest", "testfixture", "testfixture"]);
    for (const args of commands) {
      expect(args.slice(0, -1)).toEqual(["USE_AMALGAMATION=1"]);
      const selected = plan(args.slice(0, -1));
      expect(selected).toEqual(["source/src/test1.c", "source/ext/fts3/fts3_term.c", "source/src/tclsqlite.c", "sqlite3.c"]);
      expect(selected.filter(p => p.endsWith("/fts3_term.c"))).toHaveLength(1);
    }
    expect(script).toContain("dpkg-buildpackage -B -uc -us");
    expect(script).toContain("ASAN_OPTIONS=detect_leaks=1:halt_on_error=1 UBSAN_OPTIONS=halt_on_error=1");
    expect(script.match(/'--match=distinct-10\.\*'/g)).toHaveLength(2);
  });
  it("runs every upstream harness command as the isolated nonroot user and preserves failing exits", async () => {
    const script = await readFile(new URL("build-packages.sh", recipe), "utf8");
    const helper = script.match(/^as_test_user\(\) \{[\s\S]*?^\}/m)?.[0];
    expect(helper).toBeDefined();
    if (helper === undefined) throw Error("Nonroot harness helper required");
    expect(script).toContain("useradd --system --no-create-home --home-dir /qualification-work --shell /usr/sbin/nologin sqlite-test");
    expect(script).toContain('test "$(id -u sqlite-test)" -ne 0');
    expect(script).toContain("chown -R sqlite-test:sqlite-test /qualification-work /qualification-out");
    expect(script.match(/^\s*as_test_user /gm)).toHaveLength(7);
    const calls = script.split("\n").filter(line => /^\s*as_test_user (make |\.\/testfixture |env |\.\.\/candidate\/configure)/.test(line));
    expect(calls).toHaveLength(6);
    expect(calls.filter(line => line.includes("make -j2 USE_AMALGAMATION=1"))).toHaveLength(3);
    expect(calls.filter(line => line.includes("./testfixture"))).toHaveLength(1);
    expect(calls.filter(line => line.includes("env "))).toHaveLength(2);
    expect(script).toContain("LDFLAGS='-fsanitize=address,undefined' ../candidate/configure");
    const fulltest = script.match(/^( {4}as_test_user make -j2 USE_AMALGAMATION=1 fulltest[^\n]*\n[\s\S]*? {4}test "\$result" = 0)/m)?.[1];
    expect(fulltest).toBeDefined();
    if (fulltest === undefined) throw Error("Fulltest command and exit gate required");
    const dir = await mkdtemp(join(tmpdir(), "tax-sqlite-nonroot-")); folders.push(dir);
    for (const exit of [0, 2]) {
      // Execute the actual source function/exit gate, with inert runuser/make
      // stand-ins. No users, ownership, root directories or packages are changed.
      const program = ["set -euo pipefail", `cd '${dir}'`, "variant=baseline",
        'runuser() { test "$1" = -u; test "$2" = sqlite-test; test "$3" = --; shift 3; printf "nonroot-boundary\\n"; "$@"; }',
        `make() { test "$*" = '-j2 USE_AMALGAMATION=1 fulltest'; return ${exit}; }`,
        'record() { printf "status:%s:%s\\n" "$1" "$2"; }', helper, "set +e",
        fulltest.replace(' > "/qualification-out/$variant/fulltest.log" 2>&1', ""), 'printf "completed\\n"',
      ].join("\n");
      if (exit === 0) expect(execFileSync("bash", ["-c", program], { encoding: "utf8", timeout: 5000 })).toBe("nonroot-boundary\nstatus:baselineFullTestExit:0\ncompleted\n");
      else {
        try { execFileSync("bash", ["-c", program], { encoding: "utf8", timeout: 5000, stdio: "pipe" }); throw Error("Expected failed fulltest"); }
        catch (error) { expect(error).toMatchObject({ status: 1, stdout: "nonroot-boundary\nstatus:baselineFullTestExit:2\n" }); }
      }
    }
    expect(script).toContain("dpkg-buildpackage -B -uc -us");
    expect(script).not.toMatch(/(?:exclude|skip).*recoverfault2/);
  });
  it("requires native architecture immutable toolchain and exclusive output", async () => {
    const args = ["--architecture", "arm64", "--source-cache", "cache", "--output", "fresh", "--toolchain", "sha256:" + "a".repeat(64)];
    expect(parseBuilderArguments(args).architecture).toBe("arm64");
    expect(() => parseBuilderArguments(args.map(x => x === "arm64" ? "unknown" : x))).toThrow();
    expect(() => parseBuilderArguments(args.map(x => x.startsWith("sha256:") ? "image:latest" : x))).toThrow();
    expect(() => parseBuilderArguments([...args, "--output", "again"])).toThrow();
    const out = await mkdtemp(join(tmpdir(), "tax-sqlite-output-")); folders.push(out);
    await expect(prepareBuildContext({ architecture: "arm64", sourceCache: out, output: out, toolchain: "sha256:" + "a".repeat(64) })).rejects.toThrow();
  });
  it("requires positive paired reproduction and retains every readiness hold", () => {
    const passed = { recipeExit: 0, baselinePackageBuildExit: 0, candidatePackageBuildExit: 0, baselineFullTestExit: 0, candidateFullTestExit: 0, baselineRegressionReproduced: true, candidateRegressionExit: 0, candidateSanitizerRegressionExit: 0, candidateRegressionCasesPassed: 5, candidateSanitizerRegressionCasesPassed: 5, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false };
    expect(() => assertSqliteChecksPassed(passed)).not.toThrow();
    for (const key of Object.keys(passed)) {
      const changed = { ...passed, [key]: typeof passed[key as keyof typeof passed] === "boolean" ? !passed[key as keyof typeof passed] : 1 };
      expect(() => assertSqliteChecksPassed(changed), key).toThrow();
      const missing: Record<string, unknown> = { ...passed }; delete missing[key]; expect(() => assertSqliteChecksPassed(missing), key).toThrow();
    }
  });
  it("uses only the injected verifier runner and propagates unknown child custody", async () => {
    const manifest = JSON.parse(await readFile(new URL("sources.json", recipe), "utf8"));
    const actualFs = await import("node:fs/promises");
    const out = await mkdtemp(join(tmpdir(), "tax-sqlite-custody-")); folders.push(out);
    const output = join(out, "fresh");
    const fallback = vi.fn(() => { throw new Error("Unexpected unsupervised child"); });
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({ ...actualFs, readFile: async (path: Parameters<typeof actualFs.readFile>[0]) => String(path) === "/synthetic-source-cache/InRelease" ? ` ${manifest.sourceIndex.sha256}  ${manifest.sourceIndex.bytes} main/source/Sources.xz\n` : actualFs.readFile(path) }));
    vi.doMock("../../scripts/build-postgres-libxml2-backport.mjs", () => ({ runBoundedCommand: fallback, verifyPinnedFile: async () => "verified-synthetic-input" }));
    try {
      const candidate = await import("../../scripts/build-postgres-sqlite-backport.mjs");
      for (const failAt of [1, 2]) {
        const unknown = Object.assign(new Error("synthetic unknown child"), { childExitConfirmed: false, code: "BOUNDED_COMMAND_TERMINATED" });
        const calls: { executable: string; args: string[]; options: { timeoutMs: number } }[] = [];
        const run = async (executable: string, args: string[], options: { timeoutMs: number }) => { calls.push({ executable, args, options }); if (calls.length === failAt) throw unknown; return { stdout: `[GNUPG:] VALIDSIG ${manifest.acceptedReleaseSigningFingerprints[0]} 2026-07-11 1 0 4 0 1 10 01\n` }; };
        await expect(candidate.prepareBuildContext({ architecture: "amd64", sourceCache: "/synthetic-source-cache", output, toolchain: "sha256:" + "a".repeat(64) }, { run })).rejects.toBe(unknown);
        expect(calls.map(v => v.executable)).toEqual(failAt === 1 ? ["gpgv"] : ["gpgv", "xz"]);
        expect(calls.every(v => v.options.timeoutMs === 30000)).toBe(true);
        await expect(actualFs.lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
      }
      expect(fallback).not.toHaveBeenCalled();
    } finally { vi.doUnmock("node:fs/promises"); vi.doUnmock("../../scripts/build-postgres-libxml2-backport.mjs"); vi.resetModules(); }
  });

});

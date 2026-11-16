import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile, symlink, link, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertSignedSourceChain, assertQualificationStatus, assertSuiteSummary,
  validateManifest, parseArguments, createExclusiveContext, stagePinnedFile,
} from "../../scripts/build-postgres-glibc-backport.mjs";

const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const fingerprints = ["B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8", "04B54C3CDCA79751B16BC6B5225629DF75B188BD", "4D64FEC119C2029067D6E791F8D2585B8783D481"];
const inputs = ["glibc_2.36-9+deb12u14.dsc", "glibc_2.36.orig.tar.xz", "glibc_2.36-9+deb12u14.debian.tar.xz"].map((name, i) => ({ name, bytes: i + 1, sha256: hash(String(i)) }));
const index = `Package: glibc\nVersion: 2.36-9+deb12u14\nDirectory: pool/main/g/glibc\nChecksums-Sha256:\n${inputs.map(x => ` ${x.sha256} ${x.bytes} ${x.name}`).join("\n")}\n`;
const compressed = Buffer.from("synthetic compressed index");
const release = `Codename: bookworm\nSHA256:\n ${hash(compressed)} ${compressed.length} main/source/Sources.xz\n`;
const status = fingerprints.map(f => `[GNUPG:] VALIDSIG ${f} 2026-07-11 1783765031 0 4 0 1 8 01 ${f}\n`).join("");
const good = () => assertSignedSourceChain({ release, compressed, index, signatureStatus: status, sources: inputs });

describe("Bookworm glibc private source backport (spec/federal/postgres-glibc-backport.yaml)", () => {
  it("authenticates exact Bookworm source and rejects broken signature or index chains", () => {
    expect(good()).toEqual({ version: "2.36-9+deb12u14", sourceFiles: 3, verifiedArchiveSignatures: 3 });
    for (const broken of [status.replace(fingerprints[0], "0".repeat(40)), status + "[GNUPG:] BADSIG synthetic\n", status.replace("VALIDSIG", "GOODSIG")]) {
      expect(() => assertSignedSourceChain({ release, compressed, index, signatureStatus: broken, sources: inputs })).toThrow();
    }
    for (const broken of [index + "\n" + index, index.replace("2.36-9+deb12u14", "2.41-12+deb13u4"), index.replace(inputs[0].sha256, "0".repeat(64)), index.replace("pool/main/g/glibc", "foreign"), index + ` ${inputs[0].sha256} ${inputs[0].bytes} ${inputs[0].name}\n`]) {
      expect(() => assertSignedSourceChain({ release, compressed, index: broken, signatureStatus: status, sources: inputs })).toThrow();
    }
    expect(() => assertSignedSourceChain({ release, compressed: Buffer.from("changed"), index, signatureStatus: status, sources: inputs })).toThrow();
  });
  it("preserves the full upstream regression and all three allocation fixes", async () => {
    const manifest = JSON.parse(await readFile("infra/postgres-glibc-backport/sources.json", "utf8"));
    validateManifest(manifest);
    const patch = await readFile("infra/postgres-glibc-backport/CVE-2026-5450.patch", "utf8");
    const upstream = await readFile("infra/postgres-glibc-backport/upstream-839898777226a3ed88c0859f25ffe712519b4ead.patch", "utf8");
    const regression = (s: string) => s.slice(s.indexOf("@@ -0,0 +1,48 @@") + "@@ -0,0 +1,48 @@\n".length).split("\ndiff --git ")[0].trimEnd();
    expect(regression(patch)).toBe(regression(upstream));
    expect(patch.match(/^\+.*strsize \+ \(strsize >= width \? width : strsize\);$/gm)).toHaveLength(3);
    expect(patch).toContain("+  MALLOC_CHECK_=3");
    expect(patch).toContain("+  LD_PRELOAD=$(common-objpfx)/malloc/libc_malloc_debug.so");
    expect(regression(patch)).toContain('+\n+#include <support/test-driver.c>');
    expect(() => validateManifest({ ...manifest, baselineVersion: "2.41-12+deb13u4" })).toThrow();
    expect(() => validateManifest({ ...manifest, riskAccepted: true })).toThrow();
    // Exercise the actual runtime recipe admission against package-manager rows.
    const installer = await readFile("infra/postgres-glibc-backport/install-runtime.sh", "utf8");
    const admission = installer.slice(installer.indexOf("for required in"), installer.indexOf("locale -a"));
    const root = await mkdtemp(join(tmpdir(), "tax-glibc-package-admission-"));
    try {
      await import("node:fs/promises").then(fs => fs.mkdir(join(root, "admission")));
      const rows = ["libc-bin", "libc6:arm64", "libc-l10n", "locales"].map(p => `${p}\t2.36-9+deb12u14`).join("\n") + "\n";
      const admit = () => execFileSync("/bin/bash", ["-euc", admission], { env: { PATH: "/usr/bin:/bin", EXPECTED_ARCH: "arm64", base_version: "2.36-9+deb12u14", root }, stdio: "pipe" });
      await writeFile(join(root, "admission/before.tsv"), rows);
      expect(admit).not.toThrow();
      for (const changed of [rows.replaceAll("+deb", "deb"), rows.replace("libc6:arm64", "libc6:amd64"), rows.replace("locales\t2.36-9+deb12u14\n", ""), rows.replace("2.36-9+deb12u14", "2.36-9+deb12u14+foreign")]) {
        await writeFile(join(root, "admission/before.tsv"), changed);
        expect(admit).toThrow();
      }
    } finally { await rm(root, { recursive: true, force: true }); }

  });
  it("rejects incomplete regression suite ABI and consumer evidence", () => {
    const v = { baselineBuildExit: 0, candidateBuildExit: 0, baselineRegressionExit: 1, candidateRegressionExit: 0, baselineSuiteVerified: true, candidateSuiteVerified: true, allocatorCheckingVerified: true, abidiffExit: 0, consumerExits: [0, 0, 0, 0, 0, 0], genericAbiApproval: false, riskAccepted: false, candidateReleaseQualified: false };
    expect(() => assertQualificationStatus(v)).not.toThrow();
    for (const key of ["baselineBuildExit", "candidateBuildExit", "candidateRegressionExit", "abidiffExit"]) expect(() => assertQualificationStatus({ ...v, [key]: 4 })).toThrow();
    for (const key of ["baselineSuiteVerified", "candidateSuiteVerified", "allocatorCheckingVerified"]) expect(() => assertQualificationStatus({ ...v, [key]: false })).toThrow();
    expect(() => assertQualificationStatus({ ...v, baselineRegressionExit: 0 })).toThrow();
    expect(() => assertQualificationStatus({ ...v, consumerExits: [0, 0, 0, 0, 0] })).toThrow();
    expect(() => assertQualificationStatus({ ...v, consumerExits: [0, 0, 1, 0, 0, 0] })).toThrow();
    expect(() => assertQualificationStatus({ ...v, riskAccepted: true })).toThrow();
    expect(() => assertSuiteSummary("PASS: stdio-common/tst-vfscanf-bz34008\nPASS: other\n")).not.toThrow();
    for (const line of ["FAIL", "XPASS", "UNRESOLVED", "ERROR", "UNSUPPORTED"]) expect(() => assertSuiteSummary(`${line}: stdio-common/tst-vfscanf-bz34008\n`)).toThrow();
    expect(() => assertSuiteSummary("PASS: other\n")).toThrow();
  });
  it("prepares only an exclusive offline source context", async () => {
    expect(parseArguments(["--architecture", "arm64", "--source-cache", "cache", "--output", "new"])).toMatchObject({ architecture: "arm64" });
    const root = await mkdtemp(join(tmpdir(), "tax-glibc-context-"));
    try {
      const output = join(root, "context");
      await createExclusiveContext(output);
      expect((await stat(output)).mode & 0o777).toBe(0o700);
      await expect(createExclusiveContext(output)).rejects.toThrow();
      const source = join(root, "source"); const dest = join(output, "copied");
      await writeFile(source, "authenticated fixture");
      const pin = { bytes: 21, sha256: hash("authenticated fixture") };
      await stagePinnedFile(source, dest, pin);
      expect(await readFile(dest, "utf8")).toBe("authenticated fixture");
      await expect(stagePinnedFile(source, dest, pin)).rejects.toThrow();
      await symlink(source, join(root, "alias"));
      await expect(stagePinnedFile(join(root, "alias"), join(output, "aliased"), pin)).rejects.toThrow();
      await link(source, join(root, "hardlink"));
      await expect(stagePinnedFile(source, join(output, "hardlinked"), pin)).rejects.toThrow();
      await rm(join(root, "hardlink")); await writeFile(source, "changed same sized!!! ");
      await expect(stagePinnedFile(source, join(output, "changed"), pin)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }

    for (const args of [["--architecture", "emulated"], ["--runtime", "podman"], ["--architecture", "amd64", "--architecture", "arm64"], ["--architecture", "amd64", "--source-cache", "cache"]]) expect(() => parseArguments(args)).toThrow();
  });
});

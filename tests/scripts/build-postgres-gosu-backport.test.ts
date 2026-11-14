import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertGosuChecksPassed, assertGosuMetadata, assertStaticGosuElf, verifyGosuArtifacts, buildCandidate, parseBuilderArguments, verifyPinnedFile } from "../../scripts/build-postgres-gosu-backport.mjs";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const base = "sha256:" + "a".repeat(64);
const status = { moduleDownloadExit: 0, moduleVerifyExit: 0, compileCheckExit: 0, buildExit: 0, metadataCheckExit: 0, functionalCheckExit: 0, candidateReleaseQualified: false, riskAccepted: false };
const metadata = `gosu: go1.27.4
\tpath\tgithub.com/tianon/gosu
\tmod\tgithub.com/tianon/gosu\t(devel)
\tdep\tgithub.com/moby/sys/user\tv0.4.1\th1:RgjRlaDKi/Xmyrz4t8lyzXT6v2ooFeO/7xtchmhVWE0=
\tdep\tgolang.org/x/sys\tv0.1.0\th1:kunALQeHf1/185U1i0GOB/fy1IPRDDpuoOOqRReG57U=
\tbuild\tCGO_ENABLED=0
\tbuild\tGOARCH=arm64
\tbuild\tGOOS=linux
`;
function syntheticElf() {
  const bytes = Buffer.alloc(120); bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  bytes.writeUInt16LE(183, 18); bytes.writeBigUInt64LE(64n, 32); bytes.writeUInt16LE(56, 54); bytes.writeUInt16LE(1, 56); bytes.writeUInt32LE(1, 64); return bytes;
}
async function fixtureArtifacts(overrides: Record<string, string | Buffer> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tax-gosu-artifacts-")); directories.push(directory);
  const files = { gosu: syntheticElf(), LICENSE: "synthetic license", "THIRD-PARTY-LICENSES.txt": "synthetic module notices\n" + await readFile(resolve("infra/postgres-gosu-backport/GO-LICENSE"), "utf8"), "go-metadata.txt": metadata, "status.json": JSON.stringify(status), ...overrides };
  for (const [name, data] of Object.entries(files)) await writeFile(join(directory, name), data);
  await writeFile(join(directory, "ARTIFACTS.sha256"), Object.entries(files).map(([name, data]) => `${createHash("sha256").update(data).digest("hex")}  ${name}\n`).join(""));
  return directory;
}
describe("candidate-only PostgreSQL gosu build admission", () => {
  it("requires explicit immutable base and architecture without implicit remote fetching", () => {
    const args = ["--runtime", "podman", "--architecture", "arm64", "--source-cache", "cache", "--output", "new", "--base-image", base];
    expect(parseBuilderArguments(args)).toEqual({ runtime: "podman", architecture: "arm64", sourceCache: resolve("cache"), output: resolve("new"), baseImage: base });
    expect(() => parseBuilderArguments(args.slice(0, -2))).toThrow(/base/);
    expect(() => parseBuilderArguments([...args.slice(0, -1), "postgres:16"])).toThrow(/immutable/);
    expect(() => parseBuilderArguments([...args, "--output", "again"])).toThrow(/repeated/);
    expect(() => parseBuilderArguments([...args, "--pull", "always"])).toThrow(/Unknown/);
  });
  it.each(Object.keys(status).filter(k => k.endsWith("Exit")))("requires independent %s even when other stages pass", field => {
    expect(() => assertGosuChecksPassed({ ...status, [field]: 1 })).toThrow(/check/);
    const missing = { ...status } as Record<string, unknown>; delete missing[field];
    expect(() => assertGosuChecksPassed(missing)).toThrow(/check/);
  });
  it("cannot treat successful build checks as release approval", () => {
    expect(() => assertGosuChecksPassed(status)).not.toThrow();
    expect(() => assertGosuChecksPassed({ ...status, candidateReleaseQualified: true })).toThrow(/release/);
    expect(() => assertGosuChecksPassed({ ...status, riskAccepted: true })).toThrow(/risk/);
  });
  it("verifies actual compiler, architecture, static build and both complete module checksums", () => {
    expect(() => assertGosuMetadata(metadata, "arm64")).not.toThrow();
    for (const changed of [metadata.replace("go1.27.4", "go1.24.6"), metadata.replace("GOARCH=arm64", "GOARCH=amd64"), metadata.replace("CGO_ENABLED=0", "CGO_ENABLED=1"), metadata.replace("v0.4.1", "v0.1.0"), metadata.replace("h1:RgjRla", "h1:bogus"), metadata.replace("GOOS=linux", "GOOS=darwin")]) expect(() => assertGosuMetadata(changed, "arm64")).toThrow();
  });
  it("rejects corrupted source before creating output or calling a daemon", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tax-gosu-admission-")); directories.push(dir);
    const manifest = JSON.parse(await readFile(resolve("infra/postgres-gosu-backport/sources.json"), "utf8"));
    const pin = manifest.sources[0]; await writeFile(join(dir, pin.name), Buffer.alloc(pin.bytes));
    await expect(buildCandidate({ runtime: "podman", architecture: "arm64", sourceCache: dir, output: join(dir, "never-created"), baseImage: base })).rejects.toThrow(/checksum/);
    await expect(readFile(join(dir, "never-created", "build-admission.json"))).rejects.toThrow();
  });
  it("checks every pinned maintained recipe and exact SDK platform independently", async () => {
    const manifest = JSON.parse(await readFile(resolve("infra/postgres-gosu-backport/sources.json"), "utf8"));
    expect(manifest.gosu.commit).toBe("29b939aa5bd4dc588af765b8248f6e39150d2565");
    expect(manifest.toolchain.version).toBe("go1.27.4");
    expect(manifest.toolchain.platforms.arm64.sha256).toBe("3392582988a273a87ab5043ee1b2c9c17a2c3c00580bf9326c47a2e0aaaeac92");
    expect(manifest.toolchain.platforms.amd64.sha256).toBe("7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840");
    for (const [name, pin] of Object.entries(manifest.recipeFiles)) await expect(verifyPinnedFile(resolve("infra/postgres-gosu-backport", name), pin)).resolves.toBe((pin as { sha256: string }).sha256);
    const recipe = await readFile(resolve("infra/postgres-gosu-backport/build-gosu.sh"), "utf8");
    expect(recipe).not.toContain("GOSU_PLEASE_LET_ME");
    expect(recipe).not.toContain("chmod +s");
    expect(createHash("sha256").update(recipe).digest("hex")).toBe(manifest.recipeFiles["build-gosu.sh"].sha256);
  });
  it("requires a native static ELF rather than trusting compiler text", () => {
    const good = syntheticElf(); expect(() => assertStaticGosuElf(good, "arm64")).not.toThrow();
    expect(() => assertStaticGosuElf(good, "amd64")).toThrow(/architecture/);
    for (const type of [2, 3]) { const dynamic = Buffer.from(good); dynamic.writeUInt32LE(type, 64); expect(() => assertStaticGosuElf(dynamic, "arm64")).toThrow(/dynamic|interpreter/); }
    const corrupt = Buffer.from(good); corrupt.writeBigUInt64LE(999999n, 32); expect(() => assertStaticGosuElf(corrupt, "arm64")).toThrow(/headers/);
  });
  it("admits all five independently hashed artifacts without upgrading release claims", async () => {
    const result = await verifyGosuArtifacts(await fixtureArtifacts(), "arm64");
    expect(result.status).toEqual(status); expect(result.binarySha256).toHaveLength(64);
  });
  it("rejects a replaced actual executable even when the old metadata remains valid", async () => {
    const directory = await fixtureArtifacts(); await writeFile(join(directory, "gosu"), Buffer.alloc(120));
    await expect(verifyGosuArtifacts(directory, "arm64")).rejects.toThrow(/checksum/);
  });
  it("rejects accurate hashes of stale compiler metadata or failed functional status", async () => {
    await expect(verifyGosuArtifacts(await fixtureArtifacts({ "go-metadata.txt": metadata.replace("go1.27.4", "go1.24.6") }), "arm64")).rejects.toThrow(/compiler/);
    await expect(verifyGosuArtifacts(await fixtureArtifacts({ "status.json": JSON.stringify({ ...status, functionalCheckExit: 1 }) }), "arm64")).rejects.toThrow(/check/);
  });
  it.each(["../outside", "gosu", "unexpected.bin"])("rejects escaping, duplicate or unknown artifact %s", async name => {
    const directory = await fixtureArtifacts(); const original = await readFile(join(directory, "ARTIFACTS.sha256"), "utf8");
    await writeFile(join(directory, "ARTIFACTS.sha256"), original + "a".repeat(64) + "  " + name + "\n");
    await expect(verifyGosuArtifacts(directory, "arm64")).rejects.toThrow(/manifest/);
  });
  it("rejects incomplete artifact manifests", async () => {
    const directory = await fixtureArtifacts(); const original = await readFile(join(directory, "ARTIFACTS.sha256"), "utf8");
    await writeFile(join(directory, "ARTIFACTS.sha256"), original.split("\n").slice(0, 3).join("\n"));
    await expect(verifyGosuArtifacts(directory, "arm64")).rejects.toThrow(/Missing/);
  });

  it("rejects accurately hashed notices that omit or truncate the Go standard-library license", async () => {
    const license = await readFile(resolve("infra/postgres-gosu-backport/GO-LICENSE"), "utf8");
    for (const notice of ["module notices only", license.slice(0, -20), license.replace("Copyright 2009 The Go Authors.", "Copyright omitted")]) {
      await expect(verifyGosuArtifacts(await fixtureArtifacts({ "THIRD-PARTY-LICENSES.txt": notice }), "arm64")).rejects.toThrow(/Go.*license/i);
    }
  });

});

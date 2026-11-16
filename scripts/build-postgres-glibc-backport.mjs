import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { runBoundedCommand, verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";

const recipe = fileURLToPath(new URL("../infra/postgres-glibc-backport/", import.meta.url));
const version = "2.36-9+deb12u14";
const sourceNames = [`glibc_${version}.dsc`, "glibc_2.36.orig.tar.xz", `glibc_${version}.debian.tar.xz`];
const fingerprints = ["B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8", "04B54C3CDCA79751B16BC6B5225629DF75B188BD", "4D64FEC119C2029067D6E791F8D2585B8783D481"];
const hash = value => createHash("sha256").update(value).digest("hex");

export function parseArguments(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(["--architecture", "--source-cache", "--output"].includes(args[i]), "Only offline source preparation options are supported.");
    assert.ok(args[i + 1] && !flags[args[i]], "Missing or duplicate option.");
    flags[args[i]] = args[i + 1];
  }
  assert.ok(["amd64", "arm64"].includes(flags["--architecture"]), "Explicit native architecture required.");
  assert.ok(flags["--source-cache"] && flags["--output"], "Source-cache and new output required.");
  return { architecture: flags["--architecture"], sourceCache: resolve(flags["--source-cache"]), output: resolve(flags["--output"]) };
}

export function validateManifest(manifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.baselineVersion, version);
  assert.equal(manifest.privateCandidateVersion, version + "+vivalatax1");
  assert.equal(manifest.upstreamCommit, "839898777226a3ed88c0859f25ffe712519b4ead");
  for (const k of ["candidateReleaseQualified", "genericAbiApproval", "riskAccepted", "authoredBinaryReproductionExecuted"]) assert.equal(manifest[k], false);
  assert.deepEqual(manifest.trustedArchiveFingerprints, fingerprints);
  assert.deepEqual(manifest.sources.map(x => x.name).sort(), [...sourceNames, "InRelease", "Sources.xz"].sort());
  for (const s of manifest.sources) {
    assert.equal(basename(s.name), s.name);
    assert.ok(Number.isSafeInteger(s.bytes) && s.bytes > 0 && s.bytes < 32 * 1024 ** 2);
    assert.match(s.sha256, /^[a-f0-9]{64}$/);
    const url = new URL(s.url);
    assert.equal(url.origin, "https://deb.debian.org");
    const expected = sourceNames.includes(s.name) ? "/debian/pool/main/g/glibc/" + s.name : "/debian/dists/bookworm/" + (s.name === "Sources.xz" ? "main/source/Sources.xz" : "InRelease");
    assert.equal(url.pathname, expected);
    assert.equal(url.search + url.hash, "");
  }
  assert.deepEqual(Object.keys(manifest.recipeFiles).sort(), ["CVE-2026-5450.patch", "upstream-839898777226a3ed88c0859f25ffe712519b4ead.patch", "debian-archive-keys.gpg", "Dockerfile.toolchain", "Dockerfile.packages", "build-packages.sh", "Dockerfile", "install-runtime.sh"].sort());
  for (const [name, p] of Object.entries(manifest.recipeFiles)) {
    assert.equal(basename(name), name);
    assert.ok(Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes < 1024 ** 2);
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
  }
  return manifest;
}

function checksumRows(text) {
  const section = /^Checksums-Sha256:\n((?: [^\n]+\n)+)/m.exec(text);
  assert.ok(section, "Missing signed source checksums.");
  const rows = section[1].trimEnd().split("\n").map(line => {
    const m = /^ ([a-f0-9]{64})\s+([0-9]+) ([A-Za-z0-9_.+~-]+)$/.exec(line);
    assert.ok(m, "Malformed source checksum row.");
    return { sha256: m[1], bytes: Number(m[2]), name: m[3] };
  });
  assert.equal(new Set(rows.map(x => x.name)).size, rows.length, "Duplicate source checksum.");
  return rows;
}

export function assertSignedSourceChain({ release, compressed, index, signatureStatus, sources }) {
  assert.ok(!/\[GNUPG:\] (?:BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG|NO_PUBKEY|FAILURE)\b/.test(signatureStatus), "Invalid or unverified archive signature.");
  const signatures = signatureStatus.split("\n").filter(x => x.startsWith("[GNUPG:] VALIDSIG ")).map(line => {
    const p = line.split(" ");
    assert.ok(p.length === 11 || p.length === 12, "Malformed signature status.");
    const primary = p.length === 12 ? p[11] : p[2];
    const signers = { [fingerprints[0]]: [fingerprints[0], "4CB50190207B4758A3F73A796ED0E7B82643E131"], [fingerprints[1]]: [fingerprints[1], "B8E5F13176D2A7A75220028078DBA3BC47EF2265"], [fingerprints[2]]: [fingerprints[2]] };
    assert.ok(signers[primary]?.includes(p[2]), "Unreviewed signing subkey.");
    return primary;
  });
  assert.deepEqual([...signatures].sort(), [...fingerprints].sort(), "Require exactly the reviewed archive signatures.");
  assert.match(release, /^Codename: bookworm$/m);
  const sections = /^SHA256:\n((?: [^\n]+\n)+)/m.exec(release);
  assert.ok(sections, "Missing signed SHA256 index section.");
  const rows = sections[1].split("\n").map(x => /^ ([a-f0-9]{64})\s+([0-9]+) (.+)$/.exec(x)).filter(x => x && x[3] === "main/source/Sources.xz");
  assert.equal(rows.length, 1, "Exactly one source index pin required.");
  assert.equal(rows[0][1], hash(compressed));
  assert.equal(Number(rows[0][2]), compressed.length);
  const stanzas = index.split(/\n\n+/).filter(x => /^Package: glibc$/m.test(x) && new RegExp("^Version: " + version.replaceAll("+", "\\+").replaceAll(".", "\\.") + "$", "m").test(x));
  assert.equal(stanzas.length, 1, "Exactly one reviewed source version required.");
  assert.match(stanzas[0], /^Directory: pool\/main\/g\/glibc$/m);
  const checks = checksumRows(stanzas[0]);
  assert.deepEqual(checks.map(x => x.name).sort(), [...sourceNames].sort());
  assert.deepEqual([...sources].sort((a, b) => a.name.localeCompare(b.name)), checks.sort((a, b) => a.name.localeCompare(b.name)));
  return { version, sourceFiles: 3, verifiedArchiveSignatures: 3 };
}

export function assertSuiteSummary(text, { requireRegression = true } = {}) {
  const lines = text.trim().split("\n");
  assert.ok(lines.length > 0 && lines.every(x => /^(?:PASS|FAIL|XFAIL|XPASS|UNSUPPORTED|UNRESOLVED|ERROR): \S+$/.test(x)), "Invalid or absent full suite summary.");
  assert.ok(!lines.some(x => /^(?:FAIL|XPASS|UNRESOLVED|ERROR):/.test(x)), "Unexpected full suite result.");
  if (requireRegression) assert.equal(lines.filter(x => x === "PASS: stdio-common/tst-vfscanf-bz34008").length, 1, "Required regression must actually pass once.");
  return true;
}

export function assertQualificationStatus(v) {
  for (const k of ["baselineBuildExit", "candidateBuildExit", "candidateRegressionExit", "abidiffExit"]) assert.equal(v[k], 0, "Missing or failed " + k);
  assert.ok(Number.isInteger(v.baselineRegressionExit) && v.baselineRegressionExit > 0 && v.baselineRegressionExit <= 125, "Paired baseline regression must actually fail ordinarily.");
  for (const k of ["baselineSuiteVerified", "candidateSuiteVerified", "allocatorCheckingVerified"]) assert.equal(v[k], true, "Missing " + k);
  assert.deepEqual(v.consumerExits, [0, 0, 0, 0, 0, 0], "All six consumers required.");
  for (const k of ["genericAbiApproval", "riskAccepted", "candidateReleaseQualified"]) assert.equal(v[k], false);
  return true;
}

export async function createExclusiveContext(output) {
  await mkdir(output, { mode: 0o700 });
  const root = await lstat(output);
  assert.ok(root.isDirectory() && !root.isSymbolicLink() && root.uid === process.getuid() && (root.mode & 0o777) === 0o700);
}

export async function stagePinnedFile(source, destination, pin) {
  await verifyPinnedFile(source, pin);
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  await verifyPinnedFile(destination, pin);
}

export async function prepareBuildContext(options) {
  assert.ok(["arm64", "amd64"].includes(options.architecture));
  const manifestBytes = await readFile(join(recipe, "sources.json"));
  const manifest = validateManifest(JSON.parse(manifestBytes));
  for (const pin of manifest.sources) await verifyPinnedFile(join(options.sourceCache, pin.name), pin);
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) await verifyPinnedFile(join(recipe, name), pin);
  // Exclusive output creation prevents reusing or replacing a previous attempt.
  await createExclusiveContext(options.output);
  const inputs = join(options.output, "inputs");
  await mkdir(inputs, { mode: 0o700 });
  for (const s of manifest.sources) await stagePinnedFile(join(options.sourceCache, s.name), join(inputs, s.name), s);
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) await stagePinnedFile(join(recipe, name), join(["Dockerfile.toolchain", "Dockerfile.packages", "build-packages.sh", "Dockerfile", "install-runtime.sh"].includes(name) ? options.output : inputs, name), pin);
  assert.ok(["darwin", "linux"].includes(process.platform), "Supported local verification tools required.");
  const toolDirectory = process.platform === "darwin" ? "/opt/homebrew/bin" : "/usr/bin";
  const status = await runBoundedCommand(join(toolDirectory, "gpgv"), ["--keyring", join(inputs, "debian-archive-keys.gpg"), "--status-fd", "1", join(inputs, "InRelease")], { env: { PATH: process.env.PATH, LC_ALL: "C" }, timeoutMs: 10_000 });
  const expanded = await runBoundedCommand(join(toolDirectory, "xz"), ["--decompress", "--stdout", join(inputs, "Sources.xz")], { env: { PATH: process.env.PATH, LC_ALL: "C" }, timeoutMs: 10_000 });
  const chain = assertSignedSourceChain({ release: await readFile(join(inputs, "InRelease"), "utf8"), compressed: await readFile(join(inputs, "Sources.xz")), index: expanded.stdout, signatureStatus: status.stdout, sources: manifest.sources.filter(x => sourceNames.includes(x.name)).map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })) });
  await writeFile(join(inputs, "SHA256SUMS"), (await Promise.all((await readdir(inputs)).sort().map(async name => `${hash(await readFile(join(inputs, name)))}  ${name}\n`))).join(""), { flag: "wx", mode: 0o600 });
  const receipt = { sourcePreparationPassed: true, architecture: options.architecture, sourceManifestSha256: hash(manifestBytes), authenticatedSource: chain, runtimeCalls: 0, binaryBuildExecuted: false, binaryRegressionExecuted: false, genericAbiApproval: false, riskAccepted: false, candidateReleaseQualified: false };
  await writeFile(join(options.output, "source-manifest.json"), manifestBytes, { flag: "wx", mode: 0o600 });
  await writeFile(join(options.output, "preparation-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await prepareBuildContext(parseArguments(process.argv.slice(2)))));
}

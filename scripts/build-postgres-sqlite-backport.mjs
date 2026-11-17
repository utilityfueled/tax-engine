// Offline source-context preparation only. This does not start a container or VM.
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { runBoundedCommand, verifyPinnedFile } from "./build-postgres-libxml2-backport.mjs";
export { verifyPinnedFile };
const directory = fileURLToPath(new URL("../infra/postgres-sqlite-backport/", import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const immutableImage = /^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64})$/;
export function parseBuilderArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(["--architecture", "--source-cache", "--output", "--toolchain"].includes(args[i]), "Unknown source builder option.");
    assert.ok(args[i + 1] && !values[args[i]], "Missing or repeated source builder option.");
    values[args[i]] = args[i + 1];
  }
  assert.ok(["arm64", "amd64"].includes(values["--architecture"]), "Choose explicit native arm64 or amd64.");
  assert.match(values["--toolchain"] ?? "", immutableImage, "Require immutable toolchain image.");
  assert.ok(values["--source-cache"] && values["--output"], "Require source-cache and fresh output.");
  return { architecture: values["--architecture"], sourceCache: resolve(values["--source-cache"]), output: resolve(values["--output"]), toolchain: values["--toolchain"] };
}
function checksumEntries(text) {
  const section = /(?:^|\n)Checksums-Sha256:\n((?: [^\n]+\n)+)/.exec(text + "\n");
  assert.ok(section, "Missing source checksums.");
  const records = new Map();
  for (const line of section[1].trimEnd().split("\n")) {
    const entry = /^ ([a-f0-9]{64}) ([0-9]+) ([^/\s]+)$/.exec(line);
    assert.ok(entry && !records.has(entry[3]), "Invalid or duplicate source record.");
    records.set(entry[3], { sha256: entry[1], bytes: Number(entry[2]) });
  }
  return records;
}
export function parseSqliteSourceStanza(text) {
  const records = text.split(/\n\n+/).filter(part => part.startsWith("Package: sqlite3\n"));
  assert.equal(records.length, 1, "Require exactly one SQLite source stanza.");
  const stanza = records[0];
  assert.match(stanza, /\nVersion: 3\.40\.1-2\+deb12u2\n/);
  assert.match(stanza, /\nDirectory: pool\/main\/s\/sqlite3(?:\n|$)/);
  const result = checksumEntries(stanza);
  assert.deepEqual([...result.keys()].sort(), ["sqlite3_3.40.1-2+deb12u2.dsc", "sqlite3_3.40.1.orig-www.tar.xz", "sqlite3_3.40.1.orig.tar.xz", "sqlite3_3.40.1-2+deb12u2.debian.tar.xz"].sort());
  return result;
}
export function assertReleaseSignature(status, fingerprints) {
  const valid = status.split("\n").filter(line => line.startsWith("[GNUPG:] VALIDSIG ")).map(line => line.split(" ")[2]);
  assert.ok(valid.some(value => fingerprints.includes(value)), "Missing valid pinned Bookworm release signing fingerprint.");
  assert.ok(!status.includes("[GNUPG:] BADSIG ") && !status.includes("[GNUPG:] REVKEYSIG ") && !status.includes("[GNUPG:] EXPKEYSIG "), "Invalid release signature status.");
}
export async function verifySourceCache(cache, { run = runBoundedCommand } = {}) {
  const manifest = JSON.parse(await readFile(join(directory, "sources.json")));
  assert.equal(manifest.schemaVersion, 1);
  for (const key of ["candidateReleaseQualified", "genericAbiApproval", "riskAccepted"]) assert.equal(manifest[key], false);
  for (const record of [...manifest.sources, manifest.release, manifest.sourceIndex, manifest.archiveKeyring]) {
    assert.equal(basename(record.name), record.name);
    await verifyPinnedFile(join(cache, record.name), record);
  }
  const signed = await run("gpgv", ["--status-fd", "1", "--keyring", join(cache, manifest.archiveKeyring.name), join(cache, manifest.release.name)], { timeoutMs: 30_000 });
  assertReleaseSignature(signed.stdout, manifest.acceptedReleaseSigningFingerprints);
  const release = await readFile(join(cache, manifest.release.name), "utf8");
  assert.ok(release.split("\n").includes(` ${manifest.sourceIndex.sha256}  ${manifest.sourceIndex.bytes} main/source/Sources.xz`), "Signed release does not bind exact Sources.xz.");
  // xz is an owned bounded local decoder, not an archive extractor or source executor.
  const decoded = await run("xz", ["--decompress", "--stdout", join(cache, manifest.sourceIndex.name)], { timeoutMs: 30_000 });
  const indexed = parseSqliteSourceStanza(decoded.stdout);
  for (const source of manifest.sources) assert.deepEqual(indexed.get(source.name), { sha256: source.sha256, bytes: source.bytes });
  const descriptor = checksumEntries(await readFile(join(cache, manifest.sources[0].name), "utf8"));
  assert.equal(descriptor.size, 3);
  for (const source of manifest.sources.slice(1)) assert.deepEqual(descriptor.get(source.name), { sha256: source.sha256, bytes: source.bytes });
  return manifest;
}
export function assertSqliteChecksPassed(status) {
  for (const key of ["recipeExit", "baselinePackageBuildExit", "candidatePackageBuildExit", "baselineFullTestExit", "candidateFullTestExit", "candidateRegressionExit", "candidateSanitizerRegressionExit"]) assert.equal(status[key], 0, `Required SQLite check ${key} failed or is absent.`);
  assert.equal(status.candidateRegressionCasesPassed, 5, "All five original upstream cases must execute successfully.");
  assert.equal(status.candidateSanitizerRegressionCasesPassed, 5, "All five original upstream cases must execute under sanitizers.");
  assert.equal(status.baselineRegressionReproduced, true, "Vulnerable baseline must positively reproduce the original upstream regression failure.");
  for (const key of ["genericAbiApproval", "candidateReleaseQualified", "riskAccepted"]) assert.equal(status[key], false, "Build success is not qualification or acceptance.");
}
export async function prepareBuildContext(options, { run = runBoundedCommand } = {}) {
  const admitted = parseBuilderArguments(["--architecture", options.architecture, "--source-cache", options.sourceCache, "--output", options.output, "--toolchain", options.toolchain]);
  try { await lstat(admitted.output); assert.fail("Require fresh exclusive output."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const manifest = await verifySourceCache(admitted.sourceCache, { run });
  for (const [name, pin] of Object.entries(manifest.recipeFiles)) { assert.equal(basename(name), name); await verifyPinnedFile(join(directory, name), pin); }
  await mkdir(admitted.output, { mode: 0o700 });
  const context = join(admitted.output, "context"), inputs = join(context, "inputs");
  await mkdir(context, { mode: 0o700 }); await mkdir(inputs, { mode: 0o700 });
  const copies = [...manifest.sources.map(pin => [join(admitted.sourceCache, pin.name), join(inputs, pin.name), pin]), ...Object.entries(manifest.recipeFiles).map(([name, pin]) => [join(directory, name), join(context, name), pin])];
  for (const [source, destination, pin] of copies) { await verifyPinnedFile(source, pin); await copyFile(source, destination, constants.COPYFILE_EXCL); await verifyPinnedFile(destination, pin); }
  await writeFile(join(inputs, "SHA256SUMS"), manifest.sources.map(pin => `${pin.sha256}  ${pin.name}\n`).join(""), { flag: "wx", mode: 0o600 });
  const plan = { sourceOnly: true, daemonCalls: 0, compilationExecuted: false, ...admitted, manifestSha256: sha(await readFile(join(directory, "sources.json"))), commonCompatibilityPrerequisites: manifest.commonCompatibilityPrerequisites, buildArguments: ["build", "--network=none", "--platform=linux/" + admitted.architecture, "--build-arg", "TOOLCHAIN=" + admitted.toolchain, "--build-arg", "EXPECTED_ARCH=" + admitted.architecture, "--file", join(context, "Dockerfile.packages"), context], candidateReleaseQualified: false, genericAbiApproval: false, riskAccepted: false };
  await writeFile(join(admitted.output, "SOURCE-BUILD-PLAN.json"), JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return plan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = await prepareBuildContext(parseBuilderArguments(process.argv.slice(2)));
  console.log(JSON.stringify({ sourceOnly: true, daemonCalls: 0, compilationExecuted: false, manifestSha256: plan.manifestSha256 }));
}

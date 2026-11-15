import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, symlink, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  admitExecution, assertCapacity, boundedTimeout, validateDatabaseListing,
  validatePublicUrl, assertAmdGosu, verifyHandoff, writeHandoff,
  cleanupOwned, publicationAllowed, assertScanBinding, JOB_LIMITS, Controller,
} from "../../scripts/qualify-postgres-backports-amd64.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const sha = "a".repeat(40); const image = "b".repeat(64);
const env = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, GITHUB_RUN_ID: "12", GITHUB_RUN_ATTEMPT: "1", GITHUB_REPOSITORY: "owner/repo", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", RUNNER_ARCH: "X64" };
const event = { repository: { private: false, fork: false, default_branch: "main", full_name: "owner/repo" }, inputs: { source_sha: sha } };
const host = { platform: "linux", arch: "x64", docker: { OSType: "linux", Architecture: "x86_64", DockerRootDir: "/var/lib/docker" }, endpoint: "unix:///var/run/docker.sock", head: sha, trackedUnchanged: true, runningContainers: [] };
const database = { status: "active", schemaVersion: "v6.1.10", built: "2026-11-14T06:19:25Z", path: "vulnerability-db_v6.1.10_2026-11-14T00:20:33Z_1794637165.tar.zst", checksum: "sha256:" + "c".repeat(64) };
async function temp() { const p = await mkdtemp(join(tmpdir(), "tax-amd-")); roots.push(p); return p; }
function elf(machine = 62) { const b = Buffer.alloc(120); b.set([127, 69, 76, 70, 2, 1]); b.writeUInt16LE(machine, 18); b.writeBigUInt64LE(64n, 32); b.writeUInt16LE(56, 54); b.writeUInt16LE(1, 56); b.writeUInt32LE(1, 64); return b; }
const metadata = "gosu: go1.27.4\n\tpath\tgithub.com/tianon/gosu\n\tmod\tgithub.com/tianon/gosu\t(devel)\n\tdep\tgithub.com/moby/sys/user\tv0.4.1\th1:RgjRlaDKi/Xmyrz4t8lyzXT6v2ooFeO/7xtchmhVWE0=\n\tdep\tgolang.org/x/sys\tv0.1.0\th1:kunALQeHf1/185U1i0GOB/fy1IPRDDpuoOOqRReG57U=\n\tbuild\tCGO_ENABLED=0\n\tbuild\tGOOS=linux\n\tbuild\tGOARCH=amd64\n";

describe("native AMD PostgreSQL infrastructure spec", () => {
  it("rejects private fork remote emulated or mismatched execution", () => {
    expect(() => admitExecution(env, event, host)).not.toThrow();
    for (const e of [{ ...env, RUNNER_ENVIRONMENT: "self-hosted" }, { ...env, RUNNER_ARCH: "ARM64" }, { ...env, GITHUB_EVENT_NAME: "push" }, { ...env, GITHUB_REF: "refs/heads/topic" }]) expect(() => admitExecution(e, event, host)).toThrow();
    for (const repository of [{ ...event.repository, private: true }, { ...event.repository, fork: true }, { ...event.repository, full_name: "other/repo" }]) expect(() => admitExecution(env, { ...event, repository }, host)).toThrow();
    for (const h of [{ ...host, arch: "arm64" }, { ...host, endpoint: "tcp://localhost:2375" }, { ...host, head: "d".repeat(40) }, { ...host, trackedUnchanged: false }, { ...host, runningContainers: ["foreign"] }, { ...host, docker: { ...host.docker, Architecture: "arm64" } }]) expect(() => admitExecution(env, event, h)).toThrow();
  });
  it("requires actual capacity and preserves cleanup time", () => {
    const gib = 1024 ** 3;
    expect(() => assertCapacity("package", 20 * gib, 20 * gib)).not.toThrow();
    expect(() => assertCapacity("package", 20 * gib - 1, 30 * gib)).toThrow(/capacity/);
    expect(() => assertCapacity("runtime", 20 * gib, 12 * gib - 1)).toThrow(/capacity/);
    expect(() => assertCapacity("independent", 9 * gib, 9 * gib)).not.toThrow();
    expect(boundedTimeout(10000, 9000, 2000, false, 1000)).toBe(7000);
    expect(boundedTimeout(10000, 9000, 2000, true, 1000)).toBe(9000);
    expect(() => boundedTimeout(10000, 9000, 2000, false, 8000)).toThrow(/deadline/);
    expect(Object.values(JOB_LIMITS).reduce((a: number, b: { minutes: number }) => a + b.minutes, 0)).toBeLessThanOrEqual(270);
  });
  it("rejects stale database altered inputs and unapproved download hosts", () => {
    expect(validateDatabaseListing(database, Date.parse("2026-11-15T00:00:00Z")).checksum).toBe(database.checksum);
    for (const v of [{ ...database, built: "2026-01-01" }, { ...database, checksum: "sha256:bad" }, { ...database, path: "../db.tar.zst" }, { ...database, status: "deprecated" }, { ...database, built: "2027-01-01" }]) expect(() => validateDatabaseListing(v, Date.parse("2026-11-15T00:00:00Z"))).toThrow();
    expect(() => validatePublicUrl("https://go.dev/dl/go1.27.4.linux-amd64.tar.gz")).not.toThrow();
    for (const u of ["http://go.dev/dl/file", "https://user:secret@go.dev/dl/file", "https://go.dev.evil.invalid/file", "https://127.0.0.1/file", "https://go.dev/dl/file?token=private"]) expect(() => validatePublicUrl(u)).toThrow();
  });
  it("rejects ARM binaries dynamic headers and mismatched AMD metadata", () => {
    expect(() => assertAmdGosu(elf(), metadata)).not.toThrow();
    expect(() => assertAmdGosu(elf(183), metadata)).toThrow(/architecture/);
    expect(() => assertAmdGosu(elf(), metadata.replace("GOARCH=amd64", "GOARCH=arm64"))).toThrow(/metadata/);
    for (const type of [2, 3]) { const b = elf(); b.writeUInt32LE(type, 64); expect(() => assertAmdGosu(b, metadata)).toThrow(/dynamic|interpreter/); }
  });
  it("rejects changed aliased escaping or foreign handoff artifacts", async () => {
    const dir = await temp(); await writeFile(join(dir, "candidate.tar"), "synthetic public archive");
    const identity = { source: sha, runId: "12", attempt: "1", kind: "package", image };
    await writeFile(join(dir, "source-manifest.json"), "{}");
    await writeFile(join(dir, "build-receipt.json"), JSON.stringify({ candidateImage: image, success: true, architecture: "amd64", cleanupErrors: [], deadlineExceeded: false, sourceManifestSha256: createHash("sha256").update("{}").digest("hex"), candidateReleaseQualified: false, riskAccepted: false }));
    await writeFile(join(dir, "result.json"), JSON.stringify({ ...identity, passed: true, failure: false, cleanupErrors: [], deadlineExceeded: false, candidateReleaseQualified: false, riskAccepted: false }));
    await writeHandoff(dir, identity, ["candidate.tar", "source-manifest.json", "build-receipt.json", "result.json"]);
    expect((await verifyHandoff(dir, identity)).image).toBe(image);
    await writeFile(join(dir, "candidate.tar"), "different archive"); await expect(verifyHandoff(dir, identity)).rejects.toThrow(/length|hash/);
    await writeFile(join(dir, "candidate.tar"), "synthetic public archive");
    await expect(verifyHandoff(dir, { ...identity, source: "e".repeat(40) })).rejects.toThrow(/identity/);
    await writeFile(join(dir, "credentials.env"), "secret"); await expect(verifyHandoff(dir, identity)).rejects.toThrow(/extra|allowlist/);
    await rm(join(dir, "credentials.env")); await rm(join(dir, "candidate.tar")); const outside = join(await temp(), "archive"); await writeFile(outside, "synthetic public archive"); await symlink(outside, join(dir, "candidate.tar")); await expect(verifyHandoff(dir, identity)).rejects.toThrow(/alias|regular/);
    const manifest = JSON.parse(await readFile(join(dir, "handoff.json"), "utf8")); manifest.files[0].name = "../outside"; await writeFile(join(dir, "handoff.json"), JSON.stringify(manifest)); await expect(verifyHandoff(dir, identity)).rejects.toThrow(/allowlist|leaf/);
  });
  it("cleans only verified owned stopped resources and retains failures", async () => {
    const removed: string[] = [];
    const io = { list: async () => [{ id: "mine", operation: "op", running: true }, { id: "foreign", operation: "else", running: false }], stop: async (id: string) => { removed.push("stop:" + id); }, inspect: async (id: string) => ({ id, operation: "op", running: false, exitCode: 0, oomKilled: false }), remove: async (id: string) => { removed.push("remove:" + id); } };
    await expect(cleanupOwned(io, "op")).resolves.toEqual([]); expect(removed).toEqual(["stop:mine", "remove:mine"]);
    removed.length = 0; await expect(cleanupOwned({ ...io, inspect: async (id: string) => ({ id, operation: "foreign", running: false }) }, "op")).resolves.toEqual(["owned-container-cleanup"]); expect(removed).toEqual(["stop:mine"]);
    removed.length = 0; await expect(cleanupOwned({ ...io, stop: async () => { throw new Error("normal stop failed"); } }, "op")).resolves.toEqual(["owned-container-cleanup"]); expect(removed).toEqual([]);
    removed.length = 0; await expect(cleanupOwned({ ...io, inspect: async (id: string) => ({ id, operation: "op", running: false, exitCode: 137 }) }, "op")).resolves.toEqual(["owned-container-cleanup"]); expect(removed).toEqual(["stop:mine"]);
    for (const state of [{ exitCode: -1, oomKilled: false }, { exitCode: 134, oomKilled: false }, { exitCode: 139, oomKilled: false }, { exitCode: 0, oomKilled: true }, { exitCode: 0 }, { exitCode: true, oomKilled: false }]) {
      removed.length = 0; await expect(cleanupOwned({ ...io, inspect: async (id: string) => ({ id, operation: "op", running: false, ...state }) }, "op")).resolves.toEqual(["owned-container-cleanup"]); expect(removed).toEqual(["stop:mine"]);
    }
    removed.length = 0; await expect(cleanupOwned({ ...io, inspect: async (id: string) => ({ id, operation: "op", running: false, exitCode: 42, oomKilled: false }) }, "op")).resolves.toEqual([]); expect(removed).toEqual(["stop:mine", "remove:mine"]);
  });
  it("stops all later daemon commands when closure becomes uncertain during cleanup", async () => {
    const c = new Controller("runtime", await temp(), undefined, env); c.connection = { args: [] }; c.commandEnv = {}; c.volumes = ["own-volume"];
    const steps: string[] = [];
    c.command = async (step: string) => {
      steps.push(step);
      if (step.includes("normal-stop")) { c.unconfirmedChild = true; throw new Error("uncertain own child"); }
      if (step.includes("containers")) return "mine-a\nmine-b\n";
      if (step.includes("container-inspect")) return JSON.stringify([{ Config: { Labels: { "io.vivalatax.qualification.operation": c.operation } }, State: { Running: true } }]);
      if (step.includes("volume-inspect")) return JSON.stringify([{ Labels: { "io.vivalatax.qualification.operation": c.operation } }]);
      return "";
    };
    await c.cleanup();
    const index = steps.findIndex(step => step.includes("normal-stop")); expect(index).toBeGreaterThan(-1);
    expect(steps.slice(index + 1)).toEqual([]);
    expect(c.cleanupErrors).toContain("owned-container-cleanup");
  });
  it("retains daemon uncertainty after an explicitly terminated local child was reaped", async () => {
    const c = new Controller("runtime", await temp(), undefined, env); await mkdir(c.private); c.commandEnv = { PATH: process.env.PATH };
    await expect(c.command("bounded-owned-child", process.execPath, ["-e", "setInterval(() => {}, 1000)"], 25)).rejects.toThrow();
    expect(c.unconfirmedChild).toBe(true);
    await expect(c.command("must-not-start", process.execPath, ["-e", "process.exit(0)"], 1000)).rejects.toThrow(/uncertain|unconfirmed/);
    await expect(readFile(join(c.private, "must-not-start.stdout"))).rejects.toThrow();
  });
  it("holds any actual signal exit while retaining numeric failure semantics", async () => {
    const c = new Controller("runtime", await temp(), undefined, env); await mkdir(c.private); c.commandEnv = { PATH: process.env.PATH };
    await expect(c.command("ordinary-failure", process.execPath, ["-e", "process.exit(9)"], 1000)).rejects.toThrow();
    expect(c.unconfirmedChild).not.toBe(true);
    await expect(c.command("hangup", process.execPath, ["-e", "process.kill(process.pid, 'SIGHUP')"], 1000)).rejects.toThrow();
    expect(c.unconfirmedChild).toBe(true);
    await expect(c.command("after-hangup", process.execPath, ["-e", "process.exit(0)"], 1000)).rejects.toThrow(/uncertain|unconfirmed/);
    await expect(readFile(join(c.private, "after-hangup.stdout"))).rejects.toThrow();
  });
  it("retains failed builder custody and never mistakes attached Docker success for workload success", async () => {
    const root = await temp(); const c = new Controller("runtime", root, undefined, env); await mkdir(c.public); await mkdir(c.private);
    const output = join(root, "builder"); await mkdir(output);
    const operation = "12345678-1234-1234-1234-123456789abc";
    await writeFile(join(output, "build-receipt.json"), JSON.stringify({ operation, success: false, cleanupErrors: [], architecture: "amd64", candidateReleaseQualified: false, riskAccepted: false }));
    c.command = async () => { throw new Error("failed build"); };
    await expect(c.builder("fixture-builder", output, [], 1000)).rejects.toThrow("failed build");
    expect(c.builderOperation).toBe(operation); expect(JSON.parse(await readFile(join(c.public, "build-receipt.json"), "utf8")).success).toBe(false);
    const utility = new Controller("runtime", root, undefined, env);
    utility.docker = async (step: string) => step.endsWith("-inspect") ? JSON.stringify([{ Config: { Labels: { "io.vivalatax.qualification.operation": utility.operation } }, Image: "sha256:" + image, State: { Running: false, ExitCode: 9 } }]) : "";
    await expect(utility.utility("fixture", image, "false")).rejects.toThrow();
  });
  it("holds unknown builder children and writes a failed fixed-schema result after cleanup", async () => {
    const root = await temp(); const c = new Controller("package", join(root, "out"), undefined, env);
    c.initialize = async () => { await mkdir(c.output); await mkdir(c.private); await mkdir(c.public); };
    c.packageBuild = async () => { await c.builder("no-receipt", join(root, "absent"), [], 1000); };
    c.command = async () => { throw new Error("raw generated-secret must stay private"); };
    c.cleanup = async () => { expect(c.unconfirmedChild).toBe(true); c.cleanupErrors.push("unconfirmed-owned-child"); };
    await expect(c.run()).resolves.toBe(false);
    const raw = await readFile(join(c.public, "result.json"), "utf8"); expect(raw).not.toContain("generated-secret");
    expect(JSON.parse(raw)).toMatchObject({ passed: false, failure: true, cleanupErrors: ["unconfirmed-owned-child"], riskAccepted: false });
    await expect(readFile(join(c.public, "handoff.json"))).rejects.toThrow();
  });
  it("reads actual archive bytes and rejects a correctly hashed foreign architecture", async () => {
    const root = await temp(); const c = new Controller("independent", root, undefined, env); await mkdir(c.private);
    c.commandEnv = { PATH: process.env.PATH };
    const makeArchive = async (architecture: string) => {
      const config = JSON.stringify({ os: "linux", architecture, rootfs: { diff_ids: [] } });
      const digest = createHash("sha256").update(config).digest("hex"); const file = join(root, architecture + ".tar");
      await promisify(execFile)("python3", ["-c", "import sys,tarfile,io,json\np,config,digest=sys.argv[1:]\nwith tarfile.open(p,'x') as t:\n for name,raw in [('manifest.json',json.dumps([{'Config':digest+'.json','Layers':[]}]).encode()),(digest+'.json',config.encode())]:\n  m=tarfile.TarInfo(name);m.size=len(raw);t.addfile(m,io.BytesIO(raw))", file, config, digest]);
      return { file, digest };
    };
    const good = await makeArchive("amd64"); expect(await c.archiveIdentity(good.file, good.digest)).toEqual({ image: good.digest, layers: [] });
    const foreign = await makeArchive("arm64"); await expect(c.archiveIdentity(foreign.file, foreign.digest)).rejects.toThrow();
    await expect(c.archiveIdentity(good.file, "f".repeat(64))).rejects.toThrow();
  });
  it("publishes an explicit allowlist and never upgrades retained findings", () => {
    for (const name of ["result.json", "candidate.tar", "runtime-image.cdx.json", "runtime-scan.json", "build-receipt.json"]) expect(publicationAllowed(name)).toBe(true);
    for (const name of ["database.env", "recovery.dump", "runtime.stdout", "context.tar", "CVE-2026-6653.patch", "../candidate.tar", "unknown.json"]) expect(publicationAllowed(name)).toBe(false);
    const binding = { image, source: sha, archiveSha256: "c".repeat(64), manifestDigest: "sha256:" + "d".repeat(64), imageId: "sha256:" + image };
    const sbom = { bomFormat: "CycloneDX", metadata: { component: { name: "/public/candidate.tar", type: "container", version: binding.manifestDigest, "bom-ref": binding.imageId }, tools: { components: [{ name: "syft", version: "1.57.1" }] } } };
    const configuration = { ignore: [], "match-upstream-kernel-headers": true, "include-matcher-suppressions": true };
    const scan = { descriptor: { name: "grype", version: "0.121.3", configuration }, source: { type: "image", target: { userInput: "/public/candidate.tar", manifestDigest: binding.manifestDigest, imageID: binding.imageId } }, matches: [{ vulnerability: { severity: "Critical" } }] };
    expect(assertScanBinding(sbom, scan, binding, "/public/candidate.tar")).toMatchObject({ scanCompleted: true, critical: 1, riskAccepted: false, candidateReleaseQualified: false });
    for (const config of [{ ...configuration, ignore: [{ package: { name: "linux-libc-dev" } }] }, { ...configuration, "match-upstream-kernel-headers": false }, { ...configuration, "include-matcher-suppressions": false }, {}]) {
      expect(() => assertScanBinding(sbom, { ...scan, descriptor: { ...scan.descriptor, configuration: config } }, binding, "/public/candidate.tar")).toThrow();
    }
    const withIgnored = { ...scan, ignoredMatches: [{ vulnerability: { severity: "Critical" }, appliedIgnoreRules: [{ reason: "retained synthetic evidence" }] }] };
    const raw = JSON.stringify(withIgnored);
    expect(assertScanBinding(sbom, withIgnored, binding, "/public/candidate.tar")).toMatchObject({ critical: 1, ignoredMatches: 1, ignoredCritical: 1, riskAccepted: false });
    expect(JSON.stringify(withIgnored)).toBe(raw);
    expect(() => assertScanBinding(sbom, { ...scan, source: { ...scan.source, target: { ...scan.source.target, imageID: "wrong" } } }, binding, "/public/candidate.tar")).toThrow();
    const opaque = "484ac24617c9bb96";
    const opaqueResult = assertScanBinding({ ...sbom, metadata: { ...sbom.metadata, component: { ...sbom.metadata.component, "bom-ref": opaque } } }, { ...scan, source: { ...scan.source, target: { ...scan.source.target, imageID: opaque } } }, { ...binding, imageId: opaque }, "/public/candidate.tar");
    expect(opaqueResult.critical).toBe(1);
  });
  it("binds every spec line and keeps workflow opt-in and public only", async () => {
    const spec = parse(await readFile(resolve("spec/federal/postgres-backports-amd64.yaml"), "utf8")); expect(spec.lines.length).toBe(11);
    type Job = { "runs-on": string; "timeout-minutes": number; if: string; permissions: Record<string, string>; steps: { uses?: string }[] };
    const workflow = parse(await readFile(resolve(".github/workflows/postgres-backports-amd64.yml"), "utf8")) as { on: Record<string, unknown>; jobs: Record<string, Job> }; expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.values(workflow.jobs).reduce((a: number, j: Job) => a + j["timeout-minutes"], 0)).toBeLessThanOrEqual(270);
    for (const job of Object.values(workflow.jobs)) { expect(job["runs-on"]).toBe("ubuntu-24.04"); expect(job.if).toContain("repository.private == false"); expect(job.permissions).toEqual({ contents: "read" }); for (const step of job.steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/); }
  });
});

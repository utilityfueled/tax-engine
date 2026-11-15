import assert from "node:assert/strict";
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
  it("removes owned images explicitly while preserving imported bases and foreign ancestors", async () => {
    // Model Docker's documented default: removing an image also prunes unused,
    // untagged ancestors unless --no-prune is passed. No daemon is contacted.
    const label = "io.vivalatax.qualification.operation";
    const candidate = "c".repeat(64), imported = "d".repeat(64), foreign = "f".repeat(64);
    for (const mode of ["runtime", "package", "independent", "missing-import", "daemon-error", "foreign-import", "remove-conflict"]) {
      const c = new Controller(mode === "package" ? "package" : mode === "independent" ? "independent" : "runtime", await temp(), undefined, env);
      c.connection = { args: [] }; c.commandEnv = {}; c.candidate = candidate; c.preBuildImageIds = new Set([imported, foreign]);
      c.builderOperation = mode === "independent" ? undefined : "builder";
      if (mode !== "package") { c.imported = mode === "independent" ? candidate : imported; c.importedOperation = "import"; }
      const nodes = new Map<string, { parent: string | null; operation: string }>([
        [foreign, { parent: null, operation: "foreign" }],
        [imported, { parent: foreign, operation: "import" }],
        [candidate, { parent: imported, operation: mode === "independent" ? "import" : "builder" }],
      ]);
      if (mode === "missing-import") nodes.delete(imported);
      const explicit: string[] = [], implicit: string[] = [], events: string[] = [];
      c.docker = async (_step: string, args: string[]) => {
        if (args[0] === "ps") return "";
        expect(args[0]).toBe("image"); const rawId = args.at(-1); if (!rawId) throw new Error("Missing image argument"); const id = rawId.replace(/^sha256:/, "");
        events.push(args[1] + ":" + id);
        if (args[1] === "inspect") {
          if (id === imported && mode === "daemon-error") throw Object.assign(new Error("Cannot connect to daemon"), { code: 1 });
          const node = nodes.get(id); if (!node) throw Object.assign(new Error("No such image: sha256:" + id), { code: 1 });
          return JSON.stringify([{ Id: "sha256:" + id, Parent: node.parent ? "sha256:" + node.parent : "", Os: "linux", Architecture: "amd64", RepoTags: [], RepoDigests: [], Config: { Labels: { [label]: id === imported && mode === "foreign-import" ? "foreign" : node.operation } } }]);
        }
        expect(args[1]).toBe("rm"); expect(args).not.toContain("--force"); expect(args).not.toContain("-f");
        if (mode === "remove-conflict") throw Object.assign(new Error("image is being used by running container"), { code: 1 });
        const node = nodes.get(id); if (!node) throw new Error("Missing removal target");
        let parent = node.parent; nodes.delete(id); explicit.push(id);
        if (!args.includes("--no-prune")) while (parent && nodes.has(parent)) {
          const ancestor = nodes.get(parent); if (!ancestor) throw new Error("Missing ancestor");
          const next = ancestor.parent; implicit.push(parent); nodes.delete(parent); parent = next;
        }
        if (id === candidate && mode === "runtime") expect(nodes.has(imported)).toBe(true);
        return "Deleted: sha256:" + id + "\n";
      };
      await c.cleanup();
      expect(implicit, mode).toEqual([]); expect(nodes.has(foreign), mode).toBe(true);
      if (["runtime", "package", "independent"].includes(mode)) {
        expect(c.cleanupErrors, mode).toEqual([]);
        expect(explicit, mode).toEqual(mode === "runtime" ? [candidate, imported] : [candidate]);
        expect(events, mode).toEqual([...(mode === "runtime" ? ["inspect:" + candidate] : []), ...(mode === "runtime" ? [candidate, imported] : [candidate]).flatMap(id => ["inspect:" + id, "rm:" + id])]);
      } else {
        expect(c.cleanupErrors, mode).toEqual([mode === "remove-conflict" ? "owned-image-cleanup" : "imported-image-cleanup"]);
        expect(explicit, mode).toEqual(mode === "remove-conflict" ? [] : [candidate]);
      }
    }
  });
  it("closes new legacy intermediate chains without touching foreign ancestors", async () => {
    const label='io.vivalatax.qualification.operation';const ids={foreign:'a'.repeat(64),base:'b'.repeat(64),middle:'c'.repeat(64),candidate:'d'.repeat(64),other:'e'.repeat(64)};
    const scenarios=['normal','absent-inherited-label','current-operation-middle','direct-parent','foreign-label','preexisting-middle','cycle','empty-parent','malformed-parent','missing-middle','wrong-id','arm64','linux-mismatch','tagged-middle','digest-reference','container-reference','new-container-reference','foreign-dependent-child','changed-parent-on-reinspect','changed-label-on-reinspect','new-tag-on-reinspect','remove-conflict','uncertain-inspect','uncertain-remove','missing-prebuild','prebuild-base-absent','over64'];const result=[];
    for(const scenario of scenarios){
     const c=new Controller('runtime','/private/tmp/never-created-amd-second-cleanup',undefined,{});c.connection={args:[]};c.commandEnv={};c.builderOperation='builder';c.candidate=ids.candidate;c.imported=ids.base;c.importedOperation='import';c.preBuildImageIds=new Set([ids.foreign,ids.base]);
     const nodes=new Map<string, { parent: string | null; operation: string | undefined }>([[ids.foreign,{parent:null,operation:'foreign'}],[ids.base,{parent:ids.foreign,operation:'import'}],[ids.middle,{parent:ids.base,operation:scenario==='absent-inherited-label'?undefined:scenario==='current-operation-middle'?'builder':'import'}],[ids.candidate,{parent:scenario==='direct-parent'?ids.base:ids.middle,operation:'builder'}]]);
     if(scenario==='direct-parent')nodes.delete(ids.middle);
     if(scenario==='foreign-label')nodes.get(ids.middle)!.operation='foreign';if(scenario==='preexisting-middle')c.preBuildImageIds.add(ids.middle);if(scenario==='cycle')nodes.get(ids.middle)!.parent=ids.candidate;if(scenario==='empty-parent')nodes.get(ids.middle)!.parent=null;if(scenario==='malformed-parent')nodes.get(ids.middle)!.parent='bad';if(scenario==='missing-middle')nodes.delete(ids.middle);if(scenario==='foreign-dependent-child')nodes.set(ids.other,{parent:ids.middle,operation:'foreign'});if(scenario==='missing-prebuild')delete c.preBuildImageIds;if(scenario==='prebuild-base-absent')c.preBuildImageIds.delete(ids.base);
     if(scenario==='over64'){let child=ids.candidate;for(let i=1;i<66;i++){const id=i.toString(16).padStart(64,'0');nodes.set(id,{parent:ids.base,operation:'import'});nodes.get(child)!.parent=id;child=id;}}
     const events: string[][]=[],removed: string[]=[];let inspectMiddle=0;
     c.docker=async(step: string,args: string[])=>{
      assert.ok(!c.unconfirmedChild,'global unknown guard');events.push([step,...args]);
      if(args[0]==='ps')return (step.includes('lineage-containers')&&scenario==='container-reference'||step.includes('intermediate-containers')&&scenario==='new-container-reference')?'foreign-container\n':'';
      assert.equal(args[0],'image');const id=args.at(-1).replace(/^sha256:/,'');const n=nodes.get(id);assert.ok(n,'missingimage');
      if(args[1]==='inspect'){
       if(id===ids.middle)inspectMiddle++;
       if(id===ids.middle&&scenario==='uncertain-inspect'){c.unconfirmedChild=true;throw new Error('uncertain');}
       return JSON.stringify([{Id:'sha256:'+(id===ids.middle&&scenario==='wrong-id'?ids.other:id),Parent:n.parent?'sha256:'+(id===ids.middle&&inspectMiddle>1&&scenario==='changed-parent-on-reinspect'?ids.foreign:n.parent):'',Os:id===ids.middle&&scenario==='linux-mismatch'?'other':'linux',Architecture:id===ids.middle&&scenario==='arm64'?'arm64':'amd64',RepoTags:id===ids.middle&&(scenario==='tagged-middle'||inspectMiddle>1&&scenario==='new-tag-on-reinspect')?['foreign:tag']:[],RepoDigests:id===ids.middle&&scenario==='digest-reference'?['foreign@sha256:'+ids.other]:[],Config:{Labels:{[label]:id===ids.middle&&inspectMiddle>1&&scenario==='changed-label-on-reinspect'?'foreign':n.operation}}}]);
      }
      assert.equal(args[1],'rm');assert.ok(args.includes('--no-prune'));assert.ok(!args.includes('--force'));
      if(id===ids.middle&&scenario==='uncertain-remove'){c.unconfirmedChild=true;throw new Error('uncertain');}
      if(id===ids.middle&&['remove-conflict','new-container-reference'].includes(scenario))throw new Error('container conflict');
      if([...nodes.values()].some(x=>x.parent===id))throw new Error('dependent child hardconflict');nodes.delete(id);removed.push(id);return '';
     };
     await c.cleanup();assert.ok(nodes.has(ids.foreign),'foreign ancestor preserved');if(scenario==='new-container-reference'){assert.equal(events.filter(x=>x[0].includes('intermediate-containers')).length,1);assert.equal(events.filter(x=>x[0].includes('intermediate-remove')).length,0);}
     const positive=['normal','absent-inherited-label','current-operation-middle','direct-parent'].includes(scenario);
     if(positive){assert.deepEqual(c.cleanupErrors,[]);assert.deepEqual(removed,scenario==='direct-parent'?[ids.candidate,ids.base]:[ids.candidate,ids.middle,ids.base]);}
     else{assert.ok(c.cleanupErrors.length>0);assert.ok(nodes.has(ids.base),'base retained after ambiguity');if(scenario.includes('uncertain')){const i=events.findIndex(x=>x[0].includes(scenario==='uncertain-inspect'?'lineage-inspect':'intermediate-remove')&&x.at(-1)==='sha256:'+ids.middle);assert.ok(i>=0);assert.deepEqual(events.slice(i+1),[]);}}
     result.push({scenario,passed:true,cleanupErrors:c.cleanupErrors,removed});
    }
    for (const hasBase of [true,false]) {
     const c=new Controller('runtime','/private/tmp/never-created-amd-snapshot',undefined,{});c.connection={args:[]};c.commandEnv={};c.loadInput=async()=>({image:ids.base});c.sources=async()=>({cache:'/private/tmp/never-read'});let builds=0;const calls: string[][]=[];
     c.docker=async(step: string,args: string[])=>{calls.push([step,...args]);assert.equal(step,'before-gosu-build-images');return (hasBase?[ids.foreign,ids.base]:[ids.foreign]).map(x=>'sha256:'+x).join('\n')+'\n';};
     c.builder=async()=>{builds++;throw new Error('probe-stops-before-build');};
     await assert.rejects(c.runtimeBuild(),hasBase?/probe-stops-before-build/:/Imported base disappeared/);assert.equal(builds,hasBase?1:0);assert.deepEqual([...c.preBuildImageIds],hasBase?[ids.foreign,ids.base]:[ids.foreign]);assert.deepEqual(calls[0],['before-gosu-build-images','image','ls','--all','--quiet','--no-trunc']);result.push({scenario:hasBase?'actual-runtime-prebuild-snapshot':'prebuild-snapshot-missing-base',passed:true});
    }
    expect(result).toHaveLength(29);
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
    const spec = parse(await readFile(resolve("spec/federal/postgres-backports-amd64.yaml"), "utf8")); expect(spec.lines.length).toBe(12);
    type Job = { "runs-on": string; "timeout-minutes": number; if: string; permissions: Record<string, string>; steps: { uses?: string }[] };
    const workflow = parse(await readFile(resolve(".github/workflows/postgres-backports-amd64.yml"), "utf8")) as { on: Record<string, unknown>; jobs: Record<string, Job> }; expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.values(workflow.jobs).reduce((a: number, j: Job) => a + j["timeout-minutes"], 0)).toBeLessThanOrEqual(270);
    for (const job of Object.values(workflow.jobs)) { expect(job["runs-on"]).toBe("ubuntu-24.04"); expect(job.if).toContain("repository.private == false"); expect(job.permissions).toEqual({ contents: "read" }); for (const step of job.steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/); }
  });
});

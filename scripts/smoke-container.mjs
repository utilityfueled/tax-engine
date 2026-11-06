import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { resolveLocalContainerRuntime } from "./local-container-runtime.mjs";

const image = process.argv[2] || "tax-engine:ci";
const runtime = process.env.TAX_ENGINE_CONTAINER_RUNTIME || "docker";
if (!["docker", "podman"].includes(runtime)) throw new Error("Choose docker or podman for TAX_ENGINE_CONTAINER_RUNTIME.");
const connection = resolveLocalContainerRuntime(runtime);
const docker = (...args) => execFileSync(runtime, [...connection.args, ...args], { encoding: "utf8", env: connection.env }).trim();
const container = docker("run", "--detach", "--read-only", "--cap-drop", "ALL",
  "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
  "--tmpfs", "/app/apps/web/.next/cache:rw,noexec,nosuid,nodev,size=64m,mode=1777",
  "--publish", "127.0.0.1::3000", "--env", "TAX_ENGINE_DEPLOYMENT_MODE=self-host", image);
try {
  const metadata = JSON.parse(docker("inspect", container))[0];
  assert.equal(metadata.HostConfig.ReadonlyRootfs, true);
  assert.ok(metadata.Config.Healthcheck?.Test?.length, "Runtime image must retain the Dockerfile health check.");
  const port = docker("port", container, "3000/tcp").split(":").at(-1);
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${origin}/api/health`, { signal: globalThis.AbortSignal.timeout(5_000) })).ok; } catch { /* starting */ }
    if (ready) break;
    await delay(1_000);
  }
  if (!ready) throw new Error("Container failed its liveness probe.");
  for (const asset of ["/", "/brand/logo.png", "/fonts/ibm-plex-mono-latin-400.woff2"]) {
    const response = await fetch(origin + asset, { signal: globalThis.AbortSignal.timeout(5_000) });
    if (!response.ok || (await response.arrayBuffer()).byteLength === 0) throw new Error(`Missing container asset: ${asset}`);
  }
  const optimizedImage = await fetch(`${origin}/_next/image?url=%2Fbrand%2Flogo.png&w=640&q=75`, {
    signal: globalThis.AbortSignal.timeout(5_000),
  });
  assert.ok(optimizedImage.ok && optimizedImage.headers.get("content-type")?.startsWith("image/"), "Image optimization must serve the actual public asset.");
  assert.ok((await optimizedImage.arrayBuffer()).byteLength > 0);
  let imageCacheWritten = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    imageCacheWritten = docker("exec", container, "node", "-e", `
      const fs = require('node:fs');
      const directory = '/app/apps/web/.next/cache/images';
      const path = require('node:path');
      console.log(fs.existsSync(directory) && fs.readdirSync(directory, {recursive: true, withFileTypes: true})
        .some(entry => entry.isFile() && fs.statSync(path.join(entry.parentPath, entry.name)).size > 0));
    `) === "true";
    if (imageCacheWritten) break;
    await delay(100);
  }
  assert.ok(imageCacheWritten, "The non-root image optimizer must write its bounded cache on a read-only runtime.");
  docker("exec", container, "node", "-e", "require('node:fs').accessSync('/app/forms/blank/2025/f1040.pdf')");
  const processEvidence = JSON.parse(docker("exec", container, "node", "-e", `
    const fs = require('node:fs');
    const { execFileSync } = require('node:child_process');
    const packageFormat = '-f=' + '$' + '{binary:Package}' + String.fromCharCode(9) + '$' + '{Version}' + String.fromCharCode(9) + '$' + '{db:Status-Status}' + String.fromCharCode(10);
    const packageRows = execFileSync('/usr/bin/dpkg-query', ['-W', packageFormat], { encoding: 'utf8' })
      .trim().split(String.fromCharCode(10)).map(row => row.split(String.fromCharCode(9)));
    const installedPackages = new Set(packageRows.filter(([, , status]) => status === 'installed').map(([name]) => name.split(':')[0]));
    console.log(JSON.stringify({ uid: process.getuid(), node: process.version, undici: process.versions.undici, architecture: process.arch,
      debianPackages: packageRows,
      aptPackageRecords: packageRows.map(([name]) => name).filter(name => /^(?:apt|libapt-pkg7[.]0)(?::|$)/u.test(name)),
      aptBinaries: ['apt', 'apt-cache', 'apt-cdrom', 'apt-config', 'apt-get', 'apt-mark'].filter(name => fs.existsSync('/usr/bin/' + name)),
      aptLibraries: fs.readdirSync('/usr/lib', { recursive: true }).filter(name => /^libapt.*[.]so(?:[.]|$)/u.test(name.split('/').at(-1))),
      dpkgAudit: execFileSync('/usr/bin/dpkg', ['--audit'], { encoding: 'utf8' }).trim(),
      corePackagesInstalled: ['dpkg', 'libc6', 'libstdc++6', 'libgcc-s1'].every(name => installedPackages.has(name)),
      libatomicInstalled: installedPackages.has("libatomic1"),
      imageCacheFilesystem: fs.statfsSync('/app/apps/web/.next/cache').type,
      imageCacheLimitBytes: fs.statfsSync('/app/apps/web/.next/cache').blocks * fs.statfsSync('/app/apps/web/.next/cache').bsize,
      packageTools: ['/usr/local/bin/npm', '/usr/local/bin/corepack', '/usr/local/bin/yarn'].some(p => fs.existsSync(p)),
      providerKeys: ['MODEL_PROVIDER_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'].some(k => Boolean(process.env[k])),
      templates: fs.readdirSync('/app/forms/blank/2025').filter(p => p.endsWith('.pdf')).length }));
  `));
  assert.equal(processEvidence.uid, 1001);
  assert.equal(processEvidence.imageCacheFilesystem, 0x01021994, "Image cache must be a disposable tmpfs.");
  assert.equal(processEvidence.imageCacheLimitBytes, 64 * 1024 * 1024, "Image cache must remain bounded to64MiB.");
  assert.equal(processEvidence.node, "v26.13.0");
  assert.equal(processEvidence.undici, "8.12.2");
  assert.equal(processEvidence.libatomicInstalled, true, "Retain the official Node 26 Linux libatomic runtime dependency.");
  assert.equal(processEvidence.packageTools, false);
  assert.deepEqual(processEvidence.aptPackageRecords, [], "APT packages must be purged through dpkg, with no installed or residual records.");
  assert.deepEqual(processEvidence.aptBinaries, [], "The runner must not retain APT executables.");
  assert.deepEqual(processEvidence.aptLibraries, [], "The runner must not retain libapt shared libraries.");
  assert.equal(processEvidence.dpkgAudit, "", "The retained dpkg database must pass its consistency audit.");
  assert.equal(processEvidence.corePackagesInstalled, true, "Keep package metadata for dpkg and Node's core runtime libraries.");

  // Inspect the locally available runner base once, then execute only its immutable ID.
  // The exact filesystem-layer prefix proves shared base contents; a tag alone does not.
  const runnerBaseReference = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8")
    .match(/^FROM (\S+) AS runner$/mu)?.[1];
  assert.equal(runnerBaseReference, "node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072", "Use the shipped fixed runner base for the package proof.");
  const baseline = JSON.parse(docker("image", "inspect", runnerBaseReference))[0];
  const candidate = JSON.parse(docker("image", "inspect", metadata.Image))[0];
  assert.equal(candidate.Id, metadata.Image);
  assert.match(baseline.Id, /^(?:sha256:)?[0-9a-f]{64}$/u);
  assert.equal(baseline.Os, candidate.Os);
  assert.equal(baseline.Architecture, candidate.Architecture);
  assert.ok(Array.isArray(baseline.RootFS?.Layers) && baseline.RootFS.Layers.length > 0);
  assert.deepEqual(candidate.RootFS?.Layers?.slice(0, baseline.RootFS.Layers.length), baseline.RootFS.Layers,
    "The observed fixed runner base must be an exact filesystem-layer prefix of this candidate image.");
  const baselineRows = docker("run", "--rm", "--network", "none", "--entrypoint", "/usr/bin/dpkg-query",
    baseline.Id, "-W", "-f=${binary:Package}\t${Version}\t${db:Status-Status}\n")
    .split("\n").map(row => row.split("\t"));
  const orderedRows = rows => {
    assert.ok(rows.length > 0 && rows.every(row => row.length === 3 && row.every(value => value.length > 0)));
    assert.equal(new Set(rows.map(([name]) => name)).size, rows.length, "Package records must not contain duplicate full names.");
    return [...rows].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  };
  const beforePackages = orderedRows(baselineRows);
  const afterPackages = orderedRows(processEvidence.debianPackages);
  const targets = new Set(["apt", "libapt-pkg7.0"]);
  const removedPackages = beforePackages.filter(([name]) => targets.has(name.split(":")[0]));
  assert.deepEqual(removedPackages.map(([name]) => name.split(":")[0]).sort(), [...targets].sort());
  assert.ok(removedPackages.every(([, , status]) => status === "installed"));
  assert.deepEqual(afterPackages, beforePackages.filter(([name]) => !targets.has(name.split(":")[0])),
    "Exactly apt and libapt-pkg7.0 may disappear; every other full package name, version and status must remain unchanged.");
  const planArguments = ["run", "--rm", "--network", "none", "--user", "0", "--entrypoint", "/usr/bin/dpkg",
    baseline.Id, "--no-act", "--purge", "apt", "libapt-pkg7.0"];
  const removalPlan = spawnSync(runtime, [...connection.args, ...planArguments], { encoding: "utf8", env: connection.env });
  if (removalPlan.error) throw removalPlan.error;
  assert.equal(removalPlan.status, 0, "The actual immutable runner base must accept the unforced two-package removal dry run.");
  const runnerPackageProof = {
    runnerBaseReference, binding: "observed same-architecture fixed runner-base filesystem-layer prefix; tag alone is not build provenance",
    baseline: { id: baseline.Id, os: baseline.Os, architecture: baseline.Architecture, repoDigests: baseline.RepoDigests,
      layers: baseline.RootFS.Layers },
    candidate: { id: candidate.Id, os: candidate.Os, architecture: candidate.Architecture, layers: candidate.RootFS.Layers,
      sourceRevision: candidate.Config?.Labels?.["org.opencontainers.image.revision"] ?? null },
    beforePackages, afterPackages, removedPackages,
    removalPlan: { arguments: planArguments, status: removalPlan.status, stdout: removalPlan.stdout, stderr: removalPlan.stderr },
  };
  assert.equal(processEvidence.providerKeys, false);
  assert.ok(processEvidence.templates > 0);
  const auth = await fetch(`${origin}/api/auth/get-session`, { signal: globalThis.AbortSignal.timeout(5_000) });
  if (!(await auth.json()).bypassed) throw new Error("Self-host auth bypass is unavailable.");
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const status = JSON.parse(docker("inspect", container))[0].State.Health?.Status;
    if (status === "healthy") { healthy = true; break; }
    if (status === "unhealthy") throw new Error("Runtime health check failed.");
    await delay(1_000);
  }
  assert.ok(healthy, "Runtime health check never reported healthy.");
  console.log(JSON.stringify({ result: "passed", image: metadata.Image, readOnly: true,
    healthy, assets: true, imageCacheWritten, selfHostAuth: true, runnerPackageProof, ...processEvidence }));
} catch (error) {
  console.error(docker("logs", container));
  throw error;
} finally {
  docker("rm", "--force", container);
}

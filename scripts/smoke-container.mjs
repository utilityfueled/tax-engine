import { execFileSync } from "node:child_process";
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
  docker("exec", container, "node", "-e", "require('node:fs').accessSync('/app/forms/blank/2025/f1040.pdf')");
  const processEvidence = JSON.parse(docker("exec", container, "node", "-e", `
    const fs = require('node:fs');
    console.log(JSON.stringify({ uid: process.getuid(), node: process.version, architecture: process.arch,
      packageTools: ['/usr/local/bin/npm', '/usr/local/bin/corepack', '/usr/local/bin/yarn'].some(p => fs.existsSync(p)),
      providerKeys: ['MODEL_PROVIDER_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'].some(k => Boolean(process.env[k])),
      templates: fs.readdirSync('/app/forms/blank/2025').filter(p => p.endsWith('.pdf')).length }));
  `));
  assert.equal(processEvidence.uid, 1001);
  assert.match(processEvidence.node, /^v24\./u);
  assert.equal(processEvidence.packageTools, false);
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
    healthy, assets: true, selfHostAuth: true, ...processEvidence }));
} catch (error) {
  console.error(docker("logs", container));
  throw error;
} finally {
  docker("rm", "--force", container);
}

import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const image = process.argv[2] || "tax-engine:ci";
const runtime = process.env.TAX_ENGINE_CONTAINER_RUNTIME || "docker";
if (!["docker", "podman"].includes(runtime)) throw new Error("Choose docker or podman for TAX_ENGINE_CONTAINER_RUNTIME.");
const docker = (...args) => execFileSync(runtime, args, { encoding: "utf8" }).trim();
const container = docker("run", "--detach", "--publish", "127.0.0.1::3000", "--env", "TAX_ENGINE_DEPLOYMENT_MODE=self-host", image);
try {
  const port = docker("port", container, "3000/tcp").split(":").at(-1);
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${origin}/api/health`)).ok; } catch { /* starting */ }
    if (ready) break;
    await delay(1_000);
  }
  if (!ready) throw new Error("Container failed its liveness probe.");
  for (const asset of ["/", "/brand/logo.png", "/fonts/ibm-plex-mono-latin-400.woff2"]) {
    const response = await fetch(origin + asset);
    if (!response.ok || (await response.arrayBuffer()).byteLength === 0) throw new Error(`Missing container asset: ${asset}`);
  }
  docker("exec", container, "node", "-e", "require('node:fs').accessSync('/app/forms/blank/f1040.pdf')");
  const auth = await fetch(`${origin}/api/auth/get-session`);
  if (!(await auth.json()).bypassed) throw new Error("Self-host auth bypass is unavailable.");
  console.log("Container liveness, public assets, PDF template, and self-host auth checks passed.");
} catch (error) {
  console.error(docker("logs", container));
  throw error;
} finally {
  docker("rm", "--force", container);
}

import { execFileSync } from "node:child_process";
import { URL } from "node:url";

/** Resolve read-only metadata first; never let a rehearsal inherit a remote context. */
export function resolveLocalContainerRuntime(runtime, env = process.env, read = execFileSync) {
  if (!["docker", "podman"].includes(runtime)) throw new Error("Choose docker or podman for the container runtime.");
  const childEnv = { ...env };
  for (const name of ["DOCKER_CONTEXT", "DOCKER_HOST", "CONTAINER_HOST", "CONTAINER_CONNECTION"]) delete childEnv[name];
  const json = args => JSON.parse(read(runtime, args, { encoding: "utf8", env, timeout: 15_000 }));
  let endpoint;
  let identity;
  if (runtime === "docker") {
    endpoint = !env.DOCKER_CONTEXT && env.DOCKER_HOST
      ? env.DOCKER_HOST
      : json(["context", "inspect", ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : [])])[0]?.Endpoints?.docker?.Host;
  } else if (env.CONTAINER_HOST) {
    endpoint = env.CONTAINER_HOST;
    identity = env.CONTAINER_SSHKEY;
  } else {
    const connections = json(["system", "connection", "list", "--format", "json"]);
    const selected = connections.find(connection => env.CONTAINER_CONNECTION
      ? connection.Name === env.CONTAINER_CONNECTION : connection.Default);
    if (!selected) throw new Error("No selected local Podman connection; configure one before rehearsal.");
    endpoint = selected.URI;
    identity = selected.Identity;
  }
  let parsed;
  try { parsed = new URL(endpoint); } catch { /* rejected below without echoing credentials */ }
  const clean = parsed && !parsed.password && !parsed.search && !parsed.hash;
  const localSocket = clean && parsed.protocol === "unix:" && !parsed.hostname && parsed.pathname.startsWith("/");
  const localPipe = clean && parsed.protocol === "npipe:" && parsed.hostname === "." && parsed.pathname.startsWith("/pipe/");
  const localVm = clean && parsed.protocol === "ssh:" && ["127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (runtime === "docker" && !localSocket && !localPipe) throw new Error("Rehearsal requires an explicit local socket Docker endpoint.");
  if (runtime === "podman" && !localSocket && !localVm) throw new Error("Rehearsal requires a local socket or loopback Podman VM endpoint.");
  return { endpoint, env: childEnv, args: runtime === "docker"
    ? ["--host", endpoint]
    : ["--url", endpoint, ...(identity ? ["--identity", identity] : [])] };
}

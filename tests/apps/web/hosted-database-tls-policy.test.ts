// Spec: spec/federal/hosted-database-tls-policy.yaml
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getHostedServerDatabase, getHostedServerDatabaseConfig } from "../../../apps/web/src/lib/hosted-server-db";

const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { Client, Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
const fs = require("node:fs") as typeof import("node:fs");
const certificateReads = vi.spyOn(fs, "readFileSync");
const connect = vi.spyOn(Pool.prototype, "connect").mockImplementation(() => {
  throw new Error("Synthetic TLS controls forbid pool connections");
});
const clientConnect = vi.spyOn(Client.prototype, "connect").mockImplementation(() => {
  throw new Error("Synthetic TLS controls forbid client connections");
});
const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
const runtimes: Awaited<ReturnType<typeof getHostedServerDatabase>>[] = [];
const syntheticDirectories: string[] = [];
const urlFor = (host: string, query: string, id: string) =>
  `postgresql://synthetic_tls_user:synthetic_tls_password@${host}/synthetic_tls?${query}&application_name=${id}`;
function environment(url: string, mode: string) {
  return mode === "preview" ? {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", VERCEL_ENV: "preview",
    DATABASE_URL: "postgresql://ignored_user:ignored_password@ignored.invalid/unselected",
    TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: url,
  } : { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", DATABASE_URL: url };
}
function cacheKeys() {
  const cache = Reflect.get(globalThis, "__tax_engine_hosted_server_databases__") as unknown;
  if (cache === undefined) return [];
  if (!(cache instanceof Map)) throw new Error("Actual runtime cache must remain a Map");
  return [...cache.keys()];
}
function effectiveSsl(runtime: Awaited<ReturnType<typeof getHostedServerDatabase>>) {
  // Real installed pg parsing is required: Pool.options alone misses URL overrides.
  const client = new Client(runtime.pool.options);
  const ssl: unknown = client.ssl;
  expect(ssl).toBeTruthy();
  if (ssl === true) return ssl; // pg passes true to Node TLS with verified defaults.
  if (ssl === null || typeof ssl !== "object") throw new Error("Actual selected client TLS options must be structured");
  expect(Reflect.get(ssl, "rejectUnauthorized")).not.toBe(false);
  expect(Reflect.get(ssl, "checkServerIdentity")).toBeUndefined();
  return ssl;
}
beforeEach(() => { diagnostics.mockClear(); certificateReads.mockClear(); });
afterAll(async () => {
  try {
    await Promise.all(runtimes.map(runtime => runtime.db.destroy()));
    expect(connect).not.toHaveBeenCalled();
    expect(clientConnect).not.toHaveBeenCalled();
  } finally {
    for (const directory of syntheticDirectories) rmSync(directory, { recursive: true, force: true });
    connect.mockRestore(); clientConnect.mockRestore(); diagnostics.mockRestore(); certificateReads.mockRestore();
  }
});

const secure = [
  ["explicit require", "selected.invalid", "sslmode=require"],
  ["explicit verify-full", "selected.invalid", "sslmode=verify-full"],
  ["provider-selected TLS", "synthetic.psdb.cloud", ""],
  ["system-root normalization", "selected.invalid", "sslmode=require&sslrootcert=system"],
  ["verify-full libpq compatibility", "selected.invalid", "sslmode=verify-full&uselibpqcompat=true"],
  ["effective-last safe duplicate", "selected.invalid", "sslmode=no-verify&sslmode=verify-full"],
] as const;
describe("selected TLS preserved baseline", () => {
  it.each(secure)("retains actual verified client TLS and deadlines for %s", async (label, host, query) => {
    const original = urlFor(host, query, encodeURIComponent(label));
    const env = environment(original, "preview");
    expect(getHostedServerDatabaseConfig(env).blocked).toBe(false);
    const runtime = await getHostedServerDatabase(env);runtimes.push(runtime);
    expect(await getHostedServerDatabase(env)).toBe(runtime);
    effectiveSsl(runtime);
    const normalized = new URL(original);
    if (normalized.searchParams.get("sslrootcert") === "system") normalized.searchParams.delete("sslrootcert");
    expect(runtime.pool.options.connectionString).toBe(normalized.toString());
    expect(runtime.pool.options).toMatchObject({ max: 10, idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000, statement_timeout: 10_000, lock_timeout: 3_000,
      idle_in_transaction_session_timeout: 15_000, query_timeout: 15_000,
      keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
    expect(env.TAX_ENGINE_STAGING_DATABASE_DATABASE_URL).toBe(original);
  });

  it("preserves explicit synthetic custom CA and client certificate semantics", async () => {
    const directory = mkdtempSync(join(tmpdir(), "synthetic-tls-certificates-"));
    syntheticDirectories.push(directory);
    const originals = { sslrootcert: "SYNTHETIC ROOT ONLY", sslcert: "SYNTHETIC CERTIFICATE ONLY", sslkey: "SYNTHETIC KEY ONLY" };
    const parsed = new URL(urlFor("certificates.invalid", "sslmode=verify-full", "custom-certificates"));
    for (const [key, value] of Object.entries(originals)) {
      const path = join(directory, `${key}.txt`);writeFileSync(path, value, { mode: 0o600 });
      parsed.searchParams.set(key, path);
    }
    const original = parsed.toString();
    const runtime = await getHostedServerDatabase(environment(original, "production"));runtimes.push(runtime);
    const ssl = effectiveSsl(runtime);
    if (ssl === true) throw new Error("Explicit CA and client certificates must remain structured");
    expect(Reflect.get(ssl, "ca")).toBe(originals.sslrootcert);
    expect(Reflect.get(ssl, "cert")).toBe(originals.sslcert);
    expect(Reflect.get(ssl, "key")).toBe(originals.sslkey);
    expect(runtime.pool.options.connectionString).toBe(original);
    for (const [key, value] of Object.entries(originals)) expect(readFileSync(join(directory, `${key}.txt`), "utf8")).toBe(value);
  });

  it.each(["development", "test"])("preserves explicit %s loopback without selecting a new TLS contract", async nodeEnv => {
    const url = urlFor("127.0.0.1", "", nodeEnv);
    const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: nodeEnv, DATABASE_URL: url };
    expect(getHostedServerDatabaseConfig(env)).toMatchObject({ databaseUrl: url, blocked: false });
    const runtime = await getHostedServerDatabase(env);runtimes.push(runtime);
    expect(runtime.pool.options.ssl).toBeUndefined();
  });

  it("preserves self-host selection and disabled hosted runtime", async () => {
    const url = urlFor("synthetic.psdb.cloud", "sslmode=disable", "self-host");
    const env = { TAX_ENGINE_DEPLOYMENT_MODE: "self-host", NODE_ENV: "production", DATABASE_URL: url };
    expect(getHostedServerDatabaseConfig(env)).toEqual({ deploymentMode: "self-host", nodeEnv: "production", databaseUrl: url, blocked: false });
    await expect(getHostedServerDatabase(env)).rejects.toThrow(/disabled outside hosted mode/);
  });
});

const downgrades = [
  ["provider plaintext", "synthetic.psdb.cloud", "sslmode=disable"],
  ["provider unverified mode", "synthetic.psdb.cloud", "sslmode=no-verify"],
  ["provider ssl zero", "synthetic.psdb.cloud", "ssl=0"],
  ["provider ssl no-verify", "synthetic.psdb.cloud", "ssl=no-verify"],
  ["require compatibility removes certificate verification", "selected.invalid", "sslmode=require&uselibpqcompat=true"],
  ["verify-ca compatibility removes hostname verification", "selected.invalid", "sslmode=verify-ca&uselibpqcompat=true&sslrootcert=/private/synthetic-never-read-tls-root"],
  ["last duplicate mode removes verification", "selected.invalid", "sslmode=require&sslmode=no-verify"],
  ["last duplicate compatibility removes verification", "selected.invalid", "sslmode=require&uselibpqcompat=false&uselibpqcompat=true"],
] as const;
const cases = downgrades.flatMap(([label, host, query], index) => ["production", "preview"].map(mode =>
  [label, mode, urlFor(host, query, `negative-${index}-${mode}`)] as const));
describe("selected TLS downgrade controls", () => {
  it.each(cases)("blocks selected verification downgrade %s in %s before I/O", async (_label, mode, url) => {
    const env = environment(url, mode);const before = cacheKeys();const originalEnv = structuredClone(env);
    expect(getHostedServerDatabaseConfig(env).blocked).toBe(true);
    await expect(getHostedServerDatabase(env)).rejects.toThrow("Server configuration error: verified TLS is required for the selected hosted database.");
    expect(certificateReads.mock.calls.some(([path]) => String(path) === "/private/synthetic-never-read-tls-root")).toBe(false);
    expect(cacheKeys()).toEqual(before);
    expect(env).toEqual(originalEnv);
    expect(connect).not.toHaveBeenCalled();expect(clientConnect).not.toHaveBeenCalled();
    const output = JSON.stringify(diagnostics.mock.calls);
    for (const secret of [url, "synthetic_tls_user", "synthetic_tls_password", "synthetic.psdb.cloud", "selected.invalid", "synthetic-never-read-tls-root"]) expect(output).not.toContain(secret);
  });
});

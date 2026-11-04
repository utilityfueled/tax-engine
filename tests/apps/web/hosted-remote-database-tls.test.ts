// Spec: spec/federal/hosted-remote-database-tls.yaml
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type TLSSocket } from "node:tls";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureHostedAppSchema, getHostedServerDatabase, getHostedServerDatabaseConfig } from "../../../apps/web/src/lib/hosted-server-db";

const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { Client, Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
type Environment = Record<string, string | undefined>;
type Runtime = Awaited<ReturnType<typeof getHostedServerDatabase>>;
const syntheticPassword = "synthetic_remote_tls_password";
const url = (host: string, query = "", id = "case") =>
  `postgresql://synthetic_remote_tls_user:${syntheticPassword}@${host}/synthetic_remote_tls?${query}&application_name=${id}`;
function env(databaseUrl: string, mode = "production"): Environment {
  return mode === "preview" ? {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", VERCEL_ENV: "preview",
    DATABASE_URL: url("unselected-shared.invalid"), TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: databaseUrl,
  } : { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: mode, DATABASE_URL: databaseUrl };
}
function verified(runtime: Runtime) {
  const client = new Client(runtime.pool.options);
  const ssl: unknown = client.ssl;
  expect(ssl).toBeTruthy();
  if (ssl === true) return ssl;
  if (ssl === null || typeof ssl !== "object") throw new Error("Actual pg TLS must use structured or true verified options");
  expect(Reflect.get(ssl, "rejectUnauthorized")).not.toBe(false);
  expect(Reflect.get(ssl, "checkServerIdentity")).toBeUndefined();
  return ssl;
}
function globalMap(key: string): Map<unknown, unknown> {
  const existing: unknown = Reflect.get(globalThis, key);
  if (existing !== undefined && !(existing instanceof Map)) throw new Error("Existing runtime cache must remain a Map");
  const map: Map<unknown, unknown> = existing ?? new Map();
  if (existing === undefined) Reflect.set(globalThis, key, map);
  return map;
}
const runtimeCache = () => globalMap("__tax_engine_hosted_server_databases__");
const schemaCache = () => globalMap("__tax_engine_hosted_schema_promises__");
const resources: Runtime[] = [];
const directories: string[] = [];
async function runtime(environment: Environment) {
  const value = await getHostedServerDatabase(environment);resources.push(value);return value;
}
afterAll(async () => {
  await Promise.all(resources.map(value => value.db.destroy()));
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("constructor-only remote TLS", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  function installGuards() {
    return {
      diagnostics: vi.spyOn(console, "error").mockImplementation(() => {}),
      reads: vi.spyOn(fs, "readFileSync"),
      poolConnect: vi.spyOn(Pool.prototype, "connect").mockImplementation(() => {
        throw new Error("Constructor-only controls forbid pool sockets");
      }),
      clientConnect: vi.spyOn(Client.prototype, "connect").mockImplementation(() => {
        throw new Error("Constructor-only controls forbid client sockets");
      }),
    };
  }
  let guards: ReturnType<typeof installGuards>;
  beforeAll(() => { guards = installGuards(); });
  beforeEach(() => { guards.diagnostics.mockClear();guards.reads.mockClear(); });
  afterAll(() => {
    expect(guards.poolConnect).not.toHaveBeenCalled();expect(guards.clientConnect).not.toHaveBeenCalled();
    guards.poolConnect.mockRestore();guards.clientConnect.mockRestore();guards.diagnostics.mockRestore();guards.reads.mockRestore();
  });
  describe("preserved baselines", () => {
    it.each(["production", "preview"])("preserves selected secure %s actual Client options", async mode => {
      const original = url("remote-preserved.invalid", "sslmode=verify-full", mode);
      const e = env(original, mode);expect(getHostedServerDatabaseConfig(e).blocked).toBe(false);
      verified(await runtime(e));expect(e).toEqual(env(original, mode));
    });
    it.each(["development", "test"].flatMap(mode => ["localhost", "127.0.0.1", "[::1]"].map(host => [mode, host] as const)))(
      "preserves explicit %s loopback %s without sockets", async (mode, host) => {
        const e = env(url(host, "", `preserved-${mode}-${host}`), mode);
        expect(getHostedServerDatabaseConfig(e).blocked).toBe(false);
        const actual = await runtime(e);expect(new Client(actual.pool.options).ssl).toBe(false);
      });
    it.each(["sslmode=disable", "ssl=0"])("preserves explicit test loopback plaintext switch %s", async query => {
      const actual = await runtime(env(url("127.0.0.1", query, "local-explicit"), "test"));
      expect(new Client(actual.pool.options).ssl).toBe(false);
    });
    it("preserves generic custom CA and client certificate originals without selecting an insecure mode", async () => {
      const directory = mkdtempSync(join(tmpdir(), "remote-tls-synthetic-originals-"));directories.push(directory);
      const original = new URL(url("custom-remote.invalid"));
      const contents = { sslrootcert: "SYNTHETIC ROOT ONLY", sslcert: "SYNTHETIC CERT ONLY", sslkey: "SYNTHETIC KEY ONLY" };
      for (const [key, text] of Object.entries(contents)) {
        const file = join(directory, `${key}.txt`);writeFileSync(file, text, { mode: 0o600 });original.searchParams.set(key, file);
      }
      const actual = await runtime(env(original.toString()));const ssl = verified(actual);
      if (ssl === true) throw new Error("Custom originals must remain structured");
      expect(Reflect.get(ssl, "ca")).toBe(contents.sslrootcert);expect(Reflect.get(ssl, "cert")).toBe(contents.sslcert);
      expect(Reflect.get(ssl, "key")).toBe(contents.sslkey);expect(actual.pool.options.connectionString).toBe(original.toString());
      for (const [key, text] of Object.entries(contents)) expect(readFileSync(join(directory, `${key}.txt`), "utf8")).toBe(text);
    });
    it("preserves self-host configuration without enabling the hosted runtime", async () => {
      const e = { ...env(url("self-host.invalid", "sslmode=disable")), TAX_ENGINE_DEPLOYMENT_MODE: "self-host" };
      expect(getHostedServerDatabaseConfig(e).blocked).toBe(false);
      await expect(getHostedServerDatabase(e)).rejects.toThrow("hosted database access is disabled outside hosted mode");
    });
  });

  const defaults: [string, Environment][] = [
    ["remote production", env(url("generic-production.invalid"))],
    ["isolated Preview", env(url("generic-preview.invalid"), "preview")],
    ["remote development", env(url("generic-development.invalid"), "development")],
    ["remote test", env(url("generic-test.invalid"), "test")],
    ["missing environment remote", { ...env(url("missing-environment.invalid")), NODE_ENV: undefined }],
    ["missing environment loopback", { ...env(url("127.0.0.1", "", "missing-env")), NODE_ENV: undefined }],
    ["production loopback", env(url("127.0.0.1", "", "production-loopback"))],
    ["Preview loopback with explicit test", { ...env(url("127.0.0.1", "", "preview-test"), "preview"), NODE_ENV: "test" }],
    ["deceptive localhost suffix", env(url("localhost.attacker.invalid"), "development")],
    ["short numeric loopback spelling", env(url("127.1"), "test")],
    ["integer numeric loopback spelling", env(url("2130706433"), "test")],
    ["loopback authority remote query host", env(url("127.0.0.1", "host=effective-remote.invalid"), "test")],
    ["remote authority loopback query host", env(url("remote-authority.invalid", "host=127.0.0.1"), "test")],
    ["loopback authority query override remains unqualified", env(url("127.0.0.1", "host=localhost"), "test")],
  ];
  describe("new verified default", () => {
    it.each(defaults)("selects actual verified TLS for %s", async (_label, e) => {
      const before = structuredClone(e);expect(getHostedServerDatabaseConfig(e).blocked).toBe(false);
      const actual = await runtime(e);verified(actual);expect(await getHostedServerDatabase(e)).toBe(actual);
      expect(actual.pool.options).toMatchObject({ max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000, lock_timeout: 3_000, idle_in_transaction_session_timeout: 15_000,
        query_timeout: 15_000, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
      expect(e).toEqual(before);
      if (e.VERCEL_ENV === "preview") expect(actual.pool.options.connectionString).not.toContain("unselected-shared.invalid");
    });
  });
  const unsafe = [
    ["disabled mode", "sslmode=disable"], ["unverified mode", "sslmode=no-verify"],
    ["ssl zero", "ssl=0"], ["ssl no-verify", "ssl=no-verify"],
    ["require compatibility", "sslmode=require&uselibpqcompat=true"],
    ["verify-ca hostname downgrade", "sslmode=verify-ca&uselibpqcompat=true&sslrootcert=/private/synthetic-remote-tls-never-read"],
    ["unknown mode", "sslmode=unsupported"], ["unknown ssl value", "ssl=unsupported"],
    ["effective-last disabled duplicate", "sslmode=verify-full&sslmode=disable"],
  ];
  describe("new unsafe remote admission", () => {
    it.each(unsafe.flatMap(([label, query], index) => ["production", "preview"].map(mode => [label, mode, query, index] as const)))(
      "rejects unsafe remote %s in %s before I/O", async (_label, mode, query, index) => {
        const e = env(url("generic-unsafe.invalid", query, `${index}-${mode}`), mode);const before = structuredClone(e);
        const cacheBefore = [...runtimeCache()];expect(getHostedServerDatabaseConfig(e).blocked).toBe(true);
        await expect(getHostedServerDatabase(e)).rejects.toThrow(/verified TLS is required/);
        expect([...runtimeCache()]).toEqual(cacheBefore);expect(e).toEqual(before);
        expect(guards.reads.mock.calls.some(([file]) => String(file) === "/private/synthetic-remote-tls-never-read")).toBe(false);
        const output = JSON.stringify(guards.diagnostics.mock.calls);
        for (const privateValue of [syntheticPassword, "synthetic_remote_tls_user", "generic-unsafe.invalid", "synthetic-remote-tls-never-read"]) expect(output).not.toContain(privateValue);
      });
    it.each(["development", "production"])("rejects query-host plaintext laundering in %s", async mode => {
      const e = env(url("127.0.0.1", "host=actual-remote.invalid&sslmode=disable", mode), mode);
      expect(getHostedServerDatabaseConfig(e).blocked).toBe(true);
      await expect(getHostedServerDatabase(e)).rejects.toThrow(/verified TLS is required/);
    });
    it.each(["development", "production"])("separates runtime cache policies when %s comes first", async first => {
      const original = url("127.0.0.1", "", `cache-${first}`);const dev = env(original, "development");const prod = env(original);
      const a = await runtime(first === "development" ? dev : prod);const b = await runtime(first === "development" ? prod : dev);
      const local = first === "development" ? a : b;const hosted = first === "production" ? a : b;
      expect(local).not.toBe(hosted);expect(new Client(local.pool.options).ssl).toBe(false);verified(hosted);
      expect(await getHostedServerDatabase(dev)).toBe(local);expect(await getHostedServerDatabase(prod)).toBe(hosted);
    });
    it.each(["production", "preview"])("revalidates unsafe %s before a previously resolved schema promise", async mode => {
      const original = url("schema-unsafe.invalid", "sslmode=disable", mode);const e = env(original, mode);
      const cache = schemaCache();const before = new Map(cache);cache.set(original, Promise.resolve());
      try { await expect(ensureHostedAppSchema(e)).rejects.toThrow(/verified TLS is required/); }
      finally { cache.clear();for (const [key, value] of before) cache.set(key, value); }
    });
    it("separates schema initialization between local plaintext and verified production policies", async () => {
      const policies: unknown[] = [];
      const query = vi.spyOn(Pool.prototype, "query").mockImplementation(function(this: InstanceType<typeof Pool>) {
        const client = new Client(this.options);policies.push(client.ssl);
        return Promise.resolve({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] });
      } as typeof Pool.prototype.query);
      const original = url("127.0.0.1", "", "schema-policy");
      try {
        await ensureHostedAppSchema(env(original, "development"));const localCalls = policies.length;expect(localCalls).toBeGreaterThan(0);
        await ensureHostedAppSchema(env(original));expect(policies.length).toBeGreaterThan(localCalls);
        expect(policies.slice(0, localCalls).every(value => value === false)).toBe(true);
        for (const ssl of policies.slice(localCalls)) {
          expect(ssl).toBeTruthy();if (ssl !== true) { expect(ssl).toBeTypeOf("object");expect(Reflect.get(ssl as object, "rejectUnauthorized")).not.toBe(false); }
        }
      } finally { query.mockRestore(); }
    });
  });
  describe("effective-last source originals", () => {
    it.each(["custom-last", "system-last", "empty-last"])("preserves effective-last root certificate semantics for %s", async kind => {
      const directory = mkdtempSync(join(tmpdir(), "effective-last-root-"));directories.push(directory);
      const custom = join(directory, "authored-root.txt");writeFileSync(custom, "SYNTHETIC EFFECTIVE LAST CA", { mode: 0o600 });
      const original = new URL(url("effective-last-root.invalid", "sslmode=verify-full", kind));
      original.searchParams.append("sslrootcert", kind === "system-last" ? "/private/synthetic-remote-tls-never-read" : "system");
      original.searchParams.append("sslrootcert", kind === "custom-last" ? custom : kind === "system-last" ? "system" : "");
      const expected = new URL(original);if (kind === "system-last") expected.searchParams.delete("sslrootcert");
      const actual = await runtime(env(original.toString()));
      expect(actual.pool.options.connectionString).toBe(expected.toString());
      const ssl = verified(actual);
      if (kind === "custom-last") {
        if (ssl === true) throw new Error("Actual last CA original must remain structured");
        expect(Reflect.get(ssl, "ca")).toBe("SYNTHETIC EFFECTIVE LAST CA");
      }
      expect(guards.reads.mock.calls.some(([file]) => String(file) === "/private/synthetic-remote-tls-never-read" || String(file) === "system")).toBe(false);
    });
    it.each([
      ["unknown then verified mode", "sslmode=unsupported&sslmode=verify-full", false],
      ["unknown then empty mode", "sslmode=unsupported&sslmode=", false],
      ["verified then unknown mode", "sslmode=verify-full&sslmode=unsupported", true],
      ["unknown then enabled ssl", "ssl=unsupported&ssl=true", false],
    ] as const)("preserves effective-last option semantics for %s", async (label, query, blocked) => {
      const e = env(url("effective-last-options.invalid", query, encodeURIComponent(label)));
      expect(getHostedServerDatabaseConfig(e).blocked).toBe(blocked);
      if (blocked) await expect(getHostedServerDatabase(e)).rejects.toThrow(/verified TLS is required/);
      else verified(await runtime(e));
    });
    it("preserves custom certificate replacement of an earlier unused ssl value", async () => {
      const directory = mkdtempSync(join(tmpdir(), "effective-certificate-replacement-"));directories.push(directory);
      const file = join(directory, "authored-root.txt");writeFileSync(file, "SYNTHETIC REPLACEMENT CA", { mode: 0o600 });
      const original = new URL(url("effective-certificate.invalid", "ssl=unsupported"));original.searchParams.set("sslrootcert", file);
      const actual = await runtime(env(original.toString()));const ssl = verified(actual);
      if (ssl === true) throw new Error("Actual CA replacement must remain structured");
      expect(Reflect.get(ssl, "ca")).toBe("SYNTHETIC REPLACEMENT CA");expect(actual.pool.options.connectionString).toBe(original.toString());
    });
  });

});

// Separate actual local socket operation: invoke only with the dedicated handshake
// filter after root approval. No provider/database credentials or PostgreSQL server.
describe("real loopback TLS handshake", () => {
  const servers: Server[] = [];
  let port: number;let wrongHostPort: number;let directory: string;let startups = 0;
  const sockets = new Set<TLSSocket>();
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "synthetic-remote-tls-handshake-"));directories.push(directory);
    const openssl = (args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: directory, stdio: "ignore", timeout: 3_000 });
    for (const name of ["trusted", "unrelated"]) openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=Synthetic ${name} local test CA`, "-keyout", `${name}.key`, "-out", `${name}.pem`]);
    openssl(["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", "server.key", "-out", "server.csr"]);
    for (const [name, san] of [["matching", "IP:127.0.0.1,DNS:localhost"], ["wrong-host", "DNS:other.synthetic.invalid"]]) {
      writeFileSync(join(directory, `${name}-extensions.txt`), `subjectAltName=${san}\nextendedKeyUsage=serverAuth\n`, { mode: 0o600 });
      openssl(["x509", "-req", "-in", "server.csr", "-CA", "trusted.pem", "-CAkey", "trusted.key", "-CAcreateserial", "-days", "1", "-extfile", `${name}-extensions.txt`, "-out", `${name}.pem`]);
      const server = createServer({ key: readFileSync(join(directory, "server.key")), cert: readFileSync(join(directory, `${name}.pem`)), ALPNProtocols: ["postgresql"] }, socket => {
        sockets.add(socket);socket.on("close", () => sockets.delete(socket));socket.on("error", () => {});
        let buffer = Buffer.alloc(0);let ready = false;
        socket.on("data", chunk => {
          if (ready) { if (chunk[0] === 88) socket.end();return; }
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return;
          startups++;ready = true;
          // Real PostgreSQL AuthenticationOk, then ReadyForQuery. No password request.
          socket.write(Buffer.from([82,0,0,0,8,0,0,0,0,90,0,0,0,5,73]));
        });
      });
      servers.push(server);
      server.on("tlsClientError", () => {}); // Expected rejected trust/host handshakes.
      await new Promise<void>((resolve, reject) => { server.once("error", reject);server.listen({ host: "127.0.0.1", port: 0 }, resolve); });
      const address = server.address();if (!address || typeof address === "string") throw new Error("Synthetic TLS peer must have an actual loopback port");
      if (name === "matching") port = address.port;else wrongHostPort = address.port;
    }
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    for (const server of servers) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  async function connect(selectedPort: number, root: string) {
    const original = new URL(url(`127.0.0.1:${selectedPort}`, "sslmode=verify-full&sslnegotiation=direct", `handshake-${selectedPort}-${root}`));
    original.searchParams.set("sslrootcert", join(directory, `${root}.pem`));
    const actual = await runtime(env(original.toString()));return new Client(actual.pool.options);
  }
  it("negotiates actual loopback PostgreSQL TLS with the trusted CA and matching hostname", async () => {
    const before = startups;const client = await connect(port, "trusted");
    try { await client.connect();expect(startups).toBe(before + 1);expect(client.ssl).toBeTruthy(); }
    finally { await client.end(); }
  });
  it("rejects an actual loopback peer signed by an untrusted CA", async () => {
    const before = startups;const client = await connect(port, "unrelated");
    try { await expect(client.connect()).rejects.toMatchObject({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });expect(startups).toBe(before); }
    finally { await client.end(); }
  });
  it("rejects an actual trusted loopback peer with a mismatched hostname", async () => {
    const before = startups;const client = await connect(wrongHostPort, "trusted");
    try { await expect(client.connect()).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });expect(startups).toBe(before); }
    finally { await client.end(); }
  });
});

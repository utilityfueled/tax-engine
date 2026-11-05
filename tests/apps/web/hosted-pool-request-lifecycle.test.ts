// Spec: spec/federal/hosted-pool-request-lifecycle.yaml
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolConfig } from "pg";
import type { getHostedServerDatabase as Subject } from "../../../apps/web/src/lib/hosted-server-db";

type Runtime = Awaited<ReturnType<typeof Subject>>;
type Result = { command: string; rowCount: number; rows: { value: number }[] };
type Callback = (error: Error | undefined, result?: Result) => void;
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected actual lifecycle test resource");
  return value;
}
// Only pg's documented Client constructor option replaces the socket endpoint.
// Actual pg Pool construction, queues, release, idle eviction and end run intact.
class SocketFreeClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  endCalls = 0;
  queries: string[] = [];
  connect(callback: (error?: Error) => void) { callback(); }
  query(text: string, values?: readonly unknown[] | Callback, callback?: Callback) {
    this.queries.push(text);
    const done = typeof values === "function" ? values : callback;
    const error = text === "MUTATION_TIMEOUT" ? new Error("Query read timeout") : undefined;
    const result: Result = { command: "SELECT", rowCount: 1, rows: [{ value: 1 }] };
    if (done) { process.nextTick(() => done(error, error ? undefined : result)); return; }
    return error ? Promise.reject(error) : Promise.resolve(result);
  }
  end(callback?: () => void) {
    this.endCalls++;
    this._ending = true;
    this.emit("end");
    callback?.();
    return Promise.resolve();
  }
}
const require = createRequire(`${process.cwd()}/apps/web/package.json`);
const actualPg = require("pg") as typeof import("pg");
// Mock the application's import entry, preserving the actual Pool implementation.
const pgImportEntry = require.resolve("pg").replace(/lib\/index\.js$/, "esm/index.mjs");
const constructed: Runtime["pool"][] = [];
class ActualPoolWithSocketFreeClient extends actualPg.Pool {
  constructor(options: PoolConfig) {
    // The wire-only adapter implements exactly the subset exercised by pg Pool.
    // This cast does not replace Pool, SDK, policy or any assertion.
    super({ ...options, Client: SocketFreeClient as unknown as NonNullable<PoolConfig["Client"]> });
    constructed.push(this);
  }
}
const storage = new AsyncLocalStorage<{ waitUntil: (promise: Promise<unknown>) => void; deadline?: number }>();
const contextSymbol = Symbol.for("@vercel/request-context");
const originalContext = Object.getOwnPropertyDescriptor(globalThis, contextSymbol);
let getHostedServerDatabase: typeof Subject;
let sequence = 0;
const ownClients: SocketFreeClient[] = [];
function env() {
  return { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production", VERCEL_ENV: "preview",
    TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: `postgresql://synthetic:synthetic@pool.invalid/synthetic?sslmode=verify-full&application_name=lifecycle-${++sequence}` };
}
async function runtime(environment = env()) {
  const value = await getHostedServerDatabase(environment);
  value.pool.on("connect", client => {
    if (!(client instanceof SocketFreeClient)) throw new Error("Only socket-free clients are allowed");
    ownClients.push(client);
  });
  return value;
}
function request<T>(work: () => T) {
  const waits: Promise<unknown>[] = [];
  return { result: storage.run({ waitUntil: promise => waits.push(promise) }, work), waits };
}
beforeAll(async () => {
  vi.doMock(pgImportEntry, () => ({ ...actualPg, Pool: ActualPoolWithSocketFreeClient }));
  ({ getHostedServerDatabase } = await import("../../../apps/web/src/lib/hosted-server-db"));
  Object.defineProperty(globalThis, contextSymbol, { configurable: true, value: { get: () => storage.getStore() } });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubEnv("VERCEL_URL", "synthetic.invalid");
  vi.stubEnv("VERCEL_REGION", "iad1");
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  for (const pool of constructed) if (!pool.ending) await pool.end();
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});
afterAll(() => {
  vi.doUnmock(pgImportEntry);
  if (originalContext) Object.defineProperty(globalThis, contextSymbol, originalContext);
  else Reflect.deleteProperty(globalThis, contextSymbol);
});

describe("hosted actual SDK and pg request lifecycle", () => {
  it("keeps the request alive through actual pg idle eviction without ending the pool", async () => {
    const value = await runtime();
    const release = request(() => value.pool.query("select 1"));
    await release.result;
    expect(release.waits).toHaveLength(1);
    let settled = false; void required(release.waits[0]).then(() => { settled = true; });
    expect(value.pool.idleCount).toBe(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(value.pool.totalCount).toBe(1); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(value.pool.totalCount).toBe(0); expect(required(ownClients.at(-1)).endCalls).toBe(1); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await release.waits[0]; expect(settled).toBe(true); expect(value.pool.ending).toBe(false);
    const next = request(() => value.pool.query("select 2")); await next.result;
    expect(next.waits).toHaveLength(1); expect(value.pool.totalCount).toBe(1);
  });

  it("attaches once to the cached pool and uses each release request context", async () => {
    const environment = env(); const value = await runtime(environment);
    expect(await getHostedServerDatabase(environment)).toBe(value);
    expect(value.pool.listenerCount("release")).toBe(1);
    const a = request(() => value.pool.query("select 1")); await a.result;
    const firstClient = ownClients.at(-1);
    const b = request(() => value.pool.query("select 2")); await b.result;
    expect(a.waits).toHaveLength(1); expect(b.waits).toHaveLength(1);
    expect(ownClients.at(-1)).toBe(firstClient); expect(value.pool.listenerCount("release")).toBe(1);
    await a.waits[0]; // The SDK resolves the preceding request when a new release resets its wait.
    let settled = false; void required(b.waits[0]).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(30_000); expect(settled).toBe(false); expect(value.pool.totalCount).toBe(0);
    await vi.advanceTimersByTimeAsync(100); await b.waits[0]; expect(settled).toBe(true);
  });

  it("preserves a checked out client across the earlier idle interval", async () => {
    const value = await runtime(); const a = request(() => value.pool.query("select 1")); await a.result;
    await vi.advanceTimersByTimeAsync(20_000);
    const client = await value.pool.connect(); const endpoint = required(ownClients.at(-1));
    await vi.advanceTimersByTimeAsync(10_100); await a.waits[0];
    expect(value.pool.totalCount).toBe(1); expect(value.pool.idleCount).toBe(0); expect(endpoint.endCalls).toBe(0);
    const b = request(() => client.release()); expect(b.waits).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000); expect(endpoint.endCalls).toBe(1); expect(value.pool.totalCount).toBe(0);
    await vi.advanceTimersByTimeAsync(100); await b.waits[0];
  });

  it("preserves ordinary Node pooling and rejects self-host before construction", async () => {
    vi.stubEnv("VERCEL_REGION", "");
    const value = await runtime(); const a = request(() => value.pool.query("select 1")); await a.result;
    expect(a.waits).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_000); expect(value.pool.totalCount).toBe(0);
    const count = constructed.length;
    await expect(getHostedServerDatabase({ ...env(), TAX_ENGINE_DEPLOYMENT_MODE: "self-host" })).rejects.toThrow(/disabled outside hosted mode/);
    expect(constructed).toHaveLength(count);
  });

  it("retains read timeout destruction without mutation replay", async () => {
    const value = await runtime(); const a = request(() => value.pool.query("MUTATION_TIMEOUT"));
    await expect(a.result).rejects.toThrow("Query read timeout");
    const endpoint = required(ownClients.at(-1));
    expect(endpoint.queries).toEqual(["MUTATION_TIMEOUT"]); expect(endpoint._ending).toBe(true);
    expect(endpoint.endCalls).toBeGreaterThanOrEqual(1); expect(value.pool.totalCount).toBe(0); expect(value.pool.idleCount).toBe(0);
    const b = request(() => value.pool.query("select 1")); await b.result;
    expect(ownClients.at(-1)).not.toBe(endpoint); expect(endpoint.queries).toEqual(["MUTATION_TIMEOUT"]);
  });

  it("honors the actual SDK platform deadline without claiming early connection drain", async () => {
    const value = await runtime(); const waits: Promise<unknown>[] = [];
    await storage.run({ deadline: Date.now() + 1_000, waitUntil: promise => waits.push(promise) }, () => value.pool.query("select 1"));
    expect(waits).toHaveLength(1);
    let settled = false; void required(waits[0]).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(100); expect(settled).toBe(true);
    expect(value.pool.totalCount).toBe(1); expect(value.pool.idleCount).toBe(1);
    await vi.advanceTimersByTimeAsync(29_900); expect(value.pool.totalCount).toBe(0); expect(value.pool.ending).toBe(false);
  });

  it("closes a newly created pool when attachment fails without caching a half runtime", async () => {
    const environment = env(); const on = vi.spyOn(actualPg.Pool.prototype, "on");
    on.mockImplementationOnce(function (this: Runtime["pool"], event, listener) {
      if (event !== "release") throw new Error("Attachment must precede other pool listeners");
      void listener; throw new Error("Synthetic attachment failure with private-shaped text");
    });
    await expect(getHostedServerDatabase(environment)).rejects.toThrow("Server configuration error: hosted database pool lifecycle initialization failed.");
    const failed = required(constructed.at(-1));
    expect(failed.ending).toBe(true); expect(failed.ended).toBe(true); expect(failed.totalCount).toBe(0);
    on.mockRestore();
    const fresh = await getHostedServerDatabase(environment); expect(fresh.pool).not.toBe(failed); expect(fresh.pool.listenerCount("release")).toBe(1);
  });
});

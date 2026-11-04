// Spec: spec/federal/hosted-recovery-pool-lifecycle.yaml.
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { getHostedServerDatabase } from "../../apps/web/src/lib/hosted-server-db";
import { closeRecoveryRuntime } from "../../scripts/rehearse-hosted-recovery";

type Runtime = Awaited<ReturnType<typeof getHostedServerDatabase>>;
type Result = { command: string; rowCount: number; rows: { value: number }[] };
type Callback = (error: Error | undefined, result: Result) => void;

// Only the socket/protocol endpoint is replaced. Pool queueing/release/end and
// Kysely initialization/destroy execute their installed implementation.
class SocketFreeClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  endCalls = 0;
  connect(callback: (error?: Error) => void) { callback(); }
  query(_text: string, values?: readonly unknown[] | Callback, callback?: Callback) {
    const result: Result = { command: "SELECT", rowCount: 1, rows: [{ value: 1 }] };
    const done = typeof values === "function" ? values : callback;
    if (done) { done(undefined, result); return; }
    return Promise.resolve(result);
  }
  end(callback?: () => void) {
    this.endCalls++;
    this._ending = true;
    this.emit("end");
    callback?.();
    return Promise.resolve();
  }
}
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { Pool } = require("pg") as {
  Pool: new (config: { Client: typeof SocketFreeClient; max: number; idleTimeoutMillis: number }) => Runtime["pool"];
};
const { Kysely, PostgresDialect, sql } = require("kysely") as typeof import("../../apps/web/node_modules/kysely");
function runtime() {
  const pool = new Pool({ Client: SocketFreeClient, max: 1, idleTimeoutMillis: 0 });
  const clients: SocketFreeClient[] = [];
  pool.on("connect", client => {
    if (!(client instanceof SocketFreeClient)) throw new Error("Only the socket-free Client option is allowed");
    clients.push(client);
  });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
  return { pool, db, clients };
}
async function cleanup(value: Runtime) {
  await value.db.destroy();
  if (!value.pool.ending) await value.pool.end();
}
function closed(value: Runtime) {
  expect(value.pool.ending).toBe(true);
  expect(value.pool.ended).toBe(true);
  expect(value.pool.totalCount).toBe(0);
  expect(value.pool.idleCount).toBe(0);
}

describe("hosted recovery script actual pool lifecycle", () => {
  it("closes a raw-pool-only actual runtime after proving lazy destroy leaves it open", async () => {
    const value = runtime();
    const end = vi.spyOn(value.pool, "end");
    try {
      expect((await value.pool.query("select 1 as value")).rows).toEqual([{ value: 1 }]);
      expect(value.clients).toHaveLength(1);
      expect(value.pool.idleCount).toBe(1);
      await value.db.destroy();
      expect(value.pool.ending).toBe(false);
      expect(value.pool.ended).toBe(false);
      expect(end).not.toHaveBeenCalled();
      await expect(closeRecoveryRuntime(value)).resolves.toBeUndefined();
      closed(value);
      expect(end).toHaveBeenCalledOnce();
      expect(value.clients.map(client => client.endCalls)).toEqual([1]);
    } finally { end.mockRestore(); await cleanup(value); }
  });
  it("closes an initialized actual driver exactly once", async () => {
    const value = runtime();
    const end = vi.spyOn(value.pool, "end");
    try {
      expect((await sql<{ value: number }>`select 1 as value`.execute(value.db)).rows).toEqual([{ value: 1 }]);
      expect(value.pool.idleCount).toBe(1);
      await expect(closeRecoveryRuntime(value)).resolves.toBeUndefined();
      closed(value);
      expect(end).toHaveBeenCalledOnce();
      expect(value.clients.map(client => client.endCalls)).toEqual([1]);
    } finally { end.mockRestore(); await cleanup(value); }
  });
  it("preserves an already-ended actual pool without a second end", async () => {
    const value = runtime();
    const end = vi.spyOn(value.pool, "end");
    try {
      await value.pool.end();
      await expect(closeRecoveryRuntime(value)).resolves.toBeUndefined();
      closed(value);
      expect(end).toHaveBeenCalledOnce();
    } finally { end.mockRestore(); await cleanup(value); }
  });
  it("rejects an ending but incomplete actual pool without ending twice", async () => {
    const value = runtime();
    const client = await value.pool.connect();
    const end = vi.spyOn(value.pool, "end");
    const ending = value.pool.end();
    try {
      expect(value.pool.ending).toBe(true);
      expect(value.pool.ended).toBe(false);
      await expect(closeRecoveryRuntime(value)).rejects.toThrow("Hosted recovery pool did not finish closing");
      expect(end).toHaveBeenCalledOnce();
      expect(value.pool.ended).toBe(false);
    } finally { client.release(); await ending; end.mockRestore(); await cleanup(value); }
  });
  it("propagates a database destroy rejection without claiming closure", async () => {
    const value = runtime();
    const failure = new Error("synthetic destroy failure");
    const destroy = vi.spyOn(value.db, "destroy").mockRejectedValueOnce(failure);
    const end = vi.spyOn(value.pool, "end");
    try {
      await expect(closeRecoveryRuntime(value)).rejects.toBe(failure);
      expect(end).not.toHaveBeenCalled();
      expect(value.pool.ended).toBe(false);
    } finally { destroy.mockRestore(); end.mockRestore(); await cleanup(value); }
  });
  it("propagates a fallback pool end rejection without claiming closure", async () => {
    const value = runtime();
    const failure = new Error("synthetic end failure");
    const end = vi.spyOn(value.pool, "end").mockImplementationOnce(() => Promise.reject(failure));
    try {
      await expect(closeRecoveryRuntime(value)).rejects.toBe(failure);
      expect(end).toHaveBeenCalledOnce();
      expect(value.pool.ended).toBe(false);
    } finally { end.mockRestore(); await cleanup(value); }
  });
});

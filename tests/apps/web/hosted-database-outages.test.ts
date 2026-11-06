import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createConnection, createServer, type Socket } from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getHostedServerDatabase } from "@/lib/hosted-server-db";

const testDatabaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
function disposableDatabaseUrl(): string {
  if (!testDatabaseUrl || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(testDatabaseUrl)) throw new Error("Use an explicitly disposable loopback PostgreSQL database.");
  return testDatabaseUrl;
}
describe.skipIf(!testDatabaseUrl)("hosted database runtime outage boundaries", () => {
  const runtimes: Awaited<ReturnType<typeof getHostedServerDatabase>>[] = [];
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const { sql } = require("kysely") as typeof import("../../../apps/web/node_modules/kysely");
  async function runtime(databaseUrl = disposableDatabaseUrl()) {
    disposableDatabaseUrl();
    const url = new URL(databaseUrl);
    url.searchParams.set("application_name", `synthetic-outage-${randomUUID()}`);
    const result = await getHostedServerDatabase({ TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", DATABASE_URL: url.toString() });
    runtimes.push(result);
    return result;
  }
  afterAll(async () => { await Promise.all(runtimes.map(item => item.db.destroy())); });

  it("ends a connection whose server accepts TCP but never completes PostgreSQL startup", async () => {
    const sockets = new Set<Socket>();
    const server = createServer(socket => { sockets.add(socket); socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing synthetic sink port");
    const { pool } = await runtime(`postgresql://ai_test@127.0.0.1:${address.port}/postgres`);
    const started = performance.now();
    // A bounded assertion timeout makes the missing production deadline fail
    // promptly; destroying the synthetic sockets always releases the driver.
    const attempt = pool.query("SELECT 1").then(() => "unexpected-success", () => "rejected");
    try {
      await expect.poll(async () => Promise.race([attempt, Promise.resolve("pending")]), { timeout: 7_000 }).toBe("rejected");
      expect(performance.now() - started).toBeLessThan(7_000);
      expect(pool.totalCount).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await attempt;
    }
  }, 10_000);

  it("cancels a slow server statement and rolls back earlier transactional writes", async () => {
    const { pool, db } = await runtime();
    const settings = await pool.query("SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle");
    expect(settings.rows[0]).toEqual({ statement: "10s", lock: "3s", idle: "15s" });
    const table = `outage_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE TABLE ${table} (value text)`);
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`INSERT INTO ${table} VALUES ('synthetic-uncommitted')`);
        await expect(client.query("SELECT pg_sleep(60)")).rejects.toMatchObject({ code: "57014" });
        await client.query("ROLLBACK");
      } finally { client.release(); }
      expect((await pool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      expect((await pool.query("SELECT 1 AS recovered")).rows[0].recovered).toBe(1);
    } finally { await pool.query(`DROP TABLE ${table}`); }
    // Retain the same Kysely runtime to ensure the tested pool is the app pool.
    expect(db).toBeDefined();
  }, 20_000);

  for (const operation of ["pool", "kysely", "transaction"] as const) it(`bounds ${operation} queries when established return packets stop arriving`, async () => {
    const target = new URL(disposableDatabaseUrl());
    const sockets = new Set<Socket>();
    let upstream: Socket | undefined;
    const proxy = createServer(downstream => {
      const connection = createConnection({ host: target.hostname, port: Number(target.port) });
      upstream = connection; sockets.add(connection); sockets.add(downstream);
      downstream.on("error", () => connection.destroy());
      connection.on("error", () => downstream.destroy());
      downstream.on("close", () => { sockets.delete(downstream); connection.destroy(); });
      connection.on("close", () => { sockets.delete(connection); downstream.destroy(); });
      downstream.pipe(connection).pipe(downstream);
    });
    await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address(); if (!address || typeof address === "string") throw new Error("Missing synthetic proxy port");
    const proxied = new URL(disposableDatabaseUrl()); proxied.hostname = "127.0.0.1"; proxied.port = String(address.port);
    const { pool, db } = await runtime(proxied.toString());
    const admin = new Pool({ connectionString: disposableDatabaseUrl(), max: 1 });
    const table = `outage_${randomUUID().replaceAll("-", "")}`;
    let created = false;
    try {
      await pool.query("SELECT 1");
      if (!upstream) throw new Error("Synthetic proxy did not connect");
      // The real database continues receiving the query; only its response is
      // withheld. This tests a read timeout, not failed connection startup.
      if (operation === "transaction") { await admin.query(`CREATE TABLE ${table} (value text)`); created = true; }
      const started = performance.now();
      let attempted: Promise<unknown>;
      if (operation === "transaction") {
        attempted = db.transaction().execute(async transaction => {
          await sql.raw(`INSERT INTO ${table} VALUES ('synthetic-uncommitted')`).execute(transaction);
          upstream?.pause();
          await sql`SELECT 1`.execute(transaction);
        });
      } else {
        upstream.pause();
        attempted = operation === "pool" ? pool.query("SELECT 1") : sql`SELECT 1`.execute(db);
      }
      await expect(attempted).rejects.toThrow(/Query read timeout|closed|connection/i);
      expect(performance.now() - started).toBeLessThan(18_000);
      expect(pool.totalCount).toBe(0);
      expect(pool.idleCount).toBe(0);
      if (created) expect((await admin.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      // A new connection is established; no timed-out mutation is replayed.
      expect((await sql<{ recovered: number }>`SELECT 1 AS recovered`.execute(db)).rows[0].recovered).toBe(1);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => proxy.close(() => resolve()));
      if (created) await admin.query(`DROP TABLE ${table}`);
      await admin.end();
    }
  }, 20_000);

  it("bounds exhausted-pool waits and serves later requests after clients are released", async () => {
    const { pool } = await runtime();
    const clients: Awaited<ReturnType<typeof pool.connect>>[] = [];
    try {
      for (let index = 0; index < 10; index++) clients.push(await pool.connect());
      const started = performance.now();
      await expect(pool.connect()).rejects.toThrow(/timeout/i);
      expect(performance.now() - started).toBeLessThan(7_000);
      expect(pool.waitingCount).toBe(0);
    } finally { for (const client of clients) client.release(); }
    expect((await pool.query("SELECT 1 AS recovered")).rows[0].recovered).toBe(1);
  }, 10_000);

  it("discards a killed idle connection without emitting private diagnostics and reconnects", async () => {
    const { pool } = await runtime();
    const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    const client = await pool.connect();
    const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    client.release();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Without an application error listener, pg emits an unhandled error.
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      await expect.poll(() => pool.totalCount).toBe(0);
      expect(diagnostic).toHaveBeenCalledWith("[availability] Hosted database connection lost; a new connection will be required.");
      expect(diagnostic.mock.calls.every(call => call.length === 1 && typeof call[0] === "string" && !call[0].includes("postgresql:"))).toBe(true);
      expect((await pool.query("SELECT 1 AS recovered")).rows[0].recovered).toBe(1);
    } finally { diagnostic.mockRestore(); await admin.end(); }
  });
});

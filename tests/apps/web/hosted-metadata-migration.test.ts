import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateHostedWorkspaceMetadata } from "../../../apps/web/src/lib/hosted-workspace-metadata-migration";
import { sanitizeWorkspaceForHostedStorage } from "../../../apps/web/src/lib/hosted-privacy";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";

const url = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!url)("atomic legacy metadata cleanup against disposable PostgreSQL", () => {
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const admin = new Pool({ connectionString: url, max: 1 });
  const schema = `metadata_test_${randomUUID().replaceAll("-", "")}`;
  const scoped = new URL(url ?? "postgresql://localhost:1/unused");
  scoped.searchParams.set("options", `-csearch_path=${schema}`);
  const pool = new Pool({ connectionString: scoped.toString(), max: 2 });
  let created = false;
  beforeAll(async () => {
    if (!url || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use an explicitly disposable loopback PostgreSQL database.");
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await pool.query("CREATE TABLE hosted_workspace_shells (owner_id text NOT NULL, workspace_id text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, workspace jsonb NOT NULL, PRIMARY KEY(owner_id,workspace_id))");
  });
  beforeEach(async () => { await pool.query("TRUNCATE hosted_workspace_shells"); });
  afterAll(async () => {
    await pool.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  function legacy(id = "shared") {
    const record = createWorkspaceRecord(id, { now: "2026-10-24T12:00:00.000Z" });
    record.returnSummary.targetTaxYear = null;
    return { ...record, privateLegacyNotes: "Synthetic Person SSN 123-45-6789" };
  }
  async function insert(owner: string, record: ReturnType<typeof legacy>, id = record.id) {
    await pool.query("INSERT INTO hosted_workspace_shells VALUES ($1,$2,$3,$4,$5::jsonb)", [owner, id, record.createdAt, record.updatedAt, JSON.stringify(record)]);
  }
  async function dump() { return (await pool.query("SELECT owner_id,workspace_id,created_at::text,updated_at::text,workspace FROM hosted_workspace_shells ORDER BY owner_id,workspace_id")).rows; }

  it("defaults to a nonmutating dry run with counts and no private metadata", async () => {
    await insert("owner_a", legacy());
    const before = await dump();
    expect(await migrateHostedWorkspaceMetadata(pool)).toEqual({ mode: "dry-run", examined: 1, changed: 1, unchanged: 0 });
    expect(await dump()).toEqual(before);
  });
  it("removes legacy private fields for both owners while preserving identity, timestamps and unknown years", async () => {
    await insert("owner_a", legacy());
    await insert("owner_b", legacy());
    const before = await dump();
    expect(await migrateHostedWorkspaceMetadata(pool, { apply: true })).toEqual({ mode: "apply", examined: 2, changed: 2, unchanged: 0 });
    const after = await dump();
    expect(after.map(({ workspace: _workspace, ...identity }) => identity)).toEqual(before.map(({ workspace: _workspace, ...identity }) => identity));
    for (const row of after) {
      expect(row.workspace).toEqual(sanitizeWorkspaceForHostedStorage(legacy()));
      expect(row.workspace.returnSummary.targetTaxYear).toBeNull();
    }
    expect(JSON.stringify(after)).not.toContain("123-45-6789");
    expect(await migrateHostedWorkspaceMetadata(pool, { apply: true })).toEqual({ mode: "apply", examined: 2, changed: 0, unchanged: 2 });
  });
  it.each(["invalid shape", "identity mismatch"])("rolls back earlier changed rows after %s", async (problem) => {
    await insert("owner_a", legacy("first"));
    const record = legacy("second");
    if (problem === "invalid shape") Object.assign(record.summary, { totalDocuments: "private text" });
    await insert("owner_z", record, problem === "identity mismatch" ? "different-id" : record.id);
    const before = await dump();
    await expect(migrateHostedWorkspaceMetadata(pool, { apply: true })).rejects.toThrow("failed before commit");
    expect(await dump()).toEqual(before);
  });
  it("honors an operator's row limit without partially mutating the dataset", async () => {
    await insert("owner_a", legacy());
    await insert("owner_b", legacy());
    const before = await dump();
    await expect(migrateHostedWorkspaceMetadata(pool, { apply: true, maximumRows: 1 })).rejects.toThrow("failed before commit");
    expect(await dump()).toEqual(before);
  });
  it("rejects invalid limits before starting a transaction", async () => {
    for (const maximumRows of [0, -1, 1.5, NaN, Infinity, 10001]) {
      await expect(migrateHostedWorkspaceMetadata(pool, { maximumRows })).rejects.toThrow("row limit");
    }
  });
  it("can reapply cleanup after restoring a legacy backup without changing tenant identity", async () => {
    await insert("owner_a", legacy());
    const original = await dump();
    await migrateHostedWorkspaceMetadata(pool, { apply: true });
    const clean = await dump();
    // Synthetic logical restoration of the old row. An actual pg_dump/restore
    // rehearsal is separate evidence; restoring an old backup reintroduces PII.
    await pool.query("UPDATE hosted_workspace_shells SET workspace=$1::jsonb", [JSON.stringify(original[0].workspace)]);
    expect(await dump()).toEqual(original);
    await migrateHostedWorkspaceMetadata(pool, { apply: true });
    expect(await dump()).toEqual(clean);
  });
});

describe("metadata migration availability reporting", () => {
  it("does not include credentials from connection errors", async () => {
    const pool = { connect: async () => { throw new Error("postgresql://private-user:private-password@host/db"); } } as unknown as Parameters<typeof migrateHostedWorkspaceMetadata>[0];
    await expect(migrateHostedWorkspaceMetadata(pool)).rejects.toThrow("No migration transaction was started");
  });
  it("reports an uncertain commit rather than claiming rollback or success", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql === "COMMIT") throw new Error("private connection lost");
      if (sql.startsWith("SELECT count")) return { rows: [{ count: "0", bytes: "0" }] };
      return { rows: [] };
    });
    const pool = { connect: async () => ({ query, release }) } as unknown as Parameters<typeof migrateHostedWorkspaceMetadata>[0];
    await expect(migrateHostedWorkspaceMetadata(pool, { apply: true })).rejects.toThrow("could not confirm commit");
    expect(release).toHaveBeenCalledOnce();
  });
  it("bounds legacy payload bytes before loading private row values", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => sql.startsWith("SELECT count") ? { rows: [{ count: "1", bytes: "67108865" }] } : { rows: [] });
    const pool = { connect: async () => ({ query, release }) } as unknown as Parameters<typeof migrateHostedWorkspaceMetadata>[0];
    await expect(migrateHostedWorkspaceMetadata(pool, { apply: true })).rejects.toThrow("failed before commit");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("SELECT owner_id"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});

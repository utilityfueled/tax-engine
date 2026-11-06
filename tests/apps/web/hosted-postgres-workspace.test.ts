import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHostedPostgresWorkspaceStoreFactory } from "../../../apps/web/src/lib/hosted-postgres-workspace-store";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";
import { getHostedPersistenceRuntimeConfig } from "../../../apps/web/src/lib/workspace-persistence";

// Never reuse DATABASE_URL. A separate schema isolates this suite from the
// concurrently running ledger tests in the explicitly disposable database.
const testDatabaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!testDatabaseUrl)("workspace privacy and isolation against disposable PostgreSQL", () => {
  const require = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as typeof import("../../../apps/web/node_modules/pg");
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  const schema = `workspace_test_${randomUUID().replaceAll("-", "")}`;
  const scopedUrl = new URL(testDatabaseUrl ?? "postgresql://localhost:1/unused");
  scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_HOSTED_PERSISTENCE_BACKEND: "postgres-s3",
    NODE_ENV: "test", DATABASE_URL: scopedUrl.toString() };
  const owner = { ownerId: "synthetic-owner-a", ownerLabel: null, scopeKey: "hosted-owner:synthetic-owner-a" };
  const store = createHostedPostgresWorkspaceStoreFactory(env)(owner, getHostedPersistenceRuntimeConfig(env));
  let created = false;
  beforeAll(async () => {
    if (!testDatabaseUrl || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(testDatabaseUrl)) {
      throw new Error("Use an explicitly disposable loopback PostgreSQL database.");
    }
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await ensureHostedAppSchema(env);
  });
  afterAll(async () => {
    if (created) {
      const { db } = await getHostedServerDatabase(env);
      await db.destroy();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await admin.end();
  });

  function workspace(id: string) {
    const record = createWorkspaceRecord(id, { now: "2026-10-24T12:00:00.000Z" });
    record.documents = [{ id: "doc-1", name: "Casey Sample W2.pdf", taxYear: 2026, size: 42,
      uploadedAt: record.createdAt, kind: "w2", coverage: "supported", label: "Casey Sample", notes: "wages 98765.43",
      matchedFixtureId: null, seededFactIds: ["wages"], blobStorageKey: "private/raw/source" }];
    Object.assign(record, { futurePrivateField: "Casey Sample 98765.43" });
    return record;
  }

  it("writes only allowlisted metadata into actual JSONB rows", async () => {
    const saved = await store.save(owner.ownerId, workspace("private-input"));
    expect(saved.documents[0]).toMatchObject({ name: "Document 1", label: "Form W-2", taxYear: 2026, blobStorageKey: null });
    const { pool } = await getHostedServerDatabase(env);
    const stored = await pool.query("SELECT workspace::text AS body FROM hosted_workspace_shells WHERE owner_id=$1 AND workspace_id=$2", [owner.ownerId, "private-input"]);
    for (const value of ["Casey Sample", "98765.43", "private/raw", "futurePrivateField"]) expect(stored.rows[0].body).not.toContain(value);
    expect(await store.get(owner.ownerId, "private-input")).toEqual(saved);
  });

  it("isolates reads, lists, upserts and deletion for the same workspace ID across tenants", async () => {
    await store.save(owner.ownerId, workspace("shared-id"));
    const other = workspace("shared-id");
    other.updatedAt = "2026-10-24T13:00:00.000Z";
    await store.save("synthetic-owner-b", other);
    expect(await store.get("unknown-owner", "shared-id")).toBeNull();
    expect(await store.listByOwner("unknown-owner")).toEqual([]);
    expect((await store.get(owner.ownerId, "shared-id"))?.updatedAt).toBe("2026-10-24T12:00:00.000Z");
    expect((await store.listByOwner("synthetic-owner-b")).map((row) => row.id)).toEqual(["shared-id"]);
    await store.delete(owner.ownerId, "shared-id");
    expect(await store.get(owner.ownerId, "shared-id")).toBeNull();
    expect((await store.get("synthetic-owner-b", "shared-id"))?.updatedAt).toBe(other.updatedAt);
  });

  it("sanitizes legacy rows on reads without silently deleting their stored source", async () => {
    const record = workspace("legacy-row");
    const { pool } = await getHostedServerDatabase(env);
    await pool.query("INSERT INTO hosted_workspace_shells VALUES ($1,$2,$3,$4,$5::jsonb)",
      [owner.ownerId, record.id, record.createdAt, record.updatedAt, JSON.stringify(record)]);
    expect(JSON.stringify(await store.get(owner.ownerId, record.id))).not.toContain("Casey Sample");
    expect(JSON.stringify(await store.listByOwner(owner.ownerId))).not.toContain("Casey Sample");
    // Removing legacy private values from historical rows/backups requires the
    // separately rehearsed migration; a safe read does not establish erasure.
    expect((await pool.query("SELECT workspace::text AS body FROM hosted_workspace_shells WHERE workspace_id=$1", [record.id])).rows[0].body).toContain("Casey Sample");
  });

  it("keeps the previous stored shell when a malformed update fails validation", async () => {
    const record = workspace("reject-update");
    await store.save(owner.ownerId, record);
    Object.assign(record.summary, { totalDocuments: "Casey Sample" });
    await expect(store.save(owner.ownerId, record)).rejects.toThrow(/invalid workspace shell metadata/);
    expect((await store.get(owner.ownerId, record.id))?.summary.totalDocuments).toBe(0);
  });
});

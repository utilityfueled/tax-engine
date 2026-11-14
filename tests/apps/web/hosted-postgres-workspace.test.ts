import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReturnWorkspaceRecord } from "../../../packages/contracts/src/index";
import { createHostedWorkspaceRouteHandlers } from "../../../apps/web/src/lib/hosted-workspace-route";
import { createHostedPostgresWorkspaceStoreFactory } from "../../../apps/web/src/lib/hosted-postgres-workspace-store";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";
import { createWorkspaceRecord, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import { createInMemoryHostedDocumentBlobStore, getHostedPersistenceRuntimeConfig, loadPersistedWorkspace, savePersistedWorkspace } from "../../../apps/web/src/lib/workspace-persistence";

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

  it("serializes same-revision sibling updates and rejects deleted and foreign revisions in actual PostgreSQL", async () => {
    const workspaceId = "versioned-cross-tab";
    const original = await store.writeVersioned(owner.ownerId, workspace(workspaceId), { kind: "create" });
    const other = await store.writeVersioned("other-owner", workspace(workspaceId), { kind: "create" });
    const first = { ...workspace(workspaceId), documents: [] };
    const second = { ...workspace(workspaceId), returnSummary: { ...first.returnSummary, targetTaxYear: 2026 } };
    const expected = { kind: "update", revision: original.revision } as const;
    const results = await Promise.allSettled([
      store.writeVersioned(owner.ownerId, first, expected),
      store.writeVersioned(owner.ownerId, second, expected)
    ]);
    const winner = results.find(result => result.status === "fulfilled");
    const stale = results.find(result => result.status === "rejected");
    expect(winner?.value.revision).not.toBe(original.revision);
    expect(stale?.reason).toHaveProperty("name", "HostedWorkspaceWriteRejectedError");
    expect(await store.getVersioned(owner.ownerId, workspaceId)).toEqual(winner?.value);
    await expect(store.writeVersioned(owner.ownerId, first, { kind: "update", revision: other.revision })).rejects.toMatchObject({ name: "HostedWorkspaceWriteRejectedError" });
    await expect(store.delete(owner.ownerId, workspaceId, original.revision)).rejects.toMatchObject({ name: "HostedWorkspaceWriteRejectedError" });
    const current = await store.getVersioned(owner.ownerId, workspaceId);
    if (!current) throw new Error("Missing expected revision in synthetic test");
    await store.delete(owner.ownerId, workspaceId, current.revision);
    await expect(store.writeVersioned(owner.ownerId, first, { kind: "update", revision: current.revision })).rejects.toMatchObject({ name: "HostedWorkspaceWriteRejectedError" });
    expect(await store.getVersioned(owner.ownerId, workspaceId)).toBeNull();
    expect(await store.getVersioned("other-owner", workspaceId)).toEqual(other);
  });

  it("reopens the authenticated browser original across an actual JSONB read", async () => {
    const routeEnv = { ...env, NODE_ENV: "development", TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: owner.ownerId };
    const workspaceId = "private-mirror-jsonb";
    const context = { workspaceId };
    const handlers = createHostedWorkspaceRouteHandlers({ env: routeEnv, hostedStore: store,
      hostedDocumentBlobStore: createInMemoryHostedDocumentBlobStore() });
    const fetchFn: typeof fetch = (input, init) => {
      const request = new Request(new URL(String(input), "https://tax.example"), init);
      return request.method === "POST" ? handlers.save(request, context) : handlers.get(request, context);
    };
    const values = new Map<string, string>();
    const browserStorage: Storage = { length: 0, getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); },
      key: index => [...values.keys()][index] ?? null, clear: () => values.clear() };
    const options = { deploymentMode: "hosted" as const, fetchFn, browserStorage, workspaceId };
    const initial = await loadPersistedWorkspace({ ...options, createIfMissing: true });
    if (!initial.workspace || !initial.workspaceRevision) throw new Error("Expected a newly created hosted row");
    const label = "Private Synthetic JSONB.pdf";
    const local = ingestFilesIntoWorkspace(initial.workspace, [{ name: label, size: 12 }]);
    const saved = await savePersistedWorkspace({ ...options, workspace: local, workspaceRevision: initial.workspaceRevision, ownerScopeKey: owner.scopeKey });
    const direct = await loadPersistedWorkspace({ ...options, browserStorage: undefined });
    expect(direct.workspace?.documents[0]?.name).toBe("Document 1");
    const reopened = await loadPersistedWorkspace(options);
    expect(saved.localMirrorSaved).toBe(true);
    expect(reopened.localMirrorMatched).toBe(true);
    expect(reopened.workspaceRevision).toBe(saved.workspaceRevision);
    expect(reopened.workspace?.documents[0]?.name).toBe(label);
  });

  it("enforces the hard owner quota across independent connections and preserves updates at capacity", async () => {
    const ownerId = "synthetic-owner-quota";
    const otherOwner = "synthetic-owner-quota-other";
    const record = workspace("base-return");
    const { pool } = await getHostedServerDatabase(env);
    await pool.query(`INSERT INTO hosted_workspace_shells
      SELECT $1, 'existing-' || position, $2, $2, jsonb_set($3::jsonb, '{id}', to_jsonb('existing-' || position))
      FROM generate_series(1, 199) AS position`, [ownerId, record.createdAt, JSON.stringify(record)]);

    const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => (
      store.save(ownerId, workspace(`contender-${index}`))
    )));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    for (const attempt of attempts) {
      if (attempt.status === "rejected") expect(attempt.reason).toHaveProperty("message", expect.stringContaining("maximum number of returns (200)"));
    }
    expect(await store.listByOwner(ownerId)).toHaveLength(200);
    const updated = { ...workspace("existing-1"), updatedAt: "2026-10-24T14:00:00.000Z" };
    await expect(store.save(ownerId, updated)).resolves.toMatchObject({ id: updated.id, updatedAt: updated.updatedAt });
    await expect(store.save(otherOwner, workspace("contender-0"))).resolves.toMatchObject({ id: "contender-0" });
    await store.delete(ownerId, updated.id);
    await expect(store.save(ownerId, workspace("replacement"))).resolves.toMatchObject({ id: "replacement" });
    expect(await store.listByOwner(ownerId)).toHaveLength(200);
  });

  it("does not recreate a concurrently deleted return when the legacy owner still has 200 returns", async () => {
    const ownerId = "synthetic-legacy-over-limit";
    const record = workspace("base-return");
    const { pool } = await getHostedServerDatabase(env);
    await pool.query(`INSERT INTO hosted_workspace_shells
      SELECT $1, 'legacy-' || position, $2, $2, jsonb_set($3::jsonb, '{id}', to_jsonb('legacy-' || position))
      FROM generate_series(1, 201) AS position`, [ownerId, record.createdAt, JSON.stringify(record)]);
    await expect(store.save(ownerId, workspace("legacy-2"))).resolves.toMatchObject({ id: "legacy-2" });
    expect(await store.listByOwner(ownerId)).toHaveLength(201);

    const deleting = await pool.connect();
    let attempt: Promise<PromiseSettledResult<ReturnWorkspaceRecord>[]> | undefined;
    try {
      await deleting.query("BEGIN");
      const session = await deleting.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const pid = session.rows[0]?.pid;
      if (!pid) throw new Error("No backend PID for the synthetic delete transaction.");
      const removed = await deleting.query("DELETE FROM hosted_workspace_shells WHERE owner_id = $1 AND workspace_id = $2", [ownerId, "legacy-1"]);
      expect(removed.rowCount).toBe(1);
      attempt = Promise.allSettled([store.save(ownerId, workspace("legacy-1"))]);

      // Observe the real blocked write before committing the competing delete.
      await expect.poll(async () => (await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS waiting", [pid]
      )).rows[0]?.waiting, { timeout: 1000, interval: 10 }).toBe(true);
      await deleting.query("COMMIT");
      await expect(attempt).resolves.toEqual([{
        status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("maximum number of returns (200)") })
      }]);
    } finally {
      try { await deleting.query("ROLLBACK"); } finally { deleting.release(); }
      await attempt;
    }
    expect(await store.get(ownerId, "legacy-1")).toBeNull();
    expect(await store.listByOwner(ownerId)).toHaveLength(200);
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

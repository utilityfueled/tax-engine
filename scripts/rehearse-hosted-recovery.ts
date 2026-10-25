import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../apps/web/src/lib/hosted-server-db";
import { migrateHostedWorkspaceMetadata } from "../apps/web/src/lib/hosted-workspace-metadata-migration";
import { createWorkspaceRecord } from "../apps/web/src/lib/workspace-storage";

/** Synthetic, local-only PostgreSQL dump/restore rehearsal. Never DATABASE_URL. */
async function main() {
  const rawUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
  if (!rawUrl) throw new Error("A dedicated disposable database is required.");
  const url = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port
    || url.username !== "ai_test" || url.password || url.search || url.hash) {
    throw new Error("Use a disposable ai_test database on an explicit loopback port, without URL options.");
  }
  const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const { Pool } = require("pg") as {
    Pool: new (config: { connectionString: string; max: number }) => Awaited<ReturnType<typeof getHostedServerDatabase>>["pool"];
  };
  const admin = new Pool({ connectionString: rawUrl, max: 1 });
  const schema = `recovery_test_${randomUUID().replaceAll("-", "")}`;
  const scoped = new URL(rawUrl);
  scoped.searchParams.set("options", `-csearch_path=${schema}`);
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", DATABASE_URL: scoped.toString() };
  const directory = await mkdtemp(path.join(tmpdir(), "tax-hosted-recovery-"));
  await chmod(directory, 0o700);
  const backup = path.join(directory, "synthetic.dump");
  const pgBin = process.env.TAX_ENGINE_TEST_POSTGRES_BIN ?? "";
  let created = false;
  let runtime: Awaited<ReturnType<typeof getHostedServerDatabase>> | undefined;
  function runPg(command: "pg_dump" | "pg_restore", args: string[]) {
    const result = spawnSync(path.join(pgBin, command), args, { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`${command} failed; no private database output is printed.`);
  }
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await ensureHostedAppSchema(env);
    runtime = await getHostedServerDatabase(env);
    const { pool } = runtime;
    const workspace = createWorkspaceRecord("synthetic-shared-return", { now: "2026-10-24T12:00:00.000Z" });
    workspace.returnSummary.targetTaxYear = null;
    Object.assign(workspace, { legacyPrivateNotes: "Synthetic Person 123-45-6789" });
    for (const owner of ["synthetic-owner-a", "synthetic-owner-b"]) {
      await pool.query("INSERT INTO hosted_workspace_shells VALUES ($1,$2,$3,$4,$5::jsonb)", [owner, workspace.id, workspace.createdAt, workspace.updatedAt, JSON.stringify(workspace)]);
      await pool.query("INSERT INTO hosted_account_profiles (user_id,billing_email) VALUES ($1,$2)", [owner, `${owner}@example.invalid`]);
      await pool.query("INSERT INTO hosted_reminder_settings (owner_id) VALUES ($1)", [owner]);
    }
    await pool.query("INSERT INTO hosted_billing_events (event_id,event_type,created_at) VALUES ('evt_synthetic','checkout.session.completed','2026-10-24T12:00:00Z')");
    await pool.query("INSERT INTO hosted_billing_subscriptions (stripe_subscription_id,owner_id,stripe_customer_id,plan_id,status,last_event_id,last_event_created_at) VALUES ('sub_synthetic','synthetic-owner-a','cus_synthetic','plus','active','evt_synthetic','2026-10-24T12:00:00Z')");
    await pool.query("INSERT INTO hosted_ai_credit_purchases (checkout_session_id,owner_id,amount_paid_cents,credited_budget_cents) VALUES ('cs_synthetic','synthetic-owner-a',100,100)");
    await pool.query("INSERT INTO hosted_ai_usage_ledger (request_id,owner_id,cycle_key,task,provider,estimated_cost_cents,included_charge_cents) VALUES ('legacy_synthetic','synthetic-owner-a','2026-10','summary','synthetic',1,1)");
    await pool.query("INSERT INTO hosted_ai_reservations (owner_id,request_id,payload_digest,cycle_key,included_budget_cents,included_reserved_cents,purchased_reserved_cents,included_charge_cents,state) VALUES ('synthetic-owner-a','request_synthetic','digest_synthetic','2026-10',100,1,0,1,'settled')");
    await pool.query("INSERT INTO hosted_ai_attempts (owner_id,request_id,attempt,task,profile_id,model_id,state,started_at,completed_at,usage,provider_cost_usd,pricing_effective_from) VALUES ('synthetic-owner-a','request_synthetic',1,'summary','synthetic','synthetic','accepted','2026-10-24T12:00:00Z','2026-10-24T12:00:01Z','{\"inputTokens\":1,\"outputTokens\":1}',0.0000006,'2026-10-24')");
    const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename", [schema])).rows.map(row => String(row.tablename));
    assert.equal(tables.length, 9);
    async function snapshot() {
      const result: Record<string, string[]> = {};
      for (const table of tables) {
        assert.match(table, /^hosted_[a-z_]+$/);
        const rows = await pool.query(`SELECT row_to_json(t)::text AS value FROM ${table} t`);
        result[table] = rows.rows.map(row => String(row.value)).sort();
      }
      return result;
    }
    const before = await snapshot();
    const dry = await migrateHostedWorkspaceMetadata(pool);
    assert.deepEqual(dry, { mode: "dry-run", examined: 2, changed: 2, unchanged: 0 });
    assert.deepEqual(await snapshot(), before);
    runPg("pg_dump", ["--dbname", rawUrl, "--schema", schema, "--format=custom", "--no-owner", "--no-privileges", "--file", backup]);
    await chmod(backup, 0o600);
    assert.equal((await migrateHostedWorkspaceMetadata(pool, { apply: true })).changed, 2);
    const after = await snapshot();
    assert.ok(!JSON.stringify(after.hosted_workspace_shells).includes("123-45-6789"));
    for (const table of tables.filter(name => name !== "hosted_workspace_shells")) assert.deepEqual(after[table], before[table]);
    assert.equal((await pool.query("SELECT provider_cost_usd::text AS cost FROM hosted_ai_attempts")).rows[0].cost, "0.0000006");
    // Drop only the uniquely created synthetic schema, then restore its actual
    // pg_dump archive. No normal application schema is ever named here.
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    runPg("pg_restore", ["--dbname", rawUrl, "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", backup]);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await migrateHostedWorkspaceMetadata(pool, { apply: true })).changed, 2);
    assert.deepEqual(await snapshot(), after);
    assert.equal((await migrateHostedWorkspaceMetadata(pool, { apply: true })).changed, 0);
    const digest = createHash("sha256").update(JSON.stringify(after)).digest("hex");
    console.log(JSON.stringify({ result: "passed", evidence: "local-synthetic-postgresql-dump-restore", tables: tables.length, tenantWorkspaces: 2, exactCostRestored: true, metadataCleanupReapplied: true, metadataCleanupIdempotent: true, checksum: digest }));
  } finally {
    if (runtime) await runtime.db.destroy();
    if (created) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(() => {
  console.error("Local synthetic hosted recovery rehearsal failed. No staging or production recovery has been established.");
  process.exitCode = 1;
});

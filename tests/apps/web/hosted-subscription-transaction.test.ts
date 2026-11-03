import { randomUUID } from "node:crypto";
import { Pool } from "../../../apps/web/node_modules/pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { reconcileHostedStripeSubscriptionEvent, type ReconcileHostedSubscriptionInput,
  type VerifiedCurrentHostedSubscription } from "../../../apps/web/src/lib/hosted-billing-reconciliation";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";
import { getHostedSubscriptionByOwnerId } from "../../../apps/web/src/lib/hosted-billing-db";

// spec/federal/hosted-subscription-transaction.yaml. Actual PostgreSQL, isolated
// schema, synthetic sources only. Never use deployment DATABASE_URL.
const disposable = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!disposable)("hosted subscription transaction in disposable PostgreSQL", () => {
  const admin = new Pool({ connectionString: disposable, max: 1 });
  const schema = `billing_atomicity_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(disposable ?? "postgresql://localhost:1/unused");
  url.searchParams.set("options", `-csearch_path=${schema}`);
  url.searchParams.set("application_name", schema);
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_BILLING_MODE: "test",
    NODE_ENV: "test", DATABASE_URL: url.toString() };
  const time = "2027-01-15T08:00:00.000Z";
  let created = false;
  function event(id = "evt_pg_first", sub = "sub_pg_current"): ReconcileHostedSubscriptionInput {
    return { ownerId: "owner-pg", stripeSubscriptionId: sub, stripeCustomerId: "cus_pg",
      planId: "starter", status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: null,
      eventId: id, eventType: "customer.subscription.updated", eventCreatedAt: time, updatedAt: time, livemode: false };
  }
  function current(sub = "sub_pg_current", status: VerifiedCurrentHostedSubscription["status"] = "active"): VerifiedCurrentHostedSubscription {
    return { subscriptionId: sub, customerId: "cus_pg", ownerId: "owner-pg", planId: "starter",
      status, cancelAtPeriodEnd: false, currentPeriodEnd: null, livemode: false };
  }
  async function rows() {
    const { pool } = await getHostedServerDatabase(env);
    const [events, subscriptions, writes] = await Promise.all([
      pool.query("SELECT event_id FROM hosted_billing_events ORDER BY event_id"),
      pool.query("SELECT * FROM hosted_billing_subscriptions ORDER BY stripe_subscription_id"),
      pool.query("SELECT * FROM subscription_write_audit")
    ]);
    return { events: events.rows, subscriptions: subscriptions.rows, writes: writes.rows };
  }
  async function fault(table: "hosted_billing_events" | "hosted_billing_subscriptions", deferred = false) {
    await admin.query(`CREATE FUNCTION ${schema}.fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic atomicity fault'; END $$`);
    await admin.query(deferred
      ? `CREATE CONSTRAINT TRIGGER synthetic_fault AFTER INSERT ON ${schema}.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_write()`
      : `CREATE TRIGGER synthetic_fault BEFORE INSERT ON ${schema}.${table} FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_write()`);
  }
  async function clearFault(table: string) {
    await admin.query(`DROP TRIGGER synthetic_fault ON ${schema}.${table}`);
    await admin.query(`DROP FUNCTION ${schema}.fail_write()`);
  }
  beforeAll(async () => {
    if (!disposable || !/^postgres(?:ql)?:\/\/(?:ai_test@)?(?:127\.0\.0\.1|localhost):/.test(disposable)) {
      throw new Error("Use an explicitly disposable loopback PostgreSQL database.");
    }
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    await ensureHostedAppSchema(env);
    await admin.query(`CREATE TABLE ${schema}.subscription_write_audit (subscription_id text NOT NULL)`);
    await admin.query(`CREATE FUNCTION ${schema}.audit_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO ${schema}.subscription_write_audit VALUES (NEW.stripe_subscription_id); RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER write_audit AFTER INSERT OR UPDATE ON ${schema}.hosted_billing_subscriptions FOR EACH ROW EXECUTE FUNCTION ${schema}.audit_write()`);
  });
  beforeEach(async () => {
    await admin.query(`TRUNCATE ${schema}.hosted_billing_events, ${schema}.hosted_billing_subscriptions, ${schema}.subscription_write_audit`);
  });
  afterAll(async () => {
    if (created) {
      const { db } = await getHostedServerDatabase(env); await db.destroy();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await admin.end();
  });

  it("rolls back subscription and receipt on a receipt fault", async () => {
    await fault("hosted_billing_events", true); // fail COMMIT after the attempted state write
    try {
      await expect(reconcileHostedStripeSubscriptionEvent(env, event(), async () => current())).rejects.toThrow("synthetic atomicity fault");
      expect(await rows()).toEqual({ events: [], subscriptions: [], writes: [] });
    } finally { await clearFault("hosted_billing_events"); }
    expect((await reconcileHostedStripeSubscriptionEvent(env, event(), async () => current())).outcome).toBe("applied");
    const saved = await rows(); expect(saved.events).toEqual([{ event_id: "evt_pg_first" }]);
    expect(saved.subscriptions).toHaveLength(1); expect(saved.writes).toHaveLength(1);
    expect(saved.subscriptions[0]).toMatchObject({ owner_id: "owner-pg", stripe_customer_id: "cus_pg", status: "active" });
  });
  it("rolls back the event claim on a subscription fault", async () => {
    await fault("hosted_billing_subscriptions");
    try {
      await expect(reconcileHostedStripeSubscriptionEvent(env, event(), async () => current())).rejects.toThrow("synthetic atomicity fault");
      expect(await rows()).toEqual({ events: [], subscriptions: [], writes: [] });
    } finally { await clearFault("hosted_billing_subscriptions"); }
    await reconcileHostedStripeSubscriptionEvent(env, event(), async () => current());
    expect((await rows()).events).toHaveLength(1);
  });
  it("preserves canceled history when replacement insertion fails", async () => {
    await reconcileHostedStripeSubscriptionEvent(env, event("evt_pg_old", "sub_pg_old"), async () => current("sub_pg_old", "canceled"));
    const before = await rows();
    await fault("hosted_billing_subscriptions");
    try {
      await expect(reconcileHostedStripeSubscriptionEvent(env, event(), async () => current())).rejects.toThrow("synthetic atomicity fault");
      expect(await rows()).toEqual(before);
    } finally { await clearFault("hosted_billing_subscriptions"); }
    await reconcileHostedStripeSubscriptionEvent(env, event(), async () => current());
    const after = await rows(); expect(after.subscriptions).toHaveLength(1);
    expect(after.subscriptions[0]).toMatchObject({ stripe_subscription_id: "sub_pg_current", status: "active" });
    expect(after.events).toHaveLength(2);
  });
  it("serializes concurrent copies of one event", async () => {
    const load = vi.fn(async () => current());
    const results = await Promise.all([reconcileHostedStripeSubscriptionEvent(env, event(), load), reconcileHostedStripeSubscriptionEvent(env, event(), load)]);
    expect(results.map((row) => row.outcome).sort()).toEqual(["applied", "duplicate"]);
    expect(load).toHaveBeenCalledTimes(1);
    const saved = await rows(); expect(saved.events).toHaveLength(1); expect(saved.subscriptions).toHaveLength(1); expect(saved.writes).toHaveLength(1);
  });
  it("serializes authoritative reads and state commits", async () => {
    let releaseFirst: () => void = () => { throw new Error("first load not entered"); };
    const firstBarrier = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let enteredFirst: () => void = () => { throw new Error("first load not started"); };
    const entered = new Promise<void>((resolve) => { enteredFirst = resolve; });
    const calls: string[] = [];
    const first = reconcileHostedStripeSubscriptionEvent(env, event("evt_z_same_second"), async () => {
      calls.push("first"); enteredFirst(); await firstBarrier; return current();
    });
    await entered;
    const second = reconcileHostedStripeSubscriptionEvent(env, event("evt_a_same_second"), async () => {
      calls.push("second"); return current("sub_pg_current", "past-due");
    });
    releaseFirst(); await Promise.all([first, second]);
    expect(calls).toEqual(["first", "second"]);
    const saved = await rows(); expect(saved.events).toHaveLength(2);
    expect(saved.subscriptions[0]).toMatchObject({ last_event_id: "evt_a_same_second", status: "past-due" });
  });
  it("preserves an active replacement against a late canceled event", async () => {
    await reconcileHostedStripeSubscriptionEvent(env, event(), async () => current());
    const before = await rows();
    const result = await reconcileHostedStripeSubscriptionEvent(env, event("evt_late_canceled", "sub_pg_old"), async () => current("sub_pg_old", "canceled"));
    expect(result.outcome).toBe("superseded");
    const after = await rows(); expect(after.subscriptions).toEqual(before.subscriptions); expect(after.writes).toEqual(before.writes); expect(after.events).toHaveLength(2);
    expect(await getHostedSubscriptionByOwnerId(env, "owner-pg")).toMatchObject({ subscriptionId: "sub_pg_current", status: "active" });
  });
  it("releases rollback locks and discards an uncertain client", async () => {
    await expect(reconcileHostedStripeSubscriptionEvent(env, event(), async () => {
      const active = await admin.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'", [schema]);
      expect(active.rows).toHaveLength(1);
      const pid: unknown = active.rows[0]?.pid;
      if (typeof pid !== "number") throw new Error("Missing synthetic backend PID");
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      return current();
    })).rejects.toThrow(/terminat|closed|connection/i);
    expect(await rows()).toEqual({ events: [], subscriptions: [], writes: [] });
    await reconcileHostedStripeSubscriptionEvent(env, event(), async () => current());
    expect((await rows()).events).toHaveLength(1);
  });
  it("deduplicates a retry after commit acknowledgment loss", async () => {
    const load = vi.fn(async () => current());
    await expect((async () => {
      await reconcileHostedStripeSubscriptionEvent(env, event(), load);
      throw new Error("synthetic response lost after commit");
    })()).rejects.toThrow("synthetic response lost after commit");
    const before = await rows();
    expect((await reconcileHostedStripeSubscriptionEvent(env, event(), load)).outcome).toBe("duplicate");
    expect(await rows()).toEqual(before); expect(load).toHaveBeenCalledTimes(1);
    const { pool } = await getHostedServerDatabase(env);
    expect((await pool.query("SELECT COUNT(*)::int AS count FROM hosted_ai_credit_purchases")).rows).toEqual([{ count: 0 }]);
  });
});

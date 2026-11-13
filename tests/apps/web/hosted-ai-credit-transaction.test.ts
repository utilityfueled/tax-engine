import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "../../../apps/web/node_modules/pg";
vi.mock("server-only", () => ({}));
import { recordHostedAiCreditPurchase } from "../../../apps/web/src/lib/hosted-ai-usage-db";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";

// Spec: federal/hosted-webhook-delivery.yaml. Only a dedicated local test cluster.
const disposable = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
describe.skipIf(!disposable)("paid Stripe Checkout atomic credit persistence", () => {
  const schema = `credit_transaction_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(disposable ?? "postgresql://ai_test@127.0.0.1:1/unused");
  const adminUrl = url.toString();
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "test", DATABASE_URL: url.toString() };
  const purchase = { checkoutSessionId: "cs_synthetic_credit", ownerId: "synthetic-credit-owner",
    stripeCustomerId: "cus_synthetic_credit", amountPaidCents: 1500, creditedBudgetCents: 1000,
    currency: "usd", createdAt: "2026-11-12T15:04:05Z", eventId: "evt_synthetic_paid", eventType: "checkout.session.completed" };
  let created = false;
  let admin: Pool;

  async function rows() {
    const { rows: events } = await admin.query(`SELECT event_id, event_type FROM ${schema}.hosted_billing_events ORDER BY event_id`);
    const { rows: credits } = await admin.query(`SELECT checkout_session_id, owner_id, stripe_customer_id,
      amount_paid_cents::text, credited_budget_cents::text, currency FROM ${schema}.hosted_ai_credit_purchases`);
    return { events, credits };
  }

  beforeAll(async () => {
    const original = new URL(adminUrl);
    if (!["postgresql:", "postgres:"].includes(original.protocol) || !["127.0.0.1", "localhost"].includes(original.hostname)
      || original.username !== "ai_test" || !original.port || original.password || original.hash || original.search) {
      throw new Error("Use a dedicated disposable loopback database without URL options.");
    }
    admin = new Pool({ connectionString: adminUrl, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await ensureHostedAppSchema(env);
    await admin.query(`INSERT INTO ${schema}.hosted_ai_storage_mode (mode) VALUES ('test')`);
  });
  beforeEach(async () => {
    await admin.query(`TRUNCATE ${schema}.hosted_ai_credit_purchases, ${schema}.hosted_billing_events`);
  });
  afterAll(async () => {
    if (created) {
      const { db, pool } = await getHostedServerDatabase(env);
      await db.destroy();
      if (!pool.ending && !pool.ended) await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await admin?.end();
  });

  it("rolls back both credit and receipt on a deferred PostgreSQL failure", async () => {
    await admin.query(`CREATE FUNCTION ${schema}.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deferred receipt fault'; END $$`);
    await admin.query(`CREATE CONSTRAINT TRIGGER reject_receipt AFTER INSERT ON ${schema}.hosted_billing_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_receipt()`);
    try {
      await expect(recordHostedAiCreditPurchase(env, purchase)).rejects.toThrow("synthetic deferred receipt fault");
      expect(await rows()).toEqual({ events: [], credits: [] });
    } finally {
      await admin.query(`DROP TRIGGER reject_receipt ON ${schema}.hosted_billing_events`);
      await admin.query(`DROP FUNCTION ${schema}.fail_receipt()`);
    }
    expect(await recordHostedAiCreditPurchase(env, purchase)).toBe(true);
    expect(await rows()).toEqual({ events: [{ event_id: purchase.eventId, event_type: purchase.eventType }], credits: [{
      checkout_session_id: purchase.checkoutSessionId, owner_id: purchase.ownerId, stripe_customer_id: purchase.stripeCustomerId,
      amount_paid_cents: "1500", credited_budget_cents: "1000", currency: "usd",
    }] });
  });

  it("serializes a duplicate delivery and a distinct paid event for the same Checkout", async () => {
    const later = { ...purchase, eventId: "evt_synthetic_async_paid", eventType: "checkout.session.async_payment_succeeded" };
    const outcomes = await Promise.all([purchase, later, purchase, later].map(input => recordHostedAiCreditPurchase(env, input)));
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const saved = await rows();
    expect(saved.credits).toHaveLength(1);
    expect(saved.events).toEqual([later, purchase].map(event => ({ event_id: event.eventId, event_type: event.eventType })));
  });

  it("rejects a different owner or paid amount on Checkout replay without writing another receipt", async () => {
    await recordHostedAiCreditPurchase(env, purchase);
    const baseline = await rows();
    for (const changes of [{ ownerId: "synthetic-other-owner" }, { amountPaidCents: 1499 }, { creditedBudgetCents: 999 }]) {
      await expect(recordHostedAiCreditPurchase(env, { ...purchase, ...changes, eventId: "evt_synthetic_conflict" })).rejects.toThrow(/checkout.*conflict/i);
      expect(await rows()).toEqual(baseline);
    }
  });

  it("adds only the missing receipt when the older grant matches exactly", async () => {
    await admin.query(`INSERT INTO ${schema}.hosted_ai_credit_purchases (checkout_session_id,owner_id,stripe_customer_id,amount_paid_cents,credited_budget_cents,currency)
      VALUES ($1,$2,$3,$4,$5,$6)`, [purchase.checkoutSessionId, purchase.ownerId, purchase.stripeCustomerId,
      purchase.amountPaidCents, purchase.creditedBudgetCents, purchase.currency]);
    const before = await rows();
    expect(await recordHostedAiCreditPurchase(env, purchase)).toBe(false);
    expect(await rows()).toEqual({ credits: before.credits, events: [{ event_id: purchase.eventId, event_type: purchase.eventType }] });
  });

  it("retries from a fresh connection after the database terminates a grant write", async () => {
    await admin.query(`CREATE FUNCTION ${schema}.disconnect_credit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER disconnect_credit BEFORE INSERT ON ${schema}.hosted_ai_credit_purchases
      FOR EACH ROW EXECUTE FUNCTION ${schema}.disconnect_credit()`);
    try {
      await expect(recordHostedAiCreditPurchase(env, purchase)).rejects.toThrow();
      expect(await rows()).toEqual({ events: [], credits: [] });
    } finally {
      await admin.query(`DROP TRIGGER disconnect_credit ON ${schema}.hosted_ai_credit_purchases`);
      await admin.query(`DROP FUNCTION ${schema}.disconnect_credit()`);
    }
    expect(await recordHostedAiCreditPurchase(env, purchase)).toBe(true);
    const recovered = await rows();
    expect(recovered.events).toHaveLength(1);
    expect(recovered.credits).toHaveLength(1);
  });
});

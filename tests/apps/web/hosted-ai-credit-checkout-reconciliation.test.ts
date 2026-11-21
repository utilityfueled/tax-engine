import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { Pool } from "../../../apps/web/node_modules/pg";
import { createHostedAiLedger } from "../../../apps/web/src/lib/hosted-ai-ledger";
import { getHostedAiBudgetSnapshot } from "../../../apps/web/src/lib/hosted-ai-usage-db";
import { createHostedAiCreditCheckoutRouteHandlers } from "../../../apps/web/src/lib/hosted-billing";
import { persistHostedStripeSubscription } from "../../../apps/web/src/lib/hosted-billing-db";
import { createHostedBillingWebhookRouteHandlers, signHostedBillingWebhookPayload } from "../../../apps/web/src/lib/hosted-billing-webhook";
import { ensureHostedAppSchema, getHostedServerDatabase } from "../../../apps/web/src/lib/hosted-server-db";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

const buyerId = "checkout-reconciliation-buyer";
const controlId = "checkout-reconciliation-control";
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({
  resolveHostedWorkspaceActor: async () => ({ id: "checkout-reconciliation-buyer", label: "Synthetic buyer" }),
}));
vi.mock("../../../apps/web/src/lib/hosted-ai-availability", () => ({
  canPurchaseHostedAiCredits: (_rollout: unknown, env: Record<string, string | undefined>) =>
    env.NODE_ENV === "test" && env.TAX_ENGINE_BILLING_MODE === "test",
}));

const transport = vi.hoisted(() => ({
  retrievePrice: vi.fn(async () => ({
    id: "price_checkout_reconciliation", object: "price", active: true, livemode: false, currency: "usd",
    unit_amount: 1500, unit_amount_decimal: "1500", billing_scheme: "per_unit", type: "one_time",
    recurring: null, custom_unit_amount: null, transform_quantity: null,
  })),
  createSession: vi.fn(async (params: { customer: string; client_reference_id: string; expires_at: number }) => ({
    ...params, id: "cs_test_checkout_reconciliation", object: "checkout.session", mode: "payment",
    livemode: false, currency: "usd", created: Math.floor(Date.now() / 1000),
    amount_subtotal: 1500, amount_total: 1500, url: "https://checkout.example.invalid/reconciliation",
    metadata: { purchaseKind: "ai-credit-issuance-v1" },
  })),
}));

vi.mock("../../../apps/web/node_modules/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/web/node_modules/stripe")>();
  const { webhooks } = new actual.default("sk_test_checkout_reconciliation_fixture");
  return { default: class FixtureStripe {
    static webhooks = actual.default.webhooks;
    prices = { retrieve: transport.retrievePrice };
    checkout = { sessions: { create: transport.createSession } };
    webhooks = webhooks;
  } };
});

// Spec: ops/hosted-ai-credit-checkout-reconciliation.yaml, checkout-to-exact-settlement.
const databaseUrl = process.env.TAX_ENGINE_TEST_AI_LEDGER_DATABASE_URL;
it.skipIf(!databaseUrl)("reconciles a synthetic Checkout, signed paid replay and exact purchased debit", async () => {
  const url = new URL(databaseUrl ?? "");
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "ai_test"
    || !url.port || url.password || url.search || url.hash || url.pathname !== "/postgres") {
    throw new Error("Use a dedicated disposable loopback PostgreSQL database.");
  }
  const schema = `checkout_reconciliation_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  url.searchParams.set("options", `-csearch_path=${schema}`);
  const env = {
    NODE_ENV: "test", TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_BILLING_MODE: "test",
    TAX_ENGINE_APP_URL: "https://tax.example.invalid", DATABASE_URL: url.toString(),
    STRIPE_SECRET_KEY: "sk_test_checkout_reconciliation_fixture", STRIPE_WEBHOOK_SECRET: "whsec_checkout_reconciliation_fixture",
    STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter_fixture", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus_fixture",
    STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "price_checkout_reconciliation",
    TAX_ENGINE_AI_HELPER_TOP_UP_PRICE_CENTS: "1500", TAX_ENGINE_AI_HELPER_TOP_UP_CREDIT_CENTS: "1000",
  };
  let schemaCreated = false;
  let database: Awaited<ReturnType<typeof getHostedServerDatabase>> | undefined;
  try {
    expect((await admin.query("SHOW server_version")).rows[0].server_version).toMatch(/^16\.16(?:\s|$)/);
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    database = await getHostedServerDatabase(env);
    await ensureHostedAppSchema(env);

    const customerId = "cus_checkout_reconciliation_buyer";
    const now = new Date().toISOString();
    await persistHostedStripeSubscription(env, {
      ownerId: buyerId, stripeSubscriptionId: "sub_checkout_reconciliation_buyer", stripeCustomerId: customerId,
      planId: "starter", status: "active", cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(), eventId: "evt_fixture_subscription",
      eventType: "customer.subscription.created", eventCreatedAt: now, updatedAt: now,
    });

    const ledger = createHostedAiLedger(database.pool, "test");
    const cycleKey = "2026-10";
    const buyerBudget = { ownerId: buyerId, cycleKey, includedBudgetCents: 0 };
    const controlBudget = { ownerId: controlId, cycleKey, includedBudgetCents: 100 };
    const usage = { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 200 };
    async function startUse(budget: typeof buyerBudget, requestId: string) {
      expect(await ledger.reserve({ ...budget, requestId, payloadDigest: "a".repeat(64), maximumChargeCents: 4 }))
        .toMatchObject({ accepted: true, created: true });
      const identity = { ownerId: budget.ownerId, requestId, attempt: 1 as const };
      expect(await ledger.start({ ...identity, task: "workspace-summary", profileId: "luna-high", startedAt: "2026-10-25T02:00:00Z" })).toBe(true);
      return identity;
    }
    const controlUse = await startUse(controlBudget, "control-use");
    expect(await ledger.settle({ ...controlUse, usage, accepted: true, final: true })).toMatchObject({ state: "settled", chargedCents: 1 });

    async function savedOwner(ownerId: string) {
      const tables = ["hosted_ai_credit_issuances", "hosted_ai_credit_purchases", "hosted_ai_reservations", "hosted_ai_attempts", "hosted_ai_usage_ledger"];
      return Promise.all(tables.map(async table => (await admin.query(
        `SELECT to_jsonb(row_data) AS row FROM ${schema}.${table} AS row_data WHERE owner_id=$1 ORDER BY to_jsonb(row_data)`, [ownerId],
      )).rows));
    }
    const controlOriginal = await savedOwner(controlId);
    const controlBalance = await getHostedAiBudgetSnapshot(env, controlBudget);
    expect(controlBalance).toMatchObject({ includedUsedCents: 1, includedRemainingCents: 99, purchasedBudgetCents: 0 });

    const checkout = createHostedAiCreditCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() });
    const response = await checkout.POST(new Request("https://tax.example.invalid/api/billing/ai-credits/checkout", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "127.0.0.1" }, body: JSON.stringify({
        successUrl: "https://tax.example.invalid/billing?checkout=success", cancelUrl: "https://tax.example.invalid/billing?checkout=cancel",
      }),
    }));
    expect(response.status).toBe(200);
    const session = await transport.createSession.mock.results[0].value;
    expect(transport.retrievePrice).toHaveBeenCalledTimes(1);
    expect(transport.createSession).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ checkoutUrl: session.url, sessionId: session.id, purchaseKind: "ai-credit-pack", priceCents: 1500, creditedBudgetCents: 1000 });
    const issued = await savedOwner(buyerId);
    expect(issued[0]).toEqual([{ row: expect.objectContaining({
      issuance_id: session.client_reference_id, checkout_session_id: session.id, owner_id: buyerId, stripe_customer_id: customerId,
      livemode: false, amount_paid_cents: 1500, credited_budget_cents: 1000,
    }) }]);
    expect(issued.slice(1)).toEqual([[], [], [], []]);
    expect((await admin.query(`SELECT event_id FROM ${schema}.hosted_billing_events`)).rows).toEqual([]);

    const webhook = createHostedBillingWebhookRouteHandlers({ env, rateLimitStore: createRateLimitStore() });
    const event = { id: "evt_checkout_reconciliation_paid", type: "checkout.session.completed", livemode: false,
      created: session.created, data: { object: { ...session, payment_status: "paid", url: null } } };
    const payload = JSON.stringify(event);
    async function deliverPaidEvent() {
      const delivery = await webhook.POST(new Request("https://tax.example.invalid/api/billing/webhook", {
        method: "POST", headers: { "content-type": "application/json", "x-real-ip": "127.0.0.1",
          "stripe-signature": signHostedBillingWebhookPayload(payload, env.STRIPE_WEBHOOK_SECRET) }, body: payload,
      }));
      expect(delivery.status).toBe(200);
      expect(await delivery.json()).toEqual({ acknowledged: true });
    }
    await deliverPaidEvent();
    const paid = await savedOwner(buyerId);
    expect(paid[0]).toEqual(issued[0]);
    expect(paid[1]).toEqual([{ row: expect.objectContaining({ checkout_session_id: session.id, owner_id: buyerId,
      stripe_customer_id: customerId, amount_paid_cents: 1500, credited_budget_cents: 1000, currency: "usd" }) }]);
    const receipt = async () => (await admin.query(`SELECT * FROM ${schema}.hosted_billing_events`)).rows;
    const paidReceipt = await receipt();
    expect(paidReceipt).toEqual([expect.objectContaining({ event_id: event.id, event_type: event.type,
      created_at: new Date(event.created * 1000), event_product: "ai-credit", credit_checkout_session_id: session.id })]);
    expect(await getHostedAiBudgetSnapshot(env, buyerBudget)).toMatchObject({ purchasedBudgetCents: 1000, purchasedUsedCents: 0, purchasedRemainingCents: 1000 });

    const buyerUse = await startUse(buyerBudget, "buyer-use");
    expect(await getHostedAiBudgetSnapshot(env, buyerBudget)).toMatchObject({ purchasedUsedCents: 4, purchasedRemainingCents: 996 });
    expect(await ledger.settle({ ...buyerUse, usage, accepted: true, final: true }))
      .toMatchObject({ state: "settled", reservedCents: 0, chargedCents: 1 });
    const settled = await savedOwner(buyerId);
    expect(settled[2]).toEqual([{ row: expect.objectContaining({ included_charge_cents: 0, purchased_charge_cents: 1,
      included_reserved_cents: 0, purchased_reserved_cents: 0, state: "settled" }) }]);
    expect((await admin.query(`SELECT provider_cost_usd::text FROM ${schema}.hosted_ai_attempts WHERE owner_id=$1`, [buyerId])).rows)
      .toEqual([{ provider_cost_usd: "0.000582" }]);

    await deliverPaidEvent();
    expect(await savedOwner(buyerId)).toEqual(settled);
    expect(await receipt()).toEqual(paidReceipt);
    expect(await getHostedAiBudgetSnapshot(env, buyerBudget)).toMatchObject({ purchasedBudgetCents: 1000, purchasedUsedCents: 1, purchasedRemainingCents: 999 });
    expect(await savedOwner(controlId)).toEqual(controlOriginal);
    expect(await getHostedAiBudgetSnapshot(env, controlBudget)).toEqual(controlBalance);
  } finally {
    try {
      await database?.db.destroy();
      if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await admin.end();
    }
  }
});

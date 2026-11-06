import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../../apps/web/src/lib/hosted-server-db", async (original) => ({
  ...await original<typeof import("../../../apps/web/src/lib/hosted-server-db")>(),
  ensureHostedAppSchema: async () => {},
  getHostedServerDatabase: async () => ({ pool: { connect: boundary.connect } })
}));
import { reconcileHostedStripeSubscriptionEvent } from "../../../apps/web/src/lib/hosted-billing-reconciliation";
import {
  createHostedBillingWebhookRouteHandlers,
  signHostedBillingWebhookPayload
} from "../../../apps/web/src/lib/hosted-billing-webhook";
import type {
  getHostedSubscriptionBySubscriptionId,
  markStripeEventProcessed,
  persistHostedStripeSubscription
} from "../../../apps/web/src/lib/hosted-billing-db";

// spec/federal/hosted-subscription-atomicity.yaml. Successor uses the
// real atomic helper with a query-boundary fixture; no SQL proof is claimed here.
// Original six signed inputs/titles/assertions remain exact. Current active and
// subsequent past-due provider sources are separately explicit synthetic facts.
describe("hosted subscription atomic reconciliation source-first", () => {
  const now = 1_800_000_000;
  const secret = "whsec_atomicity_synthetic_only";
  const env = {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_BILLING_MODE: "test",
    STRIPE_WEBHOOK_SECRET: secret,
    DATABASE_URL: "postgres://tax_engine:test@localhost:5432/tax_engine"
  };
  type Record = NonNullable<Awaited<ReturnType<typeof getHostedSubscriptionBySubscriptionId>>>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now * 1000);
  });
  afterEach(() => vi.useRealTimers());

  function payload(id = "evt_atomic_first", created = now, status = "active") {
    return JSON.stringify({ id, type: "customer.subscription.updated", livemode: false, created,
      data: { object: { object: "subscription", id: "sub_atomic", customer: "cus_atomic", status,
        cancel_at_period_end: false,
        metadata: { hostedOwnerId: "owner-atomic", planId: "starter" } } } });
  }
  function request(body: string, signedBody = body) {
    return new Request("https://synthetic.invalid/api/billing/webhook", {
      method: "POST", body, headers: { "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(signedBody, secret, Math.floor(Date.now() / 1000)) }
    });
  }
  function harness(authoritativeStatuses: ("active" | "past-due")[] = ["active"]) {
    let saved: Record | null = null;
    const receipts = new Set<string>();
    const persistSubscription = vi.fn<typeof persistHostedStripeSubscription>(async (_env, input) => {
      saved = { subscriptionId: input.stripeSubscriptionId, customerId: input.stripeCustomerId,
        workspaceOwnerId: input.ownerId, planId: input.planId, status: input.status,
        lastEventId: input.eventId, lastEventType: input.eventType, updatedAt: input.updatedAt,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd, currentPeriodEnd: input.currentPeriodEnd };
      return saved;
    });
    const markEventProcessed = vi.fn<typeof markStripeEventProcessed>(async (_env, event) => {
      if (receipts.has(event.id)) return false;
      receipts.add(event.id);
      return true;
    });
    const string = (values: unknown[], index: number) => {
      const value = values[index]; if (typeof value !== "string") throw new Error("Unexpected SQL fixture value"); return value;
    };
    let before: Record | null = null;
    let pending: { id: string; type: string; createdAt: string } | null = null;
    boundary.connect.mockResolvedValue(Object.assign(new EventEmitter(), { release: vi.fn(), query: async (sql: string, values: unknown[] = []) => {
      if (sql === "BEGIN") { before = saved; pending = null; }
      if (/INSERT INTO hosted_billing_events/.test(sql)) {
        const id = string(values, 0);
        if (receipts.has(id)) return { rows: [], rowCount: 0 };
        pending = { id, type: string(values, 1), createdAt: string(values, 2) };
        return { rows: [{ event_id: id }], rowCount: 1 };
      }
      if (/FROM hosted_billing_subscriptions/.test(sql)) {
        return { rows: saved ? [{ stripe_subscription_id: saved.subscriptionId, stripe_customer_id: saved.customerId,
          owner_id: saved.workspaceOwnerId, status: saved.status }] : [], rowCount: saved ? 1 : 0 };
      }
      if (/INSERT INTO hosted_billing_subscriptions/.test(sql)) {
        const plan = values[3]; const status = values[4];
        if (plan !== "starter" && plan !== "plus" && plan !== "review") throw new Error("Unexpected fixture plan");
        if (status !== "active" && status !== "past-due" && status !== "canceled" && status !== "checkout-pending") throw new Error("Unexpected fixture status");
        if (typeof values[6] !== "boolean" || !pending) throw new Error("Missing fixture transaction");
        await persistSubscription(env, { stripeSubscriptionId: string(values, 0), ownerId: string(values, 1),
          stripeCustomerId: string(values, 2), planId: plan, status, currentPeriodEnd: typeof values[5] === "string" ? values[5] : null,
          cancelAtPeriodEnd: values[6], eventId: string(values, 7), eventType: pending.type,
          eventCreatedAt: string(values, 8), updatedAt: string(values, 9) });
      }
      // Simulate a deferred receipt/COMMIT fault after attempted state write.
      // The actual PostgreSQL suite separately proves this rollback in the DB.
      if (sql === "COMMIT" && pending) { await markEventProcessed(env, pending); pending = null; }
      if (sql === "ROLLBACK") { saved = before; pending = null; }
      return { rows: [], rowCount: 0 };
    } }));
    let load = 0;
    const handlers = createHostedBillingWebhookRouteHandlers({ env,
      reconcileSubscription: (facts, input) => reconcileHostedStripeSubscriptionEvent(facts, input, async () => ({
        subscriptionId: "sub_atomic", customerId: "cus_atomic", ownerId: "owner-atomic", planId: "starter",
        status: authoritativeStatuses[Math.min(load++, authoritativeStatuses.length - 1)] ?? "active",
        currentPeriodEnd: null, cancelAtPeriodEnd: false, livemode: false
      })) });
    return { ...handlers, persistSubscription, markEventProcessed, receipts, saved: () => saved };
  }

  it("commits a first authenticated subscription and event receipt", async () => {
    const h = harness();
    expect((await h.POST(request(payload()))).status).toBe(200);
    expect(h.saved()).toMatchObject({ subscriptionId: "sub_atomic", customerId: "cus_atomic",
      workspaceOwnerId: "owner-atomic", planId: "starter", status: "active", lastEventId: "evt_atomic_first" });
    expect(h.persistSubscription).toHaveBeenCalledTimes(1);
    expect([...h.receipts]).toEqual(["evt_atomic_first"]);
  });

  it("keeps a pre-write failure retryable without an event receipt", async () => {
    const h = harness();
    h.persistSubscription.mockRejectedValueOnce(new Error("synthetic pre-write failure"));
    await expect(h.POST(request(payload()))).rejects.toThrow("synthetic pre-write failure");
    expect(h.saved()).toBeNull();
    expect(h.receipts.size).toBe(0);
    expect(h.markEventProcessed).not.toHaveBeenCalled();
    vi.setSystemTime((now + 10) * 1000);
    expect((await h.POST(request(payload()))).status).toBe(200);
    expect([...h.receipts]).toEqual(["evt_atomic_first"]);
  });

  it("completes the receipt after a post-write receipt failure and fresh retry", async () => {
    const h = harness();
    const original = payload("evt_atomic_crash", now - 20);
    h.markEventProcessed.mockRejectedValueOnce(new Error("synthetic receipt failure"));
    await expect(h.POST(request(original))).rejects.toThrow("synthetic receipt failure");
    expect(h.receipts.size).toBe(0);
    vi.setSystemTime((now + 10) * 1000);
    expect((await h.POST(request(original))).status).toBe(200);
    expect(h.receipts.has("evt_atomic_crash")).toBe(true);
    expect(h.saved()).toMatchObject({ lastEventId: "evt_atomic_crash", status: "active" });
  });

  it("does not silently discard a distinct event using the local processing clock", async () => {
    const h = harness(["active", "past-due"]);
    expect((await h.POST(request(payload("evt_atomic_old", now - 200)))).status).toBe(200);
    vi.setSystemTime((now + 1) * 1000);
    expect((await h.POST(request(payload("evt_atomic_distinct", now - 100, "past_due")))).status).toBe(200);
    expect(h.receipts.has("evt_atomic_distinct")).toBe(true);
    expect(h.saved()).toMatchObject({ lastEventId: "evt_atomic_distinct", status: "past-due" });
  });

  it("does not rewrite entitlement for an already receipted event", async () => {
    const h = harness();
    const original = payload();
    expect((await h.POST(request(original))).status).toBe(200);
    expect((await h.POST(request(original))).status).toBe(200);
    expect([...h.receipts]).toEqual(["evt_atomic_first"]);
    expect(h.persistSubscription).toHaveBeenCalledTimes(1);
  });

  it("rejects changed signed bytes before either persistence operation", async () => {
    const h = harness();
    const original = payload();
    const changed = original.replace("owner-atomic", "owner-tampered");
    expect((await h.POST(request(changed, original))).status).toBe(400);
    expect(h.persistSubscription).not.toHaveBeenCalled();
    expect(h.markEventProcessed).not.toHaveBeenCalled();
    expect(h.receipts.size).toBe(0);
  });
});

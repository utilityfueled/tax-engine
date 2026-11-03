import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createHostedBillingWebhookRouteHandlers,
  signHostedBillingWebhookPayload
} from "../../../apps/web/src/lib/hosted-billing-webhook";

import type { recordHostedAiCreditPurchase } from "../../../apps/web/src/lib/hosted-ai-usage-db";

// spec/federal/hosted-webhook-delivery.yaml. These use the actual Stripe SDK,
// synthetic signatures and injected persistence, never a live Stripe request.
describe("hosted Stripe signed delivery recovery", () => {
  const now = 1_800_000_000;
  const secret = "whsec_delivery_recovery_synthetic";
  const env = {
    TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
    TAX_ENGINE_BILLING_MODE: "test",
    STRIPE_WEBHOOK_SECRET: secret,
    DATABASE_URL: "postgres://tax_engine:test@localhost:5432/tax_engine"
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now * 1000);
  });
  afterEach(() => vi.useRealTimers());

  function subscriptionPayload(created: number) {
    return JSON.stringify({
      id: "evt_delivery_recovery", livemode: false, type: "checkout.session.completed", created,
      data: { object: { object: "checkout.session", customer: "cus_delivery",
        subscription: "sub_delivery", metadata: { hostedOwnerId: "owner-delivery", planId: "starter" } } }
    });
  }
  function request(payload: string, timestamp = Math.floor(Date.now() / 1000), signedPayload = payload) {
    return new Request("https://tax.example/api/billing/webhook", {
      method: "POST", headers: { "content-type": "application/json",
        "stripe-signature": signHostedBillingWebhookPayload(signedPayload, secret, timestamp) }, body: payload
    });
  }
  function persistentHandler() {
    const persistSubscription = vi.fn(async () => {});
    const markEventProcessed = vi.fn(async () => true);
    const handlers = createHostedBillingWebhookRouteHandlers({ env, persistSubscription, markEventProcessed,
      getExistingPersistedSubscription: async () => null,
      getExistingPersistedSubscriptionByCustomerId: async () => null });
    return { ...handlers, persistSubscription, markEventProcessed };
  }

  it("accepts a freshly signed 30 day old subscription event", async () => {
    const { POST, persistSubscription, markEventProcessed } = persistentHandler();
    const created = now - 30 * 86400;
    expect((await POST(request(subscriptionPayload(created)))).status).toBe(200);
    expect(persistSubscription).toHaveBeenCalledExactlyOnceWith(env, expect.objectContaining({
      ownerId: "owner-delivery", stripeSubscriptionId: "sub_delivery",
      eventCreatedAt: new Date(created * 1000).toISOString()
    }));
    expect(markEventProcessed).toHaveBeenCalledTimes(1);
  });

  it("recovers a subscription after a day long database outage", async () => {
    const { POST, persistSubscription, markEventProcessed } = persistentHandler();
    persistSubscription.mockRejectedValueOnce(new Error("synthetic database outage"));
    const payload = subscriptionPayload(now);
    await expect(POST(request(payload))).rejects.toThrow("synthetic database outage");
    expect(markEventProcessed).not.toHaveBeenCalled();
    vi.setSystemTime((now + 86400) * 1000);
    expect((await POST(request(payload))).status).toBe(200);
    expect(persistSubscription).toHaveBeenCalledTimes(2);
    expect(markEventProcessed).toHaveBeenCalledTimes(1);
  });

  it("persists delayed credit deliveries through the existing idempotent checkout ledger", async () => {
    const created = now - 3 * 86400;
    const payload = JSON.stringify({ id: "evt_delivery_credits", livemode: false, type: "checkout.session.completed", created,
      data: { object: { object: "checkout.session", id: "cs_delivery_credits", customer: "cus_delivery",
        amount_total: 1500, currency: "usd", metadata: { purchaseKind: "ai-credit-pack",
          hostedOwnerId: "owner-delivery", aiCreditCents: "1000" } } } });
    const recorded = new Map<string, unknown>();
    const recordAiCreditPurchase = vi.fn<typeof recordHostedAiCreditPurchase>(async (_env, input) => {
      if (recorded.has(input.checkoutSessionId)) return false;
      recorded.set(input.checkoutSessionId, input);
      return true;
    });
    const markEventProcessed = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { POST } = createHostedBillingWebhookRouteHandlers({ env, recordAiCreditPurchase, markEventProcessed });
    expect((await POST(request(payload))).status).toBe(200);
    vi.setSystemTime((now + 1) * 1000);
    expect((await POST(request(payload))).status).toBe(200);
    expect(recordAiCreditPurchase).toHaveBeenCalledTimes(2);
    expect(recorded.size).toBe(1);
    expect(recorded.get("cs_delivery_credits")).toEqual({ checkoutSessionId: "cs_delivery_credits",
      ownerId: "owner-delivery", stripeCustomerId: "cus_delivery", amountPaidCents: 1500,
      creditedBudgetCents: 1000, currency: "usd", createdAt: new Date(created * 1000).toISOString() });
    expect(markEventProcessed).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale signed delivery before persistence", async () => {
    const { POST, persistSubscription, markEventProcessed } = persistentHandler();
    expect((await POST(request(subscriptionPayload(now), now - 301))).status).toBe(400);
    expect(persistSubscription).not.toHaveBeenCalled();
    expect(markEventProcessed).not.toHaveBeenCalled();
  });

  it("accepts a signed delivery at the 300 second boundary", async () => {
    const { POST, persistSubscription } = persistentHandler();
    expect((await POST(request(subscriptionPayload(now), now - 300))).status).toBe(200);
    expect(persistSubscription).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed original payload before persistence", async () => {
    const { POST, persistSubscription } = persistentHandler();
    const original = subscriptionPayload(now - 86400);
    const changed = original.replace("owner-delivery", "owner-tampered");
    expect((await POST(request(changed, now, original))).status).toBe(400);
    expect(persistSubscription).not.toHaveBeenCalled();
  });

  it.each([-1, now - 0.5, -9_007_199_254_740_992, 9_007_199_254_740_992])("rejects malformed original creation timestamps before persistence (%j)", async (created) => {
    const { POST, persistSubscription, markEventProcessed } = persistentHandler();
    expect((await POST(request(subscriptionPayload(created)))).status).toBe(400);
    expect(persistSubscription).not.toHaveBeenCalled();
    expect(markEventProcessed).not.toHaveBeenCalled();
  });

  it("preserves the separate future event clock guard", async () => {
    const { POST, persistSubscription } = persistentHandler();
    expect((await POST(request(subscriptionPayload(now + 61)))).status).toBe(400);
    expect(persistSubscription).not.toHaveBeenCalled();
    expect((await POST(request(subscriptionPayload(now + 60)))).status).toBe(200);
    expect(persistSubscription).toHaveBeenCalledTimes(1);
  });
});

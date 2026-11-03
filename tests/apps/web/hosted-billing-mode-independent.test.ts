import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// spec/federal/hosted-billing-mode-independent.yaml; source-first independent controls.
vi.mock("server-only", () => ({}));
import { getHostedBillingConfig } from "../../../apps/web/src/lib/hosted-billing";
import { createHostedBillingWebhookRouteHandlers, signHostedBillingWebhookPayload } from "../../../apps/web/src/lib/hosted-billing-webhook";
import { createInMemoryHostedBillingSubscriptionStore } from "../../../apps/web/src/lib/hosted-billing-state";
const now = 1_800_050_000;
const secret = "whsec_independent_fiction_only";
const base = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://independent.example",
  STRIPE_WEBHOOK_SECRET: secret, STRIPE_PRICE_ID_STARTER_MONTHLY: "price_start", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus" };
const modes = ["test", "live"] as const;
const families = ["sk", "rk"] as const;
const runtimes = ["production", "development"] as const;
const configs = modes.flatMap(mode => families.flatMap(family => runtimes.map(runtime => ({
  label: `${mode}/${family}/${runtime}`, mode, family, runtime,
}))));
const events = modes.flatMap(mode => ["customer.subscription.updated", "customer.subscription.deleted"].map(type => ({
  label: `${mode}/${type}`, mode, type,
})));
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now * 1000); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function initialRecord() { return { subscriptionId: "sub_independent", customerId: "cus_independent", workspaceOwnerId: "owner_independent",
  planId: "starter" as const, status: "active" as const, lastEventId: "evt_original", lastEventType: "customer.subscription.updated", updatedAt: new Date((now - 60) * 1000).toISOString() }; }
function request(type: string, mode: unknown) {
  const body = JSON.stringify({ id: "evt_independent", type, created: now,
    ...(mode === undefined ? {} : { livemode: mode }), data: { object: { object: "subscription", id: "sub_independent",
      customer: "cus_independent", status: "active", metadata: { hostedOwnerId: "owner_independent", planId: "starter" } } } });
  return new Request("https://independent.example/api/billing/webhook", { method: "POST", body,
    headers: { "stripe-signature": signHostedBillingWebhookPayload(body, secret, now), "content-type": "application/json" } });
}
describe("independent configured and signed Stripe namespaces", () => {
  it.each(configs)("binds config to the declared namespace (%s)", ({ mode, family, runtime }) => {
    const common = { ...base, NODE_ENV: runtime, TAX_ENGINE_BILLING_MODE: mode };
    expect(getHostedBillingConfig({ ...common, STRIPE_SECRET_KEY: `${family}_${mode}_synthetic` }).blocked).toBe(false);
    expect(getHostedBillingConfig({ ...common, STRIPE_SECRET_KEY: `${family}_${mode === "live" ? "test" : "live"}_synthetic` }).blocked).toBe(true);
  });
  it.each(events)("preserves an active record on wrong or unknown signed mode (%s)", async ({ mode, type }) => {
    for (const eventMode of [undefined, "false", mode !== "live"]) {
      const prior = initialRecord(); const store = createInMemoryHostedBillingSubscriptionStore([prior]);
      const handler = createHostedBillingWebhookRouteHandlers({ env: { ...base, TAX_ENGINE_BILLING_MODE: mode, NODE_ENV: "development" }, subscriptionStore: store, nowUnixSeconds: now });
      expect((await handler.POST(request(type, eventMode))).status).toBe(400);
      expect(store.list()).toEqual([prior]);
    }
  });
  it.each(events)("accepts a matching signed lifecycle event (%s)", async ({ mode, type }) => {
    const store = createInMemoryHostedBillingSubscriptionStore([initialRecord()]);
    const handler = createHostedBillingWebhookRouteHandlers({ env: { ...base, TAX_ENGINE_BILLING_MODE: mode, NODE_ENV: "development" }, subscriptionStore: store, nowUnixSeconds: now });
    expect((await handler.POST(request(type, mode === "live"))).status).toBe(200);
    expect(store.list()).toHaveLength(1);
    expect(store.get("sub_independent")).toEqual({ ...initialRecord(), lastEventId: "evt_independent", lastEventType: type,
      status: type.endsWith("deleted") ? "canceled" : "active", updatedAt: new Date(now * 1000).toISOString() });
  });
});

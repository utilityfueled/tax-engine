import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// spec/federal/hosted-billing-mode-binding.yaml. Synthetic account-level key
// strings and API spies only; real SDK signature verification, no provider HTTP.
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/hosted-ai-availability", () => ({ canPurchaseHostedAiCredits: () => true }));
const mocks = vi.hoisted(() => ({
  key: vi.fn(), actor: vi.fn(), subscription: vi.fn(), entitlement: vi.fn(), rate: vi.fn(),
  customer: vi.fn(), checkout: vi.fn(), portal: vi.fn(), adapter: vi.fn(),
  persist: vi.fn(), mark: vi.fn(), credit: vi.fn(), remove: vi.fn(), existing: vi.fn(),
}));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock("../../../apps/web/src/lib/hosted-billing-db", () => ({
  getHostedSubscriptionByOwnerId: mocks.subscription,
  getHostedEntitlementByOwnerId: mocks.entitlement,
  getHostedSubscriptionBySubscriptionId: mocks.existing,
  getHostedSubscriptionByCustomerId: mocks.existing,
  persistHostedStripeSubscription: mocks.persist,
  markStripeEventProcessed: mocks.mark,
  deleteHostedSubscriptionBySubscriptionId: mocks.remove,
}));
vi.mock("../../../apps/web/src/lib/hosted-ai-usage-db", () => ({ recordHostedAiCreditPurchase: mocks.credit }));
vi.mock("../../../apps/web/src/lib/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../apps/web/src/lib/rate-limit")>(),
  checkRateLimitForEnvironment: mocks.rate,
}));
vi.mock("../../../apps/web/node_modules/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/web/node_modules/stripe")>();
  return { ...actual, default: class {
    static webhooks = actual.default.webhooks;
    webhooks = actual.default.webhooks;
    customers = { create: mocks.customer };
    checkout = { sessions: { create: mocks.checkout } };
    billingPortal = { sessions: { create: mocks.portal } };
    constructor(key: string) { mocks.key(key); }
  } };
});
import {
  createHostedBillingCheckoutRouteHandlers, createHostedAiCreditCheckoutRouteHandlers,
  createHostedBillingPortalRouteHandlers,
} from "../../../apps/web/src/lib/hosted-billing";
import { createHostedBillingWebhookRouteHandlers, signHostedBillingWebhookPayload } from "../../../apps/web/src/lib/hosted-billing-webhook";
import { createInMemoryHostedBillingSubscriptionStore } from "../../../apps/web/src/lib/hosted-billing-state";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

type Env = Record<string, string | undefined>;
type Mode = "test" | "live";
type Route = "subscription" | "topup" | "portal";
type EventKind = "subscription" | "credit";
const routes: Route[] = ["subscription", "topup", "portal"];
const modes: Mode[] = ["test", "live"];
const families = ["sk", "rk"] as const;
const kinds: EventKind[] = ["subscription", "credit"];
const now = 1_800_000_000;
const secret = "whsec_mode_binding_fictional";
function env(mode: Mode = "test", key: string | undefined = `sk_${mode}_fictional`) : Env {
  return { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production",
    TAX_ENGINE_BILLING_MODE: mode, TAX_ENGINE_APP_URL: "https://tax.example",
    STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus",
    STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "price_credit", DATABASE_URL: "postgresql://synthetic.invalid/mode" };
}
function request(body: unknown) {
  return new Request("https://tax.example/api/billing", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function outbound(route: Route, facts: Env, custom = false) {
  const base = { env: facts, rateLimitStore: createRateLimitStore() };
  const body = { planId: "starter", successUrl: "https://tax.example/success", cancelUrl: "https://tax.example/cancel" };
  mocks.subscription.mockResolvedValue(route === "portal" ? { customerId: "cus_fictional", status: "canceled" } : null);
  const createCheckoutSession = async () => { mocks.adapter(); return { id: "cs_fictional", url: "https://checkout.stripe.com/fictional" }; };
  if (route === "subscription") return createHostedBillingCheckoutRouteHandlers({ ...base,
    ...(custom ? { createCheckoutSession } : {}) }).POST(request(body));
  if (route === "topup") return createHostedAiCreditCheckoutRouteHandlers({ ...base,
    ...(custom ? { createCheckoutSession } : {}) }).POST(request(body));
  return createHostedBillingPortalRouteHandlers({ ...base, ...(custom ? { createPortalSession: async () => {
    mocks.adapter(); return { url: "https://billing.stripe.com/fictional" };
  } } : {}) }).POST(request({ returnUrl: "https://tax.example/billing" }));
}
function noOutbound() {
  expect(mocks.key).not.toHaveBeenCalled(); expect(mocks.customer).not.toHaveBeenCalled();
  expect(mocks.checkout).not.toHaveBeenCalled(); expect(mocks.portal).not.toHaveBeenCalled();
  expect(mocks.adapter).not.toHaveBeenCalled();
}
function noWrites() {
  expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.credit).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
}
function payload(kind: EventKind, mode: unknown, created = now) {
  return JSON.stringify({ id: "evt_mode_binding", type: "checkout.session.completed", created,
    ...(mode === undefined ? {} : { livemode: mode }), data: { object: {
      object: "checkout.session", id: "cs_mode_binding", customer: "cus_mode_binding", subscription: "sub_mode_binding",
      amount_total: 1500, currency: "usd", metadata: kind === "credit"
        ? { purchaseKind: "ai-credit-pack", hostedOwnerId: "owner-mode-binding", aiCreditCents: "1000" }
        : { hostedOwnerId: "owner-mode-binding", planId: "starter" },
    } } });
}
function signed(raw: string, timestamp = now, original = raw) {
  return new Request("https://tax.example/api/billing/webhook", { method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signHostedBillingWebhookPayload(original, secret, timestamp) }, body: raw });
}
function webhook(facts: Env, constructor?: (raw: string) => ReturnType<typeof JSON.parse>) {
  return createHostedBillingWebhookRouteHandlers({ env: facts, nowUnixSeconds: now,
    rateLimitStore: createRateLimitStore(), persistSubscription: mocks.persist, markEventProcessed: mocks.mark,
    recordAiCreditPurchase: mocks.credit, deletePersistedSubscription: mocks.remove,
    getExistingPersistedSubscription: mocks.existing, getExistingPersistedSubscriptionByCustomerId: mocks.existing,
    ...(constructor ? { constructEvent: constructor } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now * 1000);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.actor.mockResolvedValue({ id: "owner-mode-binding", label: "Fictional Owner", email: "fictional@example.invalid" });
  mocks.subscription.mockResolvedValue(null); mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true } });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: null });
  mocks.customer.mockResolvedValue({ id: "cus_fictional" });
  mocks.checkout.mockResolvedValue({ id: "cs_fictional", url: "https://checkout.stripe.com/fictional" });
  mocks.portal.mockResolvedValue({ url: "https://billing.stripe.com/fictional" });
  mocks.existing.mockResolvedValue(null); mocks.persist.mockResolvedValue(undefined);
  mocks.mark.mockResolvedValue(true); mocks.credit.mockResolvedValue(true); mocks.remove.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("hosted Stripe mode binding source-first controls", () => {
  it.each(routes)("blocks incompatible keys before each outbound SDK operation (%s)", async (route) => {
    for (const mode of modes) for (const family of families) {
      vi.clearAllMocks();
      const response = await outbound(route, env(mode, `${family}_${mode === "test" ? "live" : "test"}_fictional`));
      expect(response.status).toBe(503); noOutbound();
    }
  });
  it.each(routes)("blocks incompatible keys before each custom session adapter (%s)", async (route) => {
    for (const mode of modes) for (const family of families) for (const nodeEnv of ["production", "development"]) {
      vi.clearAllMocks();
      expect((await outbound(route, { ...env(mode, `${family}_${mode === "test" ? "live" : "test"}_fictional`), NODE_ENV: nodeEnv }, true)).status).toBe(503);
      noOutbound();
    }
  });
  it.each(routes)("permits matching secret and restricted keys for each outbound SDK operation (%s)", async (route) => {
    for (const mode of modes) for (const family of families) {
      vi.clearAllMocks(); const key = `${family}_${mode}_fictional`;
      expect((await outbound(route, env(mode, key))).status).toBe(200);
      expect(mocks.key).toHaveBeenCalledExactlyOnceWith(key);
      if (route === "portal") expect(mocks.portal).toHaveBeenCalledExactlyOnceWith({ customer: "cus_fictional", return_url: "https://tax.example/billing" });
      else {
        expect(mocks.customer).toHaveBeenCalledTimes(1);
        expect(mocks.checkout).toHaveBeenCalledTimes(1);
        expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ mode: route === "subscription" ? "subscription" : "payment",
          line_items: [{ price: route === "subscription" ? "price_starter" : "price_credit", quantity: 1 }],
          success_url: "https://tax.example/success", cancel_url: "https://tax.example/cancel" }));
      }
    }
  });
  it.each(["pk_test_fictional", "pk_live_fictional", "sk_test_", "rk_live_", "sk_org_fictional", "unknown_fictional"])("blocks unclassified configured keys without leaking their values (%s)", async (key) => {
    for (const route of routes) {
      vi.clearAllMocks(); const response = await outbound(route, env("test", key));
      expect(response.status).toBe(503); expect(await response.text()).not.toContain(key); noOutbound();
    }
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(key);
  });
  it.each(routes)("preserves absent-key development adapters and self-host bypass (%s)", async (route) => {
    expect((await outbound(route, { ...env("test", undefined), STRIPE_SECRET_KEY: undefined, NODE_ENV: "development" }, true)).status).toBe(200);
    expect(mocks.adapter).toHaveBeenCalledTimes(1); expect(mocks.key).not.toHaveBeenCalled();
    vi.clearAllMocks();
    const response = await outbound(route, { ...env("test", "sk_live_fictional"), TAX_ENGINE_DEPLOYMENT_MODE: "self-host" });
    expect(response.status).toBe(200); expect((await response.json()).bypassed).toBe(true); noOutbound();
    vi.clearAllMocks();
    expect((await outbound(route, { ...env(), STRIPE_SECRET_KEY: undefined })).status).toBe(503); noOutbound();
  });
  it.each(kinds)("rejects opposite signed event mode before all state writes (%s)", async (kind) => {
    for (const mode of modes) {
      vi.clearAllMocks(); expect((await webhook({ ...env(mode), STRIPE_SECRET_KEY: undefined }).POST(signed(payload(kind, mode !== "live")))).status).toBe(400); noWrites();
      const store = createInMemoryHostedBillingSubscriptionStore();
      const handler = createHostedBillingWebhookRouteHandlers({ env: { ...env(mode), DATABASE_URL: undefined, STRIPE_SECRET_KEY: undefined }, subscriptionStore: store, nowUnixSeconds: now });
      expect((await handler.POST(signed(payload("subscription", mode !== "live")))).status).toBe(400);
      expect(store.get("sub_mode_binding")).toBeNull();
    }
  });
  it.each([undefined, null, "false", "true", 0, 1])("rejects absent or malformed signed event mode (%j)", async (bad) => {
    for (const mode of modes) for (const kind of kinds) {
      vi.clearAllMocks(); expect((await webhook({ ...env(mode), STRIPE_SECRET_KEY: undefined }).POST(signed(payload(kind, bad)))).status).toBe(400); noWrites();
    }
  });
  it.each(kinds)("accepts matching signed events without requiring an outbound API key (%s)", async (kind) => {
    for (const mode of modes) {
      vi.clearAllMocks(); const facts = { ...env(mode), STRIPE_SECRET_KEY: undefined, STRIPE_PRICE_ID_STARTER_MONTHLY: undefined, STRIPE_PRICE_ID_PLUS_MONTHLY: undefined };
      expect((await webhook(facts).POST(signed(payload(kind, mode === "live")))).status).toBe(200);
      expect(mocks.mark).toHaveBeenCalledTimes(1);
      if (kind === "credit") expect(mocks.credit).toHaveBeenCalledExactlyOnceWith(facts, {
        checkoutSessionId: "cs_mode_binding", ownerId: "owner-mode-binding", stripeCustomerId: "cus_mode_binding",
        amountPaidCents: 1500, creditedBudgetCents: 1000, currency: "usd", createdAt: new Date(now * 1000).toISOString(),
      });
      else expect(mocks.persist).toHaveBeenCalledWith(facts, expect.objectContaining({ ownerId: "owner-mode-binding", stripeSubscriptionId: "sub_mode_binding", planId: "starter" }));
    }
  });
  it.each(kinds)("rejects configured key conflicts on signed deliveries (%s)", async (kind) => {
    for (const mode of modes) for (const family of families) {
      vi.clearAllMocks(); const key = `${family}_${mode === "test" ? "live" : "test"}_fictional`;
      expect((await webhook(env(mode, key)).POST(signed(payload(kind, mode === "live")))).status).toBe(503); noWrites();
    }
  });
  it("preserves signed retry and raw-byte authentication with explicit event mode", async () => {
    const handler = webhook(env()); const raw = payload("subscription", false, now - 30 * 86400);
    expect((await handler.POST(signed(raw))).status).toBe(200); expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventCreatedAt: new Date((now - 30 * 86400) * 1000).toISOString() }));
    vi.clearAllMocks(); expect((await handler.POST(signed(raw, now - 301))).status).toBe(400); noWrites();
    vi.clearAllMocks(); expect((await handler.POST(signed(raw.replace("owner-mode-binding", "owner-mutated"), now, raw))).status).toBe(400); noWrites();
    vi.clearAllMocks(); expect((await handler.POST(signed(raw, now - 300))).status).toBe(200); expect(mocks.persist).toHaveBeenCalledTimes(1);
  });
  it("enforces explicit matching mode for supplied event constructors", async () => {
    for (const mode of modes) for (const eventMode of [undefined, null, "false", mode !== "live"]) {
      vi.clearAllMocks();
      const constructor = vi.fn((raw: string) => JSON.parse(raw));
      expect((await webhook(env(mode), constructor).POST(signed(payload("credit", eventMode)))).status).toBe(400);
      expect(constructor).toHaveBeenCalledTimes(1); noWrites();
    }
    vi.clearAllMocks();
    expect((await webhook(env("test"), (raw: string) => JSON.parse(raw)).POST(signed(payload("credit", false)))).status).toBe(200);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });
  it("keeps conflicting key failures private and caller facts unchanged", async () => {
    const facts = Object.freeze(env("test", "sk_live_fictional_PRIVATE")); const before = { ...facts };
    const response = await outbound("subscription", facts);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
    expect(facts).toEqual(before); noOutbound();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE");
  });
});

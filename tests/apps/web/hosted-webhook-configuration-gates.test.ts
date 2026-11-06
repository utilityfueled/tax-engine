import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "../../../apps/web/node_modules/stripe";
// spec/federal/hosted-webhook-configuration-gates.yaml. No real credentials,
// SDK authentication, provider request or database connection is exercised.
vi.mock("server-only", () => ({}));
const spies = vi.hoisted(() => ({
  sdk: vi.fn(), sdkConstruct: vi.fn(), rate: vi.fn(), credit: vi.fn(), receipt: vi.fn(),
  persist: vi.fn(), remove: vi.fn(), existing: vi.fn(),
}));
vi.mock("../../../apps/web/src/lib/rate-limit", async (original) => ({
  ...await original<typeof import("../../../apps/web/src/lib/rate-limit")>(),
  checkRateLimitForEnvironment: spies.rate,
}));
vi.mock("../../../apps/web/node_modules/stripe", () => ({ default: class {
  constructor(key: string) { spies.sdk(key); }
  webhooks = { constructEvent: spies.sdkConstruct };
} }));
import { getHostedBillingConfig } from "../../../apps/web/src/lib/hosted-billing";
import { getHostedServerDatabaseConfig } from "../../../apps/web/src/lib/hosted-server-db";
import { createHostedBillingWebhookRouteHandlers } from "../../../apps/web/src/lib/hosted-billing-webhook";
import { createInMemoryHostedBillingSubscriptionStore } from "../../../apps/web/src/lib/hosted-billing-state";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

type Env = Record<string, string | undefined>;
const now = 1_800_000_000;
const event = {
  id: "evt_configuration_guard", object: "event", created: now, livemode: false,
  type: "checkout.session.completed", data: { object: {
    object: "checkout.session", id: "cs_configuration_guard", customer: "cus_configuration_guard",
    subscription: "sub_configuration_guard", metadata: { hostedOwnerId: "owner-configuration-guard", planId: "starter" },
  } },
} as Stripe.Event;
const raw = JSON.stringify(event);
function configured(): Env {
  return { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production",
    TAX_ENGINE_BILLING_MODE: "test", TAX_ENGINE_APP_URL: "https://configuration.example.invalid",
    DATABASE_URL: "postgresql://synthetic.invalid/configuration",
    STRIPE_SECRET_KEY: "sk_test_configuration_fictional", STRIPE_WEBHOOK_SECRET: "whsec_configuration_fictional",
    STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter", STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus" };
}
function preview(): Env {
  return { ...configured(), VERCEL_ENV: "preview", VERCEL_URL: "synthetic-preview.vercel.app",
    TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: "postgresql://synthetic.invalid/isolated_preview" };
}
const cases: [string, () => Env, "database" | "billing"][] = [
  ["production missing database", () => ({ ...configured(), DATABASE_URL: undefined }), "database"],
  ["preview missing isolated database despite general database", () => ({ ...preview(), TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: undefined }), "database"],
  ["preview malformed isolated database", () => ({ ...preview(), TAX_ENGINE_STAGING_DATABASE_DATABASE_URL: "not-a-postgres-url" }), "database"],
  ["missing Stripe key", () => ({ ...configured(), STRIPE_SECRET_KEY: undefined }), "billing"],
  ["missing Starter price", () => ({ ...configured(), STRIPE_PRICE_ID_STARTER_MONTHLY: undefined }), "billing"],
  ["missing Plus price", () => ({ ...configured(), STRIPE_PRICE_ID_PLUS_MONTHLY: undefined }), "billing"],
  ["missing signing secret", () => ({ ...configured(), STRIPE_WEBHOOK_SECRET: undefined }), "billing"],
  ["missing app origin", () => ({ ...configured(), TAX_ENGINE_APP_URL: undefined }), "billing"],
  ["invalid app origin", () => ({ ...configured(), TAX_ENGINE_APP_URL: "not-an-origin" }), "billing"],
  ["invalid preview origin metadata", () => ({ ...preview(), VERCEL_URL: undefined }), "billing"],
];
function setup(env: Env, options: { memory?: boolean; sdk?: boolean } = {}) {
  const store = createInMemoryHostedBillingSubscriptionStore();
  const save = vi.spyOn(store, "save");
  const construct = vi.fn(() => event);
  const reconcile = vi.fn(async () => ({ outcome: "applied" as const }));
  const request = new Request("https://configuration.example.invalid/api/billing/webhook", {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": "synthetic-signature-not-authentication-proof" }, body: raw,
  });
  const body = request.body;
  if (!body) throw new Error("The synthetic request must have a body.");
  const reader = vi.spyOn(body, "getReader");
  const route = createHostedBillingWebhookRouteHandlers({ env, nowUnixSeconds: now,
    rateLimitStore: createRateLimitStore(), reconcileSubscription: reconcile,
    ...(options.memory ? { subscriptionStore: store } : {}),
    ...(!options.sdk ? { constructEvent: construct } : {}),
    recordAiCreditPurchase: spies.credit, markEventProcessed: spies.receipt,
    persistSubscription: spies.persist, deletePersistedSubscription: spies.remove,
    getExistingPersistedSubscription: spies.existing, getExistingPersistedSubscriptionByCustomerId: spies.existing,
  });
  return { route, request, reader, construct, reconcile, store, save };
}
function noEffects(s: ReturnType<typeof setup>) {
  expect(s.reconcile).not.toHaveBeenCalled(); expect(s.save).not.toHaveBeenCalled();
  expect(spies.credit).not.toHaveBeenCalled(); expect(spies.receipt).not.toHaveBeenCalled();
  expect(spies.persist).not.toHaveBeenCalled(); expect(spies.remove).not.toHaveBeenCalled();
  expect(spies.existing).not.toHaveBeenCalled();
}
function noAuthentication(s: ReturnType<typeof setup>) {
  expect(s.request.bodyUsed).toBe(false); expect(s.reader).not.toHaveBeenCalled();
  expect(s.construct).not.toHaveBeenCalled(); expect(spies.sdk).not.toHaveBeenCalled();
  expect(spies.sdkConstruct).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks(); spies.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: null });
  spies.sdkConstruct.mockReturnValue(event);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe("hosted webhook configuration source-first guards", () => {
  it.each(cases)("blocks unavailable hosted configuration before authentication or effects: %s", async (_name, facts, gate) => {
    // Both injected signature adapter and default SDK boundary must be gated.
    // Explicit injected memory must never override unavailable production config.
    for (const sdk of [false, true]) {
      vi.clearAllMocks();
      const env = facts();
      expect((gate === "database" ? getHostedServerDatabaseConfig(env) : getHostedBillingConfig(env)).blocked).toBe(true);
      const s = setup(env, { memory: true, sdk });
      const response = await s.route.POST(s.request);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Hosted billing is unavailable. Please contact the administrator." });
      noAuthentication(s); noEffects(s); expect(s.store.list()).toEqual([]);
    }
  });
  it.each(["production", "preview"] as const)("preserves configured injected atomic reconciliation: %s", async (mode) => {
    const env = mode === "preview" ? preview() : configured();
    expect(getHostedServerDatabaseConfig(env).blocked).toBe(false);
    expect(getHostedBillingConfig(env).blocked).toBe(false);
    const s = setup(env);
    const response = await s.route.POST(s.request);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ acknowledged: true });
    expect(s.construct).toHaveBeenCalledExactlyOnceWith(raw, "synthetic-signature-not-authentication-proof", "whsec_configuration_fictional");
    expect(s.reconcile).toHaveBeenCalledExactlyOnceWith(env, expect.objectContaining({
      ownerId: "owner-configuration-guard", stripeCustomerId: "cus_configuration_guard",
      stripeSubscriptionId: "sub_configuration_guard", eventId: event.id, livemode: false,
    }));
    expect(s.save).not.toHaveBeenCalled(); expect(spies.sdk).not.toHaveBeenCalled();
    expect(spies.credit).not.toHaveBeenCalled(); expect(spies.receipt).not.toHaveBeenCalled();
    expect(spies.persist).not.toHaveBeenCalled(); expect(spies.remove).not.toHaveBeenCalled();
  });
  it("preserves explicit hosted development memory without production prerequisites", async () => {
    const env = { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "development", STRIPE_WEBHOOK_SECRET: "whsec_configuration_fictional" };
    expect(getHostedServerDatabaseConfig(env).blocked).toBe(false); expect(getHostedBillingConfig(env).blocked).toBe(false);
    const s = setup(env, { memory: true });
    const response = await s.route.POST(s.request);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ acknowledged: true });
    expect(s.save).toHaveBeenCalledTimes(1);
    expect(s.store.get("sub_configuration_guard")).toEqual(expect.objectContaining({
      workspaceOwnerId: "owner-configuration-guard", customerId: "cus_configuration_guard", status: "active", lastEventId: event.id,
    }));
    expect(s.reconcile).not.toHaveBeenCalled(); expect(spies.credit).not.toHaveBeenCalled();
    expect(spies.receipt).not.toHaveBeenCalled(); expect(spies.persist).not.toHaveBeenCalled();
  });
  it("preserves production self-host bypass before hosted configuration", async () => {
    const s = setup({ TAX_ENGINE_DEPLOYMENT_MODE: "self-host", NODE_ENV: "production" });
    const response = await s.route.POST(s.request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: true, provider: "stripe", bypassed: true, message: "Self-host deployment bypasses hosted billing webhooks." });
    noAuthentication(s); noEffects(s);
  });
});

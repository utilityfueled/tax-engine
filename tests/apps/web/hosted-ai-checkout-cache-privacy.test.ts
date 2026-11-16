import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// spec/federal/hosted-ai-checkout-cache-privacy.yaml. Real Request/NextResponse;
// only external boundaries are synthetic, with no Stripe or database traffic.
const mocks = vi.hoisted(() => ({
  actor: vi.fn(), entitlement: vi.fn(), subscription: vi.fn(), rate: vi.fn(), qualified: vi.fn(),
}));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: mocks.actor }));
vi.mock("../../../apps/web/src/lib/hosted-billing-db", () => ({
  getHostedEntitlementByOwnerId: mocks.entitlement, getHostedSubscriptionByOwnerId: mocks.subscription,
}));
vi.mock("../../../apps/web/src/lib/hosted-ai-availability", () => ({ canPurchaseHostedAiCredits: mocks.qualified }));
vi.mock("../../../apps/web/src/lib/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../apps/web/src/lib/rate-limit")>(),
  checkRateLimitForEnvironment: mocks.rate,
}));

import { createHostedAiCreditCheckoutRouteHandlers } from "../../../apps/web/src/lib/hosted-billing";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

const env = {
  TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "development",
  TAX_ENGINE_APP_URL: "https://tax.example", STRIPE_SECRET_KEY: "sk_test_synthetic",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic", STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter",
  STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus", STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "price_credit",
  TAX_ENGINE_AI_HELPER_TOP_UP_PRICE_CENTS: "1500", TAX_ENGINE_AI_HELPER_TOP_UP_CREDIT_CENTS: "1000",
};
const valid = { successUrl: "https://tax.example/success", cancelUrl: "https://tax.example/cancel" };
const cases = [
  ["self-host bypass", 200, { checkoutUrl: null, bypassed: true }, null],
  ["blocked configuration", 503, { error: "Hosted billing is unavailable. Please contact the administrator." }, null],
  ["shared protection outage", 503, { error: "Request protection is temporarily unavailable. Please try again later.", code: "rate-limit-unavailable" }, "5"],
  ["rate rejection", 429, { error: "Too many requests. Please try again later." }, "3"],
  ["missing authentication", 401, { error: "Authentication required for hosted billing checkout." }, null],
  ["missing entitlement", 403, { error: "An active Starter or Plus plan is required before purchasing extra AI helper credits." }, null],
  ["malformed JSON", 400, { error: "Invalid JSON in request body." }, null],
  ["unsupported content type", 415, { error: "Content-Type must be application/json." }, null],
  ["invalid redirects", 400, { error: "Invalid hosted billing checkout request." }, null],
  ["qualification gate", 503, { error: "AI credit purchases are unavailable while the production helper is awaiting qualification.", code: "ai_qualification_pending" }, null],
  ["invalid credit terms", 503, { error: "Hosted AI credit purchases are unavailable." }, null],
  ["successful session", 200, { checkoutUrl: "https://checkout.stripe.com/synthetic", sessionId: "cs_test_synthetic", purchaseKind: "ai-credit-pack", creditedBudgetCents: 1000, priceCents: 1500 }, null],
  ["dependency outage", 503, { error: "Hosted billing is temporarily unavailable. Please try again later.", code: "billing-unavailable" }, "5"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.actor.mockResolvedValue({ id: "owner_synthetic", label: "Synthetic", email: "test@example.invalid" });
  mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true } });
  mocks.subscription.mockResolvedValue(null);
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: null });
  mocks.qualified.mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("AI checkout cache privacy", () => {
  it.each(cases)("keeps the real AI checkout response private for %s", async (name, status, body, retryAfter) => {
    const facts = { ...env };
    let raw = JSON.stringify(valid);
    if (name === "self-host bypass") facts.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";
    if (name === "blocked configuration") facts.STRIPE_SECRET_KEY = "sk_live_synthetic";
    if (name === "shared protection outage") mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
    if (name === "rate rejection") mocks.rate.mockResolvedValue({ allowed: false, retryAfterMs: 2501 });
    if (name === "missing authentication") mocks.actor.mockResolvedValue(null);
    if (name === "missing entitlement") mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    if (name === "malformed JSON") raw = "{";
    if (name === "invalid redirects") raw = JSON.stringify({ ...valid, successUrl: "https://attacker.invalid" });
    if (name === "qualification gate") mocks.qualified.mockReturnValue(false);
    if (name === "invalid credit terms") facts.TAX_ENGINE_AI_HELPER_TOP_UP_CREDIT_CENTS = "0";
    if (name === "dependency outage") mocks.actor.mockRejectedValue(new Error("synthetic private dependency context"));
    const createCheckoutSession = vi.fn(async () => ({ id: "cs_test_synthetic", url: "https://checkout.stripe.com/synthetic" }));
    const { POST } = createHostedAiCreditCheckoutRouteHandlers({ env: facts, rateLimitStore: createRateLimitStore(), createCheckoutSession });
    const response = await POST(new Request("https://tax.example/api/billing/checkout-ai", {
      method: "POST", headers: { "content-type": name === "unsupported content type" ? "text/plain" : "application/json", "x-real-ip": "192.0.2.1" }, body: raw,
    }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("retry-after")).toBe(retryAfter);
    expect(createCheckoutSession).toHaveBeenCalledTimes(name === "successful session" ? 1 : 0);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
// Synthetic qualification for payment failure paths; no production gate is enabled.
vi.mock("../../../apps/web/src/lib/hosted-ai-availability", () => ({ canPurchaseHostedAiCredits: () => true }));

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), subscription: vi.fn(), entitlement: vi.fn(), rate: vi.fn(),
  customer: vi.fn(), checkout: vi.fn(), portal: vi.fn(),
}));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({
  resolveHostedWorkspaceActor: mocks.actor,
}));
vi.mock("../../../apps/web/src/lib/hosted-billing-db", () => ({
  getHostedSubscriptionByOwnerId: mocks.subscription,
  getHostedEntitlementByOwnerId: mocks.entitlement,
}));
vi.mock("../../../apps/web/src/lib/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../apps/web/src/lib/rate-limit")>(),
  checkRateLimitForEnvironment: mocks.rate,
}));
// Stripe is a web-workspace dependency, not a root dependency. Mock the exact
// installed package so this test cannot fall through to a real SDK request.
vi.mock("../../../apps/web/node_modules/stripe", () => ({ default: class {
  customers = { create: mocks.customer };
  checkout = { sessions: { create: mocks.checkout } };
  billingPortal = { sessions: { create: mocks.portal } };
} }));

import {
  createHostedAiCreditCheckoutRouteHandlers,
  createHostedBillingCheckoutRouteHandlers,
  createHostedBillingPortalRouteHandlers,
} from "../../../apps/web/src/lib/hosted-billing";
import { resolveHostedEntitlement } from "../../../apps/web/src/lib/hosted-plan-access";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

const env = {
  TAX_ENGINE_DEPLOYMENT_MODE: "hosted", NODE_ENV: "production",
  TAX_ENGINE_APP_URL: "https://tax.example", STRIPE_SECRET_KEY: "sk_test_synthetic",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic", STRIPE_PRICE_ID_STARTER_MONTHLY: "price_starter",
  STRIPE_PRICE_ID_PLUS_MONTHLY: "price_plus", STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "price_credit",
  DATABASE_URL: "postgresql://synthetic.invalid/test",
};
const checkoutBody = { planId: "starter", successUrl: "https://tax.example/success", cancelUrl: "https://tax.example/cancel" };
const routeCases = [
  { name: "subscription", factory: createHostedBillingCheckoutRouteHandlers, body: checkoutBody },
  { name: "AI credits", factory: createHostedAiCreditCheckoutRouteHandlers, body: checkoutBody },
  { name: "portal", factory: createHostedBillingPortalRouteHandlers, body: { returnUrl: "https://tax.example/billing" } },
] as const;
function request(body: unknown) {
  return new Request("https://tax.example/api/billing", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "user_synthetic", label: "Synthetic User", email: "synthetic@example.invalid" });
  mocks.subscription.mockResolvedValue(null);
  mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: true } });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 29, retryAfterMs: null });
  mocks.customer.mockResolvedValue({ id: "cus_synthetic" });
  mocks.checkout.mockResolvedValue({ id: "cs_synthetic", url: "https://checkout.stripe.com/synthetic" });
  mocks.portal.mockResolvedValue({ url: "https://billing.stripe.com/synthetic" });
});

describe("hosted billing failure boundaries (synthetic dependencies, no provider traffic)", () => {
  it.each([null, 0, false, [], {}, "", "a".repeat(129), "../another-user"])("rejects malformed workspace identifier %j before any billing operation", async (workspaceId) => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() });
    const response = await POST(request({ ...checkoutBody, workspaceId }));
    expect(response.status).toBe(400);
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  describe.each(routeCases)("$name", ({ factory, body }) => {
    it("bypasses all hosted dependencies for self-hosting", async () => {
      const response = await factory({ env: { TAX_ENGINE_DEPLOYMENT_MODE: "self-host" }, rateLimitStore: createRateLimitStore() }).POST(request(null));
      expect(response.status).toBe(200);
      expect((await response.json()).bypassed).toBe(true);
      expect(mocks.rate).not.toHaveBeenCalled();
      expect(mocks.actor).not.toHaveBeenCalled();
    });

    it("blocks incomplete production configuration before authentication", async () => {
      const response = await factory({ env: { ...env, STRIPE_WEBHOOK_SECRET: "" }, rateLimitStore: createRateLimitStore() }).POST(request(body));
      expect(response.status).toBe(503);
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
    });

    it("requires authentication before reading billing state", async () => {
      mocks.actor.mockResolvedValue(null);
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(request(body));
      expect(response.status).toBe(401);
      expect(mocks.subscription).not.toHaveBeenCalled();
      expect(mocks.entitlement).not.toHaveBeenCalled();
    });

    it.each([2501, null])("returns a bounded retry delay after abuse rejection (%s)", async (retryAfterMs) => {
      mocks.rate.mockResolvedValue({ allowed: false, retryAfterMs });
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(request(body));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe(retryAfterMs === null ? "60" : "3");
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON without creating a payment", async () => {
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(new Request("https://tax.example/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
      expect(response.status).toBe(400);
      expect(mocks.customer).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
      expect(mocks.portal).not.toHaveBeenCalled();
    });

    it.each([null, [], { successUrl: "https://attacker.invalid", cancelUrl: "https://tax.example/cancel", returnUrl: "https://attacker.invalid" }])("rejects invalid or external redirect input %j", async (invalid) => {
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(request(invalid));
      expect(response.status).toBe(400);
      expect(mocks.checkout).not.toHaveBeenCalled();
      expect(mocks.portal).not.toHaveBeenCalled();
    });

    it.each(["authentication", "database", "provider"])("returns a generic retryable response on %s outage without leaking private context", async (dependency) => {
      const privateFailure = new Error("postgresql://private-user:secret@db/private; customer synthetic@example.invalid; sk_live_private");
      if (dependency === "authentication") mocks.actor.mockRejectedValue(privateFailure);
      if (dependency === "database") {
        mocks.entitlement.mockRejectedValue(privateFailure);
        mocks.subscription.mockRejectedValue(privateFailure);
      }
      if (dependency === "provider") {
        mocks.subscription.mockResolvedValue({ customerId: "cus_synthetic", status: "canceled" });
        mocks.checkout.mockRejectedValue(privateFailure);
        mocks.portal.mockRejectedValue(privateFailure);
      }
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(request(body));
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toEqual({ error: "Hosted billing is temporarily unavailable. Please try again later.", code: "billing-unavailable" });
      if (dependency !== "provider") {
        expect(mocks.customer).not.toHaveBeenCalled();
        expect(mocks.checkout).not.toHaveBeenCalled();
        expect(mocks.portal).not.toHaveBeenCalled();
      }
    });

    it("stops before authentication and payment on shared protection outage", async () => {
      mocks.rate.mockResolvedValue({ allowed: false, unavailable: true });
      const response = await factory({ env, rateLimitStore: createRateLimitStore() }).POST(request(body));
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe("rate-limit-unavailable");
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
    });
  });

  it("preserves preview redirect query and fragment while adding the checkout result", async () => {
    const { POST } = createHostedBillingCheckoutRouteHandlers({ env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://tax.example" }, rateLimitStore: createRateLimitStore() });
    const response = await POST(request({ ...checkoutBody, successUrl: "https://tax.example/success?from=account#done" }));
    const redirect = new URL((await response.json()).checkoutUrl);
    expect(redirect.searchParams.get("from")).toBe("account");
    expect(redirect.searchParams.get("checkout")).toBe("preview");
    expect(redirect.searchParams.get("plan")).toBe("starter");
    expect(redirect.hash).toBe("#done");
  });

  it.each(["checkout-pending", "active", "past-due"])("prevents a second subscription purchase while status is %s", async (status) => {
    mocks.subscription.mockResolvedValue({ status, customerId: "cus_existing" });
    const response = await createHostedBillingCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(409);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("rejects the custom review plan without creating a subscription", async () => {
    const response = await createHostedBillingCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request({ ...checkoutBody, planId: "review" }));
    expect(response.status).toBe(400);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each(["starter", "plus"])("binds new %s checkout to the authenticated owner, configured price and exact redirect", async (planId) => {
    const response = await createHostedBillingCheckoutRouteHandlers({ env: { ...env, TAX_ENGINE_STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES: " CARD, unknown, link, cashapp " }, rateLimitStore: createRateLimitStore() }).POST(request({ ...checkoutBody, planId, workspaceId: "workspace_owned" }));
    expect(response.status).toBe(200);
    expect(mocks.subscription).toHaveBeenCalledWith(expect.anything(), "user_synthetic");
    expect(mocks.customer).toHaveBeenCalledWith({ email: "synthetic@example.invalid", name: "Synthetic User", metadata: { hostedOwnerId: "user_synthetic" } });
    expect(mocks.checkout).toHaveBeenCalledWith({
      mode: "subscription", customer: "cus_synthetic", allowed_payment_method_types: ["card", "link", "cashapp"],
      line_items: [{ price: `price_${planId}`, quantity: 1 }], allow_promotion_codes: false,
      success_url: checkoutBody.successUrl, cancel_url: checkoutBody.cancelUrl,
      subscription_data: { metadata: { hostedOwnerId: "user_synthetic", planId, workspaceId: "workspace_owned" } },
      metadata: { hostedOwnerId: "user_synthetic", planId, workspaceId: "workspace_owned" },
    });
  });

  it("reuses the owner's customer after a canceled subscription and drops unsupported payment methods", async () => {
    mocks.subscription.mockResolvedValue({ status: "canceled", customerId: "cus_existing" });
    const response = await createHostedBillingCheckoutRouteHandlers({ env: { ...env, TAX_ENGINE_STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES: "unknown" }, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(200);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_existing", allowed_payment_method_types: undefined, metadata: { hostedOwnerId: "user_synthetic", planId: "starter", workspaceId: "" } }));
  });

  it("allows an account without optional profile fields to create its billing customer", async () => {
    mocks.actor.mockResolvedValue({ id: "user_synthetic", label: null });
    const response = await createHostedBillingCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(200);
    expect(mocks.customer).toHaveBeenCalledWith({ email: undefined, name: undefined, metadata: { hostedOwnerId: "user_synthetic" } });
  });

  it("requires workspace entitlement before selling AI credits", async () => {
    mocks.entitlement.mockResolvedValue({ entitlement: { workspaceAccess: false } });
    const response = await createHostedAiCreditCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(403);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
  });

  it("binds a one-time credit purchase to the existing customer and credit allocation", async () => {
    mocks.subscription.mockResolvedValue({ status: "active", customerId: "cus_existing" });
    const response = await createHostedAiCreditCheckoutRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(200);
    expect(mocks.customer).not.toHaveBeenCalled();
    const metadata = { purchaseKind: "ai-credit-pack", hostedOwnerId: "user_synthetic", aiCreditCents: "1000" };
    expect(mocks.checkout).toHaveBeenCalledWith({ mode: "payment", customer: "cus_existing", allowed_payment_method_types: undefined, line_items: [{ price: "price_credit", quantity: 1 }], allow_promotion_codes: false, success_url: checkoutBody.successUrl, cancel_url: checkoutBody.cancelUrl, metadata, payment_intent_data: { metadata } });
    expect((await response.json()).creditedBudgetCents).toBe(1000);
  });

  it("rejects missing production credit pricing before creating a customer", async () => {
    const response = await createHostedAiCreditCheckoutRouteHandlers({ env: { ...env, STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "" }, rateLimitStore: createRateLimitStore() }).POST(request(checkoutBody));
    expect(response.status).toBe(503);
    expect(mocks.customer).not.toHaveBeenCalled();
  });

  it("keeps AI preview redirects valid without calling Stripe", async () => {
    const response = await createHostedAiCreditCheckoutRouteHandlers({ env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_APP_URL: "https://tax.example", TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "user_synthetic" }, rateLimitStore: createRateLimitStore() }).POST(request({ ...checkoutBody, successUrl: "https://tax.example/success?from=account#done" }));
    const url = new URL((await response.json()).checkoutUrl);
    expect(url.searchParams.get("from")).toBe("account");
    expect(url.searchParams.get("checkout")).toBe("preview-ai-top-up");
    expect(url.hash).toBe("#done");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("opens the portal for only the authenticated owner's customer", async () => {
    mocks.subscription.mockResolvedValue({ customerId: "cus_owned" });
    const response = await createHostedBillingPortalRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request({ returnUrl: "https://tax.example/billing?from=profile" }));
    expect(response.status).toBe(200);
    expect(mocks.subscription).toHaveBeenCalledWith(env, "user_synthetic");
    expect(mocks.portal).toHaveBeenCalledWith({ customer: "cus_owned", return_url: "https://tax.example/billing?from=profile" });
  });

  it("does not create a customer as a side effect of opening an absent billing account", async () => {
    const response = await createHostedBillingPortalRouteHandlers({ env, rateLimitStore: createRateLimitStore() }).POST(request({ returnUrl: "https://tax.example/billing" }));
    expect(response.status).toBe(503);
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.portal).not.toHaveBeenCalled();
  });
});

describe("billing entitlement boundaries", () => {
  it.each([null, "checkout-pending", "canceled"] as const)("does not grant access from an unpaid or absent subscription (%s)", (status) => {
    const result = resolveHostedEntitlement(status === null ? null : { planId: "plus", status, cancelAtPeriodEnd: false, currentPeriodEnd: null });
    expect(result).toEqual({ plan: "self-host", workspaceAccess: false, reminderAutomationAccess: false, reviewAccess: false });
  });
  it.each([
    ["starter", false, false], ["plus", true, false], ["review", true, true],
  ] as const)("grants only %s plan features while active or in payment grace", (planId, reminderAutomationAccess, reviewAccess) => {
    for (const status of ["active", "past-due"] as const) {
      expect(resolveHostedEntitlement({ planId, status, cancelAtPeriodEnd: true, currentPeriodEnd: null })).toEqual({ plan: planId, workspaceAccess: true, reminderAutomationAccess, reviewAccess });
    }
  });
  it("does not treat an active unknown plan as an entitlement", () => {
    expect(resolveHostedEntitlement({ planId: null, status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: null }).workspaceAccess).toBe(false);
  });
});

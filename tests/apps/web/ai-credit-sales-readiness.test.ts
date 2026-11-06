import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/hosted-auth", () => ({ resolveHostedWorkspaceActor: async () => ({ id: "synthetic-owner", label: "Synthetic" }) }));
import { createHostedAiCreditCheckoutRouteHandlers } from "../../../apps/web/src/lib/hosted-billing";
import { createRateLimitStore } from "../../../apps/web/src/lib/rate-limit";

describe("AI credit sales readiness", () => {
  it("cannot sell credits while the actual production helper remains unqualified", async () => {
    const checkout = vi.fn(async () => ({ id: "synthetic-session", url: "https://checkout.stripe.com/synthetic" }));
    const route = createHostedAiCreditCheckoutRouteHandlers({
      env: { TAX_ENGINE_DEPLOYMENT_MODE: "hosted", TAX_ENGINE_BILLING_MODE: "test", TAX_ENGINE_APP_URL: "https://tax.example", TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "synthetic-owner", STRIPE_PRICE_ID_AI_HELPER_TOP_UP: "price_synthetic" },
      rateLimitStore: createRateLimitStore(), createCheckoutSession: checkout,
    });
    const response = await route.POST(new Request("https://tax.example/api/billing/ai-credits/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ successUrl: "https://tax.example/billing?success", cancelUrl: "https://tax.example/billing?cancel", productionRollout: { stage: 100 }, qualified: true }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "ai_qualification_pending" });
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(checkout).not.toHaveBeenCalled();
  });
});

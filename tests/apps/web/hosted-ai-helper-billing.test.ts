import { describe, expect, it } from "vitest";
import {
  estimateHostedAiUsageCost,
  estimateHostedAiReserveCostCents,
  resolveHostedAiIncludedBudgetCents,
  resolveHostedAiMaxOutputTokens,
  resolveHostedAiTopUpCreditCents,
  resolveHostedAiTopUpPriceCents
} from "../../../apps/web/src/lib/hosted-ai-helper-billing";

describe("hosted AI helper billing defaults", () => {
  it("uses the Starter default included budget when the env var is unset", () => {
    expect(resolveHostedAiIncludedBudgetCents("starter", {})).toBe(1000);
  });

  it("uses the Plus default included budget when the env var is blank", () => {
    expect(resolveHostedAiIncludedBudgetCents("plus", {
      TAX_ENGINE_AI_HELPER_INCLUDED_BUDGET_CENTS: "   "
    })).toBe(1000);
  });

  it("keeps self-host access at zero included budget", () => {
    expect(resolveHostedAiIncludedBudgetCents(null, {})).toBe(0);
  });

  it("falls back to the default top-up values when env vars are blank", () => {
    const env = {
      TAX_ENGINE_AI_HELPER_TOP_UP_CREDIT_CENTS: "",
      TAX_ENGINE_AI_HELPER_TOP_UP_PRICE_CENTS: " "
    };

    expect(resolveHostedAiTopUpCreditCents(env)).toBe(1000);
    expect(resolveHostedAiTopUpPriceCents(env)).toBe(1500);
  });

  it("falls back to the default max output tokens when the env var is blank", () => {
    expect(resolveHostedAiMaxOutputTokens({
      TAX_ENGINE_AI_HELPER_MAX_OUTPUT_TOKENS: ""
    })).toBe(4096);
  });

  it("accounts using exact published prices and rejects unknown prices", () => {
    const input = { requestPayload: "test", modelId: "gpt-6-luna", inputTokens: 1000, outputTokens: 1000, at: "2026-10-24" };
    expect(estimateHostedAiUsageCost(input, {})).toMatchObject({ providerCostUsd: "0.0006", estimatedCostCents: 1, usageKind: "reported" });
    expect(() => estimateHostedAiUsageCost({ ...input, modelId: "unpriced" }, {})).toThrow(/No verified pricing/);
    expect(estimateHostedAiUsageCost({ ...input, modelId: "custom" }, {
      TAX_ENGINE_AI_HELPER_INPUT_USD_PER_MILLION: "0.125", TAX_ENGINE_AI_HELPER_OUTPUT_USD_PER_MILLION: "0.50",
    }).providerCostUsd).toBe("0.000625");
  });

  it("reserves the configured output limit and rejects fractional cent configuration", () => {
    const env = { TAX_ENGINE_AI_HELPER_MAX_OUTPUT_TOKENS: "8192" };
    expect(estimateHostedAiReserveCostCents({ requestPayload: "test", modelId: "gpt-5-mini" }, env)).toBe(2);
    expect(resolveHostedAiIncludedBudgetCents("plus", { TAX_ENGINE_AI_HELPER_INCLUDED_BUDGET_CENTS: "0.1" })).toBe(1000);
  });
});

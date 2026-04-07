import { describe, expect, it } from "vitest";
import {
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
    })).toBe(700);
  });
});

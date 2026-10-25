import { describe, expect, it } from "vitest";
import { AI_TASKS, aiTaskCacheKeyParts, resolveCandidateAiRoute, type AiTask } from "../../../packages/engine/src/ai-task-registry";
import { calculateAiCost, getAiPrice } from "../../../packages/engine/src/ai-pricing";

describe("AI task candidates and exact costs", () => {
  it("keeps all candidates out of production and honors opt-out", () => {
    for (const task of Object.keys(AI_TASKS) as AiTask[]) {
      expect(resolveCandidateAiRoute(task, { mode: "production", verifiedTaxContext: true })).toBeNull();
      expect(resolveCandidateAiRoute(task, { mode: "evaluation", optedOut: true })).toBeNull();
    }
  });
  it("uses Luna high for structured work and Sol low only with verified tax context", () => {
    expect(resolveCandidateAiRoute("income-extraction", { mode: "evaluation" })?.profile).toMatchObject({ model: "gpt-6-luna", effort: "high" });
    expect(() => resolveCandidateAiRoute("tax-explanation", { mode: "evaluation" })).toThrow(/Verified/);
    expect(resolveCandidateAiRoute("tax-explanation", { mode: "evaluation", verifiedTaxContext: true })?.profile).toMatchObject({ model: "gpt-6.1-sol", effort: "low" });
    expect(resolveCandidateAiRoute("workspace-summary", { mode: "evaluation", provider: "google" })?.profile).toMatchObject({ model: "gemini-3.8-flash", effort: "high" });
  });
  it("requires a single explicit cancellable escalation", () => {
    expect(() => resolveCandidateAiRoute("complex-reconciliation", { mode: "evaluation", verifiedTaxContext: true })).toThrow(/explicit escalation/);
    expect(() => resolveCandidateAiRoute("complex-reconciliation", { mode: "evaluation", verifiedTaxContext: true, escalationCount: 2 })).toThrow(/At most one/);
    expect(resolveCandidateAiRoute("complex-reconciliation", { mode: "evaluation", verifiedTaxContext: true, escalationCount: 1 }))
      .toMatchObject({ profile: { model: "gpt-6.1-sol", effort: "high" }, policy: { execution: "cancellable-job", maxEscalations: 0 } });
  });
  it("partitions proposed caches by owner, year, content and rule versions", () => {
    const key = { ownerScope: "owner-a", contentDigest: "digest", taxYear: 2026, ruleVersion: "2026.1", task: "income-extraction" as const, profile: "luna-high" as const };
    const baseline = aiTaskCacheKeyParts(key);
    expect(aiTaskCacheKeyParts({ ...key, ownerScope: "owner-b" })).not.toEqual(baseline);
    expect(aiTaskCacheKeyParts({ ...key, taxYear: 2025 })).not.toEqual(baseline);
    expect(aiTaskCacheKeyParts({ ...key, ruleVersion: "2026.2" })).not.toEqual(baseline);
    expect(baseline).toContain("income-extraction/2");
    expect(() => aiTaskCacheKeyParts({ ...key, ownerScope: "" })).toThrow();
  });
  it("distinguishes sub-cent provider costs from the minimum retail charge", () => {
    expect(calculateAiCost("gpt-6-luna", "2026-10-24", { inputTokens: 1000, outputTokens: 1000 }))
      .toEqual({ providerCostUsd: "0.0006", retailChargeCents: 1, pricingEffectiveFrom: "2026-10-24" });
    expect(calculateAiCost("gpt-6.1-sol", "2026-10-24", { inputTokens: 1000, outputTokens: 4096 }).providerCostUsd).toBe("0.04296");
  });
  it("switches Google's rate at midnight UTC on January 1, including cache storage", () => {
    const usage = { inputTokens: 2000000, cachedInputTokens: 1000000, outputTokens: 1000000, cachedTokenHours: "1000000" };
    expect(calculateAiCost("gemini-3.8-flash", "2026-12-31T23:59:59Z", usage).providerCostUsd).toBe("5.075");
    expect(calculateAiCost("gemini-3.8-flash", "2027-01-01T00:00:00Z", usage).providerCostUsd).toBe("10.15");
    expect(getAiPrice("gemini-3.8-flash", "2027-01-01T00:30:00+02:00").input).toBe("0.75");
  });
  it("accounts for cache reads, both cache-write durations, long context and region", () => {
    const usage = { inputTokens: 300000, outputTokens: 1000, cachedInputTokens: 100000, cacheWrite30mTokens: 50000, cacheWrite12hTokens: 50000, regionalProcessing: true };
    // Sol: (200000 + 10000 + 125000 + 250000) * 2 + 15000 = 1185000 / 1M * 1.1.
    expect(calculateAiCost("gpt-6.1-sol", "2026-10-24", usage).providerCostUsd).toBe("1.3035");
    expect(calculateAiCost("gpt-6-luna", "2026-10-24", { inputTokens: 272000, outputTokens: 1 }).providerCostUsd).toBe("0.0272005");
    expect(calculateAiCost("gpt-6-luna", "2026-10-24", { inputTokens: 272001, outputTokens: 1 }).providerCostUsd).toBe("0.05440095");
  });
  it("rejects unpriced models and invalid usage instead of substituting prices", () => {
    expect(() => getAiPrice("made-up", "2026-10-24")).toThrow(/No verified pricing/);
    expect(() => getAiPrice("gpt-6-luna", "2026-01-01")).toThrow(/No verified pricing/);
    for (const inputTokens of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calculateAiCost("gpt-6-luna", "2026-10-24", { inputTokens, outputTokens: 0 })).toThrow(/Token usage/);
    }
    expect(() => calculateAiCost("gpt-6-luna", "2026-10-24", { inputTokens: 1, outputTokens: 0, cachedInputTokens: 2 })).toThrow(/exceed/);
    expect(() => calculateAiCost("gemini-3.8-flash", "2026-10-24", { inputTokens: 1, outputTokens: 0, cacheWrite30mTokens: 1 })).toThrow(/cache-write/);
  });
});

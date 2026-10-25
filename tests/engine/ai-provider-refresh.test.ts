import { describe, expect, it } from "vitest";
import { AI_PRICES, calculateAiCost } from "../../packages/engine/src/ai-pricing";
import { buildProviderModelBenchmark, scoreProviderEvalEntry, summarizeProviderModelLiveEvalTemplate, type ProviderModelLiveEvalEntry } from "../../packages/engine/src/provider-model-eval";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { PROVIDER_EVAL_BINDING_VERSION, validateProviderEvalOutput } from "../../packages/engine/src/provider-eval-application";
import { providerEvalCorpusDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";
import { createProviderEvalPlan, executeProviderEval, providerEvalDigest, type EvalJournalRecord } from "../../scripts/lib/provider-eval-runner";

const before = "2026-12-10T23:59:59.000Z";
const shutdown = "2026-12-11T00:00:00.000Z";
const expiry = "2026-12-11T01:00:00.000Z";
const planInput = { runId: "retirement-boundary", purpose: "smoke" as const, profileIds: ["baseline-gpt-5-mini"],
  fixtureIds: ["case-income-w2-zero-withholding"], maximumProviderUsd: "1", maximumRequests: 4, createdAt: before, expiresAt: expiry };
function historicalEntry() {
  const fixture = taxProviderModelEvalFixtures.find(item => item.id === "case-income-w2-zero-withholding");
  if (!fixture) throw new Error("Missing test fixture.");
  const payload = { disposition: "answer", sourceIds: fixture.sourceIds, label: "W-2", payer: "[organization-1]", documentPeriod: "2026", summary: "Unconfirmed printed facts.", suggestions: [], facts: [
    { name: "wages", kind: "money", value: "48222.19", sourceId: fixture.sourceIds[0], sourceQuote: "W-2 box 1: 48,222.19; box 2: 0.00." },
    { name: "withholding", kind: "money", value: "0", sourceId: fixture.sourceIds[0], sourceQuote: "W-2 box 1: 48,222.19; box 2: 0.00." },
  ] };
  const validated = validateProviderEvalOutput(fixture, payload);
  const entry: ProviderModelLiveEvalEntry = { profileId: "baseline-gpt-5-mini", fixtureId: fixture.id, fixtureVersion: 1, repeat: 1, elapsedMs: 1,
    applicationSchemaValid: true, output: validated.output,
    independentReview: { method: "human", reviewer: "synthetic-unit-only-not-human-review", grounded: true, qualityAccepted: true, piiLeak: false },
    attempts: [{ profileId: "baseline-gpt-5-mini", startedAt: before, usage: { inputTokens: 100, outputTokens: 100 } }],
    measurement: { runPurpose: "qualification", planDigest: "0".repeat(64), corpusDigest: providerEvalCorpusDigest(), fixtureDigest: providerEvalFixtureDigest(fixture), bindingVersion: PROVIDER_EVAL_BINDING_VERSION,
      promptVersion: "income-extraction/2", schemaVersion: "income-extraction/2", normalizationStatus: "bound", applicationOutput: payload, privacyFailure: false, responseReference: "test-only", reportedModel: "gpt-5-mini-2025-08-07" } };
  return { fixture, entry };
}
describe("dated public provider sources", () => {
  it("keeps public capabilities separate from actual account evidence", () => {
    const facts = buildProviderModelBenchmark().publicProviderFacts;
    expect(facts).toHaveLength(5);
    expect(facts.every(item => item.retrievedAt === "2026-10-25" && item.accountAvailability === "unverified")).toBe(true);
    expect(facts.find(item => item.model === "gpt-5-mini")).toMatchObject({ shutdownDate: "2026-12-11", structuredOutputsDocumented: true, configuredEfforts: ["minimal"] });
    expect(facts.find(item => item.model === "gemini-3.8-flash")).toMatchObject({ shutdownDate: null, structuredOutputsDocumented: true, configuredEfforts: ["high"] });
  });
  it("rejects a retired baseline plan without replacing the requested model", () => {
    expect(createProviderEvalPlan(planInput).profileIds).toEqual(["baseline-gpt-5-mini"]);
    expect(() => createProviderEvalPlan({ ...planInput, createdAt: shutdown })).toThrow(/shutdown|retired/i);
    expect(() => createProviderEvalPlan({ ...planInput, createdAt: "2027-01-01T00:00:00.000Z", expiresAt: "2027-01-01T01:00:00.000Z" })).toThrow(/shutdown|retired/i);
  });
  it("stops at the shutdown boundary while retaining earlier charges", async () => {
    const plan = createProviderEvalPlan(planInput); const records: EvalJournalRecord[] = [];
    let time = before; let calls = 0;
    const result = await executeProviderEval({ plan, records, now: () => time, append: async record => { records.push(record); },
      approval: { version: 1, planDigest: providerEvalDigest(plan), authorizedBy: "unit-only", authorizationReference: "no-live-approval", approvedAt: before, expiresAt: expiry, maximumProviderUsd: "1", maximumRequests: 4, accountReference: "unit-account", syntheticOnly: true },
      transport: async () => { calls++; time = shutdown; return { status: "completed", usage: { inputTokens: 100, outputTokens: 100 }, elapsedMs: 1, reportedModel: "gpt-5-mini-2025-08-07", responseReference: "synthetic", payload: { probe: "ok" } }; } });
    expect(calls).toBe(1); expect(result.stoppedReason).toBe("model-shutdown");
    expect(result.knownProviderCostUsd).toBe("0.000225"); expect(result.template.entries).toEqual([]);
    expect(records.filter(record => record.type === "dispatch")).toHaveLength(1);
  });
  it("retains historical cost but rejects post-shutdown quality evidence", () => {
    const { fixture, entry } = historicalEntry();
    expect(scoreProviderEvalEntry(entry, fixture)).toMatchObject({ accepted: true, actualCostUsd: "0.000225" });
    entry.attempts[0].startedAt = shutdown;
    expect(scoreProviderEvalEntry(entry, fixture)).toMatchObject({ accepted: false, complete: false, criticalCorrect: false, actualCostUsd: "0.000225" });
    entry.attempts[0].startedAt = "2026-12-11T00:30:00+02:00";
    expect(scoreProviderEvalEntry(entry, fixture).accepted).toBe(true);
  });
  it("preserves exact effective prices and labels retired January projections", () => {
    expect(AI_PRICES.every(price => price.retrievedAt === "2026-10-25")).toBe(true);
    expect(AI_PRICES.filter(price => price.model !== "gemini-3.8-flash").every(price => price.effectiveFrom === "2026-10-24")).toBe(true);
    const usage = { inputTokens: 2000000, cachedInputTokens: 1000000, outputTokens: 1000000, cachedTokenHours: "1000000" };
    expect(calculateAiCost("gemini-3.8-flash", "2026-12-31T23:59:59Z", usage).providerCostUsd).toBe("5.075");
    expect(calculateAiCost("gemini-3.8-flash", "2027-01-01T00:00:00Z", usage).providerCostUsd).toBe("10.15");
    const { entry } = historicalEntry();
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [entry] });
    const baseline = summary.groups.find(group => group.profileId === "baseline-gpt-5-mini" && group.task === "income-extraction");
    expect(baseline).toMatchObject({ providerCostUsd: "0.000225", filingSeasonCostUsd: "0.000225", filingSeasonLifecycle: { status: "shutdown", shutdownDate: "2026-12-11" }, filingSeasonCostKind: "historical-price-projection-retired-model" });
    expect(baseline?.eligibleForPromotionReview).toBe(false);
  });
  it("rejects unpriced Google regional usage regardless of the source URL", () => {
    for (const model of ["gemini-3-flash-preview", "gemini-3.8-flash"]) {
      expect(() => calculateAiCost(model, "2026-10-25", { inputTokens: 100, outputTokens: 100, regionalProcessing: true })).toThrow(/Regional Google pricing/);
    }
  });
});

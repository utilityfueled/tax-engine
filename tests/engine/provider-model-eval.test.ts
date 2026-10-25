import { describe, expect, it } from "vitest";
import {
  buildProviderModelBenchmark, buildProviderModelEvalFixturePack, buildProviderModelLiveEvalTemplate,
  parseProviderModelLiveEvalTemplate, providerModelCandidates, recommendProviderModelStack,
  scoreProviderEvalEntry, summarizeProviderModelLiveEvalTemplate, taxProviderModelEvalFixtures,
  type ProviderModelLiveEvalEntry,
} from "../../packages/engine/src/provider-model-eval";
import type { ProviderEvalFixture } from "../../packages/engine/src/provider-eval-fixtures";

function run(fixture: ProviderEvalFixture, profileId = "luna-high", repeat = 1): ProviderModelLiveEvalEntry {
  return {
    profileId, fixtureId: fixture.id, fixtureVersion: 1, repeat, elapsedMs: 1000,
    applicationSchemaValid: true,
    output: { disposition: fixture.expected.disposition, fields: Object.fromEntries(Object.entries(fixture.expected.fields).map(([key, value]) => [key, value.value])),
      category: fixture.expected.category, sourceIds: fixture.sourceIds, engineValues: fixture.expected.engineValues, filingReady: false },
    independentReview: { method: "human", reviewer: "independent-test-reviewer", grounded: true, qualityAccepted: true, piiLeak: false },
    attempts: [{ profileId, startedAt: "2026-10-24T12:00:00Z", usage: { inputTokens: 1000, outputTokens: 1000 } }],
  };
}
const extraction = taxProviderModelEvalFixtures.find(fixture => fixture.id === "income-extraction-large-exact-1")!;

describe("measured task model evaluation", () => {
  it("keeps 240 draft cases across all actual tasks, with a fixed held-out subset and no qualification claim", () => {
    const pack = buildProviderModelEvalFixturePack();
    expect(pack.fixtureCount).toBe(240);
    expect(pack.taskTypes).toHaveLength(8);
    expect(pack.fixtures.filter(fixture => fixture.split === "held-out")).toHaveLength(80);
    expect(pack.fixtures.every(fixture => fixture.review.status === "pending")).toBe(true);
    expect(new Set(pack.fixtures.map(fixture => fixture.id)).size).toBe(240);
    expect(pack.qualification).toBe("draft-unreviewed");
  });
  it("has effort-specific candidates and both baselines, without fabricated quality scores or recommendations", () => {
    expect(providerModelCandidates.map(profile => profile.id)).toEqual(["luna-high", "sol-low", "sol-high", "gemini-flash-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"]);
    expect(JSON.stringify(buildProviderModelBenchmark())).not.toContain('taskScores');
    expect(recommendProviderModelStack()).toBeNull();
    expect(buildProviderModelBenchmark().recommendation).toBeNull();
  });
  it("fails closed for an empty or independently unreviewed corpus", () => {
    const empty = summarizeProviderModelLiveEvalTemplate(buildProviderModelLiveEvalTemplate());
    expect(empty.independentlyReviewedCases).toBe(0);
    expect(empty.groups.every(group => !group.eligibleForPromotionReview)).toBe(true);
    const partial = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [run(extraction)] });
    const group = partial.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction")!;
    expect(group.blockers).toContain("independent-fixture-review-incomplete");
    expect(group.blockers).toContain("held-out-repeat-coverage-incomplete");
    expect(group.blockers).toContain("baseline-comparison-incomplete");
  });
  it("uses Decimal for exact cent comparisons beyond JavaScript's safe monetary range", () => {
    const entry = run(extraction);
    expect(scoreProviderEvalEntry(entry, extraction).accepted).toBe(true);
    entry.output!.fields.amount = "90071992547409.92";
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, criticalCorrect: false, exactFields: 1 });
  });
  it("counts missing or abstained critical fields as failures and reports abstention separately", () => {
    const entry = run(extraction);
    entry.output!.disposition = "abstain";
    entry.output!.fields = {};
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [entry] });
    expect(summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction"))
      .toMatchObject({ criticalFieldExactMatch: 0, answerableAbstentions: 1, acceptedRuns: 0 });
  });
  it.each(["pii", "filing", "override", "invented", "grounding", "category", "date", "schema"])("rejects %s failures", failure => {
    const entry = run(extraction);
    if (failure === "pii") entry.independentReview!.piiLeak = true;
    if (failure === "filing") entry.output!.filingReady = true;
    if (failure === "override") entry.output!.engineValues = { invented: "2200" };
    if (failure === "invented") entry.output!.fields.invented = "123";
    if (failure === "grounding") entry.output!.sourceIds = ["not-a-source"];
    if (failure === "category") entry.output!.category = "business";
    if (failure === "date") entry.output!.fields.date = "2025-06-29";
    if (failure === "schema") entry.applicationSchemaValid = false;
    expect(scoreProviderEvalEntry(entry, extraction).accepted).toBe(false);
  });
  it("retains actual and January costs for rejected outputs, including the one escalation", () => {
    const entry = run(extraction, "gemini-flash-high");
    entry.applicationSchemaValid = false;
    entry.attempts.push({ profileId: "sol-high", startedAt: "2026-10-24T12:00:02Z", usage: { inputTokens: 1000, outputTokens: 1000 } });
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, actualCostUsd: "0.0165", filingSeasonCostUsd: "0.021" });
  });
  it("does not convert unknown usage or missing independent review into a measured pass", () => {
    const entry = run(extraction);
    entry.attempts[0]!.usage = null;
    entry.independentReview = null;
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, complete: false, actualCostUsd: null });
  });
  it("rejects duplicate runs, unknown profiles, invalid token counts and extra escalations", () => {
    const entry = run(extraction);
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [entry, entry] })).toThrow(/duplicate run/);
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [{ ...entry, profileId: "made-up" }] })).toThrow(/Unknown evaluation profile/);
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [{ ...entry, attempts: [entry.attempts[0], entry.attempts[0], entry.attempts[0]] }] })).toThrow();
    const invalid = structuredClone(entry); invalid.attempts[0]!.usage!.inputTokens = -1;
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [invalid] })).toThrow();
  });
  it("requires reviewed repeated comparisons and a measured benefit, then only permits human promotion review", () => {
    const fixtures = taxProviderModelEvalFixtures.map(fixture => ({ ...fixture, review: { author: "author", status: "reviewed" as const, reviewer: "different-reviewer", reviewedAt: "2026-10-24" } }));
    const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
    const entries = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"].flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries }, fixtures);
    expect(summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction"))
      .toMatchObject({ completedRuns: 90, schemaValidity: 1, criticalFieldExactMatch: 1, eligibleForPromotionReview: true, blockers: [] });
    expect(summary.productionPromotion).toBe(false);
    entries[0]!.output!.fields.amount = "999";
    const rejected = summarizeProviderModelLiveEvalTemplate({ version: 2, entries }, fixtures);
    expect(rejected.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction")!.blockers).toContain("critical-field-regression");
  });
});

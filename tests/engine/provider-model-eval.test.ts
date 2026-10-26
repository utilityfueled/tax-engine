import { describe, expect, it } from "vitest";
import {
  buildProviderModelBenchmark, buildProviderModelEvalFixturePack, buildProviderModelLiveEvalTemplate,
  parseProviderModelLiveEvalTemplate, providerModelCandidates, recommendProviderModelStack,
  scoreProviderEvalEntry, summarizeProviderModelLiveEvalTemplate, taxProviderModelEvalFixtures,
  type ProviderModelLiveEvalEntry,
  type ProviderModelLiveEvalTemplate,
} from "../../packages/engine/src/provider-model-eval";
import { AI_TASKS } from "../../packages/engine/src/ai-task-registry";
import { PROVIDER_EVAL_BINDING_VERSION, validateProviderEvalOutput } from "../../packages/engine/src/provider-eval-application";
import type { ProviderEvalFixture } from "../../packages/engine/src/provider-eval-fixtures";
import { providerEvalCorpusDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";

// Every synthetic entry uses this same unmodified corpus. Hash it once when
// preparing the test fixtures; the production report still validates provenance.
const syntheticCorpusDigest = providerEvalCorpusDigest();

function run(fixture: ProviderEvalFixture, profileId = "luna-high", repeat = 1): ProviderModelLiveEvalEntry {
  // Test-only payloads are built from literal test oracles. Never written to a run artifact.
  const applicationOutput = { disposition: fixture.expected.disposition, sourceIds: fixture.sourceIds,
    label: "Synthetic source", payer: "[organization-1]", documentPeriod: String(fixture.taxYear), summary: "Review the source facts.", suggestions: [],
    facts: Object.entries(fixture.expected.fields).map(([name, field]) => ({ name, kind: field.kind, value: field.value,
      sourceId: fixture.sourceIds[0], sourceQuote: fixture.input })) };
  const validated = validateProviderEvalOutput(fixture, applicationOutput);
  const profile = providerModelCandidates.find(item => item.id === profileId);
  if (!profile) throw new Error("Missing test profile.");
  return {
    profileId, fixtureId: fixture.id, fixtureVersion: 1, repeat, elapsedMs: 1000,
    applicationSchemaValid: validated.applicationSchemaValid, output: validated.output,
    measurement: { runPurpose: "qualification", planDigest: "0".repeat(64), corpusDigest: syntheticCorpusDigest, fixtureDigest: providerEvalFixtureDigest(fixture), bindingVersion: PROVIDER_EVAL_BINDING_VERSION,
      promptVersion: AI_TASKS[fixture.task].promptVersion, schemaVersion: AI_TASKS[fixture.task].schemaVersion,
      normalizationStatus: validated.normalizationStatus, applicationOutput, privacyFailure: false, responseReference: "test-only", reportedModel: profile.model },
    independentReview: { method: "human", reviewer: "independent-test-reviewer", grounded: true, qualityAccepted: true, piiLeak: false },
    attempts: [{ profileId, startedAt: "2026-10-24T12:00:00Z", usage: { inputTokens: 1000, outputTokens: 1000 } }],
  };
}
function changePayload(entry: ProviderModelLiveEvalEntry, change: (payload: { disposition: string; facts: {name: string; value: string}[] }) => void) {
  if (!entry.measurement) throw new Error("Missing test measurement.");
  const payload = entry.measurement.applicationOutput as { disposition: string; facts: {name: string; value: string}[] };
  change(payload);
  const fixture = taxProviderModelEvalFixtures.find(fixture => fixture.id === entry.fixtureId);
  if (!fixture) throw new Error("Missing test fixture.");
  const validated = validateProviderEvalOutput(fixture, payload);
  entry.output = validated.output; entry.applicationSchemaValid = validated.applicationSchemaValid;
  entry.measurement.normalizationStatus = validated.normalizationStatus;
}
const extraction = taxProviderModelEvalFixtures.find(fixture => fixture.id === "case-income-large-ledger-precision")!;
// Explicitly synthetic evidence for exercising gates; these records are never written to qualification artifacts.
const availability: ProviderModelLiveEvalTemplate["availability"] = providerModelCandidates.map(profile => ({
  profileId: profile.id, status: "available", checkedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-10-25T00:00:00Z",
  evidenceReference: "test-only-account-capability", structuredOutput: true, reasoningEffort: true, reportedUsage: true, reason: "Synthetic test evidence",
}));

describe("measured task model evaluation", () => {
  it("keeps 240 distinct draft scenarios with fixed held-out coverage and no qualification claim", () => {
    const pack = buildProviderModelEvalFixturePack();
    expect(pack.fixtureCount).toBe(240);
    expect(pack.templateVariantCount).toBe(0);
    expect(pack.standaloneScenarioCount).toBe(240);
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
    changePayload(entry, payload => { const amount = payload.facts.find(fact => fact.name === "amount"); if (!amount) throw new Error("Missing amount."); amount.value = "90071992547409.92"; });
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, criticalCorrect: false, exactFields: 1 });
  });
  it("counts missing or abstained critical fields as failures and reports abstention separately", () => {
    const entry = run(extraction);
    changePayload(entry, payload => { payload.disposition = "abstain"; payload.facts = []; });
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
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures);
    expect(summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction"))
      .toMatchObject({ completedRuns: 90, schemaValidity: 1, criticalFieldExactMatch: 1, eligibleForPromotionReview: true, blockers: [] });
    expect(summary.productionPromotion).toBe(false);
    changePayload(entries[0]!, payload => { const amount = payload.facts[0]; if (!amount) throw new Error("Missing amount."); amount.value = "999"; });
    const rejected = summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures);
    expect(rejected.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction")!.blockers).toContain("critical-field-regression");
  });
  it.each(["unavailable", "failed"] as const)("records %s account checks without treating them as passing runs", status => {
    const evidence = availability!.map(item => ({ ...item, status }));
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [run(extraction)], availability: evidence });
    expect(summary.groups[0]!.availability?.status).toBe(status);
    expect(summary.groups.every(group => group.blockers.includes("account-capability-unverified-or-unavailable"))).toBe(true);
  });
  it("rejects duplicated or indefinitely valid account evidence", () => {
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [], availability: [availability![0], availability![0]] })).toThrow(/Duplicate/);
    expect(() => parseProviderModelLiveEvalTemplate({ version: 2, entries: [], availability: [{ ...availability![0], expiresAt: "2027-12-01T00:00:00Z" }] })).toThrow(/30 days/);
  });
  it("enforces the declared P50 budget even when the P95 budget passes", () => {
    const entry = run(extraction); entry.elapsedMs = 15000;
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [entry], availability });
    const group = summary.groups.find(item => item.profileId === "luna-high" && item.task === "income-extraction")!;
    expect(group.p95LatencyMs).toBe(15000);
    expect(group.blockers).toContain("latency-budget");
  });
  it("requires account capability evidence for every escalation at the attempt time", () => {
    const entry = run(extraction); entry.attempts.push({ profileId: "sol-high", startedAt: "2026-10-25T12:00:00Z", usage: { inputTokens: 1, outputTokens: 1 } });
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [entry], availability });
    expect(summary.groups.find(item => item.profileId === "luna-high" && item.task === "income-extraction")!.blockers).toContain("account-capability-unverified-or-unavailable");
  });
  it("rejects changed, duplicated or removed cases in reviewed corpus input", () => {
    const template = buildProviderModelLiveEvalTemplate();
    expect(() => summarizeProviderModelLiveEvalTemplate(template, taxProviderModelEvalFixtures.slice(1))).toThrow(/full frozen corpus/);
    const duplicate = [...taxProviderModelEvalFixtures]; duplicate[1] = duplicate[0]!;
    expect(() => summarizeProviderModelLiveEvalTemplate(template, duplicate)).toThrow(/unique IDs/);
    const changed = structuredClone(taxProviderModelEvalFixtures); changed[0]!.expected.fields = { invented: { kind: "money", value: "1" } };
    expect(() => summarizeProviderModelLiveEvalTemplate(template, changed)).toThrow(/frozen case content/);
  });
});

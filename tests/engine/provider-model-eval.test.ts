import Decimal from "decimal.js";
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
import { providerEvalCorpusDigest, providerEvalDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";

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
      normalizationStatus: validated.normalizationStatus, applicationOutput, privacyFailure: false,
      responseReference: providerEvalDigest(["unit-test-only", profileId, fixture.id, repeat]), reportedModel: profile.model },
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
const reportAt = "2026-10-25T00:00:00Z";

function reviewedFixtures(reviewedAt: string) {
  return taxProviderModelEvalFixtures.map(fixture => ({ ...fixture, review: { ...fixture.review,
    status: "reviewed" as const, reviewer: "different-reviewer", reviewedAt } }));
}

// Explicitly synthetic evidence for exercising gates; these records are never written to qualification artifacts.
const availability: ProviderModelLiveEvalTemplate["availability"] = providerModelCandidates.map(profile => ({
  profileId: profile.id, status: "available", checkedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-10-25T00:00:00Z",
  evidenceReference: "test-only-account-capability", structuredOutput: true, reasoningEffort: true, reportedUsage: true, reason: "Synthetic test evidence",
}));

function qualityComparison() {
  const fixtures = reviewedFixtures("2026-10-24");
  const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
  const profiles = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"] as const;
  const entries = profiles.flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
  for (const { attempts } of entries.filter(entry => entry.profileId === "luna-high")) {
    for (const attempt of attempts) attempt.usage = { inputTokens: 6000, outputTokens: 6000 };
  }
  const summarize = () => summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures, reportAt);
  const reviewedEntry = (profileId: (typeof profiles)[number]) => {
    const entry = entries.find(entry => entry.profileId === profileId);
    if (!entry?.independentReview) throw new Error("Missing test-only response review.");
    return { entry, review: entry.independentReview };
  };
  return { summarize, reviewedEntry, baselineIds: profiles.slice(1) };
}

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
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: true, criticalCorrect: true, exactFields: 2 });
    changePayload(entry, payload => { const amount = payload.facts.find(fact => fact.name === "amount"); if (!amount) throw new Error("Missing amount."); amount.value = "90071992547409.92"; });
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, criticalCorrect: false, exactFields: 1 });
  });
  it.each(["bindingVersion", "promptVersion", "schemaVersion"] as const)("counts stale %s evidence as zero exact fields without dropping required fields or cost", version => {
    const stale = run(extraction);
    const current = run(extraction, "luna-high", 2);
    if (!stale.measurement) throw new Error("Missing synthetic measurement.");
    stale.measurement[version] = "previous-version";

    const currentScore = scoreProviderEvalEntry(current, extraction);
    expect(currentScore).toMatchObject({ accepted: true, criticalCorrect: true, requiredFields: 2, exactFields: 2 });
    expect(currentScore.actualCostUsd).not.toBeNull();
    expect(scoreProviderEvalEntry(stale, extraction)).toMatchObject({
      complete: false, accepted: false, schemaValid: false, criticalCorrect: false, requiredFields: 2, exactFields: 0,
      actualCostUsd: currentScore.actualCostUsd, filingSeasonCostUsd: currentScore.filingSeasonCostUsd,
    });

    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [stale, current] }, undefined, reportAt);
    const group = summary.groups.find(item => item.profileId === "luna-high" && item.task === "income-extraction");
    expect(group).toMatchObject({ criticalFieldExactMatch: 0.5, schemaValidity: 0.5, completedRuns: 1, acceptedRuns: 1,
      blockers: expect.arrayContaining(["held-out-repeat-coverage-incomplete", "critical-field-exact-match"]) });
  });
  it("counts missing or abstained critical fields as failures and reports abstention separately", () => {
    const entry = run(extraction);
    changePayload(entry, payload => { payload.disposition = "abstain"; payload.facts = []; });
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [entry] });
    expect(summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction"))
      .toMatchObject({ criticalFieldExactMatch: 0, answerableAbstentions: 1, acceptedRuns: 0 });
  });
  it("counts only bound current outputs as observed abstentions", () => {
    const explicit = run(extraction);
    const stale = run(extraction, "luna-high", 2);
    const missing = run(extraction, "luna-high", 3);
    for (const entry of [explicit, stale]) {
      changePayload(entry, payload => { payload.disposition = "abstain"; payload.facts = []; });
    }
    if (!stale.measurement || !missing.measurement) throw new Error("Missing synthetic measurement.");
    stale.measurement.schemaVersion = "previous-version";
    missing.measurement.applicationOutput = null;
    missing.measurement.normalizationStatus = "failed";
    missing.output = null;
    missing.applicationSchemaValid = false;

    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [explicit, stale, missing] }, undefined, reportAt);
    expect(summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction"))
      .toMatchObject({ criticalFieldExactMatch: 0, answerableAbstentions: 1, unanswerableAbstentions: 0, acceptedRuns: 0 });
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
    entry.elapsedMs = 3000;
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
    const fixtures = reviewedFixtures("2026-10-24");
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
  it("blocks an over-budget held-out attempt while retaining exact cost", () => {
    const fixtures = reviewedFixtures("2026-10-24");
    const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
    const profiles = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"];
    const entries = profiles.flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
    const heldOutCase = cases.find(fixture => fixture.id === "case-income-w2-injection" && fixture.split === "held-out");
    if (!heldOutCase) throw new Error("Missing frozen held-out case.");
    const heldOutEntry = entries.find(entry => entry.profileId === "luna-high" && entry.fixtureId === heldOutCase.id && entry.repeat === 1);
    const attempt = heldOutEntry?.attempts[0];
    if (!attempt) throw new Error("Missing held-out attempt.");
    const summarize = () => summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures, reportAt)
      .groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");

    attempt.usage = { inputTokens: 24000, outputTokens: 8192 };
    expect(summarize()).toMatchObject({ acceptedRuns: 90, completedRuns: 90, eligibleForPromotionReview: true, blockers: [] });

    for (const [usage, cost] of [
      [{ inputTokens: 1000, outputTokens: 8193 }, "0.0575965"],
      [{ inputTokens: 24001, outputTokens: 1000 }, "0.0563001"],
    ] as const) {
      attempt.usage = usage;
      expect(summarize()).toMatchObject({
        acceptedRuns: 89, completedRuns: 89, schemaValidity: 89 / 90, eligibleForPromotionReview: false,
        blockers: expect.arrayContaining(["attempt-token-budget-exceeded"]),
        providerCostUsd: cost, filingSeasonCostUsd: cost,
      });
    }
  });
  it("applies the same fixture budget to the initial and Sol High attempts", () => {
    const entry = run(extraction, "gemini-flash-high");
    const initial = entry.attempts[0];
    if (!initial || !entry.measurement) throw new Error("Missing initial attempt evidence.");
    const escalation = { profileId: "sol-high", startedAt: "2026-10-24T12:00:02Z", usage: { inputTokens: 1000, outputTokens: 8192 } };
    entry.attempts.push(escalation);
    entry.elapsedMs = 2000;
    entry.measurement.reportedModel = "gpt-6.1-sol";
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: true, actualCostUsd: "0.08842", filingSeasonCostUsd: "0.09292" });

    escalation.usage.outputTokens = 8193;
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, complete: false, schemaValid: false,
      criticalCorrect: false, actualCostUsd: "0.08843", filingSeasonCostUsd: "0.09293" });

    escalation.usage.outputTokens = 1000;
    initial.usage = { inputTokens: 1000, outputTokens: 8193 };
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, complete: false, schemaValid: false,
      criticalCorrect: false, actualCostUsd: "0.04347375", filingSeasonCostUsd: "0.0749475" });

    initial.usage = null;
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, complete: false, actualCostUsd: null });
    initial.usage = { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 1001 };
    expect(() => scoreProviderEvalEntry(entry, extraction)).toThrow(/cache token counts exceed total input/i);
  });
  it("qualifies a measured quality gain against both cheaper baselines", () => {
    const { summarize, reviewedEntry, baselineIds } = qualityComparison();
    const candidateGroup = () => summarize().groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");
    expect(candidateGroup()?.blockers).toEqual(["no-measured-quality-or-cost-benefit"]);

    for (const profileId of baselineIds) reviewedEntry(profileId).review.qualityAccepted = false;
    const report = summarize();
    const extractionGroups = report.groups.filter(group => group.task === "income-extraction");
    expect(extractionGroups.find(group => group.profileId === "luna-high")).toMatchObject({
      acceptedRuns: 90, completedRuns: 90, eligibleForPromotionReview: true, blockers: [],
      filingSeasonCostPerAcceptedUsd: "0.0036",
    });
    for (const profileId of baselineIds) {
      const baseline = extractionGroups.find(group => group.profileId === profileId);
      expect(baseline).toMatchObject({ acceptedRuns: 89, completedRuns: 90, schemaValidity: 1, criticalFieldExactMatch: 1,
        eligibleForPromotionReview: false, blockers: ["grounding-quality-or-abstention"] });
      expect(new Decimal(baseline?.filingSeasonCostPerAcceptedUsd ?? "Infinity").lt("0.0036")).toBe(true);
    }
    expect(report.productionPromotion).toBe(false);
  });
  it("requires grounded independent baseline reviews and candidate acceptance for the quality comparison", () => {
    const { summarize, reviewedEntry, baselineIds } = qualityComparison();
    for (const profileId of baselineIds) reviewedEntry(profileId).review.qualityAccepted = false;
    const candidateGroup = () => summarize().groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");
    const { entry: baseline, review } = reviewedEntry("baseline-gpt-5-mini");

    baseline.independentReview = { ...review, grounded: false };
    expect(candidateGroup()).toMatchObject({ eligibleForPromotionReview: false, blockers: ["baseline-comparison-incomplete"] });
    baseline.independentReview = null;
    expect(candidateGroup()).toMatchObject({ eligibleForPromotionReview: false, blockers: ["baseline-comparison-incomplete"] });

    baseline.independentReview = review;
    reviewedEntry("luna-high").review.qualityAccepted = false;
    expect(candidateGroup()).toMatchObject({ eligibleForPromotionReview: false,
      blockers: ["grounding-quality-or-abstention", "no-measured-quality-or-cost-benefit"] });
  });
  it("blocks mixed plans and missing or reused provider responses without dropping spend", () => {
    const fixtures = reviewedFixtures("2026-10-24");
    const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
    const measurements = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"]
      .flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
    const group = (entries: ProviderModelLiveEvalEntry[]) => summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures, reportAt)
      .groups.find(item => item.profileId === "luna-high" && item.task === "income-extraction");
    const control = group(measurements);
    expect(control?.eligibleForPromotionReview).toBe(true);
    const conflicted = structuredClone(measurements);
    const [first, second, third] = conflicted;
    const baseline = conflicted.find(entry => entry.profileId === "baseline-gpt-5-mini");
    if (!first?.measurement || !second?.measurement || !third?.measurement || !baseline?.measurement) throw new Error("Missing synthetic response measurement.");
    baseline.measurement.planDigest = providerEvalDigest("other test plan");
    first.measurement.responseReference = null;
    second.measurement.responseReference = third.measurement.responseReference;
    expect(group(conflicted)).toMatchObject({
      eligibleForPromotionReview: false,
      providerCostUsd: control?.providerCostUsd,
      blockers: expect.arrayContaining(["qualification-comparison-mixed-plans", "provider-response-evidence-missing-or-reused"]),
    });
  });
  it("rejects altered authors and does not count disguised self-review or future review", () => {
    const template = buildProviderModelLiveEvalTemplate();
    const withAlteredAuthor = reviewedFixtures("2026-10-24");
    const first = withAlteredAuthor[0];
    if (!first) throw new Error("Missing first reviewed fixture.");
    first.review.author = "replacement-author";
    expect(() => summarizeProviderModelLiveEvalTemplate(template, withAlteredAuthor, reportAt)).toThrow(/frozen.*author/i);

    const selfReviewed = reviewedFixtures("2026-10-24");
    for (const fixture of selfReviewed) {
      const fullWidthUppercase = fixture.review.author.toUpperCase().replace(/[!-~]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xFEE0));
      fixture.review.reviewer = ` ${fullWidthUppercase} `;
    }
    expect(summarizeProviderModelLiveEvalTemplate(template, selfReviewed, reportAt).independentlyReviewedCases).toBe(0);
    expect(summarizeProviderModelLiveEvalTemplate(template, reviewedFixtures("2099-01-01T00:00:00Z"), reportAt).independentlyReviewedCases).toBe(0);
    expect(summarizeProviderModelLiveEvalTemplate(template, reviewedFixtures("2026-09-31"), reportAt).independentlyReviewedCases).toBe(0);
    expect(summarizeProviderModelLiveEvalTemplate(template, reviewedFixtures(reportAt), reportAt).independentlyReviewedCases).toBe(240);
  });
  it("applies one inclusive reporting cutoff to dated evidence and baseline comparisons", () => {
    const eventAt = "2026-10-24T12:00:01.2345Z";
    const justBefore = "2026-10-24T07:00:01.23449-05:00";
    const atEvent = "2026-10-24T07:00:01.234500-05:00";
    const fixtures = reviewedFixtures("2026-10-24");
    const preflight = fixtures.find(fixture => fixture.id === "case-explain-missing-audit");
    const escalationProfile = providerModelCandidates.find(profile => profile.id === "sol-high");
    const initial = run(extraction);
    const escalated = run(extraction, "luna-high", 2);
    const baseline = run(extraction, "baseline-gpt-5-mini");
    const baselineAttempt = baseline.attempts[0];
    if (!preflight || !escalationProfile || !initial.measurement || !escalated.measurement || !baseline.measurement || !baselineAttempt?.usage) {
      throw new Error("Missing synthetic cutoff evidence.");
    }
    escalated.attempts.push({ profileId: escalationProfile.id, startedAt: eventAt, usage: { inputTokens: 1000, outputTokens: 1000 } });
    escalated.elapsedMs = 1500;
    escalated.measurement.reportedModel = escalationProfile.model;
    baselineAttempt.startedAt = eventAt;
    baseline.measurement.planDigest = providerEvalDigest("future synthetic baseline plan");
    baseline.measurement.responseReference = initial.measurement.responseReference;
    const template: ProviderModelLiveEvalTemplate = {
      version: 2,
      entries: [initial, escalated, baseline],
      availability: availability.map(item => item.profileId === escalationProfile.id ? { ...item, checkedAt: eventAt } : item),
      preflightEntries: [{
        profileId: "sol-high", fixtureId: preflight.id, repeat: 1, at: eventAt,
        reason: "missing-verified-context", runPurpose: "qualification", planDigest: "0".repeat(64),
        corpusDigest: syntheticCorpusDigest, fixtureDigest: providerEvalFixtureDigest(preflight),
        bindingVersion: PROVIDER_EVAL_BINDING_VERSION,
      }],
    };

    const before = summarizeProviderModelLiveEvalTemplate(template, fixtures, justBefore);
    const beforeCandidate = before.groups.find(group => group.profileId === "luna-high" && group.task === extraction.task);
    const beforePreflight = before.groups.find(group => group.profileId === "sol-high" && group.task === preflight.task);
    expect(before.entries).toBe(1);
    expect(beforeCandidate).toMatchObject({
      completedRuns: 1, acceptedRuns: 1, schemaValidity: 1,
      providerCostUsd: scoreProviderEvalEntry(initial, extraction).actualCostUsd,
    });
    expect(beforeCandidate?.blockers).not.toContain("qualification-comparison-mixed-plans");
    expect(beforeCandidate?.blockers).not.toContain("provider-response-evidence-missing-or-reused");
    expect(beforePreflight).toMatchObject({ availability: null, deterministicPreflightRuns: 0, deterministicPreflightPassed: 0 });
    expect(beforePreflight?.blockers).toContain("account-capability-unverified-or-unavailable");

    const at = summarizeProviderModelLiveEvalTemplate(template, fixtures, atEvent);
    const atCandidate = at.groups.find(group => group.profileId === "luna-high" && group.task === extraction.task);
    const atPreflight = at.groups.find(group => group.profileId === "sol-high" && group.task === preflight.task);
    expect(at.entries).toBe(3);
    expect(atCandidate).toMatchObject({ completedRuns: 2, acceptedRuns: 2, blockers: expect.arrayContaining([
      "qualification-comparison-mixed-plans", "provider-response-evidence-missing-or-reused",
    ]) });
    expect(atPreflight).toMatchObject({ availability: { status: "available" }, deterministicPreflightRuns: 1, deterministicPreflightPassed: 1 });
    expect(atPreflight?.blockers).not.toContain("account-capability-unverified-or-unavailable");
    expect(atCandidate?.blockers).not.toContain("account-capability-unverified-or-unavailable");

    baselineAttempt.usage.inputTokens = -1;
    expect(() => summarizeProviderModelLiveEvalTemplate(template, fixtures, justBefore)).toThrow(/Invalid provider model live-eval file/);
    expect(() => summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [] }, fixtures, "2026-10-32T12:00:00Z")).toThrow();
  });
  it("keeps submillisecond case reviews and capability windows in event order", () => {
    const tooEarly = "2026-10-24T12:00:01.12339Z";
    const checkedAt = "2026-10-24T12:00:01.1234Z";
    const expiresAt = "2026-10-24T12:00:01.1241Z";
    const fixtures = reviewedFixtures("2026-10-24");
    const preflightFixture = fixtures.find(fixture => fixture.id === "case-explain-missing-audit");
    const extractionFixture = fixtures.find(fixture => fixture.id === extraction.id);
    const entry = run(extraction);
    const attempt = entry.attempts[0];
    if (!preflightFixture || !extractionFixture || !attempt) throw new Error("Missing synthetic event evidence.");
    preflightFixture.review.reviewedAt = "2026-10-24T07:00:01.12340-05:00";
    extractionFixture.review.reviewedAt = preflightFixture.review.reviewedAt;
    const preflight = {
      profileId: "luna-high", fixtureId: preflightFixture.id, repeat: 1, at: tooEarly,
      reason: "missing-verified-context", runPurpose: "qualification", planDigest: "0".repeat(64),
      corpusDigest: syntheticCorpusDigest, fixtureDigest: providerEvalFixtureDigest(preflightFixture),
      bindingVersion: PROVIDER_EVAL_BINDING_VERSION,
    } as const;
    const summarize = (attemptAt: string) => {
      attempt.startedAt = attemptAt;
      const summary = summarizeProviderModelLiveEvalTemplate({
        version: 2, entries: [entry], preflightEntries: [{ ...preflight, at: attemptAt }],
        availability: availability.map(item => item.profileId === entry.profileId ? { ...item, checkedAt, expiresAt } : item),
      }, fixtures, reportAt);
      return {
        extraction: summary.groups.find(group => group.profileId === entry.profileId && group.task === extraction.task)?.blockers,
        preflight: summary.groups.find(group => group.profileId === preflight.profileId && group.task === preflightFixture.task)?.blockers,
      };
    };

    const reviewBlocker = "independent-fixture-review-incomplete";
    const capabilityBlocker = "account-capability-unverified-or-unavailable";
    const early = summarize(tooEarly);
    expect(early.extraction).toEqual(expect.arrayContaining([reviewBlocker, capabilityBlocker]));
    expect(early.preflight).toContain(reviewBlocker);
    const atCheck = summarize("2026-10-24T12:00:01.123400Z");
    expect(atCheck.extraction).not.toContain(reviewBlocker);
    expect(atCheck.extraction).not.toContain(capabilityBlocker);
    expect(atCheck.preflight).not.toContain(reviewBlocker);
    expect(summarize("2026-10-24T12:00:01.12409Z").extraction).not.toContain(capabilityBlocker);
    expect(summarize(expiresAt).extraction).toContain(capabilityBlocker);
  });
  it("enforces positive capability windows up to exactly 30 days", () => {
    const checkedAt = "2026-10-24T12:00:01.1234Z";
    const parseWithExpiry = (expiresAt: string) => parseProviderModelLiveEvalTemplate({
      version: 2, entries: [], availability: availability.slice(0, 1).map(item => ({ ...item, checkedAt, expiresAt })),
    });
    expect(() => parseWithExpiry("2026-10-24T12:00:01.123401Z")).not.toThrow();
    expect(() => parseWithExpiry("2026-10-24T12:00:01.12340Z")).toThrow(/30 days/);
    expect(() => parseWithExpiry("2026-11-23T12:00:01.12340Z")).not.toThrow();
    expect(() => parseWithExpiry("2026-11-23T12:00:01.123401Z")).toThrow(/30 days/);
  });
  it("rejects output reviews by a spelling variant of the frozen author", () => {
    const entry = run(extraction);
    if (!entry.independentReview) throw new Error("Missing test-only response review.");
    entry.independentReview.reviewer = ` ${extraction.review.author.toUpperCase()} `;
    expect(scoreProviderEvalEntry(entry, extraction)).toMatchObject({ accepted: false, complete: false });
  });
  it("does not qualify measurements predating their case reviews", () => {
    const fixtures = reviewedFixtures("2026-10-24T13:00:00Z");
    const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
    const entries = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"].flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
    const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures, reportAt);
    expect(summary.independentlyReviewedCases).toBe(240);
    const group = summary.groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");
    expect(group).toMatchObject({ eligibleForPromotionReview: false, blockers: expect.arrayContaining(["independent-fixture-review-incomplete"]) });
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
  it("blocks a full held-out cohort with understated escalation latency while retaining exact costs", () => {
    const fixtures = reviewedFixtures("2026-10-24");
    const cases = fixtures.filter(fixture => fixture.task === "income-extraction");
    expect(cases.filter(fixture => fixture.split === "held-out")).toHaveLength(10);
    const profiles = ["luna-high", "baseline-gpt-5-mini", "baseline-gemini-3-flash-preview"];
    const entries = profiles.flatMap(profile => cases.flatMap(fixture => [1, 2, 3].map(repeat => run(fixture, profile, repeat))));
    const candidateEntries = entries.filter(entry => entry.profileId === "luna-high");
    for (const entry of candidateEntries) {
      if (!entry.measurement) throw new Error("Missing synthetic measurement");
      entry.attempts.push({ profileId: "sol-high", startedAt: "2026-10-24T12:01:00Z", usage: { inputTokens: 10, outputTokens: 10 } });
      entry.measurement.reportedModel = "gpt-6.1-sol";
    }
    const candidate = () => summarizeProviderModelLiveEvalTemplate({ version: 2, entries, availability }, fixtures, reportAt)
      .groups.find(group => group.profileId === "luna-high" && group.task === "income-extraction");

    expect(candidate()).toMatchObject({ eligibleForPromotionReview: false, completedRuns: 0, acceptedRuns: 0,
      p50LatencyMs: null, p95LatencyMs: null, providerCostUsd: "0.0648", filingSeasonCostUsd: "0.0648",
      blockers: expect.arrayContaining(["attempt-timing-inconsistent"]) });

    for (const entry of candidateEntries) entry.elapsedMs = 60001;
    expect(candidate()).toMatchObject({ eligibleForPromotionReview: false, completedRuns: 90, acceptedRuns: 90,
      p50LatencyMs: 60001, p95LatencyMs: 60001, providerCostUsd: "0.0648", filingSeasonCostUsd: "0.0648",
      blockers: ["latency-budget"] });
  });
  it("checks escalation chronology at submillisecond precision", () => {
    const entry = run(extraction);
    const [initial] = entry.attempts;
    if (!initial || !entry.measurement) throw new Error("Missing synthetic attempt evidence");
    initial.startedAt = "2026-10-24T12:00:00.999999Z";
    const escalation = { ...initial, profileId: "sol-high", startedAt: "2026-10-24T12:00:01.000001Z" };
    entry.attempts.push(escalation);
    entry.measurement.reportedModel = "gpt-6.1-sol";
    const evaluate = () => scoreProviderEvalEntry(entry, extraction);

    entry.elapsedMs = 0.002;
    expect(evaluate()).toMatchObject({ accepted: true, attemptTimingConsistent: true, actualCostUsd: "0.0126" });
    entry.elapsedMs = 0.0019999;
    expect(evaluate()).toMatchObject({ accepted: false, attemptTimingConsistent: false, actualCostUsd: "0.0126" });
    escalation.startedAt = "2026-10-24T12:00:00.999998Z";
    entry.elapsedMs = 1000;
    expect(evaluate()).toMatchObject({ accepted: false, attemptTimingConsistent: false, actualCostUsd: "0.0126" });
    escalation.startedAt = initial.startedAt;
    expect(evaluate()).toMatchObject({ accepted: true, attemptTimingConsistent: true, actualCostUsd: "0.0126" });
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

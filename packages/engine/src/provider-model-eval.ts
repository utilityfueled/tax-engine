import Decimal from "decimal.js";
import { z } from "zod";
import { AI_PROFILES, AI_TASKS, type AiTask } from "./ai-task-registry";
import { AI_PRICES, calculateAiCost } from "./ai-pricing";
import { taxProviderModelEvalFixtures, type ProviderEvalFixture } from "./provider-eval-fixtures";
export { taxProviderModelEvalFixtures } from "./provider-eval-fixtures";

/** Configuration is not a quality score or evidence of provider availability. */
export const providerModelCandidates = [
  ...Object.values(AI_PROFILES).map(profile => ({ ...profile, role: "candidate" as const })),
  { id: "baseline-gpt-5-mini", provider: "openai", model: "gpt-5-mini", effort: "minimal", role: "baseline" },
  { id: "baseline-gemini-3-flash-preview", provider: "google", model: "gemini-3-flash-preview", effort: "high", role: "baseline" },
] as const;
export const providerModelPricingSnapshot = { retrievedAt: "2026-10-24", filingSeasonDate: "2027-01-01", prices: AI_PRICES };

export const evaluationGates = Object.freeze({
  schemaValidity: 0.995, criticalFieldExactMatch: 0.995, repeats: 3, minimumReviewedCases: 200,
  meaningfulCostReduction: 0.10, minimumQualityGain: 0.01,
  p95RoutineLatencyMs: 30000, p95EscalationLatencyMs: 120000,
  maximumRoutineCostPerAcceptedUsd: "0.50", maximumEscalationCostPerAcceptedUsd: "1.00",
});

const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cachedInputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  cacheWrite30mTokens: z.number().int().nonnegative().optional(),
  cacheWrite12hTokens: z.number().int().nonnegative().optional(),
  cachedTokenHours: z.string().optional(), regionalProcessing: z.boolean().optional(),
});
const normalizedOutputSchema = z.strictObject({
  disposition: z.enum(["answer", "abstain"]),
  fields: z.record(z.string(), z.string()), category: z.string().nullable(),
  sourceIds: z.array(z.string()), engineValues: z.record(z.string(), z.string()),
  filingReady: z.boolean(),
});
const entrySchema = z.strictObject({
  profileId: z.string(), fixtureId: z.string(), fixtureVersion: z.literal(1), repeat: z.number().int().min(1).max(3),
  /** Nulls are unrun, unreviewed, or unknown: never a passing measurement. */
  elapsedMs: z.number().finite().nonnegative().nullable(),
  applicationSchemaValid: z.boolean().nullable(),
  output: normalizedOutputSchema.nullable(),
  independentReview: z.strictObject({ method: z.literal("human"), reviewer: z.string().trim().min(1), grounded: z.boolean(), qualityAccepted: z.boolean(), piiLeak: z.boolean() }).nullable(),
  attempts: z.array(z.strictObject({
    profileId: z.string(), startedAt: z.iso.datetime(), usage: usageSchema.nullable(),
  })).max(2),
});
const templateSchema = z.strictObject({ version: z.literal(2), entries: z.array(entrySchema) });
export type ProviderModelLiveEvalEntry = z.infer<typeof entrySchema>;
export type ProviderModelLiveEvalTemplate = z.infer<typeof templateSchema>;

function candidate(id: string) {
  const result = providerModelCandidates.find(profile => profile.id === id);
  if (!result) throw new Error(`Unknown evaluation profile: ${id}`);
  return result;
}
function independentlyReviewed(fixture: ProviderEvalFixture) {
  return fixture.review.status === "reviewed" && !!fixture.review.reviewer?.trim()
    && fixture.review.reviewer !== fixture.review.author && !!fixture.review.reviewedAt
    && Number.isFinite(Date.parse(fixture.review.reviewedAt));
}
function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}
function exactField(expected: { kind: "money" | "date" | "text"; value: string }, actual: string | undefined) {
  if (actual === undefined) return false;
  if (expected.kind !== "money") return expected.value === actual;
  if (!/^-?\d+(?:\.\d+)?$/.test(actual)) return false;
  return new Decimal(expected.value).eq(actual);
}

export function scoreProviderEvalEntry(entry: ProviderModelLiveEvalEntry, fixture: ProviderEvalFixture) {
  const fields = Object.entries(fixture.expected.fields);
  const exact = fields.filter(([key, expected]) => exactField(expected, entry.output?.fields[key])).length;
  const answered = entry.output?.disposition === "answer";
  const answerable = fixture.expected.disposition === "answer";
  const engineOverride = Object.entries(entry.output?.engineValues ?? {}).some(([key, value]) =>
    fixture.expected.engineValues[key] === undefined || !exactField({ kind: "money", value: fixture.expected.engineValues[key] }, value));
  const engineValuesComplete = Object.entries(fixture.expected.engineValues).every(([key, value]) =>
    exactField({ kind: "money", value }, entry.output?.engineValues[key]));
  const inventedField = Object.keys(entry.output?.fields ?? {}).some(key => !(key in fixture.expected.fields));
  const grounding = !!entry.output && entry.output.sourceIds.length > 0
    && entry.output.sourceIds.every(id => fixture.sourceIds.includes(id)) && entry.independentReview?.grounded === true;
  const safetyFailure = entry.output?.filingReady === true || engineOverride || entry.independentReview?.piiLeak === true;
  const complete = entry.elapsedMs !== null && entry.applicationSchemaValid !== null && entry.independentReview !== null
    && entry.independentReview.reviewer !== fixture.review.author
    && entry.attempts.length > 0 && entry.attempts.every(attempt => attempt.usage !== null);
  const accepted = complete && entry.applicationSchemaValid === true && !!entry.output && !safetyFailure
    && !inventedField && engineValuesComplete && grounding && entry.independentReview?.qualityAccepted === true
    && entry.output.disposition === fixture.expected.disposition && exact === fields.length
    && entry.output.category === fixture.expected.category;
  let actualCost = new Decimal(0);
  let filingSeasonCost = new Decimal(0);
  let knownCost = entry.attempts.length > 0;
  for (const attempt of entry.attempts) {
    if (!attempt.usage) { knownCost = false; continue; }
    const profile = candidate(attempt.profileId);
    actualCost = actualCost.plus(calculateAiCost(profile.model, attempt.startedAt, attempt.usage).providerCostUsd);
    filingSeasonCost = filingSeasonCost.plus(calculateAiCost(profile.model, "2027-01-01", attempt.usage).providerCostUsd);
  }
  return { complete, accepted, safetyFailure, grounding, answerable, answered,
    // Abstention is reported separately, but cannot improve exact-field accuracy.
    requiredFields: fields.length, exactFields: exact,
    criticalCorrect: fields.length === exact && !inventedField,
    actualCostUsd: knownCost ? actualCost.toFixed() : null,
    filingSeasonCostUsd: knownCost ? filingSeasonCost.toFixed() : null };
}

export function parseProviderModelLiveEvalTemplate(value: unknown): ProviderModelLiveEvalTemplate {
  const parsed = templateSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid provider model live-eval file: ${parsed.error.message}`);
  const seen = new Set<string>();
  for (const entry of parsed.data.entries) {
    candidate(entry.profileId);
    const fixture = taxProviderModelEvalFixtures.find(item => item.id === entry.fixtureId);
    if (!fixture) throw new Error(`Invalid provider model live-eval file: unknown fixture ${entry.fixtureId}`);
    const key = `${entry.profileId}:${entry.fixtureId}:${entry.repeat}`;
    if (seen.has(key)) throw new Error(`Invalid provider model live-eval file: duplicate run ${key}`);
    seen.add(key);
    entry.attempts.forEach((attempt, index) => {
      candidate(attempt.profileId);
      if (index === 0 && attempt.profileId !== entry.profileId) throw new Error("Initial attempt profile must match the evaluated profile.");
      if (index > 0 && attempt.profileId !== "sol-high") throw new Error("Only one explicit Sol High escalation is permitted.");
    });
  }
  return parsed.data;
}

export function buildProviderModelEvalFixturePack() {
  return { version: 2, qualification: "draft-unreviewed", fixtureCount: taxProviderModelEvalFixtures.length,
    scenarioFamilies: 10, taskTypes: Object.keys(AI_TASKS), fixtures: taxProviderModelEvalFixtures };
}
export function buildProviderModelBenchmark() {
  return { version: 2, candidates: providerModelCandidates, gates: evaluationGates,
    pricingSnapshot: providerModelPricingSnapshot, recommendation: null,
    limitation: "No measured recommendation. Draft template variants do not establish independent scenario coverage or qualification." };
}
export const buildProviderModelBenchmarkSnapshot = buildProviderModelBenchmark;
export function recommendProviderModelStack() { return null; }

export function buildProviderModelLiveEvalTemplate(): ProviderModelLiveEvalTemplate {
  // Unrun entries are materialized only when a caller executes a case. This avoids
  // thousands of null records masquerading as evaluation evidence.
  return { version: 2, entries: [] };
}

export function summarizeProviderModelLiveEvalTemplate(template: ProviderModelLiveEvalTemplate,
  fixtures: ProviderEvalFixture[] = taxProviderModelEvalFixtures) {
  const validated = parseProviderModelLiveEvalTemplate(template);
  const reviewedCount = fixtures.filter(independentlyReviewed).length;
  const groups = providerModelCandidates.flatMap(profile => (Object.keys(AI_TASKS) as AiTask[]).map(task => {
    const cases = fixtures.filter(fixture => fixture.task === task);
    const entries = validated.entries.filter(entry => entry.profileId === profile.id && cases.some(fixture => fixture.id === entry.fixtureId));
    const scored = entries.map(entry => ({ entry, result: scoreProviderEvalEntry(entry, cases.find(fixture => fixture.id === entry.fixtureId)!) }));
    const complete = scored.filter(item => item.result.complete);
    const fields = scored.reduce((sum, item) => sum + item.result.requiredFields, 0);
    const exact = scored.reduce((sum, item) => sum + item.result.exactFields, 0);
    const accepted = scored.filter(item => item.result.accepted).length;
    const latencies = entries.flatMap(entry => entry.elapsedMs === null ? [] : [entry.elapsedMs]);
    const measuredCost = scored.reduce((sum, item) => sum.plus(item.result.actualCostUsd ?? "0"), new Decimal(0));
    const filingCost = scored.reduce((sum, item) => sum.plus(item.result.filingSeasonCostUsd ?? "0"), new Decimal(0));
    const costKnown = scored.length > 0 && scored.every(item => item.result.actualCostUsd !== null);
    const expectedRuns = cases.length * evaluationGates.repeats;
    const schemaRate = entries.length ? entries.filter(entry => entry.applicationSchemaValid === true).length / entries.length : null;
    const exactRate = fields ? exact / fields : null;
    const p95 = percentile(latencies, 0.95);
    const costPerAccepted = costKnown && accepted ? filingCost.div(accepted).toFixed() : null;
    const blockers: string[] = [];
    if (reviewedCount < evaluationGates.minimumReviewedCases || cases.some(fixture => !independentlyReviewed(fixture))) blockers.push("independent-fixture-review-incomplete");
    if (complete.length !== expectedRuns || !cases.some(fixture => fixture.split === "held-out")) blockers.push("held-out-repeat-coverage-incomplete");
    if (schemaRate === null || schemaRate < evaluationGates.schemaValidity) blockers.push("schema-validity");
    if (fields && exactRate! < evaluationGates.criticalFieldExactMatch) blockers.push("critical-field-exact-match");
    if (scored.some(item => item.result.safetyFailure)) blockers.push("observed-safety-failure");
    if (accepted !== expectedRuns) blockers.push("grounding-quality-or-abstention");
    if (p95 === null || p95 > (task === "complex-reconciliation" ? evaluationGates.p95EscalationLatencyMs : evaluationGates.p95RoutineLatencyMs)) blockers.push("latency-budget");
    if (costPerAccepted === null || new Decimal(costPerAccepted).gt(task === "complex-reconciliation" ? evaluationGates.maximumEscalationCostPerAcceptedUsd : evaluationGates.maximumRoutineCostPerAcceptedUsd)) blockers.push("spend-budget-or-unknown-usage");
    return { profileId: profile.id, model: profile.model, effort: profile.effort, task, expectedRuns, completedRuns: complete.length,
      schemaValidity: schemaRate, criticalFieldExactMatch: exactRate, acceptedRuns: accepted,
      answerableAbstentions: scored.filter(item => item.result.answerable && !item.result.answered).length,
      unanswerableAbstentions: scored.filter(item => !item.result.answerable && !item.result.answered).length,
      p50LatencyMs: percentile(latencies, 0.5), p95LatencyMs: p95,
      providerCostUsd: costKnown ? measuredCost.toFixed() : null, filingSeasonCostUsd: costKnown ? filingCost.toFixed() : null,
      filingSeasonCostPerAcceptedUsd: costPerAccepted, blockers, eligibleForPromotionReview: false };
  }));
  for (const group of groups.filter(item => candidate(item.profileId).role === "candidate")) {
    const baselines = groups.filter(item => item.task === group.task && candidate(item.profileId).role === "baseline");
    if (baselines.some(item => item.completedRuns !== item.expectedRuns || item.blockers.length)) group.blockers.push("baseline-comparison-incomplete");
    const candidateEntries = validated.entries.filter(entry => entry.profileId === group.profileId && fixtures.find(fixture => fixture.id === entry.fixtureId)?.task === group.task);
    for (const entry of candidateEntries) {
      const fixture = fixtures.find(item => item.id === entry.fixtureId)!;
      const score = scoreProviderEvalEntry(entry, fixture);
      if (!score.criticalCorrect && validated.entries.some(other => candidate(other.profileId).role === "baseline"
        && other.fixtureId === entry.fixtureId && other.repeat === entry.repeat && scoreProviderEvalEntry(other, fixture).criticalCorrect)) {
        group.blockers.push("critical-field-regression"); break;
      }
    }
    const meaningfulBenefit = baselines.length === 2 && baselines.every(baseline => {
      if (!baseline.filingSeasonCostPerAcceptedUsd || !group.filingSeasonCostPerAcceptedUsd) return false;
      const cheaper = new Decimal(group.filingSeasonCostPerAcceptedUsd).lte(new Decimal(baseline.filingSeasonCostPerAcceptedUsd).times("0.90"));
      const qualityGain = group.acceptedRuns / group.expectedRuns - baseline.acceptedRuns / baseline.expectedRuns;
      return cheaper || qualityGain >= evaluationGates.minimumQualityGain;
    });
    if (!meaningfulBenefit) group.blockers.push("no-measured-quality-or-cost-benefit");
    group.eligibleForPromotionReview = group.blockers.length === 0;
  }
  return { version: 2, fixtureCount: fixtures.length, independentlyReviewedCases: reviewedCount,
    entries: validated.entries.length, groups, productionPromotion: false,
    limitation: "Eligibility supports a human promotion review only. Zero observed failures is not proof. No route is activated by this report." };
}

export function renderProviderModelBenchmarkMarkdown() {
  return `# Task-based AI evaluation\n\nAll selected profiles remain candidates. There is no quality score or model recommendation without measured runs.\n\nThe draft corpus contains ${taxProviderModelEvalFixtures.length} cases across eight tasks, ten scenario families and three variants per family. It includes a fixed held-out variant, missing/conflicting fields, cents, large amounts, duplicate lines, refunds, transfers, ambiguous business use, unsupported years and untrusted document instructions. It contains redacted text only. These generated variants are **not independently reviewed cases or evidence of extraction quality**. Broader independently authored scenarios and PII/redaction end-to-end review remain required.\n\nBefore any run, reviewers must validate expected values independently, preserve the held-out split, and record reviewer/date per case. Run each profile/case three times. Retain failed and abstaining attempts and their billed tokens, including retries/escalation. Compare Luna High, Sol Low, Sol High and explicitly enabled Gemini High with GPT-5 Mini and Gemini 3 Flash Preview. Actual account availability is unverified.\n\nUse the application's versioned task schema for each response and record its validation result. Normalize only for deterministic field/category/citation comparisons; a normalized result alone is not an application-schema pass. A separate human must assess prose grounding, substantive quality and PII. Do not use an LLM as the monetary judge. Unknown usage prevents promotion. All attempts are priced exactly with Decimal, separately at actual-run and January 2027 rates. Cost per accepted task includes failed attempts.\n\nGates: >=99.5% schema validity and required-field exact match, no critical-field regression, no observed PII leak, filing-ready claim or engine-value override; reviewed held-out repeated coverage; P95 <=30 seconds routinely /120 seconds for cancellable reconciliation; January cost per accepted task <=$0.50 routinely /$1.00 reconciliation; >=10% lower accepted-task cost or >=1 percentage point quality gain against both baselines. These are predeclared initial evaluation budgets, not measured results.\n\nCommands: \`pnpm eval:models:sync\` writes draft artifacts; \`pnpm eval:models:check\` checks freshness; \`pnpm eval:models:live-summary -- --live-run-file=path.json\` evaluates supplied records. The script makes no provider calls and spends no credits. Production activation, 5%/25%/100% rollout, rollback, representative corpus review and live measurements remain separate gates.\n`;
}

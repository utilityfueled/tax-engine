import Decimal from "decimal.js";
import { z } from "zod";
import { AI_PROFILES, AI_TASKS, type AiTask } from "./ai-task-registry";
import { PROVIDER_EVAL_BINDING_VERSION, prepareProviderEvalCase, validateProviderEvalOutput } from "./provider-eval-application";
import { AI_PRICES, calculateAiCost } from "./ai-pricing";
import { taxProviderModelEvalFixtures, type ProviderEvalFixture } from "./provider-eval-fixtures";
import { hasCurrentProviderEvalProvenance, matchesProviderEvalModel, providerEvalCorpusDigest } from "./provider-eval-provenance";
export { taxProviderModelEvalFixtures } from "./provider-eval-fixtures";
const Money = Decimal.clone({ precision: 80 });

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
  p50RoutineLatencyMs: 10000, p50EscalationLatencyMs: 60000,
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
  measurement: z.strictObject({ runPurpose: z.enum(["smoke", "qualification"]), planDigest: z.string(), corpusDigest: z.string(), fixtureDigest: z.string().optional(), bindingVersion: z.string(), promptVersion: z.string(), schemaVersion: z.string(),
    normalizationStatus: z.enum(["bound", "unsupported", "failed"]), applicationOutput: z.json().nullable(),
    privacyFailure: z.boolean(), responseReference: z.string().nullable(), reportedModel: z.string().nullable() }).optional(),
  attempts: z.array(z.strictObject({
    profileId: z.string(), startedAt: z.iso.datetime(), usage: usageSchema.nullable(),
  })).max(2),
});
const availabilitySchema = z.strictObject({
  profileId: z.string(), status: z.enum(["available", "unavailable", "failed"]),
  checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), evidenceReference: z.string().trim().min(1).max(500),
  structuredOutput: z.boolean(), reasoningEffort: z.boolean(), reportedUsage: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});
const preflightSchema = z.strictObject({ profileId: z.string(), fixtureId: z.string(), repeat: z.number().int().min(1).max(3),
  reason: z.enum(["missing-verified-context", "invalid-verified-context", "cancelled"]), at: z.iso.datetime(),
  runPurpose: z.enum(["smoke", "qualification"]), planDigest: z.string().min(1), corpusDigest: z.string().min(1), fixtureDigest: z.string().optional(), bindingVersion: z.string() });
const templateSchema = z.strictObject({ version: z.literal(2), entries: z.array(entrySchema), availability: z.array(availabilitySchema).optional(), preflightEntries: z.array(preflightSchema).optional() });
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
  return scoreForCorpus(entry, fixture, providerEvalCorpusDigest());
}
function scoreForCorpus(entry: ProviderModelLiveEvalEntry, fixture: ProviderEvalFixture, currentCorpusDigest: string) {
  const provenanceMatches = hasCurrentProviderEvalProvenance(entry.measurement, fixture, currentCorpusDigest)
    && entry.fixtureId === fixture.id && entry.fixtureVersion === fixture.version;
  const validated = validateProviderEvalOutput(fixture, entry.measurement?.applicationOutput);
  const output = validated.output;
  const policy = AI_TASKS[fixture.task];
  const finalAttempt = entry.attempts.at(-1);
  const attemptChainMatches = entry.attempts.length >= 1 && entry.attempts.length <= 2
    && entry.attempts[0].profileId === entry.profileId
    && (entry.attempts.length === 1 || (finalAttempt?.profileId === "sol-high" && policy.maxEscalations === 1));
  const modelMatches = attemptChainMatches && !!finalAttempt
    && matchesProviderEvalModel(candidate(finalAttempt.profileId).model, entry.measurement?.reportedModel);
  const versionMatches = entry.measurement?.bindingVersion === PROVIDER_EVAL_BINDING_VERSION
    && entry.measurement.promptVersion === policy.promptVersion && entry.measurement.schemaVersion === policy.schemaVersion;
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const observationsConsistent = canonical(output) === canonical(entry.output)
    && validated.applicationSchemaValid === entry.applicationSchemaValid
    && validated.normalizationStatus === entry.measurement?.normalizationStatus;
  const schemaValid = validated.applicationSchemaValid && versionMatches && provenanceMatches && modelMatches;
  const fields = Object.entries(fixture.expected.fields);
  const exact = provenanceMatches && modelMatches ? fields.filter(([key, expected]) => exactField(expected, output?.fields[key])).length : 0;
  const answered = output?.disposition === "answer";
  const answerable = fixture.expected.disposition === "answer";
  const engineOverride = Object.entries(output?.engineValues ?? {}).some(([key, value]) =>
    fixture.expected.engineValues[key] === undefined || !exactField({ kind: "money", value: fixture.expected.engineValues[key] }, value));
  const engineValuesComplete = Object.entries(fixture.expected.engineValues).every(([key, value]) =>
    exactField({ kind: "money", value }, output?.engineValues[key]));
  const inventedField = Object.keys(output?.fields ?? {}).some(key => !(key in fixture.expected.fields));
  const grounding = provenanceMatches && modelMatches && validated.normalizationStatus === "bound" && entry.independentReview?.grounded === true;
  const safetyFailure = validated.privacyFailure || output?.filingReady === true || engineOverride || entry.independentReview?.piiLeak === true || entry.measurement?.privacyFailure === true;
  const complete = provenanceMatches && modelMatches && versionMatches && observationsConsistent && entry.measurement?.runPurpose === "qualification" && entry.measurement.normalizationStatus === "bound" && entry.elapsedMs !== null && entry.applicationSchemaValid !== null && entry.independentReview !== null
    && entry.independentReview.reviewer !== fixture.review.author
    && entry.attempts.length > 0 && entry.attempts.every(attempt => attempt.usage !== null);
  const accepted = complete && schemaValid && !!output && !safetyFailure
    && !inventedField && engineValuesComplete && grounding && entry.independentReview?.qualityAccepted === true
    && output.disposition === fixture.expected.disposition && exact === fields.length
    && output.category === fixture.expected.category;
  let actualCost = new Money(0);
  let filingSeasonCost = new Money(0);
  let knownCost = entry.attempts.length > 0;
  for (const attempt of entry.attempts) {
    if (!attempt.usage) { knownCost = false; continue; }
    const profile = candidate(attempt.profileId);
    actualCost = actualCost.plus(calculateAiCost(profile.model, attempt.startedAt, attempt.usage).providerCostUsd);
    filingSeasonCost = filingSeasonCost.plus(calculateAiCost(profile.model, "2027-01-01", attempt.usage).providerCostUsd);
  }
  return { complete, accepted, schemaValid, observationsConsistent, provenanceMatches, modelMatches, safetyFailure, grounding, answerable, answered,
    // Abstention is reported separately, but cannot improve exact-field accuracy.
    requiredFields: fields.length, exactFields: exact,
    criticalCorrect: provenanceMatches && modelMatches && validated.normalizationStatus === "bound" && fields.length === exact && !inventedField,
    actualCostUsd: knownCost ? actualCost.toFixed() : null,
    filingSeasonCostUsd: knownCost ? filingSeasonCost.toFixed() : null };
}

export function parseProviderModelLiveEvalTemplate(value: unknown): ProviderModelLiveEvalTemplate {
  const parsed = templateSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid provider model live-eval file: ${parsed.error.message}`);
  const seen = new Set<string>();
  const availableProfiles = new Set<string>();
  for (const evidence of parsed.data.availability ?? []) {
    candidate(evidence.profileId);
    if (availableProfiles.has(evidence.profileId)) throw new Error("Duplicate provider availability evidence.");
    availableProfiles.add(evidence.profileId);
    if (Date.parse(evidence.expiresAt) <= Date.parse(evidence.checkedAt)
      || Date.parse(evidence.expiresAt) - Date.parse(evidence.checkedAt) > 30 * 24 * 60 * 60 * 1000) {
      throw new Error("Provider availability evidence must expire within 30 days.");
    }
  }
  for (const entry of parsed.data.preflightEntries ?? []) {
    candidate(entry.profileId);
    const fixture = taxProviderModelEvalFixtures.find(item => item.id === entry.fixtureId);
    const prepared = fixture ? prepareProviderEvalCase(fixture) : null;
    const key = `${entry.profileId}:${entry.fixtureId}:${entry.repeat}`;
    if (!fixture || prepared?.kind !== "preflight" || prepared.reason !== entry.reason || seen.has(key)) throw new Error("Invalid or duplicate deterministic preflight evidence.");
    seen.add(key);
  }
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
  return { version: 4, corpusId: "tax-assistance-2026-r4", qualification: "draft-unreviewed", fixtureCount: taxProviderModelEvalFixtures.length,
    templateScenarioFamilies: 0, templateVariantCount: 0, standaloneScenarioCount: taxProviderModelEvalFixtures.length,
    taskTypes: Object.keys(AI_TASKS), fixtures: taxProviderModelEvalFixtures };
}
export function buildProviderModelBenchmark() {
  return { version: 2, candidates: providerModelCandidates, gates: evaluationGates,
    pricingSnapshot: providerModelPricingSnapshot, recommendation: null,
    limitation: "No measured recommendation. Individually authored synthetic drafts do not establish human review, real-world prevalence or model qualification." };
}
export const buildProviderModelBenchmarkSnapshot = buildProviderModelBenchmark;
export function recommendProviderModelStack() { return null; }

export function buildProviderModelLiveEvalTemplate(): ProviderModelLiveEvalTemplate {
  // Unrun entries are materialized only when a caller executes a case. This avoids
  // thousands of null records masquerading as evaluation evidence.
  return { version: 2, entries: [], availability: [] };
}

export function summarizeProviderModelLiveEvalTemplate(template: ProviderModelLiveEvalTemplate,
  fixtures: ProviderEvalFixture[] = taxProviderModelEvalFixtures) {
  const validated = parseProviderModelLiveEvalTemplate(template);
  const fixtureIds = new Set<string>();
  for (const fixture of fixtures) {
    const canonical = taxProviderModelEvalFixtures.find(item => item.id === fixture.id);
    const { review: _review, ...content } = fixture;
    const { review: _canonicalReview, ...canonicalContent } = canonical ?? {};
    if (!canonical || fixtureIds.has(fixture.id) || JSON.stringify(content) !== JSON.stringify(canonicalContent)) {
      throw new Error("Reviewed fixtures must preserve the frozen case content and unique IDs.");
    }
    fixtureIds.add(fixture.id);
  }
  if (fixtures.length !== taxProviderModelEvalFixtures.length) throw new Error("The full frozen corpus is required for evaluation.");
  const reviewedCount = fixtures.filter(independentlyReviewed).length;
  const currentCorpusDigest = providerEvalCorpusDigest();
  const groups = providerModelCandidates.flatMap(profile => (Object.keys(AI_TASKS) as AiTask[]).map(task => {
    const cases = fixtures.filter(fixture => fixture.task === task);
    const entries = validated.entries.filter(entry => entry.profileId === profile.id && cases.some(fixture => fixture.id === entry.fixtureId));
    const availability = validated.availability?.find(entry => entry.profileId === profile.id);
    const scored = entries.map(entry => {
      const fixture = cases.find(item => item.id === entry.fixtureId);
      if (!fixture) throw new Error("Evaluation case is missing.");
      return { entry, result: scoreForCorpus(entry, fixture, currentCorpusDigest) };
    });
    const complete = scored.filter(item => item.result.complete);
    const fields = scored.reduce((sum, item) => sum + item.result.requiredFields, 0);
    const exact = scored.reduce((sum, item) => sum + item.result.exactFields, 0);
    const accepted = scored.filter(item => item.result.accepted).length;
    const latencies = entries.flatMap(entry => entry.elapsedMs === null ? [] : [entry.elapsedMs]);
    const measuredCost = scored.reduce((sum, item) => sum.plus(item.result.actualCostUsd ?? "0"), new Money(0));
    const filingCost = scored.reduce((sum, item) => sum.plus(item.result.filingSeasonCostUsd ?? "0"), new Money(0));
    const costKnown = scored.length > 0 && scored.every(item => item.result.actualCostUsd !== null);
    const preflightCases = cases.filter(fixture => prepareProviderEvalCase(fixture).kind === "preflight");
    const preflightEntries = (validated.preflightEntries ?? []).filter(entry => entry.profileId === profile.id && preflightCases.some(fixture => fixture.id === entry.fixtureId));
    const preflightPassed = preflightEntries.filter(entry => { const fixture = preflightCases.find(item => item.id === entry.fixtureId);
      return entry.runPurpose === "qualification" && entry.bindingVersion === PROVIDER_EVAL_BINDING_VERSION && fixture?.expected.disposition === "abstain" && hasCurrentProviderEvalProvenance(entry, fixture, currentCorpusDigest) && Object.keys(fixture.expected.fields).length === 0
        && Object.keys(fixture.expected.engineValues).length === 0 && fixture.expected.category === null; }).length;
    const expectedPreflightRuns = preflightCases.length * evaluationGates.repeats;
    const expectedRuns = (cases.length - preflightCases.length) * evaluationGates.repeats;
    const schemaRate = entries.length ? scored.filter(item => item.result.schemaValid).length / entries.length : null;
    const exactRate = fields ? exact / fields : null;
    const p95 = percentile(latencies, 0.95);
    const p50 = percentile(latencies, 0.5);
    const costPerAccepted = costKnown && accepted ? filingCost.div(accepted).toFixed() : null;
    const blockers: string[] = [];
    if (!availability || availability.status !== "available" || !availability.structuredOutput || !availability.reasoningEffort || !availability.reportedUsage
      || entries.some(entry => entry.attempts.some(attempt => {
        const evidence = validated.availability?.find(item => item.profileId === attempt.profileId);
        return !evidence || evidence.status !== "available" || !evidence.structuredOutput || !evidence.reasoningEffort || !evidence.reportedUsage
          || Date.parse(attempt.startedAt) < Date.parse(evidence.checkedAt) || Date.parse(attempt.startedAt) >= Date.parse(evidence.expiresAt);
      }))) blockers.push("account-capability-unverified-or-unavailable");
    if (entries.some(entry => entry.measurement?.normalizationStatus !== "bound")) blockers.push("application-normalization-unverified");
    if (scored.some(item => item.entry.measurement?.runPurpose !== "qualification" || !item.result.provenanceMatches)
      || preflightEntries.some(entry => { const fixture = preflightCases.find(item => item.id === entry.fixtureId); return !fixture || !hasCurrentProviderEvalProvenance(entry, fixture, currentCorpusDigest); })) blockers.push("qualification-run-provenance-missing");
    if (reviewedCount < evaluationGates.minimumReviewedCases || cases.some(fixture => !independentlyReviewed(fixture))) blockers.push("independent-fixture-review-incomplete");
    if (preflightPassed !== expectedPreflightRuns) blockers.push("deterministic-preflight-coverage-incomplete");
    if (complete.length !== expectedRuns || !cases.some(fixture => fixture.split === "held-out")) blockers.push("held-out-repeat-coverage-incomplete");
    if (schemaRate === null || schemaRate < evaluationGates.schemaValidity) blockers.push("schema-validity");
    if (fields && (exactRate === null || exactRate < evaluationGates.criticalFieldExactMatch)) blockers.push("critical-field-exact-match");
    if (scored.some(item => item.result.safetyFailure)) blockers.push("observed-safety-failure");
    if (accepted !== expectedRuns) blockers.push("grounding-quality-or-abstention");
    if (p50 === null || p50 > (task === "complex-reconciliation" ? evaluationGates.p50EscalationLatencyMs : evaluationGates.p50RoutineLatencyMs)
      || p95 === null || p95 > (task === "complex-reconciliation" ? evaluationGates.p95EscalationLatencyMs : evaluationGates.p95RoutineLatencyMs)) blockers.push("latency-budget");
    if (costPerAccepted === null || new Money(costPerAccepted).gt(task === "complex-reconciliation" ? evaluationGates.maximumEscalationCostPerAcceptedUsd : evaluationGates.maximumRoutineCostPerAcceptedUsd)) blockers.push("spend-budget-or-unknown-usage");
    return { profileId: profile.id, model: profile.model, effort: profile.effort, task, expectedRuns, completedRuns: complete.length, expectedPreflightRuns, deterministicPreflightRuns: preflightEntries.length, deterministicPreflightPassed: preflightPassed,
      schemaValidity: schemaRate, criticalFieldExactMatch: exactRate, acceptedRuns: accepted,
      answerableAbstentions: scored.filter(item => item.result.answerable && !item.result.answered).length,
      unanswerableAbstentions: scored.filter(item => !item.result.answerable && !item.result.answered).length,
      p50LatencyMs: p50, p95LatencyMs: p95, availability: availability ?? null,
      providerCostUsd: costKnown ? measuredCost.toFixed() : null, filingSeasonCostUsd: costKnown ? filingCost.toFixed() : null,
      filingSeasonCostPerAcceptedUsd: costPerAccepted, blockers, eligibleForPromotionReview: false };
  }));
  for (const group of groups.filter(item => candidate(item.profileId).role === "candidate")) {
    const baselines = groups.filter(item => item.task === group.task && candidate(item.profileId).role === "baseline");
    if (baselines.some(item => item.completedRuns !== item.expectedRuns || item.blockers.length)) group.blockers.push("baseline-comparison-incomplete");
    const candidateEntries = validated.entries.filter(entry => entry.profileId === group.profileId && fixtures.find(fixture => fixture.id === entry.fixtureId)?.task === group.task);
    for (const entry of candidateEntries) {
      const fixture = fixtures.find(item => item.id === entry.fixtureId);
      if (!fixture) throw new Error("Evaluation case is missing.");
      const score = scoreForCorpus(entry, fixture, currentCorpusDigest);
      if (!score.criticalCorrect && validated.entries.some(other => candidate(other.profileId).role === "baseline"
        && other.fixtureId === entry.fixtureId && other.repeat === entry.repeat && scoreForCorpus(other, fixture, currentCorpusDigest).criticalCorrect)) {
        group.blockers.push("critical-field-regression"); break;
      }
    }
    const meaningfulBenefit = baselines.length === 2 && baselines.every(baseline => {
      if (!baseline.filingSeasonCostPerAcceptedUsd || !group.filingSeasonCostPerAcceptedUsd) return false;
      const cheaper = new Money(group.filingSeasonCostPerAcceptedUsd).lte(new Money(baseline.filingSeasonCostPerAcceptedUsd).times("0.90"));
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
  return `# Task-based AI evaluation\n\nAll selected profiles remain candidates. There is no quality score or model recommendation without measured runs.\n\nThe draft corpus contains ${taxProviderModelEvalFixtures.length} individually authored synthetic cases: thirty for each of eight tasks, with ten fixed held-out cases per task. No task/year/amount cross-product or template variants count toward that total. Source layouts and decisions cover corrected forms, same-amount distinct accounts, explicit zero versus unknown, ownership, dates, income character, benefit coordination, private source boundaries, unsupported methods, audit explanations and adversarial text. Each case includes frozen, case-specific human review criteria and literal source oracles. The supplied values test assistance with sources, not independent tax-law accuracy. All 240 remain **draft and independently unreviewed**. Published held-out cases are not a secret or proven-uncontaminated benchmark; do not tune on them. Measured real-world representativeness and PII/redaction end-to-end review remain required.\n\nBefore any run, reviewers must validate expected values independently, preserve the held-out split, and record reviewer/date per case. Run each profile/case three times. Retain failed and abstaining attempts and their billed tokens, including retries/escalation. Compare Luna High, Sol Low, Sol High and explicitly enabled Gemini High with GPT-5 Mini and Gemini 3 Flash Preview. Actual account availability is unverified. Record each profile as available, unavailable or failed with a dated account-capability evidence reference; unavailable/failed baselines remain visible blockers, not passing measurements. Available evidence expires within 30 days and must establish structured output, configured effort and token usage for every billed attempt.\n\nUse the application's versioned task schema and source grounding for every response. The scorer revalidates the actual response and derives observations; claimed schema flags or normalized sidecars cannot establish a pass. Measured and preflight records must bind to the current full corpus and exact fixture/request context; stale or absent identities cannot count as current successes. Plan references are correlation, not proof of live authorization. Request-side synthetic audit contexts are separately authored fixtures, not production receipts. Missing, stale, conflicting or cancelled contexts produce separately reported deterministic preflight outcomes with no provider request, tokens, schema pass or model-quality measurement. A separate human must assess prose grounding, substantive quality and PII. Do not use an LLM as the monetary judge. Unknown usage prevents promotion. All attempts are priced exactly with Decimal, separately at actual-run and January 2027 rates. Cost per accepted task includes failed attempts.\n\nGates: >=99.5% schema validity and required-field exact match, no critical-field regression, no observed PII leak, filing-ready claim or engine-value override; reviewed held-out repeated coverage; P50 <=10 seconds routinely /60 seconds for cancellable reconciliation and P95 <=30 seconds routinely /120 seconds reconciliation; January cost per accepted task <=$0.50 routinely /$1.00 reconciliation; >=10% lower accepted-task cost or >=1 percentage point quality gain against both baselines. These are predeclared initial evaluation budgets, not measured results.\n\nCommands: \`pnpm eval:models:sync\` writes draft artifacts; \`pnpm eval:models:check\` checks freshness; \`pnpm eval:models:live-summary -- --live-run-file=path.json\` evaluates supplied records. The script makes no provider calls and spends no credits. Production routes remain empty. Server-side rollout machinery requires current model/prompt/schema-bound qualification and owner approval, stable private-owner cohorts, reviewed observations at 5% then 25% before 100%, and immediate rollback to a still-qualified prior route or deterministic help. Independent corpus review, live measurements and authorized activation remain separate gates.\n`;
}

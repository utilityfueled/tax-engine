import Decimal from "decimal.js";
import { z } from "zod";
import { AI_PROFILES, AI_TASKS, type AiTask } from "./ai-task-registry";
import { PROVIDER_EVAL_BINDING_VERSION, prepareProviderEvalCase, validateProviderEvalOutput } from "./provider-eval-application";
import { AI_PRICES, calculateAiCost } from "./ai-pricing";
import { AI_PROVIDER_DOCUMENTATION, publicModelLifecycle } from "./ai-provider-documentation";
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
export const providerModelPricingSnapshot = { retrievedAt: "2026-10-25", filingSeasonDate: "2027-01-01", prices: AI_PRICES };

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
const evidenceReferencePattern = /^[a-f0-9]{64}$/u;
const entrySchema = z.strictObject({
  profileId: z.string(), fixtureId: z.string(), fixtureVersion: z.literal(1), repeat: z.number().int().min(1).max(3),
  /** Nulls are unrun, unreviewed, or unknown: never a passing measurement. */
  elapsedMs: z.number().finite().nonnegative().nullable(),
  applicationSchemaValid: z.boolean().nullable(),
  output: normalizedOutputSchema.nullable(),
  independentReview: z.strictObject({ method: z.literal("human"), reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime({ offset: true }).optional(), grounded: z.boolean(), qualityAccepted: z.boolean(), piiLeak: z.boolean() }).nullable(),
  measurement: z.strictObject({ runPurpose: z.enum(["smoke", "qualification"]), planDigest: z.string(), corpusDigest: z.string(), fixtureDigest: z.string().optional(), bindingVersion: z.string(), promptVersion: z.string(), schemaVersion: z.string(),
    normalizationStatus: z.enum(["bound", "unsupported", "failed"]), applicationOutput: z.json().nullable(),
    privacyFailure: z.boolean(), responseReference: z.string().nullable(), reportedModel: z.string().nullable() }).optional(),
  attempts: z.array(z.strictObject({
    profileId: z.string(), startedAt: z.iso.datetime(), usage: usageSchema.nullable(),
    observedAt: z.iso.datetime().nullable().optional(),
    billingEvidence: z.strictObject({ billedModel: z.string().trim().min(1).max(128),
      evidenceReference: z.string().regex(evidenceReferencePattern), recordedAt: z.iso.datetime({ offset: true }),
      usageSource: z.literal("reconciliation").optional() }).optional(),
  })).max(2),
});
const availabilitySchema = z.strictObject({
  profileId: z.string(), status: z.enum(["available", "unavailable", "failed"]),
  checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), evidenceReference: z.string().trim().min(1).max(500),
  observedAt: z.iso.datetime().nullable().optional(),
  structuredOutput: z.boolean(), reasoningEffort: z.boolean(), reportedUsage: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});
const preflightSchema = z.strictObject({ profileId: z.string(), fixtureId: z.string(), repeat: z.number().int().min(1).max(3),
  reason: z.enum(["missing-verified-context", "invalid-verified-context", "cancelled"]), at: z.iso.datetime(),
  runPurpose: z.enum(["smoke", "qualification"]), planDigest: z.string().min(1), corpusDigest: z.string().min(1), fixtureDigest: z.string().optional(), bindingVersion: z.string() });
const capabilityAccountingSchema = z.strictObject({
  profileId: z.string(), startedAt: z.iso.datetime(),
  maximumUsd: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u),
  settlement: z.strictObject({
    usage: usageSchema,
    recordedAt: z.iso.datetime({ offset: true }).nullable(),
  }).nullable(),
});
const templateSchema = z.strictObject({ version: z.literal(2), entries: z.array(entrySchema), availability: z.array(availabilitySchema).optional(),
  preflightEntries: z.array(preflightSchema).optional(), capabilityAccounting: z.array(capabilityAccountingSchema).optional() });
export type ProviderModelLiveEvalEntry = z.infer<typeof entrySchema>;
export type ProviderModelLiveEvalTemplate = z.infer<typeof templateSchema>;

function candidate(id: string) {
  const result = providerModelCandidates.find(profile => profile.id === id);
  if (!result) throw new Error(`Unknown evaluation profile: ${id}`);
  return result;
}
function reviewerIdentity(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase() : "";
}

function isIndependentReviewer(reviewer: unknown, author: unknown) {
  const candidate = reviewerIdentity(reviewer);
  const origin = reviewerIdentity(author);
  return candidate !== "" && origin !== "" && candidate !== origin;
}

const reviewDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

// ISO input can carry more fractional precision than Date.parse retains.
function submillisecondDigits(value: string) {
  return (/\.\d{3}(\d+)/u.exec(value)?.[1] ?? "").replace(/0+$/u, "");
}

export function timestampAtOrBefore(instant: string, cutoff: string, cutoffOffsetMs = 0): boolean {
  const instantMs = Date.parse(instant);
  const cutoffMs = Date.parse(cutoff) + cutoffOffsetMs;
  if (instantMs !== cutoffMs) return instantMs < cutoffMs;
  return submillisecondDigits(instant) <= submillisecondDigits(cutoff);
}

function compareTimestampSpanToLatency(start: string, end: string, elapsedMs: number) {
  const startFraction = submillisecondDigits(start);
  const endFraction = submillisecondDigits(end);
  const [elapsedWhole, elapsedFraction = ""] = new Money(elapsedMs).toFixed().split(".");
  const precision = Math.max(startFraction.length, endFraction.length, elapsedFraction.length);
  // Compare integers at a shared precision so fractional timestamps never round away.
  const scaledMilliseconds = (whole: number | string, fraction: string) => BigInt(`${whole}${fraction.padEnd(precision, "0")}`);
  const wholeSpanMs = Date.parse(end) - Date.parse(start);
  return scaledMilliseconds(wholeSpanMs, endFraction) - scaledMilliseconds(0, startFraction) - scaledMilliseconds(elapsedWhole, elapsedFraction);
}

function hasConsistentAttemptTiming({ attempts, elapsedMs }: ProviderModelLiveEvalEntry) {
  const [initial, escalation] = attempts;
  if (!escalation) return true;
  return timestampAtOrBefore(initial.startedAt, escalation.startedAt)
    && (elapsedMs === null || compareTimestampSpanToLatency(initial.startedAt, escalation.startedAt, elapsedMs) <= 0n);
}

function responseReviewAsOf({ independentReview, attempts, elapsedMs }: ProviderModelLiveEvalEntry, cutoff?: string) {
  const reviewedAt = independentReview?.reviewedAt;
  const finalAttempt = attempts.at(-1);
  if (reviewedAt === undefined || elapsedMs === null || !finalAttempt
    || !timestampAtOrBefore(attempts[0].startedAt, reviewedAt)
    || !timestampAtOrBefore(finalAttempt.startedAt, reviewedAt)
    || !wasObservedBy(finalAttempt.observedAt, reviewedAt)
    || (cutoff !== undefined && !timestampAtOrBefore(reviewedAt, cutoff))
    || compareTimestampSpanToLatency(attempts[0].startedAt, reviewedAt, elapsedMs) < 0n) return null;
  return independentReview;
}

function independentReviewTime(fixture: ProviderEvalFixture, cutoff: string) {
  if (fixture.review.status !== "reviewed" || !isIndependentReviewer(fixture.review.reviewer, fixture.review.author)) return null;
  const date = reviewDate.safeParse(fixture.review.reviewedAt);
  return date.success && timestampAtOrBefore(date.data, cutoff) ? date.data : null;
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

function billingEvidenceAsOf(attempt: ProviderModelLiveEvalEntry["attempts"][number], cutoff?: string) {
  const evidence = attempt.billingEvidence;
  return evidence && (evidence.usageSource === "reconciliation" || wasObservedBy(attempt.observedAt, cutoff))
    && (cutoff === undefined || timestampAtOrBefore(evidence.recordedAt, cutoff)) ? evidence : undefined;
}

function wasObservedBy(observedAt: string | null | undefined, cutoff?: string): boolean {
  return observedAt !== null && (observedAt === undefined || cutoff === undefined || timestampAtOrBefore(observedAt, cutoff));
}

type ReportEntry = ProviderModelLiveEvalEntry & { awaitingDispatch: boolean; responseObserved: boolean };

function entryAsOf(entry: ProviderModelLiveEvalEntry, cutoff?: string): ReportEntry {
  const attempts = cutoff === undefined ? entry.attempts
    : entry.attempts.filter(attempt => timestampAtOrBefore(attempt.startedAt, cutoff));
  const awaitingDispatch = attempts.length !== entry.attempts.length;
  const responseObserved = !awaitingDispatch && wasObservedBy(attempts.at(-1)?.observedAt, cutoff);
  if (responseObserved) return { ...entry, awaitingDispatch, responseObserved };
  const { measurement } = entry;
  return { ...entry, attempts, awaitingDispatch, responseObserved,
    elapsedMs: null, applicationSchemaValid: null, output: null, independentReview: null,
    ...(measurement && { measurement: { ...measurement, normalizationStatus: "failed", applicationOutput: null,
      privacyFailure: false, responseReference: null, reportedModel: null } }) };
}

function countAttemptEvidenceReferences(entries: readonly ProviderModelLiveEvalEntry[], cutoff?: string) {
  const counts = new Map<string, number>();
  for (const { attempts, measurement } of entries) {
    for (const [index, attempt] of attempts.entries()) {
      const evidence = billingEvidenceAsOf(attempt, cutoff);
      const billingReference = evidence && timestampAtOrBefore(attempt.startedAt, evidence.recordedAt) ? evidence.evidenceReference : null;
      const responseReference = index === attempts.length - 1 ? measurement?.responseReference : null;
      // An output and billing record may refer to the same provider response for this attempt.
      for (const reference of new Set([billingReference, responseReference])) {
        if (reference) counts.set(reference, (counts.get(reference) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function scoreProviderEvalEntry(entry: ProviderModelLiveEvalEntry, fixture: ProviderEvalFixture) {
  const observed = entryAsOf(entry);
  return scoreForCorpus(observed, fixture, providerEvalCorpusDigest(), countAttemptEvidenceReferences([observed]));
}
function scoreForCorpus(entry: ReportEntry, fixture: ProviderEvalFixture, currentCorpusDigest: string,
  evidenceReferences: ReadonlyMap<string, number>, cutoff?: string) {
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
  const modelLifecycleValid = entry.attempts.length > 0
    && entry.attempts.every(attempt => publicModelLifecycle(candidate(attempt.profileId).model, attempt.startedAt).status !== "shutdown");
  const attemptTimingConsistent = hasConsistentAttemptTiming(entry);
  const qualifiedModel = modelMatches && modelLifecycleValid;
  const attemptsAsOf = entry.attempts.map(attempt => {
    const billingEvidence = billingEvidenceAsOf(attempt, cutoff);
    const usageAvailable = attempt.billingEvidence?.usageSource === "reconciliation"
      ? billingEvidence && timestampAtOrBefore(attempt.startedAt, billingEvidence.recordedAt)
      : wasObservedBy(attempt.observedAt, cutoff);
    return { attempt, billingEvidence, usage: usageAvailable ? attempt.usage : null };
  });
  const tokenBudgetExceeded = attemptsAsOf.some(({ usage }) => usage !== null
    && (usage.inputTokens > policy.maxInputTokens || usage.outputTokens > policy.maxOutputTokens));
  const qualifiedOutput = provenanceMatches && qualifiedModel && !tokenBudgetExceeded;
  const versionMatches = entry.measurement?.bindingVersion === PROVIDER_EVAL_BINDING_VERSION
    && entry.measurement.promptVersion === policy.promptVersion && entry.measurement.schemaVersion === policy.schemaVersion;
  const accuracyEligible = qualifiedOutput && versionMatches;
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const observationsConsistent = canonical(output) === canonical(entry.output)
    && validated.applicationSchemaValid === entry.applicationSchemaValid
    && validated.normalizationStatus === entry.measurement?.normalizationStatus;
  const schemaValid = validated.applicationSchemaValid && accuracyEligible;
  const fields = Object.entries(fixture.expected.fields);
  const exact = accuracyEligible ? fields.filter(([key, expected]) => exactField(expected, output?.fields[key])).length : 0;
  const answered = output?.disposition === "answer";
  const abstained = schemaValid && validated.normalizationStatus === "bound" && output?.disposition === "abstain";
  const answerable = fixture.expected.disposition === "answer";
  const engineOverride = Object.entries(output?.engineValues ?? {}).some(([key, value]) =>
    fixture.expected.engineValues[key] === undefined || !exactField({ kind: "money", value: fixture.expected.engineValues[key] }, value));
  const engineValuesComplete = Object.entries(fixture.expected.engineValues).every(([key, value]) =>
    exactField({ kind: "money", value }, output?.engineValues[key]));
  const inventedField = Object.keys(output?.fields ?? {}).some(key => !(key in fixture.expected.fields));
  const responseReview = responseReviewAsOf(entry, cutoff);
  const grounding = qualifiedOutput && validated.normalizationStatus === "bound" && responseReview?.grounded === true;
  const safetyFailure = validated.privacyFailure || output?.filingReady === true || engineOverride || entry.independentReview?.piiLeak === true || entry.measurement?.privacyFailure === true;
  let knownActualCost = new Money(0);
  let knownFilingSeasonCost = new Money(0);
  let assumedActualCost = new Money(0);
  let assumedFilingSeasonCost = new Money(0);
  let allCostsKnown = entry.attempts.length > 0 && !entry.awaitingDispatch;
  let billingEvidenceUnverified = false;
  for (const { attempt, usage, billingEvidence } of attemptsAsOf) {
    const profile = candidate(attempt.profileId);
    const modelBound = billingEvidence ? matchesProviderEvalModel(profile.model, billingEvidence.billedModel)
      && timestampAtOrBefore(attempt.startedAt, billingEvidence.recordedAt)
      && evidenceReferencePattern.test(billingEvidence.evidenceReference)
      && evidenceReferences.get(billingEvidence.evidenceReference) === 1
      : attempt === finalAttempt && matchesProviderEvalModel(profile.model, entry.measurement?.reportedModel);
    if (!usage) {
      allCostsKnown = false;
      if (billingEvidence) billingEvidenceUnverified = true;
      continue;
    }
    const actual = calculateAiCost(profile.model, attempt.startedAt, usage).providerCostUsd;
    const filingSeason = calculateAiCost(profile.model, "2027-01-01", usage).providerCostUsd;
    if (modelBound) {
      knownActualCost = knownActualCost.plus(actual);
      knownFilingSeasonCost = knownFilingSeasonCost.plus(filingSeason);
    } else {
      allCostsKnown = false;
      billingEvidenceUnverified = true;
      assumedActualCost = assumedActualCost.plus(actual);
      assumedFilingSeasonCost = assumedFilingSeasonCost.plus(filingSeason);
    }
  }
  const canonicalAuthor = taxProviderModelEvalFixtures.find(item => item.id === fixture.id)?.review.author;
  const complete = accuracyEligible && attemptTimingConsistent && observationsConsistent && entry.measurement?.runPurpose === "qualification" && entry.measurement.normalizationStatus === "bound" && entry.elapsedMs !== null && entry.applicationSchemaValid !== null && responseReview !== null
    && isIndependentReviewer(responseReview.reviewer, canonicalAuthor) && allCostsKnown;
  const otherwiseAcceptable = complete && schemaValid && !!output && !safetyFailure
    && !inventedField && engineValuesComplete && grounding
    && output.disposition === fixture.expected.disposition && exact === fields.length
    && output.category === fixture.expected.category;
  const accepted = otherwiseAcceptable && responseReview?.qualityAccepted === true;
  const qualityOnlyRejection = otherwiseAcceptable && responseReview?.qualityAccepted === false;
  const knownActualCostUsd = knownActualCost.toFixed();
  const knownFilingSeasonCostUsd = knownFilingSeasonCost.toFixed();
  return { complete, accepted, qualityOnlyRejection, schemaValid, observationsConsistent, provenanceMatches, modelMatches, modelLifecycleValid, attemptTimingConsistent, tokenBudgetExceeded, billingEvidenceUnverified, safetyFailure, grounding, answerable, answered, abstained,
    // Abstention is reported separately, but cannot improve exact-field accuracy.
    requiredFields: fields.length, exactFields: exact,
    criticalCorrect: accuracyEligible && validated.normalizationStatus === "bound" && fields.length === exact && !inventedField,
    knownActualCostUsd, knownFilingSeasonCostUsd, assumedActualCostUsd: assumedActualCost.toFixed(), assumedFilingSeasonCostUsd: assumedFilingSeasonCost.toFixed(),
    actualCostUsd: allCostsKnown ? knownActualCostUsd : null,
    filingSeasonCostUsd: allCostsKnown ? knownFilingSeasonCostUsd : null };
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
    if (timestampAtOrBefore(evidence.expiresAt, evidence.checkedAt)
      || !timestampAtOrBefore(evidence.expiresAt, evidence.checkedAt, 30 * 24 * 60 * 60 * 1000)) {
      throw new Error("Provider availability evidence must expire within 30 days.");
    }
    if ((evidence.observedAt && !timestampAtOrBefore(evidence.checkedAt, evidence.observedAt))
      || (evidence.status === "available" && evidence.observedAt === null)) {
      throw new Error("Invalid provider capability observation time.");
    }
  }
  if (parsed.data.capabilityAccounting) {
    const probeProfiles = new Set<string>();
    for (const { profileId, startedAt, settlement } of parsed.data.capabilityAccounting) {
      const probe = parsed.data.availability?.find(evidence => evidence.profileId === profileId);
      if (!probe || probeProfiles.has(profileId) || probe.checkedAt !== startedAt
        || probe.reportedUsage !== (settlement !== null)
        || (probe.status === "available" && probe.observedAt !== undefined && probe.observedAt !== settlement?.recordedAt)
        || (settlement?.recordedAt && !timestampAtOrBefore(startedAt, settlement.recordedAt))) {
        throw new Error("Invalid or duplicate capability accounting evidence.");
      }
      probeProfiles.add(profileId);
    }
    if (probeProfiles.size !== availableProfiles.size) throw new Error("Incomplete capability accounting evidence.");
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
      if (attempt.observedAt && !timestampAtOrBefore(attempt.startedAt, attempt.observedAt)) throw new Error("Provider case observation cannot precede dispatch.");
    });
  }
  return parsed.data;
}

export function buildProviderModelEvalFixturePack() {
  return { version: 4, corpusId: "tax-assistance-2026-r4", qualification: "draft-unreviewed", fixtureCount: taxProviderModelEvalFixtures.length,
    templateScenarioFamilies: 0, templateVariantCount: 0, standaloneScenarioCount: taxProviderModelEvalFixtures.length,
    taskTypes: Object.keys(AI_TASKS), fixtures: structuredClone(taxProviderModelEvalFixtures) };
}
export function buildProviderModelBenchmark() {
  return { version: 2, candidates: providerModelCandidates, gates: evaluationGates,
    pricingSnapshot: providerModelPricingSnapshot, publicProviderFacts: AI_PROVIDER_DOCUMENTATION, recommendation: null,
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
  fixtures: ProviderEvalFixture[] = taxProviderModelEvalFixtures, reportAt = new Date().toISOString()) {
  const validated = parseProviderModelLiveEvalTemplate(template);
  const reportCutoff = z.iso.datetime({ offset: true }).parse(reportAt);
  const reportEntries = validated.entries
    .map(entry => entryAsOf(entry, reportCutoff))
    .filter(entry => !entry.awaitingDispatch || entry.attempts.length > 0);
  const reportPreflights = (validated.preflightEntries ?? []).filter(entry => timestampAtOrBefore(entry.at, reportCutoff));
  const reportAvailability = (validated.availability ?? []).filter(evidence =>
    timestampAtOrBefore(evidence.checkedAt, reportCutoff) && wasObservedBy(evidence.observedAt, reportCutoff));
  const capabilityAccounting = validated.capabilityAccounting
    ?.filter(probe => timestampAtOrBefore(probe.startedAt, reportCutoff))
    .map(({ profileId, startedAt, maximumUsd, settlement }) => {
      const { model } = candidate(profileId);
      const cost = settlement ? {
        providerCostUsd: calculateAiCost(model, startedAt, settlement.usage).providerCostUsd,
        filingSeasonCostUsd: calculateAiCost(model, providerModelPricingSnapshot.filingSeasonDate, settlement.usage).providerCostUsd,
      } : null;
      const settled = !!settlement?.recordedAt && timestampAtOrBefore(settlement.recordedAt, reportCutoff);
      return { profileId, startedAt,
        providerCostUsd: settled ? cost?.providerCostUsd ?? null : null,
        filingSeasonCostUsd: settled ? cost?.filingSeasonCostUsd ?? null : null,
        unknownMaximumUsd: settled ? "0" : maximumUsd,
        ...(settlement?.recordedAt === null ? { undatedCost: cost } : {}),
      };
    }) ?? null;
  const fixtureIds = new Set<string>();
  const reviewTimes = new Map<string, string>();
  for (const fixture of fixtures) {
    const canonical = taxProviderModelEvalFixtures.find(item => item.id === fixture.id);
    const { review: _review, ...content } = fixture;
    const { review: _canonicalReview, ...canonicalContent } = canonical ?? {};
    if (!canonical || fixtureIds.has(fixture.id) || JSON.stringify(content) !== JSON.stringify(canonicalContent)) {
      throw new Error("Reviewed fixtures must preserve the frozen case content and unique IDs.");
    }
    if (fixture.review?.author !== canonical.review.author) throw new Error("Reviewed fixtures must preserve the frozen case author.");
    const time = independentReviewTime(fixture, reportCutoff);
    if (time !== null) reviewTimes.set(fixture.id, time);
    fixtureIds.add(fixture.id);
  }
  if (fixtures.length !== taxProviderModelEvalFixtures.length) throw new Error("The full frozen corpus is required for evaluation.");
  const reviewedCount = reviewTimes.size;
  const currentCorpusDigest = providerEvalCorpusDigest();
  const attemptEvidenceReferences = countAttemptEvidenceReferences(reportEntries, reportCutoff);
  const providerReferences = new Map<string, number>();
  for (const entry of reportEntries) {
    const measurement = entry.measurement;
    if (measurement?.runPurpose === "qualification" && measurement.responseReference) {
      const reference = measurement.responseReference;
      providerReferences.set(reference, (providerReferences.get(reference) ?? 0) + 1);
    }
  }
  const groupPlans = new Map<string, Set<string>>();
  const comparableBaselines = new Set<string>();
  const acceptanceBlocker = "grounding-quality-or-abstention";
  // These computations depend on this call's already checked fixture/entry
  // objects, not the profile being summarized. Keep reuse local to this report
  // so changed payloads, review evidence and source contexts are always checked
  // again by a subsequent report.
  const preparedCases = new Map(fixtures.map(fixture => [fixture.id, prepareProviderEvalCase(fixture)]));
  const entryScores = new Map<ProviderModelLiveEvalEntry, ReturnType<typeof scoreForCorpus>>();
  const scoreEntry = (entry: ReportEntry, fixture: ProviderEvalFixture) => {
    const previous = entryScores.get(entry);
    if (previous) return previous;
    const score = scoreForCorpus(entry, fixture, currentCorpusDigest, attemptEvidenceReferences, reportCutoff);
    entryScores.set(entry, score);
    return score;
  };
  const groups = providerModelCandidates.flatMap(profile => (Object.keys(AI_TASKS) as AiTask[]).map(task => {
    const filingSeasonLifecycle = publicModelLifecycle(profile.model, providerModelPricingSnapshot.filingSeasonDate);
    const cases = fixtures.filter(fixture => fixture.task === task);
    const entries = reportEntries.filter(entry => entry.profileId === profile.id && cases.some(fixture => fixture.id === entry.fixtureId));
    const availability = reportAvailability.find(entry => entry.profileId === profile.id);
    const scored = entries.map(entry => {
      const fixture = cases.find(item => item.id === entry.fixtureId);
      if (!fixture) throw new Error("Evaluation case is missing.");
      return { entry, result: scoreEntry(entry, fixture) };
    });
    const complete = scored.filter(item => item.result.complete);
    const observedScores = scored.filter(({ entry }) => entry.responseObserved);
    const fields = observedScores.reduce((sum, item) => sum + item.result.requiredFields, 0);
    const exact = observedScores.reduce((sum, item) => sum + item.result.exactFields, 0);
    const accepted = scored.filter(item => item.result.accepted).length;
    const latencies = scored.flatMap(({ entry, result }) => entry.elapsedMs === null || !result.attemptTimingConsistent ? [] : [entry.elapsedMs]);
    const knownProviderCost = scored.reduce((sum, item) => sum.plus(item.result.knownActualCostUsd), new Money(0));
    const knownFilingSeasonCost = scored.reduce((sum, item) => sum.plus(item.result.knownFilingSeasonCostUsd), new Money(0));
    const knownProviderCostUsd = knownProviderCost.toFixed();
    const knownFilingSeasonCostUsd = knownFilingSeasonCost.toFixed();
    const assumedProviderCostUsd = scored.reduce((sum, item) => sum.plus(item.result.assumedActualCostUsd), new Money(0)).toFixed();
    const assumedFilingSeasonCostUsd = scored.reduce((sum, item) => sum.plus(item.result.assumedFilingSeasonCostUsd), new Money(0)).toFixed();
    const costKnown = scored.length > 0 && scored.every(item => item.result.actualCostUsd !== null);
    const preflightCases = cases.filter(fixture => preparedCases.get(fixture.id)?.kind === "preflight");
    const preflightEntries = reportPreflights.filter(entry => entry.profileId === profile.id && preflightCases.some(fixture => fixture.id === entry.fixtureId));
    const evidence = [...entries.map(entry => entry.measurement), ...preflightEntries];
    const groupKey = `${profile.id}:${task}`;
    groupPlans.set(groupKey, new Set(evidence.flatMap(item => item?.runPurpose === "qualification" ? [item.planDigest] : [])));
    const preflightPassed = preflightEntries.filter(entry => { const fixture = preflightCases.find(item => item.id === entry.fixtureId);
      return entry.runPurpose === "qualification" && entry.bindingVersion === PROVIDER_EVAL_BINDING_VERSION && fixture?.expected.disposition === "abstain" && hasCurrentProviderEvalProvenance(entry, fixture, currentCorpusDigest) && Object.keys(fixture.expected.fields).length === 0
        && Object.keys(fixture.expected.engineValues).length === 0 && fixture.expected.category === null; }).length;
    const expectedPreflightRuns = preflightCases.length * evaluationGates.repeats;
    const expectedRuns = (cases.length - preflightCases.length) * evaluationGates.repeats;
    const schemaRate = observedScores.length
      ? observedScores.filter(item => item.result.schemaValid).length / observedScores.length : null;
    const exactRate = fields ? exact / fields : null;
    const p95 = percentile(latencies, 0.95);
    const p50 = percentile(latencies, 0.5);
    const costPerAccepted = costKnown && accepted ? knownFilingSeasonCost.div(accepted).toFixed() : null;
    const blockers: string[] = [];
    if (scored.some(item => !item.result.modelLifecycleValid)) blockers.push("model-shutdown-at-attempt");
    if (scored.some(item => !item.result.attemptTimingConsistent)) blockers.push("attempt-timing-inconsistent");
    if (scored.some(item => item.result.tokenBudgetExceeded)) blockers.push("attempt-token-budget-exceeded");
    if (scored.some(item => item.result.billingEvidenceUnverified)) blockers.push("attempt-billing-evidence-unverified");
    if (profile.role === "candidate" && filingSeasonLifecycle.status === "shutdown") blockers.push("candidate-shutdown-before-filing-season");
    if (!availability || availability.status !== "available" || !availability.structuredOutput || !availability.reasoningEffort || !availability.reportedUsage
      || entries.some(entry => entry.attempts.some(attempt => {
        const evidence = reportAvailability.find(item => item.profileId === attempt.profileId);
        return !evidence || evidence.status !== "available" || !evidence.structuredOutput || !evidence.reasoningEffort || !evidence.reportedUsage
          || !timestampAtOrBefore(evidence.observedAt ?? evidence.checkedAt, attempt.startedAt) || timestampAtOrBefore(evidence.expiresAt, attempt.startedAt);
      }))) blockers.push("account-capability-unverified-or-unavailable");
    if (entries.some(entry => entry.measurement?.normalizationStatus !== "bound")) blockers.push("application-normalization-unverified");
    if (scored.some(item => item.entry.measurement?.runPurpose !== "qualification" || !item.result.provenanceMatches)
      || preflightEntries.some(entry => { const fixture = preflightCases.find(item => item.id === entry.fixtureId); return !fixture || !hasCurrentProviderEvalProvenance(entry, fixture, currentCorpusDigest); })) blockers.push("qualification-run-provenance-missing");
    if (complete.some(({ entry }) => {
      const reference = entry.measurement?.responseReference;
      return !reference || !evidenceReferencePattern.test(reference) || providerReferences.get(reference) !== 1;
    })) blockers.push("provider-response-evidence-missing-or-reused");
    const reviewInTime = (fixtureId: string, at: string) => {
      const reviewedAt = reviewTimes.get(fixtureId);
      return reviewedAt !== undefined && timestampAtOrBefore(reviewedAt, at);
    };
    if (reviewedCount < evaluationGates.minimumReviewedCases || cases.some(fixture => !reviewTimes.has(fixture.id))
      || entries.some(entry => entry.attempts.some(attempt => !reviewInTime(entry.fixtureId, attempt.startedAt)))
      || preflightEntries.some(entry => !reviewInTime(entry.fixtureId, entry.at))) blockers.push("independent-fixture-review-incomplete");
    if (preflightPassed !== expectedPreflightRuns) blockers.push("deterministic-preflight-coverage-incomplete");
    if (complete.length !== expectedRuns || !cases.some(fixture => fixture.split === "held-out")) blockers.push("held-out-repeat-coverage-incomplete");
    if (schemaRate === null || schemaRate < evaluationGates.schemaValidity) blockers.push("schema-validity");
    if (fields && (exactRate === null || exactRate < evaluationGates.criticalFieldExactMatch)) blockers.push("critical-field-exact-match");
    if (scored.some(item => item.result.safetyFailure)) blockers.push("observed-safety-failure");
    if (accepted !== expectedRuns) blockers.push(acceptanceBlocker);
    if (p50 === null || p50 > (task === "complex-reconciliation" ? evaluationGates.p50EscalationLatencyMs : evaluationGates.p50RoutineLatencyMs)
      || p95 === null || p95 > (task === "complex-reconciliation" ? evaluationGates.p95EscalationLatencyMs : evaluationGates.p95RoutineLatencyMs)) blockers.push("latency-budget");
    if (costPerAccepted === null || new Money(costPerAccepted).gt(task === "complex-reconciliation" ? evaluationGates.maximumEscalationCostPerAcceptedUsd : evaluationGates.maximumRoutineCostPerAcceptedUsd)) blockers.push("spend-budget-or-unknown-usage");
    if (profile.role === "baseline" && blockers.every(blocker => blocker === acceptanceBlocker)
      && scored.every(({ result }) => result.accepted || result.qualityOnlyRejection)) {
      comparableBaselines.add(groupKey);
    }
    return { profileId: profile.id, model: profile.model, effort: profile.effort, task, expectedRuns, completedRuns: complete.length, expectedPreflightRuns, deterministicPreflightRuns: preflightEntries.length, deterministicPreflightPassed: preflightPassed,
      schemaValidity: schemaRate, criticalFieldExactMatch: exactRate, acceptedRuns: accepted,
      answerableAbstentions: scored.filter(item => item.result.answerable && item.result.abstained).length,
      unanswerableAbstentions: scored.filter(item => !item.result.answerable && item.result.abstained).length,
      p50LatencyMs: p50, p95LatencyMs: p95, availability: availability ?? null,
      knownProviderCostUsd, knownFilingSeasonCostUsd, assumedProviderCostUsd, assumedFilingSeasonCostUsd,
      providerCostUsd: costKnown ? knownProviderCostUsd : null, filingSeasonCostUsd: costKnown ? knownFilingSeasonCostUsd : null,
      filingSeasonLifecycle, filingSeasonCostKind: filingSeasonLifecycle.status === "shutdown" ? "historical-price-projection-retired-model" : "published-price-projection",
      providerCostPerAcceptedUsd: costKnown && accepted ? knownProviderCost.div(accepted).toFixed() : null,
      filingSeasonCostPerAcceptedUsd: costPerAccepted, blockers, eligibleForPromotionReview: false };
  }));
  for (const group of groups.filter(item => candidate(item.profileId).role === "candidate")) {
    const baselines = groups.filter(item => item.task === group.task && candidate(item.profileId).role === "baseline");
    const comparisonPlans = new Set([group, ...baselines].flatMap(item => [...(groupPlans.get(`${item.profileId}:${item.task}`) ?? [])]));
    if (comparisonPlans.size > 1) group.blockers.push("qualification-comparison-mixed-plans");
    if (baselines.some(item => !comparableBaselines.has(`${item.profileId}:${item.task}`))) group.blockers.push("baseline-comparison-incomplete");
    const candidateEntries = reportEntries.filter(entry => entry.profileId === group.profileId && entry.responseObserved
      && fixtures.find(fixture => fixture.id === entry.fixtureId)?.task === group.task);
    for (const entry of candidateEntries) {
      const fixture = fixtures.find(item => item.id === entry.fixtureId);
      if (!fixture) throw new Error("Evaluation case is missing.");
      const score = scoreEntry(entry, fixture);
      if (!score.criticalCorrect && reportEntries.some(other => candidate(other.profileId).role === "baseline"
        && other.fixtureId === entry.fixtureId && other.repeat === entry.repeat && scoreEntry(other, fixture).criticalCorrect)) {
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
    entries: reportEntries.length, capabilityAccounting, groups, productionPromotion: false,
    limitation: "Eligibility supports a human promotion review only. Zero observed failures is not proof. No route is activated by this report." };
}

export function renderProviderModelBenchmarkMarkdown() {
  return `# Task-based AI evaluation\n\nAll selected profiles remain candidates. There is no quality score or model recommendation without measured runs.\n\nThe draft corpus contains ${taxProviderModelEvalFixtures.length} individually authored synthetic cases: thirty for each of eight tasks, with ten fixed held-out cases per task. No task/year/amount cross-product or template variants count toward that total. Source layouts and decisions cover corrected forms, same-amount distinct accounts, explicit zero versus unknown, ownership, dates, income character, benefit coordination, private source boundaries, unsupported methods, audit explanations and adversarial text. Each case includes frozen, case-specific human review criteria and literal source oracles. The supplied values test assistance with sources, not independent tax-law accuracy. All 240 remain **draft and independently unreviewed**. Published held-out cases are not a secret or proven-uncontaminated benchmark; do not tune on them. Measured real-world representativeness and PII/redaction end-to-end review remain required.\n\nBefore any run, reviewers must validate expected values independently, preserve the held-out split, and record reviewer/date per case. Run each profile/case three times. Retain failed and abstaining attempts and their billed tokens, including retries/escalation. Compare Luna High, Sol Low, Sol High and explicitly enabled Gemini High with GPT-5 Mini and Gemini 3 Flash Preview. Public documentation was refreshed on October 25, 2026; actual account availability remains unverified. OpenAI lists the GPT-5 Mini alias and August 7, 2025 snapshot for shutdown on December 11, 2026. New plans and dispatches stop from the start of that UTC date; a January cost projection for that retained historical baseline is hypothetical and does not assert an available January service. No replacement model is selected automatically. Record each profile as available, unavailable or failed with a dated account-capability evidence reference; unavailable/failed baselines remain visible blockers, not passing measurements. Available evidence expires within 30 days and must establish structured output, configured effort and token usage for every billed attempt.\n\nUse the application's versioned task schema and source grounding for every response. The scorer revalidates the actual response and derives observations; claimed schema flags or normalized sidecars cannot establish a pass. Measured and preflight records must bind to the current full corpus and exact fixture/request context; stale or absent identities cannot count as current successes. Plan references are correlation, not proof of live authorization. Request-side synthetic audit contexts are separately authored fixtures, not production receipts. Missing, stale, conflicting or cancelled contexts produce separately reported deterministic preflight outcomes with no provider request, tokens, schema pass or model-quality measurement. A separate human must assess prose grounding, substantive quality and PII. Do not use an LLM as the monetary judge. Unknown usage prevents promotion. All attempts are priced exactly with Decimal, separately at actual-run and January 2027 rates. Cost per accepted task includes failed attempts.\n\nGates: >=99.5% schema validity and required-field exact match, no critical-field regression, no observed PII leak, filing-ready claim or engine-value override; reviewed held-out repeated coverage; P50 <=10 seconds routinely /60 seconds for cancellable reconciliation and P95 <=30 seconds routinely /120 seconds reconciliation; January cost per accepted task <=$0.50 routinely /$1.00 reconciliation; >=10% lower accepted-task cost or >=1 percentage point quality gain against both baselines. These are predeclared initial evaluation budgets, not measured results.\n\nCommands: \`pnpm eval:models:sync\` writes draft artifacts; \`pnpm eval:models:check\` checks freshness; \`pnpm eval:models:live-summary -- --live-run-file=path.json\` evaluates supplied records. The script makes no provider calls and spends no credits. Production routes remain empty. Server-side rollout machinery requires current model/prompt/schema-bound qualification and owner approval, stable private-owner cohorts, reviewed observations at 5% then 25% before 100%, and immediate rollback to a still-qualified prior route or deterministic help. Independent corpus review, live measurements and authorized activation remain separate gates.\n`;
}

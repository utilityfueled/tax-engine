import Decimal from "decimal.js";
import { z } from "zod";
import { AI_PRICES, calculateAiCost, getAiPrice, type AiTokenUsage } from "../../packages/engine/src/ai-pricing";
import { AI_TASKS, type AiTask } from "../../packages/engine/src/ai-task-registry";
import { providerModelCandidates, summarizeProviderModelLiveEvalTemplate,
  type ProviderModelLiveEvalTemplate } from "../../packages/engine/src/provider-model-eval";
import { taxProviderModelEvalFixtures, type ProviderEvalFixture } from "../../packages/engine/src/provider-eval-fixtures";
import { evaluationRequestContent, providerEvalBindingManifest, validateProviderEvalOutput, prepareProviderEvalCase, PROVIDER_EVAL_BINDING_VERSION } from "./provider-eval-bindings";
import { AI_APPLICATION_INSTRUCTIONS, applicationSchemaForTask } from "../../packages/engine/src/ai-application-bindings";
import { PROVIDER_EVAL_CONTRACT } from "./provider-eval-contract";
import { matchesProviderEvalModel, PROVIDER_EVAL_MODEL_IDENTITIES, providerEvalDigest, providerEvalCorpusDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";
const Money = Decimal.clone({ precision: 80 });
export { providerEvalDigest } from "../../packages/engine/src/provider-eval-provenance";
const instant = z.iso.datetime();
const usd = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine(value => new Money(value).isFinite() && new Money(value).lte("10000"));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const evalUsageSchema = z.strictObject({ inputTokens: count, outputTokens: count, cachedInputTokens: count.optional(),
  cacheWrite30mTokens: count.optional(), cacheWrite12hTokens: count.optional(), cachedTokenHours: z.string().optional(), regionalProcessing: z.boolean().optional() });
const planSchema = z.strictObject({ version: z.literal(1), runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
  purpose: z.enum(["capability", "smoke", "qualification"]), profileIds: z.array(z.string()).min(1).max(6),
  fixtureIds: z.array(z.string()).max(300), repeats: z.literal(3), maximumProviderUsd: usd,
  maximumRequests: z.number().int().min(1).max(10000), createdAt: instant, expiresAt: instant,
  corpusDigest: z.string(), bindingDigest: z.string(), pricingDigest: z.string(), reviewedCorpusDigest: z.string().nullable(),
  executionContract: z.json(), executionDigest: z.string() });
export type ProviderEvalPlan = z.infer<typeof planSchema>;
const approvalSchema = z.strictObject({ version: z.literal(1), planDigest: z.string(),
  authorizedBy: z.string().trim().min(1).max(200), authorizationReference: z.string().trim().min(1).max(500),
  approvedAt: instant, expiresAt: instant, maximumProviderUsd: usd, maximumRequests: z.number().int().positive(),
  accountReference: z.string().trim().min(1).max(200), syntheticOnly: z.literal(true) });
export type ProviderEvalApproval = z.infer<typeof approvalSchema>;
export type EvalProfile = (typeof providerModelCandidates)[number];
export interface ProviderEvalRequest {
  attemptId: string; kind: "capability" | "case"; profile: EvalProfile;
  task: AiTask | null; content: unknown; jsonSchema: Record<string, unknown>;
  maxInputTokens: number; maxOutputTokens: number; timeoutMs: number;
}
export interface ProviderEvalTransportResult {
  status: "completed" | "unavailable" | "failed" | "incomplete";
  usage: AiTokenUsage | null; elapsedMs: number; reportedModel: string | null;
  responseReference: string | null; payload: unknown;
}
export type ProviderEvalTransport = (request: ProviderEvalRequest, signal?: AbortSignal) => Promise<ProviderEvalTransportResult>;
type Evaluation = ReturnType<typeof validateProviderEvalOutput>;
export type EvalJournalRecord =
  | { type: "start"; planDigest: string; approvalDigest: string }
  | { type: "preflight"; profileId: string; fixtureId: string; repeat: number; reason: "missing-verified-context" | "invalid-verified-context" | "cancelled"; at: string }
  | { type: "dispatch"; attemptId: string; kind: "capability" | "case"; profileId: string; fixtureId: string | null; repeat: number; startedAt: string; maximumUsd: string }
  | { type: "result"; attemptId: string; status: ProviderEvalTransportResult["status"]; usage: AiTokenUsage | null;
      elapsedMs: number; reportedModel: string | null; responseReference: string | null; capabilityPassed: boolean; evaluation: Evaluation | null }
  | { type: "reconcile"; attemptId: string; evidenceReference: string; usage: AiTokenUsage; at: string };
function profile(id: string): EvalProfile {
  const item = providerModelCandidates.find(item => item.id === id);
  if (!item) throw new Error("Unknown evaluation profile.");
  return item;
}
export function providerEvalExecutionContract(profileIds: readonly string[]) {
  return z.json().parse({ profiles: profileIds.map(id => ({ ...profile(id) })), taskPolicies: AI_TASKS,
    request: PROVIDER_EVAL_CONTRACT, modelIdentities: PROVIDER_EVAL_MODEL_IDENTITIES, applicationInstructions: AI_APPLICATION_INSTRUCTIONS, responseSchemas: providerEvalBindingManifest });
}
function assertReviewed(fixtures: ProviderEvalFixture[]) {
  const summary = summarizeProviderModelLiveEvalTemplate({ version: 2, entries: [], availability: [] }, fixtures);
  if (summary.independentlyReviewedCases !== taxProviderModelEvalFixtures.length || summary.independentlyReviewedCases < 200) {
    throw new Error("Qualification execution requires real independent human review of the full frozen corpus.");
  }
}
export function createProviderEvalPlan(input: {
  runId: string; purpose: ProviderEvalPlan["purpose"]; profileIds: string[]; fixtureIds?: string[];
  maximumProviderUsd: string; maximumRequests: number; createdAt: string; expiresAt: string;
}, reviewedFixtures?: ProviderEvalFixture[]): ProviderEvalPlan {
  if (input.purpose === "qualification") {
    if (!reviewedFixtures) throw new Error("Qualification execution requires a reviewed corpus.");
    assertReviewed(reviewedFixtures);
  }
  const executionContract = providerEvalExecutionContract(input.profileIds);
  const plan = planSchema.parse({ ...input, version: 1, repeats: 3,
    fixtureIds: input.purpose === "capability" ? [] : input.fixtureIds ?? taxProviderModelEvalFixtures
      .filter(item => input.purpose === "qualification" || item.split === "development").map(item => item.id),
    corpusDigest: providerEvalCorpusDigest(), bindingDigest: providerEvalDigest(providerEvalBindingManifest), pricingDigest: providerEvalDigest(AI_PRICES),
    reviewedCorpusDigest: reviewedFixtures ? providerEvalDigest(reviewedFixtures) : null,
    executionContract, executionDigest: providerEvalDigest(executionContract) });
  validatePlan(plan);
  return plan;
}
export function validatePlan(value: unknown): ProviderEvalPlan {
  const plan = planSchema.parse(value);
  if (new Set(plan.profileIds).size !== plan.profileIds.length || new Set(plan.fixtureIds).size !== plan.fixtureIds.length) throw new Error("Duplicate plan profiles or cases.");
  plan.profileIds.forEach(profile);
  if (plan.executionDigest !== providerEvalDigest(plan.executionContract)
    || plan.executionDigest !== providerEvalDigest(providerEvalExecutionContract(plan.profileIds))) throw new Error("Evaluation request policy or transport contract changed; create a new approved plan.");
  if (plan.fixtureIds.some(id => !taxProviderModelEvalFixtures.some(item => item.id === id))) throw new Error("Plan contains an unknown case.");
  if (plan.purpose === "qualification" && plan.fixtureIds.length !== taxProviderModelEvalFixtures.length) throw new Error("Qualification requires every frozen case.");
  if (plan.purpose === "qualification" && providerEvalBindingManifest.some(binding => binding.normalizationStatus !== "bound")) throw new Error("Qualification requires complete actual application bindings.");
  if (plan.purpose === "smoke" && plan.fixtureIds.some(id => taxProviderModelEvalFixtures.find(item => item.id === id)?.split === "held-out")) throw new Error("Smoke runs cannot consume held-out cases; use a reviewed qualification plan.");
  if (plan.purpose !== "capability" && !plan.fixtureIds.length) throw new Error("Case execution requires named cases.");
  if (plan.purpose === "capability" && plan.fixtureIds.length) throw new Error("Capability plans cannot contain cases.");
  if (plan.corpusDigest !== providerEvalCorpusDigest() || plan.bindingDigest !== providerEvalDigest(providerEvalBindingManifest) || plan.pricingDigest !== providerEvalDigest(AI_PRICES)) throw new Error("Evaluation plan is stale; corpus, bindings or prices changed.");
  if (Date.parse(plan.expiresAt) <= Date.parse(plan.createdAt) || Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) > 7 * 86400000) throw new Error("Evaluation plan must expire within seven days.");
  return plan;
}
function approved(plan: ProviderEvalPlan, value: unknown, at: string): ProviderEvalApproval {
  if (!instant.safeParse(at).success) throw new Error("Approval check requires a valid current timestamp.");
  const parsed = approvalSchema.safeParse(value);
  if (!parsed.success) throw new Error("Explicit, complete live-service approval is required.");
  const approval = parsed.data;
  if (approval.planDigest !== providerEvalDigest(plan) || new Money(approval.maximumProviderUsd).gt(plan.maximumProviderUsd)
    || approval.maximumRequests > plan.maximumRequests || Date.parse(approval.approvedAt) > Date.parse(at)
    || Date.parse(plan.createdAt) > Date.parse(at) || Date.parse(approval.expiresAt) <= Date.parse(at)
    || Date.parse(plan.expiresAt) <= Date.parse(at) || Date.parse(approval.expiresAt) > Date.parse(plan.expiresAt)) {
    throw new Error("Approval does not match the current plan, time or spend limits.");
  }
  return approval;
}
function requestFor(item: EvalProfile, fixture: ProviderEvalFixture | undefined, attemptId: string): ProviderEvalRequest {
  const policy = fixture ? AI_TASKS[fixture.task] : null;
  const capability = PROVIDER_EVAL_CONTRACT.capability;
  const content = fixture ? evaluationRequestContent(fixture) : { instruction: capability.instruction, probe: "ok" };
  const jsonSchema = fixture ? z.toJSONSchema(applicationSchemaForTask(fixture.task)) : capability.jsonSchema;
  const maxInputTokens = policy?.maxInputTokens ?? capability.maxInputTokens;
  if (new TextEncoder().encode(JSON.stringify(content) + JSON.stringify(jsonSchema) + PROVIDER_EVAL_CONTRACT.safetyInstructions).byteLength
    + PROVIDER_EVAL_CONTRACT.framingTokenAllowance > maxInputTokens) throw new Error("Evaluation input exceeds conservative token bound.");
  return { attemptId, kind: fixture ? "case" : "capability", profile: item, task: fixture?.task ?? null,
    content, jsonSchema, maxInputTokens, maxOutputTokens: policy?.maxOutputTokens ?? capability.maxOutputTokens, timeoutMs: policy?.timeoutMs ?? capability.timeoutMs };
}
/** Bound every supported cache treatment and regional uplift, even though no cache writes are requested. */
export function maximumProviderAttemptUsd(request: ProviderEvalRequest, at: string): string {
  const price = getAiPrice(request.profile.model, at);
  const common = { inputTokens: request.maxInputTokens, outputTokens: request.maxOutputTokens,
    regionalProcessing: request.profile.provider === "openai" };
  const usages: AiTokenUsage[] = [common, { ...common, cachedInputTokens: request.maxInputTokens }];
  if (price.cacheWrite30m) usages.push({ ...common, cacheWrite30mTokens: request.maxInputTokens });
  if (price.cacheWrite12h) usages.push({ ...common, cacheWrite12hTokens: request.maxInputTokens });
  return Money.max(...usages.map(usage => calculateAiCost(request.profile.model, at, usage).providerCostUsd)).toFixed();
}
export function summarizeProviderEvalJournal(plan: ProviderEvalPlan, records: readonly EvalJournalRecord[]) {
  validatePlan(plan);
  const template: ProviderModelLiveEvalTemplate = { version: 2, entries: [], availability: [], preflightEntries: records.flatMap(record => {
    if (record.type !== "preflight") return [];
    const fixture = taxProviderModelEvalFixtures.find(item => item.id === record.fixtureId);
    if (!fixture) throw new Error("Journal fixture is unknown.");
    return [{ profileId: record.profileId, fixtureId: record.fixtureId, repeat: record.repeat, reason: record.reason, at: record.at, runPurpose: plan.purpose === "qualification" ? "qualification" as const : "smoke" as const, planDigest: providerEvalDigest(plan), corpusDigest: plan.corpusDigest, fixtureDigest: providerEvalFixtureDigest(fixture), bindingVersion: PROVIDER_EVAL_BINDING_VERSION }];
  }) };
  const dispatches = records.filter((item): item is Extract<EvalJournalRecord, { type: "dispatch" }> => item.type === "dispatch");
  if (new Set(dispatches.map(item => item.attemptId)).size !== dispatches.length) throw new Error("Duplicate durable dispatch identity.");
  let known = new Money(0); let held = new Money(0); let overrun = false;
  const bindingBlockers = new Set<string>();
  for (const dispatch of dispatches) {
    const results = records.filter((item): item is Extract<EvalJournalRecord, { type: "result" }> => item.type === "result" && item.attemptId === dispatch.attemptId);
    const reconciliations = records.filter((item): item is Extract<EvalJournalRecord, { type: "reconcile" }> => item.type === "reconcile" && item.attemptId === dispatch.attemptId);
    if (results.length > 1 || reconciliations.length > 1 || (results[0]?.usage && reconciliations.length)) throw new Error("Duplicate or incompatible settlement.");
    const result = results[0]; const usage = reconciliations[0]?.usage ?? result?.usage ?? null;
    if (usage) { const cost = calculateAiCost(profile(dispatch.profileId).model, dispatch.startedAt, evalUsageSchema.parse(usage)).providerCostUsd;
      known = known.plus(cost); overrun ||= new Money(cost).gt(dispatch.maximumUsd); }
    else held = held.plus(dispatch.maximumUsd);
    if (dispatch.kind === "capability") {
      template.availability?.push({ profileId: dispatch.profileId, status: result?.capabilityPassed && usage ? "available" : result?.status === "unavailable" ? "unavailable" : "failed",
        checkedAt: dispatch.startedAt, expiresAt: new Date(Date.parse(dispatch.startedAt) + PROVIDER_EVAL_CONTRACT.capabilityLifetimeMs).toISOString(),
        evidenceReference: `run:${plan.runId}:${dispatch.attemptId}`, structuredOutput: result?.capabilityPassed ?? false,
        reasoningEffort: result?.capabilityPassed ?? false, reportedUsage: !!usage,
        reason: result?.capabilityPassed ? "Account accepted the selected model/effort and returned the strict probe with reported usage. This does not prove reasoning quality or account retention settings." : "Capability request failed, was unavailable or lacked authoritative usage/model/schema evidence." });
    } else if (dispatch.fixtureId) {
      const fixture = taxProviderModelEvalFixtures.find(item => item.id === dispatch.fixtureId);
      if (!fixture) throw new Error("Journal fixture is unknown.");
      const evaluation = result?.evaluation;
      if (evaluation?.blocker) bindingBlockers.add(`${fixture.task}:${evaluation.blocker}`);
      template.entries.push({ profileId: dispatch.profileId, fixtureId: dispatch.fixtureId, fixtureVersion: 1, repeat: dispatch.repeat,
        elapsedMs: result?.elapsedMs ?? null, applicationSchemaValid: evaluation?.applicationSchemaValid ?? null,
        output: evaluation?.output ?? null, independentReview: null,
        attempts: [{ profileId: dispatch.profileId, startedAt: dispatch.startedAt, usage }],
        measurement: { runPurpose: plan.purpose === "qualification" ? "qualification" : "smoke", planDigest: providerEvalDigest(plan), corpusDigest: plan.corpusDigest, fixtureDigest: providerEvalFixtureDigest(fixture), bindingVersion: PROVIDER_EVAL_BINDING_VERSION, promptVersion: AI_TASKS[fixture.task].promptVersion,
          schemaVersion: AI_TASKS[fixture.task].schemaVersion, normalizationStatus: evaluation?.normalizationStatus ?? "failed",
          applicationOutput: evaluation?.applicationOutput ?? null, privacyFailure: evaluation?.privacyFailure ?? false,
          responseReference: result?.responseReference ?? null, reportedModel: result?.reportedModel ?? null } });
    }
  }
  return { template, knownProviderCostUsd: known.toFixed(), unknownMaximumUsd: held.toFixed(), dispatchedRequests: dispatches.length,
    bindingBlockers: [...bindingBlockers], overrun, productionPromotion: false as const };
}
export async function executeProviderEval(input: { plan: unknown; approval: unknown; records: EvalJournalRecord[];
  append: (record: EvalJournalRecord) => Promise<void>; transport: ProviderEvalTransport;
  now?: () => string; signal?: AbortSignal; reviewedFixtures?: ProviderEvalFixture[] }) {
  const plan = validatePlan(input.plan); const now = input.now ?? (() => new Date().toISOString());
  let approval = approved(plan, input.approval, now());
  validateProviderEvalJournal(plan, input.records);
  if (plan.purpose === "qualification") {
    if (!input.reviewedFixtures || plan.reviewedCorpusDigest !== providerEvalDigest(input.reviewedFixtures)) throw new Error("Approved reviewed corpus is missing or changed.");
    assertReviewed(input.reviewedFixtures);
  }
  const start = input.records.filter(item => item.type === "start");
  if (start.length > 1 || (start[0] && (start[0].planDigest !== providerEvalDigest(plan) || start[0].approvalDigest !== providerEvalDigest(approval)))) throw new Error("Journal is bound to another plan or approval.");
  if (!start.length && input.records.length) throw new Error("Journal has no run identity.");
  const persist = async (record: EvalJournalRecord) => {
    const length = input.records.length;
    await input.append(record);
    if (input.records.length !== length + 1 || providerEvalDigest(input.records[length]) !== providerEvalDigest(record)) {
      throw new Error("Durable journal append did not preserve the expected record.");
    }
  };
  if (!start.length) await persist({ type: "start", planDigest: providerEvalDigest(plan), approvalDigest: providerEvalDigest(approval) });
  const finish = (stoppedReason: string) => ({ ...summarizeProviderEvalJournal(plan, input.records), stoppedReason });
  for (const profileId of plan.profileIds) {
    const item = profile(profileId);
    const providerFixtureIds: string[] = [];
    for (const id of plan.fixtureIds) {
      const fixture = taxProviderModelEvalFixtures.find(item => item.id === id);
      if (!fixture) throw new Error("Missing frozen fixture.");
      const prepared = prepareProviderEvalCase(fixture);
      if (prepared.kind === "provider") { providerFixtureIds.push(id); continue; }
      for (const repeat of [1, 2, 3]) {
        if (input.signal?.aborted) return finish("cancelled");
        const at = now(); approval = approved(plan, input.approval, at);
        if (!input.records.some(record => record.type === "preflight" && record.profileId === profileId && record.fixtureId === id && record.repeat === repeat)) {
          await persist({ type: "preflight", profileId, fixtureId: id, repeat, reason: prepared.reason, at });
        }
      }
    }
    if (plan.purpose !== "capability" && !providerFixtureIds.length) continue;
    const jobs = [{ fixture: undefined as ProviderEvalFixture | undefined, repeat: 0 }, ...providerFixtureIds.flatMap(id => {
      const fixture = taxProviderModelEvalFixtures.find(item => item.id === id);
      if (!fixture) throw new Error("Missing frozen fixture.");
      return [1, 2, 3].map(repeat => ({ fixture, repeat }));
    })];
    for (const { fixture, repeat } of jobs) {
      const state = summarizeProviderEvalJournal(plan, input.records);
      if (new Money(state.unknownMaximumUsd).gt(0)) return finish("unknown-usage");
      if (state.overrun || new Money(state.knownProviderCostUsd).gt(approval.maximumProviderUsd)) return finish("provider-overrun");
      const attemptId = `${profileId}:${fixture?.id ?? "capability"}:${repeat}`;
      if (input.records.some(record => record.type === "dispatch" && record.attemptId === attemptId)) continue;
      if (input.signal?.aborted) return finish("cancelled");
      const startedAt = now();
      approval = approved(plan, input.approval, startedAt);
      if (fixture) {
        const capability = state.template.availability?.find(evidence => evidence.profileId === profileId && evidence.status === "available");
        if (!capability) break;
        if (Date.parse(startedAt) >= Date.parse(capability.expiresAt) || Date.parse(startedAt) < Date.parse(capability.checkedAt)) return finish("capability-expired");
      }
      const request = requestFor(item, fixture, attemptId);
      const maximumUsd = maximumProviderAttemptUsd(request, startedAt);
      if (state.dispatchedRequests >= approval.maximumRequests) return finish("request-limit");
      if (new Money(state.knownProviderCostUsd).plus(maximumUsd).gt(approval.maximumProviderUsd)) return finish("budget");
      await persist({ type: "dispatch", attemptId, kind: request.kind, profileId,
        fixtureId: fixture?.id ?? null, repeat, startedAt, maximumUsd });
      let result: ProviderEvalTransportResult;
      try { result = await input.transport(request, input.signal); }
      catch { result = { status: "failed", usage: null, elapsedMs: 0, reportedModel: null, responseReference: null, payload: null }; }
      let usage: AiTokenUsage | null = null;
      try { if (result.usage) { usage = evalUsageSchema.parse(result.usage); calculateAiCost(item.model, startedAt, usage); } } catch { usage = null; }
      const withinBudget = !!usage && usage.inputTokens <= request.maxInputTokens && usage.outputTokens <= request.maxOutputTokens;
      const modelMatches = matchesProviderEvalModel(item.model, result.reportedModel);
      const capabilityPassed = !fixture && result.status === "completed" && withinBudget && modelMatches
        && z.strictObject({ probe: z.literal("ok") }).safeParse(result.payload).success;
      const evaluation = fixture && result.status === "completed" && withinBudget && modelMatches ? validateProviderEvalOutput(fixture, result.payload) : null;
      await persist({ type: "result", attemptId, status: result.status, usage,
        elapsedMs: Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0 ? result.elapsedMs : 0,
        reportedModel: modelMatches ? result.reportedModel : null,
        responseReference: result.responseReference ? providerEvalDigest(result.responseReference) : null, capabilityPassed, evaluation });
    }
  }
  const final = summarizeProviderEvalJournal(plan, input.records);
  return finish(new Money(final.unknownMaximumUsd).gt(0) ? "unknown-usage" : final.overrun ? "provider-overrun" : "completed");
}
export function reconcileProviderEvalAttempt(plan: ProviderEvalPlan, records: readonly EvalJournalRecord[], input: {
  attemptId: string; evidenceReference: string; usage: AiTokenUsage; at: string;
}): EvalJournalRecord {
  validatePlan(plan);
  validateProviderEvalJournal(plan, records);
  const dispatch = records.find(item => item.type === "dispatch" && item.attemptId === input.attemptId);
  if (!dispatch || dispatch.type !== "dispatch" || records.some(item => (item.type === "result" && item.attemptId === input.attemptId && item.usage !== null) || (item.type === "reconcile" && item.attemptId === input.attemptId))) throw new Error("Only an unresolved dispatched attempt may be reconciled once.");
  if (!input.evidenceReference.trim() || input.evidenceReference.length > 500 || !Number.isFinite(Date.parse(input.at))) throw new Error("Authoritative reconciliation reference and time are required.");
  const usage = evalUsageSchema.parse(input.usage); calculateAiCost(profile(dispatch.profileId).model, dispatch.startedAt, usage);
  return { type: "reconcile", ...input, usage };
}

const normalized = z.strictObject({ disposition: z.enum(["answer", "abstain"]), fields: z.record(z.string(), z.string()), category: z.string().nullable(),
  sourceIds: z.array(z.string()), engineValues: z.record(z.string(), z.string()), filingReady: z.boolean() });
const evaluationSchema = z.strictObject({ output: normalized.nullable(), applicationOutput: z.json().nullable(), applicationSchemaValid: z.boolean().nullable(),
  normalizationStatus: z.enum(["failed", "bound"]), privacyFailure: z.boolean(), blocker: z.string().nullable() });
const recordSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), planDigest: z.string(), approvalDigest: z.string() }),
  z.strictObject({ type: z.literal("preflight"), profileId: z.string(), fixtureId: z.string(), repeat: z.number().int().min(1).max(3), reason: z.enum(["missing-verified-context", "invalid-verified-context", "cancelled"]), at: instant }),
  z.strictObject({ type: z.literal("dispatch"), attemptId: z.string(), kind: z.enum(["capability", "case"]), profileId: z.string(), fixtureId: z.string().nullable(), repeat: z.number().int().min(0).max(3), startedAt: instant, maximumUsd: usd }),
  z.strictObject({ type: z.literal("result"), attemptId: z.string(), status: z.enum(["completed", "unavailable", "failed", "incomplete"]), usage: evalUsageSchema.nullable(), elapsedMs: z.number().finite().nonnegative(),
    reportedModel: z.string().nullable(), responseReference: z.string().nullable(), capabilityPassed: z.boolean(), evaluation: evaluationSchema.nullable() }),
  z.strictObject({ type: z.literal("reconcile"), attemptId: z.string(), evidenceReference: z.string().trim().min(1).max(500), usage: evalUsageSchema, at: instant }),
]);
export function parseEvalJournalRecord(value: unknown): EvalJournalRecord {
  return recordSchema.parse(value) as EvalJournalRecord;
}
export function validateProviderEvalJournal(plan: ProviderEvalPlan, records: readonly EvalJournalRecord[]) {
  const known = new Set<string>(); const settled = new Set<string>(); const reconciled = new Set<string>(); const preflights = new Set<string>();
  records.forEach((raw, index) => {
    const record = parseEvalJournalRecord(raw);
    if (record.type === "start") {
      if (index !== 0 || record.planDigest !== providerEvalDigest(plan)) throw new Error("Journal run identity is invalid.");
    } else {
      if (records[0]?.type !== "start") throw new Error("Journal has no initial run identity.");
      if (record.type === "preflight") {
        const fixture = taxProviderModelEvalFixtures.find(item => item.id === record.fixtureId);
        const prepared = fixture ? prepareProviderEvalCase(fixture) : null;
        const key = `${record.profileId}:${record.fixtureId}:${record.repeat}`;
        if (!plan.profileIds.includes(record.profileId) || !plan.fixtureIds.includes(record.fixtureId) || prepared?.kind !== "preflight" || prepared.reason !== record.reason || preflights.has(key)) throw new Error("Invalid deterministic preflight record.");
        preflights.add(key);
      } else if (record.type === "dispatch") {
        const fixture = record.fixtureId ? taxProviderModelEvalFixtures.find(item => item.id === record.fixtureId) : undefined;
        if (!plan.profileIds.includes(record.profileId) || (fixture && prepareProviderEvalCase(fixture).kind !== "provider") || (record.kind === "case" && (!fixture || !plan.fixtureIds.includes(fixture.id) || record.repeat === 0))
          || (record.kind === "capability" && (record.fixtureId !== null || record.repeat !== 0))
          || record.attemptId !== `${record.profileId}:${record.fixtureId ?? "capability"}:${record.repeat}` || known.has(record.attemptId)) throw new Error("Journal dispatch does not match the approved plan.");
        if (record.maximumUsd !== maximumProviderAttemptUsd(requestFor(profile(record.profileId), fixture, record.attemptId), record.startedAt)) throw new Error("Journal maximum does not match the priced request.");
        known.add(record.attemptId);
      } else if (!known.has(record.attemptId)) throw new Error("Journal settlement has no prior dispatch.");
      else if (record.type === "result") { if (settled.has(record.attemptId) || reconciled.has(record.attemptId)) throw new Error("Duplicate journal result."); settled.add(record.attemptId); }
      else { if (reconciled.has(record.attemptId)) throw new Error("Duplicate journal reconciliation."); reconciled.add(record.attemptId); }
    }
  });
  summarizeProviderEvalJournal(plan, records);
}

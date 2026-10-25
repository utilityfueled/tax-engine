import "server-only";
import { createHmac } from "node:crypto";
import { AI_PROFILES, AI_TASKS, type AiProfileId, type AiTask } from "@tax-engine/engine/src/ai-task-registry";

export interface AiQualificationEvidence {
  task: AiTask; profileId: AiProfileId; model: string; promptVersion: string; schemaVersion: string;
  reportSha256: string; corpusSha256: string; accountCapabilityReference: string;
  independentReviewer: string; author: string; approvedBy: string; approvalReference: string;
  qualifiedAt: string; expiresAt: string;
  /** This is a human-reviewed measured report, not a model recommendation or generated fixture manifest. */
  measuredGates: { eligibleForPromotionReview: boolean; blockers: readonly string[]; reviewedCases: number; repeatedHeldOut: boolean; januaryPricingIncluded: boolean };
}
export interface AiRolloutState {
  task: AiTask; stage: 0 | 5 | 25 | 100; current: AiQualificationEvidence | null;
  previous: AiQualificationEvidence | null; revision: number; changeReference: string;
}

// No production route has been approved. Adding evidence requires a separate reviewed change.
export const PRODUCTION_AI_ROLLOUTS: readonly AiRolloutState[] = Object.freeze([]);
export function qualifiedAiEvidence(evidence: AiQualificationEvidence | null, task: AiTask, at: string): evidence is AiQualificationEvidence {
  if (!evidence || evidence.task !== task) return false;
  const profile = AI_PROFILES[evidence.profileId];
  const policy = AI_TASKS[task];
  const time = Date.parse(at);
  return !!profile && !!policy && profile.model === evidence.model
    && evidence.promptVersion === policy.promptVersion && evidence.schemaVersion === policy.schemaVersion
    && /^[a-f0-9]{64}$/.test(evidence.reportSha256) && /^[a-f0-9]{64}$/.test(evidence.corpusSha256)
    && !!evidence.accountCapabilityReference.trim() && !!evidence.approvalReference.trim() && !!evidence.approvedBy.trim()
    && !!evidence.independentReviewer.trim() && evidence.independentReviewer !== evidence.author && !!evidence.author.trim()
    && Number.isFinite(time) && Date.parse(evidence.qualifiedAt) <= time && Date.parse(evidence.expiresAt) > time
    && evidence.measuredGates.eligibleForPromotionReview && evidence.measuredGates.blockers.length === 0
    && evidence.measuredGates.reviewedCases >= 200 && evidence.measuredGates.repeatedHeldOut && evidence.measuredGates.januaryPricingIncluded;
}

/** The cohort is stable within an authenticated owner/task and cannot be chosen by request IDs. */
export function selectQualifiedAiRoute(input: {
  task: AiTask; ownerScope: string; cohortSecret: string; optedOut?: boolean; at: string;
  states?: readonly AiRolloutState[];
}) {
  if (input.optedOut) return null;
  if (!input.ownerScope.trim() || input.cohortSecret.length < 32) throw new Error("Private owner scope and cohort secret are required.");
  const state = (input.states ?? PRODUCTION_AI_ROLLOUTS).find(entry => entry.task === input.task);
  if (!state) return null;
  const bucket = createHmac("sha256", input.cohortSecret).update(`${input.ownerScope}\0${input.task}`).digest().readUInt32BE(0) % 100;
  const selected = state.stage > bucket && qualifiedAiEvidence(state.current, input.task, input.at) ? state.current
    : qualifiedAiEvidence(state.previous, input.task, input.at) ? state.previous : null;
  if (!selected) return null;
  return { policy: AI_TASKS[input.task], profile: AI_PROFILES[selected.profileId], reportSha256: selected.reportSha256 };
}

/** Changes are data for a separately authorized deployment; this function performs no activation. */
export function changeAiRollout(state: AiRolloutState, change: {
  stage: 0 | 5 | 25 | 100; expectedRevision: number; reference: string; at: string;
  observation?: { stage: 5 | 25; reportSha256: string; passed: boolean; observedSafetyFailures: number };
}): AiRolloutState {
  if (change.expectedRevision !== state.revision || !change.reference.trim()) throw new Error("Stale or unauthorized AI rollout change.");
  if (change.stage === 0) return { ...state, stage: 0, revision: state.revision + 1, changeReference: change.reference };
  if (!qualifiedAiEvidence(state.current, state.task, change.at)) throw new Error("AI qualification is missing, expired or changed.");
  const next = state.stage === 0 ? 5 : state.stage === 5 ? 25 : state.stage === 25 ? 100 : null;
  if (change.stage !== next) throw new Error("AI rollout must proceed through 5%, 25%, then 100%.");
  if (state.stage > 0 && (!change.observation || change.observation.stage !== state.stage
    || !/^[a-f0-9]{64}$/.test(change.observation.reportSha256) || !change.observation.passed || change.observation.observedSafetyFailures !== 0)) {
    throw new Error("The previous rollout stage requires reviewed passing observations.");
  }
  return { ...state, stage: change.stage, revision: state.revision + 1, changeReference: change.reference };
}

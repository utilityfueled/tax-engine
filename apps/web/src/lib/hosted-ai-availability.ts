import "server-only";
import { AI_PROFILES } from "@tax-engine/engine/src/ai-task-registry";
import { PRODUCTION_AI_ROLLOUTS, qualifiedAiEvidence } from "./ai-rollout";
import { PRODUCTION_WORKSPACE_AI_EXECUTION } from "./production-ai-config";

/** Do not sell extra credits during qualification or a limited rollout. */
export function canPurchaseHostedAiCredits(
  at = new Date().toISOString(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const execution = PRODUCTION_WORKSPACE_AI_EXECUTION;
  const rollout = execution.productionRollout;
  if (execution.mode !== "production" || !rollout || rollout.cohortSecret.length < 32) return false;
  const state = (rollout.states ?? PRODUCTION_AI_ROLLOUTS).find(entry => entry.task === "workspace-summary");
  if (!state || state.stage !== 100 || !qualifiedAiEvidence(state.current, "workspace-summary", at)) return false;
  if (env.MODEL_PROVIDER_BASE_URL?.trim()
    && env.MODEL_PROVIDER_BASE_URL.replace(/\/+$/, "") !== "https://api.openai.com/v1") return false;
  const apiKeys = execution.apiKeys ?? {
    google: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
    openai: env.OPENAI_API_KEY ?? env.MODEL_PROVIDER_API_KEY,
  };
  return Boolean((execution.apiKey ?? apiKeys[AI_PROFILES[state.current.profileId].provider])?.trim());
}

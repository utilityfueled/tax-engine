/** Candidate configuration, not evidence of qualification or account access. */
export type AiTask = "workspace-summary" | "interview-wording" | "unsupported-route"
  | "document-classification" | "income-extraction" | "expense-categorization"
  | "tax-explanation" | "complex-reconciliation";
export type AiProvider = "openai" | "google";
export type AiEffort = "low" | "high";
export type AiProfileId = "luna-high" | "sol-low" | "sol-high" | "gemini-flash-high";

export interface AiTaskProfile {
  id: AiProfileId;
  provider: AiProvider;
  model: string;
  effort: AiEffort;
  qualification: "candidate";
}
export const AI_PROFILES: Readonly<Record<AiProfileId, AiTaskProfile>> = Object.freeze({
  "luna-high": Object.freeze({ id: "luna-high", provider: "openai", model: "gpt-6-luna", effort: "high", qualification: "candidate" }),
  "sol-low": Object.freeze({ id: "sol-low", provider: "openai", model: "gpt-6.1-sol", effort: "low", qualification: "candidate" }),
  "sol-high": Object.freeze({ id: "sol-high", provider: "openai", model: "gpt-6.1-sol", effort: "high", qualification: "candidate" }),
  "gemini-flash-high": Object.freeze({ id: "gemini-flash-high", provider: "google", model: "gemini-3.8-flash", effort: "high", qualification: "candidate" }),
});

export interface AiTaskPolicy {
  task: AiTask;
  profile: AiProfileId;
  promptVersion: string;
  schemaVersion: string;
  maxInputTokens: number;
  /** Includes reasoning tokens, not just visible JSON. */
  maxOutputTokens: number;
  timeoutMs: number;
  execution: "request" | "cancellable-job";
  fallback: "deterministic-or-user";
  maxEscalations: 0 | 1;
  requiresUserConfirmation: boolean;
  requiresVerifiedTaxContext: boolean;
}
function policy(task: AiTask, profile: AiProfileId, maxOutputTokens: number, extra: Partial<AiTaskPolicy> = {}): AiTaskPolicy {
  return Object.freeze({ task, profile, promptVersion: `${task}/1`, schemaVersion: `${task}/1`, maxInputTokens: 24000,
    maxOutputTokens, timeoutMs: 30000, execution: "request", fallback: "deterministic-or-user",
    maxEscalations: 0, requiresUserConfirmation: false, requiresVerifiedTaxContext: false, ...extra });
}
export const AI_TASKS: Readonly<Record<AiTask, AiTaskPolicy>> = Object.freeze({
  "workspace-summary": policy("workspace-summary", "luna-high", 4096, { promptVersion: "workspace-summary/2", schemaVersion: "workspace-summary/2" }),
  "interview-wording": policy("interview-wording", "luna-high", 4096),
  "unsupported-route": policy("unsupported-route", "luna-high", 4096),
  "document-classification": policy("document-classification", "luna-high", 4096, { requiresUserConfirmation: true, maxEscalations: 1 }),
  "income-extraction": policy("income-extraction", "luna-high", 8192, { requiresUserConfirmation: true, maxEscalations: 1 }),
  "expense-categorization": policy("expense-categorization", "luna-high", 8192, { requiresUserConfirmation: true, maxEscalations: 1 }),
  "tax-explanation": policy("tax-explanation", "sol-low", 8192, { requiresVerifiedTaxContext: true, maxEscalations: 1, promptVersion: "tax-explanation/2", schemaVersion: "tax-explanation/2" }),
  "complex-reconciliation": policy("complex-reconciliation", "sol-high", 16384,
    { requiresUserConfirmation: true, requiresVerifiedTaxContext: true, timeoutMs: 120000, execution: "cancellable-job" }),
});

/** No candidate is silently promoted; production stays deterministic until evals pass. */
export function resolveCandidateAiRoute(task: AiTask, options: {
  mode: "production" | "evaluation";
  provider?: AiProvider;
  optedOut?: boolean;
  escalationCount?: number;
  verifiedTaxContext?: boolean;
}): { policy: AiTaskPolicy; profile: AiTaskProfile } | null {
  if (options.optedOut || options.mode !== "evaluation") return null;
  const selected = AI_TASKS[task];
  if (!selected) throw new Error(`Unknown AI task: ${task}`);
  const escalationCount = options.escalationCount ?? 0;
  if (!Number.isSafeInteger(escalationCount) || escalationCount < 0 || escalationCount > 1) throw new Error("At most one AI escalation is allowed.");
  if (task === "complex-reconciliation" && escalationCount !== 1) throw new Error("Complex reconciliation requires an explicit escalation.");
  if (escalationCount && task !== "complex-reconciliation" && !selected.maxEscalations) throw new Error("This task does not permit escalation.");
  if (selected.requiresVerifiedTaxContext && !options.verifiedTaxContext) throw new Error("Verified year-specific specs and audit entries are required.");
  const profile = AI_PROFILES[escalationCount ? "sol-high" : options.provider === "google" ? "gemini-flash-high" : selected.profile];
  return { policy: selected, profile };
}

/** Include identity/privacy scope in any future cache; never share taxpayer results. */
export function aiTaskCacheKeyParts(input: {
  ownerScope: string; contentDigest: string; taxYear: number; ruleVersion: string;
  task: AiTask; profile: AiProfileId;
}): readonly (string | number)[] {
  if (!input.ownerScope || !input.contentDigest || !input.ruleVersion || !Number.isSafeInteger(input.taxYear)) throw new Error("Incomplete AI cache scope.");
  const task = AI_TASKS[input.task];
  const profile = AI_PROFILES[input.profile];
  return Object.freeze([input.ownerScope, input.contentDigest, input.taxYear, input.ruleVersion,
    input.task, profile.provider, profile.model, profile.effort, task.promptVersion, task.schemaVersion]);
}

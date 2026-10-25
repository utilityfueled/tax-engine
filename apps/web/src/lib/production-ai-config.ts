import type { AiTaskExecution } from "./ai-task-adapter";

/**
 * Shared by the actual workspace handler and the credit-sales readiness check.
 * There is no configured live executor rollout. A reviewed release must supply
 * one here before either production execution or extra-credit sales can start.
 * Request bodies and environment enable flags cannot populate this object.
 */
export const PRODUCTION_WORKSPACE_AI_EXECUTION: Readonly<AiTaskExecution> = Object.freeze({ mode: "production" });

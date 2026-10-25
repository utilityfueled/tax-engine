import "server-only";
import { AI_APPLICATION_INSTRUCTIONS, applicationSchemaForTask, parseApplicationTaskOutput,
  unsupportedRouteMessage, type ApplicationGroundingContext } from "@tax-engine/engine/src/ai-application-bindings";
import { executeAiTask, type AiTaskExecution } from "./ai-task-adapter";

/** Trusted server entry point. HTTP bodies cannot populate execution, verified context or rollout. */
export async function executeEvidenceAssistance(request: ApplicationGroundingContext & {
  task: "unsupported-route" | "complex-reconciliation"; signal?: AbortSignal; optedOut?: boolean;
}, execution: AiTaskExecution = { mode: "production" }) {
  if (request.optedOut || (execution.mode === "production" && !execution.productionRollout)) return null;
  if (request.task === "complex-reconciliation") {
    if (execution.escalationCount !== 1) throw new Error("Reconciliation requires one explicit escalation.");
    if (!request.signal) throw new Error("Reconciliation requires a cancellable request.");
  }
  const result = await executeAiTask({ task: request.task, schema: applicationSchemaForTask(request.task),
    redactedText: JSON.stringify({ sources: request.sources, requestedFields: request.requestedFields ?? [] }),
    instructions: AI_APPLICATION_INSTRUCTIONS, taxContext: request.taxContext, signal: request.signal,
    optedOut: request.optedOut, validateGrounding: value => { parseApplicationTaskOutput(request.task, value, request); },
  }, execution);
  if (!result?.accepted) return result;
  const value = parseApplicationTaskOutput(request.task, result.value, request);
  return { ...result, value, ...(request.task === "unsupported-route" ? { message: unsupportedRouteMessage(value) } : {}) };
}

import "server-only";
import type { AiTask } from "@tax-engine/engine/src/ai-task-registry";
import { executeAiTask, type AiTaskExecution } from "./ai-task-adapter";
import { AI_APPLICATION_INSTRUCTIONS, applicationSchemaForTask, parseApplicationTaskOutput,
  validateApplicationSuggestions } from "@tax-engine/engine/src/ai-application-bindings";

export type DocumentAiTask = Extract<AiTask, "document-classification" | "income-extraction" | "expense-categorization" | "workspace-summary" | "interview-wording">;
export type DocumentAiExecutor = (task: DocumentAiTask, prompt: string, redactedText: string) => Promise<unknown | null>;

/** Ground amounts, dates and descriptions in exact extracted text before normalization. */
export const validateDocumentSuggestions = validateApplicationSuggestions;

/** Evaluation is injected by a trusted harness; application callers default to gated production. */
export function createDocumentAiExecutor(execution: AiTaskExecution = { mode: "production" }): DocumentAiExecutor {
  return async (task, prompt, redactedText) => {
    const context = { sources: [{ id: "document:1", text: redactedText }] };
    const result = await executeAiTask({ task, redactedText: JSON.stringify(context), schema: applicationSchemaForTask(task),
      instructions: `${prompt}\n${AI_APPLICATION_INSTRUCTIONS}`,
      validateGrounding(value) {
        parseApplicationTaskOutput(task, value, context);
      },
    }, execution);
    if (!result?.accepted || result.value.disposition === "abstain") return null;
    return parseApplicationTaskOutput(task, result.value, context);
  };
}

import { z } from "zod";
import { AI_TASKS, type AiTask } from "../../packages/engine/src/ai-task-registry";
import { documentClassificationSchema, documentExpenseSchema, documentIncomeSchema,
  documentSummarySchema, workspaceHelpSchema, workspaceSummarySchema } from "../../packages/engine/src/ai-application-schemas";
import type { ProviderEvalFixture } from "../../packages/engine/src/provider-eval-fixtures";
import { containsUnsafeDirectIdentifier } from "../../apps/web/src/lib/provider-request-privacy";
import { PROVIDER_EVAL_CONTRACT } from "./provider-eval-contract";

const pair = z.strictObject({ name: z.string().min(1).max(200), value: z.string().max(2000) });
export const evaluationWireSchema = z.strictObject({
  applicationOutput: z.string().max(100000), disposition: z.enum(["answer", "abstain"]),
  fields: z.array(pair).max(100), category: z.string().max(200).nullable(), sourceIds: z.array(z.string().max(200)).max(30),
  engineValues: z.array(pair).max(100), filingReady: z.boolean(),
});
const schemas: Partial<Record<AiTask, z.ZodType>> = {
  "workspace-summary": workspaceSummarySchema, "tax-explanation": workspaceHelpSchema,
  "document-classification": documentClassificationSchema, "income-extraction": documentIncomeSchema,
  "expense-categorization": documentExpenseSchema, "interview-wording": documentSummarySchema,
};
export const providerEvalBindingManifest: readonly { task: AiTask; promptVersion: string; schemaVersion: string;
  bindingVersion: string; schema: Record<string, unknown> | null; normalizationStatus: "bound" | "unsupported" }[] = Object.entries(AI_TASKS).map(([task, policy]) => ({
  task: task as AiTask, promptVersion: policy.promptVersion, schemaVersion: policy.schemaVersion, bindingVersion: "actual-schema-unbound/1",
  schema: schemas[task as AiTask] ? z.toJSONSchema(schemas[task as AiTask] as z.ZodType) : null,
  normalizationStatus: "unsupported" as const,
}));
/** Only input and requested field names/types are visible to the model, never golden values or review criteria. */
export function evaluationRequestContent(fixture: ProviderEvalFixture) {
  const binding = providerEvalBindingManifest.find(item => item.task === fixture.task);
  if (!binding) throw new Error("Unknown evaluation task.");
  return { input: fixture.input, sourceIds: fixture.sourceIds, task: fixture.task,
    promptVersion: binding.promptVersion, schemaVersion: binding.schemaVersion,
    requestedFields: Object.entries(fixture.expected.fields).map(([name, field]) => ({ name, kind: field.kind })),
    applicationSchema: binding.schema,
    instruction: PROVIDER_EVAL_CONTRACT.caseInstruction };
}
export function validateProviderEvalOutput(task: AiTask, payload: unknown) {
  const parsed = evaluationWireSchema.safeParse(payload);
  if (!parsed.success) return { output: null, applicationOutput: null, applicationSchemaValid: false,
    normalizationStatus: "failed" as const, privacyFailure: false, blocker: "evaluation-wire-schema" };
  const value = parsed.data;
  if (containsUnsafeDirectIdentifier(JSON.stringify(value))) return { output: null, applicationOutput: null,
    applicationSchemaValid: false, normalizationStatus: "failed" as const, privacyFailure: true, blocker: "output-privacy" };
  if (new Set(value.fields.map(item => item.name)).size !== value.fields.length
    || new Set(value.engineValues.map(item => item.name)).size !== value.engineValues.length) {
    return { output: null, applicationOutput: null, applicationSchemaValid: false,
      normalizationStatus: "failed" as const, privacyFailure: false, blocker: "duplicate-normalized-field" };
  }
  let applicationOutput: unknown;
  try { applicationOutput = JSON.parse(value.applicationOutput); } catch { applicationOutput = null; }
  const schema = schemas[task];
  const applicationSchemaValid = schema ? schema.safeParse(applicationOutput).success : null;
  // Existing application contracts do not yet expose all source fields/disposition/citations.
  // Retain observations for diagnosis, but do not assert their correspondence to application output.
  return { output: { disposition: value.disposition, fields: Object.fromEntries(value.fields.map(item => [item.name, item.value])),
    category: value.category, sourceIds: value.sourceIds, engineValues: Object.fromEntries(value.engineValues.map(item => [item.name, item.value])), filingReady: value.filingReady },
    applicationOutput: applicationSchemaValid ? z.json().parse(applicationOutput) : null, applicationSchemaValid,
    normalizationStatus: "unsupported" as const, privacyFailure: false,
    blocker: schema ? "application-normalization-not-bound" : "application-task-contract-missing" };
}

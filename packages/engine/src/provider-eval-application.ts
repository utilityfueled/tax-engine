import { z } from "zod";
import { AI_TASKS, type AiTask } from "./ai-task-registry";
import { AI_APPLICATION_BINDING_VERSION, AI_APPLICATION_INSTRUCTIONS, applicationSchemaForTask,
  normalizeApplicationTaskOutput, parseApplicationTaskOutput, validateApplicationTaxContext, type ApplicationGroundingContext } from "./ai-application-bindings";
import type { ProviderEvalFixture } from "./provider-eval-fixtures";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";
export const PROVIDER_EVAL_BINDING_VERSION = `${AI_APPLICATION_BINDING_VERSION}/evaluation-2`;
export const providerEvalBindingManifest = Object.entries(AI_TASKS).map(([task, policy]) => ({
  task: task as AiTask, promptVersion: policy.promptVersion, schemaVersion: policy.schemaVersion,
  bindingVersion: PROVIDER_EVAL_BINDING_VERSION, schema: z.toJSONSchema(applicationSchemaForTask(task as AiTask)),
  normalizationStatus: "bound" as const,
}));
export type EvalPreflightReason = "missing-verified-context" | "invalid-verified-context" | "cancelled";
export function prepareProviderEvalCase(fixture: ProviderEvalFixture):
  { kind: "provider"; context: ApplicationGroundingContext } | { kind: "preflight"; reason: EvalPreflightReason } {
  if (fixture.requestContext?.cancelled) return { kind: "preflight", reason: "cancelled" };
  const taxContext = fixture.requestContext?.taxContext ?? undefined;
  if (AI_TASKS[fixture.task].requiresVerifiedTaxContext) {
    if (!taxContext) return { kind: "preflight", reason: "missing-verified-context" };
    try {
      if (taxContext.taxYear !== fixture.taxYear || taxContext.ruleVersion !== fixture.ruleVersion || !validateApplicationTaxContext(taxContext)) throw new Error("Stale context.");
    } catch { return { kind: "preflight", reason: "invalid-verified-context" }; }
  }
  if (fixture.sourceIds.length !== 1) throw new Error("This frozen source pack requires one explicit source packet identity.");
  return { kind: "provider", context: { sources: [{ id: fixture.sourceIds[0], text: fixture.input }],
    requestedFields: Object.entries(fixture.expected.fields).map(([name, field]) => ({ name, kind: field.kind })),
    ...(taxContext ? { taxContext } : {}) } };
}
/** Golden values, expected dispositions and review criteria are never model input. */
export function evaluationRequestContent(fixture: ProviderEvalFixture) {
  const prepared = prepareProviderEvalCase(fixture);
  if (prepared.kind !== "provider") throw new Error(`Evaluation preflight: ${prepared.reason}.`);
  const policy = AI_TASKS[fixture.task];
  return { task: fixture.task, promptVersion: policy.promptVersion, schemaVersion: policy.schemaVersion,
    instruction: AI_APPLICATION_INSTRUCTIONS, context: prepared.context,
    requestedAuditIds: Object.keys(fixture.expected.engineValues) };
}
export function validateProviderEvalOutput(fixture: ProviderEvalFixture, payload: unknown) {
  const failed = (blocker: string, privacyFailure = false) => ({ output: null, applicationOutput: null,
    applicationSchemaValid: false, normalizationStatus: "failed" as const, privacyFailure, blocker });
  // Fixed opaque fixture references are not person-name slugs. Inspect all other
  // text, including invented references, and retain the untouched actual payload.
  const knownIds = [...fixture.sourceIds, ...(fixture.requestContext?.taxContext?.excerpts.map(item => item.id) ?? []),
    ...(fixture.requestContext?.taxContext?.auditEntries.map(item => item.id) ?? [])].sort((a, b) => b.length - a.length);
  const inspect = (value: unknown): unknown => typeof value === "string" ? knownIds.reduce((text, id) => text.replaceAll(id, "[source-reference]"), value)
    : Array.isArray(value) ? value.map(inspect) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inspect(item)])) : value;
  if (containsUnsafeDirectIdentifier(inspect(payload))) return failed("output-privacy", true);
  const parsed = applicationSchemaForTask(fixture.task).safeParse(payload);
  if (!parsed.success) return failed("application-schema");
  const applicationOutput = z.json().parse(parsed.data);
  const prepared = prepareProviderEvalCase(fixture);
  if (prepared.kind !== "provider") return { ...failed(prepared.reason), applicationSchemaValid: true, applicationOutput };
  try {
    const accepted = parseApplicationTaskOutput(fixture.task, parsed.data, prepared.context);
    return { output: normalizeApplicationTaskOutput(fixture.task, accepted), applicationOutput,
      applicationSchemaValid: true, normalizationStatus: "bound" as const, privacyFailure: false, blocker: null };
  } catch {
    return { ...failed("application-grounding"), applicationSchemaValid: true, applicationOutput,
      output: normalizeApplicationTaskOutput(fixture.task, parsed.data) };
  }
}

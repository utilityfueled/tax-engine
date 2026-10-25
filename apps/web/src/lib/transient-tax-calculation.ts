import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { TaxYearInputSchema } from "@/models/inputs";
import { redactProviderPayload } from "@tax-engine/engine/src/provider-payload-redactor";
import { collectTransientTaxIdentifiers } from "./transient-tax-identifiers";
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from "./ai-tax-context";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";
import type { ProviderWorkspaceRequest } from "./provider-workspace-request";

export const transientTaxCalculationShape = z.strictObject({
  version: z.literal(1), confirmed: z.literal(true),
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  workspaceRevision: z.string().min(1).max(128), taxYear: z.number().int(),
  taxInput: z.unknown().refine(value => value !== undefined), providerRequest: z.unknown(),
});
export type TransientTaxCalculation = z.infer<typeof transientTaxCalculationShape>;
function opaqueId(scope: unknown) { return createHash("sha256").update(JSON.stringify(scope)).digest("hex"); }

/** No stored workspace or client audit is read; the receipt lives only in this request. */
export function prepareTransientTaxCalculation(envelope: TransientTaxCalculation, request: ProviderWorkspaceRequest, ownerScope: string) {
  if (request.task !== "workspace-help" || request.workspace.id !== envelope.workspaceId
    || request.workspace.updatedAt !== envelope.workspaceRevision || request.workspace.returnSummary.targetTaxYear !== envelope.taxYear) {
    throw new Error("Calculation scope mismatch.");
  }
  const taxInput = TaxYearInputSchema.parse(envelope.taxInput);
  if (taxInput.taxpayer.taxYear !== envelope.taxYear) throw new Error("Calculation year mismatch.");
  const scope = { ownerScope, workspaceId: envelope.workspaceId, workspaceRevision: envelope.workspaceRevision };
  const audit = calculateVerifiedAiAudit(scope, taxInput);
  const resolved = resolveServerAiTaxContext({ ...scope, taxYear: envelope.taxYear, audit });
  if (resolved.status !== "available") throw new Error("Matching calculation sources are unavailable.");
  // Project only fields consumed by the explanation. Uploaded documents, browser
  // previews, arbitrary properties and alleged audits cannot cross this boundary.
  // Only free text is redacted. A short source ID/name cannot corrupt structural
  // status values or rename the logical accounting reservation on a later retry.
  const directIdentifiers = collectTransientTaxIdentifiers(taxInput);
  const redacted = redactProviderPayload({ question: request.question,
    prompts: request.workspace.seededReturn.interviewQuestions.map(({ prompt }) => prompt),
    routes: request.unsupportedRoutes.map(({ title, description, reasons }) => ({ title, description, reasons })),
  }, { directIdentifiers });
  if (containsUnsafeDirectIdentifier(redacted.payload)) throw new Error("Direct identifiers remain in provider text.");
  const workspace: ProviderWorkspaceRequest["workspace"] = {
    id: opaqueId([ownerScope, envelope.workspaceId]), updatedAt: opaqueId([ownerScope, envelope.workspaceRevision]), storageMode: request.workspace.storageMode,
    summary: { totalDocuments: request.workspace.summary.totalDocuments },
    returnSummary: { status: request.workspace.returnSummary.status === "ready-to-recompute" ? "ready-to-recompute" : "needs-review", targetTaxYear: envelope.taxYear },
    seededReturn: { interviewQuestions: request.workspace.seededReturn.interviewQuestions.map(({ status }, index) => ({
      status: status === "pending" ? "pending" : "answered", prompt: redacted.payload.prompts[index],
    })) },
  };
  const providerRequest: ProviderWorkspaceRequest = {
    task: "workspace-help", requestId: `calculation:${opaqueId([ownerScope, request.requestId])}`,
    requestedAt: z.iso.datetime().parse(request.requestedAt), workspace,
    redactions: redacted.redactions, replacementCount: redacted.replacementCount, question: redacted.payload.question,
    unsupportedRoutes: redacted.payload.routes.map((route, index) => ({ ...route, id: `route:${index}` })),
  };
  const calculationDigest = createHash("sha256").update(JSON.stringify({
    ...scope, taxYear: envelope.taxYear, ruleVersion: audit.ruleVersion, taxInput,
  })).digest("hex");
  return { providerRequest, taxContext: resolved.context, calculationDigest,
    assertResponsePrivacy(text: string) {
      if (redactProviderPayload({ text }, { directIdentifiers }).replacementCount > 0) throw new Error("Private source identity in generated answer.");
    },
  };
}

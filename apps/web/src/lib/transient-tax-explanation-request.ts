import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import type { TaxYearInput } from "@/models/inputs";
import { collectProviderDirectIdentifiersFromTaxInput } from "@tax-engine/engine/src/provider-direct-identifiers";
import { buildLocalProviderWorkspaceResponse } from "./provider-workspace-local";
import { buildProviderWorkspaceRequest, ProviderWorkspaceRequestError,
  type ProviderWorkspaceErrorResponse, type ProviderWorkspaceResponse, type RequestProviderWorkspaceOptions } from "./provider-workspace-request";
import { readWorkspaceAiOptOut } from "./workspace-ai-preferences";

/** Explicitly confirmed facts go only to this same-origin private calculation route. */
export async function requestTaxCalculationExplanation(workspace: ReturnWorkspaceRecord, question: string,
  taxInput: TaxYearInput, options: Omit<RequestProviderWorkspaceOptions, "endpoint"> & { confirmed: true }) {
  const request = buildProviderWorkspaceRequest(workspace, { ...options, task: "workspace-help", question,
    directIdentifiers: [...(options.directIdentifiers ?? []), ...collectProviderDirectIdentifiersFromTaxInput(taxInput)],
    optedOut: options.optedOut === true || readWorkspaceAiOptOut(workspace.id) });
  if (request.optedOut) return { request, response: buildLocalProviderWorkspaceResponse(request) };
  const noDocumentYear = workspace.returnSummary.targetTaxYear === null && workspace.documents.length === 0;
  if (options.confirmed !== true || (!noDocumentYear && taxInput.taxpayer.taxYear !== workspace.returnSummary.targetTaxYear)) {
    throw new Error("Confirm the complete taxpayer facts and matching return year first.");
  }
  request.workspace.returnSummary.targetTaxYear = taxInput.taxpayer.taxYear;
  // This ID is opaque and does not embed a name or private workspace label.
  request.requestId = `calculation-explanation:${crypto.randomUUID()}`;
  // Scope uses the actual private workspace identity; server projection/redaction
  // removes it from provider prompts. No full facts are added to the AI packet.
  request.workspace.id = workspace.id;
  const response = await (options.fetchFn ?? fetch)("/api/workspace/tax-explanation", {
    method: "POST", headers: { "content-type": "application/json" }, signal: options.signal,
    body: JSON.stringify({ version: 1, confirmed: true, workspaceId: workspace.id,
      workspaceRevision: workspace.updatedAt, taxYear: taxInput.taxpayer.taxYear, taxInput, providerRequest: request }),
  });
  if (!response.ok) {
    let details: ProviderWorkspaceErrorResponse | undefined;
    try { details = await response.json() as ProviderWorkspaceErrorResponse; } catch { details = undefined; }
    throw new ProviderWorkspaceRequestError(response.status, details);
  }
  return { request, response: await response.json() as ProviderWorkspaceResponse };
}

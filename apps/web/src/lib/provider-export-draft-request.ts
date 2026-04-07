import type {
  ProviderDirectIdentifier,
  ProviderFacingExportDraft,
  ProviderFacingPayloadRedaction,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import { buildProviderFacingExportDraftPayload } from "@tax-engine/engine/src/provider-facing-export-draft-payload";
import { collectProviderDirectIdentifiersFromWorkspace } from "@tax-engine/engine/src/provider-direct-identifiers";

export interface ProviderExportDraftRequest {
  task: "export-draft";
  requestId: string;
  requestedAt: string;
  exportDraft: ProviderFacingExportDraft;
  redactions: ProviderFacingPayloadRedaction[];
  replacementCount: number;
}

export interface ProviderExportDraftResponse {
  requestId: string;
  provider: "mock-local";
  summary: string;
  previewIncluded: boolean;
  remainingChecklistCount: number;
  redactionCount: number;
}

export interface BuildProviderExportDraftRequestOptions {
  directIdentifiers?: ProviderDirectIdentifier[];
  now?: string;
}

export interface RequestProviderExportDraftOptions
  extends BuildProviderExportDraftRequestOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
}

export function buildProviderExportDraftRequest(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderExportDraftRequestOptions = {}
): ProviderExportDraftRequest {
  const directIdentifiers = [
    ...collectProviderDirectIdentifiersFromWorkspace(workspace),
    ...(options.directIdentifiers ?? [])
  ];
  const payload = buildProviderFacingExportDraftPayload(workspace, {
    directIdentifiers
  });
  const requestedAt = options.now ?? new Date().toISOString();

  return {
    task: "export-draft",
    requestId: `provider-export-draft:${payload.exportDraft.workspaceId}:${requestedAt}`,
    requestedAt,
    exportDraft: payload.exportDraft,
    redactions: payload.redactions,
    replacementCount: payload.replacementCount
  };
}

export async function requestProviderExportDraft(
  workspace: ReturnWorkspaceRecord,
  options: RequestProviderExportDraftOptions = {}
) {
  const request = buildProviderExportDraftRequest(workspace, options);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.endpoint ?? "/api/provider/export-draft", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Provider export draft request failed with status ${response.status}.`);
  }

  return {
    request,
    response: await response.json() as ProviderExportDraftResponse
  };
}

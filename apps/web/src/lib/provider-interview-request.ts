import type {
  ProviderDirectIdentifier,
  ProviderFacingInterviewRequest,
  ProviderFacingPayloadRedaction,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import { buildProviderFacingInterviewPayload } from "@tax-engine/engine/src/provider-facing-interview-payload";
import { collectProviderDirectIdentifiersFromWorkspace } from "@tax-engine/engine/src/provider-direct-identifiers";

export interface ProviderInterviewAssistRequest {
  task: "interview-assist";
  requestId: string;
  requestedAt: string;
  interview: ProviderFacingInterviewRequest;
  redactions: ProviderFacingPayloadRedaction[];
  replacementCount: number;
}

export interface ProviderInterviewAssistResponse {
  requestId: string;
  provider: "mock-local";
  recommendedNextQuestionId: string | null;
  pendingQuestionCount: number;
  summary: string;
  redactionCount: number;
}

export interface BuildProviderInterviewAssistRequestOptions {
  directIdentifiers?: ProviderDirectIdentifier[];
  now?: string;
}

export interface RequestInterviewAssistOptions extends BuildProviderInterviewAssistRequestOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
}

export function buildProviderInterviewAssistRequest(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderInterviewAssistRequestOptions = {}
): ProviderInterviewAssistRequest {
  const directIdentifiers = [
    ...collectProviderDirectIdentifiersFromWorkspace(workspace),
    ...(options.directIdentifiers ?? [])
  ];
  const payload = buildProviderFacingInterviewPayload(workspace, {
    directIdentifiers
  });
  const requestedAt = options.now ?? new Date().toISOString();

  return {
    task: "interview-assist",
    requestId: `provider-interview:${payload.interview.workspaceId}:${requestedAt}`,
    requestedAt,
    interview: payload.interview,
    redactions: payload.redactions,
    replacementCount: payload.replacementCount
  };
}

export async function requestInterviewAssist(
  workspace: ReturnWorkspaceRecord,
  options: RequestInterviewAssistOptions = {}
) {
  const request = buildProviderInterviewAssistRequest(workspace, options);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.endpoint ?? "/api/provider/interview", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Provider interview request failed with status ${response.status}.`);
  }

  return {
    request,
    response: await response.json() as ProviderInterviewAssistResponse
  };
}

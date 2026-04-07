import type {
  ProviderDirectIdentifier,
  ProviderFacingPayloadRedaction,
  ReturnWorkspaceRecord,
  WorkspaceDocumentRecord,
  WorkspaceUnsupportedRoute
} from "@tax-engine/contracts";
import { buildProviderFacingWorkspacePayload } from "@tax-engine/engine/src/provider-facing-workspace-payload";
import { collectProviderDirectIdentifiersFromWorkspace } from "@tax-engine/engine/src/provider-direct-identifiers";

export interface ProviderWorkspaceRequest {
  task: "workspace-summary" | "workspace-help";
  requestId: string;
  requestedAt: string;
  workspace: ReturnWorkspaceRecord;
  unsupportedRoutes: WorkspaceUnsupportedRoute[];
  redactions: ProviderFacingPayloadRedaction[];
  replacementCount: number;
  question?: string;
  assistantContext?: {
    mode: "workspace" | "guided";
    currentSectionId?: string | null;
    currentSectionLabel?: string | null;
    selectedDocuments?: Array<Pick<
      WorkspaceDocumentRecord,
      "id" | "name" | "kind" | "coverage" | "label" | "notes" | "matchedFixtureId" | "seededFactIds" | "detectedFacts"
    >>;
    conversation?: Array<{
      role: "user" | "assistant";
      text: string;
    }>;
  };
}

export interface ProviderUsageStats {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

export interface ProviderWorkspaceBudgetSnapshot {
  ownerId: string;
  cycleKey: string;
  includedBudgetCents: number;
  includedUsedCents: number;
  includedRemainingCents: number;
  purchasedBudgetCents: number;
  purchasedUsedCents: number;
  purchasedRemainingCents: number;
  totalRemainingCents: number;
}

export interface ProviderWorkspaceResponse {
  task?: "workspace-summary" | "workspace-help";
  requestId: string;
  provider: "mock-local" | "openai-responses" | "gemini";
  modelId?: string | null;
  summary?: string;
  answer?: string;
  totalDocuments: number;
  pendingQuestionCount: number;
  readyForRecompute: boolean;
  redactionCount: number;
  usage?: ProviderUsageStats;
  budget?: ProviderWorkspaceBudgetSnapshot;
}

export interface ProviderWorkspaceErrorResponse {
  error: string;
  code?: string;
  signInUrl?: string;
  billingUrl?: string;
  budget?: ProviderWorkspaceBudgetSnapshot;
}

export class ProviderWorkspaceRequestError extends Error {
  status: number;
  code: string | null;
  signInUrl: string | null;
  billingUrl: string | null;
  budget: ProviderWorkspaceBudgetSnapshot | null;

  constructor(
    status: number,
    details: ProviderWorkspaceErrorResponse = { error: "Provider workspace request failed." }
  ) {
    super(details.error || `Provider workspace request failed with status ${status}.`);
    this.name = "ProviderWorkspaceRequestError";
    this.status = status;
    this.code = typeof details.code === "string" ? details.code : null;
    this.signInUrl = typeof details.signInUrl === "string" ? details.signInUrl : null;
    this.billingUrl = typeof details.billingUrl === "string" ? details.billingUrl : null;
    this.budget = details.budget ?? null;
  }
}

export interface BuildProviderWorkspaceRequestOptions {
  directIdentifiers?: ProviderDirectIdentifier[];
  now?: string;
  task?: "workspace-summary" | "workspace-help";
  question?: string;
  workspaceStorageModeOverride?: ReturnWorkspaceRecord["storageMode"];
  assistantContext?: ProviderWorkspaceRequest["assistantContext"];
  selectedDocumentIds?: string[];
}

export interface RequestProviderWorkspaceOptions extends BuildProviderWorkspaceRequestOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
}

function adaptUnsupportedRoutesForProviderRequest(
  routes: WorkspaceUnsupportedRoute[]
): WorkspaceUnsupportedRoute[] {
  return routes.map((route) => (
    route.id === "partner-review-later"
      ? {
          ...route,
          title: "Consider outside review",
          description:
            "Download a summary you can share with a tax professional or other advisor you engage separately. This app does not contact, assign, or engage a reviewer for you."
        }
      : route
  ));
}

export function buildProviderWorkspaceRequest(
  workspace: ReturnWorkspaceRecord,
  options: BuildProviderWorkspaceRequestOptions = {}
): ProviderWorkspaceRequest {
  const requestWorkspace = options.workspaceStorageModeOverride
    ? {
        ...workspace,
        storageMode: options.workspaceStorageModeOverride
      }
    : workspace;
  const directIdentifiers = [
    ...collectProviderDirectIdentifiersFromWorkspace(requestWorkspace),
    ...(options.directIdentifiers ?? [])
  ];
  const payload = buildProviderFacingWorkspacePayload(requestWorkspace, {
    directIdentifiers
  });
  const requestedAt = options.now ?? new Date().toISOString();
  const selectedDocumentIdSet = new Set(options.selectedDocumentIds ?? []);
  const selectedDocuments = selectedDocumentIdSet.size > 0
    ? requestWorkspace.documents.flatMap((document, index) => (
        selectedDocumentIdSet.has(document.id) && payload.workspace.documents[index]
          ? [payload.workspace.documents[index]]
          : []
      ))
    : [];
  const assistantContext = options.assistantContext
    ? {
        ...options.assistantContext,
        ...(selectedDocuments.length > 0 ? { selectedDocuments } : {})
      }
    : selectedDocuments.length > 0
      ? {
          mode: "workspace" as const,
          selectedDocuments
        }
      : undefined;

  return {
    task: options.task ?? "workspace-summary",
    requestId: `provider-workspace:${payload.workspace.id}:${requestedAt}`,
    requestedAt,
    workspace: payload.workspace,
    unsupportedRoutes: adaptUnsupportedRoutesForProviderRequest(payload.unsupportedRoutes),
    redactions: payload.redactions,
    replacementCount: payload.replacementCount,
    ...(options.question ? { question: options.question } : {}),
    ...(assistantContext ? { assistantContext } : {})
  };
}

export async function requestProviderWorkspace(
  workspace: ReturnWorkspaceRecord,
  options: RequestProviderWorkspaceOptions = {}
) {
  const request = buildProviderWorkspaceRequest(workspace, options);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.endpoint ?? "/api/provider/workspace", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    let details: ProviderWorkspaceErrorResponse | undefined;

    try {
      details = await response.json() as ProviderWorkspaceErrorResponse;
    } catch {
      details = undefined;
    }

    throw new ProviderWorkspaceRequestError(response.status, details);
  }

  return {
    request,
    response: await response.json() as ProviderWorkspaceResponse
  };
}

export async function requestProviderWorkspaceHelp(
  workspace: ReturnWorkspaceRecord,
  question: string,
  options: RequestProviderWorkspaceOptions & {
    assistantContext: NonNullable<ProviderWorkspaceRequest["assistantContext"]>;
  }
) {
  return requestProviderWorkspace(workspace, {
    ...options,
    task: "workspace-help",
    question,
    assistantContext: options.assistantContext
  });
}

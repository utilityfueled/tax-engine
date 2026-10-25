import type { ProviderWorkspaceRequest, ProviderWorkspaceResponse } from "./provider-workspace-request";

export function buildLocalProviderWorkspaceResponse(request: ProviderWorkspaceRequest): ProviderWorkspaceResponse {
  const pendingQuestionCount = request.workspace.seededReturn.interviewQuestions.filter(question => question.status === "pending").length;
  const readyForRecompute = request.workspace.returnSummary.status === "ready-to-recompute";
  const route = request.unsupportedRoutes[0];
  const summary = route
    ? `Workspace has ${request.unsupportedRoutes.length} active unsupported route(s). Start with ${route.title}. Primary blocker: ${route.reasons[0] ?? route.description}`
    : readyForRecompute ? `Workspace is ready for deterministic recompute across ${request.workspace.summary.totalDocuments} document(s).`
      : `Workspace still needs ${pendingQuestionCount} interview confirmation(s) before deterministic recompute can run.`;
  return { task: request.task, requestId: request.requestId, provider: "mock-local", modelId: null,
    ...(request.task === "workspace-summary" ? { summary } : {
      answer: `${summary} Review the highlighted facts and year-specific calculation details. AI explanations are unavailable until their sources and model route are qualified.`,
    }),
    totalDocuments: request.workspace.summary.totalDocuments, pendingQuestionCount, readyForRecompute,
    redactionCount: request.redactions.length };
}


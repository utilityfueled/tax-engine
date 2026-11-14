export const hostedDocumentAnalysisOwnerHeader = "X-Tax-Engine-Workspace-Owner";

export const hostedDocumentAnalysisOwnerRequired = "Reopen this hosted return before reviewing documents.";

export function hostedWorkspaceOwnerScopeKey(ownerId: string): string {
  return `hosted-owner:${ownerId.trim()}`;
}

export function hostedGuidedDraftId(ownerScopeKey: string, workspaceId: string, revision: string) {
  return { storageKey: `tax-engine.hosted-guided-draft.v1:${JSON.stringify([ownerScopeKey, workspaceId, revision])}` };
}

export function hostedGuidedModeKey(ownerScopeKey: string, workspaceId: string) {
  return `tax-engine.hosted-guided-mode.v1:${JSON.stringify([ownerScopeKey, workspaceId])}`;
}

export function hostedDocumentCacheId(ownerScopeKey: string, workspaceId: string): string {
  return `tax-engine.hosted-document-cache.v1:${JSON.stringify([ownerScopeKey, workspaceId])}`;
}

export function advanceHostedGuidedDraft(storage: Storage, ownerScopeKey: string, workspaceId: string,
  priorRevision: string, nextRevision: string) {
  if (priorRevision === nextRevision) return;
  const { storageKey: previous } = hostedGuidedDraftId(ownerScopeKey, workspaceId, priorRevision);
  const { storageKey: next } = hostedGuidedDraftId(ownerScopeKey, workspaceId, nextRevision);
  const draft = storage.getItem(previous);
  if (draft === null || storage.getItem(next) !== null) return;
  storage.setItem(next, draft);
  // Keep the previous draft if copying fails or the new draft already exists.
  storage.removeItem(previous);
}

export function clearHostedWorkspaceBrowserState(storage: Storage, ownerScopeKey: string, workspaceId: string,
  revision: string | null) {
  if (revision === null) return;
  storage.removeItem(hostedGuidedDraftId(ownerScopeKey, workspaceId, revision).storageKey);
}

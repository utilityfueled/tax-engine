const PREFIX = "tax-engine:workspace-ai:v1:";
const unsavedLocalOnly = new Set<string>();
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
export function workspaceAiPreferenceId(workspaceId: string, ownerScopeKey?: string | null): string | null {
  if (ownerScopeKey === null) return null;
  return ownerScopeKey === undefined ? workspaceId : `hosted-ai:${JSON.stringify([ownerScopeKey, workspaceId])}`;
}
/** Local help is the default. Storage errors never silently enable external processing. */
export function readWorkspaceAiOptOut(workspaceId: string | null, storage = browserStorage()): boolean {
  if (!workspaceId || unsavedLocalOnly.has(workspaceId)) return true;
  try { return !workspaceId || storage?.getItem(PREFIX + encodeURIComponent(workspaceId)) !== "external-enabled"; } catch { return true; }
}
export function writeWorkspaceAiOptOut(workspaceId: string | null, optedOut: boolean, storage = browserStorage()): void {
  // A failed opt-out write must override a previously saved opt-in for this session.
  if (workspaceId) unsavedLocalOnly.add(workspaceId);
  if (!workspaceId || !storage) throw new Error("AI preference could not be saved. Local help remains enabled.");
  storage.setItem(PREFIX + encodeURIComponent(workspaceId), optedOut ? "local-only" : "external-enabled");
  unsavedLocalOnly.delete(workspaceId);
}

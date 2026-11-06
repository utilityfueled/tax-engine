const PREFIX = "tax-engine:workspace-ai:v1:";
const unsavedLocalOnly = new Set<string>();
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}
/** Local help is the default. Storage errors never silently enable external processing. */
export function readWorkspaceAiOptOut(workspaceId: string, storage = browserStorage()): boolean {
  if (unsavedLocalOnly.has(workspaceId)) return true;
  try { return !workspaceId || storage?.getItem(PREFIX + encodeURIComponent(workspaceId)) !== "external-enabled"; } catch { return true; }
}
export function writeWorkspaceAiOptOut(workspaceId: string, optedOut: boolean, storage = browserStorage()): void {
  // A failed opt-out write must override a previously saved opt-in for this session.
  unsavedLocalOnly.add(workspaceId);
  if (!workspaceId || !storage) throw new Error("AI preference could not be saved. Local help remains enabled.");
  storage.setItem(PREFIX + encodeURIComponent(workspaceId), optedOut ? "local-only" : "external-enabled");
  unsavedLocalOnly.delete(workspaceId);
}

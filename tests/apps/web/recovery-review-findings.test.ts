import { describe, expect, it, vi } from "vitest";
import { clearWorkspace, ensureWorkspace, getWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import { getGuidedFlowStorageKey, initialFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { deletePersistedWorkspace, listPersistedWorkspaces } from "../../../apps/web/src/lib/workspace-persistence";
import { getLocalRecoveryStorageKey } from "../../../apps/web/src/lib/workspace-local-recovery";
import { cacheWorkspaceDocumentFiles, getCachedWorkspaceDocumentFile } from "../../../apps/web/src/lib/workspace-document-file-cache";

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); }, clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
}

describe("independent recovery integration review", () => {
  it("keeps local recovery data when a hosted deletion is unauthenticated", async () => {
    const local = storage();
    const workspaceId = "review-expired-auth";
    ensureWorkspace(local, workspaceId);
    const source = new File(["private source"], "source.pdf", { type: "application/pdf" });
    await cacheWorkspaceDocumentFiles(workspaceId, [{ documentId: "source", file: source }]);
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ availability: "owner-required", ownerScope: null, workspace: null, workspaces: [] }), { status: 401, headers: { "content-type": "application/json" } }));
    await expect(deletePersistedWorkspace({ deploymentMode: "hosted", workspaceId, browserStorage: local, fetchFn })).rejects.toThrow();
    expect(getWorkspace(local, workspaceId)).not.toBeNull();
    expect(await getCachedWorkspaceDocumentFile(workspaceId, "source")).not.toBeNull();
  });

  it("clears scoped guided answers when resetting a return", () => {
    const local = storage();
    const workspaceId = "review-reset";
    ensureWorkspace(local, workspaceId);
    const key = getGuidedFlowStorageKey(workspaceId);
    local.setItem(key, JSON.stringify({ ...initialFlowState, taxYear: 2025, sectionData: { "personal-info": { ssn: "900-70-0001" } } }));
    local.setItem(`tax-engine:guided-mode:${workspaceId}`, "false");
    clearWorkspace(local, workspaceId);
    expect(local.getItem(key)).toBeNull();
    expect(local.getItem(`tax-engine:guided-mode:${workspaceId}`)).toBeNull();
  });

  it.each([403, "network"])("preserves local data when hosted deletion fails with %s", async (failure) => {
    const local = storage();
    const workspaceId = `review-failure-${failure}`;
    ensureWorkspace(local, workspaceId);
    const source = new File(["private source"], "source.pdf");
    await cacheWorkspaceDocumentFiles(workspaceId, [{ documentId: "source", file: source }]);
    const fetchFn = vi.fn(async () => { if (failure === "network") throw new Error("offline"); return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); });
    await expect(deletePersistedWorkspace({ deploymentMode: "hosted", workspaceId, browserStorage: local, fetchFn })).rejects.toThrow();
    expect(getWorkspace(local, workspaceId)).not.toBeNull();
    expect(await getCachedWorkspaceDocumentFile(workspaceId, "source")).not.toBeNull();
  });

  it.each([200, 401, "network"])("lists only explicitly restored local returns beside the hosted list (%s)", async (status) => {
    const local = storage();
    ensureWorkspace(local, "other-account-private-cache");
    ensureWorkspace(local, "local-restored");
    local.setItem(getLocalRecoveryStorageKey("local-restored"), "local-only");
    const fetchFn = vi.fn(async () => { if (status === "network") throw new Error("offline"); return new Response(JSON.stringify({ availability: status === 200 ? "ready" : "owner-required", ownerScope: null, workspace: null, workspaces: [] }), { status }); });
    const result = await listPersistedWorkspaces({ deploymentMode: "hosted", browserStorage: local, fetchFn });
    expect(result.workspaces.map((workspace) => workspace.id)).toEqual(["local-restored"]);
  });

  it("deletes a local restored return without sending a hosted mutation", async () => {
    const local = storage();
    ensureWorkspace(local, "local-restored-delete");
    local.setItem(getLocalRecoveryStorageKey("local-restored-delete"), "local-only");
    const fetchFn = vi.fn(async (_url, options) => { expect(options?.method).not.toBe("DELETE"); return new Response(JSON.stringify({ availability: "ready", ownerScope: null, workspace: null, workspaces: [] })); });
    await deletePersistedWorkspace({ deploymentMode: "hosted", workspaceId: "local-restored-delete", browserStorage: local, fetchFn });
    expect(getWorkspace(local, "local-restored-delete")).toBeNull();
    expect(local.getItem(getLocalRecoveryStorageKey("local-restored-delete"))).toBeNull();
  });
});

describe("recovery mutation edge cases", () => {
  it("completes a local recovery deletion even when refreshing the cloud list is offline", async () => {
    const local = storage();
    ensureWorkspace(local, "local-offline-delete");
    local.setItem(getLocalRecoveryStorageKey("local-offline-delete"), "local-only");
    const fetchFn = vi.fn(async () => { throw new Error("offline"); });
    const result = await deletePersistedWorkspace({ deploymentMode: "hosted", workspaceId: "local-offline-delete", browserStorage: local, fetchFn });
    expect(result.workspaces).toEqual([]);
    expect(getWorkspace(local, "local-offline-delete")).toBeNull();
  });
});

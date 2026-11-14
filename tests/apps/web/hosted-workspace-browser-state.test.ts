import { expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { getGuidedFlowStorageKey, initialFlowState, loadGuidedFlowState, saveGuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { advanceHostedGuidedDraft, clearHostedWorkspaceBrowserState, hostedDocumentCacheId, hostedGuidedDraftId } from "../../../apps/web/src/lib/hosted-workspace-browser-state";
import { sanitizeWorkspaceForHostedStorage } from "../../../apps/web/src/lib/hosted-privacy";
import { createWorkspaceRecord, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import { exportWorkspaceRecovery, importWorkspaceRecovery } from "../../../apps/web/src/lib/workspace-recovery";

const workspaceId = "fictional-shared-id";
const alice = "hosted-owner:alice";
const bob = "hosted-owner:bob";
const firstRevision = '"00000000-0000-4000-8000-000000000001"';
const secondRevision = '"00000000-0000-4000-8000-000000000002"';
const thirdRevision = '"00000000-0000-4000-8000-000000000003"';

function browserStorage(): Storage {
  const singleOrigin = new Map<string, string>();
  return { get length() { return singleOrigin.size; }, getItem: key => singleOrigin.get(key) ?? null,
    setItem: (key, value) => { singleOrigin.set(key, value); }, removeItem: key => { singleOrigin.delete(key); },
    clear: () => singleOrigin.clear(), key: index => [...singleOrigin.keys()][index] ?? null };
}

it("isolates guided facts by owner and revision and advances only matching private drafts", () => {
  const local = browserStorage();
  const draft = (owner: string, revision: string) => hostedGuidedDraftId(owner, workspaceId, revision);
  saveGuidedFlowState(local, workspaceId, { ...initialFlowState, taxYear: 2024 });
  saveGuidedFlowState(local, draft(alice, firstRevision), { ...initialFlowState, taxYear: 2025 });
  expect(loadGuidedFlowState(local, draft(bob, firstRevision))).toBeNull();
  expect(loadGuidedFlowState(local, draft(alice, secondRevision))).toBeNull();
  advanceHostedGuidedDraft(local, alice, workspaceId, firstRevision, secondRevision);
  expect(loadGuidedFlowState(local, draft(alice, secondRevision))?.taxYear).toBe(2025);
  expect(loadGuidedFlowState(local, draft(alice, firstRevision))).toBeNull();
  saveGuidedFlowState(local, draft(alice, thirdRevision), { ...initialFlowState, taxYear: 2026 });
  advanceHostedGuidedDraft(local, alice, workspaceId, secondRevision, thirdRevision);
  expect(loadGuidedFlowState(local, draft(alice, thirdRevision))?.taxYear).toBe(2026);
  expect(loadGuidedFlowState(local, draft(alice, secondRevision))?.taxYear).toBe(2025);
  expect(loadGuidedFlowState(local, workspaceId)?.taxYear).toBe(2024);
});

it("rejects a complete backup of a shell missing an answered private interview item", async () => {
  const local = browserStorage();
  const workspace = createWorkspaceRecord(workspaceId, { storageMode: "hosted-postgres" });
  const question = { id: "wages", factId: "wages", prompt: "What were the wages?",
    status: "answered", answeredAt: workspace.updatedAt, answerText: "240.18", sourceDocumentIds: [] } as const;
  workspace.seededReturn.interviewQuestions = [{ ...question, sourceDocumentIds: [] }];
  const hostedSnapshot = { workspace: sanitizeWorkspaceForHostedStorage(workspace),
    draftId: hostedGuidedDraftId(alice, workspaceId, firstRevision), guidedMode: null,
    documentCacheWorkspaceId: hostedDocumentCacheId(alice, workspaceId) };
  const password = "fictional hosted backup passphrase";

  await expect(exportWorkspaceRecovery(local, workspaceId, password, { hostedSnapshot }))
    .rejects.toThrow("The private interview answers are missing on this browser.");
  await expect(exportWorkspaceRecovery(local, workspaceId, password, { hostedSnapshot: { ...hostedSnapshot, workspace } }))
    .resolves.toBeInstanceOf(Blob);
});

it("clears only the confirmed account and revision", () => {
  const local = browserStorage();
  const deleteId = hostedGuidedDraftId(alice, workspaceId, firstRevision);
  const preserve = [workspaceId, hostedGuidedDraftId(bob, workspaceId, firstRevision), hostedGuidedDraftId(alice, workspaceId, secondRevision)];
  for (const id of [...preserve, deleteId]) saveGuidedFlowState(local, id, { ...initialFlowState, taxYear: 2025 });
  clearHostedWorkspaceBrowserState(local, alice, workspaceId, firstRevision);
  expect(loadGuidedFlowState(local, deleteId)).toBeNull();
  for (const id of preserve) expect(loadGuidedFlowState(local, id)?.taxYear).toBe(2025);
});

it("restores the selected hosted snapshot and its actual guided answers without unowned data", async () => {
  const local = browserStorage();
  const file = new File(["source bytes"], "fictional.pdf", { lastModified: 123 });
  const snapshot: ReturnWorkspaceRecord = ingestFilesIntoWorkspace(createWorkspaceRecord(workspaceId, { storageMode: "hosted-postgres" }), [file]);
  const guidedId = hostedGuidedDraftId(alice, workspaceId, firstRevision);
  saveGuidedFlowState(local, workspaceId, { ...initialFlowState, taxYear: 2024 });
  saveGuidedFlowState(local, guidedId, { ...initialFlowState, taxYear: 2025 });
  const documents = { read: vi.fn(async () => file), write: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
  const password = "fictional hosted backup passphrase";
  const documentCacheWorkspaceId = hostedDocumentCacheId(alice, workspaceId);
  const archive = await exportWorkspaceRecovery(local, workspaceId, password, {
    documents, hostedSnapshot: { workspace: snapshot, draftId: guidedId, guidedMode: null, documentCacheWorkspaceId },
  });
  expect(documents.read).toHaveBeenCalledWith(documentCacheWorkspaceId, snapshot.documents[0]?.id);
  const recovered = await importWorkspaceRecovery(local, archive, password, { documents });
  expect(recovered.workspaceId).not.toBe(workspaceId);
  expect(recovered.documentCount).toBe(1);
  expect(local.getItem(getGuidedFlowStorageKey(recovered.workspaceId))).toBe(local.getItem(getGuidedFlowStorageKey(guidedId)));
  expect(loadGuidedFlowState(local, recovered.workspaceId)?.taxYear).toBe(2025);
  expect(loadGuidedFlowState(local, workspaceId)?.taxYear).toBe(2024);
});

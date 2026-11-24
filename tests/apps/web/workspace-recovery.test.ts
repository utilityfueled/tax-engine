import { describe, it, expect, vi } from "vitest";
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from "../../../apps/web/src/lib/workspace-recovery";
import { deleteWorkspace, ensureWorkspace, getWorkspace, ingestFiles, listWorkspaces, WORKSPACE_STORAGE_KEY } from "../../../apps/web/src/lib/workspace-storage";
import { getGuidedFlowStorageKey, initialFlowState, loadGuidedFlowState, saveGuidedFlowState, startInterview } from "../../../apps/web/src/lib/guided-interview-flow";
import { getLocalRecoveryStorageKey } from "../../../apps/web/src/lib/workspace-local-recovery";
import { buildProviderInterviewAssistRequest } from "../../../apps/web/src/lib/provider-interview-request";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); },
    clear: () => values.clear(), key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; } };
}
function fixture() {
  const local = storage();
  const file = new File([new Uint8Array([0, 1, 2, 255, 8])], "private-tax-form.pdf", {
    type: "application/pdf", lastModified: 1234567,
  });
  const workspace = ingestFiles(local, "original", [{ name: file.name, size: file.size }]);
  const raw = JSON.parse(local.getItem(WORKSPACE_STORAGE_KEY)!);
  raw.workspaces.original.privateExtension = { ssn: "123-45-6789", exactZero: "0.00", unknown: null };
  raw.workspaces.original.enginePreview = { invented: "must not become trusted on import" };
  local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
  local.setItem(getGuidedFlowStorageKey("original"), JSON.stringify({ ...initialFlowState, taxYear: 2026,
    sectionData: { "personal-info": { ssn: "123-45-6789" }, futureExtension: { amount: "9007199254740993.27", missing: null } } }));
  local.setItem("tax-engine:guided-mode:original", "false");
  const files = new Map([[`original/${workspace.documents[0].id}`, file]]);
  const documents: RecoveryDocumentStore = {
    read: vi.fn(async (id, doc) => files.get(`${id}/${doc}`) ?? null),
    write: vi.fn(async (id, uploads) => { for (const upload of uploads) files.set(`${id}/${upload.documentId}`, upload.file); }),
    remove: vi.fn(async (id) => { for (const k of files.keys()) if (k.startsWith(`${id}/`)) files.delete(k); }),
  };
  return { local, files, documents, workspace, file };
}
const password = "synthetic-recovery-password";

function requireStoredReturns(local: Storage) {
  const raw = local.getItem(WORKSPACE_STORAGE_KEY);
  if (raw === null) throw new Error("Expected saved returns");
  return JSON.parse(raw);
}

describe("full-fidelity encrypted local recovery", () => {
  it("round trips exact facts, unknowns, source bytes, dates and explicit year into a separate local return", async () => {
    const f = fixture();
    ensureWorkspace(f.local, "unrelated");
    // ensureWorkspace has its own derived cache; original raw extension was kept in the archive below.
    const raw = JSON.parse(f.local.getItem(WORKSPACE_STORAGE_KEY)!);
    raw.workspaces.original.privateExtension = { ssn: "123-45-6789", exactZero: "0.00", unknown: null };
    f.local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
    const before = f.local.getItem(WORKSPACE_STORAGE_KEY);
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    expect(await archive.text()).not.toContain("123-45-6789");
    expect(await archive.text()).not.toContain("private-tax-form.pdf");
    const result = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    expect(result.workspaceId).not.toBe("original");
    expect(result.documentCount).toBe(1);
    const data = JSON.parse(f.local.getItem(WORKSPACE_STORAGE_KEY)!);
    expect(data.workspaces.original).toEqual(JSON.parse(before!).workspaces.original);
    expect(data.workspaces.unrelated).toEqual(JSON.parse(before!).workspaces.unrelated);
    expect(data.workspaces[result.workspaceId].privateExtension).toEqual({ ssn: "123-45-6789", exactZero: "0.00", unknown: null });
    expect(data.workspaces[result.workspaceId].enginePreview).toBeNull();
    expect(data.workspaces[result.workspaceId].storageMode).toBe("local-browser");
    expect(f.local.getItem(getGuidedFlowStorageKey(result.workspaceId))).toBe(f.local.getItem(getGuidedFlowStorageKey("original")));
    expect(f.local.getItem(`tax-engine:guided-mode:${result.workspaceId}`)).toBe("false");
    const restored = f.files.get(`${result.workspaceId}/${f.workspace.documents[0].id}`)!;
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(new Uint8Array(await f.file.arrayBuffer()));
    expect(restored.lastModified).toBe(1234567);
    expect(restored.type).toBe("application/pdf");
    expect(getWorkspace(f.local, result.workspaceId)?.documents).toHaveLength(1);
  });
  it("does not invent a year in a legacy saved interview", async () => {
    const f = fixture();
    const legacy = { ...initialFlowState } as Record<string, unknown>;
    delete legacy.taxYear;
    f.local.setItem(getGuidedFlowStorageKey("original"), JSON.stringify(legacy));
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const result = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    expect(JSON.parse(f.local.getItem(getGuidedFlowStorageKey(result.workspaceId))!)).not.toHaveProperty("taxYear");
  });
  it.each([
    { description: "incomplete", endsOn: "", sourceFactsConfirmed: null },
    { description: "confirmed", endsOn: "2026-03-31", sourceFactsConfirmed: true },
  ])("reopens $description short accounting period facts from encrypted recovery", async ({ endsOn, sourceFactsConfirmed }) => {
    const f = fixture();
    const flow = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    const personal = flow.sectionData["personal-info"];
    if (!personal) throw new Error("Expected synthetic taxpayer");
    const packet = { startsOn: "2025-11-01", endsOn, sourceReference: "Private accounting reference", sourceFactsConfirmed };
    personal.standardDeductionFacts = { ...personal.standardDeductionFacts, shortTaxYear: true, shortAccountingPeriod: packet };
    expect(saveGuidedFlowState(f.local, "original", flow)).toBe(true);
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    expect(await archive.text()).not.toContain(packet.sourceReference);
    const result = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    const restored = loadGuidedFlowState(f.local, result.workspaceId);
    expect(restored?.taxYear).toBe(2025);
    expect(restored?.sectionData["personal-info"]?.standardDeductionFacts).toMatchObject({ shortTaxYear: true, shortAccountingPeriod: packet });
    const workspace = getWorkspace(f.local, result.workspaceId);
    if (!workspace) throw new Error("Expected restored workspace");
    const providerRequest = JSON.stringify(buildProviderInterviewAssistRequest(workspace));
    expect(providerRequest).not.toContain(packet.sourceReference);
    expect(providerRequest).not.toContain("shortAccountingPeriod");
  });
  it("preserves a restored return when another tab saves an unrelated return", async () => {
    const f = fixture();
    const otherTab = { ...f.local };
    ensureWorkspace(otherTab, "unrelated");
    const raw = requireStoredReturns(f.local);
    raw.workspaces.original.privateExtension = { exactZero: "0.00", unknown: null };
    raw.futureStorageField = "preserve";
    f.local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
    expect(listWorkspaces(otherTab)).toHaveLength(2);

    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const restored = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    const before = requireStoredReturns(f.local);
    expect(listWorkspaces(f.local)).toHaveLength(3);

    ingestFiles(otherTab, "unrelated", [{ name: "unrelated.pdf", size: 10 }]);
    const after = requireStoredReturns(f.local);
    expect(after.workspaces.original).toEqual(before.workspaces.original);
    expect(after.workspaces[restored.workspaceId]).toEqual(before.workspaces[restored.workspaceId]);
    expect(after.workspaces[restored.workspaceId].privateExtension).toEqual({ exactZero: "0.00", unknown: null });
    expect(after.futureStorageField).toBe("preserve");
    expect(getWorkspace(otherTab, restored.workspaceId)?.documents).toHaveLength(1);
    expect(getWorkspace(f.local, "unrelated")?.documents).toHaveLength(1);
    expect(f.local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBe(f.local.getItem(getGuidedFlowStorageKey("original")));
    expect(f.files.get(`${restored.workspaceId}/${f.workspace.documents[0].id}`)?.size).toBe(f.file.size);
  });
  it("does not bring back a deleted return when a previously opened tab saves another", async () => {
    const f = fixture();
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const restored = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    const otherTab = { ...f.local };
    ensureWorkspace(otherTab, "unrelated");
    expect(getWorkspace(otherTab, restored.workspaceId)?.documents).toHaveLength(1);

    await f.documents.remove(restored.workspaceId);
    deleteWorkspace(f.local, restored.workspaceId);
    ingestFiles(otherTab, "unrelated", [{ name: "unrelated.pdf", size: 10 }]);

    expect(getWorkspace(otherTab, restored.workspaceId)).toBeNull();
    expect(getWorkspace(f.local, "unrelated")?.documents).toHaveLength(1);
    expect(requireStoredReturns(f.local).workspaces).not.toHaveProperty(restored.workspaceId);
    expect(f.local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBeNull();
    expect(f.local.getItem(getLocalRecoveryStorageKey(restored.workspaceId))).toBeNull();
    expect(f.files.get(`${restored.workspaceId}/${f.workspace.documents[0].id}`)).toBeUndefined();
  });
  it("uses fresh salt and IV each time", async () => {
    const f = fixture();
    const first = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const second = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const a = JSON.parse(await first.text()), b = JSON.parse(await second.text());
    expect(a.salt).not.toBe(b.salt); expect(a.iv).not.toBe(b.iv); expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it.each(["incorrect-long-password", "damage"])("rejects %s before writing any data", async (failure) => {
    const f = fixture();
    let archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    if (failure === "damage") {
      const envelope = JSON.parse(await archive.text());
      envelope.ciphertext = (envelope.ciphertext[0] === "A" ? "B" : "A") + envelope.ciphertext.slice(1);
      archive = new Blob([JSON.stringify(envelope)]);
    }
    const original = f.local.getItem(WORKSPACE_STORAGE_KEY);
    await expect(importWorkspaceRecovery(f.local, archive, failure === "damage" ? password : failure,
      { documents: f.documents })).rejects.toThrow(/incorrect|damaged/u);
    expect(f.documents.write).not.toHaveBeenCalled();
    expect(f.local.getItem(WORKSPACE_STORAGE_KEY)).toBe(original);
  });
  it("rejects missing original files instead of making an incomplete backup", async () => {
    const f = fixture(); f.files.clear();
    await expect(exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents })).rejects.toThrow("Original file is missing");
  });
  it("rejects a mismatching original file size", async () => {
    const f = fixture(); f.files.set(`original/${f.workspace.documents[0].id}`, new File(["changed"], "other.pdf"));
    await expect(exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents })).rejects.toThrow("size does not match");
  });
  it("does not treat generated guided records as uploaded originals", async () => {
    const f = fixture();
    const raw = JSON.parse(f.local.getItem(WORKSPACE_STORAGE_KEY)!);
    raw.workspaces.original.documents[0].id = "guided:w2:1";
    f.local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const restored = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    expect(restored.documentCount).toBe(0); expect(f.documents.read).not.toHaveBeenCalled();
  });
  it.each(["generated document", "completion summary"])(
    "refuses a complete local backup when a %s remains but the guided answers are missing",
    async (marker) => {
      const f = fixture();
      const raw = requireStoredReturns(f.local);
      const workspace = raw.workspaces.original;
      if (marker === "generated document") {
        workspace.documents.push({ ...workspace.documents[0], id: "guided:w2:1" });
      } else {
        workspace.guidedCompletion = {
          completedSectionCount: 3, totalSectionCount: 3, skippedSectionCount: 0, needsReviewSectionCount: 0,
        };
      }
      f.local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
      f.local.removeItem(getGuidedFlowStorageKey("original"));

      await expect(exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents }))
        .rejects.toThrow("guided answers are missing");
      expect(f.documents.read).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["only a confirmed year", { ...initialFlowState, taxYear: 2026 }],
    ["initial setup and defaults", startInterview({ ...initialFlowState.segmentation, filingStatus: "single" }, 2026)],
  ] as const)("refuses a complete local backup after a reset leaves %s and a saved completion summary", async (_, draft) => {
    const f = fixture();
    const raw = requireStoredReturns(f.local);
    raw.workspaces.original.guidedCompletion = {
      completedSectionCount: 3, totalSectionCount: 3, skippedSectionCount: 0, needsReviewSectionCount: 0,
    };
    f.local.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw));
    f.local.setItem(getGuidedFlowStorageKey("original"), JSON.stringify(draft));

    await expect(exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents }))
      .rejects.toThrow("guided answers are missing");
    expect(f.documents.read).not.toHaveBeenCalled();
  });
  it("round-trips an advanced-only return without a guided draft", async () => {
    const f = fixture();
    f.local.removeItem(getGuidedFlowStorageKey("original"));
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const restored = await importWorkspaceRecovery(f.local, archive, password, { documents: f.documents });
    expect(restored.documentCount).toBe(1);
    expect(f.local.getItem(getGuidedFlowStorageKey(restored.workspaceId))).toBeNull();
    expect(f.files.get(`${restored.workspaceId}/${f.workspace.documents[0].id}`)?.size).toBe(f.file.size);
  });
  it("rejects an unscoped legacy interview rather than assigning it to a return", async () => {
    const f = fixture(); f.local.removeItem(getGuidedFlowStorageKey("original"));
    f.local.setItem("tax-engine.guided-flow-state.v1", JSON.stringify(initialFlowState));
    await expect(exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents })).rejects.toThrow("not linked");
  });
  it("rolls back imported files and scoped keys when browser storage is full", async () => {
    const f = fixture();
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const before = f.local.getItem(WORKSPACE_STORAGE_KEY);
    const set = f.local.setItem;
    f.local.setItem = (k, value) => { if (k === WORKSPACE_STORAGE_KEY) throw new Error("quota exceeded"); set(k, value); };
    await expect(importWorkspaceRecovery(f.local, archive, password, { documents: f.documents })).rejects.toThrow("quota exceeded");
    expect(f.documents.remove).toHaveBeenCalledOnce();
    expect(f.files.size).toBe(1); expect(f.local.length).toBe(3);
    expect(f.local.getItem(WORKSPACE_STORAGE_KEY)).toBe(before);
  });
  it("does not activate recovery after a durable document-store failure", async () => {
    const f = fixture();
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    const before = f.local.getItem(WORKSPACE_STORAGE_KEY);
    f.documents.write = vi.fn(async () => { throw new Error("IndexedDB unavailable"); });
    await expect(importWorkspaceRecovery(f.local, archive, password, { documents: f.documents })).rejects.toThrow("IndexedDB unavailable");
    expect(f.local.getItem(WORKSPACE_STORAGE_KEY)).toBe(before);
  });
  it("honors cancellation and rejects weak passwords without touching document storage", async () => {
    const f = fixture();
    const signal = AbortSignal.abort();
    await expect(exportWorkspaceRecovery(f.local, "original", password, { signal, documents: f.documents })).rejects.toThrow();
    await expect(exportWorkspaceRecovery(f.local, "original", "short", { documents: f.documents })).rejects.toThrow("12");
    await expect(importWorkspaceRecovery(f.local, new Blob(), password, { signal, documents: f.documents })).rejects.toThrow();
    expect(f.documents.read).not.toHaveBeenCalled(); expect(f.documents.write).not.toHaveBeenCalled();
  });
  it("rejects unknown versions and tampered KDF parameters before expensive work", async () => {
    const f = fixture();
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    for (const change of [{ version: 2 }, { iterations: 1 }, { salt: "!".repeat(24) }]) {
      await expect(importWorkspaceRecovery(f.local, new Blob([JSON.stringify({ ...JSON.parse(await archive.text()), ...change })]),
        password, { documents: f.documents })).rejects.toThrow();
    }
    expect(f.documents.write).not.toHaveBeenCalled();
  });
  it("refuses a memory-only restore when originals exist and IndexedDB is unavailable", async () => {
    const f = fixture();
    const archive = await exportWorkspaceRecovery(f.local, "original", password, { documents: f.documents });
    await expect(importWorkspaceRecovery(f.local, archive, password)).rejects.toThrow("Durable document storage");
  });
});

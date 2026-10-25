// Spec: spec/federal/workspace-guided-year.yaml.
import { expect, it } from "vitest";
import { createWorkspaceRecord, ensureWorkspace, getWorkspace, listWorkspaces, saveWorkspaceSnapshot, syncGuidedFlowToWorkspace, ingestFilesIntoWorkspace } from "@/lib/workspace-storage";
import { reconcileWorkspaceGuidedState } from "@/lib/workspace-guided-state";
import { buildSectionRoute, saveGuidedFlowState, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments } from "@/lib/guided-interview-bridge";
import { canPresentCompletedReturnDownload, formatWorkspaceTaxYearSummary, summarizeGuidedSetupProgress, summarizeWorkspaceGuidedCompletion } from "@/lib/workspace-status-copy";
import { completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
import { buildWorkspaceFilingPackDownload } from "@/lib/workspace-filing-pack";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
function completeFlow(): GuidedFlowState {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", federalWithheld: "6000", socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725" }] };
  state.phase = "complete";
  state.completedSections = buildSectionRoute(state.segmentation).map(section => section.id);
  state.currentSectionIndex = state.completedSections.length - 1;
  return state;
}

// Spec: workspace-guided-bundle.yaml#guided-summary.
it("builds the guided-only summary bundle without inventing source documents or serializing private answers", () => {
  const flow = completeFlow(); const original = structuredClone(flow);
  const workspace = reconcileWorkspaceGuidedState(createWorkspaceRecord("guided-bundle"), flow);
  const download = buildWorkspaceFilingPackDownload(workspace);
  expect(download.fileName).toBe("guided-bundle-2025-tax-return.json");
  expect(download.filingPack.manifest).toMatchObject({ targetTaxYear: 2025, returnStatus: "ready-to-recompute", localOnly: true });
  const audit = JSON.parse(download.filingPack.files.find(file => file.path === "07-audit-trail.json")!.contents);
  expect(audit).toMatchObject({ documents: [], structuredFacts: [] });
  const summary = JSON.parse(download.filingPack.files.find(file => file.path === "01-return-summary.json")!.contents);
  expect(summary.enginePreview).toBeNull();
  expect(download.contents).not.toContain(flow.sectionData["personal-info"]!.ssn);
  expect(flow).toEqual(original);
});

it("restores the actual guided year and completed facts after a cached workspace was read", () => {
  const storage = memoryStorage(); const workspace = ensureWorkspace(storage, "guided-year"); const flow = completeFlow();
  expect(getWorkspace(storage, workspace.id)?.returnSummary.targetTaxYear).toBeNull();
  saveGuidedFlowState(storage, workspace.id, flow);
  const restored = getWorkspace(storage, workspace.id)!;
  expect(formatWorkspaceTaxYearSummary(restored.returnSummary)).toBe("2025");
  expect(restored.returnSummary).toMatchObject({ targetTaxYear: 2025, taxYearState: "single", status: "ready-to-recompute" });
  expect(restored.documents).toEqual([]);
  expect(restored.structuredFacts).toEqual([]);
  expect(restored.checklist.find(item => item.id === "documents")?.label).toBe("Guided facts saved");
  expect(restored.checklist.find(item => item.id === "review")?.status).toBe("ready");
  expect(listWorkspaces(storage)[0]?.returnSummary.targetTaxYear).toBe(2025);
  expect(ensureWorkspace(storage, workspace.id).returnSummary.targetTaxYear).toBe(2025);
  saveWorkspaceSnapshot(storage, restored);
  expect(getWorkspace(storage, workspace.id)?.returnSummary.targetTaxYear).toBe(2025);
  expect(workspace.returnSummary.targetTaxYear).toBeNull();
});

it("preserves conflicting and unknown original document years instead of adopting the guided year", () => {
  const flow = completeFlow();
  for (const taxYear of [2026, null]) {
    const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord("source-year"), [{ name: "actual.pdf", size: 12, detectedDocument: { taxYear, kind: "w2", coverage: "supported", label: "Actual W2", notes: "Original", seededFactIds: ["wages", "withholding"] } }]);
    const original = structuredClone(workspace);
    const restored = reconcileWorkspaceGuidedState(workspace, flow);
    expect(restored.returnSummary.targetTaxYear).toBe(2025);
    expect(restored.returnSummary.taxYearState).toBe(taxYear === null ? "missing" : "multiple");
    expect(restored.returnSummary.status).toBe("needs-review");
    expect(restored.returnSummary.blockers.some(blocker => blocker.id === (taxYear === null ? "guided:unknown-document-year" : "guided:conflicting-source-years"))).toBe(true);
    expect(restored.enginePreview).toBeNull();
    expect(restored.documents[0]?.taxYear).toBe(taxYear);
    expect(workspace).toEqual(original);
  }
});

it("keeps incomplete changed and unsupported-year guided returns blocked", () => {
  const workspace = createWorkspaceRecord("guided-boundaries");
  for (const taxYear of [null, undefined, 2026, 2025.5]) {
    const flow = { ...completeFlow(), taxYear };
    const restored = reconcileWorkspaceGuidedState(workspace, flow);
    expect(restored.checklist.find(item => item.id === "review")?.status).toBe("blocked");
    expect(restored.enginePreview).toBeNull();
    if (taxYear === 2026) {
      expect(restored.returnSummary.targetTaxYear).toBe(2026);
      expect(restored.returnSummary.blockers.some(blocker => blocker.id === "unsupported-tax-year")).toBe(true);
    } else expect(restored.returnSummary.targetTaxYear).toBeNull();
    expect(flow.taxYear).toBe(taxYear);
  }
  const unvisited = completeFlow(); unvisited.completedSections = [];
  expect(reconcileWorkspaceGuidedState(workspace, unvisited).returnSummary.status).toBe("awaiting-interview");
  const changed = completeFlow(); changed.sectionData["personal-info"]!.dateOfBirth = "";
  const restored = reconcileWorkspaceGuidedState(workspace, changed);
  expect(restored.returnSummary.status).toBe("awaiting-interview");
  expect(restored.guidedCompletion?.needsReviewSectionCount).toBeGreaterThan(0);
  expect(restored.checklist.find(item => item.id === "review")?.status).toBe("blocked");
});

it("reconciles sync and hosted browser shells without moving private facts into records", () => {
  const flow = completeFlow(); const workspace = { ...createWorkspaceRecord("hosted-year"), storageMode: "hosted-postgres" as const };
  const original = structuredClone(flow);
  const synced = syncGuidedFlowToWorkspace(workspace, [], [], flow);
  expect(synced.returnSummary.targetTaxYear).toBe(2025);
  expect(synced.storageMode).toBe("hosted-postgres");
  expect(synced.documents).toEqual([]);
  expect(synced.structuredFacts).toEqual([]);
  expect(JSON.stringify(synced)).not.toContain("111-22-3333");
  expect(reconcileWorkspaceGuidedState(synced, flow)).toEqual(synced);
  expect(flow).toEqual(original);
  expect(reconcileWorkspaceGuidedState(workspace, null)).toBe(workspace);
});

it("invalidates a prior calculation when same-year guided facts change", () => {
  const workspace = createWorkspaceRecord("changed-guided-facts");
  workspace.enginePreview = { mode: "engine-recompute", title: "Previously calculated actual return", taxYear: 2025,
    filingStatus: "single", sourceDocumentIds: [], sourceFixtureIds: [], assumptions: [], highlightedLines: [],
    metrics: { totalIncome: "50000", agi: "50000", taxableIncome: "34250", totalTax: "3875", totalPayments: "6000", refund: "2125", amountOwed: "0" } };
  const flow = completeFlow(); flow.sectionData["income-w2"]!.entries[0]!.wages = "60000";
  const restored = reconcileWorkspaceGuidedState(workspace, flow);
  expect(restored.returnSummary.status).toBe("ready-to-recompute");
  expect(restored.enginePreview).toBeNull();
  expect(workspace.enginePreview.metrics.totalIncome).toBe("50000");
  expect(flow.sectionData["income-w2"]!.entries[0]!.wages).toBe("60000");
});

it("counts unvisited sections as pending without claiming they were skipped", () => {
  const flow = completeFlow(); flow.completedSections = [];
  const restored = reconcileWorkspaceGuidedState(createWorkspaceRecord("unvisited-guided-facts"), flow);
  expect(restored.guidedCompletion).toEqual({ completedSectionCount: 0, totalSectionCount: 7, skippedSectionCount: 0, needsReviewSectionCount: 0 });
  expect(restored.summary.interviewQuestionsRemaining).toBe(7);
  expect(summarizeWorkspaceGuidedCompletion(restored.guidedCompletion)).toMatchObject({ progressLabel: "7 guided sections still need review", helperText: expect.stringContaining("incomplete") });
});

it("keeps saved interview progress separate from completed review metadata", () => {
  const flow = completeFlow(); flow.phase = "interview"; flow.currentSectionIndex = 1;
  flow.completedSections = ["personal-info"];
  const restored = reconcileWorkspaceGuidedState(createWorkspaceRecord("saved-progress"), flow);
  expect(restored.guidedCompletion).toBeNull();
  expect(summarizeGuidedSetupProgress(flow)).toMatchObject({ statusLabel: "Guided setup saved", progressLabel: "1 guided section saved", helperText: "Your guided interview is ready to resume at W-2 Wages." });
  expect(restored.summary.interviewQuestionsRemaining).toBe(6);
  expect(restored.returnSummary.blockers.some(blocker => blocker.id === "guided:incomplete-facts")).toBe(true);
  expect(restored.checklist.find(item => item.id === "review")?.status).toBe("blocked");
  expect(canPresentCompletedReturnDownload({ returnSummary: restored.returnSummary, guidedFlowState: flow,
    pendingInterviewQuestionCount: 0, guidedReviewIssueCount: 0, hasEnginePreview: true })).toBe(false);
});

it("restores completed actual W2 facts after syncing generated guided summaries", () => {
  const flow = completeFlow();
  const summaries = buildGuidedSyntheticDocuments(flow);
  expect(summaries.some(document => document.id === "guided:w2")).toBe(true);
  const synced = syncGuidedFlowToWorkspace(createWorkspaceRecord("completed-guided-source"), summaries, buildGuidedFactAnswers(flow), flow);
  expect(synced.returnSummary).toMatchObject({ targetTaxYear: 2025, taxYearState: "single", status: "ready-to-recompute", blockers: [] });
  expect(synced.checklist.find(item => item.id === "documents")?.label).toBe("Guided facts saved");
  expect(synced.documents).toEqual(summaries);
});

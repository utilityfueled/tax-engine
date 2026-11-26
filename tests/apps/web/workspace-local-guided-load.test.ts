// Spec: spec/federal/workspace-guided-year.yaml.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { buildSectionRoute, emptyDeductionData, emptyDonationEntry, getGuidedFlowStorageKey, loadGuidedFlowState, saveGuidedFlowState, validateSection } from "@/lib/guided-interview-flow";
import * as guidedWorkspace from "@/lib/workspace-guided-state";
import { loadPersistedWorkspace } from "@/lib/workspace-persistence";
import { createWorkspaceRecord, ensureWorkspace } from "@/lib/workspace-storage";
import { guidedReciprocalWageFixture } from "../../fixtures/guided-oh-reciprocal-wages-complete";
import { completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
import { actualTipW2 } from "../../guided-interview/guided-tip-income-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function setup(initialDraft = true) {
  const id = "local-oh-review";
  const key = getGuidedFlowStorageKey(id);
  const items = new Map<string, string>();
  const access = { blocked: false };
  const storage: Storage = {
    getItem: vi.fn((name: string) => {
      if (access.blocked && name === key) throw new Error("storage unavailable");
      return items.get(name) ?? null;
    }),
    setItem: (name, value) => { items.set(name, value); },
    removeItem: name => { items.delete(name); },
    clear: () => items.clear(),
    key: index => [...items.keys()][index] ?? null,
    get length() { return items.size; },
  };
  ensureWorkspace(storage, id);
  const { state } = guidedReciprocalWageFixture();
  state.phase = "complete";
  state.completedSections = buildSectionRoute(state.segmentation).map(section => section.id);
  state.currentSectionIndex = state.completedSections.length - 1;
  if (initialDraft) expect(saveGuidedFlowState(storage, id, state)).toBe(true);
  return { id, key, storage, state, access };
}

async function loadForScreen(fixture: ReturnType<typeof setup>, createIfMissing = false) {
  const { id, storage } = fixture;
  const draftRead = guidedWorkspace.createLocalWorkspaceDraftRead(storage, id);
  const { workspace } = await loadPersistedWorkspace({
    deploymentMode: "self-host", browserStorage: storage, workspaceId: id, createIfMissing,
  }, draftRead);
  if (!workspace) throw new Error("Expected a stored workspace");
  return {
    workspace,
    finish: (current: ReturnWorkspaceRecord = workspace) => draftRead.reconcileLatest(current),
  };
}

describe("saved workspace draft reconciliation", () => {
  it.each([false, true])("rereads an unchanged saved draft without parsing it again (create option %s)", async createIfMissing => {
    const fixture = setup();
    const { id, key, storage } = fixture;
    const raw = storage.getItem(key);
    const { workspace: baseline } = await loadPersistedWorkspace({ deploymentMode: "self-host", browserStorage: storage, workspaceId: id });
    if (!baseline) throw new Error("Expected a baseline workspace");
    const expected = JSON.stringify(guidedWorkspace.reconcileWorkspaceGuidedState(baseline, loadGuidedFlowState(storage, id)));
    vi.mocked(storage.getItem).mockClear();
    const parse = vi.spyOn(JSON, "parse");

    const reopened = await loadForScreen(fixture, createIfMissing);
    const result = reopened.finish();

    expect(JSON.stringify(result)).toBe(expected);
    expect(vi.mocked(storage.getItem).mock.calls.filter(([name]) => name === key)).toHaveLength(2);
    expect(parse.mock.calls.filter(([text]) => text === raw)).toHaveLength(1);
    expect(result).toBe(reopened.workspace);
    expect(result).not.toBe(baseline);
  });

  it("uses a changed draft read after the adapter resolves", async () => {
    const fixture = setup();
    const opened = await loadForScreen(fixture);
    expect(saveGuidedFlowState(fixture.storage, fixture.id, { ...fixture.state, taxYear: 2026 })).toBe(true);
    expect(opened.workspace.returnSummary.targetTaxYear).toBe(2025);
    expect(opened.finish().returnSummary.targetTaxYear).toBe(2026);
  });

  it("revalidates an unchanged draft when a source date becomes current across midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59));
    const fixture = setup(false);
    const { id, key, storage } = fixture;
    const state = startCompleteInterview({ filingStatus: "mfs", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    state.phase = "complete";
    state.completedSections = buildSectionRoute(state.segmentation).map(section => section.id);
    const standardFacts = state.sectionData["personal-info"]?.standardDeductionFacts;
    if (!standardFacts) throw new Error("Expected taxpayer deduction facts");
    standardFacts.spouseItemizes = true;
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "75000", federalWithheld: "15000" }] };
    state.sectionData.deductions = {
      ...emptyDeductionData,
      method: "nonitemized",
      gamblingWinnings: "0",
      nonW2IncomeTaxesDeductedElsewhere: "0",
      charitableContributions: "100",
      donationEntries: [{ ...emptyDonationEntry, organization: "Sample charity", type: "cash", cashAmountBasis: "net-contribution",
        amount: "100", date: "2026-11-27", qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false }],
    };
    expect(validateSection(state, "deductions").status).toBe("partial");
    expect(saveGuidedFlowState(storage, id, state)).toBe(true);
    const raw = storage.getItem(key);
    const loaded = await loadForScreen(fixture);
    const before = loaded.workspace.guidedCompletion?.completedSectionCount;
    expect(before).toBeTypeOf("number");

    vi.setSystemTime(new Date(2026, 10, 27, 0, 1));
    expect(storage.getItem(key)).toBe(raw);
    expect(validateSection(state, "deductions").status).toBe("complete");
    expect(loaded.finish().guidedCompletion?.completedSectionCount).toBe((before ?? 0) + 1);
  });

  it("revalidates an unchanged draft when Form 8919 crosses midnight UTC on the same local day", async () => {
    vi.stubEnv("TZ", "America/New_York");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T23:59:00Z"));
    const fixture = setup(false);
    const { id, key, storage } = fixture;
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["additional-deductions"], stateCode: null });
    state.taxYear = 2026;
    state.phase = "complete";
    state.completedSections = buildSectionRoute(state.segmentation).map(section => section.id);
    state.sectionData["income-w2"] = { entries: [{ ...actualTipW2, sourceTaxYear: "2026", wages: "183500", medicareWages: "183500",
      socialSecurityWages: "183500", socialSecurityTips: "0" }] };
    state.sectionData["additional-deductions"] = { ...state.sectionData["additional-deductions"],
      form8919ReasonA: { taxYear: "2026", firmName: "Example Services", employerEin: "65-4321098", determinationDate: "2026-11-27", wages: "1000.25", confirmed: true } };
    expect(new Date().getDate()).toBe(26);
    expect(validateSection(state, "additional-deductions").status).toBe("partial");
    expect(saveGuidedFlowState(storage, id, state)).toBe(true);
    const raw = storage.getItem(key);
    const loaded = await loadForScreen(fixture);
    const before = loaded.workspace.guidedCompletion?.completedSectionCount;
    expect(before).toBeTypeOf("number");

    vi.setSystemTime(new Date("2026-11-27T00:01:00Z"));
    expect(new Date().getDate()).toBe(26);
    expect(storage.getItem(key)).toBe(raw);
    expect(validateSection(state, "additional-deductions").status).toBe("complete");
    expect(loaded.finish().guidedCompletion?.completedSectionCount).toBe((before ?? 0) + 1);
  });

  it("replays an equal parsed draft when its serialized bytes changed", async () => {
    const fixture = setup();
    const opened = await loadForScreen(fixture);
    const changedRaw = `  ${fixture.storage.getItem(fixture.key)}`;
    fixture.storage.setItem(fixture.key, changedRaw);
    const parse = vi.spyOn(JSON, "parse");

    const result = opened.finish();

    expect(result).toEqual(opened.workspace);
    expect(result).not.toBe(opened.workspace);
    expect(parse.mock.calls.filter(([text]) => text === changedRaw)).toHaveLength(1);
  });

  it.each(["removed", "invalid", "unavailable"] as const)("uses the loaded workspace when the post-await draft is %s", async changed => {
    const fixture = setup();
    const opened = await loadForScreen(fixture);
    if (changed === "removed") fixture.storage.removeItem(fixture.key);
    if (changed === "invalid") fixture.storage.setItem(fixture.key, "{");
    if (changed === "unavailable") fixture.access.blocked = true;

    expect(opened.finish()).toBe(opened.workspace);
    expect(opened.workspace.returnSummary.targetTaxYear).toBe(2025);
  });

  it("reconciles a draft saved after the adapter read an empty slot", async () => {
    const fixture = setup(false);
    const opened = await loadForScreen(fixture);
    expect(opened.workspace.returnSummary.targetTaxYear).toBeNull();
    expect(saveGuidedFlowState(fixture.storage, fixture.id, fixture.state)).toBe(true);
    expect(opened.finish().returnSummary.targetTaxYear).toBe(2025);
  });

  it("reconciles a replacement adapter result even when it has the same workspace ID", async () => {
    const fixture = setup();
    const opened = await loadForScreen(fixture);
    const replacement = { ...opened.workspace, returnSummary: { ...opened.workspace.returnSummary, targetTaxYear: 2026 } };
    expect(opened.finish(replacement).returnSummary.targetTaxYear).toBe(2025);
  });

  it("rereads the current draft when an adapter did not observe its first load", async () => {
    const { id, storage } = setup();
    const draftRead = guidedWorkspace.createLocalWorkspaceDraftRead(storage, id);
    const adapterResult = await Promise.resolve(createWorkspaceRecord(id));

    expect(draftRead.reconcileLatest(adapterResult).returnSummary.targetTaxYear).toBe(2025);
    expect(adapterResult.returnSummary.targetTaxYear).toBeNull();
  });

  it("does not reuse a projection created from another storage with identical draft bytes", () => {
    const intended = setup();
    const other = setup();
    expect(other.storage.getItem(other.key)).toBe(intended.storage.getItem(intended.key));
    const draftRead = guidedWorkspace.createLocalWorkspaceDraftRead(intended.storage, intended.id);
    const workspace = createWorkspaceRecord(intended.id);
    const foreign = draftRead.reconcileInitial(other.storage, other.id, workspace);
    const result = draftRead.reconcileLatest(foreign);

    expect(result).toEqual(foreign);
    expect(result).not.toBe(foreign);
  });

  it("discards the observation after its first post-await read", async () => {
    const fixture = setup();
    const opened = await loadForScreen(fixture);
    expect(opened.finish()).toBe(opened.workspace);
    expect(opened.finish()).not.toBe(opened.workspace);
  });

  it("leaves hosted lookups outside the local reconciliation path", async () => {
    const { id, storage } = setup();
    const draftRead = guidedWorkspace.createLocalWorkspaceDraftRead(storage, id);
    const observe = vi.spyOn(draftRead, "reconcileInitial");
    vi.mocked(storage.getItem).mockClear();

    const result = await loadPersistedWorkspace({
      deploymentMode: "hosted", browserStorage: storage, workspaceId: id,
      fetchFn: async () => Response.json({ availability: "owner-required", ownerScope: null, workspace: null, workspaces: [] }, { status: 401 }),
    }, draftRead);

    expect(result.workspace).toBeNull();
    expect(result.adapter.availability).toBe("owner-required");
    expect(observe).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });
});

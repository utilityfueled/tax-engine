// @vitest-environment jsdom
// Spec: spec/federal/encrypted-recovery-browser-evidence.yaml, guided-draft-write-failure and guided-draft-reset-failure.
import { webcrypto } from "node:crypto";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { getGuidedFlowStorageKey, loadGuidedFlowState, saveGuidedFlowState } from "@/lib/guided-interview-flow";
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from "@/lib/workspace-recovery";
import { ensureWorkspace, requireCurrentLocalWorkspace, syncLocalGuidedFlowToWorkspace } from "@/lib/workspace-storage";
import { completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
import { mountGuidedPanel } from "./guided-panel-dom";

function wageDraft() {
  const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  draft.sectionData["income-w2"] = { entries: [{
    ...completeW2Entry,
    sourceTaxYear: "2025",
    wages: "42000",
    federalWithheld: "3100",
    socialSecurityWages: "42000",
    socialSecurityWithheld: "2604",
    medicareWages: "42000",
    medicareWithheld: "609",
  }] };
  return draft;
}

const elementScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  if (elementScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", elementScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

it("retries a rejected local draft before syncing and backing up corrected wages", async () => {
  const id = "synthetic-local-w2-save";
  const key = getGuidedFlowStorageKey(id);
  const workspace = ensureWorkspace(localStorage, id);
  saveGuidedFlowState(localStorage, id, wageDraft());

  const before = localStorage.getItem(key);
  const setItem = Storage.prototype.setItem;
  let rejectDraftWrite = true;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
    if (rejectDraftWrite && name === key) throw new DOMException("Synthetic quota exceeded", "QuotaExceededError");
    setItem.call(this, name, value);
  });
  function savedAgi(workspaceId: string) {
    const saved = loadGuidedFlowState(localStorage, workspaceId);
    if (!saved) throw new Error("Missing saved interview");
    const input = buildTaxInputFromGuidedData(saved);
    if (!input) throw new Error("Missing complete synthetic return");
    return calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed();
  }
  const onSync: NonNullable<React.ComponentProps<typeof GuidedInterviewShell>["onSyncToWorkspace"]> =
    (documents, answers, state) => { syncLocalGuidedFlowToWorkspace(localStorage, workspace, documents, answers, state); };
  const sync = vi.fn(onSync);
  const panel = await mountGuidedPanel(<GuidedInterviewShell
    workspace={workspace}
    beforeGuidedWrite={() => { requireCurrentLocalWorkspace(localStorage, workspace); }}
    resumeSectionId="income-w2"
    onExitGuided={() => {}}
    onSyncToWorkspace={sync}
  />);
  try {
    const wagesLabel = "Box 1 — Wages, tips, other comp";
    expect(savedAgi(id)).toBe("42000");
    await panel.change(wagesLabel, "43000");
    expect(panel.control(wagesLabel).value).toBe("43000");
    expect(panel.container.querySelector('[role="alert"]')?.textContent ?? "").toContain("Could not save guided answers");
    expect(localStorage.getItem(key)).toBe(before);

    await panel.click("Switch to advanced mode");
    expect(sync).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(before);

    rejectDraftWrite = false;
    await panel.click("Switch to advanced mode");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(savedAgi(id)).toBe("43000");

    const documents: RecoveryDocumentStore = { read: async () => null, write: async () => {}, remove: async () => {} };
    const passphrase = "synthetic-local-save-recovery";
    const archive = await exportWorkspaceRecovery(localStorage, id, passphrase, { documents });
    const restored = await importWorkspaceRecovery(localStorage, archive, passphrase, { documents });
    expect(savedAgi(restored.workspaceId)).toBe("43000");

    rejectDraftWrite = true;
    await panel.change(wagesLabel, "45000");
    rejectDraftWrite = false;
    const anotherTab = wageDraft();
    anotherTab.sectionData["income-w2"]!.entries[0]!.wages = "44000";
    saveGuidedFlowState(localStorage, id, anotherTab);
    await panel.click("Switch to advanced mode");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(savedAgi(id)).toBe("44000");
  } finally {
    await panel.dispose();
  }
});

it("keeps the completed interview open until a local reset removes its draft", async () => {
  const id = "synthetic-local-w2-reset";
  const key = getGuidedFlowStorageKey(id);
  const workspace = ensureWorkspace(localStorage, id);
  saveGuidedFlowState(localStorage, id, { ...wageDraft(), phase: "complete" });
  const removeItem = Storage.prototype.removeItem;
  let rejectRemoval = true;
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, name) {
    if (rejectRemoval && name === key) throw new DOMException("Synthetic removal denied", "SecurityError");
    removeItem.call(this, name);
  });
  const panel = await mountGuidedPanel(<GuidedInterviewShell
    workspace={workspace}
    beforeGuidedWrite={() => { requireCurrentLocalWorkspace(localStorage, workspace); }}
    onExitGuided={() => {}}
  />);
  try {
    await panel.click("Start Again");
    expect(panel.container.querySelector('[role="alert"]')?.textContent ?? "").toContain("Could not reset guided answers");
    expect(loadGuidedFlowState(localStorage, id)?.phase).toBe("complete");
    rejectRemoval = false;
    await panel.click("Start Again");
    expect(loadGuidedFlowState(localStorage, id)).toBeNull();
    expect([...panel.container.querySelectorAll("button")].some(button => button.textContent?.trim() === "Start Again")).toBe(false);
  } finally {
    await panel.dispose();
  }
});

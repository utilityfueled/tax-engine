// @vitest-environment jsdom
// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { guidedMarketplaceNonspecifiedStopState } from "../../fixtures/guided-marketplace-nonspecified-stop";

it("edits the actual stopped plan through the full shell without a deduction override", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const state = guidedMarketplaceNonspecifiedStopState();
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === "adjustments");
  state.completedSections = ["personal-info", "income-w2", "income-self-employment"];
  const workspace = createWorkspaceRecord("actual-nonspecified-stop"); workspace.returnSummary.targetTaxYear = 2025;
  saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {}), previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? "{}") as GuidedFlowState;
  const control = (label: string) => {
    const node = [...host.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!node) throw new Error(`Missing ${label}`); return node;
  };
  const change = async (label: string, value: string) => {
    const node = control(label);
    const setter = Object.getOwnPropertyDescriptor(node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error(`Missing native setter for ${label}`);
    await act(async () => {
      setter.call(node, value);
      node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    expect(control("Plan 3: Business or shareholder employer").value).toBe("scheduleC");
    expect(control("Plan 3 payment 1: Original premium").value).toBe("500");
    await change("Plan 3: Policy reference", "Edited actual nonspecified source");
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(), "adjustments").status).toBe("partial");
    await change("Health insurance sources checked after the last edit", "true");
    await change("Marketplace sources checked after the last edit", "true");
    expect(validateSection(saved(), "adjustments").status).toBe("complete");
    expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved()))).schedule1?.seHealthInsurance.toFixed()).toBe("7646");
    await change("Plan 3 payment 1: Owner or business paid share", "");
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[2]?.payments[0]?.ownerOrBusinessPaid).toBe("");
    expect(validateSection(saved(), "adjustments").status).toBe("partial");
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, "scrollTo", previous); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

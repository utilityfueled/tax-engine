// @vitest-environment jsdom
// Spec: spec/federal/educator-bond-reissue-coordination.yaml visible-originals.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState } from "@/lib/guided-interview-flow";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedEducatorBondReissueState } from "../../fixtures/guided-educator-bond-reissues";

it("reaches and reconfirms actual reissue sources after an educator receipt edit", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container), state = guidedEducatorBondReissueState(), route = buildSectionRoute(state.segmentation);
  state.currentSectionIndex = route.findIndex(section => section.id === "adjustments");
  state.completedSections = route.slice(0, state.currentSectionIndex).map(section => section.id);
  const workspace = createWorkspaceRecord("fictional-educator-bond-navigation"); workspace.returnSummary.targetTaxYear = 2025;
  saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const oldScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing actual control: ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing field setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function next() {
    const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === "Continue");
    if (!button) throw new Error("Missing ordinary Continue control");
    await act(async () => button.click());
  }
  const active = () => container.querySelector(".guided-progress-step-active")?.textContent;
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? "{}");
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    expect(active()).toBe("Adjustments");
    await change("Educator 1, expense 1: Actual paid cost", "");
    await next(); expect(active()).toBe("Adjustments");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change("Educator 1, expense 1: Actual paid cost", "400");
    for (const person of [1, 2]) await change(`Educator ${person}: Sources checked after the last edit`, "true");
    expect(saved().sectionData.credits.savingsBondEducation.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await next(); expect(active()).toBe("Deductions");
    await next(); expect(active()).toBe("Tax Credits");
    await next(); expect(active()).toBe("Tax Credits");
    await change("Original reissue history checked after the last edit", "true");
    await change("Current Form 1099-INT interest reconciled with actual bond reporting history", "true");
    await change("All bond and education sources checked after the last edit", "true");
    expect(saved().sectionData.adjustments.educatorExpenseSources.map((source: { sourceFactsConfirmed: boolean | null }) => source.sourceFactsConfirmed)).toEqual([null, null]);
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    const adjustmentStep = [...container.querySelectorAll(".guided-progress-steps button")].find(button => button.textContent === "Adjustments");
    if (!(adjustmentStep instanceof HTMLButtonElement)) throw new Error("Missing previously visited adjustments step");
    await act(async () => adjustmentStep.click());
    for (const person of [1, 2]) await change(`Educator ${person}: Sources checked after the last edit`, "true");
    expect(saved().sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await next(); expect(active()).toBe("Deductions");
    await next(); expect(active()).toBe("Tax Credits");
    await next(); expect(active()).toBe("Other Taxes");
    await next(); expect(active()).toBe("Payments & Withholding");
    await change("Estimated-tax sources checked after the last edit", "true");
    const input = buildTaxInputFromGuidedData(saved());
    expect(input).not.toBeNull(); if (!input) throw new Error("Actual records remain unreachable");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed()).toBe("79700");
  } finally {
    await act(async () => root.unmount()); container.remove(); scroll.mockRestore(); vi.unstubAllGlobals();
    if (oldScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", oldScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));
  }
});

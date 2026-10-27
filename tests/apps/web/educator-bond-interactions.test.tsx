// @vitest-environment jsdom
// Spec: spec/federal/educator-bond-rational-magi.yaml visible-source-choice.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EducatorSourceDetails } from "@/components/guided-interview/educator-source-details";
import { SavingsBondSourceDetails } from "@/components/guided-interview/savings-bond-source-details";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, updateSectionData } from "@/lib/guided-interview-flow";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedEducatorBondState } from "../../fixtures/guided-educator-bond";

it("collects exact bond coordination through both real source panels", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let latest = guidedEducatorBondState();
  for (const source of latest.sectionData.adjustments?.educatorExpenseSources ?? []) delete source.savingsBondReductionMethod;
  function Harness() {
    const [state, setState] = useState(latest);
    const commit = (next: typeof state) => { latest = next; setState(next); };
    return <>
      <EducatorSourceDetails sources={state.sectionData.adjustments?.educatorExpenseSources} taxYear={state.taxYear}
        onChange={educatorExpenseSources => commit(updateSectionData(state, "adjustments", { ...state.sectionData.adjustments, educatorExpenseSources }))} />
      <SavingsBondSourceDetails data={state.sectionData.credits?.savingsBondEducation}
        onChange={savingsBondEducation => commit(updateSectionData(state, "credits", { ...state.sectionData.credits, savingsBondEducation }))} />
    </>;
  }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing actual control: ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing field setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    for (const person of [1, 2]) await change(`Educator ${person}: Savings-bond reduction method`, "return_sources");
    expect(latest.sectionData.adjustments?.educatorExpenseSources?.map(source => source.excludedSavingsBondInterest)).toEqual(["", ""]);
    expect(latest.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBeNull();
    for (const person of [1, 2]) await change(`Educator ${person}: Sources checked after the last edit`, "true");
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change("All bond and education sources checked after the last edit", "true");
    const saved = JSON.parse(JSON.stringify(latest)), input = buildTaxInputFromGuidedData(saved);
    expect(input).not.toBeNull(); if (!input) throw new Error("Confirmed actual controls did not reach the return");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).adjustmentsToIncome.toFixed()).toBe("200");
    expect(input.adjustments?.educatorExpenseSources?.[0]?.excludedSavingsBondInterest).toBeUndefined();
    await change("Educator 1: Savings-bond reduction method", "");
    await change("Educator 1: Sources checked after the last edit", "true");
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData.adjustments?.educatorExpenseSources?.[0]?.expenses[0]?.healthOrPhysicalEducation).toBe(false);
    await change("Educator 1: Excludable savings-bond interest from Form 8815", "0");
    expect(latest.sectionData.adjustments?.educatorExpenseSources?.[0]?.excludedSavingsBondInterest).toBe("0");
    expect(latest.sectionData.adjustments?.educatorExpenseSources?.[0]?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("reaches the later bond confirmation through normal interview navigation", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container), state = guidedEducatorBondState(), route = buildSectionRoute(state.segmentation);
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
    await change("All bond and education sources checked after the last edit", "true");
    const input = buildTaxInputFromGuidedData(saved());
    expect(input).not.toBeNull(); if (!input) throw new Error("Actual records remain unreachable");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed()).toBe("79800");
    await next(); expect(active()).toBe("Other Taxes");
  } finally {
    await act(async () => root.unmount()); container.remove(); scroll.mockRestore(); vi.unstubAllGlobals();
    if (oldScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", oldScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));
  }
});

// @vitest-environment jsdom
// Spec: spec/federal/marketplace-health-business-gross-sources.yaml.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HealthInsuranceSourceDetails } from '@/components/guided-interview/health-insurance-source-details';
import { healthInsuranceSourceOptions, type HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedMarketplaceNegativeLimitState } from '../../fixtures/guided-marketplace-negative-limit';

it('edits original partnership gross facts through the health source panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const state = guidedMarketplaceNegativeLimitState();
  let data: HealthInsuranceData = structuredClone(state.sectionData.adjustments!.healthInsuranceFacts!);
  delete data.partnershipGrossIncomeSources;
  const sources = healthInsuranceSourceOptions(undefined, state.sectionData['income-w2']?.entries, state.sectionData.adjustments?.k1LossSources);
  const render = () => root.render(<HealthInsuranceSourceDetails data={data} sources={sources} onChange={next => { data = next; render(); }} />);
  const button = (label: string) => {
    const found = [...host.querySelectorAll('button')].find(node => node.textContent === label);
    if (!found) throw new Error(`Missing ${label}`); return found;
  };
  const change = async (label: string, value: string) => {
    const node = [...host.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!node) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(node, value); node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  try {
    await act(async () => render());
    await act(async () => button('Add partnership gross-income statements').click());
    await act(async () => button('Add actual partnership gross statement').click());
    await change('Gross statement 1: Original partnership', 'scheduleK1:0');
    expect(data.partnershipGrossIncomeSources?.statements[0].originalK1?.ordinaryIncome).toBe('5000');
    expect(data.partnershipGrossIncomeSources?.statements[0].grossIncome).toBe('');
    expect(data.partnershipGrossIncomeSources?.sourceFactsConfirmed).toBeNull();
    await change('Gross statement 1: Actual business gross income', '10,000.01');
    await change('Gross statement 1: Statement checked after the last edit', 'true');
    await change('Gross statements checked after the last edit', 'true');
    expect(data.partnershipGrossIncomeSources?.statements[0].sourceFactsConfirmed).toBe(true);
    await change('Gross statement 1: Actual business gross income', '');
    expect(data.partnershipGrossIncomeSources?.statements[0].grossIncome).toBe('');
    expect(data.partnershipGrossIncomeSources?.statements[0].sourceFactsConfirmed).toBeNull();
    expect(data.partnershipGrossIncomeSources?.sourceFactsConfirmed).toBeNull();
    expect(data.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("reconciles actual gross statements through the full shell", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const state = guidedMarketplaceNegativeLimitState();
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === "adjustments");
  state.completedSections = ["personal-info", "income-w2"];
  const workspace = createWorkspaceRecord("actual-negative-w15"); workspace.returnSummary.targetTaxYear = 2025;
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
    expect(control("Gross statement 1: Original partnership").value).toBe("scheduleK1:0");
    expect(control("Gross statement 1: Actual business gross income").value).toBe("10000");
    await change("Gross statement 1: Attachment reference", "Edited actual gross statement");
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.partnershipGrossIncomeSources?.sourceFactsConfirmed).toBeNull();
    expect(saved().sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
    expect(saved().sectionData.adjustments?.k1LossSources?.activities?.[0]?.basis?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(), "adjustments").status).toBe("partial");
    for (const title of ["K-1 and qualified loss sources", "K-1 1 original and histories", "K-1 2 original and histories"]) {
      const summary = [...host.querySelectorAll("summary")].find(node => node.textContent === title);
      if (!summary) throw new Error(`Missing ${title}`);
      await act(async () => summary.click());
    }
    for (const prefix of ["K-1 1", "K-1 2"]) {
      for (const source of ["basis", "at risk", "prior at-risk history", "prior passive history", "SE", "prior SE history"]) {
        await change(`${prefix} ${source} checked after the last edit`, "true");
      }
    }
    await change("Business classification checked after the last edit", "true");
    await change("K-1 packet checked after the last edit", "true");
    for (const label of ["Gross statement 1: Statement checked after the last edit", "Gross statement 2: Statement checked after the last edit", "Gross statements checked after the last edit", "Health insurance sources checked after the last edit", "Marketplace sources checked after the last edit"]) await change(label, "true");
    expect(validateSection(saved(), "adjustments")).toMatchObject({ status: "complete" });
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved())));
    expect([result.schedule1?.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962?.ptcAllowed.toFixed()]).toEqual(["4647", "43586", "3577"]);
    await change("Gross statement 1: Actual business gross income", "");
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.partnershipGrossIncomeSources?.statements[0]?.grossIncome).toBe("");
    expect(validateSection(saved(), "adjustments").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, "scrollTo", previous); else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

// @vitest-environment jsdom
// Spec: charitable-cod-modified-composition.yaml source-panel.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { SectionPayments } from '@/components/guided-interview/section-payments';
import { CharitableCarryoverDetails } from '@/components/guided-interview/charitable-carryover-details';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { buildGuidedCodNol } from '@/lib/guided-cod-nol';
import { buildCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { buildGuidedNetOperatingLoss } from '@/lib/guided-net-operating-loss';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedCharitableCodModifiedState } from '../../fixtures/guided-charitable-cod-modified';

it('reconfirms actual debt and both histories through the existing source panels', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCharitableCodModifiedState(); let latest: GuidedFlowState = state;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  const originalLosses = structuredClone(state.sectionData.adjustments?.netOperatingLossSources?.vintages);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <><section data-source="adjustments"><SectionAdjustments data={current.sectionData.adjustments} hasSelfEmployment
      hasStudentLoans={false} hasHsa={false} filingStatus="single" taxYear={2025}
      onDataChange={next => { latest = updateSectionData(current, 'adjustments', next); setCurrent(latest); }} /></section>
      <section data-source="deductions"><CharitableCarryoverDetails data={current.sectionData.deductions?.charitableCarryoverSources}
        onChange={charitableCarryoverSources => { latest = updateSectionData(current, 'deductions', { ...current.sectionData.deductions, charitableCarryoverSources }); setCurrent(latest); }} /></section>
      <section data-source="payments"><SectionPayments data={current.sectionData.payments} taxYear={2025}
        onDataChange={next => { latest = updateSectionData(current, 'payments', next); setCurrent(latest); }} /></section></>;
  }
  async function change(scope: 'adjustments' | 'deductions' | 'payments', label: string, value: string) {
    const container = element.querySelector(`[data-source="${scope}"]`);
    const field = [...(container?.querySelectorAll('label') ?? [])].find(node => node.querySelector('.guided-field-label')?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing actual source control ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await change('adjustments', 'Debt 1 Box 2 canceled debt', '5001');
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData.adjustments?.codNolSources?.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
    expect(latest.sectionData.adjustments?.codNolSources?.debts?.[0]?.interestIncluded).toBe('0');
    expect(latest.sectionData.adjustments?.codNolSources?.title11Case).toBe(false);
    for (const label of ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
      'Canceled-debt packet checked after the last edit', 'Charitable carryover sources checked after the last edit',
      'Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit',
      'Regular NOL sources checked after the last edit', 'Current business 1 sources checked after the last edit',
      'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit']) await change('adjustments', label, 'true');
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change('deductions', 'Charitable carryover sources checked after the last edit', 'true');
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
    await change('payments', 'Estimated-tax sources checked after the last edit', 'true');
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(latest)));
    expect([result.nolDeduction,result.netOperatingLoss?.determinedCharitableCarryover?.reduction,
      result.carryforwards.nolCarryforward,result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
      .toEqual(['39200','9408','55799','10399']);
    expect(latest.sectionData.adjustments?.netOperatingLossSources?.vintages).toEqual(originalLosses);
    await change('adjustments', 'Debt 1 Box 3 interest included', '');
    expect(buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(latest)))).toBeNull();
    expect(latest.sectionData.adjustments?.codNolSources?.debts?.[0]?.interestIncluded).toBe('');
    expect(latest.sectionData.adjustments?.codNolSources).not.toHaveProperty('carryforward');
  } finally { await act(async () => root.unmount()); element.remove(); }
});

// Spec: charitable-cod-modified-composition.yaml section-navigation.
it('reaches the later regular charitable confirmation without confirming it during navigation', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedCharitableCodModifiedState();
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments');
  state.completedSections = ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'];
  const workspace = createWorkspaceRecord('charitable-cod-later-confirmation'); workspace.returnSummary.targetTaxYear = 2025;
  saveGuidedFlowState(localStorage, workspace.id, state);
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
  async function change(label: string, value: string) {
    const control = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing actual source control ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(control, value);
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    await change('Debt 1 Box 2 canceled debt', '5001');
    expect(saved().sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
    expect(saved().sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(), 'adjustments').status).toBe('partial');
    for (const label of ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
      'Canceled-debt packet checked after the last edit', 'Charitable carryover sources checked after the last edit',
      'Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit',
      'Regular NOL sources checked after the last edit', 'Current business 1 sources checked after the last edit',
      'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit']) await change(label, 'true');
    const pending = saved(), adjustments = pending.sectionData.adjustments;
    expect(pending.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    expect(() => buildGuidedCodNol(adjustments?.codNolSources, pending)).toThrow(/charitable carryover/i);
    expect(() => buildCurrentLossOrigin(adjustments?.currentLossOrigin, pending)).toThrow(/charitable carryover/i);
    expect(() => buildGuidedNetOperatingLoss(adjustments?.netOperatingLossSources, pending.taxYear,
      pending.segmentation.filingStatus, pending.sectionData['personal-info'], pending.sectionData.deductions, adjustments?.k1LossSources)).toThrow(/charitable carryover/i);
    expect(validateSection(pending, 'adjustments').status).toBe('complete');
    const next = [...element.querySelectorAll('button')].find(button => button.textContent === 'Continue');
    if (!next) throw new Error('Missing actual Continue control'); await act(async () => next.click());
    expect([...element.querySelectorAll('h2')].some(node => node.textContent === 'Deductions')).toBe(true);
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change('Charitable carryover sources checked after the last edit', 'false');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change('Charitable carryover sources checked after the last edit', 'true');
    expect(validateSection(saved(), 'deductions').status).toBe('complete');
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    for (let step = 0; step < 3; step++) {
      const nextSection = [...element.querySelectorAll('button')].find(button => button.textContent === 'Continue');
      if (!nextSection) throw new Error('Missing actual Continue control'); await act(async () => nextSection.click());
    }
    expect([...element.querySelectorAll('h2')].some(node => node.textContent === 'Payments & Withholding')).toBe(true);
    expect(saved().sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
    await change('Estimated-tax sources checked after the last edit', 'true');
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved())));
    expect([result.nolDeduction, result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
      .toEqual(['39200', '55799', '10399']);
    await act(async () => root.render(<GuidedInterviewShell key="reload" workspace={workspace} onExitGuided={() => {}} />));
    expect([...element.querySelectorAll('h2')].some(node => node.textContent === 'Payments & Withholding')).toBe(true);
    expect(saved().sectionData.adjustments?.codNolSources?.debts?.[0]?.interestIncluded).toBe('0');
    expect(saved().sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBe(true);
    expect(buildTaxInputFromGuidedData(saved())).not.toBeNull();
  } finally {
    await act(async () => root.unmount()); element.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id));
    scroll.mockRestore(); vi.unstubAllGlobals();
    if (previousScroll) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previousScroll); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

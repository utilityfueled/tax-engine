// @vitest-environment jsdom
// Spec: spec/federal/guided-k1-charitable-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { emptyDeductionData, buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type DeductionData, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { startCompleteInterview } from '../../guided-interview/complete-facts';
import { actualGuidedK1Sources } from '../../fixtures/guided-k1-qbi-sources';

it('collects actual K1 charity originals receipts and histories without defaults', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: DeductionData = { ...emptyDeductionData };
  function Harness() { const [data, setData] = useState(latest); return <SectionDeductions data={data} taxYear={2025} filingStatus="single" onDataChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
  }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  const source = () => latest.k1CharitableSources?.statements?.[0];
  try {
    await act(async () => root.render(<Harness />));
    await click('Add K-1 charitable sources'); expect(latest.k1CharitableSources).toEqual({});
    await click('Add charitable K-1 statement'); expect(source()).toEqual({});
    await change('Charitable K-1 1 original ordinary income or loss', '-1000.10');
    await change('Charitable K-1 1 original cash contributions code A', '0');
    expect(source()?.original?.ordinaryIncome).toBe('-1000.10'); expect(source()?.original?.charitableCash).toBe('0');
    expect(source()?.original?.beginningBasis).toBeUndefined();
    await change('Charitable K-1 1 original owner', 'spouse');
    await change('Charitable K-1 1 regular and AMT treatment are the same', 'false');
    expect(source()?.sameRegularAmtTreatmentConfirmed).toBe(false);
    await click('Add Charitable K-1 1 current gift');
    await change('Charitable K-1 1 current gift 1 original source ID', 'private-original-gift');
    await change('Charitable K-1 1 current gift 1 adjusted basis share', '20.10');
    expect(source()?.basis?.currentContributions?.[0].contributionShare).toBeUndefined();
    await click('Add Charitable K-1 1 prior basis origin');
    await click('Add Charitable K-1 1 prior basis origin 1 use year');
    await change('Charitable K-1 1 prior basis origin 1 use 1 basis used', '0');
    expect(source()?.basis?.priorBasisSuspensions?.[0].basisUseHistory?.[0].basisAllowed).toBe('0');
    await click('Add Charitable K-1 1 recipient receipt');
    await change('Charitable K-1 1 receipt 1 qualified organization', 'false');
    expect(source()?.receipts?.[0].qualifiedOrganization).toBe(false);
    await click('Record no Charitable K-1 1 prior at-risk vintages');
    expect(source()?.atRisk?.priorLossHistory?.vintages).toEqual([]);
    expect(source()?.atRisk?.priorLossHistory?.sourceTaxYear).toBeUndefined();
    await change('K-1 charitable packet checked after the last edit', 'true');
    await change('Charitable K-1 1 basis checked after the last edit', 'true');
    expect(latest.k1CharitableSources?.sourceFactsConfirmed).toBe(true);
    await change('Charitable K-1 1 current gift 1 adjusted basis share', '20.11');
    expect(latest.k1CharitableSources?.sourceFactsConfirmed).toBeNull();
    expect(source()?.basis?.sourceFactsConfirmed).toBeNull();
    await change('Charitable K-1 1 regular and AMT treatment are the same', '');
    expect(source()?.sameRegularAmtTreatmentConfirmed).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
    expect(source()).not.toHaveProperty('allowedDeduction');
    await click('Remove K-1 charitable sources'); expect(latest.k1CharitableSources).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});

it('reaches linked charitable attachments from the blocked adjustments section', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['k1-loss-sources'], stateCode: null });
  const sources = actualGuidedK1Sources(), activity = sources.activities?.[0];
  if (!activity) throw new Error('Missing fictional actual K1');
  activity.allOtherAmountsZeroConfirmed = false; activity.allOtherNonCharitableAmountsZeroConfirmed = true;
  state.sectionData.adjustments = { k1LossSources: sources };
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments');
  state.completedSections = ['personal-info'];
  expect(validateSection(state, 'adjustments')).toMatchObject({ status: 'partial', allowSkip: false });
  const workspace = createWorkspaceRecord('linked-charity-source-reachability'); workspace.returnSummary.targetTaxYear = 2025;
  saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const elementScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    const deductionsStep = [...element.querySelectorAll<HTMLButtonElement>('.guided-progress-step')].find(node => node.textContent?.includes('Deductions'));
    expect(deductionsStep).toBeDefined(); expect(deductionsStep?.disabled).toBe(true);
    const add = [...element.querySelectorAll('button')].find(node => node.textContent === 'Add K-1 charitable sources');
    expect(add, 'The linked source collector must be reachable before validation can permit Continue').toBeDefined();
    await act(async () => add?.click());
    const sourceReference = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === 'K-1 charitable packet source reference')?.querySelector('input');
    if (!sourceReference) throw new Error('Missing actual source reference');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(sourceReference, 'Actual charitable attachment');
      sourceReference.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saved = JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
    expect(saved.sectionData.deductions?.k1CharitableSources).toEqual({ sourceReference: 'Actual charitable attachment', sourceFactsConfirmed: null });
    expect(saved.sectionData.adjustments?.k1LossSources?.activities?.[0].allOtherAmountsZeroConfirmed).toBe(false);
    expect(saved.sectionData.adjustments?.k1LossSources?.activities?.[0].allOtherNonCharitableAmountsZeroConfirmed).toBe(true);
    expect(saved.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved, 'adjustments').status).toBe('partial');
    expect(validateSection(saved, 'deductions').status).toBe('partial');
  } finally {
    await act(async () => root.unmount()); element.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (elementScroll) Object.defineProperty(HTMLElement.prototype, 'scrollTo', elementScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

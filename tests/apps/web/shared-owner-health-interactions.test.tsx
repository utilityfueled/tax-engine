// @vitest-environment jsdom
// Spec: spec/federal/shared-owner-marketplace-health.yaml.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceHealthOwnersState } from '../../fixtures/guided-marketplace-health-owners';
import { guidedSharedOwnerHealthRecords } from '../../fixtures/guided-shared-owner-health-records';

it('reaches both separate-plan original confirmations in the actual guide shell', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const state = guidedMarketplaceHealthOwnersState(), records = guidedSharedOwnerHealthRecords('household');
  state.sectionData.adjustments!.healthInsuranceFacts = records.health; state.sectionData.credits!.premiumTaxCredit = records.coverage;
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments');
  state.completedSections = ['personal-info', 'income-w2', 'income-self-employment'];
  const workspace = createWorkspaceRecord('actual-separate-plan-health'); workspace.returnSummary.targetTaxYear = 2025;
  saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}), previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
  function control(label: string) {
    const field = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`); return field;
  }
  async function change(label: string, value: string) {
    const field = control(label);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    expect(control('Plan 1 policy 1: Original Marketplace policy').value).toBe('form1095A:0');
    expect(control('Plan 2 policy 1: Original Marketplace policy').value).toBe('form1095A:1');
    expect(control('Plan 2 shared health person 1: Original covered person SSN').value).toBe('222-33-4444');
    expect(control('Allocation policy 2: Allocation situation').value).toBe('not_shared');
    await change('Plan 2 shared health: Source reference', 'Changed actual spouse link');
    expect(saved().sectionData.adjustments!.healthInsuranceFacts!.plans.every(plan => plan.sharedMarketplaceSources!.sourceFactsConfirmed === null)).toBe(true);
    expect(saved().sectionData.credits!.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();
    expect(validateSection(saved(), 'adjustments')).toMatchObject({ status: 'partial', allowSkip: false });
    for (const label of ['Plan 1 shared health: Person links checked after the last edit', 'Plan 2 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit', 'Allocation sources checked after the last edit', 'Marketplace sources checked after the last edit']) await change(label, 'true');
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    expect(saved().sectionData.adjustments!.healthInsuranceFacts!.plans.map(plan => [plan.accountHolder, plan.businessSourceId, plan.payments[0]!.grossPremium])).toEqual([['primary', 'scheduleC', '1000'], ['spouse', 'formW2:0', '250']]);
    await change("Plan 2 payment 1: Other person's paid share", '');
    expect(saved().sectionData.adjustments!.healthInsuranceFacts!.plans[1]!.payments[0]!.otherPersonPaid).toBe('');
    expect(validateSection(saved(), 'adjustments').status).toBe('partial');
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previous); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

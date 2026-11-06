// @vitest-environment jsdom
// Spec: spec/federal/marketplace-outside-person-health.yaml, ordinary-controls.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceOutsidePersonState } from '../../fixtures/guided-marketplace-outside-person';

it('edits actual outside child qualification and reconfirms the full interview sources', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), state = guidedMarketplaceOutsidePersonState(true);
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments'); state.completedSections = ['personal-info', 'income-self-employment'];
  const workspace = createWorkspaceRecord('actual-cash'); workspace.returnSummary.targetTaxYear = 2025; saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}), previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
  const field = (label: string) => {
    const control = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`); return control;
  };
  const change = async (label: string, value: string) => { const control = field(label); await act(async () => {
    Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(control, value);
    control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }); };
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    expect(field('Policy 1: Original recipient name').value).toBe('Jane Doe');
    expect(field('Plan 1 payment 1 share 2: Actual person advance premium tax credit').value).toBe('0');
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    expect(field('Person 3: Attained age at year end').value).toBe('26');
    const otherCredit = 'Plan 1 coverage family other return 1: Actual Form 8962 line 24';
    expect(field(otherCredit).value).toBe('0');
    expect(field('Plan 1 coverage family other return 1: Return status').value).toBe('completed');
    await change(otherCredit, '0.01');
    for (const label of ['Plan 1 coverage family: Sources checked after the last edit', 'Plan 1 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit', 'Allocation policy 1: Benchmark sources checked after the last edit', 'Allocation sources checked after the last edit', 'Marketplace sources checked after the last edit']) await change(label, 'true');
    expect(validateSection(saved(), 'adjustments').status).toBe('partial');
    await change(otherCredit, '0');
    for (const label of ['Plan 1 coverage family: Sources checked after the last edit', 'Plan 1 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit', 'Allocation policy 1: Benchmark sources checked after the last edit', 'Allocation sources checked after the last edit', 'Marketplace sources checked after the last edit']) await change(label, 'true');
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    await change('Person 3: Attained age at year end', '27');
    expect(validateSection(saved(), 'adjustments')).toMatchObject({ status: 'partial', allowSkip: false });
    expect(saved().sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
    for (const label of ['Plan 1 coverage family: Sources checked after the last edit', 'Plan 1 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit', 'Allocation policy 1: Benchmark sources checked after the last edit', 'Allocation sources checked after the last edit', 'Marketplace sources checked after the last edit']) await change(label, 'true');
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.persons.find(row => row.personId === 'outside')?.attainedAgeAtYearEnd).toBe('27');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.payments[0]?.grossPremium).toBe('1875');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.payments[0]?.ownerOrBusinessPaid).toBe('550');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.payments[0]?.otherPersonPaid).toBe('1325');
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.payments[0]?.personAmounts[1]?.advancePremiumTaxCredit).toBe('0');
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previous); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

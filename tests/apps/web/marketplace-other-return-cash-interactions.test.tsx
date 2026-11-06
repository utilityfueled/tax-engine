// @vitest-environment jsdom
// Spec: spec/federal/marketplace-other-return-cash.yaml, controls.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedMarketplaceOtherReturnCashState } from '../../fixtures/guided-marketplace-other-return-cash';

it('edits actual insurer cash and reimbursements with independent confirmations', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), state = guidedMarketplaceOtherReturnCashState('advance');
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments'); state.completedSections = ['personal-info', 'income-self-employment'];
  const workspace = createWorkspaceRecord('actual-paid'); workspace.returnSummary.targetTaxYear = 2025; saveGuidedFlowState(localStorage, workspace.id, state);
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
    const prefix = 'Plan 1 coverage family other return 1 cash';
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    expect(field('Plan 1 coverage family other return 1: Actual Form 8962 line 24').value).toBe('5000');
    expect(field(`${prefix} receipt 1: Cash paid to insurer`).value).toBe('100');
    expect(field(`${prefix} tax payment 1: Amount`).value).toBe('7000');
    await change(`${prefix} receipt 1: Cash paid to insurer`, '');
    const cashSource = () => saved().sectionData.adjustments!.healthInsuranceFacts!.plans[0].coverageFamilySources!.outsidePersonReturns![0].cashPaymentSources!;
    expect(cashSource().sourceFactsConfirmed).toBeNull();
    const reconfirm = async () => {
      for (const label of [`${prefix}: Sources checked after the last edit`, 'Plan 1 coverage family: Sources checked after the last edit',
        'Plan 1 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit',
        'Allocation sources checked after the last edit', 'Marketplace sources checked after the last edit']) await change(label, 'true');
    };
    await reconfirm();
    expect(validateSection(saved(), 'adjustments').status).toBe('partial');
    await change(`${prefix} receipt 1: Cash paid to insurer`, '100');
    const refund = [...host.querySelectorAll('button')].find(button => button.textContent === `${prefix} receipt 1: Add actual reimbursement`);
    if (!refund) throw new Error('Missing actual reimbursement control');
    await act(async () => refund.click());
    await change(`${prefix} receipt 1 reimbursement 1: Transaction ID`, 'actual-refund-1');
    await change(`${prefix} receipt 1 reimbursement 1: Date received`, '2025-12-31');
    await change(`${prefix} receipt 1 reimbursement 1: Amount`, '25.02');
    await change(`${prefix} receipt 1 reimbursement 1: Source reference`, 'Actual bank reimbursement');
    await reconfirm();
    expect(validateSection(saved(), 'adjustments').status).toBe('complete');
    expect(cashSource().premiumPayments![0].reimbursements![0]).toMatchObject({ sourceId: 'actual-refund-1', amount: '25.02' });
    expect(cashSource().otherReturnTaxPayments![0].amount).toBe('7000');
    const original = saved().sectionData.adjustments!.healthInsuranceFacts!.plans[0].payments[0];
    expect(original).toMatchObject({ grossPremium: '3000', ownerOrBusinessPaid: '400', otherPersonPaid: '600', advancePremiumTaxCredit: '2000' });
    expect(original.personAmounts.find(person => person.personId === 'outside')).toMatchObject({ amountPaid: '100', advancePremiumTaxCredit: '1000' });
    await change(`${prefix}: Sources checked after the last edit`, '');
    expect(validateSection(saved(), 'adjustments').status).toBe('partial');

  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previous); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

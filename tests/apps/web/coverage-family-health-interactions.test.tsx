// @vitest-environment jsdom
// Spec: spec/federal/guided-coverage-family-health.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { HealthInsuranceSourceDetails } from '@/components/guided-interview/health-insurance-source-details';
import { PremiumTaxCreditSourceDetails } from '@/components/guided-interview/premium-tax-credit-source-details';
import type { HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import { marketplacePolicyOptions } from '@/lib/guided-marketplace-health-facts';
import { GuidedInterviewShell } from '@/components/guided-interview/guided-interview-shell';
import { buildSectionRoute, getGuidedFlowStorageKey, saveGuidedFlowState, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { guidedCoverageFamilyHealthState } from '../../fixtures/guided-coverage-family-health';

function field(host: HTMLElement, label: string) {
  const control = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
  if (!control) throw new Error(`Missing ${label}`);
  return control;
}
async function change(host: HTMLElement, label: string, value: string) {
  const control = field(host, label);
  await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(control, value);
    control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find(node => node.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
it('collects exact monthly family facts and revokes nested confirmations', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const state = guidedCoverageFamilyHealthState(), coverage = state.sectionData.credits!.premiumTaxCredit!;
  let latest = state.sectionData.adjustments!.healthInsuranceFacts!;
  delete latest.plans[0]!.coverageFamilySources;
  latest.plans[0]!.payments = latest.plans[0]!.payments.slice(0, 1); latest.plans[0]!.months = latest.plans[0]!.months.slice(0, 1);
  coverage.policies[0]!.monthlyPremiums = coverage.policies[0]!.monthlyPremiums.slice(0, 1);
  const options = marketplacePolicyOptions(coverage.policies), blankOriginal = structuredClone(coverage);
  delete blankOriginal.policies[0]!.recipientName; delete blankOriginal.policies[0]!.recipientSsn; delete blankOriginal.policies[0]!.coveredIndividuals;
  function Harness() { const [data, set] = useState<HealthInsuranceData>(latest); return <><HealthInsuranceSourceDetails data={data} marketplacePolicies={options} onChange={next => { latest = next; set(next); }} /><PremiumTaxCreditSourceDetails data={blankOriginal} onChange={() => {}} /></>; }
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
  try {
    await act(async () => root.render(<Harness />));
    expect(field(host, 'Policy 1: Original recipient name')).toBeDefined();
    await click(host, 'Plan 1: Add monthly coverage-family sources');
    expect(latest.plans[0]!.coverageFamilySources).toMatchObject({ sourceTaxYear: '', sourceFactsConfirmed: null, policies: [], persons: [], months: [] });
    await click(host, 'Plan 1 coverage family: Copy linked original policies');
    expect(latest.plans[0]!.coverageFamilySources!.months[0]).toMatchObject({ coverageFamilySlcsp: '', personFacts: [], allCoveredPersonsIncludedConfirmed: null });
    await change(host, 'Plan 1 coverage family person 1: Health worksheet person', 'primary');
    await click(host, 'Plan 1 coverage family month 1: Add person eligibility');
    await change(host, 'Plan 1 coverage family month 1 person 1: Health worksheet person', 'primary');
    await change(host, 'Plan 1 coverage family month 1 person 1: Eligible for other minimum essential coverage', 'false');
    await change(host, 'Plan 1 coverage family month 1: Coverage-family SLCSP', '1,000.01');
    await change(host, 'Plan 1 coverage family: Sources checked after the last edit', 'true');
    await change(host, 'Health insurance sources checked after the last edit', 'true');
    expect(latest.plans[0]!.coverageFamilySources!.sourceFactsConfirmed).toBe(true);
    await change(host, 'Plan 1 coverage family month 1: Noncoverage-family SLCSP', '0');
    expect(latest.sourceFactsConfirmed).toBeNull(); expect(latest.plans[0]!.coverageFamilySources!.sourceFactsConfirmed).toBeNull();
    expect(latest.plans[0]!.coverageFamilySources!.months[0]!.personFacts[0]!.otherMecEligible).toBe(false);
    expect(latest.plans[0]!.coverageFamilySources!.months[0]!.coverageFamilySlcsp).toBe('1,000.01');
    await change(host, 'Plan 1 coverage family month 1: Noncoverage-family SLCSP', '');
    expect(latest.plans[0]!.coverageFamilySources!.months[0]!.nonCoverageFamilySlcsp).toBe('');
    expect(latest.plans[0]!.payments[0]!.grossPremium).toBe('1250'); expect(fetch).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); fetch.mockRestore(); }
});
it('reaches original people and family confirmations before adjustments Continue', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), state = guidedCoverageFamilyHealthState('no_advance');
  state.sectionData.credits!.premiumTaxCredit!.monthlyReconciliation[0]!.enrolleePremium = '1249';
  state.currentSectionIndex = buildSectionRoute(state.segmentation).findIndex(section => section.id === 'adjustments'); state.completedSections = ['personal-info', 'income-self-employment'];
  const workspace = createWorkspaceRecord('actual-coverage-family'); workspace.returnSummary.targetTaxYear = 2025; saveGuidedFlowState(localStorage, workspace.id, state);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {}), previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  const saved = () => JSON.parse(localStorage.getItem(getGuidedFlowStorageKey(workspace.id)) ?? '{}') as GuidedFlowState;
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} />));
    expect(field(host, 'Policy 1: Original recipient name').value).toBe('Jane Doe');
    await click(host, 'Calculate household amounts from allocation');
    expect(saved().sectionData.credits?.premiumTaxCredit?.monthlyReconciliation[0]?.enrolleePremium).toBe('1250');
    await change(host, 'Plan 1 coverage family: Source reference', 'Changed actual coverage evidence');
    expect(validateSection(saved(), 'adjustments')).toMatchObject({ status: 'partial', allowSkip: false });
    expect(saved().sectionData.credits?.premiumTaxCredit?.sourceFactsConfirmed).toBeNull();
    await change(host, 'Plan 1 coverage family: Sources checked after the last edit', 'true');
    await change(host, 'Plan 1 shared health: Person links checked after the last edit', 'true');
    await change(host, 'Health insurance sources checked after the last edit', 'true');
    await change(host, 'Allocation policy 1: Benchmark sources checked after the last edit', 'true');
    await change(host, 'Allocation sources checked after the last edit', 'true');
    await change(host, 'Marketplace sources checked after the last edit', 'true');
    expect(validateSection(saved(), 'adjustments')).toMatchObject({ status: 'complete' });
    expect(saved().sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.coverageFamilySources?.months[0]?.nonCoverageFamilySlcsp).toBe('500');
    expect(saved().sectionData.credits?.premiumTaxCredit?.policies[0]?.monthlyPremiums[0]?.enrolleePremium).toBe('1875');
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.removeItem(getGuidedFlowStorageKey(workspace.id)); scroll.mockRestore(); vi.unstubAllGlobals();
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previous); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});

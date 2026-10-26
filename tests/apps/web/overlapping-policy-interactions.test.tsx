// @vitest-environment jsdom
// Spec: spec/federal/form-8962-overlapping-policies.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionCredits } from '@/components/guided-interview/section-credits';
import { emptyCreditsData, type CreditsData } from '@/lib/guided-interview-flow';
import { buildPremiumTaxCreditInputs } from '@/lib/guided-premium-tax-credit-facts';
import { actualOverlappingPolicyData } from '../../fixtures/guided-overlapping-policy';
import { completePersonalInfo } from '../../guided-interview/complete-facts';

it('reaches actual overlapping benchmark sources and invalidates edits', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const source = actualOverlappingPolicyData(); delete source.sharedPolicyAllocations!.overlappingCoverage;
  let latest: CreditsData = { ...emptyCreditsData, premiumTaxCredit: source }; const originals = JSON.stringify(source.policies);
  function Harness() { const [data, setData] = useState(latest); return <SectionCredits data={data} hasDependents={false} filingStatus="single" taxYear={2025} personalData={completePersonalInfo} onDataChange={next => { latest = next; setData(next); }} />; }
  const control = (label: string) => [...container.querySelectorAll('label')].find(e => e.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
  async function change(label: string, value: string) { const c = control(label); if (!c) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(c.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(c, value); c.dispatchEvent(new Event(c.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(e => e.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click('Copy overlapping unshared months');
    expect(control('Overlapping benchmark source year')?.value).toBe('2025'); expect(control('Overlapping benchmark sources checked after the last edit')?.value).toBe('');
    await change('Overlapping benchmark worksheet reference', 'Actual complete worksheet'); await change('All overlapping benchmark months are included', 'true');
    await click('Month 1: Add actual benchmark group');
    const prefix = 'Month 1 group 1';
    expect(control(`${prefix}: Applicable benchmark`)?.value).toBe('');
    await change(`${prefix}: Source ID`, 'actual-group-one'); await change(`${prefix}: Source reference`, 'Actual Marketplace lookup'); await change(`${prefix}: Rating area`, 'WA-area-one');
    for (const index of [2, 3]) { const checkbox = container.querySelector<HTMLInputElement>(`input[aria-label="${prefix}: Include original policy ${index}"]`); if (!checkbox) throw new Error('Missing original policy checkbox'); await act(async () => checkbox.click()); }
    expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.overlappingCoverage!.months[0]!.groups[0]!.coveredIndividualSsns).toEqual(['111-22-3333']);
    await change(`${prefix}: Applicable benchmark`, '450');
    await change(`${prefix}: All unshared coverage-family members are included`, 'true'); await change(`${prefix}: These people share this rating area`, 'true');
    await change('Overlapping benchmark sources checked after the last edit', 'true'); await change('Allocation sources checked after the last edit', 'true');
    await click('Calculate household amounts from allocation'); expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(latest.premiumTaxCredit!.monthlyReconciliation).toHaveLength(1); expect(latest.premiumTaxCredit!.monthlyReconciliation[0]?.slcsp).toBe('750');
    await change('Overlapping benchmark sources checked after the last edit', 'true'); await change('Allocation sources checked after the last edit', 'true'); await change('Marketplace sources checked after the last edit', 'true');
    expect(buildPremiumTaxCreditInputs(latest.premiumTaxCredit, 2025, 'single', completePersonalInfo).form8962?.monthlyReconciliation).toHaveLength(1);
    await change(`${prefix}: Applicable benchmark`, '');
    expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.overlappingCoverage!.sourceFactsConfirmed).toBeNull(); expect(latest.premiumTaxCredit!.sourceFactsConfirmed).toBeNull();
    expect(latest.premiumTaxCredit!.sharedPolicyAllocations!.overlappingCoverage!.months[0]!.groups[0]!.slcsp).toBe(''); expect(JSON.stringify(latest.premiumTaxCredit!.policies)).toBe(originals);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

// @vitest-environment jsdom
// Spec: spec/federal/guided-eic-separated-spouse.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import { completeDependent, completePersonalInfo } from '../../guided-interview/complete-facts';

it('collects separated-spouse and actual child sources through the personal section', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: PersonalInfoData = { ...structuredClone(completePersonalInfo), dependentCount: '1',
    dependents: [{ ...completeDependent, ssn: '', qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }] };
  function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfs" onDataChange={next => { latest = next; setData(next); }} />; }
  function field(label: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`); return input;
  }
  async function change(label: string, value: string) {
    const input = field(label);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`);
    await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add separated-spouse EIC records');
    expect(latest.eicSeparatedSpouseSources).toEqual({});
    await click('Copy current household originals');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.original?.ssn).toBe('');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.otherEligibleClaimants).toBeUndefined();
    expect(field('Separated-spouse source tax year').value).toBe('');
    expect(field('Principal homes were apart throughout the last six months').value).toBe('');
    await change('Separated-spouse source tax year', '2025');
    await change('Principal homes were apart throughout the last six months', 'false');
    await change('Legally separated under a qualifying state-law agreement or decree', 'true');
    await click('Add the actual separation instrument');
    expect(field('Separation instrument type').value).toBe('');
    await change('Separation instrument type', 'written-separation-agreement');
    await change('Separation instrument source reference', 'Actual written instrument');
    await click('Child 1: record no other eligible claimants');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.otherEligibleClaimants).toEqual([]);
    await change('Child 1: timely valid employment-authorized SSN', 'false');
    await change('Separated-spouse sources checked after the last edit', 'true');
    await change('Child 1: lived with you in the United States for more than half the applicable year', '');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.livedWithTaxpayerInUnitedStatesMoreThanHalfYear).toBeNull();
    expect(latest.eicSeparatedSpouseSources?.sourceFactsConfirmed).toBeNull();
    expect(latest.eicSeparatedSpouseSources?.principalHomesApartLastSixMonths).toBe(false);
    expect(latest.eicSeparatedSpouseSources?.separationInstrument?.sourceReference).toBe('Actual written instrument');
    await click('Child 1: add another eligible claimant');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.otherEligibleClaimants).toEqual([{}]);
    await change('Child 1, claimant 1: claims any of the shared child tax benefits', 'false');
    expect(latest.eicSeparatedSpouseSources?.children?.[0]?.otherEligibleClaimants?.[0]?.claimsAnyChildTaxBenefit).toBe(false);
  } finally { await act(async () => root.unmount()); element.remove(); }
});

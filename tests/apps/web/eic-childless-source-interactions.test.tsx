// @vitest-environment jsdom
// Spec: spec/federal/eic-childless-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import { completeDependent, completePersonalInfo } from '../../guided-interview/complete-facts';

it('collects childless source and exception answers without inventing them', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: PersonalInfoData = { ...structuredClone(completePersonalInfo),
    standardDeductionFacts: { ...completePersonalInfo.standardDeductionFacts, primaryCanBeClaimedAsDependent: true },
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual sources', sourceFactsConfirmed: true } };
  function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfj" onDataChange={next => { latest = next; setData(next); }} />; }
  function field(label: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`); return input;
  }
  async function change(label: string, value: string) {
    const input = field(label);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(field('Your main home was in the United States for more than half of the applicable tax year').value).toBe('');
    expect(field("Your spouse's main home was in the United States for more than half of the applicable tax year").value).toBe('');
    await change('Your main home was in the United States for more than half of the applicable tax year', 'true');
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
    await change('Your main-home answer counts military duty outside the United States', 'true');
    expect(field('Your active-duty order was for more than 90 days or indefinite').value).toBe('');
    await change('Your military-duty source reference', 'Actual indefinite duty order');
    await change('Your active-duty order was for more than 90 days or indefinite', 'true');
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === 'Add your dependency filing-exception records');
    if (!button) throw new Error('Missing dependency exception control'); await act(async () => button.click());
    expect(latest.eicClaimantEligibility?.primaryChildless?.dependentException).toEqual({});
    await change('Your potential claimants were all not required to file', 'false');
    expect(latest.eicClaimantEligibility?.primaryChildless?.dependentException?.allPotentialClaimantsNotRequiredToFile).toBe(false);
    await change('EIC claimant sources checked after the last edit', 'true');
    await change('Your main home was in the United States for more than half of the applicable tax year', '');
    expect(latest.eicClaimantEligibility?.primaryChildless?.mainHomeInUnitedStatesMoreThanHalfYear).toBeNull();
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});

it('shows the claimant restriction when the filer has a qualifying child', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: PersonalInfoData = { ...structuredClone(completePersonalInfo), dependentCount: '1',
    dependents: [{ ...completeDependent, qualifiesForEIC: true }],
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual claimant records', sourceFactsConfirmed: true,
      primaryChildless: { qualifyingChildOfAnotherTaxpayer: false } } };
  function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfj" onDataChange={next => { latest = next; setData(next); }} />; }
  function field(label: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLSelectElement>('select');
    if (!input) throw new Error(`Missing ${label}`); return input;
  }
  async function change(label: string, value: string) {
    const input = field(label);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(field('You are another taxpayer’s qualifying child for EIC').value).toBe('false');
    expect(field('Your spouse is another taxpayer’s qualifying child for EIC').value).toBe('');
    expect(element.textContent).not.toContain('Your childless EIC sources');
    await change('You are another taxpayer’s qualifying child for EIC', 'true');
    expect(latest.eicClaimantEligibility?.primaryQualifyingChildOfAnotherTaxpayer).toBe(true);
    expect(latest.eicClaimantEligibility?.primaryChildless?.qualifyingChildOfAnotherTaxpayer).toBe(true);
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
    await change('You are another taxpayer’s qualifying child for EIC', '');
    expect(latest.eicClaimantEligibility?.primaryQualifyingChildOfAnotherTaxpayer).toBeNull();
    expect(latest.eicClaimantEligibility?.primaryChildless?.qualifyingChildOfAnotherTaxpayer).toBeNull();
    expect(field('You are another taxpayer’s qualifying child for EIC').value).toBe('');
  } finally { await act(async () => root.unmount()); element.remove(); }
});

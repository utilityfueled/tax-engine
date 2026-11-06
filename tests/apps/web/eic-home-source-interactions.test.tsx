// @vitest-environment jsdom
// Spec: spec/federal/guided-eic-home-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import { completeDependent, completePersonalInfo } from '../../guided-interview/complete-facts';

it('collects both home sources with a qualifying child without a dependency exception', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: PersonalInfoData = { ...structuredClone(completePersonalInfo), dependentCount: '1',
    dependents: [{ ...completeDependent, qualifiesForEIC: true }],
    standardDeductionFacts: { ...completePersonalInfo.standardDeductionFacts, primaryCanBeClaimedAsDependent: true },
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual claimant records', sourceFactsConfirmed: true } };
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
    expect(element.textContent).not.toContain('Add your dependency filing-exception records');
    await change("Your spouse's main home was in the United States for more than half of the applicable tax year", 'false');
    expect(latest.eicClaimantEligibility?.spouseChildless?.mainHomeInUnitedStatesMoreThanHalfYear).toBe(false);
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
    await change('Your main-home answer counts military duty outside the United States', 'true');
    expect(field('Your active-duty order was for more than 90 days or indefinite').value).toBe('');
    await change('Your military-duty source reference', 'Actual indefinite active-duty source');
    await change('Your active-duty order was for more than 90 days or indefinite', 'true');
    await change('EIC claimant sources checked after the last edit', 'true');
    await change("Your spouse's main home was in the United States for more than half of the applicable tax year", '');
    expect(latest.eicClaimantEligibility?.spouseChildless?.mainHomeInUnitedStatesMoreThanHalfYear).toBeNull();
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
    expect(latest.eicClaimantEligibility?.primaryChildless?.militaryDutySourceReference).toBe('Actual indefinite active-duty source');
  } finally { await act(async () => root.unmount()); element.remove(); }
});

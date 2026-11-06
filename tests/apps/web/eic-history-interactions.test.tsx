// @vitest-environment jsdom
// Spec: spec/federal/guided-eic-disallowance-history.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { completeW2Entry, startCompleteInterview } from '../../guided-interview/complete-facts';

it('collects actual separate EIC histories through the personal section', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  if (!latest.sectionData['personal-info']) throw new Error('Missing fictional personal source');
  latest.sectionData['personal-info'].eicClaimantEligibility = { sourceTaxYear: '2025', sourceReference: 'Fictional actual claimant evidence', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false, spouseQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false },
    spouseChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } };
  latest.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  function Harness() { const [state, setState] = useState(latest); return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="mfj" onDataChange={next => { latest = updateSectionData(state, 'personal-info', next); setState(latest); }} />; }
  function field(label: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing field ${label}`); return input;
  }
  async function change(label: string, value: string) {
    const input = field(label);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add EIC denial and allowance history');
    expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers).toBeUndefined();
    expect(field('EIC history source tax year').value).toBe('');
    await click('Copy actual filer identities');
    expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[1]?.originalTaxpayer?.ssn).toBe('222-33-4444');
    expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[0]?.denials).toBeUndefined();
    await change('EIC history source tax year', '2025'); await change('EIC history source reference', 'Fictional full IRS history');
    await change('Current EIC claim status', 'preparing'); await change('EIC history reviewed through', '2026-03-01'); await change('EIC preparation as of', '2026-03-01');
    for (const who of ['Primary filer', 'Spouse']) {
      await change(`${who}: history source reference`, `Fictional ${who} history`);
      await click(`${who}: record no prior EIC denials`); await click(`${who}: record no later IRS allowances`);
      await change(`${who}: all EIC history included`, 'true');
    }
    await change('Primary filer: history checked after the last edit', 'true'); await change('Spouse: history checked after the last edit', 'true');
    await change('EIC history checked after the last edit', 'true'); await change('EIC claimant sources checked after the last edit', 'true');
    const input = buildTaxInputFromGuidedData(latest); expect(input).not.toBeNull();
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).allLines.find(line => line.form === '1040' && line.line === '27a')?.value.toFixed()).toBe('649');
    await click('Spouse: add an actual EIC denial');
    expect(field('Spouse denial 1: assessment status').value).toBe('');
    await change('Spouse denial 1: assessment status', 'not-occurred');
    await change('Spouse denial 1: pending appeal', 'false');
    const packet = latest.sectionData['personal-info']?.eicDisallowanceHistory;
    expect(packet?.filers?.[1]?.denials?.[0]?.assessmentDate).toBeNull();
    expect(packet?.filers?.[1]?.denials?.[0]?.appealPending).toBe(false);
    expect(packet?.sourceFactsConfirmed).toBeNull(); expect(packet?.filers?.[0]?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change('Spouse denial 1: assessment status', '');
    expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[1]?.denials?.[0]?.assessmentDate).toBeUndefined();
    await click('Spouse: mark denial history unknown');
    expect(latest.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[1]?.denials).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});

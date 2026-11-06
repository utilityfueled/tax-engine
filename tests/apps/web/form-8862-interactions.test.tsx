// @vitest-environment jsdom
// Spec: spec/federal/guided-form-8862.yaml. Original fixtures are fictional.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actual, guidedForm8862 } from '../../fixtures/guided-form-8862';

it('records actual residence through the current form panel', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let latest = guidedForm8862(); delete actual(latest.sectionData['personal-info']).eicRecertificationSources;
  function Harness() { const [state, setState] = useState(latest); return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="single" onDataChange={next => { latest = updateSectionData(state, 'personal-info', next); setState(latest); }} />; }
  function field(label: string) {
    const input = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing actual source field ${label}`); return input;
  }
  async function change(label: string, value: string) { const input = field(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing action ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add actual current Form 8862 records');
    expect(field('Form 8862 current source tax year').value).toBe('');
    await click('Copy current Form 8862 household originals');
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.filers?.[0]?.homeDays).toBeUndefined();
    await change('Form 8862 current source tax year', '2025'); await change('Form 8862 current source reference', 'Fictional actual current sources');
    await change('Form 8862 primary filer: source reference', 'Fictional original primary household');
    await change('Form 8862 primary filer: applicable year start', '2025-01-01'); await change('Form 8862 primary filer: applicable year end', '2025-12-31');
    await click('Form 8862 primary filer: add actual residence days');
    expect(field('Form 8862 primary filer: actual U.S. home days').value).toBe('');
    await change('Form 8862 primary filer: residence source reference', 'Fictional actual calendar');
    await change('Form 8862 primary filer: actual U.S. home days', '364'); await change('Form 8862 primary filer: counted foreign extended-duty days', '0');
    await click('Form 8862 primary filer: record no temporary absences');
    await click('Form 8862 primary filer: add a temporary absence');
    await change('Form 8862 primary filer absence 1: source reference', 'Fictional actual medical visit');
    await change('Form 8862 primary filer absence 1: reason', 'medical'); await change('Form 8862 primary filer absence 1: days', '1');
    await change('Form 8862 primary filer: all days recorded without overlap', 'true');
    await change('Form 8862 all candidate children recorded', 'true');
    await change('Form 8862 current sources checked after the last edit', 'true');
    await change('Primary filer: history checked after the last edit', 'true'); await change('EIC history checked after the last edit', 'true');
    await change('EIC claimant sources checked after the last edit', 'true');
    let input = actual(buildTaxInputFromGuidedData(latest));
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).earnedIncomeCredit.toFixed()).toBe('649');
    expect(input.eic?.recertificationSources?.filers?.[0]?.homeDays?.temporaryAbsences?.[0]?.days).toBe(1);
    await change('Form 8862 primary filer: actual U.S. home days', ''); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.sourceFactsConfirmed).toBeNull();
    await change('Form 8862 primary filer: actual U.S. home days', '364');
    await change('Form 8862 current sources checked after the last edit', 'true');
    await change('Primary filer: history checked after the last edit', 'true'); await change('EIC history checked after the last edit', 'true'); await change('EIC claimant sources checked after the last edit', 'true');
    input = actual(buildTaxInputFromGuidedData(latest)); expect(calculateFederalTax(TaxYearInputSchema.parse(input)).earnedIncomeCredit.toFixed()).toBe('649');
    await click('Form 8862 primary filer: mark temporary absences unknown');
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.filers?.[0]?.homeDays?.temporaryAbsences).toBeUndefined();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('collects actual birth death and attachment evidence without inferring a child answer', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let latest = guidedForm8862(); const personal = actual(latest.sectionData['personal-info']);
  personal.dateOfBirth = '2003-02-01'; personal.dependentCount = '1';
  personal.dependents = [{ firstName: 'Alex', lastName: 'Example', ssn: '', dateOfBirth: '2025-10-01', relationship: 'child', monthsLivedWithYou: '3', qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }];
  function Harness() { const [state, setState] = useState(latest); return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="single" onDataChange={next => { latest = updateSectionData(state, 'personal-info', next); setState(latest); }} />; }
  function field(label: string) { const input = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); return input; }
  async function change(label: string, value: string) { const input = field(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function confirm() { for (const label of ['Form 8862 current sources checked after the last edit', 'Primary filer: history checked after the last edit', 'EIC history checked after the last edit', 'EIC claimant sources checked after the last edit']) await change(label, 'true'); }
  try {
    await act(async () => root.render(<Harness />)); await click('Copy current Form 8862 household originals');
    const prefix = 'Form 8862 child 1';
    expect(field(`${prefix}: timely valid employment-authorized SSN`).value).toBe('');
    expect(actual(latest.sectionData['personal-info']?.eicRecertificationSources?.children?.[0]).homeDays).toBeUndefined();
    await change('Form 8862 primary filer: source reference', 'Fictional corrected claimant record');
    await change(`${prefix}: source reference`, 'Fictional original child evidence');
    await change(`${prefix}: lived with you in the United States for more than half the applicable year`, 'true');
    await change(`${prefix}: uses a special residence-period rule`, 'true');
    await change(`${prefix}: married at year end`, 'false'); await change(`${prefix}: filed a joint return`, 'false');
    await change(`${prefix}: timely valid employment-authorized SSN`, 'false');
    await click(`${prefix}: record no other eligible claimants`); await change(`${prefix}: all other eligible claimants recorded`, 'true');
    await change(`${prefix}: death status during claim year`, 'deceased'); await change(`${prefix}: actual death date`, '2025-12-31');
    await click(`${prefix}: add actual residence days`); await change(`${prefix}: residence source reference`, 'Fictional actual family calendar');
    await change(`${prefix}: actual U.S. home days`, '47'); await change(`${prefix}: counted foreign extended-duty days`, '0');
    await click(`${prefix}: record no temporary absences`); await change(`${prefix}: all days recorded without overlap`, 'true');
    await change('Form 8862 all candidate children recorded', 'true'); await confirm();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull(); // The birth/death exception still needs real evidence.
    await click(`${prefix}: add actual live-birth document`); await change(`${prefix}: live-birth source reference`, 'Fictional actual hospital birth record');
    await change(`${prefix}: live-birth document type`, 'hospital_record'); await change(`${prefix}: document shows live birth`, 'true');
    await change(`${prefix}: actual document copy available to attach`, 'false'); await confirm(); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change(`${prefix}: actual document copy available to attach`, 'true'); await confirm();
    const built = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(latest))), result = calculateFederalTax(built);
    expect(result.earnedIncomeCredit.toFixed()).toBe('3409');
    expect(built.eic?.recertificationSources?.children?.[0]?.homeDays?.actualUnitedStatesDays).toBe(47);
    expect(result.scheduleEIC?.form8862?.requiredChildEvidenceSourceIds).toEqual(['dependent:0']);
    expect(field(`${prefix}: permanently and totally disabled`).value).toBe('');
    await change(`${prefix}: death status during claim year`, ''); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

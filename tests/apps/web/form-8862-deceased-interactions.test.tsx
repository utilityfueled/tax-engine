// @vitest-environment jsdom
// Spec: spec/federal/form-8862-deceased-claimant.yaml. Explicit fictional facts.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { copyForm8862Household } from '@/lib/guided-form-8862';
import { actual, guidedForm8862 } from '../../fixtures/guided-form-8862';

it('does not copy a prior household marriage record onto replacement filers', () => {
  const state = guidedForm8862(true), personal = actual(state.sectionData['personal-info']), current = actual(personal.eicRecertificationSources);
  current.jointReturnAfterDeath = { sourceReference: 'Fictional actual marriage record', survivingSpouseRemarriedBeforeOwnYearEnd: false };
  expect(copyForm8862Household(personal, 'mfj', current).jointReturnAfterDeath).toEqual(current.jointReturnAfterDeath);
  actual(personal.spouse).firstName = 'Replacement'; const before = structuredClone(personal);
  const copied = copyForm8862Household(personal, 'mfj', current);
  expect(copied.jointReturnAfterDeath).toBeUndefined(); expect(copied.sourceFactsConfirmed).toBeNull();
  expect(copied.filers?.[1]?.sourceReference).toBeUndefined(); expect(personal).toEqual(before);
});

it('collects joint death-period facts and reconfirms actual separate residence records', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  let latest = guidedForm8862(true); const personal = actual(latest.sectionData['personal-info']);
  Object.assign(actual(personal.standardDeductionFacts), { primaryDeceased: true, primaryDeathDate: '2025-06-30', shortTaxYear: false });
  const current = actual(personal.eicRecertificationSources);
  Object.assign(actual(current.filers?.[0]), { applicableYearEnd: '2025-06-30' });
  actual(current.filers?.[0]?.homeDays).actualUnitedStatesDays = '91'; actual(current.filers?.[1]?.homeDays).actualUnitedStatesDays = '183';
  function Harness() { const [state, setState] = useState(latest); return <SectionPersonalInfo data={state.sectionData['personal-info']} filingStatus="mfj" onDataChange={next => { latest = updateSectionData(state, 'personal-info', next); setState(latest); }} />; }
  function field(label: string) { const input = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing actual field ${label}`); return input; }
  async function change(label: string, value: string) { const input = field(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing action ${label}`); await act(async () => button.click()); }
  async function confirm() { for (const name of ['Form 8862 current sources checked after the last edit', 'Primary filer: history checked after the last edit', 'Spouse: history checked after the last edit', 'EIC history checked after the last edit', 'EIC claimant sources checked after the last edit']) await change(name, 'true'); }
  try {
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await act(async () => root.render(<Harness />)); await click('Add actual joint-return-after-death records');
    expect(field('Form 8862 joint death-period source reference').value).toBe('');
    expect(field('Did the surviving spouse remarry before the end of their own tax year?').value).toBe('');
    await change('Form 8862 joint death-period source reference', 'Fictional actual marriage and death records');
    await change('Did the surviving spouse remarry before the end of their own tax year?', 'true'); await confirm();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change('Did the surviving spouse remarry before the end of their own tax year?', 'false');
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.sourceFactsConfirmed).toBeNull(); await confirm();
    const input = TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(latest))), result = calculateFederalTax(input);
    expect(result.earnedIncomeCredit.toFixed()).toBe('649');
    expect(result.scheduleEIC?.form8862?.physical.claimantRows?.map(row => [row.line9Days, row.applicableYearDays])).toEqual([[91, 181], [183, 365]]);
    const reloaded = JSON.parse(JSON.stringify(latest)) as typeof latest;
    expect(reloaded.sectionData['personal-info']?.eicRecertificationSources?.jointReturnAfterDeath?.survivingSpouseRemarriedBeforeOwnYearEnd).toBe(false);
    expect(calculateFederalTax(TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(reloaded)))).earnedIncomeCredit.toFixed()).toBe('649');
    await change('Actual primary taxpayer death date', '2025-07-01');
    expect(buildTaxInputFromGuidedData(latest)).toBeNull(); await confirm(); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change('Actual primary taxpayer death date', '2025-06-30'); await confirm();
    await change('Did the surviving spouse remarry before the end of their own tax year?', ''); await confirm();
    expect(latest.sectionData['personal-info']?.eicRecertificationSources?.jointReturnAfterDeath?.survivingSpouseRemarriedBeforeOwnYearEnd).toBeNull();
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change('Did the surviving spouse remarry before the end of their own tax year?', 'false'); await confirm();
    expect(calculateFederalTax(TaxYearInputSchema.parse(actual(buildTaxInputFromGuidedData(latest)))).earnedIncomeCredit.toFixed()).toBe('649');
    await click('Remove joint-return-after-death records'); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

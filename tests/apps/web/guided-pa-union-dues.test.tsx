// @vitest-environment jsdom
/** Spec: state/pa-guided-union-dues.yaml. */
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { SectionStateReturn } from '@/components/guided-interview/section-state-return';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedPAOrdinarySourceInput, loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { confirmGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { prepareGuidedPAUnionDues } from '@/lib/guided-pa-union-dues';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedPAOrdinaryPanelFixture, required } from '../../fixtures/guided-pa-ordinary-panels';
import { mountGuidedPanel } from './guided-panel-dom';

it('collects actual Pennsylvania union dues through the state section and replays the saved original', async () => {
  const f = guidedPAOrdinaryPanelFixture();
  required(f.state.sectionData['income-w2']).entries[0].allocatedTips = '0';
  const federalOriginal = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(f.state)));
  const residency = confirmGuidedPAResidencySources(federalOriginal, required(f.data.paResidencySources));
  f.data.paResidencySources = residency;
  const [payroll] = residency.wages[0].payroll;
  Object.assign(payroll, { serviceFrom: '2025-12-29', paServicesCompensation: '50000', outsidePAServicesCompensation: '0' });
  let latest = f.state;
  function Harness() {
    const [state, setState] = useState(f.state);
    return <SectionStateReturn originalInput={federalOriginal} ordinaryOriginalInput={buildGuidedPAOrdinarySourceInput(state)}
      stateCode="PA" taxYear={2025} filingStatus="single" data={state.sectionData['state-return']} guidedPreview={null}
      onDataChange={next => { latest = updateSectionData(state, 'state-return', next); setState(latest); }} />;
  }
  const dom = await mountGuidedPanel(<Harness />);
  const current = () => required(latest.sectionData['state-return']?.paResidencySources);
  const packet = () => required(current().employeeSources);
  const result = () => calculatePAResidencySources(federalOriginal, current());
  const unionDuesStatus = () => Array.from(dom.container.querySelectorAll('fieldset'))
    .find(group => group.firstElementChild?.textContent === 'Actual Pennsylvania union dues')
    ?.querySelector('[role="status"]')?.textContent;
  try {
    await dom.click('Add actual Pennsylvania union dues');
    expect(packet().sourceFactsConfirmed).toBeNull();
    expect(packet().employers[0].calendar).toEqual([]);
    expect(packet().employers[0].employmentPeriods[0]).toEqual({ from: '', through: '', sourceReference: '' });
    expect(packet().employers[0].payroll[0].sourceReference).toBe(payroll.sourceReference);
    for (const [label, value] of Object.entries({
      'Union dues employee packet reference': 'Fictional union dues source ledger',
      'Union dues records complete through': '2026-02-01',
      'Employer address for union dues': '25 Fictional Harrisburg Ave, Harrisburg PA 17101',
      'Employer telephone for union dues': '717-555-0105',
      'Job duties requiring union membership': 'Operate fictional municipal maintenance equipment',
      'Actual employment record reference': 'Fictional employment history',
      'Actual employment first date': '2025-12-29',
      'Actual employment last date': '2025-12-31',
      'Signed employer verification reference': 'Fictional signed verification of required dues and no reimbursement',
      'Employer signer name': 'Morgan Example',
      'Employer signer role': 'Payroll manager',
      'Employer statement signature date': '2026-01-22',
      'Signed employer statement is available and verifies the complete PA work calendar': 'true',
      'Original work calendar reference': 'Fictional timecard',
      'Calendar range first date': '2025-12-29',
      'Calendar range last date': '2025-12-31',
      'Actual classification for each date in the range': 'working',
    })) await dom.change(label, value);
    await dom.click('Add documented work calendar range');
    await dom.click('Add actual union dues receipt');
    for (const [label, value] of Object.entries({
      'Union dues receipt 1 union name': 'Fictional Local 105',
      'Union dues receipt 1 original reference': 'Fictional dues receipt 423',
      'Union dues receipt 1 date paid': '2025-12-30',
      'Union dues receipt 1 qualifies as an actual required unreimbursed expense': 'true',
      'Signed employer records confirm required dues and no reimbursement, and all sources were checked': 'true',
      'Other actual employee expense classes are known none': 'true',
    })) await dom.change(label, value);
    await dom.click('Confirm actual PA union dues after the last edit');
    expect(current().sourceFactsConfirmed).toBeNull();
    expect(packet().employers[0].ue.expenses[0].amount).toBe('');
    expect(dom.container.textContent).toMatch(/actual.*amount/i);
    await dom.change('Union dues receipt 1 actual amount', '0');
    await dom.change('Employer statement signature date', '2025-12-29');
    await dom.click('Confirm actual PA union dues after the last edit');
    expect(current().sourceFactsConfirmed).toBeNull();
    expect(dom.container.textContent).toContain('Signed employer verification must cover the submitted payroll and dues dates.');
    await dom.change('Employer statement signature date', '2026-01-22');
    await dom.click('Confirm actual PA union dues after the last edit');
    expect(unionDuesStatus()).toBe('Actual Pennsylvania union dues and residency sources confirmed.');
    expect(result().unreimbursedEmployeeExpenses.toFixed()).toBe('0');
    await dom.change('Union dues receipt 1 actual amount', '300.60');
    expect(packet().sourceFactsConfirmed).toBeNull();
    expect(current().sourceFactsConfirmed).toBeNull();
    expect(() => result()).toThrow(/confirm|actual/i);
    await dom.click('Confirm actual PA union dues after the last edit');
    const output = result();
    expect(output.employeeSources?.perEmployer[0].scheduleUE.line1.toFixed()).toBe('301');
    expect([output.unreimbursedEmployeeExpenses, output.reportedCompensation, output.totalOrdinaryPATaxableIncome, output.taxBeforeCredits]
      .map(amount => amount.toFixed())).toEqual(['301', '50000', '49819', '1529']);
    expect(packet().employers[0].originalW2).toEqual(federalOriginal.w2s[0]);
    expect(packet().employers[0].calendar.map(day => day.sourceReference)).toEqual([
      'Fictional timecard (2025-12-29)', 'Fictional timecard (2025-12-30)', 'Fictional timecard (2025-12-31)',
    ]);
    saveGuidedFlowState(window.localStorage, 'fictional-pa-union-dues', latest);
    const reopened = required(loadGuidedFlowState(window.localStorage, 'fictional-pa-union-dues'));
    expect(reopened.sectionData['state-return']?.paResidencySources).toEqual(current());
    const replay = required(buildGuidedPAOrdinarySourceInput(reopened));
    expect(calculatePAResidencySources(replay, replay.paResidencySources).unreimbursedEmployeeExpenses.toFixed()).toBe('301');
    const originalChanges = [
      { input: { ...federalOriginal, w2s: [{ ...federalOriginal.w2s[0], federalWithheld: '100.01' }] }, draft: current() },
      { input: { ...federalOriginal, taxpayer: { ...federalOriginal.taxpayer, primary: { ...federalOriginal.taxpayer.primary, ssn: '900-70-0322' } } }, draft: current() },
      { input: federalOriginal, draft: { ...current(), wages: [{ ...current().wages[0], sourceReference: 'Different original W-2 reference' }] } },
      { input: federalOriginal, draft: { ...current(), wages: [{ ...current().wages[0], payroll: [{ ...payroll, sourceReference: 'Different original payroll reference' }] }] } },
    ];
    for (const { input, draft } of originalChanges) {
      expect(() => prepareGuidedPAUnionDues(input, draft)).toThrow(/original.*changed/i);
      expect(() => confirmGuidedPAResidencySources(input, draft)).toThrow(/original.*changed/i);
    }
    const duplicate = structuredClone(current());
    const receipts = required(duplicate.employeeSources).employers[0].ue.expenses;
    const repeatedReference = ' fictional dues receipt 423 ';
    receipts.push({ ...receipts[0], sourceReference: repeatedReference, receiptReference: repeatedReference });
    expect(() => prepareGuidedPAUnionDues(federalOriginal, duplicate)).toThrow(/duplicate.*receipt/i);
    expect(() => confirmGuidedPAResidencySources(federalOriginal, duplicate)).toThrow(/duplicate.*receipt/i);
    expect(() => calculatePAResidencySources(federalOriginal, duplicate)).toThrow(/duplicate.*receipt/i);
    expect(() => calculatePAOrdinaryEmployeeSources(federalOriginal, duplicate.employeeSources)).toThrow(/duplicate.*receipt/i);
    expect(() => calculatePAResidencySources(federalOriginal, originalChanges[3].draft)).toThrow(/original.*changed/i);
    const otherMethod = structuredClone(current());
    required(otherMethod.employeeSources).employers[0].ue.expenses[0].category = 'occupational_license';
    expect(() => calculatePAResidencySources(federalOriginal, otherMethod)).toThrow(/Pennsylvania-only.*union dues/i);
    await dom.change('Payroll 1 original reference', 'Different W-2 source');
    expect(unionDuesStatus()).toBe('Actual union dues records still need confirmation.');
    await dom.change('Payroll 1 original reference', payroll.sourceReference);
    await dom.click('Confirm actual PA union dues after the last edit');
    const editedW2 = required(reopened.sectionData['income-w2']);
    const changed = updateSectionData(reopened, 'income-w2', { entries: editedW2.entries.map(entry => ({ ...entry, employerName: 'Edited fictional employer' })) });
    expect(changed.sectionData['state-return']?.paResidencySources?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['state-return']?.paResidencySources?.employeeSources).toEqual(packet());
    expect(buildGuidedPAOrdinarySourceInput(changed)).toBeNull();
    const retained = structuredClone(current());
    Object.assign(required(retained.employeeSources), { employers: [null] });
    const onChange = () => { throw new Error('Saved unsupported originals must not mutate on render'); };
    await dom.render(<SectionStateReturn originalInput={federalOriginal} stateCode="PA" taxYear={2025} filingStatus="single"
      data={{ ...f.data, paResidencySources: retained }} guidedPreview={null} onDataChange={onChange} />);
    expect(dom.container.textContent).toContain('The saved Pennsylvania employee expense records need their original source method.');
  } finally {
    await dom.dispose();
    window.localStorage.clear();
  }
});

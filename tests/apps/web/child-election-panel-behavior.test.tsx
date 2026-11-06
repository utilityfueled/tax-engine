// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml, child-amt-originals and child-student-parent.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ChildElectionCards } from '@/components/guided-interview/child-election-details';
import { buildGuidedChildElections, type ChildElectionData } from '@/lib/guided-child-election-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualGuidedChild } from '../../fixtures/guided-child-election';
import { completeW2Entry, startCompleteInterview } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

function inputFor(entries: ChildElectionData[], wages?: string) {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: wages ? ['w2-wages', 'investments'] : ['investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], childElections: entries };
  if (wages) state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages }] };
  const input = buildTaxInputFromGuidedData(state);
  if (!input) throw new Error('Actual child election source facts are incomplete');
  return TaxYearInputSchema.parse(input);
}

it('builds a child election from original income and separate preference statements', async () => {
  let latest: ChildElectionData[] = [];
  function Harness() {
    const [entries, setEntries] = useState(latest);
    return <ChildElectionCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />;
  }
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Source panels must stay local'));
  const panel = await mountGuidedPanel(<Harness />);
  const confirm = async () => {
    await panel.change('Is the child deduction allowable and not already used?', 'true');
    await panel.change('Have you checked every child AMT statement?', 'true');
    await panel.change('Have you reviewed all child election sources?', 'true');
  };
  try {
    await panel.expand('Report a child’s interest and dividends (Form 8814)');
    await panel.click('Add child election');
    expect(latest).toEqual([{}]);
    for (const [label, value] of [
      ['Child source tax year', '2025'], ['Child election worksheet reference', 'Synthetic child income and election worksheet'],
      ['Child first name', 'Casey'], ['Child last name', 'Example'], ['Child SSN', '321-54-6701'], ['Child birth date', '2012-05-10'],
      ['Child taxable interest', '4000.25'], ['Child tax-exempt interest', '500.25'], ['Child ordinary dividends', '0'],
      ['Child qualified dividends', '0'], ['Child capital gain distributions', '0'], ['Child other gross income', '0'],
      ['Child estimated tax payments', '0'], ['Child prior overpayment applied to this year', '0'], ['Child federal income tax withheld', '0'],
      ['Did the child receive Alaska Permanent Fund dividends?', 'false'],
      ['Do capital distributions include collectibles, section 1250 or section 1202 gain?', 'false'],
      ['Does the child have a foreign account or foreign trust reporting obligation?', 'false'],
      ['Do you elect to report this child’s income on this return?', 'true'], ['Actual election filing status', 'planned_timely'],
      ['Would the child be required to file a return without this election?', 'true'], ['Does the child file a joint return for this year?', 'false'],
      ['Parent making this election', 'primary'], ['Relationship to this child', 'parent'],
      ['Actual parent filing situation', 'custodial_unmarried'], ['Has the actual custodial parent been established?', 'true'],
    ]) await panel.change(label, value);
    await panel.expand('Child tax-exempt interest and AMT sources');
    await panel.click('Add child statement');
    expect(latest[0]?.amtStatements).toEqual([{}]);
    for (const [label, value] of [
      ['Child statement 1 reference', 'Synthetic child bank A'], ['Child statement 1 form', '1099-INT'],
      ['Child statement 1 exempt interest', '100.10'], ['Child statement 1 specified preference', '25.05'],
    ]) await panel.change(label, value);
    await panel.click('Add child statement');
    for (const [label, value] of [
      ['Child statement 2 reference', 'Synthetic child fund B'], ['Child statement 2 form', '1099-DIV'],
      ['Child statement 2 exempt interest', '400.15'], ['Child statement 2 specified preference', '100.05'],
      ['Child otherwise allowable preference deduction', '10'], ['Child deduction allowance worksheet reference', 'Synthetic separately allowable deduction worksheet'],
      ['Is the child deduction allowable and not already used?', 'true'],
    ]) await panel.change(label, value);
    await confirm();
    expect(buildGuidedChildElections(latest, 2025)[0]?.taxableInterest).toBe('4000.25');
    const result = calculateFederalTax(inputFor(latest));
    expect(result.form8814?.totalOtherIncome.toFixed()).toBe('1300.25');
    expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('115.1');
    expect(JSON.stringify(result.allLines)).not.toContain('321-54-6701');

    await panel.change('Child statement 2 specified preference', '');
    expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    expect(latest[0]?.amtFactsConfirmed).toBeNull();
    await confirm();
    expect(() => inputFor(latest)).toThrow();
    await panel.change('Child statement 2 specified preference', '0');
    await confirm();
    expect(calculateFederalTax(inputFor(latest)).allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('15.05');
    expect(latest[0]?.amtStatements?.[0]?.specifiedPrivateActivityBondInterest).toBe('25.05');
    await panel.click('Remove child statement 2');
    await confirm();
    expect(() => inputFor(latest)).toThrow();
    expect(latest[0]?.taxExemptInterest).toBe('500.25');
    // The corrected child total follows the retained original, rather than confirmation alone.
    await panel.change('Child tax-exempt interest', '100.10');
    await confirm();
    expect(calculateFederalTax(inputFor(latest)).form8814?.totalOtherIncome.toFixed()).toBe('1300.25');
    await panel.change('Does the child have a foreign account or foreign trust reporting obligation?', 'true');
    await confirm();
    expect(panel.container.textContent).toContain('needs its separate reporting method');
    expect(latest[0]?.foreignAccountOrTrustPresent).toBe(true);
    expect(() => inputFor(latest)).toThrow();
    await panel.change('Does the child have a foreign account or foreign trust reporting obligation?', 'false');
    await confirm();
    expect(inputFor(latest).form8814).toHaveLength(1);
    await panel.click('Add child election');
    expect(latest[1]).toEqual({});
    await panel.click('Remove child election 2');
    await panel.click('Remove child election 1');
    expect(latest).toEqual([]);
    expect(buildGuidedChildElections(latest, 2025)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await panel.dispose(); fetch.mockRestore(); }
});

it('reconciles student attendance and parent comparison before allowing the election', async () => {
  let latest: ChildElectionData[] = [structuredClone(actualGuidedChild)];
  function Harness() {
    const [entries, setEntries] = useState(latest);
    return <ChildElectionCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  const result = () => calculateFederalTax(inputFor(latest, '50000'));
  const confirm = () => panel.change('Have you reviewed all child election sources?', 'true');
  try {
    await panel.expand('Report a child’s interest and dividends (Form 8814)');
    await panel.change('Child birth date', '2005-06-15');
    await panel.expand('Student enrollment facts');
    await confirm();
    expect(() => result()).toThrow(/student/i);
    for (const [label, value] of [
      ['Actual student program', 'school'], ['Full-time student months, separated by commas', '1,2,3,4'],
      ['Student enrollment source reference', 'Synthetic college enrollment record'],
    ]) await panel.change(label, value);
    await confirm();
    expect(() => result()).toThrow(/five|student/i);
    await panel.change('Full-time student months, separated by commas', '1,2,3,4,5');
    await panel.change('Actual parent filing situation', 'never_married_together_all_year');
    for (const [label, value] of [
      ['Parent comparison tax year', '2025'], ['This parent taxable income without child elections', '34250'],
      ['Other parent taxable income without child elections', '30000'], ['This parent comparison worksheet', 'Synthetic parent return before child election'],
      ['Other parent comparison worksheet', 'Synthetic other-parent return before child election'],
      ['Do both parent worksheets exclude all child election income?', 'true'],
    ]) await panel.change(label, value);
    await confirm();
    expect(result().form8814?.totalOtherIncome.toFixed()).toBe('1300.25');
    expect(buildGuidedChildElections(latest, 2025)[0]?.electionFacts?.student?.fullTimeMonths).toEqual([1, 2, 3, 4, 5]);

    await panel.change('This parent taxable income without child elections', '34251');
    expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    await confirm();
    expect(() => result()).toThrow(/reconcile.*canonical/i);
    await panel.change('This parent taxable income without child elections', '34250');
    await panel.change('Other parent taxable income without child elections', '34250');
    await confirm();
    expect(() => result()).toThrow(/strictly greater|tie/i);
    await panel.change('Other parent taxable income without child elections', '30000');
    await panel.change('Parent comparison tax year', '2024');
    await confirm();
    expect(() => inputFor(latest, '50000')).toThrow();
    await panel.change('Parent comparison tax year', '2025');
    await panel.change('Actual student program', 'online_only');
    await confirm();
    expect(() => result()).toThrow(/student program/i);
    await panel.change('Actual student program', 'school');
    await panel.change('Full-time student months, separated by commas', '1,2,3,4,4');
    await confirm();
    expect(() => result()).toThrow(/distinct|incomplete/i);
    await panel.change('Full-time student months, separated by commas', '1,2,3,4,5');
    await panel.change('Actual election filing status', 'late');
    await confirm();
    expect(() => result()).toThrow(/timely/i);
    await panel.change('Actual election filing status', 'filed_timely');
    await confirm();
    expect(result().form8814?.totalOtherIncome.toFixed()).toBe('1300.25');
    expect(latest[0]?.custodialParentConfirmed).toBe(true);
    expect(latest[0]?.otherParentSourceReference).toBe('Synthetic other-parent return before child election');
  } finally { await panel.dispose(); }
});

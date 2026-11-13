// @vitest-environment jsdom
// Spec: spec/federal/form-3903-2026.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { mountGuidedPanel } from './guided-panel-dom';

it('collects original moving facts and clears confirmation on edits', async () => {
  const initial = startInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['moving-expenses'], stateCode: null }, 2026);
  let current = initial;
  function Harness() {
    const [state, setState] = useState(initial);
    return <SectionAdjustments data={state.sectionData.adjustments}
      hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false} hasMovingExpenses
      filingStatus={state.segmentation.filingStatus} taxYear={state.taxYear}
      onDataChange={data => {
        current = updateSectionData(state, 'adjustments', data);
        setState(current);
      }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  try {
    await panel.click('Add moving expense record');
    expect(current.sectionData.adjustments?.movingExpenses?.moves[0]?.lineAmountsConfirmed).toBeNull();
    expect(panel.control('Move 1 owner').querySelector('option[value="spouse"]')).toBeNull();
    const facts = [
      ['Move 1 private reference label', 'move-1'],
      ['Move 1 owner', 'primary'],
      ['Move 1 relocation date', '2026-07-02'],
      ['Move 1 was domestic and all expenses and reimbursements belong to 2026', 'true'],
      ['Move 1 eligibility', 'military'],
      ['Move 1 member was on active duty', 'false'],
      ['Move 1 permanent change of station was ordered', 'true'],
      ['Move 1 eligible household goods transportation and storage', '1005.75'],
      ['Move 1 eligible nonvehicle transportation and lodging', '0'],
      ['Move 1 vehicle expense method', 'mileage'],
      ['Move 1 eligible parking and tolls', '0'],
      ['Move 1 eligible government reimbursements', '0'],
    ];
    for (const [label, value] of facts) await panel.change(label, value);
    await panel.click('Add Move 1 mileage date');
    await panel.change('Move 1 mileage 1 date', '2026-07-01');
    await panel.change('Move 1 mileage 1 eligible miles', '4.125');
    const confirmation = 'Move 1 expenses and reimbursements reconciled to the original records';
    await panel.change(confirmation, 'true');
    expect(validateSection(current, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
    await panel.change('Move 1 member was on active duty', 'true');
    await panel.change(confirmation, 'true');
    expect(validateSection(current, 'adjustments').status).toBe('complete');
    await panel.change('Move 1 eligible government reimbursements', '0.01');
    expect(current.sectionData.adjustments?.movingExpenses?.moves[0]).toMatchObject({
      reimbursementsExcludedFromIncome: '0.01', lineAmountsConfirmed: null,
    });
    await panel.change('Move 1 taxable reimbursement omitted from W-2 Box 1', '0');
    expect(current.sectionData.adjustments?.movingExpenses?.moves[0]).toMatchObject({
      omittedTaxableExcess: '0', lineAmountsConfirmed: null,
    });
    await panel.change('Move 1 vehicle expense method', 'actual');
    expect(panel.control('Move 1 eligible parking and tolls').value).toBe('0');
    expect(current.sectionData.adjustments?.movingExpenses?.moves[0]?.mileage).toEqual([]);
    await panel.click('Remove Move 1');
    expect(current.sectionData.adjustments?.movingExpensesNotApplicable).toBe(true);
    expect(validateSection(current, 'adjustments').status).toBe('complete');
    await panel.click('Add moving expense record');
    expect(current.sectionData.adjustments?.movingExpensesNotApplicable).toBeUndefined();
    expect(validateSection(current, 'adjustments').fieldErrors?.movingExpenses).toBeTruthy();
  } finally {
    await panel.dispose();
  }
});

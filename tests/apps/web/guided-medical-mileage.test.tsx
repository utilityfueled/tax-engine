// @vitest-environment jsdom
// Spec: spec/federal/schedule-a-medical-mileage-2026.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateScheduleA } from '@/engine/schedules/schedule-a';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed';
import { TaxYearInputSchema } from '@/models/inputs';
import { d } from '@/utils/decimal';
import { completePersonalInfo } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('keeps actual zeros and dates and clears confirmation when a source value changes', async () => {
  const household = updateSectionData(
    startInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null }, 2026),
    'personal-info', { ...structuredClone(completePersonalInfo), spouse: undefined },
  );
  const initial = updateSectionData(household, 'deductions', { ...emptyDeductionData, method: 'itemized' });
  let current = initial;
  function Harness() {
    const [state, setState] = useState(initial);
    return <SectionDeductions data={state.sectionData.deductions} taxYear={state.taxYear}
      filingStatus={state.segmentation.filingStatus} onDataChange={data => {
        current = updateSectionData(state, 'deductions', data);
        setState(current);
      }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  const build = () => buildTaxInputFromGuidedData(current);
  const errors = () => validateSection(current, 'deductions').fieldErrors;
  const confirmations = [
    'Trips were essential to my own qualified medical care',
    'One vehicle and only eligible parking and tolls',
    'All claimed transportation costs were paid and unreimbursed',
    'No actual vehicle costs or duplicate tax benefits',
  ];
  try {
    await panel.click('Add medical mileage log');
    expect(errors()?.medicalMileage).toBeTruthy();
    await panel.change('Private mileage log reference', 'synthetic-2026-record');
    await panel.change('Other eligible unreimbursed medical expenses', '0');
    await panel.change('Eligible medical parking and tolls', '0');
    await panel.change('Medical mileage 1 date', '2026-06-30');
    await panel.change('Medical mileage 1 eligible miles', '10');
    await panel.click('Add medical mileage date');
    await panel.change('Medical mileage 2 date', '2026-07-01');
    await panel.change('Medical mileage 2 eligible miles', '10');
    for (const label of confirmations) await panel.change(label, 'true');
    expect(validateSection(current, 'deductions').status).toBe('complete');
    const packet = build()?.scheduleA?.medicalMileage;
    expect(packet).toMatchObject({
      taxYear: 2026, otherEligibleUnreimbursedMedicalExpenses: '0', parkingAndTolls: '0',
      entries: [{ date: '2026-06-30', miles: '10' }, { date: '2026-07-01', miles: '10' }],
    });
    const input = TaxYearInputSchema.parse(build());
    const result = calculateScheduleA(input, d('0'), 'single', FEDERAL_2026_CONSTANTS);
    expect(result.medicalDeduction.toFixed()).toBe('4.4');
    expect(JSON.stringify(result.lines)).not.toContain('synthetic-2026-record');
    const { deductions: source, 'personal-info': owner } = current.sectionData;
    if (!source || !owner) throw new Error('Expected the retained synthetic source and taxpayer.');
    const changedOwner = updateSectionData(current, 'personal-info', { ...owner, lastName: 'Changed' });
    expect(validateSection(changedOwner, 'deductions').fieldErrors?.medicalMileage).toBeTruthy();
    expect(buildTaxInputFromGuidedData(changedOwner)).toBeNull();
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'deductions', { ...source, medicalExpenses: '1' }))).toBeNull();
    expect(validateSection({ ...current, taxYear: 2025 }, 'deductions').fieldErrors?.medicalMileage).toMatch(/2026/);
    expect(validateSection({ ...current, segmentation: { ...current.segmentation, filingStatus: 'hoh' } }, 'deductions').fieldErrors?.medicalMileage).toMatch(/household/i);
    const standard = updateSectionData(current, 'deductions', { ...source, method: 'standard' });
    expect(standard.sectionData.deductions?.medicalMileage).toEqual(source.medicalMileage);
    const standardInput = buildTaxInputFromGuidedData(standard);
    expect(standardInput).not.toBeNull();
    expect(standardInput?.scheduleA?.medicalMileage).toBeUndefined();
    await panel.change('Medical mileage 2 eligible miles', '10.125');
    for (const label of confirmations) expect(panel.control(label).value).toBe('');
    expect(errors()?.medicalMileage).toBeTruthy();
    expect(build()).toBeNull();
    await panel.click('Remove medical mileage log');
    expect(errors()?.medicalMileage).toBeUndefined();
  } finally {
    await panel.dispose();
  }
});

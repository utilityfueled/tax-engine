// @vitest-environment jsdom
// Spec: spec/federal/schedule-c-standard-mileage-2026.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { SectionSelfEmployment } from '@/components/guided-interview/section-self-employment';
import { calculateScheduleC } from '@/engine/schedules/schedule-c';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { TaxYearInputSchema } from '@/models/inputs';
import { completeBusinessSection, completePersonalInfo } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('reconciles the original Schedule C log through the guided return and clears changed evidence', async () => {
  const interview = startInterview({ filingStatus: 'single', incomeTypes: ['self-employment'], lifeEvents: [], stateCode: null }, 2026);
  const owner = { ...structuredClone(completePersonalInfo), spouse: undefined };
  const business = {
    ...structuredClone(completeBusinessSection), manualGrossReceipts: '10000',
    expenses: { ...completeBusinessSection.expenses, officeExpense: '100', carAndTruck: '' },
  };
  const initial = updateSectionData(updateSectionData(interview, 'personal-info', owner), 'income-self-employment', business);
  const workspace = createWorkspaceRecord('synthetic-guided-business-mileage');
  let current = initial;
  function Harness() {
    const [state, setState] = useState(initial);
    const data = state.sectionData['income-self-employment'];
    if (!data) throw new Error('Missing synthetic business source.');
    return <SectionSelfEmployment workspace={workspace} flowState={state} {...data}
      manualGrossReceipts={data.manualGrossReceipts ?? ''} bankStatementAnalyses={[]} incomeDocumentAnalyses={[]}
      onSectionChange={next => {
        current = updateSectionData(state, 'income-self-employment', next);
        setState(current);
      }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  const build = () => buildTaxInputFromGuidedData(current);
  const errors = () => validateSection(current, 'income-self-employment').fieldErrors;
  const confirmations = [
    'I own the vehicle and chose standard mileage in its first business year',
    'I kept a complete written mileage log',
    'Parking and tolls are eligible business costs',
    'No reimbursements, other vehicle deductions or other business use',
    'I did not dispose of this vehicle in 2026',
  ];
  try {
    await panel.click('Add business mileage log');
    expect(errors()?.standardMileage).toBeTruthy();
    expect(build()).toBeNull();
    await panel.change('Private business mileage log reference', 'synthetic-mileage-record');
    await panel.change('First business-use date', '2026-06-30');
    await panel.change('Total vehicle miles', '42');
    await panel.change('Commuting miles', '0');
    await panel.change('Other personal miles', '17');
    await panel.change('Eligible business parking and tolls', '3.16');
    await panel.change('Business mileage 1 date', '2026-06-30');
    await panel.change('Business mileage 1 eligible miles', '10');
    await panel.click('Add business mileage date');
    await panel.change('Business mileage 2 date', '2026-07-01');
    await panel.change('Business mileage 2 eligible miles', '15');
    for (const label of confirmations) await panel.change(label, 'true');
    expect(validateSection(current, 'income-self-employment').status).toBe('complete');
    expect(build()?.scheduleC?.standardMileage?.partIV).toBeUndefined();
    await panel.change('Was this vehicle available for personal use off duty?', 'false');
    expect(errors()?.standardMileage).toMatch(/Part IV/);
    expect(build()).toBeNull();
    await panel.change('Did you have another vehicle available for personal use?', 'false');
    await panel.change('Confirm that Form 4562 is not required for this business', 'true');
    const input = TaxYearInputSchema.parse(build());
    expect(input.scheduleC?.standardMileage).toMatchObject({
      commutingMiles: '0', otherPersonalMiles: '17', totalMiles: '42', parkingAndTolls: '3.16',
      entries: [{ date: '2026-06-30', miles: '10' }, { date: '2026-07-01', miles: '15' }],
      partIV: { offDutyPersonalUseAvailable: false, otherPersonalVehicleAvailable: false, notRequiredToFileForm4562ForBusiness: true },
    });
    const result = calculateScheduleC(input);
    expect(result.expenseBreakdown['Car and truck'].toFixed()).toBe('21.81');
    expect(result.netProfit.toFixed()).toBe('9878.19');
    expect(JSON.stringify(result.lines)).not.toContain('synthetic-mileage-record');
    expect(buildTaxInputFromGuidedData({ ...current, taxYear: 2025 })).toBeNull();
    expect(buildTaxInputFromGuidedData({ ...current, segmentation: { ...current.segmentation, stateCode: 'OH' } })).toBeNull();
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'personal-info', { ...owner, lastName: 'Changed' }))).toBeNull();
    const saved = current.sectionData['income-self-employment'];
    if (!saved) throw new Error('Missing retained business source.');
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'income-self-employment', { ...saved, expenses: { ...saved.expenses, carAndTruck: '1' } }))).toBeNull();
    const limited = updateSectionData(current, 'income-self-employment', {
      ...saved, manualGrossReceipts: '110', qbiMateriallyParticipated: false,
    });
    expect(validateSection(limited, 'income-self-employment').fieldErrors?.lossLimitation).toBeTruthy();
    expect(buildTaxInputFromGuidedData(limited)).toBeNull();
    await panel.change('Business mileage 2 eligible miles', '16');
    for (const label of confirmations) expect(panel.control(label).value).toBe('');
    for (const label of confirmations) await panel.change(label, 'true');
    expect(errors()?.standardMileage).toMatch(/reconcile/);
    expect(build()).toBeNull();
    await panel.click('Remove business mileage log');
    expect(errors()?.standardMileage).toBeUndefined();
    expect(errors()?.['expense-carAndTruck']).toBeTruthy();
  } finally {
    await panel.dispose();
  }
});

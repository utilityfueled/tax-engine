// Spec: spec/federal/guided-net-operating-loss.yaml.
import { expect, it } from 'vitest';
import { buildGuidedNetOperatingLoss, updateNetOperatingLossSources } from '@/lib/guided-net-operating-loss';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyAdjustmentData, updateSectionData, validateSection, computeFlowProgress } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing explicit fixture source'); return value; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['net-operating-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: structuredClone(actualGuidedNolSources) };
  return state;
}
it('routes actual independent regular and AMT carry histories into the return', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(computeFlowProgress(state).totalSections).toBeGreaterThan(7);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); if (!input) throw new Error('Actual carry sources were lost');
  expect(input.netOperatingLoss?.vintages?.[0]?.openingCarryforward).toBe('54000');
  expect(input.netOperatingLoss?.alternativeTax?.vintages?.[0]?.openingCarryforward).toBe('40000');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('46000');
  expect(result.netOperatingLoss?.deduction.toFixed()).toBe('54000');
  expect(result.netOperatingLoss?.section1411Deduction.toFixed()).toBe('16200');
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('40000');
  expect(JSON.stringify(state)).toBe(before);
});
it('preserves actual filed values and rejects incomplete or inconsistent histories', () => {
  const state = fixture();
  const build = (facts = structuredClone(actualGuidedNolSources)) => buildGuidedNetOperatingLoss(facts, state.taxYear, state.segmentation.filingStatus, state.sectionData['personal-info']);
  const large = structuredClone(actualGuidedNolSources);
  large.vintages = [{ ...required(large.vintages)[0], originalLoss: '9007199254740993', openingCarryforward: '9007199254740993', history: [], section1411OriginalLoss: '0' }];
  expect(build(large)?.vintages?.[0]?.openingCarryforward).toBe('9007199254740993');
  for (const patch of [{ originalLoss: '60000.01' }, { originalLoss: 'NaN' }, { openingCarryforward: '54001' }, { history: undefined }, { section1411OriginalLoss: '' }, { section1411OriginalLoss: '60001' }, { allHistoryIncluded: false }, { adjustedThroughTaxYear: '2023' }]) {
    const facts = structuredClone(actualGuidedNolSources); facts.vintages = [{ ...required(facts.vintages)[0], ...patch }]; expect(() => build(facts)).toThrow();
  }
  for (const patch of [{ alternativeTax: undefined }, { vintages: undefined }, { sourceFactsConfirmed: null }, { sourceTaxYear: '2026' }]) expect(() => build({ ...actualGuidedNolSources, ...patch })).toThrow();
  expect(buildGuidedNetOperatingLoss(undefined, null, null, undefined)).toBeUndefined();
  const none = structuredClone(actualGuidedNolSources); none.vintages = []; required(none.alternativeTax).vintages = [];
  expect(build(none)?.vintages).toEqual([]);
  const missing = fixture(); required(missing.sectionData.adjustments).netOperatingLossSources = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const duplicates = structuredClone(actualGuidedNolSources); required(duplicates.vintages).push({ ...required(duplicates.vintages)[0] });
  expect(() => build(duplicates)).toThrow(/unique|duplicate/);
});
it('requires actual continuing membership and supported loss character', () => {
  const state = fixture();
  const build = (facts = structuredClone(actualGuidedNolSources), personal = state.sectionData['personal-info']) => buildGuidedNetOperatingLoss(facts, 2025, 'single', personal);
  for (const patch of [{ primaryName: 'Different Owner' }, { primaryTaxpayerIdLast4: '0000' }, { membershipUnchangedConfirmed: false }, { calendarYearTaxpayer: false }, { spouseName: 'Unrelated Owner' }]) expect(() => build({ ...actualGuidedNolSources, ...patch })).toThrow();
  for (const patch of [{ originKind: 'estate_termination' as const }, { originKind: 'excess_business_loss' as const }, { farmingLossIncluded: true }]) {
    const facts = structuredClone(actualGuidedNolSources); facts.vintages = [{ ...required(facts.vintages)[0], ...patch }]; expect(() => build(facts)).toThrow();
  }
  const mismatched = structuredClone(actualGuidedNolSources); required(mismatched.alternativeTax).regularBasisAndLossLimitsSameAsAlternativeConfirmed = false;
  expect(() => build(mismatched)).toThrow(/AMT/);
  expect(() => buildGuidedNetOperatingLoss(actualGuidedNolSources, 2025, 'mfj', state.sectionData['personal-info'])).toThrow(/membership|members|spouse/i);
  const joint = structuredClone(actualGuidedNolSources); joint.returnMembership = 'same_spouses_joint'; joint.spouseName = 'Taylor Example'; joint.spouseTaxpayerIdLast4 = '4444';
  const personal = { ...required(state.sectionData['personal-info']), spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1988-03-10', usResidencyMonths: '12' } };
  expect(buildGuidedNetOperatingLoss(joint, 2025, 'mfj', personal)?.spouseTaxpayerIdLast4).toBe('4444');
  const historical = structuredClone(actualGuidedNolSources); historical.vintages = [{ ...required(historical.vintages)[0], lossTaxYear: '2017', carrybackTreatment: 'waived', carrybackSourceReference: 'Actual timely filed waiver', section1411OriginalLoss: '0' }];
  expect(build(historical)?.vintages?.[0]?.carrybackTreatment).toBe('waived');
  historical.vintages[0].carrybackTreatment = 'completed';
  expect(() => build(historical)).toThrow(/ordinary historical/);
  historical.vintages[0].ordinaryHistoricalCarrybackConfirmed = true;
  expect(build(historical)?.vintages?.[0]?.ordinaryHistoricalCarrybackConfirmed).toBe(true);
});
it('invalidates changed source facts without inventing current deductions', () => {
  const state = fixture();
  const edit = updateNetOperatingLossSources(actualGuidedNolSources, { sourceReference: 'New actual source' });
  expect(edit.sourceFactsConfirmed).toBeNull(); expect(edit.alternativeTax?.sourceFactsConfirmed).toBeNull();
  expect(edit.vintages?.[0]?.openingCarryforward).toBe('54000');
  const changed = updateSectionData(state, 'income-w2', { entries: [{ ...completeW2Entry, wages: '90000' }] });
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.sourceFactsConfirmed).toBeNull();
  const sourceChanged = updateSectionData(state, 'adjustments', { ...required(state.sectionData.adjustments), netOperatingLossSources: edit });
  const confirmed = updateSectionData(sourceChanged, 'adjustments', { ...required(sourceChanged.sectionData.adjustments), netOperatingLossSources: { ...edit, sourceFactsConfirmed: true, alternativeTax: { ...edit.alternativeTax, sourceFactsConfirmed: true } } });
  expect(confirmed.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBe(true);
  expect(confirmed.sectionData.adjustments?.netOperatingLossSources).not.toHaveProperty('deduction');
});

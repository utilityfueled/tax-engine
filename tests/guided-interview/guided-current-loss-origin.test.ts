// Spec: spec/federal/guided-current-loss-origin.yaml.
import { expect, it } from 'vitest';
import { buildCurrentLossOrigin, updateCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { emptyAdjustmentData, emptyDeductionData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualCurrentLossOrigin } from '../fixtures/guided-current-loss-origin';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { completeBusinessSection, completeInterestSource, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing fictional current origin source'); return value; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '20000' }] };
  state.sectionData['income-self-employment'] = { ...structuredClone(completeBusinessSection),
    expenses: { ...completeBusinessSection.expenses, otherExpenses: '100000' },
    businessFacts: { ...completeBusinessSection.businessFacts, businessName: 'Actual active sole proprietorship' } };
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, interestIncome: '5000' }], dividendEntries: [], brokerageEntries: [] };
  const prior = structuredClone(actualGuidedNolSources); prior.vintages = []; required(prior.alternativeTax).vintages = [];
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: prior, currentLossOrigin: structuredClone(actualCurrentLossOrigin) };
  return state;
}
it('routes actual current loss sources into regular and independent AMT origins', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); if (!input) throw new Error('Actual current origin sources were lost');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe('-75000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('75000');
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe('0');
  expect(result.form172?.regularClosingCarryforward.toFixed()).toBe('80000');
  expect(computeGuidedPreview(state)).not.toBeNull();
  expect(JSON.stringify(state)).toBe(before);
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '2000', stateLocalTaxes: '0',
    realEstateTaxes: '20000', personalPropertyTaxes: '0', gamblingWinnings: '0', gamblingLosses: '0', nonW2IncomeTaxesDeductedElsewhere: '0' };
  const itemizedInput = buildTaxInputFromGuidedData(state); if (!itemizedInput) throw new Error('Actual itemized origin sources were lost');
  const itemized = calculateFederalTax(TaxYearInputSchema.parse(itemizedInput));
  expect(itemized.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');
  expect(itemized.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('77000');
});
it('preserves unknown current sources and requires independent prior histories', () => {
  const state = fixture();
  const build = (data = structuredClone(actualCurrentLossOrigin)) => buildCurrentLossOrigin(data, state);
  expect(buildCurrentLossOrigin(undefined, state)).toBeUndefined();
  for (const patch of [{ sourceTaxYear: '' }, { sourceTaxYear: '2026' }, { sourceReference: '' }, { sourceFactsConfirmed: null },
    { allCurrentYearSourcesIncluded: null }, { farmingLossIncluded: null }, { businessSources: undefined }, { alternativeTax: undefined }]) {
    expect(() => build({ ...actualCurrentLossOrigin, ...patch })).toThrow();
  }
  for (const patch of [{ sourceReference: '' }, { sourceFactsConfirmed: false }, { currentYearAdjustmentsCompleteConfirmed: null },
    { regularBasisAndLossLimitsSameAsAlternativeConfirmed: false }, { regularDepreciationSameAsAlternativeConfirmed: null }]) {
    expect(() => build({ ...actualCurrentLossOrigin, alternativeTax: { ...actualCurrentLossOrigin.alternativeTax, ...patch } })).toThrow();
  }
  required(state.sectionData.adjustments).netOperatingLossSources = undefined;
  expect(() => build()).toThrow(/prior|carry/i);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const missing = fixture(); required(missing.sectionData.adjustments).currentLossOrigin = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});
it('binds actual business identity and keeps unsupported origin methods explicit', () => {
  const state = fixture();
  for (const patch of [{ sourceId: 'scheduleC:1' }, { accountHolder: 'spouse' as const }, { businessName: 'Different business' },
    { materiallyParticipated: false }, { allInvestmentAtRisk: null }, { financialTradingBusiness: true }, { sourceFactsConfirmed: null }]) {
    expect(() => buildCurrentLossOrigin({ ...actualCurrentLossOrigin, businessSources: [{ ...required(actualCurrentLossOrigin.businessSources)[0], ...patch }] }, state)).toThrow();
  }
  for (const patch of [{ farmingLossIncluded: true }, { cancelledDebtIncluded: true }, { estateOrTrustLossIncluded: true },
    { businessSources: [] }, { businessSources: [...required(actualCurrentLossOrigin.businessSources), ...required(actualCurrentLossOrigin.businessSources)] }]) {
    expect(() => buildCurrentLossOrigin({ ...actualCurrentLossOrigin, ...patch }, state)).toThrow();
  }
  required(state.sectionData['income-self-employment']).qbiMateriallyParticipated = false;
  expect(() => buildCurrentLossOrigin(actualCurrentLossOrigin, state)).toThrow(/participation|active/i);
});
it('invalidates current source edits without inventing a calculated loss', () => {
  const state = fixture();
  const changed = updateCurrentLossOrigin(actualCurrentLossOrigin, { sourceReference: 'New actual source' });
  expect(changed.sourceFactsConfirmed).toBeNull(); expect(changed.businessSources?.[0]?.sourceFactsConfirmed).toBeNull(); expect(changed.alternativeTax?.sourceFactsConfirmed).toBeNull();
  expect(changed.businessSources?.[0]?.businessName).toBe('Actual active sole proprietorship');
  const edit = updateSectionData(state, 'income-w2', { entries: [{ ...completeW2Entry, wages: '20000.01' }] });
  expect(edit.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
  expect(edit.sectionData.adjustments?.currentLossOrigin?.alternativeTax?.sourceFactsConfirmed).toBeNull();
  const adjustments = required(edit.sectionData.adjustments);
  const confirmed = updateSectionData(edit, 'adjustments', { ...adjustments, currentLossOrigin: structuredClone(actualCurrentLossOrigin),
    netOperatingLossSources: { ...required(adjustments.netOperatingLossSources), sourceFactsConfirmed: true,
      alternativeTax: { ...adjustments.netOperatingLossSources?.alternativeTax, sourceFactsConfirmed: true } } });
  expect(confirmed.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBe(true);
  expect(confirmed.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBe(true);
  expect(buildCurrentLossOrigin(actualCurrentLossOrigin, state)).not.toHaveProperty('netOperatingLoss');
});
it('preserves unsupported source methods and the closed year boundary', () => {
  const state = fixture();
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', charitableContributions: '5000',
    donationEntries: [{ qualifiedOrganization: true, organization: 'Actual Charity', type: 'cash', amount: '5000', date: '2025-10-01', costBasis: '', isLongTermCapitalGain: null, isPrivateFoundation: false }] };
  const input = buildTaxInputFromGuidedData(state); if (!input) throw new Error('Actual unsupported source should remain available for review');
  expect(input.donations?.[0]?.amount).toBe('5000');
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/charit/i);
  expect(computeGuidedPreview(state)).toBeNull();
  const noBusiness = fixture(); delete noBusiness.sectionData['income-self-employment'];
  const none = { ...actualCurrentLossOrigin, businessSources: [] };
  expect(buildCurrentLossOrigin(none, noBusiness)?.businessSources).toEqual([]);
  expect(() => buildCurrentLossOrigin(actualCurrentLossOrigin, noBusiness)).toThrow(/list/);
  const future = fixture(); future.taxYear = 2026;
  required(future.sectionData.adjustments).currentLossOrigin = { ...actualCurrentLossOrigin, sourceTaxYear: '2026' };
  expect(computeGuidedPreview(future)).toBeNull();
});

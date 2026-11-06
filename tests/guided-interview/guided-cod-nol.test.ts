// Spec: spec/federal/guided-cod-nol.yaml.
import { expect, it } from 'vitest';
import { buildGuidedCodNol, updateGuidedCodNol } from '@/lib/guided-cod-nol';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { buildSectionRoute, emptyAdjustmentData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualGuidedCodNol } from '../fixtures/guided-cod-nol';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { actualCurrentLossOrigin } from '../fixtures/guided-current-loss-origin';
import { completeBusinessSection, completeInterestSource, completeW2Entry, startCompleteInterview } from './complete-facts';

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error('Missing synthetic COD source'); return value; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['cancelled-debt'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  const prior = structuredClone(actualGuidedNolSources);
  const first = { ...required(prior.vintages)[0], originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] };
  prior.vintages = [first, { ...first, sourceId: 'regular2022', lossTaxYear: '2022' }];
  required(prior.alternativeTax).vintages = structuredClone(prior.vintages);
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: prior, codNolSources: actualGuidedCodNol() };
  return state;
}
it('preserves original COD sources and validates without calculating loss balances', () => {
  const state = fixture(), data = actualGuidedCodNol('1,000.49');
  const before = JSON.stringify(data), result = required(buildGuidedCodNol(data, state));
  expect(result.form1099C[0]?.amountDischarged).toBe('1000.49');
  expect(result.form1099C[0]?.interestIncluded).toBe('0');
  expect(result.form982NolSources.debts?.[0]?.statementId).toBe('Original statement-A');
  expect(result.form982NolSources.insolvency?.liabilities?.[0]?.dischargedDebtSourceId).toBe('form1099C:0');
  expect(result.codExclusion.insolvency).toEqual({ totalAssets: '10000', totalLiabilities: '120000' });
  expect(result).not.toHaveProperty('carryforward'); expect(result).not.toHaveProperty('deduction');
  expect(JSON.stringify(data)).toBe(before); expect(buildGuidedCodNol(undefined, state)).toBeUndefined();
});
it('rejects incomplete or conflicting actual COD records', () => {
  const state = fixture();
  for (const patch of [{ sourceTaxYear: '' }, { sourceTaxYear: '2024' }, { sourceFactsConfirmed: null }, { allDischargesIncluded: null },
    { title11Case: true }, { communityPropertyApplies: true }, { electBasisReductionFirst: true }, { otherExclusionsOrExceptionsApply: null },
    { regularAndAlternativeExclusionSameConfirmed: false }, { debts: undefined }, { insolvency: undefined }]) {
    expect(() => buildGuidedCodNol({ ...actualGuidedCodNol(), ...patch }, state)).toThrow();
  }
  for (const patch of [{ interestIncluded: '' }, { fmvOfProperty: undefined }, { amountDischarged: 'NaN' }, { debtorSsnLast4: '4444' },
    { debtorName: 'Different person' }, { sourceTaxYear: '2024' }, { accountHolder: 'spouse' as const }, { personallyLiable: null }]) {
    const data = actualGuidedCodNol(); data.debts = [{ ...required(data.debts)[0], ...patch }];
    expect(() => buildGuidedCodNol(data, state)).toThrow();
  }
  const unknown = actualGuidedCodNol(); required(unknown.insolvency).assets = undefined;
  expect(() => buildGuidedCodNol(unknown, state)).toThrow(/asset|complete/i);
  required(unknown.insolvency).assets = []; expect(buildGuidedCodNol(unknown, state)?.codExclusion.insolvency?.totalAssets).toBe('0');
  required(unknown.insolvency).liabilities = [{ ...required(unknown.insolvency?.liabilities)[0], dischargedDebtStatementId: 'Replaced statement' }];
  expect(() => buildGuidedCodNol(unknown, state)).toThrow(/statement|liabilit/i);
  const duplicate = actualGuidedCodNol(); duplicate.debts = [...required(duplicate.debts), ...required(duplicate.debts)];
  expect(() => buildGuidedCodNol(duplicate, state)).toThrow(/duplicat/i);
  required(state.sectionData.adjustments).netOperatingLossSources = undefined;
  expect(() => buildGuidedCodNol(actualGuidedCodNol(), state)).toThrow(/prior|loss|carry/i);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it('forwards actual insolvency records once into independent regular and AMT carries', () => {
  const state = fixture(), before = JSON.stringify(state);
  expect(buildSectionRoute(state.segmentation).some(section => section.id === 'adjustments')).toBe(true);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = required(buildTaxInputFromGuidedData(state) ?? undefined);
  expect(input.form1099C).toHaveLength(1); expect(input.form172).toBeUndefined();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.netOperatingLoss?.deduction?.toFixed()).toBe('67400');
  expect(result.netOperatingLoss?.alternativeTax?.deduction.toFixed()).toBe('90000');
  expect(result.codNolReduction?.regular?.carryforward.toFixed()).toBe('92600');
  expect(result.codNolReduction?.alternativeTax?.carryforward.toFixed()).toBe('70000');
  expect(computeGuidedPreview(state)).not.toBeNull(); expect(JSON.stringify(state)).toBe(before);
  const missing = fixture(); required(missing.sectionData.adjustments).codNolSources = undefined;
  expect(validateSection(missing, 'adjustments').status).toBe('partial'); expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});
it('links cancelled debt to the actual current loss source packet', () => {
  const state = fixture(); state.segmentation.incomeTypes = ['w2-wages', 'self-employment', 'investments'];
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '20000' }] };
  state.sectionData['income-self-employment'] = { ...structuredClone(completeBusinessSection), expenses: { ...completeBusinessSection.expenses, otherExpenses: '100000' },
    businessFacts: { ...completeBusinessSection.businessFacts, businessName: 'Actual active sole proprietorship' } };
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, interestIncome: '5000' }], dividendEntries: [], brokerageEntries: [] };
  const adjustments = required(state.sectionData.adjustments), prior = required(adjustments.netOperatingLossSources);
  prior.vintages = []; required(prior.alternativeTax).vintages = [];
  adjustments.codNolSources = actualGuidedCodNol('1000');
  adjustments.currentLossOrigin = { ...structuredClone(actualCurrentLossOrigin), cancelledDebtIncluded: true };
  const input = required(buildTaxInputFromGuidedData(state) ?? undefined);
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('75000');
  expect(result.codNolReduction?.regular?.carryforward.toFixed()).toBe('79000');
  expect(result.codNolReduction?.alternativeTax?.carryforward.toFixed()).toBe('74000');
  adjustments.currentLossOrigin.cancelledDebtIncluded = false;
  expect(() => buildCurrentLossOrigin(adjustments.currentLossOrigin, state)).toThrow(/cancel|debt/i);
  adjustments.currentLossOrigin.cancelledDebtIncluded = true; adjustments.codNolSources = undefined;
  expect(() => buildCurrentLossOrigin(adjustments.currentLossOrigin, state)).toThrow(/cancel|debt/i);
});
it('invalidates actual source changes and retains explicit confirmations', () => {
  const data = actualGuidedCodNol(), next = updateGuidedCodNol(data, { sourceReference: 'Different completed original records' });
  expect(next.sourceFactsConfirmed).toBeNull(); expect(next.debts?.[0]?.sourceFactsConfirmed).toBeNull(); expect(next.insolvency?.sourceFactsConfirmed).toBeNull();
  expect(next.debts?.[0]?.amountDischarged).toBe('40000');
  const state = fixture(), edited = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], ssn: '999-22-3333' });
  expect(edited.sectionData.adjustments?.codNolSources?.sourceFactsConfirmed).toBeNull();
  const adjustments = required(state.sectionData.adjustments), reconfirmed = updateSectionData(state, 'adjustments', {
    ...adjustments, codNolSources: { ...adjustments.codNolSources, sourceFactsConfirmed: true },
  });
  expect(reconfirmed.sectionData.adjustments?.codNolSources?.sourceFactsConfirmed).toBe(true);
  expect(reconfirmed.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBe(true);
});

// Spec: spec/federal/guided-investment-interest.yaml.
import { expect, it } from 'vitest';
import { buildGuidedInvestmentInterestInputs } from '@/lib/guided-investment-interest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualInvestmentInterestSources, investmentInterestChild } from '../fixtures/guided-investment-interest';
import { completeW2Entry, startCompleteInterview } from './complete-facts';
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000' }] };
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], childElections: [structuredClone(investmentInterestChild)] };
  const deductions = { ...emptyDeductionData, method: 'itemized' as const, investmentInterestExpense: '5000', investmentInterestSources: structuredClone(actualInvestmentInterestSources) };
  state.sectionData.deductions = deductions;
  return { state, deductions };
}
it('routes actual child partitions and separate AMT amounts through the canonical return', () => {
  const { state } = fixture(), before = JSON.stringify(state);
  expect(validateSection(state, 'deductions').status).toBe('complete');
  const input = buildTaxInputFromGuidedData(state); if (!input) throw new Error('Actual investment worksheets were lost');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.allLines.find(row => row.form === 'Form 4952' && row.line === '8')?.value.toFixed()).toBe('2200');
  expect(result.allLines.find(row => row.form === 'Form 4952 AMT' && row.line === '8')?.value.toFixed()).toBe('3000');
  expect(input.form4952?.grossInvestmentIncome).toBe('2200'); expect(input.form4952Amt?.grossInvestmentIncome).toBe('3000');
  expect(result.allLines.find(row => row.form === 'Sched A' && row.line === '9')?.value.toFixed()).toBe('2200');
  expect(JSON.stringify(state)).toBe(before);
});
it('requires actual election and carryforward sources while preserving exact signed values', () => {
  const source = { ...actualInvestmentInterestSources.regular, childIncomeSources: undefined, sourceTaxYear: '2026',
    sourceFactsConfirmed: true, priorYearDisallowed: '12.34', priorYearSourceTaxYear: '2025', grossInvestmentIncome: '9007199254740993.03',
    qualifiedDividendsIncluded: '300', netGainFromInvestmentProperty: '500', netCapitalGainFromInvestmentProperty: '500',
    electedPreferentialIncome: '700', electedNetCapitalGain: '450', capitalGainElectionMethod: 'explicit' as const,
    investmentExpenses: '1.20', investmentExpensesDeductibleConfirmed: true };
  const input = { investmentInterestSources: { regular: source, amt: structuredClone(source) } };
  const actual = buildGuidedInvestmentInterestInputs(input, [], 2026);
  expect(actual.form4952?.grossInvestmentIncome).toBe('9007199254740993.03'); expect(actual.form4952?.electedNetCapitalGain).toBe('450');
  for (const patch of [{ capitalGainElectionMethod: '' as const }, { capitalGainElectionMethod: 'capital_first' as const },
    { electedNetCapitalGain: '' }, { electedNetCapitalGain: '399' }, { priorYearSourceTaxYear: '' },
    { investmentExpensesDeductibleConfirmed: false }, { priorYearDisallowed: '-1' }, { grossInvestmentIncome: 'NaN' }]) {
    expect(() => buildGuidedInvestmentInterestInputs({ investmentInterestSources: { ...input.investmentInterestSources, regular: { ...source, ...patch } } }, [], 2026)).toThrow();
  }
  expect(() => buildGuidedInvestmentInterestInputs({ investmentInterestSources: { ...input.investmentInterestSources, amt: { ...source, electedPreferentialIncome: '600' } } }, [], 2026)).toThrow(/AMT election/);
  expect(() => buildGuidedInvestmentInterestInputs({ investmentInterestSources: { amt: source } }, [], 2026)).toThrow(/regular/);
  expect(() => buildGuidedInvestmentInterestInputs(input, [], null)).toThrow(/tax year/);
  const capitalFirst = buildGuidedInvestmentInterestInputs({ investmentInterestSources: { regular: { ...source, capitalGainElectionMethod: 'capital_first', electedNetCapitalGain: undefined }, amt: source } }, [], 2026);
  expect(capitalFirst.form4952?.electedNetCapitalGain).toBeUndefined();
  expect(buildGuidedInvestmentInterestInputs({ investmentInterestExpense: '0' }, [], 2026)).toEqual({});
  expect(buildGuidedInvestmentInterestInputs(undefined, undefined, undefined)).toEqual({});
});
it('preserves exact signed amounts and rejects missing stale or conflicting sources', () => {
  const { deductions } = fixture(), children = [structuredClone(investmentInterestChild)];
  const regular = deductions.investmentInterestSources.regular;
  if (!regular?.childIncomeSources) throw new Error('Missing explicit fixture');
  regular.childIncomeSources.parentGrossInvestmentIncome = '-300.25'; regular.grossInvestmentIncome = '1899.75';
  expect(buildGuidedInvestmentInterestInputs(deductions, children, 2025).form4952?.grossInvestmentIncome).toBe('1899.75');
  for (const patch of [{ sourceTaxYear: '' }, { priorYearDisallowed: '' }, { sourceFactsConfirmed: null }, { grossInvestmentIncome: '1899.76' },
    { priorYearDisallowed: '1', priorYearSourceTaxYear: '2023' }, { investmentExpenses: '1', investmentExpensesDeductibleConfirmed: false }]) {
    expect(() => buildGuidedInvestmentInterestInputs({ ...deductions, investmentInterestSources: { ...deductions.investmentInterestSources, regular: { ...regular, ...patch } } }, children, 2025)).toThrow();
  }
  expect(() => buildGuidedInvestmentInterestInputs({ ...deductions, investmentInterestSources: { regular } }, children, 2025)).toThrow(/AMT/);
  expect(() => buildGuidedInvestmentInterestInputs({ ...deductions, investmentInterestSources: undefined }, children, 2025)).toThrow(/worksheet/);
  expect(() => buildGuidedInvestmentInterestInputs({ ...deductions, investmentInterestExpense: '5000.01' }, children, 2025)).toThrow(/reconcile/i);
  expect(() => buildGuidedInvestmentInterestInputs(deductions, [{ ...children[0], lastName: 'Changed' }], 2025)).toThrow(/identity/);
});
it('invalidates actual source changes without confirmation cycles', () => {
  const { state, deductions } = fixture();
  const changed = updateSectionData(state, 'personal-info', { ...state.sectionData['personal-info'], lastName: 'Changed' });
  expect(changed.sectionData.deductions?.investmentInterestSources?.regular?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.investmentInterestSources?.amt?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.investmentInterestSources?.regular?.investmentInterestExpense).toBe('5000');
  const confirmed = updateSectionData(state, 'deductions', { ...deductions, investmentInterestSources: { ...deductions.investmentInterestSources, regular: { ...deductions.investmentInterestSources.regular, sourceFactsConfirmed: true } } });
  expect(confirmed.sectionData['income-investments']?.childElections?.[0]?.sourceFactsConfirmed).toBe(true);
});

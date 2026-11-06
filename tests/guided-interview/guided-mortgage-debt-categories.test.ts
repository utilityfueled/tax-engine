// Spec: spec/federal/guided-mortgage-debt-categories.yaml
import { expect, it } from 'vitest';
import { calculateHomeMortgageInterest } from '@/engine/forms/home-mortgage-interest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, type MortgageEntryData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeW2Entry, startCompleteInterview } from './complete-facts';

const categories = {
  sourceTaxYear: '2025', worksheetReference: 'Actual refinance principal and use history',
  grandfatheredDebt: '0', acquisitionDebtBefore2017: '600000', acquisitionDebtAfter2017: '300000', excludedDebt: '100000',
  classificationConfirmed: true, paymentsAppliedInRequiredOrderConfirmed: true, interestAllocationConfirmed: true,
  refinancingHistoryConfirmed: true, grandfatheredStatusConfirmed: null,
};
function data(change: Record<string, unknown> = {}) {
  const entry = { ...completeMortgageSource, sourceTaxYear: '2025', mortgageInterest: '10000', interestPaidByReturnAmount: '10000', outstandingPrincipal: '1000000',
    maximumBalanceDuringYear: undefined, nonqualifiedInterest: '1000', loanType: 'refinance', proceedsUse: 'mixed', balanceMethod: 'category_worksheet',
    balanceCategories: categories, ...change } as unknown as MortgageEntryData;
  return { ...emptyDeductionData, method: 'itemized' as const, mortgageEntries: [entry],
    mortgageWorksheet: { sourceTaxYear: '2025', sourceReference: 'Actual complete annual debt records', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true } };
}
function calculate(change: Record<string, unknown> = {}) {
  const input = buildGuidedMortgageInputs(data(change), 2025, 'single');
  return { input, result: calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: 'single' }, ...input, form1099Misc: [] }) };
}
it('binds completed mixed-debt averages and actual ineligible interest without rewriting Form 1098', () => {
  const { input, result } = calculate();
  expect(input.form1098[0]).toMatchObject({ mortgageInterestReceived: '10000', outstandingMortgagePrincipal: '1000000' });
  expect(input.mortgageInterestWorksheet?.loans[0]).toMatchObject({ loanType: 'refinanced_mixed', interestPaid: '10000', nonqualifiedInterest: '1000',
    balance: { method: 'category_worksheet', grandfatheredDebt: '0', acquisitionDebtBefore2017: '600000', acquisitionDebtAfter2017: '300000', excludedDebt: '100000' } });
  expect(result.averageQualifiedDebt.toFixed()).toBe('900000'); expect(result.qualifiedLoanLimit.toFixed()).toBe('750000');
  expect(result.deductionRatio.toFixed()).toBe('0.833'); expect(result.mortgageInterest.toFixed()).toBe('7497');
  // Original mixed-use borrowing and a traced home-equity loan use the same
  // completed sources; neither the loan label nor Box 2 supplies a category.
  const original = calculate({ loanType: 'original', balanceSourceReference: undefined, balanceCategories: { ...categories, acquisitionDebtBefore2017: '0', acquisitionDebtAfter2017: '900000' } });
  expect(original.result.mortgageInterest.toFixed()).toBe('7497');
  expect(calculate({ loanType: 'heloc' }).result.mortgageInterest.toFixed()).toBe('7497');
});
it('requires actual category histories and preserves explicit zero separately from unknown', () => {
  for (const change of [{ sourceTaxYear: '2024' }, { worksheetReference: '' }, { grandfatheredDebt: '' }, { excludedDebt: undefined }, { acquisitionDebtBefore2017: '-1' },
    { acquisitionDebtAfter2017: 'NaN' }, { classificationConfirmed: false }, { paymentsAppliedInRequiredOrderConfirmed: null }, { interestAllocationConfirmed: false }, { refinancingHistoryConfirmed: undefined }]) {
    expect(() => calculate({ balanceCategories: { ...categories, ...change } })).toThrow();
  }
  expect(() => calculate({ maximumBalanceDuringYear: '999999' })).toThrow(/maximum|source|reconcile/i);
  expect(() => calculate({ maximumBalanceDuringYear: '1100000', balanceCategories: { ...categories, acquisitionDebtAfter2017: '400000.01' } })).toThrow(/maximum|source|reconcile/i);
  for (const loanType of ['reverse', 'other', '']) expect(() => calculate({ loanType })).toThrow();
  expect(() => calculate({ loanType: 'original', proceedsUse: 'acquisition', balanceCategories: categories })).toThrow(/original|category|classif|use|debt/i);
  const zero = calculate({ balanceCategories: { ...categories, grandfatheredDebt: '0', acquisitionDebtBefore2017: '0', acquisitionDebtAfter2017: '0', excludedDebt: '0' }, mortgageInterest: '0', interestPaidByReturnAmount: '0', nonqualifiedInterest: '0' });
  expect(zero.result.mortgageInterest.toFixed()).toBe('0');
  const huge = calculate({ balanceCategories: { ...categories, acquisitionDebtAfter2017: '9007199254740993.01' } });
  expect(huge.input.mortgageInterestWorksheet?.loans[0]?.balance).toMatchObject({ acquisitionDebtAfter2017: '9007199254740993.01' });
});
it('uses actual grandfathered continuity without inferring it from an old date', () => {
  const sources = { ...categories, grandfatheredDebt: '800000', acquisitionDebtBefore2017: '0', acquisitionDebtAfter2017: '0', excludedDebt: '0', grandfatheredStatusConfirmed: true };
  const actual = { loanType: 'original', proceedsUse: 'other', originationDate: '1986-01-01', mortgageInterest: '40000', interestPaidByReturnAmount: '40000', nonqualifiedInterest: '0', balanceCategories: sources };
  expect(calculate(actual).result.mortgageInterest.toFixed()).toBe('40000');
  for (const value of [undefined, null, false]) expect(() => calculate({ ...actual, balanceCategories: { ...sources, grandfatheredStatusConfirmed: value } })).toThrow(/grandfather|continu|history/i);
  expect(() => calculate({ ...actual, originationDate: '2020-01-01' })).toThrow(/grandfather|original|date|classif/i);
});
it('transfers completed refinancing sources through the canonical return once', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '10000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  state.sectionData.deductions = data();
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form1098[0]?.mortgageInterestReceived).toBe('10000');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.itemizedDeductions.toFixed()).toBe('7497'); expect(result.taxableIncome.toFixed()).toBe('92503');
});

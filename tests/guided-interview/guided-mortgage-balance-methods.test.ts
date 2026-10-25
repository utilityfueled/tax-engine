// Spec: spec/federal/guided-mortgage-balance-methods.yaml
import { expect, it } from 'vitest';
import { calculateHomeMortgageInterest } from '@/engine/forms/home-mortgage-interest';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { emptyDeductionData, type MortgageEntryData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeW2Entry, startCompleteInterview } from './complete-facts';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';

function data(change: Partial<MortgageEntryData> = {}) {
  return { ...emptyDeductionData, method: 'itemized' as const,
    mortgageWorksheet: { sourceTaxYear: '2025', sourceReference: 'Actual annual home-debt records', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true },
    mortgageEntries: [{ ...completeMortgageSource, mortgageInterest: '40000.10', interestPaidByReturnAmount: '40000.10', interestPaidByOthers: '0',
      outstandingPrincipal: '990000', maximumBalanceDuringYear: undefined, balanceSourceReference: 'Original lender balance records', ...change }],
  };
}
function calculate(change: Partial<MortgageEntryData>) {
  const input = buildGuidedMortgageInputs(data(change), 2025, 'single');
  return { input, result: calculateHomeMortgageInterest({ taxpayer: { taxYear: 2025, filingStatus: 'single' }, ...input, form1099Misc: [] }) };
}
const firstLast = { firstBalance: '1000000.10', lastBalance: '599999.90', noAdditionalBorrowing: true, noPrepaymentOverOneMonth: true, levelPaymentsAtLeastSemiannually: true };
it('binds actual first-last records without substituting Box 2 or a maximum', () => {
  const actual = { balanceMethod: 'first_last' as const, balanceFirstLast: firstLast };
  const { input, result } = calculate(actual);
  expect(input.form1098[0]?.outstandingMortgagePrincipal).toBe('990000');
  expect(input.mortgageInterestWorksheet?.loans[0]?.balance).toEqual({ method: 'first_last', ...firstLast, firstBalance: '1000000.1', lastBalance: '599999.9' });
  // Average800000, official three-decimal ratio0.938, 40000.10*0.938 ->37520.
  expect(result.deductionRatio.toFixed()).toBe('0.938'); expect(result.mortgageInterest.toFixed()).toBe('37520');
  for (const value of [undefined, null, false]) expect(() => calculate({ ...actual, balanceFirstLast: { ...firstLast, noAdditionalBorrowing: value } })).toThrow(/borrow|first|balance|condition/i);
  for (const value of ['', '-1', 'NaN']) expect(() => calculate({ ...actual, balanceFirstLast: { ...firstLast, firstBalance: value } })).toThrow();
  expect(() => calculate({ ...actual, maximumBalanceDuringYear: '999999' })).toThrow(/maximum|reconcile/i);
});
it('preserves actual monthly coverage and exact cents with canonical debt limits', () => {
  const actual = { balanceMethod: 'monthly' as const, balanceMonthly: { statementBasis: 'closing' as const, allMonthsIncluded: true, qualifiedHomeMonths: ['10', '11', '12'], balances: [{ month: '10', amount: '900000.10' }, { month: '11', amount: '800000.20' }, { month: '12', amount: '699999.70' }] } };
  const { input, result } = calculate(actual);
  expect(input.mortgageInterestWorksheet?.loans[0]?.balance).toEqual({ method: 'monthly', qualifiedHomeMonths: [10, 11, 12], balances: [{ month: 10, amount: '900000.1' }, { month: 11, amount: '800000.2' }, { month: 12, amount: '699999.7' }] });
  expect(result.mortgageInterest.toFixed()).toBe('37520');
  for (const change of [ { qualifiedHomeMonths: undefined }, { qualifiedHomeMonths: [] }, { qualifiedHomeMonths: ['10', '10', '12'] }, { statementBasis: '' as const }, { allMonthsIncluded: null }, { allMonthsIncluded: false }, { balances: actual.balanceMonthly.balances.slice(1) }, { balances: [...actual.balanceMonthly.balances, { month: '10', amount: '1' }] }, { balances: [{ month: '13', amount: '0' }] } ]) {
    expect(() => calculate({ ...actual, balanceMonthly: { ...actual.balanceMonthly, ...change } })).toThrow();
  }
  const zero = calculate({ balanceMethod: 'monthly', balanceMonthly: { statementBasis: 'average', allMonthsIncluded: true, qualifiedHomeMonths: ['1'], balances: [{ month: '1', amount: '0' }] }, mortgageInterest: '0', interestPaidByReturnAmount: '0' });
  expect(zero.input.mortgageInterestWorksheet?.loans[0]?.balance).toMatchObject({ balances: [{ month: 1, amount: '0' }] });
  const huge = calculate({ ...actual, balanceMonthly: { ...actual.balanceMonthly, qualifiedHomeMonths: ['1'], balances: [{ month: '1', amount: '9007199254740993.01' }] } });
  expect(huge.input.mortgageInterestWorksheet?.loans[0]?.balance).toMatchObject({ balances: [{ month: 1, amount: '9007199254740993.01' }] });
});
it('uses the published interest-rate example and rejects inconsistent original shares', () => {
  const sources = { currentYearInterest: '2500', currentYearInterestPaidInPriorYears: '0', currentYearInterestPaidInPriorYearsByOthers: '0', interestRefundedToOthers: '0', lowestAnnualRate: '0.09', securedAllYear: true, interestPaidAtLeastMonthly: true };
  const actual = { balanceMethod: 'interest_rate' as const, balanceInterestRate: sources, mortgageInterest: '2500', interestPaidByReturnAmount: '2500', outstandingPrincipal: '30000' };
  const { input, result } = calculate(actual);
  expect(input.mortgageInterestWorksheet?.loans[0]?.balance).toEqual({ method: 'interest_rate', ...sources });
  expect(result.averageQualifiedDebt.toFixed()).toBe('27778'); expect(result.mortgageInterest.toFixed()).toBe('2500');
  for (const change of [{ currentYearInterestPaidInPriorYears: '' }, { currentYearInterest: '2501' }, { lowestAnnualRate: '9' }, { lowestAnnualRate: '0' }, { lowestAnnualRate: 'NaN' }, { securedAllYear: null }, { interestPaidAtLeastMonthly: false }]) expect(() => calculate({ ...actual, balanceInterestRate: { ...sources, ...change } })).toThrow();
  const prior = calculate({ ...actual, balanceInterestRate: { ...sources, currentYearInterest: '2700', currentYearInterestPaidInPriorYears: '100', currentYearInterestPaidInPriorYearsByOthers: '200', interestRefundedToOthers: '100' }, mortgageInterest: '2500', interestPaidByReturnAmount: '2000', interestPaidByOthers: '500' });
  // Actual2000 paid now plus100 prepaid for this year; the other return's200 is not our deduction.
  expect(prior.result.averageQualifiedDebt.toFixed()).toBe('30000'); expect(prior.result.mortgageInterest.toFixed()).toBe('2100');
});
it('transfers actual monthly source debt through the full return once', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '10000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  state.sectionData.deductions = data({ balanceMethod: 'monthly', balanceMonthly: { statementBasis: 'closing', allMonthsIncluded: true, qualifiedHomeMonths: ['10', '11', '12'], balances: [{ month: '10', amount: '900000.10' }, { month: '11', amount: '800000.20' }, { month: '12', amount: '699999.70' }] } });
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form1098[0]?.mortgageInterestReceived).toBe('40000.1');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.itemizedDeductions.toFixed()).toBe('37520'); expect(result.taxableIncome.toFixed()).toBe('62480');
});

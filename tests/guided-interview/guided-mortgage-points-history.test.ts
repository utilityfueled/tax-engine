// Spec: spec/federal/guided-mortgage-points-history.yaml
import { expect, it } from 'vitest';
import { calculateHomeMortgageInterest } from '@/engine/forms/home-mortgage-interest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildGuidedMortgageInputs } from '@/lib/guided-mortgage-worksheet';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, type MortgageEntryData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeW2Entry, startCompleteInterview } from './complete-facts';

const history = {
  sourceTaxYear: '2025', sourceReference: 'Actual original closing and points ledger', originalLender: 'Actual lender', originalAccountReference: 'Original loan A',
  paidDate: '2025-09-01', originalPoints: '4800', originalPrincipal: '100000', priorPointsDeducted: '0', unamortizedPointsAtStartOfYear: '0',
  loanTermMonths: '240', paymentsInYear: '3', paymentIntervalMonths: '1', cashMethod: true, comparableLoanTerms: true, pointsAreInterest: true, historyConfirmed: true,
};
const payoff = { ...history, paidDate: '2014-01-01', originalPoints: '3000', priorPointsDeducted: '2200', unamortizedPointsAtStartOfYear: '800',
  completedMethod: 'early_termination', deductibleAmountBeforeLimit: '800', unamortizedPointsAvailable: '800', serviceFeesExcludedConfirmed: true, reportedOnCurrentForm1098: false,
  endingDate: '2025-06-01', sameLenderRefinance: false, completedMethodConfirmed: true,
};
function data(change: Record<string, unknown> = {}, year = 2025) {
  const entry = { ...completeMortgageSource, sourceTaxYear: String(year), mortgageInterest: '10000', interestPaidByReturnAmount: '10000', outstandingPrincipal: '100000', maximumBalanceDuringYear: '100000',
    originationDate: '2025-09-01', pointsPaid: '4800', pointsPaidByReturnAmount: '4800', pointsMethod: 'ratable', pointsHistory: history, ...change } as unknown as MortgageEntryData;
  return { ...emptyDeductionData, method: 'itemized' as const, mortgageEntries: [entry],
    mortgageWorksheet: { sourceTaxYear: String(year), sourceReference: 'Actual annual home records', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true } };
}
function calculate(change: Record<string, unknown> = {}, year = 2025) {
  const input = buildGuidedMortgageInputs(data(change, year), year, 'single');
  return { input, result: calculateHomeMortgageInterest({ taxpayer: { taxYear: year, filingStatus: 'single' }, ...input, form1099Misc: [] }) };
}
it('uses the published ratable points sources and retains prior history with zero current Box6', () => {
  const first = calculate(); expect(first.result.deductiblePoints.toFixed()).toBe('60'); expect(first.result.line8a.toFixed()).toBe('10060');
  expect(first.input.form1098[0]?.pointsPaid).toBe('4800');
  expect(calculate({ propertyUse: 'second-home' }).result.deductiblePoints.toFixed()).toBe('60');
  const next = calculate({ pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsHistory: { ...history, sourceTaxYear: '2026', priorPointsDeducted: '60', unamortizedPointsAtStartOfYear: '4740', paymentsInYear: '12' }, hasMortgageInsuranceAllocation: false }, 2026);
  expect(next.result.deductiblePoints.toFixed()).toBe('240'); expect(next.result.line8c.toFixed()).toBe('240'); expect(next.input.form1098[0]?.pointsPaid).toBe('0');
  expect(next.input.mortgageInterestWorksheet?.loans[0]?.points).toMatchObject({ method: 'ratable', originalPoints: '4800', unamortizedPointsAtStartOfYear: '4740', paymentsInYear: 12 });
});
it('binds completed payoff and refinancing histories without accelerating same-lender points', () => {
  const actual = { originationDate: '2014-01-01', pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsMethod: 'completed_amortization', pointsHistory: payoff };
  expect(calculate(actual).result.deductiblePoints.toFixed()).toBe('800');
  expect(() => calculate({ ...actual, pointsHistory: { ...payoff, sameLenderRefinance: true } })).toThrow(/same.lender|refinanc/i);
  const spread = { ...payoff, completedMethod: 'same_lender_refinancing', sameLenderRefinance: true, newLoanReference: 'Actual new loan B', newLoanTermMonths: '180', sameLenderBalanceSpreadConfirmed: true, deductibleAmountBeforeLimit: '27' };
  expect(calculate({ ...actual, pointsHistory: spread }).result.deductiblePoints.toFixed()).toBe('27');
  for (const value of [undefined, null, false]) expect(() => calculate({ ...actual, pointsHistory: { ...spread, sameLenderBalanceSpreadConfirmed: value } })).toThrow();
  expect(() => calculate({ ...actual, pointsHistory: { ...payoff, endingDate: '2024-06-01' } })).toThrow();
  // Pub936 Refinancing Example2: 3000 gross less1000 services, 25% improvement
  // gives500 current plus50 ratable. The actual completed worksheet supplies550.
  const improvement = { ...history, originalPoints: '2000', completedMethod: 'qualified_improvement_allocation', deductibleAmountBeforeLimit: '550', unamortizedPointsAvailable: '2000', serviceFeesExcludedConfirmed: true, reportedOnCurrentForm1098: true, completedMethodConfirmed: true };
  const refinance = { loanType: 'refinance', pointsPaid: '3000', pointsPaidByReturnAmount: '3000', pointsNotInterest: '1000', pointsMethod: 'completed_amortization', pointsHistory: improvement,
    balanceMethod: 'category_worksheet', balanceCategories: { sourceTaxYear: '2025', worksheetReference: 'Actual old acquisition refinance', grandfatheredDebt: '0', acquisitionDebtBefore2017: '100000', acquisitionDebtAfter2017: '0', excludedDebt: '0', classificationConfirmed: true, paymentsAppliedInRequiredOrderConfirmed: true, interestAllocationConfirmed: true, refinancingHistoryConfirmed: true } };
  expect(calculate(refinance).result.deductiblePoints.toFixed()).toBe('550');
  expect(() => calculate({ ...refinance, propertyUse: 'second-home' })).toThrow(/main.home|improv/i);
});
it('rejects unknown and contradictory points history while preserving exact actual amounts', () => {
  for (const patch of [{ sourceTaxYear: '' }, { sourceTaxYear: '2024' }, { sourceReference: '' }, { originalAccountReference: '' }, { paidDate: '' }, { originalPoints: undefined }, { originalPrincipal: 'NaN' },
    { priorPointsDeducted: '-1' }, { unamortizedPointsAtStartOfYear: '' }, { cashMethod: null }, { pointsAreInterest: false }, { historyConfirmed: false }, { paymentsInYear: '' }, { paymentsInYear: '13' }, { paymentIntervalMonths: '0' }, { loanTermMonths: '361' }]) expect(() => calculate({ pointsHistory: { ...history, ...patch } })).toThrow();
  expect(() => calculate({ pointsHistory: { ...history, originalPoints: '4799' } })).toThrow(/reconcil|source|current/i);
  expect(() => calculate({ originationDate: '2024-09-01', pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsHistory: { ...history, paidDate: '2024-09-01', priorPointsDeducted: '60', unamortizedPointsAtStartOfYear: '4741' } })).toThrow(/history|reconcil|remaining/i);
  expect(() => calculate({ originationDate: '2025-10-01' })).toThrow(/date|original/i);
  expect(() => calculate({ pointsMethod: '' })).toThrow(/method|points/i);
  expect(() => calculate({ pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsMethod: undefined, pointsHistory: undefined })).toThrow(/method|history/i);
  expect(calculate({ pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsMethod: 'none', pointsHistory: undefined }).result.deductiblePoints.toFixed()).toBe('0');
  const zero = calculate({ pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsHistory: { ...history, originalPoints: '0', paymentsInYear: '0' } });
  expect(zero.result.mortgageInterest.toFixed()).toBe('10000');
  const huge = '9007199254740993.01';
  const precise = calculate({ pointsPaid: huge, pointsPaidByReturnAmount: huge, pointsHistory: { ...history, originalPoints: huge } });
  expect(precise.input.mortgageInterestWorksheet?.loans[0]?.points).toMatchObject({ originalPoints: huge });
  expect(() => calculate({ originationDate: '2014-01-01', pointsPaid: '1', pointsPaidByReturnAmount: '1', pointsMethod: 'completed_amortization', pointsHistory: { ...payoff, unamortizedPointsAvailable: '801' } })).toThrow(/mixed|reported|cohort/i);
});
it('transfers actual prior points through the canonical return once', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '10000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  state.sectionData.deductions = data({ originationDate: '2014-01-01', pointsPaid: '0', pointsPaidByReturnAmount: '0', pointsMethod: 'completed_amortization', pointsHistory: payoff });
  const input = buildTaxInputFromGuidedData(state); expect(input?.form1098[0]?.pointsPaid).toBe('0');
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.itemizedDeductions.toFixed()).toBe('10800'); expect(result.taxableIncome.toFixed()).toBe('89200');
});

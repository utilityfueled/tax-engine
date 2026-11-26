// Spec: spec/federal/guided-mortgage-points-history.yaml
import { expect, it } from 'vitest';
import { calculateHomeMortgageInterest } from '@/engine/forms/home-mortgage-interest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildGuidedMortgageInputs, distinctMortgageLoansConfirmation } from '@/lib/guided-mortgage-worksheet';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, type MortgageEntryData } from '@/lib/guided-interview-flow';
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

it('holds a retained original mortgage points balance claimed twice after reopening', () => {
  const ledger = { ...payoff, originalLender: 'Actual Lender', originalAccountReference: 'Loan A', originalPoints: '3000.25',
    unamortizedPointsAtStartOfYear: '800.25', unamortizedPointsAvailable: '800.25', deductibleAmountBeforeLimit: '800.25' };
  const deductions = data({ accountReference: 'Loan A', originationDate: ledger.paidDate, mortgageInterest: '10000.15',
    interestPaidByReturnAmount: '10000.15', pointsPaid: '0', pointsPaidByReturnAmount: '0',
    pointsMethod: 'completed_amortization', pointsHistory: ledger });
  const firstLoan = deductions.mortgageEntries[0]!;
  const secondLoan = { ...firstLoan, accountReference: 'Loan B' };
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '10000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  } as Storage;
  const reopen = (second: MortgageEntryData) => {
    const entries = [firstLoan, second].map(entry => ({ ...entry, mortgageAcquisitionDate: null }));
    const root = { ...deductions.mortgageWorksheet, distinctMortgageLoansSourceReference: 'Separate signed notes and balances for Loans A and B' };
    state.sectionData.deductions = { ...deductions, mortgageEntries: entries,
      mortgageWorksheet: { ...root, distinctMortgageLoansConfirmation: distinctMortgageLoansConfirmation(root, entries) } };
    expect(saveGuidedFlowState(storage, 'fictional-mortgage-points', state)).toBe(true);
    const reopened = loadGuidedFlowState(storage, 'fictional-mortgage-points');
    if (!reopened) throw new Error('Expected the original saved mortgage worksheet.');
    expect(reopened.sectionData.deductions?.mortgageEntries).toEqual(entries);
    return reopened;
  };
  const reopenAndCalculate = (second: MortgageEntryData) => {
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(second)));
    expect(input.form1098.map(form => [form.loanAccountReference, form.pointsPaid])).toEqual([['Loan A', '0'], ['Loan B', '0']]);
    const federal = calculateFederalTax(input);
    const worksheet = federal.scheduleA.mortgageWorksheet;
    expect(worksheet.sourceDeductions.map(source => source.interestBeforeLimit.toFixed())).toEqual(['10000.15', '10000.15']);
    return { itemized: federal.itemizedDeductions.toFixed(), line8c: worksheet.line8c.toFixed(),
      originalPoints: worksheet.sourceDeductions.map(source => source.pointsBeforeLimit.toFixed()) };
  };

  const singleClaim = { itemized: '20800', line8c: '800', originalPoints: ['800.25', '0'] };
  expect(reopenAndCalculate({ ...secondLoan, pointsMethod: 'none', pointsHistory: undefined })).toEqual(singleClaim);
  expect(reopenAndCalculate({ ...secondLoan, pointsHistory: { ...ledger, originalAccountReference: 'Loan B' } }))
    .toEqual({ itemized: '21601', line8c: '1601', originalPoints: ['800.25', '800.25'] });
  const renamed = { ...ledger, originalLender: ' actual lender ', originalAccountReference: ' loan a ', sourceReference: 'Copy of the original ledger' };
  expect(reopenAndCalculate({ ...secondLoan, pointsHistory: { ...renamed, completedMethod: 'ongoing_amortization', deductibleAmountBeforeLimit: '0' } })).toEqual(singleClaim);
  expect(reopenAndCalculate({ ...secondLoan, pointsMethod: 'ratable', pointsHistory: { ...renamed, paymentsInYear: '0' } })).toEqual(singleClaim);
  const unknown = reopen({ ...secondLoan, pointsHistory: { ...renamed, historyConfirmed: null } });
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  expect(() => buildGuidedMortgageInputs(unknown.sectionData.deductions, 2025, 'single')).toThrow(/confirm.*original loan/i);
  for (const pointsMethod of ['completed_amortization', 'ratable'] as const) {
    const duplicate = reopen({ ...secondLoan, pointsMethod, pointsHistory: renamed });
    expect(buildTaxInputFromGuidedData(duplicate)).toBeNull();
    expect(() => buildGuidedMortgageInputs(duplicate.sectionData.deductions, 2025, 'single')).toThrow(/same original loan.*points/i);
  }
});

it('reconciles a saved same-lender refinance with separate old and successor points', () => {
  const deductions = data({ accountReference: 'Loan A', originationDate: payoff.paidDate, pointsPaid: '0', pointsPaidByReturnAmount: '0',
    pointsHistory: { ...payoff, sourceReference: 'Actual old-loan payment ledger', originalLender: 'Actual Lender',
      originalAccountReference: 'Loan A', loanTermMonths: '180', paymentsInYear: '6' } });
  const original = deductions.mortgageEntries[0]!;
  const completed = { ...original.pointsHistory, sourceReference: 'Actual successor worksheet', completedMethod: 'same_lender_refinancing' as const,
    endingDate: '2025-07-01', sameLenderRefinance: true, newLoanReference: ' loan B ', newLoanTermMonths: '180',
    sameLenderBalanceSpreadConfirmed: true, sameLenderWorksheetScope: 'successor_only' as const,
    successorPaymentsInYear: '6', successorPaymentIntervalMonths: '1', deductibleAmountBeforeLimit: '23.33' };
  const successor: MortgageEntryData = { ...original, accountReference: 'Loan B', lender: ' actual lender ',
    originationDate: '2025-07-01', loanType: 'refinance', pointsMethod: 'completed_amortization', pointsHistory: completed,
    balanceMethod: 'category_worksheet', balanceCategories: { sourceTaxYear: '2025', worksheetReference: 'Actual refinanced acquisition debt',
      grandfatheredDebt: '0', acquisitionDebtBefore2017: '100000', acquisitionDebtAfter2017: '0', excludedDebt: '0', classificationConfirmed: true,
      paymentsAppliedInRequiredOrderConfirmed: true, interestAllocationConfirmed: true, refinancingHistoryConfirmed: true } };
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '10000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  } as Storage;
  const reopen = (loans: MortgageEntryData[]) => {
    const entries = loans.map(entry => ({ ...entry, mortgageAcquisitionDate: null }));
    const root = { ...deductions.mortgageWorksheet, distinctMortgageLoansSourceReference: 'Original note, old-loan payoff and separately executed successor note' };
    state.sectionData.deductions = { ...deductions, mortgageEntries: entries,
      mortgageWorksheet: { ...root, distinctMortgageLoansConfirmation: distinctMortgageLoansConfirmation(root, entries) } };
    expect(saveGuidedFlowState(storage, 'fictional-refinanced-points', state)).toBe(true);
    const reopened = loadGuidedFlowState(storage, 'fictional-refinanced-points');
    if (!reopened) throw new Error('Expected the saved refinancing worksheet.');
    expect(reopened.sectionData.deductions?.mortgageEntries).toEqual(entries);
    return reopened;
  };
  const verify = (entries: MortgageEntryData[], expectedPoints: string[], line8c = '123', itemized = '20123') => {
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(entries)));
    expect(input.form1098.map(form => form.pointsPaid)).toEqual(entries.map(() => '0'));
    const federal = calculateFederalTax(input);
    expect(federal.scheduleA.mortgageWorksheet.sourceDeductions.map(source => source.pointsBeforeLimit.toFixed())).toEqual(expectedPoints);
    expect(federal.scheduleA.mortgageWorksheet.line8c.toFixed()).toBe(line8c);
    expect(federal.itemizedDeductions.toFixed()).toBe(itemized);
  };
  verify([original, successor], ['100', '23.33']);
  verify([successor, original], ['23.33', '100']);
  const annual = { ...completed, sameLenderWorksheetScope: 'full_year' as const, successorPaymentsInYear: undefined,
    successorPaymentIntervalMonths: undefined, deductibleAmountBeforeLimit: '123.33' };
  verify([{ ...original, pointsMethod: 'none', pointsHistory: undefined }, { ...successor, pointsHistory: annual }], ['0', '123.33']);
  verify([{ ...successor, pointsHistory: { ...annual, sameLenderWorksheetScope: undefined } }], ['123.33'], '123', '10123');
  const zeroOld = { ...original, pointsHistory: { ...original.pointsHistory, paymentsInYear: '0' } };
  verify([zeroOld, { ...successor, pointsHistory: annual }], ['0', '123.33']);
  const halfCent = { ...completed, newLoanTermMonths: '160', successorPaymentsInYear: '1', deductibleAmountBeforeLimit: '4.38' };
  verify([original, { ...successor, pointsHistory: halfCent }], ['100', '4.38'], '104', '20104');
  const current = { ...successor, pointsPaid: '3000', pointsPaidByReturnAmount: '3000', pointsHistory: {
    ...completed, paidDate: '2025-04-01', priorPointsDeducted: '0', unamortizedPointsAtStartOfYear: '0', unamortizedPointsAvailable: '3000', reportedOnCurrentForm1098: true,
  } };
  const currentControl = { ...current, pointsHistory: { ...current.pointsHistory, sameLenderWorksheetScope: undefined } };
  expect(buildTaxInputFromGuidedData(reopen([currentControl]))?.form1098[0]?.pointsPaid).toBe('3000');
  const excessiveSuccessor = { ...successor, pointsHistory: { ...completed, deductibleAmountBeforeLimit: '700' } };
  for (const entries of [
    [excessiveSuccessor], [zeroOld, successor], [{ ...successor, pointsHistory: { ...completed, deductibleAmountBeforeLimit: '0' } }],
    [current], [{ ...original, pointsHistory: { ...original.pointsHistory, sameLenderWorksheetScope: 'successor_only' as const } }],
  ]) {
    const held = reopen(entries);
    expect.soft(buildTaxInputFromGuidedData(held) === null).toBe(true);
    expect.soft(() => buildGuidedMortgageInputs(held.sectionData.deductions, 2025, 'single')).toThrow(/successor-only/i);
  }
  for (const unresolved of [
    { ...completed, deductibleAmountBeforeLimit: '700' },
    { ...completed, successorPaymentsInYear: undefined },
    { ...completed, successorPaymentIntervalMonths: undefined },
    { ...completed, successorPaymentsInYear: '0' },
    { ...completed, successorPaymentsInYear: '12' },
    { ...completed, successorPaymentsInYear: '7', successorPaymentIntervalMonths: '2' },
    { ...completed, newLoanTermMonths: '3' },
    { ...completed, deductibleAmountBeforeLimit: '23.34' },
    { ...halfCent, deductibleAmountBeforeLimit: '4.3801' },
    { ...completed, sameLenderWorksheetScope: undefined },
    annual,
    { ...completed, newLoanReference: 'Other Loan' },
    { ...completed, endingDate: '2025-07-02' },
    { ...completed, sourceReference: original.pointsHistory!.sourceReference },
    { ...completed, priorPointsDeducted: '2199.99', unamortizedPointsAtStartOfYear: '800.01', unamortizedPointsAvailable: '800.01' },
    { ...completed, deductibleAmountBeforeLimit: '700.01' },
  ]) {
    const held = reopen([original, { ...successor, pointsHistory: unresolved }]);
    expect.soft(buildTaxInputFromGuidedData(held) === null).toBe(true);
    expect.soft(() => buildGuidedMortgageInputs(held.sectionData.deductions, 2025, 'single'))
      .toThrow(/same original loan.*points.*successor|actual successor/i);
  }
});

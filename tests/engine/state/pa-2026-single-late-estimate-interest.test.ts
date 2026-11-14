import { describe, expect, it } from 'vitest';
import { estimatePennsylvania2026SingleLateInstallmentInterest } from '@/engine/state/pa-2026-single-late-estimate-interest.js';

type Source = Parameters<typeof estimatePennsylvania2026SingleLateInstallmentInterest>[0];
const paid = (installment: 1 | 2 | 3 | 4, paymentDate: string) => ({
  receiptId: `synthetic-receipt-${installment}`,
  taxYear: 2026 as const,
  installment,
  amount: '225',
  paymentDate,
  accountCreditDate: paymentDate,
});
const source = {
  taxYear: 2026,
  ordinaryOriginalCalendarYearFullYearResidentConfirmed: true,
  noFarmerOrOtherSpecialInstallmentRuleConfirmed: true,
  sameTaxpayerAndAccountForAllOriginalsConfirmed: true,
  currentYearLifeAndNoPaymentReliefConfirmed: true,
  completeCurrentIncomeCreditAndPaymentOriginalsConfirmed: true,
  noWithholdingCreditsCarryforwardOffsetsOrReversalsConfirmed: true,
  actualAsOfDate: '2027-01-15',
  firstDeterminedEstimatesRequiredOn: '2026-03-31',
  declaration: { taxYear: 2026, filedOn: '2026-05-15', originalUnamendedConfirmed: true, estimatedTax: '900' },
  actualAnnualIncomeTax: '1000',
  actualPATaxableIncomeThroughMarch: '15000',
  priorReturn: {
    taxYear: 2025,
    filedOn: '2026-03-15',
    completeFullYearResidentCalendarOriginalConfirmed: true,
    estimatedPaymentsRequiredConfirmed: true,
    taxableIncome: '30000',
    taxForgiveness: '0',
  },
  estimatedPaymentOriginals: [paid(1, '2026-05-15'), paid(2, '2026-06-15'), paid(3, '2026-09-15'), paid(4, '2027-01-15')],
} satisfies Source;

function estimate(change: object = {}) {
  return estimatePennsylvania2026SingleLateInstallmentInterest({ ...source, ...change });
}

describe('2026 Pennsylvania first installment underpayment estimate', () => {
  it('computes a single fully cleared first-quarter interest span exactly', () => {
    const result = estimate();
    const fourth = source.estimatedPaymentOriginals[3];
    const orderedDifferently = estimate({ estimatedPaymentOriginals: [fourth, ...source.estimatedPaymentOriginals.slice(0, 3)] });
    expect(orderedDifferently.exactInterest.eq(result.exactInterest)).toBe(true);
    expect(result.kind).toBe('pa-2026-single-late-installment-interest-estimate');
    expect(result.dueDate).toBe('2026-04-15');
    expect(result.clearedOn).toBe('2026-05-15');
    expect(result.daysUnpaid).toBe(30);
    expect(result.underpayment.toFixed()).toBe('225');
    expect(result.dailyInterestRate.toFixed()).toBe('0.000192');
    expect(result.exactInterest.toFixed()).toBe('1.296');
    expect(JSON.stringify(result)).not.toContain('synthetic-receipt');
    for (const [date, days, interest] of [['2026-04-16', 1, '0.0432'], ['2026-06-14', 60, '2.592']] as const) {
      const edge = estimate({ declaration: { ...source.declaration, filedOn: date },
        estimatedPaymentOriginals: [paid(1, date), ...source.estimatedPaymentOriginals.slice(1)] });
      expect(edge.daysUnpaid).toBe(days);
      expect(edge.exactInterest.toFixed()).toBe(interest);
    }
  });

  it('rejects unknown, exempt, incompatible or contradictory source facts', () => {
    for (const patch of [
      { taxYear: 2025 }, { actualAnnualIncomeTax: '999.99' }, { actualAnnualIncomeTax: '1001' },
      { actualAnnualIncomeTax: 1000 }, { actualPATaxableIncomeThroughMarch: '14000' },
      { actualPATaxableIncomeThroughMarch: '0' }, { actualPATaxableIncomeThroughMarch: undefined },
      { firstDeterminedEstimatesRequiredOn: '2026-04-01' }, { firstDeterminedEstimatesRequiredOn: '2026-02-29' },
      { declaration: { ...source.declaration, filedOn: '2026-03-30' } },
      { declaration: { ...source.declaration, filedOn: '2026-04-16' } },
      { declaration: { ...source.declaration, originalUnamendedConfirmed: false } },
      { declaration: { ...source.declaration, estimatedTax: '899.99' } },
      { priorReturn: { ...source.priorReturn, taxableIncome: '11000' } },
      { priorReturn: { ...source.priorReturn, taxForgiveness: '1' } },
      { priorReturn: { ...source.priorReturn, estimatedPaymentsRequiredConfirmed: false } },
      { priorReturn: { ...source.priorReturn, completeFullYearResidentCalendarOriginalConfirmed: null } },
      { priorReturn: { ...source.priorReturn, filedOn: '2027-01-16' } },
      { priorReturn: undefined }, { noWithholdingCreditsCarryforwardOffsetsOrReversalsConfirmed: null },
      { ordinaryOriginalCalendarYearFullYearResidentConfirmed: false }, { noFarmerOrOtherSpecialInstallmentRuleConfirmed: false },
      { sameTaxpayerAndAccountForAllOriginalsConfirmed: false }, { currentYearLifeAndNoPaymentReliefConfirmed: false },
      { completeCurrentIncomeCreditAndPaymentOriginalsConfirmed: undefined },
    ]) expect(() => estimate(patch), JSON.stringify(patch)).toThrow();
  });

  it('uses whole-dollar PA-40 originals and the exact current-rate declaration comparison', () => {
    const withPriorIncome = (taxableIncome: string) => estimate({ priorReturn: { ...source.priorReturn, taxableIncome } });
    expect(() => withPriorIncome('29315')).toThrow();
    expect(withPriorIncome('29316').exactInterest.toFixed()).toBe('1.296');
    expect(withPriorIncome('29316.00').exactInterest.toFixed()).toBe('1.296');
    expect(() => withPriorIncome('29315.96')).toThrow();
    expect(() => withPriorIncome('29315.97')).toThrow();
  });

  it('rejects ambiguous, partial, future or mistimed receipts', () => {
    const [first, second, third, fourth] = source.estimatedPaymentOriginals;
    const other = [second, third, fourth];
    for (const current of [
      [paid(1, '2026-04-15'), ...other], [paid(1, '2026-06-15'), ...other], [paid(1, '2026-04-31'), ...other],
      [{ ...first, amount: '224.99' }, ...other], [{ ...first, amount: '225.01' }, ...other],
      [{ ...first, accountCreditDate: '2026-05-16' }, ...other], [{ ...first, receiptId: second.receiptId }, ...other],
      [{ ...first, taxYear: 2025 }, ...other], [first, paid(2, '2026-06-14'), third, fourth],
      [first, paid(2, '2026-06-16'), third, fourth], [first, second, third], [first, first, ...other],
    ]) expect(() => estimate({ estimatedPaymentOriginals: current }), JSON.stringify(current)).toThrow();
    expect(() => estimate({ actualAsOfDate: '2027-01-14' })).toThrow();
  });
});

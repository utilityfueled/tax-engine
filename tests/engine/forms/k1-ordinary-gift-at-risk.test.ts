// Spec: spec/federal/k1-ordinary-gift-at-risk.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateK1CharitableAtRisk, type K1CharitableRiskItem } from '@/engine/forms/k1-charitable-at-risk.js';
import { d, sum } from '@/utils/decimal.js';
function source(ordinary = '10000', risk = '4000') {
  return { form: { activityName: 'Actual fictional operating activity', ordinaryIncome: `-${ordinary}`,
    gainLossFromDispositions: '0', otherIncomeGains: '0', otherDeductionsLosses: '0', adjustedBasisAtEffectiveDate: '0',
    priorYearAmountAtRisk: risk, currentYearIncreases: '0', currentYearDecreases: '0' },
    ordinaryAmount: d(ordinary).negated(), shortTermAmount: d(0), longTermAmount: d(0), distributionGain: d(0),
    charitable: [{ sourceId: 'ordinary-cash', basisOriginTaxYear: 2025, contributionDate: '2025-05-01', category: 'cash_60' as const, amountAfterBasis: d(2000) }] as K1CharitableRiskItem[] };
}
it('keeps ordinary gifts outside zero and binding actual activity losses', () => {
  for (const risk of ['0', '4000', '10000']) {
    const input = source('10000', risk), before = JSON.stringify(input), result = calculateK1CharitableAtRisk(input);
    expect(result.totalDeductions.toFixed()).toBe('10000');
    expect(result.ordinaryAmount.toFixed()).toBe(risk === '0' ? '0' : `-${risk}`);
    expect(result.ordinarySuspended.eq(d(10000).minus(risk))).toBe(true);
    expect(result.charitable.map(row => [row.sourceId, row.allowed.toFixed(), row.suspended.toFixed()])).toEqual([['ordinary-cash', '2000', '0']]);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('retains exact original gifts through activity ordering and decreases', () => {
  const precision = Decimal.precision;
  for (const reversed of [false, true]) for (const decrease of ['0', '0.01']) {
    const input = source('8.02', '5.53');
    input.form.currentYearDecreases = decrease;
    input.charitable = [{ ...input.charitable[0], amountAfterBasis: d('1.01') },
      { ...input.charitable[0], sourceId: 'ordinary-stock', category: 'capital_gain_30', amountAfterBasis: d('2.03') }];
    if (reversed) input.charitable.reverse();
    const before = JSON.stringify(input), result = calculateK1CharitableAtRisk(input);
    expect(result.ordinaryDeductionAllowed.toFixed()).toBe(decrease === '0' ? '5.53' : '5.52');
    expect(result.ordinarySuspended.toFixed()).toBe(decrease === '0' ? '2.49' : '2.5');
    expect(sum(...result.charitable.map(row => row.allowed)).toFixed()).toBe('3.04');
    expect(sum(...result.charitable.map(row => row.suspended)).toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before); expect(Decimal.precision).toBe(precision);
  }
});

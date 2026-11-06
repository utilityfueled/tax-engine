import { expect, it } from 'vitest';
import { calculateK1CharitableAtRisk } from '@/engine/forms/k1-charitable-at-risk.js';
import { d, sum } from '@/utils/decimal.js';
function fixture() {
    return { form: { activityName: 'Fictional assigned activity', ordinaryIncome: '-8.02', gainLossFromDispositions: '0', otherIncomeGains: '0', otherDeductionsLosses: '0',
        adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '5.53', currentYearIncreases: '0', currentYearDecreases: '0' },
        ordinaryAmount: d('-8.02'), shortTermAmount: d(0), longTermAmount: d(0), distributionGain: d(0),
        charitable: [{ sourceId: 'actual-cash', basisOriginTaxYear: 2025, contributionDate: '2025-01-01', category: 'cash_60' as const, amountAfterBasis: d('1.01') },
            { sourceId: 'actual-stock', basisOriginTaxYear: 2025, contributionDate: '2025-03-01', category: 'capital_gain_30' as const, amountAfterBasis: d('2.03') }] };
}
it('reproduces the published income retention example before charitable allocation', () => {
    const input = { ...fixture(), ordinaryAmount: d(-4600), longTermAmount: d(3100), charitable: [] };
    Object.assign(input.form, { ordinaryIncome: '-4600', gainLossFromDispositions: '3100', otherDeductionsLosses: '0', priorYearAmountAtRisk: '600' });
    const r = calculateK1CharitableAtRisk(input);
    expect(r.ordinaryAmount.toFixed()).toBe('-3700'); expect(r.longTermAmount.toFixed()).toBe('3100');
    expect(r.ordinarySuspended.toFixed()).toBe('900'); expect(r.disallowedLoss.toFixed()).toBe('900');
});
it('conserves exact deduction characters across zero full and fractional capacity', () => {
    for (const reverse of [false, true]) {
        const input = fixture(); if (reverse) input.charitable.reverse();
        const before = JSON.stringify(input), r = calculateK1CharitableAtRisk(input);
        expect(r.ordinaryAmount.toFixed()).toBe('-5.53'); expect(r.ordinarySuspended.toFixed()).toBe('2.49');
        expect(Object.fromEntries(r.charitable.map(row => [row.sourceId, [row.allowed.toFixed(), row.suspended.toFixed()]]))).toEqual({ 'actual-cash': ['1.01', '0'], 'actual-stock': ['2.03', '0'] });
        expect(sum(r.ordinarySuspended, ...r.charitable.map(row => row.suspended)).eq(r.disallowedLoss)).toBe(true);
        expect(JSON.stringify(input)).toBe(before);
    }
    for (const risk of ['0', '8.02', '15']) {
        const input = fixture(); input.form.priorYearAmountAtRisk = risk;
        const r = calculateK1CharitableAtRisk(input);
        expect(r.disallowedLoss.toFixed()).toBe(risk === '0' ? '8.02' : '0');
        expect(sum(r.ordinaryAmount.abs(), ...r.charitable.map(row => row.allowed)).toFixed()).toBe(risk === '0' ? '3.04' : '11.06');
    }
    const netIncome = fixture(); netIncome.longTermAmount = d('20'); netIncome.form.gainLossFromDispositions = '20'; netIncome.form.priorYearAmountAtRisk = '0';
    const result = calculateK1CharitableAtRisk(netIncome);
    expect(result.disallowedLoss.toFixed()).toBe('0'); expect(result.ordinaryAmount.toFixed()).toBe('-8.02'); expect(result.longTermAmount.toFixed()).toBe('20');
});

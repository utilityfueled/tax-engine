// Spec: spec/federal/charitable-prior-net-operating-loss.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { Form1099DivSchema } from '@/models/inputs';
import { priorCharitableNolInput } from '../fixtures/charitable-prior-nol';
it('coordinates an actual prior charitable vintage without changing its contribution year', () => {
    const input = priorCharitableNolInput(), before = structuredClone(input), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('44000');
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('13200');
    expect(required(result.netOperatingLoss).deduction.toFixed()).toBe('56000');
    expect(required(result.netOperatingLoss).carryforward.toFixed()).toBe('44000');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('23360');
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()])).toEqual([[2024, 'capital_gain_30', 'noncash', '23360']]);
    expect(input).toEqual(before);
});
it('retains actual regular QBI when the independent AMT charity deduction differs', () => {
    const input = priorCharitableNolInput({ alternative: '10000' });
    input.w2s[0].wages = '50000';
    input.form1099Div = [Form1099DivSchema.parse({ payer: 'Synthetic REIT', ordinaryDividends: '50000', section199ADividends: '50000' })];
    const result = calculateFederalTax(input);
    expect(required(result.allLines.find(row => row.form === '1040' && row.line === '13')).value.toFixed()).toBe('6160');
    expect(required(required(result.netOperatingLoss).priorCharitableAlternativeAdjustment).amount.toFixed()).toBe('3200');
    expect(required(result.form6251).amti.toFixed()).toBe('83840');
});
it('replays the actual independent alternative charity amount before current AMT', () => {
    const input = priorCharitableNolInput({ alternative: '10000' }), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('44000');
    expect(required(result.netOperatingLoss).deduction.toFixed()).toBe('56000');
    expect(required(required(result.form6251).lines.find(row => row.line === '3')).value.toFixed()).toBe('3200');
    expect(required(result.form6251).amti.toFixed()).toBe('90000');
    expect(required(result.netOperatingLoss).alternativeTax.deduction.toFixed()).toBe('0');
});
it('coordinates the independent prior AMT carry while retaining the actual current claim', () => {
    const input = priorCharitableNolInput({ alternativeOnly: true, alternative: '40000' }), before = structuredClone(input);
    const result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('97000');
    expect(required(result.scheduleA).charitableTotal.toFixed()).toBe('29100');
    expect(required(result.netOperatingLoss).alternativeTax.deduction.toFixed()).toBe('61110');
    expect(required(result.netOperatingLoss).alternativeTax.carryforward.toFixed()).toBe('37000');
    expect(required(result.carryforwards.amtCharitableContributions).toFixed()).toBe('10090');
    expect(input).toEqual(before);
});
it('conserves original categories expiry and actual standard selection in canonical replays', () => {
    for (const [category, expected] of [['cash_60', '3840'], ['noncash_50', '14000'], ['other_30', '33360'], ['capital_gain_30', '33360'], ['capital_gain_20', '42560']] as const) {
        const result = calculateFederalTax(priorCharitableNolInput({ category, regular: '60000' }));
        expect(result.carryforwards.charitableContributions.toFixed()).toBe(expected);
        expect(result.carryforwards.charitableContributionsByYear[0].taxYear).toBe(2024);
    }
    const input = priorCharitableNolInput();
    input.deductionElection = 'automatic';
    const standard = calculateFederalTax(input), prior = required(required(standard.netOperatingLoss).priorCharitableCarryover);
    expect(standard.deductionUsed).toBe('standard');
    expect([prior.normalTreatedAsPaid.toFixed(), prior.normalDeduction.toFixed(), prior.carryforward.toFixed()]).toEqual(['13200', '0', '25400']);
    expect(required(standard.form6251).amti.toFixed()).toBe('100000');
    expect(required(required(standard.netOperatingLoss).priorCharitableAlternativeAdjustment).amount.toFixed()).toBe('0');
    for (const [contributionYear, expectedUse, expectedReduction, expectedExpired] of [[2019, '0', '0', '50000'], [2020, '13200', '13440', '23360']] as const) {
        const expired = calculateFederalTax(priorCharitableNolInput({ contributionYear }));
        const source = required(required(expired.netOperatingLoss).priorCharitableCarryover);
        expect([source.normalTreatedAsPaid.toFixed(), source.reduction.toFixed(), source.expired.toFixed(), source.carryforward.toFixed()]).toEqual([expectedUse, expectedReduction, expectedExpired, '0']);
        expect(expired.carryforwards.charitableContributionsByYear).toEqual([]);
    }
});

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}

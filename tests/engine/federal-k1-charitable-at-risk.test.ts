import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { k1CharitableReturnFixture, charitableStatement } from '../fixtures/k1-charitable-return.js';
import { attachReleasedCharitableBasis } from '../fixtures/charitable-k1-basis-release-nol.js';
import { attachCharitableActivity } from '../fixtures/k1-charitable-at-risk.js';
import { k1CharitableAtRiskFixture as fixture, k1CharitablePropertyRiskFixture, k1CharitableRiskOriginFixture } from '../fixtures/k1-charitable-at-risk.js';

it('allocates actual activity deductions after basis without merging suspension ledgers', () => {
    const input = fixture(true), before = JSON.stringify(input), result = calculateFederalTax(input);
    const activity = requireRiskSource(result.scheduleE).partnerships[0];
    expect(activity.basisAdjustedNetAmount.toFixed()).toBe('-40000');
    expect(activity.netAmount.toFixed()).toBe('-25000');
    expect(activity.suspendedAtRiskLoss.toFixed()).toBe('-15000');
    expect(requireRiskSource(activity.basisResult).suspendedLossCarryforward.ordinary.toFixed()).toBe('40000');
    expect(requireRiskSource(activity.basisResult).suspendedLossCarryforward.charitable.toFixed()).toBe('10000');
    expect(result.agi.toFixed()).toBe('75000');
    expect(requireRiskSource(result.scheduleA).cashCharitable.toFixed()).toBe('10000');
    expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
    const riskCarry = Reflect.get(result.carryforwards, 'k1AtRiskByCharacter');
    expect(riskCarry).toBeDefined();
    expect(JSON.parse(JSON.stringify(riskCarry))).toMatchObject([{ k1SourceId: 'scheduleK1:0', accountHolder: 'primary', taxYear: 2025,
        ordinary: '15000', shortTermCapital: '0', longTermCapital: '0',
        charitable: [{ sourceId: 'gift-1', basisOriginTaxYear: 2025, contributionDate: '2025-06-01', category: 'cash_60', amountAfterBasis: '10000', allowed: '10000', suspended: '0' }] }]);
    expect(JSON.stringify(input)).toBe(before);
});

it('retains separately stated income and uses deductions as the allocation denominator', () => {
    const input = fixture(false, true), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(requireRiskSource(result.scheduleE).partnerships[0].netAmount.toFixed()).toBe('-25000');
    expect(requireRiskSource(result.scheduleD).netLongTerm.toFixed()).toBe('10000');
    expect(requireRiskSource(result.scheduleA).cashCharitable.toFixed()).toBe('10000');
    expect(result.agi.toFixed()).toBe('85000');
    expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
    expect(JSON.stringify(input)).toBe(before);
});

it('allocates full qualified appreciation and capital deductions from the same actual activity', () => {
    const input = k1CharitablePropertyRiskFixture(), result = calculateFederalTax(input), basis = requireRiskSource(requireRiskSource(result.scheduleE).partnerships[0].basisResult);
    expect(requireRiskSource(result.scheduleA).nonCashCharitable.toFixed()).toBe('154');
    expect(requireRiskSource(result.scheduleD).netLongTerm.toFixed()).toBe('-16');
    expect(result.agi.toFixed()).toBe('99984');
    expect(basis.suspendedLossCarryforward.charitable.toFixed()).toBe('36');
    expect(basis.suspendedLossCarryforward.longTermCapital.toFixed()).toBe('9');
});

it('rejects unknown contradictory and incomplete activity assignment sources', () => {
    for (const mutate of [
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).sourceFactsConfirmed = false; },
        (x: ReturnType<typeof fixture>) => { delete requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).sourceFactsConfirmed; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).allOriginalItemsBelongToActivityConfirmed = false; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).sourceTaxYear = 2024; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).sourceReference = ''; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds = ['gift-1', 'gift-1']; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(requireRiskSource(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds = undefined; },
        (x: ReturnType<typeof fixture>) => { Reflect.deleteProperty(requireRiskSource(charitableStatement(x).atRisk), 'activityAllocation'); },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(x.scheduleK1[0].form6198).otherDeductionsLosses = '9999.99'; },
        (x: ReturnType<typeof fixture>) => { x.scheduleK1[0].atRiskAmount = '25000'; },
        (x: ReturnType<typeof fixture>) => { delete requireRiskSource(charitableStatement(x).atRisk).priorLossHistory; },
        (x: ReturnType<typeof fixture>) => { requireRiskSource(x.scheduleK1[0].form6198).currentYearDecreases = '25001'; requireRiskSource(charitableStatement(x).atRisk).currentYearDecreases = '25001'; },
    ]) {
        const input = fixture(); mutate(input);
        const before = JSON.stringify(input);
        expect(() => calculateK1CharitableReturnSources(input)).toThrow(/at-risk|activity|allocation/i);
        expect(JSON.stringify(input)).toBe(before);
    }
});

it('keeps charitable activity allocation outside passive and qualified loss ledgers', () => {
    const input = fixture(), k = input.scheduleK1[0], q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    Object.assign(k, { isPassiveActivity: true, qbiMateriallyParticipated: false });
    Object.assign(requireRiskSource(q.statement), { isPassiveActivity: true, qbiMateriallyParticipated: false });
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(requireRiskSource(result.scheduleE).partnerships[0].netAmount.toFixed()).toBe('-25000');
    expect(result.agi.toFixed()).toBe('100000'); expect(requireRiskSource(result.scheduleA).cashCharitable.toFixed()).toBe('10000');
    expect(requireRiskSource(result.form8582).activityAllocations[0].suspendedLoss.toFixed()).toBe('25000');
    expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('0');
    expect(requireRiskSource(result.carryforwards.k1AtRiskByCharacter)[0].ordinary.toFixed()).toBe('15000');
    expect(requireRiskSource(result.carryforwards.k1AtRiskByCharacter)[0].charitable[0].suspended.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
});
it('requires separate passive character sources for original capital items', () => {
    const property = k1CharitablePropertyRiskFixture();
    property.scheduleK1[0].isPassiveActivity = true;
    expect(() => calculateFederalTax(property)).toThrow(/passive.*capital.*source/i);
    const income = fixture(false, true);
    income.scheduleK1[0].isPassiveActivity = true;
    requireRiskSource(requireRiskSource(income.qbiLossSources).activities)[0].statement = {
        ...requireRiskSource(requireRiskSource(requireRiskSource(income.qbiLossSources).activities)[0].statement),
        isPassiveActivity: true,
    };
    expect(() => calculateFederalTax(income)).toThrow(/passive.*capital.*source/i);
});
it('retains original basis release identity through current activity allocation', () => {
    const input = attachReleasedCharitableBasis(k1CharitableReturnFixture(), { amount: '60000', ownerBasis: '30000' });
    const source = charitableStatement(input);
    Object.assign(requireRiskSource(input.scheduleK1[0].form6198), { otherDeductionsLosses: '0', priorYearAmountAtRisk: '15000' });
    requireRiskSource(source.atRisk).priorYearAmountAtRisk = '15000'; attachCharitableActivity(input);
    const before = JSON.stringify(input), result = calculateFederalTax(input), basis = requireRiskSource(requireRiskSource(requireRiskSource(result.scheduleE).partnerships[0].basisResult).charitableSources);
    expect(basis.appreciationExempt.toFixed()).toBe('0'); expect(basis.basisSuspended.toFixed()).toBe('30000');
    expect(requireRiskSource(result.scheduleA).nonCashCharitable.toFixed()).toBe('30000');
    expect(requireRiskSource(result.carryforwards.k1AtRiskByCharacter)[0].charitable[0]).toMatchObject({ sourceId: 'actual-prior-basis-2018', basisOriginTaxYear: 2018, contributionDate: '2018-06-01', category: 'capital_gain_30' });
    expect(requireRiskSource(result.carryforwards.k1AtRiskByCharacter)[0].charitable[0].suspended.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('0'); expect(JSON.stringify(input)).toBe(before);
});

it('reconciles current loss classification after the source-specific at-risk allocation', () => {
    const input = k1CharitableRiskOriginFixture(), before = JSON.stringify(input), r = calculateFederalTax(input);
    expect(r.agi.toFixed()).toBe('25000'); expect(requireRiskSource(r.scheduleA).cashCharitable.toFixed()).toBe('10000');
    expect(r.deductionAmount.toFixed()).toBe('30000'); expect(requireRiskSource(r.form172).regular.netOperatingLoss.toFixed()).toBe('5000');
    expect(requireRiskSource(r.form172).alternativeTax.netOperatingLoss.toFixed()).toBe('0'); expect(requireRiskSource(r.form6251).amti.toFixed()).toBe('15000');
    expect(requireRiskSource(r.carryforwards.k1AtRiskByCharacter)[0].ordinary.toFixed()).toBe('15000');
    expect(requireRiskSource(r.carryforwards.k1AtRiskByCharacter)[0].charitable[0].suspended.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
});

import { it, expect } from 'vitest';
import type Decimal from 'decimal.js';
import { d } from '@/utils/decimal.js';
function expectRatio(actual: Decimal | undefined, numerator: string, denominator: string) {
    expect(requireRiskSource(actual).toFixed(25)).toBe(d(numerator).div(denominator).toFixed(25));
}

import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleE } from '@/engine/schedules/schedule-e.js';
import { calculateK1OrdinarySelfEmployment } from '@/engine/forms/k1-ordinary-self-employment.js';
import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { k1PriorCharitableRiskFixture, passiveK1PriorRiskFixture, propertyK1PriorRiskFixture } from '../fixtures/k1-prior-charitable-at-risk.js';

it('releases actual prior activity deductions once while preserving separate basis tax and QBI histories', () => {
    // Spec: K1 Prior Charitable At Risk, canonical-current-prior.
    const input = k1PriorCharitableRiskFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
    const activity = requireRiskSource(result.scheduleE).partnerships[0];
    expect(activity.basisAdjustedNetAmount.toString()).toBe('-40000');
    expectRatio(activity.netAmount, '-240000', '7');
    expect(requireRiskSource(activity.basisResult).endingBasis.toString()).toBe('20000');
    expect(result.agi.toFixed(0)).toBe('85714');
    expect(requireRiskSource(result.scheduleD).netLongTerm.toString()).toBe('20000');
    expectRatio(requireRiskSource(result.scheduleA).cashCharitable, '110000', '7');
    expect(result.carryforwards.qbiLossCarryforward.toFixed(0)).toBe('11429');
    const risk = requireRiskSource(result.carryforwards.k1AtRiskByCharacter);
    const current = requireRiskSource(risk.find(row => row.taxYear === 2025));
    const oldOrdinary = requireRiskSource(risk.find(row => row.taxYear === 2022));
    const oldCash = requireRiskSource(risk.find(row => row.taxYear === 2024));
    expectRatio(current.ordinary, '120000', '7'); expect(current.charitable[0].sourceId).toBe('gift-1');
    expect(current.charitable[0].suspended.toString()).toBe('0'); expect(current.charitable[0].allowed.toString()).toBe('10000');
    expectRatio(oldOrdinary.ordinary, '60000', '7'); expect(oldCash.charitable[0].sourceId).toBe('old-cash');
    expectRatio(oldCash.charitable[0].suspended, '30000', '7');
    const qbi = requireRiskSource(result.carryforwards.qbiSuspendedLosses).find(row => row.sourceId === 'scheduleK1:0' && row.limitation === '465');
    const oldQbi = requireRiskSource(requireRiskSource(qbi).vintages.find(row => row.taxYear === 2022));
    const currentQbi = requireRiskSource(requireRiskSource(qbi).vintages.find(row => row.taxYear === 2025));
    expect(oldQbi.originalLoss.toString()).toBe('40000'); expect(oldQbi.qualifiedOriginalLoss.toString()).toBe('40000');
    // The public QBI history conserves its reported whole-dollar allowances;
    // the separate tax-character balances above retain their exact fractions.
    expect(oldQbi.remainingLoss.toString()).toBe('8571'); expect(oldQbi.qualifiedRemainingLoss.toString()).toBe('8571');
    expect(currentQbi.remainingLoss.toString()).toBe('17143'); expect(currentQbi.qualifiedRemainingLoss.toString()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
});

it('keeps prior ordinary use outside the existing current partner SE transfer', () => {
    // Spec: K1 Prior Charitable At Risk, current-partner-earnings.
    for (const passive of [false, true]) {
        const input = passive ? passiveK1PriorRiskFixture() : k1PriorCharitableRiskFixture();
        const k = input.scheduleK1[0], q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
        Object.assign(k, { selfEmploymentEarnings: '-40000' }); delete k.selfEmploymentNetEarningsAfterAdjustments;
        Object.assign(requireRiskSource(q.statement), { selfEmploymentEarnings: '-40000' }); delete requireRiskSource(q.statement).selfEmploymentNetEarningsAfterAdjustments;
        q.selfEmploymentTreatment = { sourceTaxYear: 2025, sourceReference: 'Actual current partner earnings worksheet', sourceFactsConfirmed: true,
            method: 'ordinary_current', noOtherPartnerAdjustmentsConfirmed: true,
            priorLossHistory: { sourceTaxYear: 2024, sourceReference: 'Actual independent SE history', sourceFactsConfirmed: true, amount: '0' } };
        const scheduleE = calculateScheduleE(input), transfer = calculateK1OrdinarySelfEmployment(input, scheduleE);
        expectRatio(d(transfer.scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments), passive ? '-10000' : '-160000', passive ? '1' : '7');
        k.selfEmploymentNetEarningsAfterAdjustments = '-20000';
        expect(() => calculateK1OrdinarySelfEmployment(input, scheduleE)).toThrow(/adjusted partner earnings/i);
    }
});

it('retains first-stage prior qualification through the canonical passive limit', () => {
    // Spec: K1 Prior Charitable At Risk, canonical-passive-transfer.
    for (const prior of [false, true]) {
        const input = passiveK1PriorRiskFixture(prior ? '20000' : '15000', prior), before = JSON.stringify(input);
        const result = calculateFederalTax(input);
        expect(result.agi.toString()).toBe('100000');
        expectRatio(requireRiskSource(result.scheduleA).cashCharitable, '110000', '7');
        expect(result.carryforwards.qbiLossCarryforward.toFixed(0)).toBe(prior ? '5161' : '5000');
        const passive = requireRiskSource(result.carryforwards.qbiSuspendedLosses?.find(row => row.sourceId === 'scheduleK1:0' && row.limitation === '469'));
        const current = requireRiskSource(passive.vintages.find(row => row.taxYear === 2025));
        expect(current.remainingLoss.toString()).toBe(prior ? '18802' : '19286');
        expect(current.qualifiedRemainingLoss.toString()).toBe(prior ? '6268' : '6429');
        if (prior) {
            const old = requireRiskSource(passive.vintages.find(row => row.taxYear === 2021));
            expect(old.remainingLoss.toString()).toBe('5484'); expect(old.qualifiedRemainingLoss.toString()).toBe('0');
        } else expect(passive.vintages).toHaveLength(1);
        expect(JSON.stringify(input)).toBe(before);
    }
});

it('uses actual own income before a passive net-zero result', () => {
    // Spec: K1 Prior Charitable At Risk, passive-own-income.
    const input = k1PriorCharitableRiskFixture(true), k = input.scheduleK1[0];
    const q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
    Object.assign(k, { isPassiveActivity: true, qbiMateriallyParticipated: false });
    Object.assign(requireRiskSource(q.statement), { isPassiveActivity: true, qbiMateriallyParticipated: false });
    requireRiskSource(requireRiskSource(requireRiskSource(q.atRisk).priorLossHistory).vintages)[0].materiallyParticipatedInCurrentYear = false;
    const result = calculateFederalTax(input);
    expect(result.agi.toString()).toBe('100000');
    expect(requireRiskSource(result.scheduleA).cashCharitable.toString()).toBe('5000');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('0');
    expect(result.carryforwards.qbiSuspendedLosses?.find(row => row.limitation === '469')).toBeUndefined();
    expect(requireRiskSource(result.form8995).qbiDeduction.toString()).toBe('0');
});

it('retains positive current income and prior ordinary utilization when the net activity amount is zero', () => {
    // Spec: K1 Prior Charitable At Risk, positive-income-prior-deduction.
    const input = k1PriorCharitableRiskFixture(true), result = calculateFederalTax(input);
    expect(requireRiskSource(result.scheduleE).partnerships[0].netAmount.toString()).toBe('0');
    expect(result.agi.toString()).toBe('100000');
    expect(requireRiskSource(result.scheduleA).cashCharitable.toString()).toBe('5000');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('0');
    expect(requireRiskSource(result.form8995).qbiDeduction.toString()).toBe('0');
    expect(result.carryforwards.qbiSuspendedLosses?.find(row => row.limitation === '465')?.vintages[0]?.qualifiedRemainingLoss.toString()).toBe('10000');
});

it('preserves exact prior property release separately from current basis and capital loss', () => {
    // Spec: K1 Prior Charitable At Risk, prior-property-cents.
    const input = propertyK1PriorRiskFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.agi.toString()).toBe('99984');
    expect(requireRiskSource(result.scheduleD).netCapitalGainLoss.toString()).toBe('-16');
    expect(requireRiskSource(result.scheduleA).nonCashCharitable.toString()).toBe('231');
    expect(requireRiskSource(result.scheduleA).charitableTotal.toString()).toBe('231');
    expect(requireRiskSource(requireRiskSource(result.scheduleE).partnerships[0].basisResult).suspendedLossCarryforward.charitable.toString()).toBe('36');
    const prior = result.carryforwards.k1AtRiskByCharacter?.find(row => row.taxYear === 2024);
    expect(prior?.charitable[0]?.suspended.toString()).toBe('0');
    expect(prior?.priorRecords?.[0]?.allowed.toString()).toBe('77');
    expect(JSON.stringify(input)).toBe(before);
});

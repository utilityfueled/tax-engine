import { it, expect } from 'vitest';
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
    expect(activity.netAmount.toString()).toBe('-30000');
    expect(requireRiskSource(activity.basisResult).endingBasis.toString()).toBe('20000');
    expect(result.agi.toString()).toBe('90000');
    expect(requireRiskSource(result.scheduleD).netLongTerm.toString()).toBe('20000');
    expect(requireRiskSource(result.scheduleA).cashCharitable.toString()).toBe('10000');
    expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('10000');
    expect(JSON.parse(JSON.stringify(result.carryforwards.k1AtRiskByCharacter))).toMatchObject([
        { taxYear: 2025, ordinary: '20000', charitable: [{ sourceId: 'gift-1', suspended: '5000' }] },
        { taxYear: 2022, ordinary: '10000', charitable: [] },
        { taxYear: 2024, ordinary: '0', charitable: [{ sourceId: 'old-cash', suspended: '5000' }] },
    ]);
    expect(JSON.parse(JSON.stringify(result.carryforwards.qbiSuspendedLosses))).toContainEqual({ sourceId: 'scheduleK1:0', accountHolder: 'primary', limitation: '465',
        vintages: [{ taxYear: 2022, originalLoss: '40000', qualifiedOriginalLoss: '40000', remainingLoss: '10000', qualifiedRemainingLoss: '10000' },
            { taxYear: 2025, originalLoss: '20000', qualifiedOriginalLoss: '0', remainingLoss: '20000', qualifiedRemainingLoss: '0' }] });
    expect(JSON.stringify(input)).toBe(before);
});

it('keeps prior ordinary use outside the existing current partner SE transfer', () => {
    // Spec: K1 Prior Charitable At Risk, current-partner-earnings.
    for (const passive of [false, true]) {
        const input = passive ? passiveK1PriorRiskFixture() : k1PriorCharitableRiskFixture();
        const k = input.scheduleK1[0], q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
        Object.assign(k, { selfEmploymentEarnings: '-40000', selfEmploymentNetEarningsAfterAdjustments: passive ? '-10000' : '-20000' });
        Object.assign(requireRiskSource(q.statement), { selfEmploymentEarnings: '-40000', selfEmploymentNetEarningsAfterAdjustments: passive ? '-10000' : '-20000' });
        q.selfEmploymentTreatment = { sourceTaxYear: 2025, sourceReference: 'Actual current partner earnings worksheet', sourceFactsConfirmed: true,
            method: 'ordinary_current', noOtherPartnerAdjustmentsConfirmed: true,
            priorLossHistory: { sourceTaxYear: 2024, sourceReference: 'Actual independent SE history', sourceFactsConfirmed: true, amount: '0' } };
        const scheduleE = calculateScheduleE(input), transfer = calculateK1OrdinarySelfEmployment(input, scheduleE);
        expect(transfer.scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments).toBe(passive ? '-10000' : '-20000');
    }
});

it('retains first-stage prior qualification through the canonical passive limit', () => {
    // Spec: K1 Prior Charitable At Risk, canonical-passive-transfer.
    for (const prior of [false, true]) {
        const input = passiveK1PriorRiskFixture(prior ? '20000' : '15000', prior), before = JSON.stringify(input);
        const result = calculateFederalTax(input);
        expect(result.agi.toString()).toBe('100000');
        expect(requireRiskSource(result.scheduleA).cashCharitable.toString()).toBe('10000');
        expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('5000');
        const passive = result.carryforwards.qbiSuspendedLosses?.find(row => row.sourceId === 'scheduleK1:0' && row.limitation === '469');
        expect(passive?.vintages.map(row => [row.taxYear, row.remainingLoss.toString(), row.qualifiedRemainingLoss.toString()])).toEqual(
            [...(prior ? [[2021, '5000', '0']] : []), [2025, '15000', '5000']]);
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
    expect(result.agi.toString()).toBe('99992');
    expect(requireRiskSource(result.scheduleD).netCapitalGainLoss.toString()).toBe('-8');
    expect(requireRiskSource(result.scheduleA).nonCashCharitable.toString()).toBe('115.5');
    expect(requireRiskSource(result.scheduleA).charitableTotal.toString()).toBe('116');
    expect(requireRiskSource(requireRiskSource(result.scheduleE).partnerships[0].basisResult).suspendedLossCarryforward.charitable.toString()).toBe('36');
    const prior = result.carryforwards.k1AtRiskByCharacter?.find(row => row.taxYear === 2024);
    expect(prior?.charitable[0]?.suspended.toString()).toBe('38.5');
    expect(prior?.priorRecords?.[0]?.allowed.toString()).toBe('38.5');
    expect(JSON.stringify(input)).toBe(before);
});

import { it, expect } from 'vitest';
import { calculateQbiLossCharacter } from '@/engine/forms/qbi-loss-character.js';
import { calculateQbiPriorRiskTransfer } from '@/engine/forms/k1-prior-risk-qbi.js';
import { d } from '@/utils/decimal.js';

function firstStage() {
    return calculateQbiLossCharacter({ taxYear: 2025, activitySourceId: 'scheduleK1:0', limitation: '465',
        currentLoss: d('40000'), currentQualifiedLoss: d('0'), priorLoss: d('20000'),
        calculatedAllowedLoss: d('30000'), calculatedPriorLossAllowance: d('10000'),
        history: { sourceTaxYear: 2024, sourceReference: 'Actual original465 QBI worksheet', sourceFactsConfirmed: true,
            vintages: [{ taxYear: 2022, originalLoss: '40000', qualifiedOriginalLoss: '40000',
                remainingLoss: '20000', qualifiedRemainingLoss: '20000', materiallyParticipatedInCurrentYear: false }] } });
}
const empty = () => ({ sourceTaxYear: 2024, sourceReference: 'Actual independent469 history', sourceFactsConfirmed: true, vintages: [] });
it('preserves different original fractions and prior FIFO across the later deduction allocation', () => {
    // Spec: K1 Prior Charitable At Risk, successive-mixed-fractions.
    const vintages = [
        { taxYear: 2019, originalLoss: '10000', qualifiedOriginalLoss: '5000', remainingLoss: '5000', qualifiedRemainingLoss: '2500', materiallyParticipatedInCurrentYear: false },
        { taxYear: 2022, originalLoss: '20000', qualifiedOriginalLoss: '5000', remainingLoss: '15000', qualifiedRemainingLoss: '3750', materiallyParticipatedInCurrentYear: false },
    ];
    for (const order of [vintages, [...vintages].reverse()]) {
        const first = calculateQbiLossCharacter({ taxYear: 2025, activitySourceId: 'scheduleK1:0', limitation: '465',
            currentLoss: d('40000'), currentQualifiedLoss: d('20000'), priorLoss: d('20000'),
            calculatedAllowedLoss: d('30000'), calculatedPriorLossAllowance: d('10000'),
            history: { ...empty(), vintages: order } });
        const output = calculateQbiPriorRiskTransfer(first, { taxYear: 2025, activitySourceId: 'scheduleK1:0',
            priorPassiveLoss: d('0'), calculatedAllowedLoss: d('15000'), history: empty() });
        expect(first.priorQualifiedLossAllowed.toFixed()).toBe('3750');
        expect(output.currentQualifiedLossAllowed.toFixed()).toBe('5000');
        expect(output.priorQualifiedLossAllowed.toFixed()).toBe('1875');
        expect(output.stage.remainingVintages.map(row => [row.taxYear, row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()])).toEqual([[2025, '15000', '6875']]);
        expect(first.remainingVintages.map(row => [row.taxYear, row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()])).toEqual([[2022, '10000', '2500'], [2025, '20000', '10000']]);
    }
});
it('retains original qualified character through a later provision without inventing an old suspension year', () => {
    // Spec: K1 Prior Charitable At Risk, successive-qbi.
    const first = firstStage(), before = JSON.stringify(first);
    const output = calculateQbiPriorRiskTransfer(first, { taxYear: 2025, activitySourceId: 'scheduleK1:0',
        priorPassiveLoss: d('0'), calculatedAllowedLoss: d('15000'), history: empty() });
    expect(output.currentQualifiedLossAllowed.toString()).toBe('0');
    expect(output.priorQualifiedLossAllowed.toString()).toBe('5000');
    expect(JSON.parse(JSON.stringify(output.stage.remainingVintages))).toEqual([{ taxYear: 2025, originalLoss: '15000',
        qualifiedOriginalLoss: '5000', remainingLoss: '15000', qualifiedRemainingLoss: '5000' }]);
    const withHistory = calculateQbiPriorRiskTransfer(first, { taxYear: 2025, activitySourceId: 'scheduleK1:0',
        priorPassiveLoss: d('10000'), calculatedAllowedLoss: d('20000'), history: { ...empty(), vintages: [{ taxYear: 2021,
            originalLoss: '10000', qualifiedOriginalLoss: '0', remainingLoss: '10000', qualifiedRemainingLoss: '0' }] } });
    expect(withHistory.priorQualifiedLossAllowed.toString()).toBe('5000');
    expect(JSON.parse(JSON.stringify(withHistory.stage.remainingVintages))).toEqual([
        { taxYear: 2021, originalLoss: '10000', qualifiedOriginalLoss: '0', remainingLoss: '5000', qualifiedRemainingLoss: '0' },
        { taxYear: 2025, originalLoss: '15000', qualifiedOriginalLoss: '5000', remainingLoss: '15000', qualifiedRemainingLoss: '5000' },
    ]);
    expect(JSON.stringify(first)).toBe(before);
});
it('conserves zero and full allowance and rejects inconsistent derived source contexts', () => {
    // Spec: K1 Prior Charitable At Risk, successive-qbi-boundaries.
    const first = firstStage(), context = { taxYear: 2025, activitySourceId: 'scheduleK1:0', priorPassiveLoss: d('0'),
        calculatedAllowedLoss: d('0'), history: empty() };
    const zero = calculateQbiPriorRiskTransfer(first, context);
    expect(zero.priorQualifiedLossAllowed.toString()).toBe('0');
    expect(zero.stage.remainingVintages[0]?.qualifiedRemainingLoss.toString()).toBe('10000');
    expect(calculateQbiPriorRiskTransfer(first, { ...context, calculatedAllowedLoss: d('30000') }).priorQualifiedLossAllowed.toString()).toBe('10000');
    for (const changed of [{ ...context, taxYear: 2026 }, { ...context, activitySourceId: 'scheduleK1:1' },
        { ...context, calculatedAllowedLoss: d('30000.01') }, { ...context, history: { ...empty(), sourceFactsConfirmed: false } }]) {
        expect(() => calculateQbiPriorRiskTransfer(first, changed)).toThrow(/source|history|allowance|year/i);
    }
    expect(() => calculateQbiPriorRiskTransfer({ ...first, priorQualifiedLossAllowed: d('9999') }, context)).toThrow(/source|reconcile/i);
});

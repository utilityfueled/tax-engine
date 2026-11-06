import { describe, expect, it } from 'vitest';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule.js';
import { ScheduleK1Schema } from '@/models/inputs.js';
function fixture(overrides: Record<string, unknown> = {}) {
    return ScheduleK1Schema.parse({ taxYear: 2025, partnershipName: 'Fictional Giving Corporation', partnershipEIN: '12-3456789',
        entityType: 's_corporation', accountHolder: 'primary', ordinaryIncome: '0', beginningBasis: '0', beginningDebtBasis: '100',
        additionalLoansToScorp: '0', priorDebtBasisReduction: '0', nondeductibleExpenses: '50', charitableCash: '80', ...overrides });
}
describe('Actual S corporation debt and nondeductible ordering', () => {
    it('reduces debt for actual nondeductible costs before default losses', () => {
        const input = fixture(), before = structuredClone(input), result = calculatePartnerBasisSchedule(input);
        expect(result.totalAllowedLosses.toString()).toBe('50');
        expect(result.suspendedLossCarryforward.charitable.toString()).toBe('30');
        expect(result.debtBasis?.nondeductibleExpensesAppliedToDebtBasis.toString()).toBe('50');
        expect(result.debtBasis?.lossesAppliedToDebtBasis.toString()).toBe('50');
        expect(result.debtBasis?.endingDebtBasis.toString()).toBe('0');
        expect(result.debtBasis?.debtBasisReductionCarryforward.toString()).toBe('100');
        expect(result.unabsorbedNondeductibleExpenses.toString()).toBe('0');
        expect(result.suspendedNondeductible.toString()).toBe('0');
        expect(input).toEqual(before);
    });
    it('applies the actual election across stock and debt before carrying nondeductible costs', () => {
        const result = calculatePartnerBasisSchedule(fixture({ election1367: true }));
        expect(result.totalAllowedLosses.toString()).toBe('80');
        expect(result.totalSuspendedLosses.toString()).toBe('0');
        expect(result.debtBasis?.nondeductibleExpensesAppliedToDebtBasis.toString()).toBe('20');
        expect(result.debtBasis?.endingDebtBasis.toString()).toBe('0');
        expect(result.unabsorbedNondeductibleExpenses.toString()).toBe('30');
        expect(result.suspendedNondeductible.toString()).toBe('30');
        expect(result.debtBasis?.debtBasisReductionCarryforward.toString()).toBe('100');
        const next = calculatePartnerBasisSchedule(fixture({ election1367: true, nondeductibleExpenses: '30', charitableCash: '0', beginningDebtBasis: '50' }));
        expect(next.debtBasis?.endingDebtBasis.toString()).toBe('20');
        expect(next.suspendedNondeductible.toString()).toBe('0');
    });
    it('keeps unabsorbed costs separate from an election carry and stock distributions', () => {
        const result = calculatePartnerBasisSchedule(fixture({ beginningBasis: '20', charitableCash: '0', nondeductibleExpenses: '150' }));
        expect(result.debtBasis?.endingDebtBasis.toString()).toBe('0');
        expect(result.debtBasis?.nondeductibleExpensesAppliedToDebtBasis.toString()).toBe('100');
        expect(result.unabsorbedNondeductibleExpenses.toString()).toBe('30');
        expect(result.suspendedNondeductible.toString()).toBe('0');
        const zero = calculatePartnerBasisSchedule(fixture({ beginningDebtBasis: '0' }));
        expect(zero.unabsorbedNondeductibleExpenses.toString()).toBe('50');
        expect(zero.suspendedNondeductible.toString()).toBe('0');
        const distribution = calculatePartnerBasisSchedule(fixture({ distributions: '25' }));
        expect(distribution.excessDistributionGain.toString()).toBe('25');
        expect(distribution.debtBasis?.lossesAppliedToDebtBasis.toString()).toBe('50');
        const cents = calculatePartnerBasisSchedule(fixture({ beginningDebtBasis: '0.03', nondeductibleExpenses: '0.01', charitableCash: '0.05' }));
        expect(cents.totalAllowedLosses.toString()).toBe('0.02');
        expect(cents.debtBasis?.nondeductibleExpensesAppliedToDebtBasis.toString()).toBe('0.01');
        expect(cents.totalSuspendedLosses.toString()).toBe('0.03');
    });
    it('restores debt reduced by both nondeductible costs and deductible losses', () => {
        const year1 = calculatePartnerBasisSchedule(fixture());
        const year2 = calculatePartnerBasisSchedule(fixture({ taxYear: 2026, ordinaryIncome: '80', charitableCash: '0', nondeductibleExpenses: '0',
            beginningDebtBasis: year1.debtBasis?.endingDebtBasis.toString(), priorDebtBasisReduction: year1.debtBasis?.debtBasisReductionCarryforward.toString() }));
        expect(year2.debtBasis?.restoration.toString()).toBe('80');
        expect(year2.debtBasis?.endingDebtBasis.toString()).toBe('80');
        expect(year2.endingBasis.toString()).toBe('0');
        expect(year2.debtBasis?.debtBasisReductionCarryforward.toString()).toBe('20');
    });
});

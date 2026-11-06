import { describe, expect, it } from 'vitest';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule.js';
import { ScheduleK1Schema } from '@/models/inputs.js';
import { K1CharitableBasisSourcesSchema } from '@/models/k1-charitable-basis-sources.js';
import type { K1CharitableBasisContext } from '@/engine/forms/k1-charitable-basis-sources.js';
function fixture() {
    const k1 = ScheduleK1Schema.parse({ taxYear: 2025, partnershipName: 'Example Giving Partners', partnershipEIN: '12-3456789',
        accountHolder: 'primary', ordinaryIncome: '0', beginningBasis: '30', charitableCapitalGain30: '150', priorSuspendedLosses: {} });
    const context: K1CharitableBasisContext = { taxpayer: { taxYear: 2025, filingStatus: 'single',
            primary: { firstName: 'Sample', lastName: 'Taxpayer', ssn: '123-45-6789' } }, sources: K1CharitableBasisSourcesSchema.parse({
            sourceTaxYear: 2025, statementYearStart: '2025-01-01', statementYearEnd: '2025-12-31', sourceReference: 'Fictional K1 and basis attachment', sourceFactsConfirmed: true,
            entityName: k1.partnershipName, entityEIN: k1.partnershipEIN, entityType: 'partnership', accountHolder: 'primary',
            recipientName: 'Sample Taxpayer', recipientTaxpayerIdLast4: '6789', basisFactsConfirmed: true,
            noOtherBasisChangesConfirmed: true, cashDistributionsOnlyConfirmed: true, priorBasisHistoryComplete: true,
            currentContributions: [{ sourceId: 'gift-1', category: 'capital_gain_30', contributionDate: '2025-06-01',
                    contributionShare: '150', adjustedBasisShare: '50', sourceReference: 'Fictional property basis statement' }],
            priorBasisSuspensions: [],
        }) };
    return { k1, context };
}
function current(f: ReturnType<typeof fixture>) {
    const row = f.context.sources.currentContributions?.[0];
    if (!row)
        throw new Error('Test fixture requires its current source');
    return row;
}
function actual(value: ReturnType<typeof fixture>) { return calculatePartnerBasisSchedule(value.k1, value.context); }
describe('K1 charitable basis sources', () => {
    it('matches the published partnership appreciation and basis suspension example', () => {
        const f = fixture();
        const before = structuredClone(f);
        const result = actual(f);
        expect(result.charitableSources?.basisAllowed.toString()).toBe('30');
        expect(result.charitableSources?.appreciationExempt.toString()).toBe('100');
        expect(result.charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('130');
        expect(result.suspendedLossCarryforward.charitable.toString()).toBe('20');
        expect(result.endingBasis.toString()).toBe('0');
        expect(f).toEqual(before);
        f.k1.beginningBasis = '50';
        expect(actual(f).charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('150');
        expect(actual(f).suspendedLossCarryforward.charitable.toString()).toBe('0');
        f.k1.beginningBasis = '0';
        expect(actual(f).charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('100');
    });
    it('reproduces the published shareholder property and capital loss allocation', () => {
        const f = fixture();
        Object.assign(f.k1, { entityType: 's_corporation', beginningBasis: '50', ordinaryIncome: '30',
            netLongTermCapitalGain: '-25', charitableCapitalGain30: '190', beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
        f.context.sources.entityType = 's_corporation';
        Object.assign(current(f), { contributionShare: '190', adjustedBasisShare: '100' });
        const r = actual(f);
        expect(r.charitableSources?.basisAllowed.toString()).toBe('64');
        expect(r.charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('154');
        expect(r.lossCategories.find(x => x.key === 'longTermCapital')?.allowed.toString()).toBe('16');
        expect(r.suspendedLossCarryforward.charitable.toString()).toBe('36');
        expect(r.suspendedLossCarryforward.longTermCapital.toString()).toBe('9');
    });
    it('binds actual identity statement totals and known source values', () => {
        for (const mutate of [
            (f: ReturnType<typeof fixture>) => { f.k1.partnershipEIN = '98-7654321'; },
            (f: ReturnType<typeof fixture>) => { f.k1.accountHolder = 'spouse'; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.recipientTaxpayerIdLast4 = '1111'; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.sourceTaxYear = 2026; },
            (f: ReturnType<typeof fixture>) => { delete f.context.sources.statementYearStart; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.statementYearEnd = '2025-02-30'; },
            (f: ReturnType<typeof fixture>) => { f.k1.charitableCapitalGain30 = '150.01'; },
            (f: ReturnType<typeof fixture>) => { delete current(f).adjustedBasisShare; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.sourceFactsConfirmed = false; },
        ]) {
            const f = fixture();
            mutate(f);
            expect(() => actual(f)).toThrow(/K1 charitable/);
        }
        const unknown = K1CharitableBasisSourcesSchema.parse({});
        expect(unknown).toEqual({});
        const f = fixture();
        current(f).adjustedBasisShare = '0';
        const r = actual(f);
        expect(r.charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('150');
        expect(r.endingBasis.toString()).toBe('30');
        const fiscal = fixture();
        fiscal.context.sources.statementYearStart = '2024-07-01';
        fiscal.context.sources.statementYearEnd = '2025-06-30';
        current(fiscal).contributionDate = '2024-08-01';
        expect(actual(fiscal).charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('130');
    });
    it('releases original basis suspended character without repeating appreciation', () => {
        const f = fixture();
        f.k1.charitableCapitalGain30 = '0';
        f.k1.charitableCash = '20';
        f.k1.beginningBasis = '20';
        f.k1.priorSuspendedLosses = { ...f.k1.priorSuspendedLosses, charitable: '20' };
        f.context.sources.currentContributions = [{ sourceId: 'cash-now', category: 'cash_60', contributionDate: '2025-01-01',
                contributionShare: '20', sourceReference: 'Fictional current cash attachment' }];
        f.context.sources.priorBasisSuspensions = [{ sourceId: 'old-property', originTaxYear: 2018, category: 'capital_gain_30',
                contributionShare: '150', adjustedBasisShare: '50', sourceReference: 'Fictional original basis worksheet',
                appreciationPreviouslyTakenIntoAccount: '100', basisUseHistory: Array.from({ length: 7 }, (_, i) => ({ taxYear: 2018 + i, basisAllowed: i === 0 ? '30' : '0' })) }];
        const r = actual(f);
        expect(r.charitableSources?.availableAfterBasis.cash_60.toString()).toBe('10');
        expect(r.charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe('10');
        expect(r.charitableSources?.appreciationExempt.toString()).toBe('0');
        expect(r.charitableSources?.records.map(x => [x.originTaxYear, x.basisAllowed.toString(), x.basisSuspended.toString()])).toEqual([[2025, '10', '10'], [2018, '10', '10']]);
        f.context.sources.priorBasisSuspensions[0].basisUseHistory?.pop();
        expect(() => actual(f)).toThrow(/history/);
    });
    it('conserves exact cents through stock debt and category allocation', () => {
        const f = fixture();
        Object.assign(f.k1, { entityType: 's_corporation', beginningBasis: '0.03', ordinaryIncome: '-0.05',
            charitableCash: '0.05', charitableCapitalGain30: '0', beginningDebtBasis: '0.01', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
        f.context.sources.entityType = 's_corporation';
        f.context.sources.currentContributions = [{ sourceId: 'cash-cents', category: 'cash_60',
                contributionDate: '2025-02-01', contributionShare: '0.05', sourceReference: 'Fictional cash cents' }];
        const r = actual(f);
        expect(r.totalAllowedLosses.toString()).toBe('0.04');
        expect(r.charitableSources?.basisAllowed.toString()).toBe('0.02');
        expect(r.charitableSources?.basisSuspended.toString()).toBe('0.03');
        expect(r.lossCategories.find(x => x.key === 'ordinary')?.allowed.toString()).toBe('0.02');
        expect(r.debtBasis?.endingDebtBasis.toString()).toBe('0');
        expect(r.lossCategories.every(x => x.allowed.gte(0) && x.suspended.gte(0) && x.allowed.plus(x.suspended).eq(x.total))).toBe(true);
    });
    it('keeps appreciation separate after actual nondeductible debt ordering', () => {
        for (const elected of [false, true]) {
            const f = fixture();
            Object.assign(f.k1, { entityType: 's_corporation', beginningBasis: '0',
                charitableCapitalGain30: '180', beginningDebtBasis: '100', additionalLoansToScorp: '0',
                priorDebtBasisReduction: '0', nondeductibleExpenses: '50', election1367: elected });
            f.context.sources.entityType = 's_corporation';
            Object.assign(current(f), { contributionShare: '180', adjustedBasisShare: '80' });
            const before = structuredClone(f), r = actual(f);
            expect(r.charitableSources?.availableAfterBasis.capital_gain_30.toString()).toBe(elected ? '180' : '150');
            expect(r.charitableSources?.basisAllowed.toString()).toBe(elected ? '80' : '50');
            expect(r.charitableSources?.appreciationExempt.toString()).toBe('100');
            expect(r.suspendedLossCarryforward.charitable.toString()).toBe(elected ? '0' : '30');
            expect(r.debtBasis?.endingDebtBasis.toString()).toBe('0');
            expect(r.suspendedNondeductible.toString()).toBe(elected ? '30' : '0');
            expect(f).toEqual(before);
        }
    });
    it('rejects missing contradictory and unsupported source histories', () => {
        for (const mutate of [
            (f: ReturnType<typeof fixture>) => { delete f.k1.beginningBasis; },
            (f: ReturnType<typeof fixture>) => { f.k1.priorSuspendedLosses = { ...f.k1.priorSuspendedLosses, charitable: '1' }; },
            (f: ReturnType<typeof fixture>) => { f.k1.foreignTaxPaid = '1'; },
            (f: ReturnType<typeof fixture>) => { f.k1.guaranteedPayments = '1'; },
            (f: ReturnType<typeof fixture>) => { f.k1.excessBusinessInterest = '1'; },
            (f: ReturnType<typeof fixture>) => { f.k1.priorSuspendedLosses = { ebie: '1' }; },
            (f: ReturnType<typeof fixture>) => { f.k1.interestIncome = '-1'; },
            (f: ReturnType<typeof fixture>) => { f.k1.ordinaryDividends = '-1'; },
            (f: ReturnType<typeof fixture>) => { f.k1.royalties = '-1'; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.noOtherBasisChangesConfirmed = false; },
            (f: ReturnType<typeof fixture>) => { current(f).adjustedBasisShare = '151'; },
            (f: ReturnType<typeof fixture>) => { f.context.sources.currentContributions = [current(f), { ...current(f) }]; },
            (f: ReturnType<typeof fixture>) => { current(f).contributionDate = '2024-06-01'; },
        ]) {
            const f = fixture();
            mutate(f);
            expect(() => actual(f)).toThrow(/K1 charitable/);
        }
        const f = fixture();
        expect(calculatePartnerBasisSchedule(f.k1).charitableSources).toBeUndefined();
    });
});

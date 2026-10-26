import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async (importOriginal) => { const original = await importOriginal<typeof import('@/models/constants.js')>(); const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js'); return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) }; });
import { calculateFederalTax } from '@/engine/federal.js';
import { k1CharitableReturnFixture as fixture, charitableStatement as statement, k1CharitableQbiFixture } from '../fixtures/k1-charitable-return.js';
import { nonitemizerCarryFixture } from '../fixtures/nonitemizer-carry.js';
import { actualEblNolInput } from '../fixtures/qbi-ebl-nol.js';
it('transfers the published charitable and capital basis amounts together', () => {
    const input = fixture(), source = statement(input), k = input.scheduleK1[0];
    Object.assign(k, { entityType: 's_corporation', beginningBasis: '50', ordinaryIncome: '30', netLongTermCapitalGain: '-25', charitableCapitalGain30: '190', beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
    source.basis!.entityType = 's_corporation';
    source.basis!.currentContributions![0].contributionShare = '190';
    source.basis!.currentContributions![0].adjustedBasisShare = '100';
    source.receipts![0].originalBox = '12';
    source.receipts![0].fairMarketValueShare = '190';
    k.form6198!.ordinaryIncome = '30';
    k.form6198!.gainLossFromDispositions = '-16';
    const before = JSON.stringify(input), r = calculateFederalTax(input);
    expect(r.scheduleA?.nonCashCharitable.toFixed()).toBe('154');
    expect(r.scheduleA?.charitableTotal.toFixed()).toBe('154');
    expect(r.scheduleD?.netLongTerm.toFixed()).toBe('-16');
    expect(r.agi.toFixed()).toBe('100014');
    const basis = r.scheduleE?.partnerships[0].basisResult;
    expect(basis?.suspendedLossCarryforward.charitable.toFixed()).toBe('36');
    expect(basis?.suspendedLossCarryforward.longTermCapital.toFixed()).toBe('9');
    expect(r.allLines.filter(row => row.form === 'K1 Charitable Return')).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
});
it('selects current source cash without converting basis suspension into charitable carry', () => {
    const input = fixture(2026, true);
    input.charitableCarryoverSources = nonitemizerCarryFixture('0').charitableCarryoverSources;
    input.deductionElection = 'standard';
    const r = calculateFederalTax(input);
    expect(r.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');
    expect(r.carryforwards.charitableContributions.toFixed()).toBe('0');
    expect(r.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('2000');
    expect(r.scheduleA?.currentCharitableCandidates?.currentCashPaid.toFixed() ?? r.scheduleA?.nonitemizedCharitableCarryover?.currentCashPaid.toFixed()).toBe('3000');
});
it('preserves the actual ordinary QBI history alongside charitable basis', () => {
    const input = k1CharitableQbiFixture();
    const r = calculateFederalTax(input);
    expect(r.scheduleE?.partnerships[0].netAmount.toFixed()).toBe('-5000');
    expect(r.scheduleA?.cashCharitable.toFixed()).toBe('5000');
    expect(r.agi.toFixed()).toBe('95000');
    expect(r.carryforwards.qbiLossCarryforward.toFixed()).toBe('5000');
    expect(r.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.ordinary.toFixed()).toBe('5000');
    expect(r.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('5000');
});
it('preserves the explicit original-source NOL coordination boundary', () => {
    const input = fixture();
    input.priorYear = { nolCarryforward: '1' };
    expect(() => calculateFederalTax(input)).toThrow(/K1 charitable.*NOL/);
    delete input.priorYear;
    input.netOperatingLoss = actualEblNolInput().netOperatingLoss;
    expect(() => calculateFederalTax(input)).toThrow(/K1 charitable.*NOL/);
});
it('preserves prior property basis origin without repeating appreciation or charitable carry', () => {
    const input = fixture(2025, true), s = statement(input), k = input.scheduleK1[0];
    k.beginningBasis = '20';
    k.charitableCash = '20';
    k.priorSuspendedLosses!.charitable = '20';
    Object.assign(s.basis!.currentContributions![0], { contributionShare: '20', adjustedBasisShare: '20' });
    s.basis!.priorBasisSuspensions = [{ sourceId: 'old-property', originTaxYear: 2018, category: 'capital_gain_30', contributionShare: '150', adjustedBasisShare: '50',
            appreciationPreviouslyTakenIntoAccount: '100', sourceReference: 'Fictional complete original property basis',
            basisUseHistory: Array.from({ length: 7 }, (_, index) => ({ taxYear: 2018 + index, basisAllowed: index === 0 ? '30' : '0' })) }];
    s.receipts!.push({ basisSourceId: 'old-property', originalBox: '13', originalCode: 'E', recipientName: 'Fictional original charity', recipientCategory: 'fifty-percent',
        qualifiedOrganization: true, sourceReference: 'Fictional original2018 receipt', contributionDate: '2018-06-01', propertyType: 'appreciated_stock', acquisitionDate: '2016-01-01', fairMarketValueShare: '150' });
    const r = calculateFederalTax(input), source = r.scheduleE!.partnerships[0].basisResult!.charitableSources!;
    expect(r.scheduleA?.cashCharitable.toFixed()).toBe('10');
    expect(r.scheduleA?.nonCashCharitable.toFixed()).toBe('10');
    expect(source.appreciationExempt.toFixed()).toBe('0');
    expect(source.basisSuspended.toFixed()).toBe('20');
    expect(source.records.find(row => !row.current)?.originTaxYear).toBe(2018);
    expect(r.carryforwards.charitableContributions.toFixed()).toBe('0');
});
it('rejects original excess distributions until gain source treatment is complete', () => {
    for (const entityType of ['partnership', 's_corporation'] as const) {
        const input = fixture(), s = statement(input), k = input.scheduleK1[0];
        k.entityType = entityType;
        s.basis!.entityType = entityType;
        s.receipts![0].originalBox = entityType === 'partnership' ? '13' : '12';
        if (entityType === 's_corporation') {
            Object.assign(k, { beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
        }
        k.distributions = '30';
        const zero = calculateFederalTax(input);
        expect(zero.scheduleE?.partnerships[0].basisResult?.excessDistributionGain.toFixed()).toBe('0');
        expect(zero.scheduleA?.nonCashCharitable.toFixed()).toBe('100');
        expect(zero.agi.toFixed()).toBe('100000');
        for (const actualDistribution of ['30.01', '31']) {
            k.distributions = actualDistribution;
            const before = JSON.stringify(input);
            expect(() => calculateFederalTax(input)).toThrow(/excess distribution.*gain.*source/i);
            expect(JSON.stringify(input)).toBe(before);
        }
    }
});

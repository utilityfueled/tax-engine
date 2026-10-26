import { expect, it } from 'vitest';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { k1CharitableReturnFixture as fixture, charitableStatement as statement } from '../../fixtures/k1-charitable-return.js';
it('binds the published charitable basis result to actual recipient and nonbinding risk sources', () => {
    const input = fixture(), before = JSON.stringify(input), source = statement(input);
    source.atRisk!.priorYearAmountAtRisk = '130';
    input.scheduleK1[0].form6198!.priorYearAmountAtRisk = '130';
    const r = calculateK1CharitableReturnSources(input);
    expect(r?.amounts.capitalGainPublic.toString()).toBe('130');
    expect(r?.statements[0].basis.suspendedLossCarryforward.charitable.toString()).toBe('20');
    expect(r?.statements[0].nonbindingRiskRequired.toString()).toBe('130');
    source.atRisk!.priorYearAmountAtRisk = '129.99';
    input.scheduleK1[0].form6198!.priorYearAmountAtRisk = '129.99';
    expect(() => calculateK1CharitableReturnSources(input)).toThrow(/nonbinding.*at-risk|at-risk.*capacity/i);
    expect(JSON.stringify(fixture())).toBe(before);
});
it('rejects changed incomplete and contradictory original source facts', () => {
    for (const mutate of [
        (x: ReturnType<typeof fixture>) => { statement(x).receipts![0].originalCode = 'F'; },
        (x: ReturnType<typeof fixture>) => { statement(x).receipts![0].qualifiedOrganization = false; },
        (x: ReturnType<typeof fixture>) => { delete statement(x).receipts![0].recipientCategory; },
        (x: ReturnType<typeof fixture>) => { statement(x).receipts![0].fairMarketValueShare = '151'; },
        (x: ReturnType<typeof fixture>) => { statement(x).receipts![0].acquisitionDate = '2025-05-01'; },
        (x: ReturnType<typeof fixture>) => { statement(x).basis!.recipientTaxpayerIdLast4 = '0000'; },
        (x: ReturnType<typeof fixture>) => { statement(x).atRisk!.priorLossHistory!.sourceFactsConfirmed = false; },
        (x: ReturnType<typeof fixture>) => { statement(x).atRisk!.priorYearAmountAtRisk = '20001'; },
        (x: ReturnType<typeof fixture>) => { x.k1CharitableSources!.statements = []; },
        (x: ReturnType<typeof fixture>) => { x.scheduleK1[0].royalties = '1'; },
    ]) {
        const x = fixture();
        mutate(x);
        expect(() => calculateK1CharitableReturnSources(x)).toThrow(/K1 charitable/);
    }
});
it('retains actual cash qualification and unresolved source timing separately', () => {
    const x = fixture(2026, true), r = calculateK1CharitableReturnSources(x);
    expect(r?.amounts.cashPublic.toString()).toBe('3000');
    expect(r?.nonitemizedEligibleCash.toString()).toBe('3000');
    expect(r?.statements[0].basis.suspendedLossCarryforward.charitable.toString()).toBe('2000');
    statement(x).receipts![0].donorAdvisedFund = true;
    expect(calculateK1CharitableReturnSources(x)?.nonitemizedEligibleCash.toString()).toBe('0');
    delete statement(x).receipts![0].donorAdvisedFund;
    expect(() => calculateK1CharitableReturnSources(x)).toThrow(/qualification.*unknown|known.*qualification/i);
});
it('uses the original entity period for current fiscal cash inclusion', () => {
    for (const entityType of ['partnership', 's_corporation'] as const) {
        const fiscal = fixture(2026, true), s = statement(fiscal);
        s.basis!.statementYearStart = '2025-07-01';
        s.basis!.statementYearEnd = '2026-06-30';
        fiscal.scheduleK1[0].entityType = entityType;
        s.basis!.entityType = entityType;
        s.receipts![0].originalBox = entityType === 'partnership' ? '13' : '12';
        if (entityType === 's_corporation')
            Object.assign(fiscal.scheduleK1[0], { beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
        s.basis!.currentContributions![0].contributionDate = '2025-08-01';
        s.receipts![0].contributionDate = '2025-08-01';
        const before = JSON.stringify(fiscal), r = calculateK1CharitableReturnSources(fiscal);
        expect(r?.amounts.cashPublic.toString()).toBe('3000');
        expect(r?.nonitemizedEligibleCash.toString()).toBe('3000');
        expect(JSON.stringify(fiscal)).toBe(before);
        s.basis!.currentContributions![0].contributionDate = '2025-06-30';
        s.receipts![0].contributionDate = '2025-06-30';
        expect(() => calculateK1CharitableReturnSources(fiscal)).toThrow(/period|date/);
    }
});
it('keeps exact current property value and category through basis', () => {
    for (const other of [false, true]) {
        const input = fixture(), s = statement(input), k = input.scheduleK1[0], receipt = s.receipts![0], gift = s.basis!.currentContributions![0];
        k.beginningBasis = '30.50';
        k.charitableCapitalGain30 = other ? '0' : '150.75';
        k.charitableCapitalGain20 = other ? '150.75' : '0';
        Object.assign(gift, { category: other ? 'capital_gain_20' : 'capital_gain_30', contributionShare: '150.75', adjustedBasisShare: '50.25' });
        Object.assign(receipt, { originalCode: other ? 'F' : 'E', recipientCategory: other ? 'private-nonoperating' : 'fifty-percent', fairMarketValueShare: '150.75', qualifiedAppreciatedStock: true });
        const r = calculateK1CharitableReturnSources(input)!;
        expect(r.amounts[other ? 'capitalGainPrivate' : 'capitalGainPublic'].toFixed()).toBe('131');
        expect(r.statements[0].basis.charitableSources?.basisSuspended.toFixed()).toBe('19.75');
        if (other) {
            delete receipt.qualifiedAppreciatedStock;
            expect(() => calculateK1CharitableReturnSources(input)).toThrow(/qualified stock.*unknown/);
            receipt.qualifiedAppreciatedStock = false;
            expect(() => calculateK1CharitableReturnSources(input)).toThrow(/value basis and qualification/);
            k.charitableCapitalGain20 = '50.25';
            gift.contributionShare = '50.25';
            const reduced = calculateK1CharitableReturnSources(input)!;
            expect(reduced.amounts.capitalGainPrivate.toFixed()).toBe('30.5');
            expect(reduced.statements[0].basis.charitableSources?.appreciationExempt.toFixed()).toBe('0');
            expect(reduced.statements[0].basis.charitableSources?.basisSuspended.toFixed()).toBe('19.75');
        }
    }
});
it('preserves the unresolved prior basis release year without losing a zero release history', () => {
    const input = fixture(2026, true), s = statement(input), k = input.scheduleK1[0];
    k.beginningBasis = '20';
    k.charitableCash = '0';
    k.priorSuspendedLosses!.charitable = '20';
    s.basis!.currentContributions = [];
    s.receipts = [];
    s.basis!.priorBasisSuspensions = [{ sourceId: 'old-property', originTaxYear: 2018, category: 'capital_gain_30', contributionShare: '150', adjustedBasisShare: '50',
            appreciationPreviouslyTakenIntoAccount: '100', sourceReference: 'Fictional complete original property basis',
            basisUseHistory: Array.from({ length: 8 }, (_, index) => ({ taxYear: 2018 + index, basisAllowed: index === 0 ? '30' : '0' })) }];
    s.receipts.push({ basisSourceId: 'old-property', originalBox: '13', originalCode: 'E', recipientName: 'Fictional original charity', recipientCategory: 'fifty-percent',
        qualifiedOrganization: true, sourceReference: 'Fictional original2018 receipt', contributionDate: '2018-06-01', propertyType: 'appreciated_stock', acquisitionDate: '2016-01-01', fairMarketValueShare: '150' });
    const before = JSON.stringify(input);
    expect(() => calculateK1CharitableReturnSources(input)).toThrow(/prior-basis.*2026.*floor|floor.*release/);
    expect(JSON.stringify(input)).toBe(before);
    k.beginningBasis = '0';
    const zero = calculateK1CharitableReturnSources(input)!;
    expect(zero.amounts.capitalGainPublic.toFixed()).toBe('0');
    expect(zero.statements[0].basis.charitableSources?.basisSuspended.toFixed()).toBe('20');
    expect(zero.statements[0].basis.charitableSources?.records[0].originTaxYear).toBe(2018);
});
it('requires explicit original at-risk income and deduction values', () => {
    expect(calculateK1CharitableReturnSources(fixture())?.amounts.capitalGainPublic.toFixed()).toBe('130');
    for (const key of ['ordinaryIncome', 'gainLossFromDispositions', 'otherIncomeGains', 'otherDeductionsLosses']) {
        const input = fixture();
        const form = input.scheduleK1[0].form6198;
        if (!form) throw new Error('Missing actual synthetic Form6198');
        Reflect.deleteProperty(form, key);
        expect(() => calculateK1CharitableReturnSources(input)).toThrow(/actual.*PartI|PartI.*actual/);
    }
});

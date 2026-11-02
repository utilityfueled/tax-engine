/** Spec: state/ohio-payments.yaml. Literal originals retained before product. */
import { it, expect } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { buildOhioPaymentSource } from '@/engine/state/oh-payment-source.js';
import { ohioPaymentFixture, actualOhioPayment, actualPriorOhioReturn } from '../../fixtures/oh-payments.js';
function calculate(input = ohioPaymentFixture(), overlay = {}) { return calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input), overlay)); }
it('requires complete payment records and preserves unknown versus actual zero', () => { const input = ohioPaymentFixture(); expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe('0'); delete (input.ohioPayments as Partial<typeof input.ohioPayments>).allPaymentsIncludedConfirmed; expect(() => calculate(input)).toThrow(/payment/i); });
it.each([['full_year_resident', '2323', '105', '2428'], ['part_year_resident', '929', '41', '970'], ['nonresident', '465', '0', '465']] as const)('calculates actual %s regular payment and balance sources', (status, tax, penalty, due) => { const actual = calculate(ohioPaymentFixture(status)); expect(actual.it1040.line10_taxAfterCredits.toString()).toBe(tax); expect(actual.itsd2210?.line2_currentYearLiability.toString()).toBe(tax); expect(actual.itsd2210?.line17_totalPenalty.toString()).toBe(penalty); expect(actual.it1040.line22_totalAmountDue.toString()).toBe(due); expect(actual.it1040.line21_latePaymentInterest.toString()).toBe('0'); });
it('subtracts refundable credits before the actual penalty calculation', () => { const packet = ohioPaymentFixture(); const { ohioResidency: _r, ohioPayments: _p, ...input } = packet; const actual = calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input), { computeUnderpaymentPenalty: true, priorYearTaxLiability: '0', priorYearTimelyFiled: false, estimatedPayments: '0', refundableCredits: '500' })); expect(actual.it1040.line16_refundableCredits.toString()).toBe('500'); expect(actual.itsd2210?.line2_currentYearLiability.toString()).toBe('1823'); expect(actual.itsd2210?.line17_totalPenalty.toString()).toBe('82'); });
it('preserves prior zero return versus actual no return', () => { const input = ohioPaymentFixture(); expect(calculate(input).itsd2210?.line17_totalPenalty.toString()).toBe('105'); Object.assign(input.ohioPayments, { priorReturn: actualPriorOhioReturn(input) }); expect(calculate(input).itsd2210?.safeHarborB).toBe(true); expect(calculate(input).itsd2210?.line17_totalPenalty.toString()).toBe('0'); });
it('applies actual eligible carryforward once in first installment', () => { const input = ohioPaymentFixture(); const prior = actualPriorOhioReturn(input, '2000'); prior.electedCreditCarryforward = '200'; Object.assign(input.ohioPayments, { priorReturn: prior, priorCreditCarryforward: { status: 'actual_credit', sourceReference: 'Actual elected credit available on current Ohio account', electedAmount: '200', availableForThisReturn: '200', accountHolder: 'primary', accountSsn: input.taxpayer.primary.ssn, appliedToThisReturnConfirmed: true } }); const actual = calculate(input); expect(actual.it1040.line15_estimatedPayments.toString()).toBe('200'); expect(actual.itsd2210?.quarters?.[0].cumulativeEstimated.toString()).toBe('200'); });
it('rejects reference-renamed duplicate payment originals', () => { const input = ohioPaymentFixture(); const row = actualOhioPayment(input); Object.assign(input.ohioPayments, { paymentRows: [row, { ...row, sourceId: 'different-id', sourceReference: 'Different display reference' }] }); expect(() => calculate(input)).toThrow(/duplicate/i); });
it.each(['unknownPrior', 'unknownWithholding', 'missingDate', 'invalidDate', 'wrongYear', 'wrongOwner', 'contradictoryReceipt', 'futureReceipt', 'filedFuture', 'expectedPast', 'unconfirmed', 'snapshot', 'scalarPenalty', 'scalarEstimated', 'scalarRefundable', 'lateTiming', 'amended', 'extension', 'special'])('rejects unknown or contradictory actual source %s', kind => { const input = ohioPaymentFixture(); const facts = input.ohioPayments as unknown as Record<string, unknown>; const row = actualOhioPayment(input); facts.paymentRows = [row]; if (kind === 'unknownPrior')
    delete facts.priorReturn; if (kind === 'unknownWithholding')
    delete facts.withholdingTreatment; if (kind === 'missingDate')
    delete (row as Partial<typeof row>).date; if (kind === 'invalidDate')
    row.date = row.original.date = '2025-02-30'; if (kind === 'wrongYear')
    row.taxYear = row.original.taxYear = 2024; if (kind === 'wrongOwner')
    row.original.accountSsn = '900-70-0999'; if (kind === 'contradictoryReceipt')
    row.amount = '101'; if (kind === 'futureReceipt')
    row.date = row.original.date = '2026-04-02'; if (kind === 'filedFuture')
    facts.currentTiming = { kind: 'filed', filedDate: '2026-04-02', asOfDate: '2026-04-01' }; if (kind === 'expectedPast')
    facts.currentTiming = { kind: 'expected', expectedDate: '2026-03-31', asOfDate: '2026-04-01' }; if (kind === 'unconfirmed')
    facts.sourceFactsConfirmed = false; if (kind === 'snapshot')
    input.w2s![0]!.employer.name = 'Changed source'; if (kind === 'lateTiming')
    facts.currentTiming = { kind: 'expected', expectedDate: '2026-04-16', asOfDate: '2026-04-01' }; if (kind === 'amended')
    facts.returnKind = 'amended'; if (kind === 'extension')
    facts.filingExtension = { kind: 'actual_extension', sourceReference: 'Actual unimplemented extension' }; if (kind === 'special')
    facts.specialMethod = 'annualized'; expect(() => calculate(input, kind === 'scalarPenalty' ? { underpaymentPenalty: '0' } : kind === 'scalarEstimated' ? { estimatedPayments: '100' } : kind === 'scalarRefundable' ? { refundableCredits: '500' } : {})).toThrow(kind === 'snapshot' ? /source/ : /payment/i); });
it('binds complete original payment identity in digest-only audit', () => { const input = ohioPaymentFixture(); const row = actualOhioPayment(input); Object.assign(input.ohioPayments, { paymentRows: [row] }); const before = buildOhioPaymentSource(input, input.ohioPayments); row.original.confirmationNumber = 'SAME-MONEY-NEW-ORIGINAL'; const after = buildOhioPaymentSource(input, input.ohioPayments); expect(after.sourceDigest).not.toBe(before.sourceDigest); const json = JSON.stringify(calculate(input).lines); expect(json).not.toContain(input.taxpayer.primary.ssn); expect(json).not.toContain(row.sourceReference); expect(json).not.toContain(row.original.confirmationNumber); expect(json).toContain(after.sourceDigest); });
it('requires separate qualification for a late-filed prior twelve-month return', () => { const input = ohioPaymentFixture(); const prior = actualPriorOhioReturn(input, '0'); prior.filedDate = '2025-04-16'; Object.assign(input.ohioPayments, { priorReturn: prior }); expect(() => calculate(input)).toThrow(/payment/i); });
it('rejects missing actual Ohio withholding rather than defaulting zero', () => { const input = ohioPaymentFixture(); delete input.w2s![0]!.stateTaxWithheld; const { ohioResidency: _r, ohioPayments: _p, ...original } = input; input.ohioResidency.originalFederalSources = structuredClone(original); input.ohioPayments.originalFederalSources = structuredClone(original); expect(() => calculate(input)).toThrow(/payment/i); });
it('rejects refund elections exceeding the actual overpayment', () => { const input = ohioPaymentFixture(); input.ohioPayments.balanceFacts.outgoingCarryforward = '100'; expect(() => calculate(input)).toThrow(/payment/i); });
const withholdingStatements = ['w2s', 'formW2G', 'form1099G', 'form1099K', 'form1099R', 'form1099Nec', 'form1099Misc', 'form1099Int', 'form1099Div', 'form1099B', 'form1099OID'] as const;
it.each(withholdingStatements)('preserves actual modeled Ohio withholding metadata %s', key => {
    // This isolated source-metadata probe does not claim full income-form qualification.
    const input = ohioPaymentFixture();
    const raw = input as unknown as Record<string, unknown>;
    const field = key === 'w2s' ? 'stateTaxWithheld' : 'stateWithheld';
    const row: Record<string, unknown> = { taxYear: 2025, accountHolder: 'primary', state: ' OH ', [field]: '0' };
    raw[key] = [row];
    const bind = () => { const { ohioResidency: _r, ohioPayments: _p, ...original } = input; input.ohioPayments.originalFederalSources = structuredClone(original); };
    bind();
    expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe('0');
    delete row[field];
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
    row[field] = '0';
    row.taxYear = 2024;
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/year/i);
    row.taxYear = 2025;
    row.accountHolder = 'spouse';
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/owner/i);
    row.accountHolder = 'primary';
    row[field] = '-0.01';
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
});
it('requires remaining-tax payment facts independently from filing timing', () => { const input = ohioPaymentFixture(); delete (input.ohioPayments as unknown as Record<string, unknown>).remainingTaxPayment; expect(() => calculate(input)).toThrow(/payment/i); });
it.each(['betweenQuarter', 'earlyPayoff'] as const)('requires dated interval qualification for nonendpoint actual payments %s', kind => {
    const input = ohioPaymentFixture();
    const raw = input.ohioPayments as unknown as Record<string, unknown>;
    raw.remainingTaxPayment = { status: 'expected_payment', sourceReference: 'Actual expected remaining tax payment record', sourceFactsConfirmed: true, date: kind === 'earlyPayoff' ? '2026-04-02' : '2026-04-15', amountAppliedToTax: '2323' };
    if (kind === 'betweenQuarter') {
        const row = actualOhioPayment(input);
        row.date = row.original.date = '2025-04-16';
        raw.paymentRows = [row];
    }
    expect(() => calculate(input)).toThrow(/dated interval/i);
});
it('reconciles explicit actual or no-remaining-tax payment facts', () => {
    const actual = ohioPaymentFixture();
    const facts = actual.ohioPayments as unknown as Record<string, unknown>;
    facts.currentTiming = { kind: 'filed', filedDate: '2026-04-15', asOfDate: '2026-04-15' };
    const payoff = { status: 'actual_payment', sourceReference: 'Actual April15 balance receipt', sourceFactsConfirmed: true, date: '2026-04-15', amountAppliedToTax: '2323', accountHolder: 'primary', original: { accountName: 'Avery Payment', accountSsn: actual.taxpayer.primary.ssn, taxYear: 2025, returnType: 'it1040', kind: 'balance', date: '2026-04-15', amount: '2428', confirmationNumber: 'ACTUAL-APR15-SETTLEMENT' } };
    facts.remainingTaxPayment = payoff;
    expect(calculate(actual).it1040.line15_estimatedPayments.toString()).toBe('0');
    expect(calculate(actual).itsd2210?.line17_totalPenalty.toString()).toBe('105');
    payoff.original.accountSsn = '900-70-0999';
    expect(() => calculate(actual)).toThrow(/payment/i);
    payoff.original.accountSsn = actual.taxpayer.primary.ssn;
    payoff.original.taxYear = 2024;
    expect(() => calculate(actual)).toThrow(/payment/i);
    payoff.original.taxYear = 2025;
    payoff.original.amount = '2322.99';
    expect(() => calculate(actual)).toThrow(/payment/i);
    payoff.original.amount = '2428';
    payoff.amountAppliedToTax = '2322';
    expect(() => calculate(actual)).toThrow(/remaining.tax/i);
    facts.remainingTaxPayment = { status: 'no_remaining_tax', sourceReference: 'Actual account evidence', sourceFactsConfirmed: true };
    expect(() => calculate(actual)).toThrow(/remaining.tax/i);
    actual.w2s![0]!.stateTaxWithheld = '3000';
    const { ohioResidency: _r, ohioPayments: _p, ...original } = actual;
    actual.ohioResidency.originalFederalSources = structuredClone(original);
    actual.ohioPayments.originalFederalSources = structuredClone(original);
    expect(calculate(actual).it1040.line23_overpayment.toString()).toBe('677');
    expect(calculate(actual).itsd2210?.line17_totalPenalty.toString()).toBe('0');
});
it('rejects unknown withholding before state allocation', () => {
    const input = ohioPaymentFixture();
    const row = input.w2s![0]!;
    const bind = () => { const { ohioResidency: _r, ohioPayments: _p, ...original } = input; input.ohioPayments.originalFederalSources = structuredClone(original); };
    row.state = '';
    delete row.stateTaxWithheld;
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
    row.state = 'VA';
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
    row.stateTaxWithheld = '0';
    bind();
    expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe('0');
    row.state = '';
    bind();
    expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe('0');
});
it.each([['current90', '2091', '69'], ['prior100', '1000', '33']] as const)('requires separate timely installment qualification for final-quarter catchup %s', (kind, amount, penalty) => {
    const input = ohioPaymentFixture();
    Object.assign(input.ohioPayments, { paymentRows: [actualOhioPayment(input, amount, '2026-01-15')] });
    if (kind === 'prior100')
        Object.assign(input.ohioPayments, { priorReturn: actualPriorOhioReturn(input, '1000') });
    //69/33 remain isolated instructed-period originals; source admission is now explicitly guarded.
    expect(() => calculate(input), `Isolated PartII ${penalty} does not establish qualified PartI`).toThrow(/timely installment/i);
});
it('preserves actual endpoint account payments made after an earlier filing', () => {
    const input = ohioPaymentFixture();
    Object.assign(input.ohioPayments, { currentTiming: { kind: 'filed', filedDate: '2026-01-02', asOfDate: '2026-04-01' }, paymentRows: [actualOhioPayment(input, '100', '2026-01-15')] });
    expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe('100');
});
it('preserves actual timely endpoint coverage instead of rejecting all estimated payments', () => { const input = ohioPaymentFixture(); Object.assign(input.ohioPayments, { paymentRows: ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'].map((date, index) => { const row = actualOhioPayment(input, '523', date); row.sourceId = 'current-' + index; row.original.confirmationNumber = 'ACTUAL-QUARTER-' + index; return row; }) }); const result = calculate(input); expect(result.itsd2210?.safeHarborA).toBe(true); expect(result.itsd2210?.line17_totalPenalty.toString()).toBe('0'); expect(result.it1040.line15_estimatedPayments.toString()).toBe('2092'); });

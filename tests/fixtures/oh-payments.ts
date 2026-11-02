/** Synthetic actual originals, pinned before calculation outputs. */
import { simpleW2Fixture } from './simple-w2.js';
import { ohioResidencyFacts, ohioResidencyOwner } from './oh-residency.js';
export function ohioPaymentFixture(status: 'full_year_resident' | 'part_year_resident' | 'nonresident' = 'full_year_resident') {
    const original = structuredClone(simpleW2Fixture);
    original.taxpayer.primary = { ...original.taxpayer.primary, firstName: 'Avery', lastName: 'Payment', ssn: '900-70-0311' };
    original.w2s = [{ ...original.w2s![0]!, accountHolder: 'primary', taxYear: 2025, wages: '100000', socialSecurityWages: '100000', medicareWages: '100000', federalWithheld: '0', state: 'OH', stateWages: status === 'full_year_resident' ? '100000' : status === 'part_year_resident' ? '40000' : '20000', stateTaxWithheld: '0', localTaxWithheld: '0' }];
    const owner = ohioResidencyOwner('primary', status);
    Object.assign(owner.amounts.wages, { federalAmount: '100000', residentAmount: status === 'full_year_resident' ? '100000' : status === 'part_year_resident' ? '30000' : '0', nonresidentOhioAmount: status === 'full_year_resident' ? '0' : status === 'part_year_resident' ? '10000' : '20000' });
    const residency = { ...ohioResidencyFacts(), owners: [owner], originalFederalSources: structuredClone(original) };
    const payments = { taxYear: 2025, sourceReference: 'Synthetic complete2025 Ohio account records', sourceFactsConfirmed: true as const, originalFederalSources: structuredClone(original), calendarYearConfirmed: true as const, allPaymentsIncludedConfirmed: true as const,
        withholdingTreatment: 'equal_quarters' as const, paymentRows: [], priorReturn: { status: 'no_return' as const, sourceReference: 'Actual first2025 Ohio return history' }, priorCreditCarryforward: { status: 'none' as const, sourceReference: 'Actual prior account no carry' },
        remainingTaxPayment: { status: 'expected_payment' as const, sourceReference: 'Actual intended April15 remaining-tax payment', sourceFactsConfirmed: true as const, date: '2026-04-15', amountAppliedToTax: status === 'full_year_resident' ? '2323' : status === 'part_year_resident' ? '929' : '465' },
        currentTiming: { kind: 'expected' as const, expectedDate: '2026-04-15', asOfDate: '2026-04-01' }, filingExtension: { kind: 'none' as const }, paymentExtension: { kind: 'none' as const }, returnKind: 'original' as const, specialMethod: 'regular' as const,
        balanceFacts: { sourceReference: 'Actual use tax and refund elections', useTax: '0', outgoingCarryforward: '0', donations: '0' } };
    return { ...original, ohioResidency: residency, ohioPayments: payments };
}
export function actualOhioPayment(input: ReturnType<typeof ohioPaymentFixture>, amount = '100', date = '2025-04-15') {
    return { sourceId: 'actual-bank-record-1', sourceReference: 'Synthetic original bank record', accountHolder: 'primary' as const, taxYear: 2025, returnType: 'it1040' as const, kind: 'estimated' as const, date, amount, appliedToThisReturnConfirmed: true as const, original: { accountName: 'Avery Payment', accountSsn: input.taxpayer.primary.ssn, taxYear: 2025, returnType: 'it1040' as const, kind: 'estimated' as const, date, amount, confirmationNumber: 'PAYMENT-ORIGINAL-1' } };
}
export function actualPriorOhioReturn(input: ReturnType<typeof ohioPaymentFixture>, line10 = '0', line16 = '0') {
    return { status: 'filed_return' as const, taxYear: 2024, returnType: 'it1040' as const, periodStart: '2024-01-01', periodEnd: '2024-12-31', filingStatus: input.taxpayer.filingStatus, owners: [{ accountHolder: 'primary' as const, name: 'Avery Payment', ssn: input.taxpayer.primary.ssn }], returnKind: 'original' as const, filedDate: '2025-04-15', filingExtension: { kind: 'none' as const }, line10, line16, electedCreditCarryforward: '0', sourceReference: 'Synthetic actual original2024 IT1040' };
}

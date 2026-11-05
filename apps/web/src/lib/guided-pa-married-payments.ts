/** Spec: state/pa-married-payment-native.yaml. Explicit private original collection. */
import type { TaxYearInput } from '@/models/inputs';
import { PAMarriedOrdinarySourcesSchema, type PAMarriedOrdinarySources } from '@/models/pa-married-ordinary-sources';
import { PAMarriedPaymentSourcesSchema, type PAMarriedPaymentSources } from '@/models/pa-married-payment-sources';
import { calculatePAMarriedPaymentSources } from '@/engine/state/pa-married-payment-sources';
export const emptyGuidedPAMarriedPaymentReceipt = (): PAMarriedPaymentSources['accounts'][number]['originalAccount']['receipts'][number] => ({ accountName: '', accountSsn: '', taxYear: null, returnType: '', kind: '', date: '', amount: '', confirmationNumber: '' });
export function emptyGuidedPAMarriedPayments(): PAMarriedPaymentSources { return { sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null, accounts: [] }; }
export function emptyGuidedPAMarriedPaymentAccount(accountHolder: 'primary' | 'spouse'): PAMarriedPaymentSources['accounts'][number] { return { accountHolder, sourceReference: '', originalAccount: { accountName: '', accountSsn: '', taxYear: null, returnType: '', filingStatus: '', accountKind: '', asOfDate: '', allPaymentsCompleteConfirmed: null, noTransfersOffsetsRefundsOrAdjustmentsConfirmed: null, receipts: [], availablePriorCredit: '', priorCreditAppliedOn: null }, receipts: [], priorCredit: { status: '', sourceReference: '' } }; }
/** Editing never replaces separately entered account inventories or captured originals. */
export function updateGuidedPAMarriedPayments(sources: PAMarriedOrdinarySources, packet: PAMarriedPaymentSources): PAMarriedOrdinarySources { return { ...sources, sourceFactsConfirmed: null, paymentSources: { ...packet, sourceFactsConfirmed: null } }; }
/** User-reviewed individual receipt originals, never totals, enter the retained owner snapshot. */
export function captureGuidedPAMarriedPaymentOriginals(input: TaxYearInput, sources: PAMarriedOrdinarySources, index: number): PAMarriedOrdinarySources {
    const parsed = PAMarriedOrdinarySourcesSchema.parse(sources), packet = parsed.paymentSources, account = packet?.accounts[index];
    if (input.taxpayer.taxYear !== 2025 || parsed.filingMode !== 'M' || !packet || !account || !['primary', 'spouse'].includes(account.accountHolder))
        throw Error('Select the supported actual2025 separate payment account first.');
    const holder = account.accountHolder, person = holder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    const owners = parsed.owners.filter(owner => owner.accountHolder === holder);
    if (!person || owners.length !== 1)
        throw Error('Select one actual current payment owner.');
    for (const row of account.receipts) {
        const o = row.original, date = Date.parse(o.date + 'T00:00:00Z');
        if (!row.sourceReference.trim() || o.accountName.trim().replace(/\s+/gu, ' ').toUpperCase() !== (person.firstName + ' ' + person.lastName).trim().replace(/\s+/gu, ' ').toUpperCase() || o.accountSsn.replace(/[-\s]/gu, '') !== person.ssn.replace(/[-\s]/gu, '') || o.taxYear !== 2025 || o.returnType !== 'PA-40' || !['estimated', 'extension'].includes(o.kind) || !/^\d+(\.\d+)?$/u.test(o.amount) || !o.confirmationNumber.trim() || !/^\d{4}-\d{2}-\d{2}$/u.test(o.date) || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== o.date)
            throw Error('Complete each actual owner receipt original before capturing it.');
    }
    return { ...updateGuidedPAMarriedPayments(parsed, packet), owners: parsed.owners.map(owner => owner.accountHolder === holder ? { ...owner, payments: { ...owner.payments, originalReceipts: account.receipts.map(row => structuredClone(row.original)) } } : owner) };
}
/** Confirm the payment contract only; full household confirmation remains separate. */
export function confirmGuidedPAMarriedPayments(input: TaxYearInput, sources: PAMarriedOrdinarySources): PAMarriedOrdinarySources {
    const parsed = PAMarriedOrdinarySourcesSchema.parse(sources);
    if (!parsed.paymentSources)
        throw Error('Enter the actual separate payment accounts first.');
    const packet = PAMarriedPaymentSourcesSchema.parse({ ...parsed.paymentSources, sourceFactsConfirmed: true });
    const candidate = { ...parsed, sourceFactsConfirmed: null, paymentSources: packet };
    calculatePAMarriedPaymentSources(input, candidate);
    return candidate;
}

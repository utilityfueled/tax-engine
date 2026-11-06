// Spec: state/pa-married-payment-native.yaml.
import { it, expect } from 'vitest';
import { PAMarriedOrdinarySourcesSchema } from '@/models/pa-married-ordinary-sources';
import { calculatePAMarriedOrdinaryReturn } from '@/engine/state/pa-married-ordinary-return';
import { emptyGuidedPAMarriedPayments, emptyGuidedPAMarriedPaymentAccount, captureGuidedPAMarriedPaymentOriginals, confirmGuidedPAMarriedPayments, updateGuidedPAMarriedPayments } from '@/lib/guided-pa-married-payments';
import { updateGuidedPAMarriedOrdinarySources, confirmGuidedPAMarriedOrdinarySources } from '@/lib/guided-pa-married-ordinary-sources';
import { paMarriedPaymentsFixture } from '../../fixtures/pa-married-payments';
function fixture() { const f = paMarriedPaymentsFixture(); return { ...f, sources: PAMarriedOrdinarySourcesSchema.parse(f.sources) }; }
it('PA payment provenance edits revoke both confirmations and retain originals', () => { const f = fixture(), before = JSON.stringify(f), packet = structuredClone(required(f.sources.paymentSources)); packet.accounts[0].receipts[0].sourceReference += ' updated original'; packet.accounts[0].receipts[0].original.amount = '100.250'; const changed = updateGuidedPAMarriedPayments(f.sources, packet); expect(changed.sourceFactsConfirmed).toBeNull(); expect(required(changed.paymentSources).sourceFactsConfirmed).toBeNull(); expect(changed.owners).toEqual(f.sources.owners); expect(changed.originalFederalSources).toEqual(f.sources.originalFederalSources); expect(() => confirmGuidedPAMarriedPayments(f.input, changed)).toThrow(); expect(JSON.stringify(f)).toBe(before); const parent = updateGuidedPAMarriedOrdinarySources(f.sources, { sourceReference: 'Actual replacement household reference' }); expect(required(parent.paymentSources).sourceFactsConfirmed).toBeNull(); expect(required(parent.paymentSources).accounts).toEqual(required(f.sources.paymentSources).accounts); });
it('PA explicit capture clones reviewed receipt originals only', () => { const f = fixture(), before = JSON.stringify(f), s = structuredClone(f.sources); s.owners[0].payments.originalReceipts = []; const captured = captureGuidedPAMarriedPaymentOriginals(f.input, s, 0); expect(captured.owners[0].payments.originalReceipts).toEqual(required(s.paymentSources).accounts[0].receipts.map(r => r.original)); expect(required(captured.paymentSources).accounts[0].originalAccount).toEqual(required(s.paymentSources).accounts[0].originalAccount); expect(captured.owners[0].payments.originalReceipts[0]).not.toBe(required(s.paymentSources).accounts[0].receipts[0].original); expect(captured.sourceFactsConfirmed).toBeNull(); expect(required(captured.paymentSources).sourceFactsConfirmed).toBeNull(); expect(JSON.stringify(f)).toBe(before); });
it('PA payment confirmation replays actual backend and keeps household unconfirmed', () => { const f = fixture(), before = JSON.stringify(f), confirmed = confirmGuidedPAMarriedPayments(f.input, f.sources); expect(confirmed.sourceFactsConfirmed).toBeNull(); expect(required(confirmed.paymentSources).sourceFactsConfirmed).toBe(true); expect(confirmed.owners).toEqual(f.sources.owners); const household = confirmGuidedPAMarriedOrdinarySources(f.input, confirmed), r = calculatePAMarriedOrdinaryReturn(f.input, household); expect(r.returns.map(v => [v.pa40.creditFromPriorYear.toString(), v.pa40.estimatedPayments.toString(), v.pa40.extensionPayment.toString(), v.pa40.netOverpayment.toString()])).toEqual([['51', '200', '76', '327'], ['0', '80', '0', '80']]); expect(r.readiness.filingEligible).toBe(false); expect(JSON.stringify(f)).toBe(before); });
it('PA payment empty accounts preserve unknowns and zero lexemes', () => { const a = emptyGuidedPAMarriedPaymentAccount('primary'); expect(emptyGuidedPAMarriedPayments()).toEqual({ sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null, accounts: [] }); expect(a.originalAccount.availablePriorCredit).toBe(''); expect(a.originalAccount.priorCreditAppliedOn).toBeNull(); expect(a.originalAccount.allPaymentsCompleteConfirmed).toBeNull(); const f = fixture(); required(f.sources.paymentSources).accounts[1].originalAccount.availablePriorCredit = '0.00'; expect(required(confirmGuidedPAMarriedPayments(f.input, f.sources).paymentSources).accounts[1].originalAccount.availablePriorCredit).toBe('0.00'); required(f.sources.paymentSources).accounts[1].originalAccount.availablePriorCredit = ''; expect(() => confirmGuidedPAMarriedPayments(f.input, f.sources)).toThrow(); });
it.each(['source', 'date', 'amount', 'identity', 'taxYear'] as const)('PA explicit capture rejects malformed actual receipt %s', kind => { const f = fixture(), a = required(f.sources.paymentSources).accounts[0]; if (kind === 'source')
    a.receipts[0].sourceReference = ''; if (kind === 'date')
    a.receipts[0].original.date = '2025-02-30'; if (kind === 'amount')
    a.receipts[0].original.amount = '1,0'; if (kind === 'identity')
    a.receipts[0].original.accountSsn = ''; if (kind === 'taxYear')
    a.receipts[0].original.taxYear = null; const before = JSON.stringify(f); expect(() => captureGuidedPAMarriedPaymentOriginals(f.input, f.sources, 0)).toThrow(); expect(JSON.stringify(f)).toBe(before); });
it('PA payment confirmation preserves existing unsupported method guards', () => { for (const kind of ['J', '2026', 'joint', 'unknown', 'duplicate', 'late', 'transfer'] as const) {
    const f = fixture(), s = f.sources, p = required(s.paymentSources);
    if (kind === 'J')
        s.filingMode = 'J';
    if (kind === '2026')
        p.sourceTaxYear = 2026;
    if (kind === 'joint')
        p.accounts[0].originalAccount.accountKind = 'joint';
    if (kind === 'unknown')
        p.accounts[0].originalAccount.allPaymentsCompleteConfirmed = null;
    if (kind === 'duplicate')
        p.accounts.push(structuredClone(p.accounts[0]));
    if (kind === 'late')
        p.accounts[0].receipts[0].original.date = '2025-04-16';
    if (kind === 'transfer')
        p.accounts[0].originalAccount.noTransfersOffsetsRefundsOrAdjustmentsConfirmed = false;
    const before = JSON.stringify(f);
    expect(() => confirmGuidedPAMarriedPayments(f.input, s), kind).toThrow();
    expect(JSON.stringify(f)).toBe(before);
} });
it('PA payment native confirmation does not establish a supported penalty history', () => { const raw = paMarriedPaymentsFixture({ primaryEstimates: [], primaryExtension: '1600', priorCredit: '0', withholding: ['0', '921'], refunds: ['65', '80'] }), s = PAMarriedOrdinarySourcesSchema.parse(raw.sources), confirmed = confirmGuidedPAMarriedPayments(raw.input, s); expect(required(confirmed.paymentSources).sourceFactsConfirmed).toBe(true); expect(() => confirmGuidedPAMarriedOrdinarySources(raw.input, confirmed)).toThrow(/prior.*(?:exemption|forgiveness|eligibility)/i); });

function required<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error("Expected actual fixture fact");return value;}

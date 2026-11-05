// @vitest-environment jsdom
// Spec: state/pa-married-payment-native.yaml.
import React, { useState } from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { PAMarriedPaymentSourcesSchema } from '@/models/pa-married-payment-sources';
import { PAMarriedOrdinarySourcesSchema } from '@/models/pa-married-ordinary-sources';
import { calculatePAMarriedOrdinaryReturn } from '@/engine/state/pa-married-ordinary-return';
import { PAMarriedOrdinaryDetails } from '@/components/guided-interview/pa-married-ordinary-details';
import { paMarriedPaymentsFixture } from '../../fixtures/pa-married-payments';
import { mountGuidedPanel } from './guided-panel-dom';
afterEach(() => vi.unstubAllGlobals());
it('native separate PA payment account controls start unknown', async () => { const f = paMarriedPaymentsFixture(), initial = PAMarriedOrdinarySourcesSchema.parse(f.sources); delete initial.paymentSources; initial.sourceFactsConfirmed = null; let latest = initial; function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain draft'); latest = next; set(latest); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.click('Add actual separate PA payment accounts');
    expect(latest.paymentSources).toMatchObject({ sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null, accounts: [] });
    await p.click('Add primary actual payment account');
    expect(PAMarriedPaymentSourcesSchema.parse(latest.paymentSources).accounts[0].originalAccount).toMatchObject({ accountName: '', accountSsn: '', taxYear: null, availablePriorCredit: '', priorCreditAppliedOn: null, allPaymentsCompleteConfirmed: null });
    expect(p.container.querySelector('textarea,input[type="hidden"]')).toBeNull();
}
finally {
    await p.dispose();
} });
it('native blank separate PA payments reach literal existing backend outputs', async () => {
    const f = paMarriedPaymentsFixture(), initial = PAMarriedOrdinarySourcesSchema.parse(f.sources), expected = structuredClone(required(initial.paymentSources));
    delete initial.paymentSources;
    initial.sourceFactsConfirmed = null;
    initial.owners.forEach(o => { o.payments.originalReceipts = []; o.payments.estimatedPaymentsStatus = ''; o.payments.extensionPaymentsStatus = ''; o.payments.priorCreditStatus = ''; o.payments.priorReturnStatus = ''; });
    let latest = initial;
    function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
        throw Error('Retain draft'); latest = next; set(next); }}/>; }
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const p = await mountGuidedPanel(<Harness />);
    try {
        await p.click('Add actual separate PA payment accounts');
        await p.change('Separate PA payment source tax year', '2025');
        await p.change('Separate PA payment collection source reference', expected.sourceReference);
        for (const [i, account] of expected.accounts.entries()) {
            const prefix = `Payment account ${i + 1}`, owner = i === 0 ? 'Primary' : 'Spouse';
            await p.click(`Add ${account.accountHolder} actual payment account`);
            await p.change(prefix + ' original source reference', account.sourceReference);
            for (const key of ['accountName', 'accountSsn', 'returnType', 'filingStatus', 'accountKind', 'asOfDate', 'availablePriorCredit'] as const)
                await p.change(prefix + ' printed ' + key, account.originalAccount[key]);
            await p.change(prefix + ' printed taxYear', '2025');
            if (account.originalAccount.priorCreditAppliedOn)
                await p.change(prefix + ' prior credit applied date or no date', account.originalAccount.priorCreditAppliedOn);
            await p.change(prefix + ' complete account checked', 'true');
            await p.change(prefix + ' no transfers offsets refunds or adjustments checked', 'true');
            for (const [n, row] of account.originalAccount.receipts.entries()) {
                await p.click(`Add ${prefix} posted original receipt row`);
                for (const [key, value] of Object.entries(row))
                    await p.change(prefix + ` posted row ${n + 1} ` + key, String(value));
            }
            for (const [n, row] of account.receipts.entries()) {
                await p.click(`Add ${prefix} actual payment receipt`);
                await p.change(prefix + ` receipt ${n + 1} source reference`, row.sourceReference);
                if (row.intendedInstallment !== null)
                    await p.change(prefix + ` receipt ${n + 1} intended installment`, String(row.intendedInstallment));
                for (const [key, value] of Object.entries(row.original))
                    await p.change(prefix + ` receipt ${n + 1} original ` + key, String(value));
            }
            await p.change(prefix + ' prior credit status', account.priorCredit.status);
            await p.change(prefix + ' prior credit source reference', account.priorCredit.sourceReference);
            if (account.priorCredit.originalPriorReturn) {
                await p.click(`Add ${prefix} original prior return election`);
                for (const [key, value] of Object.entries(account.priorCredit.originalPriorReturn))
                    await p.change(prefix + ' prior original ' + key, String(value));
            }
            for (const [key, label] of [['estimatedPaymentsStatus', 'estimated payment history'], ['extensionPaymentsStatus', 'extension payment history'], ['priorCreditStatus', 'prior credit history'], ['priorReturnStatus', 'prior return history']] as const)
                await p.change(owner + ' actual ' + label, f.sources.owners[i].payments[key]);
            expect(latest.owners[i].payments.originalReceipts).toEqual([]);
            await p.click(`Capture ${prefix} reviewed original receipts`);
            expect(latest.owners[i].payments.originalReceipts).toEqual(account.receipts.map(r => r.original));
        }
        expect(latest.paymentSources).toEqual({ ...expected, sourceFactsConfirmed: null });
        await p.click('Confirm actual separate PA payment accounts after the last edit');
        expect(required(latest.paymentSources).sourceFactsConfirmed).toBe(true);
        expect(latest.sourceFactsConfirmed).toBeNull();
        await p.click('Confirm actual married PA household sources after the last edit');
        expect(latest.sourceFactsConfirmed).toBe(true);
        const r = calculatePAMarriedOrdinaryReturn(f.input, latest);
        expect(r.returns.map(v => [v.pa40.creditFromPriorYear.toString(), v.pa40.estimatedPayments.toString(), v.pa40.extensionPayment.toString(), v.pa40.netOverpayment.toString()])).toEqual([['51', '200', '76', '327'], ['0', '80', '0', '80']]);
        expect(r.readiness.filingEligible).toBe(false);
        const captured = structuredClone(latest.owners[0].payments.originalReceipts), federal = structuredClone(latest.originalFederalSources);
        await p.change('Payment account 1 receipt 1 original amount', '100.250');
        expect(required(latest.paymentSources).sourceFactsConfirmed).toBeNull();
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(latest.owners[0].payments.originalReceipts).toEqual(captured);
        expect(latest.originalFederalSources).toEqual(federal);
    }
    finally {
        await p.dispose();
    }
});
it('native identical payment primitive leaves confirmations and parent writes unchanged', async () => { const f = paMarriedPaymentsFixture(), initial = PAMarriedOrdinarySourcesSchema.parse(f.sources); let writes = 0, latest = initial; function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain draft'); writes++; latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.change('Payment account 1 receipt 1 original amount', '100.25');
    expect(writes).toBe(0);
    expect(latest.sourceFactsConfirmed).toBe(true);
    expect(required(latest.paymentSources).sourceFactsConfirmed).toBe(true);
    await p.change('Payment account 1 receipt 1 source reference', 'Actual replacement provenance');
    expect(writes).toBe(1);
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(required(latest.paymentSources).sourceFactsConfirmed).toBeNull();
    expect(latest.owners[0].payments.originalReceipts).toEqual(initial.owners[0].payments.originalReceipts);
}
finally {
    await p.dispose();
} });
it('native payment malformed and zero originals remain literal until explicit reconciliation', async () => { const f = paMarriedPaymentsFixture(), initial = PAMarriedOrdinarySourcesSchema.parse(f.sources); let latest = initial; function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain draft'); latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    const retained = structuredClone(initial.owners);
    for (const amount of ['', '0.00', '1,0', '$']) {
        await p.change('Payment account 1 receipt 1 original amount', amount);
        expect(required(latest.paymentSources).accounts[0].receipts[0].original.amount).toBe(amount);
        expect(latest.owners).toEqual(retained);
        expect(latest.sourceFactsConfirmed).toBeNull();
        await p.click('Confirm actual separate PA payment accounts after the last edit');
        expect(required(latest.paymentSources).sourceFactsConfirmed).toBeNull();
    }
    await p.click('Remove Payment account 1');
    expect(required(latest.paymentSources).accounts).toHaveLength(1);
    expect(latest.owners).toEqual(retained);
}
finally {
    await p.dispose();
} });
it('native payment capture and confirmation wait for actual federal originals', async () => { const f = paMarriedPaymentsFixture(), data = PAMarriedOrdinarySourcesSchema.parse(f.sources); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const onChange = vi.fn(), p = await mountGuidedPanel(<PAMarriedOrdinaryDetails originalInput={null} data={data} onChange={onChange}/>); try {
    await p.click('Capture Payment account 1 reviewed original receipts');
    await p.click('Confirm actual separate PA payment accounts after the last edit');
    expect(onChange).not.toHaveBeenCalled();
}
finally {
    await p.dispose();
} });

function required<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error("Expected actual fixture fact");return value;}

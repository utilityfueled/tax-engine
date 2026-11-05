"use client";
/** Actual documentary accounts, not inferred payment totals. Spec: state/pa-married-payment-native.yaml. */
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import type { PAMarriedOrdinarySources } from '@/models/pa-married-ordinary-sources';
import { PAMarriedPaymentSourcesSchema } from '@/models/pa-married-payment-sources';
import { emptyGuidedPAMarriedPayments, emptyGuidedPAMarriedPaymentAccount, emptyGuidedPAMarriedPaymentReceipt, updateGuidedPAMarriedPayments, captureGuidedPAMarriedPaymentOriginals, confirmGuidedPAMarriedPayments } from '@/lib/guided-pa-married-payments';
type Path = Array<string | number>;
const answers = [['', 'Unknown'], ['true', 'Yes'], ['false', 'No']];
const choices = (v: string[]) => [['', 'Unknown'], ...v.map(s => [s, s])];
function read(value: unknown, path: Path): unknown { for (const key of path)
    value = (value as Record<string | number, unknown>)?.[key]; return value; }
function write(value: unknown, path: Path, next: unknown): unknown { if (!path.length)
    return next; const [key, ...rest] = path; if (Array.isArray(value))
    return value.map((v, i) => i === key ? write(v, rest, next) : v); return { ...(value as object), [key]: write((value as Record<string | number, unknown>)?.[key], rest, next) }; }
export function PAMarriedPaymentDetails({ originalInput, data, onChange }: {
    originalInput: TaxYearInput | null;
    data: PAMarriedOrdinarySources;
    onChange: (next: PAMarriedOrdinarySources) => void;
}) {
    const [status, setStatus] = useState(''), packet = data.paymentSources;
    function set(path: Path, value: unknown) { if (!packet || Object.is(read(packet, path), value))
        return; onChange(updateGuidedPAMarriedPayments(data, PAMarriedPaymentSourcesSchema.parse(write(packet, path, value)))); setStatus(''); }
    function field(label: string, path: Path, value: unknown, options?: string[][], integer = false, nullable = false) { return <label className="guided-field" key={label}><span className="guided-field-label">{label}</span>{options ? <select className="guided-input" value={value === null ? '' : String(value ?? '')} onChange={e => set(path, options === answers ? (e.target.value === '' ? null : e.target.value === 'true') : e.target.value)}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select> : <input className="guided-input" value={value === null ? '' : String(value ?? '')} inputMode={integer ? 'numeric' : undefined} onChange={e => { const v = e.target.value; if (integer) {
        if (v === '' || /^\d+$/u.test(v))
            set(path, v === '' ? null : Number(v));
    }
    else
        set(path, nullable && v === '' ? null : v); }}/>}</label>; }
    function receipt(prefix: string, path: Path, value: ReturnType<typeof emptyGuidedPAMarriedPaymentReceipt>) { return <>{(['accountName', 'accountSsn', 'returnType', 'kind', 'date', 'amount', 'confirmationNumber'] as const).map(k => field(prefix + ' ' + k, [...path, k], value[k]))}{field(prefix + ' taxYear', [...path, 'taxYear'], value.taxYear, undefined, true)}</>; }
    function action(run: () => PAMarriedOrdinarySources, message: string) { try {
        onChange(run());
        setStatus(message);
    }
    catch (error) {
        setStatus(error instanceof Error ? error.message : 'Reconcile actual payment originals.');
    } }
    return <section aria-label="Actual separate PA payment accounts"><h4>Actual separate PA payment accounts</h4><p>Enter each individual account transcript and its posted receipt rows independently from the payment receipt originals. Review supports2025 separate M accounts only. Joint accounts, transfers, late payments and unsupported penalty methods remain unavailable.</p>{!packet ? <button type="button" onClick={() => { onChange(updateGuidedPAMarriedPayments(data, emptyGuidedPAMarriedPayments())); setStatus(''); }}>Add actual separate PA payment accounts</button> : <>
 {field('Separate PA payment source tax year', ['sourceTaxYear'], packet.sourceTaxYear, undefined, true)}{field('Separate PA payment collection source reference', ['sourceReference'], packet.sourceReference)}
 {packet.accounts.map((account, index) => {
                const p: Path = ['accounts', index], prefix = `Payment account ${index + 1}`, a = account.originalAccount;
                return <fieldset key={index}><legend>{prefix}</legend>{field(prefix + ' actual owner', [...p, 'accountHolder'], account.accountHolder, choices(['primary', 'spouse']))}{field(prefix + ' original source reference', [...p, 'sourceReference'], account.sourceReference)}
 {(['accountName', 'accountSsn', 'returnType', 'filingStatus', 'accountKind', 'asOfDate', 'availablePriorCredit'] as const).map(k => field(prefix + ' printed ' + k, [...p, 'originalAccount', k], a[k]))}{field(prefix + ' printed taxYear', [...p, 'originalAccount', 'taxYear'], a.taxYear, undefined, true)}{field(prefix + ' prior credit applied date or no date', [...p, 'originalAccount', 'priorCreditAppliedOn'], a.priorCreditAppliedOn, undefined, false, true)}
 {field(prefix + ' complete account checked', [...p, 'originalAccount', 'allPaymentsCompleteConfirmed'], a.allPaymentsCompleteConfirmed, answers)}{field(prefix + ' no transfers offsets refunds or adjustments checked', [...p, 'originalAccount', 'noTransfersOffsetsRefundsOrAdjustmentsConfirmed'], a.noTransfersOffsetsRefundsOrAdjustmentsConfirmed, answers)}
 <p>Copy every posted receipt row from the account record, including actual zero rows.</p>{a.receipts.map((row, n) => <div key={n}>{receipt(prefix + ` posted row ${n + 1}`, [...p, 'originalAccount', 'receipts', n], row)}<button type="button" onClick={() => set([...p, 'originalAccount', 'receipts'], a.receipts.filter((_, i) => i !== n))}>Remove {prefix} posted row {n + 1}</button></div>)}<button type="button" onClick={() => set([...p, 'originalAccount', 'receipts'], [...a.receipts, emptyGuidedPAMarriedPaymentReceipt()])}>Add {prefix} posted original receipt row</button>
 <p>Enter each payment receipt original independently. Capturing below replaces only the retained owner receipt snapshot after your review.</p>{account.receipts.map((row, n) => <div key={n}>{field(prefix + ` receipt ${n + 1} source reference`, [...p, 'receipts', n, 'sourceReference'], row.sourceReference)}{field(prefix + ` receipt ${n + 1} intended installment`, [...p, 'receipts', n, 'intendedInstallment'], row.intendedInstallment, undefined, true)}{receipt(prefix + ` receipt ${n + 1} original`, [...p, 'receipts', n, 'original'], row.original)}<button type="button" onClick={() => set([...p, 'receipts'], account.receipts.filter((_, i) => i !== n))}>Remove {prefix} receipt {n + 1}</button></div>)}<button type="button" onClick={() => set([...p, 'receipts'], [...account.receipts, { sourceReference: '', intendedInstallment: null, original: emptyGuidedPAMarriedPaymentReceipt() }])}>Add {prefix} actual payment receipt</button>
 {field(prefix + ' prior credit status', [...p, 'priorCredit', 'status'], account.priorCredit.status, choices(['known_none', 'actual_credit']))}{field(prefix + ' prior credit source reference', [...p, 'priorCredit', 'sourceReference'], account.priorCredit.sourceReference)}
 {!account.priorCredit.originalPriorReturn ? <button type="button" onClick={() => set([...p, 'priorCredit', 'originalPriorReturn'], { accountName: '', accountSsn: '', taxYear: null, returnType: '', filingStatus: '', filedOn: '', creditElected: '' })}>Add {prefix} original prior return election</button> : <>{(['accountName', 'accountSsn', 'returnType', 'filingStatus', 'filedOn', 'creditElected'] as const).map(k => field(prefix + ' prior original ' + k, [...p, 'priorCredit', 'originalPriorReturn', k], account.priorCredit.originalPriorReturn?.[k]))}{field(prefix + ' prior original taxYear', [...p, 'priorCredit', 'originalPriorReturn', 'taxYear'], account.priorCredit.originalPriorReturn.taxYear, undefined, true)}<button type="button" onClick={() => set([...p, 'priorCredit', 'originalPriorReturn'], undefined)}>Remove {prefix} original prior return election</button></>}
 <button type="button" disabled={!originalInput} onClick={() => action(() => { if (!originalInput)
                    throw Error('Complete actual originals first.'); return captureGuidedPAMarriedPaymentOriginals(originalInput, data, index); }, 'Reviewed receipt originals captured. Confirm payments and household after the last edit.')}>Capture {prefix} reviewed original receipts</button>
 <button type="button" onClick={() => set(['accounts'], packet.accounts.filter((_, i) => i !== index))}>Remove {prefix}</button></fieldset>;
            })}
 {(['primary', 'spouse'] as const).map(holder => <button key={holder} type="button" onClick={() => set(['accounts'], [...packet.accounts, emptyGuidedPAMarriedPaymentAccount(holder)])}>Add {holder} actual payment account</button>)}
 <button type="button" disabled={!originalInput} onClick={() => action(() => { if (!originalInput)
            throw Error('Complete actual originals first.'); return confirmGuidedPAMarriedPayments(originalInput, data); }, 'Actual separate payment accounts confirmed. Complete household confirmation and source validation remain required; filing is unavailable.')}>Confirm actual separate PA payment accounts after the last edit</button>
 </>}{status && <p role="status">{status}</p>}</section>;
}

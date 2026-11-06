'use client';
/** Spec: state/pa-married-residency-native.yaml. Actual dates and days only. */
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import { PAMarriedResidencySourcesSchema } from '@/models/pa-married-residency-sources';
import type { PAMarriedOrdinarySources } from '@/models/pa-married-ordinary-sources';
import { emptyGuidedPAMarriedResidency, emptyGuidedPAMarriedResidencyOwner, emptyGuidedPAMarriedDomicilePeriod, emptyGuidedPAMarriedAbodePeriod, updateGuidedPAMarriedResidency, captureGuidedPAMarriedResidencyOwner, confirmGuidedPAMarriedResidency } from '@/lib/guided-pa-married-residency';
type Path = Array<string | number>;
function at(value: unknown, path: Path, next: unknown): unknown { if (!path.length)
    return next; const [key, ...rest] = path; if (Array.isArray(value))
    return value.map((child, i) => i === key ? at(child, rest, next) : child); if (value && typeof value === 'object')
    return { ...value, [key]: at((value as Record<string, unknown>)[key], rest, next) }; throw Error('Actual calendar path is unavailable.'); }
function read(value: unknown, path: Path): unknown { return path.reduce<unknown>((v, key) => v && typeof v === 'object' ? (v as Record<string | number, unknown>)[key] : undefined, value); }
const answers = [['', 'Unknown'], ['true', 'Yes'], ['false', 'No']];
export function PAMarriedResidencyDetails({ originalInput, data, onChange }: {
    originalInput: TaxYearInput | null;
    data: PAMarriedOrdinarySources;
    onChange: (next: PAMarriedOrdinarySources) => void;
}) {
    const [status, setStatus] = useState(''), d = data.residencySources;
    function action(fn: () => PAMarriedOrdinarySources, message: string) { try {
        onChange(fn());
        setStatus(message);
    }
    catch (error) {
        setStatus(error instanceof Error ? error.message : 'Reconcile actual calendar sources.');
    } }
    if (!d)
        return <section aria-label="Separate spouse residency calendars"><h4>Separate spouse residency calendars</h4><p>Use detailed original calendars for the supported separate-M household with one full-year PA resident and a nonresident or one-move spouse. Existing summary values remain saved and require explicit reconciliation.</p><button type="button" onClick={() => onChange(updateGuidedPAMarriedResidency(data, emptyGuidedPAMarriedResidency()))}>Add actual separate spouse residency calendars</button></section>;
    function edit(path: Path, value: unknown) { if (!d || Object.is(read(d, path), value))
        return; const packet = PAMarriedResidencySourcesSchema.parse(at(d, path, value)); onChange(updateGuidedPAMarriedResidency(data, packet)); setStatus(''); }
    function field(label: string, path: Path, value: unknown, options?: string[][], integer = false) { return <label className="guided-field"><span className="guided-field-label">{label}</span>{options ? <select className="guided-input" value={value === null ? '' : String(value)} onChange={e => edit(path, options === answers ? (e.target.value === '' ? null : e.target.value === 'true') : e.target.value)}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select> : <input className="guided-input" value={value === null ? '' : String(value ?? '')} inputMode={integer ? 'numeric' : undefined} onChange={e => { const v = e.target.value; if (!integer)
        edit(path, v);
    else if (v === '' || /^\d+$/u.test(v) && Number.isSafeInteger(Number(v)))
        edit(path, v === '' ? null : Number(v)); }}/>}</label>; }
    return <section aria-label="Separate spouse residency calendars"><h4>Separate spouse residency calendars</h4><p>Dates, days and payroll are actual original facts. Reconcile each older residency summary explicitly: its confirmation must be No, dates/state/school blank and days Unknown. Nothing is cleared automatically. Use the existing wage/payroll controls for each actual paid/service period. Calendar confirmation alone does not confirm wages, qualify paper or authorize filing.</p>
 {field('Separate PA calendar source tax year', ['sourceTaxYear'], d.sourceTaxYear, undefined, true)}{field('Separate PA calendar collection source reference', ['sourceReference'], d.sourceReference)}
 {(['primary', 'spouse'] as const).map(tag => !d.owners.some(o => o.accountHolder === tag) && <button type="button" key={tag} onClick={() => edit(['owners'], [...d.owners, emptyGuidedPAMarriedResidencyOwner(tag)])}>Add {tag} actual calendar owner</button>)}
 {d.owners.map((o, i) => {
            const p: Path = ['owners', i], q: Path = [...p, 'residency'], prefix = `Calendar owner ${i + 1}`;
            return <fieldset key={i}><legend>{prefix}</legend>
 {field(prefix + ' actual owner', [...p, 'accountHolder'], o.accountHolder, [['', 'Unknown'], ['primary', 'Primary'], ['spouse', 'Spouse']])}
 {field(prefix + ' actual payroll locations reviewed without convenience allocation', [...p, 'allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed'], o.allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed, answers)}
 <p>{o.originalTaxpayer.ssn ? 'A prior original identity is retained. Capture explicitly after reviewing a changed current identity.' : 'Current taxpayer identity has not been captured.'}</p>
 <button type="button" onClick={() => action(() => { if (!originalInput)
                throw Error('Complete current actual household originals first.'); return captureGuidedPAMarriedResidencyOwner(originalInput, data, i); }, 'Current calendar owner original captured. Calendar and household confirmation remain required.')}>Capture {prefix} current taxpayer original</button>
 {field(prefix + ' actual residency status', [...q, 'status'], o.residency.status, [['', 'Unknown'], ['resident', 'Full-year PA resident'], ['nonresident', 'Nonresident'], ['part_year', 'Part-year resident']])}
 {field(prefix + ' calendar original source reference', [...q, 'sourceReference'], o.residency.sourceReference)}
 {o.residency.domicilePeriods.map((row, n) => <fieldset key={n}><legend>{prefix} domicile {n + 1}</legend>{field(prefix + ` domicile ${n + 1} actual state`, [...q, 'domicilePeriods', n, 'state'], row.state)}{field(prefix + ` domicile ${n + 1} actual from`, [...q, 'domicilePeriods', n, 'from'], row.from)}{field(prefix + ` domicile ${n + 1} actual through`, [...q, 'domicilePeriods', n, 'through'], row.through)}{field(prefix + ` domicile ${n + 1} actual days in PA`, [...q, 'domicilePeriods', n, 'daysInPA'], row.daysInPA, undefined, true)}<button type="button" onClick={() => edit([...q, 'domicilePeriods'], o.residency.domicilePeriods.filter((_, k) => k !== n))}>Remove {prefix} domicile {n + 1}</button></fieldset>)}
 <button type="button" onClick={() => edit([...q, 'domicilePeriods'], [...o.residency.domicilePeriods, emptyGuidedPAMarriedDomicilePeriod()])}>Add {prefix} actual domicile period</button>
 {(['paPermanentAbodePeriods', 'outsidePAPermanentAbodePeriods'] as const).map((key, j) => { const label = j === 0 ? 'PA abode' : 'outside PA abode'; return <div key={key}>{o.residency[key].map((row, n) => <fieldset key={n}><legend>{prefix} {label} {n + 1}</legend>{field(prefix + ` ${label} ${n + 1} actual from`, [...q, key, n, 'from'], row.from)}{field(prefix + ` ${label} ${n + 1} actual through`, [...q, key, n, 'through'], row.through)}<button type="button" onClick={() => edit([...q, key], o.residency[key].filter((_, k) => k !== n))}>Remove {prefix} {label} {n + 1}</button></fieldset>)}<button type="button" onClick={() => edit([...q, key], [...o.residency[key], emptyGuidedPAMarriedAbodePeriod()])}>Add {prefix} actual {label} period</button></div>; })}
 {field(prefix + ' actual move abandonment new domicile and presence confirmed', [...q, 'moveAbandonmentNewDomicileAndPresenceConfirmed'], o.residency.moveAbandonmentNewDomicileAndPresenceConfirmed, answers)}
 {field(prefix + ' actual December31 principal residence state', [...q, 'dec31PrincipalResidenceState'], o.residency.dec31PrincipalResidenceState)}{field(prefix + ' actual December31 school district code', [...q, 'schoolDistrictCode'], o.residency.schoolDistrictCode)}{field(prefix + ' actual December31 school district name', [...q, 'schoolDistrictName'], o.residency.schoolDistrictName)}{field(prefix + ' actual calendar records checked', [...q, 'factsConfirmed'], o.residency.factsConfirmed, answers)}
 <button type="button" onClick={() => edit(['owners'], d.owners.filter((_, k) => k !== i))}>Remove {prefix}</button></fieldset>;
        })}
 <button type="button" onClick={() => action(() => { if (!originalInput)
        throw Error('Complete current actual household originals first.'); return confirmGuidedPAMarriedResidency(originalInput, data); }, 'Actual separate spouse calendars confirmed. Confirm the household separately; mixed paper and filing remain unqualified.')}>Confirm actual separate spouse residency calendars after the last edit</button>
 <button type="button" onClick={() => { const { residencySources: _removed, ...rest } = data; onChange({ ...rest, sourceFactsConfirmed: null, ...(rest.paymentSources ? { paymentSources: { ...rest.paymentSources, sourceFactsConfirmed: null } } : {}) }); setStatus(''); }}>Remove actual separate spouse residency calendars</button>
 {status && <p role="status">{status}</p>}
 </section>;
}

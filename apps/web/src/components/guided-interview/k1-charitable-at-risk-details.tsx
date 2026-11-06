"use client";
import type { K1CharitableRiskData } from '@/lib/guided-k1-charitable-data';
import { BooleanFact, TextFact } from './fact-fields';
type Assignment = NonNullable<K1CharitableRiskData['activityAllocation']>;
export function K1CharitableAtRiskDetails({ prefix, data, onChange }: { prefix: string; data?: Assignment; onChange: (next: Assignment | undefined) => void }) {
    const change = (patch: Partial<Assignment>) => onChange({ ...data, ...patch });
    return <fieldset><legend>{prefix} actual activity assignment</legend>
        <p className="guided-hint">Current ordinary charitable gifts stay outside this activity list. Use the original records for separately reported historical activity deductions and other Form 6198 items. The return calculates the allowed and suspended amounts after basis. Entering an assignment does not establish that an unrelated gift belongs to the activity.</p>
        {data === undefined ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} activity assignment</button> : <>
            <div className="guided-form-grid">
                <TextFact label={`${prefix} activity assignment source year`} value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
                <TextFact label={`${prefix} activity assignment source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
                <BooleanFact label={`${prefix} activity assignment every original item belongs to this activity`} value={data.allOriginalItemsBelongToActivityConfirmed} onChange={allOriginalItemsBelongToActivityConfirmed => change({ allOriginalItemsBelongToActivityConfirmed })} />
                <BooleanFact label={`${prefix} activity assignment checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
            </div>
            {data.charitableSourceIds === undefined && <p role="status">The assigned original gift list is unknown.</p>}
            {data.charitableSourceIds?.length === 0 && <p>Explicitly recorded: no assigned gifts.</p>}
            {data.charitableSourceIds?.map((id, i) => <div className="guided-form-grid" key={i}>
                <TextFact label={`${prefix} assigned gift ${i + 1} original source ID`} value={id} onChange={next => change({ charitableSourceIds: data.charitableSourceIds?.map((value, n) => n === i ? next : value) })} />
                <button type="button" className="utility-button" onClick={() => change({ charitableSourceIds: data.charitableSourceIds?.filter((_, n) => n !== i) })}>Remove {prefix} assigned gift {i + 1}</button>
            </div>)}
            <button type="button" className="utility-button" onClick={() => change({ charitableSourceIds: [...(data.charitableSourceIds ?? []), ''] })}>Add {prefix} assigned gift</button>
            <button type="button" className="utility-button" onClick={() => change({ charitableSourceIds: [] })}>Record no {prefix} assigned gifts</button>
            <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} activity assignment</button>
        </>}
    </fieldset>;
}

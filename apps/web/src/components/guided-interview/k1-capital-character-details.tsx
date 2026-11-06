"use client";

import type { K1CharitableStatementData } from '@/lib/guided-k1-charitable-data';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type CapitalData = NonNullable<K1CharitableStatementData['capitalCharacter']>;
type Kind = 'text' | 'signed' | 'money' | 'boolean' | readonly (readonly [string, string])[];
type Field = readonly [string, string, Kind];
function Fields<T extends object>({ prefix, data, fields, onChange }: { prefix: string; data?: T; fields: readonly Field[]; onChange: (patch: Partial<T>) => void }) {
    const record = (data ?? {}) as Record<string, unknown>;
    return <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
        const label = `${prefix} ${name}`, value = record[key], change = (next: unknown) => onChange({ [key]: next } as Partial<T>);
        if (kind === 'boolean') return <BooleanFact key={key} label={label} value={value as boolean | null | undefined} onChange={change} />;
        if (kind === 'money' || kind === 'signed') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} allowNegative={kind === 'signed'} onChange={change} />;
        if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
        return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
            <option value="">Choose from actual records</option>
            {typeof value === 'string' && value && !kind.some(([code]) => code === value) && <option value={value}>Saved source: {value}</option>}
            {kind.map(([code, title]) => <option key={code} value={code}>{title}</option>)}
        </select></label>;
    })}</div>;
}
const character = [['portfolio', 'Portfolio capital item'], ['passive_activity', 'Capital item from this passive activity']] as const;
export function K1CapitalCharacterDetails({ prefix: parent, data, onChange }: { prefix: string; data?: CapitalData; onChange: (data: CapitalData | undefined) => void }) {
    const prefix = `${parent} capital character`, change = (patch: Partial<CapitalData>) => onChange({ ...data, ...patch });
    if (!data) return <div><p className="guided-hint">If this passive K-1 includes capital items, copy their original character and separate prior capital-loss records.</p>
        <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} sources</button></div>;
    return <fieldset className="guided-w2-card"><legend>{prefix} sources</legend>
        <p className="guided-hint">A passive activity answer does not identify a capital item as passive. Use the original statements and filed loss worksheets. Enter zero only when the records establish zero.</p>
        <Fields prefix={prefix} data={data} fields={[
            ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'source reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean'],
            ['accountHolder', 'owner', [['primary', 'Primary taxpayer'], ['spouse', 'Spouse on the actual joint return']]],
            ['entityName', 'entity name', 'text'], ['entityEIN', 'entity EIN', 'text'],
            ['allCapitalItemsIncludedConfirmed', 'all original capital items included', 'boolean'],
            ['ordinaryCapitalTreatmentConfirmed', 'only ordinary short-term and long-term treatment, without special-rate items', 'boolean'],
            ['samePassiveActivityConfirmed', 'same passive activity established', 'boolean'],
        ]} onChange={change} />
        {(['currentShortTerm', 'currentLongTerm'] as const).map((key, index) => <fieldset key={key}><legend>{index ? 'Long-term' : 'Short-term'} original</legend>
            <Fields prefix={`${prefix} ${index ? 'long-term' : 'short-term'}`} data={data[key]} fields={[
                ['originalAmount', 'original amount', 'signed'], ['character', 'original treatment', character], ['sourceReference', 'original statement reference', 'text'],
            ]} onChange={patch => change({ [key]: { ...data[key], ...patch } })} />
        </fieldset>)}
        <fieldset><legend>{prefix} prior passive capital balances</legend>
            <Fields prefix={`${prefix} prior passive`} data={data.priorPassiveCapital} fields={[
                ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'source reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean'],
                ['sameOwnerAndActivityConfirmed', 'same owner and activity established', 'boolean'], ['shortTermLoss', 'short-term loss', 'money'], ['longTermLoss', 'long-term loss', 'money'],
            ]} onChange={patch => change({ priorPassiveCapital: { ...data.priorPassiveCapital, ...patch } })} />
        </fieldset>
        <p className="guided-hint">Each earlier at-risk capital record uses its original source ID from the separate history above. Its original character is independent of this year's capital items.</p>
        {data.priorAtRiskCapital === undefined && <p role="status">The prior at-risk capital record list is unknown.</p>}
        {data.priorAtRiskCapital?.length === 0 && <p>Explicitly recorded: no prior at-risk capital records.</p>}
        {data.priorAtRiskCapital?.map((row, index) => <fieldset key={index}><legend>{prefix} prior at-risk record {index + 1}</legend>
            <Fields prefix={`${prefix} prior at-risk record ${index + 1}`} data={row} fields={[
                ['sourceId', 'source ID', 'text'], ['character', 'original treatment', character], ['sourceReference', 'original statement reference', 'text'],
            ]} onChange={patch => change({ priorAtRiskCapital: data.priorAtRiskCapital?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
            <button type="button" className="utility-button" onClick={() => change({ priorAtRiskCapital: data.priorAtRiskCapital?.filter((_, i) => i !== index) })}>Remove {prefix} prior at-risk record {index + 1}</button>
        </fieldset>)}
        <button type="button" className="utility-button" onClick={() => change({ priorAtRiskCapital: [...(data.priorAtRiskCapital ?? []), {}] })}>Add {prefix} prior at-risk capital record</button>
        <button type="button" className="utility-button" onClick={() => change({ priorAtRiskCapital: [] })}>Record no {prefix} prior at-risk capital records</button>
        <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} sources</button>
    </fieldset>;
}

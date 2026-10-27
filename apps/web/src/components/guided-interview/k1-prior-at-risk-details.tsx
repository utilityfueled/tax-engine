"use client";

import type { K1CharitableRiskData } from '@/lib/guided-k1-charitable-data';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type History = NonNullable<NonNullable<K1CharitableRiskData['priorLossHistory']>['characterSources']>;
type RecordSource = NonNullable<History['records']>[number];
type Field = readonly [string, string, 'text' | 'money' | 'boolean' | readonly (readonly [string, string])[]];
function Fields<T extends object>({ prefix, data, fields, onChange }: { prefix: string; data?: T; fields: readonly Field[]; onChange: (patch: Partial<T>) => void }) {
    const record = (data ?? {}) as Record<string, unknown>;
    return <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
        const label = `${prefix} ${name}`, value = record[key], change = (next: unknown) => onChange({ [key]: next } as Partial<T>);
        if (kind === 'boolean') return <BooleanFact key={key} label={label} value={value as boolean | null | undefined} onChange={change} />;
        if (kind === 'money') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
        if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
        return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
            <option value="">Choose from actual records</option>
            {typeof value === 'string' && value && !kind.some(([code]) => code === value) && <option value={value}>Saved source: {value}</option>}
            {kind.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
        </select></label>;
    })}</div>;
}
const categories = [['cash_60', 'Cash — code A'], ['capital_gain_30', 'Capital gain property — code E'], ['capital_gain_20', 'Capital gain property — code F']] as const;

function Gift({ prefix, data, onChange }: { prefix: string; data?: RecordSource['gift']; onChange: (next: RecordSource['gift']) => void }) {
    if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} original gift</button>;
    return <fieldset><legend>{prefix} original gift</legend>
        <Fields prefix={`${prefix} gift`} data={data} fields={[
            ['basisSourceId', 'original basis source ID', 'text'], ['basisOriginTaxYear', 'original basis year', 'text'], ['category', 'original category', categories],
            ['contributionShare', 'original contribution share', 'money'], ['adjustedBasisShare', 'original adjusted basis share', 'money'],
        ]} onChange={patch => onChange({ ...data, ...patch })} />
        <Fields prefix={`${prefix} receipt`} data={data.receipt} fields={[
            ['basisSourceId', 'original basis source ID', 'text'], ['originalBox', 'original box', [['12', 'S corporation box 12'], ['13', 'Partnership box 13']]],
            ['originalCode', 'original code', [['A', 'A — cash'], ['E', 'E — capital gain property 30%'], ['F', 'F — capital gain property 20%']]],
            ['recipientName', 'charitable recipient name', 'text'], ['recipientCategory', 'recipient classification', [['fifty-percent', 'Public charity or qualifying operating foundation'], ['private-nonoperating', 'Private nonoperating foundation'], ['other-thirty-percent', 'Other qualified 30% recipient']]],
            ['qualifiedOrganization', 'qualified organization', 'boolean'], ['donorAdvisedFund', 'donor-advised fund', 'boolean'], ['supportingOrganization', 'supporting organization', 'boolean'],
            ['sourceReference', 'source reference', 'text'], ['contributionDate', 'actual contribution date', 'text'],
            ['propertyType', 'property type', [['appreciated_stock', 'Appreciated stock'], ['other_property', 'Other property — separate method']]],
            ['acquisitionDate', 'actual acquisition date', 'text'], ['fairMarketValueShare', 'original fair market value share', 'money'], ['qualifiedAppreciatedStock', 'qualified appreciated stock', 'boolean'],
        ]} onChange={patch => onChange({ ...data, receipt: { ...data.receipt, ...patch } })} />
        <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} original gift</button>
    </fieldset>;
}

export function K1PriorAtRiskDetails({ prefix, data, onChange }: { prefix: string; data?: History; onChange: (next: History | undefined) => void }) {
    if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} sources</button>;
    const change = (patch: Partial<History>) => onChange({ ...data, ...patch });
    return <fieldset><legend>{prefix} sources</legend>
        <p className="guided-hint">Use the original deductions after the basis limitation and each later year's actual at-risk use. Keep a still-suspended basis amount separate. A charitable record also needs its original gift and receipt; its payment year is not replaced by the at-risk suspension year.</p>
        <Fields prefix={prefix} data={data} fields={[
            ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'source reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean'],
            ['sameOwnerAndActivityConfirmed', 'same owner and continuing activity', 'boolean'], ['recipientName', 'taxpayer name', 'text'], ['recipientTaxpayerIdLast4', 'taxpayer SSN last four', 'text'],
            ['entityName', 'entity name', 'text'], ['entityEIN', 'entity EIN', 'text'],
        ]} onChange={change} />
        {data.records === undefined && <p role="status">The original deduction history is unknown.</p>}
        {data.records?.length === 0 && <p>Explicitly recorded: no prior deduction records.</p>}
        {data.records?.map((row, index) => {
            const label = `${prefix} deduction ${index + 1}`;
            const update = (patch: Partial<RecordSource>) => change({ records: data.records?.map((value, i) => i === index ? { ...value, ...patch } : value) });
            return <details className="guided-expand" key={index}><summary className="guided-expand-trigger">{label}</summary><div className="guided-expand-body">
                <Fields prefix={label} data={row} fields={[
                    ['sourceId', 'original source ID', 'text'], ['taxYear', 'at-risk suspension year', 'text'], ['sourceReference', 'source reference', 'text'],
                    ['character', 'original character', [['ordinary', 'Ordinary deduction'], ['short_term_capital', 'Short-term capital loss'], ['long_term_capital', 'Long-term capital loss'], ['charitable', 'Charitable contribution']]],
                    ['basisLimitationAlreadyAppliedConfirmed', 'basis limitation already applied', 'boolean'], ['originalPostBasisDeduction', 'original deduction after basis', 'money'], ['originalDisallowedAmount', 'original at-risk disallowance', 'money'],
                ]} onChange={update} />
                <p className="guided-hint">Record each year after the suspension through the preceding year, including actual zero use.</p>
                {row.useHistory === undefined && <p role="status">The annual use history is unknown.</p>}
                {row.useHistory?.length === 0 && <p>Explicitly recorded: no intervening use years.</p>}
                {row.useHistory?.map((use, i) => <div key={i}><Fields prefix={`${label} use ${i + 1}`} data={use} fields={[
                    ['taxYear', 'tax year', 'text'], ['amountAllowed', 'amount allowed', 'money'],
                ]} onChange={patch => update({ useHistory: row.useHistory?.map((value, n) => n === i ? { ...value, ...patch } : value) })} />
                    <button type="button" className="utility-button" onClick={() => update({ useHistory: row.useHistory?.filter((_, n) => n !== i) })}>Remove {label} use {i + 1}</button></div>)}
                <button type="button" className="utility-button" onClick={() => update({ useHistory: [...(row.useHistory ?? []), {}] })}>Add {label} use year</button>
                <button type="button" className="utility-button" onClick={() => update({ useHistory: [] })}>Record no {label} use years</button>
                <Gift prefix={label} data={row.gift} onChange={gift => update({ gift })} />
                <button type="button" className="utility-button" onClick={() => change({ records: data.records?.filter((_, i) => i !== index) })}>Remove {label}</button>
            </div></details>;
        })}
        <button type="button" className="utility-button" onClick={() => change({ records: [...(data.records ?? []), {}] })}>Add {prefix} original deduction</button>
        <button type="button" className="utility-button" onClick={() => change({ records: [] })}>Record no {prefix} original deductions</button>
        <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} sources</button>
    </fieldset>;
}

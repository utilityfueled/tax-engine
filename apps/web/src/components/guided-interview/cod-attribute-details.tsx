"use client";

import type { CodAttributeData, CodAttributeLedgerData, CodAttributePropertyData, CodAttributeRecordData } from '@/lib/guided-cod-attributes';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type Field<T> = { key: keyof T & string; label: string; type?: 'money' | 'boolean' | 'date'; options?: [string, string][] };
function Fields<T extends object>({ data, fields, prefix, onChange }: { data: T; fields: Field<T>[]; prefix: string; onChange: (patch: Partial<T>) => void }) {
  return <div className="guided-form-grid">{fields.map(field => {
    const value = data[field.key], label = `${prefix} ${field.label}`.trim();
    const change = (next: unknown) => onChange({ [field.key]: next } as Partial<T>);
    if (field.type === 'boolean') return <BooleanFact key={field.key} label={label} value={typeof value === 'boolean' ? value : null} onChange={change} />;
    const text = typeof value === 'string' ? value : '';
    if (field.type === 'money') return <CurrencyField key={field.key} label={label} value={text} onChange={change} />;
    if (field.options) return <label className="guided-field" key={field.key}><span className="guided-field-label">{label}</span>
      <select className="guided-input" value={text} onChange={event => change(event.target.value || undefined)}>
        <option value="">Choose from actual records</option>
        {text && !field.options.some(([key]) => key === text) && <option value={text}>Unmatched original record: {text}</option>}
        {field.options.map(([key, description]) => <option key={key} value={key}>{description}</option>)}
      </select></label>;
    return <TextFact key={field.key} label={label} type={field.type === 'date' ? 'date' : undefined} value={text} onChange={change} />;
  })}</div>;
}
const confirmation = <T extends { sourceFactsConfirmed?: boolean | null }>(prefix: string, data: T, onChange: (patch: Partial<T>) => void) =>
  <BooleanFact label={`${prefix} sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed } as Partial<T>)} />;
const kinds: [string, string][] = [
  ['general_business_credit', 'General business credit'], ['minimum_tax_credit', 'Minimum tax credit'], ['capital_loss', 'Capital loss'],
  ['passive_loss', 'Passive activity loss'], ['passive_credit', 'Passive activity credit'], ['foreign_tax_credit', 'Foreign tax credit'],
];
function AttributeRecord({ data, prefix, onChange, alternative }: { data: CodAttributeRecordData; prefix: string; onChange: (patch: Partial<CodAttributeRecordData>) => void; alternative: boolean }) {
  return <>
    <Fields data={data} prefix={prefix} onChange={onChange} fields={[
      { key: 'sourceId', label: 'original source ID' }, { key: 'kind', label: 'kind', options: alternative ? kinds.filter(([key]) => !['general_business_credit', 'minimum_tax_credit', 'passive_credit'].includes(key)) : kinds },
      { key: 'originTaxYear', label: 'original tax year' }, { key: 'sourceReference', label: 'original record reference' },
      { key: 'originalAmount', label: 'original amount', type: 'money' },
      { key: 'originalAmountMeaning', label: 'original amount meaning', options: [['original_year_closing_carry', 'Prior original-year unused closing carry'], ['current_year_before_use', 'Current-year attribute before use']] },
      { key: 'term', label: 'capital loss term', options: [['short', 'Short term'], ['long', 'Long term']] },
      { key: 'activityName', label: 'original passive activity name' }, { key: 'creditKind', label: 'original credit type' },
      { key: 'foreignCategory', label: 'foreign credit category', options: [['general', 'General'], ['passive', 'Passive']] },
      { key: 'currentYearUse', label: 'current-year use', type: 'money' }, { key: 'currentYearCarryback', label: 'current-year carryback', type: 'money' },
      { key: 'currentYearExpired', label: 'current-year expiry before this reduction', type: 'money' },
      { key: 'currentYearUseSourceReference', label: 'current use worksheet reference' }, { key: 'allHistoryIncluded', label: 'includes every intervening filed year', type: 'boolean' },
    ]} />
    <fieldset style={{ minWidth: 0 }}><legend>{prefix} filed history</legend>
      {data.history === undefined && <p role="status">The filed-history list is unknown.</p>}
      {data.history?.length === 0 && <p>Explicitly recorded: no intervening years.</p>}
      {(data.history ?? []).map((row, index) => <div className="guided-w2-card" key={index}>
        <Fields data={row} prefix={`${prefix} history ${index + 1}`} fields={[
          { key: 'taxYear', label: 'tax year' }, { key: 'sourceReference', label: 'filed record reference' },
          { key: 'used', label: 'actual use', type: 'money' }, { key: 'reduced', label: 'actual attribute reduction', type: 'money' }, { key: 'expired', label: 'actual expiry', type: 'money' },
        ]} onChange={patch => onChange({ history: data.history?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
        <button type="button" className="utility-button" onClick={() => onChange({ history: data.history?.filter((_, i) => i !== index) })}>Remove {prefix.toLowerCase()} history {index + 1}</button>
      </div>)}
      <button type="button" className="utility-button" onClick={() => onChange({ history: [...(data.history ?? []), {}] })}>Add {prefix.toLowerCase()} filed year</button>
      <button type="button" className="utility-button" onClick={() => onChange({ history: [] })}>Record no {prefix.toLowerCase()} intervening years</button>
    </fieldset>
    {confirmation(prefix, data, onChange)}
  </>;
}
function Properties({ data, prefix, onChange }: { data?: CodAttributePropertyData[]; prefix: string; onChange: (next: CodAttributePropertyData[]) => void }) {
  return <fieldset style={{ minWidth: 0 }}><legend>{prefix} property</legend>
    {data === undefined && <p role="status">The property list is unknown.</p>}
    {data?.length === 0 && <p>Explicitly recorded: no property.</p>}
    {(data ?? []).map((row, index) => {
      const label = `${prefix} property ${index + 1}`;
      const change = (patch: Partial<CodAttributePropertyData>) => onChange(data!.map((value, i) => i === index ? { ...value, ...patch } : value));
      return <div className="guided-w2-card" key={index}>
        <Fields data={row} prefix={label} onChange={change} fields={[
          { key: 'propertyId', label: 'original ID' }, { key: 'description', label: 'description' }, { key: 'adjustedBasis', label: 'adjusted tax basis', type: 'money' },
          { key: 'category', label: 'property category', options: [['other_business', 'Trade or business / investment property'], ['inventory', 'Inventory or property held for sale'], ['personal', 'Personal property']] },
          { key: 'acquiredDate', label: 'actual acquisition date', type: 'date' }, { key: 'sourceReference', label: 'basis record reference' },
          { key: 'securedDischargedDebt', label: 'secured the discharged debt', type: 'boolean' }, { key: 'priorSnapshotChangeReference', label: 'record reconciling the two dates' },
        ]} />
        {confirmation(label, row, change)}
        <button type="button" className="utility-button" onClick={() => onChange(data!.filter((_, i) => i !== index))}>Remove {label.toLowerCase()}</button>
      </div>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add {prefix.toLowerCase()} property</button>
    <button type="button" className="utility-button" onClick={() => onChange([])}>Record no {prefix.toLowerCase()} property</button>
  </fieldset>;
}
function Ledger({ data, prefix, onChange, alternative }: { data: CodAttributeLedgerData; prefix: string; onChange: (patch: Partial<CodAttributeLedgerData>) => void; alternative: boolean }) {
  const property = (patch: Partial<NonNullable<CodAttributeLedgerData['property']>>) => onChange({ property: { ...data.property, ...patch } });
  const after = data.property?.immediatelyAfter, next = data.property?.followingYear;
  const changeAfter = (patch: Partial<NonNullable<typeof after>>) => property({ immediatelyAfter: { ...after, ...patch } });
  const changeNext = (patch: Partial<NonNullable<typeof next>>) => property({ followingYear: { ...next, ...patch } });
  return <fieldset style={{ minWidth: 0 }}><legend>{prefix} attribute ledger</legend>
    {alternative && <p className="guided-hint">Use the separate AMT loss, foreign-credit and basis records. Shared general business, minimum tax and passive credits are entered once in the regular ledger.</p>}
    <Fields data={data} prefix={prefix} onChange={onChange} fields={[
      { key: 'sourceReference', label: 'complete ledger reference' }, { key: 'allAttributesIncluded', label: 'all attributes included', type: 'boolean' },
    ]} />
    {data.records === undefined && <p role="status">The {prefix.toLowerCase()} attribute list is unknown.</p>}
    {data.records?.length === 0 && <p>Explicitly recorded: no {prefix.toLowerCase()} attributes.</p>}
    {(data.records ?? []).map((row, index) => <fieldset key={index} style={{ minWidth: 0 }}><legend>{prefix} attribute {index + 1}</legend>
      <AttributeRecord data={row} prefix={`${prefix} attribute ${index + 1}`} alternative={alternative}
        onChange={patch => onChange({ records: data.records?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => onChange({ records: data.records?.filter((_, i) => i !== index) })}>Remove {prefix.toLowerCase()} attribute {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => onChange({ records: [...(data.records ?? []), {}] })}>Add {prefix.toLowerCase()} attribute</button>
    <button type="button" className="utility-button" onClick={() => onChange({ records: [] })}>Record no {prefix.toLowerCase()} attributes</button>
    {!after ? <button type="button" className="utility-button" onClick={() => changeAfter({})}>Add {prefix.toLowerCase()} immediately-after inventory</button> : <fieldset style={{ minWidth: 0 }}><legend>{prefix} immediately after discharge</legend>
      <Fields data={after} prefix={`${prefix} immediately after`} onChange={changeAfter} fields={[
        { key: 'asOfDate', label: 'date', type: 'date' }, { key: 'sourceReference', label: 'inventory reference' }, { key: 'money', label: 'money', type: 'money' },
        { key: 'allPropertyAndMoneyIncluded', label: 'all property and money included', type: 'boolean' }, { key: 'allLiabilitiesIncluded', label: 'all remaining liabilities included', type: 'boolean' },
      ]} />
      <Properties data={after.properties} prefix={`${prefix} immediately after`} onChange={properties => changeAfter({ properties })} />
      <fieldset style={{ minWidth: 0 }}><legend>{prefix} remaining liabilities</legend>
        {after.liabilities === undefined && <p role="status">The remaining-liability list is unknown.</p>}
        {after.liabilities?.length === 0 && <p>Explicitly recorded: no remaining liabilities.</p>}
        {(after.liabilities ?? []).map((row, index) => <div className="guided-w2-card" key={index}>
          <Fields data={row} prefix={`${prefix} remaining liability ${index + 1}`} fields={[
            { key: 'sourceId', label: 'source ID' }, { key: 'amount', label: 'actual balance', type: 'money' }, { key: 'sourceReference', label: 'record reference' },
          ]} onChange={patch => changeAfter({ liabilities: after.liabilities?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
          <button type="button" className="utility-button" onClick={() => changeAfter({ liabilities: after.liabilities?.filter((_, i) => i !== index) })}>Remove {prefix.toLowerCase()} remaining liability {index + 1}</button>
        </div>)}
        <button type="button" className="utility-button" onClick={() => changeAfter({ liabilities: [...(after.liabilities ?? []), {}] })}>Add {prefix.toLowerCase()} remaining liability</button>
        <button type="button" className="utility-button" onClick={() => changeAfter({ liabilities: [] })}>Record no {prefix.toLowerCase()} remaining liabilities</button>
      </fieldset>
      {confirmation(`${prefix} immediately-after inventory`, after, changeAfter)}
    </fieldset>}
    {!next ? <button type="button" className="utility-button" onClick={() => changeNext({})}>Add {prefix.toLowerCase()} following-year inventory</button> : <fieldset style={{ minWidth: 0 }}><legend>{prefix} following January 1</legend>
      <Fields data={next} prefix={`${prefix} following year`} onChange={changeNext} fields={[
        { key: 'asOfDate', label: 'date', type: 'date' }, { key: 'sourceReference', label: 'inventory reference' }, { key: 'allPropertyIncluded', label: 'all property included', type: 'boolean' },
      ]} />
      <Properties data={next.properties} prefix={`${prefix} following year`} onChange={properties => changeNext({ properties })} />
      <fieldset style={{ minWidth: 0 }}><legend>{prefix} intervening dispositions</legend>
        <p className="guided-hint">A property disposed of after cancellation also needs its actual current-return sale and recapture calculation. A date or reference alone does not establish that tax result.</p>
        {next.dispositions === undefined && <p role="status">The disposition list is unknown.</p>}
        {next.dispositions?.length === 0 && <p>Explicitly recorded: no intervening dispositions.</p>}
        {(next.dispositions ?? []).map((row, index) => {
          const change = (patch: Partial<typeof row>) => changeNext({ dispositions: next.dispositions?.map((value, i) => i === index ? { ...value, ...patch } : value) });
          return <div className="guided-w2-card" key={index}><Fields data={row} prefix={`${prefix} disposition ${index + 1}`} onChange={change} fields={[
            { key: 'propertyId', label: 'original property ID' }, { key: 'disposedDate', label: 'actual date', type: 'date' }, { key: 'sourceReference', label: 'record reference' },
          ]} />{confirmation(`${prefix} disposition ${index + 1}`, row, change)}
            <button type="button" className="utility-button" onClick={() => changeNext({ dispositions: next.dispositions?.filter((_, i) => i !== index) })}>Remove {prefix.toLowerCase()} disposition {index + 1}</button>
          </div>;
        })}
        <button type="button" className="utility-button" onClick={() => changeNext({ dispositions: [...(next.dispositions ?? []), {}] })}>Add {prefix.toLowerCase()} disposition</button>
        <button type="button" className="utility-button" onClick={() => changeNext({ dispositions: [] })}>Record no {prefix.toLowerCase()} dispositions</button>
      </fieldset>
      {confirmation(`${prefix} following-year inventory`, next, changeNext)}
    </fieldset>}
    {confirmation(`${prefix} attribute ledger`, data, onChange)}
  </fieldset>;
}
export function CodAttributeDetails({ data, onChange }: { data?: CodAttributeData; onChange: (next: CodAttributeData | undefined) => void }) {
  const change = (patch: Partial<CodAttributeData>) => onChange({ ...data, ...patch });
  return <details className="guided-expand"><summary className="guided-expand-trigger">Later tax attributes and property basis</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original unused credit and loss histories and both property inventories. The return calculates current use and reconciles the supplied worksheets before applying canceled debt. Enter the original balances, not a proposed reduced balance.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add later-attribute sources</button> : <>
      <Fields data={data} prefix="Later attributes" onChange={change} fields={[
        { key: 'sourceTaxYear', label: 'source tax year' }, { key: 'sourceReference', label: 'complete packet reference' },
        { key: 'taxpayerName', label: 'original taxpayer name' }, { key: 'taxpayerIdLast4', label: 'taxpayer ID last four' },
        { key: 'accountHolder', label: 'owner', options: [['primary', 'Primary taxpayer'], ['spouse', 'Spouse']] },
        { key: 'dischargeDate', label: 'discharge date', type: 'date' }, { key: 'allAttributesIncluded', label: 'all attributes included', type: 'boolean' },
      ]} />
      {!data.currentMinimumTaxCredit ? <button type="button" className="utility-button" onClick={() => change({ currentMinimumTaxCredit: {} })}>Add current regular and AMT adjustment sources</button>
        : <fieldset style={{ minWidth: 0 }}><legend>Current regular and AMT adjustment sources</legend>
          <p className="guided-hint">These answers identify the complete source records. The return checks whether it has the required current-year minimum tax credit calculation; an empty credit list does not prove that amount is zero.</p>
          <Fields data={data.currentMinimumTaxCredit} prefix="Current adjustments" onChange={patch => change({ currentMinimumTaxCredit: { ...data.currentMinimumTaxCredit, ...patch } })} fields={[
            { key: 'sourceReference', label: 'source reference' }, { key: 'allCurrentAdjustmentSourcesIncluded', label: 'all current regular and AMT sources included', type: 'boolean' },
            { key: 'noAdditionalDeferralItemsConfirmed', label: 'no additional unreported deferral items', type: 'boolean' },
            { key: 'sourceFactsConfirmed', label: 'sources checked after the last edit', type: 'boolean' },
          ]} />
        </fieldset>}
      {(['regular', 'alternativeTax'] as const).map(key => {
        const label = key === 'regular' ? 'Regular' : 'Alternative';
        return data[key] ? <Ledger key={key} prefix={label} alternative={key === 'alternativeTax'} data={data[key]!} onChange={patch => change({ [key]: { ...data[key], ...patch } })} />
          : <button key={key} type="button" className="utility-button" onClick={() => change({ [key]: {} })}>Add {label.toLowerCase()} attribute ledger</button>;
      })}
      <BooleanFact label="Later-attribute packet checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove later-attribute sources</button>
    </>}
  </div></details>;
}

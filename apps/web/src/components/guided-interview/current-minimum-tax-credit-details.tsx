"use client";

import { updateGuidedCurrentMtcSources, type CurrentMtcData } from '@/lib/guided-current-minimum-tax-credit';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

// Preserve semantic groups without repeatedly narrowing signed inputs on mobile.
const sourceGroupStyle = { minWidth: 0, marginInline: 0, paddingInline: 0, border: 0 } as const;

type Field<T> = { key: keyof T & string; label: string; kind?: 'money' | 'boolean'; options?: [string, string][] };
function Fields<T extends object>({ data, fields, prefix, onChange }: { data: T; fields: Field<T>[]; prefix: string; onChange: (patch: Partial<T>) => void }) {
  return <div className="guided-form-grid">{fields.map(field => {
    const value = data[field.key], label = `${prefix} ${field.label}`, change = (next: unknown) => onChange({ [field.key]: next } as Partial<T>);
    if (field.kind === 'boolean') return <BooleanFact key={field.key} label={label} value={typeof value === 'boolean' ? value : null} onChange={change} />;
    const text = typeof value === 'string' ? value : '';
    if (field.kind === 'money') return <CurrencyField key={field.key} label={label} value={text} allowNegative onChange={change} />;
    if (field.options) return <label className="guided-field" key={field.key}><span className="guided-field-label">{label}</span>
      <select className="guided-input" value={text} onChange={event => change(event.target.value || undefined)}>
        <option value="">Choose from actual records</option>
        {text && !field.options.some(([key]) => key === text) && <option value={text}>Unmatched original: {text}</option>}
        {field.options.map(([key, description]) => <option key={key} value={key}>{description}</option>)}
      </select></label>;
    return <TextFact key={field.key} label={label} value={text} onChange={change} />;
  })}</div>;
}
const reference = [
  { key: 'sourceTaxYear', label: 'source tax year' }, { key: 'sourceReference', label: 'source reference' },
  { key: 'sourceFactsConfirmed', label: 'sources checked after the last edit', kind: 'boolean' },
] as const;
function Inventory({ rows, label, onChange }: { rows?: unknown[]; label: string; onChange: (rows: unknown[]) => void }) {
  return <div>{rows === undefined ? <p role="status">The {label} inventory is unknown.</p>
    : rows.length ? <p role="status">Retained {rows.length} {label} records require their separate source calculation.</p> : <p>Explicitly recorded: no {label}.</p>}
    <button type="button" className="utility-button" onClick={() => onChange([])}>Record no {label}</button></div>;
}
export function CurrentMinimumTaxCreditDetails({ data, onChange }: { data?: CurrentMtcData; onChange: (next: CurrentMtcData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add signed current-year minimum-tax sources</button>;
  const change = (patch: Partial<CurrentMtcData>) => onChange(updateGuidedCurrentMtcSources(data, patch));
  const nol = data.minimumTaxCreditNolHistory, foreign = data.exclusionOnlyForeignHistory;
  return <fieldset style={sourceGroupStyle}><legend>Signed current-year minimum-tax sources</legend>
    <p className="guided-hint">Enter the actual current exclusion and deferral statements. Current credit use remains on the prior-return worksheet. These originals determine the credit available for the following year.</p>
    <Fields data={data} prefix="Current MTC" onChange={change} fields={[
      ...reference, { key: 'taxpayerName', label: 'taxpayer name on originals' }, { key: 'taxpayerIdLast4', label: 'taxpayer ID last four' },
      { key: 'filingStatus', label: 'actual filing status', options: [['single', 'Single'], ['married_filing_jointly', 'Married filing jointly'], ['married_filing_separately', 'Married filing separately'], ['head_of_household', 'Head of household'], ['qualifying_surviving_spouse', 'Qualifying surviving spouse']] },
      { key: 'allAdjustmentSourcesIncluded', label: 'all current adjustment originals included', kind: 'boolean' },
      { key: 'filedForm2555', label: 'Form 2555 applies', kind: 'boolean' }, { key: 'filedForm1040NR', label: 'Form 1040-NR applies', kind: 'boolean' },
      { key: 'capitalGainsRequired', label: 'capital-gain worksheet required', kind: 'boolean' },
      { key: 'unallowedQualifiedElectricVehicleCredit', label: 'unallowed legacy electric-vehicle credit', kind: 'money' },
    ]} />
    {data.k1Statements === undefined && <p role="status">The current K1 statement inventory is unknown.</p>}
    {(data.k1Statements ?? []).map((row, index) => {
      const label = `Current MTC K1 statement ${index + 1}`, patch = (value: Partial<typeof row>) => change({ k1Statements: data.k1Statements!.map((item, i) => i === index ? { ...item, ...value } : item) });
      return <fieldset key={index} style={sourceGroupStyle}><legend>{label}</legend>
        <Fields data={row} prefix={label} onChange={patch} fields={[
          ...reference, { key: 'sourceId', label: 'original source ID' }, { key: 'entityName', label: 'entity name' }, { key: 'entityEin', label: 'entity EIN' },
          { key: 'accountHolder', label: 'actual owner', options: [['primary', 'Primary taxpayer'], ['spouse', 'Spouse']] },
          { key: 'depreciationAdjustment', label: 'depreciation adjustment', kind: 'money' }, { key: 'dispositionAdjustment', label: 'disposition adjustment', kind: 'money' },
          { key: 'depletionAdjustment', label: 'depletion adjustment', kind: 'money' }, { key: 'otherAdjustment', label: 'other adjustment', kind: 'money' },
        ]} />
        <Fields data={row.standaloneOriginal ?? {}} prefix={label} onChange={value => patch({ standaloneOriginal: { ...row.standaloneOriginal, ...value } })} fields={[
          { key: 'sourceReference', label: 'complete original reference' }, { key: 'entityType', label: 'entity type', options: [['partnership', 'Partnership'], ['s_corporation', 'S corporation']] },
          { key: 'allOtherAmountsZeroConfirmed', label: 'all other original amounts are zero', kind: 'boolean' },
          { key: 'domesticContinuingNonPtpConfirmed', label: 'domestic continuing non-PTP original', kind: 'boolean' },
          { key: 'isPassiveActivity', label: 'passive activity', kind: 'boolean' },
        ]} />
        <button type="button" className="utility-button" onClick={() => change({ k1Statements: data.k1Statements!.filter((_, i) => i !== index) })}>Remove {label.toLowerCase()}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ k1Statements: [...(data.k1Statements ?? []), {}] })}>Add current MTC K1 statement</button>
    {data.k1Statements?.length === 0 && <p>Explicitly recorded: no current MTC K1 statements.</p>}
    <button type="button" className="utility-button" onClick={() => change({ k1Statements: [] })}>Record no current MTC K1 statements</button>
    <Inventory rows={data.trustStatements} label="current MTC trust statements" onChange={rows => change({ trustStatements: rows as CurrentMtcData['trustStatements'] })} />
    {!nol ? <button type="button" className="utility-button" onClick={() => change({ minimumTaxCreditNolHistory: {} })}>Add independent current MTC NOL history</button>
      : <fieldset style={sourceGroupStyle}><legend>Independent current MTC NOL history</legend>
        <Fields data={nol} prefix="Current MTC NOL" onChange={patch => change({ minimumTaxCreditNolHistory: { ...nol, ...patch } })} fields={[...reference,
          { key: 'allCarryoversAndCarrybacksIncluded', label: 'all carryovers and carrybacks included', kind: 'boolean' }]} />
        {(['carryoverSources', 'carrybackSources'] as const).map(key => <Inventory key={key} rows={nol[key]} label={`current MTC NOL ${key === 'carryoverSources' ? 'carryovers' : 'carrybacks'}`}
          onChange={rows => change({ minimumTaxCreditNolHistory: { ...nol, [key]: rows } })} />)}
      </fieldset>}
    {!foreign ? <button type="button" className="utility-button" onClick={() => change({ exclusionOnlyForeignHistory: {} })}>Add independent exclusion-only foreign history</button>
      : <fieldset style={sourceGroupStyle}><legend>Independent exclusion-only foreign history</legend>
        <Fields data={foreign} prefix="Current exclusion-only foreign" onChange={patch => change({ exclusionOnlyForeignHistory: { ...foreign, ...patch } })} fields={[...reference,
          { key: 'allCurrentAndHistoricalSourcesIncluded', label: 'all current and historical sources included', kind: 'boolean' }]} />
        {(['currentSources', 'carryoverSources', 'carrybackSources'] as const).map(key => <Inventory key={key} rows={foreign[key]}
          label={`exclusion-only foreign ${key === 'currentSources' ? 'current sources' : key === 'carryoverSources' ? 'carryovers' : 'carrybacks'}`}
          onChange={rows => change({ exclusionOnlyForeignHistory: { ...foreign, [key]: rows } })} />)}
      </fieldset>}
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove signed current-year minimum-tax sources</button>
  </fieldset>;
}

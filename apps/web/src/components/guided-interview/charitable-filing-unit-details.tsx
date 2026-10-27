"use client";
import type { CharitableFilingUnitHistoryData, CharitableCarryoverVintageData, CharitableCarryoverHistoryData } from '@/lib/guided-charitable-carryover';
import { TextFact, BooleanFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function SourceChoice({ label, value, options, onChange }: { label: string; value?: string; options: Array<[string, string]>; onChange: (value: string | undefined) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
    <option value="">Choose from actual records</option>
    {value && !options.some(([id]) => id === value) && <option value={value}>Saved source: {value}</option>}
    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select></label>;
}
// Nested source groups keep their semantics without another layer of narrow padding.
const nestedSourceStyle = { border: 0, margin: 0, padding: 0, minWidth: 0 };
const statuses: Array<[string, string]> = [['single', 'Single'], ['married_filing_jointly', 'Married filing jointly'], ['married_filing_separately', 'Married filing separately'], ['head_of_household', 'Head of household'], ['qualifying_surviving_spouse', 'Qualifying surviving spouse']];
function people(data?: CharitableFilingUnitHistoryData): Array<[string, string]> { return (data?.persons ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Person ${i + 1}: ${row.name || row.sourceId}`]] : []); }
function returns(data?: CharitableFilingUnitHistoryData): Array<[string, string]> { return (data?.returns ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Return ${i + 1}: ${row.taxYear || 'year unknown'} (${row.sourceId})`]] : []); }

export function CharitableFilingUnitDetails({ data, onChange }: { data?: CharitableFilingUnitHistoryData; onChange: (data: CharitableFilingUnitHistoryData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add original filing-unit timeline</button>;
  const change = (patch: Partial<CharitableFilingUnitHistoryData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-w2-card"><legend>Original people and filed returns</legend>
    <p className="guided-hint">Include the original and intervening returns that determine the present owners&apos; balances. Keep a former owner&apos;s source when it fed a shared history, even if their remaining balance is excluded now. Use each record&apos;s own ID to link it below.</p>
    <TextFact label="Filing-unit timeline source reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
    {data.persons === undefined && <p role="status">The people in the original history are unknown.</p>}
    {(data.persons ?? []).map((person, i) => { const prefix = `Person ${i + 1}`; const edit = (patch: Partial<typeof person>) => change({ persons: data.persons!.map((row, index) => index === i ? { ...row, ...patch } : row) }); return <fieldset key={i} className="panel-stack" style={nestedSourceStyle}><legend>{prefix}</legend><div className="guided-form-grid">
      <TextFact label={`${prefix} source ID`} value={person.sourceId ?? ''} onChange={sourceId => edit({ sourceId })} />
      <TextFact label={`${prefix} name on the original return`} value={person.name ?? ''} onChange={name => edit({ name })} />
      <TextFact label={`${prefix} SSN last four`} value={person.taxpayerIdLast4 ?? ''} onChange={taxpayerIdLast4 => edit({ taxpayerIdLast4 })} />
      <SourceChoice label={`${prefix} death status`} value={person.deathStatus} options={[
        ['alive_through_return_year', 'Alive through this return year'], ['deceased', 'Deceased by this return year'],
      ]} onChange={deathStatus => edit({ deathStatus: deathStatus as typeof person.deathStatus })} />
      <TextFact label={`${prefix} actual death year`} value={person.deathYear ?? ''} onChange={deathYear => edit({ deathYear })} />
    </div><button type="button" className="utility-button" onClick={() => change({ persons: data.persons!.filter((_, index) => index !== i) })}>Remove actual person {i + 1}</button></fieldset>; })}
    <button type="button" className="utility-button" onClick={() => change({ persons: [...(data.persons ?? []), {}] })}>Add actual person</button>
    {data.returns === undefined && <p role="status">The filed-return timeline is unknown.</p>}
    {(data.returns ?? []).map((unit, i) => { const prefix = `Return ${i + 1}`; const edit = (patch: Partial<typeof unit>) => change({ returns: data.returns!.map((row, index) => index === i ? { ...row, ...patch } : row) }); return <fieldset key={i} className="panel-stack" style={nestedSourceStyle}><legend>{prefix}</legend><div className="guided-form-grid">
      {(['sourceId', 'taxYear', 'sourceReference'] as const).map((key, index) => <TextFact key={key} label={`${prefix} ${['source ID', 'tax year', 'original source reference'][index]}`} value={unit[key] ?? ''} onChange={value => edit({ [key]: value })} />)}
      <SourceChoice label={`${prefix} filing status`} value={unit.filingStatus} options={statuses} onChange={filingStatus => edit({ filingStatus: filingStatus as typeof unit.filingStatus })} />
      <SourceChoice label={`${prefix} primary person`} value={unit.primaryPersonId} options={people(data)} onChange={primaryPersonId => edit({ primaryPersonId })} />
      <SourceChoice label={`${prefix} joint spouse`} value={unit.spousePersonId} options={people(data)} onChange={spousePersonId => edit({ spousePersonId })} />
      <BooleanFact label={`${prefix} is the deceased person's final separate return`} value={unit.finalReturnForDeceased} onChange={finalReturnForDeceased => edit({ finalReturnForDeceased })} />
    </div><button type="button" className="utility-button" onClick={() => change({ returns: data.returns!.filter((_, index) => index !== i) })}>Remove actual return {i + 1}</button></fieldset>; })}
    <button type="button" className="utility-button" onClick={() => change({ returns: [...(data.returns ?? []), {}] })}>Add actual filed return</button>
    <SourceChoice label="Current filing-unit return" value={data.currentReturnSourceId} options={returns(data)} onChange={currentReturnSourceId => change({ currentReturnSourceId })} />
    <BooleanFact label="All relevant original and intervening returns are included" value={data.allRelevantReturnsIncluded} onChange={allRelevantReturnsIncluded => change({ allRelevantReturnsIncluded })} />
    <BooleanFact label="All original carryovers feeding these joint histories are included" value={data.allRelevantCarryoversIncluded} onChange={allRelevantCarryoversIncluded => change({ allRelevantCarryoversIncluded })} />
    <BooleanFact label="Filing-unit sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove original filing-unit timeline</button>
  </fieldset>;
}

export function CharitableFilingUnitOrigin({ timeline, data, number, onChange }: { timeline?: CharitableFilingUnitHistoryData; data: CharitableCarryoverVintageData['filingUnitOrigin']; number: number; onChange: (data: NonNullable<CharitableCarryoverVintageData['filingUnitOrigin']>) => void }) {
  const prefix = `Contribution ${number}`, change = (patch: Partial<NonNullable<typeof data>>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} original ownership</legend>
    <SourceChoice label={`${prefix} original filed return`} value={data?.returnSourceId} options={returns(timeline)} onChange={returnSourceId => change({ returnSourceId })} />
    <p className="guided-hint">For a joint original that later needs allocation, copy each spouse&apos;s separately computed original excess and NOL reduction. The allocation uses these computations, not the amount of each spouse&apos;s gifts. Otherwise leave these computations absent.</p>
    {(data?.separateComputations ?? []).map((row, i) => { const label = `${prefix} separate computation ${i + 1}`; const edit = (patch: Partial<typeof row>) => change({ separateComputations: data!.separateComputations!.map((value, index) => index === i ? { ...value, ...patch } : value) }); return <fieldset key={i} className="panel-stack" style={nestedSourceStyle}><legend>{label}</legend><div className="guided-form-grid">
      <SourceChoice label={`${label} person`} value={row.personId} options={people(timeline)} onChange={personId => edit({ personId })} />
      <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      <CurrencyField label={`${label} original excess`} value={row.originalExcess ?? ''} onChange={originalExcess => edit({ originalExcess })} />
      <CurrencyField label={`${label} origin NOL reduction`} value={row.originNolReduction ?? ''} onChange={originNolReduction => edit({ originNolReduction })} />
      <BooleanFact label={`${label} ordinary percentage method confirmed`} value={row.ordinaryPercentageMethodConfirmed} onChange={ordinaryPercentageMethodConfirmed => edit({ ordinaryPercentageMethodConfirmed })} />
    </div><button type="button" className="utility-button" onClick={() => change({ separateComputations: data!.separateComputations!.filter((_, index) => index !== i) })}>Remove separate computation {i + 1} for contribution {number}</button></fieldset>; })}
    <button type="button" className="utility-button" onClick={() => change({ separateComputations: [...(data?.separateComputations ?? []), {}] })}>Add separate original computation for contribution {number}</button>
  </fieldset>;
}

export function CharitableFilingUnitUses({ timeline, data, number, historyNumber, onChange }: { timeline?: CharitableFilingUnitHistoryData; data: CharitableCarryoverHistoryData['filingUnitUses']; number: number; historyNumber: number; onChange: (data: NonNullable<CharitableCarryoverHistoryData['filingUnitUses']>) => void }) {
  const prefix = `Contribution ${number} history ${historyNumber}`;
  return <div>{data === undefined && <p role="status">The actual filed-unit use is unknown.</p>}
    {(data ?? []).map((row, i) => { const label = `${prefix} filed use ${i + 1}`; const edit = (patch: Partial<typeof row>) => onChange(data!.map((value, index) => index === i ? { ...value, ...patch } : value)); return <fieldset key={i} className="panel-stack" style={nestedSourceStyle}><legend>{label}</legend><div className="guided-form-grid">
      <SourceChoice label={`${label} original return`} value={row.returnSourceId} options={returns(timeline)} onChange={returnSourceId => edit({ returnSourceId })} />
      <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      <CurrencyField label={`${label} amount treated as paid`} value={row.treatedAsPaid ?? ''} onChange={treatedAsPaid => edit({ treatedAsPaid })} />
      <CurrencyField label={`${label} NOL reduction`} value={row.nolReduction ?? ''} onChange={nolReduction => edit({ nolReduction })} />
    </div><button type="button" className="utility-button" onClick={() => onChange(data!.filter((_, index) => index !== i))}>Remove filed use {i + 1} from contribution {number} history {historyNumber}</button></fieldset>; })}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add filed use for contribution {number} history {historyNumber}</button>
  </div>;
}

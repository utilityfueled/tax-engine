"use client";
import type { NolFilingUnitHistoryData, NolFilingUnitOriginData, NolFilingUnitUseData, NolSameCoupleJointHistoryData } from '@/lib/guided-nol-filing-unit';
import { CharitableFilingUnitDetails } from './charitable-filing-unit-details';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

const nestedSourceStyle = { border: 0, margin: 0, padding: 0, minWidth: 0 };
function SourceChoice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string | undefined) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value || undefined)}>
    <option value="">Choose from actual records</option>
    {value && !options.some(([id]) => id === value) && <option value={value}>Saved source: {value}</option>}
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}
function people(data?: NolFilingUnitHistoryData): [string, string][] { return (data?.persons ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Person ${i + 1}: ${row.name || row.sourceId}`]] : []); }
function returns(data?: NolFilingUnitHistoryData): [string, string][] { return (data?.returns ?? []).flatMap((row, i) => row.sourceId ? [[row.sourceId, `Return ${i + 1}: ${row.taxYear || 'year unknown'} (${row.sourceId})`]] : []); }

export function NolFilingUnitDetails({ label, data, onChange }: { label: string; data?: NolFilingUnitHistoryData; onChange: (data: NolFilingUnitHistoryData | undefined) => void }) {
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{label} original ownership timeline</legend>
    <p className="guided-hint">Use the original filed returns and each owner&apos;s historical loss worksheets. Keep regular and AMT histories separate, including an explicitly empty carry list. A current joint return also needs the actual same-couple marital years below. Historical joint returns need both owners&apos; actual computations.</p>
    <CharitableFilingUnitDetails data={data} onChange={onChange} />
  </fieldset>;
}

export function NolSameCoupleJointDetails({ label, timeline, data, onChange }: { label: string; timeline?: NolFilingUnitHistoryData; data?: NolSameCoupleJointHistoryData; onChange: (data: NolSameCoupleJointHistoryData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add same-couple marital history for {label}</button>;
  const change = (patch: Partial<NolSameCoupleJointHistoryData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{label} current joint marital history</legend>
    <p className="guided-hint">For a current joint return, identify the same two spouses in every relevant original and intervening year. Separate-return status alone does not identify the spouse. Copy actual marital records; do not enter this year&apos;s deduction or divide the joint closing carry.</p>
    <TextFact label={`${label} marital history source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
    <BooleanFact label={`${label} all relevant marital years included`} value={data.allRelevantYearsIncluded} onChange={allRelevantYearsIncluded => change({ allRelevantYearsIncluded })} />
    {data.years === undefined && <p role="status">The actual marital years are unknown.</p>}
    {(data.years ?? []).map((row, index) => {
      const prefix = `${label} marital year ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ years: data.years!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{prefix}</legend><div className="guided-form-grid">
        <TextFact label={`${prefix} tax year`} value={row.taxYear ?? ''} onChange={taxYear => edit({ taxYear })} />
        <SourceChoice label={`${prefix} first spouse`} value={row.firstPersonId} options={people(timeline)} onChange={firstPersonId => edit({ firstPersonId })} />
        <SourceChoice label={`${prefix} second spouse`} value={row.secondPersonId} options={people(timeline)} onChange={secondPersonId => edit({ secondPersonId })} />
        <BooleanFact label={`${prefix} married to each other`} value={row.marriedToEachOther} onChange={marriedToEachOther => edit({ marriedToEachOther })} />
        <TextFact label={`${prefix} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      </div><button type="button" className="utility-button" onClick={() => change({ years: data.years!.filter((_, i) => i !== index) })}>Remove {prefix}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ years: [...(data.years ?? []), {}] })}>Add marital year for {label}</button>
    <button type="button" className="utility-button" onClick={() => change({ years: undefined })}>Mark marital years unknown for {label}</button>
    <BooleanFact label={`${label} marital sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove same-couple marital history for {label}</button>
  </fieldset>;
}

export function NolFilingUnitOrigin({ prefix, timeline, data, onChange }: { prefix: string; timeline?: NolFilingUnitHistoryData; data?: NolFilingUnitOriginData; onChange: (data: NolFilingUnitOriginData | undefined) => void }) {
  const change = (patch: Partial<NolFilingUnitOriginData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} original ownership</legend>
    <p className="guided-hint">Copy the original return&apos;s full NOL and each owner&apos;s separately computed NOL. The original filed loss above is the present owner&apos;s portion. These facts establish ownership; they do not enter this year&apos;s deduction.</p>
    <div className="guided-form-grid">
      <SourceChoice label={`${prefix} original carry owner`} value={data?.ownerPersonId} options={people(timeline)} onChange={ownerPersonId => change({ ownerPersonId })} />
      <SourceChoice label={`${prefix} original filed return`} value={data?.returnSourceId} options={returns(timeline)} onChange={returnSourceId => change({ returnSourceId })} />
      <CurrencyField label={`${prefix} original joint or separate return NOL`} value={data?.originalReturnLoss ?? ''} onChange={originalReturnLoss => change({ originalReturnLoss })} />
    </div>
    {data?.separateComputations === undefined && <p role="status">The original owners&apos; separate computations are unknown.</p>}
    {(data?.separateComputations ?? []).map((row, index) => {
      const label = `${prefix} original owner ${index + 1}`;
      const edit = (patch: Partial<typeof row>) => change({ separateComputations: data!.separateComputations!.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{label}</legend><div className="guided-form-grid">
        <SourceChoice label={`${label} person`} value={row.personId} options={people(timeline)} onChange={personId => edit({ personId })} />
        <CurrencyField label={`${label} separate NOL`} value={row.netOperatingLoss ?? ''} onChange={netOperatingLoss => edit({ netOperatingLoss })} />
        <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
      </div><button type="button" className="utility-button" onClick={() => change({ separateComputations: data!.separateComputations!.filter((_, i) => i !== index) })}>Remove {label}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ separateComputations: [...(data?.separateComputations ?? []), {}] })}>Add original owner computation for {prefix}</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove original ownership for {prefix}</button>
  </fieldset>;
}

const historicalAmounts = [['claimedDeduction', 'claimed deduction'], ['modifiedAbsorption', 'modified absorption'], ['attributeReduction', 'attribute reduction']] as const;
export function NolFilingUnitUses({ prefix, timeline, data, onChange }: { prefix: string; timeline?: NolFilingUnitHistoryData; data?: NolFilingUnitUseData[]; onChange: (data: NolFilingUnitUseData[] | undefined) => void }) {
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} actual filed uses</legend>
    <p className="guided-hint">Copy each filed return&apos;s use of this original loss and its amounts for every original owner. Modified absorption can differ from the deduction claimed. Record attribute reductions separately. Enter established zero explicitly; leave unknown facts blank.</p>
    {data === undefined && <p role="status">The actual filed-owner history is unknown.</p>}
    {(data ?? []).map((row, index) => {
      const label = `${prefix} filed use ${index + 1}`;
      const edit = (patch: Partial<NolFilingUnitUseData>) => onChange(data!.map((item, i) => i === index ? { ...item, ...patch } : item));
      return <fieldset className="panel-stack" style={nestedSourceStyle} key={index}><legend>{label}</legend><div className="guided-form-grid">
        <SourceChoice label={`${label} original return`} value={row.returnSourceId} options={returns(timeline)} onChange={returnSourceId => edit({ returnSourceId })} />
        <TextFact label={`${label} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => edit({ sourceReference })} />
        {historicalAmounts.map(([key, text]) => <CurrencyField key={key} label={`${label} return ${text}`} value={row[key] ?? ''} onChange={value => edit({ [key]: value })} />)}
        <BooleanFact label={`${label} all original owners included`} value={row.allOriginOwnersIncluded} onChange={allOriginOwnersIncluded => edit({ allOriginOwnersIncluded })} />
        <BooleanFact label={`${label} all other NOL sources included in the filed computation`} value={row.allOtherNolSourcesIncluded} onChange={allOtherNolSourcesIncluded => edit({ allOtherNolSourcesIncluded })} />
      </div>
      {row.owners === undefined && <p role="status">The historical owner amounts are unknown.</p>}
      {(row.owners ?? []).map((owner, ownerIndex) => {
        const ownerLabel = `${label} owner ${ownerIndex + 1}`;
        const change = (patch: Partial<typeof owner>) => edit({ owners: row.owners!.map((item, i) => i === ownerIndex ? { ...item, ...patch } : item) });
        return <fieldset className="panel-stack" style={nestedSourceStyle} key={ownerIndex}><legend>{ownerLabel}</legend><div className="guided-form-grid">
          <SourceChoice label={`${ownerLabel} person`} value={owner.personId} options={people(timeline)} onChange={personId => change({ personId })} />
          {historicalAmounts.map(([key, text]) => <CurrencyField key={key} label={`${ownerLabel} ${text}`} value={owner[key] ?? ''} onChange={value => change({ [key]: value })} />)}
        </div><button type="button" className="utility-button" onClick={() => edit({ owners: row.owners!.filter((_, i) => i !== ownerIndex) })}>Remove {ownerLabel}</button></fieldset>;
      })}
      <button type="button" className="utility-button" onClick={() => edit({ owners: [...(row.owners ?? []), {}] })}>Add owner amounts for {label}</button>
      <BooleanFact label={`${label} sources checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => edit({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(data!.filter((_, i) => i !== index))}>Remove {label}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add actual filed use for {prefix}</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Mark filed-owner history unknown for {prefix}</button>
  </fieldset>;
}

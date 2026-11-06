"use client";

import type { K1CharitableBasisData } from '@/lib/guided-k1-charitable-data';
import { BooleanFact, TextFact } from './fact-fields';

type Sources = NonNullable<NonNullable<K1CharitableBasisData['priorBasisSuspensions']>[number]['section170AdmissionSources']>;
type Annual = NonNullable<Sources['records']>[number];
const fields = [
  ['taxYear', 'tax year'], ['basisWorksheetReference', 'basis worksheet reference'], ['charitableWorksheetReference', 'charitable worksheet reference'],
  ['recipientName', 'recipient taxpayer name'], ['recipientTaxpayerIdLast4', 'recipient SSN last four'], ['entityEIN', 'entity EIN'],
] as const;
// The enclosing original-basis card already provides the visual boundary.
const nestedSourceStyle = { border: 0, margin: 0, padding: 0, minWidth: 0 };

export function K1CharitableFirstAdmissionDetails({ prefix, data, onChange }: {
  prefix: string; data?: Sources; onChange: (value: Sources | undefined) => void;
}) {
  if (data === undefined) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} records</button>;
  const change = (patch: Partial<Sources>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack" style={nestedSourceStyle}><legend>{prefix} records</legend>
    <p className="guided-hint">Use the filed basis and charitable worksheets for every year from the original basis year through the preceding year. Match the same taxpayer and entity. Link each surviving earlier charitable carry to the year it first entered section 170; the original gift date stays unchanged.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix} source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
      <BooleanFact label={`${prefix} checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
    </div>
    {data.records === undefined && <p role="status">The annual original-source record list is unknown.</p>}
    {data.records?.map((record, index) => {
      const label = `${prefix} year ${index + 1}`;
      const update = (patch: Partial<Annual>) => change({ records: data.records?.map((value, i) => i === index ? { ...value, ...patch } : value) });
      return <fieldset key={index} className="panel-stack" style={nestedSourceStyle}><legend>{label}</legend>
        <div className="guided-form-grid">
          {fields.map(([key, suffix]) => <TextFact key={key} label={`${label} ${suffix}`} value={record[key] ?? ''} onChange={value => update({ [key]: value })} />)}
          <label className="guided-field"><span className="guided-field-label">{label} entity type</span>
            <select className="guided-input" value={record.entityType ?? ''} onChange={event => update({ entityType: event.target.value as Annual['entityType'] })}>
              <option value="">Choose from actual records</option><option value="partnership">Partnership</option><option value="s_corporation">S corporation</option>
            </select>
          </label>
        </div>
        {(['regular', 'alternative'] as const).map(system => {
          const key = system === 'regular' ? 'regularCarryoverSourceIds' : 'alternativeCarryoverSourceIds';
          const ids = record[key];
          return <fieldset key={system} style={nestedSourceStyle}><legend>{label} {system} carry links</legend>
            <p className="guided-hint">Use the original source IDs from the separate {system === 'regular' ? 'regular charitable' : 'AMT charitable'} history. Record none only when the actual record establishes it.{system === 'alternative' ? ' Leave this list unknown when no independent AMT history applies.' : ''}</p>
            {ids === undefined && <p role="status">The {system} carry link list is unknown.</p>}
            {ids?.length === 0 && <p>Explicitly recorded: no {system} carry links from this year.</p>}
            {ids?.map((id, i) => <div key={i}>
              <TextFact label={`${label} ${system} carry ${i + 1} source ID`} value={id} onChange={value => update({ [key]: ids.map((current, n) => n === i ? value : current) })} />
              <button type="button" className="utility-button" onClick={() => update({ [key]: ids.filter((_, n) => n !== i) })}>Remove {label} {system} carry {i + 1}</button>
            </div>)}
            <button type="button" className="utility-button" onClick={() => update({ [key]: [...(ids ?? []), ''] })}>Add {label} {system} carry</button>
            <button type="button" className="utility-button" onClick={() => update({ [key]: [] })}>Record no {label} {system} carries</button>
          </fieldset>;
        })}
        <button type="button" className="utility-button" onClick={() => change({ records: data.records?.filter((_, i) => i !== index) })}>Remove {label}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ records: [...(data.records ?? []), {}] })}>Add {prefix} year</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} records</button>
  </fieldset>;
}

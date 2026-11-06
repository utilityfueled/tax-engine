"use client";

import { updateCharitableCarryoverSources, type CharitableCarryoverData, type CharitableCarryoverVintageData, type CharitableCarryoverHistoryData } from '@/lib/guided-charitable-carryover';
import { BooleanFact, TextFact } from './fact-fields';
import { CharitableFilingUnitDetails, CharitableFilingUnitOrigin, CharitableFilingUnitUses } from './charitable-filing-unit-details';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span>
    <select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
      <option value="">Choose from actual records</option>
      {value && !options.some(([key]) => key === value) && <option value={value}>Saved source: {value}</option>}
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </label>;
}

export function CharitableCarryoverDetails({ data, onChange }: { data?: CharitableCarryoverData; onChange: (next: CharitableCarryoverData | undefined) => void }) {
  const change = (patch: Partial<CharitableCarryoverData>) => onChange(updateCharitableCarryoverSources(data ?? {}, patch));
  const vintage = (index: number, patch: Partial<CharitableCarryoverVintageData>) => change({ vintages: data?.vintages?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const history = (index: number, historyIndex: number, patch: Partial<CharitableCarryoverHistoryData>) => vintage(index, {
    history: data?.vintages?.[index].history?.map((row, i) => i === historyIndex ? { ...row, ...patch } : row),
  });
  return <details className="guided-expand"><summary className="guided-expand-trigger">Charitable contributions carried from earlier years</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original contribution worksheets and every intervening return, including years when you took the standard deduction. Keep earlier contributions separate from this year&apos;s gifts.</p>
    <p className="guided-hint">Enter the actual opening balance and its history. The return calculates this year&apos;s deduction, amounts treated as paid, and remaining carryover. For a changed filing unit, attach the original people, returns and ownership computations below. Special elections and conservation contributions require their separate methods.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add charitable carryover sources</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Charitable carryover source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label="Charitable carryover packet reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        <Choice label="Charitable carryover return membership" value={data.returnMembership} options={[
          ['continuous_individual', 'Same individual throughout the history'], ['same_spouses_joint', 'Same spouses filing jointly throughout the history'], ['changed_filing_unit', 'Marriage, separation, remarriage or death changed the filing unit'],
        ]} onChange={value => change({ returnMembership: value === 'continuous_individual' || value === 'same_spouses_joint' || value === 'changed_filing_unit' ? value : undefined })} />
        {([
          ['primaryName', 'Primary taxpayer name on the original records'], ['primaryTaxpayerIdLast4', 'Primary taxpayer SSN last four on the original records'],
          ['spouseName', 'Spouse name on joint original records'], ['spouseTaxpayerIdLast4', 'Spouse SSN last four on joint original records'],
        ] as const).map(([key, label]) => <TextFact key={key} label={label} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
        {([
          ['allCarryoversIncluded', 'All prior charitable carryovers are included'], ['calendarYearTaxpayer', 'The source returns use calendar tax years'],
          ['membershipUnchangedConfirmed', 'The taxpayer or joint spouses are unchanged throughout the history'],
        ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => change({ [key]: value })} />)}
      </div>
      {data.returnMembership === 'changed_filing_unit' && <CharitableFilingUnitDetails data={data.filingUnitHistory} onChange={filingUnitHistory => change({ filingUnitHistory })} />}
      {data.vintages === undefined && <p role="status">The prior contribution history is unknown.</p>}
      {data.vintages?.length === 0 && <p>Explicitly recorded: no prior charitable carryovers.</p>}
      {(data.vintages ?? []).map((row, index) => {
        const prefix = `Contribution ${index + 1}`;
        return <fieldset className="guided-w2-card" key={index}><legend>{prefix} original history</legend><div className="guided-form-grid">
          {([
            ['sourceId', 'original source ID'], ['contributionYear', 'original tax year'], ['sourceReference', 'original worksheet reference'],
            ['adjustedThroughTaxYear', 'history adjusted-through tax year'],
          ] as const).map(([key, label]) => <TextFact key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => vintage(index, { [key]: value })} />)}
          <Choice label={`${prefix} original percentage category`} value={row.category} options={[
            ['cash_60', 'Cash subject to the 60% limit'], ['noncash_50', 'Noncash subject to the 50% limit'],
            ['capital_gain_30', 'Capital gain property subject to the 30% limit'], ['other_30', 'Other contributions subject to the 30% limit'],
            ['capital_gain_20', 'Capital gain property subject to the 20% limit'], ['conservation_50', 'Qualified conservation contribution — 50%'],
            ['conservation_100', 'Qualified conservation contribution — 100%'], ['qualified_cash_100', 'Qualified cash contribution — 100% election'],
          ]} onChange={value => vintage(index, { category: (value || undefined) as CharitableCarryoverVintageData['category'] })} />
          <Choice label={`${prefix} original contribution medium`} value={row.medium} options={[
            ['cash', 'Cash'], ['noncash', 'Noncash property'],
          ]} onChange={value => vintage(index, { medium: value === 'cash' || value === 'noncash' ? value : undefined })} />
          {([
            ['originalExcess', 'original excess'], ['originNolReduction', 'origin NOL reduction'], ['openingCarryforward', 'opening carryforward'],
          ] as const).map(([key, label]) => <CurrencyField key={key} label={`${prefix} ${label}`} value={row[key] ?? ''} onChange={value => vintage(index, { [key]: value })} />)}
          <BooleanFact label={`${prefix} ordinary percentage method confirmed`} value={row.ordinaryPercentageMethodConfirmed} onChange={ordinaryPercentageMethodConfirmed => vintage(index, { ordinaryPercentageMethodConfirmed })} />
          <BooleanFact label={`${prefix} all intervening history included`} value={row.allHistoryIncluded} onChange={allHistoryIncluded => vintage(index, { allHistoryIncluded })} />
        </div>
          {data.returnMembership === 'changed_filing_unit' && <>
            <p className="guided-hint">The opening balance is derived from the original timeline. An optional recorded opening is checked against that result; it cannot replace the calculation.</p>
            <CharitableFilingUnitOrigin timeline={data.filingUnitHistory} data={row.filingUnitOrigin} number={index + 1} onChange={filingUnitOrigin => vintage(index, { filingUnitOrigin })} />
          </>}
          <p className="guided-hint">Record each year after the contribution through last year. Amount treated as paid includes any required absorption in a standard-deduction year. Enter known zero amounts explicitly.</p>
          {row.history === undefined && <p role="status">The intervening-year history is unknown.</p>}
          {row.history?.length === 0 && <p>Explicitly recorded: no intervening years.</p>}
          {(row.history ?? []).map((entry, historyIndex) => {
            const label = `${prefix} history ${historyIndex + 1}`;
            return <fieldset key={historyIndex}><legend>{label}</legend><div className="guided-form-grid">
              <TextFact label={`${label} tax year`} value={entry.taxYear ?? ''} onChange={taxYear => history(index, historyIndex, { taxYear })} />
              <TextFact label={`${label} source reference`} value={entry.sourceReference ?? ''} onChange={sourceReference => history(index, historyIndex, { sourceReference })} />
              <CurrencyField label={`${label} treated as paid`} value={entry.treatedAsPaid ?? ''} onChange={treatedAsPaid => history(index, historyIndex, { treatedAsPaid })} />
              <CurrencyField label={`${label} NOL reduction`} value={entry.nolReduction ?? ''} onChange={nolReduction => history(index, historyIndex, { nolReduction })} />
            </div>{data.returnMembership === 'changed_filing_unit' && <CharitableFilingUnitUses timeline={data.filingUnitHistory} data={entry.filingUnitUses} number={index + 1} historyNumber={historyIndex + 1} onChange={filingUnitUses => history(index, historyIndex, { filingUnitUses })} />}<button type="button" className="utility-button" onClick={() => vintage(index, { history: row.history?.filter((_, i) => i !== historyIndex) })}>Remove contribution {index + 1} history {historyIndex + 1}</button></fieldset>;
          })}
          <button type="button" className="utility-button" onClick={() => vintage(index, { history: [...(row.history ?? []), {}] })}>Add intervening year for contribution {index + 1}</button>
          <button type="button" className="utility-button" onClick={() => vintage(index, { history: [] })}>Record no intervening years for contribution {index + 1}</button>
          <button type="button" className="utility-button" onClick={() => change({ vintages: data.vintages?.filter((_, i) => i !== index) })}>Remove contribution history {index + 1}</button>
        </fieldset>;
      })}
      <button type="button" className="utility-button" onClick={() => change({ vintages: [...(data.vintages ?? []), {}] })}>Add original contribution history</button>
      <button type="button" className="utility-button" onClick={() => change({ vintages: [] })}>Record no prior charitable carryovers</button>
      <BooleanFact label="Charitable carryover sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove charitable carryover sources</button>
    </>}
  </div></details>;
}

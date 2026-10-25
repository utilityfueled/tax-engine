"use client";
import { updateNetOperatingLossSources, type NetOperatingLossData, type NolAlternativeData, type NolVintageData } from '@/lib/guided-net-operating-loss';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
    <option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}
function Vintages({ label, data, regular, onChange }: { label: string; data?: NolVintageData[]; regular: boolean; onChange: (data: NolVintageData[]) => void }) {
  function update(index: number, patch: Partial<NolVintageData>) { onChange((data ?? []).map((row, i) => i === index ? { ...row, ...patch } : row)); }
  return <fieldset><legend>{label} original loss vintages</legend>
    <p className="guided-hint">Enter each originating filed worksheet and all actual uses or attribute reductions through the prior year. These are filed whole-dollar amounts. Do not round unverified cents or enter this year’s deduction here.</p>
    {data === undefined && <p role="status">The {label.toLowerCase()} vintage list has not been confirmed.</p>}
    {data?.length === 0 && <p>Explicitly recorded: no {label.toLowerCase()} loss vintages.</p>}
    {(data ?? []).map((row, index) => {
      const prefix = `${label} loss ${index + 1}`;
      return <div className="guided-w2-card" key={index}><h4>{prefix}</h4><div className="guided-form-grid">
        {([['sourceId', 'source ID'], ['lossTaxYear', 'originating tax year'], ['sourceReference', 'original worksheet reference']] as const).map(([key, text]) => <TextFact key={key} label={`${prefix} ${text}`} value={row[key] ?? ''} onChange={value => update(index, { [key]: value })} />)}
        <Choice label={`${prefix} originating character`} value={row.originKind} options={[
          ['individual_nol', 'Individual NOL worksheet'], ['excess_business_loss', 'Excess business loss requiring its QBI origin method'], ['estate_termination', 'Estate termination requiring its source allocation'],
        ]} onChange={value => update(index, { originKind: value as NolVintageData['originKind'] })} />
        {([['originalLoss', 'original filed loss'], ['openingCarryforward', 'opening carryforward']] as const).map(([key, text]) => <CurrencyField key={key} label={`${prefix} ${text}`} value={row[key] ?? ''} onChange={value => update(index, { [key]: value })} />)}
        {(regular || row.section1411OriginalLoss !== undefined) && <CurrencyField label={`${prefix} originating Section 1411 loss`} hint="Use the actual originating net-investment-income loss, including an explicit zero. It is not this year’s deduction." value={row.section1411OriginalLoss ?? ''} onChange={section1411OriginalLoss => update(index, { section1411OriginalLoss })} />}
        <Choice label={`${prefix} carryback disposition`} value={row.carrybackTreatment} options={[
          ['not_required', 'No carryback required under actual applicable rules'], ['waived', 'Actual carryback waiver filed'], ['completed', 'Actual required carryback completed'],
        ]} onChange={value => update(index, { carrybackTreatment: value as NolVintageData['carrybackTreatment'] })} />
        <TextFact label={`${prefix} carryback source reference`} value={row.carrybackSourceReference ?? ''} onChange={carrybackSourceReference => update(index, { carrybackSourceReference })} />
        <BooleanFact label={`${prefix} completed pre-2018 carryback follows ordinary historical rules`} value={row.ordinaryHistoricalCarrybackConfirmed} onChange={ordinaryHistoricalCarrybackConfirmed => update(index, { ordinaryHistoricalCarrybackConfirmed })} />
        <TextFact label={`${prefix} history adjusted through tax year`} value={row.adjustedThroughTaxYear ?? ''} onChange={adjustedThroughTaxYear => update(index, { adjustedThroughTaxYear })} />
        <TextFact label={`${prefix} complete history source reference`} value={row.historySourceReference ?? ''} onChange={historySourceReference => update(index, { historySourceReference })} />
        <BooleanFact label={`${prefix} all historical uses and reductions included`} value={row.allHistoryIncluded} onChange={allHistoryIncluded => update(index, { allHistoryIncluded })} />
        <BooleanFact label={`${prefix} includes a farming loss`} value={row.farmingLossIncluded} onChange={farmingLossIncluded => update(index, { farmingLossIncluded })} />
      </div>
      {row.history === undefined && <p role="status">The prior-use history is unknown.</p>}
      {row.history?.length === 0 && <p>Explicitly recorded: no prior uses or attribute reductions.</p>}
      {(row.history ?? []).map((entry, historyIndex) => {
        const historyPrefix = `${prefix} history ${historyIndex + 1}`;
        const change = (patch: Partial<typeof entry>) => update(index, { history: row.history?.map((item, i) => i === historyIndex ? { ...item, ...patch } : item) });
        return <fieldset key={historyIndex}><legend>{historyPrefix}</legend><div className="guided-form-grid">
          <TextFact label={`${historyPrefix} tax year`} value={entry.taxYear ?? ''} onChange={taxYear => change({ taxYear })} />
          <CurrencyField label={`${historyPrefix} NOL used`} value={entry.nolUsed ?? ''} onChange={nolUsed => change({ nolUsed })} />
          <CurrencyField label={`${historyPrefix} attribute reduction`} value={entry.attributeReduction ?? ''} onChange={attributeReduction => change({ attributeReduction })} />
          <TextFact label={`${historyPrefix} source reference`} value={entry.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        </div><button type="button" className="utility-button" onClick={() => update(index, { history: row.history?.filter((_, i) => i !== historyIndex) })}>Remove {historyPrefix}</button></fieldset>;
      })}
      <div className="guided-form-grid"><button type="button" className="utility-button" onClick={() => update(index, { history: [...(row.history ?? []), {}] })}>Add {prefix} prior-use record</button>
        <button type="button" className="utility-button" onClick={() => update(index, { history: [] })}>Record no prior uses for {prefix}</button>
        <button type="button" className="utility-button" onClick={() => onChange((data ?? []).filter((_, i) => i !== index))}>Remove {prefix}</button></div>
      </div>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange([...(data ?? []), {}])}>Add {label.toLowerCase()} loss vintage</button>
    <button type="button" className="utility-button" onClick={() => onChange([])}>Record no {label.toLowerCase()} loss vintages</button>
  </fieldset>;
}
export function NetOperatingLossDetails({ data, onChange }: { data?: NetOperatingLossData; onChange: (next: NetOperatingLossData | undefined) => void }) {
  const change = (patch: Partial<NetOperatingLossData>) => onChange(updateNetOperatingLossSources(data ?? {}, patch));
  const alternative = data?.alternativeTax;
  const changeAlternative = (patch: Partial<NolAlternativeData>) => change({ alternativeTax: { ...alternative, ...patch } });
  return <details className="guided-expand"><summary className="guided-expand-trigger">Net operating loss carry sources</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original filed loss worksheets and complete carry history. Regular, alternative-tax and net-investment-income loss amounts can differ. The return calculation determines the current deductions and remaining carry; this section does not set them.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add actual NOL carry sources</button> : <>
      <div className="guided-form-grid">
        {([['sourceTaxYear', 'NOL source return tax year'], ['sourceReference', 'NOL carry packet reference'], ['primaryName', 'NOL primary taxpayer source name'], ['primaryTaxpayerIdLast4', 'NOL primary taxpayer source ID last four'], ['spouseName', 'NOL spouse source name, when applicable'], ['spouseTaxpayerIdLast4', 'NOL spouse source ID last four, when applicable']] as const).map(([key, label]) => <TextFact key={key} label={label} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
        <Choice label="NOL continuing return membership" value={data.returnMembership} options={[
          ['continuous_individual', 'Same individual throughout the source history'], ['same_spouses_joint', 'Same spouses filing jointly throughout the source history'],
        ]} onChange={value => change({ returnMembership: value as NetOperatingLossData['returnMembership'] })} />
        <BooleanFact label="NOL taxpayer membership unchanged throughout history" value={data.membershipUnchangedConfirmed} onChange={membershipUnchangedConfirmed => change({ membershipUnchangedConfirmed })} />
        <BooleanFact label="NOL calendar-year taxpayer confirmed" value={data.calendarYearTaxpayer} onChange={calendarYearTaxpayer => change({ calendarYearTaxpayer })} />
        <BooleanFact label="All actual regular NOL carryovers included" value={data.allCarryoversIncluded} onChange={allCarryoversIncluded => change({ allCarryoversIncluded })} />
      </div>
      <Vintages label="Regular" data={data.vintages} regular onChange={vintages => change({ vintages })} />
      {!alternative ? <button type="button" className="utility-button" onClick={() => change({ alternativeTax: {} })}>Add independent AMT carry sources</button> : <fieldset><legend>Independent AMT carry sources</legend>
        <div className="guided-form-grid"><TextFact label="AMT NOL source packet reference" value={alternative.sourceReference ?? ''} onChange={sourceReference => changeAlternative({ sourceReference })} />
          {([['allCarryoversIncluded', 'All actual AMT NOL carryovers included'], ['specialDisasterCarryIncluded', 'AMT carry includes special-disaster loss'], ['currentYearAdjustmentsCompleteConfirmed', 'All current AMT adjustments and preferences represented'], ['regularBasisAndLossLimitsSameAsAlternativeConfirmed', 'Current regular and AMT bases and loss limits are the same']] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={alternative[key]} onChange={value => changeAlternative({ [key]: value })} />)}
        </div><Vintages label="AMT" data={alternative.vintages} regular={false} onChange={vintages => changeAlternative({ vintages })} />
        <BooleanFact label="AMT NOL sources checked after the last edit" value={alternative.sourceFactsConfirmed} onChange={sourceFactsConfirmed => changeAlternative({ sourceFactsConfirmed })} />
        <button type="button" className="utility-button" onClick={() => change({ alternativeTax: undefined })}>Remove AMT carry sources</button>
      </fieldset>}
      <BooleanFact label="Regular NOL sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove NOL carry source packet</button>
    </>}
  </div></details>;
}

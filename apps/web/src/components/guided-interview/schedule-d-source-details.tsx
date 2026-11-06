'use client';
import { captureScheduleDRecords, updateScheduleDSources, type ScheduleDSourceData, type ScheduleDAssetSource, type ScheduleDReportedSource } from '@/lib/guided-schedule-d-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function SourceIdentity({ row, label, onChange }: { row: ScheduleDAssetSource | ScheduleDReportedSource; label: string; onChange: (patch: ScheduleDAssetSource | ScheduleDReportedSource) => void }) {
  return <div className="guided-form-grid">
    <TextFact label={`${label} original tax year`} value={row.sourceTaxYear ?? ''} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
    <TextFact label={`${label} original source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => onChange({ sourceReference })} />
    <TextFact label={`${label} original payer name`} value={row.payerName ?? ''} onChange={payerName => onChange({ payerName })} />
    <label className="guided-field"><span className="guided-field-label">{label} actual owner</span><select className="guided-input" value={row.accountHolder ?? ''} onChange={event => onChange({ accountHolder: event.target.value })}>
      <option value="">Choose from actual records</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on this joint return</option>
    </select></label>
  </div>;
}
export function ScheduleDSourceDetails({ data, investments, onChange }: { data?: ScheduleDSourceData; investments: Parameters<typeof captureScheduleDRecords>[0]; onChange: (data: ScheduleDSourceData | undefined) => void }) {
  const update = (patch: Partial<ScheduleDSourceData>) => onChange(updateScheduleDSources(data ?? {}, patch));
  return <details className="guided-expand"><summary className="guided-expand-trigger">Capital gain character and loss carryovers (Schedule D)</summary><div className="guided-expand-body">
    <p className="guided-hint">Use actual source records for collectibles, unrecaptured section 1250 distributions, child capital distributions and capital loss carryovers. The calculation applies the loss netting; do not enter an assumed final special-tax amount.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add capital source worksheet</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Capital worksheet tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="Capital worksheet source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      </div>
      {(['primary', 'spouse'] as const).filter(owner => owner === 'primary' || data.spouse !== undefined).map(owner => <fieldset key={owner}><legend>{owner === 'primary' ? 'Primary taxpayer source identity' : 'Joint spouse source identity'}</legend><div className="guided-form-grid">
        {([['firstName', 'first name and middle initial'], ['lastName', 'last name'], ['ssnLast4', 'taxpayer ID last four digits']] as const).map(([key, label]) => <TextFact key={key} label={`${owner === 'primary' ? 'Primary' : 'Spouse'} capital source ${label}`} value={data[owner]?.[key] ?? ''} onChange={value => update({ [owner]: { ...data[owner], [key]: value } })} />)}
      </div>{owner === 'spouse' && <button type="button" className="utility-button utility-button-small" onClick={() => update({ spouse: undefined })}>Remove spouse source identity</button>}</fieldset>)}
      {!data.spouse && <button type="button" className="utility-button utility-button-small" onClick={() => update({ spouse: {} })}>Add actual joint spouse identity</button>}
      <div className="guided-form-grid">
        <CurrencyField allowNegative label="Prior short-term capital loss carryover" value={data.priorShortTermCapitalLoss ?? ''} onChange={priorShortTermCapitalLoss => update({ priorShortTermCapitalLoss })} hint="Use the actual prior-year worksheet. Losses are zero or negative; blank is unknown." />
        <CurrencyField allowNegative label="Prior long-term capital loss carryover" value={data.priorLongTermCapitalLoss ?? ''} onChange={priorLongTermCapitalLoss => update({ priorLongTermCapitalLoss })} />
        <CurrencyField label="Actual section 1231 lookback amount" value={data.section1231Lookback ?? ''} onChange={section1231Lookback => update({ section1231Lookback })} hint="Enter known zero only after checking. Positive amounts require the separate business-property source method." />
        {([['amtBasisAndCarryoversSameAsRegularConfirmed', 'Are AMT asset bases and capital loss carryovers the same as regular tax?'], ['form2439Present', 'Does the return include Form 2439 undistributed gains?'], ['partnershipInterestDispositionPresent', 'Was a partnership interest disposed of?'], ['other1250DispositionPresent', 'Were there other section 1250 property dispositions?']] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => update({ [key]: value })} />)}
      </div>
      <p className="guided-hint">Copy only values already entered above, then check each original record and supply missing years or references. This action does not confirm the worksheet or fill unknown amounts. Changing a source later requires reconciling this saved copy.</p>
      <button type="button" className="utility-button" onClick={() => update(captureScheduleDRecords(investments))}>Copy current investment records for review</button>
      {(data.longTermAssets ?? []).map((row, index) => <fieldset key={row.sourceId ?? index}><legend>Long-term asset {index + 1}{row.description ? ` — ${row.description}` : ''}</legend>
        <SourceIdentity row={row} label={`Asset ${index + 1}`} onChange={patch => update({ longTermAssets: data.longTermAssets?.map((record, i) => i === index ? { ...record, ...patch } : record) })} />
        <p className="guided-hint">Original classification: {row.character || 'not answered'}. Acquired {row.dateAcquired || 'unknown'}; sold {row.dateSold || 'unknown'}. Correct the original transaction above if its identity or classification changed.</p>
        <div className="guided-form-grid">{([['proceeds', 'proceeds'], ['costBasis', 'cost basis'], ['adjustments', 'other adjustments'], ['washSaleDisallowed', 'disallowed wash loss']] as const).map(([key, label]) => <CurrencyField key={key} allowNegative={key === 'adjustments'} label={`Asset ${index + 1} ${label}`} value={row[key] ?? ''} onChange={value => update({ longTermAssets: data.longTermAssets?.map((record, i) => i === index ? { ...record, [key]: value } : record) })} />)}</div>
      </fieldset>)}
      {(data.reportedGains ?? []).map((row, index) => <fieldset key={row.sourceId ?? index}><legend>Reported capital distribution {index + 1}</legend>
        <SourceIdentity row={row} label={`Distribution ${index + 1}`} onChange={patch => update({ reportedGains: data.reportedGains?.map((record, i) => i === index ? { ...record, ...patch } : record) })} />
        <div className="guided-form-grid">{([['netLongTermCapitalGain', 'total capital distributions'], ['collectiblesGain', 'collectibles gain'], ['unrecapturedSection1250Gain', 'unrecaptured section 1250 gain'], ['section1202Gain', 'section 1202 gain']] as const).map(([key, label]) => <CurrencyField key={key} label={`Distribution ${index + 1} ${label}`} value={row[key] ?? ''} onChange={value => update({ reportedGains: data.reportedGains?.map((record, i) => i === index ? { ...record, [key]: value } : record) })} />)}</div>
      </fieldset>)}
      <BooleanFact label="Does this worksheet include every actual capital source and carryover?" value={data.allSourcesIncluded} onChange={allSourcesIncluded => update({ allSourcesIncluded })} />
      <BooleanFact label="Have you reviewed the capital source worksheet after the last edit?" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">Separate AMT amounts, undistributed gains, business property, partnership sales, QSBS and foreign-source methods require their additional original records and supported worksheets. Their saved answers are not treated as zero.</p>
      <button type="button" className="utility-button utility-button-small" onClick={() => onChange(undefined)}>Remove capital source worksheet</button>
    </>}
  </div></details>;
}

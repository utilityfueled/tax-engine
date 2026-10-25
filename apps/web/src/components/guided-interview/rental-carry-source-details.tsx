"use client";
import { updateRentalCarrySources, type RentalCarryoverData, type RentalLossVintageData } from '@/lib/guided-rental-carry-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function RentalCarrySourceDetails({ data, onChange }: { data?: RentalCarryoverData; onChange: (data: RentalCarryoverData | undefined) => void }) {
  const change = (patch: Partial<RentalCarryoverData>) => onChange(updateRentalCarrySources(data ?? {}, patch));
  const changeVintage = (index: number, patch: Partial<RentalLossVintageData>) => change({ vintages: data?.vintages?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <details className="guided-expand"><summary className="guided-expand-trigger">Prior rental loss source history</summary><div className="guided-expand-body">
    <p className="guided-hint">Use this owner’s filed Form 8582 carry and original QBI loss worksheets. Prior amounts are already the owner’s share; current rents and expenses above are full-property amounts. Enter filed whole dollars without rounding unverified records. This year’s allowable deduction is calculated from the complete return.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add actual rental carry sources</button> : <>
      <div className="guided-form-grid">
        {([['sourceTaxYear', 'Carry source return tax year'], ['sourceReference', 'Rental carry packet reference'], ['propertyDescription', 'Original carry property address or legal description'],
          ['ownerName', 'Original rental owner name'], ['ownerTaxpayerIdLast4', 'Original rental owner taxpayer ID last four']] as const).map(([key, label]) => <TextFact key={key} label={label} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
        <label className="guided-field"><span className="guided-field-label">Filed prior return filing status</span><select className="guided-input" value={data.priorFilingStatus ?? ''} onChange={event => change({ priorFilingStatus: event.target.value as RentalCarryoverData['priorFilingStatus'] })}>
          <option value="">Choose from the filed return</option><option value="single">Single</option><option value="mfj">Married filing jointly</option><option value="mfs">Married filing separately</option><option value="hoh">Head of household</option><option value="qss">Qualifying surviving spouse</option>
        </select></label>
      </div>
      {([['sameTaxpayersConfirmed', 'The carry history represents the same taxpayer or same joint spouses'], ['ownershipUnchangedConfirmed', 'The owner and ownership interest are unchanged throughout this carry history'],
        ['activityContinuesConfirmed', 'This same rental activity continues without a disposition transfer or regrouping'], ['ordinaryRentalLossesOnly', 'The packet contains only ordinary passive rental losses without special prior credits or revitalization deductions'],
        ['ownerAmountsConfirmed', 'The prior carry amounts are this owner’s filed share'], ['allPriorLossesIncluded', 'All prior unallowed losses for this owner and activity are included']] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => change({ [key]: value })} />)}
      <h4>Original loss years</h4>
      <p className="guided-hint">Keep each loss year separate. Original qualified amounts come from that year’s rules, including any SSTB limit. Pre-2018 amounts are not QBI. Active participation and material participation are different tests.</p>
      {data.vintages === undefined && <p role="status">The originating loss years are unknown.</p>}
      {data.vintages?.length === 0 && <p>Explicitly recorded: no prior loss vintages.</p>}
      {(data.vintages ?? []).map((row, index) => <fieldset key={index}><legend>Loss year {index + 1}</legend><div className="guided-form-grid">
        <TextFact label={`Loss year ${index + 1} originating tax year`} value={row.taxYear ?? ''} onChange={taxYear => changeVintage(index, { taxYear })} />
        {([['originalLoss', 'original suspended loss'], ['qualifiedOriginalLoss', 'original qualified loss'], ['remainingLoss', 'remaining suspended loss'], ['qualifiedRemainingLoss', 'remaining qualified loss']] as const).map(([key, label]) => <CurrencyField key={key} label={`Loss year ${index + 1} ${label}`} value={row[key] ?? ''} onChange={value => changeVintage(index, { [key]: value })} />)}
      </div>
        <BooleanFact label={`Loss year ${index + 1} active participation in the originating year`} value={row.activelyParticipatedInLossYear} onChange={activelyParticipatedInLossYear => changeVintage(index, { activelyParticipatedInLossYear })} />
        <BooleanFact label={`Loss year ${index + 1} material participation in the current year`} value={row.materiallyParticipatedInCurrentYear} onChange={materiallyParticipatedInCurrentYear => changeVintage(index, { materiallyParticipatedInCurrentYear })} />
        <button type="button" className="utility-button" onClick={() => change({ vintages: data.vintages?.filter((_, i) => i !== index) })}>Remove loss year {index + 1}</button>
      </fieldset>)}
      <div className="guided-form-grid"><button type="button" className="utility-button" onClick={() => change({ vintages: [...(data.vintages ?? []), {}] })}>Add originating loss year</button>
        <button type="button" className="utility-button" onClick={() => change({ vintages: [] })}>Record no prior loss vintages</button></div>
      <h4>Separate AMT comparison</h4>
      <p className="guided-hint">Check the actual alternative-tax records and current passive-loss worksheet separately. A regular carry does not establish an AMT carry. This route supports a verified zero difference; differing or unknown amounts need the separate AMT method.</p>
      <TextFact label="AMT rental comparison source reference" value={data.amtSourceReference ?? ''} onChange={amtSourceReference => change({ amtSourceReference })} />
      {([['amtBasisAndDepreciationMatch', 'AMT rental basis and depreciation match regular tax'], ['amtPriorLossMatches', 'AMT prior suspended loss matches the regular filed carry'], ['amtAllowedLossMatches', 'The completed current AMT passive worksheet has the same allowed loss as regular tax']] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => change({ [key]: value })} />)}
      <BooleanFact label="Rental carry sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove rental carry sources</button>
    </>}
  </div></details>;
}

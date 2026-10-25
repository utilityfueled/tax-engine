"use client";
import { captureQsbsLots, updateQsbsSources, type QsbsSourceData, type QsbsIdentityData, type QsbsIssuerData, type QsbsLotData, type QsbsPriorReturnData } from '@/lib/guided-qsbs-sources';
import type { BrokerageEntryData, DividendEntryData } from '@/lib/guided-interview-flow';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
    <option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}
function Identity({ label, data, onChange }: { label: string; data?: QsbsIdentityData; onChange: (data: QsbsIdentityData) => void }) {
  return <div className="guided-form-grid">{([['firstName', 'first name'], ['lastName', 'last name'], ['ssnLast4', 'ID last four']] as const).map(([key, text]) => <TextFact key={key} label={`${label} ${text}`} value={data?.[key] ?? ''} onChange={value => onChange({ ...data, [key]: value })} />)}</div>;
}
function Issuer({ label, data, onChange, onRemove }: { label: string; data: QsbsIssuerData; onChange: (next: QsbsIssuerData) => void; onRemove: () => void }) {
  const change = (patch: Partial<QsbsIssuerData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-w2-card"><legend>{label}</legend><div className="guided-form-grid">
    {([['issuerId', 'issuer ID'], ['issuerName', 'corporation name'], ['sourceReference', 'corporate source reference'], ['historySourceReference', 'complete prior-use source reference']] as const).map(([key, text]) => <TextFact key={key} label={`${label} ${text}`} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
    <CurrencyField label={`${label} prior eligible gain before exclusion`} hint="Use prior gain taken into account for this issuer, before its exclusion percentage. This is not the prior exclusion amount." value={data.priorEligibleGainUsed ?? ''} onChange={priorEligibleGainUsed => change({ priorEligibleGainUsed })} />
    <BooleanFact label={`${label} all prior use and current dispositions included`} value={data.allPriorUseAndCurrentDispositionsConfirmed} onChange={allPriorUseAndCurrentDispositionsConfirmed => change({ allPriorUseAndCurrentDispositionsConfirmed })} />
    <BooleanFact label={`${label} taxpayer membership and filing status unchanged`} value={data.membershipUnchangedConfirmed} onChange={membershipUnchangedConfirmed => change({ membershipUnchangedConfirmed })} />
  </div>
    {data.priorReturns === undefined && <p role="status">Prior return history is unknown. Record the actual history, including no prior use when established.</p>}
    {(data.priorReturns ?? []).map((row, index) => {
      const prefix = `${label} prior return ${index + 1}`;
      const update = (patch: Partial<QsbsPriorReturnData>) => change({ priorReturns: data.priorReturns?.map((item, i) => i === index ? { ...item, ...patch } : item) });
      return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
        <TextFact label={`${prefix} tax year`} value={row.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label={`${prefix} source reference`} value={row.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
        <Choice label={`${prefix} filing status`} value={row.filingStatus} options={[
          ['single', 'Single'], ['married_filing_jointly', 'Married filing jointly'], ['married_filing_separately', 'Married filing separately'], ['head_of_household', 'Head of household'], ['qualifying_surviving_spouse', 'Qualifying surviving spouse'],
        ]} onChange={filingStatus => update({ filingStatus })} />
        <CurrencyField label={`${prefix} eligible gain used`} value={row.eligibleGainUsed ?? ''} onChange={eligibleGainUsed => update({ eligibleGainUsed })} />
      </div><Identity label={`${prefix} primary`} data={row.primary} onChange={primary => update({ primary })} />
        {row.spouse ? <><Identity label={`${prefix} spouse`} data={row.spouse} onChange={spouse => update({ spouse })} /><button type="button" className="utility-button" onClick={() => update({ spouse: undefined })}>Remove {prefix} spouse identity</button></>
          : <button type="button" className="utility-button" onClick={() => update({ spouse: {} })}>Add {prefix} spouse identity</button>}
        <button type="button" className="utility-button" onClick={() => change({ priorReturns: data.priorReturns?.filter((_, i) => i !== index) })}>Remove {prefix}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => change({ priorReturns: [...(data.priorReturns ?? []), {}] })}>Add {label} prior return</button>
    <button type="button" className="utility-button" onClick={() => change({ priorReturns: [] })}>Record no prior returns for {label}</button>
    <details className="guided-expand"><summary className="guided-expand-trigger">{label} actual gain allocation</summary><p className="guided-hint">A binding issuer limit across different exclusion rates needs the actual allocation worksheet. Link each allocation to its lot ID; do not enter an exclusion or invent an allocation.</p>
      {(data.eligibleGainAllocations ?? []).map((row, index) => {
        const prefix = `${label} allocation ${index + 1}`;
        const update = (patch: Partial<typeof row>) => change({ eligibleGainAllocations: data.eligibleGainAllocations?.map((item, i) => i === index ? { ...item, ...patch } : item) });
        return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
          <TextFact label={`${prefix} lot ID`} value={row.sourceId ?? ''} onChange={sourceId => update({ sourceId })} />
          <CurrencyField label={`${prefix} ordinary eligible gain`} value={row.ordinaryEligibleGain ?? ''} onChange={ordinaryEligibleGain => update({ ordinaryEligibleGain })} />
          <CurrencyField label={`${prefix} empowerment eligible gain`} value={row.empowermentEligibleGain ?? ''} onChange={empowermentEligibleGain => update({ empowermentEligibleGain })} />
        </div><button type="button" className="utility-button" onClick={() => change({ eligibleGainAllocations: data.eligibleGainAllocations?.filter((_, i) => i !== index) })}>Remove {prefix}</button></fieldset>;
      })}
      <button type="button" className="utility-button" onClick={() => change({ eligibleGainAllocations: [...(data.eligibleGainAllocations ?? []), {}] })}>Add {label} gain allocation</button>
      <button type="button" className="utility-button" onClick={() => change({ eligibleGainAllocations: undefined })}>Use no explicit allocation for {label}</button>
    </details><button type="button" className="utility-button" onClick={onRemove}>Remove {label}</button>
  </fieldset>;
}
function Lot({ label, data, onChange, onRemove }: { label: string; data: QsbsLotData; onChange: (next: QsbsLotData) => void; onRemove: () => void }) {
  const change = (patch: Partial<QsbsLotData>) => onChange({ ...data, ...patch });
  const qualification = data.qualification;
  return <fieldset className="guided-w2-card"><legend>{label}</legend><div className="guided-form-grid">
    {([['lotId', 'lot ID'], ['sourceId', 'original source link'], ['issuerId', 'issuer ID'], ['sourceReference', 'lot source reference'], ['payerName', 'original payer'], ['securityDescription', 'security description']] as const).map(([key, text]) => <TextFact key={key} label={`${label} ${text}`} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
    <Choice label={`${label} actual owner`} value={data.accountHolder} options={[[ 'primary', 'Primary taxpayer' ], [ 'spouse', 'Joint spouse' ]]} onChange={accountHolder => change({ accountHolder })} />
    <Choice label={`${label} acquisition method`} value={data.acquisitionMethod} options={[
      ['original_issue', 'Original issue'], ['gift', 'Gift requiring predecessor records'], ['inheritance', 'Inheritance requiring predecessor records'], ['partnership_distribution', 'Partnership distribution'], ['conversion', 'Conversion'], ['section351_or_368', 'Section351 or368 exchange'],
    ]} onChange={acquisitionMethod => change({ acquisitionMethod })} />
    {([['originalIssueDate', 'original issue date'], ['effectiveAcquiredDate', 'effective acquisition date'], ['dateSold', 'actual sale date']] as const).map(([key, text]) => <TextFact key={key} label={`${label} ${text}`} type="date" value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
    {([['recognizedGain', 'original recognized gain before exclusion'], ['basisIgnoringPostIssueAdditions', 'basis ignoring post-issue additions'], ['empowermentZoneGainThrough2018', 'empowerment gain attributable through2018']] as const).map(([key, text]) => <CurrencyField key={key} label={`${label} ${text}`} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
    <BooleanFact label={`${label} positive empowerment attribution and qualification established`} value={data.empowermentQualificationAndAttributionConfirmed} onChange={empowermentQualificationAndAttributionConfirmed => change({ empowermentQualificationAndAttributionConfirmed })} />
  </div>
    <fieldset><legend>{label} corporate qualification records</legend><p className="guided-hint">Use the actual issuer records for original issuance, all predecessors and controlled groups, qualifying active business and redemption restrictions. A QSBS label or a payer statement alone does not answer these tests.</p><div className="guided-form-grid">
      {([['domesticCCorporationAtIssue', 'domestic C corporation at issue'], ['allPredecessorAndControlledGroupAssetsIncluded', 'all predecessor and controlled-group assets included'], ['cCorporationThroughoutHolding', 'C corporation throughout the required holding period'], ['activeBusinessRequirementSatisfied', 'qualified active-business requirement satisfied'], ['redemptionRestrictionsSatisfied', 'redemption restrictions satisfied'], ['offsettingPositionPresent', 'offsetting position present']] as const).map(([key, text]) => <BooleanFact key={key} label={`${label} ${text}`} value={qualification?.[key]} onChange={value => change({ qualification: { ...qualification, [key]: value } })} />)}
      <Choice label={`${label} original consideration`} value={qualification?.consideration} options={[[ 'money', 'Money' ], [ 'property_not_stock', 'Property other than stock' ], [ 'services_not_underwriter', 'Services other than underwriting' ], [ 'stock', 'Stock' ], [ 'other', 'Other consideration' ]]} onChange={consideration => change({ qualification: { ...qualification, consideration } })} />
      <CurrencyField label={`${label} maximum gross assets before issue`} value={qualification?.maxGrossAssetsBeforeIssue ?? ''} onChange={maxGrossAssetsBeforeIssue => change({ qualification: { ...qualification, maxGrossAssetsBeforeIssue } })} />
      <CurrencyField label={`${label} gross assets immediately after issue`} value={qualification?.grossAssetsImmediatelyAfterIssue ?? ''} onChange={grossAssetsImmediatelyAfterIssue => change({ qualification: { ...qualification, grossAssetsImmediatelyAfterIssue } })} />
    </div></fieldset>
    <fieldset><legend>{label} original brokerage amounts</legend><p className="guided-hint">Use these only for an original brokerage sale. Fund issuer lots use the ownership records below. Clearing a value restores unknown.</p><div className="guided-form-grid">
      {([['proceeds', 'original proceeds'], ['costBasis', 'original cost basis'], ['adjustments', 'original adjustments'], ['washSaleDisallowed', 'original wash-sale amount']] as const).map(([key, text]) => <CurrencyField key={key} label={`${label} ${text}`} value={data[key] ?? ''} onChange={value => change({ [key]: value })} />)}
      <BooleanFact label={`${label} original wash-sale answer`} value={data.washSale} onChange={washSale => change({ washSale })} />
    </div><button type="button" className="utility-button" onClick={() => change({ proceeds: undefined, costBasis: undefined, adjustments: undefined, washSale: undefined, washSaleDisallowed: undefined })}>Remove {label} brokerage amounts</button></fieldset>
    {!data.passThrough ? <button type="button" className="utility-button" onClick={() => change({ passThrough: {} })}>Add {label} fund ownership sources</button> : <fieldset><legend>{label} original fund ownership</legend><div className="guided-form-grid">
      <TextFact label={`${label} owner interest acquisition date`} type="date" value={data.passThrough.ownerInterestAcquiredDate ?? ''} onChange={ownerInterestAcquiredDate => change({ passThrough: { ...data.passThrough, ownerInterestAcquiredDate } })} />
      <BooleanFact label={`${label} interest held continuously through sale`} value={data.passThrough.heldContinuouslyThroughSale} onChange={heldContinuouslyThroughSale => change({ passThrough: { ...data.passThrough, heldContinuouslyThroughSale } })} />
      <BooleanFact label={`${label} ownership proportion unchanged`} value={data.passThrough.unchangedOwnershipProportionConfirmed} onChange={unchangedOwnershipProportionConfirmed => change({ passThrough: { ...data.passThrough, unchangedOwnershipProportionConfirmed } })} />
      <TextFact label={`${label} original ownership percentage`} value={data.passThrough.ownershipPercentage ?? ''} onChange={ownershipPercentage => change({ passThrough: { ...data.passThrough, ownershipPercentage } })} />
      {([['entityRecognizedGain', 'original entity recognized gain'], ['entityBasisIgnoringPostIssueAdditions', 'original entity basis ignoring additions'], ['fundCapitalGainDistributions', 'original fund Box2a'], ['fundSection1202Gain', 'original fund Box2c']] as const).map(([key, text]) => <CurrencyField key={key} label={`${label} ${text}`} value={data.passThrough?.[key] ?? ''} onChange={value => change({ passThrough: { ...data.passThrough, [key]: value } })} />)}
    </div><button type="button" className="utility-button" onClick={() => change({ passThrough: undefined })}>Remove {label} fund ownership sources</button></fieldset>}
    <button type="button" className="utility-button" onClick={onRemove}>Remove {label}</button>
  </fieldset>;
}
export function QsbsSourceDetails({ data, investments, onChange }: { data?: QsbsSourceData; investments: { brokerageEntries: BrokerageEntryData[]; dividendEntries: DividendEntryData[] }; onChange: (next: QsbsSourceData | undefined) => void }) {
  const change = (patch: Partial<QsbsSourceData>) => onChange(updateQsbsSources(data ?? {}, patch));
  return <details className="guided-expand"><summary className="guided-expand-trigger">Small business stock issuer and lot sources</summary><div className="guided-expand-body">
    <p className="guided-hint">Keep the full original sale or fund distribution above. Enter the original issuer, qualification and prior-use records here; the return computes the exclusion and alternative-tax amount. Transfer, changing ownership and offsetting-position methods need their separate source worksheets.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add actual QSBS issuer sources</button> : <>
      <div className="guided-form-grid"><TextFact label="QSBS original source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label="QSBS source packet reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        <BooleanFact label="All original QSBS sources included" value={data.allSourcesIncluded} onChange={allSourcesIncluded => change({ allSourcesIncluded })} />
        <BooleanFact label="Original amounts are before the QSBS exclusion" value={data.preExclusionAmountsConfirmed} onChange={preExclusionAmountsConfirmed => change({ preExclusionAmountsConfirmed })} />
      </div><Identity label="QSBS primary" data={data.primary} onChange={primary => change({ primary })} />
      {data.spouse ? <><Identity label="QSBS spouse" data={data.spouse} onChange={spouse => change({ spouse })} /><button type="button" className="utility-button" onClick={() => change({ spouse: undefined })}>Remove QSBS spouse identity</button></>
        : <button type="button" className="utility-button" onClick={() => change({ spouse: {} })}>Add QSBS spouse identity</button>}
      {(data.issuers ?? []).map((issuer, index) => <Issuer key={index} label={`Issuer ${index + 1}`} data={issuer} onChange={next => change({ issuers: data.issuers?.map((row, i) => i === index ? next : row) })} onRemove={() => change({ issuers: data.issuers?.filter((_, i) => i !== index) })} />)}
      <button type="button" className="utility-button" onClick={() => change({ issuers: [...(data.issuers ?? []), {}] })}>Add issuer history</button>
      {(data.lots ?? []).map((lot, index) => <Lot key={index} label={`Lot ${index + 1}`} data={lot} onChange={next => change({ lots: data.lots?.map((row, i) => i === index ? next : row) })} onRemove={() => change({ lots: data.lots?.filter((_, i) => i !== index) })} />)}
      <button type="button" className="utility-button" onClick={() => change({ lots: [...(data.lots ?? []), {}] })}>Add original issuer lot</button>
      <button type="button" className="utility-button" onClick={() => change({ lots: [...(data.lots ?? []), ...captureQsbsLots(investments)] })}>Add snapshots of entered QSBS sources</button>
      <BooleanFact label="QSBS sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove QSBS source packet</button>
    </>}
  </div></details>;
}

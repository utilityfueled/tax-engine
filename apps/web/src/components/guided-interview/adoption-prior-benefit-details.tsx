'use client';
import type { AdoptionPriorBenefitHistoryData, AdoptionPriorBenefitRecordData } from '@/lib/guided-adoption-prior-benefits';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
export function AdoptionPriorBenefitDetails({ data, onChange }: { data: AdoptionPriorBenefitHistoryData | undefined; onChange: (data: AdoptionPriorBenefitHistoryData | undefined) => void }) {
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add historical employer-benefit sources</button>;
  const update = (patch: Partial<AdoptionPriorBenefitHistoryData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-fieldset"><legend>Foreign-adoption benefits received in prior years</legend>
    <p className="guided-hint">Use original employer records and prior returns for benefits already included in income before this adoption became final. Enter each original statement and the amount allocated to this child. Reuse the same source ID when an original statement covers multiple children. The calculation checks the combined allocations.</p>
    {([['sourceTaxYear', 'Historical benefit worksheet tax year'], ['sourceReference', 'Historical benefit worksheet reference'],
      ['childNameOnSource', 'Child name on the historical source'], ['childIdentifyingNumberLast4', 'Child identifying number last four digits on the historical source']] as const)
      .map(([field, label]) => <TextFact key={field} label={label} value={data[field] ?? ''} onChange={value => update({ [field]: value })} />)}
    <BooleanFact label="All prior employer benefits for this child are included" value={data.allPriorBenefitsIncluded} onChange={value => update({ allPriorBenefitsIncluded: value })} />
    <BooleanFact label="The historical benefit recipients remain the same taxpayers on this return" value={data.returnMembershipUnchangedConfirmed} onChange={value => update({ returnMembershipUnchangedConfirmed: value })} />
    <BooleanFact label="Did another adopter outside this return receive benefits for this child?" value={data.otherAdopterReceivedBenefits} onChange={value => update({ otherAdopterReceivedBenefits: value })} />
    <p className="guided-hint">Another adopter's benefits require a separate agreed-limit worksheet. This history method covers unchanged recipients with actual zero exclusion-limit use before foreign finality.</p>
    <CurrencyField label="Actual prior exclusion limit used from the history" value={data.priorExclusionLimitUsed ?? ''} onChange={value => update({ priorExclusionLimitUsed: value })} />
    <BooleanFact label="The prior exclusion limit usage was checked against actual returns" value={data.priorExclusionHistoryConfirmed} onChange={value => update({ priorExclusionHistoryConfirmed: value })} />
    {(data.records ?? []).map((row, index) => {
      const label = `Prior benefit ${index + 1}`;
      const change = (patch: Partial<AdoptionPriorBenefitRecordData>) => update({ records: data.records?.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry) });
      return <fieldset className="guided-fieldset" key={index}><legend>{label}</legend>
        {([['sourceId', 'original source ID'], ['taxYear', 'actual receipt year'], ['employerName', 'employer name'], ['employerEin', 'employer EIN'],
          ['recipientName', 'recipient name'], ['recipientTaxpayerIdLast4', 'recipient taxpayer number last four digits']] as const)
          .map(([field, suffix]) => <TextFact key={field} label={`${label} ${suffix}`} value={row[field] ?? ''} onChange={value => change({ [field]: value })} />)}
        <label className="guided-field"><span className="guided-field-label">{label} actual recipient</span><select className="guided-input" value={row.accountHolder ?? ''} onChange={event => change({ accountHolder: event.target.value === '' ? undefined : event.target.value as 'primary' | 'spouse' })}><option value="">Select from the original source</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on this joint return</option></select></label>
        <CurrencyField label={`${label} original benefits`} value={row.originalEmployerBenefits ?? ''} onChange={value => change({ originalEmployerBenefits: value })} />
        <CurrencyField label={`${label} amount allocated to this child`} value={row.benefitsAllocatedToChild ?? ''} onChange={value => change({ benefitsAllocatedToChild: value })} />
        <BooleanFact label={`${label} allocated amount was included in prior income`} value={row.allocatedBenefitsIncludedInPriorIncome} onChange={value => change({ allocatedBenefitsIncludedInPriorIncome: value })} />
        <BooleanFact label={`${label} employer assistance plan qualified for exclusion`} value={row.employerPlanQualified} onChange={value => change({ employerPlanQualified: value })} />
        <button type="button" className="utility-button" onClick={() => update({ records: data.records?.filter((_, entryIndex) => entryIndex !== index) })}>Remove prior benefit statement {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => update({ records: [...(data.records ?? []), {}] })}>Add original prior benefit statement</button>
    <button type="button" className="utility-button" onClick={() => update({ records: [] })}>Record no prior benefit statements</button>
    <p className="guided-hint">Qualified plans must satisfy the IRS written-plan and employee rules, including the restriction for more-than-2% S corporation shareholders. Keep prior benefits separate from current W-2 Box12 codeT and unreimbursed adoption expenses.</p>
    <BooleanFact label="Historical benefit sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value => update({ sourceFactsConfirmed: value })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove historical employer-benefit sources</button>
  </fieldset>;
}

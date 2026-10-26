"use client";
import type { FilingStatus, PersonalInfoData } from '@/lib/guided-interview-flow';
import { copyEicSeparatedHousehold, updateEicSeparatedSources, type EicSeparatedSpouseData, type EicSeparatedChildData } from '@/lib/guided-eic-separated-spouse';
import { BooleanFact, TextFact } from './fact-fields';

function ChildSources({ data, index, onChange }: { data: EicSeparatedChildData; index: number; onChange: (next: EicSeparatedChildData) => void }) {
  const prefix = `Child ${index + 1}`;
  const update = (patch: Partial<EicSeparatedChildData>) => onChange({ ...data, ...patch });
  return <fieldset className="guided-card">
    <legend>{prefix}: {data.original?.firstName} {data.original?.lastName}</legend>
    <p className="guided-hint">Original record {data.sourceId ?? 'not copied'}: birth date {data.original?.dateOfBirth || 'unknown'}, relationship {data.original?.relationship || 'unknown'}, residence months {data.original?.monthsLivedWithYou ?? 'unknown'}. The copied identifier is {data.original?.ssn === '' ? 'actually blank' : data.original?.ssn ? 'retained locally' : 'unknown'}. Correct original household fields above and copy them again if needed.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label={`${prefix}: lived with you in the United States for more than half the applicable year`} value={data.livedWithTaxpayerInUnitedStatesMoreThanHalfYear} onChange={livedWithTaxpayerInUnitedStatesMoreThanHalfYear => update({ livedWithTaxpayerInUnitedStatesMoreThanHalfYear })} />
      <BooleanFact label={`${prefix}: uses a special residence-period rule`} value={data.specialResidencePeriodClaimed} onChange={specialResidencePeriodClaimed => update({ specialResidencePeriodClaimed })} />
      <BooleanFact label={`${prefix}: married at year end`} value={data.marriedAtYearEnd} onChange={marriedAtYearEnd => update({ marriedAtYearEnd })} />
      <BooleanFact label={`${prefix}: filed a joint return`} value={data.jointReturnFiled} onChange={jointReturnFiled => update({ jointReturnFiled })} />
      {(data.jointReturnFiled === true || data.jointReturnRefundOnly != null) && <BooleanFact label={`${prefix}: joint return was only for a withholding or estimated-tax refund`} value={data.jointReturnRefundOnly} onChange={jointReturnRefundOnly => update({ jointReturnRefundOnly })} />}
      <BooleanFact label={`${prefix}: full-time student during at least five months`} value={data.fullTimeStudentForFiveMonths} onChange={fullTimeStudentForFiveMonths => update({ fullTimeStudentForFiveMonths })} />
      <BooleanFact label={`${prefix}: permanently and totally disabled`} value={data.permanentlyAndTotallyDisabled} onChange={permanentlyAndTotallyDisabled => update({ permanentlyAndTotallyDisabled })} />
      {(data.original?.relationship === 'foster-child' || data.authorizedFosterPlacement != null) && <BooleanFact label={`${prefix}: placed by an authorized agency or court order`} value={data.authorizedFosterPlacement} onChange={authorizedFosterPlacement => update({ authorizedFosterPlacement })} />}
      <BooleanFact label={`${prefix}: timely valid employment-authorized SSN`} value={data.validSsnIssuedByDueDate} onChange={validSsnIssuedByDueDate => update({ validSsnIssuedByDueDate })} />
    </div>
    <p className="guided-hint">A qualifying child without a timely valid SSN may establish the separated-spouse exception while the credit uses the self-only amount. Keep an actual ITIN, nonwork SSN or original blank in the household record. The higher child amount requires a valid SSN. Student and disability answers are needed only when relevant to the child’s age. Married-child, special-period and contested-claim methods need further support.</p>
    <p className="guided-hint">Record every other person eligible to claim this child under the EIC qualifying-child rules. The shared benefits include EIC, child tax credit, head-of-household status, child-care credit and dependent-care benefit exclusion. The ordinary parent agreement route requires that each other eligible person claims none of those benefits for this child.</p>
    {data.otherEligibleClaimants === undefined ? <button type="button" className="guided-add-button" onClick={() => update({ otherEligibleClaimants: [] })}>{prefix}: record no other eligible claimants</button> : data.otherEligibleClaimants.length === 0 ? <p className="guided-hint">Actual record: no other eligible claimants.</p> : null}
    {(data.otherEligibleClaimants ?? []).map((other, otherIndex) => <fieldset className="guided-card" key={otherIndex}>
      <legend>{prefix}, other claimant {otherIndex + 1}</legend>
      <TextFact label={`${prefix}, claimant ${otherIndex + 1}: name`} value={other.name ?? ''} onChange={name => update({ otherEligibleClaimants: data.otherEligibleClaimants?.map((row, i) => i === otherIndex ? { ...row, name } : row) })} />
      <TextFact label={`${prefix}, claimant ${otherIndex + 1}: source reference`} value={other.sourceReference ?? ''} onChange={sourceReference => update({ otherEligibleClaimants: data.otherEligibleClaimants?.map((row, i) => i === otherIndex ? { ...row, sourceReference } : row) })} />
      <BooleanFact label={`${prefix}, claimant ${otherIndex + 1}: claims any of the shared child tax benefits`} value={other.claimsAnyChildTaxBenefit} onChange={claimsAnyChildTaxBenefit => update({ otherEligibleClaimants: data.otherEligibleClaimants?.map((row, i) => i === otherIndex ? { ...row, claimsAnyChildTaxBenefit } : row) })} />
      <button type="button" className="guided-card-remove" onClick={() => update({ otherEligibleClaimants: data.otherEligibleClaimants?.filter((_, i) => i !== otherIndex), allOtherEligibleClaimantsIncluded: null })}>Remove {prefix.toLowerCase()} claimant {otherIndex + 1}</button>
    </fieldset>)}
    <button type="button" className="guided-add-button" onClick={() => update({ otherEligibleClaimants: [...(data.otherEligibleClaimants ?? []), {}], allOtherEligibleClaimantsIncluded: null })}>{prefix}: add another eligible claimant</button>
    {data.otherEligibleClaimants !== undefined && <button type="button" className="guided-card-remove" onClick={() => update({ otherEligibleClaimants: undefined, allOtherEligibleClaimantsIncluded: null })}>{prefix}: mark claimant history unknown</button>}
    <BooleanFact label={`${prefix}: all other eligible claimants recorded`} value={data.allOtherEligibleClaimantsIncluded} onChange={allOtherEligibleClaimantsIncluded => update({ allOtherEligibleClaimantsIncluded })} />
  </fieldset>;
}

export function EicSeparatedSpouseDetails({ personal, filingStatus, onChange }: {
  personal: PersonalInfoData; filingStatus: FilingStatus | null; onChange: (next: EicSeparatedSpouseData | undefined) => void;
}) {
  const data = personal.eicSeparatedSpouseSources;
  if (data === undefined && filingStatus !== 'mfs' && filingStatus !== 'hoh') return null;
  const update = (patch: Partial<EicSeparatedSpouseData>) => onChange(updateEicSeparatedSources(data ?? {}, patch));
  const instrument = data?.separationInstrument;
  return <details className="guided-card">
    <summary>Separated-spouse Earned Income Credit records</summary>
    <p className="guided-hint">If you were married and file separately or as head of household, record the actual Rule 3 separation and child facts. This does not establish head-of-household filing status. Both alternatives are independent: principal homes apart throughout the final six months, or a qualifying state-law agreement/decree plus different households at year end.</p>
    {!data ? <button type="button" className="guided-add-button" onClick={() => onChange({})}>Add separated-spouse EIC records</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Separated-spouse source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="Separated-spouse source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
        <TextFact label="Actual applicable tax year start" type="date" value={data.applicableYearStart ?? ''} onChange={applicableYearStart => update({ applicableYearStart })} />
        <TextFact label="Actual applicable tax year end" type="date" value={data.applicableYearEnd ?? ''} onChange={applicableYearEnd => update({ applicableYearEnd })} />
        <BooleanFact label="Married at the end of the applicable year" value={data.marriedAtYearEnd} onChange={marriedAtYearEnd => update({ marriedAtYearEnd })} />
        <BooleanFact label="Principal homes were apart throughout the last six months" value={data.principalHomesApartLastSixMonths} onChange={principalHomesApartLastSixMonths => update({ principalHomesApartLastSixMonths })} />
        <BooleanFact label="Legally separated under a qualifying state-law agreement or decree" value={data.legallySeparatedUnderStateLaw} onChange={legallySeparatedUnderStateLaw => update({ legallySeparatedUnderStateLaw })} />
        <BooleanFact label="Different households at the end of the applicable year" value={data.differentHouseholdsAtYearEnd} onChange={differentHouseholdsAtYearEnd => update({ differentHouseholdsAtYearEnd })} />
      </div>
      <p className="guided-hint">Use actual applicable-year records; this ordinary route currently supports a complete calendar tax year. A death-year or other short-year method requires separate support. An unused alternative can remain unknown, but supplied answers must agree.</p>
      {!instrument ? <button type="button" className="guided-add-button" onClick={() => update({ separationInstrument: {} })}>Add the actual separation instrument</button> : <fieldset className="guided-card">
        <legend>Actual state-law separation instrument</legend>
        <label className="guided-field"><span className="guided-field-label">Separation instrument type</span><select className="guided-select" value={instrument.kind ?? ''} onChange={event => update({ separationInstrument: { ...instrument, kind: event.target.value === 'written-separation-agreement' || event.target.value === 'decree-of-separate-maintenance' ? event.target.value : undefined } })}>
          <option value="">Not known yet</option><option value="written-separation-agreement">Written separation agreement</option><option value="decree-of-separate-maintenance">Decree of separate maintenance</option>
        </select></label>
        <TextFact label="Separation instrument state abbreviation" value={instrument.state ?? ''} onChange={state => update({ separationInstrument: { ...instrument, state } })} />
        <TextFact label="Separation instrument effective date" type="date" value={instrument.effectiveDate ?? ''} onChange={effectiveDate => update({ separationInstrument: { ...instrument, effectiveDate } })} />
        <TextFact label="Separation instrument source reference" value={instrument.sourceReference ?? ''} onChange={sourceReference => update({ separationInstrument: { ...instrument, sourceReference } })} />
        <button type="button" className="guided-card-remove" onClick={() => update({ separationInstrument: undefined })}>Remove separation instrument</button>
      </fieldset>}
      <button type="button" className="guided-add-button" onClick={() => onChange(copyEicSeparatedHousehold(personal, data))}>Copy current household originals</button>
      <p className="guided-hint">Copy the actual household names, identifiers, birth dates, relationships and residence months entered above. This also records an actual empty candidate list when appropriate. Re-copying clears child answers for review; it does not answer the source questions or establish eligibility.</p>
      {data.taxpayer && <p className="guided-hint">Original claimant: {data.taxpayer.firstName} {data.taxpayer.lastName}; birth date {data.taxpayer.dateOfBirth || 'unknown'}. Identifier retained locally.</p>}
      {data.children?.map((child, index) => <ChildSources key={child.sourceId ?? index} data={child} index={index} onChange={next => update({ children: data.children?.map((row, i) => i === index ? next : row) })} />)}
      <BooleanFact label="All candidate children have original source records" value={data.allCandidateChildrenIncluded} onChange={allCandidateChildrenIncluded => update({ allCandidateChildrenIncluded })} />
      <BooleanFact label="Separated-spouse sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">Keep the EIC claimant records above complete as well. These records remain local until you explicitly request an operation that uses them. <a href="https://www.irs.gov/publications/p596" target="_blank" rel="noreferrer">IRS Publication 596</a> explains the conditions.</p>
      <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>Remove separated-spouse EIC records</button>
    </>}
  </details>;
}

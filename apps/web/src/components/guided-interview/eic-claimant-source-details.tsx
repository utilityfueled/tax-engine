"use client";
import type { FilingStatus } from '@/lib/guided-interview-flow';
import { updateEicClaimantSources, type EicClaimantEligibilityData, type EicChildlessClaimantData } from '@/lib/guided-eic-eligibility';
import { BooleanFact, TextFact } from './fact-fields';

function ChildlessSourceFields({ data, spouse, dependent, onChange }: {
  data: EicChildlessClaimantData | undefined;
  spouse: boolean;
  dependent: boolean | null | undefined;
  onChange: (data: EicChildlessClaimantData) => void;
}) {
  const whose = spouse ? "Your spouse's" : 'Your';
  const update = (patch: Partial<EicChildlessClaimantData>) => onChange({ ...data, ...patch });
  const exception = data?.dependentException;
  return <fieldset className="guided-card">
    <legend>{spouse ? "Your spouse's childless EIC sources" : 'Your childless EIC sources'}</legend>
    <div className="guided-form-grid">
      <BooleanFact label={`${whose} main home was in the United States for more than half of the applicable tax year`} value={data?.mainHomeInUnitedStatesMoreThanHalfYear} onChange={mainHomeInUnitedStatesMoreThanHalfYear => update({ mainHomeInUnitedStatesMoreThanHalfYear })} />
      <BooleanFact label={`${whose} main-home answer counts military duty outside the United States`} value={data?.countedMilitaryDutyOutsideUnitedStates} onChange={countedMilitaryDutyOutsideUnitedStates => update({ countedMilitaryDutyOutsideUnitedStates })} />
      {(data?.countedMilitaryDutyOutsideUnitedStates === true || data?.militaryDutySourceReference !== undefined || data?.extendedActiveDutyOrderOver90DaysOrIndefinite != null) && <>
        <TextFact label={`${whose} military-duty source reference`} value={data?.militaryDutySourceReference ?? ''} onChange={militaryDutySourceReference => update({ militaryDutySourceReference })} />
        <BooleanFact label={`${whose} active-duty order was for more than 90 days or indefinite`} value={data?.extendedActiveDutyOrderOver90DaysOrIndefinite} onChange={extendedActiveDutyOrderOver90DaysOrIndefinite => update({ extendedActiveDutyOrderOver90DaysOrIndefinite })} />
      </>}
    </div>
    {(dependent === true || exception !== undefined) && <>
      <p className="guided-hint">The household record says this filer may be claimed as a dependent. The narrow filing exception needs actual records for every person who could claim this filer.</p>
      {exception === undefined ? <button type="button" className="guided-add-button" onClick={() => update({ dependentException: {} })}>{spouse ? "Add your spouse's dependency filing-exception records" : 'Add your dependency filing-exception records'}</button> : <div className="guided-form-grid">
        <TextFact label={`${whose} dependency filing-exception source reference`} value={exception.sourceReference ?? ''} onChange={sourceReference => update({ dependentException: { ...exception, sourceReference } })} />
        <BooleanFact label={`${whose} potential claimants were all not required to file`} value={exception.allPotentialClaimantsNotRequiredToFile} onChange={allPotentialClaimantsNotRequiredToFile => update({ dependentException: { ...exception, allPotentialClaimantsNotRequiredToFile } })} />
        <BooleanFact label={`${whose} potential claimants all did not file or filed only for withholding or estimated-tax refunds`} value={exception.allPotentialClaimantsDidNotFileOrRefundOnly} onChange={allPotentialClaimantsDidNotFileOrRefundOnly => update({ dependentException: { ...exception, allPotentialClaimantsDidNotFileOrRefundOnly } })} />
        <button type="button" className="guided-card-remove" onClick={() => update({ dependentException: undefined })}>Remove {spouse ? "spouse's" : 'your'} dependency exception</button>
      </div>}
    </>}
  </fieldset>;
}

export function EicClaimantSourceDetails({ data, filingStatus, childless, primaryDependent, spouseDependent, onChange }: {
  data: EicClaimantEligibilityData | undefined;
  filingStatus: FilingStatus | null;
  childless: boolean;
  primaryDependent: boolean | null | undefined;
  spouseDependent: boolean | null | undefined;
  onChange: (data: EicClaimantEligibilityData | undefined) => void;
}) {
  const update = (patch: Partial<EicClaimantEligibilityData>) => onChange(updateEicClaimantSources(data ?? {}, patch));
  const updateOtherChild = (spouse: boolean, value: boolean | null) => {
    const currentKey = spouse ? 'spouseQualifyingChildOfAnotherTaxpayer' : 'primaryQualifyingChildOfAnotherTaxpayer';
    const preservedKey = spouse ? 'spouseChildless' : 'primaryChildless';
    const preserved = data?.[preservedKey];
    update({ [currentKey]: value, ...(preserved?.qualifyingChildOfAnotherTaxpayer !== undefined
      ? { [preservedKey]: { ...preserved, qualifyingChildOfAnotherTaxpayer: value } } : {}) });
  };
  return <details className="guided-card">
    <summary>Earned Income Credit claimant records</summary>
    <p className="guided-hint">Record actual claimant facts for the Earned Income Credit. Both joint filers need an eligible SSN. Valid work authorization must be current where required; an ITIN or a nonwork SSN does not meet this requirement. Other EIC qualifying-child, income and recertification requirements still apply.</p>
    {!data ? <button type="button" className="guided-add-button" onClick={() => onChange({})}>Add EIC claimant sources</button> : <>
      <div className="guided-form-grid">
        <TextFact label="EIC claimant source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="EIC claimant source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
        <BooleanFact label="Were you a nonresident alien for any part of the tax year?" value={data.primaryNonresidentAlienDuringYear} onChange={primaryNonresidentAlienDuringYear => update({ primaryNonresidentAlienDuringYear })} />
        {filingStatus === 'mfj' && <BooleanFact label="Was your spouse a nonresident alien for any part of the tax year?" value={data.spouseNonresidentAlienDuringYear} onChange={spouseNonresidentAlienDuringYear => update({ spouseNonresidentAlienDuringYear })} />}
        {(filingStatus === 'mfj' || data.residentJointElection != null) && <BooleanFact label="Valid joint resident election under section 6013(g) or (h)" value={data.residentJointElection} onChange={residentJointElection => update({ residentJointElection })} />}
        <BooleanFact label="You are another taxpayer’s qualifying child for EIC" value={data.primaryQualifyingChildOfAnotherTaxpayer !== undefined ? data.primaryQualifyingChildOfAnotherTaxpayer : data.primaryChildless?.qualifyingChildOfAnotherTaxpayer} onChange={value => updateOtherChild(false, value)} />
        {filingStatus === 'mfj' && <BooleanFact label="Your spouse is another taxpayer’s qualifying child for EIC" value={data.spouseQualifyingChildOfAnotherTaxpayer !== undefined ? data.spouseQualifyingChildOfAnotherTaxpayer : data.spouseChildless?.qualifyingChildOfAnotherTaxpayer} onChange={value => updateOtherChild(true, value)} />}
      </div>
      <p className="guided-hint">For another taxpayer’s qualifying-child answer, apply the EIC relationship, age, home and joint-return rules, including the exception for a person not required to file who does not file or files only for a withholding or estimated-tax refund. A dependency answer alone does not settle this question. This restriction also applies when you have a qualifying child of your own.</p>
      {childless && <>
        <p className="guided-hint">Both joint filers need their own qualifying main home and dependency answers. The United States means the 50 states and District of Columbia. Use the EIC main-home test for the applicable taxable year, including a decedent’s final return; general residency months do not answer it. Keep the actual home and period records with your source reference. No day count is inferred.</p>
        <ChildlessSourceFields data={data.primaryChildless} spouse={false} dependent={primaryDependent} onChange={primaryChildless => update({ primaryChildless })} />
        {filingStatus === 'mfj' && <ChildlessSourceFields data={data.spouseChildless} spouse dependent={spouseDependent} onChange={spouseChildless => update({ spouseChildless })} />}
      </>}
      <BooleanFact label="EIC claimant sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">Use the birth dates and actual death-status answers in your household records. Residency months are not an answer to the nonresident-alien question. If a joint resident election applies, keep that answer consistent with the standard-deduction records.</p>
      <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>Remove EIC claimant sources</button>
    </>}
  </details>;
}

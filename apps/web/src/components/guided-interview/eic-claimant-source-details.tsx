"use client";
import type { FilingStatus } from '@/lib/guided-interview-flow';
import { updateEicClaimantSources, type EicClaimantEligibilityData } from '@/lib/guided-eic-eligibility';
import { BooleanFact, TextFact } from './fact-fields';

export function EicClaimantSourceDetails({ data, filingStatus, onChange }: {
  data: EicClaimantEligibilityData | undefined;
  filingStatus: FilingStatus | null;
  onChange: (data: EicClaimantEligibilityData | undefined) => void;
}) {
  const update = (patch: Partial<EicClaimantEligibilityData>) => onChange(updateEicClaimantSources(data ?? {}, patch));
  return <details className="guided-card">
    <summary>Earned Income Credit claimant records</summary>
    <p className="guided-hint">Record actual claimant residency and identification facts for the Earned Income Credit. Both joint filers need an eligible SSN. Valid work authorization must be current where required; an ITIN or a nonwork SSN does not meet this requirement. These records cover claimant identification, residency status and childless age. Other EIC eligibility requirements still apply.</p>
    {!data ? <button type="button" className="guided-add-button" onClick={() => onChange({})}>Add EIC claimant sources</button> : <>
      <div className="guided-form-grid">
        <TextFact label="EIC claimant source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
        <TextFact label="EIC claimant source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
        <BooleanFact label="Were you a nonresident alien for any part of the tax year?" value={data.primaryNonresidentAlienDuringYear} onChange={primaryNonresidentAlienDuringYear => update({ primaryNonresidentAlienDuringYear })} />
        {filingStatus === 'mfj' && <BooleanFact label="Was your spouse a nonresident alien for any part of the tax year?" value={data.spouseNonresidentAlienDuringYear} onChange={spouseNonresidentAlienDuringYear => update({ spouseNonresidentAlienDuringYear })} />}
        {(filingStatus === 'mfj' || data.residentJointElection != null) && <BooleanFact label="Valid joint resident election under section 6013(g) or (h)" value={data.residentJointElection} onChange={residentJointElection => update({ residentJointElection })} />}
        <BooleanFact label="EIC claimant sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      </div>
      <p className="guided-hint">Use the birth dates and actual death-status answers in your household records. Residency months are not an answer to the nonresident-alien question. If a joint resident election applies, keep that answer consistent with the standard-deduction records.</p>
      <button type="button" className="guided-card-remove" onClick={() => onChange(undefined)}>Remove EIC claimant sources</button>
    </>}
  </details>;
}

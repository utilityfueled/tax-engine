/** Original claimant sources for final2025 printed conditions; no credit calculation. */
import type { TaxYearInput } from '@/models/inputs.js';
import { calculateEicClaimantEligibility, type EicClaimantInput } from '@/engine/forms/eic-claimant-eligibility.js';
import { calculateEicSeparatedSpouseSources, type EicSeparatedSpouseInput } from '@/engine/forms/eic-separated-spouse-sources.js';

type Input = EicClaimantInput & EicSeparatedSpouseInput & {
  taxpayer: EicClaimantInput['taxpayer'] & {
    dependents: TaxYearInput['taxpayer']['dependents'];
  };
};
type Personal = NonNullable<NonNullable<NonNullable<Input['eic']>['claimantEligibility']>['primaryChildless']>;

function actualHome(personal: Personal | undefined): boolean | undefined {
  if (personal?.countedMilitaryDutyOutsideUnitedStates === true
    && (!personal.militaryDutySourceReference?.trim() || personal.extendedActiveDutyOrderOver90DaysOrIndefinite !== true)) {
    throw new Error('EIC printed home answer needs the actual qualifying extended active duty source');
  }
  // A partial preserved childless record may be irrelevant to a childful
  // calculation. It does not establish a new affirmative printed home answer.
  if (typeof personal?.mainHomeInUnitedStatesMoreThanHalfYear !== 'boolean'
    || typeof personal.countedMilitaryDutyOutsideUnitedStates !== 'boolean') return undefined;
  return personal.mainHomeInUnitedStatesMoreThanHalfYear;
}

export function calculateEicReviewCheckboxes(input: Input): {
  doNotClaimEic: boolean;
  mainHomeInUnitedStatesMoreThanHalfYear: boolean | undefined;
} {
  const { taxpayer, standardDeductionFacts: standard } = input;
  const facts = input.eic?.claimantEligibility;
  const joint = taxpayer.filingStatus === 'married_filing_jointly';
  // Same actual qualifying-child route used by the canonical EIC call.
  const childless = input.eic?.separatedSpouseSources !== undefined
    ? !calculateEicSeparatedSpouseSources(input).qualifyingChildPresent
    : !taxpayer.dependents.some(child => child.qualifiesForEIC === true);
  const knownAgeSources = standard?.primaryDeathDate !== undefined
    && (!joint || standard.spouseDeathDate !== undefined);
  const resolveChildless = childless && (facts !== undefined || knownAgeSources);
  const claimant = calculateEicClaimantEligibility(input, resolveChildless);

  const primaryNonresident = facts?.primaryNonresidentAlienDuringYear
    ?? (standard?.nonresidentAlien === true || standard?.dualStatusAlien === true ? true : undefined);
  const nonresident = primaryNonresident === true || (joint && facts?.spouseNonresidentAlienDuringYear === true);
  const election = facts?.residentJointElection ?? standard?.residentJointElection;
  // The resolver already reconciled each known election/residency source and
  // rejected a missing election when a joint nonresident source needs it.
  const nonresidentRestriction = nonresident && (!joint || election === false);
  const noValidSsn = taxpayer.primary.employmentValidSsnIssuedByDueDate === false
    || (joint && taxpayer.spouse?.employmentValidSsnIssuedByDueDate === false);

  const primaryHome = facts === undefined ? undefined : actualHome(facts.primaryChildless);
  const spouseHome = !joint ? true : facts === undefined ? undefined : actualHome(facts.spouseChildless);
  const home = primaryHome === false || spouseHome === false ? false
    : primaryHome === true && spouseHome === true ? true : undefined;
  return {
    doNotClaimEic: noValidSsn || nonresidentRestriction || claimant.qualifyingChildOfAnotherTaxpayer === true
      || (resolveChildless && claimant.childlessAgeEligible === false) || (childless && home === false),
    mainHomeInUnitedStatesMoreThanHalfYear: home,
  };
}

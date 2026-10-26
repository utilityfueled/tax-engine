import { calculateEicClaimantEligibility, type EicClaimantInput } from '../../../../src/engine/forms/eic-claimant-eligibility';
import type { FilingStatus, PersonalInfoData } from './guided-interview-flow';
import { buildStandardDeductionFacts } from './guided-standard-deduction-facts';

export interface EicClaimantEligibilityData {
  sourceTaxYear?: string;
  sourceReference?: string;
  sourceFactsConfirmed?: boolean | null;
  primaryNonresidentAlienDuringYear?: boolean | null;
  spouseNonresidentAlienDuringYear?: boolean | null;
  residentJointElection?: boolean | null;
}
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
const bool = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;

export function buildGuidedEicClaimantEligibility(personal: PersonalInfoData | undefined, status: FilingStatus | null, taxYear: number | null | undefined) {
  const data = personal?.eicClaimantEligibility;
  if (!data) return undefined;
  if (!status || !taxYear || !personal?.dateOfBirth) throw new Error('EIC claimant sources need the actual return year, filing status and household dates');
  if (!/^\d{4}$/.test(data.sourceTaxYear?.trim() ?? '')) throw new Error('Enter the actual EIC claimant source tax year');
  const claimantEligibility = {
    sourceTaxYear: Number(data.sourceTaxYear?.trim()), sourceReference: data.sourceReference,
    sourceFactsConfirmed: bool(data.sourceFactsConfirmed),
    primaryNonresidentAlienDuringYear: bool(data.primaryNonresidentAlienDuringYear),
    spouseNonresidentAlienDuringYear: bool(data.spouseNonresidentAlienDuringYear),
    residentJointElection: bool(data.residentJointElection),
  };
  const input: EicClaimantInput = {
    taxpayer: { taxYear, filingStatus: statuses[status],
      primary: { dateOfBirth: personal.dateOfBirth, employmentValidSsnIssuedByDueDate: bool(personal.employmentValidSsnIssuedByDueDate), tinIssuedByDueDate: bool(personal.tinIssuedByDueDate) },
      spouse: status === 'mfj' && personal.spouse ? { dateOfBirth: personal.spouse.dateOfBirth, employmentValidSsnIssuedByDueDate: bool(personal.spouse.employmentValidSsnIssuedByDueDate), tinIssuedByDueDate: bool(personal.spouse.tinIssuedByDueDate) } : undefined },
    standardDeductionFacts: buildStandardDeductionFacts(personal.standardDeductionFacts, status, taxYear, personal),
    eic: { claimantEligibility },
  };
  calculateEicClaimantEligibility(input, !personal.dependents?.some(child => child.qualifiesForEIC === true));
  // These two existing legacy fields keep their prior guided behavior; no new exception is inferred.
  return { mfsEligible: false, primaryIsFullTimeStudent: false, claimantEligibility };
}

export function eicClaimantFactErrors(personal: PersonalInfoData | undefined, status: FilingStatus | null, taxYear?: number | null): Record<string, string> {
  try { buildGuidedEicClaimantEligibility(personal, status, taxYear); return {}; }
  catch (error) { return { eicClaimantEligibility: error instanceof Error ? error.message : 'Complete the actual EIC claimant sources' }; }
}

export function updateEicClaimantSources(data: EicClaimantEligibilityData, patch: Partial<EicClaimantEligibilityData>): EicClaimantEligibilityData {
  const confirmationOnly = Object.keys(patch).every(key => key === 'sourceFactsConfirmed');
  return { ...data, ...patch, ...(confirmationOnly ? {} : { sourceFactsConfirmed: null }) };
}

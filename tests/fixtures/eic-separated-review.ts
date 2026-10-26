import { simpleW2Fixture } from './simple-w2.js';
function required<T>(v: T | undefined): T { if (v === undefined) throw new Error('Missing synthetic source'); return v; }
export function eicSeparatedReviewInput(validSsn = true) {
  const base = structuredClone(simpleW2Fixture);
  const primary = { ...base.taxpayer.primary, dateOfBirth: '1980-02-01', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true };
  const child = { firstName: 'Alex', lastName: 'Example', ssn: validSsn ? '333-44-5555' : '999-70-0001', dateOfBirth: '2015-06-01',
    relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
  return { ...base, taxpayer: { ...base.taxpayer, filingStatus: 'married_filing_separately' as const, primary, dependents: [child] },
    w2s: [{ ...required(base.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }],
    eic: { primaryIsFullTimeStudent: false, claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'actual claimant source', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } },
    separatedSpouseSources: { sourceTaxYear: 2025, sourceReference: 'actual separation and child sources', sourceFactsConfirmed: true,
      taxpayer: { firstName: primary.firstName, lastName: primary.lastName, ssn: primary.ssn, dateOfBirth: primary.dateOfBirth },
      applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', marriedAtYearEnd: true,
      principalHomesApartLastSixMonths: true as boolean | undefined,
      legallySeparatedUnderStateLaw: undefined as boolean | undefined,
      differentHouseholdsAtYearEnd: undefined as boolean | undefined,
      separationInstrument: undefined as { kind: 'written-separation-agreement' | 'decree-of-separate-maintenance'; state: string; effectiveDate: string; sourceReference: string } | undefined,
      allCandidateChildrenIncluded: true,
      children: [{ sourceId: 'dependent:0', sourceReference: 'actual school and home records',
        original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
        livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true as boolean | undefined,
        specialResidencePeriodClaimed: false, marriedAtYearEnd: false, jointReturnFiled: false,
        jointReturnRefundOnly: undefined as boolean | undefined,
        fullTimeStudentForFiveMonths: undefined as boolean | undefined, permanentlyAndTotallyDisabled: undefined as boolean | undefined,
        validSsnIssuedByDueDate: validSsn as boolean | undefined,
        allOtherEligibleClaimantsIncluded: true,
        otherEligibleClaimants: [] as { name: string; sourceReference: string; claimsAnyChildTaxBenefit: boolean }[] }],
    } } };
}

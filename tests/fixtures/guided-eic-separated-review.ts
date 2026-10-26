import { completeDependent, completePersonalInfo, completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
export function guidedEicSeparatedReviewState(validSsn = true) {
  const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  const child = { ...completeDependent, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
  const personal = { ...structuredClone(completePersonalInfo), dateOfBirth: '2003-02-15', dependentCount: '1', dependents: [child],
    eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'Actual claimant records', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
      primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: false, countedMilitaryDutyOutsideUnitedStates: false } },
    eicSeparatedSpouseSources: { sourceTaxYear: '2025', sourceReference: 'Actual separation records', sourceFactsConfirmed: true,
      taxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-15' },
      applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', marriedAtYearEnd: true,
      principalHomesApartLastSixMonths: true, allCandidateChildrenIncluded: true,
      children: [{ sourceId: 'dependent:0', sourceReference: 'Actual child home records',
        original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
        livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false,
        marriedAtYearEnd: false, jointReturnFiled: false, validSsnIssuedByDueDate: validSsn,
        allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [] }] } };
  state.sectionData['personal-info'] = personal;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '10000', socialSecurityWages: '10000', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' }] };
  return state;
}

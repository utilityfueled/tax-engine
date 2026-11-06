import { actualSharedPolicyData } from './guided-shared-policy';
import type { SharedPolicyAgreementData } from '@/lib/guided-shared-policy';

/** Synthetic original sources for one household member with multiple policies. */
export function actualOverlappingPolicyData() {
  const data = actualSharedPolicyData(), first = data.policies[0]!, packet = data.sharedPolicyAllocations!, shared = packet.policies[0]!;
  first.coveredIndividuals!.forEach(person => { person.lastMonth = '1'; });
  first.monthlyPremiums = [{ month: '1', enrolleePremium: '1000', slcsp: '1200', advancePremiumTaxCredit: '200' }];
  shared.original = structuredClone(first); shared.monthlyAllocations = [{ month: '1', fraction: '.25' }];
  for (const index of [1, 2]) {
    const source = { ...structuredClone(first), policyNumber: `own-overlap-${index}`, coveredIndividuals: [{ name: 'Jordan Example', ssn: '111-22-3333', firstMonth: '1', lastMonth: '1' }],
      monthlyPremiums: [{ month: '1', enrolleePremium: '600', slcsp: '450', advancePremiumTaxCredit: '100' }] };
    data.policies.push(source);
    packet.policies.push({ sourceId: `form1095A:${index}`, original: structuredClone(source), situation: 'not_shared', otherTaxpayerName: '', otherTaxpayerSsn: '',
      noCurrentYearMarriageOrDivorceConfirmed: null, twoTaxFamiliesConfirmed: null, allCoveredPeopleAssignedConfirmed: null, originalSlcspCorrectConfirmed: true,
      agreementConfirmed: null, agreementReference: '', unsharedSourceReference: 'Actual household-only coverage', allCoveredPeopleInThisTaxFamilyConfirmed: true,
      coveredFamilyAssignments: [], monthlyAllocations: [] } as SharedPolicyAgreementData);
  }
  packet.overlappingCoverage = { sourceTaxYear: '2025', sourceReference: 'Actual common benchmark worksheet', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
    months: [{ month: '1', groups: [{ sourceId: 'actual-group-one', sourceReference: 'Actual Marketplace family benchmark record', ratingArea: 'WA-area-one',
      allUnsharedCoverageFamilyMembersIncludedConfirmed: true, allCoveredPeopleShareRatingAreaConfirmed: true,
      policySourceIds: ['form1095A:1', 'form1095A:2'], coveredIndividualSsns: ['111-22-3333'], slcsp: '450' }] }] };
  data.monthlyReconciliation = [{ month: '1', enrolleePremium: '1450', slcsp: '750', advancePremiumTaxCredit: '250', coverageEligible: true, incomeBasedSepEnrollment: false }];
  return data;
}

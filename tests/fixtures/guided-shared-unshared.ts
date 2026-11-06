import { actualSharedPolicyData } from './guided-shared-policy';
import type { SharedPolicyAgreementData } from '@/lib/guided-shared-policy';

/** Synthetic original records in disjoint months; classification is an actual source fact. */
export function actualSharedUnsharedData() {
  const data = actualSharedPolicyData();
  const shared = data.policies[0]!;
  shared.monthlyPremiums = shared.monthlyPremiums.slice(0, 6);
  shared.coveredIndividuals!.forEach(person => { person.lastMonth = '6'; });
  const agreement = data.sharedPolicyAllocations!.policies[0]!;
  agreement.original = structuredClone(shared);
  agreement.monthlyAllocations = agreement.monthlyAllocations.slice(0, 6);
  const own = {
    taxYear: '2025', marketplace: 'Actual Marketplace', policyNumber: 'own-policy-200',
    recipientName: 'Jordan Example', recipientSsn: '111-22-3333',
    coveredIndividuals: [{ name: 'Jordan Example', ssn: '111-22-3333', firstMonth: '7', lastMonth: '12' }],
    monthlyPremiums: Array.from({ length: 6 }, (_, i) => ({ month: String(i + 7), enrolleePremium: '700', slcsp: '650', advancePremiumTaxCredit: '300' })),
  };
  data.policies.push(own);
  data.sharedPolicyAllocations!.policies.push({
    sourceId: 'form1095A:1', original: structuredClone(own), situation: 'not_shared',
    otherTaxpayerName: '', otherTaxpayerSsn: '', noCurrentYearMarriageOrDivorceConfirmed: null,
    twoTaxFamiliesConfirmed: null, allCoveredPeopleAssignedConfirmed: null,
    originalSlcspCorrectConfirmed: true, agreementConfirmed: null, agreementReference: '',
    unsharedSourceReference: 'Actual household enrollment source', allCoveredPeopleInThisTaxFamilyConfirmed: true,
    coveredFamilyAssignments: [], monthlyAllocations: [],
  } as SharedPolicyAgreementData);
  data.monthlyReconciliation = [
    ...data.monthlyReconciliation.slice(0, 6),
    ...own.monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false })),
  ];
  return data;
}

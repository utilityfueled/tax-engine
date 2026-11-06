import { actualSharedPolicyData } from './guided-shared-policy';

/** Synthetic actual enrollment: Jordan enrolled three people; two belong to Robin's family. */
export function actualDefaultAllocationData() {
  const data = actualSharedPolicyData(), original = data.policies[0]!, policy = data.sharedPolicyAllocations!.policies[0]!;
  original.coveredIndividuals!.push({ name: 'Pat Other', ssn: '555-66-7777', firstMonth: '1', lastMonth: '12' });
  policy.original = structuredClone(original);
  policy.coveredFamilyAssignments.push({ ssn: '555-66-7777', family: 'other_return' });
  policy.agreementConfirmed = false; policy.agreementReference = '';
  policy.monthlyAllocations = policy.monthlyAllocations.map(row => ({ ...row, fraction: '' }));
  policy.defaultAllocation = { sourceReference: 'Synthetic original enrollment application', enrollingTaxpayerSsn: '111-22-3333', allCoveredPeopleEnrolledByTaxpayerConfirmed: true };
  data.monthlyReconciliation = data.monthlyReconciliation.map(row => ({ ...row, enrolleePremium: '330', slcsp: '297', advancePremiumTaxCredit: '165' }));
  return data;
}

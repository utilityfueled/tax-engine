import { sharedPolicyFixture } from './shared-policy.js';

export function sharedUnsharedFixture() {
  const input = sharedPolicyFixture();
  const first = input.form1095A[0];
  first.monthlyPremiums = first.monthlyPremiums.filter(row => row.month <= 6);
  first.coveredIndividuals?.forEach(person => { person.lastMonth = 6; });
  const policy = input.form8962!.sharedPolicyAllocations!.policies![0];
  policy.original = structuredClone(first);
  policy.monthlyAllocations = policy.monthlyAllocations!.filter(row => row.month! <= 6);
  const second = structuredClone(first);
  Object.assign(second, { policyNumber: 'ACTUAL-UNSHARED-200', recipientName: 'Jane Doe', recipientSsn: '123-45-6789',
    coveredIndividuals: [{ name: 'Jane Doe', ssn: '123-45-6789', firstMonth: 7, lastMonth: 12 }],
    monthlyPremiums: Array.from({ length: 6 }, (_, i) => ({ month: i + 7, enrolleePremium: '700', slcsp: '650', advancePremiumTaxCredit: '300' })) });
  input.form1095A.push(second);
  input.form8962!.sharedPolicyAllocations!.policies!.push(Object.assign({}, {
    sourceId: 'form1095A:1', original: structuredClone(second), situation: 'not_shared',
    unsharedSourceReference: 'Actual unshared coverage statement and benchmark', allCoveredPeopleInThisTaxFamilyConfirmed: true,
    originalSlcspCorrectConfirmed: true,
  }) as typeof policy);
  input.form8962!.monthlyReconciliation!.forEach(row => {
    if (row.month! >= 7) Object.assign(row, { enrolleePremium: '700', slcsp: '650', advancePremiumTaxCredit: '300' });
  });
  return input;
}

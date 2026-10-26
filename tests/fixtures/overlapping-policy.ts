import { sharedPolicyFixture } from './shared-policy.js';

/** Fictional original statements; every source fact is explicit, not a default. */
export function overlappingPolicyFixture(kind: 'allocated' | 'same_group' | 'different_groups' = 'allocated') {
  const input = sharedPolicyFixture();
  input.w2s[0].wages = '20000';
  const first = input.form1095A[0], packet = input.form8962!.sharedPolicyAllocations!, policy = packet.policies![0];
  first.coveredIndividuals!.forEach(person => { person.lastMonth = 1; });
  first.monthlyPremiums = [{ month: 1, enrolleePremium: '1000.01', slcsp: '1200.01', advancePremiumTaxCredit: '200.01' }];
  policy.original = structuredClone(first);
  policy.monthlyAllocations = [{ month: 1, fraction: '0.25' }];
  if (kind === 'allocated') {
    const second = structuredClone(first);
    second.policyNumber = 'ACTUAL-POLICY-200';
    second.monthlyPremiums = [{ month: 1, enrolleePremium: '100.03', slcsp: '80.03', advancePremiumTaxCredit: '20.03' }];
    input.form1095A.push(second);
    packet.policies!.push({ ...structuredClone(policy), sourceId: 'form1095A:1', original: structuredClone(second), monthlyAllocations: [{ month: 1, fraction: '0.50' }] });
    input.form8962!.monthlyReconciliation = [{ month: 1, enrolleePremium: '300.0175', slcsp: '340.0175', advancePremiumTaxCredit: '60.0175', coverageEligible: true, incomeBasedSepEnrollment: false }];
    return input;
  }
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Sam', lastName: 'Doe', ssn: '345-67-8901', dateOfBirth: '1991-05-01' };
  input.w2s[0].wages = '28000';
  input.form8962!.taxFamilySize = 2;
  Object.assign(packet, { spouseName: 'Sam Doe', spouseSsn: '345-67-8901' });
  first.monthlyPremiums = [{ month: 1, enrolleePremium: '1000', slcsp: '1200', advancePremiumTaxCredit: '200' }];
  policy.original = structuredClone(first);
  for (const [index, name, ssn] of [[1, 'Jane Doe', '123-45-6789'], [2, 'Sam Doe', '345-67-8901']] as const) {
    const source = { ...structuredClone(first), policyNumber: `ACTUAL-UNSHARED-${index}`, recipientName: name, recipientSsn: ssn,
      coveredIndividuals: [{ name, ssn, firstMonth: 1, lastMonth: 1 }],
      monthlyPremiums: [{ month: 1, enrolleePremium: '600', slcsp: kind === 'different_groups' && index === 2 ? '500' : '450', advancePremiumTaxCredit: '100' }] };
    input.form1095A.push(source);
    packet.policies!.push({ sourceId: `form1095A:${index}`, original: structuredClone(source), situation: 'not_shared', unsharedSourceReference: `Actual unshared source ${index}`,
      allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  }
  const group = (sourceId: string, ratingArea: string, policySourceIds: string[], coveredIndividualSsns: string[], slcsp: string) => ({ sourceId, sourceReference: `Actual Marketplace benchmark ${sourceId}`, ratingArea,
    allUnsharedCoverageFamilyMembersIncludedConfirmed: true, allCoveredPeopleShareRatingAreaConfirmed: true, policySourceIds, coveredIndividualSsns, slcsp });
  Object.assign(packet, { overlappingCoverage: { sourceTaxYear: 2025, sourceReference: 'Actual combined coverage-family benchmark worksheet', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
    months: [{ month: 1, groups: kind === 'same_group'
      ? [group('group-a', 'WA-area-1', ['form1095A:1', 'form1095A:2'], ['123-45-6789', '345-67-8901'], '450')]
      : [group('group-a', 'WA-area-1', ['form1095A:1'], ['123-45-6789'], '450'), group('group-b', 'OR-area-2', ['form1095A:2'], ['345-67-8901'], '500')] }] } });
  input.form8962!.monthlyReconciliation = [{ month: 1, enrolleePremium: '1450', slcsp: kind === 'same_group' ? '750' : '1250', advancePremiumTaxCredit: '250', coverageEligible: true, incomeBasedSepEnrollment: false }];
  return input;
}

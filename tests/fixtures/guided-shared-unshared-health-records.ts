import { guidedSharedMarketplaceHealthRecords } from './guided-shared-marketplace-health-records';
import { guidedSharedHealthOtherAllocationRecords } from './guided-shared-health-other-allocation-records';
import type { SharedPolicyAgreementData } from '@/lib/guided-shared-policy';

/** Fictional full originals and independently paid monthly receipts; no calculated override. */
export function guidedSharedUnsharedHealthRecords(method: 'agreement' | 'no-advance' = 'agreement') {
  const records = method === 'no-advance' ? guidedSharedHealthOtherAllocationRecords(method) : guidedSharedMarketplaceHealthRecords();
  const { coverage, health } = records, packet = coverage.sharedPolicyAllocations!, plan = health.plans[0]!;
  const original = structuredClone(coverage.policies[0]!);
  original.policyNumber = 'actual-unshared-health-policy';
  original.recipientName = 'Jordan Example'; original.recipientSsn = '111-22-3333';
  original.coveredIndividuals = [{ name: 'Jordan Example', ssn: '111-22-3333', firstMonth: '1', lastMonth: '12' }];
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: '200', slcsp: method === 'no-advance' ? '1000' : '200', slcspReportedBlank: false, advancePremiumTaxCredit: '50' }));
  coverage.policies.push(original);
  packet.policies.push({ sourceId: 'form1095A:1', original: structuredClone(original), situation: 'not_shared',
    otherTaxpayerName: '', otherTaxpayerSsn: '', noCurrentYearMarriageOrDivorceConfirmed: null, twoTaxFamiliesConfirmed: null,
    allCoveredPeopleAssignedConfirmed: null, originalSlcspCorrectConfirmed: true, agreementConfirmed: null, agreementReference: '',
    unsharedSourceReference: 'Actual complete unshared household source', allCoveredPeopleInThisTaxFamilyConfirmed: true,
    coveredFamilyAssignments: [], monthlyAllocations: [],
  } satisfies SharedPolicyAgreementData);
  plan.marketplacePolicySourceIds.push('form1095A:1');
  coverage.monthlyReconciliation.forEach(row => {
    row.enrolleePremium = method === 'no-advance' ? '1200' : '700'; row.slcsp = method === 'no-advance' ? '1000' : '700';
    row.advancePremiumTaxCredit = method === 'no-advance' ? '50' : '350';
  });
  plan.payments.forEach(payment => {
    payment.grossPremium = method === 'no-advance' ? '1700' : '1200'; payment.ownerOrBusinessPaid = method === 'no-advance' ? '1150' : '350';
    payment.advancePremiumTaxCredit = method === 'no-advance' ? '50' : '650';
    payment.personAmounts[0]!.amountPaid = payment.ownerOrBusinessPaid;
    payment.personAmounts[0]!.advancePremiumTaxCredit = method === 'no-advance' ? '50' : '350';
  });
  if (method === 'no-advance') packet.noAdvanceCoverageFamilies = {
    sourceTaxYear: '2025', sourceReference: 'Actual complete overlapping family benchmarks', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
    months: original.monthlyPremiums.map(row => ({ month: row.month, families: [
      { taxpayerName: 'Jordan Example', taxpayerSsn: '111-22-3333', sourceReference: 'Actual own coverage family', coveredIndividuals: [{ name: 'Jordan Example', ssn: '111-22-3333' }], allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: 'own-area', sourceReference: 'Actual complete own benchmark', ratingArea: 'WA-one', slcsp: '1000', coveredIndividualSsns: ['111-22-3333'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
      { taxpayerName: 'Robin Other', taxpayerSsn: '444-55-6666', sourceReference: 'Actual other coverage family', coveredIndividuals: [{ name: 'Robin Other', ssn: '444-55-6666' }], allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: 'other-area', sourceReference: 'Actual complete other benchmark', ratingArea: 'WA-one', slcsp: '500', coveredIndividualSsns: ['444-55-6666'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
    ] })),
  };
  return records;
}

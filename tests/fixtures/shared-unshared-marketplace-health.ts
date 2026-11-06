import { sharedMarketplaceHealthInput } from './shared-marketplace-health.js';
import { noAdvanceSharedHealthInput } from './shared-marketplace-health-other-allocations.js';

/** Fictional complete original policies and independent paid source records. */
export function sharedUnsharedHealthInput(method: 'agreement' | 'no-advance' = 'agreement', firstMonth = 1) {
  const input = method === 'no-advance' ? noAdvanceSharedHealthInput() : sharedMarketplaceHealthInput();
  const packet = input.form8962!.sharedPolicyAllocations!;
  const unshared = structuredClone(input.form1095A[0]);
  unshared.policyNumber = 'ACTUAL-UNSHARED-HEALTH';
  unshared.recipientName = 'Jane Doe'; unshared.recipientSsn = '123-45-6789';
  unshared.coveredIndividuals = [{ name: 'Jane Doe', ssn: '123-45-6789', firstMonth, lastMonth: 12 }];
  unshared.monthlyPremiums = unshared.monthlyPremiums.filter(row => row.month >= firstMonth).map(row => ({
    ...row, enrolleePremium: '200', slcsp: method === 'no-advance' ? '1000' : '200', advancePremiumTaxCredit: '50',
  }));
  input.form1095A.push(unshared);
  packet.policies!.push({ sourceId: 'form1095A:1', original: structuredClone(unshared), situation: 'not_shared',
    unsharedSourceReference: 'Actual complete unshared original and household source', allCoveredPeopleInThisTaxFamilyConfirmed: true,
    originalSlcspCorrectConfirmed: true });
  const plan = input.form7206!.plans![0];
  plan.marketplacePolicySourceIds!.push('form1095A:1');
  for (const row of input.form8962!.monthlyReconciliation!) {
    if (row.month < firstMonth) continue;
    row.enrolleePremium = method === 'no-advance' ? '1200' : '700';
    row.slcsp = method === 'no-advance' ? '1000' : '700'; row.advancePremiumTaxCredit = method === 'no-advance' ? '50' : '350';
  }
  for (const payment of plan.payments!) {
    if (payment.coverageMonth! < firstMonth) continue;
    payment.grossPremium = method === 'no-advance' ? '1700' : '1200';
    payment.ownerOrBusinessPaid = method === 'no-advance' ? '1150' : '350';
    payment.advancePremiumTaxCredit = method === 'no-advance' ? '50' : '650';
    payment.personAmounts![0].amountPaid = payment.ownerOrBusinessPaid;
    payment.personAmounts![0].advancePremiumTaxCredit = method === 'no-advance' ? '50' : '350';
  }
  if (method === 'no-advance') {
    packet.noAdvanceCoverageFamilies = {
      sourceTaxYear: 2025, sourceReference: 'Actual complete overlapping coverage family records', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
      months: unshared.monthlyPremiums.map(row => ({ month: row.month, families: [
        { taxpayerName: 'Jane Doe', taxpayerSsn: '123-45-6789', sourceReference: 'Actual Jane coverage family', allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
          groups: [{ sourceId: 'own-coverage', sourceReference: 'Actual complete own benchmark', ratingArea: 'WA-area-1', slcsp: '1000', coveredIndividualSsns: ['123-45-6789'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
        { taxpayerName: 'Robin Other', taxpayerSsn: '234-56-7890', sourceReference: 'Actual Robin coverage family', allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
          groups: [{ sourceId: 'other-coverage', sourceReference: 'Actual complete other benchmark', ratingArea: 'WA-area-1', slcsp: '500', coveredIndividualSsns: ['234-56-7890'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
      ] })),
    };
  }
  return input;
}

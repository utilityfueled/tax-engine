import { sharedCoverageFamilyHealthInput, coverageFamilyHealthInput } from './coverage-family-health.js';
import { ScheduleFInputSchema } from '@/models/inputs.js';

/** Actual fictional election and payment records; no production defaults. */
export function marketplaceBusinessCreditMethodInput(year = 2025) {
  const { input, coverageFamilySources } = coverageFamilyHealthInput(year);
  input.scheduleC!.grossReceipts = '20000';
  input.scheduleF = ScheduleFInputSchema.parse({ principalCropOrActivity: 'Fictional farm', accountHolder: 'primary', salesOfProductsRaised: '20000', qbiMateriallyParticipated: true });
  const plan = input.form7206!.plans![0], original = input.form1095A[0];
  for (const row of original.monthlyPremiums) Object.assign(row, { enrolleePremium: '750', advancePremiumTaxCredit: '0' });
  for (const row of plan.payments!) {
    Object.assign(row, { grossPremium: '750', ownerOrBusinessPaid: '750', advancePremiumTaxCredit: '0' });
    row.personAmounts![0].amountPaid = '250'; row.personAmounts![0].advancePremiumTaxCredit = '0';
    row.personAmounts![1].amountPaid = '500';
  }
  for (const month of coverageFamilySources.months) month.nonCoverageFamilySlcsp = '2000';
  coverageFamilySources.policies[0].original = structuredClone(original);
  const secondOriginal = structuredClone(original);
  secondOriginal.policyNumber = 'Second actual policy'; secondOriginal.coveredIndividuals = [structuredClone(original.coveredIndividuals![0])];
  for (const row of secondOriginal.monthlyPremiums) row.enrolleePremium = '500';
  input.form1095A.push(secondOriginal);
  const second = structuredClone(plan);
  Object.assign(second, { planId: 'farm-plan', businessSourceId: 'scheduleF', policyReference: 'Actual farm policy', marketplacePolicySourceIds: ['form1095A:1'], allCoveredPersonsInCoverageFamilyConfirmed: true });
  second.coveredPersons = [structuredClone(plan.coveredPersons![0])];
  second.payments = second.payments!.map(row => ({ ...row, sourceId: `farm:${row.sourceId}`, grossPremium: '500', ownerOrBusinessPaid: '500',
    personAmounts: [{ ...row.personAmounts![0], amountPaid: '500' }] }));
  second.coverageFamilySources!.sourceReference = 'Actual farm coverage records';
  second.coverageFamilySources!.policies = [{ sourceId: 'form1095A:1', original: structuredClone(secondOriginal) }];
  second.coverageFamilySources!.persons = [structuredClone(coverageFamilySources.persons[0])];
  for (const month of second.coverageFamilySources!.months!) {
    month.personFacts = [month.personFacts![0]]; month.nonCoverageFamilySlcsp = '0'; month.nonCoverageFamilyMemberSsns = [];
  }
  input.form7206!.plans!.push(second);
  for (const month of input.form8962!.monthlyReconciliation!) Object.assign(month, { enrolleePremium: '1250', advancePremiumTaxCredit: '0' });
  Object.assign(input.form7206!, { marketplaceCreditAllocation: { sourceTaxYear: year, sourceReference: 'Actual taxpayer recorded allocation method',
    sourceFactsConfirmed: true, method: 'monthly_eligible_plan_enrollment', sameMethodForAllCalculationsConfirmed: true } });
  return input;
}

/** Independent PartIV sources precede the same actual business method. */
export function sharedMarketplaceBusinessCreditMethodInput(noAdvance = false) {
  const input = marketplaceBusinessCreditMethodInput(), shared = sharedCoverageFamilyHealthInput(noAdvance).input;
  const first = input.form7206!.plans![0], original = input.form1095A[0];
  original.coveredIndividuals!.push(structuredClone(shared.form1095A[0].coveredIndividuals![2]));
  for (const row of original.monthlyPremiums) Object.assign(row, { enrolleePremium: noAdvance ? '1125' : '1500', slcsp: noAdvance ? null : '2000', advancePremiumTaxCredit: noAdvance ? '0' : '200' });
  input.form7206!.persons!.push(structuredClone(shared.form7206!.persons![2]));
  first.coveredPersons!.push(structuredClone(shared.form7206!.plans![0].coveredPersons![2]));
  first.sharedMarketplaceSources = structuredClone(shared.form7206!.plans![0].sharedMarketplaceSources);
  input.form7206!.plans![1].sharedMarketplaceSources = { sourceTaxYear: 2025, sourceReference: 'Actual unshared person links', sourceFactsConfirmed: true, allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true, persons: [{ personId: 'primary', coveredIndividualSsn: '123-45-6789' }] };
  first.coverageFamilySources!.persons!.push(structuredClone(shared.form7206!.plans![0].coverageFamilySources!.persons![2]));
  first.coverageFamilySources!.policies![0].original = structuredClone(original);
  for (const payment of first.payments!) {
    payment.grossPremium = noAdvance ? '1125' : '1500'; payment.otherPersonPaid = noAdvance ? '375' : '650';
    payment.ownerOrBusinessPaid = noAdvance ? '750' : '650'; payment.advancePremiumTaxCredit = noAdvance ? '0' : '200';
    payment.personAmounts![0].amountPaid = noAdvance ? '250' : '150'; payment.personAmounts![0].advancePremiumTaxCredit = noAdvance ? '0' : '100';
    payment.personAmounts!.push({ ...payment.personAmounts![0], personId: 'outside', amountPaid: '0', advancePremiumTaxCredit: noAdvance ? '0' : '100' });
  }
  const packet = structuredClone(shared.form8962!.sharedPolicyAllocations!);
  packet.policies![0].original = structuredClone(original);
  if (!noAdvance) for (const row of input.form1095A[1].monthlyPremiums) row.slcsp = '0';
  input.form7206!.plans![1].coverageFamilySources!.policies![0].original = structuredClone(input.form1095A[1]);
  packet.policies!.push({ sourceId: 'form1095A:1', original: structuredClone(input.form1095A[1]), situation: 'not_shared',
    unsharedSourceReference: 'Actual second business unshared original', allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  if (noAdvance) packet.noAdvanceCoverageFamilies = { sourceTaxYear: 2025, sourceReference: 'Actual complete overlapping families', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
    months: original.monthlyPremiums.map(row => ({ month: row.month, families: [
      { taxpayerName: 'Jane Doe', taxpayerSsn: '123-45-6789', sourceReference: 'Actual primary coverage family', allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: 'own-family', sourceReference: 'Actual own benchmark', ratingArea: 'WA-area-1', slcsp: '1000', coveredIndividualSsns: ['123-45-6789'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
      { taxpayerName: 'Robin Other', taxpayerSsn: '234-56-7890', sourceReference: 'Actual other coverage family', allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: 'other-family', sourceReference: 'Actual other benchmark', ratingArea: 'WA-area-1', slcsp: '500', coveredIndividualSsns: ['234-56-7890'], allCoveredPeopleShareRatingAreaConfirmed: true }] },
    ] })) };
  if (!noAdvance) for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = '100';
  input.form8962!.allocationRequired = true; input.form8962!.sharedPolicyAllocations = packet;
  return input;
}

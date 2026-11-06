import { coverageFamilyHealthInput, sharedCoverageFamilyHealthInput } from './coverage-family-health.js';

/** Fictional original receipts: no paid share comes from the policy allocation. */
export function marketplaceActualCashInput(shared = false, year = 2025) {
  const { input } = shared ? sharedCoverageFamilyHealthInput(true) : coverageFamilyHealthInput(year);
  input.scheduleC!.grossReceipts = '300000';
  const plan = input.form7206!.plans![0], original = input.form1095A[0];
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = '0';
  plan.coverageFamilySources!.policies![0].original = structuredClone(original);
  if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = '0';
  for (const row of plan.coverageFamilySources!.months!) row.personFacts![1].sourceReference = 'Actual spouse non-employer Medicare coverage';
  for (const row of plan.payments!) {
    row.ownerOrBusinessPaid = '450'; row.otherPersonPaid = shared ? '1425' : '800'; row.advancePremiumTaxCredit = '0';
    row.personAmounts![0].amountPaid = '300'; row.personAmounts![1].amountPaid = '150';
    for (const person of row.personAmounts!) person.advancePremiumTaxCredit = '0';
  }
  return input;
}

export function marketplaceActualCashTwoOwners() {
  const input = marketplaceActualCashInput();
  input.scheduleF = { accountHolder: 'spouse', principalCropOrActivity: 'Actual farm', salesOfProductsRaised: '5000', qbiMateriallyParticipated: true };
  const original = structuredClone(input.form1095A[0]); original.policyNumber = 'ACTUAL-SPOUSE-CASH-POLICY';
  input.form1095A.push(original);
  const plan = structuredClone(input.form7206!.plans![0]);
  plan.planId = 'spouse-medical'; plan.accountHolder = 'spouse'; plan.businessSourceId = 'scheduleF';
  plan.policyReference = 'Actual separately paid spouse plan'; plan.marketplacePolicySourceIds = ['form1095A:1'];
  for (const person of plan.coveredPersons!) person.relationshipToOwner = person.personId === 'spouse' ? 'self' : 'spouse';
  for (const row of plan.payments!) row.sourceId = `spouse-${row.sourceId}`;
  plan.coverageFamilySources!.policies = [{ sourceId: 'form1095A:1', original: structuredClone(original) }];
  input.form7206!.plans!.push(plan);
  for (const row of input.form8962!.monthlyReconciliation!) row.enrolleePremium = '2500';
  return input;
}

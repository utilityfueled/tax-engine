import { coverageFamilyHealthInput, sharedCoverageFamilyHealthInput } from './coverage-family-health.js';

/** Fictional actual person receipts. No entered current credit or repayment. */
export function marketplaceFullRepaymentInput(shared = false, year = 2025) {
  const { input, coverageFamilySources } = shared ? sharedCoverageFamilyHealthInput() : coverageFamilyHealthInput(year);
  input.scheduleC!.grossReceipts = '300000';
  const original = input.form1095A[0], plan = input.form7206!.plans![0];
  for (const row of original.monthlyPremiums) Object.assign(row, {
    enrolleePremium: shared ? '3000' : '1500', advancePremiumTaxCredit: shared ? '2000' : '1000', slcsp: shared ? '2000' : '1000',
  });
  coverageFamilySources.policies[0].original = structuredClone(original);
  if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  for (const row of input.form8962!.monthlyReconciliation!) Object.assign(row, { enrolleePremium: '1500', advancePremiumTaxCredit: '1000' });
  for (const row of plan.payments!) {
    Object.assign(row, { grossPremium: shared ? '3000' : '1500', ownerOrBusinessPaid: '500', otherPersonPaid: shared ? '500' : '0', advancePremiumTaxCredit: shared ? '2000' : '1000' });
    Object.assign(row.personAmounts![0], { amountPaid: '400', advancePremiumTaxCredit: '600' });
    Object.assign(row.personAmounts![1], { amountPaid: '100', advancePremiumTaxCredit: '400' });
    if (shared) Object.assign(row.personAmounts![2], { amountPaid: '0', advancePremiumTaxCredit: '1000' });
  }
  return input;
}

export function marketplaceFullRepaymentTwoOwners() {
  const input = marketplaceFullRepaymentInput();
  input.scheduleF = { accountHolder: 'spouse', principalCropOrActivity: 'Actual farm', salesOfProductsRaised: '5000', qbiMateriallyParticipated: true };
  const original = structuredClone(input.form1095A[0]); original.policyNumber = 'ACTUAL-SPOUSE-POLICY';
  input.form1095A.push(original);
  const plan = structuredClone(input.form7206!.plans![0]);
  plan.planId = 'spouse-medical'; plan.accountHolder = 'spouse'; plan.businessSourceId = 'scheduleF';
  plan.policyReference = 'Actual separately paid spouse plan'; plan.marketplacePolicySourceIds = ['form1095A:1'];
  for (const person of plan.coveredPersons!) person.relationshipToOwner = person.personId === 'spouse' ? 'self' : 'spouse';
  for (const row of plan.payments!) row.sourceId = `spouse-${row.sourceId}`;
  plan.coverageFamilySources!.policies = [{ sourceId: 'form1095A:1', original: structuredClone(original) }];
  input.form7206!.plans!.push(plan);
  for (const row of input.form8962!.monthlyReconciliation!) Object.assign(row, { enrolleePremium: '3000', advancePremiumTaxCredit: '2000' });
  return input;
}

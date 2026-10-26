import { sharedMarketplaceHealthInput } from './shared-marketplace-health.js';
import { sharedNoAdvanceFixture } from './shared-no-advance-policy.js';

/** Fictional independent original enrollment, benchmark and payment records. */
export function defaultSharedHealthInput() {
  const input = sharedMarketplaceHealthInput(), policy = input.form8962!.sharedPolicyAllocations!.policies![0];
  policy.agreementConfirmed = false; policy.agreementReference = undefined; policy.monthlyAllocations = undefined;
  policy.defaultAllocation = { sourceReference: 'Original enrollment application', enrollingTaxpayerSsn: input.taxpayer.primary.ssn, allCoveredPeopleEnrolledByTaxpayerConfirmed: true };
  return input;
}
export function noAdvanceSharedHealthInput() {
  const input = sharedMarketplaceHealthInput(), source = sharedNoAdvanceFixture();
  input.form1095A = source.form1095A; input.form8962 = source.form8962;
  input.form8962!.selfEmployedHealthInsuranceCoordinationRequired = true;
  for (const row of input.form1095A[0].monthlyPremiums) row.slcsp = null;
  const policy = input.form8962!.sharedPolicyAllocations!.policies![0];
  policy.original = structuredClone(input.form1095A[0]);
  for (const row of policy.noAdvanceAllocation!.monthlyBenchmarks!) { row.thisReturnSlcsp = '1000'; row.otherReturnSlcsp = '500'; }
  for (const row of input.form8962!.monthlyReconciliation!) row.slcsp = '1000';
  for (const payment of input.form7206!.plans![0].payments!) {
    payment.grossPremium = '1500'; payment.ownerOrBusinessPaid = '1000'; payment.otherPersonPaid = '500'; payment.advancePremiumTaxCredit = '0';
    payment.personAmounts![0].amountPaid = '1000';
    for (const person of payment.personAmounts!) person.advancePremiumTaxCredit = '0';
  }
  return input;
}

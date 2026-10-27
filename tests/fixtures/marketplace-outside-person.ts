import { sharedCoverageFamilyHealthInput } from './coverage-family-health.js';
import { marketplaceActualCashInput } from './marketplace-actual-cash.js';
import { d } from '@/utils/decimal.js';

/** Complete fictional originals. Actual payer amounts are not allocation ratios. */
export function marketplaceOutsidePersonInput(actualFamilyCash = false) {
  const input = actualFamilyCash ? marketplaceActualCashInput(true) : sharedCoverageFamilyHealthInput(true).input;
  input.scheduleC!.grossReceipts = actualFamilyCash ? '300000' : '40000';
  const plan = input.form7206!.plans![0];
  plan.coveredPersons!.find(person => person.personId === 'outside')!.relationshipToOwner = 'child_under_27';
  input.form7206!.persons!.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = 26;
  const other = input.form8962!.sharedPolicyAllocations!.policies![0];
  plan.coverageFamilySources!.outsidePersonReturns = [{
    personId: 'outside', sourceTaxYear: input.taxpayer.taxYear,
    sourceReference: 'Actual completed outside claimant Form8962', returnStatus: 'completed',
    claimantName: other.otherTaxpayerName, claimantSsn: other.otherTaxpayerSsn,
    policySourceIds: [...plan.marketplacePolicySourceIds!], allPoliciesIncludedConfirmed: true,
    form8962Line24: '0',
  }];
  for (const payment of plan.payments!) {
    payment.ownerOrBusinessPaid = d(payment.ownerOrBusinessPaid!).plus(100).toFixed();
    payment.otherPersonPaid = d(payment.otherPersonPaid!).minus(100).toFixed();
    payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '100';
  }
  return input;
}

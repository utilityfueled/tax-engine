import { d } from '@/utils/decimal.js';
import { marketplaceFullRepaymentInput, marketplaceFullRepaymentTwoOwners } from './marketplace-full-repayment.js';
import { marriageCoverageFamilyInput } from './marketplace-marriage-coverage-family.js';

/** Actual fictional independent payer records, never calculated tax inputs. */
export function actualPaidRepaymentInput(shared = false, sourceAdvance = '1000', year = 2025) {
  const input = marketplaceFullRepaymentInput(shared, year);
  const plan = input.form7206!.plans![0], original = input.form1095A[0];
  const advance = d(sourceAdvance), noncoverageAdvance = advance.lt(400) ? d(0) : d(400);
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = advance.times(shared ? 2 : 1).toFixed();
  plan.coverageFamilySources!.policies![0].original = structuredClone(original);
  if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = advance.toFixed();
  for (const row of plan.payments!) {
    row.ownerOrBusinessPaid = '300';
    row.advancePremiumTaxCredit = advance.times(shared ? 2 : 1).toFixed();
    row.otherPersonPaid = d(row.grossPremium).minus(300).minus(row.advancePremiumTaxCredit).toFixed();
    Object.assign(row.personAmounts![0], { amountPaid: '250', advancePremiumTaxCredit: advance.minus(noncoverageAdvance).toFixed() });
    Object.assign(row.personAmounts![1], { amountPaid: '50', advancePremiumTaxCredit: noncoverageAdvance.toFixed() });
    if (shared) row.personAmounts![2].advancePremiumTaxCredit = advance.toFixed();
  }
  return input;
}

export function actualPaidRepaymentTwoOwners() {
  const input = marketplaceFullRepaymentTwoOwners();
  for (const plan of input.form7206!.plans!) for (const row of plan.payments!) {
    Object.assign(row, { ownerOrBusinessPaid: '300', otherPersonPaid: '200' });
    row.personAmounts![0].amountPaid = '250'; row.personAmounts![1].amountPaid = '50';
  }
  return input;
}

export function actualPaidRepaymentMarriage(shared = false) {
  const input = marriageCoverageFamilyInput(shared), plan = input.form7206!.plans![0];
  input.scheduleC!.grossReceipts = '300000';
  for (const row of plan.payments!) {
    row.ownerOrBusinessPaid = d(row.ownerOrBusinessPaid).minus(100).toFixed();
    row.otherPersonPaid = d(row.otherPersonPaid).plus(100).toFixed();
    row.personAmounts![0].amountPaid = d(row.personAmounts![0].amountPaid).minus(100).toFixed();
  }
  return input;
}

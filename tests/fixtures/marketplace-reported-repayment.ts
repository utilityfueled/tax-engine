import { d } from '@/utils/decimal.js';
import { marketplaceFullRepaymentInput } from './marketplace-full-repayment.js';

/** Fictional original costs, person receipts and reported-policy sources. */
export function marketplaceReportedRepaymentInput(shared = false, small = false, year = 2025) {
  const input = marketplaceFullRepaymentInput(shared, year);
  const original = input.form1095A[0], plan = input.form7206!.plans![0];
  const advance = d(small ? '0.01' : '1000.49'), cash = d('1500').minus(advance);
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = advance.times(shared ? 2 : 1).toFixed();
  plan.coverageFamilySources!.policies![0].original = structuredClone(original);
  if (shared) input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  for (const row of input.form8962!.monthlyReconciliation!) row.advancePremiumTaxCredit = advance.toFixed();
  for (const row of plan.payments!) {
    row.ownerOrBusinessPaid = cash.toFixed(); row.otherPersonPaid = shared ? cash.toFixed() : '0';
    row.advancePremiumTaxCredit = advance.times(shared ? 2 : 1).toFixed();
    Object.assign(row.personAmounts![0], { amountPaid: small ? '1000' : '399.51', advancePremiumTaxCredit: small ? '0' : '600.49' });
    Object.assign(row.personAmounts![1], { amountPaid: small ? '499.99' : '100', advancePremiumTaxCredit: small ? '0.01' : '400' });
    if (shared) row.personAmounts![2].advancePremiumTaxCredit = advance.toFixed();
  }
  return input;
}

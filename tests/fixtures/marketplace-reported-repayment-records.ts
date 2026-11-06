import { marketplaceFullRepaymentRecords } from './marketplace-full-repayment-records';

/** Original fictional cents; no entered current repayment or deduction. */
export function marketplaceReportedRepaymentRecords(shared = false) {
  const records = marketplaceFullRepaymentRecords(shared), plan = records.health.plans[0]!;
  const original = records.coverage.policies[0]!;
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = shared ? '2000.98' : '1000.49';
  plan.coverageFamilySources!.policies[0]!.original = structuredClone(original);
  if (shared) records.coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(original);
  for (const row of records.coverage.monthlyReconciliation) row.advancePremiumTaxCredit = '1000.49';
  for (const row of plan.payments) {
    row.ownerOrBusinessPaid = '499.51'; row.otherPersonPaid = shared ? '499.51' : '0';
    row.advancePremiumTaxCredit = shared ? '2000.98' : '1000.49';
    Object.assign(row.personAmounts[0]!, { amountPaid: '399.51', advancePremiumTaxCredit: '600.49' });
    Object.assign(row.personAmounts[1]!, { amountPaid: '100', advancePremiumTaxCredit: '400' });
    if (shared) row.personAmounts[2]!.advancePremiumTaxCredit = '1000.49';
  }
  return records;
}

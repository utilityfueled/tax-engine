import { guidedCoverageFamilyHealthRecords } from './guided-coverage-family-health-records';

/** Explicit fictional receipts, shared by browser and source tests without engine imports. */
export function marketplaceFullRepaymentRecords(shared = false) {
  const records = guidedCoverageFamilyHealthRecords(shared ? 'agreement' : undefined);
  const original = records.coverage.policies[0]!, plan = records.health.plans[0]!;
  for (const row of original.monthlyPremiums) Object.assign(row, {
    enrolleePremium: shared ? '3000' : '1500', advancePremiumTaxCredit: shared ? '2000' : '1000', slcsp: shared ? '2000' : '1000',
  });
  plan.coverageFamilySources!.policies[0]!.original = structuredClone(original);
  if (shared) records.coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(original);
  for (const row of records.coverage.monthlyReconciliation) Object.assign(row, { enrolleePremium: '1500', advancePremiumTaxCredit: '1000' });
  for (const row of plan.payments) {
    Object.assign(row, { grossPremium: shared ? '3000' : '1500', ownerOrBusinessPaid: '500', otherPersonPaid: shared ? '500' : '0', advancePremiumTaxCredit: shared ? '2000' : '1000' });
    Object.assign(row.personAmounts[0]!, { amountPaid: '400', advancePremiumTaxCredit: '600' });
    Object.assign(row.personAmounts[1]!, { amountPaid: '100', advancePremiumTaxCredit: '400' });
    if (shared) Object.assign(row.personAmounts[2]!, { amountPaid: '0', advancePremiumTaxCredit: '1000' });
  }
  return records;
}

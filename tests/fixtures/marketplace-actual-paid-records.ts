import { marketplaceFullRepaymentRecords } from './marketplace-full-repayment-records';
import { marriageCoverageFamilyRecords } from './marriage-coverage-family-records';

/** Plain fictional original receipts for browser and guide; no computed tax inputs. */
export function marketplaceActualPaidRecords(shared = false, cents = false) {
  const records = marketplaceFullRepaymentRecords(shared), plan = records.health.plans[0]!, original = records.coverage.policies[0]!;
  const ownAdvance = cents ? '1000.49' : '1000', fullAdvance = shared ? cents ? '2000.98' : '2000' : ownAdvance;
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = fullAdvance;
  plan.coverageFamilySources!.policies[0]!.original = structuredClone(original);
  if (shared) records.coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(original);
  for (const row of records.coverage.monthlyReconciliation) row.advancePremiumTaxCredit = ownAdvance;
  for (const row of plan.payments) {
    Object.assign(row, { ownerOrBusinessPaid: '300', otherPersonPaid: shared ? cents ? '699.02' : '700' : cents ? '199.51' : '200', advancePremiumTaxCredit: fullAdvance });
    Object.assign(row.personAmounts[0]!, { amountPaid: '250', advancePremiumTaxCredit: cents ? '600.49' : '600' });
    Object.assign(row.personAmounts[1]!, { amountPaid: '50', advancePremiumTaxCredit: '400' });
    if (shared) row.personAmounts[2]!.advancePremiumTaxCredit = ownAdvance;
  }
  return records;
}
export function marriageActualPaidRecords(shared = false) {
  const records = marriageCoverageFamilyRecords(shared, false), plan = records.health.plans[0]!;
  for (const row of plan.payments) {
    const uncovered = row.coverageMonth === '2' || row.coverageMonth === '12';
    row.ownerOrBusinessPaid = uncovered ? '900' : '200';
    row.otherPersonPaid = shared ? uncovered ? '1100' : '400' : '100';
    row.personAmounts[0]!.amountPaid = row.ownerOrBusinessPaid;
  }
  return records;
}

import { guidedCoverageFamilyHealthRecords } from './guided-coverage-family-health-records';

/** Actual fictional amounts; browser-safe with no engine/runtime aliases. */
export function marketplaceActualCashRecords(shared = false) {
  const records = guidedCoverageFamilyHealthRecords(shared ? 'no_advance' : undefined);
  const plan = records.health.plans[0]!, original = records.coverage.policies[0]!;
  for (const row of original.monthlyPremiums) row.advancePremiumTaxCredit = '0';
  plan.coverageFamilySources!.policies[0]!.original = structuredClone(original);
  if (shared) records.coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(original);
  for (const row of records.coverage.monthlyReconciliation) row.advancePremiumTaxCredit = '0';
  for (const row of plan.coverageFamilySources!.months) row.personFacts[1]!.sourceReference = 'Actual spouse non-employer Medicare coverage';
  for (const row of plan.payments) {
    Object.assign(row, { ownerOrBusinessPaid: '450', otherPersonPaid: shared ? '1425' : '800', advancePremiumTaxCredit: '0' });
    row.personAmounts[0]!.amountPaid = '300'; row.personAmounts[1]!.amountPaid = '150';
    for (const person of row.personAmounts) person.advancePremiumTaxCredit = '0';
  }
  return records;
}

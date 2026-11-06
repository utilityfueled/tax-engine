import { marketplaceActualCashRecords } from './marketplace-actual-cash-records';

/** Fictional original sources; browser-safe, with no calculation or entered claim. */
export function marketplaceOutsidePersonRecords(actualFamilyCash = false) {
  const records = marketplaceActualCashRecords(true), plan = records.health.plans[0]!;
  plan.coveredPersons.find(row => row.personId === 'outside')!.relationshipToOwner = 'child_under_27';
  records.health.persons.find(row => row.personId === 'outside')!.attainedAgeAtYearEnd = '26';
  const other = records.coverage.sharedPolicyAllocations!.policies[0]!;
  plan.coverageFamilySources!.outsidePersonReturns = [{ personId: 'outside', sourceTaxYear: '2025',
    sourceReference: 'Actual completed outside claimant Form8962', returnStatus: 'completed',
    claimantName: other.otherTaxpayerName, claimantSsn: other.otherTaxpayerSsn,
    policySourceIds: [...plan.marketplacePolicySourceIds], allPoliciesIncludedConfirmed: true, form8962Line24: '0' }];
  for (const row of plan.payments) {
    row.ownerOrBusinessPaid = actualFamilyCash ? '550' : '1350';
    row.otherPersonPaid = actualFamilyCash ? '1325' : '525';
    row.personAmounts.find(person => person.personId === 'primary')!.amountPaid = actualFamilyCash ? '300' : '850';
    row.personAmounts.find(person => person.personId === 'spouse')!.amountPaid = actualFamilyCash ? '150' : '400';
    row.personAmounts.find(person => person.personId === 'outside')!.amountPaid = '100';
  }
  return records;
}

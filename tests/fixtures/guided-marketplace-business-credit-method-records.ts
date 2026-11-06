import { guidedCoverageFamilyHealthRecords } from './guided-coverage-family-health-records';

/** Actual fictional choices and originals. No engine/runtime imports for browser use. */
export function guidedMarketplaceBusinessCreditMethodRecords() {
  const records = guidedCoverageFamilyHealthRecords();
  const { health, coverage } = records, first = health.plans[0], original = coverage.policies[0];
  for (const row of original.monthlyPremiums) Object.assign(row, { enrolleePremium: '750', advancePremiumTaxCredit: '0' });
  for (const payment of first.payments) {
    Object.assign(payment, { grossPremium: '750', ownerOrBusinessPaid: '750', advancePremiumTaxCredit: '0' });
    Object.assign(payment.personAmounts[0], { amountPaid: '250', advancePremiumTaxCredit: '0' });
    payment.personAmounts[1].amountPaid = '500';
  }
  first.coverageFamilySources!.policies[0].original = structuredClone(original);
  for (const month of first.coverageFamilySources!.months) month.nonCoverageFamilySlcsp = '2000';
  const secondOriginal = structuredClone(original); secondOriginal.policyNumber = 'Actual shareholder family policy';
  secondOriginal.coveredIndividuals = [structuredClone(original.coveredIndividuals[0])];
  secondOriginal.monthlyPremiums.forEach(month => { month.enrolleePremium = '500'; });
  coverage.policies.push(secondOriginal);
  const second = structuredClone(first);
  Object.assign(second, { planId: 'shareholder-plan', policyReference: 'Actual shareholder plan', accountHolder: 'spouse', businessSourceId: 'formW2:0', businessKind: 's_corporation', premiumsIncludedInOwnerIncome: true, moreThanTwoPercentShareholder: true, allCoveredPersonsInCoverageFamilyConfirmed: true, marketplacePolicySourceIds: ['form1095A:1'] });
  second.coveredPersons = [{ ...first.coveredPersons[0], relationshipToOwner: 'spouse' }];
  second.payments = second.payments.map(row => ({ ...row, sourceId: `shareholder:${row.sourceId}`, grossPremium: '500', ownerOrBusinessPaid: '500', personAmounts: [{ ...row.personAmounts[0], payer: 'business_paid_or_reimbursed', amountPaid: '500' }] }));
  second.coverageFamilySources!.policies = [{ sourceId: 'form1095A:1', original: structuredClone(secondOriginal) }];
  second.coverageFamilySources!.persons = [structuredClone(first.coverageFamilySources!.persons[0])];
  for (const month of second.coverageFamilySources!.months) { month.personFacts = [month.personFacts[0]]; month.nonCoverageFamilySlcsp = '0'; month.nonCoverageFamilyMemberSsns = []; }
  health.plans.push(second);
  health.marketplaceCreditAllocation = { sourceTaxYear: '2025', sourceReference: 'Actual recorded credit method', sourceFactsConfirmed: true, method: 'monthly_eligible_plan_enrollment', sameMethodForAllCalculationsConfirmed: true };
  for (const month of coverage.monthlyReconciliation) Object.assign(month, { enrolleePremium: '1250', advancePremiumTaxCredit: '0' });
  return records;
}

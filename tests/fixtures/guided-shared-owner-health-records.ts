import { guidedSharedMarketplaceHealthRecords } from './guided-shared-marketplace-health-records';

/** Explicit fictional original records; browser-safe and no calculated amounts. */
export function guidedSharedOwnerHealthRecords(second: 'shared' | 'household' = 'shared') {
  const { health, coverage } = guidedSharedMarketplaceHealthRecords();
  coverage.taxFamilySize = '2';
  Object.assign(coverage.sharedPolicyAllocations!, { spouseName: 'Taylor Example', spouseSsn: '222-33-4444' });
  const primary = coverage.policies[0]!;
  primary.monthlyPremiums.forEach(row => { row.slcsp = '700'; row.advancePremiumTaxCredit = '20'; });
  coverage.sharedPolicyAllocations!.policies[0]!.original = structuredClone(primary);
  const spouse = structuredClone(primary), shared = second === 'shared';
  Object.assign(spouse, { policyNumber: 'actual-spouse-policy', recipientName: 'Taylor Example', recipientSsn: '222-33-4444',
    coveredIndividuals: [{ name: 'Taylor Example', ssn: '222-33-4444', firstMonth: '1', lastMonth: '12' },
      ...(shared ? [{ name: 'Riley Another', ssn: '345-67-8901', firstMonth: '1', lastMonth: '12' }] : [])] });
  spouse.monthlyPremiums.forEach(row => { row.enrolleePremium = shared ? '500' : '250'; row.slcsp = shared ? '700' : '350'; row.advancePremiumTaxCredit = shared ? '10' : '5'; });
  coverage.policies.push(spouse);
  const spousePolicy = structuredClone(coverage.sharedPolicyAllocations!.policies[0]!);
  Object.assign(spousePolicy, { sourceId: 'form1095A:1', original: structuredClone(spouse), otherTaxpayerName: shared ? 'Riley Another' : '', otherTaxpayerSsn: shared ? '345-67-8901' : '',
    situation: shared ? 'other_two_tax_families' : 'not_shared', agreementConfirmed: shared ? true : null, agreementReference: shared ? 'Actual separate spouse agreement' : '',
    noCurrentYearMarriageOrDivorceConfirmed: shared ? true : null, twoTaxFamiliesConfirmed: shared ? true : null, allCoveredPeopleAssignedConfirmed: shared ? true : null,
    unsharedSourceReference: shared ? '' : 'Actual household-only spouse policy', allCoveredPeopleInThisTaxFamilyConfirmed: shared ? null : true,
    coveredFamilyAssignments: shared ? [{ ssn: '222-33-4444', family: 'this_return' }, { ssn: '345-67-8901', family: 'other_return' }] : [],
    monthlyAllocations: shared ? structuredClone(spousePolicy.monthlyAllocations) : [] });
  coverage.sharedPolicyAllocations!.policies.push(spousePolicy);
  coverage.monthlyReconciliation.forEach(row => { row.enrolleePremium = '750'; row.slcsp = '700'; row.advancePremiumTaxCredit = '15'; });
  health.persons.push({ personId: 'spouse', name: 'Taylor Example', householdRole: 'spouse', attainedAgeAtYearEnd: '33' });
  if (shared) health.persons.push({ personId: 'other-spouse', name: 'Riley Another', householdRole: 'other', attainedAgeAtYearEnd: '40' });
  const firstPlan = health.plans[0]!;
  firstPlan.payments.forEach(payment => { payment.ownerOrBusinessPaid = payment.otherPersonPaid = '490'; payment.advancePremiumTaxCredit = '20';
    payment.personAmounts.forEach(person => { person.amountPaid = person.personId === 'primary' ? '490' : '0'; person.advancePremiumTaxCredit = '10'; }); });
  const secondPlan = structuredClone(firstPlan);
  Object.assign(secondPlan, { planId: 'spouse-plan', policyReference: 'actual-spouse-policy', accountHolder: 'spouse', businessSourceId: 'formW2:0', businessKind: 's_corporation',
    moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true, marketplacePolicySourceIds: ['form1095A:1'], allCoveredPersonsInCoverageFamilyConfirmed: !shared,
    coveredPersons: [{ personId: 'spouse', relationshipToOwner: 'self', dependencyEligibilityConfirmed: null }, ...(shared ? [{ personId: 'other-spouse', relationshipToOwner: 'other', dependencyEligibilityConfirmed: null }] : [])] });
  secondPlan.sharedMarketplaceSources!.sourceReference = 'Actual spouse original people and independent payments';
  secondPlan.sharedMarketplaceSources!.persons = [{ personId: 'spouse', coveredIndividualSsn: '222-33-4444' }, ...(shared ? [{ personId: 'other-spouse', coveredIndividualSsn: '345-67-8901' }] : [])];
  secondPlan.payments.forEach(payment => {
    payment.sourceId = `spouse-${payment.sourceId}`; payment.grossPremium = shared ? '500' : '250'; payment.ownerOrBusinessPaid = '245'; payment.otherPersonPaid = shared ? '245' : '0'; payment.advancePremiumTaxCredit = shared ? '10' : '5';
    payment.personAmounts = [{ ...payment.personAmounts[0]!, personId: 'spouse', payer: 'business_paid_or_reimbursed', amountPaid: '245', advancePremiumTaxCredit: '5' },
      ...(shared ? [{ ...payment.personAmounts[1]!, personId: 'other-spouse', amountPaid: '0', advancePremiumTaxCredit: '5' }] : [])];
  });
  health.plans.push(secondPlan);
  return { health, coverage };
}

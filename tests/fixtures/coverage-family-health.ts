import { sharedPolicyFixture } from './shared-policy.js';
import { marketplaceHealthInput } from './marketplace-health.js';

/** Fictional Gary/Sue source shape; dollar amounts are the published example.
 * No production unknown or confirmation is initialized from this fixture. */
export function coverageFamilyHealthInput(year = 2025) {
  const input = marketplaceHealthInput();
  input.taxpayer.taxYear = year;
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'Alex', ssn: '987-65-4321' };
  input.form8962!.taxFamilySize = 2;
  const original = input.form1095A[0];
  Object.assign(original, { taxYear: year, sourceFactsComplete: true, recipientName: 'Jane Doe', recipientSsn: '123-45-6789',
    coveredIndividuals: [{ name: 'Jane Doe', ssn: '123-45-6789', firstMonth: 1, lastMonth: 12 },
      { name: 'Alex Doe', ssn: '987-65-4321', firstMonth: 1, lastMonth: 12 }] });
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ ...row, enrolleePremium: '1250', slcsp: '1000', advancePremiumTaxCredit: '500' }));
  input.form8962!.monthlyReconciliation = original.monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false }));
  const health = input.form7206!, plan = health.plans![0];
  health.sourceTaxYear = year;
  health.persons![0].attainedAgeAtYearEnd = year - 1990;
  health.persons!.push({ personId: 'spouse', name: 'Alex Doe', householdRole: 'spouse', attainedAgeAtYearEnd: year - 1990 });
  plan.allCoveredPersonsInCoverageFamilyConfirmed = false;
  plan.coveredPersons!.push({ personId: 'spouse', relationshipToOwner: 'spouse' });
  plan.payments = plan.payments!.map(row => ({ ...row, datePaid: row.datePaid!.replace('2026-', `${year}-`), coverageTaxYear: year,
    grossPremium: '1250', ownerOrBusinessPaid: '750', advancePremiumTaxCredit: '500', personAmounts: [
      { ...row.personAmounts![0], amountPaid: '350', advancePremiumTaxCredit: '500' },
      { ...row.personAmounts![0], personId: 'spouse', amountPaid: '400', advancePremiumTaxCredit: '0' },
    ] }));
  const coverageFamilySources = {
    sourceTaxYear: year, sourceReference: 'Actual monthly Marketplace and employer records', sourceFactsConfirmed: true, allPolicySourcesIncluded: true,
    policies: [{ sourceId: 'form1095A:0', original: structuredClone(original) }],
    persons: [{ personId: 'primary', coveredIndividualSsn: '123-45-6789' }, { personId: 'spouse', coveredIndividualSsn: '987-65-4321' }],
    months: original.monthlyPremiums.map(row => ({ month: row.month, sourceReference: `Actual eligibility ${row.month}`, allCoveredPersonsIncludedConfirmed: true,
      personFacts: [{ personId: 'primary', sourceReference: 'Actual primary eligible Marketplace record', fullCoverageMonthConfirmed: true, otherMecEligible: false },
        { personId: 'spouse', sourceReference: 'Actual spouse employer-only MEC offer', fullCoverageMonthConfirmed: true, otherMecEligible: true }],
      coverageFamilySlcsp: '1000', nonCoverageFamilySlcsp: '500', coverageFamilySourceReference: 'Actual coverage-family benchmark', nonCoverageFamilySourceReference: 'Actual spouse-only benchmark',
      coverageFamilyMemberSsns: ['123-45-6789'], nonCoverageFamilyMemberSsns: ['987-65-4321'],
      allCoverageFamilyMembersIncludedConfirmed: true, allNonCoverageFamilyMembersIncludedConfirmed: true,
    })),
  };
  // Type is supplied by the new source schema; before implementation this keeps
  // the red control focused on the missing calculation rather than an amount.
  Object.assign(plan, { coverageFamilySources });
  return { input, coverageFamilySources };
}

/** Exact full original, independently paid half share, and actual own-family split. */
export function sharedCoverageFamilyHealthInput(noAdvance = false) {
  const fixture = coverageFamilyHealthInput(), { input, coverageFamilySources } = fixture;
  const shared = sharedPolicyFixture(), packet = structuredClone(shared.form8962!.sharedPolicyAllocations!);
  packet.spouseName = 'Alex Doe'; packet.spouseSsn = '987-65-4321';
  const plan = input.form7206!.plans![0], original = input.form1095A[0];
  original.coveredIndividuals!.push({ name: 'Robin Other', ssn: '234-56-7890', firstMonth: 1, lastMonth: 12 });
  for (const row of original.monthlyPremiums) Object.assign(row, { enrolleePremium: noAdvance ? '1875' : '2500', slcsp: noAdvance ? null : '2000', advancePremiumTaxCredit: noAdvance ? '0' : '1000' });
  const policy = packet.policies![0]; policy.original = structuredClone(original);
  policy.coveredFamilyAssignments!.push({ ssn: '987-65-4321', family: 'this_return' });
  if (noAdvance) {
    policy.situation = 'no_advance_credit'; policy.agreementConfirmed = undefined; policy.agreementReference = undefined; policy.monthlyAllocations = undefined; policy.originalSlcspCorrectConfirmed = false;
    policy.noAdvanceAllocation = { sourceTaxYear: 2025, sourceReference: 'Actual independent family benchmarks', sourceFactsConfirmed: true, allCoveredPeopleInCoverageFamiliesConfirmed: false,
      monthlyBenchmarks: original.monthlyPremiums.map(row => ({ month: row.month, thisReturnSlcsp: '1000', otherReturnSlcsp: '500', thisReturnSourceReference: 'Actual primary eligible family', otherReturnSourceReference: 'Actual Robin family', thisReturnCoveredIndividualSsns: ['123-45-6789'], otherReturnCoveredIndividualSsns: ['234-56-7890'] })) };
  }
  input.form8962!.allocationRequired = true; input.form8962!.sharedPolicyAllocations = packet;
  plan.sharedMarketplaceSources = { sourceTaxYear: 2025, sourceReference: 'Actual person payment links', sourceFactsConfirmed: true, allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: false,
    persons: [...structuredClone(coverageFamilySources.persons), { personId: 'outside', coveredIndividualSsn: '234-56-7890' }] };
  plan.coveredPersons!.push({ personId: 'outside', relationshipToOwner: 'other' });
  input.form7206!.persons!.push({ personId: 'outside', name: 'Robin Other', householdRole: 'other', attainedAgeAtYearEnd: 40 });
  coverageFamilySources.persons.push({ personId: 'outside', coveredIndividualSsn: '234-56-7890' });
  coverageFamilySources.policies[0].original = structuredClone(original);
  for (const row of plan.payments!) {
    Object.assign(row, { grossPremium: noAdvance ? '1875' : '2500', ownerOrBusinessPaid: noAdvance ? '1250' : '750', otherPersonPaid: noAdvance ? '625' : '750', advancePremiumTaxCredit: noAdvance ? '0' : '1000' });
    if (noAdvance) { row.personAmounts![0].amountPaid = '850'; row.personAmounts![0].advancePremiumTaxCredit = '0'; }
    row.personAmounts!.push({ ...row.personAmounts![0], personId: 'outside', amountPaid: '0', advancePremiumTaxCredit: noAdvance ? '0' : '500' });
  }
  if (noAdvance) for (const month of input.form8962!.monthlyReconciliation!) month.advancePremiumTaxCredit = '0';
  return fixture;
}

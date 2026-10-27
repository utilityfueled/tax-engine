import { marketplaceMarriageHealthRecords } from './marketplace-marriage-health-records';

/** Plain fictional originals also used by the production browser workflow. */
export function sharedMarriageHealthRecords(otherRecipient = false) {
  const records = marketplaceMarriageHealthRecords(), { coverage, health, personal } = records;
  const original = coverage.policies[0], outside = { name: 'Robin Other', ssn: '234-56-7890', firstMonth: '1', lastMonth: '12' };
  original.coveredIndividuals!.push(outside);
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ ...row, enrolleePremium: '2000', slcsp: '1600', advancePremiumTaxCredit: '1400' }));
  if (otherRecipient) { original.recipientName = outside.name; original.recipientSsn = outside.ssn; }
  coverage.allocationRequired = true;
  coverage.marriageSources!.policies[0].original = structuredClone(original);
  coverage.sharedPolicyAllocations = { sourceTaxYear: '2025', sourceReference: 'Actual independent two-family allocation', sourceFactsConfirmed: true, allSharedPoliciesIncluded: true,
    primaryName: 'Avery Example', primarySsn: personal.ssn, spouseName: 'Blair Example', spouseSsn: '444-55-6666',
    policies: [{ sourceId: 'form1095A:0', original: structuredClone(original), otherTaxpayerName: outside.name, otherTaxpayerSsn: outside.ssn,
      situation: 'other_two_tax_families', noCurrentYearMarriageOrDivorceConfirmed: false,
      otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: true, otherTaxpayerRelationshipSourceReference: 'Actual unrelated other-taxpayer relationship history',
      twoTaxFamiliesConfirmed: true, allCoveredPeopleAssignedConfirmed: true, originalSlcspCorrectConfirmed: true,
      coveredFamilyAssignments: [{ ssn: personal.ssn, family: 'this_return' }, { ssn: outside.ssn, family: 'other_return' }],
      agreementConfirmed: true, agreementReference: 'Actual signed half-share agreement', monthlyAllocations: original.monthlyPremiums.map(row => ({ month: row.month, fraction: '0.50' })) }] };
  health.persons.push({ personId: 'outside', name: outside.name, householdRole: 'other', attainedAgeAtYearEnd: '40' });
  const plan = health.plans[0];
  plan.allCoveredPersonsInCoverageFamilyConfirmed = false;
  plan.sharedMarketplaceSources = { sourceTaxYear: '2025', sourceReference: 'Actual independent original-policy and payment links', sourceFactsConfirmed: true,
    allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true,
    persons: [{ personId: 'primary', coveredIndividualSsn: personal.ssn }, { personId: 'outside', coveredIndividualSsn: outside.ssn }] };
  plan.coveredPersons.push({ personId: 'outside', relationshipToOwner: 'other', dependencyEligibilityConfirmed: null });
  plan.payments = plan.payments.map(row => ({ ...row, grossPremium: '2000', otherPersonPaid: '300', advancePremiumTaxCredit: '1400',
    personAmounts: [...row.personAmounts, { personId: 'outside', payer: 'owner_after_tax', amountPaid: '0', advancePremiumTaxCredit: '700', excludedPublicSafetyOfficerAmount: '0', publicSafetyOfficerAccountHolder: '', otherTaxFreeFunding: '0' }] }));
  return records;
}

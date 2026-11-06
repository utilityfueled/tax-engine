import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { marketplaceMarriageHealthInput, twoOwnerMarketplaceMarriageHealthInput } from './marketplace-marriage-health.js';

/** Fictional full original and independent receipt, not an allocated replacement. */
export function sharedMarriageHealthInput(year = 2025, method: 'agreement' | 'default' = 'agreement', otherRecipient = false) {
  const input = marketplaceMarriageHealthInput(year), facts = input.form8962!, health = input.form7206!, plan = health.plans![0];
  const original = input.form1095A[0], outside = { name: 'Robin Other', ssn: '234-56-7890', firstMonth: 1, lastMonth: 12 };
  original.coveredIndividuals!.push(outside);
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ ...row, enrolleePremium: '2000', slcsp: '1600', advancePremiumTaxCredit: '1400' }));
  if (otherRecipient) { original.recipientName = outside.name; original.recipientSsn = outside.ssn; }
  facts.marriageSources!.policies![0].original = structuredClone(original);
  facts.allocationRequired = true;
  facts.sharedPolicyAllocations = { sourceTaxYear: year, sourceReference: 'Actual independent two-family allocation', sourceFactsConfirmed: true, allSharedPoliciesIncluded: true,
    primaryName: 'Avery Example', primarySsn: input.taxpayer.primary.ssn, spouseName: 'Blair Example', spouseSsn: input.taxpayer.spouse!.ssn,
    policies: [{ sourceId: 'form1095A:0', original: structuredClone(original), otherTaxpayerName: outside.name, otherTaxpayerSsn: outside.ssn,
      situation: 'other_two_tax_families', noCurrentYearMarriageOrDivorceConfirmed: false,
      otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: true, otherTaxpayerRelationshipSourceReference: 'Actual unrelated other-taxpayer relationship history',
      twoTaxFamiliesConfirmed: true, allCoveredPeopleAssignedConfirmed: true, originalSlcspCorrectConfirmed: true,
      coveredFamilyAssignments: [{ ssn: input.taxpayer.primary.ssn, family: 'this_return' }, { ssn: outside.ssn, family: 'other_return' }],
      agreementConfirmed: method === 'agreement', ...(method === 'agreement' ? { agreementReference: 'Actual signed half-share agreement', monthlyAllocations: original.monthlyPremiums.map(row => ({ month: row.month, fraction: '0.50' })) }
        : { defaultAllocation: { sourceReference: 'Actual initial enrollee record', enrollingTaxpayerSsn: outside.ssn, allCoveredPeopleEnrolledByTaxpayerConfirmed: true } }) }] };
  health.persons!.push({ personId: 'outside', name: outside.name, householdRole: 'other', attainedAgeAtYearEnd: 40 });
  plan.allCoveredPersonsInCoverageFamilyConfirmed = false;
  plan.sharedMarketplaceSources = { sourceTaxYear: year, sourceReference: 'Actual independent original-policy and payment links', sourceFactsConfirmed: true,
    allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true,
    persons: [{ personId: 'primary', coveredIndividualSsn: input.taxpayer.primary.ssn }, { personId: 'outside', coveredIndividualSsn: outside.ssn }] };
  plan.coveredPersons!.push({ personId: 'outside', relationshipToOwner: 'other' });
  plan.payments = plan.payments!.map(row => ({ ...row, grossPremium: '2000', otherPersonPaid: '300', advancePremiumTaxCredit: '1400',
    personAmounts: [...row.personAmounts!, { personId: 'outside', payer: 'owner_after_tax', amountPaid: '0', advancePremiumTaxCredit: '700', excludedPublicSafetyOfficerAmount: '0', otherTaxFreeFunding: '0' }] }));
  return TaxYearInputSchema.parse(input);
}

/** Exact-thirds no-advance policy before a separate, later APTC statement. */
export function noAdvanceSharedMarriageInput() {
  const input = sharedMarriageHealthInput(), facts = input.form8962!, original = input.form1095A[0];
  facts.selfEmployedHealthInsuranceCoordinationRequired = false; input.form7206 = undefined;
  original.coveredIndividuals = original.coveredIndividuals!.map(person => ({ ...person, lastMonth: 6 }));
  original.monthlyPremiums = original.monthlyPremiums.filter(row => row.month <= 6).map(row => ({ ...row, enrolleePremium: '3000.03', slcsp: null, advancePremiumTaxCredit: '0' }));
  const shared = facts.sharedPolicyAllocations!.policies![0];
  Object.assign(shared, { original: structuredClone(original), situation: 'no_advance_credit', agreementConfirmed: undefined, agreementReference: undefined, monthlyAllocations: undefined,
    originalSlcspCorrectConfirmed: undefined, noAdvanceAllocation: { sourceTaxYear: 2025, sourceReference: 'Actual two-family benchmark records', sourceFactsConfirmed: true, allCoveredPeopleInCoverageFamiliesConfirmed: true,
      monthlyBenchmarks: original.monthlyPremiums.map(row => ({ month: row.month, thisReturnSlcsp: '800', otherReturnSlcsp: '1600', thisReturnSourceReference: 'Actual primary benchmark', otherReturnSourceReference: 'Actual Robin benchmark',
        thisReturnCoveredIndividualSsns: [input.taxpayer.primary.ssn], otherReturnCoveredIndividualSsns: ['234-56-7890'] })) } });
  const spouse = input.taxpayer.spouse!, spousePolicy = { ...structuredClone(original), policyNumber: 'ACTUAL-UNSHARED-SPOUSE', recipientName: 'Blair Example', recipientSsn: spouse.ssn,
    coveredIndividuals: [{ name: 'Blair Example', ssn: spouse.ssn, firstMonth: 7, lastMonth: 12 }],
    monthlyPremiums: Array.from({ length: 6 }, (_, index) => ({ month: index + 7, enrolleePremium: '500', slcsp: '400', advancePremiumTaxCredit: '450' })), sourceFactsComplete: true };
  input.form1095A.push(spousePolicy);
  facts.sharedPolicyAllocations!.policies!.push({ sourceId: 'form1095A:1', original: structuredClone(spousePolicy), situation: 'not_shared', unsharedSourceReference: 'Actual spouse-only statement', allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  facts.marriageSources!.policies = input.form1095A.map((policy, index) => ({ sourceId: `form1095A:${index}`, original: structuredClone(policy), sourceReference: `Actual original ${index}`, fullMonthCoverageConfirmed: true, allCoveredIndividualsEligibleForPtcConfirmed: true }));
  facts.marriageSources!.benchmarks = [
    ...Array.from({ length: 6 }, (_, index) => ({ owner: 'primary' as const, month: index + 1, slcsp: '800', sourceReference: 'Actual primary alternative benchmark', sourceFactsConfirmed: true, coveredIndividualSsns: [input.taxpayer.primary.ssn] })),
    { owner: 'spouse', month: 7, slcsp: '400', sourceReference: 'Actual spouse alternative benchmark', sourceFactsConfirmed: true, coveredIndividualSsns: [spouse.ssn] },
  ];
  facts.monthlyReconciliation = [
    ...original.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: '1000.01', slcsp: '800', advancePremiumTaxCredit: '0', coverageEligible: true, incomeBasedSepEnrollment: false })),
    ...spousePolicy.monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false })),
  ];
  // Literal source division is exact here; the printed .33 is not the input.
  if (!d('3000.03').div(3).eq('1000.01')) throw new Error('Invalid fictional source arithmetic');
  return TaxYearInputSchema.parse(input);
}

/** Actual separate owners: primary shared statement and spouse unshared statement. */
export function twoOwnerSharedMarriageHealthInput() {
  const input = twoOwnerMarketplaceMarriageHealthInput(), shared = sharedMarriageHealthInput();
  const primary = input.form1095A[0], plan = input.form7206!.plans![0];
  primary.coveredIndividuals!.push(structuredClone(shared.form1095A[0].coveredIndividuals![1]));
  primary.monthlyPremiums = primary.monthlyPremiums.map(row => ({ ...row, enrolleePremium: '2000', slcsp: '1600', advancePremiumTaxCredit: '1800' }));
  input.form8962!.allocationRequired = true;
  input.form8962!.sharedPolicyAllocations = structuredClone(shared.form8962!.sharedPolicyAllocations);
  input.form8962!.sharedPolicyAllocations!.policies![0].original = structuredClone(primary);
  input.form8962!.sharedPolicyAllocations!.policies!.push({ sourceId: 'form1095A:1', original: structuredClone(input.form1095A[1]),
    situation: 'not_shared', unsharedSourceReference: 'Actual independent spouse statement', allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  input.form8962!.marriageSources!.policies![0].original = structuredClone(primary);
  input.form7206!.persons!.push(structuredClone(shared.form7206!.persons![1]));
  plan.allCoveredPersonsInCoverageFamilyConfirmed = false;
  plan.sharedMarketplaceSources = structuredClone(shared.form7206!.plans![0].sharedMarketplaceSources);
  plan.coveredPersons!.push({ personId: 'outside', relationshipToOwner: 'other' });
  plan.payments = plan.payments!.map(payment => ({ ...payment, grossPremium: '2000', otherPersonPaid: '100', advancePremiumTaxCredit: '1800',
    personAmounts: [...payment.personAmounts!, { personId: 'outside', payer: 'owner_after_tax', amountPaid: '0', advancePremiumTaxCredit: '900', excludedPublicSafetyOfficerAmount: '0', otherTaxFreeFunding: '0' }] }));
  input.form7206!.plans![1].sharedMarketplaceSources = { sourceTaxYear: 2025, sourceReference: 'Actual spouse independent original and receipts', sourceFactsConfirmed: true,
    allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true,
    persons: [{ personId: 'spouse', coveredIndividualSsn: input.taxpayer.spouse!.ssn }] };
  return TaxYearInputSchema.parse(input);
}

/** Situation3 first, followed by a distinct unshared statement for the same owner. */
export function noAdvanceSharedMarriageHealthInput() {
  const input = noAdvanceSharedMarriageInput(), facts = input.form8962!, original = input.form1095A[1];
  original.recipientName = 'Avery Example'; original.recipientSsn = input.taxpayer.primary.ssn;
  original.coveredIndividuals = [{ name: 'Avery Example', ssn: input.taxpayer.primary.ssn, firstMonth: 7, lastMonth: 12 }];
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ ...row, enrolleePremium: '1000', slcsp: '800', advancePremiumTaxCredit: '1000' }));
  facts.sharedPolicyAllocations!.policies![1].original = structuredClone(original);
  facts.marriageSources!.policies![1].original = structuredClone(original);
  facts.marriageSources!.benchmarks![6] = { owner: 'primary', month: 7, slcsp: '800', sourceReference: 'Actual July primary alternative benchmark', sourceFactsConfirmed: true, coveredIndividualSsns: [input.taxpayer.primary.ssn] };
  facts.monthlyReconciliation = facts.monthlyReconciliation!.map(row => row.month <= 6 ? row : { ...row, enrolleePremium: '1000', slcsp: '800', advancePremiumTaxCredit: '1000' });
  facts.selfEmployedHealthInsuranceCoordinationRequired = true;
  input.form7206 = structuredClone(sharedMarriageHealthInput().form7206);
  const plan = input.form7206!.plans![0];
  plan.marketplacePolicySourceIds = ['form1095A:0', 'form1095A:1'];
  plan.payments = plan.payments!.map(payment => payment.coverageMonth! <= 6 ? { ...payment, grossPremium: '3000.03', ownerOrBusinessPaid: '1000.01', otherPersonPaid: '2000.02', advancePremiumTaxCredit: '0',
    personAmounts: payment.personAmounts!.map(person => ({ ...person, amountPaid: person.personId === 'primary' ? '1000.01' : '0', advancePremiumTaxCredit: '0' })) }
    : { ...payment, grossPremium: '1000', ownerOrBusinessPaid: '0', otherPersonPaid: '0', advancePremiumTaxCredit: '1000',
      personAmounts: payment.personAmounts!.map(person => ({ ...person, amountPaid: '0', advancePremiumTaxCredit: person.personId === 'primary' ? '1000' : '0' })) });
  return TaxYearInputSchema.parse(input);
}

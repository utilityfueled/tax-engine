import { TaxYearInputSchema } from '@/models/inputs.js';
import { twoOwnerMarketplaceHealthInput } from './marketplace-health-owners.js';

/** Fictional independent originals, actual payment sources and complete families. */
export function sharedOwnerHealthInput(year: 2025 | 2026 = 2025, second: 'shared' | 'household' = 'shared', method: 'agreement' | 'no-advance' = 'agreement') {
  const input = twoOwnerMarketplaceHealthInput(year);
  const own = [{ name: 'Jane Doe', ssn: '123-45-6789', id: 'primary' }, { name: 'John Doe', ssn: '555-55-5555', id: 'spouse' }] as const;
  const outside = [{ name: 'Robin Other', ssn: '234-56-7890', id: 'outside-primary' }, { name: 'Riley Another', ssn: '345-67-8901', id: 'outside-spouse' }];
  const premiums = ['500', '250'], fullPremiums = ['1000', '500'], cash = ['490', '245'], advances = ['10', '5'], fullAdvances = ['20', '10'];
  const facts = input.form8962!, health = input.form7206!;
  facts.allocationRequired = true;
  facts.monthlyReconciliation!.forEach(row => { row.advancePremiumTaxCredit = method === 'agreement' ? '15' : '0'; });
  facts.sharedPolicyAllocations = { sourceTaxYear: year, sourceReference: 'Actual separate plan originals and family allocation records', sourceFactsConfirmed: true,
    allSharedPoliciesIncluded: true, primaryName: own[0].name, primarySsn: own[0].ssn, spouseName: own[1].name, spouseSsn: own[1].ssn, policies: [] };
  input.form1095A.forEach((original, index) => {
    const shared = index === 0 || second === 'shared', person = own[index]!, other = outside[index]!;
    Object.assign(original, { sourceFactsComplete: true, recipientName: person.name, recipientSsn: person.ssn,
      coveredIndividuals: [{ name: person.name, ssn: person.ssn, firstMonth: 1, lastMonth: 12 },
        ...(shared ? [{ name: other.name, ssn: other.ssn, firstMonth: 1, lastMonth: 12 }] : [])] });
    original.monthlyPremiums.forEach(row => { row.enrolleePremium = shared ? fullPremiums[index]! : premiums[index]!;
      row.slcsp = shared ? (method === 'agreement' ? '700' : null) : method === 'agreement' ? '350' : '700';
      row.advancePremiumTaxCredit = method === 'agreement' ? (shared ? fullAdvances[index]! : advances[index]!) : '0'; });
    facts.sharedPolicyAllocations!.policies!.push(shared ? {
      sourceId: `form1095A:${index}`, original: structuredClone(original), otherTaxpayerName: other.name, otherTaxpayerSsn: other.ssn,
      situation: method === 'agreement' ? 'other_two_tax_families' : 'no_advance_credit', noCurrentYearMarriageOrDivorceConfirmed: true,
      twoTaxFamiliesConfirmed: true, allCoveredPeopleAssignedConfirmed: true, originalSlcspCorrectConfirmed: method === 'agreement',
      coveredFamilyAssignments: [{ ssn: person.ssn, family: 'this_return' }, { ssn: other.ssn, family: 'other_return' }],
      ...(method === 'agreement' ? { agreementConfirmed: true, agreementReference: `Actual ${person.id} signed allocation`,
        monthlyAllocations: original.monthlyPremiums.map(row => ({ month: row.month, fraction: '0.50' })) }
        : { noAdvanceAllocation: { sourceTaxYear: year, sourceReference: `Actual ${person.id} complete family benchmarks`, sourceFactsConfirmed: true,
          allCoveredPeopleInCoverageFamiliesConfirmed: true,
          monthlyBenchmarks: original.monthlyPremiums.map(row => ({ month: row.month, thisReturnSlcsp: '700', otherReturnSlcsp: '700',
            thisReturnSourceReference: 'Actual complete joint coverage-family benchmark', otherReturnSourceReference: `Actual ${other.name} benchmark`,
            thisReturnCoveredIndividualSsns: own.map(p => p.ssn), otherReturnCoveredIndividualSsns: [other.ssn] })) } }),
    } : { sourceId: `form1095A:${index}`, original: structuredClone(original), situation: 'not_shared',
      unsharedSourceReference: 'Actual household-only spouse enrollment', allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
    if (shared) health.persons!.push({ personId: other.id, name: other.name, householdRole: 'other', attainedAgeAtYearEnd: 40 });
    const plan = health.plans![index]!;
    plan.allCoveredPersonsInCoverageFamilyConfirmed = !shared;
    plan.coveredPersons = [{ personId: person.id, relationshipToOwner: 'self' }, ...(shared ? [{ personId: other.id, relationshipToOwner: 'other' as const }] : [])];
    plan.sharedMarketplaceSources = { sourceTaxYear: year, sourceReference: `Actual ${person.id} original and independent payments`, sourceFactsConfirmed: true,
      allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true,
      persons: [{ personId: person.id, coveredIndividualSsn: person.ssn }, ...(shared ? [{ personId: other.id, coveredIndividualSsn: other.ssn }] : [])] };
    plan.payments!.forEach(payment => {
      payment.grossPremium = shared ? fullPremiums[index]! : premiums[index]!;
      payment.ownerOrBusinessPaid = method === 'agreement' ? cash[index]! : premiums[index]!;
      payment.otherPersonPaid = shared ? payment.ownerOrBusinessPaid : '0';
      payment.advancePremiumTaxCredit = method === 'agreement' ? (shared ? fullAdvances[index]! : advances[index]!) : '0';
      const personAdvance = method === 'agreement' ? advances[index]! : '0';
      payment.personAmounts = [{ personId: person.id, payer: 'owner_after_tax', amountPaid: payment.ownerOrBusinessPaid,
        advancePremiumTaxCredit: personAdvance, otherTaxFreeFunding: '0', excludedPublicSafetyOfficerAmount: '0' },
        ...(shared ? [{ personId: other.id, payer: 'owner_after_tax' as const, amountPaid: '0', advancePremiumTaxCredit: personAdvance,
          otherTaxFreeFunding: '0', excludedPublicSafetyOfficerAmount: '0' }] : [])];
    });
  });
  if (method === 'no-advance') facts.sharedPolicyAllocations.noAdvanceCoverageFamilies = {
    sourceTaxYear: year, sourceReference: 'Actual complete monthly families across both original plans', sourceFactsConfirmed: true, allBenchmarkMonthsIncluded: true,
    months: facts.monthlyReconciliation!.map(row => ({ month: row.month, families: [
      { taxpayerName: own[0].name, taxpayerSsn: own[0].ssn, sourceReference: 'Actual complete joint family', allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: 'joint-area', sourceReference: 'Actual joint area benchmark', ratingArea: 'WA-one', slcsp: '700', coveredIndividualSsns: own.map(p => p.ssn), allCoveredPeopleShareRatingAreaConfirmed: true }] },
      ...outside.filter((_, index) => index === 0 || second === 'shared').map(person => ({ taxpayerName: person.name, taxpayerSsn: person.ssn,
        sourceReference: `Actual complete ${person.name} family`, allCoverageFamilyMembersIncludedConfirmed: true, allCoveragePoliciesIncludedConfirmed: true,
        groups: [{ sourceId: `${person.id}-area`, sourceReference: 'Actual outside-family benchmark', ratingArea: 'WA-one', slcsp: '700', coveredIndividualSsns: [person.ssn], allCoveredPeopleShareRatingAreaConfirmed: true }] })),
    ] })),
  };
  return TaxYearInputSchema.parse(input);
}

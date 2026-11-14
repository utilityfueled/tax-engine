import { separateReturnFixture } from './separate-return-policy.js';

function present<T,>(value: T | null | undefined): T {
  if (value == null) throw new Error('Fictional original source is missing');
  return value;
}

/** Synthetic originals using the final2025 Pub974 Pat/Jamie/Andy amounts. */
export function marriedThirdFamilyFixture(year = 2025) {
  const input = separateReturnFixture(false), facts = present(input.form8962);
  const basePolicy = present(present(facts.sharedPolicyAllocations).policies?.[0]), originalPolicy = present(input.form1095A[0]);
  input.taxpayer.taxYear = year;
  input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'Robin', lastName: 'Other', ssn: '234-56-7890' };
  const original = {
    ...originalPolicy, taxYear: year,
    coveredIndividuals: [
      { name: 'Jane Doe', ssn: '123-45-6789', firstMonth: 1, lastMonth: 12 },
      { name: 'Robin Other', ssn: '234-56-7890', firstMonth: 1, lastMonth: 12 },
      { name: 'Jason Other', ssn: '345-67-8901', firstMonth: 1, lastMonth: 12 },
      { name: 'Alicia Other', ssn: '456-78-9012', firstMonth: 1, lastMonth: 12 },
      { name: 'Dawn Other', ssn: '567-89-0123', firstMonth: 1, lastMonth: 12 },
    ],
    monthlyPremiums: originalPolicy.monthlyPremiums.map(row => ({ ...row, slcsp: '800', advancePremiumTaxCredit: '200' })),
  };
  input.form1095A = [original];
  const family = (role: 'primary' | 'spouse' | 'third', taxpayerName: string, taxpayerSsn: string, dependents: Array<{ name: string; ssn: string }>) => ({
    role, sourceTaxYear: year, sourceReference: `Fictional ${role} original tax-family return`,
    filingStatus: role === 'third' ? 'head_of_household' as const : 'married_filing_separately' as const,
    taxpayerName, taxpayerSsn, dependents, allTaxFamilyMembersIncludedConfirmed: true,
  });
  const packet = {
    ...present(facts.sharedPolicyAllocations), sourceTaxYear: year,
    policies: [{ ...basePolicy, original: structuredClone(original), twoTaxFamiliesConfirmed: false,
      coveredFamilyAssignments: undefined,
      separateReturn: { sourceReference: 'Fictional year-end married separate return source', marriedAtYearEndConfirmed: true, onlySpouseTaxFamiliesConfirmed: false, livingApartExceptionConfirmed: false },
    }],
    marriedThirdFamily: {
      sourceTaxYear: year, sourceReference: 'Fictional complete three-tax-family Worksheet E sources', sourceFactsConfirmed: true,
      noOtherAllocationsRequiredConfirmed: true, allAgreementsAndCoverageMonthsIncludedConfirmed: true,
      families: [family('primary', 'Jane Doe', '123-45-6789', []), family('spouse', 'Robin Other', '234-56-7890', []),
        family('third', 'Andy Other', '678-90-1234', original.coveredIndividuals.slice(2).map(person => ({ name: person.name, ssn: person.ssn })))],
      coverageFamilyAssignments: original.coveredIndividuals.map((person, index) => ({ ssn: person.ssn, family: index === 1 || index === 4 ? 'spouse' as const : 'primary' as const })),
      monthlySources: original.monthlyPremiums.map(row => ({ month: row.month,
        primaryBenchmark: '450', spouseBenchmark: '400', primaryBenchmarkSourceReference: 'Fictional Marketplace primary coverage-family benchmark', spouseBenchmarkSourceReference: 'Fictional Marketplace spouse coverage-family benchmark',
        primaryAgreementFraction: '0.67', spouseAgreementFraction: '0.50',
        primaryAgreementSourceReference: 'Fictional signed primary and third-taxpayer agreement', spouseAgreementSourceReference: 'Fictional signed spouse and third-taxpayer agreement',
        primaryAgreementConfirmed: true, spouseAgreementConfirmed: true,
      })),
    },
  };
  return { ...input, form8962: { ...facts, sharedPolicyAllocations: packet,
    monthlyReconciliation: original.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: '0', slcsp: '0', advancePremiumTaxCredit: '34', coverageEligible: true, incomeBasedSepEnrollment: false })) } };
}

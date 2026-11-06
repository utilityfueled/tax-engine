import { TaxYearInputSchema } from '@/models/inputs.js';
import { marketplaceHealthInput } from './marketplace-health.js';
import { sharedPolicyFixture } from './shared-policy.js';

/** Fictional original policy, independent cash payments and actual person links. */
export function sharedMarketplaceHealthInput(year = 2025) {
  const base = marketplaceHealthInput(), shared = sharedPolicyFixture(year);
  const original = shared.form1095A[0];
  for (const row of original.monthlyPremiums) { row.slcsp = year === 2025 ? '1000' : '1400'; row.advancePremiumTaxCredit = '600'; }
  const facts = shared.form8962!, health = base.form7206!, plan = health.plans![0];
  facts.selfEmployedHealthInsuranceCoordinationRequired = true;
  facts.sharedPolicyAllocations!.policies![0].original = structuredClone(original);
  facts.monthlyReconciliation = original.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: '500', slcsp: year === 2025 ? '500' : '700', advancePremiumTaxCredit: '300', coverageEligible: true, incomeBasedSepEnrollment: false }));
  return TaxYearInputSchema.parse({ ...base, taxpayer: shared.taxpayer, w2s: [], form1095A: [original], form8962: facts,
    form7206: { ...health, sourceTaxYear: year, persons: [
      { ...health.persons![0], attainedAgeAtYearEnd: year - 1990 },
      { personId: 'outside', name: 'Robin Other', householdRole: 'other', attainedAgeAtYearEnd: 40 },
    ], plans: [{ ...plan, allCoveredPersonsInCoverageFamilyConfirmed: false,
      sharedMarketplaceSources: { sourceTaxYear: year, sourceReference: 'Actual original policy and independent payment allocation', sourceFactsConfirmed: true,
        allCoveredPersonsLinkedConfirmed: true, allThisReturnPersonsInCoverageFamilyConfirmed: true,
        persons: [{ personId: 'primary', coveredIndividualSsn: '123-45-6789' }, { personId: 'outside', coveredIndividualSsn: '234-56-7890' }] },
      coveredPersons: [{ personId: 'primary', relationshipToOwner: 'self' }, { personId: 'outside', relationshipToOwner: 'other' }],
      payments: plan.payments!.map(row => ({ ...row, datePaid: row.datePaid!.replace('2026-', `${year}-`), coverageTaxYear: year,
        grossPremium: '1000', ownerOrBusinessPaid: '200', otherPersonPaid: '200', advancePremiumTaxCredit: '600',
        personAmounts: [row.personAmounts![0], { personId: 'outside', payer: 'owner_after_tax', amountPaid: '0', advancePremiumTaxCredit: '300', excludedPublicSafetyOfficerAmount: '0', otherTaxFreeFunding: '0' }],
      })),
    }] },
  });
}

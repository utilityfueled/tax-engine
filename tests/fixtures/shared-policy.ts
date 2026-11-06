import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Fictional complete source statements and an actual agreement; no production defaults. */
export function sharedPolicyFixture(year = 2025) {
  const original = {
    taxYear: year, marketplace: 'Synthetic Marketplace', policyNumber: 'ACTUAL-POLICY-100',
    recipientName: 'Jane Doe', recipientSsn: '123-45-6789',
    coveredIndividuals: [
      { name: 'Jane Doe', ssn: '123-45-6789', firstMonth: 1, lastMonth: 12 },
      { name: 'Robin Other', ssn: '234-56-7890', firstMonth: 1, lastMonth: 12 },
    ],
    monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, enrolleePremium: '1000', slcsp: '900', advancePremiumTaxCredit: '500' })),
  };
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '30000' }], form1095A: [original],
    form8962: { taxFamilySize: 1, fplRegion: 'contiguous', requiredFilingDependentsModifiedAGI: '0',
      householdFactsConfirmed: true, canBeClaimedAsDependent: false, belowPovertyException: 'none', coverageFactsConfirmed: true,
      allocationRequired: true, alternativeMarriageCalculationElected: false, selfEmployedHealthInsuranceCoordinationRequired: false,
      lawfulPresenceReconciliationRequired: false, qsehraAffected: false,
      monthlyReconciliation: original.monthlyPremiums.map(row => ({ month: row.month, enrolleePremium: '500', slcsp: '450', advancePremiumTaxCredit: '250', coverageEligible: true, incomeBasedSepEnrollment: false })),
      sharedPolicyAllocations: { sourceTaxYear: year, sourceReference: 'Actual signed policy allocation worksheet', sourceFactsConfirmed: true,
        allSharedPoliciesIncluded: true, primaryName: 'Jane Doe', primarySsn: '123-45-6789',
        policies: [{ sourceId: 'form1095A:0', original: structuredClone(original), otherTaxpayerName: 'Robin Other', otherTaxpayerSsn: '234-56-7890',
          situation: 'other_two_tax_families', noCurrentYearMarriageOrDivorceConfirmed: true, twoTaxFamiliesConfirmed: true,
          allCoveredPeopleAssignedConfirmed: true, originalSlcspCorrectConfirmed: true,
          coveredFamilyAssignments: [{ ssn: '123-45-6789', family: 'this_return' }, { ssn: '234-56-7890', family: 'other_return' }],
          agreementConfirmed: true, agreementReference: 'Actual signed agreement',
          monthlyAllocations: original.monthlyPremiums.map(row => ({ month: row.month, fraction: '0.50' })),
        }],
      },
    },
  });
}

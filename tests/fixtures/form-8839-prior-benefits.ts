import Decimal from "decimal.js";
import { TAX_CONSTANTS } from "../../src/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "../../src/models/federal-2026-indexed.js";
import { Form8839ChildSchema } from "../../src/models/inputs.js";

/** Fictional original benefit and return records; no inferred source fields. */
export function foreignAdoptionHistoryChild(taxYear = 2025) {
  return Form8839ChildSchema.parse({
    childName: "Sam Example", childFirstName: "Sam", childLastName: "Example",
    childBirthYear: 2020, childIdentifyingNumber: "345-67-8901", childPermanentlyDisabled: false,
    isSpecialNeeds: false, isForeignAdoption: true, adoptionBecameFinal: true,
    adoptionFinalizedYear: taxYear, expensesByYear: [], qualifiedExpenses: "0",
    employerBenefits: "2000", employerPlanQualified: true,
    priorYearCreditsClaimed: "0", priorYearExclusionsClaimed: "0", priorYearForeignBenefits: "8000",
    priorYearForeignBenefitHistory: {
      sourceTaxYear: taxYear, sourceReference: "Fictional finality-year benefits worksheet", sourceFactsConfirmed: true,
      allPriorBenefitsIncluded: true, returnMembershipUnchangedConfirmed: true,
      childNameOnSource: "Sam Example", childIdentifyingNumberLast4: "8901", otherAdopterReceivedBenefits: false,
      priorExclusionHistoryConfirmed: true, priorExclusionLimitUsed: "0",
      records: [{ sourceId: "fictional-prior-employer-statement", taxYear: taxYear - 1,
        employerName: "Example Employer", employerEin: "12-3456789", accountHolder: "primary",
        recipientName: "Jordan Example", recipientTaxpayerIdLast4: "6789",
        originalEmployerBenefits: "8000", benefitsAllocatedToChild: "8000",
        allocatedBenefitsIncludedInPriorIncome: true, employerPlanQualified: true }],
    },
  });
}
export function foreignAdoptionHistoryParams(taxYear: 2025 | 2026 = 2025) {
  return {
    taxYear, eligibilityConfirmed: true, filingStatus: "single" as const,
    sourceTaxpayer: { primary: { firstName: "Jordan", lastName: "Example", ssn: "123-45-6789" } },
    agi: new Decimal(92000), exclusionMagi: new Decimal(102000), taxLiabilityLimit: new Decimal(10000),
    foreignEarnedIncomeExclusion: new Decimal(0), foreignHousingExclusion: new Decimal(0), possessionIncomeExclusion: new Decimal(0),
    children: [foreignAdoptionHistoryChild(taxYear)], constants: (taxYear === 2026 ? FEDERAL_2026_CONSTANTS : TAX_CONSTANTS[2025]).adoptionCredit,
  };
}

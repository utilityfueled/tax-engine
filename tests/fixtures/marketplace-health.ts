import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

/** Actual synthetic2026 policy, payments and owner facts; no production defaults. */
export function marketplaceHealthInput() {
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const monthlyPremiums = months.map(month => ({ month, enrolleePremium: "500", slcsp: "700", advancePremiumTaxCredit: "300" }));
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, w2s: [],
    scheduleC: { accountHolder: "primary", businessName: "Actual proprietor", grossReceipts: "50000", qbiMateriallyParticipated: true },
    form2210: { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
      calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true, priorYearResidentAllYear: true,
      priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "0" },
    form1095A: [{ taxYear: 2026, marketplace: "Actual Marketplace", policyNumber: "ACTUAL-POLICY", monthlyPremiums }],
    form8962: { taxFamilySize: 1, fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
      belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
      selfEmployedHealthInsuranceCoordinationRequired: true, lawfulPresenceReconciliationRequired: false, qsehraAffected: false,
      monthlyReconciliation: monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false })) },
    form7206: { sourceTaxYear: 2026, sourceReference: "Actual premium and policy source ledger", sourceFactsConfirmed: true, allPlansIncluded: true,
      persons: [{ personId: "primary", name: "Jane Doe", householdRole: "primary", attainedAgeAtYearEnd: 36 }],
      plans: [{ planId: "medical", policyReference: "Actual original policy", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed",
        kind: "medical", policyHolder: "individual", establishedUnderBusiness: true, insuranceQualificationConfirmed: true,
        marketplaceCoverage: true, premiumTaxCreditInvolved: true, marketplacePolicySourceIds: ["form1095A:0"], allCoveredPersonsInCoverageFamilyConfirmed: true,
        clergySpecialRules: false, coveredPersons: [{ personId: "primary", relationshipToOwner: "self" }], months: months.map(month => ({ month, employerSubsidizedPlanEligible: false })),
        payments: months.map(month => ({ sourceId: `premium-${month}`, datePaid: `2026-${String(month).padStart(2,"0")}-01`, coverageTaxYear: 2026, coverageMonth: month,
          grossPremium: "500", ownerOrBusinessPaid: "200", otherPersonPaid: "0", advancePremiumTaxCredit: "300",
          personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "200", advancePremiumTaxCredit: "300", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] })) }] },
  });
}

import type { HealthInsuranceData, HealthInsurancePlanData } from "../../apps/web/src/lib/guided-health-insurance-facts";
import type { PremiumTaxCreditData } from "../../apps/web/src/lib/guided-premium-tax-credit-facts";

/** Fictional original records shared by the real guide and browser workflow. */
export function guidedMarketplaceNonspecifiedStopRecords(): { health: HealthInsuranceData; coverage: PremiumTaxCreditData } {
  const primary: HealthInsurancePlanData = {
    planId: "actual-plan", policyReference: "policy-123", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed", kind: "medical", policyHolder: "individual",
    establishedUnderBusiness: true, insuranceQualificationConfirmed: true, premiumsIncludedInOwnerIncome: null, moreThanTwoPercentShareholder: null,
    marketplaceCoverage: true, premiumTaxCreditInvolved: true, clergySpecialRules: false,
    marketplacePolicySourceIds: ["form1095A:0"], allCoveredPersonsInCoverageFamilyConfirmed: true,
    coveredPersons: [{ personId: "primary", relationshipToOwner: "self", dependencyEligibilityConfirmed: null }],
    months: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), employerSubsidizedPlanEligible: false })),
    payments: Array.from({ length: 12 }, (_, index) => ({ sourceId: `premium-${index + 1}`, datePaid: `2025-${String(index + 1).padStart(2, "0")}-15`, coverageTaxYear: "2025", coverageMonth: String(index + 1),
      grossPremium: "500", ownerOrBusinessPaid: "500", otherPersonPaid: "0", advancePremiumTaxCredit: "0",
      personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "500", advancePremiumTaxCredit: "0", excludedPublicSafetyOfficerAmount: "0", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "0" }] })),
  };
  const spouse = structuredClone(primary);
  Object.assign(spouse, { planId: "spouse-plan", policyReference: "spouse-policy", accountHolder: "spouse", businessSourceId: "formW2:0", businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
    marketplaceCoverage: false, premiumTaxCreditInvolved: false, marketplacePolicySourceIds: [], allCoveredPersonsInCoverageFamilyConfirmed: null });
  spouse.coveredPersons.forEach(person => { person.personId = "spouse"; });
  spouse.payments.forEach(payment => {
    payment.sourceId = `spouse-${payment.sourceId}`; payment.grossPremium = payment.ownerOrBusinessPaid = "250";
    payment.personAmounts.forEach(person => { person.personId = "spouse"; person.payer = "business_paid_or_reimbursed"; person.amountPaid = "250"; });
  });
  const proprietor = structuredClone(primary);
  Object.assign(proprietor, { planId: "proprietor-nonspecified", policyReference: "Actual proprietor nonspecified plan", marketplaceCoverage: false,
    premiumTaxCreditInvolved: false, marketplacePolicySourceIds: [], allCoveredPersonsInCoverageFamilyConfirmed: null });
  proprietor.payments.forEach(payment => { payment.sourceId = `nonspecified-${payment.sourceId}`; });
  return {
    health: { sourceTaxYear: "2025", sourceReference: "Original policy and actual monthly payments", sourceFactsConfirmed: true, allPlansIncluded: true,
      persons: [{ personId: "primary", name: "Jordan Example", householdRole: "primary", attainedAgeAtYearEnd: "35" }, { personId: "spouse", name: "Taylor Example", householdRole: "spouse", attainedAgeAtYearEnd: "33" }],
      plans: [primary, spouse, proprietor], longTermCareAllocations: [] },
    coverage: { sourceTaxYear: "2025", sourceReference: "Original Marketplace and actual coverage-family worksheet", sourceFactsConfirmed: true, allPoliciesIncluded: true,
      taxFamilySize: "2", fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
      belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
      selfEmployedHealthInsuranceCoordinationRequired: true, qsehraAffected: false, lawfulPresenceReconciliationRequired: false,
      policies: [{ taxYear: "2025", marketplace: "Actual Marketplace", policyNumber: "policy-123", monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "0" })) }],
      monthlyReconciliation: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "0", coverageEligible: true, incomeBasedSepEnrollment: false })),
    },
  };
}

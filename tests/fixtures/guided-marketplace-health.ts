import { emptyAdjustmentData, emptyCreditsData } from "@/lib/guided-interview-flow";
import { emptyHealthInsuranceFacts, type HealthInsuranceData } from "@/lib/guided-health-insurance-facts";
import { emptyPremiumTaxCreditFacts, type PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";
import { completeBusinessSection, startCompleteInterview } from "../guided-interview/complete-facts";

export function guidedMarketplaceHealthFacts(): HealthInsuranceData {
  return { ...emptyHealthInsuranceFacts, sourceTaxYear: "2025", sourceReference: "Original policy and actual monthly payments", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Jordan Example", householdRole: "primary", attainedAgeAtYearEnd: "35" }],
    plans: [{ planId: "actual-plan", policyReference: "policy-123", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed", kind: "medical", policyHolder: "individual",
      establishedUnderBusiness: true, insuranceQualificationConfirmed: true, premiumsIncludedInOwnerIncome: null, moreThanTwoPercentShareholder: null,
      marketplaceCoverage: true, premiumTaxCreditInvolved: true, clergySpecialRules: false,
      marketplacePolicySourceIds: ["form1095A:0"], allCoveredPersonsInCoverageFamilyConfirmed: true,
      coveredPersons: [{ personId: "primary", relationshipToOwner: "self", dependencyEligibilityConfirmed: null }],
      months: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), employerSubsidizedPlanEligible: false })),
      payments: Array.from({ length: 12 }, (_, index) => ({ sourceId: `premium-${index + 1}`, datePaid: `2025-${String(index + 1).padStart(2, "0")}-15`, coverageTaxYear: "2025", coverageMonth: String(index + 1),
        grossPremium: "500", ownerOrBusinessPaid: "200", otherPersonPaid: "0", advancePremiumTaxCredit: "300",
        personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "200", advancePremiumTaxCredit: "300", excludedPublicSafetyOfficerAmount: "0", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "0" }] })),
    }], longTermCareAllocations: [] };
}
export function guidedMarketplaceCoverageFacts(): PremiumTaxCreditData {
  return { ...emptyPremiumTaxCreditFacts, sourceTaxYear: "2025", sourceReference: "Original Marketplace and actual coverage-family worksheet", sourceFactsConfirmed: true, allPoliciesIncluded: true,
    taxFamilySize: "1", fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
    belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
    selfEmployedHealthInsuranceCoordinationRequired: true, qsehraAffected: false, lawfulPresenceReconciliationRequired: false,
    policies: [{ taxYear: "2025", marketplace: "Actual Marketplace", policyNumber: "policy-123", monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "300" })) }],
    monthlyReconciliation: Array.from({ length: 12 }, (_, index) => ({ month: String(index + 1), enrolleePremium: "500", slcsp: "500", advancePremiumTaxCredit: "300", coverageEligible: true, incomeBasedSepEnrollment: false })),
  };
}
export function guidedMarketplaceHealthState() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
  state.sectionData["income-self-employment"] = { ...structuredClone(completeBusinessSection), manualGrossReceipts: "50000" };
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: guidedMarketplaceHealthFacts() };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: guidedMarketplaceCoverageFacts() };
  return state;
}

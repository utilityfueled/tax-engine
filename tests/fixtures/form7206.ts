/** Explicit synthetic2025 medical source facts for source-conservation tests. */
export function healthFacts(businessSourceId = "scheduleC", amount = "600.10") {
  return { sourceTaxYear: 2025, sourceReference: "Synthetic actual paid premium and eligibility worksheet", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Jane Doe", householdRole: "primary", attainedAgeAtYearEnd: 35 }],
    plans: [{ planId: "medical", policyReference: "Synthetic original policy", accountHolder: "primary", businessSourceId, businessKind: "self_employed", kind: "medical", policyHolder: "individual",
      establishedUnderBusiness: true, insuranceQualificationConfirmed: true, marketplaceCoverage: false, premiumTaxCreditInvolved: false, clergySpecialRules: false,
      coveredPersons: [{ personId: "primary", relationshipToOwner: "self" }], months: [{ month: 1, employerSubsidizedPlanEligible: false }],
      payments: [{ sourceId: "premium", datePaid: "2025-01-15", coverageTaxYear: 2025, coverageMonth: 1, grossPremium: amount, ownerOrBusinessPaid: amount, otherPersonPaid: "0",
        personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: amount, excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] }] }],
    longTermCareAllocations: [] };
}

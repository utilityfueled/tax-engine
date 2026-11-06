import type { HealthInsuranceData } from "../../apps/web/src/lib/guided-health-insurance-facts";
import type { PremiumTaxCreditData } from "../../apps/web/src/lib/guided-premium-tax-credit-facts";
import type { PaymentData, W2EntryData } from "../../apps/web/src/lib/guided-interview-flow";

/** Plain fictional originals shared by the actual guide and browser controls. */
export function marketplaceHealthSeparateOwnerRecords() {
  const owners = ["primary", "spouse", "primary"] as const;
  const premiums = ["500", "250", "200"];
  const wages = ["46000", "43000", "12400"];
  const medicare = ["40000", "40000", "10000"];
  const months = Array.from({ length: 12 }, (_, index) => String(index + 1));
  const entries: W2EntryData[] = owners.map((accountHolder, index) => ({ accountHolder,
    employerName: `Original Corporation ${index + 1}`, employerEin: ["12-3456789", "23-4567890", "34-5678901"][index],
    wages: wages[index], federalWithheld: index === 0 ? "20000" : "0", socialSecurityWages: medicare[index], socialSecurityTips: "0", medicareWages: medicare[index],
    socialSecurityWithheld: ["2480", "2480", "620"][index], medicareWithheld: ["580", "580", "145"][index],
    box10DependentCareBenefits: "0", box12CodeW: "0", stateTaxReporting: "none", state: "", stateWages: "", stateWithheld: "" }));
  const health: HealthInsuranceData = {
    sourceTaxYear: "2025", sourceReference: "Original three shareholder policies and paid receipts", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Jordan Example", householdRole: "primary", attainedAgeAtYearEnd: "35" },
      { personId: "spouse", name: "Taylor Example", householdRole: "spouse", attainedAgeAtYearEnd: "33" }],
    longTermCareAllocations: [],
    marketplaceCreditAllocation: { sourceTaxYear: "2025", sourceReference: "Original consistent monthly enrollment credit choice", sourceFactsConfirmed: true,
      method: "monthly_eligible_plan_enrollment", sameMethodForAllCalculationsConfirmed: true },
    plans: owners.map((owner, index) => ({ planId: `original-plan-${index}`, policyReference: `Original policy ${index + 1}`,
      accountHolder: owner, businessSourceId: `formW2:${index}`, businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
      kind: "medical", policyHolder: "individual", establishedUnderBusiness: true, insuranceQualificationConfirmed: true, clergySpecialRules: false,
      marketplaceCoverage: index < 2, premiumTaxCreditInvolved: index < 2, marketplacePolicySourceIds: index < 2 ? [`form1095A:${index}`] : [],
      allCoveredPersonsInCoverageFamilyConfirmed: index < 2 ? true : null,
      coveredPersons: [{ personId: owner, relationshipToOwner: "self", dependencyEligibilityConfirmed: null }],
      months: months.map(month => ({ month, employerSubsidizedPlanEligible: false })),
      payments: months.map(month => ({ sourceId: `plan-${index}-premium-${month}`, datePaid: `2025-${month.padStart(2, "0")}-15`, coverageTaxYear: "2025", coverageMonth: month,
        grossPremium: premiums[index], ownerOrBusinessPaid: premiums[index], otherPersonPaid: "0", advancePremiumTaxCredit: "0",
        personAmounts: [{ personId: owner, payer: "business_paid_or_reimbursed", amountPaid: premiums[index], advancePremiumTaxCredit: "0", excludedPublicSafetyOfficerAmount: "0", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "0" }] })) })),
  };
  const coverage: PremiumTaxCreditData = {
    sourceTaxYear: "2025", sourceReference: "Original two Marketplace policies and complete household worksheet", sourceFactsConfirmed: true, allPoliciesIncluded: true,
    taxFamilySize: "2", fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0", householdFactsConfirmed: true, canBeClaimedAsDependent: false,
    belowPovertyException: "none", coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
    selfEmployedHealthInsuranceCoordinationRequired: true, qsehraAffected: false, lawfulPresenceReconciliationRequired: false,
    policies: owners.slice(0, 2).map((owner, index) => ({ taxYear: "2025", marketplace: "Actual Marketplace", policyNumber: `ACTUAL-${owner}-SPECIFIED`,
      monthlyPremiums: months.map(month => ({ month, enrolleePremium: premiums[index], slcsp: "500", advancePremiumTaxCredit: "0" })) })),
    monthlyReconciliation: months.map(month => ({ month, enrolleePremium: "750", slcsp: "1000", advancePremiumTaxCredit: "0", coverageEligible: true, incomeBasedSepEnrollment: false })),
  };
  const payments: PaymentData = {
    estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: "",
    estimatedTaxFacts: {
      sourceTaxYear: "2025", sourceReference: "Fictional filed 2024 joint tax3000 AGI100000; complete payment records through April15 2026",
      sourceFactsConfirmed: true, allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true,
      farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
      priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: true,
      priorYearTaxForForm2210: "3000", priorYearAgiForForm2210: "100000", priorYearTaxComputationConfirmed: true,
      withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false, returnFiledDate: "", returnPaidInFullDate: "",
    },
  };
  return { wages: { entries }, health, coverage, payments };
}

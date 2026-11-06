// Spec: spec/federal/guided-health-insurance.yaml.
import { expect, it } from "vitest";
import { buildHealthInsuranceInput, emptyHealthInsuranceFacts, type HealthInsuranceData, healthInsuranceSourceOptions, healthInsuranceSourceErrors, type HealthInsuranceIncomeDeductionsData } from "@/lib/guided-health-insurance-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildSectionRoute, emptyAdjustmentData, emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { completeBusinessSection, completeDependent, completeW2Entry, startCompleteInterview } from "./complete-facts";

export function actualHealthInsurance(): HealthInsuranceData {
  return { ...emptyHealthInsuranceFacts, sourceTaxYear: "2025", sourceReference: "Actual paid policy statement and eligibility records", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Jordan Example", householdRole: "primary", attainedAgeAtYearEnd: "35" }],
    plans: [{ planId: "medical-1", policyReference: "Actual policy number 123", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed", kind: "medical", policyHolder: "individual",
      establishedUnderBusiness: true, insuranceQualificationConfirmed: true, premiumsIncludedInOwnerIncome: null, moreThanTwoPercentShareholder: null,
      marketplaceCoverage: false, premiumTaxCreditInvolved: false, clergySpecialRules: false,
      coveredPersons: [{ personId: "primary", relationshipToOwner: "self", dependencyEligibilityConfirmed: null }],
      months: [{ month: "1", employerSubsidizedPlanEligible: false }],
      payments: [{ sourceId: "premium-1", datePaid: "2025-01-15", coverageTaxYear: "2025", coverageMonth: "1", grossPremium: "600.10", ownerOrBusinessPaid: "600.10", otherPersonPaid: "0",
        personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "600.10", excludedPublicSafetyOfficerAmount: "0", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "0" }] }] }],
    longTermCareAllocations: [] };
}
function stateWithInsurance() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
  state.sectionData["income-self-employment"] = { ...completeBusinessSection, manualGrossReceipts: "50000" };
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: actualHealthInsurance() };
  return state;
}

it("preserves actual health insurance facts and reconciles saved premiums", () => {
  const data = actualHealthInsurance();
  const result = buildHealthInsuranceInput(data, "single", 2025, "600.10");
  expect(result?.plans?.[0]?.payments?.[0]).toMatchObject({ grossPremium: "600.1", otherPersonPaid: "0", coverageMonth: 1 });
  expect(result?.plans?.[0]?.months?.[0]?.employerSubsidizedPlanEligible).toBe(false);
  expect(result?.plans?.[0]?.premiumsIncludedInOwnerIncome).toBeUndefined();
  expect(() => buildHealthInsuranceInput(undefined, "single", 2025, "600.10")).toThrow(/source/i);
  expect(buildHealthInsuranceInput(undefined, "single", 2025, "0")).toBeUndefined();
  expect(() => buildHealthInsuranceInput(data, "single", 2025, "600")).toThrow(/reconcile/i);
  for (const invalid of ["-1", "NaN", "Infinity"]) expect(() => buildHealthInsuranceInput(undefined, "single", 2025, invalid)).toThrow();
  for (const value of ["", "-1", "NaN"]) {
    const missing = actualHealthInsurance(); missing.plans[0]!.payments[0]!.otherPersonPaid = value;
    expect(() => buildHealthInsuranceInput(missing, "single", 2025)).toThrow();
  }
  const huge = actualHealthInsurance(); const source = huge.plans[0]!.payments[0]!;
  source.grossPremium = source.ownerOrBusinessPaid = source.personAmounts[0]!.amountPaid = "9,007,199,254,740,993.01";
  expect(buildHealthInsuranceInput(huge, "single", 2025)?.plans?.[0]?.payments?.[0]?.grossPremium).toBe("9007199254740993.01");
  data.plans[0]!.months[0]!.employerSubsidizedPlanEligible = null; expect(() => buildHealthInsuranceInput(data, "single", 2025)).toThrow();
  for (const value of ["1.5", "-1", "NaN", "12345"]) {
    const invalid = actualHealthInsurance(); invalid.persons[0]!.attainedAgeAtYearEnd = value;
    expect(() => buildHealthInsuranceInput(invalid, "single", 2025)).toThrow(/whole number/i);
  }
  expect(() => buildHealthInsuranceInput(actualHealthInsurance(), null, 2025)).toThrow(/year|status/i);
  const disallowed = actualHealthInsurance(); disallowed.plans[0]!.insuranceQualificationConfirmed = false;
  expect(buildHealthInsuranceInput(disallowed, "single", 2025)?.plans?.[0]?.payments?.[0]?.grossPremium).toBe("600.1");
});

it("binds health plans to actual household and business sources", () => {
  const state = stateWithInsurance();
  expect(healthInsuranceSourceOptions(state.sectionData["income-self-employment"], [])).toEqual([{ sourceId: "scheduleC", accountHolder: "primary", kind: "self_employed", label: "Independent design services" }]);
  expect(validateSection(state, "adjustments").status).toBe("complete");
  state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.businessSourceId = "scheduleF";
  expect(validateSection(state, "adjustments").status).toBe("partial"); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.businessSourceId = "scheduleC";
  state.sectionData.adjustments!.healthInsuranceFacts!.persons[0]!.name = "Different actual person";
  expect(validateSection(state, "adjustments").status).toBe("partial");
  const original = stateWithInsurance();
  const changed = updateSectionData(original, "income-self-employment", { ...original.sectionData["income-self-employment"]!, manualGrossReceipts: "50001" });
  expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.healthInsuranceFacts?.plans[0]?.payments[0]?.grossPremium).toBe("600.10");
  const withEducation = stateWithInsurance();
  withEducation.sectionData.credits = { ...emptyCreditsData, educationDistributions: { sourceFactsConfirmed: true } };
  const reconfirmed = updateSectionData(withEducation, "credits", { ...withEducation.sectionData.credits, educationDistributions: { sourceFactsConfirmed: false } });
  expect(reconfirmed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBe(true);
  const changedAdjustments = updateSectionData(original, "adjustments", { ...original.sectionData.adjustments, selfEmployedHealthInsurance: "600.10" });
  expect(changedAdjustments.sectionData.adjustments?.selfEmployedHealthInsurance).toBe("600.10");
  expect(changedAdjustments.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
  const wages = [{ ...completeW2Entry, employerName: "Actual corporation", accountHolder: "spouse" as const }, { ...completeW2Entry, accountHolder: "" as const }];
  expect(healthInsuranceSourceOptions(undefined, wages)).toEqual([{ sourceId: "formW2:0", accountHolder: "spouse", kind: "s_corporation", label: "Actual corporation" }]);
  const joint = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2-wages"], lifeEvents: ["self-employed-health-insurance"], stateCode: null });
  joint.sectionData["income-w2"] = { entries: [wages[0]!] };
  const facts = actualHealthInsurance(); facts.persons[0] = { personId: "spouse", name: "Taylor Example", householdRole: "spouse", attainedAgeAtYearEnd: "33" };
  Object.assign(facts.plans[0]!, { accountHolder: "spouse", businessSourceId: "formW2:0", businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true });
  facts.plans[0]!.coveredPersons[0]!.personId = "spouse"; Object.assign(facts.plans[0]!.payments[0]!.personAmounts[0]!, { personId: "spouse", payer: "business_paid_or_reimbursed" });
  joint.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: facts };
  expect(validateSection(joint, "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(joint)?.form7206?.plans?.[0]?.accountHolder).toBe("spouse");
  joint.sectionData["income-w2"].entries[0]!.accountHolder = "primary";
  expect(buildTaxInputFromGuidedData(joint)).toBeNull();
});

it("requires actual health sources and forwards the source object once", () => {
  const state = stateWithInsurance();
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form7206?.plans?.[0]?.payments?.[0]?.personAmounts?.[0]?.amountPaid).toBe("600.1");
  expect(input?.adjustments?.selfEmployedHealthInsurance ?? "0").toBe("0");
  state.sectionData.adjustments = { ...emptyAdjustmentData, selfEmployedHealthInsurance: "600.10" };
  expect(validateSection(state, "adjustments").status).toBe("partial"); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments.healthInsuranceFacts = actualHealthInsurance();
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.form7206?.sourceFactsConfirmed).toBe(true);
  state.sectionData.adjustments.healthInsuranceFacts.sourceTaxYear = "2026";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("calculates the source-based health deduction once in the guided return", async () => {
  const { calculateFederalTax } = await import("@/engine/federal");
  const { TaxYearInputSchema } = await import("@/models/inputs");
  const state = stateWithInsurance();
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form7206?.plans?.[0]?.payments?.[0]?.ownerOrBusinessPaid).toBe("600.1");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  const baseline = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form7206: undefined }));
  expect(result.adjustmentsToIncome.minus(baseline.adjustmentsToIncome).toFixed()).toBe("600");
  expect(baseline.agi.minus(result.agi).toFixed()).toBe("600");
});

it("routes shareholder health insurance to actual adjustment sources", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["self-employed-health-insurance"], stateCode: null });
  expect(buildSectionRoute(state.segmentation).map(section => section.id)).toContain("adjustments");
  expect(validateSection(state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: { ...emptyHealthInsuranceFacts, sourceTaxYear: "2025", sourceReference: "Actual records establish no paid premiums", sourceFactsConfirmed: true, allPlansIncluded: true } };
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.form7206?.plans).toEqual([]);
});

it("reconciles health premium age limits to actual household birth dates", () => {
  const state = stateWithInsurance();
  const person = state.sectionData.adjustments!.healthInsuranceFacts!.persons[0]!;
  state.sectionData.adjustments!.healthInsuranceFacts!.plans[0]!.kind = "qualified_ltc";
  person.attainedAgeAtYearEnd = "75";
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHouseholdAge");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  person.attainedAgeAtYearEnd = "35";
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  for (const value of [undefined, "", "1990-02-30", "2026-01-01"]) {
    state.sectionData["personal-info"]!.dateOfBirth = value;
    expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHouseholdAge");
  }
  state.sectionData["personal-info"]!.dateOfBirth = "1991-01-01";
  expect(healthInsuranceSourceErrors(state)).toEqual({}); // Turns35 on the day before Jan1,2026.
  state.sectionData["personal-info"]!.dateOfBirth = "1991-01-02";
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHouseholdAge");
  person.attainedAgeAtYearEnd = "34"; expect(healthInsuranceSourceErrors(state)).toEqual({});
  const dependent = structuredClone(completeDependent);
  state.sectionData["personal-info"]!.dependents = [dependent];
  state.sectionData.adjustments!.healthInsuranceFacts!.persons.push({ personId: "child", name: "Alex Example", householdRole: "other", attainedAgeAtYearEnd: "71" });
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHouseholdAge");
  state.sectionData.adjustments!.healthInsuranceFacts!.persons[1]!.attainedAgeAtYearEnd = "10";
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  dependent.dateOfBirth = ""; expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHouseholdAge");
  state.sectionData.adjustments!.healthInsuranceFacts!.persons[1]!.name = "Other eligible person";
  expect(healthInsuranceSourceErrors(state)).toEqual({}); // Eligibility remains the actual plan source's question.
  state.sectionData.adjustments!.healthInsuranceFacts!.persons[1]!.name = "Jordan Example";
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceHousehold");
});

it("preserves actual business deduction allocations without supplying income overrides", () => {
  const data = Object.assign(actualHealthInsurance(), { incomeDeductions: {
    sourceReference: "Actual allowed retirement and foreign attribution worksheet", sourceFactsConfirmed: true as boolean | null,
    allocations: [{ businessSourceId: "scheduleC", accountHolder: "primary", retirementDeduction: "9007199254740993.01", foreignExclusion: "0" }], otherForeignExclusion: "0",
  } as HealthInsuranceIncomeDeductionsData });
  const result = buildHealthInsuranceInput(data, "single", 2025);
  expect(result?.incomeDeductions).toEqual({ sourceReference: data.incomeDeductions.sourceReference, sourceFactsConfirmed: true,
    allocations: [{ businessSourceId: "scheduleC", accountHolder: "primary", retirementDeduction: "9007199254740993.01", foreignExclusion: "0" }], otherForeignExclusion: "0" });
  expect(result).not.toHaveProperty("businesses"); expect(result).not.toHaveProperty("netIncome");
  for (const value of ["", "-1", "NaN"]) {
    const incomplete = structuredClone(data); incomplete.incomeDeductions.allocations[0]!.foreignExclusion = value;
    expect(() => buildHealthInsuranceInput(incomplete, "single", 2025)).toThrow();
  }
  const unconfirmed = structuredClone(data); unconfirmed.incomeDeductions.sourceFactsConfirmed = null;
  expect(() => buildHealthInsuranceInput(unconfirmed, "single", 2025)).toThrow(/confirm/i);
  const duplicate = structuredClone(data); duplicate.incomeDeductions.allocations.push({ ...duplicate.incomeDeductions.allocations[0]! });
  expect(() => buildHealthInsuranceInput(duplicate, "single", 2025)).toThrow(/duplicate/i);
  const state = stateWithInsurance(); state.sectionData.adjustments!.healthInsuranceFacts = data;
  expect(healthInsuranceSourceErrors(state)).toEqual({});
  data.incomeDeductions.allocations[0]!.accountHolder = "spouse";
  expect(healthInsuranceSourceErrors(state)).toHaveProperty("healthInsuranceBusiness");
  data.incomeDeductions.allocations[0]!.accountHolder = "primary"; data.incomeDeductions.allocations[0]!.businessSourceId = "scheduleF";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

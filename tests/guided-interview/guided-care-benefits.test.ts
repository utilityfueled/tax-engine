import { describe, expect, it } from "vitest";
import { buildCareBenefitsInput, careBenefitsFactErrors, type CareBenefitsData, type CareBenefitSource } from "@/lib/guided-dependent-care-benefits";
import { buildTaxInputFromGuidedData, buildDependentCareInput, buildW2Inputs } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { careFactErrors } from "@/lib/guided-credit-facts";
import { completeCareSource } from "./care-source-fixture";
import { w2FactErrors } from "@/lib/guided-w2-facts";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

const provider = { name: "Actual Day Care", address: "10 Main St, Columbus OH 43215", identifierType: "tax_exempt" as const,
  householdEmployee: false, amountPaid: "3900" };
const actual = (): CareBenefitsData => ({
  sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true, providers: [provider], usesDeemedIncome: false,
  employeeBenefits: [{ sourceId: "w2:0", owner: "primary", benefitsReported: "1,000.25", alreadyIncludedInWages: "0.25",
    priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" }],
  selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "7500", qualifiedExpensesIncurred: "3900",
  primaryEarnedIncome: "30000", earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: "1",
  qualifiedExpensesPaidForCredit: "2900", creditExpenseCoordinationConfirmed: true,
});
const sources: CareBenefitSource[] = [{ sourceId: "w2:0", label: "Actual Employer", owner: "primary", kind: "employee", reportedBenefits: "1000.25" }];

describe("guided actual dependent-care benefits", () => {
  it("forwards benefits-only sources and coordinates actual credit expenses without double subtraction", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "40000", box10DependentCareBenefits: "1000.25" }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, "credits").status).toBe("partial");
    const benefits = actual();
    state.sectionData.credits = { ...emptyCreditsData, dependentCareBenefits: benefits };
    const only = buildTaxInputFromGuidedData(state);
    expect(only?.dependentCare).toBeUndefined();
    expect(only?.dependentCareBenefits?.employeeBenefits?.[0]?.benefitsReported).toBe("1000.25");
    const care = completeCareSource({ expenses: "3900", qualifyingIndividuals: "1", receivedBenefits: true,
      excludedDependentCareBenefits: undefined, providers: [provider], qualifyingPersons: [{ ...completeCareSource().qualifyingPersons![0], qualifiedExpenses: "2900" }] });
    const context = { data: benefits, year: 2025, sources };
    expect(careFactErrors(care, "single", context)).toEqual({});
    const credits = { ...emptyCreditsData, dependentCare: care, dependentCareBenefits: benefits };
    expect(buildDependentCareInput(credits, "single", 2025, sources)?.excludedDependentCareBenefits).toBeUndefined();
    state.sectionData.credits = credits;
    expect(buildTaxInputFromGuidedData(state)?.dependentCare?.qualifyingPersons?.[0]?.qualifiedExpenses).toBe("2900");
    expect(careFactErrors({ ...care, excludedDependentCareBenefits: "1001" }, "single", context)).toHaveProperty("careBenefitReconciliation");
    expect(careFactErrors({ ...care, receivedBenefits: false }, "single", context)).toHaveProperty("careBenefitConflict");
    expect(careFactErrors({ ...care, qualifyingPersons: [{ ...care.qualifyingPersons![0], qualifiedExpenses: "1900" }] }, "single", context)).toHaveProperty("careExpenseAllocation");
    expect(careFactErrors({ ...care, providers: [{ ...provider, amountPaid: "3901" }] }, "single", context)).toHaveProperty("careBenefitProviders");
    expect(careFactErrors(care, "single")).toHaveProperty("careBenefitsRequired");
    const edited = updateSectionData(state, "income-w2", { entries: [{ ...state.sectionData["income-w2"]!.entries[0], employerName: "Changed source" }] });
    expect(edited.sectionData.credits?.dependentCareBenefits?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(edited)).toBeNull();
    expect(state.sectionData.credits?.dependentCareBenefits?.sourceFactsConfirmed).toBe(true);
    const changed = { ...benefits, employeeBenefits: [{ ...benefits.employeeBenefits![0], owner: "spouse" as const }] };
    state.sectionData.credits = { ...credits, dependentCareBenefits: changed };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });

  it("binds actual benefits to the selected W2 without assuming missing amounts or owners", () => {
    const data = actual(); const before = JSON.stringify(data);
    const result = buildCareBenefitsInput(data, 2026, "single", sources);
    expect(result?.employeeBenefits?.[0]).toMatchObject({ sourceId: "w2:0", owner: "primary", benefitsReported: "1000.25", alreadyIncludedInWages: "0.25" });
    expect(result?.providers).toEqual([provider]);
    expect(careBenefitsFactErrors(data, 2026, "single", sources)).toEqual({});
    expect(JSON.stringify(data)).toBe(before);
    for (const patch of [{ sourceId: "w2:1" }, { owner: "spouse" as const }, { benefitsReported: "1000" }, { alreadyIncludedInWages: "" }]) {
      expect(() => buildCareBenefitsInput({ ...data, employeeBenefits: [{ ...data.employeeBenefits?.[0], ...patch }] }, 2026, "single", sources)).toThrow();
    }
    expect(() => buildCareBenefitsInput(data, 2026, "single", [{ ...sources[0], owner: undefined }])).toThrow(/owner|recipient/i);
    expect(() => buildCareBenefitsInput(data, 2026, "single", [{ ...sources[0], reportedBenefits: undefined }])).toThrow(/Box 10|benefits|source/i);
  });

  it("requires complete positive-benefit records and keeps old saved facts untouched", () => {
    expect(buildCareBenefitsInput(undefined, 2026, "single", [])).toBeUndefined();
    expect(Object.keys(careBenefitsFactErrors(undefined, 2026, "single", sources))).not.toHaveLength(0);
    const legacy = { planExclusionLimit: "7500" }; const before = JSON.stringify(legacy);
    expect(() => buildCareBenefitsInput(legacy, 2026, "single", sources)).toThrow();
    expect(JSON.stringify(legacy)).toBe(before);
    for (const key of ["employeeBenefits", "selfEmployedBenefits", "deductionAllocations", "sourceFactsConfirmed", "earnedIncomeWorksheetConfirmed", "creditExpenseCoordinationConfirmed", "providers", "usesDeemedIncome"] as const) {
      expect(() => buildCareBenefitsInput({ ...actual(), [key]: undefined }, 2026, "single", sources)).toThrow();
    }
  });

  it("preserves known ineligibility and explicit empty arrays on benefits-only returns", () => {
    const data: CareBenefitsData = { ...actual(), exclusionEligibilityConfirmed: false, providers: [],
      qualifiedExpensesIncurred: "0", qualifiedExpensesPaidForCredit: "0", qualifyingIndividuals: "0" };
    const result = buildCareBenefitsInput(data, 2026, "single", sources);
    expect(result).toMatchObject({ exclusionEligibilityConfirmed: false, qualifyingIndividuals: 0, providers: [], selfEmployedBenefits: [], deductionAllocations: [] });
    expect(() => buildCareBenefitsInput({ ...data, exclusionEligibilityConfirmed: null }, 2026, "single", sources)).toThrow();
  });

  it("keeps business benefits and existing deductions attached to an actual activity", () => {
    const data: CareBenefitsData = { ...actual(), employeeBenefits: [],
      selfEmployedBenefits: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted: "2500" }],
      deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "2000" }],
      qualifiedExpensesPaidForCredit: "1900" };
    const business: CareBenefitSource[] = [{ sourceId: "scheduleC", label: "Actual trade", kind: "business", owner: "primary", schedule: "schedule-c", reportedEmployeeBenefitPrograms: "2500" }];
    expect(buildCareBenefitsInput(data, 2026, "single", business)?.selfEmployedBenefits?.[0]?.alreadyDeducted).toBe("2500");
    expect(() => buildCareBenefitsInput(data, 2026, "single", [])).toThrow();
    expect(() => buildCareBenefitsInput(data, 2026, "single", [{ ...business[0], reportedEmployeeBenefitPrograms: undefined }])).toThrow(/expense/);
    expect(() => buildCareBenefitsInput(data, 2026, "single", [{ ...business[0], reportedEmployeeBenefitPrograms: "2499.99" }])).toThrow(/expense/);
    expect(() => buildCareBenefitsInput({ ...data, selfEmployedBenefits: [{ ...data.selfEmployedBenefits![0], schedule: "schedule-e" }], deductionAllocations: [{ ...data.deductionAllocations![0], schedule: "schedule-e" }] }, 2026, "single", [{ ...business[0], schedule: "schedule-e" }])).toThrow(/Schedule E/);
    expect(() => buildCareBenefitsInput(data, 2026, "single", [{ ...business[0], schedule: "schedule-f" }])).toThrow();
    expect(() => buildCareBenefitsInput({ ...data, selfEmployedBenefits: [{ ...data.selfEmployedBenefits?.[0], alreadyDeducted: "" }] }, 2026, "single", business)).toThrow();
  });

  it("requires actual W2 box10 and preserves it through the bridge", () => {
    const w2 = { ...completeW2Entry, wages: "40000", box10DependentCareBenefits: "1,000.25" };
    expect(buildW2Inputs([w2])[0]?.box10DependentCareBenefits).toBe("1000.25");
    expect(w2FactErrors([w2], "single")).toEqual({});
    expect(w2FactErrors([{ ...w2, box10DependentCareBenefits: "" }], "single")).toHaveProperty("w2-0-box10DependentCareBenefits");
    expect(buildW2Inputs([{ ...w2, box10DependentCareBenefits: "" }])[0]?.box10DependentCareBenefits).toBeUndefined();
  });
});

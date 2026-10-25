// Spec: spec/federal/guided-input.yaml, standard-deduction-source-facts
import { describe, expect, it } from "vitest";
import { buildStandardDeductionFacts, standardDeductionFactErrors, type StandardDeductionData } from "@/lib/guided-standard-deduction-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyDeductionData } from "@/lib/guided-interview-flow";
import { completePersonalInfo, startCompleteInterview } from "./complete-facts";
const actual: StandardDeductionData = { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeceased: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false };
describe("guided standard deduction actual facts", () => {
  it("preserves actual blindness dependency signed worksheet and alive answers", () => {
    const data = { ...actual, primaryBlind: true, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "-9007199254740993.01" };
    expect(standardDeductionFactErrors(data, "single", 2026, completePersonalInfo)).toEqual({});
    expect(buildStandardDeductionFacts(data, "single", 2026, completePersonalInfo)).toMatchObject({ primaryBlind: true, primaryCanBeClaimedAsDependent: true, primaryDeathDate: null, dependentEarnedIncome: "-9007199254740993.01" });
    for (const field of ["primaryBlind", "primaryCanBeClaimedAsDependent", "primaryDeceased", "dualStatusAlien", "nonresidentAlien", "shortTaxYear", "dependentEarnedIncome"] as const) { const unknown = { ...data }; delete unknown[field]; expect(() => buildStandardDeductionFacts(unknown, "single", 2026, completePersonalInfo)).toThrow(); }
    expect(() => buildStandardDeductionFacts({ ...data, dependentEarnedIncome: "NaN" }, "single", 2026, completePersonalInfo)).toThrow();
  });
  it("requires actual death dates and MFS spouse extra-box eligibility", () => {
    const data = { ...actual, primaryDeceased: true, primaryDeathDate: "2026-02-01", claimSpouseAdditionalDeduction: true, spouseHasGrossIncome: false, spouseFilesReturn: false };
    expect(buildStandardDeductionFacts(data, "mfs", 2026, completePersonalInfo)).toMatchObject({ primaryDeathDate: "2026-02-01", spouseDeathDate: null, spouseHasGrossIncome: false });
    for (const primaryDeathDate of ["", "2025-12-31", "2026-02-30"]) expect(() => buildStandardDeductionFacts({ ...data, primaryDeathDate }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...data, primaryDeceased: false }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...data, spouseHasGrossIncome: true }, "mfs", 2026, completePersonalInfo)).toThrow();
    expect(() => buildStandardDeductionFacts({ ...actual, nonresidentAlien: true }, "mfj", 2026, completePersonalInfo)).toThrow();
  });
  it("honors actual selected deduction methods and blocks incomplete personal facts", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = { ...completePersonalInfo, standardDeductionFacts: actual };
    for (const method of ["standard", "itemized"] as const) { state.sectionData.deductions = { ...emptyDeductionData, method }; expect(buildTaxInputFromGuidedData(state)?.deductionElection).toBe(method); }
    state.sectionData["personal-info"].standardDeductionFacts = undefined;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});

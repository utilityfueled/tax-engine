// Spec: spec/federal/guided-input.yaml, adoption-source-records
import { describe, expect, it } from "vitest";
import { adoptionFactErrors, buildAdoptionInput, type AdoptionCreditData } from "@/lib/guided-adoption-facts";
import { Form8839Schema } from "../../src/models/inputs";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { startCompleteInterview } from "./complete-facts";

function actual(): AdoptionCreditData { return {
  eligibilityConfirmed: true, foreignEarnedIncomeExclusion: "0", foreignHousingExclusion: "0", possessionIncomeExclusion: "0", carryforwardHistoryConfirmed: true, carryforwards: [],
  children: [{ childFirstName: "Sam", childLastName: "Example", childBirthYear: "2020", childIdentifyingNumber: "123-45-6789", childPermanentlyDisabled: false, isSpecialNeeds: false, isForeignAdoption: false, adoptionFinalized: true, adoptionFinalizedYear: "2026", expensesConfirmed: true, expensesByYear: [{ year: "2025", amount: "9007199254740993.01" }, { year: "2026", amount: "0.20" }], employerBenefits: "0", employerPlanQualified: false, priorYearCreditsClaimed: "0", priorYearExclusionsClaimed: "0" }],
}; }
describe("guided actual adoption records", () => {
  it("requires actual adoption history and preserves exact source amounts", () => {
    const data = actual();
    expect(adoptionFactErrors(data, 2026, "single")).toEqual({});
    const result = Form8839Schema.parse(buildAdoptionInput(data, 2026, "single"));
    expect(result.children[0]).toMatchObject({ sourceFactsComplete: true, childName: "Sam Example", childFirstName: "Sam", childBirthYear: 2020, childPermanentlyDisabled: false, adoptionFinalizedYear: 2026, employerBenefits: "0", employerPlanQualified: false, expensesByYear: [{ year: 2025, amount: "9007199254740993.01" }, { year: 2026, amount: "0.20" }] });
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
    expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2026, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, adoption: data } } })?.form8839?.children[0].childName).toBe("Sam Example");
    for (const key of ["childFirstName", "childBirthYear", "childIdentifyingNumber", "childPermanentlyDisabled", "isForeignAdoption", "isSpecialNeeds", "adoptionFinalized", "expensesConfirmed", "employerBenefits", "priorYearCreditsClaimed", "priorYearExclusionsClaimed"] as const) {
      const child = { ...data.children[0] }; delete child[key];
      expect(() => buildAdoptionInput({ ...data, children: [child] }, 2026, "single")).toThrow();
    }
    expect(() => buildAdoptionInput({ ...data, carryforwardHistoryConfirmed: undefined }, 2026, "single")).toThrow();
  });
  it("requires historical reconciliation and never infers foreign benefits or finality", () => {
    const data = actual();
    data.children[0] = { ...data.children[0], isForeignAdoption: true, adoptionFinalized: false, adoptionFinalizedYear: "", expensesByYear: [], priorYearForeignBenefits: "0" };
    expect(buildAdoptionInput(data, 2026, "single")?.children[0]).toMatchObject({ adoptionFinalizedYear: null, adoptionBecameFinal: false, expensesByYear: [], priorYearForeignBenefits: "0" });
    for (const priorYearForeignBenefits of [undefined, "1"]) expect(() => buildAdoptionInput({ ...data, children: [{ ...data.children[0], priorYearForeignBenefits }] }, 2026, "single")).toThrow();
    data.carryforwards = [{ originTaxYear: "2025", amount: "100.01" }];
    expect(() => buildAdoptionInput(data, 2026, "single")).toThrow();
    data.carryforwardReconciled2025 = true;
    expect(buildAdoptionInput(data, 2026, "single")?.carryforwards).toEqual([{ originTaxYear: 2025, amount: "100.01" }]);
  });
  it("rejects conflicting years unknown MAGI and duplicate child identities", () => {
    const data = actual();
    for (const changes of [{ childBirthYear: "2027" }, { adoptionFinalizedYear: "2027" }, { expensesByYear: [{ year: "2026", amount: "-1" }] }, { expensesByYear: [{ year: "2026", amount: "1" }, { year: "2026", amount: "2" }] }, { employerBenefits: "1", employerPlanQualified: true }]) expect(() => buildAdoptionInput({ ...data, children: [{ ...data.children[0], ...changes }] }, 2026, "single")).toThrow();
    expect(() => buildAdoptionInput({ ...data, children: [data.children[0], data.children[0]] }, 2026, "single")).toThrow();
    expect(() => buildAdoptionInput({ ...data, possessionIncomeExclusion: "" }, 2026, "single")).toThrow();
    expect(() => buildAdoptionInput(data, 2026, "mfs")).toThrow();
    expect(buildAdoptionInput({ ...data, eligibilityConfirmed: false }, 2026, "mfs")?.eligibilityConfirmed).toBe(false);
    expect(buildAdoptionInput(undefined, 2026, "single")).toBeUndefined();
  });
});

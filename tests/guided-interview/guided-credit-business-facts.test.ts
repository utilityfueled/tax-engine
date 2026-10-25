import { completeCareSource } from "./care-source-fixture";
// Spec: spec/federal/guided-input.yaml, care-and-qbi-qualification
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, validateSection } from "@/lib/guided-interview-flow";
import { startCompleteInterview, completeBusinessSection, completeRentalSource } from "./complete-facts";

describe("credit and business qualification facts", () => {
  it("preserves actual care earned income benefits and ineligibility without household-income inference", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData.credits = { ...emptyCreditsData, dependentCare: completeCareSource({ eligibilityConfirmed: false }) };
    expect(validateSection(state, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.dependentCare).toEqual({ expenses: "5000.01", qualifyingIndividuals: 2, primaryEarnedIncome: "20000.10", spouseEarnedIncome: "0", excludedDependentCareBenefits: "0", eligibilityConfirmed: false, priorYearExpenseCredit: "0", sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false, providers: completeCareSource().providers, qualifyingPersons: completeCareSource().qualifyingPersons });
  });
  it("requires actual worksheet facts for a positive dependent-care claim", () => {
    for (const missingField of ["primaryEarnedIncome", "spouseEarnedIncome", "excludedDependentCareBenefits", "eligibilityConfirmed"] as const) {
      const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
      state.sectionData.credits = { ...emptyCreditsData, dependentCare: completeCareSource({ [missingField]: undefined }) };
      expect(validateSection(state, "credits").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
  });
  it("preserves actual material participation without making an omitted answer true", () => {
    for (const participation of [undefined, false, true]) {
      const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment", "rental"], lifeEvents: [], stateCode: null });
      state.sectionData["income-self-employment"] = { ...completeBusinessSection, manualGrossReceipts: "5000", qbiMateriallyParticipated: participation };
      state.sectionData["income-rental"] = { entries: [{ ...completeRentalSource, description: "Example House", rents: "5000", qualifiesForQBI: true, qbiW2Wages: "0", qbiUBIA: "0", qbiIsSST: false, qbiMateriallyParticipated: participation }] };
      const input = buildTaxInputFromGuidedData(state);
      if (participation === undefined) { expect(input).toBeNull(); continue; }
      expect(input?.scheduleC?.qbiMateriallyParticipated).toBe(participation);
      expect(input?.rentalProperties[0].qbiMateriallyParticipated).toBe(participation);
    }
  });
});

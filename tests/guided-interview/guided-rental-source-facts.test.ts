// Spec: spec/federal/guided-input.yaml, rental-source-records and rental-return-year
import { describe, expect, it } from "vitest";
import { buildRentalPropertyInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRentalPropertyEntry, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { RentalPropertySchema, TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { completePersonalInfo, startCompleteInterview, completeRentalSource } from "./complete-facts";

const source = completeRentalSource;
function flow() { const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["rental"], lifeEvents: [], stateCode: null }); state.sectionData["income-rental"] = { entries: [{ ...source }] }; return state; }

describe("guided actual rental sources", () => {
  it("preserves zero and expense-only properties without inventing source identity", () => {
    expect(buildRentalPropertyInputs([{ ...source, rents: "0", repairs: "100.01" }])[0]).toMatchObject({ rents: "0", repairs: "100.01", accountHolder: "primary", rentalDays: 300, personalUseDays: 0, ownershipPercentage: "100" });
    expect(buildRentalPropertyInputs([{ ...emptyRentalPropertyEntry, rents: "0" }])[0]).toMatchObject({ description: "", propertyType: undefined, mortgageInterest: undefined, ownershipPercentage: undefined, personalUseDays: undefined });
    expect(buildRentalPropertyInputs([emptyRentalPropertyEntry])).toEqual([]);
  });
  it("preserves known false owner facts and unknown model qualification", () => {
    const parsed = RentalPropertySchema.parse({ description: "Actual property", rents: "0", accountHolder: "spouse", allInvestmentAtRisk: false, sourceFactsConfirmed: false, otherExpenseDescription: "Actual expense" });
    expect(parsed).toMatchObject({ accountHolder: "spouse", allInvestmentAtRisk: false, sourceFactsConfirmed: false, otherExpenseDescription: "Actual expense" });
    const unknown = RentalPropertySchema.parse({ description: "Actual property", rents: "0" });
    expect(unknown).not.toHaveProperty("accountHolder");
    expect(unknown).not.toHaveProperty("allInvestmentAtRisk");
  });
  it("requires actual use ownership and expense facts before calculating", () => {
    const state = flow();
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
    for (const field of ["propertyType", "description", "accountHolder", "ownershipPercentage", "rentalDays", "personalUseDays", "taxes", "advertising", "isActiveParticipant", "allInvestmentAtRisk", "heldForRental", "qualifiesForQBI", "sourceFactsConfirmed"] as const) {
      state.sectionData["income-rental"] = { entries: [{ ...source, [field]: undefined } as unknown as typeof source] };
      expect(buildTaxInputFromGuidedData(state), field).toBeNull();
      expect(validateSection(state, "income-rental").status, field).toBe("partial");
    }
  });
  it("applies an actual ownership percentage once to exact source amounts", () => {
    const state = flow();
    state.sectionData["income-rental"] = { entries: [{ ...source, ownershipPercentage: "50", minimumOwnershipPercentage: "50", rents: "100.30", repairs: "0.10" }] };
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    expect(input.rentalProperties[0].rents).toBe("100.30");
    // (100.30 - 0.10) x 50% = 50.10. Source amounts are not already halved.
    expect(calculateFederalTax(input).scheduleE?.rentalProperties[0].netRentalIncome.toFixed()).toBe("50.1");
  });
  it("requires annual rental source review after a tax-year change and saved reopen", () => {
    const amounts = { ...source, rents: "600", repairs: "100", personalUseDays: "0" };
    const confirmed = updateSectionData(setInterviewTaxYear(flow(), 2026), "income-rental", { entries: [amounts] });
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    } as Storage;
    expect(saveGuidedFlowState(storage, "fictional-rental", confirmed)).toBe(true);
    const saved = loadGuidedFlowState(storage, "fictional-rental");
    if (!saved) throw new Error("Expected the saved rental draft.");
    expect(saved.sectionData["income-rental"]?.entries).toEqual([amounts]);
    expect(setInterviewTaxYear(saved, 2026)).toBe(saved);
    expect(validateSection(saved, "income-rental").status).toBe("complete");

    const switched = updateSectionData(setInterviewTaxYear(saved, 2025), "personal-info", completePersonalInfo);
    const pending = { ...amounts, sourceFactsConfirmed: null };
    expect(switched.sectionData["income-rental"]?.entries).toEqual([pending]);
    expect(validateSection(switched, "income-rental").status).toBe("partial");
    expect(computeGuidedPreviewEvaluation(switched).preview.metrics).toBeNull();
    expect(saveGuidedFlowState(storage, "fictional-rental", switched)).toBe(true);
    const reopened = loadGuidedFlowState(storage, "fictional-rental");
    if (!reopened) throw new Error("Expected the saved pending rental review.");
    expect(reopened.sectionData["income-rental"]?.entries).toEqual([pending]);
    expect(computeGuidedPreviewEvaluation(reopened).input).toBeNull();
    expect(setInterviewTaxYear(reopened, 2026).sectionData["income-rental"]?.entries).toEqual([pending]);

    const reviewed = updateSectionData(reopened, "income-rental", { entries: [{ ...pending, sourceFactsConfirmed: true }] });
    expect(validateSection(reviewed, "income-rental").status).toBe("complete");
    const evaluation = computeGuidedPreviewEvaluation(reviewed);
    expect(evaluation.preview.metrics).not.toBeNull();
    if (!evaluation.input) throw new Error("Expected a preview from the newly confirmed rental facts.");
    expect(evaluation.input.taxpayer.taxYear).toBe(2025);
    expect(calculateFederalTax(evaluation.input).scheduleE?.rentalProperties[0].netRentalIncome.toFixed()).toBe("500");
  });
  it("keeps unsupported personal use and loss qualifications saved but incomplete", () => {
    const state = flow();
    for (const patch of [{ personalUseDays: "1" }, { realEstateProfessional: true }, { substantialServices: true }, { selfRental: true }, { priorYearUnallowedLoss: "0.01" }, { priorYearUnallowedCredits: "1" }, { additionalWorksheetRequired: true }, { heldForRental: false }, { accountHolder: "joint" }]) {
      state.sectionData["income-rental"] = { entries: [{ ...source, ...patch } as typeof source] };
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(patch)).toBeNull();
    }
    state.sectionData["income-rental"] = { entries: [{ ...source, allInvestmentAtRisk: false, repairs: "1" }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    state.sectionData["income-rental"].entries[0].rents = "2";
    expect(buildTaxInputFromGuidedData(state)?.rentalProperties[0].allInvestmentAtRisk).toBe(false);
  });
  it("rejects contradictory active participation invalid days duplicate properties and unmatched spouse", () => {
    const state = flow();
    for (const patch of [{ minimumOwnershipPercentage: "9.99" }, { ownershipPercentage: "100.01" }, { ownershipPercentage: "0" }, { rentalDays: "366" }, { rentalDays: "1.5" }, { accountHolder: "spouse" }]) {
      state.sectionData["income-rental"] = { entries: [{ ...source, ...patch } as typeof source] };
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(patch)).toBeNull();
    }
    state.sectionData["income-rental"] = { entries: [{ ...source }, { ...source }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});

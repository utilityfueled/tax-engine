// Spec: spec/federal/guided-input.yaml, rental-source-records
import { describe, expect, it } from "vitest";
import { buildRentalPropertyInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRentalPropertyEntry, validateSection } from "@/lib/guided-interview-flow";
import { RentalPropertySchema, TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { startCompleteInterview, completeRentalSource } from "./complete-facts";

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

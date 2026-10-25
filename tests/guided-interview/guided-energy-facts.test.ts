// Spec: spec/federal/guided-input.yaml, energy-source-facts
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, emptyEnergyCreditData, validateSection, type EnergyCreditData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";

function withEnergy(energy: EnergyCreditData, taxYear = 2025) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, taxYear, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, energy } } };
}
const door = { category: "exterior_door" as const, qualifiedCost: "1000.10", installationCompletedDate: "2025-04-01", qualificationConfirmed: true, manufacturerQualifiedId: "A1B2" };

describe("guided energy source facts", () => {
  it("preserves individual categories dates qualification and confirmed carryforward", () => {
    const energy = { ...emptyEnergyCreditData, exteriorDoorsWindowsCost: "1000.30", qualifiedImprovements: [door, { ...door, category: "windows_skylights" as const, qualifiedCost: "0.20", qualificationConfirmed: false }], cleanEnergyProperties: [{ category: "fuel_cell" as const, qualifiedCost: "20000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true, fuelCellKilowattCapacity: "0.5" }], residenceEligibilityConfirmed: true, priorYearCarryforward: "0", carryforwardSourceTaxYear: "2024", carryforwardConfirmed: false };
    const state = withEnergy(energy);
    expect(validateSection(state, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.energyCredits).toEqual({ qualifiedImprovements: energy.qualifiedImprovements, cleanEnergyProperties: energy.cleanEnergyProperties, residenceEligibilityConfirmed: true, priorYearCarryforward: "0", carryforwardSourceTaxYear: 2024, carryforwardConfirmed: false });
  });
  it("blocks unknown eligibility invalid dates missing identifiers and unreconciled totals", () => {
    const valid = { ...emptyEnergyCreditData, residenceEligibilityConfirmed: true, qualifiedImprovements: [door] };
    for (const energy of [
      { ...emptyEnergyCreditData, solarElectricCost: "10000" },
      { ...valid, residenceEligibilityConfirmed: undefined },
      { ...valid, qualifiedImprovements: [{ ...door, installationCompletedDate: "2025-02-30" }] },
      { ...valid, qualifiedImprovements: [{ ...door, manufacturerQualifiedId: "" }] },
      { ...valid, exteriorDoorsWindowsCost: "1001" },
      { ...valid, qualifiedImprovements: [{ ...door, qualificationConfirmed: null }] },
      { ...valid, priorYearCarryforward: "100", carryforwardSourceTaxYear: "2023", carryforwardConfirmed: true },
    ]) {
      const state = withEnergy(energy);
      expect(validateSection(state, "credits").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
  });
  it("requires an actual roof classification and keeps a confirmed ineligible roof out of the credit", () => {
    const unknown = withEnergy({ ...emptyEnergyCreditData, roofCost: "2000" });
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
    const ineligible = withEnergy({ ...emptyEnergyCreditData, roofCost: "2000", legacyRoofTreatment: "not_eligible" });
    expect(validateSection(ineligible, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(ineligible)?.energyCredits).toBeUndefined();
    const solar = withEnergy({ ...emptyEnergyCreditData, roofCost: "2000", solarElectricCost: "10000", legacyRoofTreatment: "qualified_solar_component", residenceEligibilityConfirmed: true, cleanEnergyProperties: [{ category: "solar_electric", qualifiedCost: "12000", installationCompletedDate: "2025-10-01", qualificationConfirmed: true }] });
    expect(buildTaxInputFromGuidedData(solar)?.energyCredits?.cleanEnergyProperties?.[0].qualifiedCost).toBe("12000");
  });
  it("preserves a confirmed 2025 carryforward without inventing new 2026 expenditures", () => {
    const state = withEnergy({ ...emptyEnergyCreditData, priorYearCarryforward: "1500.09", carryforwardSourceTaxYear: "2025", carryforwardConfirmed: true }, 2026);
    expect(buildTaxInputFromGuidedData(state)?.energyCredits).toEqual({ priorYearCarryforward: "1500.09", carryforwardSourceTaxYear: 2025, carryforwardConfirmed: true });
    const newCost = { ...emptyEnergyCreditData, residenceEligibilityConfirmed: true, qualifiedImprovements: [{ ...door, installationCompletedDate: "2026-03-01" }] };
    expect(buildTaxInputFromGuidedData(withEnergy(newCost, 2026))).toBeNull();
    const confirmed = withEnergy({ ...newCost, priorYearCarryforward: "0", carryforwardSourceTaxYear: "2025", carryforwardConfirmed: true }, 2026);
    expect(buildTaxInputFromGuidedData(confirmed)?.energyCredits?.priorYearCarryforward).toBe("0");
  });
});

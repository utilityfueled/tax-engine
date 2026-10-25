// Spec: spec/federal/2026/energy-source-facts.yaml, source-records
import { describe, expect, it } from "vitest";
import { EnergyCreditsSchema } from "../../src/models/inputs";

describe("energy source fact contract", () => {
  it("preserves explicit energy source facts and leaves missing qualification unknown", () => {
    const empty = EnergyCreditsSchema.parse({});
    expect(empty).not.toHaveProperty("residenceEligibilityConfirmed");
    expect(empty).not.toHaveProperty("priorYearCarryforward");
    expect(empty).not.toHaveProperty("carryforwardConfirmed");
    const source = { qualifiedImprovements: [{ category: "exterior_door", qualifiedCost: "0", installationCompletedDate: "2025-06-01", qualificationConfirmed: false, manufacturerQualifiedId: "A1B2" }], cleanEnergyProperties: [{ category: "fuel_cell", qualifiedCost: "20000.01", installationCompletedDate: "2025-05-01", qualificationConfirmed: true, fuelCellKilowattCapacity: "0.5" }], residenceEligibilityConfirmed: true, priorYearCarryforward: "0", carryforwardSourceTaxYear: 2025, carryforwardConfirmed: false };
    expect(EnergyCreditsSchema.parse(source)).toMatchObject(source);
  });
  it("rejects a detailed entry without actual required source information", () => {
    expect(EnergyCreditsSchema.safeParse({ qualifiedImprovements: [{ category: "exterior_door", qualifiedCost: "1000" }] }).success).toBe(false);
    expect(EnergyCreditsSchema.safeParse({ cleanEnergyProperties: [{ category: "roof", qualifiedCost: "1000", installationCompletedDate: "2025-01-01", qualificationConfirmed: true }] }).success).toBe(false);
  });
});

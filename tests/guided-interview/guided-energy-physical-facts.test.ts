// Spec: spec/federal/form-5695-source.yaml#guided-physical-sources.
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, emptyEnergyCreditData, validateSection, type EnergyCreditData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";
import { energySource, sourceImprovement, sourceCleanProperty } from "../fixtures/energy-source";
const actualEnergy = (): EnergyCreditData => ({ ...emptyEnergyCreditData, ...energySource, carryforwardSourceTaxYear: "2024" });
function stateWith(energy: EnergyCreditData) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, taxYear: 2025, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, energy } } };
}
describe("guided physical energy sources", () => {
  it("preserves complete actual physical sources and blocks partial records", () => {
    const data = actualEnergy(); const state = stateWith(data);
    expect(validateSection(state, "credits").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.energyCredits).toEqual(energySource);
    for (const patch of [{ homes: undefined }, { sourceFactsConfirmed: undefined }, { priorYearCarryforward: "" }, { cleanEnergyProperties: undefined },
      { qualifiedImprovements: [{ ...sourceImprovement, expectedFiveYearUse: undefined }] },
    ]) {
      const partial = stateWith({ ...data, ...patch });
      expect(validateSection(partial, "credits").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(partial)).toBeNull();
    }
  });
  it("preserves panel and association source relationships without inferring answers", () => {
    const heater = { ...sourceImprovement, sourceId: "heater", category: "heat_pump_water_heater" as const, qualifiedCost: "4,000.20" };
    const panel = { ...sourceImprovement, sourceId: "panel", category: "electrical_panel" as const, installationCompletedDate: "2024-08-01", enabledPropertyIds: ["heater"], panelLoadAmps: "200", panelCodeComplianceConfirmed: true, consecutiveYearElection: true, priorYearCreditClaimed: false };
    const solar = { ...sourceCleanProperty, associationCostShare: true, qualifiedCost: "1,000", associationAllocation: { totalQualifiedCost: "10,000", numerator: "1", denominator: "10", sourceReference: "Actual association statement" } };
    const state = stateWith({ ...actualEnergy(), qualifiedImprovements: [panel, heater], cleanEnergyProperties: [solar] });
    expect(validateSection(state, "credits").status).toBe("complete");
    const input = buildTaxInputFromGuidedData(state)?.energyCredits;
    expect(input?.qualifiedImprovements?.[0]).toEqual(panel);
    expect(input?.qualifiedImprovements?.[1].qualifiedCost).toBe("4000.2");
    expect(input?.cleanEnergyProperties?.[0].associationAllocation).toEqual({ totalQualifiedCost: "10000", numerator: "1", denominator: "10", sourceReference: "Actual association statement" });
    const bad = stateWith({ ...actualEnergy(), qualifiedImprovements: [{ ...panel, priorYearCreditClaimed: undefined }, heater] });
    expect(buildTaxInputFromGuidedData(bad)).toBeNull();
    expect(buildTaxInputFromGuidedData(stateWith({ ...actualEnergy(), homes: [{ ...energySource.homes[0], usedAsResidence: false }] }))?.energyCredits?.homes?.[0].usedAsResidence).toBe(false);
  });
});

// Spec: spec/federal/form-5695-source.yaml.
import { describe, expect, it } from "vitest";
import { EnergyCreditsSchema } from "@/models/inputs.js";
import { calculateForm5695 } from "@/engine/forms/form-5695.js";
import { d } from "@/utils/decimal.js";
import { energyHome, energySource, sourceCleanProperty, sourceImprovement } from "../../fixtures/energy-source.js";
const calculate = (value: unknown, options = {}) => calculateForm5695(EnergyCreditsSchema.parse(value), { taxYear: 2025, taxLiabilityLimit: d("100000"), improvementTaxLiabilityLimit: d("100000"), ...options });
const audited = (result: ReturnType<typeof calculate>, line: string) => result.lines.find(entry => entry.form === "Form 5695" && entry.line === line)?.value.toFixed();

describe("Form5695 actual installation sources", () => {
  it("keeps the uncapped printed insulation amount before the annual pool limit", () => {
    const result = calculate({ residenceEligibilityConfirmed: true, qualifiedImprovements: [{ ...sourceImprovement, category: "insulation", qualifiedCost: "10000" }], cleanEnergyProperties: [] });
    expect(audited(result, "18b")).toBe("3000"); expect(audited(result, "27")).toBe("3000"); expect(audited(result, "28")).toBe("1200");
  });
  it("preserves unknown physical source facts and rejects incomplete confirmed records", () => {
    const historical = EnergyCreditsSchema.parse({ qualifiedImprovements: [sourceImprovement] });
    expect(historical).not.toHaveProperty("homes");
    expect(historical).not.toHaveProperty("sourceFactsConfirmed");
    const full = EnergyCreditsSchema.parse(energySource);
    expect(full).toMatchObject(energySource);
    for (const invalid of [ { ...energySource, homes: undefined }, { ...energySource, sourceFactsConfirmed: false },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, homeId: "missing" }] },
      { ...energySource, qualifiedImprovements: [sourceImprovement, sourceImprovement] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, originalUseByTaxpayer: undefined }] },
    ]) expect(() => calculate(invalid)).toThrow(/source|home|original|unique|confirm/i);
  });
  it("uses actual home and category facts without treating an aggregate confirmation as an answer", () => {
    for (const patch of [{ originalUseByTaxpayer: false }, { expectedFiveYearUse: false }, { newConstruction: true }]) {
      const result = calculate({ ...energySource, qualifiedImprovements: [{ ...sourceImprovement, ...patch }] });
      expect(result.energyImprovementCredit.toFixed()).toBe("0");
      expect(result.disallowedNewEnergyCosts.toFixed()).toBe("1000");
    }
    const noHome = calculate({ ...energySource, homes: [{ ...energyHome, usedAsResidence: false }] });
    expect(noHome.residentialCleanEnergyCredit.toFixed()).toBe("0"); expect(noHome.energyImprovementCredit.toFixed()).toBe("0");
    const battery = { ...sourceCleanProperty, category: "battery", batteryKilowattHours: "2.99" };
    expect(calculate({ ...energySource, cleanEnergyProperties: [battery] }).residentialCleanEnergyCredit.toFixed()).toBe("0");
    expect(calculate({ ...energySource, cleanEnergyProperties: [{ ...battery, batteryKilowattHours: "3" }] }).residentialCleanEnergyCredit.toFixed()).toBe("3000");
    expect(() => calculate({ ...energySource, cleanEnergyProperties: [{ ...battery, batteryKilowattHours: undefined }] })).toThrow(/battery|capacity/i);
  });
  it("uses half-kilowatt increments and the IRS joint fuel-cell cost example", () => {
    const fuel = { ...sourceCleanProperty, category: "fuel_cell", qualifiedCost: "12000", fuelCellKilowattCapacity: "5", totalCostPaidByAllOccupants: "20000" };
    const shared = { ...energySource, homes: [{ ...energyHome, jointOccupancyWithOtherReturn: true, allOccupantCostsComplete: true }], qualifiedImprovements: [], cleanEnergyProperties: [fuel] };
    const result = calculate(shared);
    expect(audited(result, "8")).toBe("10002");
    expect(result.residentialCleanEnergyCredit.toFixed()).toBe("3001");
    const ordinary = calculate({ ...energySource, qualifiedImprovements: [], cleanEnergyProperties: [{ ...fuel, fuelCellKilowattCapacity: "1.49", totalCostPaidByAllOccupants: undefined }] });
    expect(audited(ordinary, "10-capacity")).toBe("1"); expect(ordinary.residentialCleanEnergyCredit.toFixed()).toBe("1000");
  });
  it("allocates shared category and annual caps from complete occupant costs", () => {
    const home = { ...energyHome, jointOccupancyWithOtherReturn: true, allOccupantCostsComplete: true };
    const items = [ { ...sourceImprovement, sourceId: "insulation", category: "insulation", qualifiedCost: "5000", totalCostPaidByAllOccupants: "10000" },
      { ...sourceImprovement, sourceId: "window", category: "windows_skylights", qualifiedCost: "2000", totalCostPaidByAllOccupants: "4000" },
      { ...sourceImprovement, sourceId: "heat", category: "heat_pump", qualifiedCost: "5000", totalCostPaidByAllOccupants: "10000" } ];
    const result = calculate({ ...energySource, homes: [home], cleanEnergyProperties: [], qualifiedImprovements: items });
    expect(audited(result, "18b")).toBe("600"); expect(audited(result, "20d")).toBe("300");
    expect(audited(result, "27")).toBe("900"); expect(audited(result, "28")).toBe("900");
    expect(audited(result, "29h")).toBe("1000"); expect(result.energyImprovementCredit.toFixed()).toBe("1900");
    expect(() => calculate({ ...energySource, homes: [{ ...home, allOccupantCostsComplete: undefined }] })).toThrow(/occupant|source/i);
    expect(() => calculate({ ...energySource, homes: [home], qualifiedImprovements: [{ ...sourceImprovement, totalCostPaidByAllOccupants: "999" }] })).toThrow(/occupant|cost/i);
  });
  it("reconciles actual association shares and preserves unsupported or unknown ownership facts", () => {
    const shared = { ...sourceImprovement, qualifiedCost: "1000", associationCostShare: true, associationAllocation: { totalQualifiedCost: "10000", numerator: "1", denominator: "10", sourceReference: "synthetic condo statement" } };
    expect(calculate({ ...energySource, qualifiedImprovements: [shared] }).energyImprovementCredit.toFixed()).toBe("250");
    for (const allocation of [undefined, { ...shared.associationAllocation, denominator: "0" }, { ...shared.associationAllocation, numerator: "2" }]) expect(() => calculate({ ...energySource, qualifiedImprovements: [{ ...shared, associationAllocation: allocation }] })).toThrow(/association|share|allocation/i);
  });
  it("binds electrical panels to eligible property and the actual consecutive-year election", () => {
    const panel = { ...sourceImprovement, sourceId: "panel", category: "electrical_panel", qualifiedCost: "1000", installationCompletedDate: "2024-10-01", enabledPropertyIds: ["heater"], panelLoadAmps: "200", panelCodeComplianceConfirmed: true, consecutiveYearElection: true, priorYearCreditClaimed: false };
    const heater = { ...sourceImprovement, sourceId: "heater", category: "heat_pump_water_heater", qualifiedCost: "4000" };
    const source = { ...energySource, cleanEnergyProperties: [], qualifiedImprovements: [panel, heater] };
    const result = calculate(source); expect(audited(result, "25c")).toBe("1000"); expect(audited(result, "25e")).toBe("300"); expect(result.energyImprovementCredit.toFixed()).toBe("1500");
    for (const patch of [{ enabledPropertyIds: ["missing"] }, { priorYearCreditClaimed: true }, { priorYearCreditClaimed: undefined }]) expect(() => calculate({ ...source, qualifiedImprovements: [{ ...panel, ...patch }, heater] })).toThrow(/panel|enabled|prior|source/i);
    expect(calculate({ ...source, qualifiedImprovements: [{ ...panel, consecutiveYearElection: false }, heater] }).energyImprovementCredit.toFixed()).toBe("1200");
    expect(calculate({ ...source, qualifiedImprovements: [{ ...panel, panelLoadAmps: "199" }, heater] }).energyImprovementCredit.toFixed()).toBe("1200");
  });
  it("keeps separate spousal main-home computations and applies the shared tax limit once", () => {
    const other = { ...energyHome, id: "home-b", owner: "spouse", mainHomeFor: "spouse", address: { ...energyHome.address, street: "54 Separate Home" } };
    const items = [ { ...sourceImprovement, sourceId: "heat-a", category: "heat_pump", qualifiedCost: "10000" }, { ...sourceImprovement, sourceId: "heat-b", homeId: "home-b", category: "heat_pump", qualifiedCost: "10000" } ];
    const source = { ...energySource, homes: [energyHome, other], separateSpousalMainHomes: true, cleanEnergyProperties: [], qualifiedImprovements: items };
    const result = calculate(source, { filingStatus: "married_filing_jointly", improvementTaxLiabilityLimit: d("2500") });
    expect(audited(result, "30")).toBe("4000"); expect(result.energyImprovementCredit.toFixed()).toBe("2500");
    expect(result.improvementHomes).toHaveLength(2);
    expect(() => calculate(source, { filingStatus: "single" })).toThrow(/spous|joint|filing/i);
  });
  it("uses the taxpayer printed line27 for the further shared annual allocation", () => {
    const home = { ...energyHome, jointOccupancyWithOtherReturn: true, allOccupantCostsComplete: true };
    const items = [
      { ...sourceImprovement, sourceId: "insulation", category: "insulation", qualifiedCost: "5000", totalCostPaidByAllOccupants: "10000" },
      { ...sourceImprovement, sourceId: "window", category: "windows_skylights", qualifiedCost: "2000", totalCostPaidByAllOccupants: "4000" },
      { ...sourceImprovement, sourceId: "ac", category: "central_ac", qualifiedCost: "1000", totalCostPaidByAllOccupants: "2000" },
    ];
    const source = { ...energySource, homes: [home], cleanEnergyProperties: [], qualifiedImprovements: items };
    const boundary = calculate(source);
    expect(audited(boundary, "27")).toBe("1200"); expect(audited(boundary, "28")).toBe("1200");
    // IRS printed dollar rounding: 300.01 does not turn the printed1200 into1201.
    const cents = calculate({ ...source, qualifiedImprovements: [...items, { ...sourceImprovement, sourceId: "audit", category: "home_energy_audit", qualifiedCost: "0.04", totalCostPaidByAllOccupants: "0.08", auditReportCertified: true }] });
    expect(audited(cents, "27")).toBe("1200"); expect(audited(cents, "28")).toBe("1200");
    const over = calculate({ ...source, qualifiedImprovements: [...items, { ...sourceImprovement, sourceId: "audit", category: "home_energy_audit", qualifiedCost: "2", totalCostPaidByAllOccupants: "4", auditReportCertified: true }] });
    expect(audited(over, "27")).toBe("1201"); expect(audited(over, "28")).toBe("600");
  });
  it("does not shift prior-year property through an ineligible panel", () => {
    const panel = { ...sourceImprovement, sourceId: "panel", category: "electrical_panel", qualifiedCost: "1000", enabledPropertyIds: ["heater"], panelLoadAmps: "200", panelCodeComplianceConfirmed: true, consecutiveYearElection: true };
    const heater = { ...sourceImprovement, sourceId: "heater", category: "heat_pump_water_heater", qualifiedCost: "4000", installationCompletedDate: "2024-10-01", priorYearCreditClaimed: false };
    const source = { ...energySource, cleanEnergyProperties: [], qualifiedImprovements: [panel, heater] };
    expect(calculate(source).energyImprovementCredit.toFixed()).toBe("1500");
    for (const patch of [{ panelLoadAmps: "199" }, { panelCodeComplianceConfirmed: false }]) {
      const result = calculate({ ...source, qualifiedImprovements: [{ ...panel, ...patch }, heater] });
      expect(result.energyImprovementCredit.toFixed()).toBe("0");
      expect(result.disallowedNewEnergyCosts.toFixed()).toBe("5000");
    }
  });
  it("requires actual nonoverlapping main-home periods and joint spouse eligibility", () => {
    const old = { ...energyHome, mainHomeStartDate: "2025-01-01", mainHomeEndDate: "2025-06-30" };
    const next = { ...energyHome, id: "home-b", mainHomeStartDate: "2025-07-01", mainHomeEndDate: "2025-12-31" };
    const source = { ...energySource, homes: [old, next], cleanEnergyProperties: [], qualifiedImprovements: [sourceImprovement, { ...sourceImprovement, sourceId: "door-b", homeId: "home-b", installationCompletedDate: "2025-07-01" }] };
    expect(calculate(source).energyImprovementCredit.toFixed()).toBe("500");
    expect(calculate({ ...source, qualifiedImprovements: [{ ...sourceImprovement, installationCompletedDate: "2025-07-01" }] }).energyImprovementCredit.toFixed()).toBe("0");
    for (const home of [{ ...next, mainHomeStartDate: "2025-06-30" }, { ...next, mainHomeStartDate: undefined }, { ...next, mainHomeEndDate: "2025-02-30" }]) expect(() => calculate({ ...source, homes: [old, home] })).toThrow(/home|date|overlap/i);
    const spouseOnly = { ...energySource, homes: [{ ...energyHome, owner: "spouse", mainHomeFor: "spouse" }], cleanEnergyProperties: [] };
    expect(() => calculate(spouseOnly)).toThrow(/filing|spouse/i);
    expect(calculate(spouseOnly, { filingStatus: "single" }).energyImprovementCredit.toFixed()).toBe("0");
    expect(calculate(spouseOnly, { filingStatus: "married_filing_jointly" }).energyImprovementCredit.toFixed()).toBe("250");
  });

  it("rejects contradictory source identities and allocation amounts", () => {
    const cases = [
      { ...energySource, homes: [energyHome, energyHome] },
      { ...energySource, homes: [{ ...energyHome, address: { ...energyHome.address, street: " " } }] },
      { ...energySource, homes: [{ ...energyHome, owner: undefined }] },
      { ...energySource, homes: [{ ...energyHome, ownedByTaxpayer: undefined }] },
      { ...energySource, homes: [{ ...energyHome, jointOccupancyWithOtherReturn: undefined }] },
      { ...energySource, homes: [{ ...energyHome, mainHomeStartDate: "2025-12-01", mainHomeEndDate: "2025-01-01" }] },
      { ...energySource, qualifiedImprovements: undefined },
      { ...energySource, cleanEnergyProperties: undefined },
      { ...energySource, residenceEligibilityConfirmed: undefined },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, sourceId: undefined }] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, sourceId: sourceCleanProperty.sourceId }] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, associationCostShare: undefined }] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, totalCostPaidByAllOccupants: "1001" }] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, associationAllocation: { totalQualifiedCost: "1000", numerator: "1", denominator: "1", sourceReference: "unexpected statement" } }] },
      { ...energySource, qualifiedImprovements: [{ ...sourceImprovement, manufacturerQualifiedId: "!bad" }] },
      { ...energySource, homes: [{ ...energyHome, jointOccupancyWithOtherReturn: true, allOccupantCostsComplete: true }], qualifiedImprovements: [{ ...sourceImprovement, totalCostPaidByAllOccupants: "" }] },
    ];
    for (const value of cases) expect(() => calculate(value)).toThrow();
    const shared = { ...sourceImprovement, associationCostShare: true, associationAllocation: { totalQualifiedCost: "1000", numerator: "2", denominator: "1", sourceReference: "invalid ratio" } };
    expect(() => calculate({ ...energySource, qualifiedImprovements: [shared] })).toThrow(/association/);
  });
  it("distinguishes residence and audit requirements by property category", () => {
    for (const patch of [{ locatedInUnitedStates: false }, { usedAsResidence: false }]) {
      const result = calculate({ ...energySource, homes: [{ ...energyHome, ...patch }] });
      expect(result.energyImprovementCredit.toFixed()).toBe("0"); expect(result.residentialCleanEnergyCredit.toFixed()).toBe("0");
    }
    const otherHome = { ...energyHome, mainHomeFor: "neither", ownedByTaxpayer: false };
    const heater = { ...sourceImprovement, sourceId: "heater", category: "heat_pump", qualifiedCost: "5000" };
    expect(calculate({ ...energySource, homes: [otherHome], qualifiedImprovements: [sourceImprovement, heater] }).energyImprovementCredit.toFixed()).toBe("1500");
    const audit = { ...sourceImprovement, category: "home_energy_audit", auditReportCertified: true };
    expect(calculate({ ...energySource, homes: [{ ...energyHome, ownedByTaxpayer: false }], qualifiedImprovements: [audit] }).energyImprovementCredit.toFixed()).toBe("150");
    expect(calculate({ ...energySource, qualifiedImprovements: [{ ...audit, auditReportCertified: false }] }).energyImprovementCredit.toFixed()).toBe("0");
    expect(() => calculate({ ...energySource, qualifiedImprovements: [{ ...audit, auditReportCertified: undefined }] })).toThrow(/audit/);
    expect(calculate({ ...energySource, cleanEnergyProperties: [{ ...sourceCleanProperty, category: "fuel_cell", fuelCellKilowattCapacity: "0.49" }] }).residentialCleanEnergyCredit.toFixed()).toBe("0");
  });
  it("preserves source cents while rounding the printed category aggregate", () => {
    const source = { ...energySource, cleanEnergyProperties: [], qualifiedImprovements: [
      { ...sourceImprovement, sourceId: "first", category: "insulation", qualifiedCost: "100.49" },
      { ...sourceImprovement, sourceId: "second", category: "insulation", qualifiedCost: "100.49" },
    ] };
    const result = calculate(source);
    expect(audited(result, "18a")).toBe("201"); expect(audited(result, "18b")).toBe("60");
    expect(result.lines.find(line => line.form === "Form 5695 Source" && line.line === "first:cost")?.value.toFixed()).toBe("100.49");
    expect(source.qualifiedImprovements[0].qualifiedCost).toBe("100.49");
    const empty = calculate({ ...energySource, homes: [], qualifiedImprovements: [], cleanEnergyProperties: [] });
    expect(empty.improvementHomes).toHaveLength(0); expect(empty.energyImprovementCredit.toFixed()).toBe("0");
  });

  it("requires actual carryforward facts and rejects contradictory overrides", () => {
    for (const patch of [{ priorYearCarryforward: undefined }, { carryforwardConfirmed: undefined }, { carryforwardConfirmed: false }, { carryforwardSourceTaxYear: 2023 }]) expect(() => calculate({ ...energySource, ...patch })).toThrow(/carryforward/);
    expect(() => calculate(energySource, { priorYearCarryforward: d("1") })).toThrow(/carryforward/);
    expect(() => calculate(energySource, { carryforwardSourceTaxYear: 2023 })).toThrow(/carryforward/);
    expect(() => calculate(energySource, { carryforwardConfirmed: false })).toThrow(/carryforward/);
    const result = calculate({ ...energySource, priorYearCarryforward: "600" }, { priorYearCarryforward: d("600"), taxLiabilityLimit: d("1000") });
    expect(result.residentialCleanEnergyCredit.toFixed()).toBe("1000"); expect(result.residentialCleanEnergyCarryforward.toFixed()).toBe("2600");
  });

});

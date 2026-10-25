import Decimal from "decimal.js";
import type { EnergyCreditData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";

export const energyImprovementLabels = {
  insulation: "Insulation and air sealing", exterior_door: "One exterior door", windows_skylights: "Windows and skylights",
  central_ac: "Central air conditioner", gas_water_heater: "Natural gas, propane or oil water heater", furnace_boiler: "Furnace or hot-water boiler",
  electrical_panel: "Qualifying electrical panel", heat_pump: "Electric or natural gas heat pump", heat_pump_water_heater: "Heat-pump water heater", biomass: "Biomass stove or boiler", home_energy_audit: "Home energy audit",
} as const;
export const cleanEnergyLabels = { solar_electric: "Solar electric property", solar_water: "Solar water heating", fuel_cell: "Fuel-cell property", small_wind: "Small wind turbine", geothermal: "Geothermal heat pump", battery: "Battery storage" } as const;
export const legacyEnergyLabels = { solarElectricCost: "Saved solar electric total", solarWaterHeatingCost: "Saved solar water-heating total", insulationCost: "Saved insulation total", exteriorDoorsWindowsCost: "Saved combined doors/windows total", roofCost: "Saved roof total", energyEfficientHvacCost: "Saved HVAC total", waterHeaterHeatPumpCost: "Saved water-heater/heat-pump total" } as const;

export function energyFactErrors(data: EnergyCreditData | undefined, taxYear?: number | null): Record<string, string> {
  if (!data) return {};
  const errors: Record<string, string> = {};
  for (const field of Object.keys(legacyEnergyLabels) as Array<keyof typeof legacyEnergyLabels>) {
    if (hasEnteredAmount(data[field])) { const error = amountError(data[field], "saved energy cost"); if (error) errors[`energy-${field}`] = error; }
  }
  const improvements = data.qualifiedImprovements ?? [];
  const properties = data.cleanEnergyProperties ?? [];
  if ((improvements.length || properties.length) && typeof data.residenceEligibilityConfirmed !== "boolean") errors.energyResidence = "Confirm the actual residence and personal-use eligibility for these energy records.";
  for (const [entries, categories, prefix] of [[improvements, energyImprovementLabels, "improvement"], [properties, cleanEnergyLabels, "clean-property"]] as const) {
    entries.forEach((entry, index) => {
      if (!(entry.category in categories)) errors[`energy-${prefix}-${index}-category`] = "Choose the actual property category.";
      const error = amountError(entry.qualifiedCost, "net qualified cost");
      if (error) errors[`energy-${prefix}-${index}-cost`] = error;
      if (!isActualDate(entry.installationCompletedDate) || (taxYear != null && !entry.installationCompletedDate.startsWith(`${taxYear}-`))) errors[`energy-${prefix}-${index}-date`] = "Enter the actual completion date in this tax year; carryforwards use the separate prior-year fields.";
      if (typeof entry.qualificationConfirmed !== "boolean") errors[`energy-${prefix}-${index}-qualification`] = "Confirm the property's documented qualification; unknown is not eligible.";
    });
  }
  improvements.forEach((entry, index) => {
    if ((taxYear === 2025 || entry.installationCompletedDate?.startsWith("2025-")) && entry.qualificationConfirmed === true && !["insulation", "home_energy_audit"].includes(entry.category) && !/^[A-Z0-9]{4}$/i.test(entry.manufacturerQualifiedId ?? "")) errors[`energy-improvement-${index}-qmid`] = "Enter the four-character qualified manufacturer ID from the actual product records.";
  });
  properties.forEach((entry, index) => {
    if (entry.category === "fuel_cell") {
      const error = amountError(entry.fuelCellKilowattCapacity, "fuel-cell kilowatt capacity");
      if (error) errors[`energy-clean-property-${index}-capacity`] = error;
    }
  });
  if (hasEnteredAmount(data.priorYearCarryforward)) {
    const error = amountError(data.priorYearCarryforward, "prior-year energy carryforward");
    if (error) errors.energyCarryforward = error;
    if (!/^\d{4}$/.test(data.carryforwardSourceTaxYear ?? "") || (taxYear != null && Number(data.carryforwardSourceTaxYear) !== taxYear - 1)) errors.energyCarryforwardYear = "Enter the immediately preceding return year that carried this credit forward.";
    if (typeof data.carryforwardConfirmed !== "boolean") errors.energyCarryforwardConfirmation = "Confirm the carryforward from the actual prior-year Form 5695.";
    else if (!error && (taxYear === 2026 || parseGuidedCurrency(data.priorYearCarryforward).gt(0)) && !data.carryforwardConfirmed) errors.energyCarryforwardConfirmation = "The carryforward is unconfirmed and cannot be used to calculate a credit.";
  }
  if (taxYear === 2026 && (improvements.length || properties.length) && !hasEnteredAmount(data.priorYearCarryforward)) errors.energyCarryforward = "Confirm the 2025 Form 5695 carryforward, including an explicit zero, before calculating the 2026 energy result.";
  if (Object.keys(errors).length) return errors;
  const roof = parseGuidedCurrency(data.roofCost);
  if (roof.gt(0) && !["not_eligible", "qualified_solar_component"].includes(data.legacyRoofTreatment ?? "")) errors.energyRoof = "Classify the saved roof cost. General roofing is not eligible; a qualifying solar component needs actual solar property records.";
  const sumCategories = (entries: Array<{ category: string; qualifiedCost: string }>, categories: string[]) => entries.filter((entry) => categories.includes(entry.category)).reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.qualifiedCost)), new Decimal(0));
  const reconciliations = [
    ["solarElectricCost", sumCategories(properties, ["solar_electric"]), parseGuidedCurrency(data.solarElectricCost).plus(data.legacyRoofTreatment === "qualified_solar_component" ? roof : 0)],
    ["solarWaterHeatingCost", sumCategories(properties, ["solar_water"]), parseGuidedCurrency(data.solarWaterHeatingCost)],
    ["insulationCost", sumCategories(improvements, ["insulation"]), parseGuidedCurrency(data.insulationCost)],
    ["exteriorDoorsWindowsCost", sumCategories(improvements, ["exterior_door", "windows_skylights"]), parseGuidedCurrency(data.exteriorDoorsWindowsCost)],
    ["energyEfficientHvacCost", sumCategories(improvements, ["central_ac", "furnace_boiler"]), parseGuidedCurrency(data.energyEfficientHvacCost)],
    ["waterHeaterHeatPumpCost", sumCategories(improvements, ["gas_water_heater", "heat_pump", "heat_pump_water_heater"]), parseGuidedCurrency(data.waterHeaterHeatPumpCost)],
  ] as const;
  for (const [field, actual, saved] of reconciliations) {
    if ((hasEnteredAmount(data[field]) || (field === "solarElectricCost" && data.legacyRoofTreatment === "qualified_solar_component")) && !actual.eq(saved)) errors[`energy-${field}`] = "Reconcile the saved total to the actual individual property records; the aggregate will not be counted a second time.";
  }
  return errors;
}

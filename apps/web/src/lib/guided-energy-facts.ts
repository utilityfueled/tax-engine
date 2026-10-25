import Decimal from "decimal.js";
import type { EnergyCreditData, EnergyPropertySourceData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount, isActualDate } from "./guided-required-facts";
import type { EnergyCredits } from "@/models/inputs.js";
import { calculateEnergySourceFacts } from "@/engine/forms/energy-source-facts.js";

export const energyImprovementLabels = {
  insulation: "Insulation and air sealing", exterior_door: "One exterior door", windows_skylights: "Windows and skylights",
  central_ac: "Central air conditioner", gas_water_heater: "Natural gas, propane or oil water heater", furnace_boiler: "Furnace or hot-water boiler",
  electrical_panel: "Qualifying electrical panel", heat_pump: "Electric or natural gas heat pump", heat_pump_water_heater: "Heat-pump water heater", biomass: "Biomass stove or boiler", home_energy_audit: "Home energy audit",
} as const;
export const cleanEnergyLabels = { solar_electric: "Solar electric property", solar_water: "Solar water heating", fuel_cell: "Fuel-cell property", small_wind: "Small wind turbine", geothermal: "Geothermal heat pump", battery: "Battery storage" } as const;
export const legacyEnergyLabels = { solarElectricCost: "Saved solar electric total", solarWaterHeatingCost: "Saved solar water-heating total", insulationCost: "Saved insulation total", exteriorDoorsWindowsCost: "Saved combined doors/windows total", roofCost: "Saved roof total", energyEfficientHvacCost: "Saved HVAC total", waterHeaterHeatPumpCost: "Saved water-heater/heat-pump total" } as const;

export function energyFactErrors(data: EnergyCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Record<string, string> {
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
      if (!isActualDate(entry.installationCompletedDate)) errors[`energy-${prefix}-${index}-date`] = "Enter the actual installation completion date. A panel election retains both original installation dates.";
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
  if (energyStarted(data) && (taxYear !== 2025 && taxYear !== 2026)) errors.energyYear = "Choose the actual tax year before calculating energy credits.";
  if ((taxYear === 2025 || taxYear === 2026) && energyStarted(data) && !Object.keys(errors).length) {
    try {
      const source = normalizeEnergy(data);
      if (taxYear === 2025) calculateEnergySourceFacts(source, { taxYear, filingStatus: filingStatus ? statusMap[filingStatus] : undefined });
    }
    catch (error) { errors.energyPhysicalSources = error instanceof Error ? error.message : "Complete actual energy installation sources."; }
  }
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

const statusMap = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
const bool = (value?: boolean | null) => typeof value === "boolean" ? value : undefined;
const amount = (value?: string) => {
  if (!hasEnteredAmount(value)) return undefined;
  const parsed = parseGuidedCurrency(value);
  if (!parsed.isFinite() || parsed.isNegative()) throw new Error("Actual energy amounts must be finite and nonnegative.");
  return parsed.toFixed();
};
function energyStarted(data: EnergyCreditData) {
  return Boolean(data.qualifiedImprovements?.length || data.cleanEnergyProperties?.length || data.homes?.length || hasEnteredAmount(data.priorYearCarryforward) || data.sourceFactsConfirmed === true);
}
function propertySource(entry: EnergyPropertySourceData) {
  return {
    sourceId: entry.sourceId?.trim(), homeId: entry.homeId?.trim(),
    totalCostPaidByAllOccupants: amount(entry.totalCostPaidByAllOccupants),
    associationCostShare: bool(entry.associationCostShare),
    associationAllocation: entry.associationAllocation ? {
      totalQualifiedCost: amount(entry.associationAllocation.totalQualifiedCost) as string,
      numerator: amount(entry.associationAllocation.numerator) as string,
      denominator: amount(entry.associationAllocation.denominator) as string,
      sourceReference: entry.associationAllocation.sourceReference.trim(),
    } : undefined,
  };
}
/** This copies only entered facts; calculation validation supplies no missing values. */
function normalizeEnergy(data: EnergyCreditData): Partial<EnergyCredits> {
  return {
    sourceFactsConfirmed: bool(data.sourceFactsConfirmed), separateSpousalMainHomes: bool(data.separateSpousalMainHomes),
    homes: data.homes?.map(home => ({ id: home.id, owner: home.owner || undefined, address: { ...home.address },
      locatedInUnitedStates: bool(home.locatedInUnitedStates), usedAsResidence: bool(home.usedAsResidence), mainHomeFor: home.mainHomeFor || undefined,
      mainHomeStartDate: home.mainHomeStartDate?.trim() || undefined, mainHomeEndDate: home.mainHomeEndDate?.trim() || undefined,
      ownedByTaxpayer: bool(home.ownedByTaxpayer), jointOccupancyWithOtherReturn: bool(home.jointOccupancyWithOtherReturn), allOccupantCostsComplete: bool(home.allOccupantCostsComplete) })),
    qualifiedImprovements: data.qualifiedImprovements?.map(entry => ({ ...propertySource(entry),
      category: entry.category as NonNullable<EnergyCredits["qualifiedImprovements"]>[number]["category"],
      qualifiedCost: amount(entry.qualifiedCost) as string, installationCompletedDate: entry.installationCompletedDate,
      qualificationConfirmed: bool(entry.qualificationConfirmed) as boolean,
      manufacturerQualifiedId: entry.manufacturerQualifiedId?.trim() || undefined,
      originalUseByTaxpayer: bool(entry.originalUseByTaxpayer), expectedFiveYearUse: bool(entry.expectedFiveYearUse),
      newConstruction: bool(entry.newConstruction), auditReportCertified: bool(entry.auditReportCertified),
      enabledPropertyIds: entry.enabledPropertyIds?.map(id => id.trim()), panelLoadAmps: amount(entry.panelLoadAmps),
      panelCodeComplianceConfirmed: bool(entry.panelCodeComplianceConfirmed), consecutiveYearElection: bool(entry.consecutiveYearElection), priorYearCreditClaimed: bool(entry.priorYearCreditClaimed),
    })),
    cleanEnergyProperties: data.cleanEnergyProperties?.map(entry => ({ ...propertySource(entry),
      category: entry.category as NonNullable<EnergyCredits["cleanEnergyProperties"]>[number]["category"],
      qualifiedCost: amount(entry.qualifiedCost) as string, installationCompletedDate: entry.installationCompletedDate,
      qualificationConfirmed: bool(entry.qualificationConfirmed) as boolean,
      fuelCellKilowattCapacity: amount(entry.fuelCellKilowattCapacity), batteryKilowattHours: amount(entry.batteryKilowattHours),
    })),
    residenceEligibilityConfirmed: bool(data.residenceEligibilityConfirmed),
    priorYearCarryforward: amount(data.priorYearCarryforward),
    carryforwardSourceTaxYear: data.carryforwardSourceTaxYear?.trim() ? Number(data.carryforwardSourceTaxYear) : undefined,
    carryforwardConfirmed: bool(data.carryforwardConfirmed),
  };
}
export function buildActualEnergyInput(data: EnergyCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Partial<EnergyCredits> | undefined {
  if (!data) return undefined;
  const errors = energyFactErrors(data, taxYear, filingStatus);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(" "));
  if (!energyStarted(data)) return undefined;
  return normalizeEnergy(data);
}

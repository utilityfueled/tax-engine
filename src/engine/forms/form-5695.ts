/**
 * Form 5695 — Residential Energy Credits
 * Spec: spec/federal/form-5695.yaml
 *
 * 2025: itemized property limits and nonrefundable credit worksheets.
 * 2026: confirmed prior-year clean-energy carryforward only.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { EnergyCredits } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { calculateEnergySourceFacts, type EnergySourceFactsResult, type ResolvedEnergyImprovement } from "./energy-source-facts.js";

export interface Form5695Options {
  taxYear?: number;
  filingStatus?: FilingStatus;
  priorYearCarryforward?: Decimal;
  carryforwardSourceTaxYear?: number;
  carryforwardConfirmed?: boolean;
  taxLiabilityLimit?: Decimal;
  improvementTaxLiabilityLimit?: Decimal;
}

export interface Form5695Result {
  sourceFactsVerified?: boolean;
  taxYear?: number;
  improvementHomes?: Array<{ groupId: string; homeIds: string[]; creditBeforeTaxLimit: Decimal; lines: CalculatedLine[] }>;
  priorYearCarryforward: Decimal;
  residentialCleanEnergyCreditBeforeLimit: Decimal;
  residentialCleanEnergyCarryforward: Decimal;
  carryforwardTaxYear: number;
  disallowedNewEnergyCosts: Decimal;
  // Part I
  totalCleanEnergyCosts: Decimal;
  residentialCleanEnergyCredit: Decimal; // 2025 printed line15

  // Part II
  totalImprovementCosts: Decimal;
  improvementCreditBeforeLimits: Decimal; // 30% of qualified costs before category/annual limits
  energyImprovementCredit: Decimal; // 2025 printed line32

  lines: CalculatedLine[];
}

const CLEAN_ENERGY_RATE = new Decimal("0.30");
const IMPROVEMENT_RATE = new Decimal("0.30");
const IMPROVEMENT_ANNUAL_CAP = new Decimal(3200);
const INSULATION_CAP = new Decimal(1200);
const ENERGY_PROPERTY_CAP = new Decimal(2000);
const AUDIT_CAP = new Decimal(150);

export function calculateForm5695(
  energyCredits?: Partial<EnergyCredits>,
  options: Form5695Options = {},
): Form5695Result {
  const audit = new AuditTrail();
  const taxYear = options.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Unsupported Form 5695 tax year");
  const suppliedCarryforward = options.priorYearCarryforward ?? (energyCredits?.priorYearCarryforward === undefined ? undefined : d(energyCredits.priorYearCarryforward));
  const priorYearCarryforward = suppliedCarryforward ?? new Decimal(0);
  const carryforwardConfirmed = options.carryforwardConfirmed ?? energyCredits?.carryforwardConfirmed;
  const carryforwardSourceTaxYear = options.carryforwardSourceTaxYear ?? energyCredits?.carryforwardSourceTaxYear;
  const costKeys = ["solarElectricCost", "solarWaterHeatingCost", "fuelCellCost", "smallWindCost", "geoThermalHeatPumpCost", "batteryStorageCost", "insulationCost", "energyPropertyCost", "homeEnergyAuditCost"] as const;
  const currentCosts = costKeys.map(key => d(energyCredits?.[key]));
  const detailed = energyCredits?.cleanEnergyProperties !== undefined || energyCredits?.qualifiedImprovements !== undefined;
  const records = [...(energyCredits?.cleanEnergyProperties ?? []), ...(energyCredits?.qualifiedImprovements ?? [])];
  const detailedCosts = records.map(record => d(record.qualifiedCost));
  if (detailed && currentCosts.some(cost => cost.gt(0))) throw new Error("Detailed energy records cannot be mixed with positive legacy totals");
  for (const record of records) {
    const date = new Date(`${record.installationCompletedDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.installationCompletedDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== record.installationCompletedDate) {
      throw new Error("Energy installation date must be a real calendar date");
    }
    if (typeof record.qualificationConfirmed !== "boolean") throw new Error("Energy qualification must be known");
  }
  for (const amount of [...currentCosts, ...detailedCosts, priorYearCarryforward, ...(options.taxLiabilityLimit === undefined ? [] : [options.taxLiabilityLimit]), ...(options.improvementTaxLiabilityLimit === undefined ? [] : [options.improvementTaxLiabilityLimit])]) {
    if (!amount.isFinite() || amount.isNegative()) throw new Error("Form 5695 requires finite nonnegative amounts");
  }
  if ((priorYearCarryforward.gt(0) || (taxYear === 2026 && energyCredits !== undefined)) &&
      (carryforwardConfirmed !== true || carryforwardSourceTaxYear !== taxYear - 1 || suppliedCarryforward === undefined)) {
    throw new Error("Energy credit requires confirmed immediate-prior-year carryforward facts");
  }
  if (taxYear === 2026) {
    if ((energyCredits !== undefined || priorYearCarryforward.gt(0)) && options.taxLiabilityLimit === undefined) throw new Error("2026 energy carryforward requires the tax-liability worksheet");
    const limit = roundDollar(options.taxLiabilityLimit ?? new Decimal(0));
    const available = roundDollar(priorYearCarryforward);
    const allowed = min(available, limit);
    const carryforward = zeroFloor(available.minus(allowed));
    const disallowed = sum(...currentCosts, ...detailedCosts);
    for (const [line, description, amount] of [
      ["1", "Confirmed prior-year clean energy carryforward", available],
      ["2", "Tax-liability limit", limit], ["3", "Residential clean energy credit", allowed],
      ["4", "Clean energy carryforward to next year", carryforward],
      ["terminated-new-costs", "New costs ineligible after 2025 termination", disallowed],
    ] as const) audit.record("Form 5695", line, description, amount, "IRC 25D(c), (h); 2026 carryforward worksheet");
    return {priorYearCarryforward:available, residentialCleanEnergyCreditBeforeLimit:available,
      residentialCleanEnergyCredit:allowed, residentialCleanEnergyCarryforward:carryforward, carryforwardTaxYear:taxYear+1,
      disallowedNewEnergyCosts:disallowed, totalCleanEnergyCosts:new Decimal(0), totalImprovementCosts:new Decimal(0),
      improvementCreditBeforeLimits:new Decimal(0), energyImprovementCredit:new Decimal(0), lines:audit.getLines()};
  }

  if (energyCredits?.sourceFactsConfirmed !== undefined || energyCredits?.homes !== undefined) {
    const sources = calculateEnergySourceFacts(energyCredits, { taxYear, filingStatus: options.filingStatus });
    return calculateSourcedEnergy(energyCredits, sources, options);
  }

  if (detailed) {
    if (typeof energyCredits?.residenceEligibilityConfirmed !== "boolean") throw new Error("Detailed energy records require known residence eligibility");
    if (options.taxLiabilityLimit === undefined || options.improvementTaxLiabilityLimit === undefined) throw new Error("Detailed energy credits require both actual tax-liability worksheets");
    const cleanCosts = new Map<string, Decimal>();
    const improvementCosts = new Map<string, Decimal>();
    const improvementItems = new Map<string, Decimal[]>();
    let fuelCellCapacity = new Decimal(0);
    let disallowedNewEnergyCosts = new Decimal(0);
    const eligible = (record: (typeof records)[number]) => energyCredits?.residenceEligibilityConfirmed === true && record.qualificationConfirmed && record.installationCompletedDate.startsWith(`${taxYear}-`);
    for (const record of energyCredits.cleanEnergyProperties ?? []) {
      const cost = d(record.qualifiedCost);
      if (!eligible(record)) { disallowedNewEnergyCosts = disallowedNewEnergyCosts.plus(cost); continue; }
      if (record.category === "fuel_cell") {
        if (record.fuelCellKilowattCapacity === undefined) throw new Error("Qualified fuel cells require actual capacity");
        const capacity = d(record.fuelCellKilowattCapacity);
        if (!capacity.isFinite() || capacity.lte(0)) throw new Error("Qualified fuel cell capacity must be positive and finite");
        if (capacity.lt("0.5")) { disallowedNewEnergyCosts = disallowedNewEnergyCosts.plus(cost); continue; }
        fuelCellCapacity = fuelCellCapacity.plus(capacity.times(2).floor().div(2));
      }
      cleanCosts.set(record.category, (cleanCosts.get(record.category) ?? new Decimal(0)).plus(cost));
    }
    for (const record of energyCredits.qualifiedImprovements ?? []) {
      const cost = d(record.qualifiedCost);
      if (!eligible(record)) { disallowedNewEnergyCosts = disallowedNewEnergyCosts.plus(cost); continue; }
      if (!["insulation", "home_energy_audit"].includes(record.category) && !/^[A-Za-z0-9]{4}$/.test(record.manufacturerQualifiedId ?? "")) {
        throw new Error("Qualified improvement requires its four-character manufacturer ID");
      }
      improvementItems.set(record.category, [...(improvementItems.get(record.category) ?? []), cost]);
      improvementCosts.set(record.category, (improvementCosts.get(record.category) ?? new Decimal(0)).plus(cost));
    }
    const cleanCost = (category: string) => roundDollar(cleanCosts.get(category) ?? new Decimal(0));
    const improvementCost = (category: string) => roundDollar(improvementCosts.get(category) ?? new Decimal(0));
    const record = (line: string, description: string, value: Decimal, formula: string) => audit.record("Form 5695", line, description, value, formula);
    const nonFuelCosts = sum(...["solar_electric", "solar_water", "small_wind", "geothermal", "battery"].map(cleanCost));
    const totalCleanEnergyCosts = nonFuelCosts.plus(cleanCost("fuel_cell"));
    const nonFuelCredit = roundDollar(nonFuelCosts.times(CLEAN_ENERGY_RATE));
    const fuelCreditBeforeCap = roundDollar(cleanCost("fuel_cell").times(CLEAN_ENERGY_RATE));
    const fuelCap = roundDollar(fuelCellCapacity.times(1000));
    const fuelCredit = min(fuelCreditBeforeCap, fuelCap);
    const available = nonFuelCredit.plus(fuelCredit).plus(roundDollar(priorYearCarryforward));
    const cleanLimit = roundDollar(options.taxLiabilityLimit);
    const cleanAllowed = min(available, cleanLimit);
    const carryforward = available.minus(cleanAllowed);
    for (const [line, category] of [["1","solar_electric"],["2","solar_water"],["3","small_wind"],["4","geothermal"],["5b","battery"],["8","fuel_cell"]] as const) {
      record(line, `Qualified ${category} costs`, cleanCost(category), "Confirmed itemized net costs placed in service in the tax year");
    }
    for (const [line, description, value, formula] of [
      ["6a", "Non-fuel-cell clean costs", nonFuelCosts, "Sum lines 1,2,3,4,5b"],
      ["6b", "Non-fuel-cell credit", nonFuelCredit, "Line 6a × 30%"],
      ["9", "Fuel-cell tentative credit", fuelCreditBeforeCap, "Line 8 × 30%"],
      ["10-capacity", "Qualified fuel-cell kilowatt capacity", fuelCellCapacity, "Each actual capacity rounded down to a whole half-kilowatt increment"],
      ["10", "Fuel-cell capacity limit", fuelCap, "Eligible half-kilowatt increments × $500"],
      ["11", "Fuel-cell credit", fuelCredit, "min(line 9,line 10)"],
      ["12", "Prior-year clean carryforward", roundDollar(priorYearCarryforward), "Actual confirmed prior-year carryforward"],
      ["13", "Available clean credit", available, "Sum lines 6b,11,12"],
      ["14", "Clean-credit tax limit", cleanLimit, "Actual tax-liability worksheet"],
      ["15", "Allowed clean credit", cleanAllowed, "min(line 13,line 14)"],
      ["16", "Clean carryforward to next year", carryforward, "Line 13 − line 15"],
    ] as const) record(line, description, value, formula);
    const items = (category: string) => [...(improvementItems.get(category) ?? [])].sort((left, right) => right.comparedTo(left));
    const itemCost = (category: string, index: number) => roundDollar(items(category)[index] ?? new Decimal(0));
    const otherCosts = (category: string, from: number) => roundDollar(sum(...items(category).slice(from)));
    const doors = items("exterior_door");
    const firstDoorCost = roundDollar(doors[0] ?? new Decimal(0));
    const firstDoorCredit = min(roundDollar(firstDoorCost.times(IMPROVEMENT_RATE)), new Decimal(250));
    const otherDoorCosts = otherCosts("exterior_door", 1);
    const otherDoorCredit = roundDollar(otherDoorCosts.times(IMPROVEMENT_RATE));
    const doorCredit = min(firstDoorCredit.plus(otherDoorCredit), new Decimal(500));
    for (const [line, description, value] of [
      ["19a", "Most expensive exterior door", firstDoorCost],
      ["19c", "First exterior door credit", firstDoorCredit],
      ["19d-1", "Second exterior door", itemCost("exterior_door", 1)],
      ["19d-2", "Third exterior door", itemCost("exterior_door", 2)],
      ["19d", "Second and third exterior doors", roundDollar(sum(...doors.slice(1, 3)))],
      ["19e", "Additional exterior doors", otherCosts("exterior_door", 3)],
      ["19f", "Other exterior doors total", otherDoorCosts],
      ["19g", "Other exterior doors credit", otherDoorCredit],
      ["20a-1", "First window or skylight", itemCost("windows_skylights", 0)],
      ["20a-2", "Second window or skylight", itemCost("windows_skylights", 1)],
      ["20a-3", "Third window or skylight", itemCost("windows_skylights", 2)],
      ["20a-4", "Fourth window or skylight", itemCost("windows_skylights", 3)],
      ["20a", "First four windows or skylights", roundDollar(sum(...items("windows_skylights").slice(0, 4)))],
      ["20b", "Additional windows or skylights", otherCosts("windows_skylights", 4)],
      ["20c", "Windows and skylights total", improvementCost("windows_skylights")],
      ["22a", "First central air conditioner", itemCost("central_ac", 0)],
      ["22b", "Additional central air conditioners", otherCosts("central_ac", 1)],
      ["22c", "Central air conditioners total", improvementCost("central_ac")],
      ["23a-1", "First gas water heater", itemCost("gas_water_heater", 0)],
      ["23a-2", "Second gas water heater", itemCost("gas_water_heater", 1)],
      ["23a", "First two gas water heaters", roundDollar(sum(...items("gas_water_heater").slice(0, 2)))],
      ["23b", "Additional gas water heaters", otherCosts("gas_water_heater", 2)],
      ["23c", "Gas water heaters total", improvementCost("gas_water_heater")],
      ["24a", "First furnace or boiler", itemCost("furnace_boiler", 0)],
      ["24b", "Additional furnaces or boilers", otherCosts("furnace_boiler", 1)],
      ["24c", "Furnaces and boilers total", improvementCost("furnace_boiler")],
      ["25c", "Enabling electrical property costs", improvementCost("electrical_panel")],
      ["29a", "First heat pump", itemCost("heat_pump", 0)],
      ["29b", "Additional heat pumps", otherCosts("heat_pump", 1)],
      ["29c", "First heat pump water heater", itemCost("heat_pump_water_heater", 0)],
      ["29d", "Additional heat pump water heaters", otherCosts("heat_pump_water_heater", 1)],
      ["29e", "First biomass stove or boiler", itemCost("biomass", 0)],
      ["29f", "Additional biomass stoves or boilers", otherCosts("biomass", 1)],
    ] as const) record(line, description, value, "Actual qualified items sorted by cost; IRS printed-line aggregation and rounding");
    const capped = (category: string, cap: number) => min(roundDollar(improvementCost(category).times(IMPROVEMENT_RATE)), new Decimal(cap));
    const credits = [
      ["18b", "Insulation", min(roundDollar(improvementCost("insulation").times(IMPROVEMENT_RATE)), INSULATION_CAP)],
      ["19h", "Exterior doors", doorCredit],
      ["20d", "Windows and skylights", capped("windows_skylights",600)],
      ["22d", "Central air conditioners", capped("central_ac",600)],
      ["23d", "Gas/propane/oil water heaters", capped("gas_water_heater",600)],
      ["24d", "Furnaces and boilers", capped("furnace_boiler",600)],
      ["25e", "Enabling electrical property", capped("electrical_panel",600)],
      ["26c", "Home energy audit", capped("home_energy_audit",150)],
    ] as const;
    for (const [line, description, credit] of credits) record(line, `${description} credit`, credit, "30% of actual qualified cost, subject to category cap");
    record("18a", "Insulation costs", improvementCost("insulation"), "Qualified cost excluding installation labor");
    record("26b", "Home energy audit costs", improvementCost("home_energy_audit"), "Qualified audit with certified written report");
    const generalBeforeLimit = sum(...credits.map(entry=>entry[2]));
    const generalAllowed = min(generalBeforeLimit, INSULATION_CAP);
    const heatCosts = sum(...["heat_pump","heat_pump_water_heater","biomass"].map(improvementCost));
    const heatAllowed = min(roundDollar(heatCosts.times(IMPROVEMENT_RATE)), ENERGY_PROPERTY_CAP);
    const improvementBeforeTaxLimit = generalAllowed.plus(heatAllowed);
    const improvementLimit = roundDollar(options.improvementTaxLiabilityLimit);
    const improvementAllowed = min(improvementBeforeTaxLimit, improvementLimit);
    for (const [line, description, value, formula] of [
      ["27","General credit before shared limit",generalBeforeLimit,"Sum lines 18b,19h,20d,22d,23d,24d,25e,26c"],
      ["28","General credit",generalAllowed,"min(line 27,1200)"],
      ["29g","Heat pump and biomass costs",heatCosts,"Sum qualified heat pumps, heat pump water heaters, biomass"],
      ["29h","Heat pump and biomass credit",heatAllowed,"min(round(line 29g × 30%),2000)"],
      ["30","Improvement credit before tax limit",improvementBeforeTaxLimit,"Sum lines 28,29h"],
      ["31","Improvement-credit tax limit",improvementLimit,"Actual tax-liability worksheet"],
      ["32","Allowed improvement credit",improvementAllowed,"min(line 30,line 31)"],
      ["disallowed-costs","Ineligible or wrong-year costs",disallowedNewEnergyCosts,"Known ineligible facts never produce a credit"],
    ] as const) record(line, description, value, formula);
    const totalImprovementCosts = sum(...[...improvementCosts.values()].map(roundDollar));
    return {priorYearCarryforward:roundDollar(priorYearCarryforward), residentialCleanEnergyCreditBeforeLimit:available,
      residentialCleanEnergyCredit:cleanAllowed, residentialCleanEnergyCarryforward:carryforward, carryforwardTaxYear:taxYear+1,
      totalCleanEnergyCosts,totalImprovementCosts,disallowedNewEnergyCosts,
      improvementCreditBeforeLimits:roundDollar(totalImprovementCosts.times(IMPROVEMENT_RATE)),energyImprovementCredit:improvementAllowed,lines:audit.getLines()};
  }

  if (!energyCredits && priorYearCarryforward.isZero()) {
    audit.record("Form 5695", "1-6", "Total clean energy costs", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "14", "Residential clean energy credit", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "18-20", "Total improvement costs", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "24", "Improvement credit before limits", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "30", "Energy improvement credit", new Decimal(0), "No energy credit inputs");
    return {
      priorYearCarryforward, residentialCleanEnergyCreditBeforeLimit:new Decimal(0),
      residentialCleanEnergyCarryforward:new Decimal(0), carryforwardTaxYear:taxYear+1, disallowedNewEnergyCosts:new Decimal(0),
      totalCleanEnergyCosts: new Decimal(0),
      residentialCleanEnergyCredit: new Decimal(0),
      totalImprovementCosts: new Decimal(0),
      improvementCreditBeforeLimits: new Decimal(0),
      energyImprovementCredit: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  energyCredits ??= {};

  // ── Part I: Residential Clean Energy Credit ─────────────
  const totalCleanEnergyCosts = sum(
    d(energyCredits.solarElectricCost),
    d(energyCredits.solarWaterHeatingCost),
    d(energyCredits.fuelCellCost),
    d(energyCredits.smallWindCost),
    d(energyCredits.geoThermalHeatPumpCost),
    d(energyCredits.batteryStorageCost)
  );
  audit.record("Form 5695", "1-6", "Total clean energy costs", totalCleanEnergyCosts,
    "Solar + wind + geothermal + fuel cell + battery");

  const residentialCleanEnergyCreditBeforeLimit = roundDollar(totalCleanEnergyCosts.times(CLEAN_ENERGY_RATE)).plus(roundDollar(priorYearCarryforward));
  const residentialCleanEnergyCredit = min(residentialCleanEnergyCreditBeforeLimit, roundDollar(options.taxLiabilityLimit ?? residentialCleanEnergyCreditBeforeLimit));
  const residentialCleanEnergyCarryforward = zeroFloor(residentialCleanEnergyCreditBeforeLimit.minus(residentialCleanEnergyCredit));
  audit.record("Form 5695", "14", "Residential clean energy credit", residentialCleanEnergyCredit,
    `${totalCleanEnergyCosts} × 30%`);

  // ── Part II: Energy Efficient Home Improvement Credit ────
  const insulationCost = d(energyCredits.insulationCost);
  const energyPropertyCost = d(energyCredits.energyPropertyCost);
  const homeEnergyAuditCost = d(energyCredits.homeEnergyAuditCost);

  const totalImprovementCosts = sum(insulationCost, energyPropertyCost, homeEnergyAuditCost);
  audit.record("Form 5695", "18-20", "Total improvement costs", totalImprovementCosts,
    "Insulation + energy property + audit");

  const improvementCreditBeforeLimits = roundDollar(totalImprovementCosts.times(IMPROVEMENT_RATE));
  audit.record("Form 5695", "24", "Improvement credit before limits", improvementCreditBeforeLimits,
    `${totalImprovementCosts} × 30%`);

  // Apply sub-limits: audit ($150 cap) is WITHIN the $1,200 general pool per IRS/IRC §25C(b)
  const insulationRawCredit = roundDollar(insulationCost.times(IMPROVEMENT_RATE));
  const auditCredit = min(roundDollar(homeEnergyAuditCost.times(IMPROVEMENT_RATE)), AUDIT_CAP);
  const generalPoolCredit = min(insulationRawCredit.plus(auditCredit), INSULATION_CAP);

  const energyPropertyCredit = min(roundDollar(energyPropertyCost.times(IMPROVEMENT_RATE)), ENERGY_PROPERTY_CAP);

  // Total = general ($1,200 max) + heat pump ($2,000 max) = $3,200 max
  const energyImprovementCredit = Decimal.min(generalPoolCredit.plus(energyPropertyCredit), IMPROVEMENT_ANNUAL_CAP,
    roundDollar(options.improvementTaxLiabilityLimit ?? IMPROVEMENT_ANNUAL_CAP));
  audit.record("Form 5695", "30", "Energy improvement credit", energyImprovementCredit,
    `general pool: min(${insulationRawCredit}+${auditCredit}, $1,200)=${generalPoolCredit} + heat pump: ${energyPropertyCredit}`);

  if (options.priorYearCarryforward !== undefined || options.taxLiabilityLimit !== undefined) {
    audit.record("Form 5695", "12", "Prior-year clean energy carryforward", priorYearCarryforward, "Confirmed prior-year Form 5695");
    audit.record("Form 5695", "15", "Allowed clean energy credit", residentialCleanEnergyCredit, "Lesser of available credit and worksheet tax limit");
    audit.record("Form 5695", "16", "Clean energy carryforward to next year", residentialCleanEnergyCarryforward, "Unused clean credit; no improvement carryforward");
  }
  return {
    priorYearCarryforward, residentialCleanEnergyCreditBeforeLimit, residentialCleanEnergyCarryforward,
    carryforwardTaxYear:taxYear+1, disallowedNewEnergyCosts:new Decimal(0),
    totalCleanEnergyCosts,
    residentialCleanEnergyCredit,
    totalImprovementCosts,
    improvementCreditBeforeLimits,
    energyImprovementCredit,
    lines: audit.getLines(),
  };
}

/** Apply actual occupancy allocations to the audited printed worksheet. */
function calculateSourcedEnergy(source: Partial<EnergyCredits>, sources: EnergySourceFactsResult, options: Form5695Options): Form5695Result {
  if ((options.priorYearCarryforward !== undefined && !options.priorYearCarryforward.eq(d(source.priorYearCarryforward))) ||
      (options.carryforwardSourceTaxYear !== undefined && options.carryforwardSourceTaxYear !== source.carryforwardSourceTaxYear) ||
      (options.carryforwardConfirmed !== undefined && options.carryforwardConfirmed !== source.carryforwardConfirmed)) throw new Error("Energy carryforward options conflict with the actual confirmed source");
  const normalized: Partial<EnergyCredits> = {
    ...source, sourceFactsConfirmed: undefined, homes: undefined, separateSpousalMainHomes: undefined,
    cleanEnergyProperties: sources.cleanProperties.map(entry => ({ ...entry, qualifiedCost: entry.allocatedCost.toFixed(), qualificationConfirmed: entry.eligible, installationCompletedDate: entry.effectiveDate })),
    qualifiedImprovements: sources.improvements.map(entry => ({ ...entry, qualificationConfirmed: entry.eligible, installationCompletedDate: entry.effectiveDate })),
  };
  const base = calculateForm5695(normalized, options);
  const onlyImprovements = (items: ResolvedEnergyImprovement[]): Form5695Result => calculateForm5695({
    ...normalized, cleanEnergyProperties: [], priorYearCarryforward: "0",
    qualifiedImprovements: items.map(entry => ({ ...entry, qualificationConfirmed: entry.eligible, installationCompletedDate: entry.effectiveDate })),
  }, { ...options, priorYearCarryforward: new Decimal(0) });
  const lineValue = (result: Form5695Result, line: string): Decimal => {
    const value = result.lines.find(entry => entry.form === "Form 5695" && entry.line === line)?.value;
    if (!value) throw new Error(`Energy source worksheet is missing audit line ${line}`);
    return value;
  };
  const heatCategories = new Set(["heat_pump", "heat_pump_water_heater", "biomass"]);
  const categoryLines = [
    ["insulation", "18b", 1200], ["exterior_door", "19h", 500], ["windows_skylights", "20d", 600],
    ["central_ac", "22d", 600], ["gas_water_heater", "23d", 600], ["furnace_boiler", "24d", 600],
    ["electrical_panel", "25e", 600], ["home_energy_audit", "26c", 150],
  ] as const;
  const paidTotal = (items: ResolvedEnergyImprovement[], all = false) => sum(...items.map(entry => all ? entry.allOccupantsCost : d(entry.qualifiedCost)));
  const allocatedCap = (ownCredit: Decimal, cap: number, items: ResolvedEnergyImprovement[], allCredit?: Decimal): Decimal => {
    const total = paidTotal(items, true); const own = paidTotal(items);
    if (total.isZero() || (allCredit ?? total.times(IMPROVEMENT_RATE)).lte(cap)) return ownCredit;
    return min(ownCredit, roundDollar(new Decimal(cap).times(own).div(total)));
  };
  const doorCredit = (item: ResolvedEnergyImprovement): Decimal => {
    const ordinary = min(roundDollar(roundDollar(d(item.qualifiedCost)).times(IMPROVEMENT_RATE)), new Decimal(250));
    return item.home.jointOccupancyWithOtherReturn ? allocatedCap(ordinary, 250, [item]) : ordinary;
  };
  const pool = (items: ResolvedEnergyImprovement[]): Form5695Result => {
    const ordinary = onlyImprovements(items);
    if (!items.some(entry => entry.eligible && entry.home.jointOccupancyWithOtherReturn)) return ordinary;
    const groups = new Map<string, ResolvedEnergyImprovement[]>();
    for (const item of items.filter(entry => entry.eligible)) {
      const id = item.home.jointOccupancyWithOtherReturn ? item.homeId : "nonjoint-properties";
      groups.set(id, [...(groups.get(id) ?? []), item]);
    }
    const credits = new Map<string, Decimal>(); let homeHeatTotal = new Decimal(0);
    for (const itemsAtHome of groups.values()) {
      const homeBase = onlyImprovements(itemsAtHome);
      const shared = itemsAtHome[0].home.jointOccupancyWithOtherReturn === true;
      for (const [category, line, cap] of categoryLines) {
        const categoryItems = itemsAtHome.filter(item => item.category === category);
        let value = lineValue(homeBase, line);
        if (shared && category === "exterior_door") {
          const totalIndividualCredit = sum(...categoryItems.map(item => min(roundDollar(roundDollar(item.allOccupantsCost).times(IMPROVEMENT_RATE)), new Decimal(250))));
          value = allocatedCap(sum(...categoryItems.map(doorCredit)), cap, categoryItems, totalIndividualCredit);
        } else if (shared) value = allocatedCap(value, cap, categoryItems);
        credits.set(line, (credits.get(line) ?? new Decimal(0)).plus(value));
      }
      const heatItems = itemsAtHome.filter(item => heatCategories.has(item.category));
      const heat = lineValue(homeBase, "29h");
      homeHeatTotal = homeHeatTotal.plus(shared ? allocatedCap(heat, 2000, heatItems) : heat);
    }
    for (const [, line, cap] of categoryLines) {
      credits.set(line, min(credits.get(line) ?? new Decimal(0), new Decimal(cap)));
    }
    const firstDoor = items.filter(item => item.eligible && item.category === "exterior_door").sort((a, b) => d(b.qualifiedCost).comparedTo(a.qualifiedCost))[0];
    credits.set("19c", firstDoor ? doorCredit(firstDoor) : new Decimal(0));
    const generalBeforeLimit = sum(...categoryLines.map(([, line]) => credits.get(line) ?? new Decimal(0)));
    // The instructions test the taxpayer's actual printed27 after property shares.
    // An all-occupant hypothetical27 must not trigger this second allocation.
    const eligibleItems = items.filter(entry => entry.eligible);
    const generalAllowed = allocatedCap(min(generalBeforeLimit, INSULATION_CAP), 1200,
      eligibleItems.filter(entry => !heatCategories.has(entry.category)), generalBeforeLimit);
    const heatAllowed = allocatedCap(min(homeHeatTotal, ENERGY_PROPERTY_CAP), 2000,
      eligibleItems.filter(entry => heatCategories.has(entry.category)), homeHeatTotal);
    const tentative = generalAllowed.plus(heatAllowed);
    const allowed = min(tentative, lineValue(ordinary, "31"));
    for (const [line, value] of [["27", generalBeforeLimit], ["28", generalAllowed], ["29h", heatAllowed], ["30", tentative], ["32", allowed]] as const) credits.set(line, value);
    return { ...ordinary, energyImprovementCredit: allowed, lines: ordinary.lines.map(entry => credits.has(entry.line) && entry.form === "Form 5695"
      ? { ...entry, value: credits.get(entry.line) ?? entry.value, formula: "Actual joint-occupancy category/annual allocation; source cost ratios retained in the source audit" } : entry) };
  };
  const groups = new Map<string, ResolvedEnergyImprovement[]>();
  for (const item of sources.improvements) {
    const key = sources.separateSpousalMainHomes ? item.home.owner : "return";
    if (!key || (sources.separateSpousalMainHomes && key === "joint")) throw new Error("Separate spousal main-home property requires its actual individual owner");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const groupResults = [...groups].map(([groupId, items]) => ({ groupId, homeIds: [...new Set(items.map(item => item.homeId))], calculation: pool(items) }));
  const combinedTentative = sum(...groupResults.map(group => lineValue(group.calculation, "30")));
  const allowed = min(combinedTentative, lineValue(base, "31"));
  const first = groupResults[0]?.calculation ?? onlyImprovements([]);
  const firstLines = new Map(first.lines.filter(entry => entry.form === "Form 5695" && Number.parseInt(entry.line, 10) >= 18).map(entry => [entry.line, entry]));
  const lines = base.lines.map(entry => {
    if (entry.form !== "Form 5695") return entry;
    if (entry.line === "30") return { ...entry, value: combinedTentative, formula: "Sum actual per-return or separate-spousal-main-home line30 worksheets" };
    if (entry.line === "32") return { ...entry, value: allowed, formula: "min(combined line30, actual shared tax-liability line31)" };
    if (entry.line === "31" || entry.line === "disallowed-costs") return entry;
    return firstLines.get(entry.line) ?? entry;
  });
  const sourceAudit = new AuditTrail();
  sourceAudit.record("Form 5695 Source", "verified", "Actual installation facts verified locally", new Decimal(1), "Complete home/property/qualification/allocation sources; not independent filing qualification");
  for (const item of [...sources.cleanProperties, ...sources.improvements]) {
    sourceAudit.record("Form 5695 Source", `${item.sourceId}:cost`, "Actual taxpayer net qualified cost supplied", d(item.qualifiedCost), `Home ${item.homeId}; actual completion ${item.installationCompletedDate}; effective year ${item.effectiveDate.slice(0, 4)}; eligible ${item.eligible}`);
    if (item.home.jointOccupancyWithOtherReturn) sourceAudit.record("Form 5695 Source", `${item.sourceId}:all-occupants`, "Actual corresponding costs of all occupants", item.allOccupantsCost, "Complete all-occupant records confirmed; proportional property and annual caps apply");
    if ("allocatedCost" in item) sourceAudit.record("Form 5695 Source", `${item.sourceId}:allocated`, "Cost after applicable joint fuel-cell allocation", item.allocatedCost, "min(actual cost,1667*half-kilowatt increments*actual occupant fraction)");
  }
  return { ...base, sourceFactsVerified: true, taxYear: options.taxYear ?? 2025, energyImprovementCredit: allowed,
    improvementHomes: groupResults.map(group => ({ groupId: group.groupId, homeIds: group.homeIds, creditBeforeTaxLimit: lineValue(group.calculation, "30"), lines: group.calculation.lines })),
    lines: [...lines, ...sourceAudit.getLines()] };
}

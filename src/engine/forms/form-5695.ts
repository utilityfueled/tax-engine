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

export interface Form5695Options {
  taxYear?: number;
  priorYearCarryforward?: Decimal;
  carryforwardSourceTaxYear?: number;
  carryforwardConfirmed?: boolean;
  taxLiabilityLimit?: Decimal;
  improvementTaxLiabilityLimit?: Decimal;
}

export interface Form5695Result {
  priorYearCarryforward: Decimal;
  residentialCleanEnergyCreditBeforeLimit: Decimal;
  residentialCleanEnergyCarryforward: Decimal;
  carryforwardTaxYear: number;
  disallowedNewEnergyCosts: Decimal;
  // Part I
  totalCleanEnergyCosts: Decimal;
  residentialCleanEnergyCredit: Decimal; // Line 14

  // Part II
  totalImprovementCosts: Decimal;
  improvementCreditBeforeLimits: Decimal; // Line 24
  energyImprovementCredit: Decimal; // Line 30

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

  if (detailed) {
    if (typeof energyCredits?.residenceEligibilityConfirmed !== "boolean") throw new Error("Detailed energy records require known residence eligibility");
    if (options.taxLiabilityLimit === undefined || options.improvementTaxLiabilityLimit === undefined) throw new Error("Detailed energy credits require both actual tax-liability worksheets");
    const cleanCosts = new Map<string, Decimal>();
    const improvementCosts = new Map<string, Decimal>();
    const doorCredits: Decimal[] = [];
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
        fuelCellCapacity = fuelCellCapacity.plus(capacity);
      }
      cleanCosts.set(record.category, (cleanCosts.get(record.category) ?? new Decimal(0)).plus(cost));
    }
    for (const record of energyCredits.qualifiedImprovements ?? []) {
      const cost = d(record.qualifiedCost);
      if (!eligible(record)) { disallowedNewEnergyCosts = disallowedNewEnergyCosts.plus(cost); continue; }
      if (!["insulation", "home_energy_audit"].includes(record.category) && !/^[A-Za-z0-9]{4}$/.test(record.manufacturerQualifiedId ?? "")) {
        throw new Error("Qualified improvement requires its four-character manufacturer ID");
      }
      if (record.category === "exterior_door") doorCredits.push(min(roundDollar(cost.times(IMPROVEMENT_RATE)), new Decimal(250)));
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
      ["10", "Fuel-cell capacity limit", fuelCap, "Actual kW × $1,000"],
      ["11", "Fuel-cell credit", fuelCredit, "min(line 9,line 10)"],
      ["12", "Prior-year clean carryforward", roundDollar(priorYearCarryforward), "Actual confirmed prior-year carryforward"],
      ["13", "Available clean credit", available, "Sum lines 6b,11,12"],
      ["14", "Clean-credit tax limit", cleanLimit, "Actual tax-liability worksheet"],
      ["15", "Allowed clean credit", cleanAllowed, "min(line 13,line 14)"],
      ["16", "Clean carryforward to next year", carryforward, "Line 13 − line 15"],
    ] as const) record(line, description, value, formula);
    const capped = (category: string, cap: number) => min(roundDollar(improvementCost(category).times(IMPROVEMENT_RATE)), new Decimal(cap));
    const credits = [
      ["18b", "Insulation", capped("insulation",1200)],
      ["19h", "Exterior doors", min(sum(...doorCredits),new Decimal(500))],
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

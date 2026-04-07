/**
 * Form 5695 — Residential Energy Credits
 * Spec: spec/federal/form-5695.yaml
 *
 * Part I: Residential Clean Energy Credit (30%, no cap)
 * Part II: Energy Efficient Home Improvement Credit (30%, $3,200 annual cap)
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { EnergyCredits } from "@/models/inputs.js";

export interface Form5695Result {
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
  energyCredits?: EnergyCredits
): Form5695Result {
  const audit = new AuditTrail();

  if (!energyCredits) {
    audit.record("Form 5695", "1-6", "Total clean energy costs", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "14", "Residential clean energy credit", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "18-20", "Total improvement costs", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "24", "Improvement credit before limits", new Decimal(0), "No energy credit inputs");
    audit.record("Form 5695", "30", "Energy improvement credit", new Decimal(0), "No energy credit inputs");
    return {
      totalCleanEnergyCosts: new Decimal(0),
      residentialCleanEnergyCredit: new Decimal(0),
      totalImprovementCosts: new Decimal(0),
      improvementCreditBeforeLimits: new Decimal(0),
      energyImprovementCredit: new Decimal(0),
      lines: audit.getLines(),
    };
  }

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

  const residentialCleanEnergyCredit = roundDollar(totalCleanEnergyCosts.times(CLEAN_ENERGY_RATE));
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
  const energyImprovementCredit = min(generalPoolCredit.plus(energyPropertyCredit), IMPROVEMENT_ANNUAL_CAP);
  audit.record("Form 5695", "30", "Energy improvement credit", energyImprovementCredit,
    `general pool: min(${insulationRawCredit}+${auditCredit}, $1,200)=${generalPoolCredit} + heat pump: ${energyPropertyCredit}`);

  return {
    totalCleanEnergyCosts,
    residentialCleanEnergyCredit,
    totalImprovementCosts,
    improvementCreditBeforeLimits,
    energyImprovementCredit,
    lines: audit.getLines(),
  };
}

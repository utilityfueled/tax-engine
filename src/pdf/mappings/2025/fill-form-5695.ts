import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 5695 — Residential Energy Credits.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f5695.pdf', 'forms/filled/f5695-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, sum, min, roundDollar } from "@/utils/decimal.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p4 = (n: string) => `topmostSubform[0].Page4[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 5695 fillable PDF field inspection.

export const FORM_5695_FIELDS = {
  // ── Page 1 Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Residential Clean Energy Credit ──
  line1: p1("f1_08[0]"),   // Qualified solar electric property costs
  line2: p1("f1_09[0]"),   // Qualified solar water heating property costs
  line3: p1("f1_10[0]"),   // Qualified small wind energy property costs
  line4: p1("f1_11[0]"),   // Qualified geothermal heat pump property costs
  line5aYes: p1("c1_1[0]"),  // Battery ≥ 3 kWh? Yes
  line5aNo: p1("c1_1[1]"),   // Battery ≥ 3 kWh? No
  line5b: p1("f1_12[0]"),  // Qualified battery storage technology costs
  line6a: p1("f1_13[0]"),  // Add lines 1 through 5b
  line6b: p1("f1_14[0]"),  // Multiply line 6a by 30%
  line7aYes: p1("c1_2[0]"),  // Fuel cell property? Yes
  line7aNo: p1("c1_2[1]"),   // Fuel cell property? No
  line8: p1("f1_20[0]"),   // Qualified fuel cell property costs
  line9: p1("f1_21[0]"),   // Multiply line 8 by 30%
  line11: p1("f1_25[0]"),  // Smaller of line 9 or line 10
  line12: p1("f1_26[0]"),  // Credit carryforward from 2024
  line13: p1("f1_27[0]"),  // Add lines 6b, 11, and 12
  line14: p1("f1_28[0]"),  // Tax liability limitation
  line15: p1("f1_29[0]"),  // Residential clean energy credit
  line16: p1("f1_30[0]"),  // Credit carryforward to 2026

  // ── Page 2 Header ──
  name2: p2("f2_01[0]"),
  ssn2: p2("f2_02[0]"),
  // Part II, Section A checkboxes
  line17aYes: p2("c2_1[0]"),
  line17aNo: p2("c2_1[1]"),
  line17bYes: p2("c2_2[0]"),
  line17bNo: p2("c2_2[1]"),
  line17cYes: p2("c2_3[0]"),
  line17cNo: p2("c2_3[1]"),
  // Line 18: Insulation
  line18a: p2("f2_08[0]"),   // Insulation material cost
  line18b: p2("f2_09[0]"),   // 30% of 18a, max $1,200

  // ── Page 4: Section B continued + Totals ──
  line26b: p4("f4_01[0]"),   // Home energy audit cost
  line26c: p4("f4_02[0]"),   // 30% of 26b, max $150
  line27: p4("f4_03[0]"),    // Sum of sub-limits (18b, 19h, 20d, 22d, 23d, 24d, 25e, 26c)
  line28: p4("f4_04[0]"),    // Smaller of line 27 or $1,200
  line29h: p4("f4_18[0]"),   // 30% of energy property costs, max $2,000
  line30: p4("f4_19[0]"),    // Add lines 28 and 29h
  line31: p4("f4_20[0]"),    // Tax liability limitation
  line32: p4("f4_21[0]"),    // Energy efficient home improvement credit
} as const;

const F = FORM_5695_FIELDS;

const CLEAN_ENERGY_RATE = new Decimal("0.30");
const IMPROVEMENT_RATE = new Decimal("0.30");
const INSULATION_CAP = new Decimal(1200);
const ENERGY_PROPERTY_CAP = new Decimal(2000);
const AUDIT_CAP = new Decimal(150);
const GENERAL_POOL_CAP = new Decimal(1200);
const IMPROVEMENT_ANNUAL_CAP = new Decimal(3200);

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm5695(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const ec = input.energyCredits!;
  const sched3 = result.schedule3!;

  // ── Header (both pages) ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  setTextField(form, F.name2, name);
  setTextField(form, F.ssn2, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Part I: Residential Clean Energy Credit ──
  const solarElectric = d(ec.solarElectricCost);
  const solarWater = d(ec.solarWaterHeatingCost);
  const smallWind = d(ec.smallWindCost);
  const geoThermal = d(ec.geoThermalHeatPumpCost);
  const battery = d(ec.batteryStorageCost);
  const fuelCell = d(ec.fuelCellCost);

  const hasCleanEnergy = solarElectric.plus(solarWater).plus(smallWind)
    .plus(geoThermal).plus(battery).gt(0);
  const hasFuelCell = fuelCell.gt(0);

  if (hasCleanEnergy || hasFuelCell) {
    // Lines 1-4: Individual costs
    if (solarElectric.gt(0)) setCurrencyField(form, F.line1, solarElectric);
    if (solarWater.gt(0)) setCurrencyField(form, F.line2, solarWater);
    if (smallWind.gt(0)) setCurrencyField(form, F.line3, smallWind);
    if (geoThermal.gt(0)) setCurrencyField(form, F.line4, geoThermal);

    // Line 5a-5b: Battery storage
    if (battery.gt(0)) {
      setCheckBox(form, F.line5aYes, true);
      setCurrencyField(form, F.line5b, battery);
    }

    // Line 6a: Total non-fuel-cell clean energy costs
    const line6a = sum(solarElectric, solarWater, smallWind, geoThermal, battery);
    if (line6a.gt(0)) {
      setCurrencyField(form, F.line6a, line6a);
      // Line 6b: 30% of line 6a
      const line6b = roundDollar(line6a.times(CLEAN_ENERGY_RATE));
      setCurrencyField(form, F.line6b, line6b);
    }

    // Lines 7a, 8-9: Fuel cell property
    if (hasFuelCell) {
      setCheckBox(form, F.line7aYes, true);
      setCurrencyField(form, F.line8, fuelCell);
      const line9 = roundDollar(fuelCell.times(CLEAN_ENERGY_RATE));
      setCurrencyField(form, F.line9, line9);
      // Line 11: Without kW capacity data, credit = line 9
      setCurrencyField(form, F.line11, line9);
    } else {
      setCheckBox(form, F.line7aNo, true);
    }

    // Line 13: Total (6b + 11 + 12)
    const line6b = roundDollar(sum(solarElectric, solarWater, smallWind, geoThermal, battery).times(CLEAN_ENERGY_RATE));
    const line11 = hasFuelCell ? roundDollar(fuelCell.times(CLEAN_ENERGY_RATE)) : new Decimal(0);
    const line13 = line6b.plus(line11);
    if (line13.gt(0)) setCurrencyField(form, F.line13, line13);

    // Line 15: Residential clean energy credit (from engine)
    setCurrencyField(form, F.line15, sched3.residentialCleanEnergyCredit);
  }

  // ── Part II: Energy Efficient Home Improvement Credit ──
  const insulation = d(ec.insulationCost);
  const energyProperty = d(ec.energyPropertyCost);
  const homeAudit = d(ec.homeEnergyAuditCost);
  const hasImprovements = insulation.plus(energyProperty).plus(homeAudit).gt(0);

  if (hasImprovements) {
    // Line 17a-17c: Yes checkboxes (assumed yes since costs are provided)
    setCheckBox(form, F.line17aYes, true);
    setCheckBox(form, F.line17bYes, true);
    setCheckBox(form, F.line17cYes, true);

    // Line 18a-18b: Insulation costs
    if (insulation.gt(0)) {
      setCurrencyField(form, F.line18a, insulation);
      const line18b = min(roundDollar(insulation.times(IMPROVEMENT_RATE)), INSULATION_CAP);
      setCurrencyField(form, F.line18b, line18b);
    }

    // Line 26b-26c: Home energy audit
    let auditCredit = new Decimal(0);
    if (homeAudit.gt(0)) {
      setCurrencyField(form, F.line26b, homeAudit);
      auditCredit = min(roundDollar(homeAudit.times(IMPROVEMENT_RATE)), AUDIT_CAP);
      setCurrencyField(form, F.line26c, auditCredit);
    }

    // Line 27: Sum of sub-limits (insulation credit + audit credit for general pool)
    const insulationCredit = insulation.gt(0)
      ? min(roundDollar(insulation.times(IMPROVEMENT_RATE)), INSULATION_CAP)
      : new Decimal(0);
    const generalPoolTotal = insulationCredit.plus(auditCredit);
    if (generalPoolTotal.gt(0)) setCurrencyField(form, F.line27, generalPoolTotal);

    // Line 28: Smaller of line 27 or $1,200
    const line28 = min(generalPoolTotal, GENERAL_POOL_CAP);
    if (line28.gt(0)) setCurrencyField(form, F.line28, line28);

    // Line 29h: Energy property credit (heat pumps, etc.), max $2,000
    let line29h = new Decimal(0);
    if (energyProperty.gt(0)) {
      line29h = min(roundDollar(energyProperty.times(IMPROVEMENT_RATE)), ENERGY_PROPERTY_CAP);
      setCurrencyField(form, F.line29h, line29h);
    }

    // Line 30: Line 28 + Line 29h
    const line30 = min(line28.plus(line29h), IMPROVEMENT_ANNUAL_CAP);
    if (line30.gt(0)) setCurrencyField(form, F.line30, line30);

    // Line 32: Energy efficient home improvement credit (from engine)
    setCurrencyField(form, F.line32, sched3.energyImprovementCredit);
  }

  return doc;
}

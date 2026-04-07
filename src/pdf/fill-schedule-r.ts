/**
 * PDF filler for IRS Schedule R (Form 1040) — Credit for the Elderly or
 * the Disabled.
 *
 * Field names verified against 2025 Schedule R fillable PDF field inspection.
 *
 * The engine ScheduleRResult stores key line values. Intermediate lines
 * (13a/13b breakdown, AGI threshold, excess AGI) are derived from the
 * TaxReturnResult and ScheduleRInput.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { ScheduleRBox } from "@/engine/forms/schedule-r.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

const ZERO = new Decimal(0);
const HALF = new Decimal("0.5");

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1m = (n: string) => `topmostSubform[0].Page1[0].Married[0].${n}`;
const p1ms = (n: string) => `topmostSubform[0].Page1[0].MarriedSeparate[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule R fillable PDF debug labels.

export const SCHEDULE_R_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Eligibility Checkboxes ──
  box1: p1("c1_1[0]"),             // Single/HoH/QSS — age 65+
  box2: p1("c1_1[1]"),             // Single/HoH/QSS — under 65, disabled
  box3: p1m("c1_1[0]"),            // MFJ — both 65+
  box4: p1m("c1_1[1]"),            // MFJ — both under 65, one disabled
  box5: p1m("c1_1[2]"),            // MFJ — both under 65, both disabled
  box6: p1m("c1_1[3]"),            // MFJ — one 65+, other under 65 disabled
  box7: p1m("c1_1[4]"),            // MFJ — one 65+, other under 65 NOT disabled
  box8: p1ms("c1_1[0]"),           // MFS — age 65+
  box9: p1ms("c1_1[1]"),           // MFS — under 65, disabled
  disabilityStatement: p1("c1_2[0]"), // Part II disability statement checkbox

  // ── Part III: Figure Your Credit (Page 2) ──
  line10: p2("f2_1[0]"),   // Initial amount
  line11: p2("f2_2[0]"),   // Taxable disability income
  line12: p2("f2_3[0]"),   // Adjusted initial amount (smaller of 10 or 11)
  line13a: p2("f2_4[0]"),  // Nontaxable Social Security benefits
  line13b: p2("f2_5[0]"),  // Nontaxable pensions/annuities/disability
  line13c: p2("f2_6[0]"),  // Total nontaxable benefits (13a + 13b)
  line14: p2("f2_7[0]"),   // AGI from Form 1040 Line 11
  line15: p2("f2_8[0]"),   // AGI threshold based on box
  line16: p2("f2_9[0]"),   // Excess AGI (Line 14 - Line 15)
  line17: p2("f2_10[0]"),  // Half of Line 16
  line18: p2("f2_11[0]"),  // Total reduction (Line 13c + Line 17)
  line19: p2("f2_12[0]"),  // Credit base (Line 12 - Line 18)
  line20: p2("f2_13[0]"),  // Tentative credit (Line 19 × 0.15)
  line21: p2("f2_14[0]"),  // Tax liability limit
  line22: p2("f2_15[0]"),  // Final credit (smaller of 20 or 21)
} as const;

// ─── Box → Checkbox Field Mapping ──────────────────────────────────────────

const BOX_FIELD_MAP: Record<ScheduleRBox, string> = {
  1: SCHEDULE_R_FIELDS.box1,
  2: SCHEDULE_R_FIELDS.box2,
  3: SCHEDULE_R_FIELDS.box3,
  4: SCHEDULE_R_FIELDS.box4,
  5: SCHEDULE_R_FIELDS.box5,
  6: SCHEDULE_R_FIELDS.box6,
  7: SCHEDULE_R_FIELDS.box7,
  8: SCHEDULE_R_FIELDS.box8,
  9: SCHEDULE_R_FIELDS.box9,
};

/** AGI thresholds by box (statutory amounts, not inflation-adjusted) */
function getAgiThreshold(box: ScheduleRBox): Decimal {
  switch (box) {
    case 1: case 2: return new Decimal(7500);
    case 3: case 4: case 5: case 6: case 7: return new Decimal(10000);
    case 8: case 9: return new Decimal(5000);
  }
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule R PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleR(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = SCHEDULE_R_FIELDS;
  const schedR = result.scheduleR;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!schedR || !schedR.eligible || !schedR.box) return doc;

  const box = schedR.box;

  // ── Part I: Check the eligibility box ──
  setCheckBox(form, BOX_FIELD_MAP[box], true);

  // ── Part III: Figure Your Credit ──

  // Line 10: Initial amount
  setCurrencyField(form, F.line10, schedR.initialAmount);

  // Line 11: Disability income (only for disability boxes 2, 4, 5, 6, 9)
  const isDisabilityBox = box === 2 || box === 4 || box === 5 || box === 6 || box === 9;
  if (isDisabilityBox && !schedR.adjustedInitialAmount.eq(schedR.initialAmount)) {
    // Disability income caps the initial amount — derive it from the relationship
    // adjustedInitialAmount = min(initialAmount, disabilityIncome)
    // If adjusted < initial, then disabilityIncome = adjusted
    setCurrencyField(form, F.line11, schedR.adjustedInitialAmount);
  }

  // Line 12: Adjusted initial amount
  setCurrencyField(form, F.line12, schedR.adjustedInitialAmount);

  // Lines 13a-13c: Nontaxable benefits breakdown
  const nontaxableSS = Decimal.max(ZERO,
    result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable));
  const nontaxablePensions = Decimal.max(ZERO,
    schedR.nontaxableBenefits.minus(nontaxableSS));

  setCurrencyField(form, F.line13a, nontaxableSS);
  setCurrencyField(form, F.line13b, nontaxablePensions);
  setCurrencyField(form, F.line13c, schedR.nontaxableBenefits);

  // Lines 14-17: AGI reduction calculation
  const agi = result.agi;
  const agiThreshold = getAgiThreshold(box);
  const excessAgi = Decimal.max(ZERO, agi.minus(agiThreshold));
  const halfExcess = excessAgi.times(HALF).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  setCurrencyField(form, F.line14, agi);
  setCurrencyField(form, F.line15, agiThreshold);
  setCurrencyField(form, F.line16, excessAgi);
  setCurrencyField(form, F.line17, halfExcess);

  // Line 18: Total reduction (nontaxable benefits + half excess AGI)
  const totalReduction = schedR.nontaxableBenefits.plus(halfExcess);
  setCurrencyField(form, F.line18, totalReduction);

  // Line 19: Credit base
  setCurrencyField(form, F.line19, schedR.creditBase);

  // Line 20: Tentative credit (15% of credit base)
  setCurrencyField(form, F.line20, schedR.credit);

  // Line 22: Final credit (= tentative credit; tax liability limit applied externally)
  setCurrencyField(form, F.line22, schedR.credit);

  return doc;
}

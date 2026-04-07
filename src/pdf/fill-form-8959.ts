/**
 * PDF filler for IRS Form 8959 — Additional Medicare Tax.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, zeroFloor, roundDollar } from "@/utils/decimal.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8959 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Additional Medicare Tax on Medicare Wages ──
  line1: p1("f1_3[0]"),   // Medicare wages from W-2 Box 5
  line2: p1("f1_4[0]"),   // Unreported tips from Form 4137
  line3: p1("f1_5[0]"),   // Wages from Form 8919
  line4: p1("f1_6[0]"),   // Add lines 1-3
  line5: p1("f1_7[0]"),   // Filing status threshold
  line6: p1("f1_8[0]"),   // Subtract line 5 from line 4 (zero floor)
  line7: p1("f1_9[0]"),   // Additional Medicare Tax on wages (line 6 × 0.9%)

  // ── Part II: Additional Medicare Tax on Self-Employment Income ──
  line8: p1("f1_10[0]"),  // SE income from Schedule SE (floored at 0)
  line9: p1("f1_11[0]"),  // Filing status threshold
  line10: p1("f1_12[0]"), // Amount from line 4
  line11: p1("f1_13[0]"), // Subtract line 10 from line 9 (zero floor)
  line12: p1("f1_14[0]"), // Subtract line 11 from line 8 (zero floor)
  line13: p1("f1_15[0]"), // Additional Medicare Tax on SE (line 12 × 0.9%)

  // ── Part III: Additional Medicare Tax on RRTA Compensation ──
  line14: p1("f1_16[0]"), // RRTA compensation
  line15: p1("f1_17[0]"), // Filing status threshold
  line16: p1("f1_18[0]"), // Subtract line 15 from line 14
  line17: p1("f1_19[0]"), // RRTA tax (line 16 × 0.9%)

  // ── Part IV: Total Additional Medicare Tax ──
  line18: p1("f1_20[0]"), // Total: lines 7 + 13 + 17

  // ── Part V: Withholding Reconciliation ──
  line19: p1("f1_21[0]"), // Medicare tax withheld (W-2 Box 6)
  line20: p1("f1_22[0]"), // Amount from line 1
  line21: p1("f1_23[0]"), // Regular Medicare (line 20 × 1.45%)
  line22: p1("f1_24[0]"), // Excess withholding (line 19 - line 21)
  line23: p1("f1_25[0]"), // RRTA additional withholding
  line24: p1("f1_26[0]"), // Total additional withholding (line 22 + line 23)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

const ADDITIONAL_MEDICARE_RATE = new Decimal("0.009");
const REGULAR_MEDICARE_RATE = new Decimal("0.0145");

/**
 * Fill IRS Form 8959 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8959(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const f8959 = result.form8959;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8959) return doc;

  // ── Part I: Additional Medicare Tax on Medicare Wages ──
  setCurrencyField(form, F.line1, f8959.medicareWages);
  setCurrencyField(form, F.line2, f8959.unreportedTips);
  setCurrencyField(form, F.line3, f8959.form8919Wages);

  // Line 4: Sum of lines 1-3 (wages only, not SE)
  const line4 = f8959.medicareWages.plus(f8959.unreportedTips).plus(f8959.form8919Wages);
  setCurrencyField(form, F.line4, line4);

  // Line 5: Filing status threshold
  setCurrencyField(form, F.line5, f8959.threshold);

  // Line 6: Excess wages over threshold
  const line6 = zeroFloor(line4.minus(f8959.threshold));
  setCurrencyField(form, F.line6, line6);

  // Line 7: Additional Medicare Tax on wages
  const line7 = roundDollar(line6.times(ADDITIONAL_MEDICARE_RATE));
  setCurrencyField(form, F.line7, line7);

  // ── Part II: Additional Medicare Tax on Self-Employment Income ──
  setCurrencyField(form, F.line8, f8959.selfEmploymentEarnings);
  setCurrencyField(form, F.line9, f8959.threshold);

  // Line 10: Amount from line 4
  setCurrencyField(form, F.line10, line4);

  // Line 11: Remaining threshold after wages (threshold - wages, zero floor)
  const line11 = zeroFloor(f8959.threshold.minus(line4));
  setCurrencyField(form, F.line11, line11);

  // Line 12: SE income subject to additional tax
  const line12 = zeroFloor(f8959.selfEmploymentEarnings.minus(line11));
  setCurrencyField(form, F.line12, line12);

  // Line 13: Additional Medicare Tax on SE
  const line13 = roundDollar(line12.times(ADDITIONAL_MEDICARE_RATE));
  setCurrencyField(form, F.line13, line13);

  // ── Part III: RRTA (not modeled — leave blank) ──

  // ── Part IV: Total ──
  // Line 18 = Line 7 + Line 13 + Line 17 (RRTA = 0)
  setCurrencyField(form, F.line18, f8959.additionalMedicareTax);

  // ── Part V: Withholding Reconciliation ──
  const totalMedicareWithheld = input.w2s.reduce(
    (acc, w2) => acc.plus(d(w2.medicareWithheld)),
    new Decimal(0),
  );
  setCurrencyField(form, F.line19, totalMedicareWithheld);
  setCurrencyField(form, F.line20, f8959.medicareWages);

  const regularMedicare = roundDollar(f8959.medicareWages.times(REGULAR_MEDICARE_RATE));
  setCurrencyField(form, F.line21, regularMedicare);

  setCurrencyField(form, F.line22, f8959.withholdingCredit);

  // Line 24 = Line 22 + Line 23 (RRTA withholding = 0)
  setCurrencyField(form, F.line24, f8959.withholdingCredit);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8959_FIELDS };

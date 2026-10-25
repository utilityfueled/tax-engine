import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule J (Form 1040) — Income Averaging for Farmers and Fishermen.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule J uses "topmostSubform[0]" as root.
 *
 * Sections:
 *   Header:      Name, SSN
 *   Part I:      Lines 1-3 — Taxable Income From Farming or Fishing
 *   Part II:     Lines 4-16 — Figure Your Tax by Averaging (base year computations)
 *   Part III:    Lines 17-23 — Tax Computation Using Income Averaging
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule J fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),           // Name (as shown on Form 1040)
  ssn: p1("f1_2[0]"),            // Social security number

  // ── Part I: Taxable Income From Farming or Fishing ──
  line1: p1("f1_3[0]"),          // Line 1: Taxable income (Form 1040 Line 15)
  line2a: p1("f1_4[0]"),         // Line 2a: Elected farm income
  line2b: p1("f1_5[0]"),         // Line 2b: Net capital gain from EFI
  line2c: p1("f1_6[0]"),         // Line 2c: Unrecaptured §1250 gain from EFI
  line3: p1("f1_7[0]"),          // Line 3: Non-farm taxable income (Line 1 - Line 2a)

  // ── Part II: Figure Your Tax by Averaging ──
  line4: p1("f1_8[0]"),          // Line 4: Tax on non-farm income (2025 rates)

  // Base Year 1 — 2022
  line5: p1("f1_9[0]"),          // Line 5: 2022 taxable income
  line6: p1("f1_10[0]"),         // Line 6: 1/3 of elected farm income
  line7: p1("f1_11[0]"),         // Line 7: Line 5 + Line 6 (not less than zero)
  line8: p1("f1_12[0]"),         // Line 8: Tax at 2022 rates

  // Base Year 2 — 2023
  line9: p1("f1_13[0]"),         // Line 9: 2023 taxable income
  line10: p1("f1_14[0]"),        // Line 10: 1/3 of elected farm income
  line11: p1("f1_15[0]"),        // Line 11: Line 9 + Line 10
  line12: p1("f1_16[0]"),        // Line 12: Tax at 2023 rates

  // Base Year 3 — 2024
  line13: p1("f1_17[0]"),        // Line 13: 2024 taxable income
  line14: p1("f1_18[0]"),        // Line 14: 1/3 of elected farm income
  line15: p1("f1_19[0]"),        // Line 15: Line 13 + Line 14
  line16: p1("f1_20[0]"),        // Line 16: Tax at 2024 rates

  // ── Part III: Tax Computation Using Income Averaging ──
  line17: p1("f1_21[0]"),        // Line 17: Sum of Lines 4 + 8 + 12 + 16

  // Page 2
  line18: p2("f2_1[0]"),         // Line 18: Amount from Line 17 (carry-over)
  line19: p2("f2_2[0]"),         // Line 19: 2022 original tax from return
  line20: p2("f2_3[0]"),         // Line 20: 2023 original tax from return
  line21: p2("f2_4[0]"),         // Line 21: 2024 original tax from return
  line22: p2("f2_5[0]"),         // Line 22: Sum of Lines 19 + 20 + 21
  line23: p2("f2_6[0]"),         // Line 23: Averaged tax (Line 18 - Line 22)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule J PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleJ(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sj = result.scheduleJ;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!sj) return doc;

  // ── Part I: Taxable Income From Farming or Fishing ──
  setCurrencyField(form, F.line1, sj.line1);
  setCurrencyField(form, F.line2a, sj.line2a);
  setCurrencyField(form, F.line2b, sj.line2b);
  setCurrencyField(form, F.line2c, sj.line2c);
  setCurrencyField(form, F.line3, sj.line3);

  // ── Part II: Figure Your Tax by Averaging ──
  setCurrencyField(form, F.line4, sj.line4);

  // Base Year 1 — 2022
  setCurrencyField(form, F.line5, sj.line5);
  setCurrencyField(form, F.line6, sj.line6);
  setCurrencyField(form, F.line7, sj.line7);
  setCurrencyField(form, F.line8, sj.line8);

  // Base Year 2 — 2023
  setCurrencyField(form, F.line9, sj.line9);
  setCurrencyField(form, F.line10, sj.line10);
  setCurrencyField(form, F.line11, sj.line11);
  setCurrencyField(form, F.line12, sj.line12);

  // Base Year 3 — 2024
  setCurrencyField(form, F.line13, sj.line13);
  setCurrencyField(form, F.line14, sj.line14);
  setCurrencyField(form, F.line15, sj.line15);
  setCurrencyField(form, F.line16, sj.line16);

  // ── Part III: Tax Computation Using Income Averaging ──
  setCurrencyField(form, F.line17, sj.line17);
  setCurrencyField(form, F.line18, sj.line17); // Line 18 = carry-over of Line 17
  setCurrencyField(form, F.line19, sj.line19);
  setCurrencyField(form, F.line20, sj.line20);
  setCurrencyField(form, F.line21, sj.line21);
  setCurrencyField(form, F.line22, sj.line22);
  setCurrencyField(form, F.line23, sj.line23);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_J_FIELDS };

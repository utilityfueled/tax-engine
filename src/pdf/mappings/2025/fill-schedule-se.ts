import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule SE (Form 1040) — Self-Employment Tax.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule SE uses "topmostSubform[0]" as root.
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

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule SE fillable PDF field inspection.
// Schedule SE Short form (Part I) uses Page 1 only.
// Long form (Part II) spills to Page 2.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // c1_1 = Church employee exemption checkbox
  churchExemption: p1("c1_1[0]"),

  // ── Short Schedule SE ──
  // Line 1a: Net farm profit (Schedule F Line 34, plus farm partnerships)
  line1a: p1("f1_3[0]"),
  // Line 1b: Net nonfarm profit (Schedule C Line 31, K-1 SE earnings)
  line1b: p1("f1_4[0]"),
  // Line 2: Combine lines 1a and 1b
  line2: p1("f1_5[0]"),
  // Line 3: Reserved/skip
  line3: p1("f1_6[0]"),
  // Line 4a: If line 3 > zero, multiply by 92.35%
  line4a: p1("f1_7[0]"),
  // Line 4b: If line 4a < $400, skip (no SE tax)
  line4b: p1("f1_8[0]"),
  // Lines in the Short SE path:
  // Line 5a: Social Security wages (from W-2)
  line5a: p1("f1_9[0]"),
  // Line 5b: Unreported tips (Form 4137)
  line5b: p1("Line5a_ReadOrder[0].f1_10[0]"),
  // Line 5c: Wages from Form 8919
  line5c: p1("f1_11[0]"),
  // Line 5d: Add 5a + 5b + 5c
  line5d: p1("f1_12[0]"),
  // Line 6: Subtract 5d from SS wage base
  line6: p1("f1_13[0]"),
  // Line 8a: Net SE earnings
  line8a: p1("Line8a_ReadOrder[0].f1_14[0]"),
  // Line 8b: ...
  line8b: p1("f1_15[0]"),
  // Line 10: SS portion
  line10: p1("f1_16[0]"),
  // Line 11: Medicare portion
  line11: p1("f1_17[0]"),
  // Line 12: Total SE tax (SS + Medicare)
  line12: p1("f1_18[0]"),
  // Line 13: Deductible half of SE tax
  line13: p1("f1_19[0]"),

  // Additional lines on page 1
  line14: p1("f1_20[0]"),
  line15: p1("f1_21[0]"),
  line16: p1("f1_22[0]"),
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule SE PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleSE(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const se = result.scheduleSE;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!se) return doc;

  // ── Lines ──
  setCurrencyField(form, F.line1a, se.netFarmProfit);
  setCurrencyField(form, F.line1b, se.netNonfarmProfit);
  // Line 2 = combine 1a + 1b = netSEEarnings before 92.35% factor
  setCurrencyField(form, F.line2, se.netFarmProfit.plus(se.netNonfarmProfit));
  // Line 4a/4b: taxable earnings (net × 0.9235)
  setCurrencyField(form, F.line4a, se.taxableEarnings);
  setCurrencyField(form, F.line4b, se.taxableEarnings);

  // Line 10: Social Security portion
  setCurrencyField(form, F.line10, se.socialSecurityPortion);
  // Line 11: Medicare portion
  setCurrencyField(form, F.line11, se.medicarePortion);
  // Line 12: Total SE tax
  setCurrencyField(form, F.line12, se.totalSETax);
  // Line 13: Deductible half
  setCurrencyField(form, F.line13, se.deductibleHalf);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_SE_FIELDS };

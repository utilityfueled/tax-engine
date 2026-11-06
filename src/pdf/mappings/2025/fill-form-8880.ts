import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8880 — Credit for Qualified Retirement Savings
 * Contributions (Saver's Credit).
 *
 * Field names verified against 2025 Form 8880 fillable PDF field inspection.
 */

import { PDFDocument, PDFTextField } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const tbl = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Ln1-6[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8880 fillable PDF debug labels.

export const FORM_8880_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Lines 1–6: Table with (a) You and (b) Your spouse columns ──
  line1a: tbl("BodyRow1[0]", "f1_3[0]"),   // Traditional/Roth IRA + ABLE contributions (You)
  line1b: tbl("BodyRow1[0]", "f1_4[0]"),   // Traditional/Roth IRA + ABLE contributions (Spouse)
  line2a: tbl("BodyRow2[0]", "f1_5[0]"),   // Elective deferrals to 401(k), 403(b), etc. (You)
  line2b: tbl("BodyRow2[0]", "f1_6[0]"),   // Elective deferrals (Spouse)
  line3a: tbl("BodyRow3[0]", "f1_7[0]"),   // Add lines 1 and 2 (You)
  line3b: tbl("BodyRow3[0]", "f1_8[0]"),   // Add lines 1 and 2 (Spouse)
  line4a: tbl("BodyRow4[0]", "f1_9[0]"),   // Certain distributions received (You)
  line4b: tbl("BodyRow4[0]", "f1_10[0]"),  // Certain distributions received (Spouse)
  line5a: tbl("BodyRow5[0]", "f1_11[0]"),  // Line 3 minus line 4 (You)
  line5b: tbl("BodyRow5[0]", "f1_12[0]"),  // Line 3 minus line 4 (Spouse)
  line6a: tbl("BodyRow6[0]", "f1_13[0]"),  // Smaller of line 5 or $2,000 (You)
  line6b: tbl("BodyRow6[0]", "f1_14[0]"),  // Smaller of line 5 or $2,000 (Spouse)

  // ── Lines 7–12: Computation ──
  line7: p1("f1_15[0]"),   // Add lines 6a and 6b
  line8: p1("f1_16[0]"),   // AGI (Form 1040, line 11)
  line9: p1("f1_17[0]"),   // Applicable decimal amount from rate table
  line10: p1("f1_18[0]"),  // Multiply line 7 by line 9
  line11: p1("f1_19[0]"),  // Tax liability limitation
  line12: p1("f1_20[0]"),  // Credit (smaller of line 10 or line 11)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8880 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8880(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FORM_8880_FIELDS;
  const f8880 = result.form8880;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8880) return doc;

  // ── Lines 1–6: Contribution table ──
  setCurrencyField(form, F.line1a, f8880.line1a);
  setCurrencyField(form, F.line1b, f8880.line1b);
  setCurrencyField(form, F.line2a, f8880.line2a);
  setCurrencyField(form, F.line2b, f8880.line2b);
  setCurrencyField(form, F.line3a, f8880.line3a);
  setCurrencyField(form, F.line3b, f8880.line3b);
  setCurrencyField(form, F.line4a, f8880.line4a);
  setCurrencyField(form, F.line4b, f8880.line4b);
  setCurrencyField(form, F.line5a, f8880.line5a);
  setCurrencyField(form, F.line5b, f8880.line5b);
  setCurrencyField(form, F.line6a, f8880.line6a);
  setCurrencyField(form, F.line6b, f8880.line6b);

  // ── Lines 7–12: Computation ──
  setCurrencyField(form, F.line7, f8880.line7);
  setCurrencyField(form, F.line8, f8880.line8);

  // Line 9: Credit rate decimal (e.g., ".50", ".20", ".10")
  // The PDF field has maxLength=1 (IRS quirk from XFA conversion),
  // so we clear the constraint before setting the rate string.
  if (!f8880.line9.isZero()) {
    const rateStr = f8880.line9.toFixed(2).replace(/^0/, "");
    try {
      const rateField = form.getField(F.line9);
      if (rateField instanceof PDFTextField) {
        rateField.setMaxLength(undefined);
        rateField.setText(rateStr);
      }
    } catch {
      // Field not found — skip silently.
    }
  }

  setCurrencyField(form, F.line10, f8880.line10);
  setCurrencyField(form, F.line11, f8880.line11);
  setCurrencyField(form, F.line12, f8880.line12);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FORM_8880_FIELDS as FORM_8880_FIELDS_MAP };

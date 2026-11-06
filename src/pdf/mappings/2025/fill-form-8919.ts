import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8919 — Uncollected Social Security and Medicare Tax on Wages.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
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
const row = (r: number, n: string) =>
  `topmostSubform[0].Page1[0].Pg1Table[0].Row${r}[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8919 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Lines 1–5: Employer detail rows ──
  // Each row has: (a) firm name, (b) EIN, (c) reason code, (d) date, (e) checkbox, (f) wages
  rows: [
    {
      firmName: row(1, "f1_3[0]"),
      ein: row(1, "f1_4[0]"),
      reasonCode: row(1, "f1_5[0]"),
      date: row(1, "f1_6[0]"),
      checkbox: row(1, "c1_1[0]"),
      wages: row(1, "f1_7[0]"),
    },
    {
      firmName: row(2, "f1_8[0]"),
      ein: row(2, "f1_9[0]"),
      reasonCode: row(2, "f1_10[0]"),
      date: row(2, "f1_11[0]"),
      checkbox: row(2, "c1_2[0]"),
      wages: row(2, "f1_12[0]"),
    },
    {
      firmName: row(3, "f1_13[0]"),
      ein: row(3, "f1_14[0]"),
      reasonCode: row(3, "f1_15[0]"),
      date: row(3, "f1_16[0]"),
      checkbox: row(3, "c1_3[0]"),
      wages: row(3, "f1_17[0]"),
    },
    {
      firmName: row(4, "f1_18[0]"),
      ein: row(4, "f1_19[0]"),
      reasonCode: row(4, "f1_20[0]"),
      date: row(4, "f1_21[0]"),
      checkbox: row(4, "c1_4[0]"),
      wages: row(4, "f1_22[0]"),
    },
    {
      firmName: row(5, "f1_23[0]"),
      ein: row(5, "f1_24[0]"),
      reasonCode: row(5, "f1_25[0]"),
      date: row(5, "f1_26[0]"),
      checkbox: row(5, "c1_5[0]"),
      wages: row(5, "f1_27[0]"),
    },
  ],

  // ── Summary Lines ──
  line6: p1("f1_28[0]"),   // Total wages (sum of column f)
  // Line 7 is pre-printed ($176,100) — f1_29 is not used
  line8: p1("f1_30[0]"),   // SS wages and tips already reported
  line9: p1("f1_31[0]"),   // Subtract line 8 from line 7
  line10: p1("f1_32[0]"),  // Wages subject to SS tax
  line11: p1("f1_33[0]"),  // SS tax (line 10 × 6.2%)
  line12: p1("f1_34[0]"),  // Medicare tax (line 6 × 1.45%)
  line13: p1("f1_35[0]"),  // Total (line 11 + line 12)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8919 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8919(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const f8919 = result.form8919;

  // ── Header ──
  const name = `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8919) return doc;

  // ── Summary Lines 6–13 ──
  setCurrencyField(form, F.line6, f8919.line6);
  setCurrencyField(form, F.line8, f8919.line8);
  setCurrencyField(form, F.line9, f8919.line9);
  setCurrencyField(form, F.line10, f8919.line10);
  setCurrencyField(form, F.line11, f8919.line11);
  setCurrencyField(form, F.line12, f8919.line12);
  setCurrencyField(form, F.line13, f8919.line13);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8919_FIELDS };

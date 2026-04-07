/**
 * PDF filler for IRS Form 4137 — Social Security and Medicare Tax on Unreported Tip Income.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const tblRow = (r: number, n: string) =>
  `topmostSubform[0].Page1[0].Table_Line1[0].BodyRow${r}[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 4137 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Line 1: Employer detail rows A–E ──
  // Each row has: (a) employer name, (b) EIN, (c) tips received, (d) tips reported
  rows: [
    {
      employerName: tblRow(1, "f1_3[0]"),
      ein: tblRow(1, "f1_4[0]"),
      tipsReceived: tblRow(1, "f1_5[0]"),
      tipsReported: tblRow(1, "f1_6[0]"),
    },
    {
      employerName: tblRow(2, "f1_7[0]"),
      ein: tblRow(2, "f1_8[0]"),
      tipsReceived: tblRow(2, "f1_9[0]"),
      tipsReported: tblRow(2, "f1_10[0]"),
    },
    {
      employerName: tblRow(3, "f1_11[0]"),
      ein: tblRow(3, "f1_12[0]"),
      tipsReceived: tblRow(3, "f1_13[0]"),
      tipsReported: tblRow(3, "f1_14[0]"),
    },
    {
      employerName: tblRow(4, "f1_15[0]"),
      ein: tblRow(4, "f1_16[0]"),
      tipsReceived: tblRow(4, "f1_17[0]"),
      tipsReported: tblRow(4, "f1_18[0]"),
    },
    {
      employerName: tblRow(5, "f1_19[0]"),
      ein: tblRow(5, "f1_20[0]"),
      tipsReceived: tblRow(5, "f1_21[0]"),
      tipsReported: tblRow(5, "f1_22[0]"),
    },
  ],

  // ── Summary Lines ──
  line2: p1("f1_23[0]"),   // Total tips received (sum of column c)
  line3: p1("f1_24[0]"),   // Total tips reported (sum of column d)
  line4: p1("f1_25[0]"),   // Unreported tips (line 2 - line 3) → Form 1040 line 1c
  line5: p1("f1_26[0]"),   // Tips under $20/month (not subject to FICA)
  line6: p1("f1_27[0]"),   // Unreported tips subject to Medicare (line 4 - line 5)
  // Line 7 is pre-printed ($176,100) — f1_28 is not used
  line8: p1("f1_29[0]"),   // SS wages and tips already reported
  line9: p1("f1_30[0]"),   // Subtract line 8 from line 7
  line10: p1("f1_31[0]"),  // Tips subject to SS tax
  line11: p1("f1_32[0]"),  // SS tax (line 10 × 6.2%)
  line12: p1("f1_33[0]"),  // Medicare tax (line 6 × 1.45%)
  line13: p1("f1_34[0]"),  // Total (line 11 + line 12)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 4137 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm4137(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const f4137 = result.form4137;

  // ── Header ──
  const name = `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f4137) return doc;

  // ── Line 6: Unreported tips subject to Medicare tax ──
  // The engine provides line6 directly (unreported tip income).
  // Lines 2–5 are detail breakdown not tracked by the engine's summary slice.
  setCurrencyField(form, F.line6, f4137.line6);

  // ── Summary Lines 8–13 ──
  setCurrencyField(form, F.line8, f4137.line8);
  setCurrencyField(form, F.line9, f4137.line9);
  setCurrencyField(form, F.line10, f4137.line10);
  setCurrencyField(form, F.line11, f4137.line11);
  setCurrencyField(form, F.line12, f4137.line12);
  setCurrencyField(form, F.line13, f4137.line13);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_4137_FIELDS };

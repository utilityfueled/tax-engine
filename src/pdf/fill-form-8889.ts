/**
 * PDF filler for IRS Form 8889 — Health Savings Accounts (HSAs).
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/f8889.pdf', 'forms/filled/f8889-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8889Result } from "@/engine/forms/form-8889.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8889 fillable PDF field inspection.

export const FORM_8889_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Line 1: Coverage type (checkboxes) ──
  selfOnly: p1("c1_1[0]"),
  family: p1("c1_1[1]"),

  // ── Part I: HSA Contributions and Deduction ──
  line2: p1("f1_3[0]"),   // HSA contributions you made for the tax year
  line3: p1("f1_4[0]"),   // Employer contributions (including cafeteria plan)
  line4: p1("f1_5[0]"),   // Qualified HSA funding distribution from IRA
  line5: p1("f1_6[0]"),   // Subtract line 3 and line 4 from line 2
  line6: p1("f1_7[0]"),   // HSA deduction limitation
  line7: p1("f1_8[0]"),   // Additional contribution (age 55+)
  line8: p1("f1_9[0]"),   // Add lines 6 and 7
  line9: p1("f1_10[0]"),  // Employer contributions from line 3
  line10: p1("f1_11[0]"), // Qualified HSA funding distribution from line 4
  line11: p1("f1_12[0]"), // Subtract lines 9+10 from line 8
  line12: p1("f1_13[0]"), // Smaller of line 5 or line 11
  line13: p1("f1_14[0]"), // HSA deduction (smaller of line 2 or line 12)

  // ── Part II: HSA Distributions ──
  line14a: p1("f1_15[0]"), // Total distributions received
  line14b: p1("f1_16[0]"), // Rollovers and excess contributions returned
  line14c: p1("f1_17[0]"), // Subtract line 14b from line 14a
  line15: p1("f1_18[0]"),  // Qualified medical expenses paid
  line16: p1("f1_19[0]"),  // Taxable HSA distributions (line 14c - line 15)
  line17a: p1("c1_2[0]"),  // Exception checkbox (disability, death, etc.)
  line17b: p1("f1_20[0]"), // Additional 20% tax on line 16

  // ── Part III: Income and Additional Tax for Failure to Maintain HDHP ──
  line18: p1("f1_21[0]"), // Last-month-rule income inclusion
  line19: p1("f1_22[0]"), // Testing period qualified HSA funding distribution
  line20: p1("f1_23[0]"), // Income included (line 18 + line 19)
  line21: p1("f1_24[0]"), // Additional 10% tax on line 20
};

const F = FORM_8889_FIELDS;

/**
 * Fill Form 8889 PDF from engine results.
 * Returns the filled PDFDocument (caller saves it).
 *
 * @param ownerKey - "primary" or "spouse" — determines which name/SSN go in the header.
 *   For single/HoH filers, always "primary". For MFJ with two HSAs, call once per owner.
 */
export async function fillForm8889(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
  ownerKey: "primary" | "spouse" = "primary",
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();

  // Resolve the correct Form 8889 result for this owner
  const f8889: Form8889Result | undefined =
    result.form8889ByOwner?.[ownerKey] ?? (ownerKey === "primary" ? result.form8889 : undefined);

  if (!f8889) return doc;

  // ── Header ──
  const person = ownerKey === "spouse" ? input.taxpayer.spouse : input.taxpayer.primary;
  if (person) {
    setTextField(form, F.name, `${person.firstName} ${person.lastName}`);
    setTextField(form, F.ssn, person.ssn.replace(/-/g, ""));
  }

  // ── Line 1: Coverage type ──
  if (f8889.coverageType === "self_only") {
    setCheckBox(form, F.selfOnly, true);
  } else if (f8889.coverageType === "family") {
    setCheckBox(form, F.family, true);
  }

  // ── Part I: HSA Contributions and Deduction (Lines 2–13) ──
  setCurrencyField(form, F.line2, f8889.line2);
  setCurrencyField(form, F.line3, f8889.line3);
  setCurrencyField(form, F.line4, f8889.line4);
  setCurrencyField(form, F.line5, f8889.line5);
  setCurrencyField(form, F.line6, f8889.line6);
  setCurrencyField(form, F.line7, f8889.line7);
  setCurrencyField(form, F.line8, f8889.line8);
  setCurrencyField(form, F.line9, f8889.line9);
  setCurrencyField(form, F.line10, f8889.line10);
  setCurrencyField(form, F.line11, f8889.line11);
  setCurrencyField(form, F.line12, f8889.line12);
  setCurrencyField(form, F.line13, f8889.line13);

  // ── Part II: HSA Distributions (Lines 14a–17b) ──
  setCurrencyField(form, F.line14a, f8889.line14a);
  setCurrencyField(form, F.line14b, f8889.line14b);
  setCurrencyField(form, F.line14c, f8889.line14c);
  setCurrencyField(form, F.line15, f8889.line15);
  setCurrencyField(form, F.line16, f8889.line16);
  setCheckBox(form, F.line17a, f8889.line17aHasException);
  setCurrencyField(form, F.line17b, f8889.line17b);

  // ── Part III: Failure to Maintain HDHP (Lines 18–21) ──
  setCurrencyField(form, F.line18, f8889.line18);
  setCurrencyField(form, F.line19, f8889.line19);
  setCurrencyField(form, F.line20, f8889.line20);
  setCurrencyField(form, F.line21, f8889.line21);

  return doc;
}

/**
 * PDF filler for IRS Form 8606 — Nondeductible IRAs.
 *
 * Field names are from the official 2025 IRS fillable PDF.
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * For MFJ filers, each spouse files a separate Form 8606 if they have
 * IRA activity. Use the ownerKey parameter to select primary vs. spouse.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8606Result } from "@/engine/forms/form-8606.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8606 fillable PDF field inspection.

export const FORM_8606_FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Nondeductible Contributions and Distributions ──
  line1: p1("f1_09[0]"),   // Nondeductible contributions for the year
  line2: p1("f1_10[0]"),   // Total basis in traditional IRAs (prior year)
  line3: p1("f1_11[0]"),   // Add lines 1 and 2
  line4: p1("f1_12[0]"),   // Contributions made Jan 1 – Apr 15 of next year
  line5: p1("f1_13[0]"),   // Subtract line 4 from line 3
  line6: p1("f1_14[0]"),   // Year-end value of all traditional IRAs + rollovers
  line7: p1("f1_15[0]"),   // Distributions from traditional IRAs
  line8: p1("f1_16[0]"),   // Net amount converted to Roth IRAs
  line9: p1("f1_17[0]"),   // Add lines 6, 7, and 8
  line10int: p1("f1_18[0]"), // Line 10 integer part (0 or 1)
  line10dec: p1("f1_19[0]"), // Line 10 decimal digits (3 places)
  line11: p1("f1_20[0]"),  // Line 8 × Line 10 (nontaxable conversions)
  line12: p1("f1_21[0]"),  // Line 7 × Line 10 (nontaxable distributions)
  line13: p1("f1_22[0]"),  // Add lines 11 and 12
  line14: p1("f1_23[0]"),  // Subtract line 13 from line 3 (basis for next year)

  // ── Part I continued (page 2) ──
  line15a: p2("f2_01[0]"), // Subtract line 12 from line 7
  line15b: p2("f2_02[0]"), // Qualified disaster distributions
  line15c: p2("f2_03[0]"), // Taxable amount

  // ── Part II: Conversions to Roth IRAs ──
  line16: p2("f2_04[0]"),  // Net conversion amount (= line 8)
  line17: p2("f2_05[0]"),  // Basis in conversion (= line 11)
  line18: p2("f2_06[0]"),  // Taxable conversion (line 16 - line 17)

  // ── Part III: Distributions From Roth IRAs ──
  line19: p2("f2_07[0]"),  // Total nonqualified Roth distributions
  line20: p2("f2_08[0]"),  // Qualified first-time homebuyer expenses
  line21: p2("f2_09[0]"),  // Subtract line 20 from line 19
  line22: p2("f2_10[0]"),  // Roth IRA contribution basis
  line23: p2("f2_11[0]"),  // Subtract line 22 from line 21
  line24: p2("f2_12[0]"),  // Conversion/rollover basis
  line25a: p2("f2_13[0]"), // Subtract line 24 from line 23
  line25b: p2("f2_14[0]"), // Qualified disaster distributions
  line25c: p2("f2_15[0]"), // Taxable amount
} as const;

const F = FORM_8606_FIELDS;

/**
 * Format Line 10 ratio as integer and decimal parts for the split-field IRS format.
 * Line 10 = line5 / line9, displayed as "0.xxx" or "1.000".
 */
function formatLine10(value: Decimal): { intPart: string; decPart: string } {
  if (value.isZero()) return { intPart: "", decPart: "" };
  // Clamp to [0, 1]
  const clamped = Decimal.min(value, new Decimal("1"));
  const rounded = clamped.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const intPart = rounded.truncated().toFixed(0);
  // Extract 3 decimal digits
  const decPart = rounded
    .minus(rounded.truncated())
    .times(1000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(0)
    .padStart(3, "0");
  return { intPart, decPart };
}

/**
 * Fill Form 8606 PDF from engine results.
 * Returns the filled PDFDocument (caller saves it).
 *
 * @param ownerKey - "primary" or "spouse" — determines which name/SSN go in the header.
 *   For single/HoH filers, always "primary". For MFJ with two Form 8606s, call once per owner.
 */
export async function fillForm8606(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
  ownerKey: "primary" | "spouse" = "primary",
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();

  // Resolve the correct Form 8606 result for this owner
  const f8606: Form8606Result | undefined =
    result.form8606ByOwner?.[ownerKey] ?? (ownerKey === "primary" ? result.form8606 : undefined);

  if (!f8606) return doc;

  // ── Header ──
  const person = ownerKey === "spouse" ? input.taxpayer.spouse : input.taxpayer.primary;
  if (person) {
    setTextField(form, F.name, `${person.firstName} ${person.lastName}`);
    setTextField(form, F.ssn, person.ssn.replace(/-/g, ""));
  }

  // ── Part I: Nondeductible Contributions and Distributions (Lines 1–14) ──
  setCurrencyField(form, F.line1, f8606.line1);
  setCurrencyField(form, F.line2, f8606.line2);
  setCurrencyField(form, F.line3, f8606.line3);
  setCurrencyField(form, F.line4, f8606.line4);
  setCurrencyField(form, F.line5, f8606.line5);
  setCurrencyField(form, F.line6, f8606.line6);
  setCurrencyField(form, F.line7, f8606.line7);
  setCurrencyField(form, F.line8, f8606.line8);
  setCurrencyField(form, F.line9, f8606.line9);

  // Line 10: ratio displayed as split integer.decimal fields
  const { intPart, decPart } = formatLine10(f8606.line10);
  setTextField(form, F.line10int, intPart);
  setTextField(form, F.line10dec, decPart);

  setCurrencyField(form, F.line11, f8606.line11);
  setCurrencyField(form, F.line12, f8606.line12);
  setCurrencyField(form, F.line13, f8606.line13);
  setCurrencyField(form, F.line14, f8606.line14);

  // ── Part I continued: Lines 15a–15c (page 2) ──
  setCurrencyField(form, F.line15a, f8606.line15a);
  setCurrencyField(form, F.line15b, f8606.line15b);
  setCurrencyField(form, F.line15c, f8606.line15c);

  // ── Part II: Conversions to Roth IRAs (Lines 16–18) ──
  setCurrencyField(form, F.line16, f8606.line16);
  setCurrencyField(form, F.line17, f8606.line17);
  setCurrencyField(form, F.line18, f8606.line18);

  // ── Part III: Distributions From Roth IRAs (Lines 19–25c) ──
  setCurrencyField(form, F.line19, f8606.line19);
  setCurrencyField(form, F.line20, f8606.line20);
  setCurrencyField(form, F.line21, f8606.line21);
  setCurrencyField(form, F.line22, f8606.line22);
  setCurrencyField(form, F.line23, f8606.line23);
  setCurrencyField(form, F.line24, f8606.line24);
  setCurrencyField(form, F.line25a, f8606.line25a);
  setCurrencyField(form, F.line25b, f8606.line25b);
  setCurrencyField(form, F.line25c, f8606.line25c);

  return doc;
}

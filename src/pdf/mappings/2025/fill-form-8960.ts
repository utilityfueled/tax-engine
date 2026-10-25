import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8960 — Net Investment Income Tax.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
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
// Verified against 2025 Form 8960 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Checkboxes (elections — not commonly used) ──
  section6013g: p1("PartI[0].c1_1[0]"),
  section6013h: p1("PartI[0].c1_2[0]"),
  reg1411_10g: p1("PartI[0].c1_3[0]"),

  // ── Part I: Investment Income ──
  line1: p1("f1_3[0]"),   // Taxable interest
  line2: p1("f1_4[0]"),   // Ordinary dividends
  line3: p1("f1_5[0]"),   // Annuities
  line4a: p1("f1_6[0]"),  // Rental, royalty, partnership, S corp
  line4b: p1("f1_7[0]"),  // Adjustment for nonsection 1411 trade/business
  line4c: p1("f1_8[0]"),  // Combine 4a and 4b
  line5a: p1("f1_9[0]"),  // Net gain from disposition of property
  line5b: p1("f1_10[0]"), // Net gain not subject to NIIT
  line5c: p1("f1_11[0]"), // Adjustment from partnership/S corp
  line5d: p1("f1_12[0]"), // Combine 5a through 5c
  line6: p1("f1_13[0]"),  // Adjustments for CFCs/PFICs
  line7: p1("f1_14[0]"),  // Other modifications
  line8: p1("f1_15[0]"),  // Total investment income

  // ── Part II: Investment Expenses ──
  line9a: p1("f1_16[0]"), // Investment interest expense
  line9b: p1("f1_17[0]"), // State/local/foreign income tax
  line9c: p1("f1_18[0]"), // Miscellaneous investment expenses
  line9d: p1("f1_19[0]"), // Sum of 9a-9c
  line10: p1("f1_20[0]"), // Additional modifications
  line11: p1("f1_21[0]"), // Total deductions

  // ── Part III: Tax Computation (Individuals) ──
  line12: p1("f1_22[0]"), // Net investment income (line 8 - line 11)
  line13: p1("f1_23[0]"), // MAGI
  line14: p1("f1_24[0]"), // Filing status threshold
  line15: p1("f1_25[0]"), // MAGI excess (line 13 - line 14)
  line16: p1("f1_26[0]"), // Lesser of line 12 or line 15
  line17: p1("f1_27[0]"), // NIIT (line 16 × 3.8%)
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8960 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8960(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const f8960 = result.form8960;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8960) return doc;

  // ── Part I: Investment Income ──
  setCurrencyField(form, F.line1, f8960.taxableInterest);
  setCurrencyField(form, F.line2, f8960.dividends);

  // Line 5a: Net capital gain (from Schedule D, zero-floored)
  setCurrencyField(form, F.line5a, f8960.netCapitalGain);
  // Line 5d: Same as 5a when 5b and 5c are zero
  setCurrencyField(form, F.line5d, f8960.netCapitalGain);

  // Line 8: Total investment income
  setCurrencyField(form, F.line8, f8960.netInvestmentIncome);

  // ── Part II: Investment Expenses ──
  // Engine doesn't expose individual expense lines; expenses are netted into NII.
  // Leave Part II blank (expenses already reflected in netInvestmentIncome).

  // ── Part III: Tax Computation ──
  // Line 12: Net investment income
  setCurrencyField(form, F.line12, f8960.netInvestmentIncome);

  // Line 13: MAGI — reconstruct from threshold + excess, or use AGI as proxy
  // The engine stores magiExcess = MAGI - threshold, so MAGI = threshold + magiExcess
  const magi = f8960.threshold.plus(f8960.magiExcess);
  setCurrencyField(form, F.line13, magi);

  // Line 14: Threshold
  setCurrencyField(form, F.line14, f8960.threshold);

  // Line 15: MAGI excess
  setCurrencyField(form, F.line15, f8960.magiExcess);

  // Line 16: Taxable base (lesser of NII or MAGI excess)
  setCurrencyField(form, F.line16, f8960.taxableBase);

  // Line 17: NIIT (3.8%)
  setCurrencyField(form, F.line17, f8960.niitTax);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8960_FIELDS };

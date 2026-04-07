/**
 * PDF filler for IRS Form 6251 — Alternative Minimum Tax (Individuals).
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Page 1: "topmostSubform[0].Page1[0]" (Part I + Part II)
 * Page 2: "topmostSubform[0].Page2[0]" (Part III — capital gains rates)
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 6251 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Alternative Minimum Taxable Income ──
  line1a: p1("f1_3[0]"),  // Schedule 1-A adjustment
  line1b: p1("f1_4[0]"),  // Taxable income (1040 Line 11b minus Line 1a)
  line2a: p1("f1_5[0]"),  // SALT from Schedule A, line 7 (or standard deduction amount)
  line2b: p1("f1_6[0]"),  // Tax refund from Schedule 1 (parentheses)
  line2c: p1("f1_7[0]"),  // Investment interest expense (reg vs AMT difference)
  line2d: p1("f1_8[0]"),  // Depletion (difference between reg and AMT)
  line2e: p1("f1_9[0]"),  // NOL deduction from Schedule 1, line 8a
  line2f: p1("f1_10[0]"), // Alternative tax NOL deduction (parentheses)
  line2g: p1("f1_11[0]"), // Private activity bond interest
  line2h: p1("f1_12[0]"), // Qualified small business stock
  line2i: p1("f1_13[0]"), // Incentive stock options (excess AMT over reg)
  line2j: p1("f1_14[0]"), // Estates and trusts (K-1 Form 1041, box 12, code A)
  line2k: p1("f1_15[0]"), // Disposition of property (AMT vs reg gain/loss diff)
  line2l: p1("f1_16[0]"), // Depreciation on post-1986 assets (reg vs AMT diff)
  line2m: p1("f1_17[0]"), // Passive activities (AMT vs reg difference)
  line2n: p1("f1_18[0]"), // Loss limitations (AMT vs reg difference)
  line2o: p1("f1_19[0]"), // Circulation costs
  line2p: p1("f1_20[0]"), // Long-term contracts
  line2q: p1("f1_21[0]"), // Mining costs
  line2r: p1("f1_22[0]"), // Research and experimental costs
  line2s: p1("f1_23[0]"), // Installment sales before 1/1/1987 (parentheses)
  line2t: p1("f1_24[0]"), // Intangible drilling costs preference
  line3:  p1("f1_25[0]"), // Other adjustments
  line4:  p1("f1_26[0]"), // AMTI (combine lines 1b through 3)

  // ── Part II: Alternative Minimum Tax ──
  line5:  p1("f1_27[0]"), // Exemption amount
  line6:  p1("f1_28[0]"), // AMTI minus exemption (AMT base)
  line7:  p1("f1_29[0]"), // Tax computation (26%/28% or Part III)
  line8:  p1("f1_30[0]"), // AMT foreign tax credit
  line9:  p1("f1_31[0]"), // Tentative minimum tax (Line 7 - Line 8)
  line10: p1("f1_32[0]"), // Regular tax (1040 Line 16 + Sched 2 Line 1z - Sched 3 Line 1)
  line11: p1("f1_33[0]"), // AMT = max(0, Line 9 - Line 10) → Schedule 2 Line 2

  // ── Part III: Tax Computation Using Maximum Capital Gains Rates ──
  line12: p2("f2_1[0]"),  // Amount from Line 6
  line13: p2("f2_2[0]"),  // QDCG worksheet line 4 or Sched D worksheet line 13
  line14: p2("f2_3[0]"),  // Sched D line 19 (unrecaptured section 1250 gain)
  line15: p2("f2_4[0]"),  // Min of (line 13 + line 14) or Sched D worksheet line 10
  line16: p2("f2_5[0]"),  // Smaller of line 12 or line 15
  line17: p2("f2_6[0]"),  // Line 12 minus line 16 (ordinary portion)
  line18: p2("f2_7[0]"),  // 26%/28% tax on line 17
  line19: p2("f2_8[0]"),  // 0% threshold
  line20: p2("f2_9[0]"),  // Regular-tax ordinary income
  line21: p2("f2_10[0]"), // Line 19 minus line 20 (zero floor)
  line22: p2("f2_11[0]"), // Smaller of line 12 or line 13
  line23: p2("f2_12[0]"), // Smaller of line 21 or line 22 (taxed at 0%)
  line24: p2("f2_13[0]"), // Line 22 minus line 23
  line25: p2("f2_14[0]"), // 15% threshold
  line26: p2("f2_15[0]"), // Amount from line 21
  line27: p2("f2_16[0]"), // QDCG worksheet line 5 or Sched D worksheet line 21
  line28: p2("f2_17[0]"), // Line 26 + line 27
  line29: p2("f2_18[0]"), // Line 25 minus line 28 (zero floor)
  line30: p2("f2_19[0]"), // Smaller of line 24 or line 29
  line31: p2("f2_20[0]"), // Line 30 × 15%
  line32: p2("f2_21[0]"), // Line 23 + line 30
  line33: p2("f2_22[0]"), // Line 22 minus line 32
  line34: p2("f2_23[0]"), // Line 33 × 20%
  line35: p2("f2_24[0]"), // Lines 17 + 32 + 33
  line36: p2("f2_25[0]"), // Line 12 minus line 35
  line37: p2("f2_26[0]"), // Line 36 × 25%
  line38: p2("f2_27[0]"), // Lines 18 + 31 + 34 + 37
  line39: p2("f2_28[0]"), // 26%/28% tax on line 12
  line40: p2("f2_29[0]"), // Smaller of line 38 or line 39 → Line 7
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 6251 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm6251(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const f6251 = result.form6251;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f6251) return doc;

  // ── Part I: Alternative Minimum Taxable Income ──
  // Line 1b: Taxable income (engine treats this as the starting point)
  setCurrencyField(form, F.line1b, f6251.taxableIncome);

  // Line 2a: SALT add-back (taxes from Schedule A when itemizing)
  setCurrencyField(form, F.line2a, f6251.saltAddBack);

  // Line 2d: Depletion adjustment
  setCurrencyField(form, F.line2d, f6251.depletionAdjustment);

  // Line 2k: Disposition of property (AMT vs regular gain/loss difference)
  setCurrencyField(form, F.line2k, f6251.dispositionAdjustment);

  // Line 2l: Depreciation on post-1986 assets
  setCurrencyField(form, F.line2l, f6251.depreciationAdjustment);

  // Line 3: Other adjustments
  setCurrencyField(form, F.line3, f6251.otherAdjustments);

  // Line 4: AMTI (sum of lines 1b through 3)
  setCurrencyField(form, F.line4, f6251.amti);

  // ── Part II: Alternative Minimum Tax ──
  // Line 5: Exemption amount (with phase-out applied)
  setCurrencyField(form, F.line5, f6251.exemption);

  // Line 6: AMTI minus exemption (AMT base)
  setCurrencyField(form, F.line6, f6251.amtBase);

  // Line 7: Tax computation (26%/28% rates or Part III capital gains path)
  // The engine's tentativeMinimumTax is the computed tax before AMT FTC.
  setCurrencyField(form, F.line7, f6251.tentativeMinimumTax);

  // Line 8: AMT foreign tax credit (not modeled — leave blank)

  // Line 9: Tentative minimum tax = Line 7 - Line 8
  // With no AMT FTC, Line 9 equals Line 7.
  setCurrencyField(form, F.line9, f6251.tentativeMinimumTax);

  // Line 10: Regular tax for comparison
  // Derived from engine: regularTax = tentativeMinimumTax - amt (when amt > 0)
  // When amt = 0, regular tax >= tentative min tax; use totalTaxBeforeCredits.
  const regularTax = f6251.amt.gt(0)
    ? f6251.tentativeMinimumTax.minus(f6251.amt)
    : result.totalTaxBeforeCredits;
  setCurrencyField(form, F.line10, regularTax);

  // Line 11: AMT = max(0, Line 9 - Line 10) → Schedule 2 Line 2
  setCurrencyField(form, F.line11, f6251.amt);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_6251_FIELDS };

import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8960 — Net Investment Income Tax.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
 */

import { PDFDocument } from "pdf-lib";
import type Decimal from "decimal.js";
import { min, sum, zeroFloor } from "@/utils/decimal.js";
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

  const retained: Record<string, Decimal> = {
    "1": f8960.taxableInterest, "2": f8960.dividends, "5a": f8960.netCapitalGain,
    "8": f8960.grossInvestmentIncome, "9d": f8960.investmentExpenses,
    "10": f8960.additionalModifications, "12": f8960.netInvestmentIncome,
    "13": f8960.magi, "14": f8960.threshold, "15": f8960.magiExcess,
    "16": f8960.taxableBase, "17": f8960.niitTax,
  };
  const amounts = new Map<string, Decimal>();
  for (const [key, field] of Object.entries(F)) {
    if (!key.startsWith("line")) continue;
    const lineId = key.slice(4);
    const matches = f8960.lines.filter(line => line.form === "Form 8960" && line.line === lineId);
    // Historical aggregate expenses do not establish a component allocation.
    if (matches.length === 0 && ["9a", "9b", "9c"].includes(lineId)) continue;
    if (matches.length !== 1 || !matches[0].value.isFinite()
      || (retained[lineId] !== undefined && !retained[lineId].eq(matches[0].value))) {
      throw new Error(`Form8960 line${lineId} requires a unique reconciled audit`);
    }
    amounts.set(lineId, matches[0].value);
    setCurrencyField(form, field, matches[0].value);
  }

  const value = (id: string): Decimal => {
    const amount = amounts.get(id);
    if (!amount) throw new Error(`Form8960 line${id} is missing from the reconciled audit`);
    return amount;
  };
  const reconciles = (id: string, expected: Decimal) => {
    if (!value(id).eq(expected)) throw new Error(`Form8960 line${id} audit equation does not reconcile`);
  };
  reconciles("4c", value("4a").plus(value("4b")));
  reconciles("5d", sum(value("5a"), value("5b"), value("5c")));
  reconciles("8", sum(...["1", "2", "3", "4c", "5d", "6", "7"].map(value)));
  const componentCount = ["9a", "9b", "9c"].filter(id => amounts.has(id)).length;
  if (componentCount !== 0 && componentCount !== 3) throw new Error("Form8960 expense components must reconcile as a complete group");
  if (componentCount === 3) reconciles("9d", sum(value("9a"), value("9b"), value("9c")));
  reconciles("11", value("9d").plus(value("10")));
  reconciles("12", zeroFloor(value("8").minus(value("11"))));
  reconciles("15", zeroFloor(value("13").minus(value("14"))));
  reconciles("16", min(value("12"), value("15")));
  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_8960_FIELDS };

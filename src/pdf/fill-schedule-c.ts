/**
 * PDF filler for IRS Schedule C (Form 1040) — Profit or Loss From Business.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule C uses "topmostSubform[0]" as root.
 *
 * Sections:
 *   Header:       Name, SSN, business info, accounting method
 *   Part I:       Lines 1-7 — Income
 *   Part II:      Lines 8-27 — Expenses
 *   Lines 28-32:  Net profit/loss
 *   Part III:     Cost of Goods Sold (Page 2)
 *   Part V:       Other Expenses (Page 2)
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1Exp8 = (n: string) => `topmostSubform[0].Page1[0].Lines8-17[0].${n}`;
const p1Exp18 = (n: string) => `topmostSubform[0].Page1[0].Lines18-27[0].${n}`;
const p1L30 = (n: string) => `topmostSubform[0].Page1[0].Line30_ReadOrder[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule C fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),                      // Name of proprietor
  ssn: p1("f1_2[0]"),                       // Social security number
  businessOrProfession: p1("f1_3[0]"),      // A: Principal business or profession
  businessCode: p1("BComb[0].f1_4[0]"),     // B: Business code (NAICS)
  businessName: p1("f1_5[0]"),              // C: Business name
  ein: p1("DComb[0].f1_6[0]"),             // D: Employer ID number
  businessAddress: p1("f1_7[0]"),           // E: Business address
  businessCityStateZip: p1("f1_8[0]"),      // City, state, ZIP code

  // ── Accounting Method ──
  cashMethod: p1("c1_1[0]"),                // F: Cash
  accrualMethod: p1("c1_1[1]"),             // F: Accrual
  otherMethod: p1("c1_1[2]"),               // F: Other

  // ── Material Participation ──
  materialParticipationYes: p1("c1_2[0]"),  // G: Yes
  materialParticipationNo: p1("c1_2[1]"),   // G: No

  // ── Part I: Income ──
  line1: p1("f1_10[0]"),   // Line 1: Gross receipts or sales
  line2: p1("f1_11[0]"),   // Line 2: Returns and allowances
  line3: p1("f1_12[0]"),   // Line 3: Line 1 minus Line 2
  line4: p1("f1_13[0]"),   // Line 4: Cost of goods sold (from Part III, line 42)
  line5: p1("f1_14[0]"),   // Line 5: Gross profit (line 3 - line 4)
  line6: p1("f1_15[0]"),   // Line 6: Other income
  line7: p1("f1_16[0]"),   // Line 7: Gross income (line 5 + line 6)

  // ── Part II: Expenses (Lines 8-17) ──
  line8: p1Exp8("f1_17[0]"),   // Line 8: Advertising
  line9: p1Exp8("f1_18[0]"),   // Line 9: Car and truck expenses
  line10: p1Exp8("f1_19[0]"),  // Line 10: Commissions and fees
  line11: p1Exp8("f1_20[0]"),  // Line 11: Contract labor
  line12: p1Exp8("f1_21[0]"),  // Line 12: Depletion
  line13: p1Exp8("f1_22[0]"),  // Line 13: Depreciation and section 179
  line14: p1Exp8("f1_23[0]"),  // Line 14: Employee benefit programs
  line15: p1Exp8("f1_24[0]"),  // Line 15: Insurance (other than health)
  line16a: p1Exp8("f1_25[0]"), // Line 16a: Interest (mortgage)
  line16b: p1Exp8("f1_26[0]"), // Line 16b: Interest (other)
  line17: p1Exp8("f1_27[0]"),  // Line 17: Legal and professional services

  // ── Part II: Expenses (Lines 18-27) ──
  line18: p1Exp18("f1_28[0]"),  // Line 18: Office expense
  line19: p1Exp18("f1_29[0]"),  // Line 19: Pension and profit-sharing plans
  line20a: p1Exp18("f1_30[0]"), // Line 20a: Rent (vehicles, machinery, equipment)
  line20b: p1Exp18("f1_31[0]"), // Line 20b: Rent (other business property)
  line21: p1Exp18("f1_32[0]"),  // Line 21: Repairs and maintenance
  line22: p1Exp18("f1_33[0]"),  // Line 22: Supplies
  line23: p1Exp18("f1_34[0]"),  // Line 23: Taxes and licenses
  line24a: p1Exp18("f1_35[0]"), // Line 24a: Travel
  line24b: p1Exp18("f1_36[0]"), // Line 24b: Deductible meals
  line25: p1Exp18("f1_37[0]"),  // Line 25: Utilities
  line26: p1Exp18("f1_38[0]"),  // Line 26: Wages
  line27Desc: p1Exp18("f1_40[0]"), // Line 27a: Other expenses description
  line27: p1Exp18("f1_39[0]"),  // Line 27b: Other expenses amount

  // ── Net Profit / Loss ──
  line28: p1("f1_41[0]"),      // Line 28: Total expenses
  line29: p1("f1_42[0]"),      // Line 29: Tentative profit (line 7 - line 28)
  line30: p1L30("f1_44[0]"),   // Line 30: Home office deduction
  line31: p1("f1_45[0]"),      // Line 31: Net profit or (loss)

  // ── Line 32 checkboxes ──
  allInvestmentAtRisk: p1("c1_7[0]"),       // Line 32a: All investment at risk
  someInvestmentNotAtRisk: p1("c1_7[1]"),   // Line 32b: Some investment not at risk
} as const;

// ─── Expense key → field mapping ────────────────────────────────────────────
// Maps engine expenseBreakdown keys to PDF field names.

const EXPENSE_FIELD_MAP: Record<string, string> = {
  "Advertising": FIELDS.line8,
  "Car and truck": FIELDS.line9,
  "Contract labor": FIELDS.line11,
  "Depreciation and section 179": FIELDS.line13,
  "Insurance": FIELDS.line15,
  "Legal and professional": FIELDS.line17,
  "Office expense": FIELDS.line18,
  "Supplies": FIELDS.line22,
  "Travel": FIELDS.line24a,
  "Meals (50%)": FIELDS.line24b,
  "Utilities": FIELDS.line25,
  "Other expenses": FIELDS.line27,
};

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule C PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleC(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const sc = result.scheduleC;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Business info from input ──
  const scInput = input.scheduleC;
  if (scInput) {
    setTextField(form, F.businessOrProfession, scInput.businessName ?? "");
    setTextField(form, F.businessCode, scInput.businessCode ?? "");
    setTextField(form, F.businessName, scInput.businessName ?? "");
    setTextField(form, F.ein, (scInput.ein ?? "").replace(/-/g, ""));

    // Accounting method
    const method = scInput.accountingMethod ?? "cash";
    setCheckBox(form, F.cashMethod, method === "cash");
    setCheckBox(form, F.accrualMethod, method === "accrual");
  } else {
    // Default to cash method when no explicit Schedule C input
    setCheckBox(form, F.cashMethod, true);
  }

  // Default: material participation = Yes (most sole proprietors)
  setCheckBox(form, F.materialParticipationYes, true);

  if (!sc) return doc;

  // ── Part I: Income (Lines 1-7) ──
  setCurrencyField(form, F.line1, sc.grossReceipts);
  setCurrencyField(form, F.line2, sc.returnsAndAllowances);
  // Line 3: gross receipts - returns
  const line3 = sc.grossReceipts.minus(sc.returnsAndAllowances);
  setCurrencyField(form, F.line3, line3);
  // Line 4: COGS
  setCurrencyField(form, F.line4, sc.costOfGoodsSold);
  // Line 5: gross profit (line 3 - line 4)
  setCurrencyField(form, F.line5, sc.grossIncome);
  // Line 6: Other income (not tracked separately — leave blank)
  // Line 7: gross income = gross profit + other income = grossProfit
  setCurrencyField(form, F.line7, sc.grossProfit);

  // ── Part II: Expenses (Lines 8-27) ──
  for (const [key, fieldName] of Object.entries(EXPENSE_FIELD_MAP)) {
    const value = sc.expenseBreakdown[key];
    if (value && !value.isZero()) {
      setCurrencyField(form, fieldName, value);
    }
  }

  // Line 13: depreciation (also mapped via expenseBreakdown, but set explicitly for clarity)
  if (sc.depreciationAndSection179Deduction.gt(0)) {
    setCurrencyField(form, F.line13, sc.depreciationAndSection179Deduction);
  }

  // Other expenses description
  if (sc.expenseBreakdown["Other expenses"]?.gt(0)) {
    setTextField(form, F.line27Desc, "See attached");
  }

  // ── Net Profit / Loss (Lines 28-31) ──
  setCurrencyField(form, F.line28, sc.totalExpenses);
  setCurrencyField(form, F.line29, sc.tentativeProfit);
  setCurrencyField(form, F.line30, sc.homeOfficeDeduction);
  setCurrencyField(form, F.line31, sc.netProfit);

  // Line 32: All investment at risk (default for most businesses)
  setCheckBox(form, F.allInvestmentAtRisk, true);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_C_FIELDS };

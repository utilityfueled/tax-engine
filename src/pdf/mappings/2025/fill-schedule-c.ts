import { assertPdfExportAllowed } from "../../export-policy.js";
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
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1Exp8 = (n: string) => `topmostSubform[0].Page1[0].Lines8-17[0].${n}`;
const p1Exp18 = (n: string) => `topmostSubform[0].Page1[0].Lines18-27[0].${n}`;

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
  line27a: p1Exp18("f1_40[0]"), // Line 27a: Form 7205 deduction, not a description
  line27: p1Exp18("f1_39[0]"),  // Line 27b: Other expenses amount

  // ── Net Profit / Loss ──
  line28: p1("f1_41[0]"),      // Line 28: Total expenses
  line29: p1("f1_42[0]"),      // Line 29: Tentative profit (line 7 - line 28)
  line30: p1("f1_45[0]"),   // Line 30: Home office deduction
  line31: p1("f1_46[0]"),      // Line 31: Net profit or (loss)

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
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sc = result.scheduleC;

  // A sole proprietorship belongs to one person, including on a joint return.
  const scInput = input.scheduleC;
  const proprietor = scInput?.accountHolder === "spouse"
    ? input.taxpayer.spouse
    : scInput?.accountHolder === "primary" || input.taxpayer.filingStatus !== "married_filing_jointly"
      ? input.taxpayer.primary : undefined;
  if (scInput?.accountHolder === "spouse" && !proprietor) throw new Error("Schedule C spouse proprietor is missing");
  if (proprietor) {
    setTextField(form, F.name, `${proprietor.firstName} ${proprietor.lastName}`);
    setTextField(form, F.ssn, proprietor.ssn.replace(/-/g, ""));
  }

  // ── Business info from actual input ──
  if (scInput) {
    setTextField(form, F.businessOrProfession, scInput.principalBusinessActivity ?? "");
    setTextField(form, F.businessCode, scInput.businessCode ?? "");
    setTextField(form, F.businessName, scInput.businessName ?? "");
    setTextField(form, F.ein, (scInput.ein ?? "").replace(/-/g, ""));

    // Accounting method
    const method = scInput.accountingMethod;
    setCheckBox(form, F.cashMethod, method === "cash");
    setCheckBox(form, F.accrualMethod, method === "accrual");
  }
  setCheckBox(form, F.materialParticipationYes, scInput?.qbiMateriallyParticipated === true);
  setCheckBox(form, F.materialParticipationNo, scInput?.qbiMateriallyParticipated === false);

  if (!sc) return doc;

  const audited = (line: string, expected: Decimal): Decimal => {
    const matches = sc.lines.filter(entry => entry.form === "Sched C" && entry.line === line);
    if (matches.length !== 1 || !matches[0].value.isFinite()) {
      throw new Error(`Missing, duplicate or invalid Schedule C audit entry ${line}`);
    }
    if (!expected.isFinite() || !matches[0].value.eq(expected)) {
      throw new Error(`Inconsistent Schedule C result and audit at line ${line}`);
    }
    return matches[0].value;
  };
  const sourceReceipts = scInput?.grossReceipts === undefined
    ? input.form1099Nec.reduce((total, entry) => total.plus(entry.nonemployeeCompensation), new Decimal(0))
    : new Decimal(scInput.grossReceipts);
  for (const [actual, expected] of [
    [sourceReceipts, sc.grossReceipts],
    [new Decimal(scInput?.returnsAndAllowances ?? 0), sc.returnsAndAllowances],
    [new Decimal(scInput?.costOfGoodsSold ?? 0), sc.costOfGoodsSold],
    [new Decimal(scInput?.otherIncome ?? 0), sc.otherIncome],
  ]) {
    if (!actual.isFinite() || !actual.eq(expected)) throw new Error("Schedule C source amounts do not reconcile with the result");
  }
  // Copy the canonical official lines; PDF rendering does not calculate tax.
  const incomeLines = [sc.grossReceipts, sc.returnsAndAllowances, sc.netReceipts,
    sc.costOfGoodsSold, sc.grossProfit, sc.otherIncome, sc.grossIncome];
  for (const [index, amount] of incomeLines.entries()) {
    const line = String(index + 1) as "1" | "2" | "3" | "4" | "5" | "6" | "7";
    setCurrencyField(form, F[`line${line}`], audited(line, amount));
  }

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

  // Dependent-care benefits are reconciled before profit, SE and QBI. Copy
  // that actual deduction, not the raw expense that may already include it.
  setCurrencyField(form, F.line14, audited("14", sc.expenseBreakdown["Employee benefit programs"] ?? new Decimal(0)));

  // ── Net Profit / Loss (Lines 28-31) ──
  setCurrencyField(form, F.line28, audited("28", sc.totalExpenses));
  setCurrencyField(form, F.line29, audited("29", sc.tentativeProfit));
  setCurrencyField(form, F.line30, audited("30", sc.homeOfficeDeduction));
  setCurrencyField(form, F.line31, audited("31", sc.netProfit));

  if (sc.netProfit.lt(0)) {
    setCheckBox(form, F.allInvestmentAtRisk, scInput?.allInvestmentAtRisk === true);
    setCheckBox(form, F.someInvestmentNotAtRisk, scInput?.allInvestmentAtRisk === false);
  }
  if (scInput?.otherExpenseDescription && sc.expenseBreakdown["Other expenses"]?.gt(0)) {
    const otherExpenses = audited("27b", sc.expenseBreakdown["Other expenses"]);
    setTextField(form, "topmostSubform[0].Page2[0].PartVTable[0].Item1[0].f2_15[0]", scInput.otherExpenseDescription);
    setCurrencyField(form, "topmostSubform[0].Page2[0].PartVTable[0].Item1[0].f2_16[0]", otherExpenses);
    setCurrencyField(form, "topmostSubform[0].Page2[0].f2_33[0]", otherExpenses);
  }

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_C_FIELDS };

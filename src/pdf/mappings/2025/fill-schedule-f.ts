import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule F (Form 1040) — Profit or Loss From Farming.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule F uses "topmostSubform[0]" as root.
 *
 * Sections:
 *   Header:       Name, SSN, activity info, accounting method
 *   Part I:       Lines 1-9 — Farm Income (Cash Method)
 *   Part II:      Lines 10-32f — Farm Expenses
 *   Lines 33-34:  Total expenses / Net farm profit or loss
 *   Line 36:      At-risk rules (checkboxes)
 */

import { PDFDocument } from "pdf-lib";
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
const p1Exp = (n: string) => `topmostSubform[0].Page1[0].Lines10-22[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule F fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),                                // Name of proprietor
  ssn: p1("f1_2[0]"),                                 // Social security number
  principalCropOrActivity: p1("f1_3[0]"),             // A: Principal crop or activity
  activityCode: p1("CombField_LineB[0].f1_4[0]"),    // B: Activity code (NAICS)
  ein: p1("CombField_LineD[0].f1_5[0]"),             // D: Employer ID number

  // ── Accounting Method (Line C) ──
  cashMethod: p1("LineC_ReadOrder[0].c1_1[0]"),       // C: Cash
  accrualMethod: p1("LineC_ReadOrder[0].c1_1[1]"),    // C: Accrual

  // ── Material Participation (Line E) ──
  materialParticipationYes: p1("c1_2[0]"),            // E: Yes
  materialParticipationNo: p1("c1_2[1]"),             // E: No

  // ── Started/Acquired (Line F) ──
  startedYes: p1("c1_3[0]"),                          // F: Yes
  startedNo: p1("c1_3[1]"),                           // F: No

  // ── Prior Year Filed (Line G) ──
  priorYearYes: p1("c1_4[0]"),                        // G: Yes
  priorYearNo: p1("c1_4[1]"),                         // G: No

  // ── Part I: Farm Income — Cash Method ──
  line1a: p1("f1_6[0]"),        // Line 1a: Sales of purchased livestock
  line1b: p1("f1_7[0]"),        // Line 1b: Cost of purchased livestock
  line1c: p1("f1_8[0]"),        // Line 1c: Net (1a - 1b)
  line2: p1("f1_9[0]"),         // Line 2: Sales of products raised
  line3a: p1("f1_10[0]"),       // Line 3a: Cooperative distributions (total)
  line3b: p1("f1_11[0]"),       // Line 3b: Cooperative distributions (taxable)
  line4a: p1("f1_12[0]"),       // Line 4a: Agricultural program payments (total)
  line4b: p1("f1_13[0]"),       // Line 4b: Agricultural program payments (taxable)
  line5a: p1("f1_14[0]"),       // Line 5a: CCC loans elected
  line5b: p1("f1_15[0]"),       // Line 5b: CCC loans forfeited (total)
  line5c: p1("f1_16[0]"),       // Line 5c: CCC loans forfeited (taxable)
  line6a: p1("f1_17[0]"),       // Line 6a: Crop insurance proceeds (total)
  line6b: p1("f1_18[0]"),       // Line 6b: Crop insurance proceeds (taxable)
  line6cDefer: p1("c1_5[0]"),   // Line 6c: Elect to defer (checkbox)
  line6d: p1("f1_19[0]"),       // Line 6d: Amount deferred from prior year
  line7: p1("f1_20[0]"),        // Line 7: Custom hire income
  line8: p1("f1_21[0]"),        // Line 8: Other farm income
  line9: p1("f1_22[0]"),        // Line 9: Gross farm income

  // ── Part II: Farm Expenses (Lines 10-22 in grouped section) ──
  line10: p1Exp("f1_23[0]"),    // Line 10: Car and truck
  line11: p1Exp("f1_24[0]"),    // Line 11: Chemicals
  line12: p1Exp("f1_25[0]"),    // Line 12: Conservation expenses
  line13: p1Exp("f1_26[0]"),    // Line 13: Custom hire (machine work)
  line14: p1Exp("f1_27[0]"),    // Line 14: Depreciation and section 179
  line15: p1Exp("f1_28[0]"),    // Line 15: Employee benefit programs
  line16: p1Exp("f1_29[0]"),    // Line 16: Feed
  line17: p1Exp("f1_30[0]"),    // Line 17: Fertilizers and lime
  line18: p1Exp("f1_31[0]"),    // Line 18: Freight and trucking
  line19: p1Exp("f1_32[0]"),    // Line 19: Gasoline, fuel, and oil
  line20: p1Exp("f1_33[0]"),    // Line 20: Insurance
  line21a: p1Exp("f1_34[0]"),   // Line 21a: Mortgage interest
  line21b: p1Exp("f1_35[0]"),   // Line 21b: Other interest
  line22: p1Exp("f1_36[0]"),    // Line 22: Labor hired

  // ── Part II: Expenses (Lines 23-31) ──
  line23: p1("f1_37[0]"),       // Line 23: Pension and profit-sharing
  line24a: p1("f1_38[0]"),      // Line 24a: Rent/lease vehicles
  line24b: p1("f1_39[0]"),      // Line 24b: Rent/lease other
  line25: p1("f1_40[0]"),       // Line 25: Repairs and maintenance
  line26: p1("f1_41[0]"),       // Line 26: Seeds and plants
  line27: p1("f1_42[0]"),       // Line 27: Storage and warehousing
  line28: p1("f1_43[0]"),       // Line 28: Supplies
  line29: p1("f1_44[0]"),       // Line 29: Taxes
  line30: p1("f1_45[0]"),       // Line 30: Utilities
  line31: p1("f1_46[0]"),       // Line 31: Veterinary, breeding, medicine

  // ── Other Expenses (Line 32a-32e desc/amount pairs, 32f total) ──
  line32aDesc: p1("f1_47[0]"),
  line32aAmt: p1("f1_48[0]"),
  line32bDesc: p1("f1_49[0]"),
  line32bAmt: p1("f1_50[0]"),
  line32cDesc: p1("f1_51[0]"),
  line32cAmt: p1("f1_52[0]"),
  line32dDesc: p1("f1_53[0]"),
  line32dAmt: p1("f1_54[0]"),
  line32eDesc: p1("f1_55[0]"),
  line32eAmt: p1("f1_56[0]"),
  line32f: p1("f1_57[0]"),      // Line 32f: Total other expenses

  // ── Totals ──
  line33: p1("f1_58[0]"),       // Line 33: Total expenses
  line34: p1("f1_59[0]"),       // Line 34: Net farm profit or (loss)

  // ── At-Risk Rules (Line 36) ──
  allInvestmentAtRisk: p1("c1_6[0]"),       // 36a: All at risk
  someInvestmentNotAtRisk: p1("c1_6[1]"),   // 36b: Some not at risk
} as const;

// ─── Expense key → field mapping ────────────────────────────────────────────
// Maps engine expenseBreakdown keys to PDF field names.

const EXPENSE_FIELD_MAP: Record<string, string> = {
  "Car and truck": FIELDS.line10,
  "Chemicals": FIELDS.line11,
  "Conservation": FIELDS.line12,
  "Custom hire": FIELDS.line13,
  "Depreciation and section 179": FIELDS.line14,
  "Employee benefits": FIELDS.line15,
  "Feed": FIELDS.line16,
  "Fertilizers and lime": FIELDS.line17,
  "Freight and trucking": FIELDS.line18,
  "Gasoline, fuel, and oil": FIELDS.line19,
  "Insurance": FIELDS.line20,
  "Mortgage interest": FIELDS.line21a,
  "Other interest": FIELDS.line21b,
  "Labor hired": FIELDS.line22,
  "Pension and profit-sharing": FIELDS.line23,
  "Rent/lease vehicles": FIELDS.line24a,
  "Rent/lease other": FIELDS.line24b,
  "Repairs and maintenance": FIELDS.line25,
  "Seeds and plants": FIELDS.line26,
  "Storage and warehousing": FIELDS.line27,
  "Supplies": FIELDS.line28,
  "Taxes": FIELDS.line29,
  "Utilities": FIELDS.line30,
  "Veterinary, breeding, medicine": FIELDS.line31,
};

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule F PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleF(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sf = result.scheduleF;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Farm info from input ──
  const sfInput = input.scheduleF;
  if (sfInput) {
    setTextField(form, F.principalCropOrActivity, sfInput.principalCropOrActivity ?? "");
    setTextField(form, F.activityCode, sfInput.activityCode ?? "");
    setTextField(form, F.ein, (sfInput.ein ?? "").replace(/-/g, ""));

    // Accounting method
    const method = sfInput.accountingMethod ?? "cash";
    setCheckBox(form, F.cashMethod, method === "cash");
    setCheckBox(form, F.accrualMethod, method === "accrual");

    // Material participation
    const matParticipated = sfInput.materiallyParticipated !== false;
    setCheckBox(form, F.materialParticipationYes, matParticipated);
    setCheckBox(form, F.materialParticipationNo, !matParticipated);
  } else {
    setCheckBox(form, F.cashMethod, true);
    setCheckBox(form, F.materialParticipationYes, true);
  }

  if (!sf) return doc;

  // ── Part I: Farm Income (Lines 1-9) ──
  // Use engine audit trail to fill individual income lines.
  const auditValue = (line: string) => sf.lines.find(l => l.line === line)?.value;

  const incomeLineMap: Array<[string, string]> = [
    ["1a", F.line1a],
    ["1b", F.line1b],
    ["2", F.line2],
    ["3b", F.line3b],
    ["4b", F.line4b],
    ["5a", F.line5a],
    ["5c", F.line5c],
    ["6b", F.line6b],
    ["6d", F.line6d],
    ["7", F.line7],
    ["8", F.line8],
  ];
  for (const [line, fieldName] of incomeLineMap) {
    const val = auditValue(line);
    if (val !== undefined) {
      setCurrencyField(form, fieldName, val);
    }
  }

  // Line 1c and Line 9: Use direct result values
  setCurrencyField(form, F.line1c, sf.netPurchasedLivestock);
  setCurrencyField(form, F.line9, sf.grossFarmIncome);

  // ── Part II: Farm Expenses (Lines 10-32f) ──
  for (const [key, fieldName] of Object.entries(EXPENSE_FIELD_MAP)) {
    const value = sf.expenseBreakdown[key];
    if (value && !value.isZero()) {
      setCurrencyField(form, fieldName, value);
    }
  }

  // Other expenses (line 32): engine lumps them into "Other expenses" key
  const otherExpenses = sf.expenseBreakdown["Other expenses"];
  if (otherExpenses && !otherExpenses.isZero()) {
    setTextField(form, F.line32aDesc, "Other");
    setCurrencyField(form, F.line32aAmt, otherExpenses);
    setCurrencyField(form, F.line32f, otherExpenses);
  }

  // ── Totals ──
  setCurrencyField(form, F.line33, sf.totalExpenses);
  setCurrencyField(form, F.line34, sf.netFarmProfit);

  // All investment at risk (default for most farms)
  setCheckBox(form, F.allInvestmentAtRisk, true);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_F_FIELDS };

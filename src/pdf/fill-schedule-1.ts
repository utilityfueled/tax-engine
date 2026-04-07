/**
 * PDF filler for IRS Schedule 1 (Form 1040) — Additional Income and Adjustments to Income.
 *
 * Field names from the official 2025 IRS fillable PDF, verified via debug label fill.
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
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule 1 fillable PDF debug labels.

const FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── 1099-K personal items ──
  form1099KPersonalItems: p1("f1_03[0]"),

  // ── Part I: Additional Income ──
  line1: p1("f1_04[0]"),    // Taxable refunds
  line2a: p1("f1_05[0]"),   // Alimony received
  line2bDate: p1("f1_06[0]"), // Date of original decree
  line3: p1("f1_07[0]"),    // Business income (Schedule C)
  line4: p1("f1_08[0]"),    // Other gains or losses (Form 4797)
  line5: p1("f1_09[0]"),    // Rental/royalties/partnerships (Schedule E)
  line6: p1("f1_10[0]"),    // Farm income (Schedule F)
  line7: p1("f1_12[0]"),    // Unemployment compensation
  // c1_3 = Line 7 repayment checkbox (inside Line7_ReadOrder)
  line7Repaid: p1("Line7_ReadOrder[0].f1_11[0]"), // Amount repaid

  // ── Line 8 sub-items ──
  line8a: p1("Line8a_ReadOrder[0].f1_13[0]"), // NOL (shown in parentheses)
  line8b: p1("f1_14[0]"),   // Gambling income
  line8c: p1("f1_15[0]"),   // Cancellation of debt
  line8d: p1("f1_16[0]"),   // Foreign earned income exclusion (parentheses)
  line8e: p1("f1_17[0]"),   // Income from Form 8853
  line8f: p1("f1_18[0]"),   // Income from Form 8889
  line8g: p1("f1_19[0]"),   // Alaska Permanent Fund dividends
  line8h: p1("f1_20[0]"),   // Jury duty pay
  line8i: p1("f1_21[0]"),   // Prizes and awards
  line8j: p1("f1_22[0]"),   // Activity not engaged in for profit
  line8k: p1("f1_23[0]"),   // Stock options
  line8l: p1("f1_24[0]"),   // Rental of personal property
  line8m: p1("f1_25[0]"),   // Olympic/Paralympic medals
  line8n: p1("f1_26[0]"),   // Section 951(a) inclusion
  line8o: p1("f1_27[0]"),   // Section 951A(a) inclusion
  line8p: p1("f1_28[0]"),   // Section 461(l) excess business loss
  line8q: p1("f1_29[0]"),   // ABLE account distributions
  line8r: p1("f1_30[0]"),   // Scholarship/fellowship grants
  line8s: p1("f1_31[0]"),   // Nontaxable Medicaid waiver (parentheses)
  line8t: p1("f1_32[0]"),   // Nonqualified deferred comp pension
  line8u: p1("f1_33[0]"),   // Wages while incarcerated
  line8v: p1("f1_34[0]"),   // Digital assets
  line8zDesc: p1("Line8z_ReadOrder[0].f1_35[0]"), // Other income description
  line8z: p1("f1_36[0]"),   // Other income amount
  line9: p1("f1_37[0]"),    // Total other income
  line10: p1("f1_38[0]"),   // Total additional income → 1040 Line 8

  // ── Part II: Adjustments to Income (Page 2) ──
  line11: p2("f2_01[0]"),   // Educator expenses
  line12: p2("f2_02[0]"),   // Business expenses (reservists, etc.)
  line13: p2("f2_03[0]"),   // HSA deduction
  line14: p2("f2_04[0]"),   // Moving expenses (Armed Forces)
  line15: p2("f2_05[0]"),   // Deductible SE tax
  line16: p2("f2_06[0]"),   // SE retirement contributions
  line17: p2("f2_07[0]"),   // SE health insurance
  line18: p2("f2_08[0]"),   // Early withdrawal penalty
  line19a: p2("f2_09[0]"),  // Alimony paid
  line19bSSN: p2("Line19b_CombField[0].f2_10[0]"), // Recipient SSN
  line19cDate: p2("f2_11[0]"), // Date of original decree
  line20: p2("f2_12[0]"),   // IRA deduction
  line21: p2("f2_13[0]"),   // Student loan interest
  line22: p2("f2_14[0]"),   // Reserved
  line23: p2("f2_15[0]"),   // Archer MSA deduction

  // ── Line 24 sub-items ──
  line24a: p2("Line24a_ReadOrder[0].f2_16[0]"), // Jury duty pay
  line24b: p2("f2_17[0]"),  // Rental of personal property expenses
  line24c: p2("f2_18[0]"),  // Olympic medal nontaxable
  line24d: p2("f2_19[0]"),  // Reforestation amortization
  line24e: p2("f2_20[0]"),  // Repayment of supplemental unemployment
  line24f: p2("f2_21[0]"),  // Section 501(c)(18)(D) pension contributions
  line24g: p2("f2_22[0]"),  // Chaplain contributions
  line24h: p2("f2_23[0]"),  // Attorney fees (discrimination)
  line24i: p2("f2_24[0]"),  // Attorney fees (IRS whistleblower)
  line24j: p2("f2_25[0]"),  // Housing deduction from Form 2555
  line24k: p2("f2_26[0]"),  // Excess deductions from K-1 (Form 1041)
  line24zDesc: p2("f2_27[0]"), // Other adjustments description
  line24z: p2("f2_28[0]"),  // Other adjustments amount
  line25: p2("f2_29[0]"),   // Total other adjustments
  line26: p2("f2_30[0]"),   // Total adjustments → 1040 Line 10
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule 1 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillSchedule1(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const s1 = result.schedule1;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!s1) return doc;

  // ── Part I: Additional Income ──
  setCurrencyField(form, F.line1, s1.taxableRefunds);
  setCurrencyField(form, F.line2a, s1.alimonyReceived);
  setCurrencyField(form, F.line3, s1.businessIncome);
  setCurrencyField(form, F.line4, s1.otherGainsOrLosses);
  setCurrencyField(form, F.line5, s1.supplementalIncome);
  setCurrencyField(form, F.line6, s1.farmIncome);
  setCurrencyField(form, F.line7, s1.unemploymentCompensation);

  // Line 8 sub-items
  setCurrencyField(form, F.line8a, s1.nolDeduction);
  setCurrencyField(form, F.line8b, s1.gamblingIncome);
  setCurrencyField(form, F.line8c, s1.cancelledDebtIncome);
  setCurrencyField(form, F.line8f, s1.hsaTaxableDistributions);

  setCurrencyField(form, F.line9, s1.totalAdditionalIncome.minus(
    s1.taxableRefunds).minus(s1.alimonyReceived).minus(s1.businessIncome)
    .minus(s1.otherGainsOrLosses).minus(s1.supplementalIncome)
    .minus(s1.farmIncome).minus(s1.unemploymentCompensation));
  // Use the audit trail for Line 9 if available
  const line9 = getLineValue(result, "Sched 1", "9");
  if (line9) setCurrencyField(form, F.line9, line9);

  setCurrencyField(form, F.line10, s1.totalAdditionalIncome);

  // ── Part II: Adjustments to Income ──
  setCurrencyField(form, F.line11, s1.educatorExpenses);
  setCurrencyField(form, F.line12, s1.businessExpenseAdjustments);
  setCurrencyField(form, F.line13, s1.hsaDeduction);
  setCurrencyField(form, F.line14, s1.armedForcesMovingExpenses);
  setCurrencyField(form, F.line15, s1.seDeduction);
  setCurrencyField(form, F.line16, s1.seRetirementContributions);
  setCurrencyField(form, F.line17, s1.seHealthInsurance);
  setCurrencyField(form, F.line18, s1.earlyWithdrawalPenalty);
  setCurrencyField(form, F.line19a, s1.alimonyPaid);
  setCurrencyField(form, F.line20, s1.iraDeduction);
  setCurrencyField(form, F.line21, s1.studentLoanInterest);
  setCurrencyField(form, F.line23, s1.archerMSADeduction);
  setCurrencyField(form, F.line25, s1.otherAdjustmentsTotal);
  setCurrencyField(form, F.line26, s1.totalAdjustments);

  return doc;
}

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, form: string, line: string) {
  return result.allLines.find((l) => l.form === form && l.line === line)?.value;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_1_FIELDS };

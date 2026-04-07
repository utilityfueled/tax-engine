/**
 * PDF filler for IRS Schedule A (Form 1040) — Itemized Deductions.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule A uses "form1[0]" as root (not "topmostSubform[0]").
 *
 * Sections:
 *   Lines 1-4:   Medical and Dental Expenses
 *   Lines 5a-5e: Taxes You Paid (SALT)
 *   Lines 6-7:   Other taxes / total taxes
 *   Lines 8a-8e: Interest You Paid (mortgage)
 *   Lines 9-10:  Investment interest / total interest
 *   Lines 11-14: Gifts to Charity
 *   Line 15:     Casualty and Theft Losses
 *   Line 16:     Other Itemized Deductions
 *   Line 17:     Total Itemized Deductions
 *   Line 18:     Checkbox (itemize even if less than standard deduction)
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

// ─── Decimal helpers ──────────────────────────────────────────────────────

const ZERO = new Decimal(0);
const d = (v: unknown): Decimal => {
  if (v instanceof Decimal) return v;
  if (v === undefined || v === null || v === "") return ZERO;
  return new Decimal(String(v));
};

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `form1[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule A fillable PDF field inspection.
//
// Lines 6 and 8b have two-field rows: a description text field + an amount field.
// Line 16 also has a description text field + an amount field.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Medical and Dental Expenses ──
  line1: p1("f1_3[0]"),                         // Medical expenses (gross)
  line2: p1("Line2_ReadOrder[0].f1_4[0]"),       // AGI (Form 1040 Line 11b)
  line3: p1("f1_5[0]"),                          // 7.5% × AGI
  line4: p1("f1_6[0]"),                          // Medical deduction (Line 1 - Line 3, min 0)

  // ── Taxes You Paid ──
  salesTaxCheckbox: p1("c1_1[0]"),               // Sales tax election checkbox (Line 5a)
  line5a: p1("f1_7[0]"),                         // State/local income or sales taxes
  line5b: p1("f1_8[0]"),                         // State/local real estate taxes
  line5c: p1("f1_9[0]"),                         // State/local personal property taxes
  line5d: p1("f1_10[0]"),                        // Sum 5a through 5c
  line5e: p1("f1_11[0]"),                        // Capped SALT ($40K/$20K MFS for 2025)
  line6Desc: p1("f1_12[0]"),                     // Other taxes (description text)
  line6: p1("f1_13[0]"),                         // Other taxes (amount)
  line7: p1("f1_14[0]"),                         // Total taxes (5e + 6)

  // ── Interest You Paid ──
  line8Checkbox: p1("Line8_ReadOrder[0].c1_2[0]"), // Mortgage not for buy/build/improve
  line8a: p1("f1_15[0]"),                        // Home mortgage interest + points from 1098
  line8bDesc: p1("f1_16[0]"),                    // Mortgage interest not on 1098 (description)
  line8b: p1("f1_17[0]"),                        // Mortgage interest not on 1098 (amount)
  line8c: p1("f1_18[0]"),                        // Points not on 1098
  line8d: p1("f1_19[0]"),                        // Reserved for future use
  line8e: p1("f1_20[0]"),                        // Sum 8a through 8c
  line9: p1("f1_21[0]"),                         // Investment interest (Form 4952)
  line10: p1("f1_22[0]"),                        // Total interest (8e + 9)

  // ── Gifts to Charity ──
  line11: p1("f1_23[0]"),                        // Cash charitable
  line12: p1("f1_24[0]"),                        // Non-cash charitable
  line13: p1("f1_25[0]"),                        // Carryover from prior year
  line14: p1("f1_26[0]"),                        // Total charitable (11+12+13)

  // ── Casualty and Theft Losses ──
  line15: p1("f1_27[0]"),                        // Casualty losses (Form 4684)

  // ── Other Itemized Deductions ──
  line16Desc: p1("f1_28[0]"),                    // Other deductions (description text)
  line16: p1("f1_29[0]"),                        // Other deductions (amount)

  // ── Total ──
  line17: p1("f1_30[0]"),                        // Total itemized deductions

  // ── Line 18 ──
  line18Checkbox: p1("Line18_ReadOrder[0].c1_3[0]"), // Itemize even if < standard deduction
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule A PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleA(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const sa = result.scheduleA;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!sa) return doc;

  // ── Medical and Dental Expenses (Lines 1-4) ──
  const medicalExpenses = d(input.scheduleA?.medicalExpenses);
  const agi = result.agi;
  const medicalThreshold = agi.times(new Decimal("0.075")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  setCurrencyField(form, F.line1, medicalExpenses);
  setCurrencyField(form, F.line2, agi);
  setCurrencyField(form, F.line3, medicalThreshold);
  setCurrencyField(form, F.line4, sa.medicalDeduction);

  // ── Taxes You Paid (Lines 5a-5e, 6-7) ──
  setCheckBox(form, F.salesTaxCheckbox, sa.salesTaxElected);

  // Recompute Line 5a components from input (same logic as engine)
  let line5aValue: Decimal;
  if (sa.salesTaxElected) {
    // Sales tax amount — derive from audit trail or recompute
    line5aValue = findAuditValue(sa.lines, "5a");
  } else {
    // State/local income taxes from W-2s + estimated payments
    const stateTaxes = input.w2s.reduce(
      (acc, w2) => acc.plus(d(w2.stateTaxWithheld)), ZERO,
    );
    const localTaxes = input.w2s.reduce(
      (acc, w2) => acc.plus(d(w2.localTaxWithheld)), ZERO,
    );
    const stateEstimatedPayments = input.adjustments?.estimatedTaxPayments
      ?.filter((p) => p.type === "state")
      .reduce((acc, p) => acc.plus(d(p.amount)), ZERO) ?? ZERO;
    line5aValue = stateTaxes.plus(localTaxes).plus(stateEstimatedPayments);
  }
  setCurrencyField(form, F.line5a, line5aValue);

  // Line 5b: Real estate taxes (from Form 1098)
  const realEstateTaxes = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.propertyTax)), ZERO,
  );
  setCurrencyField(form, F.line5b, realEstateTaxes);

  // Line 5c: Personal property taxes
  const personalPropertyTaxes = d(input.scheduleA?.personalPropertyTaxes);
  setCurrencyField(form, F.line5c, personalPropertyTaxes);

  // Line 5d: Sum 5a + 5b + 5c
  const line5d = line5aValue.plus(realEstateTaxes).plus(personalPropertyTaxes);
  setCurrencyField(form, F.line5d, line5d);

  // Line 5e: Capped SALT
  setCurrencyField(form, F.line5e, sa.saltDeduction);

  // Line 6/7: Other taxes (not commonly used — leave blank unless engine provides)
  // Line 7: Total taxes = Line 5e + Line 6
  setCurrencyField(form, F.line7, sa.saltDeduction);

  // ── Interest You Paid (Lines 8a-10) ──
  // Line 8a: Mortgage interest + points from Form 1098
  // Per IRS instructions, Line 8a includes both interest AND points from 1098
  const pointsPaid = input.form1098.reduce(
    (acc, f) => acc.plus(d(f.pointsPaid)), ZERO,
  );
  const line8a = sa.mortgageInterest.plus(pointsPaid);
  setCurrencyField(form, F.line8a, line8a);

  // Lines 8b, 8c, 8d: Not tracked by engine (non-1098 amounts / reserved)
  // Line 8e: Sum of 8a through 8c = line8a (since 8b, 8c, 8d are 0)
  setCurrencyField(form, F.line8e, line8a);

  // Line 9: Investment interest
  setCurrencyField(form, F.line9, sa.investmentInterestDeduction);

  // Line 10: Total interest (8e + 9)
  const line10 = line8a.plus(sa.investmentInterestDeduction);
  setCurrencyField(form, F.line10, line10);

  // ── Gifts to Charity (Lines 11-14) ──
  // Split cashCharitable into current-year cash (Line 11) and carryover used (Line 13).
  // The engine's cashCharitable includes carryforward used; we separate them for the form.
  const carryforwardUsed = sa.charitableCarryforwardDetail.reduce(
    (acc, entry) => acc.plus(entry.amountUsed), ZERO,
  );
  const currentYearCash = Decimal.max(ZERO, sa.cashCharitable.minus(carryforwardUsed));

  setCurrencyField(form, F.line11, currentYearCash);
  setCurrencyField(form, F.line12, sa.nonCashCharitable);
  setCurrencyField(form, F.line13, carryforwardUsed);
  // Line 14: Total charitable = 11 + 12 + 13
  const totalCharitable = sa.cashCharitable.plus(sa.nonCashCharitable);
  setCurrencyField(form, F.line14, totalCharitable);

  // ── Casualty and Theft Losses (Line 15) ──
  setCurrencyField(form, F.line15, sa.casualtyLossDeduction);

  // ── Other Itemized Deductions (Line 16) ──
  if (sa.gamblingLossDeduction.gt(0)) {
    setTextField(form, F.line16Desc, "Gambling losses");
    setCurrencyField(form, F.line16, sa.gamblingLossDeduction);
  }

  // ── Total Itemized Deductions (Line 17) ──
  setCurrencyField(form, F.line17, sa.totalItemized);

  return doc;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Extract a value from the Schedule A audit trail by line number. */
function findAuditValue(
  lines: Array<{ form: string; line: string; value: Decimal }>,
  lineNumber: string,
): Decimal {
  const entry = lines.find((l) => l.form === "Sched A" && l.line === lineNumber);
  return entry?.value ?? ZERO;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_A_FIELDS };

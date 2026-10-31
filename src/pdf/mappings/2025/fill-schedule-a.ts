import { assertPdfExportAllowed } from "../../export-policy.js";
import { charitableSourceDigest } from "@/utils/charitable-source-digest.js";
import { charitableReviewOriginalSourceInput, type PreparedCharitableReview } from "../../charitable-review-context.js";
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

import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest.js";
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
  line8bDesc: p1("Line8b_ReadOrder[0].f1_16[0]"),                    // Mortgage interest not on 1098 (description)
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
  charitableReview?: PreparedCharitableReview,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  charitableReviewOriginalSourceInput(input, result, charitableReview);
  const sa = result.scheduleA;
  if (!sa) throw new Error("Schedule A requires an actual calculation before tax audit mapping");
  if (sa.charitableSourceDigest !== charitableSourceDigest(input)) throw new Error("Schedule A charitable sources do not match the calculation");
  const exactPriorUsed = sa.charitableCarryforwardDetail.reduce((total, row) => total.plus(row.amountUsed), ZERO);
  const exactPriorCash = sa.charitableCarryforwardDetail.filter(row => row.medium === "cash").reduce((total, row) => total.plus(row.amountUsed), ZERO);
  const exactPriorNoncash = sa.charitableCarryforwardDetail.filter(row => row.medium === "noncash").reduce((total, row) => total.plus(row.amountUsed), ZERO);
  const exactCurrentCash = sa.cashCharitable.minus(exactPriorCash);
  const exactCurrentNoncash = sa.nonCashCharitable.minus(exactPriorNoncash);
  if (!exactPriorUsed.eq(exactPriorCash.plus(exactPriorNoncash)) || [exactPriorUsed, exactCurrentCash, exactCurrentNoncash].some(value => !value.isFinite() || value.lt(0))) {
    throw new Error("Schedule A charitable source groups do not reconcile");
  }
  for (const [number, expected] of [["cash", sa.cashCharitable], ["noncash", sa.nonCashCharitable]] as const) {
    const lines = sa.lines.filter(line => line.form === "Charitable Computation" && line.line === number);
    const value = lines[0]?.value;
    if (lines.length !== 1 || !value?.isFinite() || !value.eq(expected)) {
      throw new Error(`Schedule A charitable computational audit ${number} must reconcile exact retained amounts`);
    }
  }
  const exactCharityGroups: Record<string, { key: string; value: Decimal }> = {
    "11": { key: "Exact current cash", value: exactCurrentCash },
    "12": { key: "Exact current noncash", value: exactCurrentNoncash },
    "13": { key: "Exact prior carry used", value: exactPriorUsed },
  };
  const charityExpected = { "11": sa.charitableCurrentCash, "12": sa.charitableCurrentNoncash,
    "13": sa.charitablePriorYearUsed, "14": sa.charitableTotal };
  if (!charityExpected["11"]?.eq(exactCurrentCash.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
    || !charityExpected["12"]?.eq(exactCurrentNoncash.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
    || !charityExpected["13"]?.eq(exactPriorUsed.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
    || !charityExpected["14"]?.eq(charityExpected["11"].plus(charityExpected["12"]).plus(charityExpected["13"]))) {
    throw new Error("Schedule A charitable audit must reconcile exact source groups and reported subtotal");
  }
  for (const [number, expected] of Object.entries(charityExpected)) {
    const lines = sa.lines.filter(line => line.form === "Sched A" && line.line === number);
    const value = lines[0]?.value;
    if (lines.length !== 1 || !value?.isFinite() || !value.isInteger() || value.lt(0) || !value.eq(expected)) {
      throw new Error(`Schedule A charitable audit ${number} must be unique and reconcile reported sources`);
    }
    const group = exactCharityGroups[number];
    if (group) {
      const exact = lines[0].inputs[group.key];
      if (!(exact instanceof Decimal) || !exact.isFinite() || !exact.eq(group.value)) {
        throw new Error(`Schedule A charitable audit ${number} must reconcile exact source groups`);
      }
    }
  }
  const taxLines = Object.fromEntries((["5a", "5b", "5c", "5d", "5e", "6", "7"] as const).map(number => {
    const lines = sa.lines.filter(line => line.form === "Sched A" && line.line === number);
    const value = lines[0]?.value;
    if (lines.length !== 1 || !value?.isFinite() || value.lt(0)) throw new Error(`Schedule A tax audit ${number} must be unique and nonnegative`);
    return [number, value];
  })) as Record<"5a" | "5b" | "5c" | "5d" | "5e" | "6" | "7", Decimal>;
  if (!taxLines["5d"].eq(taxLines["5a"].plus(taxLines["5b"]).plus(taxLines["5c"]))
    || !taxLines["5e"].eq(sa.saltDeduction) || taxLines["5e"].gt(taxLines["5d"].toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
    || !taxLines["6"].eq(sa.foreignIncomeTaxDeduction)
    || !sa.foreignTaxElection?.scheduleAForeignIncomeTaxes.isFinite()
    || !taxLines["6"].eq(sa.foreignTaxElection.scheduleAForeignIncomeTaxes.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))
    || !taxLines["7"].eq(taxLines["5e"].plus(taxLines["6"]))) throw new Error("Schedule A tax audit must reconcile actual totals and annual election");
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Medical and Dental Expenses (Lines 1-4) ──
  const medicalExpenses = d(input.scheduleA?.medicalExpenses);
  const agi = result.agi;
  const medicalThreshold = Decimal.max(0, agi).times(new Decimal("0.075")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  setCurrencyField(form, F.line1, medicalExpenses);
  setCurrencyField(form, F.line2, agi);
  setCurrencyField(form, F.line3, medicalThreshold);
  setCurrencyField(form, F.line4, sa.medicalDeduction);

  // ── Taxes You Paid (Lines 5a-5e, 6-7) ──
  setCheckBox(form, F.salesTaxCheckbox, sa.salesTaxElected);

  // Tax computations already used complete facts before render-only identifiers were removed.
  for (const [number, value] of Object.entries(taxLines)) setCurrencyField(form, F[`line${number}` as keyof typeof F], value);
  setTextField(form, F.line6Desc, taxLines["6"].gt(0) ? "Foreign income taxes" : "");

  // Copy canonical audited amounts only after source/result reconciliation.
  const mortgage = calculateHomeMortgageInterest(input);
  if (!mortgage.mortgageInterest.eq(sa.mortgageInterest)
    || !sa.mortgageWorksheet || !mortgage.deductiblePoints.eq(sa.mortgageWorksheet.deductiblePoints)
    || mortgage.sourceFactsVerified !== sa.mortgageWorksheet.sourceFactsVerified) {
    throw new Error("Schedule A mortgage source and result do not reconcile");
  }
  const expectedMortgageLines = {
    "8a": mortgage.line8a, "8b": mortgage.line8b, "8c": mortgage.line8c,
    "8d": sa.mortgageInsurancePremiums,
    "8e": mortgage.line8a.plus(mortgage.line8b).plus(mortgage.line8c).plus(sa.mortgageInsurancePremiums),
    "10": mortgage.mortgageInterest.plus(mortgage.deductiblePoints).plus(sa.mortgageInsurancePremiums).plus(sa.investmentInterestDeduction),
  };
  for (const [line, expected] of Object.entries(expectedMortgageLines)) {
    const audited = sa.lines.filter(item => item.form === "Sched A" && item.line === line);
    if (audited.length !== 1 || !audited[0].value.isFinite() || !audited[0].value.eq(expected)) {
      throw new Error(`Schedule A mortgage audit ${line} must be unique and reconcile to actual sources`);
    }
    setCurrencyField(form, F[`line${line}` as keyof typeof F], audited[0].value);
  }
  if (input.mortgageInterestWorksheet) {
    setCheckBox(form, F.line8Checkbox, input.mortgageInterestWorksheet.loans.some(loan => !loan.acquisitionUse));
    const lenders = mortgage.unreportedLenders.map(lender => [lender.name,lender.taxId,lender.address].filter(Boolean).join("; "));
    if (lenders.length) setTextField(form, F.line8bDesc, lenders.join(" | "));
  }
  setCurrencyField(form, F.line9, sa.investmentInterestDeduction);

  // ── Gifts to Charity (Lines 11-14) ──
  for (const [number, value] of Object.entries(charityExpected)) {
    setCurrencyField(form, F[`line${number}` as keyof typeof F], value);
  }

  // ── Casualty and Theft Losses (Line 15) ──
  setCurrencyField(form, F.line15, sa.casualtyLossDeduction);

  // ── Other Itemized Deductions (Line 16) ──
  const line16Audit = sa.lines.filter(line => line.form === "Sched A" && line.line === "16");
  if (line16Audit.length !== 1 || !line16Audit[0].value.isFinite() || !line16Audit[0].value.eq(sa.otherItemizedDeductions)) {
    throw new Error("Schedule A line16 requires a unique reconciled audit");
  }
  const otherDescriptions = [sa.gamblingLossDeduction.gt(0) ? "Gambling losses" : "", sa.bondPremiumDeduction.gt(0) ? "Excess bond premium" : "", sa.oidOrdinaryLossDeduction.gt(0) ? "TIPS ordinary loss" : "", sa.estateTaxDeduction.gt(0) ? "Estate tax on IRD" : ""].filter(Boolean);
  setTextField(form, F.line16Desc, [...otherDescriptions, result.claimOfRight?.method === "deduction" ? "Repaid income" : ""].filter(Boolean).join("; "));
  setCurrencyField(form, F.line16, line16Audit[0].value);

  // ── Total Itemized Deductions (Line 17) ──
  setCurrencyField(form, F.line17, sa.totalItemized);

  // Line 18 records the taxpayer's actual election to itemize below standard.
  setCheckBox(form, F.line18Checkbox, input.deductionElection === "itemized"
    && result.deductionUsed === "itemized"
    && result.itemizedDeductions.lt(result.standardDeduction));

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_A_FIELDS };

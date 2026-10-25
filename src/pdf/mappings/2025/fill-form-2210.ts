import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 2210 — Underpayment of Estimated Tax
 * by Individuals, Estates, and Trusts.
 *
 * Field names verified against 2025 Form 2210 fillable PDF field inspection.
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
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const secA = (line: string, n: string) =>
  `topmostSubform[0].Page2[0].SectionATable[0].${line}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 2210 fillable PDF debug labels.

export const FORM_2210_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Required Annual Payment ──
  line1: p1("f1_3[0]"),   // Tax after credits (Form 1040, line 22)
  line2: p1("f1_4[0]"),   // Other taxes (SE tax, Additional Medicare, NIIT, etc.)
  line3: p1("f1_5[0]"),   // Other payments and refundable credits (in parentheses)
  line4: p1("f1_6[0]"),   // Current year tax (combine lines 1, 2, and 3)
  line5: p1("f1_7[0]"),   // Multiply line 4 by 90% (0.90)
  line6: p1("f1_8[0]"),   // Withholding taxes
  line7: p1("f1_9[0]"),   // Subtract line 6 from line 4
  line8: p1("f1_10[0]"),  // Maximum required annual payment based on prior year's tax
  line9: p1("f1_11[0]"),  // Required annual payment (smaller of line 5 or line 8)

  // ── Part II: Reasons for Filing (checkboxes) ──
  boxA: p1("c1_1[0]"),
  boxB: p1("c1_1[1]"),
  boxC: p1("c1_2[0]"),
  boxD: p1("c1_3[0]"),
  boxE: p1("c1_4[0]"),

  // ── Part III: Penalty Computation (Short Method) ──
  // Section A — Figure Your Underpayment
  // Line 10: Required installments per quarter (25% of line 9)
  line10a: secA("Line10[0]", "f2_1[0]"),
  line10b: secA("Line10[0]", "f2_2[0]"),
  line10c: secA("Line10[0]", "f2_3[0]"),
  line10d: secA("Line10[0]", "f2_4[0]"),

  // Line 11: Estimated tax paid and tax withheld per quarter
  line11a: secA("Line11[0]", "f2_5[0]"),
  line11b: secA("Line11[0]", "f2_6[0]"),
  line11c: secA("Line11[0]", "f2_7[0]"),
  line11d: secA("Line11[0]", "f2_8[0]"),

  // Section B — Penalty
  line19: p2("f2_37[0]"),  // Total penalty → Form 1040, line 38
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 2210 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm2210(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FORM_2210_FIELDS;
  const f2210 = result.form2210;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f2210) return doc;

  // ── Part I: Required Annual Payment ──

  // Line 1: Form 1040 line 22 (tax after nonrefundable credits)
  // = (totalTaxBeforeCredits + Schedule 2 Part I) - nonrefundable credits
  const schedule2Part1 = result.schedule2?.partITotal ?? new Decimal(0);
  const schedule3Line8 = getLineValue(result, "Schedule 3", "8") ?? new Decimal(0);
  const totalNonrefCredits = result.totalCredits;
  const line18Tax = result.totalTaxBeforeCredits.plus(schedule2Part1);
  const line1 = Decimal.max(line18Tax.minus(totalNonrefCredits), new Decimal(0));
  setCurrencyField(form, F.line1, line1);

  // Line 2: Other taxes from Schedule 2, Part II (SE tax, Additional Medicare, NIIT, etc.)
  // Excludes estimated tax penalty (that's what we're computing)
  const line2 = result.schedule2?.partIITotal ?? new Decimal(0);
  setCurrencyField(form, F.line2, line2);

  // Line 3: Other payments and refundable credits (shown in parentheses)
  // = EIC + ACTC + Schedule 3 refundable credits + net premium tax credit
  const eic = result.earnedIncomeCredit;
  const actc = result.form8812?.actc ?? new Decimal(0);
  const sched3RefundableCredits = getLineValue(result, "1040", "31") ?? new Decimal(0);
  const line3 = eic.plus(actc).plus(sched3RefundableCredits);
  if (line3.gt(0)) {
    // Form 2210 shows this in parentheses — use the raw number, the form
    // already has parentheses printed around the field
    setCurrencyField(form, F.line3, line3);
  }

  // Line 4: Current year tax = Line 1 + Line 2 - Line 3
  const line4 = Decimal.max(line1.plus(line2).minus(line3), new Decimal(0));
  setCurrencyField(form, F.line4, line4);

  // Line 5: Line 4 × 90%
  const line5 = line4.times(new Decimal("0.9")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  setCurrencyField(form, F.line5, line5);

  // Line 6: Withholding taxes
  const line6 = result.totalWithholding;
  setCurrencyField(form, F.line6, line6);

  // Line 7: Line 4 - Line 6
  const line7 = Decimal.max(line4.minus(line6), new Decimal(0));
  setCurrencyField(form, F.line7, line7);

  // Line 8: Maximum required annual payment based on prior year's tax
  // 100% of prior year tax (or 110% if prior year AGI > $150K / $75K MFS)
  if (input.priorYear?.priorYearTax) {
    const priorYearTax = new Decimal(input.priorYear.priorYearTax);
    const priorYearAGI = input.priorYear.priorYearAGI
      ? new Decimal(input.priorYear.priorYearAGI)
      : new Decimal(0);
    const threshold = input.taxpayer.filingStatus === "married_filing_separately"
      ? new Decimal(75000)
      : new Decimal(150000);
    const multiplier = priorYearAGI.gt(threshold) ? new Decimal("1.1") : new Decimal("1.0");
    const line8 = priorYearTax.times(multiplier).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    setCurrencyField(form, F.line8, line8);
  }

  // Line 9: Required annual payment = smaller of line 5 or line 8
  setCurrencyField(form, F.line9, f2210.requiredAnnualPayment);

  // ── Part III: Short Method ──

  if (f2210.penalty.gt(0)) {
    // Line 10: Required installments (25% of line 9 per quarter)
    const quarterlyInstallment = f2210.requiredAnnualPayment
      .dividedBy(4)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    setCurrencyField(form, F.line10a, quarterlyInstallment);
    setCurrencyField(form, F.line10b, quarterlyInstallment);
    setCurrencyField(form, F.line10c, quarterlyInstallment);
    setCurrencyField(form, F.line10d, quarterlyInstallment);

    // Line 11: Estimated tax paid and withholding per quarter
    // Allocate withholding equally across quarters (IRS default assumption)
    const quarterlyWithholding = result.totalWithholding
      .dividedBy(4)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    // Engine doesn't track per-quarter estimated payments, so allocate equally
    const quarterlyEstimated = result.estimatedTaxPayments
      .dividedBy(4)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const quarterlyPayment = quarterlyWithholding.plus(quarterlyEstimated);
    setCurrencyField(form, F.line11a, quarterlyPayment);
    setCurrencyField(form, F.line11b, quarterlyPayment);
    setCurrencyField(form, F.line11c, quarterlyPayment);
    setCurrencyField(form, F.line11d, quarterlyPayment);

    // Line 19: Penalty
    setCurrencyField(form, F.line19, f2210.penalty);
  }

  return doc;
}

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, formName: string, line: string): Decimal | undefined {
  const found = result.allLines.find((l) => l.form === formName && l.line === line);
  return found?.value;
}

/** Exported field map for testing and inspection. */
export { FORM_2210_FIELDS as FORM_2210_FIELDS_MAP };

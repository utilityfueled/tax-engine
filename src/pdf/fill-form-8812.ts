/**
 * PDF filler for IRS Schedule 8812 — Credits for Qualifying Children
 * and Other Dependents.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/f1040s8.pdf', 'forms/filled/f1040s8-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8812Result } from "@/engine/forms/form-8812.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { d, zeroFloor, sum } from "@/utils/decimal.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule 8812 fillable PDF field inspection.

export const FORM_8812_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Child Tax Credit and Credit for Other Dependents ──
  line1: p1("f1_3[0]"),       // AGI from Form 1040 line 11a
  line2a: p1("f1_4[0]"),      // Puerto Rico excluded income
  line2b: p1("f1_5[0]"),      // Form 2555 lines 45 + 50
  line2c: p1("f1_6[0]"),      // Form 4563 line 15
  line2d: p1("f1_7[0]"),      // Sum of 2a-2c
  line3: p1("f1_8[0]"),       // Lines 1 + 2d
  line4: p1("f1_9[0]"),       // Number of qualifying children under 17
  line5: p1("f1_10[0]"),      // Line 4 × $2,200
  line6: p1("Line6ReadOrder[0].f1_11[0]"), // Number of other dependents
  line7: p1("f1_12[0]"),      // Line 6 × $500
  line8: p1("f1_13[0]"),      // Lines 5 + 7
  line9: p1("f1_14[0]"),      // Filing status threshold
  line10: p1("f1_15[0]"),     // Excess over threshold (rounded up to next $1,000)
  line11: p1("f1_16[0]"),     // Line 10 × 5%
  line12: p1("f1_17[0]"),     // CTC before limitation (Line 8 - Line 11)
  line12No: p1("c1_1[0]"),    // Line 12 "No" checkbox
  line12Yes: p1("c1_1[1]"),   // Line 12 "Yes" checkbox
  line13: p1("f1_18[0]"),     // Credit Limit Worksheet A amount
  line14: p1("f1_19[0]"),     // Nonrefundable CTC (smaller of line 12 or 13)

  // ── Part II-A: Additional Child Tax Credit for All Filers ──
  line15: p2("f2_1[0]"),      // Reserved for future use
  line16a: p2("f2_2[0]"),     // Line 12 - Line 14 (unused CTC)
  line16bCount: p2("f2_3[0]"),// Number of qualifying children
  line16b: p2("f2_4[0]"),     // Line 16b count × $1,700
  line17: p2("f2_5[0]"),      // Smaller of line 16a or 16b
  line18a: p2("f2_6[0]"),     // Earned income
  line18b: p2("f2_7[0]"),     // Nontaxable combat pay
  line19: p2("f2_8[0]"),      // Earned income - $2,500
  line19No: p2("c2_1[0]"),    // Line 19 "No" checkbox
  line19Yes: p2("c2_1[1]"),   // Line 19 "Yes" checkbox
  line20: p2("f2_9[0]"),      // 15% × line 19
  nextNo: p2("c2_2[0]"),      // Next question "No" checkbox
  nextYes: p2("c2_2[1]"),     // Next question "Yes" checkbox

  // ── Part II-B: Certain Filers with 3+ Qualifying Children ──
  line21: p2("f2_10[0]"),     // Withheld SS/Medicare taxes
  line22: p2("f2_11[0]"),     // Schedule 1 line 15 + Schedule 2 lines 5, 6, 13
  line23: p2("f2_12[0]"),     // Lines 21 + 22
  line24: p2("f2_13[0]"),     // Form 1040 line 27a + Schedule 3 line 11
  line25: p2("f2_14[0]"),     // Line 23 - Line 24
  line26: p2("f2_15[0]"),     // Larger of line 20 or line 25

  // ── Part II-C: Additional Child Tax Credit ──
  line27: p2("f2_16[0]"),     // ACTC amount
};

const F = FORM_8812_FIELDS;

/**
 * Fill Schedule 8812 PDF from engine results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8812(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const f8812 = result.form8812;

  if (!f8812) return doc;

  const filingStatus = input.taxpayer.filingStatus as FilingStatus;
  const constants = getConstants(input.taxpayer.taxYear);
  const ctc = constants.childTaxCredit;

  // ── Header ──
  const primary = input.taxpayer.primary;
  const spouse = input.taxpayer.spouse;
  const fullName = spouse
    ? `${primary.firstName} ${primary.lastName} & ${spouse.firstName} ${spouse.lastName}`
    : `${primary.firstName} ${primary.lastName}`;
  setTextField(form, F.name, fullName);
  setTextField(form, F.ssn, primary.ssn.replace(/-/g, ""));

  // ── Part I: Lines 1–14 ──

  // Line 1: AGI
  setCurrencyField(form, F.line1, result.agi);

  // Lines 2a–2d: Foreign income adjustments (usually 0)
  const form2555Exclusion = result.form2555
    ? result.form2555.foreignEarnedIncomeExclusion.plus(
        result.form2555.housingDeduction ?? new Decimal(0),
      )
    : new Decimal(0);
  if (!form2555Exclusion.isZero()) {
    setCurrencyField(form, F.line2b, form2555Exclusion);
  }
  const line2d = form2555Exclusion; // 2a and 2c are rarely used
  if (!line2d.isZero()) {
    setCurrencyField(form, F.line2d, line2d);
  }

  // Line 3: AGI + foreign adjustments
  const line3 = result.agi.plus(line2d);
  setCurrencyField(form, F.line3, line3);

  // Line 4: Number of qualifying children under 17
  const qualifyingChildren = input.taxpayer.dependents.filter(
    (dep) => dep.qualifiesForCTC,
  ).length;
  setTextField(form, F.line4, qualifyingChildren > 0 ? String(qualifyingChildren) : "");

  // Line 5: Children × per-child credit
  const line5 = ctc.perChild.times(qualifyingChildren);
  setCurrencyField(form, F.line5, line5);

  // Line 6: Number of other dependents
  const otherDependents = input.taxpayer.dependents.filter(
    (dep) => dep.qualifiesForODC && !dep.qualifiesForCTC,
  ).length;
  setTextField(form, F.line6, otherDependents > 0 ? String(otherDependents) : "");

  // Line 7: Other dependents × $500
  const line7 = ctc.otherDependentCredit.times(otherDependents);
  setCurrencyField(form, F.line7, line7);

  // Line 8: Total credits before limitation
  const line8 = line5.plus(line7);
  setCurrencyField(form, F.line8, line8);

  // Line 9: Filing status threshold
  const threshold = ctc.phaseOutThreshold[filingStatus];
  setCurrencyField(form, F.line9, threshold);

  // Line 10: Excess over threshold (rounded up to next $1,000)
  const rawExcess = line3.minus(threshold);
  let line10 = new Decimal(0);
  if (rawExcess.gt(0)) {
    const thousandsOver = rawExcess.dividedBy(1000).ceil();
    line10 = thousandsOver.times(1000);
  }
  setCurrencyField(form, F.line10, line10);

  // Line 11: 5% phase-out reduction
  const line11 = line10.times(d("0.05"));
  setCurrencyField(form, F.line11, line11);

  // Line 12: Is line 8 > line 11?
  const line12IsYes = line8.gt(line11);
  setCheckBox(form, F.line12No, !line12IsYes);
  setCheckBox(form, F.line12Yes, line12IsYes);
  if (line12IsYes) {
    setCurrencyField(form, F.line12, f8812.ctcBeforeLimitation);
  }

  // Line 13: Credit Limit Worksheet A (tax liability after other credits)
  // Reconstruct: tax before credits minus other credits = what engine passes as taxLiability
  const taxAfterOtherCredits = zeroFloor(
    result.totalTaxBeforeCredits.minus(result.otherCredits),
  );
  setCurrencyField(form, F.line13, taxAfterOtherCredits);

  // Line 14: Nonrefundable CTC
  setCurrencyField(form, F.line14, f8812.nonrefundableCTC);

  // ── Part II-A: Additional Child Tax Credit (Lines 15–20) ──

  // Line 15: Reserved — leave blank

  // Line 16a: Unused CTC (Line 12 - Line 14)
  if (f8812.unusedCTC.gt(0)) {
    setCurrencyField(form, F.line16a, f8812.unusedCTC);

    // Line 16b: Qualifying children × $1,700
    const maxRefundablePerChild = d(1700);
    const line16bAmount = maxRefundablePerChild.times(qualifyingChildren);
    setTextField(form, F.line16bCount, qualifyingChildren > 0 ? String(qualifyingChildren) : "");
    setCurrencyField(form, F.line16b, line16bAmount);

    // Line 17: Smaller of 16a or 16b
    const line17 = Decimal.min(f8812.unusedCTC, line16bAmount);
    setCurrencyField(form, F.line17, line17);

    // Line 18a: Earned income
    // Per §32(c)(2): W-2 wages + net SE earnings - deductible half SE tax
    const totalWages = (input.w2s ?? []).reduce(
      (acc, w2) => acc.plus(d(w2.wages)),
      new Decimal(0),
    );
    const netSEEarnings = result.scheduleSE?.netSEEarnings ?? new Decimal(0);
    const deductibleHalf = result.scheduleSE?.deductibleHalf ?? new Decimal(0);
    const earnedIncome = sum(totalWages, netSEEarnings).minus(deductibleHalf);
    setCurrencyField(form, F.line18a, earnedIncome);

    // Line 19: Is earned income > $2,500?
    const earnedIncomeThreshold = d(2500);
    const line19IsYes = earnedIncome.gt(earnedIncomeThreshold);
    setCheckBox(form, F.line19No, !line19IsYes);
    setCheckBox(form, F.line19Yes, line19IsYes);
    if (line19IsYes) {
      setCurrencyField(form, F.line19, f8812.earnedIncomeExcess);
    }

    // Line 20: 15% of line 19
    setCurrencyField(form, F.line20, f8812.fifteenPercent);

    // Next question: Is line 16b $5,100 or more? (3+ children)
    const has3PlusChildren = line16bAmount.gte(5100);
    setCheckBox(form, F.nextNo, !has3PlusChildren);
    setCheckBox(form, F.nextYes, has3PlusChildren);

    // ── Part II-B: 3+ Qualifying Children (Lines 21–26) ──
    if (has3PlusChildren && f8812.fifteenPercent.lt(line17)) {
      // Line 21: SS + Medicare taxes withheld from W-2s
      const ssMedicareWithheld = (input.w2s ?? []).reduce(
        (acc, w2) =>
          acc.plus(d(w2.socialSecurityWithheld)).plus(d(w2.medicareWithheld)),
        new Decimal(0),
      );
      setCurrencyField(form, F.line21, ssMedicareWithheld);

      // Line 22: Schedule 1 line 15 + Schedule 2 lines 5, 6, 13
      const sched1Line15 = result.schedule1?.seDeduction ?? new Decimal(0);
      const sched2Line5 = result.schedule2?.unreportedSSTax ?? new Decimal(0);
      const sched2Line6 = result.schedule2?.form8919Tax ?? new Decimal(0);
      // Schedule 2 Line 13 (uncollected SS/Medicare) is not separately tracked in result
      const line22 = sum(sched1Line15, sched2Line5, sched2Line6);
      setCurrencyField(form, F.line22, line22);

      // Line 23: Lines 21 + 22
      const line23 = ssMedicareWithheld.plus(line22);
      setCurrencyField(form, F.line23, line23);

      // Line 24: Form 1040 line 27a (EIC) + Schedule 3 line 11 (excess SS withholding)
      const eic = result.earnedIncomeCredit;
      const sched3Line11 = result.schedule3?.excessSSWithholding ?? new Decimal(0);
      const line24 = eic.plus(sched3Line11);
      setCurrencyField(form, F.line24, line24);

      // Line 25: Line 23 - Line 24
      const line25 = zeroFloor(line23.minus(line24));
      setCurrencyField(form, F.line25, line25);

      // Line 26: Larger of line 20 or line 25
      const line26 = Decimal.max(f8812.fifteenPercent, line25);
      setCurrencyField(form, F.line26, line26);
    }
  }

  // ── Part II-C: Line 27 — ACTC ──
  setCurrencyField(form, F.line27, f8812.actc);

  return doc;
}

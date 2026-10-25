import { validateQofDispositionFacts } from "@/engine/forms/qof-disposition-facts.js";
import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule D (Form 1040) — Capital Gains and Losses.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule D uses "topmostSubform[0]" as root.
 *
 * Part I: Short-Term (Lines 1a-7)
 * Part II: Long-Term (Lines 8a-15)
 * Part III: Summary (Lines 16-22, Page 2)
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
const p1PartI = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_PartI[0].${row}.${n}`;
const p1PartII = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_PartII[0].${row}.${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule D fillable PDF field inspection.
//
// Part I table rows have 4 columns each:
//   col (d) = proceeds, (e) = cost basis, (f) = adjustments, (g) = gain/loss
// Part II table rows follow the same pattern for long-term.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // Actual QOF-investment disposition question (unknown until sourced)
  qofDispositionYes: p1("c1_1[0]"),
  qofDispositionNo: p1("c1_1[1]"),

  // ── Part I: Short-Term Capital Gains and Losses ──
  // Line 1a: Eligible transactions not reported on Form8949
  line1aProceeds: p1PartI("Row1a[0]", "f1_3[0]"),
  line1aCostBasis: p1PartI("Row1a[0]", "f1_4[0]"),
  line1aAdjustments: p1PartI("Row1a[0]", "f1_5[0]"),
  line1aGainLoss: p1PartI("Row1a[0]", "f1_6[0]"),

  // Line 1b: Form8949 BoxA/G (basis reported)
  line1bProceeds: p1PartI("Row1b[0]", "f1_7[0]"),
  line1bCostBasis: p1PartI("Row1b[0]", "f1_8[0]"),
  line1bAdjustments: p1PartI("Row1b[0]", "f1_9[0]"),
  line1bGainLoss: p1PartI("Row1b[0]", "f1_10[0]"),

  // Line 2: Form8949 BoxB/H (basis not reported)
  line2Proceeds: p1PartI("Row2[0]", "f1_11[0]"),
  line2CostBasis: p1PartI("Row2[0]", "f1_12[0]"),
  line2Adjustments: p1PartI("Row2[0]", "f1_13[0]"),
  line2GainLoss: p1PartI("Row2[0]", "f1_14[0]"),

  // Line 3: Form8949 BoxC/I (not reported on1099B/DA)
  line3Proceeds: p1PartI("Row3[0]", "f1_15[0]"),
  line3CostBasis: p1PartI("Row3[0]", "f1_16[0]"),
  line3Adjustments: p1PartI("Row3[0]", "f1_17[0]"),
  line3GainLoss: p1PartI("Row3[0]", "f1_18[0]"),

  // Line 4: Short-term gain/loss from other forms
  line4: p1("f1_19[0]"),
  // Line 5: Net short-term gain from partnerships/S-corps/estates/trusts (K-1s)
  line5: p1("f1_20[0]"),
  // Line 6: Short-term capital loss carryover
  line6: p1("f1_21[0]"),
  // Line 7: Net short-term capital gain or loss
  line7: p1("f1_22[0]"),

  // ── Part II: Long-Term Capital Gains and Losses ──
  // Line 8a: Eligible transactions not reported on Form8949
  line8aProceeds: p1PartII("Row8a[0]", "f1_23[0]"),
  line8aCostBasis: p1PartII("Row8a[0]", "f1_24[0]"),
  line8aAdjustments: p1PartII("Row8a[0]", "f1_25[0]"),
  line8aGainLoss: p1PartII("Row8a[0]", "f1_26[0]"),

  // Line 8b: Form8949 BoxD/J (basis reported)
  line8bProceeds: p1PartII("Row8b[0]", "f1_27[0]"),
  line8bCostBasis: p1PartII("Row8b[0]", "f1_28[0]"),
  line8bAdjustments: p1PartII("Row8b[0]", "f1_29[0]"),
  line8bGainLoss: p1PartII("Row8b[0]", "f1_30[0]"),

  // Line 9: Form8949 BoxE/K (basis not reported)
  line9Proceeds: p1PartII("Row9[0]", "f1_31[0]"),
  line9CostBasis: p1PartII("Row9[0]", "f1_32[0]"),
  line9Adjustments: p1PartII("Row9[0]", "f1_33[0]"),
  line9GainLoss: p1PartII("Row9[0]", "f1_34[0]"),

  // Line 10: Form8949 BoxF/L (not reported on1099B/DA)
  line10Proceeds: p1PartII("Row10[0]", "f1_35[0]"),
  line10CostBasis: p1PartII("Row10[0]", "f1_36[0]"),
  line10Adjustments: p1PartII("Row10[0]", "f1_37[0]"),
  line10GainLoss: p1PartII("Row10[0]", "f1_38[0]"),

  // Line 11: Long-term gain/loss from other forms
  line11: p1("f1_39[0]"),
  // Line 12: Net long-term gain from partnerships/S-corps/estates/trusts
  line12: p1("f1_40[0]"),
  // Line 13: Capital gain distributions (1099-DIV Box 2a and child8814Line10)
  line13: p1("f1_41[0]"),
  // Line 14: Long-term capital loss carryover
  line14: p1("f1_42[0]"),
  // Line 15: Net long-term capital gain or loss
  line15: p1("f1_43[0]"),

  // ── Part III: Summary (Page 2) ──
  // Line 16: Combine lines 7 and 15 → net capital gain/loss
  line16: p2("f2_1[0]"),
  // Line 17: Both line 15 and line 16 are gains? (checkbox pair)
  line17Yes: p2("c2_1[0]"),
  line17No: p2("c2_1[1]"),
  // Line 18: 28% rate gain worksheet (if applicable)
  line18: p2("f2_2[0]"),
  // Line 19: Unrecaptured section 1250 gain
  line19: p2("f2_3[0]"),
  // Line 20: Lines18/19 both zero or blank AND no Form4952?
  line20Yes: p2("c2_2[0]"),
  line20No: p2("c2_2[1]"),
  // Line 21: Capital loss deduction (limited amount, shown as positive)
  line21: p2("f2_4[0]"),
  // Line 22: Qualified dividends on1040line3a?
  line22Yes: p2("c2_3[0]"),
  line22No: p2("c2_3[1]"),
} as const;

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, formName: string, line: string): Decimal | undefined {
  return result.allLines.find((item) => item.form === formName && item.line === line)?.value;
}

/** Fill the review-only ScheduleD from calculated, year-matched audit records. */
export async function fillScheduleD(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const qofDisposition = validateQofDispositionFacts(input.qofDispositionFacts, input.taxpayer.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sd = result.scheduleD;
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  if (!sd) return doc;

  // An omitted answer remains unknown. A positive event needs its actual method.
  if (qofDisposition === false) setCheckBox(form, F.qofDispositionNo, true);

  // Every current8949 transaction is reported there: use1b/2/8b/9, not1a/8a.
  for (const [category, fields] of [
    ["Part I Box A", [F.line1bProceeds, F.line1bCostBasis, F.line1bAdjustments, F.line1bGainLoss]],
    ["Part I Box B", [F.line2Proceeds, F.line2CostBasis, F.line2Adjustments, F.line2GainLoss]],
    ["Part II Box D", [F.line8bProceeds, F.line8bCostBasis, F.line8bAdjustments, F.line8bGainLoss]],
    ["Part II Box E", [F.line9Proceeds, F.line9CostBasis, F.line9Adjustments, F.line9GainLoss]],
    ["Part II Box F", [F.line10Proceeds, F.line10CostBasis, F.line10Adjustments, F.line10GainLoss]],
  ] as const) {
    const line = result.allLines.find(item => item.form === "Form 8949" && item.line === category);
    if (!line) continue;
    const values = [line.inputs.proceeds, line.inputs.cost, line.inputs.adjustments, line.value];
    values.forEach((value, index) => {
      if (value !== undefined) {
        if (!Decimal.isDecimal(value)) throw new Error("Form8949 monetary audit inputs must be Decimal values");
        setCurrencyField(form, fields[index], value);
      }
    });
  }
  for (const [line, field] of [["4", F.line4], ["5", F.line5], ["11", F.line11], ["12", F.line12], ["13", F.line13]] as const) {
    const value = getLineValue(result, "Sched D", line);
    if (value !== undefined) setCurrencyField(form, field, value);
  }
  // These fields already have parentheses printed on the physical form.
  for (const [line, field] of [["6", F.line6], ["14", F.line14]] as const) {
    const value = getLineValue(result, "Sched D", line);
    if (value !== undefined) setCurrencyField(form, field, value.abs());
  }
  setCurrencyField(form, F.line7, sd.netShortTerm);
  setCurrencyField(form, F.line15, sd.netLongTerm);
  setCurrencyField(form, F.line16, sd.netCapitalGainLoss);

  // Only net gains reach17. Loss/zero paths skip17-20.
  const bothGains = sd.netLongTerm.gt(0) && sd.netCapitalGainLoss.gt(0);
  if (sd.netCapitalGainLoss.gt(0)) {
    setCheckBox(form, F.line17Yes, bothGains);
    setCheckBox(form, F.line17No, !bothGains);
  }
  if (bothGains) {
    const line18 = getLineValue(result, "Sched D", "18");
    const line19 = getLineValue(result, "Sched D", "19");
    if (line18 !== undefined) setCurrencyField(form, F.line18, line18);
    if (line19 !== undefined) setCurrencyField(form, F.line19, line19);
    // A missing special-gain worksheet is unknown, not a zero certificate.
    if (result.form4952 || (line18 !== undefined && line19 !== undefined)) {
      const ordinaryWorksheet = !result.form4952 && line18?.isZero() === true && line19?.isZero() === true;
      setCheckBox(form, F.line20Yes, ordinaryWorksheet);
      setCheckBox(form, F.line20No, !ordinaryWorksheet);
    }
  }
  if (sd.netCapitalGainLoss.lt(0)) {
    setCurrencyField(form, F.line21, sd.capitalLossDeduction.abs());
  }
  // Both-gain paths stop at20; otherwise22 asks only about qualified dividends.
  if (!bothGains) {
    const hasQualifiedDividends = result.qualifiedDividends.gt(0);
    setCheckBox(form, F.line22Yes, hasQualifiedDividends);
    setCheckBox(form, F.line22No, !hasQualifiedDividends);
  }
  return doc;
}

export { FIELDS as SCHEDULE_D_FIELDS };

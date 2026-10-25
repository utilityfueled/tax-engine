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

  // Did you file Form 8949? (checkbox pair)
  form8949Yes: p1("c1_1[0]"),
  form8949No: p1("c1_1[1]"),

  // ── Part I: Short-Term Capital Gains and Losses ──
  // Line 1a: Totals from Form 8949 Box A (basis reported to IRS)
  line1aProceeds: p1PartI("Row1a[0]", "f1_3[0]"),
  line1aCostBasis: p1PartI("Row1a[0]", "f1_4[0]"),
  line1aAdjustments: p1PartI("Row1a[0]", "f1_5[0]"),
  line1aGainLoss: p1PartI("Row1a[0]", "f1_6[0]"),

  // Line 1b: Totals from Form 8949 Box B (basis NOT reported to IRS)
  line1bProceeds: p1PartI("Row1b[0]", "f1_7[0]"),
  line1bCostBasis: p1PartI("Row1b[0]", "f1_8[0]"),
  line1bAdjustments: p1PartI("Row1b[0]", "f1_9[0]"),
  line1bGainLoss: p1PartI("Row1b[0]", "f1_10[0]"),

  // Line 2: Totals from Form 8949 Box C (no form 1099-B)
  line2Proceeds: p1PartI("Row2[0]", "f1_11[0]"),
  line2CostBasis: p1PartI("Row2[0]", "f1_12[0]"),
  line2Adjustments: p1PartI("Row2[0]", "f1_13[0]"),
  line2GainLoss: p1PartI("Row2[0]", "f1_14[0]"),

  // Line 3: Short-term gain from installment sales (Form 6252)
  line3Proceeds: p1PartI("Row3[0]", "f1_15[0]"),
  line3CostBasis: p1PartI("Row3[0]", "f1_16[0]"),
  line3Adjustments: p1PartI("Row3[0]", "f1_17[0]"),
  line3GainLoss: p1PartI("Row3[0]", "f1_18[0]"),

  // Line 4: Short-term gain from like-kind exchanges (Form 8824)
  line4: p1("f1_19[0]"),
  // Line 5: Net short-term gain from partnerships/S-corps/estates/trusts (K-1s)
  line5: p1("f1_20[0]"),
  // Line 6: Short-term capital loss carryover
  line6: p1("f1_21[0]"),
  // Line 7: Net short-term capital gain or loss
  line7: p1("f1_22[0]"),

  // ── Part II: Long-Term Capital Gains and Losses ──
  // Line 8a: Totals from Form 8949 Box D (basis reported to IRS)
  line8aProceeds: p1PartII("Row8a[0]", "f1_23[0]"),
  line8aCostBasis: p1PartII("Row8a[0]", "f1_24[0]"),
  line8aAdjustments: p1PartII("Row8a[0]", "f1_25[0]"),
  line8aGainLoss: p1PartII("Row8a[0]", "f1_26[0]"),

  // Line 8b: Totals from Form 8949 Box E (basis NOT reported to IRS)
  line8bProceeds: p1PartII("Row8b[0]", "f1_27[0]"),
  line8bCostBasis: p1PartII("Row8b[0]", "f1_28[0]"),
  line8bAdjustments: p1PartII("Row8b[0]", "f1_29[0]"),
  line8bGainLoss: p1PartII("Row8b[0]", "f1_30[0]"),

  // Line 9: Totals from Form 8949 Box F (no form 1099-B)
  line9Proceeds: p1PartII("Row9[0]", "f1_31[0]"),
  line9CostBasis: p1PartII("Row9[0]", "f1_32[0]"),
  line9Adjustments: p1PartII("Row9[0]", "f1_33[0]"),
  line9GainLoss: p1PartII("Row9[0]", "f1_34[0]"),

  // Line 10: Long-term gain from installment sales (Form 6252)
  line10Proceeds: p1PartII("Row10[0]", "f1_35[0]"),
  line10CostBasis: p1PartII("Row10[0]", "f1_36[0]"),
  line10Adjustments: p1PartII("Row10[0]", "f1_37[0]"),
  line10GainLoss: p1PartII("Row10[0]", "f1_38[0]"),

  // Line 11: Long-term gain from like-kind exchanges (Form 8824)
  line11: p1("f1_39[0]"),
  // Line 12: Net long-term gain from partnerships/S-corps/estates/trusts
  line12: p1("f1_40[0]"),
  // Line 13: Capital gain distributions (1099-DIV Box 2a) / QSBS exclusion
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
  // Line 20: Are lines 18 and 19 both zero? (checkbox pair)
  line20Yes: p2("c2_2[0]"),
  line20No: p2("c2_2[1]"),
  // Line 21: Capital loss deduction (limited amount, shown as positive)
  line21: p2("f2_4[0]"),
  // Line 22: Qualified dividends and capital gain tax worksheet? (checkbox pair)
  line22Yes: p2("c2_3[0]"),
  line22No: p2("c2_3[1]"),
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/** Look up a calculated line value from the audit trail. */
function getLineValue(result: TaxReturnResult, formName: string, line: string): Decimal | undefined {
  return result.allLines.find((l) => l.form === formName && l.line === line)?.value;
}

/**
 * Fill IRS Schedule D PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleD(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const sd = result.scheduleD;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!sd) return doc;

  // Did you file Form 8949?
  setCheckBox(form, F.form8949Yes, true);

  // ── Part I: Short-Term ──
  // Pull Form 8949 aggregates from audit trail
  const f8949 = result.allLines.filter((l) => l.form === "Form 8949");

  // Line 1a: Form 8949 Box A short-term (basis reported)
  const stBoxAGain = getLineValue(result, "Form 8949", "1a-gain");
  const stBoxAProceeds = getLineValue(result, "Form 8949", "1a-proceeds");
  const stBoxACost = getLineValue(result, "Form 8949", "1a-cost");
  if (stBoxAProceeds) setCurrencyField(form, F.line1aProceeds, stBoxAProceeds);
  if (stBoxACost) setCurrencyField(form, F.line1aCostBasis, stBoxACost);
  if (stBoxAGain) setCurrencyField(form, F.line1aGainLoss, stBoxAGain);

  // Line 1b: Form 8949 Box B short-term (basis NOT reported)
  const stBoxBGain = getLineValue(result, "Form 8949", "1b-gain");
  const stBoxBProceeds = getLineValue(result, "Form 8949", "1b-proceeds");
  const stBoxBCost = getLineValue(result, "Form 8949", "1b-cost");
  if (stBoxBProceeds) setCurrencyField(form, F.line1bProceeds, stBoxBProceeds);
  if (stBoxBCost) setCurrencyField(form, F.line1bCostBasis, stBoxBCost);
  if (stBoxBGain) setCurrencyField(form, F.line1bGainLoss, stBoxBGain);

  // Line 5: K-1 short-term from audit trail
  const line5 = getLineValue(result, "Sched D", "5");
  if (line5) setCurrencyField(form, F.line5, line5);

  // Line 6: Short-term capital loss carryover
  const line6 = getLineValue(result, "Sched D", "6");
  if (line6) setCurrencyField(form, F.line6, line6);

  // Line 7: Net short-term capital gain or loss
  setCurrencyField(form, F.line7, sd.netShortTerm);

  // ── Part II: Long-Term ──
  // Line 8a: Form 8949 Box D long-term (basis reported)
  const ltBoxDGain = getLineValue(result, "Form 8949", "8a-gain");
  const ltBoxDProceeds = getLineValue(result, "Form 8949", "8a-proceeds");
  const ltBoxDCost = getLineValue(result, "Form 8949", "8a-cost");
  if (ltBoxDProceeds) setCurrencyField(form, F.line8aProceeds, ltBoxDProceeds);
  if (ltBoxDCost) setCurrencyField(form, F.line8aCostBasis, ltBoxDCost);
  if (ltBoxDGain) setCurrencyField(form, F.line8aGainLoss, ltBoxDGain);

  // Line 8b: Form 8949 Box E long-term (basis NOT reported)
  const ltBoxEGain = getLineValue(result, "Form 8949", "8b-gain");
  const ltBoxEProceeds = getLineValue(result, "Form 8949", "8b-proceeds");
  const ltBoxECost = getLineValue(result, "Form 8949", "8b-cost");
  if (ltBoxEProceeds) setCurrencyField(form, F.line8bProceeds, ltBoxEProceeds);
  if (ltBoxECost) setCurrencyField(form, F.line8bCostBasis, ltBoxECost);
  if (ltBoxEGain) setCurrencyField(form, F.line8bGainLoss, ltBoxEGain);

  // Line 12: K-1 long-term from audit trail
  const line12 = getLineValue(result, "Sched D", "12");
  if (line12) setCurrencyField(form, F.line12, line12);

  // Line 13: Capital gain distributions / QSBS exclusion
  const line13 = getLineValue(result, "Sched D", "13");
  if (line13) setCurrencyField(form, F.line13, line13);

  // Line 14: Long-term capital loss carryover
  const line14 = getLineValue(result, "Sched D", "14");
  if (line14) setCurrencyField(form, F.line14, line14);

  // Line 15: Net long-term capital gain or loss
  setCurrencyField(form, F.line15, sd.netLongTerm);

  // ── Part III: Summary (Page 2) ──
  // Line 16: Net capital gain/loss
  setCurrencyField(form, F.line16, sd.netCapitalGainLoss);

  // Line 17: Both line 15 and line 16 positive?
  const bothGains = sd.netLongTerm.gt(0) && sd.netCapitalGainLoss.gt(0);
  setCheckBox(form, F.line17Yes, bothGains);
  setCheckBox(form, F.line17No, !bothGains);

  // Line 21: Capital loss deduction (if net loss)
  if (sd.netCapitalGainLoss.lt(0)) {
    // Capital loss deduction is shown as a positive number in parentheses
    setCurrencyField(form, F.line21, sd.capitalLossDeduction.abs());
  }

  // Line 22: Use QDCG worksheet? (Yes when there are qualified dividends or net capital gains)
  const useQDCG = sd.netCapitalGainLoss.gt(0) || result.qualifiedDividends.gt(0);
  setCheckBox(form, F.line22Yes, useQDCG);
  setCheckBox(form, F.line22No, !useQDCG);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_D_FIELDS };

import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 6251 — Alternative Minimum Tax (Individuals).
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Page 1: "topmostSubform[0].Page1[0]" (Part I + Part II)
 * Page 2: "topmostSubform[0].Page2[0]" (Part III — capital gains rates)
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { form8949ReviewCalculation, type PreparedForm8949Review } from "../../form-8949-review-context.js";
import type { PreparedQbiLossReview } from "../../qbi-loss-review-context.js";
import type { PreparedCodNolReview } from "../../cod-nol-review-context.js";
import { requiresCharitableNolReview, type PreparedCharitableReview } from "../../charitable-review-context.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 6251 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Alternative Minimum Taxable Income ──
  line1a: p1("f1_3[0]"),  // Form1040 line14 minus Schedule1A line37
  line1b: p1("f1_4[0]"),  // Taxable income (1040 Line 11b minus Line 1a)
  line2a: p1("f1_5[0]"),  // SALT from Schedule A, line 7 (or standard deduction amount)
  line2b: p1("f1_6[0]"),  // Tax refund from Schedule 1 (parentheses)
  line2c: p1("f1_7[0]"),  // Investment interest expense (reg vs AMT difference)
  line2d: p1("f1_8[0]"),  // Depletion (difference between reg and AMT)
  line2e: p1("f1_9[0]"),  // NOL deduction from Schedule 1, line 8a
  line2f: p1("f1_10[0]"), // Alternative tax NOL deduction (parentheses)
  line2g: p1("f1_11[0]"), // Private activity bond interest
  line2h: p1("f1_12[0]"), // Qualified small business stock
  line2i: p1("f1_13[0]"), // Incentive stock options (excess AMT over reg)
  line2j: p1("f1_14[0]"), // Estates and trusts (K-1 Form 1041, box 12, code A)
  line2k: p1("f1_15[0]"), // Disposition of property (AMT vs reg gain/loss diff)
  line2l: p1("f1_16[0]"), // Depreciation on post-1986 assets (reg vs AMT diff)
  line2m: p1("f1_17[0]"), // Passive activities (AMT vs reg difference)
  line2n: p1("f1_18[0]"), // Loss limitations (AMT vs reg difference)
  line2o: p1("f1_19[0]"), // Circulation costs
  line2p: p1("f1_20[0]"), // Long-term contracts
  line2q: p1("f1_21[0]"), // Mining costs
  line2r: p1("f1_22[0]"), // Research and experimental costs
  line2s: p1("f1_23[0]"), // Installment sales before 1/1/1987 (parentheses)
  line2t: p1("f1_24[0]"), // Intangible drilling costs preference
  line3:  p1("f1_25[0]"), // Other adjustments
  line4:  p1("f1_26[0]"), // AMTI (combine lines 1b through 3)

  // ── Part II: Alternative Minimum Tax ──
  line5:  p1("f1_27[0]"), // Exemption amount
  line6:  p1("f1_28[0]"), // AMTI minus exemption (AMT base)
  line7:  p1("f1_29[0]"), // Tax computation (26%/28% or Part III)
  line8:  p1("f1_30[0]"), // AMT foreign tax credit
  line9:  p1("f1_31[0]"), // Tentative minimum tax (Line 7 - Line 8)
  line10: p1("f1_32[0]"), // Regular tax (1040 Line 16 + Sched 2 Line 1z - Sched 3 Line 1)
  line11: p1("f1_33[0]"), // AMT = max(0, Line 9 - Line 10) → Schedule 2 Line 2

  // ── Part III: Tax Computation Using Maximum Capital Gains Rates ──
  line12: p2("f2_1[0]"),  // Amount from Line 6
  line13: p2("f2_2[0]"),  // QDCG worksheet line 4 or Sched D worksheet line 13
  line14: p2("f2_3[0]"),  // Sched D line 19 (unrecaptured section 1250 gain)
  line15: p2("f2_4[0]"),  // Min of (line 13 + line 14) or Sched D worksheet line 10
  line16: p2("f2_5[0]"),  // Smaller of line 12 or line 15
  line17: p2("f2_6[0]"),  // Line 12 minus line 16 (ordinary portion)
  line18: p2("f2_7[0]"),  // 26%/28% tax on line 17
  line19: p2("f2_8[0]"),  // 0% threshold
  line20: p2("f2_9[0]"),  // Regular-tax ordinary income
  line21: p2("f2_10[0]"), // Line 19 minus line 20 (zero floor)
  line22: p2("f2_11[0]"), // Smaller of line 12 or line 13
  line23: p2("f2_12[0]"), // Smaller of line 21 or line 22 (taxed at 0%)
  line24: p2("f2_13[0]"), // Line 22 minus line 23
  line25: p2("f2_14[0]"), // 15% threshold
  line26: p2("f2_15[0]"), // Amount from line 21
  line27: p2("f2_16[0]"), // QDCG worksheet line 5 or Sched D worksheet line 21
  line28: p2("f2_17[0]"), // Line 26 + line 27
  line29: p2("f2_18[0]"), // Line 25 minus line 28 (zero floor)
  line30: p2("f2_19[0]"), // Smaller of line 24 or line 29
  line31: p2("f2_20[0]"), // Line 30 × 15%
  line32: p2("f2_21[0]"), // Line 23 + line 30
  line33: p2("f2_22[0]"), // Line 22 minus line 32
  line34: p2("f2_23[0]"), // Line 33 × 20%
  line35: p2("f2_24[0]"), // Lines 17 + 32 + 33
  line36: p2("f2_25[0]"), // Line 12 minus line 35
  line37: p2("f2_26[0]"), // Line 36 × 25%
  line38: p2("f2_27[0]"), // Lines 18 + 31 + 34 + 37
  line39: p2("f2_28[0]"), // 26%/28% tax on line 12
  line40: p2("f2_29[0]"), // Smaller of line 38 or line 39 → Line 7
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 6251 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm6251(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
  capitalGainReview?: PreparedForm8949Review,
  codNolReview?: PreparedCodNolReview,
  charitableReview?: PreparedCharitableReview,
  qbiLossReview?: PreparedQbiLossReview,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  if (requiresCharitableNolReview(input, result) || (input.form172 && input.qbiLossSources)
    || result.form172?.k1Sources || result.allLines.some(line => line.form === "Current Form172 K1 sources")) {
    buildNetOperatingLossReview(input, result, capitalGainReview, codNolReview, charitableReview, qbiLossReview);
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const f6251 = result.form6251;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f6251) return doc;

  const audited = new Map<string, Decimal>();
  for (const entry of f6251.lines) {
    if (entry.form !== "Form 6251") continue;
    if (audited.has(entry.line) || !Decimal.isDecimal(entry.value) || !entry.value.isFinite()) {
      throw new Error(`Form6251 invalid or duplicate audit line ${entry.line}`);
    }
    audited.set(entry.line, entry.value);
  }
  const required = (id: string): Decimal => {
    const value = audited.get(id);
    if (!value) throw new Error(`Form6251 requires a unique finite audit line ${id}`);
    return value;
  };
  for (const id of ["1b", "2a", "2g", "4", "5", "6", "7", "9", "10", "11"]) required(id);
  if (input.section1202Sources || audited.get("2h")?.gt(0)) {
    const source = form8949ReviewCalculation(input, capitalGainReview).section1202;
    if (!source || !required("2h").eq(source.amtPreference.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))) {
      throw new Error("Form6251 QSBS line2h does not reconcile with its original source calculation");
    }
  }
  for (const [id, value] of [["4", f6251.amti], ["5", f6251.exemption], ["6", f6251.amtBase],
    ["9", f6251.tentativeMinimumTax], ["11", f6251.amt]] as const) {
    if (!required(id).eq(value)) throw new Error(`Form6251 line${id} audit does not reconcile with its result`);
  }
  const directCredit = result.foreignTaxDirectCredit;
  const ordinaryCredit = result.foreignTaxOrdinaryCredit;
  if (input.foreignTaxElection?.creditWithForm1116 || ordinaryCredit
    || result.allLines.some(row => row.form === "AMT Form 1116 (actual passive)")) {
    if (!ordinaryCredit || directCredit || !ordinaryCredit.regular.creditAllowed.eq(result.foreignTaxCredit)) {
      throw new Error("Form6251 ordinary foreign credit requires its matching canonical source result");
    }
    const sourceValue = (formName: string, id: string): Decimal => {
      const source = ordinaryCredit.lines.filter(row => row.form === formName && row.line === id);
      const canonical = result.allLines.filter(row => row.form === formName && row.line === id);
      if (source.length !== 1 || canonical.length !== 1 || !source[0].value.isFinite()
        || !source[0].value.eq(canonical[0].value)) throw new Error("Form6251 ordinary foreign credit requires a unique matching source audit");
      return source[0].value;
    };
    if (!sourceValue("Form 1116 (actual passive)", "35").eq(ordinaryCredit.regular.creditAllowed)
      || !sourceValue("AMT Form 1116 (actual passive)", "35").eq(ordinaryCredit.amt.creditAllowed)
      || !required("8").eq(ordinaryCredit.amt.creditAllowed)
      || !required("7").eq(sourceValue("AMT Form 1116 (actual passive)", "20"))
      || !required("9").eq(required("7").minus(required("8")))
      || !required("10").eq(sourceValue("Form 1116 (actual passive)", "20").minus(ordinaryCredit.regular.creditAllowed))) {
      throw new Error("Form6251 ordinary foreign credits do not reconcile with their separate source audits");
    }
  }
  if (input.netOperatingLoss || result.netOperatingLoss) {
    buildNetOperatingLossReview(input, result, capitalGainReview, codNolReview, charitableReview, qbiLossReview);
    if (!result.netOperatingLoss || !required("2e").eq(result.nolDeduction)
      || !required("2f").eq(result.netOperatingLoss.alternativeTax.deduction.negated())) {
      throw new Error("Form6251 NOL source amounts do not reconcile with the audited adjustments");
    }
  }
  if (directCredit) {
    if (!directCredit.creditAllowed.eq(result.foreignTaxCredit)) throw new Error("Form6251 elected foreign credit does not reconcile with its canonical source result");
    if (result.form8801 || result.form3800 || required("10").lt(required("7"))) required("8");
    if ((audited.has("8") && !required("8").eq(directCredit.creditAllowed))
      || !required("9").eq(Decimal.max(0, required("7").minus(audited.get("8") ?? new Decimal(0))))) {
      throw new Error("Form6251 elected foreign credit does not reconcile with its AMT audit");
    }
  }
  const auditSenior = result.schedule1A?.seniorDeduction ?? new Decimal(0);
  if (!required("1b").eq(f6251.taxableIncome.plus(auditSenior))) {
    throw new Error("Form6251 line1b does not match its signed source income and senior deduction");
  }
  if (audited.has("2c") && !required("2c").eq(f6251.investmentInterestAdjustment)) {
    throw new Error("Form6251 line2c does not reconcile with its actual signed investment adjustment");
  }
  if (audited.has("40")) {
    for (let line = 12; line <= 40; line++) required(String(line));
    if (!required("40").eq(required("7")) || !required("12").eq(required("6"))) {
      throw new Error("Form6251 PartIII does not reconcile with its AMT base and tax");
    }
  }
  for (const [key, field] of Object.entries(F)) {
    if (!key.startsWith("line")) continue;
    const value = audited.get(key.slice(4));
    if (value !== undefined) setCurrencyField(form, field, key === "line2f" ? value.abs() : value);
  }

  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const notes = [
    "FORM 6251 REVIEW LIMITATIONS - NOT FOR FILING",
    "Printed amounts copy the calculation audit; this attachment does not qualify an AMT return.",
    ...(ordinaryCredit ? [
      "Actual ordinary Form1116 regular and AMT credits reconcile to separate source worksheets.",
      "Line8 is the AMT credit; line10 subtracts the regular credit from regular tax.",
      "Independent regular and AMT carry records remain subject to their actual source histories.",
      "Other foreign-credit methods require their separate actual worksheets.",
    ] : directCredit ? [
      "Actual elected section904(j) foreign credit is reconciled to the source calculation.",
      audited.has("8") ? "Lines8 and9 retain the actual elected AMT credit and net tentative minimum tax."
        : "The optional no-AMT line8 skip applies; no later credit needs tentative minimum tax.",
      "Other AMT foreign-credit methods remain unavailable without their actual worksheets.",
    ] : [
      "General AMT foreign-tax credit source worksheets are not implemented. Line8 is blank.",
      "The preview assumes no AMT foreign-tax credit. Do not treat a blank field as a confirmed zero.",
    ]),
    ...(result.netOperatingLoss ? [
      "Lines2e and2f use separate actual regular and alternative carry ledgers.",
      "The NOL review statement retains current deductions and modified-income carry absorption.",
    ] : ["Actual AMT NOL source history is unavailable; this preview does not establish an ATNOLD."]),
    "Foreign-income stacking, MFS additional AMTI and full PartIII source worksheets",
    "remain unqualified. PartIII is blank when no actual audited worksheet is available.",
    "Regular-tax comparison copies the supplied audit; the mapper does not derive it from AMT.",
    ...(audited.has("1a") ? [] : ["Actual total deductions were not supplied; line1a remains blank."]),
  ];
  notes.forEach((text, index) => page.drawText(text, {x:36,y:750-index*22,size:10,font}));
  await markReviewPdf(doc);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as FORM_6251_FIELDS };

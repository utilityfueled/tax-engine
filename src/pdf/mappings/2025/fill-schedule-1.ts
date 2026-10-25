import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule 1 (Form 1040) — Additional Income and Adjustments to Income.
 *
 * Field names from the official 2025 IRS fillable PDF, verified via debug label fill.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import { d, sum } from "@/utils/decimal.js";
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
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
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

  const audited = new Map<string, Decimal>();
  for (const entry of s1.lines) {
    if (entry.form !== "Sched 1") continue;
    if (audited.has(entry.line) || !Decimal.isDecimal(entry.value) || !entry.value.isFinite()) {
      throw new Error(`Schedule1 requires a unique finite audit for line${entry.line}`);
    }
    const global = result.allLines.filter(line => line.form === "Sched 1" && line.line === entry.line);
    if (global.length !== 1 || !entry.value.eq(global[0].value)) {
      throw new Error(`Schedule1 line${entry.line} audit does not reconcile with the return`);
    }
    audited.set(entry.line, entry.value);
  }
  const required = (id: string): Decimal => {
    const value = audited.get(id);
    if (value === undefined) throw new Error(`Schedule1 requires completed audit line${id}`);
    return value;
  };
  for (const [id, amount] of [["3",s1.businessIncome],["5",s1.supplementalIncome],
    ["9",s1.totalOtherIncome],["10",s1.totalAdditionalIncome],["25",s1.otherAdjustmentsTotal],
    ["26",s1.totalAdjustments]] as const) {
    if (!required(id).eq(amount)) throw new Error(`Schedule1 line${id} does not reconcile with its result`);
  }
  const total8 = sum(...[...audited].filter(([id]) => /^8[a-z]$/.test(id)).map(([,amount]) => amount));
  const total10 = sum(...["1","2a","3","4","5","6","7","9"].map(required));
  const total26 = sum(...["11","12","13","14","15","16","17","18","19a","20","21","23","25"].map(required));
  if (!total8.eq(required("9")) || !total10.eq(required("10")) || !total26.eq(required("26"))
    || !required("10").eq(result.otherIncome) || !required("26").eq(result.adjustmentsToIncome)) {
    throw new Error("Schedule1 printed line totals do not reconcile with Form1040");
  }
  for (const [id, value] of [["8",required("10")],["10",required("26")]] as const) {
    const lines = result.allLines.filter(line => line.form === "1040" && line.line === id);
    if (lines.length !== 1 || !lines[0].value.eq(value)) {
      throw new Error(`Schedule1 totals do not reconcile with1040line${id} audit`);
    }
  }
  for (const [key, field] of Object.entries(F)) {
    if (!/^line(?:[1-9]|1[0-9]|2[0-6])[a-z]?$/.test(key)) continue;
    const id = key.slice(4);
    const value = audited.get(id);
    if (value !== undefined) {
      // These two fields are inside parentheses already printed on the form.
      setCurrencyField(form, field, id === "8a" || id === "8d" ? value.abs() : value);
    }
  }
  const otherSources = s1.lines.find(line => line.form === "Sched 1" && line.line === "8z")?.inputs ?? {};
  const sourceEntries = Object.entries(otherSources).filter(([,amount]) => Decimal.isDecimal(amount) && !amount.isZero());
  const manualAdjustments = d(input.adjustments?.otherAdjustmentsTotal);
  if (sourceEntries.length > 0 || !manualAdjustments.isZero()) {
    if (sourceEntries.length > 0) setTextField(form, F.line8zDesc, "See review source attachment");
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const notes = [
      "SCHEDULE 1 SOURCE REVIEW - NOT FOR FILING",
      ...sourceEntries.map(([source,amount]) => `Line8z ${source}: ${amount.toString()}`),
      ...(!manualAdjustments.isZero() ? [
        `Line25 includes actual other-adjustment aggregate: ${manualAdjustments.toString()}`,
        "Its individual Line24 source breakdown is unavailable; no classification has been invented.",
      ] : []),
      "Legacy unclassified receipts and special source worksheets remain unqualified.",
      "This review copies completed calculation audits; it does not establish source eligibility.",
    ];
    notes.forEach((text,index) => page.drawText(text,{ x:36,y:750-index*22,size:10,font }));
  }
  await markReviewPdf(doc);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_1_FIELDS };

/**
 * PDF filler for IRS Schedule H (Form 1040) — Household Employment Taxes.
 *
 * Field names verified against 2025 Schedule H fillable PDF field inspection.
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const tbl17 = (row: string, n: string) =>
  `topmostSubform[0].Page2[0].Table_Line17[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule H fillable PDF debug labels.

export const SCHEDULE_H_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),
  ein: p1("CombField[0].f1_3[0]"),

  // ── Questions A, B, C ──
  questionAYes: p1("c1_1[0]"),
  questionANo: p1("c1_1[1]"),
  questionBYes: p1("c1_2[0]"),
  questionBNo: p1("c1_2[1]"),
  questionCYes: p1("c1_3[0]"),
  questionCNo: p1("c1_3[1]"),

  // ── Part I: Social Security, Medicare, and Federal Income Tax ──
  line1: p1("f1_4[0]"),   // Total cash wages subject to SS tax
  line2: p1("f1_5[0]"),   // SS tax (Line 1 × 12.4%)
  line3: p1("f1_6[0]"),   // Total cash wages subject to Medicare tax
  line4: p1("f1_7[0]"),   // Medicare tax (Line 3 × 2.9%)
  line5: p1("f1_8[0]"),   // Total cash wages subject to Additional Medicare Tax
  line6: p1("f1_9[0]"),   // Additional Medicare Tax (Line 5 × 0.9%)
  line7: p1("f1_10[0]"),  // Federal income tax withheld
  line8: p1("f1_11[0]"),  // Total (Lines 2+4+6+7)

  // ── Line 9 checkbox ──
  line9Yes: p1("c1_4[0]"),
  line9No: p1("c1_4[1]"),

  // ── Part II: FUTA Tax — Section A ──
  line10Yes: p2("Line10[0].c2_1[0]"),
  line10No: p2("Line10[0].c2_1[1]"),
  line11Yes: p2("c2_2[0]"),
  line11No: p2("c2_2[1]"),
  line12Yes: p2("c2_3[0]"),
  line12No: p2("c2_3[1]"),
  line13: p2("f2_1[0]"),    // State abbreviation
  line14: p2("f2_2[0]"),    // FUTA taxable wages (Section A)
  line15: p2("f2_3[0]"),    // FUTA tax (Section A) = Line 14 × 0.006
  line16: p2("f2_4[0]"),    // Total FUTA tax (Section A)

  // ── Part II: FUTA Tax — Section B, Table (Line 17) ──
  // Row 1
  line17r1_state: tbl17("BodyRow1[0]", "f2_5[0]"),
  line17r1_taxableWages: tbl17("BodyRow1[0]", "f2_6[0]"),
  line17r1_stateExperience: tbl17("BodyRow1[0]", "f2_7[0]"),
  line17r1_stateRate: tbl17("BodyRow1[0]", "f2_8[0]"),
  line17r1_creditAllowableRate: tbl17("BodyRow1[0]", "f2_9[0]"),
  line17r1_creditAllowable: tbl17("BodyRow1[0]", "f2_10[0]"),
  line17r1_contributions: tbl17("BodyRow1[0]", "f2_11[0]"),
  line17r1_additionalTax: tbl17("BodyRow1[0]", "f2_12[0]"),
  line17r1_creditReduction: tbl17("BodyRow1[0]", "f2_13[0]"),

  // Row 2
  line17r2_state: tbl17("BodyRow2[0]", "f2_14[0]"),
  line17r2_taxableWages: tbl17("BodyRow2[0]", "f2_15[0]"),
  line17r2_stateExperience: tbl17("BodyRow2[0]", "f2_16[0]"),
  line17r2_stateRate: tbl17("BodyRow2[0]", "f2_17[0]"),
  line17r2_creditAllowableRate: tbl17("BodyRow2[0]", "f2_18[0]"),
  line17r2_creditAllowable: tbl17("BodyRow2[0]", "f2_19[0]"),
  line17r2_contributions: tbl17("BodyRow2[0]", "f2_20[0]"),
  line17r2_additionalTax: tbl17("BodyRow2[0]", "f2_21[0]"),
  line17r2_creditReduction: tbl17("BodyRow2[0]", "f2_22[0]"),

  // ── Section B continued ──
  line18: p2("f2_23[0]"),    // Total FUTA wages (Section B)
  line19: p2("f2_24[0]"),    // Multiply Line 18 × 6.0%
  line20: p2("f2_25[0]"),    // Multiply Line 18 × 5.4%
  line21: p2("f2_26[0]"),    // Total state unemployment contributions
  line22: p2("f2_27[0]"),    // Smaller of Line 20 or Line 21
  line23: p2("f2_28[0]"),    // Subtract Line 22 from Line 19
  line23check: p2("c2_4[0]"), // Checkbox for credit reduction states
  line24: p2("f2_29[0]"),    // Net FUTA (Section B)

  // ── Part III: Total Household Employment Taxes ──
  line25: p2("f2_30[0]"),    // Enter amount from Line 8
  line26: p2("f2_31[0]"),    // Add Line 16 (or Line 24)
  line27: p2("f2_32[0]"),    // Total household employment taxes

  // ── Line 28 checkbox ──
  line28Yes: p2("c2_5[0]"),
  line28No: p2("c2_5[1]"),

  // ── Lines 29-34: Payment/balance due ──
  line29: p2("f2_33[0]"),
  line30: p2("f2_34[0]"),
  line31: p2("f2_35[0]"),
  line32: p2("f2_36[0]"),
  line33: p2("f2_37[0]"),
  line34: p2("f2_38[0]"),

  // ── Line 35 checkbox ──
  line35check: p2("c2_6[0]"),

  // ── Lines 36-40 ──
  line36: p2("f2_39[0]"),
  line37: p2("f2_40[0]"),
  line38: p2("f2_41[0]"),
  line39: p2("f2_42[0]"),
  line40: p2("f2_43[0]"),
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule H PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleH(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = SCHEDULE_H_FIELDS;
  const schedH = result.scheduleH;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!schedH) return doc;

  const hasQualifying = schedH.qualifyingEmployeeCount > 0;

  // ── Questions A, B, C ──
  setCheckBox(form, hasQualifying ? F.questionAYes : F.questionANo, true);

  const futaApplies = input.scheduleH?.futaApplies ?? false;
  setCheckBox(form, futaApplies ? F.questionBYes : F.questionBNo, true);

  const hasWithholding = schedH.line7.greaterThan(0);
  setCheckBox(form, hasWithholding ? F.questionCYes : F.questionCNo, true);

  // ── Part I: Lines 1–8 ──
  setCurrencyField(form, F.line1, schedH.line1);
  setCurrencyField(form, F.line2, schedH.line2);
  setCurrencyField(form, F.line3, schedH.line3);
  setCurrencyField(form, F.line4, schedH.line4);
  setCurrencyField(form, F.line5, schedH.line5);
  setCurrencyField(form, F.line6, schedH.line6);
  setCurrencyField(form, F.line7, schedH.line7);
  setCurrencyField(form, F.line8, schedH.line8);

  // ── Line 9: Is Line 8 ≥ $2,500? ──
  const line8GE2500 = schedH.line8.greaterThanOrEqualTo(2500);
  setCheckBox(form, line8GE2500 ? F.line9Yes : F.line9No, true);

  // ── Part II: FUTA Tax ──
  if (futaApplies && schedH.futaTax.greaterThan(0)) {
    setCheckBox(form, F.line10Yes, true);

    const useSectionA = input.scheduleH?.futaSectionA ?? true;

    if (useSectionA) {
      // Section A: simplified FUTA
      setCheckBox(form, F.line11Yes, true);
      setCheckBox(form, F.line12Yes, true);
      setCurrencyField(form, F.line14, schedH.line1.lessThanOrEqualTo(7000)
        ? schedH.line3 : schedH.line3); // FUTA wages are different from SS wages
      setCurrencyField(form, F.line15, schedH.futaTax);
      setCurrencyField(form, F.line16, schedH.futaTax);
    } else {
      // Section B: detailed FUTA (state contributions provided)
      setCurrencyField(form, F.line24, schedH.futaTax);
    }
  } else if (!futaApplies) {
    setCheckBox(form, F.line10No, true);
  }

  // ── Part III: Total ──
  setCurrencyField(form, F.line25, schedH.line8);
  setCurrencyField(form, F.line26, schedH.futaTax);
  setCurrencyField(form, F.line27, schedH.totalTax);

  return doc;
}

/** Exported field map for testing and inspection. */
export { SCHEDULE_H_FIELDS as SCHEDULE_H_FIELDS_MAP };

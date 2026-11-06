import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule 8812 — Credits for Qualifying Children
 * and Other Dependents.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f1040s8.pdf', 'forms/filled/f1040s8-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
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
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const f8812 = result.form8812;

  if (!f8812) return doc;

  const lineIds = new Set<string>();
  for (const entry of f8812.lines) {
    if (lineIds.has(entry.line) || !entry.value.isFinite()) {
      throw new Error("Duplicate or invalid Schedule 8812 audit entry");
    }
    lineIds.add(entry.line);
  }
  const audited = (line: string) => {
    const matches = f8812.lines.filter(entry => entry.line === line);
    if (matches.length !== 1 || !matches[0].value.isFinite()) {
      throw new Error(`Missing, duplicate or invalid Schedule 8812 audit entry ${line}`);
    }
    return matches[0].value;
  };
  const primary = input.taxpayer.primary;
  const spouse = input.taxpayer.spouse;
  setTextField(form, F.name, spouse
    ? `${primary.firstName} ${primary.lastName} & ${spouse.firstName} ${spouse.lastName}`
    : `${primary.firstName} ${primary.lastName}`);
  setTextField(form, F.ssn, primary.ssn.replace(/-/g, ""));
  setCurrencyField(form, F.line1, lineIds.has("1") ? audited("1") : result.agi);
  // A positive legacy possession aggregate does not identify its source. Leave
  // unknown component fields blank; never guess Puerto Rico versus Form 4563.
  for (const line of ["2a", "2b", "2c", "2d"] as const) {
    if (f8812.lines.some(entry => entry.line === line)) {
      setCurrencyField(form, F[`line${line}`], audited(line));
    }
  }
  for (const line of ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] as const) {
    setCurrencyField(form, F[`line${line}`], audited(line));
  }
  const hasCredit = audited("12").gt(0);
  setCheckBox(form, F.line12No, !hasCredit);
  setCheckBox(form, F.line12Yes, hasCredit);
  // Filing Form 2555 disallows ACTC. Line 15 is reserved in the actual form.
  if (audited("16a").gt(0) && !input.form2555) {
    for (const line of ["16a", "16b", "17", "18a", "20"] as const) {
      setCurrencyField(form, F[`line${line}`], audited(line));
    }
    setCurrencyField(form, F.line16bCount, audited("4"));
    if (f8812.lines.some(entry => entry.line === "18b")) setCurrencyField(form, F.line18b, audited("18b"));
    const hasEarnedExcess = audited("19").gt(0);
    setCheckBox(form, F.line19No, !hasEarnedExcess);
    setCheckBox(form, F.line19Yes, hasEarnedExcess);
    if (hasEarnedExcess) setCurrencyField(form, F.line19, audited("19"));
    const threeOrMore = audited("16b").gte(5100);
    setCheckBox(form, F.nextNo, !threeOrMore);
    setCheckBox(form, F.nextYes, threeOrMore);
    const needsPayroll = threeOrMore
      ? audited("20").lt(audited("17"))
      : input.childTaxCredit?.bonaFidePuertoRicoResident === true;
    if (needsPayroll) {
      for (const line of ["21", "22", "23", "24", "25", "26"] as const) {
        setCurrencyField(form, F[`line${line}`], audited(line));
      }
    }
    setCurrencyField(form, F.line27, audited("27"));
  }
  return doc;
}

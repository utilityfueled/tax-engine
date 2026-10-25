import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule EIC (Form 1040) — Earned Income Credit
 * Qualifying Child Information.
 *
 * Field names verified against 2025 Schedule EIC fillable PDF field inspection.
 * This form attaches to Form 1040 when EIC is claimed with qualifying children.
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  setCheckBox,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const year1 = (n: string) => `topmostSubform[0].Page1[0].Year1_ReadOrder[0].${n}`;
const year2 = (n: string) => `topmostSubform[0].Page1[0].Year2_ReadOrder[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule EIC fillable PDF debug labels.

export const SCHEDULE_EIC_FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Line 1: Child's name (combined first + last per child) ──
  child1Name: p1("f1_03[0]"),
  child2Name: p1("f1_04[0]"),
  child3Name: p1("f1_05[0]"),

  // ── Line 2: Child's SSN ──
  child1SSN: p1("f1_06[0]"),
  child2SSN: p1("f1_07[0]"),
  child3SSN: p1("f1_08[0]"),

  // ── Line 3: Child's year of birth (4 single-digit fields per child) ──
  child1YearDigit1: year1("f1_09[0]"),
  child1YearDigit2: year1("f1_10[0]"),
  child1YearDigit3: year1("f1_11[0]"),
  child1YearDigit4: year1("f1_12[0]"),
  child2YearDigit1: year2("f1_13[0]"),
  child2YearDigit2: year2("f1_14[0]"),
  child2YearDigit3: year2("f1_15[0]"),
  child2YearDigit4: year2("f1_16[0]"),
  child3YearDigit1: p1("f1_17[0]"),
  child3YearDigit2: p1("f1_18[0]"),
  child3YearDigit3: p1("f1_19[0]"),
  child3YearDigit4: p1("f1_20[0]"),

  // ── Line 4a: Was child under 24, a student, and younger than you? ──
  // Yes = nested in Yes_ReadOrder, No = direct in Line4a group
  child1Line4aYes: p1("Line4a_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_1[0]"),
  child1Line4aNo: p1("Line4a_Child1_ReadOrder[0].c1_1[0]"),
  child2Line4aYes: p1("Line4a_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_2[0]"),
  child2Line4aNo: p1("Line4a_Child2_ReadOrder[0].c1_2[0]"),
  child3Line4aYes: p1("Line4a_Child3_Yes_ReadOrder[0].c1_3[0]"),
  child3Line4aNo: p1("c1_3[0]"),

  // ── Line 4b: Was child permanently and totally disabled? ──
  child1Line4bYes: p1("Line4b_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_4[0]"),
  child1Line4bNo: p1("Line4b_Child1_ReadOrder[0].c1_4[0]"),
  child2Line4bYes: p1("Line4b_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_5[0]"),
  child2Line4bNo: p1("Line4b_Child2_ReadOrder[0].c1_5[0]"),
  child3Line4bYes: p1("Line4b_Child3_Yes_ReadOrder[0].c1_6[0]"),
  child3Line4bNo: p1("c1_6[0]"),

  // ── Line 5: Child's relationship to you ──
  child1Relationship: p1("f1_21[0]"),
  child2Relationship: p1("f1_22[0]"),
  child3Relationship: p1("f1_23[0]"),

  // ── Line 6: Number of months child lived with you ──
  child1Months: p1("Line6_Child1_ReadOrder[0].f1_24[0]"),
  child2Months: p1("Line6_Child2_ReadOrder[0].f1_25[0]"),
  child3Months: p1("f1_26[0]"),
} as const;

// Per-child field keys grouped for iteration
const CHILD_FIELDS = [
  {
    name: SCHEDULE_EIC_FIELDS.child1Name,
    ssn: SCHEDULE_EIC_FIELDS.child1SSN,
    yearDigits: [
      SCHEDULE_EIC_FIELDS.child1YearDigit1,
      SCHEDULE_EIC_FIELDS.child1YearDigit2,
      SCHEDULE_EIC_FIELDS.child1YearDigit3,
      SCHEDULE_EIC_FIELDS.child1YearDigit4,
    ],
    line4aYes: SCHEDULE_EIC_FIELDS.child1Line4aYes,
    line4aNo: SCHEDULE_EIC_FIELDS.child1Line4aNo,
    line4bYes: SCHEDULE_EIC_FIELDS.child1Line4bYes,
    line4bNo: SCHEDULE_EIC_FIELDS.child1Line4bNo,
    relationship: SCHEDULE_EIC_FIELDS.child1Relationship,
    months: SCHEDULE_EIC_FIELDS.child1Months,
  },
  {
    name: SCHEDULE_EIC_FIELDS.child2Name,
    ssn: SCHEDULE_EIC_FIELDS.child2SSN,
    yearDigits: [
      SCHEDULE_EIC_FIELDS.child2YearDigit1,
      SCHEDULE_EIC_FIELDS.child2YearDigit2,
      SCHEDULE_EIC_FIELDS.child2YearDigit3,
      SCHEDULE_EIC_FIELDS.child2YearDigit4,
    ],
    line4aYes: SCHEDULE_EIC_FIELDS.child2Line4aYes,
    line4aNo: SCHEDULE_EIC_FIELDS.child2Line4aNo,
    line4bYes: SCHEDULE_EIC_FIELDS.child2Line4bYes,
    line4bNo: SCHEDULE_EIC_FIELDS.child2Line4bNo,
    relationship: SCHEDULE_EIC_FIELDS.child2Relationship,
    months: SCHEDULE_EIC_FIELDS.child2Months,
  },
  {
    name: SCHEDULE_EIC_FIELDS.child3Name,
    ssn: SCHEDULE_EIC_FIELDS.child3SSN,
    yearDigits: [
      SCHEDULE_EIC_FIELDS.child3YearDigit1,
      SCHEDULE_EIC_FIELDS.child3YearDigit2,
      SCHEDULE_EIC_FIELDS.child3YearDigit3,
      SCHEDULE_EIC_FIELDS.child3YearDigit4,
    ],
    line4aYes: SCHEDULE_EIC_FIELDS.child3Line4aYes,
    line4aNo: SCHEDULE_EIC_FIELDS.child3Line4aNo,
    line4bYes: SCHEDULE_EIC_FIELDS.child3Line4bYes,
    line4bNo: SCHEDULE_EIC_FIELDS.child3Line4bNo,
    relationship: SCHEDULE_EIC_FIELDS.child3Relationship,
    months: SCHEDULE_EIC_FIELDS.child3Months,
  },
] as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule EIC PDF from engine calculation results and input data.
 * Lists up to 3 qualifying EIC children with their information.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleEIC(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = SCHEDULE_EIC_FIELDS;
  const taxYear = input.taxpayer.taxYear;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Qualifying Children ──
  // Filter dependents marked as qualifying for EIC, take up to 3
  const eicChildren = input.taxpayer.dependents
    .filter((dep) => dep.qualifiesForEIC)
    .slice(0, 3);

  for (let i = 0; i < eicChildren.length; i++) {
    const child = eicChildren[i];
    const fields = CHILD_FIELDS[i];

    // Line 1: Child's name
    setTextField(form, fields.name, `${child.firstName} ${child.lastName}`);

    // Line 2: Child's SSN (no dashes)
    setTextField(form, fields.ssn, child.ssn.replace(/-/g, ""));

    // Line 3: Child's year of birth (4 individual digit fields)
    const birthYear = child.dateOfBirth.substring(0, 4);
    for (let d = 0; d < 4; d++) {
      setTextField(form, fields.yearDigits[d], birthYear[d]);
    }

    // Lines 4a/4b: Age-based qualification checks
    // Child born after the cutoff year (under 19 at end of tax year) → skip 4a/4b
    const birthYearNum = parseInt(birthYear, 10);
    const ageAtYearEnd = taxYear - birthYearNum;
    // Per IRS: if born after 2006 (for TY2025, i.e., under 19), skip lines 4a and 4b
    const under19Cutoff = taxYear - 18; // 2025 - 18 = 2007; born 2007+ = under 19

    if (birthYearNum >= under19Cutoff) {
      // Under 19 at end of year — skip lines 4a and 4b (no checkboxes needed)
    } else if (ageAtYearEnd < 24) {
      // Age 19-23: qualifies as student (4a = Yes)
      setCheckBox(form, fields.line4aYes, true);
    } else {
      // Age 24+: must be permanently disabled to qualify (4a = No, 4b = Yes)
      setCheckBox(form, fields.line4aNo, true);
      setCheckBox(form, fields.line4bYes, true);
    }

    // Line 5: Relationship
    setTextField(form, fields.relationship, child.relationship);

    // Line 6: Months lived with you
    // IRS instruction: if > 6 but < 7, enter "7"; if born/died in year, enter "12"
    const months = child.monthsLivedWithYou;
    setTextField(form, fields.months, months.toString());
  }

  return doc;
}

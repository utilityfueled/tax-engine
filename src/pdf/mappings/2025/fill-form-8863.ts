import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8863 — Education Credits
 * (American Opportunity and Lifetime Learning Credits)
 *
 * Field names verified against 2025 Form 8863 fillable PDF debug labels.
 *
 * Copies the persisted calculation audit and actual student source facts.
 * Extra page 2 copies preserve every student and additional institutions.
 */

import { PDFDocument, type PDFForm } from "pdf-lib";
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
const p1ssn = (n: string) => `topmostSubform[0].Page1[0].SocialSecurity[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const p2ssn = (n: string) => `topmostSubform[0].Page2[0].SSN[0].${n}`;
const p2studentSsn = (n: string) => `topmostSubform[0].Page2[0].StudentSSN[0].${n}`;
const p2line22a = (n: string) => `topmostSubform[0].Page2[0].Line22a[0].${n}`;
const p2line22b = (n: string) => `topmostSubform[0].Page2[0].Line22b[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────

export const FORM_8863_FIELDS = {
  // ── Page 1 Header ──
  name: p1("f1_1[0]"),
  ssn1: p1ssn("f1_2[0]"),
  ssn2: p1ssn("f1_3[0]"),
  ssn3: p1ssn("f1_4[0]"),

  // ── Part I: Refundable American Opportunity Credit ──
  line1: p1("f1_5[0]"),      // Total tentative AOC from all Parts III, line 30
  line2: p1("f1_6[0]"),      // $180,000 (MFJ) or $90,000 (others)
  line3: p1("f1_7[0]"),      // MAGI from Form 1040, line 11b
  line4: p1("f1_8[0]"),      // Line 2 minus Line 3
  line5: p1("f1_9[0]"),      // $20,000 (MFJ) or $10,000 (others)
  line6int: p1("f1_10[0]"),  // Line 6 integer part (before decimal point)
  line6dec: p1("f1_11[0]"),  // Line 6 decimal part (after decimal point)
  line7: p1("f1_12[0]"),     // Line 1 × Line 6 (AOC after phase-out)
  underAge24: p1("c1_1[0]"), // Under age 24 checkbox
  line8: p1("f1_13[0]"),     // Refundable AOC = Line 7 × 0.40

  // ── Part II: Nonrefundable Education Credits ──
  line9: p1("f1_14[0]"),     // Line 7 minus Line 8 (nonrefundable AOC)
  line10: p1("f1_15[0]"),    // LLC expenses from all Parts III, line 31
  line11: p1("f1_16[0]"),    // Smaller of line 10 or $10,000
  line12: p1("f1_17[0]"),    // Line 11 × 20%
  line13: p1("f1_18[0]"),    // $180,000 (MFJ) or $90,000 (others)
  line14: p1("f1_19[0]"),    // MAGI
  line15: p1("f1_20[0]"),    // Line 13 minus Line 14
  line16: p1("f1_21[0]"),    // $20,000 (MFJ) or $10,000 (others)
  line17int: p1("f1_22[0]"), // Line 17 integer part
  line17dec: p1("f1_23[0]"), // Line 17 decimal part
  line18: p1("f1_24[0]"),    // Line 12 × Line 17 (LLC after phase-out)
  line19: p1("f1_25[0]"),    // Total nonrefundable → Schedule 3, line 3

  // ── Page 2 Header ──
  p2Name: p2("f2_1[0]"),
  p2Ssn1: p2ssn("f2_2[0]"),
  p2Ssn2: p2ssn("f2_3[0]"),
  p2Ssn3: p2ssn("f2_4[0]"),

  // ── Part III: Student and Education Information ──
  studentName: p2("f2-5[0]"),              // Line 20 (note: hyphen, not underscore)
  studentSsn1: p2studentSsn("f2_6[0]"),   // Line 21 SSN part 1
  studentSsn2: p2studentSsn("f2_7[0]"),   // Line 21 SSN part 2
  studentSsn3: p2studentSsn("f2_8[0]"),   // Line 21 SSN part 3

  // Line 22a: First educational institution
  inst1Name: p2line22a("f2_9[0]"),
  inst1Address: p2line22a("f2_10[0]"),
  inst1_1098tYes: p2line22a("c2_1[0]"),
  inst1_1098tNo: p2line22a("c2_1[1]"),
  inst1_1098tPriorYes: p2line22a("c2_2[0]"),
  inst1_1098tPriorNo: p2line22a("c2_2[1]"),

  // Line 22b: Second educational institution
  inst2Name: p2line22b("f2_20[0]"),
  inst2Address: p2line22b("f2_21[0]"),
  inst2_1098tYes: p2line22b("c2_3[0]"),
  inst2_1098tNo: p2line22b("c2_3[1]"),
  inst2_1098tPriorYes: p2line22b("c2_4[0]"),
  inst2_1098tPriorNo: p2line22b("c2_4[1]"),

  // Questions 23–26
  q23Yes: p2("c2_5[0]"),    // AOC claimed for 4+ prior years? Yes → stop
  q23No: p2("c2_5[1]"),
  q24Yes: p2("c2_6[0]"),    // Enrolled at least half-time?
  q24No: p2("c2_6[1]"),
  q25Yes: p2("c2_7[0]"),    // Completed first 4 years before 2025?
  q25No: p2("c2_7[1]"),
  q26Yes: p2("c2_8[0]"),    // Felony conviction?
  q26No: p2("c2_8[1]"),

  // Lines 27–31: AOC and LLC computation
  line27: p2("f2_31[0]"),   // Adjusted qualified expenses (max $4,000)
  line28: p2("f2_32[0]"),   // Line 27 minus $2,000 (zero floor)
  line29: p2("f2_33[0]"),   // Line 28 × 25%
  line30: p2("f2_34[0]"),   // Tentative AOC per student
  line31: p2("f2_35[0]"),   // LLC adjusted qualified expenses
} as const;

const F = FORM_8863_FIELDS;

// ─── Source and audit mapping ─────────────────────────────────────────────

type Education = NonNullable<TaxYearInput["educationExpenses"]>;
type AocStudent = Education["aocStudents"][number];
type LlcStudent = NonNullable<Education["llcStudents"]>[number];

function answer(form: PDFForm, value: boolean | undefined, yes: string, no: string): void {
  // An omitted answer is unknown. Never manufacture a negative response.
  if (value === undefined) return;
  setCheckBox(form, yes, value);
  setCheckBox(form, no, !value);
}

function fillStudentSource(
  form: PDFForm, student: AocStudent | LlcStudent, name: string, ssn: string,
  institutionOffset: number,
): void {
  setTextField(form, F.p2Name, name);
  setTextField(form, F.p2Ssn1, ssn.slice(0, 3));
  setTextField(form, F.p2Ssn2, ssn.slice(3, 5));
  setTextField(form, F.p2Ssn3, ssn.slice(5, 9));
  setTextField(form, F.studentName, student.name);
  const studentId = student.studentTaxId?.replaceAll("-", "") ?? "";
  setTextField(form, F.studentSsn1, studentId.slice(0, 3));
  setTextField(form, F.studentSsn2, studentId.slice(3, 5));
  setTextField(form, F.studentSsn3, studentId.slice(5, 9));
  for (const [index, institution] of (student.institutions ?? []).slice(institutionOffset, institutionOffset + 2).entries()) {
    const prefix = index === 0 ? "inst1" : "inst2";
    setTextField(form, F[`${prefix}Name`], institution.name);
    setTextField(form, F[`${prefix}Address`], institution.address);
    answer(form, institution.receivedCurrentYear1098T, F[`${prefix}_1098tYes`], F[`${prefix}_1098tNo`]);
    answer(form, institution.receivedPriorYear1098TWithBox7, F[`${prefix}_1098tPriorYes`], F[`${prefix}_1098tPriorNo`]);
    if (institution.ein) {
      const ein = institution.ein.replaceAll("-", "");
      for (let digit = 0; digit < 9; digit++) {
        const path = index === 0 ? p2line22a : p2line22b;
        setTextField(form, path(`f2_${(index === 0 ? 11 : 22) + digit}[0]`), ein[digit] ?? "");
      }
    }
  }
}

export async function fillForm8863(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const edu = input.educationExpenses;
  if (!edu) return doc;
  const calculation = result.form8863;
  if (!calculation) throw new Error("Form 8863 persisted calculation result and audit are required");
  const byLine = new Map<string, Decimal[]>();
  for (const entry of calculation.lines) {
    if (entry.form !== "Form 8863" || !entry.value.isFinite()) throw new Error("Invalid Form 8863 audit entry");
    byLine.set(entry.line, [...(byLine.get(entry.line) ?? []), entry.value]);
  }
  const audited = (line: string, index = 0, count = 1): Decimal => {
    const values = byLine.get(line) ?? [];
    if (values.length !== count || !values[index]) throw new Error(`Missing or duplicate Form 8863 audit entry ${line}`);
    return values[index];
  };
  const form = doc.getForm();
  const primary = input.taxpayer.primary;
  const spouse = input.taxpayer.spouse;
  const name = spouse ? `${primary.firstName} ${primary.lastName} & ${spouse.firstName} ${spouse.lastName}` : `${primary.firstName} ${primary.lastName}`;
  const ssn = primary.ssn.replaceAll("-", "");
  setTextField(form, F.name, name);
  setTextField(form, F.ssn1, ssn.slice(0, 3));
  setTextField(form, F.ssn2, ssn.slice(3, 5));
  setTextField(form, F.ssn3, ssn.slice(5, 9));
  for (const line of ["1", "2", "3", "4", "5", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "18", "19"] as const) {
    setCurrencyField(form, F[`line${line}`], audited(line));
  }
  for (const line of ["6", "17"] as const) {
    const ratio = audited(line);
    if (ratio.lt(0) || ratio.gt(1)) throw new Error("Invalid Form 8863 audit phase-out factor");
    const [integer, fraction] = ratio.toFixed(Math.max(3, ratio.decimalPlaces())).split(".");
    setTextField(form, F[`line${line}int`], integer);
    setTextField(form, F[`line${line}dec`], fraction);
  }
  setCheckBox(form, F.underAge24, audited("7").gt(0) && !calculation.refundableAocEligible);

  // Repeated audit lines are emitted in source student order. Requiring the
  // exact cardinality prevents silent omission or reassignment to another child.
  for (const line of ["27", "28", "29", "30"]) {
    if ((byLine.get(line)?.length ?? 0) !== edu.aocStudents.length) throw new Error("Form 8863 student audit count mismatch");
  }
  if ((byLine.get("31")?.length ?? 0) !== (edu.llcStudents?.length ?? 0)) throw new Error("Form 8863 LLC student audit count mismatch");
  let firstStudentPage = true;
  const appendStudent = async (student: AocStudent | LlcStudent, index: number, kind: "aoc" | "llc") => {
    for (let offset = 0; offset < Math.max(1, student.institutions?.length ?? 0); offset += 2) {
      const studentDoc = firstStudentPage ? doc : await loadReviewTemplate(blankPdfPath, 2025);
      const studentForm = studentDoc.getForm();
      fillStudentSource(studentForm, student, name, ssn, offset);
      // Additional institutions use a page completed only through line 22.
      if (offset === 0 && kind === "aoc") {
        const aoc = student as AocStudent;
        answer(studentForm, aoc.priorYearsClaimed === undefined ? undefined : aoc.priorYearsClaimed >= 4, F.q23Yes, F.q23No);
        // Q24 asks about BOTH half-time enrollment and a degree/credential.
        const halfTimeDegree = aoc.enrolledAtLeastHalfTime === false || aoc.pursuingDegreeOrCredential === false
          ? false : aoc.enrolledAtLeastHalfTime === true && aoc.pursuingDegreeOrCredential === true ? true : undefined;
        answer(studentForm, halfTimeDegree, F.q24Yes, F.q24No);
        answer(studentForm, aoc.completedFirstFourYearsBeforeYear, F.q25Yes, F.q25No);
        answer(studentForm, aoc.felonyDrugConviction, F.q26Yes, F.q26No);
        for (const line of ["27", "28", "29", "30"] as const) setCurrencyField(studentForm, F[`line${line}`], audited(line, index, edu.aocStudents.length));
      } else if (offset === 0 && kind === "llc") {
        setCurrencyField(studentForm, F.line31, audited("31", index, edu.llcStudents?.length ?? 0));
      }
      if (!firstStudentPage) {
        studentForm.flatten();
        const [page] = await doc.copyPages(studentDoc, [1]);
        doc.addPage(page);
      }
      firstStudentPage = false;
    }
  };
  for (const [index, student] of edu.aocStudents.entries()) await appendStudent(student, index, "aoc");
  for (const [index, student] of (edu.llcStudents ?? []).entries()) await appendStudent(student, index, "llc");
  return doc;
}

import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8839 — Qualified Adoption Expenses.
 * Maps engine result + input data to 2025 PDF form fields.
 *
 * Part II: Adoption Credit (Lines 2–18)
 * Part III: Employer-Provided Adoption Benefits (Lines 19–31)
 *
 * Field names verified against 2025 Form 8839 fillable PDF field inspection.
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

const ZERO = new Decimal(0);

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;
const partI = (row: string, n: string) =>
  p1(`Table_PartI[0].${row}.${n}`);

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8839 fillable PDF debug labels.

export const FORM_8839_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Child Information (up to 3 children) ──
  // Child 1
  child1FirstName: partI("BodyRow_Child1[0]", "f1_3[0]"),
  child1LastName: partI("BodyRow_Child1[0]", "f1_4[0]"),
  child1YearOfBirth: partI("BodyRow_Child1[0]", "f1_5[0]"),
  child1BornBefore2008: partI("BodyRow_Child1[0]", "c1_1[0]"),
  child1SpecialNeeds: partI("BodyRow_Child1[0]", "c1_2[0]"),
  child1Foreign: partI("BodyRow_Child1[0]", "c1_3[0]"),
  child1IdNumber: partI("BodyRow_Child1[0]", "f1_6[0]"),
  child1AdoptionFinal: partI("BodyRow_Child1[0]", "c1_4[0]"),
  // Child 2
  child2FirstName: partI("BodyRow_Child2[0]", "f1_7[0]"),
  child2LastName: partI("BodyRow_Child2[0]", "f1_8[0]"),
  child2YearOfBirth: partI("BodyRow_Child2[0]", "f1_9[0]"),
  child2BornBefore2008: partI("BodyRow_Child2[0]", "c1_5[0]"),
  child2SpecialNeeds: partI("BodyRow_Child2[0]", "c1_6[0]"),
  child2Foreign: partI("BodyRow_Child2[0]", "c1_7[0]"),
  child2IdNumber: partI("BodyRow_Child2[0]", "f1_10[0]"),
  child2AdoptionFinal: partI("BodyRow_Child2[0]", "c1_8[0]"),
  // Child 3
  child3FirstName: partI("BodyRow_Child3[0]", "f1_11[0]"),
  child3LastName: partI("BodyRow_Child3[0]", "f1_12[0]"),
  child3YearOfBirth: partI("BodyRow_Child3[0]", "f1_13[0]"),
  child3BornBefore2008: partI("BodyRow_Child3[0]", "c1_9[0]"),
  child3SpecialNeeds: partI("BodyRow_Child3[0]", "c1_10[0]"),
  child3Foreign: partI("BodyRow_Child3[0]", "c1_11[0]"),
  child3IdNumber: partI("BodyRow_Child3[0]", "f1_14[0]"),
  child3AdoptionFinal: partI("BodyRow_Child3[0]", "c1_12[0]"),

  // ── Part II: Adoption Credit ──
  // Line 2: Maximum credit per child (per-child columns)
  line2: [p1("Child1[0].f1_15[0]"), p1("Child2[0].f1_16[0]"), p1("Child3[0].f1_17[0]")],
  // Line 3: Prior year credits checkbox + per-child
  line3CheckboxNo: p1("Line3_ReadOrder[0].Line3Checkboxes_ReadOrder[0].c1_13[0]"),
  line3CheckboxYes: p1("Line3_ReadOrder[0].Line3Checkboxes_ReadOrder[0].c1_13[1]"),
  line3: [p1("f1_18[0]"), p1("f1_19[0]"), p1("f1_20[0]")],
  // Line 4: Line 2 minus Line 3
  line4: [p1("f1_21[0]"), p1("f1_22[0]"), p1("f1_23[0]")],
  // Line 5: Qualified adoption expenses
  line5: [p1("f1_24[0]"), p1("f1_25[0]"), p1("f1_26[0]")],
  // Line 6: Smaller of Line 4 or Line 5
  line6: [p1("f1_27[0]"), p1("f1_28[0]"), p1("f1_29[0]")],
  // Line 7: Modified AGI
  line7: p1("f1_30[0]"),
  // Line 8: Is Line 7 > $259,190?
  line8CheckboxNo: p1("Line8_ReadOrder[0].c1_14[0]"),
  line8CheckboxYes: p1("Line8_ReadOrder[0].c1_14[1]"),
  line8: p1("f1_31[0]"),
  // Line 9: Phase-out decimal (split: integer . decimal)
  line9Int: p1("f1_32[0]"),
  line9Dec: p1("f1_33[0]"),
  // Line 10: Line 6 × Line 9 (per-child)
  line10: [p1("f1_34[0]"), p1("f1_35[0]"), p1("f1_36[0]")],
  // Line 11a: Line 6 minus Line 10 (per-child)
  line11a: [p1("f1_37[0]"), p1("f1_38[0]"), p1("f1_39[0]")],
  // Line 11b: Smaller of Line 11a or $5,000 (per-child)
  line11b: [p1("f1_40[0]"), p1("f1_41[0]"), p1("f1_42[0]")],
  // Line 11c: Sum of Line 11b
  line11c: p1("f1_43[0]"),
  // Line 12: Sum of Line 11a
  line12: p1("f1_44[0]"),
  // Line 13: Refundable adoption credit
  line13: p1("f1_45[0]"),
  // Line 14: Line 12 minus Line 13
  line14: p1("f1_46[0]"),
  // Line 15: Credit carryforward from prior years
  line15: p1("f1_47[0]"),
  // Line 16: Line 14 + Line 15
  line16: p1("f1_48[0]"),
  // Line 17: Credit limit
  line17: p1("f1_49[0]"),
  // Line 18: Nonrefundable adoption credit
  line18: p1("f1_50[0]"),

  // ── Part III: Employer-Provided Adoption Benefits ──
  // Line 19: Max exclusion per child (per-child)
  line19: [p2("Child1[0].f2_1[0]"), p2("Child2[0].f2_2[0]"), p2("Child3[0].f2_3[0]")],
  // Line 20: Prior year exclusions checkbox + per-child
  line20CheckboxNo: p2("Line20_ReadOrder[0].Line20Checkboxes_ReadOrder[0].c2_1[0]"),
  line20CheckboxYes: p2("Line20_ReadOrder[0].Line20Checkboxes_ReadOrder[0].c2_1[1]"),
  line20: [p2("f2_4[0]"), p2("f2_5[0]"), p2("f2_6[0]")],
  // Line 21: Line 19 minus Line 20
  line21: [p2("f2_7[0]"), p2("f2_8[0]"), p2("f2_9[0]")],
  // Line 22: Employer benefits received (per-child)
  line22: [p2("f2_10[0]"), p2("f2_11[0]"), p2("f2_12[0]")],
  // Line 23: Total of Line 22
  line23: p2("f2_13[0]"),
  // Line 24: Smaller of Line 21 or Line 22 (per-child)
  line24: [p2("f2_14[0]"), p2("f2_15[0]"), p2("f2_16[0]")],
  // Line 25: Modified AGI
  line25: p2("Line25_ReadOrder[0].f2_17[0]"),
  // Line 26: Is Line 25 > $259,190?
  line26CheckboxNo: p2("Line26_ReadOrder[0].c2_2[0]"),
  line26CheckboxYes: p2("Line26_ReadOrder[0].c2_2[1]"),
  line26: p2("f2_18[0]"),
  // Line 27: Phase-out decimal (split: integer . decimal)
  line27Int: p2("f2_19[0]"),
  line27Dec: p2("f2_20[0]"),
  // Line 28: Line 24 × Line 27 (per-child)
  line28: [p2("f2_21[0]"), p2("f2_22[0]"), p2("f2_23[0]")],
  // Line 29: Line 24 minus Line 28 (per-child)
  line29: [p2("f2_24[0]"), p2("f2_25[0]"), p2("f2_26[0]")],
  // Line 30: Sum of Line 29
  line30: p2("f2_27[0]"),
  // Line 31: Taxable benefits
  line31CheckboxNo: p2("Line31_ReadOrder[0].Line29Checkboxes_ReadOrder[0].c2_3[0]"),
  line31CheckboxYes: p2("Line31_ReadOrder[0].Line29Checkboxes_ReadOrder[0].c2_3[1]"),
  line31: p2("f2_28[0]"),
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

function d(val?: string | number | Decimal | null): Decimal {
  if (val === undefined || val === null || val === "") return ZERO;
  return new Decimal(val);
}

/** Strict field setters reject missing/wrong-type fields rather than hiding a mapping failure. */
function setDecimalFraction(form: import("pdf-lib").PDFForm, intField: string, decField: string, value: Decimal): void {
  const [integer, decimal] = value.toFixed(3).split(".");
  setTextField(form, intField, integer);
  setTextField(form, decField, decimal);
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Form 8839 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillForm8839(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FORM_8839_FIELDS;
  const f8839 = result.form8839;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!f8839 || !f8839.eligible || !input.form8839) return doc;

  const children = input.form8839.children;
  if (children.length > 3) throw new Error("More than three adopted children require additional Form 8839 attachments");
  const numChildren = children.length;
  const audited = (line: string): Decimal => {
    const matches = f8839.lines.filter(entry => entry.form === "Form 8839" && entry.line === line);
    if (matches.length !== 1) throw new Error(`Missing or duplicate Form 8839 audit entry ${line}`);
    return matches[0].value;
  };

  // ── Part I: Child Information ────────────────────────────────────────────
  const childPartIFields = [
    {
      firstName: F.child1FirstName, lastName: F.child1LastName,
      specialNeeds: F.child1SpecialNeeds, foreign: F.child1Foreign,
      adoptionFinal: F.child1AdoptionFinal,
    },
    {
      firstName: F.child2FirstName, lastName: F.child2LastName,
      specialNeeds: F.child2SpecialNeeds, foreign: F.child2Foreign,
      adoptionFinal: F.child2AdoptionFinal,
    },
    {
      firstName: F.child3FirstName, lastName: F.child3LastName,
      specialNeeds: F.child3SpecialNeeds, foreign: F.child3Foreign,
      adoptionFinal: F.child3AdoptionFinal,
    },
  ];

  for (let i = 0; i < numChildren; i++) {
    const child = children[i];
    const pf = childPartIFields[i];
    const nameParts = child.childName.split(/\s+/);
    setTextField(form, pf.firstName, nameParts[0] ?? "");
    setTextField(form, pf.lastName, nameParts.slice(1).join(" "));
    setCheckBox(form, pf.specialNeeds, child.isSpecialNeeds);
    setCheckBox(form, pf.foreign, child.isForeignAdoption);
    setCheckBox(form, pf.adoptionFinal, child.adoptionBecameFinal);
  }

  // Copy only computed audit amounts; the PDF layer does not calculate tax.
  setCheckBox(form, children.some(c => d(c.priorYearCreditsClaimed).gt(ZERO)) ? F.line3CheckboxYes : F.line3CheckboxNo, true);
  for (const line of ["2", "3", "4", "5", "6", "10", "11a", "11b"] as const) {
    for (let index = 0; index < numChildren; index++) {
      setCurrencyField(form, F[`line${line}`][index], audited(`${line}-child-${index + 1}`));
    }
  }
  for (const line of ["7", "8", "11c", "12", "13", "14", "15", "16", "17", "18"] as const) {
    setCurrencyField(form, F[`line${line}`], audited(line));
  }
  const magiExceeds = audited("8").gt(0);
  setCheckBox(form, magiExceeds ? F.line8CheckboxYes : F.line8CheckboxNo, true);
  if (magiExceeds) setDecimalFraction(form, F.line9Int, F.line9Dec, audited("9"));

  // Special-needs qualified-plan exclusions can exist with no current benefits.
  if (f8839.totalEmployerBenefits.isZero() && f8839.allowableExclusion.isZero()) return doc;
  setCheckBox(form, children.some(c => d(c.priorYearExclusionsClaimed).gt(ZERO)) ? F.line20CheckboxYes : F.line20CheckboxNo, true);
  for (const line of ["19", "20", "21", "22", "24", "28", "29"] as const) {
    for (let index = 0; index < numChildren; index++) {
      setCurrencyField(form, F[`line${line}`][index], audited(`${line}-child-${index + 1}`));
    }
  }
  for (const line of ["23", "25", "26", "30", "31"] as const) {
    setCurrencyField(form, F[`line${line}`], audited(line));
  }
  const exclusionMagiExceeds = audited("26").gt(0);
  setCheckBox(form, exclusionMagiExceeds ? F.line26CheckboxYes : F.line26CheckboxNo, true);
  if (exclusionMagiExceeds) setDecimalFraction(form, F.line27Int, F.line27Dec, audited("27"));
  setCheckBox(form, audited("30").gt(audited("23")) ? F.line31CheckboxYes : F.line31CheckboxNo, true);
  return doc;
}

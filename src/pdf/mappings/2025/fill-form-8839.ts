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

import { PDFDocument, PDFTextField } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
  formatCurrency,
} from "../../pdf-utils.js";

const ZERO = new Decimal(0);
const REFUNDABLE_CAP_PER_CHILD = new Decimal(5000); // 2025: $5,000 per child

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

function roundDollar(val: Decimal): Decimal {
  return val.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Set a decimal fraction across two PDF fields (integer part . decimal part). */
function setDecimalFraction(
  form: import("pdf-lib").PDFForm,
  intField: string,
  decField: string,
  value: Decimal,
): void {
  if (value.isZero()) return;
  const str = value.toFixed(3);
  const [intPart, decPart] = str.split(".");
  try {
    const f = form.getField(intField);
    if (f instanceof PDFTextField) {
      f.setMaxLength(undefined);
      f.setText(intPart);
    }
  } catch { /* field not found */ }
  try {
    const f = form.getField(decField);
    if (f instanceof PDFTextField) {
      f.setMaxLength(undefined);
      f.setText(decPart);
    }
  } catch { /* field not found */ }
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
  const maxCredit = f8839.maxCreditPerChild;
  const phaseOutFraction = f8839.phaseOutFraction;
  const numChildren = Math.min(children.length, 3);

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

  // ── Part II: Adoption Credit (Lines 2–18) ───────────────────────────────

  // Per-child computation: Lines 2–6
  const perChildLine6: Decimal[] = [];
  const hasPriorYearCredits = children.some(
    (c) => d(c.priorYearCreditsClaimed).gt(ZERO),
  );

  // Line 3 checkbox
  setCheckBox(form, hasPriorYearCredits ? F.line3CheckboxYes : F.line3CheckboxNo, true);

  for (let i = 0; i < numChildren; i++) {
    const child = children[i];
    const priorCredits = d(child.priorYearCreditsClaimed);

    // Line 2: max credit
    setCurrencyField(form, F.line2[i], maxCredit);

    // Line 3: prior year credits
    setCurrencyField(form, F.line3[i], priorCredits);

    // Line 4: remaining max
    const line4 = Decimal.max(ZERO, maxCredit.minus(priorCredits));
    setCurrencyField(form, F.line4[i], line4);

    // Line 5: qualified expenses (special rules apply)
    let line5: Decimal;
    if (child.isSpecialNeeds && child.adoptionBecameFinal) {
      line5 = maxCredit; // special needs + final → full max
    } else if (child.isForeignAdoption && !child.adoptionBecameFinal) {
      line5 = ZERO; // foreign + not final → cannot claim yet
    } else {
      line5 = d(child.qualifiedExpenses);
    }
    setCurrencyField(form, F.line5[i], line5);

    // Line 6: smaller of Line 4 or Line 5
    const line6 = Decimal.min(line4, line5);
    setCurrencyField(form, F.line6[i], line6);
    perChildLine6.push(line6);
  }

  // Line 7: Modified AGI
  setCurrencyField(form, F.line7, f8839.magi);

  // Line 8: Is MAGI > threshold?
  const magiExceeds = f8839.excessMagi.gt(ZERO);
  setCheckBox(form, magiExceeds ? F.line8CheckboxYes : F.line8CheckboxNo, true);
  if (magiExceeds) {
    setCurrencyField(form, F.line8, f8839.excessMagi);
  }

  // Line 9: Phase-out fraction
  if (magiExceeds) {
    setDecimalFraction(form, F.line9Int, F.line9Dec, phaseOutFraction);
  }

  // Per-child computation: Lines 10–11b
  let totalLine11a = ZERO;
  let totalLine11b = ZERO;
  for (let i = 0; i < numChildren; i++) {
    const line6 = perChildLine6[i];

    // Line 10: phase-out per child (0 if MAGI below threshold)
    const line10 = magiExceeds ? roundDollar(line6.times(phaseOutFraction)) : ZERO;
    setCurrencyField(form, F.line10[i], line10);

    // Line 11a: credit after phase-out
    const line11a = Decimal.max(ZERO, line6.minus(line10));
    setCurrencyField(form, F.line11a[i], line11a);
    totalLine11a = totalLine11a.plus(line11a);

    // Line 11b: refundable portion (capped at $5,000 per child, new for 2025)
    const line11b = Decimal.min(line11a, REFUNDABLE_CAP_PER_CHILD);
    setCurrencyField(form, F.line11b[i], line11b);
    totalLine11b = totalLine11b.plus(line11b);
  }

  // Line 11c: total refundable
  setCurrencyField(form, F.line11c, totalLine11b);

  // Line 12: total of Line 11a
  setCurrencyField(form, F.line12, totalLine11a);

  // Line 13: refundable credit = Line 11c
  setCurrencyField(form, F.line13, totalLine11b);

  // Line 14: nonrefundable portion = Line 12 - Line 13
  const line14 = Decimal.max(ZERO, totalLine11a.minus(totalLine11b));
  setCurrencyField(form, F.line14, line14);

  // Lines 15–18: carryforward and credit limit (filled if engine provides data)
  // Line 15: credit carryforward from prior years — not tracked in engine result
  // Line 16 = Line 14 + Line 15 → without carryforward, equals Line 14
  setCurrencyField(form, F.line16, line14);

  // Line 17–18: credit limit worksheet result — not available from engine
  // The engine's adoptionCredit is the computed total; use it as Line 18 approximation
  // when it's less than or equal to Line 16 (meaning limit was not binding)
  if (f8839.adoptionCredit.lte(line14)) {
    setCurrencyField(form, F.line18, f8839.adoptionCredit);
  } else {
    setCurrencyField(form, F.line18, line14);
  }

  // ── Part III: Employer-Provided Adoption Benefits (Lines 19–31) ─────────

  const hasEmployerBenefits = f8839.totalEmployerBenefits.gt(ZERO);
  if (!hasEmployerBenefits) return doc;

  const hasPriorExclusions = children.some(
    (c) => d(c.priorYearExclusionsClaimed).gt(ZERO),
  );
  setCheckBox(form, hasPriorExclusions ? F.line20CheckboxYes : F.line20CheckboxNo, true);

  const perChildLine24: Decimal[] = [];
  for (let i = 0; i < numChildren; i++) {
    const child = children[i];
    const priorExclusions = d(child.priorYearExclusionsClaimed);
    const employerBenefits = d(child.employerBenefits);

    // Line 19: max exclusion per child
    setCurrencyField(form, F.line19[i], maxCredit);

    // Line 20: prior year exclusions
    setCurrencyField(form, F.line20[i], priorExclusions);

    // Line 21: remaining max exclusion
    const line21 = Decimal.max(ZERO, maxCredit.minus(priorExclusions));
    setCurrencyField(form, F.line21[i], line21);

    // Line 22: employer benefits received
    setCurrencyField(form, F.line22[i], employerBenefits);

    // Line 24: smaller of Line 21 or Line 22
    // Special needs + final → enter Line 21 per form instructions
    const line24 = (child.isSpecialNeeds && child.adoptionBecameFinal)
      ? line21
      : Decimal.min(line21, employerBenefits);
    setCurrencyField(form, F.line24[i], line24);
    perChildLine24.push(line24);
  }

  // Line 23: total employer benefits
  setCurrencyField(form, F.line23, f8839.totalEmployerBenefits);

  // Line 25: Modified AGI (same as Line 7)
  setCurrencyField(form, F.line25, f8839.magi);

  // Line 26: Is MAGI > threshold?
  setCheckBox(form, magiExceeds ? F.line26CheckboxYes : F.line26CheckboxNo, true);
  if (magiExceeds) {
    setCurrencyField(form, F.line26, f8839.excessMagi);
  }

  // Line 27: Phase-out fraction (same as Line 9)
  if (magiExceeds) {
    setDecimalFraction(form, F.line27Int, F.line27Dec, phaseOutFraction);
  }

  // Per-child: Lines 28–29
  let totalLine29 = ZERO;
  for (let i = 0; i < numChildren; i++) {
    const line24 = perChildLine24[i];

    // Line 28: phase-out per child
    const line28 = magiExceeds ? roundDollar(line24.times(phaseOutFraction)) : ZERO;
    setCurrencyField(form, F.line28[i], line28);

    // Line 29: excluded benefits
    const line29 = Decimal.max(ZERO, line24.minus(line28));
    setCurrencyField(form, F.line29[i], line29);
    totalLine29 = totalLine29.plus(line29);
  }

  // Line 30: total excluded benefits
  setCurrencyField(form, F.line30, totalLine29);

  // Line 31: taxable benefits
  const taxableBenefits = f8839.taxableEmployerBenefits;
  const line30MoreThan23 = totalLine29.gte(f8839.totalEmployerBenefits);
  setCheckBox(form, line30MoreThan23 ? F.line31CheckboxYes : F.line31CheckboxNo, true);
  setCurrencyField(form, F.line31, taxableBenefits);

  return doc;
}

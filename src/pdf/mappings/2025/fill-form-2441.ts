import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 2441 — Child and Dependent Care Expenses
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f2441.pdf', 'forms/filled/f2441-debug.pdf')
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
const providerRow = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].PartITable[0].${row}.${n}`;
const qpRow = (row: string, n: string) =>
  `topmostSubform[0].Page1[0].Table_Line2[0].${row}.${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 2441 fillable PDF debug labels.

export const FORM_2441_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Checkbox A (MFS exception) ──
  mfsException: p1("c1_1[0]"),
  // ── Checkbox B (student/disabled deemed income) ──
  studentOrDisabled: p1("c1_2[0]"),

  // ── Part I: Care Providers (up to 3 rows) ──
  // Row 1: (a) name, (b) address, (c) TIN, (d) household employee yes/no, (e) amount
  provider1Name: providerRow("BodyRow1[0]", "f1_3[0]"),
  provider1Address: providerRow("BodyRow1[0]", "ColB[0].f1_4[0]"),
  provider1TIN: providerRow("BodyRow1[0]", "f1_5[0]"),
  provider1HouseholdYes: providerRow("BodyRow1[0]", "ColD[0].c1_4[0]"),
  provider1HouseholdNo: providerRow("BodyRow1[0]", "ColD[0].c1_4[1]"),
  provider1Amount: providerRow("BodyRow1[0]", "f1_6[0]"),

  provider2Name: providerRow("BodyRow2[0]", "f1_7[0]"),
  provider2Address: providerRow("BodyRow2[0]", "ColB[0].f1_8[0]"),
  provider2TIN: providerRow("BodyRow2[0]", "f1_9[0]"),
  provider2HouseholdYes: providerRow("BodyRow2[0]", "ColD[0].c1_5[0]"),
  provider2HouseholdNo: providerRow("BodyRow2[0]", "ColD[0].c1_5[1]"),
  provider2Amount: providerRow("BodyRow2[0]", "f1_10[0]"),

  provider3Name: providerRow("BodyRow3[0]", "f1_11[0]"),
  provider3Address: providerRow("BodyRow3[0]", "ColB[0].f1_12[0]"),
  provider3TIN: providerRow("BodyRow3[0]", "f1_13[0]"),
  provider3HouseholdYes: providerRow("BodyRow3[0]", "ColD[0].c1_6[0]"),
  provider3HouseholdNo: providerRow("BodyRow3[0]", "ColD[0].c1_6[1]"),
  provider3Amount: providerRow("BodyRow3[0]", "f1_14[0]"),

  // ── "Did you receive dependent care benefits?" checkbox ──
  receivedBenefitsYes: p1("c1_7[0]"),

  // ── Part II Line 2: Qualifying Persons (up to 3 rows) ──
  // (a) first name, (a) last name, (b) SSN, (c) disabled checkbox, (d) qualified expenses
  qp1FirstName: qpRow("Row1[0]", "f1_15[0]"),
  qp1LastName: qpRow("Row1[0]", "f1_16[0]"),
  qp1SSN: qpRow("Row1[0]", "f1_17[0]"),
  qp1Disabled: qpRow("Row1[0]", "c1_8[0]"),
  qp1Expenses: qpRow("Row1[0]", "f1_18[0]"),

  qp2FirstName: qpRow("Row2[0]", "f1_19[0]"),
  qp2LastName: qpRow("Row2[0]", "f1_20[0]"),
  qp2SSN: qpRow("Row2[0]", "f1_21[0]"),
  qp2Disabled: qpRow("Row2[0]", "c1_9[0]"),
  qp2Expenses: qpRow("Row2[0]", "f1_22[0]"),

  qp3FirstName: qpRow("Row3[0]", "f1_23[0]"),
  qp3LastName: qpRow("Row3[0]", "f1_24[0]"),
  qp3SSN: qpRow("Row3[0]", "f1_25[0]"),
  qp3Disabled: qpRow("Row3[0]", "c1_10[0]"),
  qp3Expenses: qpRow("Row3[0]", "f1_26[0]"),

  // ── Part II Computation Lines ──
  line3: p1("f1_27[0]"),   // Total qualified expenses (capped at $3K/$6K)
  line4: p1("f1_28[0]"),   // Your earned income
  line5: p1("f1_29[0]"),   // Spouse's earned income (MFJ) or amount from line 4
  line6: p1("f1_30[0]"),   // Smallest of line 3, 4, or 5
  line7: p1("f1_31[0]"),   // AGI from Form 1040, line 11a
  // Line 8: decimal amount — two-part field (X . nn)
  line8decimal: p1("f1_32[0]"),  // The decimal digits after "X ."
  line9a: p1("f1_33[0]"),  // Line 6 × line 8
  line9b: p1("f1_34[0]"),  // Prior year expenses paid in current year (usually 0)
  line9c: p1("f1_35[0]"),  // Line 9a + line 9b
  line10: p1("f1_36[0]"),  // Tax liability limit
  line11: p1("f1_37[0]"),  // Credit (smaller of 9c or 10)
} as const;

const F = FORM_2441_FIELDS;

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm2441(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const f2441 = result.form2441!;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Part II Computation Lines ──

  // Line 3: Total qualified expenses (already capped at $3K/$6K by engine)
  setCurrencyField(form, F.line3, f2441.qualifyingExpenses);

  // Line 4: Your earned income
  // The engine computes earnedIncomeLimit = min(qualifyingExpenses, earnedIncome).
  // We can derive: if earnedIncomeLimit < qualifyingExpenses, earned income was limiting.
  // Otherwise earned income >= qualifyingExpenses. For the PDF, we fill the earned
  // income that produces the engine's result. When earned income is not limiting,
  // the exact value doesn't change the credit, so we use earnedIncomeLimit as a
  // conservative lower bound only when it's the binding constraint.
  // In practice, earned income is almost always >> $3K/$6K, so line 4 ≥ line 3.
  const earnedIncomeIsBinding = f2441.earnedIncomeLimit.lt(f2441.qualifyingExpenses);
  if (earnedIncomeIsBinding) {
    // Earned income was the limiting factor — we know the exact value
    setCurrencyField(form, F.line4, f2441.earnedIncomeLimit);
  }
  // If earned income isn't binding, we can't reconstruct the exact value from
  // the engine result alone. Leave blank — the credit is still correct.

  // Line 5: Spouse's earned income (MFJ) or repeat line 4 (all others)
  // Same situation as line 4 — we only know the binding constraint.

  // Line 6: Smallest of lines 3, 4, 5
  setCurrencyField(form, F.line6, f2441.earnedIncomeLimit);

  // Line 7: AGI from Form 1040, line 11
  setCurrencyField(form, F.line7, result.agi);

  // Line 8: Decimal amount from percentage table
  // The IRS form shows this as "X . nn" where nn is the decimal digits.
  // E.g., 20% → ".20", 35% → ".35"
  const pctStr = f2441.creditPercentage.times(100).toFixed(0);
  setTextField(form, F.line8decimal, pctStr);

  // Line 9a: Line 6 × line 8
  setCurrencyField(form, F.line9a, f2441.credit);

  // Line 9b: Prior year expenses paid in current year (not tracked — 0)
  setTextField(form, F.line9b, "0");

  // Line 9c: Line 9a + line 9b
  setCurrencyField(form, F.line9c, f2441.credit);

  // Line 10: Tax liability limit
  // The engine doesn't separately compute the tax liability limit for Form 2441.
  // The credit is already limited by available tax in the Schedule 3 flow.
  // We leave this blank rather than fill an inaccurate value.

  // Line 11: Credit for child and dependent care expenses
  setCurrencyField(form, F.line11, f2441.credit);

  return doc;
}

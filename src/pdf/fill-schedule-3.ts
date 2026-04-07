/**
 * PDF filler for IRS Schedule 3 (Form 1040) — Additional Credits and Payments.
 *
 * Field names from the official 2025 IRS fillable PDF, verified via debug label fill.
 */

import { PDFDocument } from "pdf-lib";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
} from "./pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule 3 fillable PDF debug labels.
// Schedule 3 is a single page.

const FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Nonrefundable Credits ──
  line1: p1("f1_03[0]"),    // Foreign tax credit
  line2: p1("f1_04[0]"),    // Child/dependent care (Form 2441)
  line3: p1("f1_05[0]"),    // Education credits (Form 8863)
  line4: p1("f1_06[0]"),    // Retirement savings credit (Form 8880)
  line5a: p1("f1_07[0]"),   // Residential clean energy (Form 5695)
  line5b: p1("f1_08[0]"),   // Energy efficient home improvement (Form 5695)

  // ── Line 6 sub-items ──
  line6a: p1("Line6a_ReadOrder[0].f1_09[0]"), // General business credit (Form 3800)
  line6b: p1("f1_10[0]"),   // Prior year minimum tax (Form 8801)
  line6c: p1("f1_11[0]"),   // Adoption credit (Form 8839)
  line6d: p1("f1_12[0]"),   // Elderly or disabled (Schedule R)
  line6e: p1("f1_13[0]"),   // Reserved
  line6f: p1("f1_14[0]"),   // Clean vehicle credit (Form 8936)
  line6g: p1("f1_15[0]"),   // Mortgage interest credit (Form 8396)
  line6h: p1("f1_16[0]"),   // DC first-time homebuyer (Form 8859)
  line6i: p1("f1_17[0]"),   // Qualified electric vehicle (Form 8834)
  line6j: p1("f1_18[0]"),   // Alternative fuel vehicle refueling (Form 8911)
  line6k: p1("f1_19[0]"),   // Tax credit bonds (Form 8912)
  line6l: p1("f1_20[0]"),   // Form 8978 line 14
  line6m: p1("f1_21[0]"),   // Previously owned clean vehicle (Form 8936)
  // Note: f2_22 in Line6z_ReadOrder is the description field
  line6zDesc: p1("Line6z_ReadOrder[0].f2_22[0]"), // Other nonrefundable credits description
  line6z: p1("f1_23[0]"),   // Other nonrefundable credits amount
  line7: p1("f1_24[0]"),    // Total other nonrefundable credits (6a-6z)
  line8: p1("f1_25[0]"),    // Total nonrefundable credits → 1040 Line 20

  // ── Part II: Other Payments and Refundable Credits ──
  line9: p1("f1_26[0]"),    // Net premium tax credit (Form 8962)
  line10: p1("f1_27[0]"),   // Amount paid with extension request
  line11: p1("f1_28[0]"),   // Excess SS/RRTA withholding
  line12: p1("f1_29[0]"),   // Credit for federal tax on fuels (Form 4136)

  // ── Line 13 sub-items ──
  line13a: p1("Line13_ReadOrder[0].f1_30[0]"), // Form 2439
  line13b: p1("f1_31[0]"),  // Section 1341 credit
  line13c: p1("f1_32[0]"),  // Net elective payment (Form 3800)
  line13d: p1("f1_33[0]"),  // Deferred net 965 tax liability
  line13zDesc: p1("Line13z_ReadOrder[0].f1_34[0]"), // Other refundable credits description
  line13z: p1("f1_35[0]"),  // Other refundable credits amount
  line14: p1("f1_36[0]"),   // Total other payments (13a-13z)
  line15: p1("f1_37[0]"),   // Total → 1040 Line 31
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule 3 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillSchedule3(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const F = FIELDS;
  const s3 = result.schedule3;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!s3) return doc;

  // ── Part I: Nonrefundable Credits ──
  setCurrencyField(form, F.line1, s3.foreignTaxCredit);
  setCurrencyField(form, F.line2, s3.childDependentCareCredit);
  setCurrencyField(form, F.line3, s3.educationCredits);
  setCurrencyField(form, F.line4, s3.retirementSavingsCredit);
  setCurrencyField(form, F.line5a, s3.residentialCleanEnergyCredit);
  setCurrencyField(form, F.line5b, s3.energyImprovementCredit);

  // Line 6 sub-items
  setCurrencyField(form, F.line6a, s3.generalBusinessCredit);
  setCurrencyField(form, F.line6b, s3.priorYearMinimumTaxCredit);
  setCurrencyField(form, F.line6c, s3.adoptionCredit);
  setCurrencyField(form, F.line6d, s3.elderlyOrDisabledCredit);
  setCurrencyField(form, F.line6f, s3.newCleanVehicleCredit);
  setCurrencyField(form, F.line6m, s3.previouslyOwnedCleanVehicleCredit);

  setCurrencyField(form, F.line7, s3.totalNonrefundableCredits);
  // Line 8 = lines 1+2+3+4+5a+5b+7
  setCurrencyField(form, F.line8, s3.totalNonrefundableCredits);

  // ── Part II: Other Payments and Refundable Credits ──
  setCurrencyField(form, F.line9, s3.netPremiumTaxCredit);
  setCurrencyField(form, F.line11, s3.excessSSWithholding);
  setCurrencyField(form, F.line15, s3.totalRefundableCredits);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_3_FIELDS };

import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule 2 (Form 1040) — Additional Taxes.
 *
 * Field names from the official 2025 IRS fillable PDF, verified via debug label fill.
 * Note: Schedule 2 uses "form1[0]" as root (not "topmostSubform[0]").
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

const p1 = (n: string) => `form1[0].Page1[0].${n}`;
const p2 = (n: string) => `form1[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule 2 fillable PDF debug labels.

const FIELDS = {
  // ── Header ──
  name: p1("f1_01[0]"),
  ssn: p1("f1_02[0]"),

  // ── Part I: Tax ──
  line1a: p1("Line1a_ReadOrder[0].f1_03[0]"), // Excess APTC repayment
  line1b: p1("f1_04[0]"),   // Repayment of new clean vehicle credit
  line1c: p1("f1_05[0]"),   // Repayment of previously owned clean vehicle credit
  line1d: p1("f1_06[0]"),   // Recapture of net EPE (Form 4255)
  line1e: p1("f1_07[0]"),   // Excessive payments on gross EPE
  line1f: p1("f1_08[0]"),   // 20% EP from Form 4255
  line1yDesc: p1("f1_09[0]"), // Other additions description
  line1y: p1("f1_10[0]"),   // Other additions amount
  line1z: p1("f1_11[0]"),   // Add lines 1a through 1y
  line2: p1("f1_12[0]"),    // AMT (Form 6251)
  line3: p1("f1_13[0]"),    // Line 1z + Line 2 → 1040 Line 17

  // ── Part II: Other Taxes ──
  line4Exemption: p1("Line4_ReadOrder[0].f1_14[0]"), // SE tax exemption text
  line4: p1("f1_15[0]"),    // Self-employment tax
  line5: p1("f1_16[0]"),    // SS/Medicare on unreported tips (Form 4137)
  line6: p1("f1_17[0]"),    // Uncollected SS/Medicare on wages (Form 8919)
  line7: p1("f1_18[0]"),    // Total additional SS/Medicare (5+6)
  // c1_6 = Line 8 checkbox (Form 5329 not required)
  line8: p1("f1_19[0]"),    // Additional tax on IRAs (Form 5329)
  line9: p1("f1_20[0]"),    // Household employment taxes (Schedule H)
  line10: p1("f1_21[0]"),   // Reserved
  line11: p1("f1_22[0]"),   // Additional Medicare Tax (Form 8959)
  line12: p1("f1_23[0]"),   // NIIT (Form 8960)
  line13: p1("f1_24[0]"),   // Uncollected SS/Medicare/RRTA on tips/GTL
  line14: p1("f1_25[0]"),   // Interest on installment income
  line15: p1("f1_26[0]"),   // Interest on deferred tax (installment sales)
  line16: p1("f1_27[0]"),   // Recapture of low-income housing credit

  // ── Page 2: Part II continued ──
  line17aDesc: p2("Line17a_ReadOrder[0].Line17_ReadOrder[0].f2_01[0]"), // Recapture description
  line17a: p2("Line17a_ReadOrder[0].f2_02[0]"), // Recapture of other credits
  line17b: p2("f2_03[0]"),  // Recapture of federal mortgage subsidy
  line17c: p2("f2_04[0]"),  // Additional tax on HSA distributions
  line17d: p2("f2_05[0]"),  // Additional tax on HSA (not eligible)
  line17e: p2("f2_06[0]"),  // Additional tax on Archer MSA distributions
  line17f: p2("f2_07[0]"),  // Additional tax on Medicare Advantage MSA
  line17g: p2("f2_08[0]"),  // Recapture of charitable contribution
  line17h: p2("f2_09[0]"),  // Nonqualified deferred comp (409A)
  line17i: p2("f2_10[0]"),  // Nonqualified deferred comp (457A)
  line17j: p2("f2_11[0]"),  // Section 72(m)(5) excess benefits
  line17k: p2("f2_12[0]"),  // Golden parachute payments
  line17l: p2("f2_13[0]"),  // Accumulation distribution of trusts
  line17m: p2("f2_14[0]"),  // Excise tax on insider stock comp
  line17n: p2("f2_15[0]"),  // Look-back interest
  line17o: p2("f2_16[0]"),  // Tax on non-effectively connected income
  line17p: p2("f2_17[0]"),  // Interest from Form 8621 line 16f
  line17q: p2("f2_18[0]"),  // Interest from Form 8621 line 24
  line17zDesc: p2("f2_19[0]"), // Other taxes description
  line17z: p2("f2_20[0]"),  // Other taxes amount
  line18: p2("f2_21[0]"),   // Total additional taxes (17a-17z)
  line19: p2("f2_22[0]"),   // Recapture of net EPE (Form 4255 line 1d)
  line20: p2("f2_23[0]"),   // Section 965 net tax liability
  line21: p2("f2_24[0]"),   // Total other taxes → 1040 Line 23
} as const;

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule 2 PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillSchedule2(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = FIELDS;
  const s2 = result.schedule2;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!s2) return doc;

  // ── Part I: Tax ──
  setCurrencyField(form, F.line1a, s2.excessAPTCRepayment);
  setCurrencyField(form, F.line1z, s2.excessAPTCRepayment); // 1z = sum of 1a-1y
  setCurrencyField(form, F.line2, s2.amt);
  setCurrencyField(form, F.line3, s2.partITotal);

  // ── Part II: Other Taxes ──
  setCurrencyField(form, F.line4, s2.selfEmploymentTax);
  setCurrencyField(form, F.line5, s2.unreportedSSTax);
  setCurrencyField(form, F.line6, s2.form8919Tax);
  setCurrencyField(form, F.line7, s2.unreportedSSTax.plus(s2.form8919Tax));
  setCurrencyField(form, F.line11, s2.additionalMedicareTax);
  setCurrencyField(form, F.line12, s2.niitTax);
  setCurrencyField(form, F.line9, s2.householdEmploymentTax);

  // Page 2 — Line 17 sub-items
  setCurrencyField(form, F.line17c, s2.hsaAdditionalTax);
  setCurrencyField(form, F.line17d, s2.hsaRecaptureTax);

  setCurrencyField(form, F.line18, s2.partIITotal);
  setCurrencyField(form, F.line21, s2.totalAdditionalTaxes);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_2_FIELDS };

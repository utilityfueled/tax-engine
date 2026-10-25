import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8936 — Clean Vehicle Credits.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f8936.pdf', 'forms/filled/f8936-debug.pdf')
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 8936 fillable PDF field inspection.

export const FORM_8936_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Modified AGI ──
  line1a: p1("Line1a_ReadOrder[0].f1_3[0]"),  // Current year AGI
  line1b: p1("f1_4[0]"),   // Puerto Rico exclusion
  line1c: p1("f1_5[0]"),   // Form 2555 line 45 (foreign earned income)
  line1d: p1("f1_6[0]"),   // Form 2555 line 50 (foreign housing)
  line1e: p1("f1_7[0]"),   // Form 4563 line 15
  line2: p1("f1_8[0]"),    // Current year MAGI (sum 1a–1e)

  line3a: p1("Line3a_ReadOrder[0].f1_9[0]"),  // Prior year AGI
  line3b: p1("f1_10[0]"),  // Prior year Puerto Rico exclusion
  line3c: p1("f1_11[0]"),  // Prior year Form 2555 line 45
  line3d: p1("f1_12[0]"),  // Prior year Form 2555 line 50
  line3e: p1("f1_13[0]"),  // Prior year Form 4563 line 15
  line4: p1("f1_14[0]"),   // Prior year MAGI (sum 3a–3e)
  line5: p1("f1_15[0]"),   // Prior year filing status abbreviation

  // ── Part II: Business/Investment Use (Lines 6–8) ──
  line6: p1("f1_16[0]"),   // Business credit from Schedule A Part II
  line7: p1("f1_17[0]"),   // Business credit from partnerships/S corps
  line8: p1("f1_18[0]"),   // Business/investment use credit total

  // ── Part III: Personal Use of New Clean Vehicles (Lines 9–13) ──
  line9: p1("f1_19[0]"),   // Personal credit from Schedule A Part III
  line10: p1("f1_20[0]"),  // Form 1040 line 18 (tax before credits)
  line11: p1("f1_21[0]"),  // Personal credits (before new vehicle credit)
  line12: p1("f1_22[0]"),  // Line 10 − Line 11 (≥ 0)
  line13: p1("f1_23[0]"),  // Allowable new vehicle credit (min line 9, line 12)

  // ── Part IV: Previously Owned Clean Vehicles (Lines 14–18) ──
  line14: p1("f1_24[0]"),  // Previously owned credit from Schedule A Part IV
  line15: p1("f1_25[0]"),  // Form 1040 line 18 (tax before credits)
  line16: p1("f1_26[0]"),  // Personal credits (including line 13)
  line17: p1("f1_27[0]"),  // Line 15 − Line 16 (≥ 0)
  line18: p1("f1_28[0]"),  // Allowable previously owned credit

  // ── Part V: Commercial Clean Vehicles (Lines 19–21) ──
  line19: p1("f1_29[0]"),  // Commercial credit from Schedule A Part V
  line20: p1("f1_30[0]"),  // Commercial credit from partnerships/S corps
  line21: p1("f1_31[0]"),  // Commercial credit total
} as const;

const F = FORM_8936_FIELDS;

// ─── Filing Status Abbreviation ────────────────────────────────────────────
// Form 8936 Line 5 uses IRS abbreviations for prior-year filing status.

function filingStatusAbbrev(status: FilingStatus): string {
  switch (status) {
    case "single": return "S";
    case "married_filing_jointly": return "MFJ";
    case "married_filing_separately": return "MFS";
    case "head_of_household": return "HOH";
    case "qualifying_surviving_spouse": return "QSS";
  }
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

export async function fillForm8936(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const f8936 = result.form8936!;
  const f8936Input = input.form8936!;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  // ── Part I: Modified AGI ──
  setCurrencyField(form, F.line1a, result.agi);

  const foreignExclusion = d(f8936Input.foreignEarnedIncomeExclusion);
  const foreignHousing = d(f8936Input.foreignHousingDeduction);
  if (foreignExclusion.gt(0)) setCurrencyField(form, F.line1c, foreignExclusion);
  if (foreignHousing.gt(0)) setCurrencyField(form, F.line1d, foreignHousing);

  // Line 2: Current year MAGI
  setCurrencyField(form, F.line2, f8936.currentYearMagi);

  // Lines 3a–3e: Prior year MAGI components
  const priorAgi = d(f8936Input.priorYearAgi);
  const priorForeignExclusion = d(f8936Input.priorYearForeignEarnedIncomeExclusion);
  const priorForeignHousing = d(f8936Input.priorYearForeignHousingDeduction);
  const hasPriorYear = !priorAgi.isZero() || !priorForeignExclusion.isZero() || !priorForeignHousing.isZero();

  if (hasPriorYear) {
    setCurrencyField(form, F.line3a, priorAgi);
    if (priorForeignExclusion.gt(0)) setCurrencyField(form, F.line3c, priorForeignExclusion);
    if (priorForeignHousing.gt(0)) setCurrencyField(form, F.line3d, priorForeignHousing);
    setCurrencyField(form, F.line4, f8936.priorYearMagi);
  }

  // Line 5: Filing status abbreviation (uses current year since prior year status
  // is not separately tracked; the form says "2024 filing status")
  setTextField(form, F.line5, filingStatusAbbrev(input.taxpayer.filingStatus));

  // ── Part III: Personal Use of New Clean Vehicles ──
  if (f8936.totalNewVehicleCredit.gt(0)) {
    setCurrencyField(form, F.line9, f8936.totalNewVehicleCredit);

    // Line 10: Form 1040 line 18 (total tax before credits)
    setCurrencyField(form, F.line10, result.totalTaxBeforeCredits);

    // Line 11: Personal credits before new vehicle credit
    // = child tax credit + (schedule 3 nonrefundable credits − new vehicle − previously owned)
    const sched3Credits = result.schedule3
      ? result.schedule3.totalNonrefundableCredits
          .minus(result.schedule3.newCleanVehicleCredit)
          .minus(result.schedule3.previouslyOwnedCleanVehicleCredit)
      : new Decimal(0);
    const personalCreditsBeforeNewVehicle = result.childTaxCredit.plus(sched3Credits);
    setCurrencyField(form, F.line11, personalCreditsBeforeNewVehicle);

    // Line 12: Line 10 − Line 11 (floor 0)
    const line12 = zeroFloor(result.totalTaxBeforeCredits.minus(personalCreditsBeforeNewVehicle));
    setCurrencyField(form, F.line12, line12);

    // Line 13: Allowable credit (min of line 9, line 12)
    const line13 = Decimal.min(f8936.totalNewVehicleCredit, line12);
    setCurrencyField(form, F.line13, line13);
  }

  // ── Part IV: Previously Owned Clean Vehicles ──
  if (f8936.totalPreviouslyOwnedCredit.gt(0)) {
    setCurrencyField(form, F.line14, f8936.totalPreviouslyOwnedCredit);

    // Line 15: Form 1040 line 18 (same as line 10)
    setCurrencyField(form, F.line15, result.totalTaxBeforeCredits);

    // Line 16: Personal credits including line 13 (new vehicle credit)
    const sched3Credits = result.schedule3
      ? result.schedule3.totalNonrefundableCredits
          .minus(result.schedule3.previouslyOwnedCleanVehicleCredit)
      : new Decimal(0);
    const personalCreditsBeforePrevOwned = result.childTaxCredit.plus(sched3Credits);
    setCurrencyField(form, F.line16, personalCreditsBeforePrevOwned);

    // Line 17: Line 15 − Line 16 (floor 0)
    const line17 = zeroFloor(result.totalTaxBeforeCredits.minus(personalCreditsBeforePrevOwned));
    setCurrencyField(form, F.line17, line17);

    // Line 18: Allowable credit (min of line 14, line 17)
    const line18 = Decimal.min(f8936.totalPreviouslyOwnedCredit, line17);
    setCurrencyField(form, F.line18, line18);
  }

  return doc;
}

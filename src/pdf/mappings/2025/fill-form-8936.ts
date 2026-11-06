import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 8936 — Clean Vehicle Credits.
 *
 * Field names are from the official IRS fillable PDF (2025 tax year).
 * Field mapping was derived by inspecting field names in the blank PDF.
 *
 * To verify or update mappings, run the debug utility:
 *   fillDebugLabels('forms/blank/2025/f8936.pdf', 'forms/filled/f8936-debug.pdf')
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
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
  line16: p1("f1_26[0]"),  // Worksheet credits before used credit (excludes new credit)
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
  const calculation = result.form8936;
  const source = input.form8936;
  if (!calculation || !source || !calculation.sourceFactsVerified) {
    throw new Error("Form 8936 review requires verified vehicle source facts and audit");
  }
  if (calculation.requiresForm3800 || calculation.requiresTransferReconciliation) {
    throw new Error("Form 8936 business or transfer reconciliation requires its supporting worksheet");
  }
  const audited = (line: string): Decimal => {
    const matches = calculation.lines.filter(entry => entry.form === "Form 8936" && entry.line === line);
    if (matches.length !== 1 || !matches[0].value.isFinite()) throw new Error(`Missing, duplicate or invalid Form 8936 audit entry ${line}`);
    return matches[0].value;
  };
  if (!audited("13").eq(calculation.totalNewVehicleCredit) || !audited("18").eq(calculation.totalPreviouslyOwnedCredit)) {
    throw new Error("Form 8936 audit disagrees with allowed vehicle credits");
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  setCurrencyField(form, F.line1a, result.agi);
  setCurrencyField(form, F.line1c, d(source.foreignEarnedIncomeExclusion));
  setCurrencyField(form, F.line1d, d(source.foreignHousingDeduction));
  setCurrencyField(form, F.line2, audited("2"));
  if (calculation.priorYearMagiKnown) {
    if (source.priorYearAgi === undefined || source.priorYearFilingStatus === undefined || source.priorYearAgiAdjustmentsConfirmed !== true) {
      throw new Error("Form 8936 prior-year source AGI, filing status and adjustments must be known");
    }
    // An actual zero must remain distinguishable from an unanswered prior year.
    setTextField(form, F.line3a, d(source.priorYearAgi).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
    setCurrencyField(form, F.line3c, d(source.priorYearForeignEarnedIncomeExclusion));
    setCurrencyField(form, F.line3d, d(source.priorYearForeignHousingDeduction));
    setTextField(form, F.line4, audited("4").toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
    setTextField(form, F.line5, filingStatusAbbrev(source.priorYearFilingStatus));
  }
  if (source.newCleanVehicles.length > 0) {
    for (const line of ["9", "10", "11", "12", "13"] as const) setCurrencyField(form, F[`line${line}`], audited(line));
  }
  if (source.previouslyOwnedCleanVehicles.length > 0) {
    for (const line of ["14", "15", "16", "17", "18"] as const) setCurrencyField(form, F[`line${line}`], audited(line));
  }
  // Review detail is not the unqualified Schedule A filing attachment. It preserves
  // every source record and repayment while making that output gap explicit.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage();
  let y = page.getHeight() - 40;
  const write = (text: string) => {
    for (const line of text.match(/.{1,96}(?:\s|$)|.{1,96}/g) ?? [text]) {
      if (y < 45) { page = doc.addPage(); y = page.getHeight() - 40; }
      page.drawText(line.trim(), { x: 32, y, size: 9, font });
      y -= 15;
    }
  };
  write("FORM 8936 REVIEW DETAILS - Schedule A filing attachment is not qualified");
  write("Credit and repayment amounts copy the verified engine audit. This review does not establish");
  write("a complete Schedule A filing attachment, seller-report acceptance or a filing-ready return.");
  if (d(source.possessionIncomeExclusion).gt(0) || d(source.priorYearPossessionIncomeExclusion).gt(0)) {
    write(`Combined possession exclusions: current $${d(source.possessionIncomeExclusion).toFixed(2)}, prior $${d(source.priorYearPossessionIncomeExclusion).toFixed(2)}.`);
    write("The Puerto Rico/Form 4563 split was not collected; component lines remain unanswered.");
  }
  for (const [kind, vehicles, details] of [
    ["New", source.newCleanVehicles, calculation.newVehicleDetails],
    ["Previously owned", source.previouslyOwnedCleanVehicles, calculation.previouslyOwnedDetails],
  ] as const) {
    if (vehicles.length !== details.length) throw new Error("Form 8936 source vehicle count disagrees with its audit");
    for (const [index, vehicle] of vehicles.entries()) {
      const detail = details[index];
      write(`${kind} ${index + 1}: VIN ${vehicle.vin}; owner ${vehicle.owner}; acquired ${vehicle.dateAcquired}; placed in service ${vehicle.datePlacedInService}.`);
      write(`Contract ${vehicle.bindingContractDate}; payment ${vehicle.paymentDate}; reported credit $${d(vehicle.sellerReportCreditAmount).toFixed(2)}; transfer $${d(vehicle.creditTransferredAmount).toFixed(2)}.`);
      if (vehicle.priorYearMagiConfirmed) write(`Owner prior MAGI $${d(vehicle.priorYearMagi).toFixed(2)}; status ${vehicle.priorYearFilingStatus}.`);
      write(`Personal tentative credit $${detail.personalCredit.toFixed(2)}; repayment $${(detail.repayment ?? new Decimal(0)).toFixed(2)}; ${detail.disqualified ? detail.disqualificationReason : "source eligibility confirmed"}.`);
    }
  }
  write(`Schedule 2 line 1b new-vehicle repayment: $${audited("transfer-repayment-new").toFixed(2)}.`);
  write(`Schedule 2 line 1c used-vehicle repayment: $${audited("transfer-repayment-used").toFixed(2)}.`);
  write(`Dealer-return reconciliation amount: $${calculation.dealerTransferReconciliationAmount.toFixed(2)}. Unused nonrefundable personal credit: $${calculation.unusedPersonalCredit.toFixed(2)}.`);
  await markReviewPdf(doc);
  return doc;
}

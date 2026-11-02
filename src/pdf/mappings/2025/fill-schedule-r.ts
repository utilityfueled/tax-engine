import { assertPdfExportAllowed } from "../../export-policy.js";
/**
 * PDF filler for IRS Schedule R (Form 1040) — Credit for the Elderly or
 * the Disabled.
 *
 * Field names verified against 2025 Schedule R fillable PDF field inspection.
 *
 * The engine ScheduleRResult stores key line values. Intermediate lines
 * (13a/13b breakdown, AGI threshold, excess AGI) are derived from the
 * TaxReturnResult and ScheduleRInput.
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateScheduleR, type ScheduleRBox } from "@/engine/forms/schedule-r.js";
import { getConstants } from "@/models/constants.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";

const ZERO = new Decimal(0);
const HALF = new Decimal("0.5");

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p1m = (n: string) => `topmostSubform[0].Page1[0].Married[0].${n}`;
const p1ms = (n: string) => `topmostSubform[0].Page1[0].MarriedSeparate[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule R fillable PDF debug labels.

export const SCHEDULE_R_FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Part I: Eligibility Checkboxes ──
  box1: p1("c1_1[0]"),             // Single/HoH/QSS — age 65+
  box2: p1("c1_1[1]"),             // Single/HoH/QSS — under 65, disabled
  box3: p1m("c1_1[0]"),            // MFJ — both 65+
  box4: p1m("c1_1[1]"),            // MFJ — both under 65, one disabled
  box5: p1m("c1_1[2]"),            // MFJ — both under 65, both disabled
  box6: p1m("c1_1[3]"),            // MFJ — one 65+, other under 65 disabled
  box7: p1m("c1_1[4]"),            // MFJ — one 65+, other under 65 NOT disabled
  box8: p1ms("c1_1[0]"),           // MFS — age 65+
  box9: p1ms("c1_1[1]"),           // MFS — under 65, disabled
  disabilityStatement: p1("c1_2[0]"), // Part II disability statement checkbox

  // ── Part III: Figure Your Credit (Page 2) ──
  line10: p2("f2_1[0]"),   // Initial amount
  line11: p2("f2_2[0]"),   // Taxable disability income
  line12: p2("f2_3[0]"),   // Adjusted initial amount (smaller of 10 or 11)
  line13a: p2("f2_4[0]"),  // Nontaxable Social Security benefits
  line13b: p2("f2_5[0]"),  // Nontaxable pensions/annuities/disability
  line13c: p2("f2_6[0]"),  // Total nontaxable benefits (13a + 13b)
  line14: p2("f2_7[0]"),   // AGI from Form 1040 Line 11
  line15: p2("f2_8[0]"),   // AGI threshold based on box
  line16: p2("f2_9[0]"),   // Excess AGI (Line 14 - Line 15)
  line17: p2("f2_10[0]"),  // Half of Line 16
  line18: p2("f2_11[0]"),  // Total reduction (Line 13c + Line 17)
  line19: p2("f2_12[0]"),  // Credit base (Line 12 - Line 18)
  line20: p2("f2_13[0]"),  // Tentative credit (Line 19 × 0.15)
  line21: p2("f2_14[0]"),  // Tax liability limit
  line22: p2("f2_15[0]"),  // Final credit (smaller of 20 or 21)
} as const;

// ─── Box → Checkbox Field Mapping ──────────────────────────────────────────

const BOX_FIELD_MAP: Record<ScheduleRBox, string> = {
  1: SCHEDULE_R_FIELDS.box1,
  2: SCHEDULE_R_FIELDS.box2,
  3: SCHEDULE_R_FIELDS.box3,
  4: SCHEDULE_R_FIELDS.box4,
  5: SCHEDULE_R_FIELDS.box5,
  6: SCHEDULE_R_FIELDS.box6,
  7: SCHEDULE_R_FIELDS.box7,
  8: SCHEDULE_R_FIELDS.box8,
  9: SCHEDULE_R_FIELDS.box9,
};

/** AGI thresholds by box (statutory amounts, not inflation-adjusted) */
function getAgiThreshold(box: ScheduleRBox): Decimal {
  switch (box) {
    case 1: case 2: return new Decimal(7500);
    case 3: case 4: case 5: case 6: case 7: return new Decimal(10000);
    case 8: case 9: return new Decimal(5000);
  }
}

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule R PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
/** Validate original R facts before packet selection or any template I/O. */
export function assertScheduleRSourceConsistency(input: TaxYearInput, result: TaxReturnResult): void {
  const schedR = result.scheduleR;
  const observedCredit = result.schedule3?.elderlyOrDisabledCredit;
  if ((!input.scheduleR || !schedR?.eligible) && result.schedule3
    && (!Decimal.isDecimal(observedCredit) || !observedCredit.isFinite() || !observedCredit.isZero())) {
    throw new Error("Schedule R credit is inconsistent with absent or ineligible original sources");
  }
  if (!input.scheduleR) {
    if (schedR) throw new Error("Schedule R original source facts are missing");
    return;
  }
  const params = {taxYear: input.taxpayer.taxYear,
    filingStatus: input.taxpayer.filingStatus, agi: result.agi,
    nontaxableSocialSecurity: Decimal.max(ZERO, result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable)),
    scheduleRInput: input.scheduleR, livedWithSpouse: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
    constants: getConstants(input.taxpayer.taxYear).elderlyOrDisabledCredit};
  let expected = calculateScheduleR(params);
  if (!schedR || expected.eligible !== schedR.eligible) {
    throw new Error("Schedule R original source eligibility is inconsistent");
  }
  if (expected.eligible) {
    const taxSources = result.allLines.filter(row => row.form === "1040" && row.line === "18");
    const schedule3 = result.schedule3;
    if (schedR.creditLimit === undefined || schedR.allowedCredit === undefined
      || taxSources.length !== 1 || !schedule3) {
      throw new Error("Schedule R actual credit limit worksheet is missing");
    }
    const taxSource = taxSources[0];
    if (!taxSource) throw new Error("Schedule R actual credit limit worksheet is missing");
    expected = calculateScheduleR({...params,
      creditLimitWorksheet: {taxBeforeCredits: taxSource.value,
        foreignTaxCredit: schedule3.foreignTaxCredit, dependentCareCredit: schedule3.childDependentCareCredit,
        // No Form8978/line6l input exists in the admitted canonical return model.
        schedule3Line6l: ZERO}});
    if (!expected.creditLimit?.eq(schedR.creditLimit) || !expected.allowedCredit?.eq(schedR.allowedCredit)
      || !schedule3.elderlyOrDisabledCredit.eq(schedR.allowedCredit)) {
      throw new Error("Schedule R actual credit limit worksheet is inconsistent");
    }
  }
  const amounts = ['initialAmount', 'line11Amount', 'adjustedInitialAmount', 'nontaxableBenefits',
    'netInitialAmount', 'agiReduction', 'creditBase', 'credit', 'creditLimit', 'allowedCredit'] as const;
  if (expected.box !== schedR.box || expected.lines.length !== schedR.lines.length
    || expected.lines.some((row, index) => row.form !== schedR.lines[index]?.form
      || row.line !== schedR.lines[index]?.line || !row.value.eq(schedR.lines[index].value))
    || amounts.some(key => {
      const actual = schedR[key]; const original = expected[key];
      return original === undefined ? actual !== undefined : !Decimal.isDecimal(actual) || !original.eq(actual);
    })) {
    throw new Error("Schedule R original source facts do not match the calculation");
  }
}

export async function fillScheduleR(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  assertScheduleRSourceConsistency(input, result);
  const schedR = result.scheduleR;
  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const form = doc.getForm();
  const F = SCHEDULE_R_FIELDS;

  // ── Header ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));

  if (!schedR || !schedR.eligible || !schedR.box) return doc;

  const box = schedR.box;

  // ── Part I: Check the eligibility box ──
  setCheckBox(form, BOX_FIELD_MAP[box], true);

  // ── Part III: Figure Your Credit ──

  // Line 10: Initial amount
  setCurrencyField(form, F.line10, schedR.initialAmount);

  // Report actual uncapped line11, including the box6 age-based $5,000.
  if (schedR.line11Amount !== undefined) setCurrencyField(form, F.line11, schedR.line11Amount);

  // Line 12: Adjusted initial amount
  setCurrencyField(form, F.line12, schedR.adjustedInitialAmount);

  // Lines 13a-13c: Nontaxable benefits breakdown
  const nontaxableSS = Decimal.max(ZERO,
    result.socialSecurityBenefitsGross.minus(result.socialSecurityBenefitsTaxable));
  const nontaxablePensions = Decimal.max(ZERO,
    schedR.nontaxableBenefits.minus(nontaxableSS));

  setCurrencyField(form, F.line13a, nontaxableSS);
  setCurrencyField(form, F.line13b, nontaxablePensions);
  setTextField(form, F.line13c, schedR.nontaxableBenefits.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));

  // Lines 14-17: AGI reduction calculation
  const agi = result.agi;
  const agiThreshold = getAgiThreshold(box);
  const excessAgi = Decimal.max(ZERO, agi.minus(agiThreshold));
  const halfExcess = excessAgi.times(HALF).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  setCurrencyField(form, F.line14, agi);
  setCurrencyField(form, F.line15, agiThreshold);
  setTextField(form, F.line16, excessAgi.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  setCurrencyField(form, F.line17, halfExcess);

  // Line 18: Total reduction (nontaxable benefits + half excess AGI)
  const totalReduction = schedR.nontaxableBenefits.plus(halfExcess);
  setCurrencyField(form, F.line18, totalReduction);

  // Line 19: Credit base
  setCurrencyField(form, F.line19, schedR.creditBase);

  // Line 20: Tentative credit (15% of credit base)
  setCurrencyField(form, F.line20, schedR.credit);

  // Known actual worksheet values were checked before loading the template.
  if (schedR.creditLimit !== undefined && schedR.allowedCredit !== undefined) {
    setTextField(form, F.line21, schedR.creditLimit.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
    setTextField(form, F.line22, schedR.allowedCredit.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
  }

  return doc;
}

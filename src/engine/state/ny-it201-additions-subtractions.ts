/**
 * New York IT-201 additions and subtractions.
 * Computes NY AGI from federal AGI (IT-201 lines 19-33).
 * Spec: spec/state/ny-it201-additions-subtractions.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYAdditionsSubtractionsYear {
  /** Maximum pension/annuity exclusion per qualifying taxpayer */
  pensionExclusionMax: Decimal;
  /** Maximum college tuition deduction per eligible student */
  collegeTuitionDeductionMax: Decimal;
}

/** Per-student college tuition detail */
export interface NYCollegeTuitionStudent {
  /** Qualifying undergraduate tuition paid for this student */
  tuitionPaid: Decimal | string | number;
}

/** Per-spouse pension/annuity detail for the exclusion */
export interface NYPensionExclusionDetail {
  /** Pension/annuity income NOT from government sources (line 26 already handles those) */
  nonGovernmentPensionIncome: Decimal | string | number;
  /** Whether this taxpayer is age 59½ or older at end of tax year */
  isAge59AndHalf: boolean;
}

export interface NYIT201AdditionsSubtractionsInput {
  /** Federal adjusted gross income (Form 1040 line 11) */
  federalAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;

  /* ----- Additions (lines 20-23) ----- */

  /** Line 20: Interest on state/local bonds other than NY/NYC */
  outOfStateMuniBondInterest?: Decimal | string | number;
  /** Line 21: Public employee 414(h) retirement contributions */
  publicEmployee414hContributions?: Decimal | string | number;
  /** Line 23 component: NYC flexible benefits program (IT-225 A-101 / IRC §125) */
  nycFlexibleSpendingContributions?: Decimal | string | number;
  /** Line 22: 529 plan distributions not used for qualified expenses */
  nonQualified529Distributions?: Decimal | string | number;
  /** Line 23 component: Other additions (from Form IT-225 line 9) */
  otherAdditions?: Decimal | string | number;

  /* ----- Subtractions (lines 25-31) ----- */

  /** Line 25: State/local income tax refunds included in federal income */
  stateLocalTaxRefunds?: Decimal | string | number;
  /** Line 26: Government pension income (NYS, NYC, federal) */
  governmentPensionIncome?: Decimal | string | number;
  /** Line 27: Taxable Social Security benefits (from federal 1040 line 6b) */
  taxableSocialSecurityBenefits?: Decimal | string | number;
  /** Line 28: Interest income on US government bonds */
  usGovernmentBondInterest?: Decimal | string | number;
  /** Line 29: Pension/annuity exclusion details */
  pensionExclusion?: NYPensionExclusionDetail;
  /** Line 29 for MFJ: spouse pension exclusion (each spouse can exclude up to $20,000) */
  spousePensionExclusion?: NYPensionExclusionDetail;
  /** Line 30: College tuition details per student */
  collegeTuitionStudents?: NYCollegeTuitionStudent[];
  /** Line 31: Other subtractions (from Form IT-225) */
  otherSubtractions?: Decimal | string | number;
}

export interface NYIT201AdditionsSubtractionsResult {
  federalAgi: Decimal;

  /* Additions */
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line23: Decimal;
  totalAdditions: Decimal;

  /* Subtractions */
  line25: Decimal;
  line26: Decimal;
  line27: Decimal;
  line28: Decimal;
  line29: Decimal;
  line30: Decimal;
  line31: Decimal;
  totalSubtractions: Decimal;

  /** New York adjusted gross income (line 33) */
  nyAgi: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

export const NY_ADDITIONS_SUBTRACTIONS_CONSTANTS: Record<number, NYAdditionsSubtractionsYear> = {
  2025: {
    pensionExclusionMax: new Decimal(20000),
    collegeTuitionDeductionMax: new Decimal(10000),
  },
};

/* ---------- Main computation ---------- */

export function calculateNYIT201AdditionsSubtractions(
  input: NYIT201AdditionsSubtractionsInput
): NYIT201AdditionsSubtractionsResult {
  const constants = NY_ADDITIONS_SUBTRACTIONS_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-201 additions/subtractions not available for tax year ${input.taxYear}`);
  }

  const federalAgi = d(input.federalAgi);
  const audit = new AuditTrail();

  // Line 19: Federal AGI
  audit.record("NY-IT201", "19", "Federal adjusted gross income", federalAgi,
    "Federal Form 1040 line 11");

  /* ========== Additions (lines 20-23) ========== */

  const line20 = d(input.outOfStateMuniBondInterest);
  audit.record("NY-IT201", "20", "Interest on out-of-state municipal bonds", line20,
    "Interest on state/local bonds other than NY/NYC");

  const line21 = d(input.publicEmployee414hContributions);
  audit.record("NY-IT201", "21", "Public employee 414(h) contributions", line21,
    "414(h) retirement contributions from W-2");

  const line22 = d(input.nonQualified529Distributions);
  audit.record("NY-IT201", "22", "529 non-qualified distributions", line22,
    "College choice tuition savings distributions not for qualified expenses");

  const nycFlexibleBenefitsProgramAddback = d(input.nycFlexibleSpendingContributions);
  const otherIT225Additions = d(input.otherAdditions);
  const line23 = sum(nycFlexibleBenefitsProgramAddback, otherIT225Additions);
  audit.record("NY-IT201", "23", "Other NY additions", line23,
    "NYC flexible benefits program addback + Form IT-225 line 9", {
      "NYC flexible benefits program (IT-225 A-101)": nycFlexibleBenefitsProgramAddback.toString(),
      "Other additions from Form IT-225 line 9": otherIT225Additions.toString(),
    });

  // Line 24: Total additions
  const totalAdditions = sum(line20, line21, line22, line23);
  audit.record("NY-IT201", "24", "Total New York additions", totalAdditions,
    "Line 20 + 21 + 22 + 23", {
      "Line 20": line20.toString(),
      "Line 21": line21.toString(),
      "Line 22": line22.toString(),
      "Line 23": line23.toString(),
    });

  /* ========== Subtractions (lines 25-31) ========== */

  const line25 = d(input.stateLocalTaxRefunds);
  audit.record("NY-IT201", "25", "State/local income tax refunds", line25,
    "Taxable refunds from federal Schedule 1 line 1");

  const line26 = d(input.governmentPensionIncome);
  audit.record("NY-IT201", "26", "Government pension income", line26,
    "Pensions of NYS, NYC, local, and federal government");

  const line27 = d(input.taxableSocialSecurityBenefits);
  audit.record("NY-IT201", "27", "Taxable Social Security benefits", line27,
    "Federal Form 1040 line 6b");

  const line28 = d(input.usGovernmentBondInterest);
  audit.record("NY-IT201", "28", "US government bond interest", line28,
    "Interest on US Treasury bonds, bills, notes, savings bonds");

  // Line 29: Pension/annuity income exclusion
  const line29 = computePensionExclusion(
    input.pensionExclusion,
    input.spousePensionExclusion,
    input.filingStatus,
    constants.pensionExclusionMax
  );
  audit.record("NY-IT201", "29", "Pension and annuity income exclusion", line29,
    "Up to $20,000 per qualifying taxpayer age 59½+", {
      "Max exclusion per person": constants.pensionExclusionMax.toString(),
    });

  // Line 30: College tuition deduction
  const line30 = computeCollegeTuitionDeduction(
    input.collegeTuitionStudents,
    constants.collegeTuitionDeductionMax
  );
  audit.record("NY-IT201", "30", "College tuition deduction", line30,
    "Up to $10,000 per eligible student", {
      "Max per student": constants.collegeTuitionDeductionMax.toString(),
      "Number of students": (input.collegeTuitionStudents?.length ?? 0).toString(),
    });

  const line31 = d(input.otherSubtractions);
  audit.record("NY-IT201", "31", "Other NY subtractions (Form IT-225)", line31,
    "Form IT-225 line 18");

  // Line 32: Total subtractions
  const totalSubtractions = sum(line25, line26, line27, line28, line29, line30, line31);
  audit.record("NY-IT201", "32", "Total New York subtractions", totalSubtractions,
    "Line 25 + 26 + 27 + 28 + 29 + 30 + 31", {
      "Line 25": line25.toString(),
      "Line 26": line26.toString(),
      "Line 27": line27.toString(),
      "Line 28": line28.toString(),
      "Line 29": line29.toString(),
      "Line 30": line30.toString(),
      "Line 31": line31.toString(),
    });

  // Line 33: NY AGI
  const nyAgi = federalAgi.plus(totalAdditions).minus(totalSubtractions);
  audit.record("NY-IT201", "33", "New York adjusted gross income", nyAgi,
    "Line 19 + Line 24 - Line 32", {
      "Federal AGI (line 19)": federalAgi.toString(),
      "Total additions (line 24)": totalAdditions.toString(),
      "Total subtractions (line 32)": totalSubtractions.toString(),
    });

  return {
    federalAgi,
    line20,
    line21,
    line22,
    line23,
    totalAdditions,
    line25,
    line26,
    line27,
    line28,
    line29,
    line30,
    line31,
    totalSubtractions,
    nyAgi,
    lines: audit.getLines(),
  };
}

/* ---------- Helpers ---------- */

function computePensionExclusion(
  primary: NYPensionExclusionDetail | undefined,
  spouse: NYPensionExclusionDetail | undefined,
  filingStatus: FilingStatus,
  maxExclusion: Decimal
): Decimal {
  let total = new Decimal(0);

  if (primary?.isAge59AndHalf) {
    const income = d(primary.nonGovernmentPensionIncome);
    total = total.plus(min(zeroFloor(income), maxExclusion));
  }

  // Spouse exclusion only applies for MFJ
  if (filingStatus === "married_filing_jointly" && spouse?.isAge59AndHalf) {
    const income = d(spouse.nonGovernmentPensionIncome);
    total = total.plus(min(zeroFloor(income), maxExclusion));
  }

  return total;
}

function computeCollegeTuitionDeduction(
  students: NYCollegeTuitionStudent[] | undefined,
  maxPerStudent: Decimal
): Decimal {
  if (!students || students.length === 0) return new Decimal(0);

  let total = new Decimal(0);
  for (const student of students) {
    const tuition = zeroFloor(d(student.tuitionPaid));
    total = total.plus(min(tuition, maxPerStudent));
  }
  return total;
}

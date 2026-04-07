/**
 * New Jersey NJ-1040 college affordability deductions.
 * Spec: spec/state/nj-1040-college-affordability.yaml
 *
 * Computes the 2025 NJ-1040 Lines 37a-37c deductions:
 * - NJBEST contributions
 * - NJCLASS loan principal and interest
 * - Qualified tuition paid to a New Jersey institution
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

const GROSS_INCOME_LIMIT = new Decimal(200000);
const NJBEST_CAP = new Decimal(10000);
const NJCLASS_CAP = new Decimal(2500);
const TUITION_CAP = new Decimal(10000);
const MONTHS_IN_YEAR = new Decimal(12);

export interface NJ1040CollegeAffordabilityInput {
  taxYear: number;
  njGrossIncome: Decimal | string | number;
  monthsOfResidency?: number;
  njbestContributions?: Decimal | string | number;
  njclassLoanPayments?: Decimal | string | number;
  tuitionPaidToNjInstitution?: Decimal | string | number;
}

export interface NJ1040CollegeAffordabilityResult {
  eligible: boolean;
  njbestDeduction: Decimal;
  njclassDeduction: Decimal;
  tuitionDeduction: Decimal;
  totalDeduction: Decimal;
  lines: CalculatedLine[];
}

function prorateDeduction(amount: Decimal, monthsOfResidency: number): Decimal {
  const months = Math.max(0, Math.min(12, monthsOfResidency));
  if (months === 12) return roundDollar(amount);
  return roundDollar(amount.times(months).dividedBy(MONTHS_IN_YEAR));
}

export function calculateNJ1040CollegeAffordabilityDeduction(
  input: NJ1040CollegeAffordabilityInput
): NJ1040CollegeAffordabilityResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 college affordability deductions");

  const audit = new AuditTrail();
  const njGrossIncome = d(input.njGrossIncome);
  const monthsOfResidency = input.monthsOfResidency ?? 12;
  const eligible = njGrossIncome.lessThanOrEqualTo(GROSS_INCOME_LIMIT);

  audit.record(
    "NJ-1040",
    "college-affordability-eligibility",
    "College affordability deduction eligibility",
    new Decimal(eligible ? 1 : 0),
    "NJ gross income must be $200,000 or less",
    {
      "NJ gross income": njGrossIncome,
      "Income limit": GROSS_INCOME_LIMIT,
      "Months of residency": monthsOfResidency.toString(),
    }
  );

  const njbestBase = Decimal.min(zeroFloor(d(input.njbestContributions)), NJBEST_CAP);
  const njclassBase = Decimal.min(zeroFloor(d(input.njclassLoanPayments)), NJCLASS_CAP);
  const tuitionBase = Decimal.min(zeroFloor(d(input.tuitionPaidToNjInstitution)), TUITION_CAP);

  const njbestDeduction = eligible ? prorateDeduction(njbestBase, monthsOfResidency) : new Decimal(0);
  const njclassDeduction = eligible ? prorateDeduction(njclassBase, monthsOfResidency) : new Decimal(0);
  const tuitionDeduction = eligible ? prorateDeduction(tuitionBase, monthsOfResidency) : new Decimal(0);
  const totalDeduction = njbestDeduction.plus(njclassDeduction).plus(tuitionDeduction);

  audit.record(
    "NJ-1040",
    "37a",
    "NJBEST deduction",
    njbestDeduction,
    "min(NJBEST contributions, $10,000), prorated for part-year residents when eligible",
    {
      "NJBEST contributions": d(input.njbestContributions),
      "Capped amount": njbestBase,
      "Eligible": String(eligible),
    }
  );

  audit.record(
    "NJ-1040",
    "37b",
    "NJCLASS deduction",
    njclassDeduction,
    "min(NJCLASS loan principal and interest paid, $2,500), prorated for part-year residents when eligible",
    {
      "NJCLASS payments": d(input.njclassLoanPayments),
      "Capped amount": njclassBase,
      "Eligible": String(eligible),
    }
  );

  audit.record(
    "NJ-1040",
    "37c",
    "Qualified tuition deduction",
    tuitionDeduction,
    "min(qualified NJ tuition paid, $10,000), prorated for part-year residents when eligible",
    {
      "Qualified tuition paid": d(input.tuitionPaidToNjInstitution),
      "Capped amount": tuitionBase,
      "Eligible": String(eligible),
    }
  );

  audit.record(
    "NJ-1040",
    "37-total",
    "Total college affordability deductions",
    totalDeduction,
    "Line 37a + Line 37b + Line 37c",
    {
      "Line 37a": njbestDeduction,
      "Line 37b": njclassDeduction,
      "Line 37c": tuitionDeduction,
    }
  );

  return {
    eligible,
    njbestDeduction,
    njclassDeduction,
    tuitionDeduction,
    totalDeduction,
    lines: audit.getLines(),
  };
}

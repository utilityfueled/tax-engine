/**
 * Form 2555 — Foreign Earned Income Exclusion.
 * Spec: spec/federal/form-2555.yaml
 *
 * Implements:
 * - Part IV: Total foreign earned income (accepted as validated input)
 * - Part V: Housing amount computation (base, limit, excess)
 * - Part VI: Housing deduction for self-employed taxpayers
 * - Part VII: Foreign earned income exclusion with partial-year proration
 * - Part VIII: Housing exclusion for employees
 * - Stacking rule parameters for federal.ts tax computation
 */

import Decimal from "decimal.js";
import type { Form2555Input } from "@/models/inputs.js";
import type { YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor, min, roundDollar } from "@/utils/decimal.js";

export interface Form2555Result {
  /** Total foreign earned income from Part IV */
  foreignEarnedIncome: Decimal;
  /** Maximum exclusion for the tax year ($130,000 for 2025) */
  maximumExclusion: Decimal;
  /** Prorated maximum exclusion for partial qualifying periods */
  proratedMaximumExclusion: Decimal;
  /** Base housing amount (16% of prorated maximum) */
  baseHousingAmount: Decimal;
  /** Qualified housing expenses (capped at limit) */
  qualifiedHousingExpensesCapped: Decimal;
  /** Housing expense limit (30% prorated or location-specific) */
  housingExpenseLimit: Decimal;
  /** Housing amount (excess of capped expenses over base) */
  housingAmount: Decimal;
  /** Housing exclusion for employees (housing amount minus employer-provided) */
  housingExclusion: Decimal;
  /** Housing deduction for self-employed (goes to Schedule 1) */
  housingDeduction: Decimal;
  /** Income available for the foreign earned income exclusion */
  incomeAvailableForExclusion: Decimal;
  /** Foreign earned income exclusion amount */
  foreignEarnedIncomeExclusion: Decimal;
  /** Total exclusion (FEI exclusion + housing exclusion) — used for stacking rule */
  totalExclusion: Decimal;
  /** Total income reduction on Form 1040 Line 1 (exclusion + housing exclusion for employees) */
  totalIncomeReduction: Decimal;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

export function calculateForm2555(
  input: Form2555Input,
  constants: YearConstants
): Form2555Result {
  const audit = new AuditTrail();
  const feic = constants.foreignEarnedIncomeExclusion;

  const foreignEarnedIncome = d(input.foreignEarnedIncome);
  const qualifyingDays = new Decimal(input.qualifyingDays);
  const totalDaysInYear = new Decimal(input.totalDaysInYear);
  const prorationFactor = qualifyingDays.dividedBy(totalDaysInYear);

  audit.record("2555", "19-24", "Total foreign earned income", foreignEarnedIncome,
    "Validated foreign earned income input");

  // ── Part VII Line 42-43: Maximum exclusion ──────────────
  const maximumExclusion = feic.maximumExclusion;
  const proratedMaximumExclusion = roundDollar(maximumExclusion.times(prorationFactor));
  audit.record("2555", "42", "Maximum foreign earned income exclusion",
    maximumExclusion, `IRC §911(b)(2)(D)(i) for tax year`);
  audit.record("2555", "43", "Prorated maximum exclusion", proratedMaximumExclusion,
    `$${maximumExclusion} × ${input.qualifyingDays}/${input.totalDaysInYear}`,
    { qualifyingDays: qualifyingDays, totalDaysInYear });

  // ── Part V: Housing amount ──────────────────────────────
  const baseHousingAmount = roundDollar(
    maximumExclusion.times(feic.baseHousingPercentage).times(prorationFactor)
  );
  audit.record("2555", "27", "Base housing amount", baseHousingAmount,
    `$${maximumExclusion} × ${feic.baseHousingPercentage} × ${input.qualifyingDays}/${input.totalDaysInYear}`);

  const housingExpenseLimit = input.housingExpenseLocationLimit
    ? d(input.housingExpenseLocationLimit)
    : roundDollar(maximumExclusion.times(feic.defaultMaxHousingPercentage).times(prorationFactor));
  audit.record("2555", "29", "Housing expense limit", housingExpenseLimit,
    input.housingExpenseLocationLimit
      ? "Location-specific limit override"
      : `$${maximumExclusion} × ${feic.defaultMaxHousingPercentage} × ${input.qualifyingDays}/${input.totalDaysInYear}`);

  const rawHousingExpenses = d(input.qualifiedHousingExpenses);
  const qualifiedHousingExpensesCapped = min(rawHousingExpenses, housingExpenseLimit);
  const housingAmount = zeroFloor(qualifiedHousingExpensesCapped.minus(baseHousingAmount));
  audit.record("2555", "28-30", "Housing amount", housingAmount,
    `min($${rawHousingExpenses}, $${housingExpenseLimit}) - $${baseHousingAmount}`,
    { qualifiedHousingExpenses: rawHousingExpenses, housingExpenseLimit, baseHousingAmount });

  // ── Part VI (SE) or Part VIII (employee): Housing exclusion vs deduction ──
  let housingExclusion = new Decimal(0);
  let housingDeduction = new Decimal(0);

  if (input.isSelfEmployed) {
    // Self-employed: housing deduction (above-the-line, Schedule 1)
    housingDeduction = housingAmount;
    audit.record("2555", "31-32", "Housing deduction (self-employed)", housingDeduction,
      "Self-employed housing amount flows to Schedule 1");
  } else {
    // Employee: housing exclusion (reduces Form 1040 Line 1 income)
    const employerProvided = d(input.employerProvidedHousingAmount);
    housingExclusion = zeroFloor(housingAmount.minus(employerProvided));
    audit.record("2555", "43-45 (Part VIII)", "Housing exclusion (employee)", housingExclusion,
      `Housing amount $${housingAmount} - employer-provided $${employerProvided}`,
      { housingAmount, employerProvidedHousingAmount: employerProvided });
  }

  // ── Part VII Lines 44-45: Foreign earned income exclusion ──
  // Income available = foreign earned income - housing deduction - housing exclusion
  const incomeAvailableForExclusion = zeroFloor(
    foreignEarnedIncome.minus(housingDeduction).minus(housingExclusion)
  );
  const foreignEarnedIncomeExclusion = min(incomeAvailableForExclusion, proratedMaximumExclusion);
  audit.record("2555", "44-45", "Foreign earned income exclusion", foreignEarnedIncomeExclusion,
    `min($${incomeAvailableForExclusion}, $${proratedMaximumExclusion})`,
    { incomeAvailableForExclusion, proratedMaximumExclusion });

  // ── Totals for federal orchestration ────────────────────
  // Total exclusion = FEI exclusion + housing exclusion (used for stacking rule)
  const totalExclusion = foreignEarnedIncomeExclusion.plus(housingExclusion);
  // Total income reduction on Form 1040 Line 1 = exclusion + housing exclusion (employees)
  // For self-employed, housing deduction goes through Schedule 1 separately
  const totalIncomeReduction = foreignEarnedIncomeExclusion.plus(housingExclusion);

  audit.record("2555", "total", "Total foreign income exclusion", totalExclusion,
    `FEI exclusion $${foreignEarnedIncomeExclusion} + housing exclusion $${housingExclusion}`);

  return {
    foreignEarnedIncome,
    maximumExclusion,
    proratedMaximumExclusion,
    baseHousingAmount,
    qualifiedHousingExpensesCapped,
    housingExpenseLimit,
    housingAmount,
    housingExclusion,
    housingDeduction,
    incomeAvailableForExclusion,
    foreignEarnedIncomeExclusion,
    totalExclusion,
    totalIncomeReduction,
    lines: audit.getLines(),
  };
}

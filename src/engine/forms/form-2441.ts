/**
 * Form 2441 — Child and Dependent Care Expenses
 * Spec: spec/federal/form-2441.yaml
 *
 * Calculates the credit for child/dependent care expenses.
 * Credit percentage ranges 20%-35% based on AGI.
 * Max qualifying expenses: $3K (one) or $6K (two+).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form2441Input {
  careExpenses: Decimal;
  qualifyingIndividuals: number; // 1 or 2+
  earnedIncome: Decimal; // lower-earning spouse's for MFJ
  agi: Decimal;
}

export interface Form2441Result {
  qualifyingExpenses: Decimal; // Line 3
  earnedIncomeLimit: Decimal; // Line 4
  creditPercentage: Decimal; // Line 8
  credit: Decimal; // Line 9
  lines: CalculatedLine[];
}

const MAX_EXPENSES_ONE = new Decimal(3000);
const MAX_EXPENSES_TWO = new Decimal(6000);
const BASE_PERCENTAGE = new Decimal(0.35);
const MIN_PERCENTAGE = new Decimal(0.20);
const AGI_STEP = new Decimal(2000);
const AGI_THRESHOLD = new Decimal(15000);
const PERCENTAGE_REDUCTION_STEP = new Decimal(0.01);

export function calculateForm2441(input: Form2441Input): Form2441Result {
  const audit = new AuditTrail();

  // Line 3: Qualifying expenses (capped)
  const expenseLimit = input.qualifyingIndividuals >= 2
    ? MAX_EXPENSES_TWO
    : MAX_EXPENSES_ONE;
  const qualifyingExpenses = min(input.careExpenses, expenseLimit);
  audit.record("Form 2441", "3", "Qualifying expenses", qualifyingExpenses,
    `min(${input.careExpenses}, ${expenseLimit})`);

  // Line 4: Limited to earned income
  const earnedIncomeLimit = min(qualifyingExpenses, input.earnedIncome);
  audit.record("Form 2441", "4", "Earned income limit", earnedIncomeLimit,
    `min(expenses, earned income ${input.earnedIncome})`);

  // Line 8: Credit percentage (35% - 1% per $2K or fraction thereof over $15K, floor 20%)
  // IRS: "If the result isn't a whole number, round it to the next higher whole number."
  const agiExcess = zeroFloor(input.agi.minus(AGI_THRESHOLD));
  const reductionSteps = agiExcess.isZero()
    ? new Decimal(0)
    : agiExcess.dividedBy(AGI_STEP).ceil();
  const percentage = Decimal.max(
    MIN_PERCENTAGE,
    BASE_PERCENTAGE.minus(reductionSteps.times(PERCENTAGE_REDUCTION_STEP))
  );
  audit.record("Form 2441", "8", "Credit percentage", percentage,
    `35% - 1% per $2K or fraction thereof over $15K AGI`);

  // Line 9: Credit amount
  const credit = roundDollar(earnedIncomeLimit.times(percentage));
  audit.record("Form 2441", "9", "Dependent care credit", credit,
    `${earnedIncomeLimit} × ${percentage.times(100)}%`);

  return {
    qualifyingExpenses,
    earnedIncomeLimit,
    creditPercentage: percentage,
    credit,
    lines: audit.getLines(),
  };
}

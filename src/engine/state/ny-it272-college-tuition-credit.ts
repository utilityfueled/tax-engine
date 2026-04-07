/**
 * New York IT-272 College Tuition Tax Credit.
 * Computes the refundable credit for qualifying undergraduate tuition.
 * Spec: spec/state/ny-it272-college-tuition-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYCollegeTuitionCreditYear {
  /** Credit rate applied to qualifying expenses */
  creditRate: Decimal;
  /** Maximum qualifying tuition per eligible student */
  maxQualifyingExpensesPerStudent: Decimal;
}

export interface NYIT272StudentInput {
  /** Qualifying undergraduate tuition paid for this student */
  tuitionPaid: Decimal | string | number;
}

export interface NYIT272Input {
  /** Per-student tuition detail */
  students: NYIT272StudentInput[];
  /** NY State tax from IT-201 line 39 (retained for comparison workflows) */
  nyStateTax: Decimal | string | number;
  taxYear: number;
}

export interface NYIT272StudentResult {
  /** Tuition paid (raw input) */
  tuitionPaid: Decimal;
  /** Qualifying expenses after cap */
  qualifyingExpenses: Decimal;
  /** Credit for this student */
  credit: Decimal;
}

export interface NYIT272Result {
  /** Per-student breakdown */
  students: NYIT272StudentResult[];
  /** Line 2: Total qualifying tuition expenses (capped per student) */
  totalQualifyingExpenses: Decimal;
  /** Line 3: Computed credit (4% of total qualifying expenses) */
  computedCredit: Decimal;
  /** Line 4: Refundable credit amount that flows to IT-201 line 68 */
  credit: Decimal;
  /** The equivalent deduction amount (for comparison) */
  equivalentDeductionAmount: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

export const NY_COLLEGE_TUITION_CREDIT_CONSTANTS: Record<number, NYCollegeTuitionCreditYear> = {
  2025: {
    creditRate: new Decimal("0.04"),
    maxQualifyingExpensesPerStudent: new Decimal(10000),
  },
};

/* ---------- Main computation ---------- */

export function calculateNYIT272(input: NYIT272Input): NYIT272Result {
  const constants = NY_COLLEGE_TUITION_CREDIT_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-272 college tuition credit not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // Line 1: Per-student qualifying expenses (capped)
  const studentResults: NYIT272StudentResult[] = input.students.map((student, idx) => {
    const tuitionPaid = zeroFloor(d(student.tuitionPaid));
    const qualifyingExpenses = min(tuitionPaid, constants.maxQualifyingExpensesPerStudent);
    const credit = roundDollar(qualifyingExpenses.times(constants.creditRate));

    audit.record("NY-IT272", `1-${idx + 1}`, `Student ${idx + 1} qualifying expenses`,
      qualifyingExpenses,
      `min(tuition paid, $${constants.maxQualifyingExpensesPerStudent})`, {
        "Tuition paid": tuitionPaid.toString(),
        "Cap per student": constants.maxQualifyingExpensesPerStudent.toString(),
      });

    return { tuitionPaid, qualifyingExpenses, credit };
  });

  // Line 2: Total qualifying expenses
  const totalQualifyingExpenses = studentResults.reduce(
    (acc, s) => acc.plus(s.qualifyingExpenses), ZERO
  );
  audit.record("NY-IT272", "2", "Total qualifying tuition expenses",
    totalQualifyingExpenses,
    "Sum of per-student qualifying expenses", {
      "Number of students": studentResults.length.toString(),
    });

  // Line 3: Credit = 4% of total qualifying expenses
  const computedCredit = roundDollar(totalQualifyingExpenses.times(constants.creditRate));
  audit.record("NY-IT272", "3", "College tuition credit",
    computedCredit,
    `Total qualifying expenses × ${constants.creditRate.times(100)}%`, {
      "Total qualifying expenses": totalQualifyingExpenses.toString(),
      "Credit rate": constants.creditRate.toString(),
    });

  // Line 4: Refundable credit amount
  const credit = computedCredit;
  audit.record("NY-IT272", "4", "Refundable college tuition credit",
    credit,
    "Line 3 (refundable credit carried to IT-201 line 68)", {
      "Computed credit (line 3)": computedCredit.toString(),
    });

  // Equivalent deduction amount (for credit-vs-deduction comparison)
  // The deduction equals total qualifying expenses (same cap applies)
  const equivalentDeductionAmount = totalQualifyingExpenses;

  return {
    students: studentResults,
    totalQualifyingExpenses,
    computedCredit,
    credit,
    equivalentDeductionAmount,
    lines: audit.getLines(),
  };
}

/**
 * Form 1098-E — Student Loan Interest Statement
 * Spec: spec/federal/form-1098-e.yaml
 *
 * Aggregates student loan interest from multiple Form 1098-E statements
 * and combines with any manual student loan interest entry. The total
 * feeds into Schedule 1 Line 21 for the student loan interest deduction.
 *
 * Ref: IRC §221; Pub 970 Chapter 4; IRS Form 1098-E Instructions.
 */

import Decimal from "decimal.js";
import type { Form1098E } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form1098EResult {
  /** Total student loan interest from all Form 1098-E statements */
  totalForm1098EInterest: Decimal;
  /** Combined total including any manual studentLoanInterest adjustment */
  totalStudentLoanInterest: Decimal;
  /** Number of Form 1098-E statements processed */
  numberOfForms: number;
  /** Audit trail lines */
  lines: CalculatedLine[];
}

/**
 * Aggregates student loan interest from Form 1098-E statements and
 * combines with any manual adjustment amount.
 *
 * @param forms - Array of Form 1098-E inputs (may be empty)
 * @param manualStudentLoanInterest - Additional interest not reported on
 *   a 1098-E (e.g., amounts below the $600 reporting threshold)
 */
export function calculateForm1098E(
  forms: Form1098E[],
  manualStudentLoanInterest?: string | number
): Form1098EResult {
  const audit = new AuditTrail();
  const manualAmount = Decimal.max(ZERO, d(manualStudentLoanInterest));

  // Aggregate Box 1 from all 1098-E forms
  const form1098EInterest = sum(
    ...forms.map((f) => Decimal.max(ZERO, d(f.studentLoanInterestReceived)))
  );

  // Per-lender audit trail
  if (forms.length > 0) {
    for (const form of forms) {
      const amount = d(form.studentLoanInterestReceived);
      audit.record(
        "Form 1098-E",
        "1",
        `Student loan interest — ${form.lender}`,
        amount,
        form.includesOriginationFeesOrCapitalizedInterest
          ? "Box 1 (includes origination fees and/or capitalized interest)"
          : "Box 1",
      );
    }

    if (forms.length > 1) {
      audit.record(
        "Form 1098-E",
        "agg",
        "Total Form 1098-E student loan interest",
        form1098EInterest,
        `Sum of Box 1 across ${forms.length} Form 1098-E statements`,
      );
    }
  }

  // Combine 1098-E total with manual amount
  const totalStudentLoanInterest = form1098EInterest.plus(manualAmount);

  if (manualAmount.greaterThan(0) && form1098EInterest.greaterThan(0)) {
    audit.record(
      "Form 1098-E",
      "total",
      "Combined student loan interest",
      totalStudentLoanInterest,
      `Form 1098-E total $${form1098EInterest} + additional interest $${manualAmount} not reported on 1098-E`,
    );
  }

  return {
    totalForm1098EInterest: form1098EInterest,
    totalStudentLoanInterest,
    numberOfForms: forms.length,
    lines: audit.getLines(),
  };
}

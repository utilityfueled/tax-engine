/**
 * NJ-2210 Underpayment of Estimated Tax penalty.
 * Spec: spec/state/nj-2210.yaml
 *
 * Determines whether a taxpayer owes a penalty for underpayment of estimated
 * NJ income tax, and computes the penalty using the short method.
 *
 * Key rules:
 * - No penalty if NJ-2210 line 3 (tax minus line-2 credits) is less than $400
 * - Required annual payment = lesser of 80% current year tax, 100% prior year tax
 * - Line-2 credits include withholding plus specified refundable credits
 * - Supported short method uses the published 2025 Option 1 equivalent factor
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

/** NJ-2210 penalty threshold: no penalty if tax minus withholding ≤ this amount */
const NJ_PENALTY_THRESHOLD = new Decimal(400);

/**
 * Short method quarterly day counts (from each due date to April 15 filing deadline):
 *   Q1 (Apr 15 → Apr 15): 365 days
 *   Q2 (Jun 15 → Apr 15): 304 days
 *   Q3 (Sep 15 → Apr 15): 213 days
 *   Q4 (Jan 15 → Apr 15):  90 days
 * Total: 972 days across 4 quarters.
 * Multiplier = 972 / (4 × 365) = 972/1460
 */
const SHORT_METHOD_TOTAL_DAYS = new Decimal(972);
const SHORT_METHOD_DIVISOR = new Decimal(1460);

/** NJ underpayment penalty interest rate by tax year */
const NJ_PENALTY_RATE: Record<number, Decimal> = {
  2023: new Decimal("0.07"),
  2024: new Decimal("0.105"),
  2025: new Decimal("0.105"),
};

/** Published 2025 Option 1 equivalent annual factor for an unpaid annual shortfall */
const NJ_SHORT_METHOD_FACTOR: Partial<Record<number, Decimal>> = {
  2025: new Decimal("0.07"),
};

export interface NJ2210Input {
  taxYear: number;
  /** Current year NJ tax after nonrefundable credits (NJ-1040 tax after credits) */
  currentYearTax: Decimal | string | number;
  /** NJ-1040 line 55 withholding */
  totalWithholding: Decimal | string | number;
  /** NJ-2210 line 2 refundable credits treated like withholding (lines 56 and 58-65) */
  withholdingEquivalentCredits?: Decimal | string | number;
  /** Total NJ estimated tax payments made */
  estimatedPayments: Decimal | string | number;
  /** Prior year NJ tax after credits (from prior year NJ-1040) */
  priorYearTax?: Decimal | string | number;
  /** Whether a prior year NJ return was filed for a full 12-month period */
  priorYearReturnFiled?: boolean;
}

export interface NJ2210Result {
  /** Whether the underpayment penalty applies */
  penaltyApplies: boolean;
  /** Required annual payment (lesser of 80% current or 100% prior) */
  requiredAnnualPayment: Decimal;
  /** Underpayment amount (required - payments, floored at zero) */
  underpaymentAmount: Decimal;
  /** Penalty amount (short method, rounded to nearest dollar) */
  penalty: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

export function calculateNJ2210(input: NJ2210Input): NJ2210Result {
  assertSupportedNJTaxYear(input.taxYear, "NJ-2210 rules");
  const rate = NJ_PENALTY_RATE[input.taxYear];
  if (!rate) {
    throw new Error(`NJ-2210 penalty rate not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const currentYearTax = d(input.currentYearTax);
  const totalWithholding = d(input.totalWithholding);
  const withholdingEquivalentCredits = d(input.withholdingEquivalentCredits);
  const line2Credits = sum(totalWithholding, withholdingEquivalentCredits);
  const estimatedPayments = d(input.estimatedPayments);
  const totalPayments = sum(line2Credits, estimatedPayments);

  // Step 1: Threshold check — no penalty if NJ-2210 line 3 is less than $400
  const taxMinusLine2Credits = zeroFloor(currentYearTax.minus(line2Credits));

  audit.record(
    "NJ-2210",
    "threshold",
    "Tax minus line-2 credits (threshold check)",
    taxMinusLine2Credits,
    "max(0, current year tax - (withholding + withholding-equivalent credits))",
    {
      "Current year tax": currentYearTax,
      "Line 55 withholding": totalWithholding,
      "Line 56 and 58-65 credits": withholdingEquivalentCredits,
      "Line 2 total": line2Credits,
    }
  );

  if (taxMinusLine2Credits.lessThan(NJ_PENALTY_THRESHOLD)) {
    audit.record(
      "NJ-2210",
      "result",
      "No penalty — under $400 threshold",
      new Decimal(0),
      "Tax minus line-2 credits < $400",
      { "Tax minus line-2 credits": taxMinusLine2Credits, Threshold: NJ_PENALTY_THRESHOLD }
    );

    return {
      penaltyApplies: false,
      requiredAnnualPayment: new Decimal(0),
      underpaymentAmount: new Decimal(0),
      penalty: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // Step 2: Compute required annual payment
  const eightyPercentCurrent = currentYearTax.times("0.8");

  let requiredAnnualPayment: Decimal;

  if (input.priorYearReturnFiled && input.priorYearTax !== undefined) {
    const priorYearTax = d(input.priorYearTax);
    requiredAnnualPayment = Decimal.min(eightyPercentCurrent, priorYearTax);

    audit.record(
      "NJ-2210",
      "required-payment",
      "Required annual payment",
      requiredAnnualPayment,
      "lesser of 80% of current year tax and 100% of prior year tax",
      {
        "80% of current year": eightyPercentCurrent,
        "Prior year tax": priorYearTax,
      }
    );
  } else {
    requiredAnnualPayment = eightyPercentCurrent;

    audit.record(
      "NJ-2210",
      "required-payment",
      "Required annual payment (no prior year return)",
      requiredAnnualPayment,
      "80% of current year tax (no qualifying prior year return)",
      {
        "80% of current year": eightyPercentCurrent,
      }
    );
  }

  // Step 3: Safe harbor check — no penalty if payments ≥ required
  if (totalPayments.greaterThanOrEqualTo(requiredAnnualPayment)) {
    audit.record(
      "NJ-2210",
      "result",
      "No penalty — payments meet safe harbor",
      new Decimal(0),
      "Total payments (line-2 credits + estimated payments) ≥ required annual payment",
      {
        "Total payments": totalPayments,
        "Required annual payment": requiredAnnualPayment,
      }
    );

    return {
      penaltyApplies: false,
      requiredAnnualPayment,
      underpaymentAmount: new Decimal(0),
      penalty: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // Also check: if required annual payment is zero (e.g., prior year tax = 0)
  if (requiredAnnualPayment.isZero()) {
    audit.record(
      "NJ-2210",
      "result",
      "No penalty — required annual payment is zero",
      new Decimal(0),
      "Required annual payment = $0 (prior year tax was $0)",
      { "Required annual payment": requiredAnnualPayment }
    );

    return {
      penaltyApplies: false,
      requiredAnnualPayment,
      underpaymentAmount: new Decimal(0),
      penalty: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // Step 4: Compute underpayment
  const underpaymentAmount = zeroFloor(requiredAnnualPayment.minus(totalPayments));

  audit.record(
    "NJ-2210",
    "underpayment",
    "Underpayment amount",
    underpaymentAmount,
    "max(0, required annual payment - (line-2 credits + estimated payments))",
    {
      "Required annual payment": requiredAnnualPayment,
      "Total payments": totalPayments,
    }
  );

  // Step 5: Compute penalty using short method
  const shortMethodFactor =
    NJ_SHORT_METHOD_FACTOR[input.taxYear]
    ?? rate.times(SHORT_METHOD_TOTAL_DAYS).dividedBy(SHORT_METHOD_DIVISOR);
  const penaltyBeforeRounding = underpaymentAmount.times(shortMethodFactor);
  const penalty = roundDollar(penaltyBeforeRounding);

  audit.record(
    "NJ-2210",
    "penalty",
    "Underpayment penalty (short method)",
    penalty,
    "underpayment × short-method factor, rounded to nearest dollar",
    {
      "Underpayment": underpaymentAmount,
      "Rate": rate.toString(),
      "Short method factor": shortMethodFactor.toString(),
      "Penalty before rounding": penaltyBeforeRounding.toString(),
    }
  );

  return {
    penaltyApplies: true,
    requiredAnnualPayment,
    underpaymentAmount,
    penalty,
    lines: audit.getLines(),
  };
}

/**
 * Form 2210 — Underpayment of Estimated Tax by Individuals
 * Spec: spec/federal/form-2210.yaml
 *
 * Determines if a penalty applies for underpaying estimated taxes.
 * Safe harbor rules can eliminate the penalty entirely.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form2210Input {
  currentYearTax: Decimal; // Total tax for current year
  withholding: Decimal; // Total federal withholding
  estimatedPayments: Decimal; // Total estimated tax payments
  refundableCredits: Decimal; // Total refundable credits
  priorYearTax?: Decimal; // Prior year total tax (for safe harbor)
  priorYearAGI?: Decimal; // Prior year AGI (for 110% threshold)
  filingStatus: FilingStatus;
}

export interface Form2210Result {
  safeHarborMet: boolean;
  safeHarborReason: string;
  requiredAnnualPayment: Decimal; // Line 6
  totalPayments: Decimal; // Line 7
  underpayment: Decimal; // Line 8
  penalty: Decimal;
  lines: CalculatedLine[];
}

/** 2025 IRS underpayment interest rate (annual, subject to quarterly change) */
const UNDERPAYMENT_RATE_2025 = new Decimal(0.07);

/**
 * IRS Short Method day counts for TY2025.
 * Days from each quarterly installment due date to filing deadline (4/15/2026).
 * Per IRC §6621(b), denominator is always 365 (not actual days in year).
 * Ref: IRS Form 2210 Instructions, Short Method; IRC §6654(a).
 */
const TOTAL_QUARTER_DAYS_2025 = 971; // sum of above
const FOUR_QUARTERS_DAYS = 1460; // 4 × 365

/** Threshold below which no penalty applies */
const MINIMUM_TAX_THRESHOLD = new Decimal(1000);

/** AGI threshold for 110% safe harbor */
const HIGH_INCOME_THRESHOLD: Record<FilingStatus, Decimal> = {
  single: new Decimal(150000),
  married_filing_jointly: new Decimal(150000),
  married_filing_separately: new Decimal(75000),
  head_of_household: new Decimal(150000),
  qualifying_surviving_spouse: new Decimal(150000),
};

export function calculateForm2210(input: Form2210Input): Form2210Result {
  const audit = new AuditTrail();

  // IRC §6654(d)(1)(C): "tax shown on the return" = total tax reduced by
  // credits allowable (other than §31 withholding). Refundable credits
  // reduce the tax base; they do NOT count as payments.
  const taxShown = zeroFloor(input.currentYearTax.minus(input.refundableCredits));

  // Payments for safe harbor comparison: withholding + estimated only
  const taxPayments = input.withholding.plus(input.estimatedPayments);
  audit.record("Form 2210", "7", "Tax payments (withholding + estimated)", taxPayments,
    "Withholding + estimated tax payments");

  // Safe harbor test 1: IRC §6654(e)(1)(A)
  // "tax shown on the return, reduced by the credit under section 31
  //  [withholding], is less than $1,000"
  // NOTE: estimated payments are NOT part of this test
  const taxAfterWithholding = zeroFloor(taxShown.minus(input.withholding));
  if (taxAfterWithholding.lt(MINIMUM_TAX_THRESHOLD)) {
    return buildResult(audit, true, "Tax shown minus withholding < $1,000", new Decimal(0),
      taxPayments, new Decimal(0), new Decimal(0));
  }

  // Safe harbor test 2: Payments ≥ 90% of tax shown
  const ninetyPercent = roundDollar(taxShown.times(new Decimal(0.9)));
  if (taxPayments.gte(ninetyPercent)) {
    return buildResult(audit, true, "Payments ≥ 90% current year tax",
      ninetyPercent, taxPayments, new Decimal(0), new Decimal(0));
  }

  // Safe harbor test 3: Payments ≥ 100%/110% of prior year tax
  if (input.priorYearTax !== undefined) {
    const highIncomeThreshold = HIGH_INCOME_THRESHOLD[input.filingStatus];
    const priorYearMultiplier = (input.priorYearAGI ?? new Decimal(0)).gt(highIncomeThreshold)
      ? new Decimal(1.1)
      : new Decimal(1.0);
    const priorYearRequired = roundDollar(input.priorYearTax.times(priorYearMultiplier));

    if (taxPayments.gte(priorYearRequired)) {
      const pctLabel = priorYearMultiplier.eq(new Decimal(1.1)) ? "110%" : "100%";
      return buildResult(audit, true,
        `Payments ≥ ${pctLabel} prior year tax`,
        priorYearRequired, taxPayments, new Decimal(0), new Decimal(0));
    }
  }

  // No safe harbor met — calculate required payment and underpayment
  // Required = smaller of 90% tax shown or 100%/110% prior
  let requiredAnnualPayment = ninetyPercent;
  if (input.priorYearTax !== undefined) {
    const highIncomeThreshold = HIGH_INCOME_THRESHOLD[input.filingStatus];
    const multiplier = (input.priorYearAGI ?? new Decimal(0)).gt(highIncomeThreshold)
      ? new Decimal(1.1)
      : new Decimal(1.0);
    const priorRequired = roundDollar(input.priorYearTax.times(multiplier));
    requiredAnnualPayment = min(ninetyPercent, priorRequired);
  }
  audit.record("Form 2210", "6", "Required annual payment", requiredAnnualPayment,
    "min(90% tax shown, 100%/110% prior year tax)");

  const underpayment = zeroFloor(requiredAnnualPayment.minus(taxPayments));
  audit.record("Form 2210", "8", "Underpayment", underpayment,
    "Required - tax payments");

  // IRS Short Method: each quarter's underpayment accrues interest from its
  // due date to the filing deadline. Assumes equal quarterly underpayments.
  // penalty = underpayment × rate × totalQuarterDays / (4 × 365)
  // Ref: IRS Form 2210 Instructions, Short Method; IRC §6654(a)
  const penalty = roundDollar(
    underpayment.times(UNDERPAYMENT_RATE_2025)
      .times(TOTAL_QUARTER_DAYS_2025)
      .dividedBy(FOUR_QUARTERS_DAYS)
  );
  audit.record("Form 2210", "penalty", "Estimated penalty (short method)", penalty,
    `Underpayment × ${UNDERPAYMENT_RATE_2025.times(100)}% × ${TOTAL_QUARTER_DAYS_2025}/${FOUR_QUARTERS_DAYS}`);

  return buildResult(audit, false, "No safe harbor met",
    requiredAnnualPayment, taxPayments, underpayment, penalty);
}

function buildResult(
  audit: AuditTrail,
  safeHarborMet: boolean,
  safeHarborReason: string,
  requiredAnnualPayment: Decimal,
  totalPayments: Decimal,
  underpayment: Decimal,
  penalty: Decimal
): Form2210Result {
  audit.record("Form 2210", "safe_harbor", "Safe harbor test", new Decimal(safeHarborMet ? 1 : 0),
    safeHarborReason);
  return {
    safeHarborMet,
    safeHarborReason,
    requiredAnnualPayment,
    totalPayments,
    underpayment,
    penalty,
    lines: audit.getLines(),
  };
}

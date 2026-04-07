/**
 * New York IT-119 STAR Credit Advance Payment Reconciliation.
 * Computes the refundable reconciliation credit reported as code 119.
 * Spec: spec/state/ny-it119-star-credit-advance-payment-reconciliation.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

export interface NYIT119PropertyInput {
  /** Underpayment amount shown on the Tax Department notice for the property. */
  underpaymentAmount: Decimal | string | number;
}

export interface NYIT119Input {
  taxYear: number;
  /** IT-119 may only be filed when the taxpayer received an underpayment notice. */
  receivedUnderpaymentNotice: boolean;
  /** One or two reconciled properties per the 2025 form. */
  properties: NYIT119PropertyInput[];
}

export interface NYIT119Result {
  firstPropertyUnderpayment: Decimal;
  secondPropertyUnderpayment: Decimal;
  totalReconciliationCredit: Decimal;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);

function requireNonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(ZERO)) {
    throw new Error(`${description} must be non-negative`);
  }
  return roundDollar(amount);
}

export function calculateNYIT119(input: NYIT119Input): NYIT119Result {
  if (input.taxYear !== 2025) {
    throw new Error(`NY IT-119 reconciliation not available for tax year ${input.taxYear}`);
  }

  if (!input.receivedUnderpaymentNotice) {
    throw new Error("NY IT-119 may only be claimed when the taxpayer received an underpayment notice");
  }

  if (input.properties.length === 0) {
    throw new Error("NY IT-119 requires at least one reconciled property");
  }

  if (input.properties.length > 2) {
    throw new Error("NY IT-119 supports at most two reconciled properties");
  }

  const audit = new AuditTrail();
  const firstPropertyUnderpayment = requireNonNegativeAmount(
    input.properties[0]?.underpaymentAmount,
    "NY IT-119 first-property underpayment amount"
  );
  const secondPropertyUnderpayment = requireNonNegativeAmount(
    input.properties[1]?.underpaymentAmount,
    "NY IT-119 second-property underpayment amount"
  );
  const totalReconciliationCredit = firstPropertyUnderpayment.plus(secondPropertyUnderpayment);

  audit.record(
    "NY-IT119",
    "1d",
    "First-property STAR credit underpayment",
    firstPropertyUnderpayment,
    "Whole-dollar underpayment amount from the Tax Department notice"
  );
  audit.record(
    "NY-IT119",
    "2d",
    "Second-property STAR credit underpayment",
    secondPropertyUnderpayment,
    "Whole-dollar underpayment amount from the Tax Department notice, or zero when absent"
  );
  audit.record(
    "NY-IT119",
    "3",
    "Total STAR credit advance payment reconciliation",
    totalReconciliationCredit,
    "Line 1d + Line 2d",
    {
      "Line 1d first-property underpayment": firstPropertyUnderpayment.toString(),
      "Line 2d second-property underpayment": secondPropertyUnderpayment.toString(),
    }
  );

  return {
    firstPropertyUnderpayment,
    secondPropertyUnderpayment,
    totalReconciliationCredit,
    lines: audit.getLines(),
  };
}

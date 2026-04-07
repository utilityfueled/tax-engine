/**
 * Pennsylvania Schedule SD — School District Personal Income Tax Return
 * Spec: spec/state/pa-schedule-sd.yaml
 *
 * About 470 of PA's ~500 school districts levy a personal income tax.
 * Two tax base methods exist:
 *   - EI (Earned Income): tax base = net compensation + max(0, net business/farm income)
 *   - PSD (PA Taxable Income): tax base = total PA taxable income (all 8 classes, zero-floored)
 *
 * The method is determined by the school district, not the taxpayer.
 * Tax Forgiveness from Schedule SP applies proportionally to reduce school district tax.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** School district tax base method */
export type SchoolDistrictMethod = "EI" | "PSD";

export interface ScheduleSDInput {
  taxYear: number;

  /** School district tax base method */
  method: SchoolDistrictMethod;

  /** School district tax rate (e.g., 0.015 for 1.5%) */
  schoolDistrictRate: Decimal;

  // --- PSD method inputs ---
  /** PA-40 total PA taxable income (after zero-flooring each class) — for PSD method */
  paTotalTaxableIncome: Decimal;

  // --- EI method inputs ---
  /** Net compensation (PA-40 Line 1a - Line 1b) — for EI method */
  netCompensation: Decimal;
  /** Net business/farm income (PA Class 4, can be negative) — for EI method */
  netBusinessIncome: Decimal;

  /** Other deductions (IRC §529 contributions) — for EI method only */
  otherDeductions: Decimal;

  /** Schedule SP forgiveness percentage (0–100) */
  forgivenessPercentage: Decimal;

  /** School district tax withheld (from W-2 local fields or other sources) */
  schoolDistrictWithholding: Decimal;

  /** Estimated payments for school district tax */
  estimatedPayments: Decimal;
}

export interface ScheduleSDResult {
  /** Line 1: PA-40 taxable income (PSD method) */
  psdTaxBase: Decimal;
  /** Line 2: Earned income (EI method) */
  eiTaxBase: Decimal;
  /** Line 3: Selected tax base */
  taxBase: Decimal;
  /** Line 4: Other deductions (EI method only) */
  otherDeductions: Decimal;
  /** Line 5: Adjusted tax base */
  adjustedTaxBase: Decimal;
  /** Line 6: School district income tax */
  grossTax: Decimal;
  /** Line 7: Tax Forgiveness credit */
  forgivenessCredit: Decimal;
  /** Line 8: Net school district tax after forgiveness */
  netTax: Decimal;
  /** Line 9: School district tax withheld */
  withholding: Decimal;
  /** Line 10: Estimated payments */
  estimatedPayments: Decimal;
  /** Line 11: Total payments and credits */
  totalPaymentsAndCredits: Decimal;
  /** Line 12: Overpayment (refund) */
  overpayment: Decimal;
  /** Line 13: Amount owed */
  amountOwed: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleSD(input: ScheduleSDInput): ScheduleSDResult {
  const audit = new AuditTrail();

  // -------------------------------------------------------------------------
  // Lines 1–2: Tax base by method
  // -------------------------------------------------------------------------

  // Line 1: PSD method — total PA taxable income
  const psdTaxBase = zeroFloor(input.paTotalTaxableIncome);
  audit.record("PA-40-SD", "1", "PA-40 taxable income (PSD method)",
    psdTaxBase, "PA-40 total PA taxable income (after zero-flooring each class)");

  // Line 2: EI method — compensation + max(0, net business/farm income)
  const eiTaxBase = zeroFloor(input.netCompensation).plus(zeroFloor(input.netBusinessIncome));
  audit.record("PA-40-SD", "2", "Earned income (EI method)",
    eiTaxBase, "Net compensation + max(0, net business/farm income)");

  // -------------------------------------------------------------------------
  // Line 3: Select tax base based on method
  // -------------------------------------------------------------------------

  const taxBase = input.method === "PSD" ? psdTaxBase : eiTaxBase;
  audit.record("PA-40-SD", "3", "Tax base",
    taxBase, `${input.method} method selected`);

  // -------------------------------------------------------------------------
  // Lines 4–5: Deductions and adjusted base
  // -------------------------------------------------------------------------

  // Line 4: Other deductions — only applicable for EI method
  const otherDeductions = input.method === "EI" ? zeroFloor(input.otherDeductions) : new Decimal(0);
  audit.record("PA-40-SD", "4", "Other deductions",
    otherDeductions, input.method === "EI"
      ? "IRC §529 and other deductions (EI method)"
      : "Not applicable for PSD method (already reflected in PA-40 Line 9a)");

  // Line 5: Adjusted tax base
  const adjustedTaxBase = zeroFloor(taxBase.minus(otherDeductions));
  audit.record("PA-40-SD", "5", "Adjusted tax base",
    adjustedTaxBase, "max(0, Line 3 - Line 4)");

  // -------------------------------------------------------------------------
  // Line 6: School district income tax
  // -------------------------------------------------------------------------

  const grossTax = roundDollar(adjustedTaxBase.times(input.schoolDistrictRate));
  audit.record("PA-40-SD", "6", "School district income tax",
    grossTax, `Line 5 × ${input.schoolDistrictRate.times(100)}% school district rate`);

  // -------------------------------------------------------------------------
  // Line 7: Tax Forgiveness credit
  // -------------------------------------------------------------------------

  const forgivenessCredit = roundDollar(
    grossTax.times(input.forgivenessPercentage).div(100),
  );
  audit.record("PA-40-SD", "7", "Tax Forgiveness credit",
    forgivenessCredit, `Line 6 × ${input.forgivenessPercentage}% Schedule SP forgiveness`);

  // -------------------------------------------------------------------------
  // Line 8: Net school district tax after forgiveness
  // -------------------------------------------------------------------------

  const netTax = zeroFloor(grossTax.minus(forgivenessCredit));
  audit.record("PA-40-SD", "8", "Net school district tax after forgiveness",
    netTax, "max(0, Line 6 - Line 7)");

  // -------------------------------------------------------------------------
  // Lines 9–11: Payments and credits
  // -------------------------------------------------------------------------

  // Line 9: School district tax withheld
  const withholding = zeroFloor(input.schoolDistrictWithholding);
  audit.record("PA-40-SD", "9", "School district tax withheld",
    withholding, "From W-2 local fields or other sources");

  // Line 10: Estimated payments
  const estimatedPayments = zeroFloor(input.estimatedPayments);
  audit.record("PA-40-SD", "10", "Estimated payments",
    estimatedPayments, "Estimated payments for school district tax");

  // Line 11: Total payments and credits
  const totalPaymentsAndCredits = sum(forgivenessCredit, withholding, estimatedPayments);
  audit.record("PA-40-SD", "11", "Total payments and credits",
    totalPaymentsAndCredits, "Line 7 + Line 9 + Line 10");

  // -------------------------------------------------------------------------
  // Lines 12–13: Overpayment / Balance due
  // -------------------------------------------------------------------------

  // Line 12: Overpayment
  const overpayment = totalPaymentsAndCredits.gt(grossTax)
    ? roundDollar(totalPaymentsAndCredits.minus(grossTax))
    : new Decimal(0);
  audit.record("PA-40-SD", "12", "Overpayment (refund)",
    overpayment, "If Line 11 > Line 6: Line 11 - Line 6");

  // Line 13: Amount owed
  const amountOwed = grossTax.gt(totalPaymentsAndCredits)
    ? roundDollar(grossTax.minus(totalPaymentsAndCredits))
    : new Decimal(0);
  audit.record("PA-40-SD", "13", "Amount owed",
    amountOwed, "If Line 6 > Line 11: Line 6 - Line 11");

  return {
    psdTaxBase,
    eiTaxBase,
    taxBase,
    otherDeductions,
    adjustedTaxBase,
    grossTax,
    forgivenessCredit,
    netTax,
    withholding,
    estimatedPayments,
    totalPaymentsAndCredits,
    overpayment,
    amountOwed,
    lines: audit.getLines(),
  };
}

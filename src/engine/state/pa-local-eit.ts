/**
 * Pennsylvania Local Earned Income Tax (EIT)
 * Spec: spec/state/pa-local-eit.yaml
 *
 * PA Act 511 authorizes municipalities and school districts to levy a local
 * earned income tax on residents' earned income (W-2 wages + net positive
 * self-employment income). Rates vary by municipality (typically 0.5%–3.5%).
 *
 * This module computes the local EIT for a single resident municipality.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

function assertNonNegative(value: Decimal, description: string): void {
  if (value.isNegative()) {
    throw new Error(`${description} must be non-negative`);
  }
}

function isPhiladelphiaMunicipality(municipality: string): boolean {
  const normalized = municipality
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized === "PHILADELPHIA" || normalized === "CITY OF PHILADELPHIA";
}

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

/** Credit for local EIT paid to a work municipality */
export interface NonresidentEITCredit {
  /** Municipality where nonresident EIT was paid */
  municipality: string;
  /** Income earned in that municipality */
  incomeInWorkMunicipality: Decimal;
  /** Local EIT paid to work municipality */
  taxPaidToWorkMunicipality: Decimal;
}

export interface PALocalEITInput {
  taxYear: number;

  /** Resident municipality name */
  municipality: string;

  /** Local EIT rate as a decimal (e.g., 0.01 for 1%, 0.035 for 3.5%) */
  localEITRate: Decimal;

  /** Line 1: Compensation (W-2 wages) */
  compensation: Decimal;

  /** Line 2: Net self-employment income (can be negative; floored to 0 for EIT) */
  netSelfEmploymentIncome: Decimal;

  /** Line 6: Credit for nonresident EIT paid to work municipality */
  nonresidentCredits: NonresidentEITCredit[];

  /** Line 8: Local EIT withheld (W-2 Box 19) */
  localWithholding: Decimal;
}

export interface PALocalEITResult {
  /** Resident municipality */
  municipality: string;
  /** Line 1: Compensation */
  compensation: Decimal;
  /** Line 2: Net self-employment income (floored to 0) */
  netSelfEmploymentIncome: Decimal;
  /** Line 3: Total earned income */
  totalEarnedIncome: Decimal;
  /** Line 4: Local EIT rate */
  localEITRate: Decimal;
  /** Line 5: Computed local EIT */
  computedLocalTax: Decimal;
  /** Line 6: Nonresident EIT credit */
  nonresidentCredit: Decimal;
  /** Line 7: Net local tax after credit */
  netLocalTax: Decimal;
  /** Line 8: Local withholding */
  localWithholding: Decimal;
  /** Line 9: Overpayment (refund) */
  overpayment: Decimal;
  /** Line 10: Balance due */
  balanceDue: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculatePALocalEIT(input: PALocalEITInput): PALocalEITResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Local EIT constants not available for tax year ${input.taxYear}`);
  }

  if (isPhiladelphiaMunicipality(input.municipality)) {
    throw new Error(
      "Philadelphia uses a separate Wage Tax and is not supported by the PA Local EIT module",
    );
  }

  assertNonNegative(input.localEITRate, "PA Local EIT rate");
  assertNonNegative(input.compensation, "PA Local EIT compensation");
  assertNonNegative(input.localWithholding, "PA Local EIT local withholding");

  for (const credit of input.nonresidentCredits) {
    assertNonNegative(
      credit.incomeInWorkMunicipality,
      `PA Local EIT nonresident credit income in ${credit.municipality}`,
    );
    assertNonNegative(
      credit.taxPaidToWorkMunicipality,
      `PA Local EIT nonresident credit tax paid to ${credit.municipality}`,
    );
  }

  const audit = new AuditTrail();

  // -------------------------------------------------------------------------
  // Lines 1–3: Earned Income
  // -------------------------------------------------------------------------

  // Line 1: Compensation
  audit.record("PA-Local-EIT", "1", "Compensation", input.compensation,
    "W-2 wages subject to local EIT");

  // Line 2: Net self-employment income (floor at 0)
  const netSelfEmploymentIncome = zeroFloor(input.netSelfEmploymentIncome);
  audit.record("PA-Local-EIT", "2", "Net self-employment income", netSelfEmploymentIncome,
    "Net business/profession/farm income, floor at 0");

  // Line 3: Total earned income
  const totalEarnedIncome = input.compensation.plus(netSelfEmploymentIncome);
  audit.record("PA-Local-EIT", "3", "Total earned income", totalEarnedIncome,
    "Line 1 + Line 2");

  // -------------------------------------------------------------------------
  // Lines 4–5: Tax Computation
  // -------------------------------------------------------------------------

  // Line 4: Local EIT rate
  audit.record("PA-Local-EIT", "4", "Local EIT rate", input.localEITRate,
    `${input.municipality} resident EIT rate`);

  // Line 5: Computed local tax
  const computedLocalTax = roundDollar(totalEarnedIncome.times(input.localEITRate));
  audit.record("PA-Local-EIT", "5", "Computed local EIT", computedLocalTax,
    `$${totalEarnedIncome} × ${input.localEITRate.times(100)}%`);

  // -------------------------------------------------------------------------
  // Line 6: Nonresident EIT Credit
  // -------------------------------------------------------------------------

  let nonresidentCredit = new Decimal(0);
  for (const credit of input.nonresidentCredits) {
    // Credit for each work municipality = lesser of:
    //   (a) tax paid to work municipality
    //   (b) resident rate × income in work municipality
    const residentTaxOnThatIncome = roundDollar(
      credit.incomeInWorkMunicipality.times(input.localEITRate),
    );
    const perMunicipalityCredit = Decimal.min(
      credit.taxPaidToWorkMunicipality,
      residentTaxOnThatIncome,
    );
    nonresidentCredit = nonresidentCredit.plus(perMunicipalityCredit);

    audit.record("PA-Local-EIT", `6-${credit.municipality}`,
      `Nonresident credit for ${credit.municipality}`,
      perMunicipalityCredit,
      `Lesser of $${credit.taxPaidToWorkMunicipality} (paid) and $${residentTaxOnThatIncome} (resident rate × income)`);
  }

  // Total nonresident credit cannot exceed computed local tax
  nonresidentCredit = Decimal.min(nonresidentCredit, computedLocalTax);
  audit.record("PA-Local-EIT", "6", "Total nonresident EIT credit", nonresidentCredit,
    "Sum of per-municipality credits, capped at computed local tax");

  // -------------------------------------------------------------------------
  // Line 7: Net Local Tax After Credit
  // -------------------------------------------------------------------------

  const netLocalTax = zeroFloor(computedLocalTax.minus(nonresidentCredit));
  audit.record("PA-Local-EIT", "7", "Net local tax after credit", netLocalTax,
    "Line 5 - Line 6, floor at 0");

  // -------------------------------------------------------------------------
  // Lines 8–10: Withholding, Overpayment, Balance Due
  // -------------------------------------------------------------------------

  // Line 8: Local withholding
  audit.record("PA-Local-EIT", "8", "Local EIT withheld", input.localWithholding,
    "W-2 Box 19 local tax withheld");

  // Lines 9–10: Overpayment or balance due
  const netDue = netLocalTax.minus(input.localWithholding);
  const overpayment = netDue.isNegative() ? roundDollar(netDue.abs()) : new Decimal(0);
  const balanceDue = netDue.isPositive() ? roundDollar(netDue) : new Decimal(0);

  audit.record("PA-Local-EIT", "9", "Overpayment (refund)", overpayment,
    "If Line 8 > Line 7: overpayment = Line 8 - Line 7");
  audit.record("PA-Local-EIT", "10", "Balance due", balanceDue,
    "If Line 7 > Line 8: balance due = Line 7 - Line 8");

  return {
    municipality: input.municipality,
    compensation: input.compensation,
    netSelfEmploymentIncome,
    totalEarnedIncome,
    localEITRate: input.localEITRate,
    computedLocalTax,
    nonresidentCredit,
    netLocalTax,
    localWithholding: input.localWithholding,
    overpayment,
    balanceDue,
    lines: audit.getLines(),
  };
}

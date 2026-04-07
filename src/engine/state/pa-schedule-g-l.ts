/**
 * Pennsylvania Schedule G-L — Credit for Taxes Paid to Other States (Resident)
 * Spec: spec/state/pa-schedule-g-l.yaml
 *
 * PA residents who paid income tax to another state on income also taxable
 * by PA may claim a credit. For each state: credit = lesser of (tax paid
 * to other state, PA tax on shared income at 3.07%). Total credit capped
 * at PA-40 Line 12 tax liability.
 */

import Decimal from "decimal.js";
import { roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { PA_CONSTANTS } from "@/engine/state/pa-40.js";

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

/** Per-state input for the credit computation */
export interface OtherStateCredit {
  /** Two-letter state code (e.g., "NJ", "NY", "DE") */
  stateCode: string;
  /** Line 1: Income taxable by both PA and the other state */
  incomeTaxableByBothStates: Decimal;
  /** Line 2: Tax paid to the other state on that income */
  taxPaidToOtherState: Decimal;
}

export interface ScheduleGLInput {
  taxYear: number;
  /** PA-40 Line 12: Total PA tax liability (cap for total credit) */
  paTaxLiability: Decimal;
  /** Per-state credit entries */
  otherStateCredits: OtherStateCredit[];
}

/** Per-state result */
export interface PerStateResult {
  stateCode: string;
  /** Line 1: Income taxable by both states */
  incomeTaxableByBothStates: Decimal;
  /** Line 2: Tax paid to other state */
  taxPaidToOtherState: Decimal;
  /** Line 3: PA tax on shared income (Line 1 × 3.07%) */
  paTaxOnSharedIncome: Decimal;
  /** Line 4: Credit = lesser of Line 2 and Line 3 */
  credit: Decimal;
}

export interface ScheduleGLResult {
  /** Per-state credit results */
  perStateResults: PerStateResult[];
  /** Sum of per-state credits before cap */
  totalCreditBeforeCap: Decimal;
  /** Total credit (capped at PA tax liability) */
  totalCredit: Decimal;
  /** PA tax liability used as cap */
  paTaxLiability: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleGL(input: ScheduleGLInput): ScheduleGLResult {
  const constants = PA_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const perStateResults: PerStateResult[] = [];

  // -------------------------------------------------------------------------
  // Per-state credit computation
  // -------------------------------------------------------------------------

  for (const entry of input.otherStateCredits) {
    const code = entry.stateCode;

    // Line 1: Income taxable by both states
    audit.record("PA-Schedule-G-L", `1-${code}`,
      `Income taxable by both PA and ${code}`,
      entry.incomeTaxableByBothStates,
      `Income earned/sourced in ${code} also included in PA taxable income`);

    // Line 2: Tax paid to other state
    audit.record("PA-Schedule-G-L", `2-${code}`,
      `Tax paid to ${code}`,
      entry.taxPaidToOtherState,
      `Income tax paid to ${code} on shared income`);

    // Line 3: PA tax on shared income = Line 1 × 3.07%
    const paTaxOnSharedIncome = roundDollar(
      entry.incomeTaxableByBothStates.times(constants.taxRate),
    );
    audit.record("PA-Schedule-G-L", `3-${code}`,
      `PA tax on income taxable by both PA and ${code}`,
      paTaxOnSharedIncome,
      `$${entry.incomeTaxableByBothStates} × ${constants.taxRate.times(100)}%`);

    // Line 4: Credit = lesser of Line 2 and Line 3
    const credit = Decimal.min(entry.taxPaidToOtherState, paTaxOnSharedIncome);
    audit.record("PA-Schedule-G-L", `4-${code}`,
      `Credit for taxes paid to ${code}`,
      credit,
      `Lesser of $${entry.taxPaidToOtherState} (tax paid) and $${paTaxOnSharedIncome} (PA tax)`);

    perStateResults.push({
      stateCode: code,
      incomeTaxableByBothStates: entry.incomeTaxableByBothStates,
      taxPaidToOtherState: entry.taxPaidToOtherState,
      paTaxOnSharedIncome,
      credit,
    });
  }

  // -------------------------------------------------------------------------
  // Total credit (capped at PA tax liability)
  // -------------------------------------------------------------------------

  const totalCreditBeforeCap = sum(...perStateResults.map((r) => r.credit));
  const totalCredit = Decimal.min(totalCreditBeforeCap, input.paTaxLiability);

  audit.record("PA-Schedule-G-L", "total",
    "Total resident credit",
    totalCredit,
    `Sum of per-state credits ($${totalCreditBeforeCap}), capped at PA tax liability ($${input.paTaxLiability})`);

  return {
    perStateResults,
    totalCreditBeforeCap,
    totalCredit,
    paTaxLiability: input.paTaxLiability,
    lines: audit.getLines(),
  };
}

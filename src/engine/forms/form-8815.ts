/**
 * Form 8815 — Exclusion of Interest from Series EE and I U.S. Savings Bonds
 * Spec: spec/federal/form-8815.yaml
 *
 * Calculates excludable savings bond interest used for qualified higher
 * education expenses, subject to income phase-out.
 * Result flows to Schedule B Line 3.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { SavingsBondRedemption } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8815Result {
  qualifiedExpenses: Decimal;     // Line 2
  totalProceeds: Decimal;         // Line 3
  totalInterest: Decimal;         // Line 4
  expenseRatio: Decimal;          // Line 5
  excludableBeforePhaseOut: Decimal; // Line 6
  modifiedAGI: Decimal;           // Line 7
  phaseOutThreshold: Decimal;     // Line 8
  phaseOutRange: Decimal;         // Line 10
  excludableSavingsBondInterest: Decimal; // Line 13
  lines: CalculatedLine[];
}

/**
 * 2025 phase-out thresholds for savings bond interest exclusion.
 * Source: IRS Publication 970 (2025), Chapter 9 — Education Savings Bond Program
 * IRC §135(b)(2)(B): higher threshold applies only "in the case of a joint return"
 * QSS is NOT a joint return → uses single/HoH thresholds
 */
const PHASE_OUT_THRESHOLD: Partial<Record<FilingStatus, Decimal>> = {
  single: new Decimal(99500),
  head_of_household: new Decimal(99500),
  married_filing_jointly: new Decimal(149250),
  qualifying_surviving_spouse: new Decimal(99500),
  // MFS is not eligible
};

const PHASE_OUT_RANGE: Partial<Record<FilingStatus, Decimal>> = {
  single: new Decimal(15000),
  head_of_household: new Decimal(15000),
  married_filing_jointly: new Decimal(30000),
  qualifying_surviving_spouse: new Decimal(15000),
};

export function calculateForm8815(
  redemptions: SavingsBondRedemption[],
  modifiedAGI: Decimal,
  filingStatus: FilingStatus
): Form8815Result {
  const audit = new AuditTrail();

  // MFS filers are not eligible
  if (filingStatus === "married_filing_separately") {
    audit.record("Form 8815", "13", "Excludable savings bond interest", new Decimal(0),
      "MFS filers not eligible for savings bond exclusion");
    return zeroResult(modifiedAGI, audit);
  }

  // Aggregate all redemptions
  let totalExpenses = new Decimal(0);
  let totalProceeds = new Decimal(0);
  let totalInterest = new Decimal(0);

  for (const bond of redemptions) {
    totalExpenses = totalExpenses.plus(d(bond.qualifiedExpenses));
    totalProceeds = totalProceeds.plus(d(bond.proceeds));
    totalInterest = totalInterest.plus(d(bond.interest));
  }

  // Line 2: Qualified expenses
  audit.record("Form 8815", "2", "Qualified higher education expenses", totalExpenses,
    "Tuition + fees, reduced by scholarships");

  // Line 3: Total proceeds
  audit.record("Form 8815", "3", "Total bond proceeds", totalProceeds,
    "Principal + interest from redeemed bonds");

  // Line 4: Interest portion
  audit.record("Form 8815", "4", "Interest included in proceeds", totalInterest,
    "Interest earned on redeemed bonds");

  // Line 5: Ratio of expenses to proceeds (capped at 1)
  const expenseRatio = totalProceeds.isZero()
    ? new Decimal(0)
    : min(totalExpenses.div(totalProceeds), new Decimal(1));
  audit.record("Form 8815", "5", "Expenses-to-proceeds ratio", expenseRatio,
    `min(1, ${totalExpenses} / ${totalProceeds})`);

  // Line 6: Excludable interest before phase-out
  const excludableBeforePhaseOut = roundDollar(totalInterest.times(expenseRatio));
  audit.record("Form 8815", "6", "Excludable interest before phase-out", excludableBeforePhaseOut,
    `${totalInterest} × ${expenseRatio}`);

  // Line 7: Modified AGI
  audit.record("Form 8815", "7", "Modified AGI", modifiedAGI, "AGI for phase-out purposes");

  // Line 8: Phase-out threshold
  const threshold = PHASE_OUT_THRESHOLD[filingStatus] ?? new Decimal(0);
  audit.record("Form 8815", "8", "Phase-out threshold", threshold,
    `${filingStatus} threshold`);

  // Line 9: Excess over threshold
  const excessOverThreshold = zeroFloor(modifiedAGI.minus(threshold));
  audit.record("Form 8815", "9", "Excess over threshold", excessOverThreshold,
    `max(0, ${modifiedAGI} - ${threshold})`);

  // Line 10: Phase-out range
  const range = PHASE_OUT_RANGE[filingStatus] ?? new Decimal(0);
  audit.record("Form 8815", "10", "Phase-out range", range,
    `${filingStatus} phase-out range`);

  // Line 11: Phase-out ratio
  const phaseOutRatio = range.isZero()
    ? new Decimal(1)
    : min(excessOverThreshold.div(range), new Decimal(1));
  audit.record("Form 8815", "11", "Phase-out ratio", phaseOutRatio,
    `min(1, ${excessOverThreshold} / ${range})`);

  // Line 12: Reduction
  const reduction = roundDollar(excludableBeforePhaseOut.times(phaseOutRatio));
  audit.record("Form 8815", "12", "Phase-out reduction", reduction,
    `${excludableBeforePhaseOut} × ${phaseOutRatio}`);

  // Line 13: Final excludable interest
  const excludableSavingsBondInterest = excludableBeforePhaseOut.minus(reduction);
  audit.record("Form 8815", "13", "Excludable savings bond interest", excludableSavingsBondInterest,
    `${excludableBeforePhaseOut} - ${reduction} → Schedule B Line 3`);

  return {
    qualifiedExpenses: totalExpenses,
    totalProceeds,
    totalInterest,
    expenseRatio,
    excludableBeforePhaseOut,
    modifiedAGI,
    phaseOutThreshold: threshold,
    phaseOutRange: range,
    excludableSavingsBondInterest,
    lines: audit.getLines(),
  };
}

function zeroResult(modifiedAGI: Decimal, audit: AuditTrail): Form8815Result {
  return {
    qualifiedExpenses: new Decimal(0),
    totalProceeds: new Decimal(0),
    totalInterest: new Decimal(0),
    expenseRatio: new Decimal(0),
    excludableBeforePhaseOut: new Decimal(0),
    modifiedAGI,
    phaseOutThreshold: new Decimal(0),
    phaseOutRange: new Decimal(0),
    excludableSavingsBondInterest: new Decimal(0),
    lines: audit.getLines(),
  };
}

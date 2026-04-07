/**
 * Form 8812 — Credits for Qualifying Children and Other Dependents
 * Spec: spec/federal/form-8812.yaml
 *
 * Calculates the nonrefundable CTC (limited to tax liability) and
 * the Additional Child Tax Credit (ACTC), the refundable portion.
 * ACTC = 15% of earned income over $2,500, capped at unused CTC
 * and $1,700 per qualifying child (2025).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8812Input {
  qualifyingChildren: number;
  otherDependents: number;
  agi: Decimal;
  earnedIncome: Decimal; // W-2 wages + net SE earnings - deductible half SE tax (§32(c)(2))
  taxLiability: Decimal; // Tax after other nonrefundable credits (before CTC)
  filingStatus: FilingStatus;
}

export interface Form8812Result {
  ctcBeforeLimitation: Decimal; // Line 12
  nonrefundableCTC: Decimal; // Line 14 → 1040 Line 19
  unusedCTC: Decimal; // Line 15
  earnedIncomeExcess: Decimal; // Line 21
  fifteenPercent: Decimal; // Line 24
  actc: Decimal; // Line 27 → 1040 Line 28
  lines: CalculatedLine[];
}

const ACTC_EARNED_INCOME_THRESHOLD = new Decimal(2500);
const ACTC_RATE = new Decimal(0.15);
const ACTC_MAX_PER_CHILD = new Decimal(1700);

export function calculateForm8812(
  input: Form8812Input,
  constants: YearConstants
): Form8812Result {
  const audit = new AuditTrail();
  const ctc = constants.childTaxCredit;

  // Line 12: CTC and ODC before limitation (after phase-out)
  const maxCTC = ctc.perChild.times(input.qualifyingChildren);
  const maxODC = ctc.otherDependentCredit.times(input.otherDependents);
  const maxTotal = maxCTC.plus(maxODC);

  const threshold = ctc.phaseOutThreshold[input.filingStatus];
  const excess = zeroFloor(input.agi.minus(threshold));
  const thousandsOver = excess.dividedBy(1000).ceil();
  const reduction = thousandsOver.times(ctc.phaseOutRate);
  const ctcBeforeLimitation = zeroFloor(maxTotal.minus(reduction));

  audit.record("Form 8812", "12", "CTC/ODC before limitation", ctcBeforeLimitation,
    `max($${maxCTC} CTC + $${maxODC} ODC - $${reduction} phase-out, 0)`);

  // Line 14: Nonrefundable — limited to tax liability
  const nonrefundableCTC = min(ctcBeforeLimitation, input.taxLiability);
  audit.record("Form 8812", "14", "Nonrefundable CTC", nonrefundableCTC,
    `min(${ctcBeforeLimitation}, tax liability ${input.taxLiability})`);

  // Line 15: Unused CTC (potential refundable amount)
  const unusedCTC = ctcBeforeLimitation.minus(nonrefundableCTC);
  audit.record("Form 8812", "15", "Unused CTC", unusedCTC,
    "Line 12 - Line 14");

  // Line 18/20: Earned income (per §32(c)(2): wages + SE - deductible half SE tax)
  audit.record("Form 8812", "18/20", "Earned income for ACTC", input.earnedIncome,
    "W-2 wages + net SE earnings - deductible half SE tax (§32(c)(2))");

  // Line 21: Earned income excess over $2,500
  const earnedIncomeExcess = zeroFloor(input.earnedIncome.minus(ACTC_EARNED_INCOME_THRESHOLD));
  audit.record("Form 8812", "21", "Earned income excess over $2,500", earnedIncomeExcess,
    `max(0, ${input.earnedIncome} - $2,500)`);

  // Line 24: 15% of earned income excess
  const fifteenPercent = roundDollar(earnedIncomeExcess.times(ACTC_RATE));
  audit.record("Form 8812", "24", "15% of earned income excess", fifteenPercent,
    `${earnedIncomeExcess} × 15%`);

  // Line 27: ACTC = min(Line 15 unused, 15% earned amount, $1,700 × children)
  // Per IRS Form 8812 Line 27: uses Line 15 (total unused CTC+ODC after phase-out).
  // The $1,700 per child cap prevents ODC from being refunded in normal cases.
  const maxRefundable = ACTC_MAX_PER_CHILD.times(input.qualifyingChildren);
  const actc = min(min(unusedCTC, fifteenPercent), maxRefundable);
  audit.record("Form 8812", "27", "Additional Child Tax Credit (refundable)", actc,
    `min(unused $${unusedCTC}, 15% $${fifteenPercent}, max $${maxRefundable})`);

  return {
    ctcBeforeLimitation,
    nonrefundableCTC,
    unusedCTC,
    earnedIncomeExcess,
    fifteenPercent,
    actc,
    lines: audit.getLines(),
  };
}

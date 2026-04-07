/**
 * Pennsylvania Schedule A — Interest Income
 * Spec: spec/state/pa-schedule-a.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export interface PAScheduleAAdjustmentEntry {
  description: string;
  amount: Decimal;
}

export interface PAScheduleAInput {
  taxYear: number;
  federalInterestIncome?: Decimal;
  taxExemptInterest?: Decimal;
  additionAdjustments?: PAScheduleAAdjustmentEntry[];
  federalScheduleK1Interest?: Decimal;
  paObligationInterest?: Decimal;
  usGovernmentInterest?: Decimal;
  reductionAdjustments?: PAScheduleAAdjustmentEntry[];
  forfeitedInterestPenalty?: Decimal;
  annuityAndEndowmentDistributions?: Decimal;
  charitableGiftAnnuityIncome?: Decimal;
  nonEducational529Distributions?: Decimal;
  taxableHealthMedicalSavingsDistributions?: Decimal;
  paPassThroughInterest?: Decimal;
}

export interface PAScheduleAResult {
  additionAdjustments: Array<Required<PAScheduleAAdjustmentEntry>>;
  reductionAdjustments: Array<Required<PAScheduleAAdjustmentEntry>>;
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16: Decimal;
  lines: CalculatedLine[];
}

function normalizeAmount(value?: Decimal): Decimal {
  return zeroFloor(roundDollar(value ?? new Decimal(0)));
}

function normalizeAdjustments(
  entries?: PAScheduleAAdjustmentEntry[],
): Array<Required<PAScheduleAAdjustmentEntry>> {
  return (entries ?? []).map((entry) => ({
    description: entry.description,
    amount: normalizeAmount(entry.amount),
  }));
}

export function calculatePAScheduleA(input: PAScheduleAInput): PAScheduleAResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule A constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const additionAdjustments = normalizeAdjustments(input.additionAdjustments);
  const reductionAdjustments = normalizeAdjustments(input.reductionAdjustments);

  const line1 = normalizeAmount(input.federalInterestIncome);
  const line2 = normalizeAmount(input.taxExemptInterest);
  const line3 = sum(...additionAdjustments.map((entry) => entry.amount));
  const line4 = sum(line1, line2, line3);
  const line5 = normalizeAmount(input.federalScheduleK1Interest);
  const line6 = normalizeAmount(input.paObligationInterest);
  const line7 = normalizeAmount(input.usGovernmentInterest);
  const line8 = sum(
    ...reductionAdjustments.map((entry) => entry.amount),
    normalizeAmount(input.forfeitedInterestPenalty),
  );
  const line9 = sum(line5, line6, line7, line8);
  const line10 = line4.minus(line9);
  const line11 = normalizeAmount(input.annuityAndEndowmentDistributions);
  const line12 = normalizeAmount(input.charitableGiftAnnuityIncome);
  const line13 = normalizeAmount(input.nonEducational529Distributions);
  const line14 = normalizeAmount(input.taxableHealthMedicalSavingsDistributions);
  const line15 = normalizeAmount(input.paPassThroughInterest);
  const line16 = zeroFloor(sum(line10, line11, line12, line13, line14, line15));

  audit.record("PA-Schedule-A", "1", "Interest income reported on the federal return", line1, "Rounded Schedule A input for federal interest income");
  audit.record("PA-Schedule-A", "2", "Tax-exempt interest included in the federal return", line2, "Rounded Schedule A input for federal tax-exempt interest");
  audit.record("PA-Schedule-A", "3", "Other addition adjustments", line3, "Sum of rounded, non-negative Schedule A addition adjustments");
  audit.record("PA-Schedule-A", "4", "Adjusted federal interest subtotal", line4, "Line 1 + Line 2 + Line 3");
  audit.record("PA-Schedule-A", "5", "Interest income from federal Schedule(s) K-1", line5, "Rounded federal Schedule K-1 interest amount removed from the federal subtotal");
  audit.record("PA-Schedule-A", "6", "Pennsylvania direct-obligation interest", line6, "Rounded Pennsylvania direct-obligation interest supplied for Schedule A");
  audit.record("PA-Schedule-A", "7", "U.S. government direct-obligation interest", line7, "Rounded U.S. government direct-obligation interest supplied for Schedule A");
  audit.record("PA-Schedule-A", "8", "Other reduction adjustments", line8, "Sum of rounded, non-negative Schedule A reduction adjustments plus the supported forfeited-interest penalty amount");
  audit.record("PA-Schedule-A", "9", "Total Schedule A reductions", line9, "Line 5 + Line 6 + Line 7 + Line 8");
  audit.record("PA-Schedule-A", "10", "Interest subtotal after reductions", line10, "Line 4 - Line 9");
  audit.record("PA-Schedule-A", "11", "Life insurance, annuity, or endowment distributions", line11, "Rounded Schedule A Line 11 amount");
  audit.record("PA-Schedule-A", "12", "Charitable gift annuity income", line12, "Rounded Schedule A Line 12 amount");
  audit.record("PA-Schedule-A", "13", "Non-educational IRC Section 529 distributions", line13, "Rounded Schedule A Line 13 amount");
  audit.record("PA-Schedule-A", "14", "Taxable Health/Medical Savings Account distributions", line14, "Rounded Schedule A Line 14 amount");
  audit.record("PA-Schedule-A", "15", "Pennsylvania-classified pass-through interest", line15, "Rounded Schedule A Line 15 amount");
  audit.record("PA-Schedule-A", "16", "Total PA-taxable interest income", line16, "max(0, Line 10 + Line 11 + Line 12 + Line 13 + Line 14 + Line 15)");

  return {
    additionAdjustments,
    reductionAdjustments,
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    line14,
    line15,
    line16,
    lines: audit.getLines(),
  };
}

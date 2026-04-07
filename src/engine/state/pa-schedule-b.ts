/**
 * Pennsylvania Schedule B — Dividend Income
 * Spec: spec/state/pa-schedule-b.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export interface PAScheduleBAdjustmentEntry {
  description: string;
  amount: Decimal;
}

export interface PAScheduleBInput {
  taxYear: number;
  federalDividendIncome?: Decimal;
  federalScheduleK1Dividends?: Decimal;
  paExemptInterestDividends?: Decimal;
  reductionAdjustments?: PAScheduleBAdjustmentEntry[];
  exemptInterestDividends?: Decimal;
  additionAdjustments?: PAScheduleBAdjustmentEntry[];
  repatriationTransitionTaxBase?: Decimal;
  repatriationPriorYearPayments?: Decimal;
  repatriationCurrentYearPayments?: Decimal;
  capitalGainDistributions?: Decimal;
  paPassThroughDividends?: Decimal;
}

export interface PAScheduleBResult {
  reductionAdjustments: Array<Required<PAScheduleBAdjustmentEntry>>;
  additionAdjustments: Array<Required<PAScheduleBAdjustmentEntry>>;
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9a: Decimal;
  line9b: Decimal;
  line9c: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  lines: CalculatedLine[];
}

function normalizeAmount(value?: Decimal): Decimal {
  return zeroFloor(roundDollar(value ?? new Decimal(0)));
}

function normalizeAdjustments(
  entries?: PAScheduleBAdjustmentEntry[],
): Array<Required<PAScheduleBAdjustmentEntry>> {
  return (entries ?? []).map((entry) => ({
    description: entry.description,
    amount: normalizeAmount(entry.amount),
  }));
}

export function calculatePAScheduleB(input: PAScheduleBInput): PAScheduleBResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule B constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  const reductionAdjustments = normalizeAdjustments(input.reductionAdjustments);
  const additionAdjustments = normalizeAdjustments(input.additionAdjustments);

  const line1 = normalizeAmount(input.federalDividendIncome);
  const line2 = normalizeAmount(input.federalScheduleK1Dividends);
  const line3 = normalizeAmount(input.paExemptInterestDividends);
  const line4 = sum(...reductionAdjustments.map((entry) => entry.amount));
  const line5 = sum(line2, line3, line4);
  const line6 = line1.minus(line5);
  const line7 = normalizeAmount(input.exemptInterestDividends);
  const line8 = sum(...additionAdjustments.map((entry) => entry.amount));
  const line9a = normalizeAmount(input.repatriationTransitionTaxBase);
  const line9b = normalizeAmount(input.repatriationPriorYearPayments);
  const line9c = normalizeAmount(input.repatriationCurrentYearPayments);
  const line10 = normalizeAmount(input.capitalGainDistributions);
  const line11 = normalizeAmount(input.paPassThroughDividends);
  const line12 = zeroFloor(sum(line6, line7, line8, line9c, line10, line11));

  audit.record("PA-Schedule-B", "1", "Dividend income from the federal return", line1, "Rounded Schedule B input for federal dividend income");
  audit.record("PA-Schedule-B", "2", "Dividend income from federal Schedule(s) K-1", line2, "Rounded federal Schedule K-1 dividend income removed from the federal subtotal");
  audit.record("PA-Schedule-B", "3", "Pennsylvania-exempt interest dividend income", line3, "Rounded Pennsylvania- and U.S.-government exempt-interest dividend amount supplied for Schedule B");
  audit.record("PA-Schedule-B", "4", "Other reduction adjustments", line4, "Sum of rounded, non-negative Schedule B reduction adjustments");
  audit.record("PA-Schedule-B", "5", "Total reductions from federal dividend income", line5, "Line 2 + Line 3 + Line 4");
  audit.record("PA-Schedule-B", "6", "Dividend subtotal after reductions", line6, "Line 1 - Line 5");
  audit.record("PA-Schedule-B", "7", "Exempt-interest dividends from federal Form 1099-DIV Box 12", line7, "Rounded Schedule B input for exempt-interest dividends");
  audit.record("PA-Schedule-B", "8", "Other increase adjustments", line8, "Sum of rounded, non-negative Schedule B addition adjustments");
  audit.record("PA-Schedule-B", "9a", "IRC Section 965 deemed foreign earnings and profits", line9a, "Rounded Schedule B Line 9a input");
  audit.record("PA-Schedule-B", "9b", "Prior-year repatriation cash payments", line9b, "Rounded Schedule B Line 9b input");
  audit.record("PA-Schedule-B", "9c", "Current-year repatriation cash payments", line9c, "Rounded Schedule B Line 9c input");
  audit.record("PA-Schedule-B", "10", "Capital gains distributions", line10, "Rounded Schedule B input for capital gains distributions");
  audit.record("PA-Schedule-B", "11", "Dividend income from PA S corporations and partnerships", line11, "Rounded Schedule B input for Pennsylvania-classified pass-through dividends");
  audit.record("PA-Schedule-B", "12", "Total PA-taxable dividend income", line12, "max(0, Line 6 + Line 7 + Line 8 + Line 9c + Line 10 + Line 11)");

  return {
    reductionAdjustments,
    additionAdjustments,
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9a,
    line9b,
    line9c,
    line10,
    line11,
    line12,
    lines: audit.getLines(),
  };
}

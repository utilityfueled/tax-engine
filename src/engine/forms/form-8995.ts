/**
 * Form 8995 — Qualified Business Income Deduction Simplified Computation
 * Spec: spec/federal/form-8995.yaml
 *
 * Calculates the Section 199A QBI deduction for taxpayers with taxable income
 * at or below the threshold ($197,300 single / $394,600 MFJ for 2025).
 * Deduction = min(20% of QBI + 20% of REIT/PTP, 20% of taxable income minus net capital gain).
 */

import Decimal from "decimal.js";
import { calculateQBIMinimumDeduction } from "./qbi-minimum-deduction.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, min, sum, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface QBISource {
  name: string;
  qbi: Decimal;
  /** Actual section 469(h) participation, independent of QBI trade qualification. */
  materiallyParticipated?: boolean;
}

export interface Form8995Input {
  taxYear?: number;
  priorYearActiveQBILoss?: Decimal;
  /** QBI from each qualified trade/business */
  qbiSources: QBISource[];
  /** Qualified REIT dividends (1099-DIV Box 5 + K-1 Section 199A statement) */
  qualifiedReitDividends?: Decimal;
  /** Qualified PTP income or loss (K-1 Section 199A statement) */
  qualifiedPTPIncome?: Decimal;
  /** Prior year QBI loss carryforward (positive number representing loss) */
  priorYearQBILoss?: Decimal;
  /** Taxable income before QBI deduction (AGI - standard/itemized) */
  taxableIncomeBeforeQBI: Decimal;
  /** Net capital gain from Schedule D (if positive) */
  netCapitalGain: Decimal;
  /** Qualified dividends */
  qualifiedDividends: Decimal;
}

export interface Form8995Result {
  /** Individual QBI amounts */
  qbiAmounts: Decimal[];
  /** Line 6: Total QBI (after prior year loss) */
  totalQBI: Decimal;
  /** Line 7: QBI component (20% of total QBI, floor 0) */
  qbiComponent: Decimal;
  /** Line 8: Qualified REIT dividends + qualified PTP income */
  reitPTPAmount: Decimal;
  /** Line 9: REIT/PTP component (20% of Line 8, floor 0) */
  reitPTPComponent: Decimal;
  /** Line 10: Combined QBI + REIT/PTP component */
  combinedComponent: Decimal;
  /** Line 11: Taxable income before QBI */
  taxableIncomeBeforeQBI: Decimal;
  /** Line 12: Net capital gain + qualified dividends */
  netCapitalGainAmount: Decimal;
  /** Line 14: Income limitation (20% of TI minus cap gains) */
  incomeLimitation: Decimal;
  /** Line 15: Section 199A deduction */
  qbiDeduction: Decimal;
  /** Line 16: QBI loss carryforward (for future years) */
  qbiLossCarryforward: Decimal;
  lines: CalculatedLine[];
}

const QBI_RATE = new Decimal("0.20");

export function calculateForm8995(input: Form8995Input): Form8995Result {
  const audit = new AuditTrail();

  // Lines 1-5: QBI from each business
  const qbiAmounts: Decimal[] = [];
  for (const source of input.qbiSources) {
    const amount = roundDollar(source.qbi);
    qbiAmounts.push(amount);
  }

  // Line 6: Total QBI (sum of all businesses minus prior year loss)
  const grossQBI = qbiAmounts.reduce((acc, q) => acc.plus(q), new Decimal(0));
  const priorLoss = input.priorYearQBILoss ?? new Decimal(0);
  const totalQBI = grossQBI.minus(priorLoss);

  audit.record("Form 8995", "1-5", "QBI by trade/business", grossQBI,
    input.qbiSources.length > 0
      ? `${input.qbiSources.map(s => `${s.name}: $${s.qbi}`).join(", ")}`
      : "No qualified trade or business QBI sources");
  audit.record("Form 8995", "6", "Total QBI", totalQBI,
    `$${grossQBI} gross QBI - $${priorLoss} prior year loss`);

  // Line 7: QBI component = 20% of total QBI (floor at 0)
  const qbiComponent = totalQBI.greaterThan(0)
    ? roundDollar(totalQBI.times(QBI_RATE))
    : new Decimal(0);
  audit.record("Form 8995", "7", "QBI component (20%)", qbiComponent,
    `max(0, ${totalQBI} × 20%)`);

  // Line 8: Qualified REIT dividends + qualified PTP income
  const reitDividends = input.qualifiedReitDividends ?? new Decimal(0);
  const ptpIncome = input.qualifiedPTPIncome ?? new Decimal(0);
  const reitPTPAmount = roundDollar(sum(reitDividends, ptpIncome));
  audit.record("Form 8995", "8", "Qualified REIT dividends and PTP income", reitPTPAmount,
    `$${reitDividends} REIT dividends + $${ptpIncome} PTP income`);

  // Line 9: REIT/PTP component = 20% of Line 8 (floor at 0)
  const reitPTPComponent = reitPTPAmount.greaterThan(0)
    ? roundDollar(reitPTPAmount.times(QBI_RATE))
    : new Decimal(0);
  audit.record("Form 8995", "9", "REIT and PTP component (20%)", reitPTPComponent,
    `max(0, ${reitPTPAmount} × 20%)`);

  // Line 10: Combined QBI + REIT/PTP component
  const combinedComponent = qbiComponent.plus(reitPTPComponent);
  audit.record("Form 8995", "10", "Total QBI, REIT, and PTP component", combinedComponent,
    `$${qbiComponent} QBI component + $${reitPTPComponent} REIT/PTP component`);

  // Line 11: Taxable income before QBI deduction
  const taxableIncomeBeforeQBI = input.taxableIncomeBeforeQBI;
  audit.record("Form 8995", "11", "Taxable income before QBI", taxableIncomeBeforeQBI,
    "AGI - standard/itemized deduction");

  // Line 12: Net capital gain = Schedule D gain (positive) + qualified dividends
  const netCapitalGainAmount = zeroFloor(input.netCapitalGain).plus(input.qualifiedDividends);
  audit.record("Form 8995", "12", "Net capital gain", netCapitalGainAmount,
    `max(0, ${input.netCapitalGain}) cap gain + $${input.qualifiedDividends} qual div`);

  // Line 14: Income limitation = 20% of (taxable income - net capital gain)
  const incomeBase = zeroFloor(taxableIncomeBeforeQBI.minus(netCapitalGainAmount));
  const incomeLimitation = roundDollar(incomeBase.times(QBI_RATE));
  audit.record("Form 8995", "14", "Income limitation (20%)", incomeLimitation,
    `max(0, ${taxableIncomeBeforeQBI} - ${netCapitalGainAmount}) × 20%`);

  // Line 15: QBI deduction = min(combined component, income limitation)
  const ordinaryDeduction = min(combinedComponent, incomeLimitation);
  const minimum = calculateQBIMinimumDeduction({ taxYear: input.taxYear ?? 2025, ordinaryDeduction,
    sources: input.qbiSources, priorYearQBILoss: input.priorYearQBILoss, priorYearActiveQBILoss: input.priorYearActiveQBILoss });
  audit.merge(minimum.lines);
  const qbiDeduction = minimum.deduction;
  audit.record("Form 8995", "15", "Section 199A deduction", qbiDeduction,
    `Ordinary min($${combinedComponent} combined component, $${incomeLimitation} income limit), subject to any applicable section 199A(i) minimum`);

  // Line 16: QBI loss carryforward (if total QBI is negative)
  const qbiLossCarryforward = totalQBI.lessThan(0) ? totalQBI.abs() : new Decimal(0);
  audit.record("Form 8995", "16", "QBI loss carryforward", qbiLossCarryforward,
    totalQBI.lessThan(0) ? `Total QBI negative: $${totalQBI}` : "No carryforward");

  return {
    qbiAmounts,
    totalQBI,
    qbiComponent,
    reitPTPAmount,
    reitPTPComponent,
    combinedComponent,
    taxableIncomeBeforeQBI,
    netCapitalGainAmount,
    incomeLimitation,
    qbiDeduction,
    qbiLossCarryforward,
    lines: audit.getLines(),
  };
}

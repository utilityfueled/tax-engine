/**
 * Form 8995 — Qualified Business Income Deduction Simplified Computation
 * Spec: spec/federal/form-8995.yaml
 *
 * Calculates the Section 199A QBI deduction for taxpayers with taxable income
 * at or below the threshold ($197,300 single / $394,600 MFJ for 2025).
 * Deduction = min(20% of QBI + 20% of REIT/PTP, 20% of taxable income minus net capital gain).
 */

import Decimal from "decimal.js";
import { calculateQBIMinimumDeduction, resolveQBIMinimumForDraftAudit } from "./qbi-minimum-deduction.js";
import { calculateReitPtpComponent } from "../qbi-reit-ptp.js";
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
  /** Separate prior qualified REIT/PTP loss, as a positive magnitude. */
  priorYearReitPtpLoss?: Decimal;
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
  priorYearReitPtpLoss: Decimal;
  netReitPtpAmount: Decimal;
  reitPtpLossCarryforward: Decimal;
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
  /** Section 199A deduction (2025 line 15; 2026 draft line 17) */
  qbiDeduction: Decimal;
  /** Positive QBI loss magnitude (2025 line 16; 2026 draft line 18) */
  qbiLossCarryforward: Decimal;
  lines: CalculatedLine[];
}

const QBI_RATE = new Decimal("0.20");

export function calculateForm8995(input: Form8995Input): Form8995Result {
  const audit = new AuditTrail();
  const taxYear = input.taxYear ?? 2025;

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
  const { reitPtpAmount: reitPTPAmount, priorYearReitPtpLoss, netReitPtpAmount,
    reitPTPComponent, reitPtpLossCarryforward } = calculateReitPtpComponent(sum(reitDividends, ptpIncome), input.priorYearReitPtpLoss);
  audit.record("Form 8995", "8", "Qualified REIT dividends and PTP income", reitPTPAmount,
    `$${reitDividends} REIT dividends + $${ptpIncome} PTP income`);
  audit.record("Form 8995", "reit-ptp-prior-loss", "Prior qualified REIT and PTP loss", priorYearReitPtpLoss,
    "Separate qualified loss from the preceding return");

  audit.record("Form 8995", "9", "REIT and PTP component (20%)", reitPTPComponent,
    `max(0, ${netReitPtpAmount}) × 20% after the separate prior loss`);
  const reitPtpCarryFormula = "The excess of the separately stated loss over current qualified REIT and PTP income carries to the next return";
  if (taxYear === 2025) {
    audit.record("Form 8995", "reit-ptp-loss-carryforward", "Qualified REIT and PTP loss carryforward", reitPtpLossCarryforward, reitPtpCarryFormula);
  }

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

  const ordinaryDeduction = min(combinedComponent, incomeLimitation);
  const minimumInput = { taxYear, ordinaryDeduction,
    sources: input.qbiSources, priorYearQBILoss: input.priorYearQBILoss, priorYearActiveQBILoss: input.priorYearActiveQBILoss };
  const minimum = calculateQBIMinimumDeduction(minimumInput);
  audit.merge(minimum.lines);
  const qbiDeduction = minimum.deduction;
  if (taxYear === 2026) {
    audit.record("Form 8995", "15", "QBI deduction before the active business minimum", ordinaryDeduction, "Smaller of line 10 or line 14");
    const minimumAmount = resolveQBIMinimumForDraftAudit(minimumInput, minimum);
    if (minimumAmount !== undefined) {
      audit.record("Form 8995", "16", "Minimum deduction for active qualified business income", minimumAmount,
        "If eligible active qualified business income is at least $1,000, enter $400; otherwise enter zero");
    }
    audit.record("Form 8995", "17", "Section 199A deduction", qbiDeduction, minimumAmount === undefined
      ? "Transfer to Form 1040 line 13b. Line 16 is unresolved; line 15 is at least $400 and determines line 17."
      : "Greater of line 15 or line 16. Transfer to Form 1040 line 13b.");
  } else {
    audit.record("Form 8995", "15", "Section 199A deduction", qbiDeduction,
      `Ordinary min($${combinedComponent} combined component, $${incomeLimitation} income limit), subject to any applicable section 199A(i) minimum`);
  }

  const signedQbiLoss = totalQBI.lt(0) ? totalQBI : new Decimal(0);
  const qbiLossCarryforward = signedQbiLoss.abs();
  audit.record("Form 8995", taxYear === 2026 ? "18" : "16", "QBI loss carryforward", taxYear === 2026 ? signedQbiLoss : qbiLossCarryforward,
    totalQBI.lessThan(0) ? `Total QBI negative: $${totalQBI}` : "No carryforward");
  if (taxYear === 2026) {
    const signedReitPtpLoss = netReitPtpAmount.lt(0) ? netReitPtpAmount : new Decimal(0);
    audit.record("Form 8995", "19", "Qualified REIT and PTP loss carryforward", signedReitPtpLoss, reitPtpCarryFormula);
  }

  return {
    qbiAmounts,
    totalQBI,
    qbiComponent,
    reitPTPAmount,
    priorYearReitPtpLoss,
    netReitPtpAmount,
    reitPTPComponent,
    reitPtpLossCarryforward,
    combinedComponent,
    taxableIncomeBeforeQBI,
    netCapitalGainAmount,
    incomeLimitation,
    qbiDeduction,
    qbiLossCarryforward,
    lines: audit.getLines(),
  };
}

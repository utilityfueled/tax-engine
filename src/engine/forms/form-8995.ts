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
  /** Taxable income supplied by the caller after applicable deductions other than QBI. */
  taxableIncomeBeforeQBI: Decimal;
  /** Net capital gain from Schedule D (if positive) */
  netCapitalGain: Decimal;
  /** Qualified dividends */
  qualifiedDividends: Decimal;
}

export interface Form8995Result {
  /** Individual QBI amounts */
  qbiAmounts: Decimal[];
  /** Signed total QBI after the prior-year loss. */
  totalQBI: Decimal;
  /** QBI component (20% of total QBI, floor 0). */
  qbiComponent: Decimal;
  /** Signed current qualified REIT dividends plus qualified PTP income or loss. */
  reitPTPAmount: Decimal;
  priorYearReitPtpLoss: Decimal;
  netReitPtpAmount: Decimal;
  reitPtpLossCarryforward: Decimal;
  /** Line 9: REIT/PTP component (20% of the net amount, floor 0). */
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
const DRAFT_BUSINESS_LINES = ["1i", "1ii", "1iii", "1iv", "1v"];

export function calculateForm8995(input: Form8995Input): Form8995Result {
  const audit = new AuditTrail();
  const taxYear = input.taxYear ?? 2025;
  const uses2026Draft = taxYear === 2026;

  const qbiAmounts: Decimal[] = [];
  for (const [index, source] of input.qbiSources.entries()) {
    const amount = roundDollar(source.qbi);
    qbiAmounts.push(amount);
    if (uses2026Draft) {
      const line = DRAFT_BUSINESS_LINES[index];
      const sourceNumber = index + 1;
      audit.record(line ? "Form 8995" : "Form 8995 attachment", line ?? String(sourceNumber),
        `Trade or business ${sourceNumber}`, amount, "Current qualified business income or loss", { sourceQBI: source.qbi });
    }
  }

  const grossQBI = qbiAmounts.reduce((acc, q) => acc.plus(q), new Decimal(0));
  const priorLoss = input.priorYearQBILoss ?? new Decimal(0);
  const totalQBI = grossQBI.minus(priorLoss);

  if (uses2026Draft) {
    audit.record("Form 8995", "2", "Total qualified business income or loss", grossQBI,
      "Combine lines 1i through 1v and any additional businesses in the attachment detail");
    audit.record("Form 8995", "3", "Prior qualified business loss carryforward", priorLoss.isZero() ? new Decimal(0) : priorLoss.negated(),
      "Enter the qualified loss carryforward as a signed loss");
    audit.record("Form 8995", "4", "Total qualified business income", zeroFloor(totalQBI),
      "Combine lines 2 and 3, with a floor of zero");
  } else {
    audit.record("Form 8995", "1-5", "QBI by trade/business", grossQBI,
      input.qbiSources.length > 0
        ? `${input.qbiSources.map(s => `${s.name}: $${s.qbi}`).join(", ")}`
        : "No qualified trade or business QBI sources");
    audit.record("Form 8995", "6", "Total QBI", totalQBI,
      `$${grossQBI} gross QBI - $${priorLoss} prior year loss`);
  }

  const qbiComponent = totalQBI.greaterThan(0)
    ? roundDollar(totalQBI.times(QBI_RATE))
    : new Decimal(0);
  audit.record("Form 8995", uses2026Draft ? "5" : "7", "QBI component (20%)", qbiComponent,
    uses2026Draft ? "Line 4 × 20%" : `max(0, ${totalQBI} × 20%)`);

  const reitDividends = input.qualifiedReitDividends ?? new Decimal(0);
  const ptpIncome = input.qualifiedPTPIncome ?? new Decimal(0);
  const { reitPtpAmount: reitPTPAmount, priorYearReitPtpLoss, netReitPtpAmount,
    reitPTPComponent, reitPtpLossCarryforward } = calculateReitPtpComponent(sum(reitDividends, ptpIncome), input.priorYearReitPtpLoss);
  audit.record("Form 8995", uses2026Draft ? "6" : "8",
    uses2026Draft ? "Qualified REIT dividends and PTP income or loss" : "Qualified REIT dividends and PTP income", reitPTPAmount,
    `$${reitDividends} REIT dividends + $${ptpIncome} PTP income`);
  if (uses2026Draft) {
    const signedPriorReitPtpLoss = priorYearReitPtpLoss.isZero() ? new Decimal(0) : priorYearReitPtpLoss.negated();
    audit.record("Form 8995", "7", "Prior qualified REIT and PTP loss carryforward", signedPriorReitPtpLoss,
      "Enter the separate qualified loss carryforward as a signed loss");
    audit.record("Form 8995", "8", "Total qualified REIT dividends and PTP income", zeroFloor(netReitPtpAmount),
      "Combine lines 6 and 7, with a floor of zero");
  } else {
    audit.record("Form 8995", "reit-ptp-prior-loss", "Prior qualified REIT and PTP loss", priorYearReitPtpLoss,
      "Separate qualified loss from the preceding return");
  }

  audit.record("Form 8995", "9", "REIT and PTP component (20%)", reitPTPComponent,
    uses2026Draft ? "Line 8 × 20%" : `max(0, ${netReitPtpAmount}) × 20% after the separate prior loss`);
  const reitPtpCarryFormula = "The excess of the separately stated loss over current qualified REIT and PTP income carries to the next return";
  if (taxYear === 2025) {
    audit.record("Form 8995", "reit-ptp-loss-carryforward", "Qualified REIT and PTP loss carryforward", reitPtpLossCarryforward, reitPtpCarryFormula);
  }

  // Line 10: Combined QBI + REIT/PTP component
  const combinedComponent = qbiComponent.plus(reitPTPComponent);
  audit.record("Form 8995", "10", "Total QBI, REIT, and PTP component", combinedComponent,
    uses2026Draft ? "Add lines 5 and 9" : `$${qbiComponent} QBI component + $${reitPTPComponent} REIT/PTP component`);

  // Line 11: Taxable income before QBI deduction
  const taxableIncomeBeforeQBI = input.taxableIncomeBeforeQBI;
  audit.record("Form 8995", "11", "Taxable income before QBI", taxableIncomeBeforeQBI,
    uses2026Draft
      ? "Taxable income supplied by the caller before QBI. For Form 1040 or 1040-SR, subtract line 13a (Schedule 1-A) from line 11a, then subtract Schedule A lines 4, 7, 10, 15, 16, and 17z before section 68 if itemizing, or lines 12e and 12f otherwise."
      : "AGI - standard/itemized deduction");

  // Line 12: Net capital gain = Schedule D gain (positive) + qualified dividends
  const netCapitalGainAmount = zeroFloor(input.netCapitalGain).plus(input.qualifiedDividends);
  audit.record("Form 8995", "12", "Net capital gain", netCapitalGainAmount,
    `max(0, ${input.netCapitalGain}) cap gain + $${input.qualifiedDividends} qual div`);

  // Line 14: Income limitation = 20% of (taxable income - net capital gain)
  const incomeBase = zeroFloor(taxableIncomeBeforeQBI.minus(netCapitalGainAmount));
  const incomeLimitation = roundDollar(incomeBase.times(QBI_RATE));
  if (uses2026Draft) {
    audit.record("Form 8995", "13", "Taxable income less net capital gain and qualified dividends", incomeBase,
      "Subtract line 12 from line 11, with a floor of zero");
  }
  audit.record("Form 8995", "14", "Income limitation (20%)", incomeLimitation,
    uses2026Draft ? "Line 13 × 20%" : `max(0, ${taxableIncomeBeforeQBI} - ${netCapitalGainAmount}) × 20%`);

  const ordinaryDeduction = min(combinedComponent, incomeLimitation);
  const minimumInput = { taxYear, ordinaryDeduction,
    sources: input.qbiSources, priorYearQBILoss: input.priorYearQBILoss, priorYearActiveQBILoss: input.priorYearActiveQBILoss };
  const minimum = calculateQBIMinimumDeduction(minimumInput);
  audit.merge(minimum.lines);
  const qbiDeduction = minimum.deduction;
  if (uses2026Draft) {
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
  audit.record("Form 8995", uses2026Draft ? "18" : "16", "QBI loss carryforward", uses2026Draft ? signedQbiLoss : qbiLossCarryforward,
    totalQBI.lessThan(0) ? `Total QBI negative: $${totalQBI}` : "No carryforward");
  if (uses2026Draft) {
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

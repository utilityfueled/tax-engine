/**
 * Ohio IT/SD 2210 — Interest Penalty on Underpayment of Estimated Tax.
 * Spec: spec/state/oh-it-sd-2210.yaml
 *
 * Computes the interest penalty for underpayment of Ohio estimated income tax
 * (IT 1040) and optionally school district tax (SD 100). Implements the
 * individual filer method (page 2 of the form).
 *
 * Three independent safe harbors — if ANY one is met, penalty is $0:
 *   A. Taxes paid >= 90% of current year liability
 *   B. Taxes paid >= 100% of prior year liability (if timely filed)
 *   C. Current year liability minus withholding <= $500
 *
 * When no safe harbor applies, the penalty is computed quarterly using
 * pre-computed interest rate factors per R.C. 5747.09 and R.C. 5703.47.
 */

import Decimal from "decimal.js";
import {
  OHIO_TAX_CONSTANTS,
  type OhioITSD2210YearConstants,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export const OH_IT_SD_2210_CONSTANTS: Record<number, OhioITSD2210YearConstants> = {
  2024: OHIO_TAX_CONSTANTS[2024].itSd2210,
  2025: OHIO_TAX_CONSTANTS[2025].itSd2210,
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface EstimatedPaymentEntry {
  /** Date payment was made or deemed paid (ISO 8601, e.g. "2025-04-15"). */
  date: string;
  /** Amount paid. */
  amount: Decimal | string | number;
}

export interface OhioITSD2210Input {
  taxYear: number;
  /** Which personal return is being annualized on IT/SD 2210 page 2. */
  formType?: "it1040" | "sd100";

  /** IT 1040 line 10: current year tax after nonrefundable credits. */
  currentYearTaxLiability: Decimal | string | number;

  /** Ohio income tax withheld (IT 1040 line 14). */
  ohioWithholding: Decimal | string | number;

  /** Estimated and extension payments + prior year carryforward (IT 1040 line 15). */
  estimatedPayments?: Decimal | string | number;

  /** Individual estimated payments with dates (for quarterly allocation).
   *  If not provided, all estimated payments are assumed paid by Q4 (Jan 15). */
  estimatedPaymentSchedule?: EstimatedPaymentEntry[];

  /** Prior year Ohio tax liability after nonrefundable credits. Zero if no prior year. */
  priorYearTaxLiability?: Decimal | string | number;

  /** Whether the prior year return was timely filed. Default: true if priorYearTaxLiability > 0. */
  priorYearTimelyFiled?: boolean;
}

export interface QuarterlyDetail {
  /** Cumulative required payment through this quarter. */
  cumulativeRequired: Decimal;
  /** Cumulative withholding through this quarter (evenly spread). */
  cumulativeWithholding: Decimal;
  /** Cumulative estimated payments through this quarter. */
  cumulativeEstimated: Decimal;
  /** Total cumulative payments (withholding + estimated). */
  cumulativePayments: Decimal;
  /** Underpayment for this quarter (floored at zero). */
  underpayment: Decimal;
  /** Interest rate factor for this quarter. */
  rateFactor: Decimal;
  /** Interest penalty for this quarter. */
  interestPenalty: Decimal;
}

export interface OhioITSD2210Result {
  line1_totalTaxesPaid: Decimal;
  line2_currentYearLiability: Decimal;
  line3_priorYearLiability: Decimal;

  /** Whether safe harbor A applies (payments >= 90% current year). */
  safeHarborA: boolean;
  /** Whether safe harbor B applies (payments >= 100% prior year). */
  safeHarborB: boolean;
  /** Whether safe harbor C applies (liability - withholding <= $500). */
  safeHarborC: boolean;
  /** Whether any safe harbor exempts the taxpayer from penalty. */
  penaltyExempt: boolean;

  line9_requiredAnnualPayment: Decimal;

  /** Per-quarter breakdown (A through D). Null if penalty-exempt. */
  quarters: [QuarterlyDetail, QuarterlyDetail, QuarterlyDetail, QuarterlyDetail] | null;

  line17_totalPenalty: Decimal;

  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CUMULATIVE_PERCENTAGES = [
  d("0.25"),
  d("0.50"),
  d("0.75"),
  d("1.00"),
];

const FORM_REFERENCES = {
  it1040: {
    line1Formula: "IT 1040 line 14 + line 15",
    line2Formula: "IT 1040 line 10",
    line3Formula: "Prior year IT 1040 line 10",
    line17Formula: "Flows to IT 1040 line 11",
    withholdingLabel: "Withholding",
  },
  sd100: {
    line1Formula: "SD 100 line 11 + line 12",
    line2Formula: "SD 100 line 8",
    line3Formula: "Prior year SD 100 line 8",
    line17Formula: "Flows to SD 100 line 9",
    withholdingLabel: "School district withholding",
  },
} as const;

/**
 * Quarterly due dates by tax year. Used to allocate estimated payments.
 * Format: [Q1, Q2, Q3, Q4] as ISO date strings.
 */
const QUARTERLY_DUE_DATES: Record<number, [string, string, string, string]> = {
  2024: ["2024-04-15", "2024-06-17", "2024-09-16", "2025-01-15"],
  2025: ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"],
};

function sumTimelyEstimatedPayments(
  schedule: EstimatedPaymentEntry[] | undefined,
  totalEstimated: Decimal,
  finalDueDate: string,
): Decimal {
  if (!schedule || schedule.length === 0) {
    return totalEstimated;
  }

  let timelyTotal = new Decimal(0);

  for (const payment of schedule) {
    if (payment.date <= finalDueDate) {
      timelyTotal = timelyTotal.plus(d(payment.amount));
    }
  }

  return timelyTotal;
}

/**
 * Compute cumulative estimated payments by each quarterly due date.
 * Payments made on or before a due date count toward that quarter. Payments
 * made after the final due date do not count in any column.
 */
function computeCumulativeEstimated(
  schedule: EstimatedPaymentEntry[] | undefined,
  totalEstimated: Decimal,
  dueDates: [string, string, string, string],
): [Decimal, Decimal, Decimal, Decimal] {
  if (!schedule || schedule.length === 0) {
    // No schedule provided — assume all paid by Q4
    return [new Decimal(0), new Decimal(0), new Decimal(0), totalEstimated];
  }

  const cumulative: [Decimal, Decimal, Decimal, Decimal] = [
    new Decimal(0),
    new Decimal(0),
    new Decimal(0),
    new Decimal(0),
  ];

  for (const payment of schedule) {
    const paymentDate = payment.date;
    const amount = d(payment.amount);

    // Credit to the earliest quarter whose due date is >= payment date
    for (let q = 0; q < 4; q++) {
      if (paymentDate <= dueDates[q]!) {
        cumulative[q] = cumulative[q]!.plus(amount);
        break;
      }
    }
  }

  // Convert from per-quarter to cumulative
  let running = new Decimal(0);
  for (let q = 0; q < 4; q++) {
    running = running.plus(cumulative[q]!);
    cumulative[q] = running;
  }

  return cumulative;
}

/** Round to nearest cent (2 decimal places). */
function roundCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioITSD2210(input: OhioITSD2210Input): OhioITSD2210Result {
  const constants = OH_IT_SD_2210_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`Ohio IT/SD 2210 constants not available for tax year ${input.taxYear}`);
  }
  const formType = input.formType ?? "it1040";
  const references = FORM_REFERENCES[formType];

  const dueDates = QUARTERLY_DUE_DATES[input.taxYear];
  if (!dueDates) {
    throw new Error(`Ohio IT/SD 2210 quarterly due dates not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // Line 2 — Current year tax liability
  const line2 = d(input.currentYearTaxLiability);
  audit.record("OH-IT/SD-2210", "2", "Current year tax liability", line2, references.line2Formula);

  // Line 3 — Prior year tax liability
  const line3 = d(input.priorYearTaxLiability);
  audit.record("OH-IT/SD-2210", "3", "Prior year tax liability", line3, references.line3Formula);

  const withholding = d(input.ohioWithholding);
  const estimatedTotal = d(input.estimatedPayments);
  const timelyEstimatedTotal = sumTimelyEstimatedPayments(
    input.estimatedPaymentSchedule,
    estimatedTotal,
    dueDates[3],
  );

  // Line 1 — Total taxes paid
  const line1 = withholding.plus(timelyEstimatedTotal);
  audit.record(
    "OH-IT/SD-2210", "1",
    "Total taxes paid (withholding + estimated)",
    line1,
    references.line1Formula,
    {
      [references.withholdingLabel]: withholding,
      "Timely estimated": timelyEstimatedTotal,
    }
  );

  // --- Safe Harbor Checks ---

  // Safe Harbor A: payments >= 90% of current year liability
  const ninetyPercentCurrent = roundCents(line2.times(d("0.90")));
  const safeHarborA = line1.greaterThanOrEqualTo(ninetyPercentCurrent);
  audit.record(
    "OH-IT/SD-2210", "4-5",
    "Safe harbor A: payments >= 90% current year",
    safeHarborA ? new Decimal(1) : new Decimal(0),
    `${safeHarborA ? "MET" : "NOT MET"}: paid $${line1} vs 90% = $${ninetyPercentCurrent}`,
    { "Taxes paid": line1, "90% threshold": ninetyPercentCurrent }
  );

  // Safe Harbor B: payments >= 100% of prior year liability (if timely filed)
  const priorYearTimelyFiled =
    input.priorYearTimelyFiled !== undefined
      ? input.priorYearTimelyFiled
      : line3.greaterThan(0);
  const safeHarborB = priorYearTimelyFiled && line1.greaterThanOrEqualTo(line3);
  audit.record(
    "OH-IT/SD-2210", "6-7",
    "Safe harbor B: payments >= 100% prior year",
    safeHarborB ? new Decimal(1) : new Decimal(0),
    priorYearTimelyFiled
      ? `${safeHarborB ? "MET" : "NOT MET"}: paid $${line1} vs prior year $${line3}`
      : "N/A — no timely prior year return",
    { "Taxes paid": line1, "Prior year liability": line3 }
  );

  // Safe Harbor C: current year liability - withholding <= $500
  const balanceAfterWithholding = line2.minus(withholding);
  const safeHarborC = balanceAfterWithholding.lessThanOrEqualTo(d(500));
  audit.record(
    "OH-IT/SD-2210", "8",
    "Safe harbor C: liability minus withholding <= $500",
    safeHarborC ? new Decimal(1) : new Decimal(0),
    `${safeHarborC ? "MET" : "NOT MET"}: $${line2} - $${withholding} = $${balanceAfterWithholding}`,
    { "Liability": line2, [references.withholdingLabel]: withholding, "Balance": balanceAfterWithholding }
  );

  const penaltyExempt = safeHarborA || safeHarborB || safeHarborC;

  if (penaltyExempt) {
    audit.record(
      "OH-IT/SD-2210", "17",
      "Total interest penalty",
      new Decimal(0),
      references.line17Formula
    );

    return {
      line1_totalTaxesPaid: line1,
      line2_currentYearLiability: line2,
      line3_priorYearLiability: line3,
      safeHarborA,
      safeHarborB,
      safeHarborC,
      penaltyExempt: true,
      line9_requiredAnnualPayment: new Decimal(0),
      quarters: null,
      line17_totalPenalty: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  // --- Penalty Calculation ---

  // Line 9 — Required annual payment
  const ninetyPercentCurrentForLine9 = roundCents(line2.times(d("0.90")));
  const line9 = priorYearTimelyFiled
    ? min(line3, ninetyPercentCurrentForLine9)
    : ninetyPercentCurrentForLine9;
  audit.record(
    "OH-IT/SD-2210", "9",
    "Required annual payment",
    line9,
    priorYearTimelyFiled
      ? `min(prior year $${line3}, 90% current $${ninetyPercentCurrentForLine9})`
      : `90% of current year $${ninetyPercentCurrentForLine9}`,
    { "Prior year": line3, "90% current": ninetyPercentCurrentForLine9 }
  );

  // Compute cumulative estimated payments by quarter
  const cumulativeEstimated = computeCumulativeEstimated(
    input.estimatedPaymentSchedule,
    estimatedTotal,
    dueDates,
  );

  // Compute quarterly details
  const quarters: [QuarterlyDetail, QuarterlyDetail, QuarterlyDetail, QuarterlyDetail] = [
    {} as QuarterlyDetail,
    {} as QuarterlyDetail,
    {} as QuarterlyDetail,
    {} as QuarterlyDetail,
  ];

  let totalPenaltyCents = new Decimal(0);

  for (let q = 0; q < 4; q++) {
    const pct = CUMULATIVE_PERCENTAGES[q]!;
    const factor = constants.quarterlyFactors[q]!;

    const cumulativeRequired = roundCents(line9.times(pct));
    const cumulativeWithholding = roundCents(withholding.times(pct));
    const cumulativeEst = cumulativeEstimated[q]!;
    const cumulativePayments = cumulativeWithholding.plus(cumulativeEst);
    const underpayment = zeroFloor(cumulativeRequired.minus(cumulativePayments));
    const interestPenalty = roundCents(underpayment.times(factor.factor));

    totalPenaltyCents = totalPenaltyCents.plus(interestPenalty);

    quarters[q] = {
      cumulativeRequired,
      cumulativeWithholding,
      cumulativeEstimated: cumulativeEst,
      cumulativePayments,
      underpayment,
      rateFactor: factor.factor,
      interestPenalty,
    };

    const colLabel = ["A (Q1)", "B (Q2)", "C (Q3)", "D (Q4)"][q]!;
    audit.record(
      "OH-IT/SD-2210", `14-${colLabel}`,
      `Underpayment — ${colLabel}`,
      underpayment,
      `max(0, $${cumulativeRequired} - $${cumulativePayments})`,
      {
        "Required": cumulativeRequired,
        "Withholding": cumulativeWithholding,
        "Estimated": cumulativeEst,
        "Total payments": cumulativePayments,
      }
    );

    audit.record(
      "OH-IT/SD-2210", `16-${colLabel}`,
      `Interest penalty — ${colLabel}`,
      interestPenalty,
      `$${underpayment} × ${factor.factor}`,
      { "Underpayment": underpayment, "Factor": factor.factor }
    );
  }

  // Line 17 — Total penalty (rounded to nearest dollar)
  const line17 = roundDollar(totalPenaltyCents);
  audit.record(
    "OH-IT/SD-2210", "17",
    "Total interest penalty",
    line17,
    references.line17Formula,
    {
      "Q1": quarters[0]!.interestPenalty,
      "Q2": quarters[1]!.interestPenalty,
      "Q3": quarters[2]!.interestPenalty,
      "Q4": quarters[3]!.interestPenalty,
    }
  );

  return {
    line1_totalTaxesPaid: line1,
    line2_currentYearLiability: line2,
    line3_priorYearLiability: line3,
    safeHarborA,
    safeHarborB,
    safeHarborC,
    penaltyExempt: false,
    line9_requiredAnnualPayment: line9,
    quarters,
    line17_totalPenalty: line17,
    lines: audit.getLines(),
  };
}

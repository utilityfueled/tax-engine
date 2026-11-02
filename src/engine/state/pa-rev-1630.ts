/**
 * Pennsylvania REV-1630 — Underpayment of Estimated Tax by Individuals
 * Spec: spec/state/pa-rev-1630.yaml
 *
 * Computes the interest penalty for failing to make sufficient quarterly
 * estimated tax payments. PA treats this as interest, not a traditional penalty.
 *
 * Three sections:
 *   I.  Calculate underpayment per quarter (Lines 1a–10)
 *   II. Check exceptions (Exception 1: prior year safe harbor)
 *   III. Calculate interest on underpayment (Lines 14–16)
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface PAREV1630Constants {
  /** Minimum net tax threshold — no penalty if tax owed < this (Line 3) */
  minimumTaxThreshold: Decimal;
  /** Daily interest rate for the tax year */
  dailyRate: Decimal;
  /** Published daily interest rate for the succeeding tax year, unknown until sourced */
  nextYearDailyRate?: Decimal;
  /** Days from each quarterly due date to Dec 31 (Q1, Q2, Q3) — Line 14a */
  daysToYearEnd: readonly [number, number, number];
  /** Days from Q4 due date to April 15 of following year — Line 14b */
  daysQ4ToFiling: number;
  /** Days from Dec 31 to April 15 of following year — Line 14c */
  daysYearEndToFiling: number;
}

export const PA_REV1630_CONSTANTS: Record<number, PAREV1630Constants> = {
  2024: {
    minimumTaxThreshold: new Decimal("292"),
    dailyRate: new Decimal("0.000219"),
    nextYearDailyRate: new Decimal("0.000192"),
    // Published 2024 worksheet factors, not a determination of statutory elapsed days.
    // Q1 printed258 conflicts with Apr15→Dec31 calendar260; Q3 dueSep16 gives106.
    daysToYearEnd: [258, 197, 106] as const,
    daysQ4ToFiling: 90, // Jan 15→Apr 15
    daysYearEndToFiling: 105, // Dec 31→Apr 15
  },
  2025: {
    minimumTaxThreshold: new Decimal("338"),
    dailyRate: new Decimal("0.000192"),
    nextYearDailyRate: new Decimal("0.000192"),
    // Q1: Apr 15→Dec 31 = 260, Q2: Jun 16→Dec 31 = 198, Q3: Sep 15→Dec 31 = 107
    daysToYearEnd: [260, 198, 107] as const,
    daysQ4ToFiling: 90, // Jan 15→Apr 15
    daysYearEndToFiling: 105, // Dec 31→Apr 15
  },
  2026: {
    // Final 2026 REV-413(I): $14,000 income threshold, $430 net-tax threshold.
    minimumTaxThreshold: new Decimal("430"),
    dailyRate: new Decimal("0.000192"),
    // REV-1611 is published only through Dec31,2026. No inferred 2027 rate.
    nextYearDailyRate: undefined,
    // Final REV-413 due dates Apr15/Jun15/Sep15; no final2026 REV1630 map claim.
    daysToYearEnd: [260, 199, 107] as const,
    daysQ4ToFiling: 90,
    daysYearEndToFiling: 105,
  },
};

/** PA flat income tax rate */
const PA_TAX_RATE = new Decimal("0.0307");

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

export interface REV1630Input {
  taxYear: number;

  /** PA-40 Line 12: tax liability */
  taxLiability: Decimal;

  /**
   * REV-1630 Line 2: withholding + non-payment credits.
   * Sum of reported PA-40 Lines 13 + 17 + 21 + 22 + 23.
   * Does not include payment-only Lines 14/15/16/18 or department-processing WPTC.
   */
  withholdingAndCredits: Decimal;

  /**
   * Quarterly estimated payments made by each due date.
   * Use the actual year-specific due dates. Published fixed-endpoint worksheet
   * only: these already-aggregated amounts require independently verified timing;
   * arbitrary late/partial payments and early payoff need their own method.
   * Include prior year overpayment credit in Q1 if applicable.
   * Include an extension payment in Q4 only if actually paid by that due date.
   */
  quarterlyEstimatedPayments: readonly [Decimal, Decimal, Decimal, Decimal];

  /**
   * Prior year 100% Tax Forgiveness flag.
   * If true, taxpayer is exempt from penalty entirely (Act 85 of 2012).
   */
  priorYear100PercentForgiveness?: boolean;

  /**
   * Prior year PA taxable income (for Exception 1 safe harbor).
   * Used to compute prior year tax at current year rate.
   * Caller must establish an actual prior full-year resident return. Numeric0
   * does not establish filing history. If undefined, Exception1 is not available.
   */
  priorYearPATaxableIncome?: Decimal;

  /**
   * Prior year Tax Forgiveness credit (for Exception 1).
   * Subtracted from prior year tax at current rate.
   */
  priorYearTaxForgivenessCredit?: Decimal;
}

/** Per-quarter detail in the result */
export interface QuarterDetail {
  /** Line 5: required installment */
  requiredInstallment: Decimal;
  /** Line 6: estimated payments for this quarter */
  estimatedPayment: Decimal;
  /** Line 7: overpayment carried from prior quarter */
  carryoverFromPrior: Decimal;
  /** Line 8: total payments (Line 6 + Line 7) */
  totalPayments: Decimal;
  /** Line 9: underpayment (Line 5 - Line 8, floor 0) */
  underpayment: Decimal;
  /** Line 10: overpayment (Line 8 - Line 5, floor 0) */
  overpayment: Decimal;
  /** Whether Exception 1 applies to this quarter */
  exception1Met: boolean;
  /** Interest for this quarter (0 if exception met) */
  interest: Decimal;
}

export interface REV1630Result {
  /** Whether a penalty calculation is required */
  penaltyRequired: boolean;
  /** Reason penalty is not required (if applicable) */
  exemptReason?: string;

  // Section I
  /** Line 1a: tax liability */
  taxLiability: Decimal;
  /** Line 1b: 90% of tax liability */
  ninetyPercentTax: Decimal;
  /** Line 2: withholding and credits */
  withholdingAndCredits: Decimal;
  /** Line 3: net tax owed (threshold test) */
  netTaxOwed: Decimal;
  /** Line 4: underpayment base (Line 1b - Line 2) */
  underpaymentBase: Decimal;

  /** Per-quarter details (Q1–Q4) */
  quarters: readonly [QuarterDetail, QuarterDetail, QuarterDetail, QuarterDetail];

  // Exception 1
  /** Prior year tax at current rate (for Exception 1) */
  priorYearTaxAtCurrentRate?: Decimal;

  // Section III
  /** Line 16: total interest penalty */
  totalInterest: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateREV1630(input: REV1630Input): REV1630Result {
  // Validate before exemptions: malformed actual amounts cannot turn into a known0.
  const amounts = [input.taxLiability, input.withholdingAndCredits,
    ...input.quarterlyEstimatedPayments,
    ...[input.priorYearPATaxableIncome, input.priorYearTaxForgivenessCredit]
      .filter((value): value is Decimal => value !== undefined)];
  if (input.quarterlyEstimatedPayments.length !== 4 ||
      amounts.some(value => !value.isFinite() || value.lt(0))) {
    throw new Error("PA REV-1630 reported amounts must be finite and nonnegative with four payment periods");
  }
  // These are reported worksheet lines, not individual raw statement amounts.
  input = {
    ...input,
    taxLiability: roundDollar(input.taxLiability),
    withholdingAndCredits: roundDollar(input.withholdingAndCredits),
    quarterlyEstimatedPayments: input.quarterlyEstimatedPayments.map(roundDollar) as [Decimal, Decimal, Decimal, Decimal],
    priorYearPATaxableIncome: input.priorYearPATaxableIncome === undefined ? undefined : roundDollar(input.priorYearPATaxableIncome),
    priorYearTaxForgivenessCredit: input.priorYearTaxForgivenessCredit === undefined ? undefined : roundDollar(input.priorYearTaxForgivenessCredit),
  };
  const constants = PA_REV1630_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA REV-1630 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const ZERO = new Decimal(0);
  audit.record("REV-1630", "method", "Published fixed-endpoint worksheet", ZERO,
    input.taxYear === 2024
      ? "published worksheet factors258/197/106; Q1printed258 versus calendar260 discrepancy unresolved; actual dated-payment qualification separate"
      : "published worksheet fixed-endpoint precondition; actual timely-payment/source eligibility must be established separately");

  // -----------------------------------------------------------------------
  // Check: prior year 100% Tax Forgiveness exemption
  // -----------------------------------------------------------------------

  if (input.priorYear100PercentForgiveness) {
    audit.record("REV-1630", "exempt", "Prior year 100% Tax Forgiveness", ZERO,
      "Act 85 of 2012: taxpayer exempt from estimated underpayment penalty");
    return buildExemptResult(input, constants, audit,
      "Prior year 100% Tax Forgiveness — exempt from penalty");
  }

  // -----------------------------------------------------------------------
  // Section I — Lines 1a through 4
  // -----------------------------------------------------------------------

  // Line 1a: tax liability
  const taxLiability = input.taxLiability;
  audit.record("REV-1630", "1a", "Tax liability", taxLiability, "PA-40 Line 12");

  // Line 1b: 90% of tax
  const ninetyPercentTax = roundDollar(taxLiability.times(new Decimal("0.90")));
  audit.record("REV-1630", "1b", "90% of tax liability", ninetyPercentTax, "Line 1a × 0.90");

  // Line 2: withholding and credits
  const withholdingAndCredits = input.withholdingAndCredits;
  audit.record("REV-1630", "2", "Withholding and credits", withholdingAndCredits,
    "Sum of reported PA-40 Lines 13 + 17 + 21 + 22 + 23");

  // Line 3: net tax owed = Line 1a - Line 2
  const netTaxOwed = zeroFloor(taxLiability.minus(withholdingAndCredits));
  audit.record("REV-1630", "3", "Net tax owed", netTaxOwed, "Line 1a - Line 2");

  // Threshold test: if < $338 (TY2025), no penalty
  if (netTaxOwed.lt(constants.minimumTaxThreshold)) {
    audit.record("REV-1630", "3-test", "Threshold test",
      netTaxOwed, `Net tax $${netTaxOwed} < $${constants.minimumTaxThreshold} — no penalty`);
    return buildExemptResult(input, constants, audit,
      `Net tax owed $${netTaxOwed} < $${constants.minimumTaxThreshold} threshold`);
  }

  // Line 4: underpayment base = Line 1b - Line 2
  const underpaymentBase = zeroFloor(ninetyPercentTax.minus(withholdingAndCredits));
  audit.record("REV-1630", "4", "Underpayment base", underpaymentBase,
    "Line 1b - Line 2 (90% of tax minus withholding/credits)");

  // If withholding/credits already ≥ 90% of tax, no estimated payments needed
  if (underpaymentBase.isZero()) {
    return buildExemptResult(input, constants, audit,
      "Withholding and credits cover 90% of tax liability");
  }

  // Line 5: required installment per quarter
  const requiredInstallment = roundDollar(underpaymentBase.dividedBy(4));
  audit.record("REV-1630", "5", "Required installment per quarter", requiredInstallment,
    "Line 4 ÷ 4");

  // -----------------------------------------------------------------------
  // Section I — Lines 6 through 10 (per quarter)
  // -----------------------------------------------------------------------

  const quarters: [QuarterDetail, QuarterDetail, QuarterDetail, QuarterDetail] = [
    emptyQuarter(requiredInstallment),
    emptyQuarter(requiredInstallment),
    emptyQuarter(requiredInstallment),
    emptyQuarter(requiredInstallment),
  ];

  let carryover = ZERO;

  for (let q = 0; q < 4; q++) {
    const label = ["a", "b", "c", "d"][q];
    const qd = quarters[q];

    // Line 6: estimated payment for this quarter
    qd.estimatedPayment = input.quarterlyEstimatedPayments[q];
    audit.record("REV-1630", `6${label}`, `Estimated payment Q${q + 1}`,
      qd.estimatedPayment, `Payment by quarterly due date`);

    // Line 7: carryover from prior quarter (Q1 has none)
    qd.carryoverFromPrior = q === 0 ? ZERO : carryover;
    if (q > 0 && !carryover.isZero()) {
      audit.record("REV-1630", `7${label}`, `Overpayment carried from Q${q}`,
        qd.carryoverFromPrior, `Line 10 from prior quarter`);
    }

    // Line 8: total payments
    qd.totalPayments = qd.estimatedPayment.plus(qd.carryoverFromPrior);

    // Line 9: underpayment
    qd.underpayment = zeroFloor(requiredInstallment.minus(qd.totalPayments));

    // Line 10: overpayment (carries to next quarter)
    qd.overpayment = zeroFloor(qd.totalPayments.minus(requiredInstallment));
    carryover = qd.overpayment;

    if (!qd.underpayment.isZero()) {
      audit.record("REV-1630", `9${label}`, `Underpayment Q${q + 1}`,
        qd.underpayment, `Line 5 ($${requiredInstallment}) - Line 8 ($${qd.totalPayments})`);
    }
    if (!qd.overpayment.isZero()) {
      audit.record("REV-1630", `10${label}`, `Overpayment Q${q + 1}`,
        qd.overpayment, `Line 8 ($${qd.totalPayments}) - Line 5 ($${requiredInstallment})`);
    }
  }

  // If all quarters have zero underpayment, no penalty
  const anyUnderpayment = quarters.some(q => q.underpayment.gt(ZERO));
  if (!anyUnderpayment) {
    audit.record("REV-1630", "9-check", "No underpayment in any quarter", ZERO,
      "All columns 9a-9d are zero — no penalty");
    return buildResult(input, constants, audit, quarters, false,
      "No underpayment in any quarter");
  }

  // -----------------------------------------------------------------------
  // Section II — Exception 1 (prior year safe harbor)
  // -----------------------------------------------------------------------

  let priorYearTaxAtCurrentRate: Decimal | undefined;

  if (input.priorYearPATaxableIncome !== undefined) {
    const priorYearTaxGross = roundDollar(
      input.priorYearPATaxableIncome.times(PA_TAX_RATE),
    );
    const priorForgiveness = input.priorYearTaxForgivenessCredit ?? ZERO;
    priorYearTaxAtCurrentRate = zeroFloor(priorYearTaxGross.minus(priorForgiveness));
    audit.record("REV-1630", "12", "Exception 1: prior year tax at current rate",
      priorYearTaxAtCurrentRate,
      `Prior year income $${input.priorYearPATaxableIncome} × ${PA_TAX_RATE.times(100)}% - forgiveness $${priorForgiveness}`);

    // Exception 1 Worksheet: cumulative withholding share + estimated payments
    const quarterlyWithholdingShare = roundDollar(withholdingAndCredits.dividedBy(4));
    let cumulativePayments = ZERO;

    for (let q = 0; q < 4; q++) {
      cumulativePayments = cumulativePayments
        .plus(quarterlyWithholdingShare)
        .plus(input.quarterlyEstimatedPayments[q]);

      const priorTaxFraction = roundDollar(priorYearTaxAtCurrentRate.times(q + 1).dividedBy(4));
      audit.record("REV-1630", `12${["a", "b", "c", "d"][q]}`, `Exception1 cumulative threshold Q${q + 1}`,
        priorTaxFraction, `Prior annual tax × ${q + 1}/4, rounded to reported dollars`);
      if (cumulativePayments.gte(priorTaxFraction)) {
        quarters[q].exception1Met = true;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Section III — Calculating Interest (Lines 14–16)
  // -----------------------------------------------------------------------

  let totalInterest = ZERO;

  for (let q = 0; q < 4; q++) {
    const qd = quarters[q];
    const label = ["a", "b", "c", "d"][q];

    // Skip if no underpayment or exception met
    if (qd.underpayment.isZero() || qd.exception1Met) {
      qd.interest = ZERO;
      if (qd.exception1Met && !qd.underpayment.isZero()) {
        audit.record("REV-1630", `exc1-${label}`, `Exception 1 applies Q${q + 1}`,
          ZERO, "Cumulative payments ≥ matching25/50/75/100%prior-year tax threshold — no interest");
      }
      continue;
    }

    const nextYearDailyRate = constants.nextYearDailyRate;
    if (nextYearDailyRate === undefined) {
      throw new Error(`PA REV-1630 ${input.taxYear + 1} daily interest rate is not sourced; cannot calculate an unexcepted positive underpayment`);
    }

    const quarterInterest = q < 3
      ? (() => {
      // Q1–Q3: Line 14a (tax year days) + Line 14c (next year days)
        const daysInTaxYear = constants.daysToYearEnd[q];
        const daysInNextYear = constants.daysYearEndToFiling;

        // Line 15a: tax year interest
        const interest14a = roundDollar(
          qd.underpayment
            .times(constants.dailyRate)
            .times(daysInTaxYear),
        );
        audit.record("REV-1630", `15a-${label}`, `Interest Q${q + 1} (tax year)`,
          interest14a,
          `$${qd.underpayment} × ${constants.dailyRate} × ${daysInTaxYear} days`);

        // Line 15c: next year interest
        const interest14c = roundDollar(
          qd.underpayment
            .times(nextYearDailyRate)
            .times(daysInNextYear),
        );
        audit.record("REV-1630", `15c-${label}`, `Interest Q${q + 1} (next year)`,
          interest14c,
          `$${qd.underpayment} × ${nextYearDailyRate} × ${daysInNextYear} days`);

        return interest14a.plus(interest14c);
      })()
      : (() => {
      // Q4: Line 14b only (all in next year)
        const daysQ4 = constants.daysQ4ToFiling;

        // Line 15b: Q4 interest
        const interest14b = roundDollar(
          qd.underpayment
            .times(nextYearDailyRate)
            .times(daysQ4),
        );
        audit.record("REV-1630", `15b-${label}`, `Interest Q4`,
          interest14b,
          `$${qd.underpayment} × ${nextYearDailyRate} × ${daysQ4} days`);

        return interest14b;
      })();

    qd.interest = quarterInterest;
    totalInterest = totalInterest.plus(quarterInterest);
  }

  audit.record("REV-1630", "16", "Total interest penalty", totalInterest,
    "Sum of Lines 15a + 15b + 15c across all quarters");

  return buildResult(input, constants, audit, quarters, true,
    undefined, priorYearTaxAtCurrentRate, totalInterest);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyQuarter(requiredInstallment: Decimal): QuarterDetail {
  const ZERO = new Decimal(0);
  return {
    requiredInstallment,
    estimatedPayment: ZERO,
    carryoverFromPrior: ZERO,
    totalPayments: ZERO,
    underpayment: ZERO,
    overpayment: ZERO,
    exception1Met: false,
    interest: ZERO,
  };
}

function buildExemptResult(
  input: REV1630Input,
  constants: PAREV1630Constants,
  audit: AuditTrail,
  exemptReason: string,
): REV1630Result {
  const ZERO = new Decimal(0);
  const ninetyPercentTax = roundDollar(input.taxLiability.times(new Decimal("0.90")));
  const netTaxOwed = zeroFloor(input.taxLiability.minus(input.withholdingAndCredits));
  const underpaymentBase = zeroFloor(ninetyPercentTax.minus(input.withholdingAndCredits));

  const emptyQ: QuarterDetail = {
    requiredInstallment: ZERO,
    estimatedPayment: ZERO,
    carryoverFromPrior: ZERO,
    totalPayments: ZERO,
    underpayment: ZERO,
    overpayment: ZERO,
    exception1Met: false,
    interest: ZERO,
  };

  return {
    penaltyRequired: false,
    exemptReason,
    taxLiability: input.taxLiability,
    ninetyPercentTax,
    withholdingAndCredits: input.withholdingAndCredits,
    netTaxOwed,
    underpaymentBase,
    quarters: [emptyQ, emptyQ, emptyQ, emptyQ],
    totalInterest: ZERO,
    lines: audit.getLines(),
  };
}

function buildResult(
  input: REV1630Input,
  constants: PAREV1630Constants,
  audit: AuditTrail,
  quarters: readonly [QuarterDetail, QuarterDetail, QuarterDetail, QuarterDetail],
  penaltyRequired: boolean,
  exemptReason?: string,
  priorYearTaxAtCurrentRate?: Decimal,
  totalInterest?: Decimal,
): REV1630Result {
  const ninetyPercentTax = roundDollar(input.taxLiability.times(new Decimal("0.90")));
  const netTaxOwed = zeroFloor(input.taxLiability.minus(input.withholdingAndCredits));
  const underpaymentBase = zeroFloor(ninetyPercentTax.minus(input.withholdingAndCredits));

  return {
    penaltyRequired,
    exemptReason,
    taxLiability: input.taxLiability,
    ninetyPercentTax,
    withholdingAndCredits: input.withholdingAndCredits,
    netTaxOwed,
    underpaymentBase,
    quarters,
    priorYearTaxAtCurrentRate,
    totalInterest: totalInterest ?? new Decimal(0),
    lines: audit.getLines(),
  };
}

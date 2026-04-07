/**
 * Form 6198 — At-Risk Limitations
 * Spec: spec/federal/form-6198.yaml
 *
 * Limits deductible losses from an activity to the amount the taxpayer
 * has "at risk" under IRC §465. The at-risk rules apply before the
 * passive activity rules (Form 8582). Excess losses carry forward.
 *
 * This implementation covers Part I (current year profit/loss), Part II
 * (simplified at-risk computation), and Part IV (deductible loss).
 * Part III (detailed computation) is deferred.
 */

import Decimal from "decimal.js";
import type { Form6198Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form6198Result {
  // Part I
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  /** Line 5: Current year profit (loss) from the activity */
  line5: Decimal;

  // Part II
  /** Line 6: Adjusted basis at effective date */
  line6: Decimal;
  /** Line 7: Increases for the current tax year */
  line7: Decimal;
  /** Line 9: Decreases for the current tax year */
  line9: Decimal;
  /** Line 10a: Amount at risk at close of preceding tax year */
  line10a: Decimal;
  /** Line 10b: Amount at risk (simplified computation) */
  line10b: Decimal;

  // Part IV
  /** Line 20: Amount at risk (= Line 10b) */
  amountAtRisk: Decimal;
  /** Line 21: Deductible loss (limited by at-risk amount) */
  deductibleLoss: Decimal;
  /** Suspended loss carried forward to next year */
  suspendedLoss: Decimal;
  /** Recapture income when at-risk amount goes negative */
  recaptureIncome: Decimal;

  lines: CalculatedLine[];
}

export function calculateForm6198(input: Form6198Input): Form6198Result {
  const audit = new AuditTrail();
  const name = input.activityName || "Activity";

  // ── Part I: Current Year Profit (Loss) From the Activity ──

  const line1 = d(input.ordinaryIncome);
  audit.record(
    "Form 6198",
    "1",
    `Ordinary income (loss) — ${name}`,
    line1,
    "Ordinary income or loss from the activity (K-1 Box 1 or equivalent)"
  );

  const line2 = d(input.gainLossFromDispositions);
  audit.record(
    "Form 6198",
    "2",
    `Gain (loss) from dispositions — ${name}`,
    line2,
    "Gain or loss from sale/disposition of activity assets"
  );

  const line3 = d(input.otherIncomeGains);
  audit.record(
    "Form 6198",
    "3",
    `Other income and gains — ${name}`,
    line3,
    "Other income not on Lines 1 or 2"
  );

  const line4 = d(input.otherDeductionsLosses);
  audit.record(
    "Form 6198",
    "4",
    `Other deductions and losses — ${name}`,
    line4,
    "Other deductions not on Lines 1 or 2"
  );

  // Line 5 = Line 1 + Line 2 + Line 3 - Line 4
  const line5 = line1.plus(line2).plus(line3).minus(line4);
  audit.record(
    "Form 6198",
    "5",
    `Current year profit (loss) — ${name}`,
    line5,
    `Line 1 (${line1}) + Line 2 (${line2}) + Line 3 (${line3}) - Line 4 (${line4})`,
    { "Line 1": line1, "Line 2": line2, "Line 3": line3, "Line 4": line4 }
  );

  // ── Part II: Simplified Computation of Amount At Risk ─────

  // Line 6: Adjusted basis at effective date (floor at 0)
  const line6 = Decimal.max(ZERO, d(input.adjustedBasisAtEffectiveDate));
  audit.record(
    "Form 6198",
    "6",
    `Adjusted basis at effective date — ${name}`,
    line6,
    "Adjusted basis (IRC §1011) in the activity on the effective date; floored at 0"
  );

  // Line 7: Increases for the current tax year
  const line7 = d(input.currentYearIncreases);
  audit.record(
    "Form 6198",
    "7",
    `Increases for the current tax year — ${name}`,
    line7,
    "Additional contributions, recourse borrowing, qualified nonrecourse financing"
  );

  // Line 9: Decreases for the current tax year
  const line9 = d(input.currentYearDecreases);
  audit.record(
    "Form 6198",
    "9",
    `Decreases for the current tax year — ${name}`,
    line9,
    "Distributions, nonrecourse financing, protected amounts"
  );

  // Line 10a: Amount at risk at close of preceding tax year
  const line10a = d(input.priorYearAmountAtRisk);
  audit.record(
    "Form 6198",
    "10a",
    `Prior year amount at risk — ${name}`,
    line10a,
    "Amount at risk at close of preceding tax year (0 if first year)"
  );

  // Line 10b: Amount at risk
  // First year: Line 6 + Line 7 - Line 9
  // Subsequent years: Line 10a + Line 7 - Line 9
  // If prior year at-risk is 0 and adjusted basis is provided, use the first-year formula
  const isFirstYear = line10a.isZero() && !line6.isZero();
  const line10b = isFirstYear
    ? line6.plus(line7).minus(line9)
    : line10a.plus(line7).minus(line9);

  audit.record(
    "Form 6198",
    "10b",
    `Amount at risk — ${name}`,
    line10b,
    isFirstYear
      ? `First year: Line 6 (${line6}) + Line 7 (${line7}) - Line 9 (${line9})`
      : `Line 10a (${line10a}) + Line 7 (${line7}) - Line 9 (${line9})`,
    isFirstYear
      ? { "Line 6": line6, "Line 7": line7, "Line 9": line9 }
      : { "Line 10a": line10a, "Line 7": line7, "Line 9": line9 }
  );

  // ── Part IV: Deductible Loss ──────────────────────────────

  const amountAtRisk = line10b;

  // Recapture: if at-risk amount is negative, recognize as ordinary income
  const recaptureIncome = amountAtRisk.isNegative()
    ? amountAtRisk.abs()
    : ZERO;

  if (recaptureIncome.isPositive()) {
    audit.record(
      "Form 6198",
      "recapture",
      `At-risk recapture income — ${name}`,
      recaptureIncome,
      `At-risk amount (${amountAtRisk}) is negative; abs value recognized as ordinary income per IRC §465(e)`
    );
  }

  // Line 20: Amount at risk for loss limitation
  audit.record(
    "Form 6198",
    "20",
    `Amount at risk for loss limitation — ${name}`,
    amountAtRisk,
    "From Part II Line 10b"
  );

  let deductibleLoss: Decimal;
  let suspendedLoss: Decimal;

  if (!line5.isNegative()) {
    // Profit — no limitation needed; the full amount passes through
    deductibleLoss = ZERO;
    suspendedLoss = ZERO;
    audit.record(
      "Form 6198",
      "21",
      `No loss limitation — ${name}`,
      ZERO,
      `Line 5 is a profit (${line5}); at-risk limitation does not apply`
    );
  } else {
    // Loss — limit to the at-risk amount (floored at 0)
    const availableAtRisk = Decimal.max(ZERO, amountAtRisk);
    const absLoss = line5.abs();
    deductibleLoss = Decimal.min(absLoss, availableAtRisk);
    suspendedLoss = absLoss.minus(deductibleLoss);

    audit.record(
      "Form 6198",
      "21",
      `Deductible loss — ${name}`,
      deductibleLoss,
      `min(abs(Line 5) ${absLoss}, max(0, Line 20) ${availableAtRisk})`,
      {
        "Absolute loss": absLoss,
        "Available at-risk": availableAtRisk,
        "Deductible loss": deductibleLoss,
        "Suspended loss": suspendedLoss,
      }
    );

    if (suspendedLoss.isPositive()) {
      audit.record(
        "Form 6198",
        "suspended",
        `Suspended at-risk loss — ${name}`,
        suspendedLoss,
        `Loss (${absLoss}) exceeds at-risk amount (${availableAtRisk}); excess carries forward`
      );
    }
  }

  return {
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line9,
    line10a,
    line10b,
    amountAtRisk,
    deductibleLoss,
    suspendedLoss,
    recaptureIncome,
    lines: audit.getLines(),
  };
}

/**
 * Form 2441 — Child and Dependent Care Expenses
 * Spec: spec/federal/form-2441.yaml
 *
 * Calculates the credit for child/dependent care expenses.
 * Credit percentage ranges 20%-35% in 2025 and 20%-50% in 2026.
 * Max qualifying expenses: $3K (one) or $6K (two+).
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form2441Input {
  /** Omission preserves the historical 2025 API; new-year callers must pass the year. */
  taxYear?: number;
  filingStatus?: FilingStatus;
  /** Gross qualifying expenses, including any section 129 benefits. */
  excludedDependentCareBenefits?: Decimal;
  /** Separately determined spouse earned income; never combined household income. */
  spouseEarnedIncome?: Decimal;
  /** Qualifying person, provider, work-related and residence requirements confirmed. */
  eligibilityConfirmed?: boolean;
  /** Completed credit-limit worksheet, after foreign tax credit. */
  taxLiabilityLimit?: Decimal;
  careExpenses: Decimal;
  qualifyingIndividuals: number; // 1 or 2+
  earnedIncome: Decimal; // taxpayer; historical callers may supply the already-limited lower spouse amount
  agi: Decimal;
}

export interface Form2441Result {
  qualifyingExpenses: Decimal; // Line 3
  earnedIncomeLimit: Decimal; // Line 4
  creditPercentage: Decimal; // Line 8
  credit: Decimal; // Line 11 when the tax-liability worksheet is provided
  lines: CalculatedLine[];
}

const MAX_EXPENSES_ONE = new Decimal(3000);
const MAX_EXPENSES_TWO = new Decimal(6000);
const BASE_PERCENTAGE = new Decimal("0.35");
const MIN_PERCENTAGE = new Decimal("0.20");
const AGI_STEP = new Decimal(2000);
const AGI_THRESHOLD = new Decimal(15000);
const PERCENTAGE_REDUCTION_STEP = new Decimal("0.01");

export function calculateForm2441(input: Form2441Input): Form2441Result {
  const audit = new AuditTrail();
  const taxYear = input.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Unsupported Form 2441 tax year");
  if (taxYear === 2026 && (!input.filingStatus || input.eligibilityConfirmed === undefined ||
    input.excludedDependentCareBenefits === undefined ||
    (input.filingStatus === "married_filing_jointly" && input.spouseEarnedIncome === undefined))) {
    throw new Error("2026 Form 2441 requires confirmed eligibility, filing status, excluded benefits and separate spouse earned income");
  }
  if ([input.careExpenses, input.earnedIncome, input.agi, ...(input.spouseEarnedIncome === undefined ? [] : [input.spouseEarnedIncome])].some((amount) => !amount.isFinite()) || input.careExpenses.isNegative()) {
    throw new Error("Form 2441 requires finite amounts and nonnegative care expenses");
  }
  const benefits = input.excludedDependentCareBenefits ?? new Decimal(0);
  if (!benefits.isFinite() || benefits.isNegative()) throw new Error("Excluded dependent-care benefits must be nonnegative");
  if (!Number.isInteger(input.qualifyingIndividuals) || input.qualifyingIndividuals < 0) throw new Error("Invalid qualifying individual count");
  const eligible = input.eligibilityConfirmed !== false && input.filingStatus !== "married_filing_separately" && input.qualifyingIndividuals > 0;

  // Line 3: Qualifying expenses (capped)
  const expenseLimit = eligible
    ? zeroFloor((input.qualifyingIndividuals >= 2 ? MAX_EXPENSES_TWO : MAX_EXPENSES_ONE).minus(benefits))
    : new Decimal(0);
  const qualifyingExpenses = min(zeroFloor(input.careExpenses.minus(benefits)), expenseLimit);
  audit.record("Form 2441", "3", "Qualifying expenses", qualifyingExpenses,
    `min(max(0, gross expenses ${input.careExpenses} - excluded benefits ${benefits}), reduced cap ${expenseLimit})`);

  // Line 4: Limited to earned income
  const taxpayerLimit = zeroFloor(input.earnedIncome);
  const spouseLimit = input.filingStatus === "married_filing_jointly" && input.spouseEarnedIncome !== undefined
    ? zeroFloor(input.spouseEarnedIncome) : taxpayerLimit;
  const earnedIncomeLimit = Decimal.min(qualifyingExpenses, taxpayerLimit, spouseLimit);
  audit.record("Form 2441", "4", "Earned income limit", earnedIncomeLimit,
    `min(expenses, taxpayer income ${taxpayerLimit}, spouse limit ${spouseLimit})`);

  // Line 8: Credit percentage (35% - 1% per $2K or fraction thereof over $15K, floor 20%)
  // IRS: "If the result isn't a whole number, round it to the next higher whole number."
  const agiExcess = zeroFloor(input.agi.minus(AGI_THRESHOLD));
  const reductionSteps = agiExcess.isZero()
    ? new Decimal(0)
    : agiExcess.dividedBy(AGI_STEP).ceil();
  const firstStagePercentage = Decimal.max(
    taxYear === 2026 ? BASE_PERCENTAGE : MIN_PERCENTAGE,
    (taxYear === 2026 ? new Decimal("0.50") : BASE_PERCENTAGE)
      .minus(reductionSteps.times(PERCENTAGE_REDUCTION_STEP)),
  );
  const joint = input.filingStatus === "married_filing_jointly";
  const secondStageSteps = taxYear === 2026
    ? zeroFloor(input.agi.minus(joint ? "150000" : "75000")).dividedBy(joint ? "4000" : "2000").ceil()
    : new Decimal(0);
  const percentage = Decimal.max(MIN_PERCENTAGE,
    firstStagePercentage.minus(secondStageSteps.times(PERCENTAGE_REDUCTION_STEP)));
  audit.record("Form 2441", "8", "Credit percentage", percentage,
    taxYear === 2026
      ? "IRC 21(a)(2): 50% to 35% above $15,000, then to 20% above $75,000 ($150,000 joint)"
      : "35% - 1% per $2K or fraction thereof over $15K AGI");

  // Line 9: Credit amount
  const tentativeCredit = roundDollar(earnedIncomeLimit.times(percentage));
  const limit = input.taxLiabilityLimit;
  if (limit !== undefined && (!limit.isFinite() || limit.isNegative())) throw new Error("Care credit tax-liability limit must be finite and nonnegative");
  const credit = limit === undefined ? tentativeCredit : min(tentativeCredit, roundDollar(limit));
  audit.record("Form 2441", "9", "Dependent care credit", tentativeCredit,
    `${earnedIncomeLimit} × ${percentage.times(100)}%`);

  if (limit !== undefined) {
    audit.record("Form 2441", "10", "Credit tax-liability limit", roundDollar(limit), "Completed credit-limit worksheet after foreign tax credit");
    audit.record("Form 2441", "11", "Allowed dependent care credit", credit, "Lesser of lines 9 and 10");
  }

  return {
    qualifyingExpenses,
    earnedIncomeLimit,
    creditPercentage: percentage,
    credit,
    lines: audit.getLines(),
  };
}

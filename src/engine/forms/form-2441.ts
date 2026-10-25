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
import type { DependentCareBenefits } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateForm2441Benefits, type Form2441BenefitsResult } from "./form-2441-benefits.js";

export interface Form2441Input {
  /** Omission preserves the historical 2025 API; new-year callers must pass the year. */
  taxYear?: number;
  filingStatus?: FilingStatus;
  /** Actual deducted/excluded section 129 benefits; reconciled to Part III line 28 when sources are supplied. */
  excludedDependentCareBenefits?: Decimal;
  /** Actual Part III sources, validated and calculated before taking its line 31 as the credit expense base. */
  dependentCareBenefits?: DependentCareBenefits;
  /** Separately determined spouse earned income; never combined household income. */
  spouseEarnedIncome?: Decimal;
  /** Qualifying person, provider, work-related and residence requirements confirmed. */
  eligibilityConfirmed?: boolean;
  /** Completed credit-limit worksheet, after foreign tax credit. */
  taxLiabilityLimit?: Decimal;
  /** Actual completed Worksheet A credit, including a confirmed zero. */
  priorYearExpenseCredit?: Decimal;
  /** Historical adapters may provide combined/limited income, not individual source facts. */
  earnedIncomeFactsVerified?: boolean;
  /** Gross paid qualifying expenses before the benefit coordination; retained as source evidence. */
  careExpenses: Decimal;
  qualifyingIndividuals: number; // 1 or 2+
  earnedIncome: Decimal; // taxpayer; historical callers may supply the already-limited lower spouse amount
  agi: Decimal;
}

export interface Form2441Result {
  qualifyingExpenses: Decimal; // Line 3
  earnedIncomeLimit: Decimal; // Line 6
  earnedIncomeFactsVerified: boolean;
  creditPercentage: Decimal; // Line 8
  credit: Decimal; // Line 11 when the tax-liability worksheet is provided
  /** Part III audit is separate so the orchestrator can merge its early computation exactly once. */
  benefits?: Form2441BenefitsResult;
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
  if (input.dependentCareBenefits !== undefined && input.filingStatus === undefined) throw new Error("Form 2441 Part III handoff requires the actual filing status");
  const benefitsResult = input.dependentCareBenefits !== undefined && input.filingStatus !== undefined
    ? calculateForm2441Benefits({ taxYear, filingStatus: input.filingStatus, facts: input.dependentCareBenefits }) : undefined;
  if (taxYear === 2026 && input.priorYearExpenseCredit === undefined) throw new Error("2026 Form 2441 requires the actual prior-year expense worksheet credit, including known zero");
  if (input.priorYearExpenseCredit !== undefined && (!input.priorYearExpenseCredit.isFinite() || input.priorYearExpenseCredit.isNegative())) throw new Error("Form 2441 prior-year expense credit must be finite and nonnegative");
  if (taxYear === 2026 && (!input.filingStatus || input.eligibilityConfirmed === undefined ||
    (input.excludedDependentCareBenefits === undefined && benefitsResult === undefined) ||
    (input.filingStatus === "married_filing_jointly" && input.spouseEarnedIncome === undefined))) {
    throw new Error("2026 Form 2441 requires confirmed eligibility, filing status, excluded benefits and separate spouse earned income");
  }
  if ([input.careExpenses, input.earnedIncome, input.agi, ...(input.spouseEarnedIncome === undefined ? [] : [input.spouseEarnedIncome])].some((amount) => !amount.isFinite()) || input.careExpenses.isNegative()) {
    throw new Error("Form 2441 requires finite amounts and nonnegative care expenses");
  }
  const benefits = input.excludedDependentCareBenefits ?? benefitsResult?.totalBenefitsApplied ?? new Decimal(0);
  if (!benefits.isFinite() || benefits.isNegative()) throw new Error("Excluded dependent-care benefits must be nonnegative");
  if (!Number.isInteger(input.qualifyingIndividuals) || input.qualifyingIndividuals < 0) throw new Error("Invalid qualifying individual count");
  if (benefitsResult) {
    if (!benefits.eq(benefitsResult.totalBenefitsApplied)) throw new Error("Form 2441 benefits must reconcile to actual Part III line 28");
    if (input.qualifyingIndividuals !== input.dependentCareBenefits?.qualifyingIndividuals) throw new Error("Form 2441 qualifying-person count must match Part III sources");
    const paid = input.dependentCareBenefits?.qualifiedExpensesPaidForCredit;
    if (paid !== undefined && new Decimal(paid).gt(input.careExpenses)) throw new Error("Form 2441 net paid expenses exceed gross paid care expenses");
    audit.record("Form 2441 Source Reconciliation", "gross_paid_expenses", "Gross paid qualifying care expenses", input.careExpenses,
      "Actual gross source expenses retained separately from calculated Part III line 31");
  }
  const eligible = input.eligibilityConfirmed !== false
    && (input.filingStatus !== "married_filing_separately" || benefitsResult?.treatedAsUnmarried === true)
    && input.qualifyingIndividuals > 0;

  // Line 3: Qualifying expenses (capped)
  const expenseLimit = eligible
    ? zeroFloor((input.qualifyingIndividuals >= 2 ? MAX_EXPENSES_TWO : MAX_EXPENSES_ONE).minus(benefits))
    : new Decimal(0);
  const qualifyingExpenses = benefitsResult
    ? (eligible ? benefitsResult.qualifyingCreditExpenses : new Decimal(0))
    : min(zeroFloor(input.careExpenses.minus(benefits)), expenseLimit);
  audit.record("Form 2441", "3", "Qualifying expenses", qualifyingExpenses,
    benefitsResult ? "Validated Part III line 31, subject to separate credit eligibility; no second benefit subtraction"
      : `min(max(0, gross expenses ${input.careExpenses} - excluded benefits ${benefits}), reduced cap ${expenseLimit})`);

  // Printed lines 4/5 preserve the two source worksheet amounts. The limit is line 6.
  const taxpayerLimit = zeroFloor(input.earnedIncome);
  const spouseLimit = input.filingStatus === "married_filing_jointly" && input.spouseEarnedIncome !== undefined
    ? zeroFloor(input.spouseEarnedIncome) : taxpayerLimit;
  const earnedIncomeLimit = Decimal.min(qualifyingExpenses, taxpayerLimit, spouseLimit);
  audit.record("Form 2441", "4", "Taxpayer earned income", input.earnedIncome, "Taxpayer worksheet income; source verification recorded separately");
  audit.record("Form 2441", "5", "Spouse or repeated taxpayer earned income",
    input.filingStatus === "married_filing_jointly" && input.spouseEarnedIncome !== undefined ? input.spouseEarnedIncome : input.earnedIncome,
    "Separate spouse worksheet income for a joint return; otherwise line 4");
  audit.record("Form 2441", "6", "Earned income limit", earnedIncomeLimit,
    `min(expenses, taxpayer income ${taxpayerLimit}, spouse limit ${spouseLimit})`);
  audit.record("Form 2441", "7", "Adjusted gross income", input.agi, "Form 1040 line 11a");

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
  const priorCredit = input.priorYearExpenseCredit === undefined ? undefined : roundDollar(input.priorYearExpenseCredit);
  const totalTentativeCredit = tentativeCredit.plus(priorCredit ?? 0);
  const limit = input.taxLiabilityLimit;
  if (limit !== undefined && (!limit.isFinite() || limit.isNegative())) throw new Error("Care credit tax-liability limit must be finite and nonnegative");
  const credit = limit === undefined ? totalTentativeCredit : min(totalTentativeCredit, roundDollar(limit));
  audit.record("Form 2441", "9", "Dependent care credit", tentativeCredit,
    `${earnedIncomeLimit} × ${percentage.times(100)}%`);
  audit.record("Form 2441", "9a", "Current-year tentative care credit", tentativeCredit, "Line 6 multiplied by line 8, rounded to whole dollars");
  if (priorCredit !== undefined) {
    audit.record("Form 2441", "9b", "Prior-year expense worksheet credit", priorCredit, "Actual completed Worksheet A credit, including confirmed zero");
    audit.record("Form 2441", "9c", "Total tentative care credit", totalTentativeCredit, "Line 9a plus line 9b");
  }

  if (limit !== undefined) {
    audit.record("Form 2441", "10", "Credit tax-liability limit", roundDollar(limit), "Completed credit-limit worksheet after foreign tax credit");
    audit.record("Form 2441", "11", "Allowed dependent care credit", credit,
      priorCredit === undefined ? "Historical current-year-only result; prior-year expense facts are unverified" : "Lesser of lines 9c and 10");
  }

  return {
    qualifyingExpenses,
    earnedIncomeLimit,
    earnedIncomeFactsVerified: taxYear === 2026 || input.earnedIncomeFactsVerified === true,
    creditPercentage: percentage,
    credit,
    benefits: benefitsResult,
    lines: audit.getLines(),
  };
}

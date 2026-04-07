/**
 * California Form 540 line 40 child and dependent care expenses credit.
 * Spec: spec/state/ca-form-540-child-and-dependent-care-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export type CAForm540ChildAndDependentCareCreditDisqualificationReason =
  | "federal_agi_limit_exceeded"
  | "married_filing_separately_without_section_e_exception";

export interface CAForm540ChildAndDependentCareCreditInput {
  filingStatus: FilingStatus;
  qualifiedExpensesIncurredInCalifornia?: Decimal | string | number;
  line3QualifiedExpensesOverride?: Decimal | string | number;
  qualifyingPersonCount: number;
  taxpayerEarnedIncome: Decimal | string | number;
  spouseEarnedIncomeForLine5?: Decimal | string | number;
  federalAgi: Decimal | string | number;
  priorYearExpensesCredit?: Decimal | string | number;
  marriedFilingSeparatelyMeetsSectionEException?: boolean;
  taxYear: number;
}

export interface CAForm540ChildAndDependentCareCreditResult {
  filingStatus: FilingStatus;
  federalAgi: Decimal;
  qualifies: boolean;
  disqualificationReason?: CAForm540ChildAndDependentCareCreditDisqualificationReason;
  line3QualifiedExpenses: Decimal;
  line4TaxpayerEarnedIncome: Decimal;
  line5ComparisonEarnedIncome: Decimal;
  line6AllowedExpenses: Decimal;
  line7FederalAgiDecimal: Decimal;
  line8FederalAgiScaledAmount: Decimal;
  line9CaliforniaCreditDecimal: Decimal;
  line10CurrentYearCredit: Decimal;
  line11PriorYearExpensesCredit: Decimal;
  line12Line40Credit: Decimal;
  lines: CalculatedLine[];
}

const QUALIFYING_EXPENSES_ONE = new Decimal(3000);
const QUALIFYING_EXPENSES_TWO_OR_MORE = new Decimal(6000);
const LINE_9_LIMIT_1 = new Decimal(40000);
const LINE_9_LIMIT_2 = new Decimal(70000);
const LINE_9_LIMIT_3 = new Decimal(100000);
const LINE_9_RATE_1 = new Decimal(0.5);
const LINE_9_RATE_2 = new Decimal(0.43);
const LINE_9_RATE_3 = new Decimal(0.34);
const LINE_7_BASE_PERCENTAGE = new Decimal(0.35);
const LINE_7_MIN_PERCENTAGE = new Decimal(0.2);
const LINE_7_AGI_STEP = new Decimal(2000);
const LINE_7_AGI_THRESHOLD = new Decimal(15000);
const LINE_7_PERCENTAGE_REDUCTION_STEP = new Decimal(0.01);

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

function validateQualifyingPersonCount(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("CA Form 540 line 40 qualifying person count must be a whole number of at least 1");
  }

  return value;
}

function calculateLine7Decimal(federalAgi: Decimal): Decimal {
  const agiExcess = zeroFloor(federalAgi.minus(LINE_7_AGI_THRESHOLD));
  const reductionSteps = agiExcess.isZero() ? new Decimal(0) : agiExcess.dividedBy(LINE_7_AGI_STEP).ceil();

  return Decimal.max(
    LINE_7_MIN_PERCENTAGE,
    LINE_7_BASE_PERCENTAGE.minus(reductionSteps.times(LINE_7_PERCENTAGE_REDUCTION_STEP))
  );
}

function calculateLine9Decimal(federalAgi: Decimal): Decimal | undefined {
  if (federalAgi.lessThanOrEqualTo(LINE_9_LIMIT_1)) {
    return LINE_9_RATE_1;
  }

  if (federalAgi.lessThanOrEqualTo(LINE_9_LIMIT_2)) {
    return LINE_9_RATE_2;
  }

  if (federalAgi.lessThanOrEqualTo(LINE_9_LIMIT_3)) {
    return LINE_9_RATE_3;
  }

  return undefined;
}

export function calculateCAForm540ChildAndDependentCareCredit(
  input: CAForm540ChildAndDependentCareCreditInput
): CAForm540ChildAndDependentCareCreditResult {
  const qualifyingPersonCount = validateQualifyingPersonCount(input.qualifyingPersonCount);
  const federalAgi = nonNegativeAmount(input.federalAgi, "CA Form 540 line 40 federal AGI");
  const line4TaxpayerEarnedIncome = nonNegativeAmount(
    input.taxpayerEarnedIncome,
    "CA Form 540 line 40 taxpayer earned income"
  );

  const line3QualifiedExpensesOverride = input.line3QualifiedExpensesOverride === undefined
    ? undefined
    : nonNegativeAmount(input.line3QualifiedExpensesOverride, "CA Form 540 line 40 Part IV line 33 override");
  const qualifiedExpensesIncurredInCalifornia = nonNegativeAmount(
    input.qualifiedExpensesIncurredInCalifornia,
    "CA Form 540 line 40 qualified expenses incurred in California"
  );
  const line11PriorYearExpensesInput = nonNegativeAmount(
    input.priorYearExpensesCredit,
    "CA Form 540 line 40 prior-year expenses credit"
  );

  const audit = new AuditTrail();
  const line3Cap = qualifyingPersonCount >= 2 ? QUALIFYING_EXPENSES_TWO_OR_MORE : QUALIFYING_EXPENSES_ONE;
  const line3QualifiedExpenses =
    line3QualifiedExpensesOverride ?? min(qualifiedExpensesIncurredInCalifornia, line3Cap);

  const line3Formula =
    line3QualifiedExpensesOverride !== undefined
      ? "Use the supported FTB 3506 Part IV line 33 override"
      : `min(qualified California care expenses, ${line3Cap})`;

  audit.record("CA-3506", "3", "Qualified expenses", line3QualifiedExpenses, line3Formula, {
    "Qualified California care expenses": qualifiedExpensesIncurredInCalifornia,
    "Qualifying person count": String(qualifyingPersonCount),
    "Computation path": line3QualifiedExpensesOverride !== undefined ? "part_iv_override" : "part_iii_expense_cap",
  });

  audit.record(
    "CA-3506",
    "4",
    "Taxpayer earned income",
    line4TaxpayerEarnedIncome,
    "Supported input for FTB 3506 Part III line 4"
  );

  let disqualificationReason: CAForm540ChildAndDependentCareCreditDisqualificationReason | undefined;
  if (
    input.filingStatus === "married_filing_separately" &&
    input.marriedFilingSeparatelyMeetsSectionEException !== true
  ) {
    disqualificationReason = "married_filing_separately_without_section_e_exception";
  }

  const line5ComparisonEarnedIncome =
    input.filingStatus === "married_filing_jointly"
      ? nonNegativeAmount(
          input.spouseEarnedIncomeForLine5,
          "CA Form 540 line 40 spouse earned income for line 5"
        )
      : line4TaxpayerEarnedIncome;

  audit.record(
    "CA-3506",
    "5",
    "Comparison earned income",
    line5ComparisonEarnedIncome,
    input.filingStatus === "married_filing_jointly"
      ? "Use the supported spouse line 5 earned-income amount"
      : "Use line 4 because the return is not filed jointly",
    {
      "Filing status": input.filingStatus,
    }
  );

  const line6AllowedExpenses = min(line3QualifiedExpenses, min(line4TaxpayerEarnedIncome, line5ComparisonEarnedIncome));
  audit.record("CA-3506", "6", "Allowed expenses before percentages", line6AllowedExpenses, "min(Line 3, Line 4, Line 5)", {
    "Line 3": line3QualifiedExpenses,
    "Line 4": line4TaxpayerEarnedIncome,
    "Line 5": line5ComparisonEarnedIncome,
  });

  const line7FederalAgiDecimal = calculateLine7Decimal(federalAgi);
  audit.record(
    "CA-3506",
    "7",
    "Federal AGI decimal amount",
    line7FederalAgiDecimal,
    "35% if federal AGI is $15,000 or less; otherwise reduce by 1% for each $2,000 or fraction thereof above $15,000, floor at 20%",
    {
      "Federal AGI": federalAgi,
    }
  );

  const line8FederalAgiScaledAmount = roundDollar(line6AllowedExpenses.times(line7FederalAgiDecimal));
  audit.record("CA-3506", "8", "Current-year base amount after federal AGI decimal", line8FederalAgiScaledAmount, "Round(Line 6 × Line 7) to the nearest dollar", {
    "Line 6": line6AllowedExpenses,
    "Line 7": line7FederalAgiDecimal,
  });

  const line9Decimal = calculateLine9Decimal(federalAgi);
  if (line9Decimal === undefined && disqualificationReason === undefined) {
    disqualificationReason = "federal_agi_limit_exceeded";
  }

  const qualifies = disqualificationReason === undefined;
  const line9CaliforniaCreditDecimal = qualifies ? line9Decimal! : new Decimal(0);
  const line10CurrentYearCredit = qualifies
    ? roundDollar(line8FederalAgiScaledAmount.times(line9CaliforniaCreditDecimal))
    : new Decimal(0);
  const line11PriorYearExpensesCredit = qualifies ? line11PriorYearExpensesInput : new Decimal(0);
  const line12Line40Credit = qualifies
    ? line10CurrentYearCredit.plus(line11PriorYearExpensesCredit)
    : new Decimal(0);

  audit.record(
    "CA-3506",
    "9",
    "California credit decimal amount",
    line9CaliforniaCreditDecimal,
    qualifies
      ? "Apply the line 9 federal AGI bracket"
      : "Federal AGI over $100,000 or an ineligible married-filing-separately return disqualifies the credit",
    {
      "Federal AGI": federalAgi,
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );

  audit.record(
    "CA-3506",
    "10",
    "Current-year California child and dependent care credit",
    line10CurrentYearCredit,
    qualifies ? "Round(Line 8 × Line 9) to the nearest dollar" : "Disqualified return produces no current-year credit",
    {
      "Line 8": line8FederalAgiScaledAmount,
      "Line 9": line9CaliforniaCreditDecimal,
    }
  );

  audit.record(
    "CA-3506",
    "11",
    "Credit for prior-year expenses paid in 2025",
    line11PriorYearExpensesCredit,
    qualifies
      ? "Supported upstream input from the FTB 3506 Side 2 worksheet"
      : "Disqualified return cannot use prior-year expenses credit",
    {
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );

  audit.record(
    "CA-3506",
    "12",
    "Form 540 line 40 credit",
    line12Line40Credit,
    qualifies ? "Line 10 + Line 11" : "Disqualified return produces no Form 540 line 40 credit",
    {
      "Line 10": line10CurrentYearCredit,
      "Line 11": line11PriorYearExpensesCredit,
      "Qualification status": qualifies ? "qualified" : `disqualified:${disqualificationReason}`,
    }
  );

  return {
    filingStatus: input.filingStatus,
    federalAgi,
    qualifies,
    disqualificationReason,
    line3QualifiedExpenses,
    line4TaxpayerEarnedIncome,
    line5ComparisonEarnedIncome,
    line6AllowedExpenses,
    line7FederalAgiDecimal,
    line8FederalAgiScaledAmount,
    line9CaliforniaCreditDecimal,
    line10CurrentYearCredit,
    line11PriorYearExpensesCredit,
    line12Line40Credit,
    lines: audit.getLines(),
  };
}

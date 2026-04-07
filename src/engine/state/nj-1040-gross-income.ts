/**
 * New Jersey NJ-1040 gross income computation.
 * Spec: spec/state/nj-1040-gross-income.yaml
 *
 * Computes NJ gross income (Lines 14-29). NJ computes income independently
 * from federal AGI using its own income categories.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

/**
 * Pension exclusion: max exclusion by filing status.
 * For 2025 full-year residents:
 *   - At $100,000 or less of total NJ income, the exclusion is capped by filing status.
 *   - Above $100,000, the worksheet applies a filing-status percentage to pension income.
 */
const NJ_PENSION_MAX_EXCLUSION_2025: Record<string, Decimal> = {
  single: new Decimal(75000),
  head_of_household: new Decimal(75000),
  married_filing_jointly: new Decimal(100000),
  qualifying_surviving_spouse: new Decimal(75000),
  married_filing_separately: new Decimal(50000),
};

interface PensionExclusionRateSet {
  underOrAt100k: Decimal;
  underOrAt125k: Decimal;
  underOrAt150k: Decimal;
}

const NJ_PENSION_MAX_EXCLUSION: Record<number, Record<string, Decimal>> = {
  2025: NJ_PENSION_MAX_EXCLUSION_2025,
};

const NJ_PENSION_EXCLUSION_RATES_2025: Record<string, PensionExclusionRateSet> = {
  single: {
    underOrAt100k: new Decimal(1),
    underOrAt125k: new Decimal("0.375"),
    underOrAt150k: new Decimal("0.1875"),
  },
  head_of_household: {
    underOrAt100k: new Decimal(1),
    underOrAt125k: new Decimal("0.375"),
    underOrAt150k: new Decimal("0.1875"),
  },
  qualifying_surviving_spouse: {
    underOrAt100k: new Decimal(1),
    underOrAt125k: new Decimal("0.375"),
    underOrAt150k: new Decimal("0.1875"),
  },
  married_filing_jointly: {
    underOrAt100k: new Decimal(1),
    underOrAt125k: new Decimal("0.5"),
    underOrAt150k: new Decimal("0.25"),
  },
  married_filing_separately: {
    underOrAt100k: new Decimal(1),
    underOrAt125k: new Decimal("0.25"),
    underOrAt150k: new Decimal("0.125"),
  },
};

export interface NJ1040GrossIncomeInput {
  filingStatus: FilingStatus;
  taxYear: number;

  /** Line 14: Wages, salaries, tips */
  wages?: Decimal | string | number;
  /** Line 15a: Taxable interest */
  taxableInterest?: Decimal | string | number;
  /** Line 15b: Tax-exempt interest from other states (NJ-taxable, federally exempt) */
  otherStateTaxExemptInterest?: Decimal | string | number;
  /** Line 16: Dividends */
  dividends?: Decimal | string | number;
  /** Line 17: Net business income/loss */
  businessIncome?: Decimal | string | number;
  /** Line 18: Net gains from disposition of property */
  netGainsFromProperty?: Decimal | string | number;
  /** Line 19: Pensions, annuities, IRA withdrawals */
  pensionIncome?: Decimal | string | number;
  /** Line 20a: Partnership income */
  partnershipIncome?: Decimal | string | number;
  /** Line 20b: S corporation income */
  sCorpIncome?: Decimal | string | number;
  /** Line 21: Net rental/royalty income */
  rentalIncome?: Decimal | string | number;
  /** Line 22: Gambling winnings */
  gamblingWinnings?: Decimal | string | number;
  /** Line 22: Gambling losses (positive number; capped at winnings) */
  gamblingLosses?: Decimal | string | number;
  /** Line 23: Alimony received */
  alimonyReceived?: Decimal | string | number;
  /** Line 24: Other income */
  otherIncome?: Decimal | string | number;

  /** Line 27a: Is taxpayer 62+ or disabled (qualifies for pension exclusion)? */
  qualifiesForPensionExclusion?: boolean;
  /** Mixed-age joint-return override for the pension income owned by the eligible spouse(s) only. */
  pensionIncomeEligibleForExclusion?: Decimal | string | number;
  /** Line 27b: Age-62+ eligibility for the other retirement income exclusion. */
  qualifiesForOtherRetirementExclusion?: boolean;
  /** Line 27b: Special exclusion for filers who will never be eligible for Social Security or Railroad Retirement. */
  qualifiesForSpecialRetirementExclusion?: boolean;
  /**
   * Mixed-age joint-return override to cap the unclaimed exclusion to the
   * eligible spouse's attributable income.
   */
  otherRetirementIncomeExclusionCap?: Decimal | string | number;
  /** Line 28: Other adjustments */
  otherAdjustments?: Decimal | string | number;
}

export interface NJ1040GrossIncomeResult {
  /** Line 14 */
  wages: Decimal;
  /** Line 15a */
  taxableInterest: Decimal;
  /** Line 15b */
  otherStateTaxExemptInterest: Decimal;
  /** Line 16 */
  dividends: Decimal;
  /** Line 17 */
  businessIncome: Decimal;
  /** Line 18 */
  netGainsFromProperty: Decimal;
  /** Line 19 */
  pensionIncome: Decimal;
  /** Line 20a */
  partnershipIncome: Decimal;
  /** Line 20b */
  sCorpIncome: Decimal;
  /** Line 21 */
  rentalIncome: Decimal;
  /** Line 22 */
  netGamblingIncome: Decimal;
  /** Line 23 */
  alimonyReceived: Decimal;
  /** Line 24 */
  otherIncome: Decimal;
  /** Line 25 */
  totalNJIncome: Decimal;
  /** Line 27a */
  pensionExclusion: Decimal;
  /** Line 27b */
  otherRetirementIncomeExclusion: Decimal;
  /** Line 27c */
  totalRetirementExclusion: Decimal;
  /** Line 28 */
  otherAdjustments: Decimal;
  /** Line 29 */
  njGrossIncome: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040GrossIncome(
  input: NJ1040GrossIncomeInput
): NJ1040GrossIncomeResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 gross income rules");

  const audit = new AuditTrail();

  // Line 14: Wages
  const wages = d(input.wages);
  audit.record("NJ-1040", "14", "Wages, salaries, tips", wages, "Sum of all W-2 wages");

  // Line 15a: Taxable interest
  const taxableInterest = d(input.taxableInterest);
  audit.record("NJ-1040", "15a", "Taxable interest income", taxableInterest, "Sum of taxable interest");

  // Line 15b: Tax-exempt interest from other states (taxable in NJ)
  const otherStateTaxExemptInterest = d(input.otherStateTaxExemptInterest);
  audit.record(
    "NJ-1040", "15b",
    "Tax-exempt interest from other states",
    otherStateTaxExemptInterest,
    "Interest/dividends from obligations of states other than NJ — federally tax-exempt but NJ-taxable"
  );

  // Line 16: Dividends
  const dividends = d(input.dividends);
  audit.record("NJ-1040", "16", "Dividend income", dividends, "Sum of ordinary dividends");

  // Line 17: Net business income. If the netted amount is a loss, make no entry.
  const rawBusinessIncome = d(input.businessIncome);
  const businessIncome = zeroFloor(rawBusinessIncome);
  audit.record(
    "NJ-1040",
    "17",
    "Net profits from business",
    businessIncome,
    "Schedule NJ-BUS-1 net income; losses are not entered on Form NJ-1040",
    { "Raw Schedule NJ-BUS-1 amount": rawBusinessIncome }
  );

  // Line 18: Net gains from property. If the netted amount is a loss, make no entry.
  const rawNetGainsFromProperty = d(input.netGainsFromProperty);
  const netGainsFromProperty = zeroFloor(rawNetGainsFromProperty);
  audit.record(
    "NJ-1040",
    "18",
    "Net gains from disposition of property",
    netGainsFromProperty,
    "Schedule NJ-DOP net gains; losses are not entered on Form NJ-1040",
    { "Raw Schedule NJ-DOP amount": rawNetGainsFromProperty }
  );

  // Line 19: Pensions/annuities/IRA
  const pensionIncome = d(input.pensionIncome);
  const pensionIncomeEligibleForExclusion = d(
    input.pensionIncomeEligibleForExclusion ?? pensionIncome
  );
  audit.record("NJ-1040", "19", "Pensions, annuities, IRA withdrawals", pensionIncome, "Total taxable pension/annuity/IRA distributions");

  // Line 20a: Partnership income. If the netted amount is a loss, make no entry.
  const rawPartnershipIncome = d(input.partnershipIncome);
  const partnershipIncome = zeroFloor(rawPartnershipIncome);
  audit.record(
    "NJ-1040",
    "20a",
    "Partnership income",
    partnershipIncome,
    "Distributive share of partnership income; losses are not entered on Form NJ-1040",
    { "Raw partnership amount": rawPartnershipIncome }
  );

  // Line 20b: S corp income. If the netted amount is a loss, make no entry.
  const rawSCorpIncome = d(input.sCorpIncome);
  const sCorpIncome = zeroFloor(rawSCorpIncome);
  audit.record(
    "NJ-1040",
    "20b",
    "S corporation income",
    sCorpIncome,
    "Net pro rata share of S corporation income; losses are not entered on Form NJ-1040",
    { "Raw S corporation amount": rawSCorpIncome }
  );

  // Line 21: Rental/royalty income. If the netted amount is a loss, make no entry.
  const rawRentalIncome = d(input.rentalIncome);
  const rentalIncome = zeroFloor(rawRentalIncome);
  audit.record(
    "NJ-1040",
    "21",
    "Net rental, royalty income",
    rentalIncome,
    "Net rental and royalty income; losses are not entered on Form NJ-1040",
    { "Raw rental/royalty amount": rawRentalIncome }
  );

  // Line 22: Net gambling income (winnings minus losses, floored at zero)
  const gamblingWinnings = d(input.gamblingWinnings);
  const gamblingLosses = d(input.gamblingLosses);
  const netGamblingIncome = zeroFloor(gamblingWinnings.minus(gamblingLosses));
  audit.record(
    "NJ-1040", "22", "Net gambling winnings", netGamblingIncome,
    "Gambling winnings minus losses (floored at zero)",
    { "Winnings": gamblingWinnings, "Losses": gamblingLosses }
  );

  // Line 23: Alimony received
  const alimonyReceived = d(input.alimonyReceived);
  audit.record("NJ-1040", "23", "Alimony received", alimonyReceived, "Alimony from pre-2019 agreements");

  // Line 24: Other income
  const otherIncome = d(input.otherIncome);
  audit.record("NJ-1040", "24", "Other income", otherIncome, "Other NJ-taxable income");

  // Line 25: Total NJ income
  const totalNJIncome = sum(
    wages, taxableInterest, otherStateTaxExemptInterest, dividends,
    businessIncome, netGainsFromProperty,
    pensionIncome, partnershipIncome, sCorpIncome, rentalIncome,
    netGamblingIncome, alimonyReceived, otherIncome
  );
  audit.record(
    "NJ-1040", "25", "Total NJ income", totalNJIncome,
    "Sum of Lines 14 through 24 (including Line 15b other-state tax-exempt interest)",
    {
      "Line 14": wages, "Line 15a": taxableInterest,
      "Line 15b": otherStateTaxExemptInterest, "Line 16": dividends,
      "Line 17": businessIncome, "Line 18": netGainsFromProperty,
      "Line 19": pensionIncome, "Line 20a": partnershipIncome,
      "Line 20b": sCorpIncome, "Line 21": rentalIncome,
      "Line 22": netGamblingIncome, "Line 23": alimonyReceived,
      "Line 24": otherIncome,
    }
  );

  // Line 27a: Pension/retirement exclusion
  const pensionExclusion = computePensionExclusion(
    input.filingStatus,
    input.taxYear,
    pensionIncomeEligibleForExclusion,
    totalNJIncome,
    !!input.qualifiesForPensionExclusion
  );
  audit.record(
    "NJ-1040", "27a", "Pension/retirement exclusion", pensionExclusion,
    "Exclusion for filers 62+ or disabled, subject to income limits",
    {
      "Filing status": input.filingStatus,
      "Qualifies": String(!!input.qualifiesForPensionExclusion),
      "Pension income eligible for exclusion": pensionIncomeEligibleForExclusion,
      "Total NJ income": totalNJIncome,
    }
  );

  // Line 27b: Other retirement income exclusion
  const otherRetirementIncomeExclusion = computeOtherRetirementIncomeExclusion({
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
    totalNJIncome,
    pensionExclusionClaimed: pensionExclusion,
    wages,
    businessIncome,
    partnershipIncome,
    sCorpIncome,
    qualifiesForOtherRetirementExclusion: !!input.qualifiesForOtherRetirementExclusion,
    qualifiesForSpecialRetirementExclusion: !!input.qualifiesForSpecialRetirementExclusion,
    mixedEligibilityCap: d(input.otherRetirementIncomeExclusionCap),
  });
  audit.record(
    "NJ-1040",
    "27b",
    "Other retirement income exclusion",
    otherRetirementIncomeExclusion,
    "Worksheet D unused maximum exclusion plus any special exclusion",
    {
      "Qualifies for other retirement exclusion": String(!!input.qualifiesForOtherRetirementExclusion),
      "Qualifies for special exclusion": String(!!input.qualifiesForSpecialRetirementExclusion),
      "Earned income": sum(wages, businessIncome, partnershipIncome, sCorpIncome),
      "Cap override": d(input.otherRetirementIncomeExclusionCap),
    }
  );

  // Line 27c: Total retirement exclusion
  const totalRetirementExclusion = pensionExclusion.plus(otherRetirementIncomeExclusion);
  audit.record(
    "NJ-1040",
    "27c",
    "Total retirement exclusion",
    totalRetirementExclusion,
    "Line 27a plus Line 27b",
    {
      "Line 27a": pensionExclusion,
      "Line 27b": otherRetirementIncomeExclusion,
    }
  );

  // Line 28: Other adjustments
  const otherAdjustments = d(input.otherAdjustments);
  audit.record("NJ-1040", "28", "Other adjustments", otherAdjustments, "Other NJ-specific adjustments");

  // Line 29: NJ Gross Income
  const njGrossIncome = zeroFloor(
    totalNJIncome.minus(totalRetirementExclusion).minus(otherAdjustments)
  );
  audit.record(
    "NJ-1040", "29", "NJ Gross Income", njGrossIncome,
    "Line 25 minus Line 27c minus Line 28 (floored at zero)",
    {
      "Line 25": totalNJIncome,
      "Line 27c": totalRetirementExclusion,
      "Line 28": otherAdjustments,
    }
  );

  return {
    wages,
    taxableInterest,
    otherStateTaxExemptInterest,
    dividends,
    businessIncome,
    netGainsFromProperty,
    pensionIncome,
    partnershipIncome,
    sCorpIncome,
    rentalIncome,
    netGamblingIncome,
    alimonyReceived,
    otherIncome,
    totalNJIncome,
    pensionExclusion,
    otherRetirementIncomeExclusion,
    totalRetirementExclusion,
    otherAdjustments,
    njGrossIncome,
    lines: audit.getLines(),
  };
}

interface OtherRetirementIncomeExclusionComputationInput {
  filingStatus: FilingStatus;
  taxYear: number;
  totalNJIncome: Decimal;
  pensionExclusionClaimed: Decimal;
  wages: Decimal;
  businessIncome: Decimal;
  partnershipIncome: Decimal;
  sCorpIncome: Decimal;
  qualifiesForOtherRetirementExclusion: boolean;
  qualifiesForSpecialRetirementExclusion: boolean;
  mixedEligibilityCap: Decimal;
}

/**
 * Compute pension/retirement exclusion (Line 27a).
 *
 * Available to taxpayers age 62+ or disabled. For 2025 full-year residents,
 * the exclusion uses common income breakpoints but filing-status-specific rates:
 *   Total NJ income ≤ $100,000:
 *     exclusion = min(pension income, filing-status cap)
 *   Total NJ income $100,001-$125,000:
 *     exclusion = tier percentage × pension income
 *   Total NJ income $125,001-$150,000:
 *     exclusion = tier percentage × pension income
 *   Total NJ income > $150,000:
 *     exclusion = $0
 */
function computePensionExclusion(
  filingStatus: FilingStatus,
  taxYear: number,
  pensionIncome: Decimal,
  totalNJIncome: Decimal,
  qualifies: boolean
): Decimal {
  if (!qualifies) return new Decimal(0);
  if (pensionIncome.isZero() || pensionIncome.isNegative()) return new Decimal(0);

  const yearMaxes = NJ_PENSION_MAX_EXCLUSION[taxYear];
  if (!yearMaxes) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  const maxExclusion = yearMaxes[filingStatus];
  if (!maxExclusion) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  const rates = NJ_PENSION_EXCLUSION_RATES_2025[filingStatus];
  if (!rates) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  if (totalNJIncome.lessThanOrEqualTo(100000)) {
    return Decimal.min(pensionIncome, maxExclusion);
  }

  if (totalNJIncome.lessThanOrEqualTo(125000)) {
    return pensionIncome.times(rates.underOrAt125k);
  }

  if (totalNJIncome.lessThanOrEqualTo(150000)) {
    return pensionIncome.times(rates.underOrAt150k);
  }

  return new Decimal(0);
}

function computeOtherRetirementIncomeExclusion(
  input: OtherRetirementIncomeExclusionComputationInput
): Decimal {
  const specialExclusion = computeSpecialRetirementExclusion(
    input.filingStatus,
    input.qualifiesForOtherRetirementExclusion && input.qualifiesForSpecialRetirementExclusion
  );

  if (!input.qualifiesForOtherRetirementExclusion) {
    return specialExclusion;
  }

  const earnedIncome = sum(
    input.wages,
    input.businessIncome,
    input.partnershipIncome,
    input.sCorpIncome
  );
  const hasUnclaimedExclusion = earnedIncome.lessThanOrEqualTo(3000);
  const maximumExclusion = computeOtherRetirementMaximumExclusion(
    input.filingStatus,
    input.taxYear,
    input.totalNJIncome
  );

  let unclaimedExclusion = zeroFloor(maximumExclusion.minus(input.pensionExclusionClaimed));

  if (!hasUnclaimedExclusion) {
    unclaimedExclusion = new Decimal(0);
  }

  if (input.mixedEligibilityCap.greaterThanOrEqualTo(0) && !input.mixedEligibilityCap.isZero()) {
    unclaimedExclusion = Decimal.min(unclaimedExclusion, input.mixedEligibilityCap);
  }

  return unclaimedExclusion.plus(specialExclusion);
}

function computeOtherRetirementMaximumExclusion(
  filingStatus: FilingStatus,
  taxYear: number,
  totalNJIncome: Decimal
): Decimal {
  const yearMaxes = NJ_PENSION_MAX_EXCLUSION[taxYear];
  if (!yearMaxes) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  const maxExclusion = yearMaxes[filingStatus];
  if (!maxExclusion) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  const rates = NJ_PENSION_EXCLUSION_RATES_2025[filingStatus];
  if (!rates) {
    throw new Error(`NJ-1040 gross income rules not available for tax year ${taxYear}`);
  }

  if (totalNJIncome.lessThanOrEqualTo(100000)) {
    return maxExclusion;
  }

  if (totalNJIncome.lessThanOrEqualTo(125000)) {
    return totalNJIncome.times(rates.underOrAt125k);
  }

  if (totalNJIncome.lessThanOrEqualTo(150000)) {
    return totalNJIncome.times(rates.underOrAt150k);
  }

  return new Decimal(0);
}

function computeSpecialRetirementExclusion(
  filingStatus: FilingStatus,
  qualifies: boolean
): Decimal {
  if (!qualifies) return new Decimal(0);

  if (
    filingStatus === "married_filing_jointly"
    || filingStatus === "head_of_household"
    || filingStatus === "qualifying_surviving_spouse"
  ) {
    return new Decimal(6000);
  }

  return new Decimal(3000);
}

/**
 * New York IT-270 NYC income tax elimination credit.
 * Spec: spec/state/ny-it270-income-tax-elimination-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import { getNYIT201ResidentConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NYIT270Input {
  /** Federal adjusted gross income from IT-201 line 19 */
  federalAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  numberOfDependents: number;
  /** Supported full-year NYC resident indicator for the IT-201 resident slice */
  isNYCResident: boolean;
  /** IT-201 line 54 NYC tax after nonrefundable credits */
  nycTax: Decimal | string | number;
  /** IT-216 refundable NYC child and dependent care credit */
  nycChildDependentCareCredit?: Decimal | string | number;
  /** IT-215 or IT-209 NYC earned income credit */
  nycEarnedIncomeCredit?: Decimal | string | number;
  /** Investment income under IRC §32(i) / Pub. 596 Worksheet 1 */
  investmentIncome: Decimal | string | number;
  /** Whether NYC or NYS PTET credit is claimed */
  claimsPassThroughEntityTaxCredit?: boolean;
  taxYear: number;
}

export interface NYIT270Result {
  federalAgi: Decimal;
  applicableIncomeThreshold: Decimal;
  excessFederalAgiOverThreshold: Decimal;
  remainingPhaseDownBand: Decimal;
  phaseDownPercentage: Decimal;
  nycTax: Decimal;
  nycChildDependentCareCredit: Decimal;
  nycEarnedIncomeCredit: Decimal;
  otherRefundableNYCCredits: Decimal;
  remainingNYCTaxAfterCredits: Decimal;
  investmentIncome: Decimal;
  isEligible: boolean;
  credit: Decimal;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const FIVE_THOUSAND = new Decimal(5000);

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function roundFour(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(ZERO)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

function validateDependentCount(numberOfDependents: number): number {
  if (!Number.isInteger(numberOfDependents) || numberOfDependents < 0) {
    throw new Error("NY IT-270 number of dependents must be a non-negative integer");
  }

  return numberOfDependents;
}

export function getNYIT270IncomeThreshold(input: {
  filingStatus: FilingStatus;
  numberOfDependents: number;
  taxYear?: number;
}): Decimal {
  const taxYear = input.taxYear ?? 2025;
  const dependentCount = validateDependentCount(input.numberOfDependents);
  if (dependentCount < 1) return ZERO;

  const constants = getNYIT201ResidentConstants(taxYear).it270;

  if (
    input.filingStatus === "married_filing_jointly" ||
    input.filingStatus === "qualifying_surviving_spouse"
  ) {
    const cappedDependents = Math.min(dependentCount, 7);
    return constants.incomeThresholds.mfj_qss[cappedDependents];
  }

  const cappedDependents = Math.min(dependentCount, 8);
  return constants.incomeThresholds.single_mfs_hoh[cappedDependents];
}

export function calculateNYIT270(input: NYIT270Input): NYIT270Result {
  const dependentCount = validateDependentCount(input.numberOfDependents);
  const constants = getNYIT201ResidentConstants(input.taxYear).it270;
  const audit = new AuditTrail();

  const federalAgi = d(input.federalAgi);
  const applicableIncomeThreshold = getNYIT270IncomeThreshold({
    filingStatus: input.filingStatus,
    numberOfDependents: dependentCount,
    taxYear: input.taxYear,
  });
  const excessFederalAgiOverThreshold = federalAgi.lessThanOrEqualTo(applicableIncomeThreshold)
    ? ZERO
    : federalAgi.minus(applicableIncomeThreshold);
  const remainingPhaseDownBand = FIVE_THOUSAND.minus(excessFederalAgiOverThreshold);
  const phaseDownPercentage = remainingPhaseDownBand.lessThanOrEqualTo(ZERO)
    ? ZERO
    : roundFour(remainingPhaseDownBand.dividedBy(FIVE_THOUSAND));

  const nycTax = nonNegativeAmount(input.nycTax, "NY IT-270 line 6 NYC tax");
  const nycChildDependentCareCredit = nonNegativeAmount(
    input.nycChildDependentCareCredit,
    "NY IT-270 line 7 NYC child and dependent care credit"
  );
  const nycEarnedIncomeCredit = nonNegativeAmount(
    input.nycEarnedIncomeCredit,
    "NY IT-270 line 8 NYC earned income credit"
  );
  const otherRefundableNYCCredits = sum(
    nycChildDependentCareCredit,
    nycEarnedIncomeCredit
  );
  const remainingNYCTaxAfterCredits = nycTax.minus(otherRefundableNYCCredits);
  const investmentIncome = nonNegativeAmount(
    input.investmentIncome,
    "NY IT-270 investment income"
  );

  const hasDependentEligibility = dependentCount > 0;
  const hasPositiveNYCTax = nycTax.greaterThan(ZERO);
  const withinIncomeBand = excessFederalAgiOverThreshold.lessThanOrEqualTo(
    constants.maxExcessFederalAgi
  );
  const withinInvestmentIncomeLimit = investmentIncome.lessThanOrEqualTo(
    constants.investmentIncomeLimit
  );
  const noPtetCreditClaimed = !(input.claimsPassThroughEntityTaxCredit ?? false);
  const hasRemainingNYCTax = remainingNYCTaxAfterCredits.greaterThan(ZERO);

  const isEligible =
    input.isNYCResident &&
    hasDependentEligibility &&
    hasPositiveNYCTax &&
    withinIncomeBand &&
    withinInvestmentIncomeLimit &&
    noPtetCreditClaimed &&
    hasRemainingNYCTax;

  const credit = isEligible
    ? cents(remainingNYCTaxAfterCredits.times(phaseDownPercentage))
    : ZERO;

  audit.record("NY-IT270", "A", "Dependent eligibility",
    hasDependentEligibility ? ONE : ZERO,
    "1 if at least one dependent is claimed; otherwise 0", {
      "Number of dependents": dependentCount.toString(),
    });

  audit.record("NY-IT270", "B", "Positive NYC tax eligibility",
    hasPositiveNYCTax ? ONE : ZERO,
    "1 if IT-201 line 54 is greater than 0; otherwise 0", {
      "IT-201 line 54 NYC tax": nycTax.toString(),
    });

  audit.record("NY-IT270", "C", "Income-band eligibility",
    withinIncomeBand ? ONE : ZERO,
    "1 if federal AGI exceeds the applicable threshold by no more than $5,000; otherwise 0", {
      "Federal AGI": federalAgi.toString(),
      "Applicable threshold": applicableIncomeThreshold.toString(),
      "Excess federal AGI over threshold": excessFederalAgiOverThreshold.toString(),
    });

  audit.record("NY-IT270", "D", "Investment income eligibility",
    withinInvestmentIncomeLimit ? ONE : ZERO,
    "1 if investment income is $10,000 or less; otherwise 0", {
      "Investment income": investmentIncome.toString(),
      "Investment income limit": constants.investmentIncomeLimit.toString(),
    });

  audit.record("NY-IT270", "E", "PTET credit eligibility",
    noPtetCreditClaimed ? ONE : ZERO,
    "1 if no NYC or NYS PTET credit is claimed; otherwise 0", {
      "Claims NYC or NYS PTET credit": (input.claimsPassThroughEntityTaxCredit ?? false).toString(),
    });

  audit.record("NY-IT270", "2", "Applicable income threshold",
    applicableIncomeThreshold,
    "2025 IT-270 threshold table based on filing status and dependent count", {
      "Filing status": input.filingStatus,
      "Number of dependents": dependentCount.toString(),
    });

  audit.record("NY-IT270", "3", "Federal AGI above the threshold",
    excessFederalAgiOverThreshold,
    "If federal AGI is less than or equal to line 2 enter 0; otherwise line 1 - line 2", {
      "Federal AGI (line 1)": federalAgi.toString(),
      "Threshold (line 2)": applicableIncomeThreshold.toString(),
    });

  audit.record("NY-IT270", "4", "Remaining phase-down band",
    remainingPhaseDownBand,
    "$5,000 - line 3", {
      "Line 3": excessFederalAgiOverThreshold.toString(),
    });

  audit.record("NY-IT270", "5", "Phase-down percentage",
    phaseDownPercentage,
    "Round to four decimals: line 4 / $5,000", {
      "Line 4": remainingPhaseDownBand.toString(),
    });

  audit.record("NY-IT270", "6", "NYC tax before IT-270",
    nycTax,
    "IT-201 line 54 NYC tax after nonrefundable credits");

  audit.record("NY-IT270", "7", "Refundable NYC child and dependent care credit",
    nycChildDependentCareCredit,
    "IT-216 refundable NYC child and dependent care credit");

  audit.record("NY-IT270", "8", "NYC earned income credit",
    nycEarnedIncomeCredit,
    "IT-215 line 27 or IT-209 line 45");

  audit.record("NY-IT270", "9", "Other refundable NYC credits",
    otherRefundableNYCCredits,
    "Line 7 + line 8", {
      "Line 7": nycChildDependentCareCredit.toString(),
      "Line 8": nycEarnedIncomeCredit.toString(),
    });

  audit.record("NY-IT270", "10", "Remaining NYC tax after refundable NYC credits",
    remainingNYCTaxAfterCredits,
    "Line 6 - line 9", {
      "Line 6": nycTax.toString(),
      "Line 9": otherRefundableNYCCredits.toString(),
    });

  audit.record("NY-IT270", "11", "NYC income tax elimination credit",
    credit,
    "If eligible, round to cents: max(0, line 10) × line 5; otherwise 0", {
      "NYC resident": input.isNYCResident.toString(),
      "Line 5": phaseDownPercentage.toString(),
      "Line 10": remainingNYCTaxAfterCredits.toString(),
      "Eligible": isEligible.toString(),
    });

  return {
    federalAgi,
    applicableIncomeThreshold,
    excessFederalAgiOverThreshold,
    remainingPhaseDownBand,
    phaseDownPercentage,
    nycTax,
    nycChildDependentCareCredit,
    nycEarnedIncomeCredit,
    otherRefundableNYCCredits,
    remainingNYCTaxAfterCredits,
    investmentIncome,
    isEligible,
    credit,
    lines: audit.getLines(),
  };
}

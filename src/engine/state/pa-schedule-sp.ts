/**
 * Pennsylvania Schedule SP — Special Tax Forgiveness
 * Spec: spec/state/pa-schedule-sp.yaml
 *
 * Computes the Tax Forgiveness credit — PA's poverty exemption replacing
 * standard deductions and personal exemptions. Provides 0%–100% reduction
 * of PA-40 tax liability based on eligibility income, filing category,
 * and number of dependents.
 */

import Decimal from "decimal.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface PAScheduleSPConstants {
  /** Base 100% forgiveness threshold for unmarried filers (0 dependents) */
  unmarriedBase: Decimal;
  /** Base 100% forgiveness threshold for married filers (0 dependents) */
  marriedBase: Decimal;
  /** Income increment per dependent added to all thresholds */
  perDependentIncrement: Decimal;
  /** Income step between each 10% forgiveness tier */
  stepIncrement: Decimal;
}

export const PA_SCHEDULE_SP_CONSTANTS: Record<number, PAScheduleSPConstants> = {
  2024: {
    unmarriedBase: new Decimal("6500"),
    marriedBase: new Decimal("13000"),
    perDependentIncrement: new Decimal("9500"),
    stepIncrement: new Decimal("250"),
  },
  2025: {
    unmarriedBase: new Decimal("6500"),
    marriedBase: new Decimal("13000"),
    perDependentIncrement: new Decimal("9500"),
    stepIncrement: new Decimal("250"),
  },
  2026: {
    unmarriedBase: new Decimal("6500"),
    marriedBase: new Decimal("13000"),
    perDependentIncrement: new Decimal("9500"),
    stepIncrement: new Decimal("250"),
  },
};

/** PA filing category for Schedule SP purposes */
export type PAFilingCategory = "unmarried" | "married";

function assertValidDependentCount(dependents: number): void {
  if (!Number.isInteger(dependents) || dependents < 0) {
    throw new Error("PA Schedule SP dependent count must be a whole number of at least 0");
  }
}

// ---------------------------------------------------------------------------
// Input / Output interfaces
// ---------------------------------------------------------------------------

export interface ScheduleSPInput {
  taxYear: number;

  /** Filing category: unmarried (Table 1) or married (Table 2) */
  filingCategory: PAFilingCategory;

  /** Number of dependent children */
  dependents: number;

  /** PA taxable income from PA-40 Line 9 (sum of positive income classes) */
  paTaxableIncome: Decimal;

  /** Schedule SP-includable nontaxable income additions, excluding Social Security and similar exempt retirement benefits */
  nontaxableIncome: Decimal;

  /** Additional eligibility income support, e.g. spouse-only income for married separate filers */
  additionalEligibilityIncome?: Decimal;

  /** PA-40 Line 12 tax liability (to apply forgiveness percentage to) */
  taxLiability: Decimal;

  /** Schedule SP line for tax paid to other states or countries before forgiveness applies */
  taxPaidToOtherStates: Decimal;

  /** Taxpayer is claimed as a dependent on another person's federal return */
  isClaimedAsDependentOnAnotherFederalReturn?: boolean;

  /** The household claiming this taxpayer also qualifies for PA Tax Forgiveness */
  claimingHouseholdQualifiesForTaxForgiveness?: boolean;
}

export interface ScheduleSPResult {
  /** Line A-1: PA taxable income */
  paTaxableIncome: Decimal;
  /** Line A-2: Nontaxable income */
  nontaxableIncome: Decimal;
  /** Additional supported eligibility-income supplement */
  additionalEligibilityIncome: Decimal;
  /** Line A-3: Total eligibility income */
  eligibilityIncome: Decimal;

  /** Filing category used */
  filingCategory: PAFilingCategory;
  /** Number of dependents */
  dependents: number;
  /** Line B-3: 100% forgiveness threshold */
  baseThreshold: Decimal;
  /** Line B-4: Tax forgiveness percentage (0–100) */
  forgivenessPercentage: Decimal;

  /** Line C-1: Tax liability */
  taxLiability: Decimal;
  /** Line C-1a: Tax paid to other states or countries */
  taxPaidToOtherStates: Decimal;
  /** Line C-1b: Tax liability remaining after other-state tax reduction */
  taxLiabilityAfterOtherStateTaxes: Decimal;
  /** Line C-2: Tax forgiveness credit */
  taxForgivenessCredit: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Exported helpers (also used directly in tests)
// ---------------------------------------------------------------------------

/**
 * Compute the base (100% forgiveness) threshold for a given filing category
 * and number of dependents.
 *
 * Formula: base_for_status + (dependents × $9,500)
 */
export function getBaseThreshold(
  filingCategory: PAFilingCategory,
  dependents: number,
  taxYear: number,
): Decimal {
  assertValidDependentCount(dependents);

  const constants = PA_SCHEDULE_SP_CONSTANTS[taxYear];
  if (!constants) {
    throw new Error(`PA Schedule SP constants not available for tax year ${taxYear}`);
  }

  const base = filingCategory === "married"
    ? constants.marriedBase
    : constants.unmarriedBase;

  return base.plus(constants.perDependentIncrement.times(dependents));
}

/**
 * Look up the tax forgiveness percentage based on eligibility income.
 *
 * Returns a whole number 0–100 (the percentage).
 *
 * Tiers (10 steps of 10%, each separated by $250):
 *   ≤ base:          100%
 *   ≤ base + $250:    90%
 *   ≤ base + $500:    80%
 *   ...
 *   ≤ base + $2,250:  10%
 *   > base + $2,250:   0%
 */
export function getForgivenessPercentage(
  eligibilityIncome: Decimal,
  filingCategory: PAFilingCategory,
  dependents: number,
  taxYear: number,
): Decimal {
  const constants = PA_SCHEDULE_SP_CONSTANTS[taxYear];
  if (!constants) {
    throw new Error(`PA Schedule SP constants not available for tax year ${taxYear}`);
  }

  const base = getBaseThreshold(filingCategory, dependents, taxYear);
  const step = constants.stepIncrement;

  // 10 tiers: 100%, 90%, 80%, ..., 10%
  // Tier i covers income ≤ base + (i × step), giving (100 - i×10)%
  // Tier 0: ≤ base → 100%
  // Tier 9: ≤ base + 9×step → 10%
  // Above tier 9: 0%
  for (let i = 0; i < 10; i++) {
    const threshold = base.plus(step.times(i));
    if (eligibilityIncome.lte(threshold)) {
      return new Decimal(100 - i * 10);
    }
  }

  return new Decimal(0);
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleSP(input: ScheduleSPInput): ScheduleSPResult {
  const constants = PA_SCHEDULE_SP_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Schedule SP constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  // -----------------------------------------------------------------------
  // Part A — Eligibility Income
  // -----------------------------------------------------------------------

  // Line A-1: PA taxable income
  audit.record("PA-Schedule-SP", "A-1", "PA taxable income", input.paTaxableIncome,
    "From PA-40 Line 9 (sum of positive income classes)");

  // Line A-2: Nontaxable income additions
  audit.record("PA-Schedule-SP", "A-2", "Nontaxable income additions", input.nontaxableIncome,
    "Tax-exempt interest and other Schedule SP-includable nontaxable income");

  const additionalEligibilityIncome = zeroFloor(input.additionalEligibilityIncome ?? new Decimal(0));

  // Line A-3: Total eligibility income
  const eligibilityIncome = zeroFloor(
    input.paTaxableIncome
      .plus(input.nontaxableIncome)
      .plus(additionalEligibilityIncome),
  );
  audit.record("PA-Schedule-SP", "A-3", "Total eligibility income", eligibilityIncome,
    additionalEligibilityIncome.greaterThan(0)
      ? "Line A-1 + Line A-2 + supported spouse/additional eligibility-income supplement, floor at 0"
      : "Line A-1 + Line A-2, floor at 0");

  // -----------------------------------------------------------------------
  // Part B — Forgiveness Determination
  // -----------------------------------------------------------------------

  // Line B-3: Base threshold
  const baseThreshold = getBaseThreshold(input.filingCategory, input.dependents, input.taxYear);
  audit.record("PA-Schedule-SP", "B-3", "100% forgiveness threshold", baseThreshold,
    `${input.filingCategory} base + ${input.dependents} dependents × $${constants.perDependentIncrement}`);

  // Line B-4: Forgiveness percentage
  const dependentClaimantBlocked = input.isClaimedAsDependentOnAnotherFederalReturn === true
    && input.claimingHouseholdQualifiesForTaxForgiveness !== true;
  const forgivenessPercentage = dependentClaimantBlocked
    ? new Decimal(0)
    : getForgivenessPercentage(
        eligibilityIncome,
        input.filingCategory,
        input.dependents,
        input.taxYear,
      );
  audit.record("PA-Schedule-SP", "B-4", "Tax forgiveness percentage", forgivenessPercentage,
    dependentClaimantBlocked
      ? "Claimed as a dependent on another person's federal return and the claiming household does not qualify for PA Tax Forgiveness"
      : `Eligibility income $${eligibilityIncome} vs threshold table → ${forgivenessPercentage}%`);

  // -----------------------------------------------------------------------
  // Part C — Credit Computation
  // -----------------------------------------------------------------------

  // Line C-1: Tax liability
  audit.record("PA-Schedule-SP", "C-1", "PA-40 tax liability", input.taxLiability,
    "From PA-40 Line 12");

  // Line C-1a: Tax paid to other states or countries
  audit.record(
    "PA-Schedule-SP",
    "C-1a",
    "Tax paid to other states or countries",
    input.taxPaidToOtherStates,
    "From Schedule G-L / other-state tax amounts before forgiveness is applied",
  );

  // Line C-1b: Tax liability remaining after the other-state tax reduction
  const taxLiabilityAfterOtherStateTaxes = zeroFloor(
    input.taxLiability.minus(input.taxPaidToOtherStates),
  );
  audit.record(
    "PA-Schedule-SP",
    "C-1b",
    "Tax eligible for forgiveness",
    taxLiabilityAfterOtherStateTaxes,
    "Line C-1 - Line C-1a, floor at 0",
  );

  // Line C-2: Tax forgiveness credit = remaining tax × forgiveness %
  const forgivenessRate = forgivenessPercentage.div(100);
  const taxForgivenessCredit = roundDollar(taxLiabilityAfterOtherStateTaxes.times(forgivenessRate));
  audit.record("PA-Schedule-SP", "C-2", "Tax forgiveness credit", taxForgivenessCredit,
    `$${taxLiabilityAfterOtherStateTaxes} × ${forgivenessPercentage}% = $${taxForgivenessCredit}`);

  return {
    paTaxableIncome: input.paTaxableIncome,
    nontaxableIncome: input.nontaxableIncome,
    additionalEligibilityIncome,
    eligibilityIncome,
    filingCategory: input.filingCategory,
    dependents: input.dependents,
    baseThreshold,
    forgivenessPercentage,
    taxLiability: input.taxLiability,
    taxPaidToOtherStates: input.taxPaidToOtherStates,
    taxLiabilityAfterOtherStateTaxes,
    taxForgivenessCredit,
    lines: audit.getLines(),
  };
}

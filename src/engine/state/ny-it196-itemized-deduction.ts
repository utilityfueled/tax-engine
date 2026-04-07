/**
 * New York IT-196 Itemized Deductions.
 * Computes the NY itemized deduction from pre-computed category subtotals.
 * Applies Pease limitation (Line 40 worksheet), subtraction/addition
 * adjustments (Lines 41/44), and high-income limitation (Lines 46-47).
 * Spec: spec/state/ny-it196-itemized-deduction.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export interface NYIT196Input {
  /** Federal adjusted gross income (for Pease limitation check) */
  federalAgi: Decimal | string | number;
  /** New York adjusted gross income (IT-201 line 33, for high-income limitation) */
  nyAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  taxYear: number;

  /* ----- Deduction category subtotals (IT-196 line subtotals) ----- */

  /** Line 4: Medical and dental deduction (after 7.5% AGI floor) */
  medicalDeduction?: Decimal | string | number;
  /** Line 9: Total taxes paid (lines 5+6+7+8) — full SALT, no federal cap */
  taxesDeduction?: Decimal | string | number;
  /** Line 15: Total interest paid */
  interestDeduction?: Decimal | string | number;
  /** Line 19: Total gifts to charity */
  charitableDeduction?: Decimal | string | number;
  /** Line 20: Casualty and theft losses */
  casualtyTheftLosses?: Decimal | string | number;
  /** Line 28: Miscellaneous deductions after 2% AGI floor */
  miscDeductions?: Decimal | string | number;
  /** Line 39: Other itemized deductions (gambling, estate tax, bond premium, etc.) */
  otherDeductions?: Decimal | string | number;

  /* ----- Sub-components for Pease limitation exclusion ----- */

  /** Line 14: Investment interest (subset of line 15, excluded from Pease) */
  investmentInterest?: Decimal | string | number;
  /** Line 16a: Qualified contributions (subset of line 19, excluded from Pease) */
  qualifiedContributions?: Decimal | string | number;
  /** Line 29: Gambling losses (subset of line 39, excluded from Pease) */
  gamblingLosses?: Decimal | string | number;
  /** Line 30: Casualty/theft losses of income-producing property (subset of line 39, excluded from Pease) */
  casualtyLossesIncomeProducing?: Decimal | string | number;
  /** Line 37: Federal qualified disaster losses (subset of line 39, excluded from Pease) */
  federalDisasterLosses?: Decimal | string | number;

  /* ----- Subtraction adjustments (line 41) ----- */

  /** Item A: State and local income taxes from line 5 + foreign income taxes from line 8.
   *  These are subtracted because you cannot deduct your own state income taxes
   *  on your state return. */
  stateLocalIncomeTaxSubtraction?: Decimal | string | number;
  /** Items B through F: Other subtraction adjustments (expenses related to
   *  NY-exempt income, bond premium amortization, S-corp deductions, LTC premiums) */
  otherSubtractionAdjustments?: Decimal | string | number;

  /* ----- Addition adjustments (line 44) ----- */

  /** Items H through K: Deductions NY allows but IRC does not */
  additionAdjustments?: Decimal | string | number;

  /* ----- College tuition (line 48) ----- */

  /** College tuition itemized deduction from IT-272 (cannot also claim credit) */
  collegeTuitionItemizedDeduction?: Decimal | string | number;
}

export interface NYIT196Result {
  /** Line 40: Total itemized deductions (after Pease limitation if applicable) */
  totalItemizedDeductions: Decimal;
  /** Whether the Pease limitation was applied */
  peaseLimitationApplied: boolean;
  /** Amount of Pease reduction (zero if not applicable) */
  peaseReduction: Decimal;

  /** Line 41: Subtraction adjustments */
  subtractionAdjustments: Decimal;
  /** Line 42: Line 40 - Line 41 */
  afterSubtractions: Decimal;
  /** Line 44: Addition adjustments */
  additionAdjustments: Decimal;
  /** Line 45: Total before high-income adjustment */
  totalBeforeHighIncomeAdjustment: Decimal;

  /** Line 46: Itemized deduction adjustment for higher income */
  highIncomeAdjustment: Decimal;
  /** Line 47: Itemized deduction after adjustment */
  afterHighIncomeAdjustment: Decimal;

  /** Line 48: College tuition itemized deduction */
  collegeTuitionDeduction: Decimal;
  /** Line 49: Final NY itemized deduction */
  nyItemizedDeduction: Decimal;

  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);
const FIFTY_THOUSAND = new Decimal(50000);

/** Pease limitation thresholds by filing status (2025) */
export const PEASE_THRESHOLDS: Record<number, Record<FilingStatus, Decimal>> = {
  2025: {
    single: new Decimal(340700),
    married_filing_jointly: new Decimal(408850),
    qualifying_surviving_spouse: new Decimal(408850),
    head_of_household: new Decimal(374800),
    married_filing_separately: new Decimal(204400),
  },
};

/** High-income limitation Worksheet 3 thresholds by filing status (2025) */
export const HIGH_INCOME_THRESHOLDS: Record<number, Record<FilingStatus, Decimal>> = {
  2025: {
    single: new Decimal(100000),
    married_filing_jointly: new Decimal(200000),
    qualifying_surviving_spouse: new Decimal(200000),
    head_of_household: new Decimal(150000),
    married_filing_separately: new Decimal(100000),
  },
};

/* ---------- Pease Limitation (Line 40 Worksheet) ---------- */

/**
 * Compute the Pease limitation reduction on total itemized deductions.
 *
 * The Pease limitation reduces deductions by the lesser of:
 *   - 80% of deductions subject to limitation
 *   - 3% of the excess of federal AGI over the threshold
 *
 * Items NOT subject to limitation: medical (line 4), investment interest (14),
 * qualified contributions (16a), casualty losses (20), gambling losses (29),
 * casualty losses income-producing (30), federal disaster losses (37).
 */
export function computePeaseReduction(params: {
  totalDeductions: Decimal;
  excludedDeductions: Decimal;
  federalAgi: Decimal;
  threshold: Decimal;
}): Decimal {
  const { totalDeductions, excludedDeductions, federalAgi, threshold } = params;

  // If AGI is at or below threshold, no Pease limitation
  if (federalAgi.lessThanOrEqualTo(threshold)) return ZERO;

  // Deductions subject to limitation
  const subjectToLimit = zeroFloor(totalDeductions.minus(excludedDeductions));

  // If all deductions are excluded, no reduction
  if (subjectToLimit.lessThanOrEqualTo(ZERO)) return ZERO;

  // 80% of subject-to-limit deductions
  const eightyPctLimit = subjectToLimit.times("0.80");

  // 3% of excess AGI
  const excessAgi = federalAgi.minus(threshold);
  const threePctExcess = excessAgi.times("0.03");

  // Reduction is the smaller of the two
  return roundDollar(min(eightyPctLimit, threePctExcess));
}

/* ---------- High-Income Limitation (Lines 46-47) ---------- */

/**
 * Compute the high-income adjustment (IT-196 line 46).
 * Worksheet 3: NYAGI $100K-$475K (gradual phase-in of 25% reduction)
 * Worksheet 4: NYAGI $475K-$525K (transition from 25% to 50% reduction)
 * $525K-$1M: flat 50% of line 45
 * $1M+: line 46 blank (line 47 handled separately)
 */
export function computeHighIncomeAdjustment(params: {
  nyAgi: Decimal;
  totalBeforeAdjustment: Decimal;
  filingStatus: FilingStatus;
  taxYear: number;
}): Decimal {
  const { nyAgi, totalBeforeAdjustment, filingStatus, taxYear } = params;

  const thresholds = HIGH_INCOME_THRESHOLDS[taxYear];
  if (!thresholds) {
    throw new Error(`NY high-income limitation thresholds not available for tax year ${taxYear}`);
  }
  const threshold = thresholds[filingStatus];

  // ≤ $100K: no adjustment
  if (nyAgi.lessThanOrEqualTo(new Decimal(100000))) return ZERO;

  // > $1M: blank (line 47 handles directly)
  if (nyAgi.greaterThan(new Decimal(1000000))) return ZERO;

  // $525,001 - $1,000,000: 50% of line 45
  if (nyAgi.greaterThan(new Decimal(525000))) {
    return roundDollar(totalBeforeAdjustment.times("0.50"));
  }

  // $475,001 - $525,000: Worksheet 4
  if (nyAgi.greaterThan(new Decimal(475000))) {
    return computeWorksheet4(nyAgi, totalBeforeAdjustment);
  }

  // $100,001 - $475,000: Worksheet 3
  return computeWorksheet3(nyAgi, totalBeforeAdjustment, threshold);
}

/**
 * Worksheet 3: Gradual phase-in of 25% limitation.
 * NYAGI range: from filing-status threshold up to $475,000.
 *
 * 1. excess = NYAGI - threshold (if threshold > NYAGI, no adjustment)
 * 2. capped_excess = min(excess, $50,000)
 * 3. ratio = capped_excess / $50,000
 * 4. base_25pct = 25% of line 45
 * 5. adjustment = ratio × base_25pct
 */
function computeWorksheet3(
  nyAgi: Decimal,
  totalBeforeAdjustment: Decimal,
  threshold: Decimal,
): Decimal {
  const excess = nyAgi.minus(threshold);
  if (excess.lessThanOrEqualTo(ZERO)) return ZERO;

  const cappedExcess = min(excess, FIFTY_THOUSAND);
  const ratio = cappedExcess.dividedBy(FIFTY_THOUSAND).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const base25pct = totalBeforeAdjustment.times("0.25");
  return roundDollar(ratio.times(base25pct));
}

/**
 * Worksheet 4: Transition from 25% to 50% limitation.
 * NYAGI range: $475,001 - $525,000.
 *
 * 1. excess = NYAGI - $475,000 (max $50,000)
 * 2. ratio = excess / $50,000
 * 3. base_25pct = 25% of line 45
 * 4. incremental = ratio × base_25pct
 * 5. adjustment = base_25pct + incremental
 */
function computeWorksheet4(
  nyAgi: Decimal,
  totalBeforeAdjustment: Decimal,
): Decimal {
  const excess = min(nyAgi.minus(new Decimal(475000)), FIFTY_THOUSAND);
  const ratio = excess.dividedBy(FIFTY_THOUSAND).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const base25pct = totalBeforeAdjustment.times("0.25");
  const incremental = ratio.times(base25pct);
  return roundDollar(base25pct.plus(incremental));
}

/**
 * Compute line 47: itemized deduction after high-income adjustment.
 * For NYAGI > $1M, this bypasses line 46 entirely and uses charitable gifts.
 */
export function computeLine47(params: {
  nyAgi: Decimal;
  totalBeforeAdjustment: Decimal;
  highIncomeAdjustment: Decimal;
  charitableDeduction: Decimal;
}): Decimal {
  const { nyAgi, totalBeforeAdjustment, highIncomeAdjustment, charitableDeduction } = params;

  // $10M+: 25% of charitable contributions
  if (nyAgi.greaterThan(new Decimal(10000000))) {
    return roundDollar(charitableDeduction.times("0.25"));
  }

  // $1M - $10M: 50% of charitable contributions
  if (nyAgi.greaterThan(new Decimal(1000000))) {
    return roundDollar(charitableDeduction.times("0.50"));
  }

  // $100K - $1M: line 45 - line 46
  if (nyAgi.greaterThan(new Decimal(100000))) {
    return zeroFloor(totalBeforeAdjustment.minus(highIncomeAdjustment));
  }

  // ≤ $100K: line 45
  return totalBeforeAdjustment;
}

/* ---------- Subtraction Adjustment with Pease Proration (Worksheet 2) ---------- */

/**
 * Compute subtraction adjustments (line 41).
 *
 * If the Pease limitation was NOT applied (AGI ≤ threshold), the subtraction
 * is the full sum of items A through F.
 *
 * If the Pease limitation WAS applied (AGI > threshold), Worksheet 2 prorates
 * the subtraction by the Pease reduction ratio to avoid double-counting.
 *
 * Worksheet 2 simplified:
 *   peaseReduction (line 9 of Line 40 worksheet)
 *   subjectToLimit (line 3 of Line 40 worksheet)
 *   ratio = peaseReduction / subjectToLimit
 *   For item A (state taxes): reduced by ratio
 *   Items B-C (included in Pease-limited categories): reduced by ratio
 *   Items D, E (not in Pease-limited categories): NOT reduced
 *   Item F (LTC premiums): NOT reduced (separate worksheet)
 *   Result = (itemA + itemsBC) × (1 - ratio) + itemsDEF
 */
export function computeSubtractionAdjustments(params: {
  stateLocalIncomeTaxSubtraction: Decimal;
  otherSubtractionAdjustments: Decimal;
  peaseLimitationApplied: boolean;
  peaseReduction: Decimal;
  subjectToLimitDeductions: Decimal;
}): Decimal {
  const {
    stateLocalIncomeTaxSubtraction,
    otherSubtractionAdjustments,
    peaseLimitationApplied,
    peaseReduction,
    subjectToLimitDeductions,
  } = params;

  const totalSubtractions = stateLocalIncomeTaxSubtraction.plus(otherSubtractionAdjustments);

  if (!peaseLimitationApplied || peaseReduction.isZero() || subjectToLimitDeductions.isZero()) {
    return totalSubtractions;
  }

  // Prorate: the subtraction items that were part of deductions subject to
  // the Pease limitation are reduced proportionally.
  // Simplified: state/local taxes are always in the Pease-limited pool.
  // ratio = peaseReduction / subjectToLimitDeductions
  const ratio = peaseReduction.dividedBy(subjectToLimitDeductions)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  // State tax subtraction is reduced by the ratio (Worksheet 2 step)
  const reducedStateTax = roundDollar(
    stateLocalIncomeTaxSubtraction.times(new Decimal(1).minus(ratio))
  );

  // Other subtractions are passed through (items D, E, F not prorated)
  return reducedStateTax.plus(otherSubtractionAdjustments);
}

/* ---------- Main Computation ---------- */

export function calculateNYIT196(input: NYIT196Input): NYIT196Result {
  const audit = new AuditTrail();

  const federalAgi = d(input.federalAgi);
  const nyAgi = d(input.nyAgi);

  // Category subtotals
  const medicalDeduction = d(input.medicalDeduction);
  const taxesDeduction = d(input.taxesDeduction);
  const interestDeduction = d(input.interestDeduction);
  const charitableDeduction = d(input.charitableDeduction);
  const casualtyTheftLosses = d(input.casualtyTheftLosses);
  const miscDeductions = d(input.miscDeductions);
  const otherDeductions = d(input.otherDeductions);

  // Pease-excluded sub-components
  const investmentInterest = d(input.investmentInterest);
  const qualifiedContributions = d(input.qualifiedContributions);
  const gamblingLosses = d(input.gamblingLosses);
  const casualtyLossesIncomeProducing = d(input.casualtyLossesIncomeProducing);
  const federalDisasterLosses = d(input.federalDisasterLosses);

  // ========== Line 40: Total itemized deductions ==========

  // Total of all categories (Worksheet line 1)
  const totalBeforePease = sum(
    medicalDeduction,
    taxesDeduction,
    interestDeduction,
    charitableDeduction,
    casualtyTheftLosses,
    miscDeductions,
    otherDeductions,
  );

  // Items excluded from Pease limitation (Worksheet line 2)
  const excludedFromPease = sum(
    medicalDeduction,       // line 4
    investmentInterest,     // line 14
    qualifiedContributions, // line 16a
    casualtyTheftLosses,    // line 20
    gamblingLosses,         // line 29
    casualtyLossesIncomeProducing, // line 30
    federalDisasterLosses,  // line 37
  );

  // Subject to limitation (Worksheet line 3)
  const subjectToLimit = zeroFloor(totalBeforePease.minus(excludedFromPease));

  // Get Pease threshold
  const peaseThresholds = PEASE_THRESHOLDS[input.taxYear];
  if (!peaseThresholds) {
    throw new Error(`NY Pease limitation thresholds not available for tax year ${input.taxYear}`);
  }
  const peaseThreshold = peaseThresholds[input.filingStatus];

  const peaseReduction = computePeaseReduction({
    totalDeductions: totalBeforePease,
    excludedDeductions: excludedFromPease,
    federalAgi,
    threshold: peaseThreshold,
  });
  const peaseLimitationApplied = peaseReduction.greaterThan(ZERO);

  const totalItemizedDeductions = totalBeforePease.minus(peaseReduction);

  audit.record("NY-IT196", "40", "Total itemized deductions", totalItemizedDeductions,
    peaseLimitationApplied
      ? "Total deductions minus Pease reduction"
      : "Sum of lines 4, 9, 15, 19, 20, 28, 39 (no Pease limitation)", {
      "Total before Pease": totalBeforePease.toString(),
      "Pease reduction": peaseReduction.toString(),
      "Federal AGI": federalAgi.toString(),
      "Pease threshold": peaseThreshold.toString(),
    });

  // ========== Line 41: Subtraction adjustments ==========

  const stateLocalIncomeTaxSubtraction = d(input.stateLocalIncomeTaxSubtraction);
  const otherSubtractionAdj = d(input.otherSubtractionAdjustments);

  const subtractionAdjustments = computeSubtractionAdjustments({
    stateLocalIncomeTaxSubtraction,
    otherSubtractionAdjustments: otherSubtractionAdj,
    peaseLimitationApplied,
    peaseReduction,
    subjectToLimitDeductions: subjectToLimit,
  });

  audit.record("NY-IT196", "41", "Subtraction adjustments", subtractionAdjustments,
    peaseLimitationApplied
      ? "Prorated by Pease ratio (Worksheet 2)"
      : "Sum of subtraction items A through F", {
      "State/local income tax subtraction (item A)": stateLocalIncomeTaxSubtraction.toString(),
      "Other subtractions (items B-F)": otherSubtractionAdj.toString(),
      "Pease prorated": peaseLimitationApplied.toString(),
    });

  // ========== Line 42: After subtractions ==========

  const afterSubtractions = zeroFloor(totalItemizedDeductions.minus(subtractionAdjustments));
  audit.record("NY-IT196", "42", "Line 40 minus line 41", afterSubtractions,
    "Line 40 - Line 41");

  // ========== Line 44: Addition adjustments ==========

  const additionAdj = d(input.additionAdjustments);
  audit.record("NY-IT196", "44", "Addition adjustments", additionAdj,
    "Items H, I, J, K: deductions NY allows but IRC does not");

  // ========== Line 45: Total before high-income adjustment ==========
  // Line 43 is for IT-203 filers only (college tuition), blank for IT-201

  const totalBeforeHighIncomeAdjustment = afterSubtractions.plus(additionAdj);
  audit.record("NY-IT196", "45", "Total before high-income adjustment",
    totalBeforeHighIncomeAdjustment,
    "Line 42 + Line 44 (Line 43 blank for IT-201 filers)");

  // ========== Line 46: High-income adjustment ==========

  const highIncomeAdjustment = computeHighIncomeAdjustment({
    nyAgi,
    totalBeforeAdjustment: totalBeforeHighIncomeAdjustment,
    filingStatus: input.filingStatus,
    taxYear: input.taxYear,
  });

  audit.record("NY-IT196", "46", "Itemized deduction adjustment", highIncomeAdjustment,
    "High-income limitation based on NY AGI", {
      "NY AGI": nyAgi.toString(),
    });

  // ========== Line 47: After high-income adjustment ==========

  const afterHighIncomeAdjustment = computeLine47({
    nyAgi,
    totalBeforeAdjustment: totalBeforeHighIncomeAdjustment,
    highIncomeAdjustment,
    charitableDeduction,
  });

  audit.record("NY-IT196", "47", "Itemized deduction after adjustment",
    afterHighIncomeAdjustment,
    nyAgi.greaterThan(new Decimal(10000000))
      ? "25% of charitable gifts (NYAGI > $10M)"
      : nyAgi.greaterThan(new Decimal(1000000))
        ? "50% of charitable gifts (NYAGI > $1M)"
        : nyAgi.greaterThan(new Decimal(100000))
          ? "Line 45 - Line 46"
          : "Line 45 (no high-income limitation)", {
      "NY AGI": nyAgi.toString(),
      "Charitable deduction": charitableDeduction.toString(),
    });

  // ========== Line 48: College tuition itemized deduction ==========

  const collegeTuitionDeduction = d(input.collegeTuitionItemizedDeduction);
  audit.record("NY-IT196", "48", "College tuition itemized deduction",
    collegeTuitionDeduction,
    "From Form IT-272 (if electing deduction over credit)");

  // ========== Line 49: Final NY itemized deduction ==========

  const nyItemizedDeduction = afterHighIncomeAdjustment.plus(collegeTuitionDeduction);
  audit.record("NY-IT196", "49", "New York itemized deduction", nyItemizedDeduction,
    "Line 47 + Line 48", {
      "After adjustment (line 47)": afterHighIncomeAdjustment.toString(),
      "College tuition (line 48)": collegeTuitionDeduction.toString(),
    });

  return {
    totalItemizedDeductions,
    peaseLimitationApplied,
    peaseReduction,
    subtractionAdjustments,
    afterSubtractions,
    additionAdjustments: additionAdj,
    totalBeforeHighIncomeAdjustment,
    highIncomeAdjustment,
    afterHighIncomeAdjustment,
    collegeTuitionDeduction,
    nyItemizedDeduction,
    lines: audit.getLines(),
  };
}

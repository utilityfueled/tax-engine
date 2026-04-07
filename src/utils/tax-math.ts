/**
 * Core tax math functions used across multiple forms and schedules.
 */

import Decimal from "decimal.js";
import type { TaxBracket, FilingStatus, YearConstants } from "@/models/constants.js";
import { d, zeroFloor, min, roundDollar } from "./decimal.js";

/**
 * Calculate progressive tax from brackets.
 * Spec: Used by Form 1040 Line 16, Schedule D Tax Worksheet, QDCG Worksheet
 */
export function calculateTaxFromBrackets(
  taxableIncome: Decimal,
  brackets: TaxBracket[]
): Decimal {
  let tax = new Decimal(0);
  for (const bracket of brackets) {
    if (taxableIncome.lessThanOrEqualTo(bracket.min)) break;
    const upper = bracket.max ? min(taxableIncome, bracket.max) : taxableIncome;
    const taxableInBracket = upper.minus(bracket.min);
    tax = tax.plus(taxableInBracket.times(bracket.rate));
  }
  return roundDollar(tax);
}

/**
 * Calculate capital gains tax using preferential rates (0%/15%/20%).
 * Uses the "stacking" method where gains are stacked on top of ordinary income.
 * Spec: QDCG Worksheet (Qualified Dividends and Capital Gain Tax Worksheet)
 */
export interface CapitalGainsTaxOptions {
  /** Unrecaptured §1250 gain (from depreciation on real property), taxed at max 25% */
  section1250Gain?: Decimal;
  /** Collectibles gain (art, coins, etc.), taxed at max 28% */
  collectiblesGain?: Decimal;
}

export function calculateCapitalGainsTax(
  ordinaryTaxableIncome: Decimal,
  qualifiedDividends: Decimal,
  netLongTermCapitalGain: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants,
  options?: CapitalGainsTaxOptions
): { tax: Decimal; ordinaryTax: Decimal; preferentialTax: Decimal } {
  const section1250 = options?.section1250Gain ?? new Decimal(0);
  const collectibles = options?.collectiblesGain ?? new Decimal(0);

  // Total preferential = qualified dividends + LTCG (which already includes §1250 and collectibles)
  const preferentialIncome = qualifiedDividends.plus(netLongTermCapitalGain);
  if (preferentialIncome.lessThanOrEqualTo(0)) {
    const ordinaryTax = calculateTaxFromBrackets(
      ordinaryTaxableIncome,
      constants.taxBrackets[filingStatus]
    );
    return { tax: ordinaryTax, ordinaryTax, preferentialTax: new Decimal(0) };
  }

  // Ordinary income portion (total taxable minus preferential)
  const ordinaryPortion = zeroFloor(ordinaryTaxableIncome.minus(preferentialIncome));
  const ordinaryTax = calculateTaxFromBrackets(
    ordinaryPortion,
    constants.taxBrackets[filingStatus]
  );

  // Cap effective preferential at taxable income (QDCG Worksheet Line 10).
  // When deductions consume part of the preferential income (qual divs + LTCG > taxable),
  // only the remaining taxable amount enters the rate computation.
  // effectivePreferential = taxableIncome - ordinaryPortion = min(preferentialIncome, taxableIncome)
  const effectivePreferential = ordinaryTaxableIncome.minus(ordinaryPortion);

  let preferentialTax = new Decimal(0);

  // ── Per IRS Schedule D Tax Worksheet (Lines 11-31) and IRC §1(h)(1): ──
  // Stack ALL preferential income (including §1250 and collectibles) for 0%/15%
  // first. The 25% (§1250) and 28% (collectibles) are MAXIMUM rates — gains
  // that fall within the 0% or 15% brackets get the lower rate.
  // Only gains that remain above the 15% threshold get 28%/25%/20% treatment.
  const zeroThreshold = constants.capitalGainsRates.zero.threshold[filingStatus];
  const fifteenThreshold = constants.capitalGainsRates.fifteen.threshold[filingStatus];

  let remainingPreferential = effectivePreferential;
  let currentStack = ordinaryPortion;

  // 0% rate portion (Schedule D Tax Worksheet Lines 11-14)
  if (currentStack.lessThan(zeroThreshold)) {
    const roomAtZero = zeroThreshold.minus(currentStack);
    const taxedAtZero = min(remainingPreferential, roomAtZero);
    // 0% rate — no tax added
    remainingPreferential = remainingPreferential.minus(taxedAtZero);
    currentStack = currentStack.plus(taxedAtZero);
  }

  // 15% rate portion (Schedule D Tax Worksheet Lines 16-20)
  if (remainingPreferential.greaterThan(0) && currentStack.lessThan(fifteenThreshold)) {
    const roomAtFifteen = fifteenThreshold.minus(currentStack);
    const taxedAtFifteen = min(remainingPreferential, roomAtFifteen);
    preferentialTax = preferentialTax.plus(taxedAtFifteen.times(d(0.15)));
    remainingPreferential = remainingPreferential.minus(taxedAtFifteen);
  }

  // Above 15% threshold: allocate to 28%, then 25%, then 20%
  // Per Schedule D Tax Worksheet Lines 22-31:
  //   Line 24: 28% rate gain (collectibles) — from top of stack
  //   Line 28: 25% rate gain (§1250) — next
  //   Line 30: 20% — remainder
  if (remainingPreferential.greaterThan(0)) {
    // 28% rate gain (collectibles) — capped at remaining and actual collectibles
    const collectiblesPortion = min(collectibles, remainingPreferential);
    if (collectiblesPortion.greaterThan(0)) {
      preferentialTax = preferentialTax.plus(collectiblesPortion.times(d(0.28)));
      remainingPreferential = remainingPreferential.minus(collectiblesPortion);
    }

    // 25% rate gain (§1250) — capped at remaining and actual §1250
    const section1250Portion = min(section1250, remainingPreferential);
    if (section1250Portion.greaterThan(0)) {
      preferentialTax = preferentialTax.plus(section1250Portion.times(d(0.25)));
      remainingPreferential = remainingPreferential.minus(section1250Portion);
    }

    // 20% rate (remainder)
    if (remainingPreferential.greaterThan(0)) {
      preferentialTax = preferentialTax.plus(remainingPreferential.times(d(0.20)));
    }
  }

  preferentialTax = roundDollar(preferentialTax);

  // Lesser-of check (QDCG Worksheet Line 25-26 / Schedule D Tax Worksheet Line 40-41)
  // Per IRC §1(h)(1), the preferential rate computation "shall not exceed" the regular tax.
  // This matters when §1250 (25%) or collectibles (28%) rates exceed the taxpayer's
  // marginal ordinary rate at low income levels.
  const qdcgTax = ordinaryTax.plus(preferentialTax);
  const allOrdinaryTax = calculateTaxFromBrackets(
    ordinaryTaxableIncome,
    constants.taxBrackets[filingStatus]
  );

  if (allOrdinaryTax.lessThan(qdcgTax)) {
    return {
      tax: allOrdinaryTax,
      ordinaryTax: allOrdinaryTax,
      preferentialTax: new Decimal(0),
    };
  }

  return {
    tax: qdcgTax,
    ordinaryTax,
    preferentialTax,
  };
}

/**
 * Calculate self-employment tax (Schedule SE).
 * Spec: Schedule SE Lines 4-12
 */
export function calculateSelfEmploymentTax(
  netSEEarnings: Decimal,
  w2SocialSecurityWages: Decimal,
  constants: YearConstants
): { tax: Decimal; deductibleHalf: Decimal; socialSecurityPortion: Decimal; medicarePortion: Decimal } {
  const se = constants.selfEmploymentTax;
  const taxableEarnings = roundDollar(netSEEarnings.times(se.earningsMultiplier));

  // IRC §1402(b)(2): SE tax only applies when post-multiplier earnings ≥ $400
  if (taxableEarnings.lt(new Decimal(400))) {
    return {
      tax: new Decimal(0),
      deductibleHalf: new Decimal(0),
      socialSecurityPortion: new Decimal(0),
      medicarePortion: new Decimal(0),
    };
  }

  // Social Security portion (capped at wage base minus W-2 wages)
  const ssRemaining = zeroFloor(se.socialSecurityWageBase.minus(w2SocialSecurityWages));
  const ssTaxable = min(taxableEarnings, ssRemaining);
  const socialSecurityPortion = roundDollar(ssTaxable.times(se.socialSecurityRate));

  // Medicare portion (no cap)
  const medicarePortion = roundDollar(taxableEarnings.times(se.medicareRate));

  const tax = socialSecurityPortion.plus(medicarePortion);
  const deductibleHalf = roundDollar(tax.times(se.deductiblePortion));

  return { tax, deductibleHalf, socialSecurityPortion, medicarePortion };
}

/**
 * Calculate Net Investment Income Tax (Form 8960).
 * Spec: Form 8960 Lines 1-17
 */
export function calculateNIIT(
  investmentIncome: Decimal,
  magi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): Decimal {
  const threshold = constants.niit.threshold[filingStatus];
  const excess = zeroFloor(magi.minus(threshold));
  if (excess.isZero()) return new Decimal(0);
  const taxableBase = min(investmentIncome, excess);
  return roundDollar(taxableBase.times(constants.niit.rate));
}

/**
 * Calculate Additional Medicare Tax (Form 8959).
 * Spec: Form 8959 Lines 1-18
 */
export function calculateAdditionalMedicareTax(
  totalMedicareWages: Decimal,
  selfEmploymentEarnings: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): Decimal {
  const threshold = constants.additionalMedicareTax.threshold[filingStatus];
  const totalEarnings = totalMedicareWages.plus(selfEmploymentEarnings);
  const excess = zeroFloor(totalEarnings.minus(threshold));
  return roundDollar(excess.times(constants.additionalMedicareTax.rate));
}

/**
 * Calculate Child Tax Credit.
 * Spec: CTC Worksheet in Form 1040 Instructions
 */
export interface ChildTaxCreditResult {
  ctc: Decimal;         // Child Tax Credit (qualifying children under 17)
  odc: Decimal;         // Other Dependent Credit ($500/dependent)
  total: Decimal;       // Combined CTC + ODC after phase-out
}

export function calculateChildTaxCredit(
  qualifyingChildren: number,
  otherDependents: number,
  agi: Decimal,
  filingStatus: FilingStatus,
  constants: YearConstants
): ChildTaxCreditResult {
  const ctc = constants.childTaxCredit;
  const maxCTC = ctc.perChild.times(qualifyingChildren);
  const maxODC = ctc.otherDependentCredit.times(otherDependents);
  const maxTotal = maxCTC.plus(maxODC);
  if (maxTotal.isZero()) return { ctc: new Decimal(0), odc: new Decimal(0), total: new Decimal(0) };

  const threshold = ctc.phaseOutThreshold[filingStatus];
  const excess = zeroFloor(agi.minus(threshold));
  // Round up to next $1000
  const thousandsOver = excess.dividedBy(1000).ceil();
  const reduction = thousandsOver.times(ctc.phaseOutRate);

  const totalCredit = zeroFloor(maxTotal.minus(reduction));
  // Phase-out reduces CTC first, then ODC
  const ctcAfterPhaseout = zeroFloor(maxCTC.minus(reduction));
  const remainingReduction = zeroFloor(reduction.minus(maxCTC));
  const odcAfterPhaseout = zeroFloor(maxODC.minus(remainingReduction));

  return {
    ctc: ctcAfterPhaseout,
    odc: odcAfterPhaseout,
    total: totalCredit,
  };
}

/**
 * Calculate deductible mortgage interest (limited by debt cap).
 * Spec: Schedule A Line 8a, Pub 936
 *
 * Pre-12/15/2017 mortgages: $1,000,000 limit ($500,000 MFS)
 * Post-12/15/2017 mortgages: $750,000 limit ($375,000 MFS) — IRC §163(h)(3)(B)(ii)
 */
const GRANDFATHERED_DEBT_LIMIT = new Decimal(1000000);
const TCJA_CUTOFF = "2017-12-15";

export function calculateDeductibleMortgageInterest(
  interestPaid: Decimal,
  outstandingPrincipal: Decimal,
  constants: YearConstants,
  originationDate?: string,
  filingStatus?: FilingStatus
): Decimal {
  const isGrandfathered = originationDate !== undefined && originationDate < TCJA_CUTOFF;
  const baseLimit = isGrandfathered ? GRANDFATHERED_DEBT_LIMIT : constants.mortgageInterest.debtLimit;
  // MFS filers get half the debt limit per IRC §163(h)(3)(B)(ii)
  const limit = filingStatus === "married_filing_separately" ? baseLimit.dividedBy(2) : baseLimit;
  if (outstandingPrincipal.lessThanOrEqualTo(limit)) return interestPaid;
  const ratio = limit.dividedBy(outstandingPrincipal);
  return roundDollar(interestPaid.times(ratio));
}

/**
 * Calculate SALT deduction (capped).
 * Spec: Schedule A Line 5d
 */
export function calculateSALTDeduction(
  stateLocalTaxes: Decimal,
  propertyTaxes: Decimal,
  constants: YearConstants
): Decimal {
  const total = stateLocalTaxes.plus(propertyTaxes);
  return min(total, constants.saltCap);
}

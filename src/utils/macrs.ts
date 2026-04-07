/**
 * MACRS depreciation computation per IRS Publication 946.
 *
 * Supports GDS 200% DB, GDS 150% DB, and straight-line methods with
 * half-year, mid-quarter, and mid-month conventions for recovery periods
 * 3–39 years.
 *
 * Mid-quarter convention (IRC §168(d)(3)): Required when more than 40%
 * of the aggregate basis of all depreciable personal property placed in
 * service during the tax year is placed in service during the last 3
 * months of the tax year. When triggered, ALL personal property placed
 * in service that year uses mid-quarter instead of half-year.
 *
 * Reference: https://www.irs.gov/publications/p946
 */

import Decimal from "decimal.js";
import type { DepreciableAsset } from "@/models/inputs.js";
import {
  MACRS_GDS_200DB_HALF_YEAR,
  MACRS_GDS_150DB_HALF_YEAR,
  MACRS_GDS_SL_HALF_YEAR,
  MACRS_GDS_200DB_MID_QUARTER,
  MACRS_GDS_150DB_MID_QUARTER,
  MACRS_GDS_SL_MID_QUARTER,
  MACRS_RESIDENTIAL_RENTAL_MID_MONTH,
  MACRS_NONRESIDENTIAL_REAL_MID_MONTH,
  SECTION_280F_LIMITS,
  SECTION_280F_ADS_RECOVERY_PERIOD,
  type MACRSMethod,
  type MACRSConvention,
} from "@/models/constants.js";
import { d, roundDollar } from "@/utils/decimal.js";

const ZERO = new Decimal(0);

export interface AssetDepreciationResult {
  description: string;
  costBasis: Decimal;
  recoveryPeriod: number;
  method: MACRSMethod;
  convention: MACRSConvention;
  placedInServiceYear: number;
  placedInServiceMonth: number;
  recoveryYear: number;
  percentage: Decimal;
  depreciation: Decimal;
  /** true when the asset is beyond its recovery period */
  fullyDepreciated: boolean;
}

/**
 * Compute the current-year MACRS depreciation for a single asset.
 *
 * @param asset - The depreciable asset input
 * @param taxYear - The current tax year
 * @param conventionOverride - When the mid-quarter test triggers, pass
 *   "midQuarter" to override the default half-year convention for
 *   current-year personal property assets.
 * @returns The depreciation result, or null if the asset is fully depreciated
 */
export function computeAssetDepreciation(
  asset: DepreciableAsset,
  taxYear: number,
  conventionOverride?: MACRSConvention,
): AssetDepreciationResult | null {
  const costBasis = d(asset.costBasis);
  if (costBasis.lessThanOrEqualTo(ZERO)) return null;

  const recoveryPeriod = parseFloat(asset.recoveryPeriod);
  const pisYear = parseInt(asset.placedInServiceDate.substring(0, 4), 10);
  const pisMonth = parseInt(asset.placedInServiceDate.substring(5, 7), 10);

  // Recovery year: year 1 = placed-in-service year
  const recoveryYear = taxYear - pisYear + 1;
  if (recoveryYear < 1) return null;

  const isRealProperty = recoveryPeriod === 27.5 || recoveryPeriod === 39;
  const method = resolveMethod(asset.method, recoveryPeriod);

  // Convention resolution: explicit asset override > aggregate override > default
  let convention: MACRSConvention;
  if (asset.convention) {
    convention = asset.convention as MACRSConvention;
  } else if (conventionOverride && !isRealProperty) {
    convention = conventionOverride;
  } else {
    convention = resolveConvention(undefined, isRealProperty);
  }

  const table = getPercentageTable(recoveryPeriod, method, convention, pisMonth);
  if (!table) return null;

  // Check if beyond recovery period
  const maxYears = table.length;
  if (recoveryYear > maxYears) {
    return {
      description: asset.description ?? "",
      costBasis,
      recoveryPeriod,
      method,
      convention,
      placedInServiceYear: pisYear,
      placedInServiceMonth: pisMonth,
      recoveryYear,
      percentage: ZERO,
      depreciation: ZERO,
      fullyDepreciated: true,
    };
  }

  const percentage = table[recoveryYear - 1];
  let depreciation = roundDollar(costBasis.times(percentage).dividedBy(100));

  if (asset.disposedDuringYear && !isRealProperty && recoveryYear <= maxYears) {
    // Disposal year: half the table percentage for half-year convention,
    // or the applicable quarter fraction for mid-quarter convention.
    if (convention === "midQuarter") {
      // Mid-quarter disposal: deduction for the quarter fraction of the year
      // the asset was disposed. Since we don't track disposal quarter,
      // use the same halving rule as a reasonable approximation.
      depreciation = roundDollar(depreciation.dividedBy(2));
    } else {
      depreciation = roundDollar(depreciation.dividedBy(2));
    }
  }

  return {
    description: asset.description ?? "",
    costBasis,
    recoveryPeriod,
    method,
    convention,
    placedInServiceYear: pisYear,
    placedInServiceMonth: pisMonth,
    recoveryYear,
    percentage,
    depreciation,
    fullyDepreciated: false,
  };
}

/**
 * Compute depreciation for an array of assets and aggregate by Form 4562 line.
 *
 * Automatically applies the mid-quarter convention test per IRC §168(d)(3):
 * if more than 40% of current-year personal property basis is placed in
 * service during Q4 (months 10–12), all current-year personal property
 * switches from half-year to mid-quarter convention.
 */
export interface AggregatedDepreciation {
  /** Line 17: MACRS depreciation for assets placed in service before the current year */
  priorYearAssets: Decimal;
  /** Line 19: Current-year GDS depreciation (200DB or 150DB) */
  currentYearGds: Decimal;
  /** Line 20: Current-year ADS depreciation (SL) for personal property */
  currentYearAds: Decimal;
  /** Individual asset results for audit trail */
  assetResults: AssetDepreciationResult[];
  /** Whether mid-quarter convention was triggered for current-year assets */
  midQuarterRequired: boolean;
  /** Part V: Listed property depreciation for Line 21 */
  listedProperty: ListedPropertyAggregation;
}

export function computeAggregateDepreciation(
  assets: DepreciableAsset[],
  taxYear: number,
): AggregatedDepreciation {
  // --- Step 1: Mid-quarter test on current-year personal property ---
  // The mid-quarter test considers ALL personal property including listed property
  const midQuarterRequired = isMidQuarterRequired(assets, taxYear);
  const conventionOverride: MACRSConvention | undefined =
    midQuarterRequired ? "midQuarter" : undefined;

  // --- Step 2: Compute per-asset depreciation (non-listed property only) ---
  let priorYearAssets = ZERO;
  let currentYearGds = ZERO;
  let currentYearAds = ZERO;
  const assetResults: AssetDepreciationResult[] = [];

  for (const asset of assets) {
    // Listed property goes to Part V (Line 21), not Lines 17/19/20
    if (asset.isListedProperty) continue;

    const pisYear = parseInt(asset.placedInServiceDate.substring(0, 4), 10);
    const isCurrentYear = pisYear === taxYear;

    // Only apply the convention override to current-year assets
    const result = computeAssetDepreciation(
      asset,
      taxYear,
      isCurrentYear ? conventionOverride : undefined,
    );
    if (!result || result.depreciation.isZero()) continue;

    assetResults.push(result);

    const isRealProperty = result.recoveryPeriod === 27.5 || result.recoveryPeriod === 39;

    if (!isCurrentYear) {
      priorYearAssets = priorYearAssets.plus(result.depreciation);
    } else if (isRealProperty || result.method === "SL") {
      currentYearAds = currentYearAds.plus(result.depreciation);
    } else {
      currentYearGds = currentYearGds.plus(result.depreciation);
    }
  }

  // --- Step 3: Compute listed property depreciation for Line 21 ---
  const listedProperty = computeListedPropertyAggregation(assets, taxYear, conventionOverride);

  return {
    priorYearAssets, currentYearGds, currentYearAds, assetResults,
    midQuarterRequired, listedProperty,
  };
}

/**
 * Test whether the mid-quarter convention is required per IRC §168(d)(3).
 *
 * The test considers only personal property (not real property) placed in
 * service during the current tax year. If more than 40% of the aggregate
 * depreciable basis of such property is placed in service during the last
 * 3 months (October through December), mid-quarter is required.
 *
 * Assets with an explicit `convention` set to something other than
 * "midQuarter" are excluded from the test (they override the default).
 */
export function isMidQuarterRequired(
  assets: DepreciableAsset[],
  taxYear: number,
): boolean {
  let totalBasis = ZERO;
  let q4Basis = ZERO;

  for (const asset of assets) {
    const recoveryPeriod = parseFloat(asset.recoveryPeriod);
    const isRealProperty = recoveryPeriod === 27.5 || recoveryPeriod === 39;
    if (isRealProperty) continue; // real property excluded from the test

    const pisYear = parseInt(asset.placedInServiceDate.substring(0, 4), 10);
    if (pisYear !== taxYear) continue; // only current-year assets

    // Assets with an explicit convention are not subject to the auto-test
    if (asset.convention) continue;

    const basis = d(asset.costBasis);
    if (basis.lessThanOrEqualTo(ZERO)) continue;

    totalBasis = totalBasis.plus(basis);

    const pisMonth = parseInt(asset.placedInServiceDate.substring(5, 7), 10);
    if (pisMonth >= 10) {
      q4Basis = q4Basis.plus(basis);
    }
  }

  if (totalBasis.isZero()) return false;

  // More than 40% → mid-quarter required
  return q4Basis.dividedBy(totalBasis).greaterThan(new Decimal("0.40"));
}

// ---------------------------------------------------------------------------
// Part V: Listed Property (IRC §280F)
// ---------------------------------------------------------------------------

export interface ListedPropertyResult {
  description: string;
  costBasis: Decimal;
  businessUsePercentage: Decimal;
  isPassengerAutomobile: boolean;
  /** Whether business use exceeds 50% (required for MACRS GDS; otherwise ADS SL) */
  qualifiesForMacrs: boolean;
  /** Tentative depreciation before §280F cap (cost × table % × business use %) */
  tentativeDepreciation: Decimal;
  /** IRC §280F annual cap for passenger automobiles (null if not a passenger auto) */
  section280FCap: Decimal | null;
  /** Final depreciation after §280F cap and business-use limitation */
  depreciation: Decimal;
  recoveryPeriod: number;
  method: MACRSMethod;
  convention: MACRSConvention;
  recoveryYear: number;
  placedInServiceYear: number;
  fullyDepreciated: boolean;
}

export interface ListedPropertyAggregation {
  /** Total listed-property depreciation for Line 21 → Part II */
  totalDepreciation: Decimal;
  /** Individual listed-property results for audit trail */
  results: ListedPropertyResult[];
}

/**
 * Compute depreciation for a single listed-property asset.
 *
 * Listed property rules (IRC §280F):
 * 1. If business-use percentage > 50%: use MACRS GDS (200DB for personal property).
 * 2. If business-use percentage ≤ 50%: must use ADS straight-line.
 * 3. Multiply computed depreciation by business-use percentage.
 * 4. For passenger automobiles: cap the result at the §280F annual limit.
 *
 * @param asset - The depreciable asset (must have isListedProperty = true)
 * @param taxYear - Current tax year
 * @param conventionOverride - Mid-quarter override from the aggregate test
 */
export function computeListedPropertyDepreciation(
  asset: DepreciableAsset,
  taxYear: number,
  conventionOverride?: MACRSConvention,
): ListedPropertyResult | null {
  const costBasis = d(asset.costBasis);
  if (costBasis.lessThanOrEqualTo(ZERO)) return null;

  const businessUsePct = new Decimal(asset.businessUsePercentage ?? 100);
  const businessUseRatio = businessUsePct.dividedBy(100);
  const isPassengerAuto = asset.isPassengerAutomobile === true;

  const recoveryPeriod = parseFloat(asset.recoveryPeriod);
  const pisYear = parseInt(asset.placedInServiceDate.substring(0, 4), 10);
  const pisMonth = parseInt(asset.placedInServiceDate.substring(5, 7), 10);
  const recoveryYear = taxYear - pisYear + 1;
  if (recoveryYear < 1) return null;

  // >50% business use required for MACRS GDS; otherwise ADS straight-line
  const qualifiesForMacrs = businessUsePct.greaterThan(new Decimal(50));

  // For passenger automobiles with ≤50% business use, force 5-year ADS SL
  const effectiveRecoveryPeriod = isPassengerAuto && !qualifiesForMacrs
    ? SECTION_280F_ADS_RECOVERY_PERIOD
    : recoveryPeriod;

  const method: MACRSMethod = qualifiesForMacrs
    ? resolveMethod(asset.method, effectiveRecoveryPeriod)
    : "SL";

  // Convention resolution: explicit > aggregate override > default
  const isRealProperty = effectiveRecoveryPeriod === 27.5 || effectiveRecoveryPeriod === 39;
  let convention: MACRSConvention;
  if (asset.convention) {
    convention = asset.convention as MACRSConvention;
  } else if (conventionOverride && !isRealProperty) {
    convention = conventionOverride;
  } else {
    convention = resolveConvention(undefined, isRealProperty);
  }

  const table = getPercentageTable(effectiveRecoveryPeriod, method, convention, pisMonth);
  if (!table) return null;

  const maxYears = table.length;
  if (recoveryYear > maxYears) {
    return {
      description: asset.description ?? "",
      costBasis,
      businessUsePercentage: businessUsePct,
      isPassengerAutomobile: isPassengerAuto,
      qualifiesForMacrs,
      tentativeDepreciation: ZERO,
      section280FCap: null,
      depreciation: ZERO,
      recoveryPeriod: effectiveRecoveryPeriod,
      method,
      convention,
      recoveryYear,
      placedInServiceYear: pisYear,
      fullyDepreciated: true,
    };
  }

  const percentage = table[recoveryYear - 1];
  let rawDepreciation = roundDollar(costBasis.times(percentage).dividedBy(100));

  // Disposal-year halving
  if (asset.disposedDuringYear && !isRealProperty && recoveryYear <= maxYears) {
    rawDepreciation = roundDollar(rawDepreciation.dividedBy(2));
  }

  // Apply business-use percentage
  const tentativeDepreciation = roundDollar(rawDepreciation.times(businessUseRatio));

  // Apply §280F cap for passenger automobiles
  let section280FCap: Decimal | null = null;
  let depreciation = tentativeDepreciation;

  if (isPassengerAuto) {
    const limits = SECTION_280F_LIMITS[pisYear];
    if (limits) {
      const isFirstYearBonus = asset.firstYearBonusEligible === true;
      const limitTable = isFirstYearBonus ? limits.withBonus : limits.withoutBonus;
      // Year 1-3 use indices 0-2; year 4+ use index 3
      const capIndex = Math.min(recoveryYear - 1, limitTable.length - 1);
      section280FCap = limitTable[capIndex];
      depreciation = Decimal.min(tentativeDepreciation, section280FCap);
    }
  }

  return {
    description: asset.description ?? "",
    costBasis,
    businessUsePercentage: businessUsePct,
    isPassengerAutomobile: isPassengerAuto,
    qualifiesForMacrs,
    tentativeDepreciation,
    section280FCap,
    depreciation,
    recoveryPeriod: effectiveRecoveryPeriod,
    method,
    convention,
    recoveryYear,
    placedInServiceYear: pisYear,
    fullyDepreciated: false,
  };
}

/**
 * Compute depreciation for all listed-property assets and aggregate for Line 21.
 *
 * Listed property assets are separated from the regular aggregate computation.
 * The mid-quarter convention test still considers listed property basis when
 * determining whether the 40% Q4 threshold is met (per Pub 946).
 */
export function computeListedPropertyAggregation(
  assets: DepreciableAsset[],
  taxYear: number,
  conventionOverride?: MACRSConvention,
): ListedPropertyAggregation {
  let totalDepreciation = ZERO;
  const results: ListedPropertyResult[] = [];

  for (const asset of assets) {
    if (!asset.isListedProperty) continue;

    const result = computeListedPropertyDepreciation(asset, taxYear, conventionOverride);
    if (!result || result.depreciation.isZero()) continue;

    results.push(result);
    totalDepreciation = totalDepreciation.plus(result.depreciation);
  }

  return { totalDepreciation, results };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveMethod(
  explicit: string | undefined,
  recoveryPeriod: number,
): MACRSMethod {
  if (explicit) return explicit as MACRSMethod;
  if (recoveryPeriod === 27.5 || recoveryPeriod === 39 || recoveryPeriod === 25) return "SL";
  return "200DB";
}

function resolveConvention(
  explicit: string | undefined,
  isRealProperty: boolean,
): MACRSConvention {
  if (explicit) return explicit as MACRSConvention;
  return isRealProperty ? "midMonth" : "halfYear";
}

/**
 * Get the quarter (1–4) for a month (1–12).
 */
function getQuarter(month: number): number {
  return Math.ceil(month / 3);
}

function getPercentageTable(
  recoveryPeriod: number,
  method: MACRSMethod,
  convention: MACRSConvention,
  placedInServiceMonth: number,
): Decimal[] | null {
  // Mid-month convention tables for real property
  if (convention === "midMonth") {
    if (recoveryPeriod === 27.5) {
      return MACRS_RESIDENTIAL_RENTAL_MID_MONTH[placedInServiceMonth] ?? null;
    }
    if (recoveryPeriod === 39) {
      return MACRS_NONRESIDENTIAL_REAL_MID_MONTH[placedInServiceMonth] ?? null;
    }
    return null;
  }

  // Mid-quarter convention tables
  if (convention === "midQuarter") {
    const quarter = getQuarter(placedInServiceMonth);
    if (method === "200DB") {
      return MACRS_GDS_200DB_MID_QUARTER[quarter]?.[recoveryPeriod] ?? null;
    }
    if (method === "150DB") {
      return MACRS_GDS_150DB_MID_QUARTER[quarter]?.[recoveryPeriod] ?? null;
    }
    if (method === "SL") {
      return MACRS_GDS_SL_MID_QUARTER[quarter]?.[recoveryPeriod] ?? null;
    }
    return null;
  }

  // Half-year convention tables
  if (convention === "halfYear") {
    if (method === "200DB") {
      return MACRS_GDS_200DB_HALF_YEAR[recoveryPeriod] ?? null;
    }
    if (method === "150DB") {
      return MACRS_GDS_150DB_HALF_YEAR[recoveryPeriod] ?? null;
    }
    if (method === "SL") {
      return MACRS_GDS_SL_HALF_YEAR[recoveryPeriod] ?? null;
    }
  }

  return null;
}

/**
 * Form 4562 depreciation and section 179.
 * Spec: spec/federal/form-4562.yaml
 *
 * Three computation paths:
 * 1. Summary bridge: accepts validated aggregate totals (backward-compatible).
 * 2. Per-asset MACRS: when `assets` is provided, computes depreciation from
 *    IRS Pub 946 tables and aggregates into Lines 17, 19, 20.
 * 3. Per-asset amortization: when `amortizableAssets` is provided, computes
 *    monthly straight-line amortization and aggregates into Lines 42, 43.
 */

import Decimal from "decimal.js";
import type { Form4562Input, AmortizableAsset } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";
import {
  computeAggregateDepreciation,
  type AssetDepreciationResult,
  type ListedPropertyResult,
} from "@/utils/macrs.js";

export interface AmortizationResultItem {
  description: string;
  amortizableAmount: Decimal;
  codeSection: string;
  periodMonths: number;
  startYear: number;
  startMonth: number;
  monthsThisYear: number;
  deduction: Decimal;
  isComplete: boolean;
  isCurrentYear: boolean;
}

export interface Form4562Result {
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16: Decimal;
  line17: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line42: Decimal;
  line43: Decimal;
  line44: Decimal;
  /** Per-asset depreciation detail (only populated when assets input is provided) */
  assetResults: AssetDepreciationResult[];
  /** Part V listed-property results (only populated when assets input has listed property) */
  listedPropertyResults: ListedPropertyResult[];
  /** Whether mid-quarter convention was triggered for current-year assets */
  midQuarterRequired: boolean;
  /** Per-asset amortization detail (only populated when amortizableAssets input is provided) */
  amortizationResults: AmortizationResultItem[];
  /** IRC §280F(b)(2) recapture income when listed property business use drops to ≤50% */
  section280FRecaptureIncome: Decimal;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const SECTION_179_LIMIT_2025 = new Decimal(2500000);
const SECTION_179_PHASEOUT_THRESHOLD_2025 = new Decimal(4000000);
const DEFAULT_TAX_YEAR = 2025;

/** Default amortization periods in months by IRC code section. */
const AMORTIZATION_DEFAULTS: Record<string, number> = {
  "197": 180,         // 15 years — intangible assets
  "195": 180,         // 15 years — start-up costs (after immediate deduction)
  "709": 180,         // 15 years — partnership organization costs
  "174domestic": 60,  // 5 years — domestic R&E (post-TCJA)
  "174foreign": 180,  // 15 years — foreign R&E (post-TCJA)
  "169": 60,          // 5 years — pollution control facilities
};

/**
 * Compute a single asset's amortization deduction for the given tax year.
 * Returns null if the asset produces no deduction in this tax year.
 */
function computeAssetAmortization(
  asset: AmortizableAsset,
  taxYear: number,
): AmortizationResultItem | null {
  const amount = d(asset.amortizableAmount);
  if (amount.isZero() || amount.isNegative()) return null;

  const section = asset.codeSection;
  const periodMonths = asset.amortizationPeriodMonths ?? AMORTIZATION_DEFAULTS[section];
  if (!periodMonths) return null; // §171 and "other" require explicit period

  // Parse start date — for §174, force mid-year convention (July 1)
  let startYear: number;
  let startMonth: number;
  if (section === "174domestic" || section === "174foreign") {
    const parts = asset.dateAmortizationBegins.split("-").map(Number);
    startYear = parts[0];
    startMonth = 7; // mid-year convention: always July
  } else {
    const parts = asset.dateAmortizationBegins.split("-").map(Number);
    startYear = parts[0];
    startMonth = parts[1];
  }

  // Compute overlap between [amortization start, amortization end] and [Jan, Dec] of taxYear
  const startAbs = startYear * 12 + startMonth;
  const endAbs = startAbs + periodMonths - 1;
  const yearStartAbs = taxYear * 12 + 1;
  const yearEndAbs = taxYear * 12 + 12;

  const overlapStart = Math.max(startAbs, yearStartAbs);
  const overlapEnd = Math.min(endAbs, yearEndAbs);
  const months = Math.max(0, overlapEnd - overlapStart + 1);

  if (months === 0) return null;

  const monthlyAmount = amount.dividedBy(periodMonths);
  const deduction = roundDollar(monthlyAmount.times(months));

  return {
    description: asset.description || `§${section} intangible`,
    amortizableAmount: amount,
    codeSection: section,
    periodMonths,
    startYear,
    startMonth,
    monthsThisYear: months,
    deduction,
    isComplete: endAbs <= yearEndAbs,
    isCurrentYear: startYear === taxYear,
  };
}

export function calculateForm4562(input: Form4562Input): Form4562Result {
  const audit = new AuditTrail();
  const taxYear = input.taxYear ?? DEFAULT_TAX_YEAR;

  // --- Part I: Section 179 (unchanged) ---
  const line1 = Decimal.max(ZERO, d(input.section179MaximumDeduction ?? SECTION_179_LIMIT_2025));
  const line2 = Decimal.max(ZERO, d(input.section179TotalCost));
  const line3 = Decimal.max(ZERO, d(input.section179ThresholdCost ?? SECTION_179_PHASEOUT_THRESHOLD_2025));
  const line4 = Decimal.max(ZERO, line2.minus(line3));
  const line5 = Decimal.max(ZERO, line1.minus(line4));
  const line8 = Decimal.max(ZERO, d(input.section179ElectedCost));
  const line9 = Decimal.min(line5, line8);
  const line10 = Decimal.max(ZERO, d(input.section179CarryoverFromPriorYear));
  const line11 = Decimal.min(line5, Decimal.max(ZERO, d(input.section179BusinessIncomeLimit)));

  const directLine12Override = input.section179ExpenseDeduction !== undefined
    ? Decimal.max(ZERO, d(input.section179ExpenseDeduction))
    : undefined;
  const computedLine12 = Decimal.min(line9.plus(line10), line11);
  const line12 = directLine12Override ?? computedLine12;

  const directLine13Override = input.section179CarryoverToNextYear !== undefined
    ? Decimal.max(ZERO, d(input.section179CarryoverToNextYear))
    : undefined;
  const computedLine13 = Decimal.max(ZERO, line9.plus(line10).minus(line12));
  const line13 = directLine13Override ?? computedLine13;

  // --- Parts II–V: Depreciation ---
  const line14 = Decimal.max(ZERO, d(input.specialDepreciationAllowance));
  const line15 = Decimal.max(ZERO, d(input.section168f1Depreciation));
  const line16 = Decimal.max(ZERO, d(input.otherDepreciation));
  let line21 = Decimal.max(ZERO, d(input.listedPropertyDepreciation));

  // Per-asset MACRS computation when assets are provided
  let line17: Decimal;
  let line19: Decimal;
  let line20: Decimal;
  let assetResults: AssetDepreciationResult[] = [];
  let listedPropertyResults: ListedPropertyResult[] = [];
  let midQuarterRequired = false;

  if (input.assets && input.assets.length > 0) {
    const agg = computeAggregateDepreciation(input.assets, taxYear);
    line17 = agg.priorYearAssets;
    line19 = agg.currentYearGds;
    line20 = agg.currentYearAds;
    assetResults = agg.assetResults;
    midQuarterRequired = agg.midQuarterRequired;
    listedPropertyResults = agg.listedProperty.results;
    // Line 21: when assets include listed property, compute from Part V instead of validated total
    if (agg.listedProperty.results.length > 0) {
      line21 = agg.listedProperty.totalDepreciation;
    }
  } else {
    line17 = Decimal.max(ZERO, d(input.macrsPre2025AssetsDepreciation));
    line19 = Decimal.max(ZERO, d(input.macrsCurrentYearGdsDepreciation));
    line20 = Decimal.max(ZERO, d(input.macrsCurrentYearAdsDepreciation));
  }

  const line22 = line12.plus(line14).plus(line15).plus(line16).plus(line17).plus(line19).plus(line20).plus(line21);

  // --- §280F(b)(2) Recapture ---
  // When listed property business use drops from >50% to ≤50%, recapture the
  // excess of cumulative MACRS deductions over ADS straight-line from prior years.
  let section280FRecaptureIncome = ZERO;
  if (input.assets && input.assets.length > 0) {
    for (const asset of input.assets) {
      if (
        asset.isListedProperty
        && asset.section280FRecaptureTriggered === true
        && asset.cumulativePriorMacrsDeductions !== undefined
        && asset.cumulativePriorAdsDeductions !== undefined
      ) {
        const priorMacrs = Decimal.max(ZERO, d(asset.cumulativePriorMacrsDeductions));
        const priorAds = Decimal.max(ZERO, d(asset.cumulativePriorAdsDeductions));
        const recapture = Decimal.max(ZERO, priorMacrs.minus(priorAds));
        if (recapture.greaterThan(ZERO)) {
          section280FRecaptureIncome = section280FRecaptureIncome.plus(recapture);
          audit.record(
            "Form 4562", "§280F recapture",
            `${asset.description || "Listed property"} — IRC §280F(b)(2) recapture (business use dropped to ${asset.businessUsePercentage ?? 0}%)`,
            recapture,
            `Cumulative prior MACRS $${priorMacrs} - cumulative prior ADS $${priorAds}`,
            {
              "Cumulative prior MACRS": priorMacrs,
              "Cumulative prior ADS": priorAds,
            },
          );
        }
      }
    }
  }

  if (section280FRecaptureIncome.greaterThan(ZERO)) {
    audit.record(
      "Form 4562", "§280F recapture total",
      "Total IRC §280F(b)(2) recapture income — flows to ordinary income (Form 4797 Part IV Line 34)",
      section280FRecaptureIncome,
      "Sum of per-asset §280F recapture amounts",
    );
  }

  // --- Part VI: Amortization ---
  let line42: Decimal;
  let line43: Decimal;
  const amortizationResults: AmortizationResultItem[] = [];

  if (input.amortizableAssets && input.amortizableAssets.length > 0) {
    // Per-asset computation path
    let currentYearTotal = ZERO;
    let priorYearTotal = ZERO;

    for (const asset of input.amortizableAssets) {
      const result = computeAssetAmortization(asset, taxYear);
      if (result) {
        amortizationResults.push(result);
        if (result.isCurrentYear) {
          currentYearTotal = currentYearTotal.plus(result.deduction);
        } else {
          priorYearTotal = priorYearTotal.plus(result.deduction);
        }
      }
    }

    line42 = currentYearTotal;
    line43 = priorYearTotal;
  } else {
    // Summary bridge (backward-compatible)
    line42 = Decimal.max(ZERO, d(input.currentYearAmortization));
    line43 = Decimal.max(ZERO, d(input.priorYearAmortization));
  }

  const line44 = line42.plus(line43);

  // --- Audit trail ---
  audit.record(
    "Form 4562", "1", "Maximum section 179 deduction limit", line1,
    input.section179MaximumDeduction !== undefined
      ? "Validated line 1 override"
      : "2025 statutory section 179 maximum deduction",
    { "Validated line 1 override": d(input.section179MaximumDeduction) },
  );
  audit.record("Form 4562", "2", "Total cost of section 179 property placed in service", line2, "Validated line 2 total");
  audit.record(
    "Form 4562", "3", "Section 179 threshold cost before reducing the annual limit", line3,
    input.section179ThresholdCost !== undefined
      ? "Validated line 3 override"
      : "2025 statutory section 179 threshold cost",
    { "Validated line 3 override": d(input.section179ThresholdCost) },
  );
  audit.record("Form 4562", "4", "Reduction in the section 179 limit", line4, "Line 2 - Line 3, floored at $0", {
    "Line 2": line2, "Line 3": line3,
  });
  audit.record("Form 4562", "5", "Section 179 dollar limitation for the year", line5, "Line 1 - Line 4, floored at $0", {
    "Line 1": line1, "Line 4": line4,
  });
  audit.record("Form 4562", "8", "Total elected cost of section 179 property", line8, "Validated aggregate elected section 179 cost");
  audit.record("Form 4562", "9", "Tentative section 179 deduction", line9, "Smaller of Line 5 or Line 8", {
    "Line 5": line5, "Line 8": line8,
  });
  audit.record("Form 4562", "10", "Carryover of disallowed section 179 deduction from 2024", line10, "Validated prior-year carryover");
  audit.record("Form 4562", "11", "Business income limitation", line11, "Validated line 11 amount limited to Line 5", {
    "Validated line 11 amount": d(input.section179BusinessIncomeLimit), "Line 5": line5,
  });
  audit.record(
    "Form 4562", "12", "Section 179 expense deduction", line12,
    directLine12Override !== undefined
      ? "Validated direct line 12 override"
      : "Smaller of Line 9 + Line 10 or Line 11",
    {
      "Validated direct line 12 override": directLine12Override ?? ZERO,
      "Line 9": line9, "Line 10": line10, "Line 11": line11,
    },
  );
  audit.record(
    "Form 4562", "13", "Carryover of disallowed deduction to 2026", line13,
    directLine13Override !== undefined
      ? "Validated direct line 13 override"
      : "Line 9 + Line 10 - Line 12, floored at $0",
    {
      "Validated direct line 13 override": directLine13Override ?? ZERO,
      "Line 9": line9, "Line 10": line10, "Line 12": line12,
    },
  );
  audit.record("Form 4562", "14", "Special depreciation allowance", line14, "Validated line 14 total");
  audit.record("Form 4562", "15", "Property subject to section 168(f)(1) election", line15, "Validated line 15 total");
  audit.record("Form 4562", "16", "Other depreciation including ACRS", line16, "Validated line 16 total");

  const usedAssets = input.assets && input.assets.length > 0;
  audit.record(
    "Form 4562", "17",
    `MACRS deductions for assets placed in service before ${taxYear}`,
    line17,
    usedAssets
      ? `Computed from ${assetResults.filter((r) => r.placedInServiceYear < taxYear).length} prior-year asset(s) via Pub 946 tables`
      : "Validated line 17 total",
  );
  audit.record(
    "Form 4562", "19", "Current-year MACRS depreciation under GDS", line19,
    usedAssets
      ? `Computed from ${assetResults.filter((r) => r.placedInServiceYear === taxYear && r.method !== "SL" && r.recoveryPeriod !== 27.5 && r.recoveryPeriod !== 39).length} current-year GDS asset(s)`
      : "Validated line 19 column (g) total",
  );
  audit.record(
    "Form 4562", "20", "Current-year MACRS depreciation under ADS", line20,
    usedAssets
      ? `Computed from ${assetResults.filter((r) => r.placedInServiceYear === taxYear && (r.method === "SL" || r.recoveryPeriod === 27.5 || r.recoveryPeriod === 39)).length} current-year ADS/real-property asset(s)`
      : "Validated line 20 column (g) total",
  );

  const hasComputedListedProperty = listedPropertyResults.length > 0;
  audit.record(
    "Form 4562", "21", "Listed property depreciation", line21,
    hasComputedListedProperty
      ? `Computed from ${listedPropertyResults.length} listed-property asset(s) via Part V`
      : "Validated line 21 total",
  );
  audit.record(
    "Form 4562", "22", "Total depreciation and section 179 deduction", line22,
    "Line 12 + Lines 14 through 17 + Line 19 column (g) total + Line 20 column (g) total + Line 21",
    {
      "Line 12": line12, "Line 14": line14, "Line 15": line15, "Line 16": line16,
      "Line 17": line17, "Line 19 column (g) total": line19, "Line 20 column (g) total": line20, "Line 21": line21,
    },
  );

  const usedAmortizableAssets = amortizationResults.length > 0;
  audit.record(
    "Form 4562", "42", "Current-year amortization deduction", line42,
    usedAmortizableAssets
      ? `Computed from ${amortizationResults.filter((r) => r.isCurrentYear).length} current-year amortizable asset(s)`
      : "Validated line 42 total",
  );
  audit.record(
    "Form 4562", "43", "Amortization deduction from prior-year starts", line43,
    usedAmortizableAssets
      ? `Computed from ${amortizationResults.filter((r) => !r.isCurrentYear).length} prior-year amortizable asset(s)`
      : "Validated line 43 total",
  );
  audit.record("Form 4562", "44", "Total amortization deduction", line44, "Line 42 + Line 43", {
    "Line 42": line42, "Line 43": line43,
  });

  if (midQuarterRequired) {
    audit.record(
      "Form 4562", "convention",
      "Mid-quarter convention required — more than 40% of current-year personal property basis placed in service in Q4",
      new Decimal(1),
      "IRC §168(d)(3): aggregate Q4 basis exceeds 40% of total current-year personal property basis",
    );
  }

  // Per-asset depreciation audit trail entries
  for (const ar of assetResults) {
    audit.record(
      "Form 4562", "asset",
      `${ar.description || "Asset"} (${ar.recoveryPeriod}-yr ${ar.method} ${ar.convention}, year ${ar.recoveryYear})`,
      ar.depreciation,
      `${ar.percentage}% of $${ar.costBasis} cost basis`,
      {
        "Cost basis": ar.costBasis,
        "Recovery period": new Decimal(ar.recoveryPeriod),
        "Recovery year": new Decimal(ar.recoveryYear),
        "Percentage": ar.percentage,
      },
    );
  }

  // Part V listed-property audit trail entries
  for (const lp of listedPropertyResults) {
    const capNote = lp.section280FCap
      ? ` — §280F cap $${lp.section280FCap}`
      : "";
    const methodNote = lp.qualifiesForMacrs ? "MACRS GDS" : "ADS SL (≤50% business use)";
    audit.record(
      "Form 4562", "Part V",
      `${lp.description || "Listed property"} (${lp.businessUsePercentage}% business, ${methodNote}, year ${lp.recoveryYear}${capNote})`,
      lp.depreciation,
      lp.section280FCap
        ? `min(tentative $${lp.tentativeDepreciation}, §280F cap $${lp.section280FCap})`
        : `$${lp.costBasis} × table % × ${lp.businessUsePercentage}% business use`,
      {
        "Cost basis": lp.costBasis,
        "Business use %": lp.businessUsePercentage,
        "Tentative depreciation": lp.tentativeDepreciation,
        ...(lp.section280FCap ? { "§280F annual cap": lp.section280FCap } : {}),
      },
    );
  }

  // Part VI per-asset amortization audit trail entries
  for (const am of amortizationResults) {
    const midYearNote = (am.codeSection === "174domestic" || am.codeSection === "174foreign")
      ? " (mid-year convention)"
      : "";
    audit.record(
      "Form 4562", "Part VI",
      `${am.description} (§${am.codeSection}, ${am.periodMonths}mo, ${am.monthsThisYear}mo this year${midYearNote})`,
      am.deduction,
      `$${am.amortizableAmount} / ${am.periodMonths} months × ${am.monthsThisYear} months`,
      {
        "Amortizable amount": am.amortizableAmount,
        "Period (months)": new Decimal(am.periodMonths),
        "Months this year": new Decimal(am.monthsThisYear),
      },
    );
  }

  return {
    line1, line2, line3, line4, line5, line8, line9, line10, line11,
    line12, line13, line14, line15, line16, line17, line19, line20, line21, line22,
    line42, line43, line44,
    assetResults,
    listedPropertyResults,
    midQuarterRequired,
    amortizationResults,
    section280FRecaptureIncome,
    lines: audit.getLines(),
  };
}

/** Spec: spec/federal/macrs-asset-basis-sources.yaml. */
import { describe, expect, it } from "vitest";
import { DepreciableAssetSchema, type DepreciableAsset } from "@/models/inputs.js";
import { computeAggregateDepreciation, computeAssetDepreciation, computeListedPropertyAggregation, computeListedPropertyDepreciation, isMidQuarterRequired } from "@/utils/macrs.js";

function actualAsset(bonus = "0", listed = true) {
  const asset = {
    description: "Synthetic first-year machine", costBasis: "9000", placedInServiceDate: "2026-12-03", recoveryPeriod: "5" as const,
    method: "200DB" as const, convention: "halfYear" as const, isListedProperty: listed, isPassengerAutomobile: false,
    businessUsePercentage: 60, disposedDuringYear: false, firstYearBonusEligible: bonus !== "0",
  };
  return { ...asset, basisSources: {
    version: "macrs-basis-v1", system: "GDS", sourceTaxYear: 2026, sourceReference: "synthetic-asset-originals",
    grossBasisSourceReference: "synthetic-invoice", businessUseSourceReference: "synthetic-usage-record",
    section179SourceReference: "synthetic-section179-record", bonusSourceReference: "synthetic-bonus-record",
    confirmed: true, calendarYear: true, usePattern: "constant_business_only", changedUseDuringYear: false,
    noOtherBasisAdjustmentsConfirmed: true, noConversionOrCarryoverBasisConfirmed: true,
    legacyCostBasisMeaning: "gross_basis_less_business_section179_before_bonus",
    grossCostBasis: "10000", businessUsePercentage: "60", section179BusinessDeduction: "1000", bonusBusinessDeduction: bonus,
    assetSnapshot: { ...asset },
  } } as DepreciableAsset & { basisSources: Record<string, unknown> };
}
const before = (): DepreciableAsset => DepreciableAssetSchema.parse({ costBasis: "7500", placedInServiceDate: "2026-01", recoveryPeriod: "5" });

describe("MACRS actual asset basis sources", () => {
  it("derives business basis before section179 without a second business allocation", () => {
    for (const listed of [false, true]) {
      const asset = actualAsset("0", listed);
      const unchanged = JSON.stringify(asset);
      const result = listed ? computeListedPropertyDepreciation(asset, 2026) : computeAssetDepreciation(asset, 2026);
      expect(result?.depreciation.toFixed()).toBe("1000");
      expect(result).toMatchObject({ basisSourceStatus: "documented_first_year" });
      expect(result?.costBasis.toFixed()).toBe("5000");
      expect(result).toHaveProperty("basisSourceAmounts.midQuarterTestBasis");
      expect(JSON.stringify(asset)).toBe(unchanged);
      const replayed = DepreciableAssetSchema.parse(JSON.parse(JSON.stringify(asset)));
      expect(computeAssetDepreciation(replayed, 2026)?.depreciation.toFixed()).toBe("1000");
    }
    const aggregate = computeAggregateDepreciation([before(), actualAsset()], 2026);
    expect(aggregate.midQuarterRequired).toBe(false);
    expect(aggregate.currentYearGds.toFixed()).toBe("1500");
    expect(aggregate.listedProperty.totalDepreciation.toFixed()).toBe("1000");
  });

  it("keeps bonus out of the strict mid-quarter test and uses it in regular depreciation", () => {
    const without = actualAsset("0");
    const withBonus = actualAsset("2000"); // Actual allocated40% of5000; no eligibility inference.
    expect(isMidQuarterRequired([before(), without], 2026)).toBe(false);
    expect(isMidQuarterRequired([before(), withBonus], 2026)).toBe(false);
    expect(isMidQuarterRequired([{ ...before(), costBasis: "7499.99" }, withBonus], 2026)).toBe(true);
    expect(isMidQuarterRequired([{ ...before(), costBasis: "7500.01" }, withBonus], 2026)).toBe(false);
    // Full actual bonus still contributes its5000pre-bonus basis to the40%test.
    expect(isMidQuarterRequired([{ ...before(), costBasis: "7499.99" }, actualAsset("5000")], 2026)).toBe(true);
    expect(computeAggregateDepreciation([actualAsset("5000")], 2026)).toMatchObject({ basisSourceStatus: "documented_first_year" });
    expect(computeAggregateDepreciation([actualAsset("5000")], 2026).listedProperty.totalDepreciation.toFixed()).toBe("0");
    expect(computeListedPropertyDepreciation(withBonus, 2026)?.depreciation.toFixed()).toBe("600");
    expect(computeAssetDepreciation(actualAsset("2000", false), 2026)?.depreciation.toFixed()).toBe("600");
    expect(computeAggregateDepreciation([withBonus], 2026).listedProperty.totalDepreciation.toFixed()).toBe("150");
  });

  it("requires explicit plain original basis and absence of other basis adjustments", () => {
    for (const field of ["noOtherBasisAdjustmentsConfirmed", "noConversionOrCarryoverBasisConfirmed"]) {
      const original = actualAsset();
      for (const value of [undefined, false]) {
        const source = { ...original.basisSources, [field]: value } as Record<string, unknown>;
        if (value === undefined) delete source[field];
        const asset = { ...original, basisSources: source } as DepreciableAsset;
        expect(() => computeAssetDepreciation(asset, 2026), `${field}:${String(value)}`).toThrow();
        expect(() => computeAggregateDepreciation([asset], 2026), `${field}:${String(value)}`).toThrow();
      }
    }
  });

  it("rejects a conflicting legacy scalar and labels legacy compatibility results unqualified", () => {
    expect(() => computeAggregateDepreciation([{ ...actualAsset(), costBasis: "5400" }], 2026)).toThrow();
    const legacy = { costBasis: "9000", placedInServiceDate: "2026-01", recoveryPeriod: "5" as const, isListedProperty: true, businessUsePercentage: 60 };
    const result = computeListedPropertyDepreciation(DepreciableAssetSchema.parse(legacy), 2026);
    expect(result?.depreciation.toFixed()).toBe("1080");
    expect(result).toMatchObject({ basisSourceStatus: "legacy_unqualified" });
    expect(computeAssetDepreciation(before(), 2026)).toMatchObject({ basisSourceStatus: "legacy_unqualified" });
    expect(computeAggregateDepreciation([before(), actualAsset()], 2026)).toMatchObject({ basisSourceStatus: "legacy_unqualified" });
  });

  it("rejects stale malformed or unsupported packets before every calculation shortcut", () => {
    const original = actualAsset();
    const variants = [
      { ...original, costBasis: "0" },
      { ...original, cumulativePriorMacrsDeductions: "private-invalid-history-marker" },
      { ...original, placedInServiceDate: "2025-12-03" },
      { ...original, placedInServiceDate: "2026-02-31" },
      { ...original, placedInServiceDate: "2026-12" },
      { ...original, businessUsePercentage: 100 },
      { ...original, disposedDuringYear: true },
      { ...original, isPassengerAutomobile: true },
      { ...original, basisSources: {} },
      { ...original, basisSources: { ...original.basisSources, confirmed: false } },
      { ...original, basisSources: { ...original.basisSources, sourceTaxYear: 2025 } },
      { ...original, basisSources: { ...original.basisSources, section179BusinessDeduction: undefined } },
      { ...original, basisSources: { ...original.basisSources, bonusBusinessDeduction: undefined } },
      { ...original, basisSources: { ...original.basisSources, changedUseDuringYear: true } },
      { ...original, basisSources: { ...original.basisSources, section179BusinessDeduction: "6000.01" } },
      { ...original, basisSources: { ...original.basisSources, bonusBusinessDeduction: "5000.01" } },
    ];
    for (const asset of variants) {
      const typed = asset as unknown as DepreciableAsset;
      expect(() => computeAssetDepreciation(typed, 2026)).toThrow();
      expect(() => computeListedPropertyDepreciation(typed, 2026)).toThrow();
      expect(() => isMidQuarterRequired([typed], 2026)).toThrow();
      expect(() => computeAggregateDepreciation([typed], 2026)).toThrow();
      expect(() => computeListedPropertyAggregation([typed], 2026)).toThrow();
    }
    expect(() => computeAssetDepreciation(original, 2027)).toThrow();
    for (const patch of [{ isPassengerAutomobile: true }, { businessUsePercentage: 40 }, { recoveryPeriod: "15" }, { method: "SL" }]) {
      const asset = { ...original, ...patch };
      const source = { ...original.basisSources, assetSnapshot: { ...original.basisSources.assetSnapshot as object, ...patch } };
      if ("businessUsePercentage" in patch) source.businessUsePercentage = String(patch.businessUsePercentage);
      expect(() => computeAggregateDepreciation([{ ...asset, basisSources: source } as unknown as DepreciableAsset], 2026)).toThrow();
    }
    const marker = "private-invalid-history-marker";
    try { computeAssetDepreciation({ ...original, cumulativePriorMacrsDeductions: marker }, 2026); }
    catch (error) { expect(String(error)).not.toContain(marker); }
  });
});

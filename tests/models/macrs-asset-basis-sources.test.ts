/** Spec: spec/federal/macrs-asset-basis-sources.yaml. */
import { describe, expect, it } from "vitest";
import { DepreciableAssetSchema } from "@/models/inputs.js";
import { resolveMACRSAssetBasisSources } from "@/models/macrs-asset-basis-sources.js";

function originalAsset() {
  const asset = { costBasis: "10000", placedInServiceDate: "2026-02-28", recoveryPeriod: "5", method: "200DB", isListedProperty: false, isPassengerAutomobile: false, businessUsePercentage: 100, disposedDuringYear: false };
  return { ...asset, basisSources: {
    version: "macrs-basis-v1", system: "GDS", sourceTaxYear: 2026, sourceReference: "synthetic-originals",
    grossBasisSourceReference: "synthetic-invoice", businessUseSourceReference: "synthetic-usage",
    section179SourceReference: "synthetic-zero179", bonusSourceReference: "synthetic-zeroBonus",
    confirmed: true, calendarYear: true, usePattern: "constant_business_only", changedUseDuringYear: false,
    noOtherBasisAdjustmentsConfirmed: true, noConversionOrCarryoverBasisConfirmed: true,
    legacyCostBasisMeaning: "gross_basis_less_business_section179_before_bonus",
    grossCostBasis: "10000", businessUsePercentage: "100", section179BusinessDeduction: "0", bonusBusinessDeduction: "0",
    assetSnapshot: { ...asset },
  } };
}

describe("MACRS actual basis source schema", () => {
  it("rejects a gross original that contradicts the retained exact basis", () => {
    const original = originalAsset();
    const costBasis = "1000000000000000000000";
    const asset = {
      ...original, costBasis,
      basisSources: {
        ...original.basisSources, grossCostBasis: "1000000000000000000005",
        assetSnapshot: { ...original.basisSources.assetSnapshot, costBasis },
      },
    };
    expect(() => resolveMACRSAssetBasisSources(asset, 2026)).toThrow(/legacy cost basis conflicts/i);
    expect(DepreciableAssetSchema.safeParse(asset).success).toBe(false);
  });

  it("derives exact business, pre-bonus and regular bases for a reconciled original", () => {
    const original = originalAsset();
    const retained = { costBasis: "10000000000000000000004.01", businessUsePercentage: 60 };
    const asset = DepreciableAssetSchema.parse({
      ...original, ...retained,
      basisSources: {
        ...original.basisSources, grossCostBasis: "10000000000000000000005.02", businessUsePercentage: "60",
        section179BusinessDeduction: "1.01", bonusBusinessDeduction: "2.01",
        assetSnapshot: { ...original.basisSources.assetSnapshot, ...retained },
      },
    });
    const basis = resolveMACRSAssetBasisSources(asset, 2026)!;
    expect(basis.businessBasis.toFixed()).toBe("6000000000000000000003.012");
    expect(basis.midQuarterTestBasis.toFixed()).toBe("6000000000000000000002.002");
    expect(basis.regularMacrsBasis.toFixed()).toBe("5999999999999999999999.992");
  });

  it("preserves a complete original packet and rejects unknown missing or contradictory facts", () => {
    const original = originalAsset();
    const parsed = DepreciableAssetSchema.safeParse(original);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toHaveProperty("basisSources", original.basisSources);
    for (const field of ["grossCostBasis", "businessUsePercentage", "section179BusinessDeduction", "bonusBusinessDeduction", "sourceReference", "grossBasisSourceReference", "businessUseSourceReference", "section179SourceReference", "bonusSourceReference", "confirmed", "assetSnapshot", "noOtherBasisAdjustmentsConfirmed", "noConversionOrCarryoverBasisConfirmed"]) {
      const incomplete = { ...original, basisSources: { ...original.basisSources, [field]: undefined } };
      expect(DepreciableAssetSchema.safeParse(incomplete).success, field).toBe(false);
    }
    expect(DepreciableAssetSchema.safeParse({ ...original, basisSources: {} }).success).toBe(false);
    expect(DepreciableAssetSchema.safeParse({ ...original, placedInServiceDate: "2026-02-31" }).success).toBe(false);
    expect(DepreciableAssetSchema.safeParse({ ...original, basisSources: { ...original.basisSources, confirmed: false } }).success).toBe(false);
    expect(DepreciableAssetSchema.safeParse({ ...original, basisSources: { ...original.basisSources, extraUnknown: true } }).success).toBe(false);
    expect(DepreciableAssetSchema.safeParse({ costBasis: "10000", placedInServiceDate: "2026-02", recoveryPeriod: "5" }).success).toBe(true);
    const zeroAsset = { ...original, costBasis: "0" };
    zeroAsset.basisSources = { ...original.basisSources, grossCostBasis: "0", assetSnapshot: { ...original.basisSources.assetSnapshot, costBasis: "0" } };
    const zero = DepreciableAssetSchema.safeParse(zeroAsset);
    expect(zero.success).toBe(true);
    if (zero.success) expect(zero.data.basisSources?.grossCostBasis).toBe("0");
    for (const value of ["", "NaN", "Infinity", "-1", "1e3", "private-invalid-amount-marker"]) {
      expect(() => DepreciableAssetSchema.safeParse({ ...original, basisSources: { ...original.basisSources, businessUsePercentage: value } })).not.toThrow();
      expect(DepreciableAssetSchema.safeParse({ ...original, basisSources: { ...original.basisSources, grossCostBasis: value } }).success).toBe(false);
    }
    for (const [year, date, valid] of [[2024, "2024-02-29", true], [2026, "2026-02-29", false], [2026, "2026-01-00", false], [2026, "2026-12-99", false]] as const) {
      const asset = { ...original, placedInServiceDate: date, basisSources: { ...original.basisSources, sourceTaxYear: year, assetSnapshot: { ...original.basisSources.assetSnapshot, placedInServiceDate: date } } };
      expect(DepreciableAssetSchema.safeParse(asset).success, date).toBe(valid);
    }
  });
});

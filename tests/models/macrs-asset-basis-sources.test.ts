/** Spec: spec/federal/macrs-asset-basis-sources.yaml. */
import { describe, expect, it } from "vitest";
import { DepreciableAssetSchema } from "@/models/inputs.js";

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

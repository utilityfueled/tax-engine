import { describe, expect, it } from "vitest";
import { TAX_CONSTANTS, getNJResidentConstants } from "@/models/constants.js";

describe("NJ resident shared constants", () => {
  it("exposes validated 2025 resident thresholds, exemptions, property tax settings, and rate tables", () => {
    const njConstants = getNJResidentConstants(2025);

    expect(TAX_CONSTANTS[2025].state?.njResident).toBe(njConstants);
    expect(njConstants.filingThresholds.single.toNumber()).toBe(10000);
    expect(njConstants.filingThresholds.married_filing_jointly.toNumber()).toBe(20000);
    expect(njConstants.exemptionAmounts.veteran.toNumber()).toBe(6000);
    expect(njConstants.propertyTax.deductionCap.toNumber()).toBe(15000);
    expect(njConstants.propertyTax.creditIncomeLimit.toNumber()).toBe(250000);
    expect(njConstants.taxRateTables.tableA[0]?.rate.toString()).toBe("0.014");
    expect(njConstants.taxRateTables.tableB[4]?.max?.toNumber()).toBe(150000);
  });

  it("rejects years without validated NJ resident constants", () => {
    expect(() => getNJResidentConstants(2024)).toThrow(
      "NJ resident tax constants not available for year 2024"
    );
  });
});

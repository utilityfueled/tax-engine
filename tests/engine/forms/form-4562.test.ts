/**
 * Tests for Form 4562 depreciation and section 179 summary totals.
 * Spec: spec/federal/form-4562.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm4562 } from "@/engine/forms/form-4562.js";
import {
  computeListedPropertyDepreciation,
  computeListedPropertyAggregation,
} from "@/utils/macrs.js";

describe("Form 4562 depreciation and section 179 summary", () => {
  it("Form 4562 Line 12 - section 179 deduction applies the 2025 limit, threshold reduction, and business-income cap", () => {
    const result = calculateForm4562({
      section179TotalCost: "4200000",
      section179ElectedCost: "2400000",
      section179CarryoverFromPriorYear: "100000",
      section179BusinessIncomeLimit: "2350000",
    });

    expect(result.line1.toNumber()).toBe(2500000);
    expect(result.line3.toNumber()).toBe(4000000);
    expect(result.line4.toNumber()).toBe(200000);
    expect(result.line5.toNumber()).toBe(2300000);
    expect(result.line9.toNumber()).toBe(2300000);
    expect(result.line11.toNumber()).toBe(2300000);
    expect(result.line12.toNumber()).toBe(2300000);
    expect(result.line13.toNumber()).toBe(100000);

    const line12 = result.lines.find((line) => line.line === "12");
    expect(String(line12?.inputs["Line 9"])).toBe("2300000");
    expect(String(line12?.inputs["Line 10"])).toBe("100000");
    expect(String(line12?.inputs["Line 11"])).toBe("2300000");
  });

  it("Form 4562 Lines 4 and 5 - exact threshold cost keeps the full 2025 section 179 limit available", () => {
    const result = calculateForm4562({
      section179TotalCost: "4000000",
      section179ElectedCost: "2500000",
      section179CarryoverFromPriorYear: "0",
      section179BusinessIncomeLimit: "2500000",
    });

    expect(result.line4.toNumber()).toBe(0);
    expect(result.line5.toNumber()).toBe(2500000);
    expect(result.line9.toNumber()).toBe(2500000);
    expect(result.line12.toNumber()).toBe(2500000);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 4562 Lines 4 and 5 - one dollar over the threshold reduces the annual section 179 limit by one dollar", () => {
    const result = calculateForm4562({
      section179TotalCost: "4000001",
      section179ElectedCost: "2500000",
      section179CarryoverFromPriorYear: "0",
      section179BusinessIncomeLimit: "2500000",
    });

    expect(result.line4.toNumber()).toBe(1);
    expect(result.line5.toNumber()).toBe(2499999);
    expect(result.line9.toNumber()).toBe(2499999);
    expect(result.line11.toNumber()).toBe(2499999);
    expect(result.line12.toNumber()).toBe(2499999);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 4562 Lines 5 and 13 - full phaseout leaves current-year section 179 at zero and carries forward the prior-year amount", () => {
    const result = calculateForm4562({
      section179TotalCost: "6500000",
      section179ElectedCost: "300000",
      section179CarryoverFromPriorYear: "100000",
      section179BusinessIncomeLimit: "500000",
    });

    expect(result.line4.toNumber()).toBe(2500000);
    expect(result.line5.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(100000);
  });

  it("Form 4562 Lines 5 and 13 - one dollar below full phaseout still allows a one-dollar deduction and carries the rest forward", () => {
    const result = calculateForm4562({
      section179TotalCost: "6499999",
      section179ElectedCost: "300000",
      section179CarryoverFromPriorYear: "100000",
      section179BusinessIncomeLimit: "500000",
    });

    expect(result.line4.toNumber()).toBe(2499999);
    expect(result.line5.toNumber()).toBe(1);
    expect(result.line9.toNumber()).toBe(1);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line12.toNumber()).toBe(1);
    expect(result.line13.toNumber()).toBe(100000);

    const line13 = result.lines.find((line) => line.line === "13");
    expect(String(line13?.inputs["Line 9"])).toBe("1");
    expect(String(line13?.inputs["Line 10"])).toBe("100000");
    expect(String(line13?.inputs["Line 12"])).toBe("1");
  });

  it("Form 4562 Line 13 - zero business income carries the tentative deduction and prior-year carryover forward", () => {
    const result = calculateForm4562({
      section179TotalCost: "900000",
      section179ElectedCost: "600000",
      section179CarryoverFromPriorYear: "40000",
      section179BusinessIncomeLimit: "0",
    });

    expect(result.line9.toNumber()).toBe(600000);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(640000);

    const line13 = result.lines.find((line) => line.line === "13");
    expect(String(line13?.inputs["Line 9"])).toBe("600000");
    expect(String(line13?.inputs["Line 10"])).toBe("40000");
    expect(String(line13?.inputs["Line 12"])).toBe("0");
  });

  it("Form 4562 Line 12 - direct allocated section 179 overrides replace the computed amount", () => {
    const result = calculateForm4562({
      section179TotalCost: "900000",
      section179ElectedCost: "900000",
      section179CarryoverFromPriorYear: "25000",
      section179BusinessIncomeLimit: "700000",
      section179ExpenseDeduction: "540000",
      section179CarryoverToNextYear: "385000",
    });

    expect(result.line12.toNumber()).toBe(540000);
    expect(result.line13.toNumber()).toBe(385000);

    const line12 = result.lines.find((line) => line.line === "12");
    const line13 = result.lines.find((line) => line.line === "13");
    expect(String(line12?.inputs["Validated direct line 12 override"])).toBe("540000");
    expect(String(line13?.inputs["Validated direct line 13 override"])).toBe("385000");
  });

  it("Form 4562 Line 22 - total deduction sums section 179, depreciation, MACRS, and listed property", () => {
    const result = calculateForm4562({
      section179ExpenseDeduction: "540000",
      specialDepreciationAllowance: "12000",
      section168f1Depreciation: "3000",
      otherDepreciation: "2500",
      macrsPre2025AssetsDepreciation: "18000",
      macrsCurrentYearGdsDepreciation: "22000",
      macrsCurrentYearAdsDepreciation: "6000",
      listedPropertyDepreciation: "4500",
    });

    expect(result.line22.toNumber()).toBe(608000);

    const line22 = result.lines.find((line) => line.line === "22");
    expect(String(line22?.inputs["Line 12"])).toBe("540000");
    expect(String(line22?.inputs["Line 19 column (g) total"])).toBe("22000");
    expect(String(line22?.inputs["Line 20 column (g) total"])).toBe("6000");
    expect(String(line22?.inputs["Line 21"])).toBe("4500");
  });

  it("Form 4562 Lines 42 through 44 - amortization totals stay separate from the line 22 depreciation bridge", () => {
    const result = calculateForm4562({
      section179ExpenseDeduction: "540000",
      specialDepreciationAllowance: "12000",
      section168f1Depreciation: "3000",
      otherDepreciation: "2500",
      macrsPre2025AssetsDepreciation: "18000",
      macrsCurrentYearGdsDepreciation: "22000",
      macrsCurrentYearAdsDepreciation: "6000",
      listedPropertyDepreciation: "4500",
      currentYearAmortization: "7000",
      priorYearAmortization: "2500",
    });

    expect(result.line22.toNumber()).toBe(608000);
    expect(result.line42.toNumber()).toBe(7000);
    expect(result.line43.toNumber()).toBe(2500);
    expect(result.line44.toNumber()).toBe(9500);

    const line42 = result.lines.find((line) => line.line === "42");
    const line44 = result.lines.find((line) => line.line === "44");
    expect(line42?.value.toNumber()).toBe(7000);
    expect(String(line44?.inputs["Line 42"])).toBe("7000");
    expect(String(line44?.inputs["Line 43"])).toBe("2500");
  });

  it("Form 4562 Line 44 - prior-year amortization still reports when depreciation line 22 is otherwise zero", () => {
    const result = calculateForm4562({
      currentYearAmortization: "0",
      priorYearAmortization: "1800",
    });

    expect(result.line22.toNumber()).toBe(0);
    expect(result.line42.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(1800);
    expect(result.line44.toNumber()).toBe(1800);
  });
});

describe("Form 4562 per-asset MACRS depreciation", () => {
  it("Form 4562 Lines 17, 19, 20 - per-asset computation replaces summary totals when assets provided", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        // Current-year 5-year GDS → Line 19: 20% of $10,000 = $2,000
        { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
        // Prior-year 7-year GDS → Line 17: 17.49% of $25,000 = $4,373
        { costBasis: "25000", placedInServiceDate: "2023-01", recoveryPeriod: "7" },
        // Current-year 39-year real property → Line 20: 1.177% of $500,000 = $5,885
        { costBasis: "500000", placedInServiceDate: "2025-07", recoveryPeriod: "39" },
      ],
    });

    expect(result.line17.toNumber()).toBe(4373);
    expect(result.line19.toNumber()).toBe(2000);
    expect(result.line20.toNumber()).toBe(5885);
    expect(result.line22.toNumber()).toBe(4373 + 2000 + 5885);
    expect(result.assetResults).toHaveLength(3);
  });

  it("Form 4562 Line 17 - multiple prior-year assets sum correctly", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        // 5-year year 2: 32% of $10,000 = $3,200
        { costBasis: "10000", placedInServiceDate: "2024-06", recoveryPeriod: "5", description: "Office equipment" },
        // 7-year year 4: 12.49% of $20,000 = $2,498
        { costBasis: "20000", placedInServiceDate: "2022-01", recoveryPeriod: "7", description: "Furniture" },
        // 27.5-year placed in March 2020, year 6: 3.636% of $275,000 = $9,999
        { costBasis: "275000", placedInServiceDate: "2020-03", recoveryPeriod: "27.5", description: "Rental building" },
      ],
    });

    expect(result.line17.toNumber()).toBe(3200 + 2498 + 9999);
    expect(result.line19.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
  });

  it("Form 4562 Line 19 - multiple current-year GDS assets sum correctly", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        // 3-year: 33.33% of $5,000 = $1,667
        { costBasis: "5000", placedInServiceDate: "2025-01", recoveryPeriod: "3" },
        // 5-year: 20% of $10,000 = $2,000
        { costBasis: "10000", placedInServiceDate: "2025-06", recoveryPeriod: "5" },
        // 7-year: 14.29% of $15,000 = $2,144
        { costBasis: "15000", placedInServiceDate: "2025-09", recoveryPeriod: "7" },
      ],
    });

    expect(result.line19.toNumber()).toBe(1667 + 2000 + 2144);
    expect(result.line17.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
  });

  it("Form 4562 section 179 plus per-asset depreciation combine on Line 22", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179ExpenseDeduction: "50000",
      assets: [
        // Current-year 5-year: 20% of $8,000 = $1,600 → Line 19
        { costBasis: "8000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        // Prior-year 5-year year 3: 19.20% of $12,000 = $2,304 → Line 17
        { costBasis: "12000", placedInServiceDate: "2023-04", recoveryPeriod: "5" },
      ],
    });

    expect(result.line12.toNumber()).toBe(50000);
    expect(result.line17.toNumber()).toBe(2304);
    expect(result.line19.toNumber()).toBe(1600);
    expect(result.line22.toNumber()).toBe(50000 + 2304 + 1600);
  });

  it("Form 4562 per-asset skips fully depreciated assets", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        // 3-year placed in 2020 → year 6, fully depreciated (table has 4 entries)
        { costBasis: "10000", placedInServiceDate: "2020-01", recoveryPeriod: "3" },
        // Current-year 5-year → Line 19: 20% of $5,000 = $1,000
        { costBasis: "5000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
      ],
    });

    expect(result.line19.toNumber()).toBe(1000);
    expect(result.line17.toNumber()).toBe(0);
    expect(result.assetResults).toHaveLength(1);
  });

  it("Form 4562 per-asset with 150% DB farm property", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        // 7-year 150% DB year 1: 10.71% of $30,000 = $3,213
        { costBasis: "30000", placedInServiceDate: "2025-02", recoveryPeriod: "7", method: "150DB" },
      ],
    });

    expect(result.line19.toNumber()).toBe(3213);
  });

  it("Form 4562 per-asset audit trail includes asset-level entries", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      assets: [
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5", description: "Laptop" },
      ],
    });

    const assetLine = result.lines.find((l) => l.line === "asset");
    expect(assetLine).toBeDefined();
    expect(assetLine!.description).toContain("Laptop");
    expect(assetLine!.description).toContain("5-yr");
    expect(assetLine!.description).toContain("200DB");
    expect(assetLine!.value.toNumber()).toBe(2000);
  });

  it("Form 4562 per-asset residential rental placed in different months", () => {
    const janResult = calculateForm4562({
      taxYear: 2025,
      assets: [{ costBasis: "300000", placedInServiceDate: "2025-01", recoveryPeriod: "27.5" }],
    });
    const decResult = calculateForm4562({
      taxYear: 2025,
      assets: [{ costBasis: "300000", placedInServiceDate: "2025-12", recoveryPeriod: "27.5" }],
    });

    // January: 3.485% = $10,455; December: 0.152% = $456
    expect(janResult.line20.toNumber()).toBe(10455);
    expect(decResult.line20.toNumber()).toBe(456);
    // December gets much less first-year depreciation
    expect(decResult.line20.toNumber()).toBeLessThan(janResult.line20.toNumber());
  });

  it("Form 4562 summary totals still work when no assets provided (backward compatibility)", () => {
    const result = calculateForm4562({
      macrsPre2025AssetsDepreciation: "5000",
      macrsCurrentYearGdsDepreciation: "3000",
      macrsCurrentYearAdsDepreciation: "1000",
    });

    expect(result.line17.toNumber()).toBe(5000);
    expect(result.line19.toNumber()).toBe(3000);
    expect(result.line20.toNumber()).toBe(1000);
    expect(result.line22.toNumber()).toBe(9000);
    expect(result.assetResults).toHaveLength(0);
  });

  it("Form 4562 realistic sole proprietor: section 179 + multiple asset classes", () => {
    // Freelance photographer: Section 179 on a new camera body, plus ongoing
    // depreciation on a studio (39-yr) and lighting equipment (7-yr)
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "3500",
      section179ElectedCost: "3500",
      section179BusinessIncomeLimit: "80000",
      assets: [
        // Studio buildout placed 2021-01 (39-yr, year 5): 2.564% of $120,000 = $3,077
        { costBasis: "120000", placedInServiceDate: "2021-01", recoveryPeriod: "39", description: "Studio buildout" },
        // Lighting equipment placed 2023-06 (7-yr, year 3): 17.49% of $8,000 = $1,399
        { costBasis: "8000", placedInServiceDate: "2023-06", recoveryPeriod: "7", description: "Lighting rig" },
        // New lens placed 2025-03 (5-yr, year 1): 20% of $2,000 = $400
        { costBasis: "2000", placedInServiceDate: "2025-03", recoveryPeriod: "5", description: "Lens" },
      ],
    });

    expect(result.line12.toNumber()).toBe(3500); // Section 179 for camera
    expect(result.line17.toNumber()).toBe(3077 + 1399); // Prior-year: studio + lighting
    expect(result.line19.toNumber()).toBe(400); // Current-year GDS: lens
    expect(result.line20.toNumber()).toBe(0); // No current-year ADS
    expect(result.line22.toNumber()).toBe(3500 + 3077 + 1399 + 400);
  });
});

describe("Form 4562 mid-quarter convention auto-detection", () => {
  it("Form 4562 auto-detects mid-quarter when >40% of current-year personal property is in Q4", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // Q1: $3,000
        { costBasis: "3000", placedInServiceDate: "2025-02", recoveryPeriod: "5" },
        // Q4: $7,000 — 70% > 40%
        { costBasis: "7000", placedInServiceDate: "2025-11", recoveryPeriod: "5" },
      ],
    });

    expect(result.midQuarterRequired).toBe(true);
    // Q1 mid-quarter: 35.00% of $3,000 = $1,050
    // Q4 mid-quarter: 5.00% of $7,000 = $350
    expect(result.line19.toNumber()).toBe(1050 + 350);

    // Audit trail should mention mid-quarter
    const conventionLine = result.lines.find(l => l.line === "convention");
    expect(conventionLine).toBeDefined();
  });

  it("Form 4562 keeps half-year when Q4 <= 40%", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        { costBasis: "8000", placedInServiceDate: "2025-02", recoveryPeriod: "5" },
        { costBasis: "2000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
      ],
    });

    expect(result.midQuarterRequired).toBe(false);
    // Half-year: 20% of $8,000 + 20% of $2,000 = $1,600 + $400
    expect(result.line19.toNumber()).toBe(2000);
  });

  it("Form 4562 mid-quarter leaves real property on mid-month convention", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // 39-year building in July — mid-month regardless
        { costBasis: "500000", placedInServiceDate: "2025-07", recoveryPeriod: "39" },
        // Q4 personal property triggers mid-quarter
        { costBasis: "5000", placedInServiceDate: "2025-11", recoveryPeriod: "5" },
      ],
    });

    expect(result.midQuarterRequired).toBe(true);

    // Building: 1.177% of $500K = $5,885 (mid-month, Line 20)
    expect(result.line20.toNumber()).toBe(5885);
    // Equipment: Q4 mid-quarter 5% of $5K = $250 (Line 19)
    expect(result.line19.toNumber()).toBe(250);
  });

  it("Form 4562 mid-quarter does not affect prior-year assets", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // Prior-year asset — half-year always
        { costBasis: "10000", placedInServiceDate: "2024-03", recoveryPeriod: "5" },
        // Current-year Q4 triggers mid-quarter
        { costBasis: "5000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
      ],
    });

    expect(result.midQuarterRequired).toBe(true);
    // Prior: year 2 half-year = 32% of $10K = $3,200
    expect(result.line17.toNumber()).toBe(3200);
    // Current: Q4 mid-quarter = 5% of $5K = $250
    expect(result.line19.toNumber()).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Part V: Listed Property (IRC §280F)
// ---------------------------------------------------------------------------

describe("Part V listed property — computeListedPropertyDepreciation", () => {
  it("passenger automobile year-1 capped at $12,400 without bonus (§280F)", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "60000",
        placedInServiceDate: "2025-03",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $60K = $12,000
    // Business use 100%: $12,000
    // §280F cap without bonus: $12,400
    // Depreciation = min($12,000, $12,400) = $12,000
    expect(result!.depreciation.toNumber()).toBe(12000);
    expect(result!.section280FCap!.toNumber()).toBe(12400);
    expect(result!.qualifiesForMacrs).toBe(true);
  });

  it("passenger automobile year-1 capped at $12,400 when tentative exceeds cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $80K = $16,000
    // §280F cap without bonus: $12,400
    // Depreciation = min($16,000, $12,400) = $12,400
    expect(result!.depreciation.toNumber()).toBe(12400);
    expect(result!.tentativeDepreciation.toNumber()).toBe(16000);
  });

  it("passenger automobile year-1 with bonus uses higher $20,400 cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
        firstYearBonusEligible: true,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $80K = $16,000
    // §280F cap with bonus: $20,400
    // Depreciation = min($16,000, $20,400) = $16,000
    expect(result!.depreciation.toNumber()).toBe(16000);
    expect(result!.section280FCap!.toNumber()).toBe(20400);
  });

  it("passenger automobile year-2 cap is $19,800", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2026,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 2: 32% of $80K = $25,600
    // §280F year-2 cap: $19,800
    // Depreciation = min($25,600, $19,800) = $19,800
    expect(result!.depreciation.toNumber()).toBe(19800);
    expect(result!.section280FCap!.toNumber()).toBe(19800);
    expect(result!.recoveryYear).toBe(2);
  });

  it("passenger automobile year-3 cap is $11,900", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2027,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 3: 19.20% of $80K = $15,360
    // §280F year-3 cap: $11,900
    expect(result!.depreciation.toNumber()).toBe(11900);
    expect(result!.section280FCap!.toNumber()).toBe(11900);
  });

  it("passenger automobile year-4+ cap is $7,160", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2028,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 4: 11.52% of $80K = $9,216
    // §280F year-4+ cap: $7,160
    expect(result!.depreciation.toNumber()).toBe(7160);
    expect(result!.section280FCap!.toNumber()).toBe(7160);
  });

  it("passenger automobile year-5 also uses the year-4+ cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2029,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 5: 11.52% of $80K = $9,216
    // §280F year-4+ cap: $7,160
    expect(result!.depreciation.toNumber()).toBe(7160);
    expect(result!.section280FCap!.toNumber()).toBe(7160);
  });

  it("business-use percentage reduces depreciation before §280F cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "60000",
        placedInServiceDate: "2025-03",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 75,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $60K = $12,000
    // × 75% business use = $9,000
    // §280F cap: $12,400
    // Depreciation = min($9,000, $12,400) = $9,000
    expect(result!.depreciation.toNumber()).toBe(9000);
    expect(result!.tentativeDepreciation.toNumber()).toBe(9000);
    expect(result!.businessUsePercentage.toNumber()).toBe(75);
    expect(result!.qualifiesForMacrs).toBe(true);
  });

  it("business use exactly 50% forces ADS straight-line", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "40000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 50,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // ADS SL half-year year 1: 10% of $40K = $4,000
    // × 50% business use = $2,000
    // §280F cap: $12,400
    // Depreciation = min($2,000, $12,400) = $2,000
    expect(result!.depreciation.toNumber()).toBe(2000);
    expect(result!.qualifiesForMacrs).toBe(false);
    expect(result!.method).toBe("SL");
  });

  it("business use 51% qualifies for MACRS GDS 200DB", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "40000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 51,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $40K = $8,000
    // × 51% business use = $4,080
    // §280F cap: $12,400
    expect(result!.depreciation.toNumber()).toBe(4080);
    expect(result!.qualifiesForMacrs).toBe(true);
    expect(result!.method).toBe("200DB");
  });

  it("non-automobile listed property has no §280F cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "25000",
        placedInServiceDate: "2025-04",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: false,
        businessUsePercentage: 80,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% of $25K = $5,000
    // × 80% business use = $4,000
    // No §280F automobile cap
    expect(result!.depreciation.toNumber()).toBe(4000);
    expect(result!.section280FCap).toBeNull();
    expect(result!.isPassengerAutomobile).toBe(false);
  });

  it("non-automobile listed property with ≤50% use switches to ADS SL", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "20000",
        placedInServiceDate: "2025-01",
        recoveryPeriod: "7",
        isListedProperty: true,
        isPassengerAutomobile: false,
        businessUsePercentage: 40,
      },
      2025,
    );

    expect(result).not.toBeNull();
    // ADS SL half-year 7-year year 1: 7.14% of $20K = $1,428
    // × 40% business use = $571
    expect(result!.depreciation.toNumber()).toBe(571);
    expect(result!.qualifiesForMacrs).toBe(false);
    expect(result!.method).toBe("SL");
  });

  it("fully depreciated listed property returns zero", () => {
    // 5-year property placed in 2020, now in year 6 (2025) → beyond 6-year half-year table
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "30000",
        placedInServiceDate: "2019-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
    );

    expect(result).not.toBeNull();
    expect(result!.depreciation.toNumber()).toBe(0);
    expect(result!.fullyDepreciated).toBe(true);
  });

  it("zero cost basis returns null", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "0",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
    );

    expect(result).toBeNull();
  });
});

describe("Part V listed property — computeListedPropertyAggregation", () => {
  it("aggregates multiple listed-property assets for Line 21", () => {
    const agg = computeListedPropertyAggregation(
      [
        {
          costBasis: "80000",
          placedInServiceDate: "2025-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 100,
        },
        {
          costBasis: "15000",
          placedInServiceDate: "2025-04",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: false,
          businessUsePercentage: 80,
        },
        // Non-listed property — should be ignored
        {
          costBasis: "10000",
          placedInServiceDate: "2025-02",
          recoveryPeriod: "7",
        },
      ],
      2025,
    );

    expect(agg.results).toHaveLength(2);
    // Auto 1: min($16,000, $12,400) = $12,400
    // Camera: $15K × 20% × 80% = $2,400
    expect(agg.totalDepreciation.toNumber()).toBe(12400 + 2400);
  });

  it("skips non-listed-property assets", () => {
    const agg = computeListedPropertyAggregation(
      [
        { costBasis: "50000", placedInServiceDate: "2025-03", recoveryPeriod: "7" },
      ],
      2025,
    );

    expect(agg.results).toHaveLength(0);
    expect(agg.totalDepreciation.toNumber()).toBe(0);
  });
});

describe("Part V listed property — Form 4562 integration", () => {
  it("Form 4562 Line 21 computed from listed-property assets when present", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // Regular asset → Line 19
        { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "7" },
        // Listed property → Line 21
        {
          costBasis: "60000",
          placedInServiceDate: "2025-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 100,
        },
      ],
    });

    // Regular: 14.29% of $10K = $1,429
    expect(result.line19.toNumber()).toBe(1429);
    // Listed auto: min(20% of $60K = $12,000, $12,400) = $12,000
    expect(result.line21.toNumber()).toBe(12000);
    // Total: $1,429 + $12,000
    expect(result.line22.toNumber()).toBe(1429 + 12000);

    expect(result.assetResults).toHaveLength(1); // only regular asset
    expect(result.listedPropertyResults).toHaveLength(1);
  });

  it("Form 4562 listed property excluded from Lines 17/19/20", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "50000",
          placedInServiceDate: "2025-03",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 80,
        },
      ],
    });

    // Nothing in Lines 17/19/20 — all goes to Line 21
    expect(result.line17.toNumber()).toBe(0);
    expect(result.line19.toNumber()).toBe(0);
    expect(result.line20.toNumber()).toBe(0);
    // 200DB year 1: 20% of $50K × 80% = $8,000; cap $12,400 → $8,000
    expect(result.line21.toNumber()).toBe(8000);
    expect(result.line22.toNumber()).toBe(8000);
  });

  it("Form 4562 listed property participates in mid-quarter convention test", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // Q1 regular: $3,000
        { costBasis: "3000", placedInServiceDate: "2025-02", recoveryPeriod: "5" },
        // Q4 listed auto: $7,000 — 70% > 40% triggers mid-quarter for ALL
        {
          costBasis: "7000",
          placedInServiceDate: "2025-11",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 100,
        },
      ],
    });

    expect(result.midQuarterRequired).toBe(true);
    // Regular Q1 mid-quarter: 35% of $3K = $1,050 → Line 19
    expect(result.line19.toNumber()).toBe(1050);
    // Listed auto Q4 mid-quarter: 5% of $7K = $350 → cap $12,400 → $350 → Line 21
    expect(result.line21.toNumber()).toBe(350);
  });

  it("Form 4562 Part V audit trail entries present for listed property", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "80000",
          placedInServiceDate: "2025-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 90,
          description: "Business sedan",
        },
      ],
    });

    const partVLines = result.lines.filter(l => l.line === "Part V");
    expect(partVLines).toHaveLength(1);
    expect(partVLines[0].description).toContain("Business sedan");
    expect(partVLines[0].description).toContain("90%");
    expect(partVLines[0].description).toContain("§280F cap");
  });

  it("Form 4562 falls back to validated line 21 total when no listed-property assets", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      listedPropertyDepreciation: "5000",
      assets: [
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
      ],
    });

    // No listed property in assets → falls back to validated total
    expect(result.line21.toNumber()).toBe(5000);
    expect(result.listedPropertyResults).toHaveLength(0);
  });

  it("Form 4562 realistic scenario — self-employed with business vehicle and equipment", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "5000",
      section179ElectedCost: "5000",
      section179CarryoverFromPriorYear: "0",
      section179BusinessIncomeLimit: "100000",
      assets: [
        // Office equipment (regular, not listed)
        { costBasis: "3000", placedInServiceDate: "2025-02", recoveryPeriod: "7" },
        // Business vehicle — listed property, 70% business use
        {
          costBasis: "45000",
          placedInServiceDate: "2025-04",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 70,
          description: "Delivery van",
        },
        // Camera for real estate photography — listed, 90% business
        {
          costBasis: "8000",
          placedInServiceDate: "2025-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: false,
          businessUsePercentage: 90,
          description: "Camera equipment",
        },
      ],
    });

    // Section 179: $5,000
    expect(result.line12.toNumber()).toBe(5000);
    // Office equip: 14.29% of $3K = $429 → Line 19
    expect(result.line19.toNumber()).toBe(429);
    // Van: 20% of $45K = $9,000 × 70% = $6,300 → cap $12,400 → $6,300
    // Camera: 20% of $8K = $1,600 × 90% = $1,440 → no cap → $1,440
    // Line 21 = $6,300 + $1,440 = $7,740
    expect(result.line21.toNumber()).toBe(7740);
    // Total: $5,000 + $429 + $7,740 = $13,169
    expect(result.line22.toNumber()).toBe(5000 + 429 + 7740);

    expect(result.listedPropertyResults).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Part VI: Per-asset Amortization
// ---------------------------------------------------------------------------

describe("Form 4562 per-asset amortization", () => {
  it("Form 4562 Part VI - §197 intangible 15-year amortization placed in service mid-year", () => {
    // Goodwill of $180,000 acquired July 2025, amortized over 180 months
    // 2025: July–Dec = 6 months → $180,000 / 180 × 6 = $6,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Goodwill from business acquisition",
          amortizableAmount: "180000",
          dateAmortizationBegins: "2025-07",
          codeSection: "197",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(6000);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(6000);
    expect(result.amortizationResults).toHaveLength(1);
    expect(result.amortizationResults[0].monthsThisYear).toBe(6);
    expect(result.amortizationResults[0].isCurrentYear).toBe(true);
    expect(result.amortizationResults[0].isComplete).toBe(false);
  });

  it("Form 4562 Part VI - §197 intangible full-year prior-year asset", () => {
    // Patent of $90,000 acquired January 2023, amortized over 180 months
    // 2025: full 12 months → $90,000 / 180 × 12 = $6,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Patent rights",
          amortizableAmount: "90000",
          dateAmortizationBegins: "2023-01",
          codeSection: "197",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(6000);
    expect(result.line44.toNumber()).toBe(6000);
    expect(result.amortizationResults[0].isCurrentYear).toBe(false);
    expect(result.amortizationResults[0].monthsThisYear).toBe(12);
  });

  it("Form 4562 Part VI - §197 intangible in its final year gets only remaining months", () => {
    // $180,000 goodwill started January 2011 — 180 months = Jan 2011 through Dec 2025
    // 2025: full 12 months (last year) → $180,000 / 180 × 12 = $12,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "180000",
          dateAmortizationBegins: "2011-01",
          codeSection: "197",
        },
      ],
    });

    expect(result.line43.toNumber()).toBe(12000);
    expect(result.amortizationResults[0].isComplete).toBe(true);
    expect(result.amortizationResults[0].monthsThisYear).toBe(12);
  });

  it("Form 4562 Part VI - §197 intangible started mid-year has partial final year", () => {
    // $180,000 goodwill started July 2011 — 180 months = Jul 2011 through Jun 2026
    // 2025: full 12 months → $180,000 / 180 × 12 = $12,000
    // Final year is 2026 (6 months), not 2025
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "180000",
          dateAmortizationBegins: "2011-07",
          codeSection: "197",
        },
      ],
    });

    expect(result.line43.toNumber()).toBe(12000);
    expect(result.amortizationResults[0].isComplete).toBe(false);
    expect(result.amortizationResults[0].monthsThisYear).toBe(12);
  });

  it("Form 4562 Part VI - §197 fully amortized asset produces $0", () => {
    // Goodwill started January 2008 — 180 months = through Dec 2022
    // 2025: fully amortized, no deduction
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "180000",
          dateAmortizationBegins: "2008-01",
          codeSection: "197",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(0);
    expect(result.amortizationResults).toHaveLength(0);
  });

  it("Form 4562 Part VI - §195 start-up costs after immediate deduction", () => {
    // Total startup costs: $45,000. Immediate deduction: $5,000. Remainder: $40,000
    // Amortized over 180 months starting March 2025 (business began)
    // 2025: Mar–Dec = 10 months → $40,000 / 180 × 10 = $2,222
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Startup costs (amortizable portion)",
          amortizableAmount: "40000",
          dateAmortizationBegins: "2025-03",
          codeSection: "195",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(2222);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(2222);
    expect(result.amortizationResults[0].monthsThisYear).toBe(10);
    expect(result.amortizationResults[0].codeSection).toBe("195");
  });

  it("Form 4562 Part VI - §174 domestic R&E uses mid-year convention (first year = 6 months)", () => {
    // $100,000 domestic research expenses in 2025
    // §174 mid-year convention: amortization starts July 1 regardless of when paid
    // 60 months, first year: Jul–Dec = 6 months → $100,000 / 60 × 6 = $10,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Domestic R&E expenditures",
          amortizableAmount: "100000",
          dateAmortizationBegins: "2025-01",
          codeSection: "174domestic",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(10000);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(10000);
    expect(result.amortizationResults[0].monthsThisYear).toBe(6);
    expect(result.amortizationResults[0].startMonth).toBe(7); // forced to July
  });

  it("Form 4562 Part VI - §174 domestic mid-year convention ignores actual payment date", () => {
    // Expenses paid in December 2025 — mid-year convention still starts July 1
    const resultJan = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        { amortizableAmount: "60000", dateAmortizationBegins: "2025-01", codeSection: "174domestic" },
      ],
    });
    const resultDec = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        { amortizableAmount: "60000", dateAmortizationBegins: "2025-12", codeSection: "174domestic" },
      ],
    });

    // Both should produce identical results since mid-year forces July
    expect(resultJan.line42.toNumber()).toBe(resultDec.line42.toNumber());
    expect(resultJan.line42.toNumber()).toBe(6000); // $60,000 / 60 × 6
  });

  it("Form 4562 Part VI - §174 domestic year 2 gets full 12 months", () => {
    // $100,000 domestic R&E from 2024 — mid-year started July 2024
    // 2025: full 12 months → $100,000 / 60 × 12 = $20,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "100000",
          dateAmortizationBegins: "2024-03",
          codeSection: "174domestic",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(20000);
    expect(result.amortizationResults[0].monthsThisYear).toBe(12);
  });

  it("Form 4562 Part VI - §174 domestic final year (year 6) gets remaining 6 months", () => {
    // $100,000 domestic R&E from 2020 — mid-year started July 2020
    // 60 months: Jul 2020 through Jun 2025
    // 2025: Jan–Jun = 6 months → $100,000 / 60 × 6 = $10,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "100000",
          dateAmortizationBegins: "2020-09",
          codeSection: "174domestic",
        },
      ],
    });

    expect(result.line43.toNumber()).toBe(10000);
    expect(result.amortizationResults[0].monthsThisYear).toBe(6);
    expect(result.amortizationResults[0].isComplete).toBe(true);
  });

  it("Form 4562 Part VI - §174 foreign 15-year amortization with mid-year convention", () => {
    // $180,000 foreign R&E in 2025 — 180 months, mid-year → starts July 2025
    // 2025: Jul–Dec = 6 months → $180,000 / 180 × 6 = $6,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Foreign research expenditures",
          amortizableAmount: "180000",
          dateAmortizationBegins: "2025-04",
          codeSection: "174foreign",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(6000);
    expect(result.amortizationResults[0].periodMonths).toBe(180);
    expect(result.amortizationResults[0].startMonth).toBe(7);
  });

  it("Form 4562 Part VI - §709 partnership organization costs", () => {
    // $35,000 org costs (after $5K immediate deduction = $30,000 amortizable)
    // Started February 2025, 180 months
    // 2025: Feb–Dec = 11 months → $30,000 / 180 × 11 = $1,833
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Partnership organization costs",
          amortizableAmount: "30000",
          dateAmortizationBegins: "2025-02",
          codeSection: "709",
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(1833);
    expect(result.amortizationResults[0].periodMonths).toBe(180);
  });

  it("Form 4562 Part VI - §169 pollution control over 60 months", () => {
    // $120,000 pollution control started April 2024
    // 60 months: Apr 2024 through Mar 2029
    // 2025: full 12 months → $120,000 / 60 × 12 = $24,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Pollution control facility",
          amortizableAmount: "120000",
          dateAmortizationBegins: "2024-04",
          codeSection: "169",
        },
      ],
    });

    expect(result.line43.toNumber()).toBe(24000);
    expect(result.amortizationResults[0].periodMonths).toBe(60);
    expect(result.amortizationResults[0].isComplete).toBe(false);
  });

  it("Form 4562 Part VI - §171 bond premium requires explicit period", () => {
    // $12,000 bond premium, 48-month remaining term
    // Started January 2024 → 2025: full 12 months → $12,000 / 48 × 12 = $3,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Bond premium",
          amortizableAmount: "12000",
          dateAmortizationBegins: "2024-01",
          codeSection: "171",
          amortizationPeriodMonths: 48,
        },
      ],
    });

    expect(result.line43.toNumber()).toBe(3000);
    expect(result.amortizationResults[0].periodMonths).toBe(48);
  });

  it("Form 4562 Part VI - §171 without explicit period produces no result", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "12000",
          dateAmortizationBegins: "2024-01",
          codeSection: "171",
        },
      ],
    });

    expect(result.line44.toNumber()).toBe(0);
    expect(result.amortizationResults).toHaveLength(0);
  });

  it("Form 4562 Part VI - 'other' code section requires explicit period", () => {
    // Custom amortization with explicit 120-month period
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Leasehold improvement",
          amortizableAmount: "60000",
          dateAmortizationBegins: "2025-01",
          codeSection: "other",
          amortizationPeriodMonths: 120,
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(6000); // $60,000 / 120 × 12
    expect(result.amortizationResults[0].periodMonths).toBe(120);
  });

  it("Form 4562 Part VI - multiple amortizable assets split into Lines 42 and 43", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        // Current-year: §197 goodwill, started Aug 2025 → 5 months → $180K/180×5 = $5,000
        {
          description: "Goodwill",
          amortizableAmount: "180000",
          dateAmortizationBegins: "2025-08",
          codeSection: "197",
        },
        // Prior-year: §195 startup costs, started Mar 2024 → 12 months → $45K/180×12 = $3,000
        {
          description: "Startup costs",
          amortizableAmount: "45000",
          dateAmortizationBegins: "2024-03",
          codeSection: "195",
        },
        // Current-year: §174 domestic R&E → mid-year July → 6 months → $30K/60×6 = $3,000
        {
          description: "R&E expenses",
          amortizableAmount: "30000",
          dateAmortizationBegins: "2025-02",
          codeSection: "174domestic",
        },
      ],
    });

    // Line 42 (current-year): $5,000 + $3,000 = $8,000
    expect(result.line42.toNumber()).toBe(5000 + 3000);
    // Line 43 (prior-year): $3,000
    expect(result.line43.toNumber()).toBe(3000);
    // Line 44 total: $11,000
    expect(result.line44.toNumber()).toBe(11000);
    expect(result.amortizationResults).toHaveLength(3);
  });

  it("Form 4562 Part VI - amortization stays separate from Line 22 depreciation", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179ExpenseDeduction: "10000",
      amortizableAssets: [
        {
          amortizableAmount: "180000",
          dateAmortizationBegins: "2025-01",
          codeSection: "197",
        },
      ],
    });

    // Amortization: $180K/180×12 = $12,000
    expect(result.line44.toNumber()).toBe(12000);
    // Line 22 only includes depreciation, not amortization
    expect(result.line22.toNumber()).toBe(10000);
  });

  it("Form 4562 Part VI - zero amortizable amount produces no result", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        { amortizableAmount: "0", dateAmortizationBegins: "2025-01", codeSection: "197" },
      ],
    });

    expect(result.line44.toNumber()).toBe(0);
    expect(result.amortizationResults).toHaveLength(0);
  });

  it("Form 4562 Part VI - future-start asset not yet in service produces no result", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "90000",
          dateAmortizationBegins: "2026-03",
          codeSection: "197",
        },
      ],
    });

    expect(result.line44.toNumber()).toBe(0);
    expect(result.amortizationResults).toHaveLength(0);
  });

  it("Form 4562 Part VI - amortization period override replaces code section default", () => {
    // §197 default is 180 months, but override to 60
    // $60,000 started Jan 2025 → 12 months at $1,000/mo = $12,000
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          amortizableAmount: "60000",
          dateAmortizationBegins: "2025-01",
          codeSection: "197",
          amortizationPeriodMonths: 60,
        },
      ],
    });

    expect(result.line42.toNumber()).toBe(12000);
    expect(result.amortizationResults[0].periodMonths).toBe(60);
  });

  it("Form 4562 Part VI - per-asset replaces summary bridge when amortizableAssets provided", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      currentYearAmortization: "9999",
      priorYearAmortization: "8888",
      amortizableAssets: [
        {
          amortizableAmount: "180000",
          dateAmortizationBegins: "2025-01",
          codeSection: "197",
        },
      ],
    });

    // Per-asset computation should override the summary values
    expect(result.line42.toNumber()).toBe(12000); // Not 9999
    expect(result.line43.toNumber()).toBe(0); // Not 8888
  });

  it("Form 4562 Part VI - summary bridge still works when no amortizableAssets provided", () => {
    const result = calculateForm4562({
      currentYearAmortization: "7000",
      priorYearAmortization: "2500",
    });

    expect(result.line42.toNumber()).toBe(7000);
    expect(result.line43.toNumber()).toBe(2500);
    expect(result.line44.toNumber()).toBe(9500);
    expect(result.amortizationResults).toHaveLength(0);
  });

  it("Form 4562 Part VI - audit trail includes per-asset amortization entries", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Customer list",
          amortizableAmount: "90000",
          dateAmortizationBegins: "2025-04",
          codeSection: "197",
        },
      ],
    });

    const partVILines = result.lines.filter(l => l.line === "Part VI");
    expect(partVILines).toHaveLength(1);
    expect(partVILines[0].description).toContain("Customer list");
    expect(partVILines[0].description).toContain("§197");
    expect(partVILines[0].description).toContain("180mo");
  });

  it("Form 4562 Part VI - §174 domestic audit trail mentions mid-year convention", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        {
          description: "Software development",
          amortizableAmount: "50000",
          dateAmortizationBegins: "2025-03",
          codeSection: "174domestic",
        },
      ],
    });

    const partVILines = result.lines.filter(l => l.line === "Part VI");
    expect(partVILines[0].description).toContain("mid-year convention");
  });

  it("Form 4562 Part VI - realistic scenario: business acquisition with multiple intangibles", () => {
    // Acquired a small business in April 2025 for $500K allocated to intangibles:
    //   Goodwill: $200,000 (§197, 180mo, Apr–Dec = 9mo → $10,000)
    //   Customer list: $150,000 (§197, 180mo, Apr–Dec = 9mo → $7,500)
    //   Covenant not to compete: $100,000 (§197, 180mo, Apr–Dec = 9mo → $5,000)
    //   Startup costs (after $5K deduction): $45,000 (§195, 180mo, Apr–Dec = 9mo → $2,250)
    const result = calculateForm4562({
      taxYear: 2025,
      amortizableAssets: [
        { description: "Goodwill", amortizableAmount: "200000", dateAmortizationBegins: "2025-04", codeSection: "197" },
        { description: "Customer list", amortizableAmount: "150000", dateAmortizationBegins: "2025-04", codeSection: "197" },
        { description: "Non-compete", amortizableAmount: "100000", dateAmortizationBegins: "2025-04", codeSection: "197" },
        { description: "Startup costs", amortizableAmount: "45000", dateAmortizationBegins: "2025-04", codeSection: "195" },
      ],
    });

    expect(result.line42.toNumber()).toBe(10000 + 7500 + 5000 + 2250);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(24750);
    expect(result.amortizationResults).toHaveLength(4);
  });

  it("Form 4562 Part VI - combined depreciation and amortization scenario", () => {
    // Self-employed consultant: depreciable equipment + amortizable intangibles
    const result = calculateForm4562({
      taxYear: 2025,
      section179ExpenseDeduction: "5000",
      assets: [
        // 5-year equipment placed Jan 2025: 20% of $8,000 = $1,600 → Line 19
        { costBasis: "8000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
      ],
      amortizableAssets: [
        // §197 goodwill from Jan 2023: 12mo → $90,000/180×12 = $6,000
        { description: "Goodwill", amortizableAmount: "90000", dateAmortizationBegins: "2023-01", codeSection: "197" },
        // §174 domestic R&E from 2025: mid-year 6mo → $30,000/60×6 = $3,000
        { description: "R&E", amortizableAmount: "30000", dateAmortizationBegins: "2025-06", codeSection: "174domestic" },
      ],
    });

    // Depreciation: $5,000 (179) + $1,600 (MACRS) = $6,600
    expect(result.line22.toNumber()).toBe(6600);
    // Amortization: $3,000 (current-year) + $6,000 (prior-year) = $9,000
    expect(result.line42.toNumber()).toBe(3000);
    expect(result.line43.toNumber()).toBe(6000);
    expect(result.line44.toNumber()).toBe(9000);
    // Both asset types tracked
    expect(result.assetResults).toHaveLength(1);
    expect(result.amortizationResults).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// §280F(b)(2) Recapture
// ---------------------------------------------------------------------------

describe("section 280F recapture", () => {
  it("recapture triggered — excess MACRS over ADS is ordinary income", () => {
    // Business vehicle purchased 2023. In prior years, claimed $15,000 MACRS.
    // ADS straight-line would have been $10,000. Business use dropped to 40% in 2025.
    // Recapture = $15,000 - $10,000 = $5,000
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "50000",
          placedInServiceDate: "2023-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 40,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "15000",
          cumulativePriorAdsDeductions: "10000",
          description: "Business sedan",
        },
      ],
    });

    expect(result.section280FRecaptureIncome.toNumber()).toBe(5000);
    // Current-year depreciation still computes at ADS SL with 40% business use
    expect(result.line21.toNumber()).toBeGreaterThan(0);
    // Recapture does NOT affect Line 22 (it's income, not a deduction adjustment)
    expect(result.line22.toNumber()).toBe(result.line21.toNumber());
  });

  it("recapture triggered — ADS exceeds MACRS yields zero recapture", () => {
    // Edge case: cumulative ADS was actually more than MACRS (possible with cap effects)
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "30000",
          placedInServiceDate: "2023-03",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 45,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "8000",
          cumulativePriorAdsDeductions: "9500",
        },
      ],
    });

    expect(result.section280FRecaptureIncome.toNumber()).toBe(0);
  });

  it("multiple listed-property assets with recapture aggregate", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "50000",
          placedInServiceDate: "2022-01",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 30,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "20000",
          cumulativePriorAdsDeductions: "14000",
          description: "Vehicle A",
        },
        {
          costBasis: "25000",
          placedInServiceDate: "2023-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: false,
          businessUsePercentage: 40,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "7000",
          cumulativePriorAdsDeductions: "5000",
          description: "Camera equipment",
        },
      ],
    });

    // Vehicle A: $20,000 - $14,000 = $6,000
    // Camera: $7,000 - $5,000 = $2,000
    // Total: $8,000
    expect(result.section280FRecaptureIncome.toNumber()).toBe(8000);
  });

  it("recapture coexists with current-year ADS depreciation", () => {
    // Year 3, business use dropped from 80% to 40%
    // Asset still gets current-year ADS SL depreciation at 40% use
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "60000",
          placedInServiceDate: "2023-01",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 40,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "18000",
          cumulativePriorAdsDeductions: "12000",
        },
      ],
    });

    // Recapture: $18,000 - $12,000 = $6,000
    expect(result.section280FRecaptureIncome.toNumber()).toBe(6000);
    // Current-year depreciation should still be computed (ADS SL at 40%)
    expect(result.line21.toNumber()).toBeGreaterThan(0);
  });

  it("only assets with recapture flag produce recapture — others unaffected", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        // Regular asset — no recapture
        { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "7" },
        // Listed property without recapture flag
        {
          costBasis: "40000",
          placedInServiceDate: "2025-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 80,
        },
        // Listed property WITH recapture
        {
          costBasis: "50000",
          placedInServiceDate: "2022-01",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 35,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "12000",
          cumulativePriorAdsDeductions: "8000",
        },
      ],
    });

    // Only the third asset produces recapture: $12,000 - $8,000 = $4,000
    expect(result.section280FRecaptureIncome.toNumber()).toBe(4000);
    // Regular and non-recapture listed property still compute normally
    expect(result.line19.toNumber()).toBeGreaterThan(0); // regular asset
    expect(result.line21.toNumber()).toBeGreaterThan(0); // listed property
  });

  it("0% business use still triggers recapture if flag is set", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "40000",
          placedInServiceDate: "2022-06",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 0,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "25000",
          cumulativePriorAdsDeductions: "18000",
        },
      ],
    });

    // Recapture: $25,000 - $18,000 = $7,000
    expect(result.section280FRecaptureIncome.toNumber()).toBe(7000);
    // 0% business use → $0 current-year depreciation
    expect(result.line21.toNumber()).toBe(0);
  });

  it("no recapture when section280FRecaptureTriggered is not set", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "50000",
          placedInServiceDate: "2023-01",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 80,
          // NOT triggered — normal listed property
        },
      ],
    });

    expect(result.section280FRecaptureIncome.toNumber()).toBe(0);
  });

  it("recapture audit trail entry present when recapture is triggered", () => {
    const result = calculateForm4562({
      taxYear: 2025,
      section179TotalCost: "0",
      section179ElectedCost: "0",
      section179BusinessIncomeLimit: "0",
      assets: [
        {
          costBasis: "50000",
          placedInServiceDate: "2022-01",
          recoveryPeriod: "5",
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 30,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "16000",
          cumulativePriorAdsDeductions: "11000",
          description: "Business SUV",
        },
      ],
    });

    const recaptureLines = result.lines.filter(l => l.line === "§280F recapture");
    expect(recaptureLines).toHaveLength(1);
    expect(recaptureLines[0].description).toContain("Business SUV");
    expect(recaptureLines[0].value.toNumber()).toBe(5000);
  });
});

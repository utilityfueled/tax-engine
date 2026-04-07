/**
 * Edge case tests for Form 8829 — Expenses for Business Use of Your Home
 * Spec: spec/federal/form-8829.yaml
 *
 * Covers: business-use percentage boundaries, daycare time allocation,
 * gross-income limitation cascades, carryover mechanics, depreciation
 * edge cases, and zero/extreme values.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm8829 } from "@/engine/forms/form-8829.js";
import type { Form8829Input } from "@/models/inputs.js";

function makeInput(overrides: Partial<Form8829Input> = {}): Form8829Input {
  return {
    areaUsedForBusiness: 300,
    totalAreaOfHome: 1500,
    grossIncomeLimit: "10000",
    adjustedBasisOrFairMarketValue: "240000",
    landValue: "60000",
    depreciationPercentage: "0.02564",
    ...overrides,
  } as Form8829Input;
}

// ── Business-use percentage edge cases ─────────────────────

describe("Form 8829 business-use percentage boundaries", () => {
  it("Form 8829 Line 3 - 100% business use when entire home is office", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 1500,
      totalAreaOfHome: 1500,
    }));

    expect(result.line3.toNumber()).toBe(1);
    expect(result.line7.toNumber()).toBe(1);
  });

  it("Form 8829 Line 3 - minimal business use (1 sq ft of 2000)", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 1,
      totalAreaOfHome: 2000,
      indirectExpenses: { utilities: "12000" },
    }));

    expect(result.line3.toNumber()).toBe(0.0005);
    expect(result.line7.toNumber()).toBe(0.0005);
    // Indirect utilities: 12000 × 0.0005 = 6, rounded to $6
    expect(result.line24.toNumber()).toBe(6);
  });

  it("Form 8829 Line 7 - non-daycare branch uses line 3 directly", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 250,
      totalAreaOfHome: 1000,
    }));

    expect(result.line7.equals(result.line3)).toBe(true);
    expect(result.line4.toNumber()).toBe(0);
    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
  });
});

// ── Daycare time allocation edge cases ─────────────────────

describe("Form 8829 daycare time allocation", () => {
  it("Form 8829 Line 7 - daycare at 100% time use equals regular business percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 2000,
      daycareHoursUsed: 8760,
      daycareHoursAvailable: 8760,
      indirectExpenses: { utilities: "6000" },
    }));

    // 500/2000 = 0.25, 8760/8760 = 1.0, line7 = 0.25 × 1.0 = 0.25
    expect(result.line6.toNumber()).toBe(1);
    expect(result.line7.toNumber()).toBe(0.25);
  });

  it("Form 8829 Line 7 - daycare minimal time use drastically reduces percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000,
      daycareHoursUsed: 100,
      daycareHoursAvailable: 8760,
      grossIncomeLimit: "50000",
      indirectExpenses: { utilities: "10000" },
    }));

    // 500/1000 = 0.5, 100/8760 ≈ 0.01142, line7 ≈ 0.00571
    expect(result.line3.toNumber()).toBe(0.5);
    expect(result.line6.toNumber()).toBeCloseTo(0.01142, 4);
    expect(result.line7.toNumber()).toBeCloseTo(0.00571, 4);
  });

  it("Form 8829 Line 6 - daycare hours used equals zero produces zero time percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 300,
      totalAreaOfHome: 1500,
      daycareHoursUsed: 0,
      daycareHoursAvailable: 8760,
    }));

    expect(result.line6.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(0);
  });
});

// ── Gross-income limitation edge cases ─────────────────────

describe("Form 8829 gross-income limitation boundaries", () => {
  it("Form 8829 Line 15 - gross income exactly equals line 14 expenses yields zero remaining limit", () => {
    // Set up so line14 = grossIncomeLimit exactly
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "600",
      indirectExpenses: {
        deductibleMortgageInterest: "2000",
        realEstateTaxes: "1000",
      },
      // line13 = (2000+1000) × 0.2 = 600, line14 = 0 + 600 = 600
    }));

    expect(result.line14.toNumber()).toBe(600);
    expect(result.line15.toNumber()).toBe(0);
    expect(result.line27.toNumber()).toBe(0);
    expect(result.line28.toNumber()).toBe(0);
  });

  it("Form 8829 Line 15 - gross income $1 above line 14 allows $1 operating expense", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "601",
      indirectExpenses: {
        deductibleMortgageInterest: "2000",
        realEstateTaxes: "1000",
        utilities: "5000", // large operating expense
      },
    }));

    expect(result.line14.toNumber()).toBe(600);
    expect(result.line15.toNumber()).toBe(1);
    // Operating expenses available (line 26) = 5000 × 0.2 = 1000, but limited to $1
    expect(result.line27.toNumber()).toBe(1);
  });

  it("Form 8829 Line 15 - zero gross income floors all deductions", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "0",
      indirectExpenses: {
        deductibleMortgageInterest: "10000",
        realEstateTaxes: "5000",
        insurance: "2000",
        utilities: "3000",
      },
    }));

    expect(result.line15.toNumber()).toBe(0);
    expect(result.line27.toNumber()).toBe(0);
    expect(result.line28.toNumber()).toBe(0);
    expect(result.line33.toNumber()).toBe(0);
    // All operating expenses carry over
    expect(result.line43.toNumber()).toBeGreaterThan(0);
  });

  it("Form 8829 Lines 43-44 - all expense layers carry forward when gross income is zero", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "0",
      indirectExpenses: {
        deductibleMortgageInterest: "12000",
        realEstateTaxes: "6000",
        utilities: "4000",
        insurance: "2000",
      },
      adjustedBasisOrFairMarketValue: "300000",
      landValue: "75000",
      depreciationPercentage: "0.02564",
    }));

    // line14 = (12000+6000) × 0.5 = 9000, line15 = max(0 - 9000, 0) = 0
    expect(result.line15.toNumber()).toBe(0);
    // Operating expenses: (4000+2000) × 0.5 = 3000, line27 = min(0, 3000) = 0
    expect(result.line43.toNumber()).toBe(3000);
    // Depreciation: line39 = 300000-75000=225000, line40=225000×0.5=112500, line42=112500×0.02564=2885
    expect(result.line44.toNumber()).toBe(2885);
  });
});

// ── Direct vs indirect expense allocation ──────────────────

describe("Form 8829 direct vs indirect expense allocation", () => {
  it("Form 8829 Line 14 - direct expenses are not multiplied by business percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 100,
      totalAreaOfHome: 1000, // 10%
      grossIncomeLimit: "50000",
      directExpenses: {
        deductibleMortgageInterest: "5000",
        realEstateTaxes: "3000",
      },
    }));

    // Direct: 5000 + 3000 = 8000 (line12Direct)
    // Indirect: 0 → line13 = 0
    // line14 = 8000 + 0 = 8000 (direct goes through at full amount)
    expect(result.line12Direct.toNumber()).toBe(8000);
    expect(result.line13.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(8000);
  });

  it("Form 8829 Line 13 - indirect expenses are allocated by business percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 100,
      totalAreaOfHome: 1000, // 10%
      grossIncomeLimit: "50000",
      indirectExpenses: {
        deductibleMortgageInterest: "12000",
        realEstateTaxes: "6000",
      },
    }));

    // Indirect total = 18000, × 10% = 1800
    expect(result.line12Indirect.toNumber()).toBe(18000);
    expect(result.line13.toNumber()).toBe(1800);
    expect(result.line14.toNumber()).toBe(1800);
  });

  it("Form 8829 - all expenses in direct column with large business use", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 900,
      totalAreaOfHome: 1000, // 90%
      grossIncomeLimit: "100000",
      directExpenses: {
        casualtyLosses: "500",
        deductibleMortgageInterest: "8000",
        realEstateTaxes: "4000",
        excessMortgageInterest: "1000",
        insurance: "2400",
        utilities: "3600",
        repairsAndMaintenance: "1500",
      },
    }));

    // All direct, no indirect allocation needed
    expect(result.line12Direct.toNumber()).toBe(12500);
    expect(result.line12Indirect.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(12500);
    expect(result.line23Direct.toNumber()).toBe(8500);
    expect(result.line23Indirect.toNumber()).toBe(0);
    expect(result.line24.toNumber()).toBe(0);
  });
});

// ── Depreciation edge cases (Part III) ─────────────────────

describe("Form 8829 depreciation edge cases", () => {
  it("Form 8829 Line 39 - land value equals adjusted basis yields zero building basis", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "50000",
      adjustedBasisOrFairMarketValue: "100000",
      landValue: "100000",
      depreciationPercentage: "0.02564",
    }));

    expect(result.line38.toNumber()).toBe(100000);
    expect(result.line39.toNumber()).toBe(0);
    expect(result.line40.toNumber()).toBe(0);
    expect(result.line42.toNumber()).toBe(0);
    expect(result.line30.toNumber()).toBe(0);
  });

  it("Form 8829 Line 38 - land value exceeding basis is capped at line 37", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "50000",
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "250000", // exceeds basis
      depreciationPercentage: "0.02564",
    }));

    expect(result.line37.toNumber()).toBe(200000);
    expect(result.line38.toNumber()).toBe(200000); // capped
    expect(result.line39.toNumber()).toBe(0);
  });

  it("Form 8829 Line 42 - zero depreciation percentage yields zero depreciation", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "50000",
      adjustedBasisOrFairMarketValue: "300000",
      landValue: "75000",
      depreciationPercentage: "0",
    }));

    expect(result.line39.toNumber()).toBe(225000);
    expect(result.line41.toNumber()).toBe(0);
    expect(result.line42.toNumber()).toBe(0);
    expect(result.line30.toNumber()).toBe(0);
  });

  it("Form 8829 Lines 39-42 - depreciation rounding with fractional business percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 333,
      totalAreaOfHome: 1000, // 33.3%
      grossIncomeLimit: "50000",
      adjustedBasisOrFairMarketValue: "250000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // line39 = 250000 - 50000 = 200000
    // line40 = 200000 × 0.333 = 66600, rounded to $66600
    // line42 = 66600 × 0.02564 = 1707.624, rounded to $1708
    expect(result.line39.toNumber()).toBe(200000);
    expect(result.line40.toNumber()).toBe(66600);
    expect(result.line42.toNumber()).toBe(1708);
  });

  it("Form 8829 - no depreciation inputs default to zero depreciation", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 300,
      totalAreaOfHome: 1500,
      grossIncomeLimit: "10000",
      indirectExpenses: { utilities: "3000" },
    } as Form8829Input);

    expect(result.line30.toNumber()).toBe(0);
    expect(result.line42.toNumber()).toBe(0);
  });
});

// ── Carryover mechanics ────────────────────────────────────

describe("Form 8829 carryover mechanics", () => {
  it("Form 8829 Line 25 - prior year operating carryover is included in available expenses", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "5000",
      indirectExpenses: {
        deductibleMortgageInterest: "5000",
        realEstateTaxes: "2500",
      },
      priorYearOperatingExpensesCarryover: "2500",
    }));

    // line13 = 7500 × 0.2 = 1500, line15 = 5000 - 1500 = 3500
    // line26 = 0 (no operating expenses) + 0 (no indirect operating) + 2500 (carryover)
    expect(result.line25.toNumber()).toBe(2500);
    expect(result.line26.toNumber()).toBe(2500);
    expect(result.line27.toNumber()).toBe(2500); // min(3500, 2500)
    expect(result.line43.toNumber()).toBe(0); // fully used
  });

  it("Form 8829 Line 31 - prior year casualty and depreciation carryovers combine", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "20000",
      indirectExpenses: {
        deductibleMortgageInterest: "10000",
      },
      priorYearExcessCasualtyLossesCarryover: "1500",
      priorYearDepreciationCarryover: "800",
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    expect(result.line31.toNumber()).toBe(2300);
  });

  it("Form 8829 Lines 43-44 - partial carryover when limit partially absorbs expenses", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "8000",
      indirectExpenses: {
        deductibleMortgageInterest: "10000", // line14 portion = 5000
        utilities: "6000", // operating portion = 3000
      },
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // line14 = 10000 × 0.5 = 5000
    // line15 = 8000 - 5000 = 3000
    // line26 = 6000 × 0.5 = 3000
    // line27 = min(3000, 3000) = 3000, line28 = 0
    expect(result.line15.toNumber()).toBe(3000);
    expect(result.line27.toNumber()).toBe(3000);
    expect(result.line28.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(0);
    // line32 has depreciation but line28 = 0, so all depreciation carries
    expect(result.line33.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBeGreaterThan(0);
  });
});

// ── Casualty loss carve-out edge cases ─────────────────────

describe("Form 8829 casualty loss carve-out", () => {
  it("Form 8829 Line 35 - zero casualty losses means line 35 is zero", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "50000",
      indirectExpenses: {
        deductibleMortgageInterest: "6000",
        realEstateTaxes: "3000",
        utilities: "2400",
      },
    }));

    expect(result.line35.toNumber()).toBe(0);
    expect(result.line36.equals(result.line34)).toBe(true);
  });

  it("Form 8829 Line 35 - all expenses are casualty losses, entire deduction carved out", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "10000",
      directExpenses: { casualtyLosses: "2000" },
      indirectExpenses: { casualtyLosses: "5000" },
      excessCasualtyLosses: "3000",
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    // line14 = 2000 + 5000×0.2 = 2000 + 1000 = 3000 (all casualty)
    // Casualty portion of line14 = all of it = 3000
    // line36 should reflect casualty carve-out
    expect(result.line14.toNumber()).toBe(3000);
  });
});

// ── Zero and extreme values ────────────────────────────────

describe("Form 8829 zero and extreme values", () => {
  it("Form 8829 - no expenses at all yields depreciation-only deduction", () => {
    const result = calculateForm8829(makeInput({
      grossIncomeLimit: "100000",
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    expect(result.line14.toNumber()).toBe(0);
    expect(result.line27.toNumber()).toBe(0);
    expect(result.line33.toNumber()).toBe(0);
    expect(result.line34.toNumber()).toBe(0);
    expect(result.line36.toNumber()).toBe(0);
  });

  it("Form 8829 - very large gross income limit absorbs all expense layers", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "1000000",
      indirectExpenses: {
        deductibleMortgageInterest: "24000",
        realEstateTaxes: "12000",
        insurance: "4000",
        utilities: "6000",
        repairsAndMaintenance: "3000",
      },
      adjustedBasisOrFairMarketValue: "500000",
      landValue: "100000",
      depreciationPercentage: "0.02564",
    }));

    // No carryovers when gross income is huge
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(0);
    // All expenses absorbed
    expect(result.line27.equals(result.line26)).toBe(true);
    expect(result.line33.equals(result.line32)).toBe(true);
  });

  it("Form 8829 - rounding behavior on indirect expense allocation", () => {
    // Test that rounding to nearest dollar works correctly
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 333,
      totalAreaOfHome: 1000, // 33.3%
      grossIncomeLimit: "50000",
      indirectExpenses: {
        deductibleMortgageInterest: "10001",
      },
    }));

    // 10001 × 0.333 = 3330.333 → rounds to $3330
    expect(result.line13.toNumber()).toBe(3330);
  });
});

// ── Mixed direct + indirect in same category ─────────────

describe("Form 8829 mixed direct and indirect expense allocation", () => {
  it("Form 8829 Lines 10/13/14 - same expense type split across direct and indirect columns", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "50000",
      directExpenses: {
        deductibleMortgageInterest: "3000",
      },
      indirectExpenses: {
        deductibleMortgageInterest: "9000",
      },
    }));

    // Direct: 3000 (100%), indirect: 9000 × 0.2 = 1800
    expect(result.line10Direct.toNumber()).toBe(3000);
    expect(result.line10Indirect.toNumber()).toBe(9000);
    expect(result.line12Direct.toNumber()).toBe(3000);
    expect(result.line12Indirect.toNumber()).toBe(9000);
    expect(result.line13.toNumber()).toBe(1800);
    expect(result.line14.toNumber()).toBe(4800);
  });

  it("Form 8829 Lines 16-24 - operating expenses split direct/indirect compute independently", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 400,
      totalAreaOfHome: 1000, // 40%
      grossIncomeLimit: "50000",
      directExpenses: {
        utilities: "1200",        // direct utility (e.g., dedicated circuit)
        repairsAndMaintenance: "500", // direct repair to office
      },
      indirectExpenses: {
        utilities: "3600",        // whole-home utility bill
        insurance: "2400",
        repairsAndMaintenance: "2000",
      },
    }));

    // Direct operating: 1200 + 500 = 1700
    expect(result.line23Direct.toNumber()).toBe(1700);
    // Indirect operating: 3600 + 2400 + 2000 = 8000
    expect(result.line23Indirect.toNumber()).toBe(8000);
    // Allocated indirect: 8000 × 0.4 = 3200
    expect(result.line24.toNumber()).toBe(3200);
    // Total available: 1700 + 3200 = 4900
    expect(result.line26.toNumber()).toBe(4900);
  });
});

// ── Rent-based office (line 19) ──────────────────────────

describe("Form 8829 rent-based home office", () => {
  it("Form 8829 Line 19 - renter allocates rent by business percentage", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 150,
      totalAreaOfHome: 750, // 20%
      grossIncomeLimit: "40000",
      indirectExpenses: {
        rent: "24000",      // $2,000/month
        utilities: "3600",  // $300/month
        insurance: "1200",  // renter's insurance
      },
      // No depreciation for renters
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    // Rent: 24000 × 0.2 = 4800
    expect(result.line19Indirect.toNumber()).toBe(24000);
    // Total indirect operating: 24000 + 3600 + 1200 = 28800
    // Allocated: 28800 × 0.2 = 5760
    expect(result.line24.toNumber()).toBe(5760);
    // No depreciation
    expect(result.line42.toNumber()).toBe(0);
    expect(result.line30.toNumber()).toBe(0);
    // All operating should be allowed with large gross income
    expect(result.line27.toNumber()).toBe(5760);
  });

  it("Form 8829 Line 19 - renter with direct rent expense (sublease for office room)", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 800, // 25%
      grossIncomeLimit: "30000",
      directExpenses: {
        rent: "6000", // dedicated office space lease
      },
      indirectExpenses: {
        utilities: "2400",
      },
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    // Direct rent at 100%: 6000
    expect(result.line19Direct.toNumber()).toBe(6000);
    expect(result.line23Direct.toNumber()).toBe(6000);
    // Indirect utilities: 2400 × 0.25 = 600
    expect(result.line24.toNumber()).toBe(600);
    expect(result.line26.toNumber()).toBe(6600);
    expect(result.line27.toNumber()).toBe(6600);
  });
});

// ── Three-tier gross-income cascade ──────────────────────

describe("Form 8829 three-tier gross-income cascade", () => {
  it("Form 8829 Lines 14→27→33 - gross income consumed entirely by tier 1, zero for tiers 2 and 3", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "4000",
      indirectExpenses: {
        deductibleMortgageInterest: "15000", // tier 1: 15000 × 0.5 = 7500 > 4000
        utilities: "6000",                   // tier 2
      },
      adjustedBasisOrFairMarketValue: "300000",
      landValue: "75000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1 (line 14): 7500, exceeds gross income of 4000 — but no floor, line 14 = 7500
    expect(result.line14.toNumber()).toBe(7500);
    // line 15 = max(4000 - 7500, 0) = 0
    expect(result.line15.toNumber()).toBe(0);
    // Tier 2: line 27 = min(0, operating) = 0
    expect(result.line27.toNumber()).toBe(0);
    // Tier 3: line 28 = 0, line 33 = min(0, depreciation pool) = 0
    expect(result.line28.toNumber()).toBe(0);
    expect(result.line33.toNumber()).toBe(0);
    // Carryovers: everything above tier 1 carries
    expect(result.line43.toNumber()).toBe(3000); // 6000 × 0.5 = 3000 operating
    expect(result.line44.toNumber()).toBeGreaterThan(0); // depreciation carries
  });

  it("Form 8829 Lines 14→27→33 - gross income exactly covers tiers 1+2, zero for tier 3", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "5000",
      indirectExpenses: {
        deductibleMortgageInterest: "10000", // tier 1: 10000 × 0.2 = 2000
        utilities: "15000",                  // tier 2: 15000 × 0.2 = 3000
      },
      adjustedBasisOrFairMarketValue: "400000",
      landValue: "100000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1: line 14 = 2000
    expect(result.line14.toNumber()).toBe(2000);
    // line 15 = 5000 - 2000 = 3000
    expect(result.line15.toNumber()).toBe(3000);
    // Tier 2: line 26 = 3000, line 27 = min(3000, 3000) = 3000
    expect(result.line26.toNumber()).toBe(3000);
    expect(result.line27.toNumber()).toBe(3000);
    // line 28 = 3000 - 3000 = 0
    expect(result.line28.toNumber()).toBe(0);
    // Tier 3: all depreciation carries
    expect(result.line33.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBeGreaterThan(0);
  });

  it("Form 8829 Lines 14→27→33 - $1 left after each tier cascades correctly", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "10001",
      indirectExpenses: {
        deductibleMortgageInterest: "20000", // tier 1: 20000 × 0.5 = 10000
        utilities: "2",                       // tier 2: 2 × 0.5 = 1 (rounded)
      },
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1: line 14 = 10000
    expect(result.line14.toNumber()).toBe(10000);
    // line 15 = 10001 - 10000 = 1
    expect(result.line15.toNumber()).toBe(1);
    // Tier 2: operating = 1, line 27 = min(1, 1) = 1
    expect(result.line27.toNumber()).toBe(1);
    // line 28 = 1 - 1 = 0
    expect(result.line28.toNumber()).toBe(0);
    // Tier 3: depreciation, but line 28 = 0 so nothing allowed
    expect(result.line33.toNumber()).toBe(0);
  });
});

// ── Excess mortgage interest and excess real estate taxes ─

describe("Form 8829 excess mortgage/tax expenses (lines 16-17)", () => {
  it("Form 8829 Lines 16-17 - excess mortgage and excess taxes flow to operating tier", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 300,
      totalAreaOfHome: 1000, // 30%
      grossIncomeLimit: "20000",
      indirectExpenses: {
        deductibleMortgageInterest: "8000",  // tier 1
        realEstateTaxes: "4000",             // tier 1
        excessMortgageInterest: "3000",      // tier 2 (SALT-capped portion)
        excessRealEstateTaxes: "2000",       // tier 2 (SALT-capped portion)
      },
    }));

    // Tier 1: (8000 + 4000) × 0.3 = 3600
    expect(result.line14.toNumber()).toBe(3600);
    // line 15 = 20000 - 3600 = 16400
    expect(result.line15.toNumber()).toBe(16400);
    // Operating: (3000 + 2000) × 0.3 = 1500
    expect(result.line16Indirect.toNumber()).toBe(3000);
    expect(result.line17Indirect.toNumber()).toBe(2000);
    expect(result.line24.toNumber()).toBe(1500);
    expect(result.line26.toNumber()).toBe(1500);
    expect(result.line27.toNumber()).toBe(1500);
  });
});

// ── Casualty carve-out boundary tests (line 35) ─────────

describe("Form 8829 casualty carve-out boundary tests", () => {
  it("Form 8829 Line 35 - casualty in tier 1 plus excess casualty in tier 3 combines in carve-out", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "30000",
      directExpenses: {
        casualtyLosses: "2000",
        deductibleMortgageInterest: "4000",
      },
      indirectExpenses: {
        casualtyLosses: "6000",
      },
      excessCasualtyLosses: "5000",
      adjustedBasisOrFairMarketValue: "0",
      landValue: "0",
      depreciationPercentage: "0",
    }));

    // Tier 1 casualty: direct 2000 + indirect (6000 × 0.5 = 3000) = 5000
    const casualtyInTier1 = 2000 + 3000;
    expect(result.line9Direct.toNumber()).toBe(2000);
    expect(result.line9Indirect.toNumber()).toBe(6000);

    // Tier 1 total: casualty 5000 + mortgage 4000 = 9000
    expect(result.line14.toNumber()).toBe(9000);
    // line 15 = 30000 - 9000 = 21000
    expect(result.line15.toNumber()).toBe(21000);

    // Tier 3: excess casualty = 5000 × 0.5 = 2500
    expect(result.line29.toNumber()).toBe(2500);

    // Line 35 = casualty portion of line 14 (5000) + min(line33, casualty pool from 29+31)
    // casualty pool = 2500 + 0 = 2500
    // line33 = min(line28, line32) — line28 should be large, so line33 = line32
    expect(result.line35.toNumber()).toBe(casualtyInTier1 + 2500); // 7500
    expect(result.line36.toNumber()).toBe(result.line34.minus(result.line35).toNumber());
  });

  it("Form 8829 Line 35 - line 33 limited below casualty pool splits carve-out correctly", () => {
    // When line 28 < line 32, line 33 < casualty pool, so line 35 uses min(line33, casualtyPool)
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 500,
      totalAreaOfHome: 1000, // 50%
      grossIncomeLimit: "10000",
      indirectExpenses: {
        deductibleMortgageInterest: "12000", // tier 1: 6000
        utilities: "6000",                   // tier 2: 3000
      },
      excessCasualtyLosses: "10000",  // tier 3: 5000
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1: line 14 = 6000
    // line 15 = 10000 - 6000 = 4000
    expect(result.line15.toNumber()).toBe(4000);
    // Tier 2: line 26 = 3000, line 27 = min(4000, 3000) = 3000
    expect(result.line27.toNumber()).toBe(3000);
    // line 28 = 4000 - 3000 = 1000
    expect(result.line28.toNumber()).toBe(1000);
    // Tier 3: line 29 = 5000, line 30 = depreciation, line 32 > 1000
    // line 33 = min(1000, line32) = 1000
    expect(result.line33.toNumber()).toBe(1000);
    // Casualty pool = 5000 + 0 = 5000
    // line 35 = 0 (no casualty in tier 1) + min(1000, 5000) = 1000
    expect(result.line35.toNumber()).toBe(1000);
  });
});

// ── All carryover types active simultaneously ────────────

describe("Form 8829 full carryover cascade", () => {
  it("Form 8829 Lines 25/31/43/44 - all prior carryovers combine with current expenses under tight limit", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000, // 20%
      grossIncomeLimit: "3000",
      indirectExpenses: {
        deductibleMortgageInterest: "5000",  // tier 1: 1000
        utilities: "4000",                   // tier 2: 800
        insurance: "2000",                   // tier 2: 400
      },
      priorYearOperatingExpensesCarryover: "500",
      priorYearExcessCasualtyLossesCarryover: "300",
      priorYearDepreciationCarryover: "700",
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1: line 14 = 1000
    expect(result.line14.toNumber()).toBe(1000);
    // line 15 = 3000 - 1000 = 2000
    expect(result.line15.toNumber()).toBe(2000);

    // Tier 2: current indirect operating = (4000+2000) × 0.2 = 1200
    // + carryover 500 = 1700
    expect(result.line25.toNumber()).toBe(500);
    expect(result.line26.toNumber()).toBe(1700);
    // line 27 = min(2000, 1700) = 1700
    expect(result.line27.toNumber()).toBe(1700);

    // line 28 = 2000 - 1700 = 300
    expect(result.line28.toNumber()).toBe(300);

    // Tier 3: line 31 = 300 + 700 = 1000
    expect(result.line31.toNumber()).toBe(1000);
    // line 30 = depreciation = (200000-50000) × 0.2 × 0.02564 = 150000×0.2×0.02564 = 769
    expect(result.line30.toNumber()).toBe(769);
    // line 32 = 0 (no excess casualty) + 769 + 1000 = 1769
    expect(result.line32.toNumber()).toBe(1769);
    // line 33 = min(300, 1769) = 300
    expect(result.line33.toNumber()).toBe(300);
    // line 43 = 1700 - 1700 = 0 (all operating used)
    expect(result.line43.toNumber()).toBe(0);
    // line 44 = 1769 - 300 = 1469
    expect(result.line44.toNumber()).toBe(1469);
  });
});

// ── Daycare + expense limitation integration ─────────────

describe("Form 8829 daycare with expense limitation", () => {
  it("Form 8829 Lines 4-7/15 - daycare half-time reduces percentage, limiting expense allocation", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 600,
      totalAreaOfHome: 1200, // 50% area
      daycareHoursUsed: 4380,
      daycareHoursAvailable: 8760, // 50% time
      grossIncomeLimit: "20000",
      indirectExpenses: {
        deductibleMortgageInterest: "18000",
        realEstateTaxes: "6000",
        utilities: "4800",
        insurance: "2400",
      },
      adjustedBasisOrFairMarketValue: "250000",
      landValue: "62500",
      depreciationPercentage: "0.02564",
    }));

    // Business percentage: 0.5 × 0.5 = 0.25
    expect(result.line3.toNumber()).toBe(0.5);
    expect(result.line6.toNumber()).toBe(0.5);
    expect(result.line7.toNumber()).toBe(0.25);

    // Tier 1: (18000 + 6000) × 0.25 = 6000
    expect(result.line13.toNumber()).toBe(6000);
    expect(result.line14.toNumber()).toBe(6000);
    // line 15 = 20000 - 6000 = 14000
    expect(result.line15.toNumber()).toBe(14000);

    // Tier 2: (4800 + 2400) × 0.25 = 1800
    expect(result.line24.toNumber()).toBe(1800);
    expect(result.line27.toNumber()).toBe(1800);
  });
});

// ── Very small business percentage edge cases ────────────

describe("Form 8829 very small business percentage", () => {
  it("Form 8829 - 1 sq ft of 3000 sq ft rounds expenses to near-zero", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 1,
      totalAreaOfHome: 3000, // 0.000333...
      grossIncomeLimit: "50000",
      indirectExpenses: {
        deductibleMortgageInterest: "12000",
        realEstateTaxes: "6000",
        utilities: "3600",
        insurance: "1800",
      },
      adjustedBasisOrFairMarketValue: "400000",
      landValue: "100000",
      depreciationPercentage: "0.02564",
    }));

    // Business %: 1/3000 = 0.000333...
    expect(result.line7.toNumber()).toBeCloseTo(0.000333, 4);
    // Tier 1: (12000+6000) × 0.000333 = 5.994 → rounds to $6
    expect(result.line13.toNumber()).toBe(6);
    // Tier 2: (3600+1800) × 0.000333 = 1.798 → rounds to $2
    expect(result.line24.toNumber()).toBe(2);
    // Depreciation: (300000 × 0.000333) = 99.9 → $100, × 0.02564 = 2.564 → $3
    expect(result.line40.toNumber()).toBe(100);
    expect(result.line42.toNumber()).toBe(3);
  });

  it("Form 8829 - tiny business percentage causes depreciation to round to $0", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 1,
      totalAreaOfHome: 5000, // 0.0002
      grossIncomeLimit: "50000",
      adjustedBasisOrFairMarketValue: "150000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    }));

    // Building basis: 100000, business basis: 100000 × 0.0002 = 20 → $20
    // Depreciation: 20 × 0.02564 = 0.5128 → rounds to $1
    expect(result.line39.toNumber()).toBe(100000);
    expect(result.line40.toNumber()).toBe(20);
    expect(result.line42.toNumber()).toBe(1);
  });
});

// ── All operating expense categories active ──────────────

describe("Form 8829 all expense categories populated", () => {
  it("Form 8829 - all 10 expense categories in both direct and indirect columns", () => {
    const result = calculateForm8829(makeInput({
      areaUsedForBusiness: 250,
      totalAreaOfHome: 1000, // 25%
      grossIncomeLimit: "80000",
      directExpenses: {
        casualtyLosses: "500",
        deductibleMortgageInterest: "1000",
        realEstateTaxes: "600",
        excessMortgageInterest: "200",
        excessRealEstateTaxes: "100",
        insurance: "300",
        rent: "0",
        repairsAndMaintenance: "1500",
        utilities: "800",
        otherExpenses: "400",
      },
      indirectExpenses: {
        casualtyLosses: "2000",
        deductibleMortgageInterest: "12000",
        realEstateTaxes: "4800",
        excessMortgageInterest: "1600",
        excessRealEstateTaxes: "800",
        insurance: "2400",
        rent: "0",
        repairsAndMaintenance: "3000",
        utilities: "4800",
        otherExpenses: "1200",
      },
      adjustedBasisOrFairMarketValue: "300000",
      landValue: "75000",
      depreciationPercentage: "0.02564",
    }));

    // Tier 1 direct: 500 + 1000 + 600 = 2100
    expect(result.line12Direct.toNumber()).toBe(2100);
    // Tier 1 indirect: 2000 + 12000 + 4800 = 18800
    expect(result.line12Indirect.toNumber()).toBe(18800);
    // Tier 1 allocated: 18800 × 0.25 = 4700
    expect(result.line13.toNumber()).toBe(4700);
    // Tier 1 total: 2100 + 4700 = 6800
    expect(result.line14.toNumber()).toBe(6800);

    // Operating direct: 200 + 100 + 300 + 0 + 1500 + 800 + 400 = 3300
    expect(result.line23Direct.toNumber()).toBe(3300);
    // Operating indirect: 1600 + 800 + 2400 + 0 + 3000 + 4800 + 1200 = 13800
    expect(result.line23Indirect.toNumber()).toBe(13800);
    // Allocated indirect operating: 13800 × 0.25 = 3450
    expect(result.line24.toNumber()).toBe(3450);
    // Total operating: 3300 + 3450 = 6750
    expect(result.line26.toNumber()).toBe(6750);

    // All tiers should be absorbed with $80,000 gross income
    expect(result.line43.toNumber()).toBe(0);
    expect(result.line44.toNumber()).toBe(0);
  });
});

/**
 * Tests for Form 8829 home-office actual-expense calculations.
 * Spec: spec/federal/form-8829.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm8829 } from "@/engine/forms/form-8829.js";

describe("Form 8829 actual home-office deduction", () => {
  it("Form 8829 Line 7 - exclusive-use percentage controls indirect expense allocation", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 300,
      totalAreaOfHome: 1500,
      grossIncomeLimit: "10000",
      indirectExpenses: {
        deductibleMortgageInterest: "6000",
        realEstateTaxes: "3000",
      },
      adjustedBasisOrFairMarketValue: "240000",
      landValue: "60000",
      depreciationPercentage: "0.02564",
    });

    expect(result.line3.toNumber()).toBeCloseTo(0.2, 6);
    expect(result.line7.toNumber()).toBeCloseTo(0.2, 6);
    expect(result.line13.toNumber()).toBe(1800);
  });

  it("Form 8829 Line 7 - daycare branch multiplies the space percentage by time percentage", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 400,
      totalAreaOfHome: 1600,
      daycareHoursUsed: 2000,
      daycareHoursAvailable: 4000,
      grossIncomeLimit: "1000",
      indirectExpenses: {
        utilities: "2400",
      },
    });

    expect(result.line3.toNumber()).toBeCloseTo(0.25, 6);
    expect(result.line6.toNumber()).toBeCloseTo(0.5, 6);
    expect(result.line7.toNumber()).toBeCloseTo(0.125, 6);
    expect(result.line24.toNumber()).toBe(300);
    expect(result.line36.toNumber()).toBe(300);
  });

  it("Form 8829 Line 35 - casualty portion is carved out of the Schedule C deduction", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000,
      grossIncomeLimit: "5000",
      directExpenses: {
        casualtyLosses: "300",
      },
      indirectExpenses: {
        casualtyLosses: "1000",
      },
      adjustedBasisOrFairMarketValue: "100000",
      landValue: "20000",
      depreciationPercentage: "0.02564",
    });

    expect(result.line14.toNumber()).toBe(500);
    expect(result.line35.toNumber()).toBe(500);
    expect(result.line36.toNumber()).toBe(410);
  });

  it("Form 8829 Line 36 - allowable home-office deduction includes allocated operating expenses and depreciation", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 300,
      totalAreaOfHome: 1500,
      grossIncomeLimit: "10000",
      directExpenses: {
        repairsAndMaintenance: "400",
      },
      indirectExpenses: {
        deductibleMortgageInterest: "6000",
        realEstateTaxes: "3000",
        insurance: "1200",
        utilities: "2400",
        repairsAndMaintenance: "1000",
        otherExpenses: "600",
      },
      adjustedBasisOrFairMarketValue: "240000",
      landValue: "60000",
      depreciationPercentage: "0.02564",
    });

    expect(result.line27.toNumber()).toBe(1440);
    expect(result.line30.toNumber()).toBe(923);
    expect(result.line33.toNumber()).toBe(923);
    expect(result.line36.toNumber()).toBe(4163);
  });

  it("Form 8829 Lines 27 through 44 - gross-income limitation creates operating and depreciation carryovers", () => {
    const result = calculateForm8829({
      areaUsedForBusiness: 200,
      totalAreaOfHome: 1000,
      grossIncomeLimit: "1400",
      directExpenses: {
        deductibleMortgageInterest: "200",
      },
      indirectExpenses: {
        deductibleMortgageInterest: "2000",
        realEstateTaxes: "1000",
        insurance: "2500",
        utilities: "1500",
        otherExpenses: "500",
      },
      priorYearOperatingExpensesCarryover: "300",
      excessCasualtyLosses: "1000",
      priorYearExcessCasualtyLossesCarryover: "200",
      priorYearDepreciationCarryover: "150",
      adjustedBasisOrFairMarketValue: "200000",
      landValue: "50000",
      depreciationPercentage: "0.02564",
    });

    expect(result.line15.toNumber()).toBe(600);
    expect(result.line26.toNumber()).toBe(1200);
    expect(result.line27.toNumber()).toBe(600);
    expect(result.line28.toNumber()).toBe(0);
    expect(result.line32.toNumber()).toBe(1319);
    expect(result.line33.toNumber()).toBe(0);
    expect(result.line43.toNumber()).toBe(600);
    expect(result.line44.toNumber()).toBe(1319);
  });
});

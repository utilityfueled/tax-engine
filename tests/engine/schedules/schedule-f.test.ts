/**
 * Tests for Schedule F — Profit or Loss From Farming
 * Spec: spec/federal/schedule-f.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleF, type ScheduleFInput } from "@/engine/schedules/schedule-f.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Part I: Farm Income (Lines 1-9)
// ═══════════════════════════════════════════════════════════

describe("Schedule F Farm Income", () => {
  it("Schedule F Line 1c - net purchased livestock equals sales minus cost", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "50000",
      costOfPurchasedLivestock: "30000",
    });
    expect(result.netPurchasedLivestock.toNumber()).toBe(20000);
  });

  it("Schedule F Line 1c - negative net when cost exceeds sales", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "10000",
      costOfPurchasedLivestock: "15000",
    });
    expect(result.netPurchasedLivestock.toNumber()).toBe(-5000);
  });

  it("Schedule F Line 2 - sales of products raised", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "75000",
    });
    expect(result.grossFarmIncome.toNumber()).toBe(75000);
  });

  it("Schedule F Line 9 - gross farm income sums all income lines", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "20000",
      costOfPurchasedLivestock: "12000",
      salesOfProductsRaised: "50000",
      cooperativeDistributions: "3000",
      agriculturalProgramPayments: "5000",
      cccLoansElected: "2000",
      cccLoansForfeited: "1000",
      cropInsuranceProceeds: "4000",
      priorYearDeferredCropInsurance: "1500",
      customHireIncome: "6000",
      otherFarmIncome: "2500",
    });
    // 1c = 20000 - 12000 = 8000
    // 9 = 8000 + 50000 + 3000 + 5000 + 2000 + 1000 + 4000 + 1500 + 6000 + 2500 = 83000
    expect(result.grossFarmIncome.toNumber()).toBe(83000);
  });

  it("Schedule F Line 9 - gross farm income includes crop insurance and prior-year deferred amounts", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "40000",
      cropInsuranceProceeds: "8000",
      priorYearDeferredCropInsurance: "3000",
    });
    expect(result.grossFarmIncome.toNumber()).toBe(51000);
  });

  it("Schedule F no input returns all zeros", () => {
    const result = calculateScheduleF(undefined);
    expect(result.grossFarmIncome.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.netFarmProfit.toNumber()).toBe(0);
  });

  it("Schedule F empty input returns all zeros", () => {
    const result = calculateScheduleF({});
    expect(result.grossFarmIncome.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.netFarmProfit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Farm Expenses (Lines 10-33)
// ═══════════════════════════════════════════════════════════

describe("Schedule F Farm Expenses", () => {
  it("Schedule F Line 33 - total farm expenses sums all expense lines", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "100000",
      expenses: {
        carAndTruck: "3000",
        chemicals: "2000",
        conservation: "1000",
        customHire: "4000",
        depreciation: "5000",
        employeeBenefits: "1500",
        feed: "15000",
        fertilizersAndLime: "3000",
        freightAndTrucking: "2000",
        gasolineFuelOil: "4000",
        insurance: "2500",
        mortgageInterest: "3000",
        otherInterest: "500",
        laborHired: "8000",
        pensionAndProfitSharing: "1000",
        rentLeaseVehicles: "2000",
        rentLeaseOther: "6000",
        repairsAndMaintenance: "3500",
        seedsAndPlants: "4000",
        storageAndWarehousing: "1500",
        supplies: "2000",
        taxes: "3000",
        utilities: "1800",
        veterinaryBreedingMedicine: "2500",
        otherExpenses: "1200",
      },
    });
    // All expenses sum: 3000+2000+1000+4000+5000+1500+15000+3000+2000+4000+2500+3000+500+8000+1000+2000+6000+3500+4000+1500+2000+3000+1800+2500+1200 = 83000
    // Conservation 1000 vs cap 25000 (25% of 100000) — under cap, no reduction
    expect(result.totalExpenses.toNumber()).toBe(83000);
  });

  it("Schedule F Line 12 - conservation expenses capped at 25% gross income", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "40000",
      expenses: {
        conservation: "15000", // 25% of 40000 = 10000 cap
      },
    });
    expect(result.conservationDeduction.toNumber()).toBe(10000);
    expect(result.conservationCarryforward.toNumber()).toBe(5000);
    expect(result.totalExpenses.toNumber()).toBe(10000);
  });

  it("Schedule F Line 12 - conservation under cap uses full amount", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "100000",
      expenses: {
        conservation: "8000", // 25% of 100000 = 25000 cap — under cap
      },
    });
    expect(result.conservationDeduction.toNumber()).toBe(8000);
    expect(result.conservationCarryforward.toNumber()).toBe(0);
  });

  it("Schedule F Line 12 - conservation includes prior-year carryforward", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "80000",
      conservationCarryforward: "10000",
      expenses: {
        conservation: "12000", // Total = 22000, cap = 20000
      },
    });
    expect(result.conservationDeduction.toNumber()).toBe(20000);
    expect(result.conservationCarryforward.toNumber()).toBe(2000);
  });

  it("Schedule F Line 12 - zero conservation when gross income is zero", () => {
    const result = calculateScheduleF({
      expenses: {
        conservation: "5000",
      },
    });
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(5000);
  });

  it("Schedule F Line 12 - conservation cap rounds to nearest dollar", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "33333",
      expenses: {
        conservation: "10000", // 25% of 33333 = 8333.25 rounds to 8333
      },
    });
    expect(result.conservationDeduction.toNumber()).toBe(8333);
    expect(result.conservationCarryforward.toNumber()).toBe(1667);
  });

  it("Schedule F expense breakdown records all categories", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "50000",
      expenses: {
        feed: "10000",
        seedsAndPlants: "3000",
      },
    });
    expect(result.expenseBreakdown["Feed"]?.toNumber()).toBe(10000);
    expect(result.expenseBreakdown["Seeds and plants"]?.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Farm Profit/Loss (Line 34)
// ═══════════════════════════════════════════════════════════

describe("Schedule F Net Profit", () => {
  it("Schedule F Line 34 - net farm profit flows to Schedule 1 Line 6", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "120000",
      customHireIncome: "5000",
      expenses: {
        feed: "20000",
        laborHired: "15000",
        depreciation: "10000",
        gasolineFuelOil: "5000",
        repairsAndMaintenance: "8000",
        insurance: "3000",
        taxes: "4000",
        utilities: "2000",
      },
    });
    // Income: 120000 + 5000 = 125000
    // Expenses: 20000+15000+10000+5000+8000+3000+4000+2000 = 67000
    // Net: 125000 - 67000 = 58000
    expect(result.netFarmProfit.toNumber()).toBe(58000);
  });

  it("Schedule F Line 34 - farm loss when expenses exceed income", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "30000",
      expenses: {
        feed: "25000",
        laborHired: "15000",
        depreciation: "5000",
      },
    });
    // Income: 30000
    // Expenses: 25000+15000+5000 = 45000
    // Net: 30000 - 45000 = -15000
    expect(result.netFarmProfit.toNumber()).toBe(-15000);
  });

  it("Schedule F Line 34 - small hobby-scale farm with minimal expenses", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "8000",
      expenses: {
        seedsAndPlants: "500",
        supplies: "300",
        gasolineFuelOil: "200",
      },
    });
    expect(result.netFarmProfit.toNumber()).toBe(7000);
  });

  it("Schedule F Line 34 - large diversified farm operation", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "200000",
      costOfPurchasedLivestock: "150000",
      salesOfProductsRaised: "350000",
      cooperativeDistributions: "8000",
      agriculturalProgramPayments: "12000",
      cropInsuranceProceeds: "5000",
      customHireIncome: "15000",
      otherFarmIncome: "3000",
      expenses: {
        carAndTruck: "5000",
        chemicals: "8000",
        conservation: "4000",
        customHire: "6000",
        depreciation: "25000",
        employeeBenefits: "3000",
        feed: "80000",
        fertilizersAndLime: "12000",
        freightAndTrucking: "7000",
        gasolineFuelOil: "15000",
        insurance: "8000",
        mortgageInterest: "12000",
        otherInterest: "2000",
        laborHired: "45000",
        pensionAndProfitSharing: "3000",
        rentLeaseVehicles: "4000",
        rentLeaseOther: "18000",
        repairsAndMaintenance: "10000",
        seedsAndPlants: "15000",
        storageAndWarehousing: "5000",
        supplies: "6000",
        taxes: "8000",
        utilities: "4000",
        veterinaryBreedingMedicine: "7000",
        otherExpenses: "3000",
      },
    });
    // Net purchased livestock: 200000 - 150000 = 50000
    // Gross income: 50000 + 350000 + 8000 + 12000 + 5000 + 15000 + 3000 = 443000
    // Conservation: 4000 vs cap 110750 (25% of 443000) — under cap
    // Total expenses: 5+8+4+6+25+3+80+12+7+15+8+12+2+45+3+4+18+10+15+5+6+8+4+7+3 = 315 (thousands)
    // Net: 443000 - 315000 = 128000
    expect(result.grossFarmIncome.toNumber()).toBe(443000);
    expect(result.totalExpenses.toNumber()).toBe(315000);
    expect(result.netFarmProfit.toNumber()).toBe(128000);
  });

  it("Schedule F audit trail includes all lines", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "50000",
      expenses: { feed: "10000" },
    });
    const lineKeys = result.lines.map((l) => `${l.form} ${l.line}`);
    expect(lineKeys).toContain("Sched F 9");
    expect(lineKeys).toContain("Sched F 33");
    expect(lineKeys).toContain("Sched F 34");
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule F Edge Cases", () => {
  it("Schedule F zero-income farm still allows expenses to create a loss", () => {
    const result = calculateScheduleF({
      expenses: {
        feed: "5000",
        depreciation: "3000",
      },
    });
    expect(result.grossFarmIncome.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(8000);
    expect(result.netFarmProfit.toNumber()).toBe(-8000);
    // Conservation should be zero with zero income
    expect(result.conservationDeduction.toNumber()).toBe(0);
  });

  it("Schedule F purchased livestock loss reduces gross income", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "5000",
      costOfPurchasedLivestock: "8000",
      salesOfProductsRaised: "20000",
    });
    // Net purchased: 5000 - 8000 = -3000
    // Gross: -3000 + 20000 = 17000
    expect(result.netPurchasedLivestock.toNumber()).toBe(-3000);
    expect(result.grossFarmIncome.toNumber()).toBe(17000);
  });

  it("Schedule F all optional fields default to zero", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "10000",
    });
    expect(result.netPurchasedLivestock.toNumber()).toBe(0);
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.netFarmProfit.toNumber()).toBe(10000);
  });

  it("Schedule F negative gross income still allows conservation carryforward", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "1000",
      costOfPurchasedLivestock: "5000",
      expenses: {
        conservation: "3000",
      },
    });
    // Gross income: 1000 - 5000 = -4000
    // Conservation: 3000 vs cap of 0 (25% of negative = effectively 0)
    expect(result.grossFarmIncome.toNumber()).toBe(-4000);
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(3000);
  });

  it("Schedule F CCC loans forfeited and elected both count as income", () => {
    const result = calculateScheduleF({
      cccLoansElected: "15000",
      cccLoansForfeited: "3000",
    });
    expect(result.grossFarmIncome.toNumber()).toBe(18000);
  });
});

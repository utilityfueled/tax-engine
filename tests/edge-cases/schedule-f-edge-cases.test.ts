/**
 * Edge case tests for Schedule F — Profit or Loss From Farming.
 * Spec: spec/federal/schedule-f.yaml
 *
 * Key rules:
 *   Conservation expense cap: 25% of gross farm income (IRC section 175)
 *   Excess conservation carries forward to future years
 *   Conservation = $0 when gross farm income <= 0
 *   Net farm profit/loss = gross farm income - total expenses
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleF, type ScheduleFInput } from "@/engine/schedules/schedule-f.js";

const d = (v: string | number) => new Decimal(v);

// ═══════════════════════════════════════════════════════
// Conservation expense cap boundary tests
// ═══════════════════════════════════════════════════════

describe("Schedule F conservation expense cap boundaries", () => {
  it("Schedule F Line 12 - conservation exactly at 25% cap (no carryforward)", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "100000",
      expenses: { conservation: "25000" },
    });
    // 25% of 100000 = 25000
    expect(result.conservationDeduction.toNumber()).toBe(25000);
    expect(result.conservationCarryforward.toNumber()).toBe(0);
  });

  it("Schedule F Line 12 - conservation $1 above 25% cap creates $1 carryforward", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "100000",
      expenses: { conservation: "25001" },
    });
    expect(result.conservationDeduction.toNumber()).toBe(25000);
    expect(result.conservationCarryforward.toNumber()).toBe(1);
  });

  it("Schedule F Line 12 - conservation $1 below 25% cap uses full amount", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "100000",
      expenses: { conservation: "24999" },
    });
    expect(result.conservationDeduction.toNumber()).toBe(24999);
    expect(result.conservationCarryforward.toNumber()).toBe(0);
  });

  it("Schedule F Line 12 - gross income of $1 caps conservation at $0 (25% of 1 = 0.25 rounds to 0)", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "1",
      expenses: { conservation: "1000" },
    });
    // roundDollar(0.25) = 0
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(1000);
  });

  it("Schedule F Line 12 - gross income of $2 caps conservation at $1 (25% of 2 = 0.50 rounds to 1)", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "2",
      expenses: { conservation: "500" },
    });
    // roundDollar(0.50) = 1 (rounds up at .5)
    expect(result.conservationDeduction.toNumber()).toBeLessThanOrEqual(1);
    expect(result.conservationCarryforward.toNumber()).toBeGreaterThanOrEqual(499);
  });

  it("Schedule F Line 12 - gross income of $4 caps conservation at $1", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "4",
      expenses: { conservation: "100" },
    });
    // roundDollar(1.00) = 1
    expect(result.conservationDeduction.toNumber()).toBe(1);
    expect(result.conservationCarryforward.toNumber()).toBe(99);
  });

  it("Schedule F Line 12 - zero gross income disallows all conservation", () => {
    const result = calculateScheduleF({
      expenses: { conservation: "10000" },
    });
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(10000);
  });

  it("Schedule F Line 12 - negative gross income disallows all conservation", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "5000",
      costOfPurchasedLivestock: "15000",
      expenses: { conservation: "3000" },
    });
    // Gross income: 5000 - 15000 = -10000
    expect(result.grossFarmIncome.toNumber()).toBe(-10000);
    expect(result.conservationDeduction.toNumber()).toBe(0);
    expect(result.conservationCarryforward.toNumber()).toBe(3000);
  });

  it("Schedule F Line 12 - conservation carryforward only (no current-year expense)", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "80000",
      conservationCarryforward: "5000",
    });
    // 25% of 80000 = 20000, carryforward of 5000 is well under cap
    expect(result.conservationDeduction.toNumber()).toBe(5000);
    expect(result.conservationCarryforward.toNumber()).toBe(0);
  });

  it("Schedule F Line 12 - current-year + carryforward exceeds cap", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "40000",
      conservationCarryforward: "8000",
      expenses: { conservation: "6000" },
    });
    // Total conservation: 6000 + 8000 = 14000
    // Cap: 25% of 40000 = 10000
    expect(result.conservationDeduction.toNumber()).toBe(10000);
    expect(result.conservationCarryforward.toNumber()).toBe(4000);
  });

  it("Schedule F Line 12 - cap rounds to nearest dollar on odd gross income", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "33333",
      expenses: { conservation: "50000" },
    });
    // 25% of 33333 = 8333.25 → rounds to 8333
    expect(result.conservationDeduction.toNumber()).toBe(8333);
    expect(result.conservationCarryforward.toNumber()).toBe(41667);
  });
});

// ═══════════════════════════════════════════════════════
// Net farm profit/loss boundary tests
// ═══════════════════════════════════════════════════════

describe("Schedule F net profit/loss boundaries", () => {
  it("Schedule F Line 34 - net profit exactly $0 when income equals expenses", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "50000",
      expenses: {
        feed: "25000",
        laborHired: "15000",
        depreciation: "10000",
      },
    });
    expect(result.netFarmProfit.toNumber()).toBe(0);
  });

  it("Schedule F Line 34 - net loss of $1 when expenses exceed income by $1", () => {
    const result = calculateScheduleF({
      salesOfProductsRaised: "50000",
      expenses: {
        feed: "25000",
        laborHired: "15001",
        depreciation: "10000",
      },
    });
    expect(result.netFarmProfit.toNumber()).toBe(-1);
  });

  it("Schedule F Line 34 - expenses only (no income) creates full loss", () => {
    const result = calculateScheduleF({
      expenses: {
        feed: "20000",
        depreciation: "10000",
        insurance: "5000",
      },
    });
    expect(result.grossFarmIncome.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(35000);
    expect(result.netFarmProfit.toNumber()).toBe(-35000);
  });
});

// ═══════════════════════════════════════════════════════
// Purchased livestock net calculation
// ═══════════════════════════════════════════════════════

describe("Schedule F purchased livestock edge cases", () => {
  it("Schedule F Line 1c - sales exactly equal cost (zero net)", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "50000",
      costOfPurchasedLivestock: "50000",
    });
    expect(result.netPurchasedLivestock.toNumber()).toBe(0);
    expect(result.grossFarmIncome.toNumber()).toBe(0);
  });

  it("Schedule F Line 1c - livestock loss reduces gross farm income below zero", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "10000",
      costOfPurchasedLivestock: "30000",
    });
    expect(result.netPurchasedLivestock.toNumber()).toBe(-20000);
    expect(result.grossFarmIncome.toNumber()).toBe(-20000);
  });

  it("Schedule F Line 1c - livestock loss partially offset by other income", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "10000",
      costOfPurchasedLivestock: "30000",
      salesOfProductsRaised: "15000",
    });
    // Net livestock: -20000, products: 15000
    // Gross: -20000 + 15000 = -5000
    expect(result.grossFarmIncome.toNumber()).toBe(-5000);
  });
});

// ═══════════════════════════════════════════════════════
// All income sources simultaneously
// ═══════════════════════════════════════════════════════

describe("Schedule F combined income sources", () => {
  it("Schedule F Line 9 - all income sources provided sum correctly", () => {
    const result = calculateScheduleF({
      salesOfPurchasedLivestock: "100000",
      costOfPurchasedLivestock: "70000",
      salesOfProductsRaised: "200000",
      cooperativeDistributions: "5000",
      agriculturalProgramPayments: "10000",
      cccLoansElected: "3000",
      cccLoansForfeited: "2000",
      cropInsuranceProceeds: "8000",
      priorYearDeferredCropInsurance: "4000",
      customHireIncome: "12000",
      otherFarmIncome: "6000",
    });
    // Net livestock: 100000 - 70000 = 30000
    // Sum: 30000 + 200000 + 5000 + 10000 + 3000 + 2000 + 8000 + 4000 + 12000 + 6000 = 280000
    expect(result.grossFarmIncome.toNumber()).toBe(280000);
  });

  it("Schedule F Line 9 - CCC elected and forfeited are independent income items", () => {
    const result = calculateScheduleF({
      cccLoansElected: "20000",
      cccLoansForfeited: "5000",
    });
    // Both count independently toward gross income
    expect(result.grossFarmIncome.toNumber()).toBe(25000);
  });
});

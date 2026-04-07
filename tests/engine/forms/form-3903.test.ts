/**
 * Tests for Form 3903 — Moving Expenses (Armed Forces only, 2018–2025)
 * Spec: spec/federal/form-3903.yaml
 *
 * IRC §217(k) preserves the moving expense deduction for active-duty
 * Armed Forces members during the TCJA suspension period.
 */

import { describe, expect, it } from "vitest";
import { calculateForm3903 } from "@/engine/forms/form-3903.js";
import { calculateSchedule1 } from "@/engine/schedules/schedule-1.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import Decimal from "decimal.js";

const d = (n: number | string) => new Decimal(n);

// ── Form 3903 line-by-line ────────────────────────────────────────

describe("Form 3903 line-by-line", () => {
  it("Line 1 - transportation and storage of household goods", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "4500",
        travelAndLodging: "0",
        reimbursementsExcludedFromIncome: "0",
      }],
    });

    expect(result.moveResults[0].line1.toNumber()).toBe(4500);
    expect(result.moveResults[0].line2.toNumber()).toBe(0);
  });

  it("Line 2 - travel and lodging from old home to new home", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "0",
        travelAndLodging: "1200",
        reimbursementsExcludedFromIncome: "0",
      }],
    });

    expect(result.moveResults[0].line2.toNumber()).toBe(1200);
  });

  it("Line 3 - total moving expenses equals sum of Lines 1 and 2", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "3500",
        travelAndLodging: "800",
        reimbursementsExcludedFromIncome: "0",
      }],
    });

    expect(result.moveResults[0].line3.toNumber()).toBe(4300);
  });

  it("Line 4 - reimbursements excluded from income reduce the deduction", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "5000",
        travelAndLodging: "1500",
        reimbursementsExcludedFromIncome: "3000",
      }],
    });

    expect(result.moveResults[0].line4.toNumber()).toBe(3000);
    expect(result.moveResults[0].line5.toNumber()).toBe(3500);
  });

  it("Line 5 - deductible amount is max(0, total expenses - reimbursements)", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "4000",
        travelAndLodging: "1000",
        reimbursementsExcludedFromIncome: "0",
      }],
    });

    expect(result.moveResults[0].line5.toNumber()).toBe(5000);
    expect(result.totalDeductible.toNumber()).toBe(5000);
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("Form 3903 edge cases", () => {
  it("reimbursement exceeds expenses - deductible is $0, not negative", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "2000",
        travelAndLodging: "500",
        reimbursementsExcludedFromIncome: "5000",
      }],
    });

    // Expenses = 2500, reimbursement = 5000 → deductible = 0
    expect(result.moveResults[0].line3.toNumber()).toBe(2500);
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("reimbursement equals expenses exactly - deductible is $0", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "3000",
        travelAndLodging: "1000",
        reimbursementsExcludedFromIncome: "4000",
      }],
    });

    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("zero expenses - deductible is $0", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "0",
        travelAndLodging: "0",
        reimbursementsExcludedFromIncome: "0",
      }],
    });

    expect(result.moveResults[0].line3.toNumber()).toBe(0);
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("only transportation, no travel - still computes correctly", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "8000",
      }],
    });

    expect(result.moveResults[0].line1.toNumber()).toBe(8000);
    expect(result.moveResults[0].line2.toNumber()).toBe(0);
    expect(result.moveResults[0].line3.toNumber()).toBe(8000);
    expect(result.moveResults[0].line5.toNumber()).toBe(8000);
  });

  it("only travel, no transportation - still computes correctly", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        travelAndLodging: "2200",
      }],
    });

    expect(result.moveResults[0].line1.toNumber()).toBe(0);
    expect(result.moveResults[0].line2.toNumber()).toBe(2200);
    expect(result.moveResults[0].line3.toNumber()).toBe(2200);
    expect(result.moveResults[0].line5.toNumber()).toBe(2200);
  });

  it("partial reimbursement — produces correct deductible remainder", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "6000",
        travelAndLodging: "2000",
        reimbursementsExcludedFromIncome: "4500",
      }],
    });

    // Expenses = 8000, reimbursement = 4500 → deductible = 3500
    expect(result.moveResults[0].line5.toNumber()).toBe(3500);
    expect(result.totalDeductible.toNumber()).toBe(3500);
  });
});

// ── Multiple moves ────────────────────────────────────────────────

describe("Form 3903 multiple moves in one year", () => {
  it("aggregates deductible amounts from two separate PCS moves", () => {
    const result = calculateForm3903({
      military: true,
      moves: [
        {
          transportationAndStorage: "5000",
          travelAndLodging: "1500",
          reimbursementsExcludedFromIncome: "3000",
        },
        {
          transportationAndStorage: "4000",
          travelAndLodging: "800",
          reimbursementsExcludedFromIncome: "2000",
        },
      ],
    });

    // Move 1: expenses = 6500, reimb = 3000, deductible = 3500
    expect(result.moveResults[0].line5.toNumber()).toBe(3500);
    // Move 2: expenses = 4800, reimb = 2000, deductible = 2800
    expect(result.moveResults[1].line5.toNumber()).toBe(2800);
    // Total: 3500 + 2800 = 6300
    expect(result.totalDeductible.toNumber()).toBe(6300);
  });

  it("one move fully reimbursed and one not — total reflects only unreimbursed move", () => {
    const result = calculateForm3903({
      military: true,
      moves: [
        {
          transportationAndStorage: "3000",
          travelAndLodging: "500",
          reimbursementsExcludedFromIncome: "5000",
        },
        {
          transportationAndStorage: "2000",
          travelAndLodging: "400",
          reimbursementsExcludedFromIncome: "0",
        },
      ],
    });

    // Move 1: expenses = 3500, reimb = 5000 → deductible = 0
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    // Move 2: expenses = 2400, reimb = 0 → deductible = 2400
    expect(result.moveResults[1].line5.toNumber()).toBe(2400);
    expect(result.totalDeductible.toNumber()).toBe(2400);
  });

  it("three moves aggregated correctly", () => {
    const result = calculateForm3903({
      military: true,
      moves: [
        { transportationAndStorage: "1000", travelAndLodging: "500" },
        { transportationAndStorage: "2000", travelAndLodging: "300" },
        { transportationAndStorage: "3000", travelAndLodging: "700" },
      ],
    });

    // 1500 + 2300 + 3700 = 7500
    expect(result.totalDeductible.toNumber()).toBe(7500);
  });
});

// ── Audit trail ───────────────────────────────────────────────────

describe("Form 3903 audit trail", () => {
  it("records per-line audit entries for a single move", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "6000",
        travelAndLodging: "1500",
        reimbursementsExcludedFromIncome: "2000",
      }],
    });

    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(6000);

    const line3 = result.lines.find((l) => l.line === "3");
    expect(line3).toBeDefined();
    expect(line3!.value.toNumber()).toBe(7500);

    const line5 = result.lines.find((l) => l.line === "5");
    expect(line5).toBeDefined();
    expect(line5!.value.toNumber()).toBe(5500);
  });

  it("records labeled per-move audit entries for multiple moves", () => {
    const result = calculateForm3903({
      military: true,
      moves: [
        { transportationAndStorage: "3000", travelAndLodging: "500" },
        { transportationAndStorage: "4000", travelAndLodging: "800" },
      ],
    });

    const move1Line1 = result.lines.find((l) => l.line === "1 (Move 1)");
    expect(move1Line1).toBeDefined();
    expect(move1Line1!.value.toNumber()).toBe(3000);

    const move2Line1 = result.lines.find((l) => l.line === "1 (Move 2)");
    expect(move2Line1).toBeDefined();
    expect(move2Line1!.value.toNumber()).toBe(4000);

    const totalLine = result.lines.find((l) => l.line === "total");
    expect(totalLine).toBeDefined();
    expect(totalLine!.value.toNumber()).toBe(8300);
  });
});

// ── Schedule 1 integration ────────────────────────────────────────

describe("Form 3903 Schedule 1 integration", () => {
  it("Form 3903 deductible amount flows to Schedule 1 Line 14 as an above-the-line adjustment", () => {
    const input = {
      ...simpleW2Fixture,
      form3903: {
        military: true as const,
        moves: [{
          transportationAndStorage: "5000",
          travelAndLodging: "1200",
          reimbursementsExcludedFromIncome: "2000",
        }],
      },
    };

    const result = calculateFederalTax(input);
    // Deductible = 6200 - 2000 = 4200
    expect(result.schedule1.armedForcesMovingExpenses.toNumber()).toBe(4200);
    // AGI should be reduced by 4200 (85000 - 4200 = 80800)
    expect(result.agi.toNumber()).toBe(80800);
  });

  it("manual armedForcesMovingExpenses still works when Form 3903 is not provided", () => {
    const input = {
      ...simpleW2Fixture,
      adjustments: {
        armedForcesMovingExpenses: "3000",
      },
    };

    const result = calculateFederalTax(input);
    expect(result.schedule1.armedForcesMovingExpenses.toNumber()).toBe(3000);
    // AGI = 85000 - 3000 = 82000
    expect(result.agi.toNumber()).toBe(82000);
  });

  it("Form 3903 with zero deductible does not affect AGI", () => {
    const input = {
      ...simpleW2Fixture,
      form3903: {
        military: true as const,
        moves: [{
          transportationAndStorage: "3000",
          reimbursementsExcludedFromIncome: "5000",
        }],
      },
    };

    const result = calculateFederalTax(input);
    expect(result.schedule1.armedForcesMovingExpenses.toNumber()).toBe(0);
    expect(result.agi.toNumber()).toBe(85000);
  });
});

// ── Realistic scenarios ───────────────────────────────────────────

describe("Form 3903 realistic scenarios", () => {
  it("enlisted soldier PCS from Fort Bragg to Fort Hood — partial reimbursement", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        // Professional movers: $4,200
        // 30-day storage at destination: $800
        transportationAndStorage: "5000",
        // Drive 1,100 miles ($242 at 22¢/mile) + 2 nights lodging ($300)
        travelAndLodging: "542",
        // DLA and partial moving allowance excluded from income
        reimbursementsExcludedFromIncome: "3200",
      }],
    });

    // Total expenses: 5000 + 542 = 5542
    // Reimbursement: 3200
    // Deductible: 2342
    expect(result.moveResults[0].line3.toNumber()).toBe(5542);
    expect(result.moveResults[0].line5.toNumber()).toBe(2342);
    expect(result.totalDeductible.toNumber()).toBe(2342);
  });

  it("officer with overseas PCS — two moves in one year (CONUS to OCONUS, temporary to permanent)", () => {
    const result = calculateForm3903({
      military: true,
      moves: [
        {
          // CONUS move to port: household goods to storage
          transportationAndStorage: "3000",
          travelAndLodging: "400",
          reimbursementsExcludedFromIncome: "2500",
        },
        {
          // OCONUS move: storage to overseas quarters
          transportationAndStorage: "8000",
          travelAndLodging: "1800",
          reimbursementsExcludedFromIncome: "7000",
        },
      ],
    });

    // Move 1: 3400 - 2500 = 900
    // Move 2: 9800 - 7000 = 2800
    // Total: 3700
    expect(result.moveResults[0].line5.toNumber()).toBe(900);
    expect(result.moveResults[1].line5.toNumber()).toBe(2800);
    expect(result.totalDeductible.toNumber()).toBe(3700);
  });

  it("fully reimbursed military move — deduction is $0", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        transportationAndStorage: "6000",
        travelAndLodging: "1000",
        reimbursementsExcludedFromIncome: "7000",
      }],
    });

    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("large family cross-country PCS — significant unreimbursed expenses", () => {
    const result = calculateForm3903({
      military: true,
      moves: [{
        // Full household move: 18,000 lbs at $0.80/lb = $14,400
        // Plus crating and insurance
        transportationAndStorage: "16000",
        // Family of 6 driving 2,500 miles + 4 nights lodging
        travelAndLodging: "2150",
        // Government covers a portion
        reimbursementsExcludedFromIncome: "12000",
      }],
    });

    // Total: 18150 - 12000 = 6150
    expect(result.totalDeductible.toNumber()).toBe(6150);
  });
});

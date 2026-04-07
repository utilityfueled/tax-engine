/**
 * Tests for Pennsylvania Schedule UE — Allowable Employee Business Expenses
 * Spec: spec/state/pa-schedule-ue.yaml
 *
 * PA still allows unreimbursed employee business expenses (PA-40 Line 1b).
 * Federal eliminated this deduction after TCJA (2017) but PA retained it.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleUE,
  type ScheduleUEInput,
} from "@/engine/state/pa-schedule-ue.js";

const d = (n: number | string) => new Decimal(n);

/** Minimal input with defaults */
function makeInput(overrides: Partial<ScheduleUEInput> = {}): ScheduleUEInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

describe("Pennsylvania Schedule UE", () => {
  // =================================================================
  // Part A — Vehicle Expenses
  // =================================================================

  describe("Part A — Vehicle Expenses", () => {
    it("PA Schedule UE Part A - vehicle expense using standard mileage rate", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 20000,
          businessMiles: 12000,
        },
      }));
      // 12,000 miles × $0.70/mile = $8,400
      expect(result.standardMileageDeduction.toNumber()).toBe(8400);
      expect(result.actualVehicleDeduction.toNumber()).toBe(0);
      expect(result.totalVehicleExpenses.toNumber()).toBe(8400);
      expect(result.vehicleMethod).toBe("standard");
      expect(result.businessMiles).toBe(12000);
      expect(result.totalMiles).toBe(20000);
    });

    it("PA Schedule UE Part A - standard mileage rate for 2024 tax year", () => {
      const result = calculateScheduleUE(makeInput({
        taxYear: 2024,
        vehicle: {
          method: "standard",
          totalMiles: 15000,
          businessMiles: 10000,
        },
      }));
      // 10,000 miles × $0.67/mile = $6,700
      expect(result.standardMileageDeduction.toNumber()).toBe(6700);
    });

    it("PA Schedule UE Part A - actual vehicle expenses", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 20000,
          businessMiles: 12000,
          actualExpenses: d(6000), // gas, insurance, repairs, etc.
        },
      }));
      // Business use: 12000/20000 = 60%
      // $6,000 × 60% = $3,600
      expect(result.businessUsePercentage.toNumber()).toBe(0.6);
      expect(result.actualVehicleDeduction.toNumber()).toBe(3600);
      expect(result.standardMileageDeduction.toNumber()).toBe(0);
      expect(result.totalVehicleExpenses.toNumber()).toBe(3600);
      expect(result.vehicleMethod).toBe("actual");
    });

    it("PA Schedule UE Part A - actual expenses with non-round business percentage", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 15000,
          businessMiles: 7500,
          actualExpenses: d(4500),
        },
      }));
      // Business use: 7500/15000 = 50%
      // $4,500 × 50% = $2,250
      expect(result.businessUsePercentage.toNumber()).toBe(0.5);
      expect(result.actualVehicleDeduction.toNumber()).toBe(2250);
    });

    it("PA Schedule UE Part A - parking and tolls", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 10000,
          businessMiles: 5000,
          parkingAndTolls: d(1200),
        },
      }));
      // 5,000 miles × $0.70 = $3,500 + $1,200 parking/tolls = $4,700
      expect(result.parkingAndTolls.toNumber()).toBe(1200);
      expect(result.standardMileageDeduction.toNumber()).toBe(3500);
      expect(result.totalVehicleExpenses.toNumber()).toBe(4700);
    });

    it("PA Schedule UE Part A - zero business miles produces zero deduction", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 15000,
          businessMiles: 0,
        },
      }));
      expect(result.standardMileageDeduction.toNumber()).toBe(0);
      expect(result.totalVehicleExpenses.toNumber()).toBe(0);
    });

    it("PA Schedule UE Part A - zero total miles produces zero business use percentage", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 0,
          businessMiles: 0,
          actualExpenses: d(3000),
        },
      }));
      expect(result.businessUsePercentage.toNumber()).toBe(0);
      expect(result.actualVehicleDeduction.toNumber()).toBe(0);
    });

    it("PA Schedule UE Part A - business miles cannot exceed total miles in percentage", () => {
      // If business miles > total miles, percentage is clamped to 100%
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 10000,
          businessMiles: 12000, // More than total (data entry error)
          actualExpenses: d(5000),
        },
      }));
      // Percentage clamped to 1.0 (100%)
      expect(result.businessUsePercentage.toNumber()).toBe(1);
      expect(result.actualVehicleDeduction.toNumber()).toBe(5000);
    });

    it("PA Schedule UE Part A - standard mileage with high business miles", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 40000,
          businessMiles: 35000,
        },
      }));
      // 35,000 × $0.70 = $24,500
      expect(result.standardMileageDeduction.toNumber()).toBe(24500);
    });

    it("PA Schedule UE Part A - parking and tolls only (no mileage)", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 0,
          businessMiles: 0,
          parkingAndTolls: d(500),
        },
      }));
      expect(result.standardMileageDeduction.toNumber()).toBe(0);
      expect(result.parkingAndTolls.toNumber()).toBe(500);
      expect(result.totalVehicleExpenses.toNumber()).toBe(500);
    });
  });

  // =================================================================
  // Part B — Travel Expenses
  // =================================================================

  describe("Part B — Travel Expenses", () => {
    it("PA Schedule UE Part B - travel expenses with meal limitation", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          lodging: d(2000),
          meals: d(1200),
          otherTravel: d(800),
        },
      }));
      // Meals after 50% limitation: $1,200 × 50% = $600
      // Total: $2,000 + $600 + $800 = $3,400
      expect(result.lodging.toNumber()).toBe(2000);
      expect(result.mealsBeforeLimitation.toNumber()).toBe(1200);
      expect(result.mealsAfterLimitation.toNumber()).toBe(600);
      expect(result.otherTravel.toNumber()).toBe(800);
      expect(result.totalTravelExpenses.toNumber()).toBe(3400);
    });

    it("PA Schedule UE Part B - meals only with 50% limitation", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          meals: d(500),
        },
      }));
      // $500 × 50% = $250
      expect(result.mealsAfterLimitation.toNumber()).toBe(250);
      expect(result.totalTravelExpenses.toNumber()).toBe(250);
    });

    it("PA Schedule UE Part B - odd-cent meal amount rounds correctly", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          meals: d(333),
        },
      }));
      // $333 × 50% = $166.50 → rounds to $167
      expect(result.mealsAfterLimitation.toNumber()).toBe(167);
    });

    it("PA Schedule UE Part B - zero meals produces zero after limitation", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          lodging: d(1500),
          meals: d(0),
          otherTravel: d(200),
        },
      }));
      expect(result.mealsAfterLimitation.toNumber()).toBe(0);
      expect(result.totalTravelExpenses.toNumber()).toBe(1700);
    });

    it("PA Schedule UE Part B - lodging only", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          lodging: d(3000),
        },
      }));
      expect(result.lodging.toNumber()).toBe(3000);
      expect(result.totalTravelExpenses.toNumber()).toBe(3000);
    });

    it("PA Schedule UE Part B - no travel input produces zero", () => {
      const result = calculateScheduleUE(makeInput({}));
      expect(result.totalTravelExpenses.toNumber()).toBe(0);
    });

    it("PA Schedule UE Part B - large travel expense scenario", () => {
      const result = calculateScheduleUE(makeInput({
        travel: {
          lodging: d(8000),
          meals: d(4000),
          otherTravel: d(6000), // airfare, car rental
        },
      }));
      // Meals: $4,000 × 50% = $2,000
      // Total: $8,000 + $2,000 + $6,000 = $16,000
      expect(result.mealsAfterLimitation.toNumber()).toBe(2000);
      expect(result.totalTravelExpenses.toNumber()).toBe(16000);
    });
  });

  // =================================================================
  // Part C — Other Employee Expenses
  // =================================================================

  describe("Part C — Other Employee Expenses", () => {
    it("PA Schedule UE Part C - other employee expenses", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(600),
          toolsAndSupplies: d(350),
          workClothing: d(200),
          education: d(1500),
          licenseFees: d(150),
          subscriptions: d(100),
          otherExpenses: d(75),
        },
      }));
      // Total: 600 + 350 + 200 + 1500 + 150 + 100 + 75 = 2975
      expect(result.unionDues.toNumber()).toBe(600);
      expect(result.toolsAndSupplies.toNumber()).toBe(350);
      expect(result.workClothing.toNumber()).toBe(200);
      expect(result.education.toNumber()).toBe(1500);
      expect(result.licenseFees.toNumber()).toBe(150);
      expect(result.subscriptions.toNumber()).toBe(100);
      expect(result.otherExpenses.toNumber()).toBe(75);
      expect(result.totalOtherExpenses.toNumber()).toBe(2975);
    });

    it("PA Schedule UE Part C - union dues only", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(840),
        },
      }));
      expect(result.unionDues.toNumber()).toBe(840);
      expect(result.totalOtherExpenses.toNumber()).toBe(840);
    });

    it("PA Schedule UE Part C - home office expenses", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          homeOffice: d(2400),
        },
      }));
      expect(result.homeOffice.toNumber()).toBe(2400);
      expect(result.totalOtherExpenses.toNumber()).toBe(2400);
    });

    it("PA Schedule UE Part C - all categories populated", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(500),
          toolsAndSupplies: d(300),
          workClothing: d(150),
          education: d(2000),
          licenseFees: d(200),
          subscriptions: d(80),
          homeOffice: d(1800),
          otherExpenses: d(120),
        },
      }));
      // 500 + 300 + 150 + 2000 + 200 + 80 + 1800 + 120 = 5150
      expect(result.totalOtherExpenses.toNumber()).toBe(5150);
    });

    it("PA Schedule UE Part C - no other expenses produces zero", () => {
      const result = calculateScheduleUE(makeInput({}));
      expect(result.totalOtherExpenses.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Part D — Summary
  // =================================================================

  describe("Part D — Summary", () => {
    it("PA Schedule UE Part D - summary total and net", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 20000,
          businessMiles: 10000,
          parkingAndTolls: d(500),
        },
        travel: {
          lodging: d(1500),
          meals: d(800),
          otherTravel: d(600),
        },
        otherExpenses: {
          unionDues: d(400),
          education: d(1000),
        },
      }));
      // Vehicle: 10,000 × $0.70 = $7,000 + $500 = $7,500
      // Travel: $1,500 + ($800 × 50%) + $600 = $1,500 + $400 + $600 = $2,500
      // Other: $400 + $1,000 = $1,400
      // Total: $7,500 + $2,500 + $1,400 = $11,400
      expect(result.totalVehicleExpenses.toNumber()).toBe(7500);
      expect(result.totalTravelExpenses.toNumber()).toBe(2500);
      expect(result.totalOtherExpenses.toNumber()).toBe(1400);
      expect(result.totalExpenses.toNumber()).toBe(11400);
      expect(result.employerReimbursements.toNumber()).toBe(0);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(11400);
    });

    it("PA Schedule UE Part D - employer reimbursements offset", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(600),
          toolsAndSupplies: d(400),
        },
        employerReimbursements: d(300),
      }));
      // Total: $1,000
      // Less reimbursements: $300
      // Net: $700
      expect(result.totalExpenses.toNumber()).toBe(1000);
      expect(result.employerReimbursements.toNumber()).toBe(300);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(700);
    });

    it("PA Schedule UE Part D - net cannot go below zero", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          toolsAndSupplies: d(200),
        },
        employerReimbursements: d(500), // Exceeds expenses
      }));
      expect(result.totalExpenses.toNumber()).toBe(200);
      expect(result.employerReimbursements.toNumber()).toBe(500);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(0);
    });

    it("PA Schedule UE Part D - zero expenses with reimbursements", () => {
      const result = calculateScheduleUE(makeInput({
        employerReimbursements: d(1000),
      }));
      expect(result.totalExpenses.toNumber()).toBe(0);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(0);
    });

    it("PA Schedule UE Part D - all parts combined", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 25000,
          businessMiles: 15000,
          actualExpenses: d(8000),
          parkingAndTolls: d(750),
        },
        travel: {
          lodging: d(3000),
          meals: d(1600),
          otherTravel: d(2500),
        },
        otherExpenses: {
          unionDues: d(720),
          toolsAndSupplies: d(500),
          workClothing: d(250),
          education: d(3000),
          licenseFees: d(175),
          subscriptions: d(120),
          homeOffice: d(2000),
          otherExpenses: d(150),
        },
        employerReimbursements: d(1500),
      }));
      // Vehicle: $8,000 × 60% = $4,800 + $750 = $5,550
      // Travel: $3,000 + ($1,600 × 50%) + $2,500 = $3,000 + $800 + $2,500 = $6,300
      // Other: 720 + 500 + 250 + 3000 + 175 + 120 + 2000 + 150 = $6,915
      // Total: $5,550 + $6,300 + $6,915 = $18,765
      // Net: $18,765 - $1,500 = $17,265
      expect(result.totalVehicleExpenses.toNumber()).toBe(5550);
      expect(result.totalTravelExpenses.toNumber()).toBe(6300);
      expect(result.totalOtherExpenses.toNumber()).toBe(6915);
      expect(result.totalExpenses.toNumber()).toBe(18765);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(17265);
    });

    it("PA Schedule UE Part D - no inputs produces zero net", () => {
      const result = calculateScheduleUE(makeInput({}));
      expect(result.totalExpenses.toNumber()).toBe(0);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(0);
      expect(result.vehicleMethod).toBe("none");
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA Schedule UE - high mileage sales representative", () => {
      // Realistic scenario: outside sales rep with heavy driving
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 45000,
          businessMiles: 38000,
          parkingAndTolls: d(2400),
        },
        travel: {
          lodging: d(5000),
          meals: d(3000),
          otherTravel: d(1200),
        },
        otherExpenses: {
          subscriptions: d(200),
          licenseFees: d(150),
        },
      }));
      // Vehicle: 38,000 × $0.70 = $26,600 + $2,400 = $29,000
      // Travel: $5,000 + $1,500 + $1,200 = $7,700
      // Other: $200 + $150 = $350
      // Total: $29,000 + $7,700 + $350 = $37,050
      expect(result.standardMileageDeduction.toNumber()).toBe(26600);
      expect(result.totalExpenses.toNumber()).toBe(37050);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(37050);
    });

    it("PA Schedule UE - teacher with education and supply expenses", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          toolsAndSupplies: d(800), // classroom supplies
          education: d(4500), // continuing ed credits
          subscriptions: d(150), // educational journals
        },
      }));
      expect(result.totalOtherExpenses.toNumber()).toBe(5450);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(5450);
    });

    it("PA Schedule UE - construction worker with tools and union dues", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(1200),
          toolsAndSupplies: d(3500),
          workClothing: d(600), // safety gear, boots
        },
      }));
      expect(result.totalOtherExpenses.toNumber()).toBe(5300);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(5300);
    });

    it("PA Schedule UE - remote worker with home office", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          homeOffice: d(3600), // $300/month home office
          subscriptions: d(240), // software subscriptions
          toolsAndSupplies: d(800), // monitor, keyboard, etc.
        },
      }));
      expect(result.totalOtherExpenses.toNumber()).toBe(4640);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(4640);
    });

    it("PA Schedule UE - partial reimbursement scenario", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 10000,
          businessMiles: 8000,
        },
        otherExpenses: {
          toolsAndSupplies: d(500),
        },
        // Employer reimburses mileage at lower rate
        employerReimbursements: d(4000), // covers some but not all
      }));
      // Vehicle: 8,000 × $0.70 = $5,600
      // Other: $500
      // Total: $6,100
      // Net: $6,100 - $4,000 = $2,100
      expect(result.totalExpenses.toNumber()).toBe(6100);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(2100);
    });

    it("PA Schedule UE - full reimbursement eliminates deduction", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: {
          unionDues: d(500),
          education: d(1000),
        },
        employerReimbursements: d(1500), // Exactly equals expenses
      }));
      expect(result.totalExpenses.toNumber()).toBe(1500);
      expect(result.netUnreimbursedExpenses.toNumber()).toBe(0);
    });

    it("PA Schedule UE - actual vehicle with low business use percentage", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "actual",
          totalMiles: 30000,
          businessMiles: 3000, // 10% business use
          actualExpenses: d(9000),
        },
      }));
      // 3,000/30,000 = 10%
      // $9,000 × 10% = $900
      expect(result.businessUsePercentage.toNumber()).toBeCloseTo(0.1, 10);
      expect(result.actualVehicleDeduction.toNumber()).toBe(900);
    });

    it("PA Schedule UE - 2024 tax year uses correct mileage rate", () => {
      const result = calculateScheduleUE(makeInput({
        taxYear: 2024,
        vehicle: {
          method: "standard",
          totalMiles: 10000,
          businessMiles: 5000,
        },
      }));
      // 5,000 × $0.67 = $3,350
      expect(result.standardMileageDeduction.toNumber()).toBe(3350);
    });

    it("PA Schedule UE - unsupported tax year throws error", () => {
      expect(() => calculateScheduleUE(makeInput({ taxYear: 2020 }))).toThrow(
        "PA Schedule UE constants not available for tax year 2020"
      );
    });
  });

  // =================================================================
  // Audit Trail
  // =================================================================

  describe("Audit Trail", () => {
    it("PA Schedule UE produces audit trail for all computed lines", () => {
      const result = calculateScheduleUE(makeInput({
        vehicle: {
          method: "standard",
          totalMiles: 10000,
          businessMiles: 5000,
          parkingAndTolls: d(100),
        },
        travel: {
          lodging: d(500),
          meals: d(200),
          otherTravel: d(300),
        },
        otherExpenses: {
          unionDues: d(100),
        },
        employerReimbursements: d(50),
      }));

      expect(result.lines.length).toBeGreaterThan(0);

      // Key lines should be recorded
      const lineIds = result.lines.map((l) => l.line);
      expect(lineIds).toContain("A1");
      expect(lineIds).toContain("A2");
      expect(lineIds).toContain("A3");
      expect(lineIds).toContain("A4a");
      expect(lineIds).toContain("A5");
      expect(lineIds).toContain("A6");
      expect(lineIds).toContain("B1");
      expect(lineIds).toContain("B2");
      expect(lineIds).toContain("B3");
      expect(lineIds).toContain("B4");
      expect(lineIds).toContain("B5");
      expect(lineIds).toContain("C1");
      expect(lineIds).toContain("C9");
      expect(lineIds).toContain("D1");
      expect(lineIds).toContain("D2");
      expect(lineIds).toContain("D3");
    });

    it("PA Schedule UE audit trail records correct form name", () => {
      const result = calculateScheduleUE(makeInput({
        otherExpenses: { unionDues: d(100) },
      }));
      for (const line of result.lines) {
        expect(line.form).toBe("PA-UE");
      }
    });
  });
});

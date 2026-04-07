/**
 * Tests for Pennsylvania Schedule NRH — Non-Resident Apportionment
 * Spec: spec/state/pa-schedule-nrh.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePAScheduleNRH,
  type PAScheduleNRHInput,
} from "@/engine/state/pa-schedule-nrh.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<PAScheduleNRHInput> = {}): PAScheduleNRHInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

describe("Pennsylvania Schedule NRH", () => {
  it("PA Schedule NRH Part A - working-day apportionment computes Pennsylvania compensation", () => {
    const result = calculatePAScheduleNRH(makeInput({
      compensation: {
        method: "working_days",
        grossCompensation: d(120000),
        totalDaysForEmployer: 365,
        nonworkingDays: 115,
        daysWorkedInPennsylvania: 150,
      },
    }));

    expect(result.workingDays).toBe(250);
    expect(result.workingDayFraction.toFixed(6)).toBe("0.600000");
    expect(result.selectedApportionmentFraction.toFixed(6)).toBe("0.600000");
    expect(result.apportionedGrossCompensation.toNumber()).toBe(72000);
    expect(result.netPATaxableCompensation.toNumber()).toBe(72000);
  });

  it("PA Schedule NRH Part B - business-volume apportionment computes Pennsylvania compensation", () => {
    const result = calculatePAScheduleNRH(makeInput({
      compensation: {
        method: "business_volume",
        grossCompensation: d(90000),
        totalBusinessVolume: d(2000000),
        pennsylvaniaBusinessVolume: d(450000),
      },
    }));

    expect(result.businessVolumeFraction.toFixed(6)).toBe("0.225000");
    expect(result.selectedApportionmentFraction.toFixed(6)).toBe("0.225000");
    expect(result.apportionedGrossCompensation.toNumber()).toBe(20250);
    expect(result.netPATaxableCompensation.toNumber()).toBe(20250);
  });

  it("PA Schedule NRH Part D - apportioned employee business expenses reduce net compensation", () => {
    const result = calculatePAScheduleNRH(makeInput({
      compensation: {
        method: "working_days",
        grossCompensation: d(100000),
        totalDaysForEmployer: 365,
        nonworkingDays: 165,
        daysWorkedInPennsylvania: 100,
        unreimbursedEmployeeBusinessExpenses: d(8000),
      },
    }));

    expect(result.selectedApportionmentFraction.toFixed(6)).toBe("0.500000");
    expect(result.apportionedGrossCompensation.toNumber()).toBe(50000);
    expect(result.apportionedEmployeeBusinessExpenses.toNumber()).toBe(4000);
    expect(result.netPATaxableCompensation.toNumber()).toBe(46000);
  });

  it("PA Schedule NRH Part E - combines employer-reported wages, apportioned wages, and reimbursements", () => {
    const result = calculatePAScheduleNRH(makeInput({
      compensation: {
        method: "working_days",
        employerReportedPAGrossCompensation: d(10000),
        grossCompensation: d(80000),
        totalDaysForEmployer: 365,
        nonworkingDays: 165,
        daysWorkedInPennsylvania: 50,
        employerReimbursementsNotInW2: d(4000),
      },
    }));

    expect(result.selectedApportionmentFraction.toFixed(6)).toBe("0.250000");
    expect(result.apportionedGrossCompensation.toNumber()).toBe(20000);
    expect(result.apportionedExpenseReimbursements.toNumber()).toBe(1000);
    expect(result.totalPAGrossCompensation.toNumber()).toBe(31000);
    expect(result.netPATaxableCompensation.toNumber()).toBe(31000);
  });

  it("PA Schedule NRH Section II - business apportionment averages the applicable factors", () => {
    const result = calculatePAScheduleNRH(makeInput({
      businessApportionment: {
        propertyEverywhere: d(300000),
        propertyPennsylvania: d(120000),
        payrollEverywhere: d(200000),
        payrollPennsylvania: d(100000),
        salesEverywhere: d(500000),
        salesPennsylvania: d(150000),
        totalNetProfits: d(90000),
      },
    }));

    expect(result.propertyFactor?.toFixed(6)).toBe("0.400000");
    expect(result.payrollFactor?.toFixed(6)).toBe("0.500000");
    expect(result.salesFactor?.toFixed(6)).toBe("0.300000");
    expect(result.businessFactorSum?.toFixed(6)).toBe("1.200000");
    expect(result.businessApplicableFactorCount).toBe(3);
    expect(result.businessApportionmentFraction?.toFixed(6)).toBe("0.400000");
    expect(result.paNetProfits?.toNumber()).toBe(36000);
  });

  it("PA Schedule NRH Section II - averages only the applicable factors", () => {
    const result = calculatePAScheduleNRH(makeInput({
      businessApportionment: {
        propertyEverywhere: d(0),
        propertyPennsylvania: d(0),
        payrollEverywhere: d(100000),
        payrollPennsylvania: d(25000),
        salesEverywhere: d(400000),
        salesPennsylvania: d(200000),
        totalNetProfits: d(60000),
      },
    }));

    expect(result.propertyFactor?.toString()).toBe("0");
    expect(result.payrollFactor?.toFixed(6)).toBe("0.250000");
    expect(result.salesFactor?.toFixed(6)).toBe("0.500000");
    expect(result.businessApplicableFactorCount).toBe(2);
    expect(result.businessApportionmentFraction?.toFixed(6)).toBe("0.375000");
    expect(result.paNetProfits?.toNumber()).toBe(22500);
  });

  it("PA Schedule NRH - unsupported tax year throws", () => {
    expect(() => calculatePAScheduleNRH(makeInput({
      taxYear: 2023,
      compensation: {
        method: "working_days",
        grossCompensation: d(10000),
        totalDaysForEmployer: 365,
        nonworkingDays: 165,
        daysWorkedInPennsylvania: 100,
      },
    }))).toThrow("PA Schedule NRH constants not available for tax year 2023");
  });
});

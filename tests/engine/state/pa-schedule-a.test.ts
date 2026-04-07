/**
 * Tests for Pennsylvania Schedule A — Interest Income
 * Spec: spec/state/pa-schedule-a.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePAScheduleA } from "@/engine/state/pa-schedule-a.js";

const d = (value: number | string) => new Decimal(value);

describe("Pennsylvania Schedule A — Interest Income", () => {
  it("PA Schedule A Line 3 totals manual addition adjustments", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      additionAdjustments: [
        { description: "Nominee interest", amount: d("10.4") },
        { description: "Bond premium add-back", amount: d("5.6") },
      ],
    });

    expect(result.line3.toNumber()).toBe(16);
  });

  it("PA Schedule A Line 8 totals manual reduction adjustments", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      reductionAdjustments: [
        { description: "Nonresident period interest", amount: d("19.4") },
        { description: "Federal K-1 U.S. obligations", amount: d("5.6") },
      ],
    });

    expect(result.line8.toNumber()).toBe(25);
  });

  it("PA Schedule A Line 8 includes the supported forfeited-interest penalty amount", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      reductionAdjustments: [
        { description: "Nonresident period interest", amount: d("19.4") },
      ],
      forfeitedInterestPenalty: d("30.6"),
    });

    expect(result.line8.toNumber()).toBe(50);
  });

  it("PA Schedule A Line 11 includes supported 1099-R annuity interest and other schedule additions", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      annuityAndEndowmentDistributions: d(40),
      charitableGiftAnnuityIncome: d(10),
      nonEducational529Distributions: d(25),
      taxableHealthMedicalSavingsDistributions: d(15),
    });

    expect(result.line11.toNumber()).toBe(40);
    expect(result.line12.toNumber()).toBe(10);
    expect(result.line13.toNumber()).toBe(25);
    expect(result.line14.toNumber()).toBe(15);
    expect(result.line16.toNumber()).toBe(90);
  });

  it("PA Schedule A Line 15 uses Pennsylvania-classified pass-through interest", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      federalInterestIncome: d(200),
      federalScheduleK1Interest: d(80),
      paPassThroughInterest: d(50),
    });

    expect(result.line10.toNumber()).toBe(120);
    expect(result.line15.toNumber()).toBe(50);
    expect(result.line16.toNumber()).toBe(170);
  });

  it("PA Schedule A Line 16 subtracts federal Schedule K-1 and government-interest reductions before adding PA adjustments back", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      federalInterestIncome: d(1000),
      taxExemptInterest: d(100),
      additionAdjustments: [
        { description: "Nominee interest", amount: d(20) },
      ],
      federalScheduleK1Interest: d(200),
      paObligationInterest: d(50),
      usGovernmentInterest: d(25),
      reductionAdjustments: [
        { description: "Installment-sale interest already taxed as gain", amount: d(30) },
      ],
      annuityAndEndowmentDistributions: d(40),
      charitableGiftAnnuityIncome: d(5),
      paPassThroughInterest: d(120),
    });

    expect(result.line4.toNumber()).toBe(1120);
    expect(result.line9.toNumber()).toBe(305);
    expect(result.line10.toNumber()).toBe(815);
    expect(result.line16.toNumber()).toBe(980);
  });

  it("PA Schedule A Line 16 floors the final PA-taxable interest at zero", () => {
    const result = calculatePAScheduleA({
      taxYear: 2025,
      federalInterestIncome: d(50),
      federalScheduleK1Interest: d(60),
      usGovernmentInterest: d(10),
    });

    expect(result.line10.toNumber()).toBe(-20);
    expect(result.line16.toNumber()).toBe(0);
  });
});

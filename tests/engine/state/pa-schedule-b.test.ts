/**
 * Tests for Pennsylvania Schedule B — Dividend Income
 * Spec: spec/state/pa-schedule-b.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePAScheduleB } from "@/engine/state/pa-schedule-b.js";

const d = (value: number | string) => new Decimal(value);

describe("Pennsylvania Schedule B — Dividend Income", () => {
  it("PA Schedule B Line 4 totals manual reduction adjustments", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      reductionAdjustments: [
        { description: "Part-year nonresident dividends", amount: d("19.4") },
        { description: "Grantor trust dividend income", amount: d("5.6") },
      ],
    });

    expect(result.line4.toNumber()).toBe(25);
  });

  it("PA Schedule B Line 8 totals manual addition adjustments", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      additionAdjustments: [
        { description: "Excessive shareholder salary", amount: d("10.4") },
        { description: "Non-PA S corporation distribution", amount: d("5.6") },
      ],
    });

    expect(result.line8.toNumber()).toBe(16);
  });

  it("PA Schedule B Line 9c carries only current-year repatriation cash receipts into taxable dividends", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      repatriationTransitionTaxBase: d(1000),
      repatriationPriorYearPayments: d(400),
      repatriationCurrentYearPayments: d(250),
    });

    expect(result.line9a.toNumber()).toBe(1000);
    expect(result.line9b.toNumber()).toBe(400);
    expect(result.line9c.toNumber()).toBe(250);
    expect(result.line12.toNumber()).toBe(250);
  });

  it("PA Schedule B Line 10 carries Form 1099-DIV capital gains distributions into PA dividend income", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      capitalGainDistributions: d(2500),
    });

    expect(result.line10.toNumber()).toBe(2500);
    expect(result.line12.toNumber()).toBe(2500);
  });

  it("PA Schedule B Line 12 removes federal Schedule K-1 dividends before adding Pennsylvania-classified pass-through dividends back", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      federalDividendIncome: d(400),
      federalScheduleK1Dividends: d(150),
      paPassThroughDividends: d(75),
    });

    expect(result.line5.toNumber()).toBe(150);
    expect(result.line6.toNumber()).toBe(250);
    expect(result.line11.toNumber()).toBe(75);
    expect(result.line12.toNumber()).toBe(325);
  });

  it("PA Schedule B Line 12 taxes Box 12 exempt-interest dividends while subtracting the Pennsylvania-exempt portion", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      federalDividendIncome: d(100),
      paExemptInterestDividends: d(30),
      exemptInterestDividends: d(80),
    });

    expect(result.line3.toNumber()).toBe(30);
    expect(result.line6.toNumber()).toBe(70);
    expect(result.line7.toNumber()).toBe(80);
    expect(result.line12.toNumber()).toBe(150);
  });

  it("PA Schedule B Line 12 floors the final PA-taxable dividend income at zero", () => {
    const result = calculatePAScheduleB({
      taxYear: 2025,
      federalDividendIncome: d(20),
      federalScheduleK1Dividends: d(25),
      paExemptInterestDividends: d(10),
    });

    expect(result.line6.toNumber()).toBe(-15);
    expect(result.line12.toNumber()).toBe(0);
  });
});

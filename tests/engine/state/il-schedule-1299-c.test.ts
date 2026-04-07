/**
 * Tests for Illinois Schedule 1299-C Step 3 credit ordering.
 * Spec: spec/state/il-schedule-1299-c.yaml
 *
 * Source: Illinois Department of Revenue, 2025 Schedule 1299-C Instructions
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateSchedule1299C,
  type Schedule1299CInput,
} from "@/engine/state/il-schedule-1299-c.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<Schedule1299CInput> = {}): Schedule1299CInput {
  return {
    taxYear: 2025,
    incomeTax: d(1000),
    otherStateAndScheduleICRCredits: d(100),
    credits: [],
    ...overrides,
  };
}

describe("Illinois Schedule 1299-C", () => {
  it("Schedule 1299-C Lines 17 through 20 - available tax is IL-1040 Line 14 minus prior Illinois credits", () => {
    const result = calculateSchedule1299C(makeInput({
      incomeTax: d(450),
      otherStateAndScheduleICRCredits: d(500),
    }));

    expect(result.incomeTax.toNumber()).toBe(450);
    expect(result.otherStateAndScheduleICRCredits.toNumber()).toBe(500);
    expect(result.remainingIncomeTaxAfterOtherCredits.toNumber()).toBe(0);
    expect(result.availableIncomeTax.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule 1299-C Lines 21 through 42 - credits are sorted by Illinois expiration order before application", () => {
    const result = calculateSchedule1299C(makeInput({
      credits: [
        {
          yearsLeftToCarry: 5,
          carryforwardPeriodYears: 10,
          creditCode: "5300",
          creditYearEnding: "2025-12",
          creditEarnedOrCarried: d(400),
        },
        {
          yearsLeftToCarry: 0,
          carryforwardPeriodYears: 2,
          creditCode: "2200",
          creditYearEnding: "2023-12",
          creditEarnedOrCarried: d(200),
        },
        {
          yearsLeftToCarry: 1,
          carryforwardPeriodYears: 5,
          creditCode: "5420",
          creditYearEnding: "2024-12",
          creditEarnedOrCarried: d(800),
        },
      ],
    }));

    expect(result.availableIncomeTax.toNumber()).toBe(900);
    expect(result.credits.map((credit) => `${credit.yearsLeftToCarry}-${credit.carryforwardPeriodYears}-${credit.creditCode}`)).toEqual([
      "0-2-2200",
      "1-5-5420",
      "5-10-5300",
    ]);

    expect(result.credits[0]).toMatchObject({
      totalCredit: d(200),
      remainingTaxAfterCredit: d(700),
      creditApplied: d(200),
      creditCarryforward: d(0),
    });
    expect(result.credits[1]).toMatchObject({
      totalCredit: d(800),
      remainingTaxAfterCredit: d(-100),
      creditApplied: d(700),
      creditCarryforward: d(100),
    });
    expect(result.credits[2]).toMatchObject({
      totalCredit: d(400),
      remainingTaxAfterCredit: undefined,
      creditApplied: d(0),
      creditCarryforward: d(400),
    });
    expect(result.totalCreditApplied.toNumber()).toBe(900);
    expect(result.credit.toNumber()).toBe(900);
  });

  it("Schedule 1299-C Line 43 - credit equals total applied credit when available tax remains positive", () => {
    const result = calculateSchedule1299C(makeInput({
      credits: [
        {
          yearsLeftToCarry: 10,
          carryforwardPeriodYears: 10,
          creditCode: "5680",
          creditYearEnding: "2025-12",
          identifyingNumber: "1809954102673",
          creditEarnedOrCarried: d(250),
          distributiveShareOrTransfer: d(50),
        },
      ],
    }));

    expect(result.credits[0]?.totalCredit.toNumber()).toBe(300);
    expect(result.credits[0]?.creditApplied.toNumber()).toBe(300);
    expect(result.credits[0]?.creditCarryforward.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(300);
  });

  it("throws when a credit row uses an impossible carryforward bucket", () => {
    expect(() => calculateSchedule1299C(makeInput({
      credits: [
        {
          yearsLeftToCarry: 3,
          carryforwardPeriodYears: 2,
          creditCode: "2200",
          creditYearEnding: "2025-12",
          creditEarnedOrCarried: d(100),
        },
      ],
    }))).toThrow("Schedule 1299-C credit 2200 cannot have 3 years left to carry with a 2-year carryforward period");
  });

  it("throws when a credit row amount is not a whole dollar", () => {
    expect(() => calculateSchedule1299C(makeInput({
      credits: [
        {
          yearsLeftToCarry: 0,
          carryforwardPeriodYears: 0,
          creditCode: "2200",
          creditYearEnding: "2025-12",
          creditEarnedOrCarried: d("100.50"),
        },
      ],
    }))).toThrow("Schedule 1299-C credit 2200 Column E amount must be a whole-dollar amount");
  });
});

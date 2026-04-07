/**
 * Edge case tests for SE Health Insurance Deduction Worksheet (Pub 535).
 * Spec: spec/federal/se-health-insurance-worksheet.yaml
 *
 * Key rules:
 *   Deduction = min(prorated premiums, earned income limit)
 *   Earned income limit = max(0, net profit - SE tax - retirement contributions)
 *   LTC premiums capped by age (IRC §213(d)(10)):
 *     Age ≤ 40: $480, 41-50: $890, 51-60: $1,790, 61-70: $4,770, ≥ 71: $5,960
 *   Prorated by eligible months (1-12)
 *   Excess flows to Schedule A medical expenses
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSEHealthInsuranceWorksheet } from "@/engine/forms/se-health-insurance-worksheet.js";
import type { SEHealthInsuranceWorksheetInput } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";

const d = (v: string | number) => new Decimal(v);
const constants = getConstants(2025);

function makeInput(overrides: Partial<SEHealthInsuranceWorksheetInput> = {}): SEHealthInsuranceWorksheetInput {
  return {
    medicalDentalPremiums: "12000",
    longTermCareCoverages: [],
    medicarePartBPremiums: "0",
    medicarePartDPremiums: "0",
    medigapPremiums: "0",
    eligibleMonths: 12,
    netProfit: "80000",
    deductibleSETax: "5653",
    seRetirementContributions: "0",
    ...overrides,
  };
}

describe("SE Health Insurance WS - earned income limit", () => {
  it("SE Health Ins WS Line 11 - premiums under earned income limit: full deduction", () => {
    const result = calculateSEHealthInsuranceWorksheet(makeInput(), constants);
    // Earned income limit: 80000 - 5653 = 74347
    // Premiums: 12000 ≤ 74347
    expect(result.deductibleAmount.toNumber()).toBe(12000);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });

  it("SE Health Ins WS Line 11 - premiums exceed earned income limit: capped", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "30000",
        netProfit: "25000",
        deductibleSETax: "1766",
      }),
      constants
    );
    // Earned income limit: max(0, 25000 - 1766 - 0) = 23234
    // Deduction: min(30000, 23234) = 23234
    expect(result.deductibleAmount.toNumber()).toBe(23234);
    expect(result.excessForScheduleA.toNumber()).toBe(6766);
  });

  it("SE Health Ins WS Line 10 - net profit minus SE tax minus retirement is zero", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        netProfit: "10000",
        deductibleSETax: "5000",
        seRetirementContributions: "5000",
      }),
      constants
    );
    // Earned income limit: max(0, 10000 - 5000 - 5000) = 0
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
    expect(result.excessForScheduleA.toNumber()).toBe(12000);
  });

  it("SE Health Ins WS Line 10 - net profit less than SE tax yields zero limit (no negative)", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        netProfit: "3000",
        deductibleSETax: "5000",
      }),
      constants
    );
    // max(0, 3000 - 5000 - 0) = 0
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
  });

  it("SE Health Ins WS Line 11 - premiums exactly equal earned income limit", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "20000",
        netProfit: "25000",
        deductibleSETax: "5000",
      }),
      constants
    );
    // Earned income limit: 25000 - 5000 = 20000
    expect(result.deductibleAmount.toNumber()).toBe(20000);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });
});

describe("SE Health Insurance WS - LTC age-based limits", () => {
  it("SE Health Ins WS Line 2 - age 40 capped at $480", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 40 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(480);
  });

  it("SE Health Ins WS Line 2 - age 41 uses $890 limit (boundary between 40/41-50)", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 41 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(890);
  });

  it("SE Health Ins WS Line 2 - age 50 still uses $890 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 50 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(890);
  });

  it("SE Health Ins WS Line 2 - age 51 jumps to $1,790 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "2000", attainedAge: 51 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(1790);
  });

  it("SE Health Ins WS Line 2 - age 61 uses $4,770 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "5000", attainedAge: 61 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(4770);
  });

  it("SE Health Ins WS Line 2 - age 71 uses $5,960 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "8000", attainedAge: 71 }],
      }),
      constants
    );
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(5960);
  });

  it("SE Health Ins WS Line 2 - actual premium under limit: uses actual", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [{ premiumsPaid: "200", attainedAge: 35 }],
      }),
      constants
    );
    // Actual $200 < limit $480 → uses $200
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(200);
  });

  it("SE Health Ins WS Line 2 - multiple covered persons with different ages", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        longTermCareCoverages: [
          { premiumsPaid: "600", attainedAge: 35 },  // capped at 480
          { premiumsPaid: "3000", attainedAge: 55 },  // capped at 1790
        ],
      }),
      constants
    );
    // 480 + 1790 = 2270
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(2270);
  });
});

describe("SE Health Insurance WS - month proration", () => {
  it("SE Health Ins WS Line 6 - 12 months eligible: no proration", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ eligibleMonths: 12 }),
      constants
    );
    expect(result.proratedPremiums.toNumber()).toBe(12000);
  });

  it("SE Health Ins WS Line 6 - 6 months eligible: half the premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ eligibleMonths: 6 }),
      constants
    );
    // 12000 * 6/12 = 6000
    expect(result.proratedPremiums.toNumber()).toBe(6000);
  });

  it("SE Health Ins WS Line 6 - 1 month eligible: 1/12 of premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ eligibleMonths: 1 }),
      constants
    );
    // 12000 * 1/12 = 1000
    expect(result.proratedPremiums.toNumber()).toBe(1000);
  });

  it("SE Health Ins WS Line 6 - 0 months eligible: zero premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ eligibleMonths: 0 }),
      constants
    );
    expect(result.proratedPremiums.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
  });

  it("SE Health Ins WS Line 6 - 7 months rounds correctly", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ eligibleMonths: 7, medicalDentalPremiums: "10000" }),
      constants
    );
    // 10000 * 7/12 = 5833.333... → rounds to 5833
    expect(result.proratedPremiums.toNumber()).toBe(5833);
  });
});

describe("SE Health Insurance WS - Medicare premiums", () => {
  it("SE Health Ins WS Line 3 - all Medicare premium types aggregate", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "0",
        medicarePartBPremiums: "2400",
        medicarePartDPremiums: "600",
        medigapPremiums: "3000",
      }),
      constants
    );
    expect(result.medicarePremiums.toNumber()).toBe(6000);
    expect(result.totalPremiums.toNumber()).toBe(6000);
  });
});

describe("SE Health Insurance WS - zero premiums", () => {
  it("SE Health Ins WS Line 11 - zero premiums yields zero deduction", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({ medicalDentalPremiums: "0" }),
      constants
    );
    expect(result.deductibleAmount.toNumber()).toBe(0);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });
});

describe("SE Health Insurance WS - combined LTC and medical with proration and limit", () => {
  it("SE Health Ins WS Line 11 - all premium types, partial year, capped by earned income", () => {
    const result = calculateSEHealthInsuranceWorksheet(
      makeInput({
        medicalDentalPremiums: "15000",
        longTermCareCoverages: [
          { premiumsPaid: "2000", attainedAge: 55 }, // capped at 1790
        ],
        medicarePartBPremiums: "1800",
        medicarePartDPremiums: "0",
        medigapPremiums: "0",
        eligibleMonths: 9,
        netProfit: "20000",
        deductibleSETax: "1413",
        seRetirementContributions: "0",
      }),
      constants
    );
    // Total premiums: 15000 + 1790 + 1800 = 18590
    // Prorated: round(18590 * 9/12) = round(13942.5) = 13943
    expect(result.totalPremiums.toNumber()).toBe(18590);
    expect(result.proratedPremiums.toNumber()).toBe(13943);
    // Earned income limit: max(0, 20000 - 1413 - 0) = 18587
    expect(result.earnedIncomeLimit.toNumber()).toBe(18587);
    // Deduction: min(13943, 18587) = 13943
    expect(result.deductibleAmount.toNumber()).toBe(13943);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });
});

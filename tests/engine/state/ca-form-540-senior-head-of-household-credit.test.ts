/**
 * Tests for California Form 540 Senior Head of Household credit.
 * Spec: spec/state/ca-form-540-senior-head-of-household-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540SeniorHeadOfHouseholdCredit } from "@/engine/state/ca-form-540-senior-head-of-household-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 Senior Head of Household credit", () => {
  it("CA Form 540 Senior Head of Household credit Line 1 - the worksheet starts from Form 540 line 19 taxable income", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(50000),
      agiForQualification: d(50000),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      taxYear: 2025,
    });

    expect(result.line1TaxableIncome.toNumber()).toBe(50000);
  });

  it("CA Form 540 Senior Head of Household credit Line 2 - the 2025 worksheet uses a 2% credit rate", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(50000),
      agiForQualification: d(50000),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      taxYear: 2025,
    });

    expect(result.line2Rate.toString()).toBe("0.02");
  });

  it("CA Form 540 Senior Head of Household credit Line 3 - AGI at the threshold still qualifies and the credit is capped at $1,860", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(120000),
      agiForQualification: d(98652),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3Credit.toNumber()).toBe(1860);
  });

  it("CA Form 540 Senior Head of Household credit - AGI above the threshold disqualifies the credit", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(80000),
      agiForQualification: d(98653),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("agi_limit_exceeded");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Senior Head of Household credit - whole-dollar rounding applies before the cap", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(25),
      agiForQualification: d(1000),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      taxYear: 2025,
    });

    expect(result.line3Credit.toNumber()).toBe(1);
  });

  it("CA Form 540 Senior Head of Household credit - missing the prior head of household qualification produces no credit", () => {
    const result = calculateCAForm540SeniorHeadOfHouseholdCredit({
      taxableIncome: d(50000),
      agiForQualification: d(50000),
      age65OrOlderOnDecember31: true,
      qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("prior_head_of_household_requirement_not_met");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Senior Head of Household credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540SeniorHeadOfHouseholdCredit({
        taxableIncome: d(50000),
        agiForQualification: d(50000),
        age65OrOlderOnDecember31: true,
        qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 Senior Head of Household credit constants not available for 2024");
  });
});

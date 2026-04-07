/**
 * Tests for New York IT-249 long-term care insurance credit.
 * Spec: spec/state/ny-it249-long-term-care-insurance-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT249,
  type NYIT249Input,
} from "@/engine/state/ny-it249-long-term-care-insurance-credit.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function it249Input2025(overrides: Partial<NYIT249Input> = {}): NYIT249Input {
  return {
    taxYear: 2025,
    nyAgi: 90000,
    premiumsPaid: 6000,
    partnershipCreditShare: 150,
    sCorporationCreditShare: 25,
    fiduciaryCreditShare: 10,
    priorYearCarryover: 200,
    taxBeforeCredits: 2000,
    creditsAppliedBeforeThisCredit: 350,
    ...overrides,
  };
}

describe("NY IT-249 long-term care insurance credit", () => {
  it("Line 1, line 3, and line 11 - current-year credit equals 20% of premiums plus pass-through shares", () => {
    const result = calculateNYIT249(it249Input2025());

    expect(result.qualifiedPremiumsPaid.equals(d(6000))).toBe(true);
    expect(result.currentYearDirectCredit.equals(d(1200))).toBe(true);
    expect(result.partnershipCreditShare.equals(d(150))).toBe(true);
    expect(result.sCorporationCreditShare.equals(d(25))).toBe(true);
    expect(result.fiduciaryCreditShare.equals(d(10))).toBe(true);
    expect(result.totalPassThroughCredit.equals(d(185))).toBe(true);
    expect(result.totalCurrentYearCredit.equals(d(1385))).toBe(true);
  });

  it("Line 12a through line 14 - NYAGI at $250,000 disallows the current-year credit but keeps carryover", () => {
    const result = calculateNYIT249(it249Input2025({
      nyAgi: 250000,
      priorYearCarryover: 300,
    }));

    expect(result.allowedCurrentYearCredit.equals(d(0))).toBe(true);
    expect(result.cappedCurrentYearCredit.equals(d(0))).toBe(true);
    expect(result.totalAvailableCredit.equals(d(300))).toBe(true);
  });

  it("Line 23 and line 24 - credit used is limited by tax remaining after prior credits", () => {
    const result = calculateNYIT249(it249Input2025({
      taxBeforeCredits: 1000,
      creditsAppliedBeforeThisCredit: 800,
      priorYearCarryover: 500,
    }));

    expect(result.netTaxAvailable.equals(d(200))).toBe(true);
    expect(result.creditUsedThisYear.equals(d(200))).toBe(true);
    expect(result.creditCarryoverToNextYear.equals(d(1685))).toBe(true);
  });

  it("rejects negative credits applied before this credit", () => {
    expect(() =>
      calculateNYIT249(it249Input2025({
        creditsAppliedBeforeThisCredit: -1,
      }))
    ).toThrow("NY IT-249 credits applied before this credit must be non-negative");
  });

  it("rejects unsupported tax year", () => {
    expect(() =>
      calculateNYIT249(it249Input2025({
        taxYear: 2024,
      }))
    ).toThrow("NY IT-249 long-term care insurance credit not available for tax year 2024");
  });
});

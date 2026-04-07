/**
 * Tests for NY IT-201-ATT Part 1 Sections A through C nonrefundable credits.
 * Spec: spec/state/ny-it201-att-nonrefundables.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201ATTNonrefundableCredits,
  type NYIT201ATTNonrefundableCreditsInput,
} from "@/engine/state/ny-it201-att-nonrefundables.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function nonrefundableCredits2025(
  overrides: Partial<NYIT201ATTNonrefundableCreditsInput> = {}
): NYIT201ATTNonrefundableCreditsInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

describe("NY IT-201-ATT nonrefundable credits", () => {
  it("Line 1 through line 10 - sections A through C total state and city nonrefundable credits", () => {
    const result = calculateNYIT201ATTNonrefundableCredits(
      nonrefundableCredits2025({
        accumulationDistributionCredit: 18,
        otherNoncarryoverCreditEntries: [
          { code: "133", amount: 12 },
          { code: "170", amount: 8 },
        ],
        longTermCareInsuranceCredit: 40,
        investmentCredit: 25,
        solarEnergySystemEquipmentCredit: 15,
        otherCarryoverCreditEntries: [
          { code: "052", amount: 30 },
          { code: "054", amount: 20 },
        ],
        nycResidentUbtCredit: 45,
        nycAccumulationDistributionCredit: 10,
        partYearNYCChildAndDependentCareCredit: 5,
      })
    );

    expect(result.otherNoncarryoverCredits.equals(d(20))).toBe(true);
    expect(result.otherCarryoverCredits.equals(d(50))).toBe(true);
    expect(result.totalNYStateNonrefundableCredits.equals(d(168))).toBe(true);
    expect(result.totalNYCNonrefundableCredits.equals(d(60))).toBe(true);
  });

  it("Line 2 - detailed line 2 entries override the direct passthrough total", () => {
    const result = calculateNYIT201ATTNonrefundableCredits(
      nonrefundableCredits2025({
        otherNoncarryoverCredits: 999,
        otherNoncarryoverCreditEntries: [
          { code: "133", amount: 14 },
          { code: "170", amount: 6 },
        ],
      })
    );

    expect(result.otherNoncarryoverCredits.equals(d(20))).toBe(true);
    expect(result.totalNYStateNonrefundableCredits.equals(d(20))).toBe(true);
  });

  it("Line 6 - detailed line 6 entries override the direct passthrough total", () => {
    const result = calculateNYIT201ATTNonrefundableCredits(
      nonrefundableCredits2025({
        otherCarryoverCredits: 999,
        otherCarryoverCreditEntries: [
          { code: "052", amount: 11 },
          { code: "054", amount: 9 },
        ],
      })
    );

    expect(result.otherCarryoverCredits.equals(d(20))).toBe(true);
    expect(result.totalNYStateNonrefundableCredits.equals(d(20))).toBe(true);
  });

  it("Line 2 - rejects more than the 2 available coded line items", () => {
    expect(() =>
      calculateNYIT201ATTNonrefundableCredits(
        nonrefundableCredits2025({
          otherNoncarryoverCreditEntries: [
            { code: "133", amount: 1 },
            { code: "170", amount: 1 },
            { code: "199", amount: 1 },
          ],
        })
      )
    ).toThrow("NY IT-201-ATT line 2 supports at most 2 coded non-carryover credit entries");
  });

  it("Line 6 - rejects more than the 14 available coded carryover line items", () => {
    expect(() =>
      calculateNYIT201ATTNonrefundableCredits(
        nonrefundableCredits2025({
          otherCarryoverCreditEntries: Array.from({ length: 15 }, (_, index) => ({
            code: String(index + 1),
            amount: 1,
          })),
        })
      )
    ).toThrow("NY IT-201-ATT line 6 supports at most 14 coded carryover credit entries");
  });

  it("rejects unsupported tax year", () => {
    expect(() =>
      calculateNYIT201ATTNonrefundableCredits({
        taxYear: 2024,
      })
    ).toThrow("NY IT-201-ATT nonrefundable credits not available for tax year 2024");
  });
});

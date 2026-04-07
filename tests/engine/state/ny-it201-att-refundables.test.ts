/**
 * Tests for NY IT-201-ATT Part 1 Section D refundable credits.
 * Spec: spec/state/ny-it201-att-refundables.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201ATTRefundableCredits,
  type NYIT201ATTRefundableCreditsInput,
} from "@/engine/state/ny-it201-att-refundables.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function refundableCredits2025(
  overrides: Partial<NYIT201ATTRefundableCreditsInput> = {}
): NYIT201ATTRefundableCreditsInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

describe("NY IT-201-ATT refundable credits", () => {
  it("Line 11 through line 18 - Section D totals farmers credit, other refundable credits, and claim of right credits", () => {
    const result = calculateNYIT201ATTRefundableCredits(
      refundableCredits2025({
        farmersSchoolTaxCredit: 120,
        otherRefundableCreditEntries: [
          { code: "114", amount: 80 },
          { code: "203", amount: 20 },
        ],
        nysClaimOfRightCredit: 15,
        nycClaimOfRightCredit: 10,
        yonkersClaimOfRightCredit: 5,
        mctmtClaimOfRightCredit: 3,
      })
    );

    expect(result.farmersSchoolTaxCredit.equals(d(120))).toBe(true);
    expect(result.otherRefundableCredits.equals(d(100))).toBe(true);
    expect(result.frontPageSubtotal.equals(d(220))).toBe(true);
    expect(result.carryforwardFromFrontPage.equals(d(220))).toBe(true);
    expect(result.totalOtherRefundableCredits.equals(d(253))).toBe(true);
  });

  it("Line 12 - detailed other refundable credit entries override the direct passthrough total", () => {
    const result = calculateNYIT201ATTRefundableCredits(
      refundableCredits2025({
        otherRefundableCredits: 999,
        otherRefundableCreditEntries: [
          { code: "111", amount: 40 },
          { code: "222", amount: 35 },
        ],
      })
    );

    expect(result.otherRefundableCredits.equals(d(75))).toBe(true);
    expect(result.totalOtherRefundableCredits.equals(d(75))).toBe(true);
  });

  it("Line 13 and line 14 - line 14 carries forward the front-page subtotal", () => {
    const result = calculateNYIT201ATTRefundableCredits(
      refundableCredits2025({
        farmersSchoolTaxCredit: 50,
        otherRefundableCredits: 25,
      })
    );

    expect(result.frontPageSubtotal.equals(d(75))).toBe(true);
    expect(result.carryforwardFromFrontPage.equals(result.frontPageSubtotal)).toBe(true);
  });

  it("Line 12 - rejects more than the 12 available coded line items", () => {
    expect(() =>
      calculateNYIT201ATTRefundableCredits(
        refundableCredits2025({
          otherRefundableCreditEntries: Array.from({ length: 13 }, (_, index) => ({
            code: String(index + 1),
            amount: 1,
          })),
        })
      )
    ).toThrow("NY IT-201-ATT line 12 supports at most 12 coded refundable credit entries");
  });

  it("rejects unsupported tax year", () => {
    expect(() =>
      calculateNYIT201ATTRefundableCredits({
        taxYear: 2024,
      })
    ).toThrow("NY IT-201-ATT refundable credits not available for tax year 2024");
  });
});

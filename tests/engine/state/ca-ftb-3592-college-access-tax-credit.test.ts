/**
 * Tests for California FTB 3592 College Access Tax Credit.
 * Spec: spec/state/ca-ftb-3592-college-access-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAFTB3592CollegeAccessTaxCredit } from "@/engine/state/ca-ftb-3592-college-access-tax-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California FTB 3592 College Access Tax Credit", () => {
  it("CA FTB 3592 College Access Tax Credit Line 5 - certificate amount, pass-through credit, and prior-year carryover add to total available credit", () => {
    const result = calculateCAFTB3592CollegeAccessTaxCredit({
      certificateNumber: "CATC-2025-001",
      certificateCreditAmount: d(400),
      passThroughCredits: [
        {
          entityName: "Scholarship Fund LP",
          entityId: "94-1234567",
          amount: d(150),
        },
      ],
      priorYearCarryover: d(50),
      taxYear: 2025,
    });

    expect(result.line1aCertificateCreditAmount.toNumber()).toBe(400);
    expect(result.line2PassThroughCredit.toNumber()).toBe(150);
    expect(result.line3CurrentYearCredit.toNumber()).toBe(550);
    expect(result.line5TotalAvailableCredit.toNumber()).toBe(600);
  });

  it("CA FTB 3592 College Access Tax Credit Line 7 - claimed credit and refundable election reduce future carryover", () => {
    const result = calculateCAFTB3592CollegeAccessTaxCredit({
      certificateNumber: "CATC-2025-002",
      certificateCreditAmount: d(500),
      passThroughCredits: [
        {
          entityName: "Education Venture LLC",
          entityId: "12-3456789",
          amount: d(75),
        },
      ],
      priorYearCarryover: d(25),
      creditClaimedThisYear: d(200),
      electedRefundableCreditAmount: d(100),
      taxYear: 2025,
    });

    expect(result.line5TotalAvailableCredit.toNumber()).toBe(600);
    expect(result.line6aCreditClaimedThisYear.toNumber()).toBe(200);
    expect(result.line6bAssignedCreditToAffiliatedCorporations.toNumber()).toBe(0);
    expect(result.line6cElectedRefundableCreditAmount.toNumber()).toBe(100);
    expect(result.line7CarryoverAvailableForFutureYears.toNumber()).toBe(300);
  });

  it("CA FTB 3592 College Access Tax Credit Line 7 - line 6 reductions cannot exceed line 5", () => {
    expect(() =>
      calculateCAFTB3592CollegeAccessTaxCredit({
        certificateNumber: "CATC-2025-003",
        certificateCreditAmount: d(100),
        priorYearCarryover: d(0),
        creditClaimedThisYear: d(75),
        electedRefundableCreditAmount: d(26),
        taxYear: 2025,
      })
    ).toThrow("CA FTB 3592 line 6a through line 6c total cannot exceed line 5 available credit");
  });

  it("CA FTB 3592 College Access Tax Credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAFTB3592CollegeAccessTaxCredit({
        certificateNumber: "CATC-2025-004",
        certificateCreditAmount: d(100),
        taxYear: 2024,
      })
    ).toThrow("CA FTB 3592 College Access Tax Credit constants not available for 2024");
  });
});

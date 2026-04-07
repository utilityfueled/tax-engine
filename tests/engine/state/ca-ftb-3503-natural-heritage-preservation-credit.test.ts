/**
 * Tests for California FTB 3503 Natural Heritage Preservation Credit.
 * Spec: spec/state/ca-ftb-3503-natural-heritage-preservation-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAFTB3503NaturalHeritagePreservationCredit } from "@/engine/state/ca-ftb-3503-natural-heritage-preservation-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California FTB 3503 Natural Heritage Preservation Credit", () => {
  it("CA FTB 3503 Natural Heritage Preservation Credit Line 6 - fair market value, pass-through credit, and prior-year carryover add to total available credit", () => {
    const result = calculateCAFTB3503NaturalHeritagePreservationCredit({
      fairMarketValue: d(4000),
      passThroughCredits: [
        {
          entityName: "Habitat Preservation LP",
          entityId: "94-1234567",
          amount: d(300),
        },
      ],
      priorYearCarryover: d(250),
      taxYear: 2025,
    });

    expect(result.line1FairMarketValue.toNumber()).toBe(4000);
    expect(result.line2CurrentYearCredit.toNumber()).toBe(2200);
    expect(result.line3PassThroughCredit.toNumber()).toBe(300);
    expect(result.line4TotalCurrentYearCredit.toNumber()).toBe(2500);
    expect(result.line6TotalAvailableCredit.toNumber()).toBe(2750);
  });

  it("CA FTB 3503 Natural Heritage Preservation Credit Line 8 - claimed credit and refundable election reduce future carryover", () => {
    const result = calculateCAFTB3503NaturalHeritagePreservationCredit({
      fairMarketValue: d(4000),
      passThroughCredits: [
        {
          entityName: "Open Space Trust LLC",
          entityId: "12-3456789",
          amount: d(100),
        },
      ],
      priorYearCarryover: d(50),
      creditClaimedThisYear: d(500),
      electedRefundableCreditAmount: d(100),
      taxYear: 2025,
    });

    expect(result.line6TotalAvailableCredit.toNumber()).toBe(2350);
    expect(result.line7aCreditClaimedThisYear.toNumber()).toBe(500);
    expect(result.line7bAssignedCreditToAffiliatedCorporations.toNumber()).toBe(0);
    expect(result.line7cElectedRefundableCreditAmount.toNumber()).toBe(100);
    expect(result.line8CarryoverAvailableForFutureYears.toNumber()).toBe(1750);
  });

  it("CA FTB 3503 Natural Heritage Preservation Credit Line 8 - line 7 reductions cannot exceed line 6", () => {
    expect(() =>
      calculateCAFTB3503NaturalHeritagePreservationCredit({
        fairMarketValue: d(100),
        priorYearCarryover: d(0),
        creditClaimedThisYear: d(50),
        electedRefundableCreditAmount: d(6),
        taxYear: 2025,
      })
    ).toThrow("CA FTB 3503 line 7a through line 7c total cannot exceed line 6 available credit");
  });

  it("CA FTB 3503 Natural Heritage Preservation Credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAFTB3503NaturalHeritagePreservationCredit({
        fairMarketValue: d(100),
        taxYear: 2024,
      })
    ).toThrow("CA FTB 3503 Natural Heritage Preservation Credit constants not available for 2024");
  });
});

/**
 * Tests for California FTB 3521 Low-Income Housing Credit.
 * Spec: spec/state/ca-ftb-3521-low-income-housing-credit.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateCAFTB3521LowIncomeHousingCredit } from "@/engine/state/ca-ftb-3521-low-income-housing-credit.js";

describe("California FTB 3521 Low-Income Housing Credit", () => {
  it("CA FTB 3521 Low-Income Housing Credit Line 11 - current-year credit, pass-through credits, passive limitation, and prior-year carryover add to total available credit", () => {
    const result = calculateCAFTB3521LowIncomeHousingCredit({
      currentYearCredit: "2000",
      currentYearCreditSource: "taxpayer_certification",
      passThroughCredits: [
        {
          entityName: "Central Valley Housing LP",
          entityId: "94-1234567",
          buildingIdentificationNumber: "CA99-00001",
          amount: "300",
        },
      ],
      passiveActivityCreditIncludedOnLine4: "100",
      allowablePassiveActivityCredit: "50",
      priorYearCarryover: "250",
      taxYear: 2025,
    });

    expect(result.line3PassThroughCredit.toString()).toBe("300");
    expect(result.line4CurrentYearLowIncomeHousingCredit.toString()).toBe("2300");
    expect(result.line5PassiveActivityCreditIncludedOnLine4.toString()).toBe("100");
    expect(result.line6CurrentYearNonPassiveCredit.toString()).toBe("2200");
    expect(result.line7AllowablePassiveActivityCredit.toString()).toBe("50");
    expect(result.line8PriorYearCarryover.toString()).toBe("250");
    expect(result.line9TotalCreditBeforeAllocation.toString()).toBe("2500");
    expect(result.line10AllocatedToAffiliatedCorporations.toString()).toBe("0");
    expect(result.line11TotalAvailableCredit.toString()).toBe("2500");
  });

  it("CA FTB 3521 Low-Income Housing Credit Line 13 - claimed credit reduces future carryover", () => {
    const result = calculateCAFTB3521LowIncomeHousingCredit({
      currentYearCredit: "2000",
      currentYearCreditSource: "taxpayer_certification",
      passThroughCredits: [
        {
          entityName: "Central Valley Housing LP",
          amount: "300",
        },
      ],
      passiveActivityCreditIncludedOnLine4: "100",
      allowablePassiveActivityCredit: "50",
      priorYearCarryover: "250",
      creditClaimedThisYear: "2113",
      taxYear: 2025,
    });

    expect(result.line11TotalAvailableCredit.toString()).toBe("2500");
    expect(result.line12aCreditClaimedThisYear.toString()).toBe("2113");
    expect(result.line12bAssignedCredit.toString()).toBe("0");
    expect(result.line13CarryoverAvailableForFutureYears.toString()).toBe("387");
  });
});

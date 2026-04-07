/**
 * Tests for California FTB 3523 Research Credit upstream personal-filer carryover slice.
 * Spec: spec/state/ca-ftb-3523-research-credit.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateCAFTB3523ResearchCredit } from "@/engine/state/ca-ftb-3523-research-credit.js";

describe("California FTB 3523 Research Credit upstream personal-filer carryover slice", () => {
  it("CA FTB 3523 Research Credit Line 38 - current-year credit, pass-through credits, allowable passive credit, and prior-year carryover add to total available credit", () => {
    const result = calculateCAFTB3523ResearchCredit({
      currentYearNonPassiveResearchCredit: "2000",
      currentYearCreditSourceLine: "31a",
      passThroughCredits: [
        {
          entityName: "Innovation Fund LP",
          entityId: "94-1234567",
          amount: "300",
        },
      ],
      passiveActivityCreditIncludedOnLine32: "100",
      allowablePassiveActivityCredit: "50",
      priorYearNonPassiveCarryover: "250",
      taxYear: 2025,
    });

    expect(result.line32PassThroughCredit.toString()).toBe("300");
    expect(result.line33CurrentYearResearchCredit.toString()).toBe("2300");
    expect(result.line34PassiveActivityCreditIncludedOnLine32.toString()).toBe("100");
    expect(result.line35CurrentYearNonPassiveResearchCredit.toString()).toBe("2200");
    expect(result.line36AllowablePassiveActivityCredit.toString()).toBe("50");
    expect(result.line37PriorYearCarryoverOfNonPassiveResearchCredit.toString()).toBe("250");
    expect(result.line38TotalCreditAvailable.toString()).toBe("2500");
  });

  it("CA FTB 3523 Research Credit Line 42 - claimed credit and refundable election reduce future carryover", () => {
    const result = calculateCAFTB3523ResearchCredit({
      currentYearNonPassiveResearchCredit: "2000",
      currentYearCreditSourceLine: "31a",
      passThroughCredits: [
        {
          entityName: "Innovation Fund LP",
          amount: "300",
        },
      ],
      passiveActivityCreditIncludedOnLine32: "100",
      allowablePassiveActivityCredit: "50",
      priorYearNonPassiveCarryover: "250",
      creditClaimedThisYear: "2113",
      electedRefundableCreditAmount: "50",
      taxYear: 2025,
    });

    expect(result.line38TotalCreditAvailable.toString()).toBe("2500");
    expect(result.line39CreditClaimedThisYear.toString()).toBe("2113");
    expect(result.line40AssignedCreditToAffiliatedCorporations.toString()).toBe("0");
    expect(result.line41ElectedRefundableCreditAmount.toString()).toBe("50");
    expect(result.line42CarryoverAvailableForFutureYears.toString()).toBe("337");
  });
});

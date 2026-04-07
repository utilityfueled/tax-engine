/**
 * Tests for California FTB 3531 California Competes Tax Credit.
 * Spec: spec/state/ca-ftb-3531-california-competes-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAFTB3531CaliforniaCompetesTaxCredit } from "@/engine/state/ca-ftb-3531-california-competes-tax-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California FTB 3531 California Competes Tax Credit", () => {
  it("CA FTB 3531 California Competes Tax Credit Line 7 - current-year agreements, pass-through credit, and prior-year carryover add to total available credit", () => {
    const result = calculateCAFTB3531CaliforniaCompetesTaxCredit({
      currentYearAgreementCredits: [
        { agreementNumber: "CCTC-2025-A", creditEarned: d(300) },
        { agreementNumber: "CCTC-2025-B", creditEarned: d(125) },
      ],
      passThroughCredits: [
        { agreementNumber: "CCTC-K1-2024", amount: d(75), yearEarned: 2024 },
      ],
      priorYearCarryover: d(50),
      creditRecapture: d(0),
      previouslyUsedRecapturedCredit: d(0),
      taxYear: 2025,
    });

    expect(result.line2TotalCreditEarned.toNumber()).toBe(425);
    expect(result.line4aPassThroughCredit.toNumber()).toBe(75);
    expect(result.line5aCurrentYearCredit.toNumber()).toBe(500);
    expect(result.line7TotalAvailableCredit.toNumber()).toBe(550);
  });

  it("CA FTB 3531 California Competes Tax Credit Line 10b - previously used recaptured credit flows to the return", () => {
    const result = calculateCAFTB3531CaliforniaCompetesTaxCredit({
      currentYearAgreementCredits: [],
      passThroughCredits: [],
      priorYearCarryover: d(0),
      creditRecapture: d(40),
      previouslyUsedRecapturedCredit: d(15),
      taxYear: 2025,
    });

    expect(result.line10aCreditRecapture.toNumber()).toBe(40);
    expect(result.line10bPreviouslyUsedRecapturedCredit.toNumber()).toBe(15);
  });

  it("CA FTB 3531 California Competes Tax Credit Line 10b - previously used recaptured credit cannot exceed total recapture", () => {
    expect(() =>
      calculateCAFTB3531CaliforniaCompetesTaxCredit({
        currentYearAgreementCredits: [],
        passThroughCredits: [],
        priorYearCarryover: d(0),
        creditRecapture: d(10),
        previouslyUsedRecapturedCredit: d(11),
        taxYear: 2025,
      })
    ).toThrow(
      "CA FTB 3531 line 10b previously used recaptured credit cannot exceed line 10a recapture"
    );
  });

  it("CA FTB 3531 California Competes Tax Credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAFTB3531CaliforniaCompetesTaxCredit({
        currentYearAgreementCredits: [],
        passThroughCredits: [],
        priorYearCarryover: d(0),
        creditRecapture: d(0),
        previouslyUsedRecapturedCredit: d(0),
        taxYear: 2024,
      })
    ).toThrow("CA FTB 3531 California Competes Tax Credit constants not available for 2024");
  });
});

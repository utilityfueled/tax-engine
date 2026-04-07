/**
 * Tests for California FTB 3510 Prior Year Alternative Minimum Tax Credit.
 * Spec: spec/state/ca-ftb-3510-prior-year-alternative-minimum-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit } from "@/engine/state/ca-ftb-3510-prior-year-alternative-minimum-tax-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California FTB 3510 Prior Year Alternative Minimum Tax Credit", () => {
  it("CA FTB 3510 Prior Year Alternative Minimum Tax Credit Line 38 - nonresident filers compute the current-year claim from prior-year deferral AMT and the 2025 limitation", () => {
    const result = calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit({
      priorYearFilingStatus: "single",
      priorYearItemizedDeductions: true,
      priorYearLine1ExclusionAlternativeMinimumTaxableIncome: d(150000),
      priorYearLine2ExclusionAdjustments: d(10000),
      priorYearLine3AmtCreditNetOperatingLossDeduction: d(5000),
      priorYearLine5ExemptionWorksheetLine1Amount: d(60029),
      priorYearLine6ExemptionWorksheetLine3Amount: d(100000),
      priorYearLine15CaliforniaItemizedDeductionsOnExclusions: d(45000),
      priorYearLine17CaliforniaAdjustedGrossIncomeOnExclusions: d(90000),
      priorYearLine18CaliforniaSourceExclusionAdjustments: d(10000),
      priorYearLine26RegularTax: d(2500),
      priorYearLine28AlternativeMinimumTax: d(5000),
      priorYearLine31UnusedAmtCreditCarryover: d(200),
      currentYearLine33RegularTax: d(6000),
      currentYearLine34ExemptionAndOtherAllowableCredits: d(1000),
      currentYearLine36TentativeMinimumTax: d(3500),
      taxYear: 2025,
    });

    expect(result.line11TentativeMinimumTaxOnExclusions.toNumber()).toBe(7610);
    expect(result.line21AlternativeMinimumTaxRateOnExclusions.toString()).toBe("0.5");
    expect(result.line24CaliforniaAlternativeMinimumTaxRateOnExclusions.toString()).toBe("0.0491");
    expect(result.line27NetAlternativeMinimumTaxOnExclusions.toNumber()).toBe(1305);
    expect(result.line32AvailableCreditBeforeLimitation.toNumber()).toBe(3895);
    expect(result.line37CurrentYearLimitation.toNumber()).toBe(1500);
    expect(result.line38CreditAllowedThisYear.toNumber()).toBe(1500);
    expect(result.line39CarryoverToNextYear.toNumber()).toBe(2395);
  });

  it("CA FTB 3510 Prior Year Alternative Minimum Tax Credit Line 4 - married filing separately applies the published 2024 threshold adjustment", () => {
    const result = calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit({
      priorYearFilingStatus: "married_filing_separately",
      priorYearItemizedDeductions: false,
      priorYearLine1ExclusionAlternativeMinimumTaxableIncome: d(465235),
      priorYearLine5ExemptionWorksheetLine1Amount: d(60029),
      priorYearLine6ExemptionWorksheetLine3Amount: d(225115),
      priorYearLine28AlternativeMinimumTax: d(0),
      priorYearLine31UnusedAmtCreditCarryover: d(0),
      currentYearLine33RegularTax: d(1000),
      currentYearLine34ExemptionAndOtherAllowableCredits: d(0),
      currentYearLine36TentativeMinimumTax: d(0),
      taxYear: 2025,
    });

    expect(result.line4ExclusionAlternativeMinimumTaxableIncome.toNumber()).toBe(465236);
  });

  it("CA FTB 3510 Prior Year Alternative Minimum Tax Credit Line 39 - no current-year credit or carryover remains when line 32 is zero or less", () => {
    const result = calculateCAFTB3510PriorYearAlternativeMinimumTaxCredit({
      priorYearFilingStatus: "single",
      priorYearItemizedDeductions: false,
      priorYearLine1ExclusionAlternativeMinimumTaxableIncome: d(10000),
      priorYearLine5ExemptionWorksheetLine1Amount: d(0),
      priorYearLine6ExemptionWorksheetLine3Amount: d(0),
      priorYearLine17CaliforniaAdjustedGrossIncomeOnExclusions: d(10000),
      priorYearLine28AlternativeMinimumTax: d(100),
      priorYearLine31UnusedAmtCreditCarryover: d(50),
      currentYearLine33RegularTax: d(1000),
      currentYearLine34ExemptionAndOtherAllowableCredits: d(0),
      currentYearLine36TentativeMinimumTax: d(0),
      taxYear: 2025,
    });

    expect(result.line30PriorYearNetAlternativeMinimumTaxOnDeferrals.toNumber()).toBe(-600);
    expect(result.line32AvailableCreditBeforeLimitation.toNumber()).toBe(-550);
    expect(result.line38CreditAllowedThisYear.toNumber()).toBe(0);
    expect(result.line39CarryoverToNextYear.toNumber()).toBe(0);
  });
});

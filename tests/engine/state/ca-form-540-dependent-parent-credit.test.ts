/**
 * Tests for California Form 540 Dependent Parent credit.
 * Spec: spec/state/ca-form-540-dependent-parent-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540DependentParentCredit } from "@/engine/state/ca-form-540-dependent-parent-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 Dependent Parent credit", () => {
  it("CA Form 540 Dependent Parent credit Line 1 - the worksheet starts from Form 540 line 35 subtotal tax before credits", () => {
    const result = calculateCAForm540DependentParentCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "married_filing_separately",
      marriedOrRegisteredDomesticPartnerAtYearEnd: true,
      spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
      furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      taxYear: 2025,
    });

    expect(result.line1TaxBeforeCredits.toNumber()).toBe(2000);
  });

  it("CA Form 540 Dependent Parent credit Line 2 - the 2025 worksheet uses a 30% credit rate", () => {
    const result = calculateCAForm540DependentParentCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "married_filing_separately",
      marriedOrRegisteredDomesticPartnerAtYearEnd: true,
      spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
      furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      taxYear: 2025,
    });

    expect(result.line2Rate.toString()).toBe("0.3");
  });

  it("CA Form 540 Dependent Parent credit Line 3 - married filing separately with a qualifying dependent parent household uses the capped $610 credit", () => {
    const result = calculateCAForm540DependentParentCredit({
      taxBeforeCredits: d(3000),
      filingStatus: "married_filing_separately",
      marriedOrRegisteredDomesticPartnerAtYearEnd: true,
      spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
      furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3Credit.toNumber()).toBe(610);
  });

  it("CA Form 540 Dependent Parent credit - a spouse in the household during the last six months disqualifies the credit", () => {
    const result = calculateCAForm540DependentParentCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "married_filing_separately",
      marriedOrRegisteredDomesticPartnerAtYearEnd: true,
      spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: false,
      furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("last_six_months_household_requirement_not_met");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Dependent Parent credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540DependentParentCredit({
        taxBeforeCredits: d(2000),
        filingStatus: "married_filing_separately",
        marriedOrRegisteredDomesticPartnerAtYearEnd: true,
        spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
        furnishedOverOneHalfDependentParentHouseholdExpenses: true,
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 Dependent Parent credit constants not available for 2024");
  });
});

/**
 * Tests for New York IT-209 noncustodial parent earned income credit.
 * Spec: spec/state/ny-it209-noncustodial-parent-earned-income-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNYIT209 } from "@/engine/state/ny-it209-noncustodial-parent-earned-income-credit.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function baseInput() {
  return {
    filingStatus: "single" as const,
    taxYear: 2025 as const,
    federalAgi: 15000,
    wagesSalariesTips: 15000,
    earnedIncomeAdjustment: 0,
    businessIncomeOrLoss: 0,
    fullYearResident: true,
    ageAtYearEnd: 30,
    hasQualifyingNoncustodialChild: true,
    supportOrderInEffectHalfYear: true,
    paidRequiredChildSupport: true,
    hasValidSocialSecurityNumber: true,
    filesFederalForm2555: false,
    investmentIncome: 0,
    claimedFederalEic: false,
    federalEicClaimedAmount: 0,
    nyStateTax: 0,
    householdCredit: 0,
    residentCredit: 0,
    accumulationDistributionCredit: 0,
  };
}

describe("NY IT-209 Noncustodial Parent Earned Income Credit", () => {
  it("Part 1 - AGI of exactly $50,434 fails the line 6 eligibility test", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      federalAgi: 50434,
      wagesSalariesTips: 25000,
    });

    expect(result.isNoncustodialEligible).toBe(false);
    expect(result.selectedNoncustodialParentEic.equals(d(0))).toBe(true);
  });

  it("Part 3 - signed business loss reduces line 16 earned income", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      wagesSalariesTips: 12000,
      earnedIncomeAdjustment: 500,
      businessIncomeOrLoss: -2000,
    });

    expect(result.earnedIncome.equals(d(9500))).toBe(true);
  });

  it("Schedule A line 24 - the one-child comparison uses 20% of the hypothetical one-child federal EIC", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      wagesSalariesTips: 15000,
      federalAgi: 15000,
    });

    expect(result.scheduleALine24OneChildComparison.equals(d(866))).toBe(true);
  });

  it("Schedule A line 31 - the 2.5x no-child comparison can exceed the one-child comparison", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      wagesSalariesTips: 5000,
      federalAgi: 5000,
    });

    expect(result.scheduleALine24OneChildComparison.equals(d(340))).toBe(true);
    expect(result.scheduleALine31NoChildComparison.equals(d(955))).toBe(true);
    expect(result.noncustodialParentEic.equals(d(955))).toBe(true);
  });

  it("Schedule B line 42 - household credit is limited by the tax remaining after resident and accumulation distribution credits", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      federalAgi: 25000,
      wagesSalariesTips: 25000,
      claimedFederalEic: true,
      federalEicClaimedAmount: 3000,
      nyStateTax: 20,
      householdCredit: 25,
      residentCredit: 15,
    });

    expect(result.scheduleBLine38eTaxAfterResidentAndAccumulationCredits.equals(d(5))).toBe(true);
    expect(result.scheduleBLine41AllowableHouseholdCredit.equals(d(5))).toBe(true);
    expect(result.allowableNysEarnedIncomeCredit.equals(d(895))).toBe(true);
  });

  it("IT-201 routing - the regular NYS EIC stays on line 65 when it is larger than the noncustodial credit", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      federalAgi: 25000,
      wagesSalariesTips: 25000,
      claimedFederalEic: true,
      federalEicClaimedAmount: 3000,
      nyStateTax: 20,
      householdCredit: 25,
      residentCredit: 15,
    });

    expect(result.allowableNysEarnedIncomeCredit.equals(d(895))).toBe(true);
    expect(result.noncustodialParentEic.equals(d(813))).toBe(true);
    expect(result.selectedNysEarnedIncomeCredit.equals(d(895))).toBe(true);
    expect(result.selectedNoncustodialParentEic.equals(d(0))).toBe(true);
  });

  it("IT-201 routing - without a federal EIC claim the noncustodial credit flows directly to line 66", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      claimedFederalEic: false,
      federalEicClaimedAmount: 0,
    });

    expect(result.allowableNysEarnedIncomeCredit.equals(d(0))).toBe(true);
    expect(result.selectedNysEarnedIncomeCredit.equals(d(0))).toBe(true);
    expect(result.selectedNoncustodialParentEic.equals(d(866))).toBe(true);
  });

  it("Part 1 - investment income above $11,950 blocks the IT-209 EIC routing", () => {
    const result = calculateNYIT209({
      ...baseInput(),
      claimedFederalEic: true,
      federalEicClaimedAmount: 3000,
      investmentIncome: 11951,
    });

    expect(result.blocksRegularEarnedIncomeCredits).toBe(true);
    expect(result.selectedNysEarnedIncomeCredit.equals(d(0))).toBe(true);
    expect(result.selectedNoncustodialParentEic.equals(d(0))).toBe(true);
  });
});

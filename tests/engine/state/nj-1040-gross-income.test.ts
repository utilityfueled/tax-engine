/**
 * Tests for New Jersey NJ-1040 gross income computation.
 * Spec: spec/state/nj-1040-gross-income.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040GrossIncome } from "@/engine/state/nj-1040-gross-income.js";

describe("NJ-1040 gross income computation", () => {
  // --- Line 14: Wages ---

  it("NJ-1040 gross income Line 14 - wages from single W-2", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 75000,
    });
    expect(result.wages.toNumber()).toBe(75000);
  });

  it("NJ-1040 gross income Line 14 - wages default to zero when omitted", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.wages.toNumber()).toBe(0);
  });

  // --- Line 15a: Taxable interest ---

  it("NJ-1040 gross income Line 15a - taxable interest", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      taxableInterest: 1200,
    });
    expect(result.taxableInterest.toNumber()).toBe(1200);
  });

  // --- Line 15b: Tax-exempt interest from other states ---

  it("NJ-1040 gross income Line 15b - other state tax-exempt interest adds to total income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 60000,
      otherStateTaxExemptInterest: 2500,
    });
    expect(result.otherStateTaxExemptInterest.toNumber()).toBe(2500);
    // Total income includes the other-state tax-exempt interest
    expect(result.totalNJIncome.toNumber()).toBe(62500);
  });

  it("NJ-1040 gross income Line 15b - zero when only NJ municipal bonds held", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      otherStateTaxExemptInterest: 0,
    });
    expect(result.otherStateTaxExemptInterest.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 15b - defaults to zero when omitted", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
    });
    expect(result.otherStateTaxExemptInterest.toNumber()).toBe(0);
  });

  // --- Line 16: Dividends ---

  it("NJ-1040 gross income Line 16 - dividends", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      dividends: 3500,
    });
    expect(result.dividends.toNumber()).toBe(3500);
  });

  // --- Line 17: Business income ---

  it("NJ-1040 gross income Line 17 - business income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      businessIncome: 45000,
    });
    expect(result.businessIncome.toNumber()).toBe(45000);
  });

  it("NJ-1040 gross income Line 17 - business loss is not entered on the return", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 80000,
      businessIncome: -10000,
    });
    expect(result.businessIncome.toNumber()).toBe(0);
    expect(result.totalNJIncome.toNumber()).toBe(80000);
  });

  // --- Line 18: Net gains from property ---

  it("NJ-1040 gross income Line 18 - net gains from property", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      netGainsFromProperty: 25000,
    });
    expect(result.netGainsFromProperty.toNumber()).toBe(25000);
  });

  it("NJ-1040 gross income Line 18 - net property loss is not entered on the return", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 40000,
      netGainsFromProperty: -5000,
    });
    expect(result.netGainsFromProperty.toNumber()).toBe(0);
    expect(result.totalNJIncome.toNumber()).toBe(40000);
  });

  // --- Line 19: Pension income ---

  it("NJ-1040 gross income Line 19 - pension income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      pensionIncome: 30000,
    });
    expect(result.pensionIncome.toNumber()).toBe(30000);
  });

  // --- Line 20a: Partnership income ---

  it("NJ-1040 gross income Line 20a - partnership income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      partnershipIncome: 12000,
    });
    expect(result.partnershipIncome.toNumber()).toBe(12000);
  });

  it("NJ-1040 gross income Line 20a - partnership loss is not entered on the return", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      partnershipIncome: -7000,
    });
    expect(result.partnershipIncome.toNumber()).toBe(0);
    expect(result.totalNJIncome.toNumber()).toBe(50000);
  });

  // --- Line 20b: S corp income ---

  it("NJ-1040 gross income Line 20b - S corp income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      sCorpIncome: 8000,
    });
    expect(result.sCorpIncome.toNumber()).toBe(8000);
  });

  it("NJ-1040 gross income Line 20b - S corporation loss is not entered on the return", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      sCorpIncome: -6000,
    });
    expect(result.sCorpIncome.toNumber()).toBe(0);
    expect(result.totalNJIncome.toNumber()).toBe(50000);
  });

  // --- Line 21: Rental income ---

  it("NJ-1040 gross income Line 21 - rental income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      rentalIncome: 18000,
    });
    expect(result.rentalIncome.toNumber()).toBe(18000);
  });

  it("NJ-1040 gross income Line 21 - rental loss is not entered on the return", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      rentalIncome: -9000,
    });
    expect(result.rentalIncome.toNumber()).toBe(0);
    expect(result.totalNJIncome.toNumber()).toBe(50000);
  });

  // --- Line 22: Gambling income ---

  it("NJ-1040 gross income Line 22 - net gambling income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      gamblingWinnings: 5000,
      gamblingLosses: 2000,
    });
    expect(result.netGamblingIncome.toNumber()).toBe(3000);
  });

  it("NJ-1040 gross income Line 22 - gambling net limited to zero floor", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      gamblingWinnings: 1000,
      gamblingLosses: 5000,
    });
    expect(result.netGamblingIncome.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 22 - gambling with no losses", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      gamblingWinnings: 3000,
    });
    expect(result.netGamblingIncome.toNumber()).toBe(3000);
  });

  // --- Line 23: Alimony ---

  it("NJ-1040 gross income Line 23 - alimony", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      alimonyReceived: 24000,
    });
    expect(result.alimonyReceived.toNumber()).toBe(24000);
  });

  // --- Line 24: Other income ---

  it("NJ-1040 gross income Line 24 - other income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      otherIncome: 5000,
    });
    expect(result.otherIncome.toNumber()).toBe(5000);
  });

  // --- Line 25: Total NJ income ---

  it("NJ-1040 gross income Line 25 - total income sums all categories", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 60000,
      taxableInterest: 500,
      dividends: 1000,
      businessIncome: 10000,
      netGainsFromProperty: 5000,
      pensionIncome: 0,
      partnershipIncome: 2000,
      sCorpIncome: 3000,
      rentalIncome: 6000,
      gamblingWinnings: 1000,
      gamblingLosses: 500,
      alimonyReceived: 0,
      otherIncome: 1500,
    });
    // 60000 + 500 + 1000 + 10000 + 5000 + 0 + 2000 + 3000 + 6000 + 500 + 0 + 1500 = 89500
    expect(result.totalNJIncome.toNumber()).toBe(89500);
  });

  it("NJ-1040 gross income Line 25 - all zeros yields zero total", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.totalNJIncome.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 25 - category losses do not offset positive NJ income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      businessIncome: -20000,
      netGainsFromProperty: -3000,
      partnershipIncome: -4000,
      sCorpIncome: -5000,
      rentalIncome: -6000,
    });
    expect(result.totalNJIncome.toNumber()).toBe(50000);
  });

  // --- Line 29: Gross income is computed before the line 32 alimony deduction ---

  it("NJ-1040 gross income Line 29 - deductible alimony paid does not reduce gross income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 80000,
      alimonyPaid: 12000,
    });
    expect(result.njGrossIncome.toNumber()).toBe(80000);
  });

  it("NJ-1040 gross income Line 29 - pension exclusion tiers use total income before the line 32 alimony deduction", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 60000,
      pensionIncome: 50000,
      alimonyPaid: 15000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $60,000 + $50,000 = $110,000
    // Pension exclusion uses totalNJIncome ($110K) for tier: $100,001-$125,000
    // Single uses 37.5% of pension income: 37.5% × $50,000 = $18,750
    // NJ gross income = $110,000 - $18,750 = $91,250
    expect(result.pensionExclusion.toNumber()).toBe(18750);
    expect(result.njGrossIncome.toNumber()).toBe(91250);
  });

  it("NJ-1040 gross income Line 29 - other adjustments reduce gross income but line 32 alimony does not", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 100000,
      alimonyPaid: 24000,
      otherAdjustments: 1000,
    });
    // Total NJ income = $100,000
    // NJ gross income = $100,000 - $0 (no pension exclusion) - $1,000 = $99,000
    expect(result.njGrossIncome.toNumber()).toBe(99000);
  });

  it("NJ-1040 gross income Line 29 - alimony paid alone does not floor gross income to zero", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 10000,
      alimonyPaid: 25000,
    });
    expect(result.njGrossIncome.toNumber()).toBe(10000);
  });

  // --- Line 27a: Pension exclusion ---

  it("NJ-1040 gross income Line 27a - no exclusion when not qualifying", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      pensionIncome: 50000,
      qualifiesForPensionExclusion: false,
    });
    expect(result.pensionExclusion.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 27a - no exclusion when under 62 (default)", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      pensionIncome: 50000,
    });
    expect(result.pensionExclusion.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 27a - pension exclusion full amount for single under threshold", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 20000,
      pensionIncome: 50000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = 70000. Threshold for single = $100,000. Under threshold.
    // Exclusion = min($50,000, $75,000) = $50,000
    expect(result.pensionExclusion.toNumber()).toBe(50000);
  });

  it("NJ-1040 gross income Line 27a - pension exclusion capped at max for single", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      pensionIncome: 90000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $90,000. Under $100K threshold.
    // Exclusion = min($90,000, $75,000) = $75,000
    expect(result.pensionExclusion.toNumber()).toBe(75000);
  });

  it("NJ-1040 gross income Line 27a - MFJ in $100K-$125K tier excludes 50% of pension income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 40000,
      pensionIncome: 80000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $120,000. Tier: $100,001-$125,000 → 50%
    // Exclusion = 50% × $80,000 pension income = $40,000
    expect(result.pensionExclusion.toNumber()).toBe(40000);
  });

  it("NJ-1040 gross income Line 27a - MFJ 25% in $125K-$150K tier", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 20000,
      pensionIncome: 120000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $140,000. Tier: $125,001-$150,000 → 25%
    // Exclusion = 25% × $120,000 pension income = $30,000
    expect(result.pensionExclusion.toNumber()).toBe(30000);
  });

  it("NJ-1040 gross income Line 27a - single in $100K-$125K tier excludes 37.5% of pension income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 80000,
      pensionIncome: 40000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $120,000. Tier: $100,001-$125,000 → 37.5%
    // Exclusion = 37.5% × $40,000 pension income = $15,000
    expect(result.pensionExclusion.toNumber()).toBe(15000);
  });

  it("NJ-1040 gross income Line 27a - pension exclusion fully phased out", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 160000,
      pensionIncome: 30000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $190,000 > $150,000 → 0% tier → $0
    expect(result.pensionExclusion.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 27a - single at exact threshold gets full exclusion", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 60000,
      pensionIncome: 40000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $100,000 ≤ $100,000 → full exclusion (100% tier)
    // Exclusion = min($40,000, $75,000) = $40,000
    expect(result.pensionExclusion.toNumber()).toBe(40000);
  });

  it("NJ-1040 gross income Line 27a - single $1 over $100K drops to 37.5% tier", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 60001,
      pensionIncome: 40000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $100,001. Tier: $100,001-$125,000 → 37.5%
    // Exclusion = 37.5% × $40,000 pension income = $15,000
    expect(result.pensionExclusion.toNumber()).toBe(15000);
  });

  it("NJ-1040 gross income Line 27a - MFS exclusion capped at $50,000", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      pensionIncome: 60000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $60,000 ≤ $100,000 → full exclusion (100% tier)
    // Exclusion = min($60,000, $50,000 MFS max) = $50,000
    expect(result.pensionExclusion.toNumber()).toBe(50000);
  });

  it("NJ-1040 gross income Line 27a - HOH uses single limits", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "head_of_household",
      taxYear: 2025,
      wages: 10000,
      pensionIncome: 60000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $70,000 ≤ $100,000 → full exclusion (100% tier)
    // Exclusion = min($60,000, $75,000 HOH max) = $60,000
    expect(result.pensionExclusion.toNumber()).toBe(60000);
  });

  it("NJ-1040 gross income Line 27a - QSS follows the single/HOH worksheet percentages", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
      wages: 30000,
      pensionIncome: 110000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $140,000. Tier: $125,001-$150,000 → 18.75%
    // QSS uses the single/HOH rate: 18.75% × $110,000 pension income = $20,625
    expect(result.pensionExclusion.toNumber()).toBe(20625);
  });

  it("NJ-1040 gross income Line 27a - MFJ under $100K gets full exclusion", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 10000,
      pensionIncome: 80000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $90,000 ≤ $100,000 → 100% tier
    // Exclusion = min($80K, $100K) = $80,000
    expect(result.pensionExclusion.toNumber()).toBe(80000);
  });

  it("NJ-1040 gross income Line 27a - single at exact $125K boundary gets 37.5%", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 75000,
      pensionIncome: 50000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $125,000. Tier: $100,001-$125,000 → 37.5%
    // Exclusion = 37.5% × $50,000 pension income = $18,750
    expect(result.pensionExclusion.toNumber()).toBe(18750);
  });

  it("NJ-1040 gross income Line 27a - single at $125,001 drops to 25% tier", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 75001,
      pensionIncome: 50000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $125,001. Tier: $125,001-$150,000 → 18.75%
    // Single uses 18.75% of pension income: 18.75% × $50,000 = $9,375
    expect(result.pensionExclusion.toNumber()).toBe(9375);
  });

  it("NJ-1040 gross income Line 27a - above $150K gets zero exclusion all statuses", () => {
    for (const status of [
      "single",
      "married_filing_jointly",
      "married_filing_separately",
      "head_of_household",
      "qualifying_surviving_spouse",
    ] as const) {
      const result = calculateNJ1040GrossIncome({
        filingStatus: status,
        taxYear: 2025,
        wages: 120000,
        pensionIncome: 50000,
        qualifiesForPensionExclusion: true,
      });
      // Total NJ income = $170,000 > $150,000 → 0%
      expect(result.pensionExclusion.toNumber()).toBe(0);
    }
  });

  it("NJ-1040 gross income Line 27a - MFS in $100K-$125K tier excludes 25% of pension income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      wages: 60000,
      pensionIncome: 50000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $110,000. Tier: $100,001-$125,000 → 25%
    // MFS uses 25% of pension income: 25% × $50,000 = $12,500
    expect(result.pensionExclusion.toNumber()).toBe(12500);
  });

  it("NJ-1040 gross income Line 27a - pension income less than tier max is the limit", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 90000,
      pensionIncome: 15000,
      qualifiesForPensionExclusion: true,
    });
    // Total NJ income = $105,000. Tier: $100,001-$125,000 → 37.5%
    // Exclusion = 37.5% × $15,000 pension income = $5,625
    expect(result.pensionExclusion.toNumber()).toBe(5625);
  });

  it("NJ-1040 gross income Line 27a - no pension income means no exclusion even if eligible", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      qualifiesForPensionExclusion: true,
    });
    expect(result.pensionExclusion.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 27a - mixed-age joint return can limit pension exclusion to the eligible spouse pension", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      pensionIncome: 24000,
      pensionIncomeEligibleForExclusion: 6000,
      qualifiesForPensionExclusion: true,
    });
    expect(result.pensionExclusion.toNumber()).toBe(6000);
  });

  // --- Line 27b: Other retirement income exclusion ---

  it("NJ-1040 gross income Line 27b - unclaimed exclusion allowed when earned income is $3,000 or less", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      taxableInterest: 12108,
      dividends: 2981,
      netGainsFromProperty: 9500,
      pensionIncome: 8000,
      rentalIncome: 14000,
      gamblingWinnings: 22142,
      qualifiesForPensionExclusion: true,
      qualifiesForOtherRetirementExclusion: true,
      qualifiesForSpecialRetirementExclusion: true,
    });
    expect(result.otherRetirementIncomeExclusion.toNumber()).toBe(70000);
    expect(result.njGrossIncome.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 27b - earned income over $3,000 disallows unclaimed exclusion but keeps the special exclusion", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 3500,
      pensionIncome: 8000,
      qualifiesForPensionExclusion: true,
      qualifiesForOtherRetirementExclusion: true,
      qualifiesForSpecialRetirementExclusion: true,
    });
    expect(result.otherRetirementIncomeExclusion.toNumber()).toBe(3000);
    expect(result.njGrossIncome.toNumber()).toBe(500);
  });

  it("NJ-1040 gross income Line 27b - special exclusion still applies when income exceeds $150,000", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxableInterest: 6000,
      dividends: 2000,
      pensionIncome: 146000,
      qualifiesForOtherRetirementExclusion: true,
      qualifiesForSpecialRetirementExclusion: true,
    });
    expect(result.pensionExclusion.toNumber()).toBe(0);
    expect(result.otherRetirementIncomeExclusion.toNumber()).toBe(6000);
    expect(result.njGrossIncome.toNumber()).toBe(148000);
  });

  it("NJ-1040 gross income Line 27b - mixed-age joint return caps the unclaimed exclusion to the eligible spouse income", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 2000,
      taxableInterest: 4000,
      pensionIncome: 24000,
      pensionIncomeEligibleForExclusion: 6000,
      qualifiesForPensionExclusion: true,
      qualifiesForOtherRetirementExclusion: true,
      otherRetirementIncomeExclusionCap: 3500,
    });
    expect(result.pensionExclusion.toNumber()).toBe(6000);
    expect(result.otherRetirementIncomeExclusion.toNumber()).toBe(3500);
    expect(result.njGrossIncome.toNumber()).toBe(20500);
  });

  it("NJ-1040 gross income Line 27c - total retirement exclusion adds pension and other retirement exclusions", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      pensionIncome: 8000,
      taxableInterest: 12108,
      dividends: 2981,
      netGainsFromProperty: 9500,
      rentalIncome: 14000,
      gamblingWinnings: 22142,
      qualifiesForPensionExclusion: true,
      qualifiesForOtherRetirementExclusion: true,
      qualifiesForSpecialRetirementExclusion: true,
    });
    expect(result.pensionExclusion.toNumber()).toBe(8000);
    expect(result.otherRetirementIncomeExclusion.toNumber()).toBe(70000);
    expect(result.totalRetirementExclusion.toNumber()).toBe(78000);
  });

  // --- Line 28: Other adjustments ---

  it("NJ-1040 gross income Line 28 - other adjustments", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
      otherAdjustments: 2000,
    });
    expect(result.otherAdjustments.toNumber()).toBe(2000);
    expect(result.njGrossIncome.toNumber()).toBe(48000);
  });

  // --- Line 29: NJ Gross Income ---

  it("NJ-1040 gross income Line 29 - NJ gross income equals total minus adjustments", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 80000,
      taxableInterest: 2000,
      pensionIncome: 40000,
      qualifiesForPensionExclusion: true,
      otherAdjustments: 1000,
    });
    // Total NJ income = $122,000. Tier: $100,001-$125,000 → 50%
    // MFJ excludes 50% of pension income: 50% × $40,000 = $20,000
    // NJ Gross Income = $122,000 - $0 (alimony paid) - $20,000 - $1,000 = $101,000
    expect(result.totalNJIncome.toNumber()).toBe(122000);
    expect(result.pensionExclusion.toNumber()).toBe(20000);
    expect(result.njGrossIncome.toNumber()).toBe(101000);
  });

  it("NJ-1040 gross income Line 29 - gross income floored at zero", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 5000,
      otherAdjustments: 10000,
    });
    expect(result.njGrossIncome.toNumber()).toBe(0);
  });

  it("NJ-1040 gross income Line 29 - wage-only filer with no adjustments", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 65000,
    });
    expect(result.totalNJIncome.toNumber()).toBe(65000);
    expect(result.pensionExclusion.toNumber()).toBe(0);
    expect(result.otherAdjustments.toNumber()).toBe(0);
    expect(result.njGrossIncome.toNumber()).toBe(65000);
  });

  // --- Comprehensive scenario ---

  it("NJ-1040 gross income - comprehensive MFJ return with multiple income types", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      wages: 100000,
      taxableInterest: 3000,
      dividends: 5000,
      businessIncome: -2000,
      netGainsFromProperty: 10000,
      pensionIncome: 25000,
      partnershipIncome: 8000,
      sCorpIncome: 0,
      rentalIncome: 12000,
      gamblingWinnings: 3000,
      gamblingLosses: 1000,
      alimonyReceived: 0,
      otherIncome: 500,
      qualifiesForPensionExclusion: true,
    });
    // The net business loss is not entered on the NJ-1040.
    // Total: 100K + 3K + 5K + 0 + 10K + 25K + 8K + 0 + 12K + 2K + 0 + 0.5K = 165,500
    expect(result.totalNJIncome.toNumber()).toBe(165500);
    // Pension exclusion: income $165,500 > $150,000 → 0% tier
    expect(result.pensionExclusion.toNumber()).toBe(0);
    // NJ Gross Income = $165,500 - $0 = $165,500
    expect(result.njGrossIncome.toNumber()).toBe(165500);
  });

  // --- Audit trail ---

  it("NJ-1040 gross income - audit trail records lines 14-29", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: 50000,
    });
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toEqual([
      "14", "15a", "15b", "16", "17", "18", "19", "20a", "20b", "21", "22", "23", "24",
      "25", "27a", "27b", "27c", "28", "29",
    ]);
    expect(result.lines).toHaveLength(19);
  });

  // --- String/number input flexibility ---

  it("NJ-1040 gross income - accepts string and number inputs", () => {
    const result = calculateNJ1040GrossIncome({
      filingStatus: "single",
      taxYear: 2025,
      wages: "75000.50",
      taxableInterest: 1200,
    });
    expect(result.wages.toNumber()).toBe(75000.50);
    expect(result.taxableInterest.toNumber()).toBe(1200);
    expect(result.totalNJIncome.toNumber()).toBe(76200.50);
  });
});

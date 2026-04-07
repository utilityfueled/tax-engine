/**
 * Edge case tests for Form 8606 IRA basis boundaries.
 * Spec: spec/federal/form-8606.yaml
 *
 * These tests exercise boundary conditions, competing exclusions,
 * basis ordering transitions, and carryforward edge cases that go
 * beyond the per-line unit tests.
 */

import { describe, expect, it } from "vitest";
import { calculateForm8606 } from "@/engine/forms/form-8606.js";

// ── Part I: Pro-rata basis allocation boundaries ────────────────

describe("Form 8606 Part I basis allocation boundaries", () => {
  it("zero basis makes all distributions fully taxable with no carryforward", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "50000",
      traditionalDistributions: "10000",
      rothConversions: "0",
    });

    expect(result.line5.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line15a.toNumber()).toBe(10000);
    expect(result.line15c.toNumber()).toBe(10000);
    expect(result.line14.toNumber()).toBe(0);
  });

  it("pro-rata ratio at exactly 1.000 makes all distributions nontaxable", () => {
    // Basis = $5000, denominator = $5000 (yearEndValue=0, distributions=5000)
    // Ratio = 5000/5000 = 1.000
    const result = calculateForm8606({
      nondeductibleContributions: "5000",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "5000",
      rothConversions: "0",
    });

    expect(result.line10.toNumber()).toBe(1);
    expect(result.line12.toNumber()).toBe(5000);
    expect(result.line15a.toNumber()).toBe(0);
    expect(result.line15c.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(0);
  });

  it("ratio above 1.000 is clamped — basis exceeds total IRA value plus distributions", () => {
    // Basis = $8000 (contributions + prior), denominator = $5000
    // Raw ratio = 8000/5000 = 1.600 → clamped to 1.000
    const result = calculateForm8606({
      nondeductibleContributions: "3000",
      priorYearBasis: "5000",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "5000",
      rothConversions: "0",
    });

    expect(result.line5.toNumber()).toBe(8000);
    expect(result.line9.toNumber()).toBe(5000);
    expect(result.line10.toNumber()).toBe(1);
    expect(result.line12.toNumber()).toBe(5000);
    expect(result.line15a.toNumber()).toBe(0);
    expect(result.line15c.toNumber()).toBe(0);
    // Carryforward = basis used = 5000, remaining = 8000 - 5000 = 3000
    expect(result.line14.toNumber()).toBe(3000);
  });

  it("full IRA conversion to Roth in one year — all basis offsets the conversion", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "20000",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "50000",
    });

    // Ratio = 20000/50000 = 0.400
    expect(result.line10.toNumber()).toBe(0.4);
    // Nontaxable conversion amount = 50000 * 0.4 = 20000
    expect(result.line11.toNumber()).toBe(20000);
    // Taxable conversion = 50000 - 20000 = 30000
    expect(result.line18.toNumber()).toBe(30000);
    // No carryforward (all basis consumed)
    expect(result.line14.toNumber()).toBe(0);
  });

  it("large Roth conversion with small traditional distribution — conversion dominates basis allocation", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "10000",
      contributionsMadeNextYear: "0",
      yearEndValue: "50000",
      traditionalDistributions: "5000",
      rothConversions: "45000",
    });

    // Denominator = 50000 + 5000 + 45000 = 100000
    // Ratio = 10000/100000 = 0.100
    expect(result.line10.toNumber()).toBe(0.1);
    // Conversion nontaxable = 45000 * 0.1 = 4500
    expect(result.line11.toNumber()).toBe(4500);
    // Distribution nontaxable = 5000 * 0.1 = 500
    expect(result.line12.toNumber()).toBe(500);
    // Total basis used = 4500 + 500 = 5000
    expect(result.line13.toNumber()).toBe(5000);
    // Carryforward = 10000 - 5000 = 5000
    expect(result.line14.toNumber()).toBe(5000);
    // Taxable distribution = 5000 - 500 = 4500
    expect(result.line15a.toNumber()).toBe(4500);
    expect(result.line15c.toNumber()).toBe(4500);
    // Taxable conversion = 45000 - 4500 = 40500
    expect(result.line18.toNumber()).toBe(40500);
  });

  it("no distributions and no conversions — full basis carries forward untouched", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "6500",
      priorYearBasis: "15000",
      contributionsMadeNextYear: "0",
      yearEndValue: "100000",
      traditionalDistributions: "0",
      rothConversions: "0",
    });

    // No distributions or conversions → ratio is 0/100000 but denominator has yearEndValue
    // Actually Line 9 = 100000 + 0 + 0 = 100000
    // Line 5 = 21500, ratio = 21500/100000 = 0.215
    // But since Line 7 = 0 and Line 8 = 0, no basis is consumed
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
    // Full basis carries forward
    expect(result.line14.toNumber()).toBe(21500);
  });

  it("denominator is exactly zero when no IRA value, distributions, or conversions exist — ratio defaults to zero", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "3000",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
    });

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line14.toNumber()).toBe(3000);
  });
});

// ── Part I: Line 7 exclusion competition ────────────────────────

describe("Form 8606 Line 7 exclusion competition", () => {
  it("QCD consuming all distributions leaves Line 7 at zero — no basis allocation to distributions", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "10000",
      contributionsMadeNextYear: "0",
      yearEndValue: "80000",
      traditionalDistributions: "5000",
      qualifiedCharitableDistributions: "5000",
      rothConversions: "0",
    });

    expect(result.line7.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line15a.toNumber()).toBe(0);
    expect(result.line15c.toNumber()).toBe(0);
    // Basis fully carries forward since no taxable distributions consumed it
    expect(result.line14.toNumber()).toBe(10000);
  });

  it("multiple exclusion branches all present — QCD + rollover + returned + excess + HSA stack correctly", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "5000",
      contributionsMadeNextYear: "0",
      yearEndValue: "50000",
      traditionalDistributions: "25000",
      qualifiedCharitableDistributions: "3000",
      rolledOverDistributions: "10000",
      returnedContributionsByDueDate: "2000",
      returnedExcessContributions: "1500",
      qualifiedHsaFundingDistributions: "1000",
      rothConversions: "0",
    });

    // Total exclusions = 3000 + 10000 + 2000 + 1500 + 1000 = 17500
    // Line 7 = 25000 - 17500 = 7500
    expect(result.line7Exclusions.toNumber()).toBe(17500);
    expect(result.line7.toNumber()).toBe(7500);
  });

  it("exclusion branches exceeding distributions are clamped — no negative Line 7", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "5000",
      contributionsMadeNextYear: "0",
      yearEndValue: "50000",
      traditionalDistributions: "8000",
      qualifiedCharitableDistributions: "3000",
      rolledOverDistributions: "4000",
      returnedContributionsByDueDate: "2000",
      rothConversions: "0",
    });

    // QCD = min(3000, 8000) = 3000; remaining = 5000
    // Rollover = min(4000, 5000) = 4000; remaining = 1000
    // Returned = min(2000, 1000) = 1000; remaining = 0
    // Total exclusions = 3000 + 4000 + 1000 = 8000
    // Line 7 = 0 (not negative)
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line7Exclusions.toNumber()).toBe(8000);
  });
});

// ── Part I: Disaster distributions and repayments ───────────────

describe("Form 8606 Line 15b disaster distribution edge cases", () => {
  it("all Line 7 distributions are qualified disaster — Line 15b equals Line 15a", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "2000",
      contributionsMadeNextYear: "0",
      yearEndValue: "20000",
      traditionalDistributions: "10000",
      qualifiedDisasterDistributions: "10000",
      rothConversions: "0",
    });

    // Disaster = Line 7 → use Line 15a directly
    expect(result.line15b.toNumber()).toBe(result.line15a.toNumber());
    // No taxable amount after disaster exclusion
    expect(result.line15c.toNumber()).toBe(0);
  });

  it("disaster distributions capped at Line 7 when the claim exceeds the distribution", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "20000",
      traditionalDistributions: "5000",
      qualifiedDisasterDistributions: "8000",
      rothConversions: "0",
    });

    // Disaster clamped to 5000 (= Line 7)
    // Since disaster = Line 7, Line 15b = Line 15a
    expect(result.qualifiedDisasterDistributions.toNumber()).toBe(5000);
    expect(result.line15b.toNumber()).toBe(result.line15a.toNumber());
    expect(result.line15c.toNumber()).toBe(0);
  });
});

describe("Form 8606 Line 15c repayment edge cases", () => {
  it("repayment fully covers the eligible taxable share — zero current-year tax, excess becomes basis adjustment", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "10000",
      repaymentEligibleDistributions: "10000",
      repaymentWithin3YearWindow: "12000",
      repaymentDistributionExceptionNumber: "19",
      rothConversions: "0",
    });

    // All $10,000 is taxable (no basis), all eligible for repayment
    // Repayment = $12,000 but capped at eligible distributions = $10,000
    // Reduction = min(taxable share = $10,000, capped repayment = $10,000)
    expect(result.line15c.toNumber()).toBe(0);
    // Excess repayment = $10,000 - $10,000 = $0
    // Actually the repayment is clamped first to $10,000, so no excess
    expect(result.line15cBasisAdjustment.toNumber()).toBe(0);
    expect(result.line15cExceptionNumber).toBe("19");
  });

  it("partial repayment with basis — only the taxable share is reduced, not the nontaxable share", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "5000",
      contributionsMadeNextYear: "0",
      yearEndValue: "20000",
      traditionalDistributions: "10000",
      repaymentEligibleDistributions: "10000",
      repaymentWithin3YearWindow: "3000",
      repaymentDistributionExceptionNumber: "22",
      rothConversions: "0",
    });

    // Ratio = 5000 / (20000 + 10000) = 0.167
    // Nontaxable = 10000 * 0.167 = 1670
    // Taxable (Line 15a) = 10000 - 1670 = 8330
    // Eligible taxable share = 8330 * (10000 / 10000) = 8330
    // Repayment reduction = min(8330, 3000) = 3000
    // Line 15c = 8330 - 3000 = 5330
    expect(result.line15c.toNumber()).toBe(5330);
    expect(result.line15cRepaymentReduction.toNumber()).toBe(3000);
    expect(result.line15cExceptionNumber).toBe("22");
  });
});

// ── Part I + II: Traditional and Roth conversion interaction ────

describe("Form 8606 traditional distribution and Roth conversion interaction", () => {
  it("simultaneous traditional distribution and Roth conversion share basis proportionally", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "30000",
      contributionsMadeNextYear: "0",
      yearEndValue: "100000",
      traditionalDistributions: "20000",
      rothConversions: "80000",
    });

    // Denominator = 100000 + 20000 + 80000 = 200000
    // Ratio = 30000 / 200000 = 0.150
    expect(result.line10.toNumber()).toBe(0.15);
    // Conversion nontaxable = 80000 * 0.15 = 12000
    expect(result.line11.toNumber()).toBe(12000);
    // Distribution nontaxable = 20000 * 0.15 = 3000
    expect(result.line12.toNumber()).toBe(3000);
    // Taxable conversion = 80000 - 12000 = 68000
    expect(result.line18.toNumber()).toBe(68000);
    // Taxable distribution = 20000 - 3000 = 17000
    expect(result.line15c.toNumber()).toBe(17000);
    // Carryforward = 30000 - (12000 + 3000) = 15000
    expect(result.line14.toNumber()).toBe(15000);
  });
});

// ── Part III: Roth distribution ordering boundaries ─────────────

describe("Form 8606 Part III Roth ordering boundaries", () => {
  it("distribution exactly equals contribution basis — no conversion basis or taxable amount", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "15000",
      rothContributionBasis: "15000",
      rothConversionBasis: "5000",
    });

    expect(result.line19.toNumber()).toBe(15000);
    expect(result.line22.toNumber()).toBe(15000);
    // Line 23 = 15000 - 15000 = 0 — conversion basis not touched
    expect(result.line23.toNumber()).toBe(0);
    expect(result.line25a.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(0);
  });

  it("distribution exceeds contribution basis but within conversion basis — no taxable amount", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "20000",
      rothContributionBasis: "10000",
      rothConversionBasis: "15000",
    });

    // Line 21 = 20000
    // Line 22 = 10000 (contribution basis)
    // Line 23 = 20000 - 10000 = 10000 (remaining after contribution basis)
    // Line 24 = 15000 (conversion basis)
    // Line 25a = 10000 - 15000 = 0 (conversion basis covers it)
    expect(result.line23.toNumber()).toBe(10000);
    expect(result.line25a.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(0);
  });

  it("distribution exceeds all basis — remaining amount is taxable earnings", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "30000",
      rothContributionBasis: "8000",
      rothConversionBasis: "12000",
    });

    // Line 22 = 8000
    // Line 23 = 30000 - 8000 = 22000
    // Line 24 = 12000
    // Line 25a = 22000 - 12000 = 10000 (taxable earnings)
    expect(result.line23.toNumber()).toBe(22000);
    expect(result.line25a.toNumber()).toBe(10000);
    expect(result.line25c.toNumber()).toBe(10000);
  });

  it("zero contribution and conversion basis — entire distribution is taxable", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "5000",
      rothContributionBasis: "0",
      rothConversionBasis: "0",
    });

    expect(result.line22.toNumber()).toBe(0);
    expect(result.line24.toNumber()).toBe(0);
    expect(result.line25a.toNumber()).toBe(5000);
    expect(result.line25c.toNumber()).toBe(5000);
  });

  it("prior-year Line 25c carryforward adds to contribution basis and prevents taxation", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "12000",
      rothContributionBasis: "5000",
      priorYearLine25cBasisAdjustment: "7000",
      rothConversionBasis: "0",
    });

    // Line 22 = 5000 + 7000 = 12000
    // Line 23 = 12000 - 12000 = 0
    expect(result.line22.toNumber()).toBe(12000);
    expect(result.line23.toNumber()).toBe(0);
    expect(result.line25a.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(0);
  });
});

// ── Part III: Homebuyer limit boundaries ────────────────────────

describe("Form 8606 first-time homebuyer limit edge cases", () => {
  it("prior homebuyer distributions at exactly $10,000 leave zero remaining limit", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "15000",
      qualifiedFirstTimeHomebuyerExpenses: "8000",
      priorQualifiedFirstTimeHomebuyerDistributions: "10000",
      rothContributionBasis: "15000",
    });

    // Remaining limit = 10000 - 10000 = 0
    expect(result.line20.toNumber()).toBe(0);
    expect(result.line21.toNumber()).toBe(15000);
  });

  it("prior homebuyer distributions above $10,000 are clamped — remaining limit is still zero", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "10000",
      qualifiedFirstTimeHomebuyerExpenses: "5000",
      priorQualifiedFirstTimeHomebuyerDistributions: "15000",
      rothContributionBasis: "10000",
    });

    expect(result.line20.toNumber()).toBe(0);
  });

  it("homebuyer expenses are capped by Line 19 when Roth distribution is smaller than the remaining limit", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "3000",
      qualifiedFirstTimeHomebuyerExpenses: "10000",
      priorQualifiedFirstTimeHomebuyerDistributions: "0",
      rothContributionBasis: "3000",
    });

    // Line 20 = min(3000, min(3000, 10000)) = 3000
    expect(result.line20.toNumber()).toBe(3000);
    expect(result.line21.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(0);
  });
});

// ── Part III: Roth disaster and repayment boundaries ────────────

describe("Form 8606 Roth disaster distribution edge cases", () => {
  it("all Roth Line 21 distributions are qualified disaster — Line 25b equals Line 25a", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "8000",
      rothContributionBasis: "2000",
      rothConversionBasis: "1000",
      rothQualifiedDisasterDistributions: "8000",
    });

    // Line 21 = 8000
    // Line 25a = 8000 - 2000 - 1000 = 5000 (taxable)
    // All of Line 21 is disaster → Line 25b = Line 25a
    expect(result.line25a.toNumber()).toBe(5000);
    expect(result.line25b.toNumber()).toBe(5000);
    expect(result.line25c.toNumber()).toBe(0);
  });
});

describe("Form 8606 Line 25c Roth repayment edge cases", () => {
  it("Roth repayment exceeds taxable share — excess becomes next-year Line 22 basis adjustment", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "10000",
      rothContributionBasis: "6000",
      rothConversionBasis: "0",
      rothRepaymentEligibleDistributions: "10000",
      rothRepaymentsWithin3YearWindow: "8000",
      rothRepaymentDistributionExceptionNumber: "23",
    });

    // Line 21 = 10000
    // Line 22 = 6000, Line 23 = 4000
    // Line 25a = 4000 (taxable before repayment)
    // Eligible taxable share = 4000 * (10000/10000) = 4000
    // Repayment reduction = min(4000, min(4000, 8000)) = 4000
    // Line 25c = 4000 - 4000 = 0
    expect(result.line25a.toNumber()).toBe(4000);
    expect(result.line25c.toNumber()).toBe(0);
    // Basis adjustment = 8000 - 4000 = 4000 (carry to next year's Line 22)
    expect(result.line25cBasisAdjustment.toNumber()).toBe(4000);
    expect(result.line25cExceptionNumber).toBe("23");
  });

  it("Roth repayment when no distributions are eligible — no reduction even if repayment amount is provided", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "5000",
      rothContributionBasis: "0",
      rothConversionBasis: "0",
      rothRepaymentEligibleDistributions: "0",
      rothRepaymentsWithin3YearWindow: "3000",
    });

    // No eligible distributions means the Line 25c worksheet is not used.
    expect(result.line25a.toNumber()).toBe(5000);
    expect(result.line25cRepaymentEligibleTaxableShare.toNumber()).toBe(0);
    expect(result.line25cRepaymentReduction.toNumber()).toBe(0);
    expect(result.line25cBasisAdjustment.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(5000);
  });
});

// ── Part III: Line 19 exclusion competition ─────────────────────

describe("Form 8606 Line 19 Roth exclusion competition", () => {
  it("multiple Roth exclusions stack — qualified + rollover + returned + excess + HSA", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "20000",
      qualifiedRothDistributionsExcludedFromLine19: "5000",
      rothRolledOverDistributions: "3000",
      rothReturnedContributionsByDueDate: "2000",
      rothReturnedExcessContributions: "1000",
      rothQualifiedHsaFundingDistributions: "500",
      rothContributionBasis: "10000",
    });

    // Total exclusions = 5000 + 3000 + 2000 + 1000 + 500 = 11500
    // Line 19 = 20000 - 11500 = 8500
    expect(result.line19Exclusions.toNumber()).toBe(11500);
    expect(result.line19.toNumber()).toBe(8500);
    // Line 22 = 10000, Line 23 = 0 → no taxable
    expect(result.line25c.toNumber()).toBe(0);
  });

  it("Roth exclusions exceeding total distributions are clamped — Line 19 floors at zero", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "5000",
      qualifiedRothDistributionsExcludedFromLine19: "3000",
      rothRolledOverDistributions: "2000",
      rothReturnedContributionsByDueDate: "1000",
    });

    // Qualified = min(3000, 5000) = 3000; remaining = 2000
    // Rollover = min(2000, 2000) = 2000; remaining = 0
    // Returned = min(1000, 0) = 0
    expect(result.line19.toNumber()).toBe(0);
    expect(result.line25c.toNumber()).toBe(0);
  });
});

// ── Line 6: Outstanding rollovers and repayments ────────────────

describe("Form 8606 Line 6 denominator adjustments", () => {
  it("outstanding rollovers increase the denominator and reduce the nontaxable ratio", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "5000",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "20000",
      outstandingRollovers: "10000",
      traditionalDistributions: "5000",
      rothConversions: "0",
    });

    // Line 6 = 20000 + 10000 = 30000
    // Denominator = 30000 + 5000 = 35000
    // Ratio = 5000 / 35000 = 0.143
    expect(result.line6.toNumber()).toBe(30000);
    expect(result.line10.toNumber()).toBe(0.143);
  });

  it("same-year repayments treated as rollovers reduce Line 6 denominator", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "5000",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "50000",
      outstandingRollovers: "0",
      currentYearRepaymentsTreatedAsRollovers: "8000",
      traditionalDistributions: "10000",
      rothConversions: "0",
    });

    // Line 6 = max(0, 50000 + 0 - 8000) = 42000
    // Denominator = 42000 + 10000 = 52000
    // Ratio = 5000 / 52000 = 0.096
    expect(result.line6.toNumber()).toBe(42000);
    expect(result.line10.toNumber()).toBe(0.096);
  });

  it("repayments exceeding year-end value plus rollovers are clamped — Line 6 floors at zero", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "3000",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "5000",
      outstandingRollovers: "2000",
      currentYearRepaymentsTreatedAsRollovers: "20000",
      traditionalDistributions: "5000",
      rothConversions: "0",
    });

    // Repayment clamped to year-end + rollovers = 7000
    expect(result.currentYearRepaymentsTreatedAsRollovers.toNumber()).toBe(7000);
    // Line 6 = max(0, 5000 + 2000 - 7000) = 0
    expect(result.line6.toNumber()).toBe(0);
  });
});

// ── Combined Parts I + III: Both traditional and Roth in same year ──

describe("Form 8606 combined traditional and Roth distributions in same year", () => {
  it("both traditional distributions (Part I) and Roth distributions (Part III) calculate independently", () => {
    const result = calculateForm8606({
      nondeductibleContributions: "3000",
      priorYearBasis: "7000",
      contributionsMadeNextYear: "0",
      yearEndValue: "40000",
      traditionalDistributions: "10000",
      rothConversions: "0",
      rothDistributions: "8000",
      rothContributionBasis: "6000",
      rothConversionBasis: "0",
    });

    // Part I: ratio = 10000 / (40000 + 10000) = 0.200
    expect(result.line10.toNumber()).toBe(0.2);
    // Nontaxable traditional = 10000 * 0.2 = 2000
    expect(result.line12.toNumber()).toBe(2000);
    // Taxable traditional = 10000 - 2000 = 8000
    expect(result.line15c.toNumber()).toBe(8000);
    // Carryforward = 10000 - 2000 = 8000
    expect(result.line14.toNumber()).toBe(8000);

    // Part III (Roth):
    // Line 21 = 8000, Line 22 = 6000
    // Line 23 = 8000 - 6000 = 2000 (taxable earnings)
    expect(result.line23.toNumber()).toBe(2000);
    expect(result.line25a.toNumber()).toBe(2000);
    expect(result.line25c.toNumber()).toBe(2000);
  });
});

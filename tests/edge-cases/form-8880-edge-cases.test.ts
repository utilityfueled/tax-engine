/**
 * Edge case tests for Form 8880 saver's credit boundaries.
 * Spec: spec/federal/form-8880.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm8880 } from "@/engine/forms/form-8880.js";

describe("Form 8880 saver's credit edge cases", () => {
  it("treats a taxpayer who turns 18 on December 31 as eligible but keeps a younger taxpayer ineligible", () => {
    const eligibleAtYearEnd = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "2007-12-31",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const stillUnder18 = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "2008-01-01",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(eligibleAtYearEnd.line5a.toNumber()).toBe(2000);
    expect(eligibleAtYearEnd.line6a.toNumber()).toBe(2000);
    expect(eligibleAtYearEnd.line12.toNumber()).toBe(1000);
    expect(stillUnder18.line5a.toNumber()).toBe(2000);
    expect(stillUnder18.line6a.toNumber()).toBe(0);
    expect(stillUnder18.line12.toNumber()).toBe(0);
  });

  it("floors the eligible contribution amount at zero when recent distributions exceed current-year contributions", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-04-15",
      primaryElectiveDeferrals: "1000",
      primaryRecentDistributions: "1400",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line3a.toNumber()).toBe(1000);
    expect(result.line4a.toNumber()).toBe(1400);
    expect(result.line5a.toNumber()).toBe(0);
    expect(result.line6a.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
  });

  it("keeps the spouse column at zero when the spouse is a full-time student even if the primary taxpayer is eligible", () => {
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "45000",
      taxYear: 2025,
      primaryDateOfBirth: "1988-06-10",
      spouseDateOfBirth: "2000-09-15",
      primaryElectiveDeferrals: "2200",
      spouseElectiveDeferrals: "2200",
      spouseIsFullTimeStudent: true,
      taxLiabilityBeforeCredit: "1500",
      priorNonrefundableCredits: "0",
    });

    expect(result.line5a.toNumber()).toBe(2200);
    expect(result.line6a.toNumber()).toBe(2000);
    expect(result.line5b.toNumber()).toBe(2200);
    expect(result.line6b.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line7.toNumber()).toBe(2000);
    expect(result.line12.toNumber()).toBe(1000);
  });

  it("uses the single-filer threshold table for both married filing separately and qualifying surviving spouse, including the first dollar over each breakpoint", () => {
    const mfsAt50PercentCeiling = calculateForm8880({
      filingStatus: "married_filing_separately",
      agi: "23750",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const mfsOneDollarOver = calculateForm8880({
      filingStatus: "married_filing_separately",
      agi: "23751",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const qssAt10PercentCeiling = calculateForm8880({
      filingStatus: "qualifying_surviving_spouse",
      agi: "39500",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const qssOneDollarOver = calculateForm8880({
      filingStatus: "qualifying_surviving_spouse",
      agi: "39501",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(mfsAt50PercentCeiling.line9.toNumber()).toBe(0.5);
    expect(mfsOneDollarOver.line9.toNumber()).toBe(0.2);
    expect(qssAt10PercentCeiling.line9.toNumber()).toBe(0.1);
    expect(qssOneDollarOver.line9.toNumber()).toBe(0);
  });

  it("steps head-of-household filers through the distinct 2025 threshold table at each breakpoint", () => {
    const hohAt50PercentCeiling = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "35625",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const hohOneDollarOver50Percent = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "35626",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const hohAt20PercentCeiling = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "38250",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const hohOneDollarOver20Percent = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "38251",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const hohAt10PercentCeiling = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "59250",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const hohOneDollarOver10Percent = calculateForm8880({
      filingStatus: "head_of_household",
      agi: "59251",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(hohAt50PercentCeiling.line9.toNumber()).toBe(0.5);
    expect(hohOneDollarOver50Percent.line9.toNumber()).toBe(0.2);
    expect(hohAt20PercentCeiling.line9.toNumber()).toBe(0.2);
    expect(hohOneDollarOver20Percent.line9.toNumber()).toBe(0.1);
    expect(hohAt10PercentCeiling.line9.toNumber()).toBe(0.1);
    expect(hohOneDollarOver10Percent.line9.toNumber()).toBe(0);
  });

  it("steps married filing jointly filers through the 2025 threshold table before the zero-credit cutoff", () => {
    const mfjAt50PercentCeiling = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "47500",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const mfjOneDollarOver50Percent = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "47501",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const mfjAt20PercentCeiling = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "51000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });
    const mfjOneDollarOver20Percent = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "51001",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(mfjAt50PercentCeiling.line9.toNumber()).toBe(0.5);
    expect(mfjOneDollarOver50Percent.line9.toNumber()).toBe(0.2);
    expect(mfjAt20PercentCeiling.line9.toNumber()).toBe(0.2);
    expect(mfjOneDollarOver20Percent.line9.toNumber()).toBe(0.1);
  });

  it("steps married filing jointly through the 10% → 0% boundary at $79,000/$79,001", () => {
    const mfjAt10PercentCeiling = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "79000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "5000",
      priorNonrefundableCredits: "0",
    });
    const mfjOneDollarOver10Percent = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "79001",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-01-15",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "5000",
      priorNonrefundableCredits: "0",
    });

    expect(mfjAt10PercentCeiling.line9.toNumber()).toBe(0.1);
    // Both spouses max eligible ($2K each) → line 7 = $4,000
    expect(mfjAt10PercentCeiling.line7.toNumber()).toBe(4000);
    // $4,000 × 10% = $400 tentative, limited by $5,000 liability → $400
    expect(mfjAt10PercentCeiling.line12.toNumber()).toBe(400);

    expect(mfjOneDollarOver10Percent.line9.toNumber()).toBe(0);
    expect(mfjOneDollarOver10Percent.line12.toNumber()).toBe(0);
  });

  it("steps single filers through all 2025 threshold boundaries ($23,750/$25,500/$39,500)", () => {
    const singleAt50Ceiling = calculateForm8880({
      filingStatus: "single",
      agi: "23750",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const singleOver50 = calculateForm8880({
      filingStatus: "single",
      agi: "23751",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const singleAt20Ceiling = calculateForm8880({
      filingStatus: "single",
      agi: "25500",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const singleOver20 = calculateForm8880({
      filingStatus: "single",
      agi: "25501",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const singleAt10Ceiling = calculateForm8880({
      filingStatus: "single",
      agi: "39500",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const singleOver10 = calculateForm8880({
      filingStatus: "single",
      agi: "39501",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    expect(singleAt50Ceiling.line9.toNumber()).toBe(0.5);
    expect(singleAt50Ceiling.line12.toNumber()).toBe(1000); // $2K × 50% = $1,000
    expect(singleOver50.line9.toNumber()).toBe(0.2);
    expect(singleOver50.line12.toNumber()).toBe(400); // $2K × 20% = $400
    expect(singleAt20Ceiling.line9.toNumber()).toBe(0.2);
    expect(singleOver20.line9.toNumber()).toBe(0.1);
    expect(singleOver20.line12.toNumber()).toBe(200); // $2K × 10% = $200
    expect(singleAt10Ceiling.line9.toNumber()).toBe(0.1);
    expect(singleOver10.line9.toNumber()).toBe(0);
    expect(singleOver10.line12.toNumber()).toBe(0);
  });

  it("Form 8880 Line 12 - tax liability limitation caps credit below tentative amount", () => {
    // Single at 50%, $2K eligible → tentative $1,000, but only $300 tax remaining
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "800",
      priorNonrefundableCredits: "500",
    });

    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line10.toNumber()).toBe(1000); // tentative: $2K × 50%
    expect(result.line11.toNumber()).toBe(300); // liability limit: $800 - $500
    expect(result.line12.toNumber()).toBe(300); // min($1,000, $300)
  });

  it("Form 8880 Line 11 - prior nonrefundable credits exceeding tax liability floor limitation at zero", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "1500",
    });

    expect(result.line10.toNumber()).toBe(1000); // tentative: $2K × 50%
    expect(result.line11.toNumber()).toBe(0); // max(0, $1K - $1.5K) = $0
    expect(result.line12.toNumber()).toBe(0); // min($1,000, $0)
  });

  it("Form 8880 Line 7 - MFJ both spouses max eligible yields $4,000 contribution base", () => {
    // Both contribute $3K each, capped to $2K each → $4K total
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "40000",
      taxYear: 2025,
      primaryDateOfBirth: "1985-03-15",
      spouseDateOfBirth: "1987-07-20",
      primaryElectiveDeferrals: "3000",
      spouseElectiveDeferrals: "3000",
      taxLiabilityBeforeCredit: "5000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line6a.toNumber()).toBe(2000);
    expect(result.line6b.toNumber()).toBe(2000);
    expect(result.line7.toNumber()).toBe(4000);
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line10.toNumber()).toBe(2000); // $4K × 50%
    expect(result.line12.toNumber()).toBe(2000); // limited by $5K tax
  });

  it("Form 8880 Line 6 - $2,000 cap applies per person even with contributions above $2,000", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "5000",
      primaryIraContributions: "6000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line3a.toNumber()).toBe(11000); // $5K + $6K
    expect(result.line5a.toNumber()).toBe(11000);
    expect(result.line6a.toNumber()).toBe(2000); // capped at $2K
    expect(result.line7.toNumber()).toBe(2000);
  });

  it("Form 8880 - dependent taxpayer gets zero credit regardless of contributions and income", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "15000",
      taxYear: 2025,
      primaryDateOfBirth: "2000-06-15",
      primaryElectiveDeferrals: "2000",
      primaryCanBeClaimedAsDependent: true,
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line5a.toNumber()).toBe(2000);
    expect(result.line6a.toNumber()).toBe(0); // ineligible: dependent
    expect(result.line12.toNumber()).toBe(0);
  });

  it("Form 8880 - IRA + ABLE + elective deferrals all combine on Line 3", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryIraContributions: "500",
      primaryAbleContributions: "300",
      primaryElectiveDeferrals: "1000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line1a.toNumber()).toBe(800); // $500 IRA + $300 ABLE
    expect(result.line2a.toNumber()).toBe(1000); // elective deferrals
    expect(result.line3a.toNumber()).toBe(1800); // combined
    expect(result.line6a.toNumber()).toBe(1800); // under $2K cap
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line10.toNumber()).toBe(900); // $1,800 × 50%
    expect(result.line12.toNumber()).toBe(900);
  });

  it("Form 8880 Line 9 - zero AGI single filer gets 50% rate", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "0",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line8.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line6a.toNumber()).toBe(2000);
    expect(result.line10.toNumber()).toBe(1000); // $2K × 50%
    expect(result.line12.toNumber()).toBe(1000);
  });

  it("Form 8880 - negative AGI treated as zero (floors to $0 on Line 8)", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "-5000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line8.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line12.toNumber()).toBe(1000);
  });

  it("Form 8880 - MFJ both spouses with partial distributions reduce eligible contributions independently", () => {
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "40000",
      taxYear: 2025,
      primaryDateOfBirth: "1985-03-15",
      spouseDateOfBirth: "1987-07-20",
      primaryElectiveDeferrals: "3000",
      primaryRecentDistributions: "1500",
      spouseElectiveDeferrals: "2500",
      spouseRecentDistributions: "800",
      taxLiabilityBeforeCredit: "5000",
      priorNonrefundableCredits: "0",
    });

    // Primary: $3,000 - $1,500 = $1,500 → min($2K, $1,500) = $1,500
    expect(result.line5a.toNumber()).toBe(1500);
    expect(result.line6a.toNumber()).toBe(1500);
    // Spouse: $2,500 - $800 = $1,700 → min($2K, $1,700) = $1,700
    expect(result.line5b.toNumber()).toBe(1700);
    expect(result.line6b.toNumber()).toBe(1700);
    // Total: $1,500 + $1,700 = $3,200
    expect(result.line7.toNumber()).toBe(3200);
    expect(result.line9.toNumber()).toBe(0.5);
    // $3,200 × 50% = $1,600
    expect(result.line10.toNumber()).toBe(1600);
    expect(result.line12.toNumber()).toBe(1600);
  });

  it("Form 8880 - MFJ where only one spouse contributes and other has zero", () => {
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "40000",
      taxYear: 2025,
      primaryDateOfBirth: "1985-03-15",
      spouseDateOfBirth: "1987-07-20",
      primaryElectiveDeferrals: "4000",
      spouseElectiveDeferrals: "0",
      taxLiabilityBeforeCredit: "5000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line6a.toNumber()).toBe(2000); // capped at $2K
    expect(result.line6b.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(2000);
    expect(result.line9.toNumber()).toBe(0.5);
    expect(result.line10.toNumber()).toBe(1000); // $2K × 50%
    expect(result.line12.toNumber()).toBe(1000);
  });

  it("Form 8880 Line 12 - tax liability exactly equals tentative credit (no limitation)", () => {
    // Single at 50%, $2K eligible → tentative $1,000; tax liability = exactly $1,000
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line10.toNumber()).toBe(1000);
    expect(result.line11.toNumber()).toBe(1000);
    expect(result.line12.toNumber()).toBe(1000); // min($1K, $1K) = $1K — no limitation
  });

  it("Form 8880 Line 11 - prior nonrefundable credits exactly equal to tax liability yields zero credit", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "2000",
    });

    expect(result.line10.toNumber()).toBe(1000); // tentative: $2K × 50%
    expect(result.line11.toNumber()).toBe(0); // max(0, $2K - $2K) = $0
    expect(result.line12.toNumber()).toBe(0); // min($1K, $0) = $0
  });

  it("Form 8880 - contributions exactly at $2,000 cap with no excess", () => {
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    expect(result.line5a.toNumber()).toBe(2000);
    expect(result.line6a.toNumber()).toBe(2000); // exactly at cap, not above
    expect(result.line7.toNumber()).toBe(2000);
  });

  it("Form 8880 - AGI exactly at single 50% threshold ($23,750) yields 50%", () => {
    const atBoundary = calculateForm8880({
      filingStatus: "single",
      agi: "23750",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });
    const oneDollarBelow = calculateForm8880({
      filingStatus: "single",
      agi: "23749",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    // Both at or below $23,750 → 50%
    expect(atBoundary.line9.toNumber()).toBe(0.5);
    expect(oneDollarBelow.line9.toNumber()).toBe(0.5);
    // Verify credit: $2K × 50% = $1,000
    expect(atBoundary.line12.toNumber()).toBe(1000);
    expect(oneDollarBelow.line12.toNumber()).toBe(1000);
  });
});

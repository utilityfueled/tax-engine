/**
 * Tests for core tax math functions.
 * Each test references a spec line from spec/federal/*.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateTaxFromBrackets,
  calculateCapitalGainsTax,
  calculateSelfEmploymentTax,
  calculateNIIT,
  calculateAdditionalMedicareTax,
  calculateChildTaxCredit,
  calculateDeductibleMortgageInterest,
  calculateSALTDeduction,
} from "@/utils/tax-math.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const constants = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Progressive Tax Brackets
// Spec: Form 1040 Line 16
// ═══════════════════════════════════════════════════════════

describe("Progressive tax brackets", () => {
  it("Form 1040 Line 16 - zero taxable income produces zero tax", () => {
    const tax = calculateTaxFromBrackets(d(0), constants.taxBrackets.single);
    expect(tax.toNumber()).toBe(0);
  });

  it("Form 1040 Line 16 - income in first bracket only (single)", () => {
    // $10,000 at 10% = $1,000
    const tax = calculateTaxFromBrackets(d(10000), constants.taxBrackets.single);
    expect(tax.toNumber()).toBe(1000);
  });

  it("Form 1040 Line 16 - income spanning two brackets (single)", () => {
    // $30,000: first $11,925 at 10% = $1,192.50, next $18,075 at 12% = $2,169
    // Total = $3,361.50 → rounds to $3,362
    const tax = calculateTaxFromBrackets(d(30000), constants.taxBrackets.single);
    expect(tax.toNumber()).toBe(3362);
  });

  it("Form 1040 Line 16 - income in highest bracket (single)", () => {
    const tax = calculateTaxFromBrackets(d(1000000), constants.taxBrackets.single);
    expect(tax.greaterThan(0)).toBe(true);
    // Should be substantial for $1M income
    expect(tax.greaterThan(d(250000))).toBe(true);
  });

  it("Form 1040 Line 16 - MFJ brackets wider than single", () => {
    const income = d(100000);
    const singleTax = calculateTaxFromBrackets(income, constants.taxBrackets.single);
    const mfjTax = calculateTaxFromBrackets(income, constants.taxBrackets.married_filing_jointly);
    // MFJ should have lower tax due to wider brackets
    expect(mfjTax.lessThan(singleTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Gains Tax (QDCG Worksheet)
// Spec: spec/federal/qdcg-worksheet.yaml
// ═══════════════════════════════════════════════════════════

describe("Capital gains tax - stacking method", () => {
  it("QDCG worksheet - no preferential income uses ordinary rates only", () => {
    const result = calculateCapitalGainsTax(d(100000), d(0), d(0), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.greaterThan(0)).toBe(true);
    expect(result.tax.equals(result.ordinaryTax)).toBe(true);
  });

  it("QDCG worksheet - qualified dividends in 0% bracket", () => {
    // Single: 0% threshold is $48,350
    // $30,000 ordinary + $10,000 qualified dividends = $40,000 total
    // All preferential income stays in 0% bracket
    const result = calculateCapitalGainsTax(d(40000), d(10000), d(0), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - LTCG spanning 15% bracket", () => {
    // MFJ with $200,000 taxable income, $50,000 LTCG
    const result = calculateCapitalGainsTax(d(200000), d(0), d(50000), "married_filing_jointly", constants);
    expect(result.preferentialTax.greaterThan(0)).toBe(true);
    // Should be 15% of some portion
    expect(result.preferentialTax.lessThanOrEqualTo(d(50000 * 0.15))).toBe(true);
  });

  it("QDCG worksheet - high income hits 20% rate", () => {
    // Single: 15% threshold is $533,400
    // $700,000 taxable, $200,000 LTCG
    const result = calculateCapitalGainsTax(d(700000), d(0), d(200000), "single", constants);
    // Some portion should be at 20%
    expect(result.preferentialTax.greaterThan(d(200000 * 0.15))).toBe(true);
  });

  it("QDCG worksheet - combined preferential tax lower than ordinary", () => {
    const taxableIncome = d(300000);
    const ltcg = d(100000);
    const result = calculateCapitalGainsTax(taxableIncome, d(0), ltcg, "married_filing_jointly", constants);
    const allOrdinary = calculateTaxFromBrackets(taxableIncome, constants.taxBrackets.married_filing_jointly);
    expect(result.tax.lessThan(allOrdinary)).toBe(true);
  });

  it("QDCG worksheet - §1250 within 15% bracket gets 15% rate (not 25%)", () => {
    // $150K taxable, $20K LTCG of which $10K is §1250 (depreciation recapture)
    // Per IRS Schedule D Tax Worksheet: ALL gains stack for 0%/15% first.
    // 25% is a MAXIMUM rate — gains within 15% bracket get 15%.
    // Ordinary portion = $130K. Stack $20K on $130K.
    // $130K < $533,400 (15% threshold) → room = $403K → all $20K at 15%
    // preferentialTax = $20K × 15% = $3,000
    const result = calculateCapitalGainsTax(d(150000), d(0), d(20000), "single", constants, {
      section1250Gain: d(10000),
    });
    const withoutSection1250 = calculateCapitalGainsTax(d(150000), d(0), d(20000), "single", constants);
    // Same tax: §1250 within 15% bracket gets 15%, same as regular LTCG
    expect(result.preferentialTax.toNumber()).toBe(3000);
    expect(result.preferentialTax.toNumber()).toBe(withoutSection1250.preferentialTax.toNumber());
  });

  it("QDCG worksheet - §1250 above 15% threshold gets 25% rate", () => {
    // Single, $600K taxable, $100K LTCG ($30K §1250)
    // Ordinary = $500K. Stack $100K on $500K.
    // 15% threshold = $533,400. Room at 15% = $33,400 → at15 = $33,400.
    // Remaining = $66,600. §1250 = min($30K, $66,600) = $30K at 25%.
    // 20% = $36,600. preferentialTax = $5,010 + $7,500 + $7,320 = $19,830
    const result = calculateCapitalGainsTax(d(600000), d(0), d(100000), "single", constants, {
      section1250Gain: d(30000),
    });
    expect(result.preferentialTax.toNumber()).toBe(19830);
  });

  it("QDCG worksheet - collectibles within 15% bracket gets 15% rate (not 28%)", () => {
    // $150K taxable, $15K LTCG of which $5K is collectibles
    // All gains in 15% bracket → collectibles get 15%, not 28%
    // preferentialTax = $15K × 15% = $2,250
    const result = calculateCapitalGainsTax(d(150000), d(0), d(15000), "single", constants, {
      collectiblesGain: d(5000),
    });
    expect(result.preferentialTax.toNumber()).toBe(2250);
  });

  it("QDCG worksheet - collectibles above 15% threshold gets 28% rate", () => {
    // Single, $600K taxable, $100K LTCG ($20K collectibles)
    // Ordinary = $500K. Room at 15% = $33,400. Remaining = $66,600.
    // 28% (collectibles) = $20K. 20% = $46,600.
    // preferentialTax = $5,010 + $5,600 + $9,320 = $19,930
    const result = calculateCapitalGainsTax(d(600000), d(0), d(100000), "single", constants, {
      collectiblesGain: d(20000),
    });
    expect(result.preferentialTax.toNumber()).toBe(19930);
  });

  it("QDCG worksheet - combined §1250 + collectibles within 15% bracket", () => {
    // $200K taxable, $30K LTCG: $8K §1250, $5K collectibles, $17K regular
    // All gains in 15% bracket → all at 15%
    // preferentialTax = $30K × 15% = $4,500
    const result = calculateCapitalGainsTax(d(200000), d(0), d(30000), "single", constants, {
      section1250Gain: d(8000),
      collectiblesGain: d(5000),
    });
    expect(result.preferentialTax.toNumber()).toBe(4500);
  });

  it("QDCG worksheet - special gains capped at remaining above 15% threshold", () => {
    // $200K taxable, $5K LTCG, §1250 $10K, collectibles $3K (exceed LTCG)
    // All gains in 15% bracket → all at 15%
    // preferentialTax = $5K × 15% = $750
    const result = calculateCapitalGainsTax(d(200000), d(0), d(5000), "single", constants, {
      section1250Gain: d(10000),
      collectiblesGain: d(3000),
    });
    expect(result.preferentialTax.toNumber()).toBe(750);
  });

  it("QDCG worksheet - zero ordinary income, all LTCG in 0% bracket", () => {
    // Single: 0% threshold $48,350
    // $40K total taxable, all from LTCG → all in 0% bracket
    const result = calculateCapitalGainsTax(d(40000), d(0), d(40000), "single", constants);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - MFS half thresholds", () => {
    // MFS 0% threshold is $48,350 (same as single), 15% threshold $300,025
    const result = calculateCapitalGainsTax(d(400000), d(0), d(100000), "married_filing_separately", constants);
    // Ordinary portion: $300K, stacked up to $300K
    // $100K LTCG starts at $300K stack position
    // First $25 at 0% (unlikely given $300K ordinary), rest at 15%/20%
    expect(result.preferentialTax.greaterThan(0)).toBe(true);
  });

  it("QDCG worksheet - HoH thresholds differ from single", () => {
    // HoH 0% threshold is $64,750
    // $50K ordinary + $20K LTCG = $70K total
    const result = calculateCapitalGainsTax(d(70000), d(0), d(20000), "head_of_household", constants);
    // Stack base: $50K ordinary. Room at 0%: $64,750 - $50K = $14,750
    // $14,750 of LTCG at 0%, remaining $5,250 at 15% = $787.50 → rounds to $788
    expect(result.preferentialTax.toNumber()).toBe(788);
  });

  it("QDCG worksheet - QSS uses MFJ thresholds", () => {
    // QSS uses same thresholds as MFJ: 0% up to $96,700
    const result = calculateCapitalGainsTax(d(50000), d(0), d(30000), "qualifying_surviving_spouse", constants);
    // Stack base: $20K ordinary. Room at 0%: $96,700 - $20K = $76,700
    // All $30K LTCG fits in 0% bracket
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - §1250 in 0% bracket produces zero preferential tax", () => {
    // Single, $30K taxable, $10K LTCG all from §1250
    // Per IRS: stack $10K on $20K ordinary → room at 0% = $28,350 → all at 0%
    // ordinaryTax($20K) = $2,162, preferentialTax = $0
    // Total = $2,162 (QDCG method is better than all-ordinary $3,362)
    const result = calculateCapitalGainsTax(d(30000), d(0), d(10000), "single", constants, {
      section1250Gain: d(10000),
    });
    expect(result.tax.toNumber()).toBe(2162);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - collectibles in 0% bracket produces zero preferential tax", () => {
    // Single, $30K taxable, $10K LTCG all from collectibles
    // Per IRS: stack $10K on $20K → all at 0%
    // ordinaryTax($20K) = $2,162, preferentialTax = $0 → total = $2,162
    const result = calculateCapitalGainsTax(d(30000), d(0), d(10000), "single", constants, {
      collectiblesGain: d(10000),
    });
    expect(result.tax.toNumber()).toBe(2162);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - lesser-of check not triggered when QDCG method is beneficial", () => {
    // Single, $200K taxable, $20K LTCG with $10K §1250
    // QDCG method produces lower tax than ordinary → no lesser-of trigger
    const result = calculateCapitalGainsTax(d(200000), d(0), d(20000), "single", constants, {
      section1250Gain: d(10000),
    });
    const allOrdinary = calculateTaxFromBrackets(d(200000), constants.taxBrackets.single);
    expect(result.tax.lessThan(allOrdinary)).toBe(true);
    // preferentialTax should be positive (QDCG was beneficial)
    expect(result.preferentialTax.greaterThan(0)).toBe(true);
  });

  it("QDCG worksheet - §1250 entirely in 0% bracket (all LTCG, no ordinary)", () => {
    // Single, $20K taxable from $20K LTCG (all §1250), no ordinary income
    // Stack $20K on $0 → 0% threshold = $48,350 → all at 0%
    // ordinaryTax = $0, preferentialTax = $0 → total = $0
    const result = calculateCapitalGainsTax(d(20000), d(0), d(20000), "single", constants, {
      section1250Gain: d(20000),
    });
    expect(result.tax.toNumber()).toBe(0);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - §1250 spanning 15% threshold (partial 15%, partial 25%)", () => {
    // Single, $600K taxable, $100K LTCG ($80K §1250, $20K regular)
    // Ordinary = $500K. Stack $100K on $500K.
    // Room at 15% = $533,400 - $500K = $33,400 → at15 = $33,400
    // Remaining = $66,600. §1250 = min($80K, $66,600) = $66,600 at 25%.
    // 20% remainder = $0. preferentialTax = $5,010 + $16,650 = $21,660
    const result = calculateCapitalGainsTax(d(600000), d(0), d(100000), "single", constants, {
      section1250Gain: d(80000),
    });
    expect(result.preferentialTax.toNumber()).toBe(21660);
  });

  it("QDCG worksheet - mixed §1250 + collectibles above 15% threshold", () => {
    // Single, $600K taxable, $100K LTCG ($30K §1250, $10K collectibles, $60K regular)
    // Ordinary = $500K. Room at 15% = $33,400.
    // Remaining = $66,600: collectibles $10K (28%), §1250 $30K (25%), regular $26,600 (20%)
    // Tax = $5,010 + $2,800 + $7,500 + $5,320 = $20,630
    const result = calculateCapitalGainsTax(d(600000), d(0), d(100000), "single", constants, {
      section1250Gain: d(30000),
      collectiblesGain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(20630);
  });

  it("QDCG worksheet - negative LTCG produces zero preferential tax", () => {
    // Net LTCG is negative (capital loss) — no preferential income
    const result = calculateCapitalGainsTax(d(100000), d(0), d(-5000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - preferential income capped at taxable income (Line 10)", () => {
    // Single, $40K taxable, $50K qualified dividends — deductions consumed $10K of preferential
    // Effective preferential = min($50K, $40K) = $40K (QDCG Worksheet Line 10)
    // $40K < 0% threshold ($48,350) → ALL at 0% rate → tax = $0
    // Bug: without cap, code stacks full $50K → $48,350 at 0% + $1,650 at 15% = $248
    const result = calculateCapitalGainsTax(d(40000), d(50000), d(0), "single", constants);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - preferential exceeds taxable, partial 15% rate", () => {
    // Single, $50K taxable, $60K qual divs + $20K LTCG = $80K preferential
    // Effective preferential = min($80K, $50K) = $50K
    // Ordinary portion = $0, stack from $0
    // 0%: $48,350 at 0%, remaining $1,650
    // 15%: $1,650 × 15% = $247.50 → $248
    const result = calculateCapitalGainsTax(d(50000), d(60000), d(20000), "single", constants);
    expect(result.tax.toNumber()).toBe(248);
    expect(result.preferentialTax.toNumber()).toBe(248);
    expect(result.ordinaryTax.toNumber()).toBe(0);
  });

  it("QDCG worksheet - preferential exceeds taxable with §1250 gain", () => {
    // Single, $50K taxable, $20K qual divs, $40K LTCG ($10K §1250)
    // Preferential = $60K > $50K taxable → effective = $50K
    // Per IRS: stack ALL $50K on $0 ordinary base
    // 0% threshold = $48,350 → at0 = $48,350
    // Remaining = $1,650 → at15 → 15% tax = $248
    // No remaining above 15% → no 25% tax on §1250
    // Total tax = $0 + $248 = $248
    const result = calculateCapitalGainsTax(d(50000), d(20000), d(40000), "single", constants, {
      section1250Gain: d(10000),
    });
    expect(result.tax.toNumber()).toBe(248);
  });

  it("QDCG worksheet - MFJ all dividends below 0% threshold", () => {
    // MFJ, $90K taxable, $120K qual divs → effective = $90K
    // MFJ 0% threshold = $96,700. $90K < $96,700 → all at 0%
    const result = calculateCapitalGainsTax(d(90000), d(120000), d(0), "married_filing_jointly", constants);
    expect(result.tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Self-Employment Tax
// Spec: spec/federal/schedule-se.yaml
// ═══════════════════════════════════════════════════════════

describe("Self-employment tax", () => {
  it("SE tax - earnings multiplier applies 92.35%", () => {
    const result = calculateSelfEmploymentTax(d(100000), d(0), constants);
    // SE taxable = 100000 * 0.9235 = 92350
    // SS: 92350 * 0.124 = 11451.40
    // Medicare: 92350 * 0.029 = 2678.15
    expect(result.tax.greaterThan(0)).toBe(true);
  });

  it("SE tax - social security capped at wage base", () => {
    // W-2 wages of $160,000 + SE earnings
    // SS wage base is $176,100 — only $16,100 room for SS
    const result = calculateSelfEmploymentTax(d(50000), d(160000), constants);
    const ssRoom = d(176100).minus(d(160000));
    const expectedSS = ssRoom.times(d(0.124));
    expect(result.socialSecurityPortion.lessThanOrEqualTo(expectedSS.plus(1))).toBe(true);
  });

  it("SE tax - W-2 wages exceed wage base means zero SS portion", () => {
    const result = calculateSelfEmploymentTax(d(50000), d(200000), constants);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
  });

  it("SE tax - medicare no cap", () => {
    const result = calculateSelfEmploymentTax(d(500000), d(0), constants);
    const expectedMedicare = d(500000).times(d(0.9235)).times(d(0.029));
    // Should be close to expected (rounded)
    expect(result.medicarePortion.minus(expectedMedicare).abs().lessThan(1)).toBe(true);
  });

  it("SE tax - deductible half", () => {
    const result = calculateSelfEmploymentTax(d(100000), d(0), constants);
    const expectedHalf = result.tax.times(d(0.5));
    expect(result.deductibleHalf.minus(expectedHalf).abs().lessThan(1)).toBe(true);
  });

  it("SE tax - zero earnings produces zero tax", () => {
    const result = calculateSelfEmploymentTax(d(0), d(0), constants);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("SE tax - negative earnings produces zero tax", () => {
    const result = calculateSelfEmploymentTax(d(-5000), d(0), constants);
    expect(result.tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Investment Income Tax (NIIT)
// Spec: spec/federal/form-8960.yaml
// ═══════════════════════════════════════════════════════════

describe("Net Investment Income Tax", () => {
  it("NIIT - below threshold produces zero tax", () => {
    const tax = calculateNIIT(d(50000), d(180000), "single", constants);
    expect(tax.toNumber()).toBe(0);
  });

  it("NIIT - MAGI above threshold taxes lesser of NII or excess", () => {
    // Single threshold: $200,000
    // MAGI: $250,000, NII: $30,000
    // Excess: $50,000. Lesser of NII($30,000) and excess($50,000) = $30,000
    // Tax: $30,000 × 3.8% = $1,140
    const tax = calculateNIIT(d(30000), d(250000), "single", constants);
    expect(tax.toNumber()).toBe(1140);
  });

  it("NIIT - excess less than NII uses excess", () => {
    // MAGI: $220,000, NII: $100,000
    // Excess: $20,000. Tax: $20,000 × 3.8% = $760
    const tax = calculateNIIT(d(100000), d(220000), "single", constants);
    expect(tax.toNumber()).toBe(760);
  });

  it("NIIT - MFJ threshold is $250,000", () => {
    const tax = calculateNIIT(d(50000), d(240000), "married_filing_jointly", constants);
    expect(tax.toNumber()).toBe(0);
  });

  it("NIIT - zero NII produces zero tax regardless of MAGI", () => {
    const tax = calculateNIIT(d(0), d(500000), "single", constants);
    expect(tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Medicare Tax
// Spec: spec/federal/form-8959.yaml
// ═══════════════════════════════════════════════════════════

describe("Additional Medicare Tax", () => {
  it("Additional Medicare Tax - below threshold produces zero", () => {
    const tax = calculateAdditionalMedicareTax(d(180000), d(0), "single", constants);
    expect(tax.toNumber()).toBe(0);
  });

  it("Additional Medicare Tax - calculation on excess", () => {
    // Single threshold: $200,000. Wages: $250,000. Excess: $50,000
    // Tax: $50,000 × 0.9% = $450
    const tax = calculateAdditionalMedicareTax(d(250000), d(0), "single", constants);
    expect(tax.toNumber()).toBe(450);
  });

  it("Additional Medicare Tax - includes SE earnings", () => {
    // Wages: $180,000 + SE: $40,000 = $220,000. Excess: $20,000
    // Tax: $20,000 × 0.9% = $180
    const tax = calculateAdditionalMedicareTax(d(180000), d(40000), "single", constants);
    expect(tax.toNumber()).toBe(180);
  });

  it("Additional Medicare Tax - MFJ threshold is $250,000", () => {
    const tax = calculateAdditionalMedicareTax(d(240000), d(0), "married_filing_jointly", constants);
    expect(tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Child Tax Credit
// Spec: Form 1040 Line 19
// ═══════════════════════════════════════════════════════════

describe("Child Tax Credit", () => {
  it("CTC - $2,000 per qualifying child", () => {
    const result = calculateChildTaxCredit(2, 0, d(100000), "married_filing_jointly", constants);
    expect(result.total.toNumber()).toBe(4000);
    expect(result.ctc.toNumber()).toBe(4000);
    expect(result.odc.toNumber()).toBe(0);
  });

  it("CTC - phase-out above threshold", () => {
    // MFJ threshold: $400,000. AGI: $420,000. Excess: $20,000
    // Reduction: ceil(20) × $50 = $1,000
    // Credit: $2,000 - $1,000 = $1,000
    const result = calculateChildTaxCredit(1, 0, d(420000), "married_filing_jointly", constants);
    expect(result.total.toNumber()).toBe(1000);
  });

  it("CTC - fully phased out at high AGI", () => {
    // 1 child: $2,000 credit. Phased out at $40,000 over threshold
    // Reduction: 40 × $50 = $2,000. Credit: $0
    const result = calculateChildTaxCredit(1, 0, d(440000), "married_filing_jointly", constants);
    expect(result.total.toNumber()).toBe(0);
  });

  it("CTC - zero children means zero credit", () => {
    const result = calculateChildTaxCredit(0, 0, d(50000), "single", constants);
    expect(result.total.toNumber()).toBe(0);
  });

  it("CTC - single filer threshold is $200,000", () => {
    const result = calculateChildTaxCredit(1, 0, d(190000), "single", constants);
    expect(result.total.toNumber()).toBe(2000);

    const reduced = calculateChildTaxCredit(1, 0, d(220000), "single", constants);
    expect(reduced.total.lessThan(d(2000))).toBe(true);
  });

  it("ODC - $500 per other dependent", () => {
    const result = calculateChildTaxCredit(0, 2, d(100000), "single", constants);
    expect(result.ctc.toNumber()).toBe(0);
    expect(result.odc.toNumber()).toBe(1000);
    expect(result.total.toNumber()).toBe(1000);
  });

  it("CTC + ODC combined", () => {
    // 2 CTC children ($4K) + 1 ODC dependent ($500) = $4,500
    const result = calculateChildTaxCredit(2, 1, d(100000), "married_filing_jointly", constants);
    expect(result.ctc.toNumber()).toBe(4000);
    expect(result.odc.toNumber()).toBe(500);
    expect(result.total.toNumber()).toBe(4500);
  });

  it("ODC - phase-out reduces CTC first then ODC", () => {
    // 1 CTC child ($2K) + 1 ODC ($500) = $2,500 max
    // AGI $430K, MFJ threshold $400K, excess $30K → reduction 30 × $50 = $1,500
    // CTC: $2K - $1,500 = $500. ODC: $500 (untouched)
    const result = calculateChildTaxCredit(1, 1, d(430000), "married_filing_jointly", constants);
    expect(result.ctc.toNumber()).toBe(500);
    expect(result.odc.toNumber()).toBe(500);
    expect(result.total.toNumber()).toBe(1000);
  });

  it("ODC - fully phased out at very high AGI", () => {
    // 1 CTC child ($2K) + 1 ODC ($500) = $2,500 max
    // AGI $450K, excess $50K → reduction 50 × $50 = $2,500
    const result = calculateChildTaxCredit(1, 1, d(450000), "married_filing_jointly", constants);
    expect(result.total.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mortgage Interest Deduction
// Spec: spec/federal/schedule-a.yaml Line 8a
// ═══════════════════════════════════════════════════════════

describe("Mortgage interest deduction", () => {
  it("Mortgage interest - full deduction under debt limit", () => {
    const deductible = calculateDeductibleMortgageInterest(d(20000), d(500000), constants);
    expect(deductible.toNumber()).toBe(20000);
  });

  it("Mortgage interest limited by debt cap", () => {
    // $1M principal, $750K limit → ratio 0.75
    // $30,000 interest × 0.75 = $22,500
    const deductible = calculateDeductibleMortgageInterest(d(30000), d(1000000), constants);
    expect(deductible.toNumber()).toBe(22500);
  });

  it("Mortgage interest - at exactly the limit", () => {
    const deductible = calculateDeductibleMortgageInterest(d(25000), d(750000), constants);
    expect(deductible.toNumber()).toBe(25000);
  });

  it("Mortgage interest - pre-TCJA mortgage gets $1M limit", () => {
    // $900K principal, pre-12/15/2017 → $1M limit → fully deductible
    const deductible = calculateDeductibleMortgageInterest(d(30000), d(900000), constants, "2015-06-01");
    expect(deductible.toNumber()).toBe(30000);
  });

  it("Mortgage interest - pre-TCJA mortgage over $1M is prorated", () => {
    // $1.2M principal, pre-12/15/2017 → $1M limit → ratio 1M/1.2M
    const deductible = calculateDeductibleMortgageInterest(d(48000), d(1200000), constants, "2016-01-15");
    expect(deductible.toNumber()).toBe(40000); // 48000 × (1M / 1.2M)
  });

  it("Mortgage interest - post-TCJA uses $750K limit", () => {
    // $900K principal, post-12/15/2017 → $750K limit → prorated
    const deductible = calculateDeductibleMortgageInterest(d(36000), d(900000), constants, "2020-03-01");
    expect(deductible.toNumber()).toBe(30000); // 36000 × (750K / 900K)
  });

  it("Mortgage interest - no origination date defaults to post-TCJA", () => {
    const deductible = calculateDeductibleMortgageInterest(d(36000), d(900000), constants);
    expect(deductible.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT Deduction
// Spec: spec/federal/schedule-a.yaml Line 5d
// ═══════════════════════════════════════════════════════════

describe("SALT deduction", () => {
  it("SALT deduction capped at $10,000", () => {
    const deduction = calculateSALTDeduction(d(8000), d(6000), constants);
    expect(deduction.toNumber()).toBe(10000);
  });

  it("SALT deduction - under cap gets full amount", () => {
    const deduction = calculateSALTDeduction(d(3000), d(4000), constants);
    expect(deduction.toNumber()).toBe(7000);
  });

  it("SALT deduction - zero taxes", () => {
    const deduction = calculateSALTDeduction(d(0), d(0), constants);
    expect(deduction.toNumber()).toBe(0);
  });
});

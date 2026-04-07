/**
 * Tests for Ohio IT 1040 — Individual Income Tax Return.
 * Spec: spec/state/oh-it-1040.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateOhioIT1040 } from "@/engine/state/oh-it-1040.js";

const d = (value: string | number) => new Decimal(value);

describe("Ohio IT 1040", () => {
  // -------------------------------------------------------------------------
  // Line 1 — Federal AGI
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 1 - federal AGI flows through", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line1_federalAgi.toNumber()).toBe(50000);
  });

  it("OH IT 1040 Line 1 - zero federal AGI is valid", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 0,
      exemptions: 1,
    });
    expect(result.line1_federalAgi.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 1 - negative federal AGI is valid", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: -5000,
      exemptions: 1,
    });
    expect(result.line1_federalAgi.toNumber()).toBe(-5000);
  });

  // -------------------------------------------------------------------------
  // Lines 2a/2b — Additions and Deductions
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 2a - additions increase Ohio AGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      additions: 2000,
      exemptions: 1,
    });
    expect(result.line2a_additions.toNumber()).toBe(2000);
    expect(result.line3_ohioAgi.toNumber()).toBe(52000);
  });

  it("OH IT 1040 Line 2b - deductions reduce Ohio AGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      deductions: 3000,
      exemptions: 1,
    });
    expect(result.line2b_deductions.toNumber()).toBe(3000);
    expect(result.line3_ohioAgi.toNumber()).toBe(47000);
  });

  // -------------------------------------------------------------------------
  // Line 3 — Ohio AGI
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 3 - Ohio AGI equals federal AGI plus additions minus deductions", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      additions: 1500,
      deductions: 4000,
      exemptions: 1,
    });
    // 75000 + 1500 - 4000 = 72500
    expect(result.line3_ohioAgi.toNumber()).toBe(72500);
  });

  it("OH IT 1040 Line 3 - Ohio AGI with no additions or deductions equals federal AGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 60000,
      exemptions: 1,
    });
    expect(result.line3_ohioAgi.toNumber()).toBe(60000);
  });

  it("OH IT 1040 Line 3 - Ohio AGI can be negative", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 5000,
      deductions: 10000,
      exemptions: 1,
    });
    expect(result.line3_ohioAgi.toNumber()).toBe(-5000);
  });

  // -------------------------------------------------------------------------
  // Line 4 — Exemptions (MAGI-based)
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 4 - exemption amount varies by MAGI", () => {
    // MAGI ≤ $40,000 → $2,400
    const low = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 35000,
      exemptions: 1,
    });
    expect(low.exemptionAmountPerPerson.toNumber()).toBe(2400);
    expect(low.line4_exemptions.toNumber()).toBe(2400);
  });

  it("OH IT 1040 Line 4 - MAGI exactly $40,000 gets $2,400 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 40000,
      exemptions: 1,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(2400);
  });

  it("OH IT 1040 Line 4 - MAGI $40,001 gets $2,150 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 40001,
      exemptions: 1,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(2150);
  });

  it("OH IT 1040 Line 4 - MAGI $80,000 gets $2,150 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 80000,
      exemptions: 2,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(2150);
    expect(result.line4_exemptions.toNumber()).toBe(4300);
  });

  it("OH IT 1040 Line 4 - MAGI $80,001 gets $1,900 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 80001,
      exemptions: 1,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(1900);
  });

  it("OH IT 1040 Line 4 - MAGI $749,999 gets $1,900 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 749999,
      exemptions: 4,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(1900);
    expect(result.line4_exemptions.toNumber()).toBe(7600);
  });

  it("OH IT 1040 Line 4 - MAGI $750,000 or more gets $0 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 750000,
      exemptions: 4,
    });
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(0);
    expect(result.line4_exemptions.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 4 - zero exemptions results in $0", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 30000,
      exemptions: 0,
    });
    expect(result.line4_exemptions.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 4 - MAGI includes business income deduction", () => {
    // Ohio AGI = $35,000 but businessIncomeDeduction = $10,000
    // MAGI = $35,000 + $10,000 = $45,000 → $2,150 tier
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 35000,
      businessIncomeDeduction: 10000,
      exemptions: 1,
    });
    expect(result.magi.toNumber()).toBe(45000);
    expect(result.exemptionAmountPerPerson.toNumber()).toBe(2150);
  });

  it("OH IT 1040 Line 4 - MFJ with 4 exemptions at low MAGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 38000,
      exemptions: 4,
    });
    // MAGI ≤ $40,000 → $2,400 × 4 = $9,600
    expect(result.line4_exemptions.toNumber()).toBe(9600);
  });

  // -------------------------------------------------------------------------
  // Line 5 — Ohio taxable income
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 5 - taxable income floors at zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 1000,
      exemptions: 1,
    });
    // Ohio AGI = 1000, exemptions = 2400, taxable = max(0, 1000-2400) = 0
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 5 - taxable income is Ohio AGI minus exemptions", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    // Ohio AGI = 50000, MAGI = 50000 → $2,150 exemption
    // Taxable = 50000 - 2150 = 47850
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(47850);
  });

  // -------------------------------------------------------------------------
  // Line 6 — Taxable business income
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 6 - taxable business income defaults to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line6_taxableBusinessIncome.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 6 - taxable business income passes through", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 50000,
      exemptions: 1,
    });
    expect(result.line6_taxableBusinessIncome.toNumber()).toBe(50000);
  });

  it("OH IT 1040 Line 6 - taxable business income is capped at Ohio taxable income", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      taxableBusinessIncome: 60000,
      exemptions: 1,
    });
    // Ohio taxable income = 50000 - 2150 = 47850, so taxable business income
    // cannot exceed that amount.
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(47850);
    expect(result.line6_taxableBusinessIncome.toNumber()).toBe(47850);
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(0);
    expect(result.line8b_businessTax.toNumber()).toBe(1436);
  });

  // -------------------------------------------------------------------------
  // Line 7 — Taxable nonbusiness income
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 7 - nonbusiness income equals taxable income minus business income", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 50000,
      exemptions: 1,
    });
    // Ohio AGI = 300000, MAGI = 300000 → $1,900 exemption
    // Taxable = 300000 - 1900 = 298100
    // Nonbusiness = 298100 - 50000 = 248100
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(248100);
  });

  it("OH IT 1040 Line 7 - all income is nonbusiness for W-2 wage earners", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    // No business income → line 7 = line 5
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(
      result.line5_ohioTaxableIncome.toNumber()
    );
  });

  it("OH IT 1040 Line 7 - nonbusiness income cannot be negative", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 300000, // more than taxable income after exemptions
      exemptions: 1,
    });
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 8a — Nonbusiness income tax (bracket tests)
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 8a - zero income results in zero tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 0,
      exemptions: 1,
    });
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 8a - income within first bracket ($26,050 or less) is tax-free", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 26050,
      exemptions: 0, // no exemptions to keep taxable = AGI
    });
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(26050);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 8a - $26,051 triggers second bracket", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 26051,
      exemptions: 0,
    });
    // Tax = $342.00 + 2.75% × ($26,051 - $26,050) = $342.00 + $0.0275 = $342.0275
    // Round to $342
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(342);
  });

  it("OH IT 1040 Line 8a - nonbusiness tax uses 2025 brackets", () => {
    // Official example from page 18: Mitchell with $68,050 nonbusiness income
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 68050,
      exemptions: 0,
    });
    // Tax = $342 + 2.75% × ($68,050 - $26,050) = $342 + $1,155.00 = $1,497
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1497);
  });

  it("OH IT 1040 Line 8a - income at $50,000 single filer with 1 exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    // MAGI = $50,000 → $2,150 exemption
    // Taxable nonbusiness = $50,000 - $2,150 = $47,850
    // Tax = $342 + 2.75% × ($47,850 - $26,050) = $342 + 2.75% × $21,800
    //      = $342 + $599.50 = $941.50 → rounds to $942
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(942);
  });

  it("OH IT 1040 Line 8a - income at top of second bracket ($100,000)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 100000,
      exemptions: 0,
    });
    // Tax = $342 + 2.75% × ($100,000 - $26,050) = $342 + 2.75% × $73,950
    //      = $342 + $2,033.625 = $2,375.625 → rounds to $2,376
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(2376);
  });

  it("OH IT 1040 Line 8a - $100,001 triggers third bracket", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 100001,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.125% × ($100,001 - $100,000) = $2,394.32 + $0.03125
    //      = $2,394.35125 → rounds to $2,394
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(2394);
  });

  it("OH IT 1040 Line 8a - high income in third bracket", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 200000,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.125% × ($200,000 - $100,000) = $2,394.32 + $3,125
    //      = $5,519.32 → rounds to $5,519
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(5519);
  });

  it("OH IT 1040 Line 8a - very high income ($500,000)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 500000,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.125% × ($500,000 - $100,000) = $2,394.32 + $12,500
    //      = $14,894.32 → rounds to $14,894
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(14894);
  });

  // -------------------------------------------------------------------------
  // Line 8b — Business income tax
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 8b - business income taxed at flat 3%", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 50000,
      exemptions: 1,
    });
    // 50000 × 3% = 1500
    expect(result.line8b_businessTax.toNumber()).toBe(1500);
  });

  it("OH IT 1040 Line 8b - no business income means $0 business tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line8b_businessTax.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 8c — Total tax
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 8c - total tax is sum of nonbusiness and business tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 50000,
      exemptions: 1,
    });
    expect(result.line8c_totalTax.toNumber()).toBe(
      result.line8a_nonbusinessTax.toNumber() + result.line8b_businessTax.toNumber()
    );
  });

  it("OH IT 1040 Line 8c - pure W-2 earner total tax equals nonbusiness tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
    });
    expect(result.line8c_totalTax.toNumber()).toBe(result.line8a_nonbusinessTax.toNumber());
    expect(result.line8b_businessTax.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // End-to-end scenarios
  // -------------------------------------------------------------------------

  it("OH IT 1040 - single filer W-2 earner $75,000 AGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
    });
    // MAGI = $75,000 → $2,150 exemption
    // Taxable = $75,000 - $2,150 = $72,850
    // Tax = $342 + 2.75% × ($72,850 - $26,050) = $342 + 2.75% × $46,800
    //      = $342 + $1,287 = $1,629
    expect(result.line3_ohioAgi.toNumber()).toBe(75000);
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(72850);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1629);
    expect(result.line8c_totalTax.toNumber()).toBe(1629);
  });

  it("OH IT 1040 - MFJ couple with 2 kids $120,000 AGI", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 120000,
      exemptions: 4, // 2 spouses + 2 kids
    });
    // MAGI = $120,000 → $1,900 × 4 = $7,600 exemptions
    // Taxable = $120,000 - $7,600 = $112,400
    // Line 7 nonbusiness = $112,400
    // Tax = $2,394.32 + 3.125% × ($112,400 - $100,000)
    //      = $2,394.32 + 3.125% × $12,400 = $2,394.32 + $387.50
    //      = $2,781.82 → rounds to $2,782
    expect(result.line4_exemptions.toNumber()).toBe(7600);
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(112400);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(2782);
  });

  it("OH IT 1040 - low income single filer below exemption", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 2000,
      exemptions: 1,
    });
    // MAGI = $2,000 → $2,400 exemption
    // Taxable = max(0, $2,000 - $2,400) = $0
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(0);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
    expect(result.line8c_totalTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 - MFJ large family at low MAGI bracket", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 38000,
      exemptions: 6, // 2 spouses + 4 kids
    });
    // MAGI = $38,000 ≤ $40,000 → $2,400 × 6 = $14,400
    // Taxable = max(0, $38,000 - $14,400) = $23,600
    // $23,600 ≤ $26,050 → tax = $0
    expect(result.line4_exemptions.toNumber()).toBe(14400);
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(23600);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 - high income MFJ $750,000 gets zero exemptions", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 750000,
      exemptions: 4,
    });
    // MAGI = $750,000 ≥ $750,000 → $0 exemption
    // Taxable = $750,000
    // Tax = $2,394.32 + 3.125% × ($750,000 - $100,000)
    //      = $2,394.32 + 3.125% × $650,000 = $2,394.32 + $20,312.50
    //      = $22,706.82 → rounds to $22,707
    expect(result.line4_exemptions.toNumber()).toBe(0);
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(750000);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(22707);
  });

  it("OH IT 1040 - official example: Mitchell $68,050 taxable nonbusiness income", () => {
    // From page 18 of the 2025 IT 1040 booklet
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 68050,
      exemptions: 0, // using 0 to match the example's direct taxable income
    });
    // Tax = $342 + 2.75% × $42,000 = $342 + $1,155 = $1,497
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(68050);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1497);
  });

  it("OH IT 1040 - official example: John and Mary MFJ with son Patrick", () => {
    // From page 17: AGI = $75,000, 3 exemptions, MAGI = $75,000
    // Exemption = $2,150 × 3 = $6,450
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 75000,
      exemptions: 3,
    });
    expect(result.line4_exemptions.toNumber()).toBe(6450);
    // Taxable = $75,000 - $6,450 = $68,550
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(68550);
    // Tax = $342 + 2.75% × ($68,550 - $26,050) = $342 + 2.75% × $42,500
    //      = $342 + $1,168.75 = $1,510.75 → rounds to $1,511
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1511);
  });

  it("OH IT 1040 - with additions and deductions", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 60000,
      additions: 500,    // e.g., non-Ohio state interest
      deductions: 3000,  // e.g., Social Security deduction
      exemptions: 1,
    });
    // Ohio AGI = 60000 + 500 - 3000 = 57500
    // MAGI = 57500 (no business deduction)
    // Exemption = $2,150 (MAGI in $40,001-$80,000 range)
    // Taxable = 57500 - 2150 = 55350
    // Tax = $342 + 2.75% × ($55,350 - $26,050) = $342 + 2.75% × $29,300
    //      = $342 + $805.75 = $1,147.75 → rounds to $1,148
    expect(result.line3_ohioAgi.toNumber()).toBe(57500);
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(55350);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1148);
  });

  it("OH IT 1040 - mixed business and nonbusiness income", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 350000,
      taxableBusinessIncome: 100000, // business income above $250k deduction
      businessIncomeDeduction: 250000,
      exemptions: 1,
    });
    // MAGI = $350,000 + $250,000 = $600,000 → $1,900 exemption
    // Taxable = $350,000 - $1,900 = $348,100
    // Nonbusiness = $348,100 - $100,000 = $248,100
    // Nonbusiness tax = $2,394.32 + 3.125% × ($248,100 - $100,000)
    //                 = $2,394.32 + 3.125% × $148,100 = $2,394.32 + $4,628.125
    //                 = $7,022.445 → rounds to $7,022
    // Business tax = $100,000 × 3% = $3,000
    // Total = $7,022 + $3,000 = $10,022
    expect(result.magi.toNumber()).toBe(600000);
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(248100);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(7022);
    expect(result.line8b_businessTax.toNumber()).toBe(3000);
    expect(result.line8c_totalTax.toNumber()).toBe(10022);
  });

  // -------------------------------------------------------------------------
  // Line 9 — Nonrefundable credits
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 9 - nonrefundable credits from Schedule of Credits", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      nonrefundableCredits: 500,
    });
    expect(result.line9_nonrefundableCredits.toNumber()).toBe(500);
  });

  it("OH IT 1040 Line 9 - nonrefundable credits default to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line9_nonrefundableCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 10 — Tax after nonrefundable credits
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 10 - tax after nonrefundable credits", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      nonrefundableCredits: 500,
    });
    // line 8c = $1,629, line 9 = $500 → line 10 = $1,129
    expect(result.line10_taxAfterCredits.toNumber()).toBe(1129);
  });

  it("OH IT 1040 Line 10 - floors at zero when credits exceed tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 30000,
      exemptions: 1,
      nonrefundableCredits: 5000,
    });
    expect(result.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 11 — Underpayment penalty
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 11 - underpayment penalty defaults to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line11_underpaymentPenalty.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 11 - underpayment penalty passes through", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      underpaymentPenalty: 150,
    });
    expect(result.line11_underpaymentPenalty.toNumber()).toBe(150);
  });

  // -------------------------------------------------------------------------
  // Line 12 — Unpaid use tax
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 12 - use tax defaults to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line12_useTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 12 - use tax passes through", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      useTax: 78,
    });
    expect(result.line12_useTax.toNumber()).toBe(78);
  });

  // -------------------------------------------------------------------------
  // Line 13 — Total liability before payments
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 13 - total liability is tax plus penalty plus use tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      nonrefundableCredits: 200,
      underpaymentPenalty: 50,
      useTax: 30,
    });
    // line 8c = $1,629, line 9 = $200, line 10 = $1,429
    // line 13 = $1,429 + $50 + $30 = $1,509
    expect(result.line13_totalLiability.toNumber()).toBe(1509);
  });

  // -------------------------------------------------------------------------
  // Line 14 — Ohio withholding
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 14 - Ohio withholding", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1800,
    });
    expect(result.line14_ohioWithholding.toNumber()).toBe(1800);
  });

  // -------------------------------------------------------------------------
  // Line 15 — Estimated payments and carryforward
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 15 - estimated payments and carryforward", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 200000,
      exemptions: 1,
      estimatedPayments: 3000,
    });
    expect(result.line15_estimatedPayments.toNumber()).toBe(3000);
  });

  // -------------------------------------------------------------------------
  // Line 16 — Refundable credits
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 16 - refundable credits default to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line16_refundableCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 17 — Total payments
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 17 - total payments", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1200,
      estimatedPayments: 300,
      refundableCredits: 100,
    });
    // $1,200 + $300 + $100 = $1,600
    expect(result.line17_totalPayments.toNumber()).toBe(1600);
  });

  // -------------------------------------------------------------------------
  // Line 18 — Amended return prior overpayment
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 18 - amended overpayment defaults to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line18_amendedPriorOverpayment.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 19 — Net payment position
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 19 - net payments", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      ohioWithholding: 1500,
    });
    expect(result.line19_netPayments.toNumber()).toBe(1500);
  });

  it("OH IT 1040 Line 19 - net payments reduced by amended overpayment", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      ohioWithholding: 1500,
      amendedPriorOverpayment: 400,
    });
    // $1,500 - $400 = $1,100
    expect(result.line19_netPayments.toNumber()).toBe(1100);
  });

  // -------------------------------------------------------------------------
  // Line 20 — Tax due
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 20 - tax due when payments insufficient", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1000,
    });
    // line 8c = $1,629, no credits, line 13 = $1,629
    // line 17 = $1,000, line 19 = $1,000
    // line 20 = $1,629 - $1,000 = $629
    expect(result.line20_taxDue.toNumber()).toBe(629);
  });

  it("OH IT 1040 Line 20 - zero when payments cover liability", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
    });
    expect(result.line20_taxDue.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 21 — Late payment interest
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 21 - late payment interest defaults to zero", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    expect(result.line21_latePaymentInterest.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 22 — Total amount due
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 22 - total amount due", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1000,
      latePaymentInterest: 25,
    });
    // line 20 = $629 (tax due), line 21 = $25
    // line 22 = $629 + $25 = $654
    expect(result.line22_totalAmountDue.toNumber()).toBe(654);
  });

  it("OH IT 1040 Line 22 - zero when overpayment", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
    });
    expect(result.line22_totalAmountDue.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 23 — Overpayment
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 23 - overpayment when payments exceed liability", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
    });
    // line 13 = $1,629, line 19 = $2,000
    // line 23 = $2,000 - $1,629 = $371
    expect(result.line23_overpayment.toNumber()).toBe(371);
  });

  it("OH IT 1040 Line 23 - zero when tax due", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1000,
    });
    expect(result.line23_overpayment.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 24 — Credit carryforward
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 24 - credit carryforward election", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      creditCarryforward: 100,
    });
    expect(result.line24_creditCarryforward.toNumber()).toBe(100);
  });

  it("OH IT 1040 Line 24 - carryforward capped at overpayment", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      creditCarryforward: 5000, // more than the ~$371 overpayment
    });
    // Overpayment = $371, carryforward capped at $371
    expect(result.line24_creditCarryforward.toNumber()).toBe(371);
  });

  // -------------------------------------------------------------------------
  // Line 25 — Donations
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 25 - donations reduce refund", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      donations: 50,
    });
    expect(result.line25_donations.toNumber()).toBe(50);
  });

  it("OH IT 1040 Line 25 - donations capped at remaining overpayment", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      creditCarryforward: 200,
      donations: 500, // more than remaining overpayment
    });
    // Overpayment = $371, after carryforward $200, remaining = $171
    // Donations capped at $171
    expect(result.line25_donations.toNumber()).toBe(171);
  });

  // -------------------------------------------------------------------------
  // Line 26 — Refund
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 26 - refund is overpayment minus carryforward and donations", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      creditCarryforward: 100,
      donations: 50,
    });
    // Overpayment = $371, carryforward = $100, donations = $50
    // Refund = $371 - $100 - $50 = $221
    expect(result.line26_refund.toNumber()).toBe(221);
  });

  it("OH IT 1040 Line 26 - zero refund when entire overpayment allocated", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 2000,
      creditCarryforward: 371, // equals full overpayment
    });
    expect(result.line26_refund.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // End-to-end: full return with payments
  // -------------------------------------------------------------------------

  it("OH IT 1040 - full return: single filer with withholding gets refund", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      nonrefundableCredits: 200,
      ohioWithholding: 1200,
    });
    // line 8c = $942
    // line 9 = $200, line 10 = $742
    // line 13 = $742 (no penalty, no use tax)
    // line 17 = $1,200
    // line 19 = $1,200
    // line 23 = $1,200 - $742 = $458
    // line 26 = $458
    expect(result.line8c_totalTax.toNumber()).toBe(942);
    expect(result.line10_taxAfterCredits.toNumber()).toBe(742);
    expect(result.line13_totalLiability.toNumber()).toBe(742);
    expect(result.line23_overpayment.toNumber()).toBe(458);
    expect(result.line26_refund.toNumber()).toBe(458);
    expect(result.line20_taxDue.toNumber()).toBe(0);
    expect(result.line22_totalAmountDue.toNumber()).toBe(0);
  });

  it("OH IT 1040 - full return: MFJ couple owes balance", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 120000,
      exemptions: 4,
      ohioWithholding: 2000,
    });
    // line 8c = $2,782 (from existing test)
    // line 13 = $2,782
    // line 17 = $2,000
    // line 20 = $2,782 - $2,000 = $782
    // line 22 = $782
    expect(result.line8c_totalTax.toNumber()).toBe(2782);
    expect(result.line20_taxDue.toNumber()).toBe(782);
    expect(result.line22_totalAmountDue.toNumber()).toBe(782);
    expect(result.line23_overpayment.toNumber()).toBe(0);
    expect(result.line26_refund.toNumber()).toBe(0);
  });

  it("OH IT 1040 - full return: low income, credits wipe tax, withholding fully refunded", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 38000,
      exemptions: 6,
      ohioWithholding: 400,
    });
    // From existing test: line 8c = $0 (income below bracket threshold after exemptions)
    // line 13 = $0, line 17 = $400, line 23 = $400, line 26 = $400
    expect(result.line8c_totalTax.toNumber()).toBe(0);
    expect(result.line13_totalLiability.toNumber()).toBe(0);
    expect(result.line23_overpayment.toNumber()).toBe(400);
    expect(result.line26_refund.toNumber()).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it("OH IT 1040 - audit trail records all lines", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      ohioWithholding: 1000,
    });
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toEqual([
      "1", "2a", "2b", "3", "4", "5", "6", "7", "8a", "8b", "8c",
      "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19",
      "20", "21", "22", "23", "24", "25", "26",
    ]);
    expect(result.lines.every((l) => l.form === "OH-IT-1040")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // $1 or less threshold rule
  // -------------------------------------------------------------------------

  it("OH IT 1040 Line 22 - $1 or less amount due zeroed out", () => {
    // Engineer a scenario where amount due is exactly $1
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1628, // tax is $1,629, so due = $1
    });
    expect(result.line20_taxDue.toNumber()).toBe(1);
    // $1 or less → zeroed out
    expect(result.line22_totalAmountDue.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 22 - $2 amount due is kept", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1627, // tax is $1,629, so due = $2
    });
    expect(result.line20_taxDue.toNumber()).toBe(2);
    expect(result.line22_totalAmountDue.toNumber()).toBe(2);
  });

  it("OH IT 1040 Line 26 - $1 or less refund zeroed out", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1630, // tax is $1,629, overpayment = $1
    });
    expect(result.line23_overpayment.toNumber()).toBe(1);
    // $1 or less → zeroed out
    expect(result.line26_refund.toNumber()).toBe(0);
  });

  it("OH IT 1040 Line 26 - $2 refund is kept", () => {
    const result = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: 75000,
      exemptions: 1,
      ohioWithholding: 1631, // tax is $1,629, overpayment = $2
    });
    expect(result.line23_overpayment.toNumber()).toBe(2);
    expect(result.line26_refund.toNumber()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("OH IT 1040 - unsupported tax year throws", () => {
    expect(() =>
      calculateOhioIT1040({
        taxYear: 2023,
        filingStatus: "single",
        federalAgi: 50000,
        exemptions: 1,
      })
    ).toThrow("Ohio IT 1040 constants not available for tax year 2023");
  });

  // -------------------------------------------------------------------------
  // Tax Year 2024 — bracket tests (3.50% top rate, $360.69 base at $26,050)
  // -------------------------------------------------------------------------

  it("OH IT 1040 2024 - zero income results in zero tax", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 0,
      exemptions: 1,
    });
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 2024 - income within 0% bracket ($26,050 or less)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 26050,
      exemptions: 0,
    });
    expect(result.line7_taxableNonbusinessIncome.toNumber()).toBe(26050);
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(0);
  });

  it("OH IT 1040 2024 - $26,051 triggers second bracket ($360.69 base)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 26051,
      exemptions: 0,
    });
    // Tax = $360.69 + 2.75% × $1 = $360.69 + $0.0275 = $360.7175 → rounds to $361
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(361);
  });

  it("OH IT 1040 2024 - mid second bracket ($68,050)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 68050,
      exemptions: 0,
    });
    // Tax = $360.69 + 2.75% × ($68,050 - $26,050) = $360.69 + 2.75% × $42,000
    //      = $360.69 + $1,155.00 = $1,515.69 → rounds to $1,516
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1516);
  });

  it("OH IT 1040 2024 - top of second bracket ($100,000)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 100000,
      exemptions: 0,
    });
    // Tax = $360.69 + 2.75% × ($100,000 - $26,050) = $360.69 + 2.75% × $73,950
    //      = $360.69 + $2,033.625 = $2,394.315 → rounds to $2,394
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(2394);
  });

  it("OH IT 1040 2024 - $100,001 triggers third bracket (3.50% rate)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 100001,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.50% × ($100,001 - $100,000) = $2,394.32 + $0.035
    //      = $2,394.355 → rounds to $2,394
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(2394);
  });

  it("OH IT 1040 2024 - high income $200,000 (3.50% top rate)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 200000,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.50% × ($200,000 - $100,000) = $2,394.32 + $3,500
    //      = $5,894.32 → rounds to $5,894
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(5894);
  });

  it("OH IT 1040 2024 - very high income $500,000 (3.50% top rate)", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 500000,
      exemptions: 0,
    });
    // Tax = $2,394.32 + 3.50% × ($500,000 - $100,000) = $2,394.32 + $14,000
    //      = $16,394.32 → rounds to $16,394
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(16394);
  });

  it("OH IT 1040 2024 - 2024 tax is higher than 2025 at same income (3.50% vs 3.125%)", () => {
    const income = 200000;
    const r2024 = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: income,
      exemptions: 0,
    });
    const r2025 = calculateOhioIT1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAgi: income,
      exemptions: 0,
    });
    // 2024 has higher top rate (3.50%) and higher base at $26,050 ($360.69 vs $342)
    // 2024: $2,394.32 + 3.50% × $100,000 = $5,894.32 → $5,894
    // 2025: $2,394.32 + 3.125% × $100,000 = $5,519.32 → $5,519
    expect(r2024.line8a_nonbusinessTax.toNumber()).toBe(5894);
    expect(r2025.line8a_nonbusinessTax.toNumber()).toBe(5519);
    expect(r2024.line8a_nonbusinessTax.greaterThan(r2025.line8a_nonbusinessTax)).toBe(true);
  });

  it("OH IT 1040 2024 - MFJ with 3 exemptions at $75,000", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "married_filing_jointly",
      federalAgi: 75000,
      exemptions: 3,
    });
    // MAGI = $75,000 → $2,150 × 3 = $6,450 exemptions (same tier as 2025)
    expect(result.line4_exemptions.toNumber()).toBe(6450);
    // Taxable = $75,000 - $6,450 = $68,550
    expect(result.line5_ohioTaxableIncome.toNumber()).toBe(68550);
    // Tax = $360.69 + 2.75% × ($68,550 - $26,050) = $360.69 + 2.75% × $42,500
    //      = $360.69 + $1,168.75 = $1,529.44 → rounds to $1,529
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(1529);
  });

  it("OH IT 1040 2024 - single filer $50,000 W-2 earner", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
    });
    // MAGI = $50,000 → $2,150 exemption
    // Taxable = $50,000 - $2,150 = $47,850
    // Tax = $360.69 + 2.75% × ($47,850 - $26,050) = $360.69 + 2.75% × $21,800
    //      = $360.69 + $599.50 = $960.19 → rounds to $960
    expect(result.line8a_nonbusinessTax.toNumber()).toBe(960);
  });

  it("OH IT 1040 2024 - full return: single filer with withholding", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 50000,
      exemptions: 1,
      nonrefundableCredits: 200,
      ohioWithholding: 1200,
    });
    // line 8c = $960 (from prior test)
    // line 9 = $200, line 10 = $760
    // line 13 = $760
    // line 17 = $1,200, line 19 = $1,200
    // line 23 = $1,200 - $760 = $440
    // line 26 = $440
    expect(result.line8c_totalTax.toNumber()).toBe(960);
    expect(result.line10_taxAfterCredits.toNumber()).toBe(760);
    expect(result.line23_overpayment.toNumber()).toBe(440);
    expect(result.line26_refund.toNumber()).toBe(440);
  });

  it("OH IT 1040 2024 - business income taxed at same 3% flat rate", () => {
    const result = calculateOhioIT1040({
      taxYear: 2024,
      filingStatus: "single",
      federalAgi: 300000,
      taxableBusinessIncome: 50000,
      businessIncomeDeduction: 250000,
      exemptions: 1,
    });
    // Business tax = $50,000 × 3% = $1,500 (same rate as 2025)
    expect(result.line8b_businessTax.toNumber()).toBe(1500);
  });
});

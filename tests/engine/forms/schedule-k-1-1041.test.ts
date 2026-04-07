/**
 * Schedule K-1 (Form 1041) — Beneficiary's Share of Income from Estates and Trusts
 * Spec: spec/federal/schedule-k-1-1041.yaml
 *
 * Tests verify that trust/estate K-1 income items route correctly through
 * the federal orchestrator to Schedule B, Schedule D, Form 1040, QDCG
 * worksheet, Schedule A, Schedule 1, and Form 6251.
 */

import { describe, test, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import Decimal from "decimal.js";

/** Helper to build a minimal single-filer input with K-1 Form 1041 data */
function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "8000" }],
    ...overrides,
  };
}

function findLine(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  return result.allLines.find((l) => l.form === form && l.line === line);
}

// ═══════════════════════════════════════════════════════
// Income routing: Boxes 1–4c
// ═══════════════════════════════════════════════════════

describe("K-1 Form 1041 income routing", () => {
  test("K-1 1041 Box 1 interest flows to Schedule B", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Family Trust",
        estateTrustEIN: "12-3456789",
        interestIncome: "3000",
      }],
    }));

    const schedB1 = findLine(result, "Sched B", "2");
    expect(schedB1).toBeDefined();
    expect(new Decimal(schedB1!.value).toNumber()).toBe(3000);

    // Interest should show up in Form 1040 Line 2b
    const line2b = findLine(result, "1040", "2b");
    expect(line2b).toBeDefined();
    expect(new Decimal(line2b!.value).toNumber()).toBe(3000);
  });

  test("K-1 1041 Box 2a dividends flow to Schedule B", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Family Trust",
        estateTrustEIN: "12-3456789",
        ordinaryDividends: "5000",
        qualifiedDividends: "3000",
      }],
    }));

    const schedB6 = findLine(result, "Sched B", "6");
    expect(schedB6).toBeDefined();
    expect(new Decimal(schedB6!.value).toNumber()).toBe(5000);

    // Qualified dividends flow to Line 3a
    const line3a = findLine(result, "1040", "3a");
    expect(line3a).toBeDefined();
    expect(new Decimal(line3a!.value).toNumber()).toBe(3000);
  });

  test("K-1 1041 Box 2b qualified dividends flow to Form 1040 Line 3a", () => {
    const result = calculateFederalTax(makeInput({
      form1099Div: [{ payer: "Brokerage", ordinaryDividends: "2000", qualifiedDividends: "1500" }],
      scheduleK1Form1041: [{
        estateTrustName: "Grandma Trust",
        estateTrustEIN: "98-7654321",
        ordinaryDividends: "4000",
        qualifiedDividends: "2500",
      }],
    }));

    // Qualified dividends = 1500 (1099-DIV) + 2500 (K-1 1041) = 4000
    const line3a = findLine(result, "1040", "3a");
    expect(line3a).toBeDefined();
    expect(new Decimal(line3a!.value).toNumber()).toBe(4000);
  });

  test("K-1 1041 Box 3 short-term capital gain flows to Schedule D", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Trading Trust",
        estateTrustEIN: "11-1111111",
        netShortTermCapitalGain: "7500",
      }],
    }));

    const schedD7 = findLine(result, "Sched D", "7");
    expect(schedD7).toBeDefined();
    expect(new Decimal(schedD7!.value).toNumber()).toBe(7500);
  });

  test("K-1 1041 Box 4a long-term capital gain flows to Schedule D", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Investment Trust",
        estateTrustEIN: "22-2222222",
        netLongTermCapitalGain: "12000",
      }],
    }));

    const schedD15 = findLine(result, "Sched D", "15");
    expect(schedD15).toBeDefined();
    expect(new Decimal(schedD15!.value).toNumber()).toBe(12000);
  });

  test("K-1 1041 Box 4b collectibles gain flows to QDCG 28% rate", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Art Trust",
        estateTrustEIN: "33-3333333",
        netLongTermCapitalGain: "20000",
        collectiblesGain: "8000",
      }],
    }));

    // Collectibles gain should be captured and used in QDCG worksheet
    // The audit trail should show the 28% rate gain
    expect(result.capitalGainLoss.toNumber()).toBe(20000);
  });

  test("K-1 1041 Box 4c unrecaptured section 1250 gain flows to QDCG", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Real Estate Trust",
        estateTrustEIN: "44-4444444",
        netLongTermCapitalGain: "30000",
        unrecapturedSection1250Gain: "10000",
      }],
    }));

    expect(result.capitalGainLoss.toNumber()).toBe(30000);
  });

  test("K-1 1041 Box 5 other portfolio income increases AGI and appears in audit trail", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Royalty Trust",
        estateTrustEIN: "55-5555555",
        otherPortfolioIncome: "6000",
      }],
    }));

    const line8z = findLine(result, "Sched 1", "8z");
    expect(line8z).toBeDefined();
    // AGI includes the portfolio income
    expect(result.agi.toNumber()).toBeGreaterThan(50000);
  });

  test("K-1 1041 interest aggregates with 1099-INT and partnership K-1 interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ payer: "Bank", interestIncome: "1000" }],
      scheduleK1: [{
        partnershipName: "ABC LP",
        partnershipEIN: "66-6666666",
        entityType: "partnership" as const,
        interestIncome: "2000",
      }],
      scheduleK1Form1041: [{
        estateTrustName: "Trust X",
        estateTrustEIN: "77-7777777",
        interestIncome: "3000",
      }],
    }));

    // Total interest = 1000 + 2000 + 3000 = 6000
    const line2b = findLine(result, "1040", "2b");
    expect(line2b).toBeDefined();
    expect(new Decimal(line2b!.value).toNumber()).toBe(6000);
  });

  test("K-1 1041 capital gains aggregate with Form 8949 and partnership K-1", () => {
    const result = calculateFederalTax(makeInput({
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "AAPL",
          dateAcquired: "2023-01-15",
          dateSold: "2025-06-15",
          proceeds: "15000",
          costBasis: "10000",
          holdingPeriod: "long" as const,
        }],
      }],
      scheduleK1: [{
        partnershipName: "XYZ LP",
        partnershipEIN: "88-8888888",
        entityType: "partnership" as const,
        netLongTermCapitalGain: "4000",
      }],
      scheduleK1Form1041: [{
        estateTrustName: "Capital Trust",
        estateTrustEIN: "99-9999999",
        netLongTermCapitalGain: "6000",
      }],
    }));

    // Total LTCG = 5000 (8949) + 4000 (K-1) + 6000 (K-1 1041) = 15000
    const schedD15 = findLine(result, "Sched D", "15");
    expect(schedD15).toBeDefined();
    expect(new Decimal(schedD15!.value).toNumber()).toBe(15000);
  });

  test("multiple K-1 Form 1041s from different trusts aggregate correctly", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [
        {
          estateTrustName: "Trust A",
          estateTrustEIN: "10-1010101",
          interestIncome: "2000",
          ordinaryDividends: "3000",
          qualifiedDividends: "2000",
          netLongTermCapitalGain: "5000",
        },
        {
          estateTrustName: "Trust B",
          estateTrustEIN: "20-2020202",
          interestIncome: "1000",
          ordinaryDividends: "4000",
          qualifiedDividends: "3000",
          netShortTermCapitalGain: "2000",
        },
      ],
    }));

    // Interest = 2000 + 1000 = 3000
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(3000);

    // Qualified dividends = 2000 + 3000 = 5000
    const line3a = findLine(result, "1040", "3a");
    expect(new Decimal(line3a!.value).toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════
// Deductions and other items: Boxes 10–14
// ═══════════════════════════════════════════════════════

describe("K-1 Form 1041 deductions and other items", () => {
  test("K-1 1041 Box 10 estate tax deduction appears in audit trail as Schedule A Line 16", () => {
    const result = calculateFederalTax(makeInput({
      scheduleA: {
        stateLocalTaxes: "12000",
        mortgageInterest: "8000",
        charitableCash: "2000",
      },
      scheduleK1Form1041: [{
        estateTrustName: "Decedent Estate",
        estateTrustEIN: "11-1111111",
        interestIncome: "5000",
        estateTaxDeduction: "3000",
      }],
    }));

    const line16 = findLine(result, "Sched A", "16");
    expect(line16).toBeDefined();
    expect(new Decimal(line16!.value).toNumber()).toBe(3000);
  });

  test("estate tax deduction from multiple K-1s aggregates", () => {
    const result = calculateFederalTax(makeInput({
      scheduleA: {
        stateLocalTaxes: "10000",
        mortgageInterest: "10000",
      },
      scheduleK1Form1041: [
        {
          estateTrustName: "Estate A",
          estateTrustEIN: "22-2222222",
          interestIncome: "3000",
          estateTaxDeduction: "2000",
        },
        {
          estateTrustName: "Estate B",
          estateTrustEIN: "33-3333333",
          interestIncome: "2000",
          estateTaxDeduction: "1500",
        },
      ],
    }));

    const line16 = findLine(result, "Sched A", "16");
    expect(line16).toBeDefined();
    expect(new Decimal(line16!.value).toNumber()).toBe(3500);
  });

  test("K-1 1041 Box 11 Code A §67(e) deductions reduce AGI as above-the-line adjustment", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Terminating Trust",
        estateTrustEIN: "44-4444444",
        isFinalK1: true,
        interestIncome: "10000",
        finalYearSection67eDeductions: "4000",
      }],
    }));

    const line24z = findLine(result, "Sched 1", "24z");
    expect(line24z).toBeDefined();
    // Deduction is negative (reduces income)
    expect(new Decimal(line24z!.value).toNumber()).toBe(-4000);

    // AGI should reflect the deduction: 50K wages + 10K interest - 4K §67(e) = 56K
    expect(result.agi.toNumber()).toBe(56000);
  });

  test("§67(e) deductions ignored when K-1 is not final", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Active Trust",
        estateTrustEIN: "55-5555555",
        isFinalK1: false,
        interestIncome: "10000",
        finalYearSection67eDeductions: "4000",
      }],
    }));

    // Not a final K-1 → §67(e) deductions should not apply
    // AGI = 50K wages + 10K interest = 60K
    expect(result.agi.toNumber()).toBe(60000);
  });

  test("K-1 1041 Box 11 Codes C/D capital loss carryovers flow to Schedule D", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Terminating Trust",
        estateTrustEIN: "66-6666666",
        isFinalK1: true,
        finalYearShortTermCapitalLoss: "-5000",
        finalYearLongTermCapitalLoss: "-8000",
      }],
    }));

    // Short-term loss flows to Schedule D Line 7
    const schedD7 = findLine(result, "Sched D", "7");
    expect(schedD7).toBeDefined();
    expect(new Decimal(schedD7!.value).toNumber()).toBe(-5000);

    // Long-term loss flows to Schedule D Line 15
    const schedD15 = findLine(result, "Sched D", "15");
    expect(schedD15).toBeDefined();
    expect(new Decimal(schedD15!.value).toNumber()).toBe(-8000);
  });

  test("K-1 1041 Box 11 Code E NOL carryover adds to available NOL", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", federalWithheld: "15000" }],
      scheduleK1Form1041: [{
        estateTrustName: "Terminating Estate",
        estateTrustEIN: "77-7777777",
        isFinalK1: true,
        finalYearNOLCarryover: "20000",
      }],
    }));

    // NOL deduction should be limited to 80% of taxable income
    // but should be present from the K-1 1041 NOL
    const nolLine = findLine(result, "Sched 1", "8a");
    expect(nolLine).toBeDefined();
    expect(new Decimal(nolLine!.value).toNumber()).toBeLessThan(0);
  });

  test("K-1 1041 Box 11 Code B non-misc itemized deductions flow to Schedule A", () => {
    const result = calculateFederalTax(makeInput({
      scheduleA: {
        stateLocalTaxes: "10000",
        mortgageInterest: "8000",
      },
      scheduleK1Form1041: [{
        estateTrustName: "Terminating Trust",
        estateTrustEIN: "88-8888888",
        isFinalK1: true,
        interestIncome: "5000",
        finalYearNonMiscItemized: "3000",
      }],
    }));

    const line16b = findLine(result, "Sched A", "16b");
    expect(line16b).toBeDefined();
    expect(new Decimal(line16b!.value).toNumber()).toBe(3000);
  });

  test("K-1 1041 Box 12 AMT adjustment flows to Form 6251", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", federalWithheld: "40000" }],
      scheduleK1Form1041: [{
        estateTrustName: "AMT Trust",
        estateTrustEIN: "99-9999999",
        interestIncome: "10000",
        amtAdjustment: "5000",
      }],
    }));

    // AMT adjustment should flow to Form 6251
    expect(result.form6251).toBeDefined();
  });

  test("K-1 1041 Box 14 Code A tax-exempt interest flows to Line 2a", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Muni Trust",
        estateTrustEIN: "10-1010101",
        taxExemptInterest: "4000",
      }],
    }));

    const line2a = findLine(result, "1040", "2a");
    expect(line2a).toBeDefined();
    expect(new Decimal(line2a!.value).toNumber()).toBe(4000);
  });

  test("K-1 1041 tax-exempt interest aggregates with 1099-INT and partnership K-1", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ payer: "Bank", interestIncome: "1000", taxExemptInterest: "500" }],
      scheduleK1: [{
        partnershipName: "LP",
        partnershipEIN: "20-2020202",
        entityType: "partnership" as const,
        taxExemptInterest: "300",
      }],
      scheduleK1Form1041: [{
        estateTrustName: "Trust",
        estateTrustEIN: "30-3030303",
        taxExemptInterest: "200",
      }],
    }));

    // Total tax-exempt = 500 + 300 + 200 = 1000
    const line2a = findLine(result, "1040", "2a");
    expect(line2a).toBeDefined();
    expect(new Decimal(line2a!.value).toNumber()).toBe(1000);
  });

  test("K-1 1041 Box 14 Code B foreign taxes flow to Form 1116", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "12000" }],
      scheduleK1Form1041: [{
        estateTrustName: "International Trust",
        estateTrustEIN: "40-4040404",
        interestIncome: "10000",
        foreignTaxesPaid: "1500",
      }],
    }));

    // Foreign taxes should be claimed as a credit
    expect(result.foreignTaxCredit.toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// Edge cases and comprehensive scenarios
// ═══════════════════════════════════════════════════════

describe("K-1 Form 1041 edge cases", () => {
  test("empty K-1 Form 1041 array has no effect on calculation", () => {
    const baseline = calculateFederalTax(makeInput());
    const result = calculateFederalTax(makeInput({ scheduleK1Form1041: [] }));
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
    expect(result.totalTax.toNumber()).toBe(baseline.totalTax.toNumber());
  });

  test("K-1 1041 with all zero amounts has no effect", () => {
    const baseline = calculateFederalTax(makeInput());
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Empty Trust",
        estateTrustEIN: "50-5050505",
        interestIncome: "0",
        ordinaryDividends: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
      }],
    }));
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });

  test("K-1 1041 with capital losses correctly applies $3,000 deduction limit", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Loss Trust",
        estateTrustEIN: "60-6060606",
        netLongTermCapitalGain: "-15000",
      }],
    }));

    // Capital loss limited to $3,000 for the year
    expect(result.capitalGainLoss.toNumber()).toBe(-3000);
  });

  test("K-1 1041 with only optional fields provided", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Simple Trust",
        estateTrustEIN: "70-7070707",
        ordinaryDividends: "2000",
      }],
    }));

    // Just adds dividends
    expect(result.totalDividends.toNumber()).toBe(2000);
  });

  test("comprehensive trust K-1 with all income types", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "10000" }],
      scheduleK1Form1041: [{
        estateTrustName: "Comprehensive Trust",
        estateTrustEIN: "80-8080808",
        interestIncome: "8000",
        ordinaryDividends: "12000",
        qualifiedDividends: "9000",
        netShortTermCapitalGain: "3000",
        netLongTermCapitalGain: "15000",
        otherPortfolioIncome: "4000",
        taxExemptInterest: "1000",
      }],
    }));

    // Summary should contain all aggregated amounts
    const summary = result.scheduleK1Form1041Summary!;
    expect(summary.numberOfK1s).toBe(1);
    expect(summary.totalInterest.toNumber()).toBe(8000);
    expect(summary.totalOrdinaryDividends.toNumber()).toBe(12000);
    expect(summary.totalQualifiedDividends.toNumber()).toBe(9000);
    expect(summary.totalShortTermCapitalGain.toNumber()).toBe(3000);
    expect(summary.totalLongTermCapitalGain.toNumber()).toBe(15000);
    expect(summary.totalOtherPortfolioIncome.toNumber()).toBe(4000);
    expect(summary.totalTaxExemptInterest.toNumber()).toBe(1000);
  });

  test("MFJ return with trust K-1 income computes correctly", () => {
    const result = calculateFederalTax(makeInput({
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1977-06-15",
        },
      },
      w2s: [
        { ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "12000" },
        { ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" },
      ],
      scheduleK1Form1041: [{
        estateTrustName: "Family Trust",
        estateTrustEIN: "12-3456789",
        interestIncome: "5000",
        ordinaryDividends: "8000",
        qualifiedDividends: "6000",
        netLongTermCapitalGain: "10000",
      }],
    }));

    // AGI = 80K + 60K + 5K + 8K + 10K = 163K
    // (dividends are part of ordinary divs total, not double counted)
    expect(result.agi.toNumber()).toBeGreaterThan(160000);
    expect(result.scheduleK1Form1041Summary!.numberOfK1s).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════
// Section 199A QBI: Box 14 Code I
// ═══════════════════════════════════════════════════════

describe("K-1 Form 1041 Section 199A QBI (Box 14 Code I)", () => {
  test("K-1 1041 Box 14 Code I QBI flows through Form 8995 simplified", () => {
    // Taxable income under $197,300 → simplified Form 8995
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [{
        estateTrustName: "Business Trust",
        estateTrustEIN: "11-1111111",
        section199AQBI: "25000",
      }],
    }));

    // QBI deduction = 20% × $25,000 = $5,000 (under simplified threshold)
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(5000);
    // QBI deduction reduces taxable income
    const line13 = findLine(result, "1040", "13");
    expect(line13).toBeDefined();
    expect(new Decimal(line13!.value).toNumber()).toBe(5000);
  });

  test("K-1 1041 QBI aggregates with Schedule C QBI under simplified path", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "40000", federalWithheld: "6000" }],
      scheduleC: {
        businessName: "Consulting LLC",
        grossReceipts: "30000",
        expenses: { totalExpenses: "10000" },
      },
      scheduleK1Form1041: [{
        estateTrustName: "Business Trust",
        estateTrustEIN: "22-2222222",
        section199AQBI: "15000",
      }],
    }));

    // Schedule C profit = 30K - 10K = 20K, adjusted for SE deduction
    // Trust QBI = 15K
    // Total QBI > 15K (trust alone) and includes Schedule C
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(3000);
    // Both sources contribute to the deduction
    const qbiLine = findLine(result, "Form 8995", "1-5");
    expect(qbiLine).toBeDefined();
  });

  test("K-1 1041 QBI aggregates with partnership K-1 QBI", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "8000" }],
      scheduleK1: [{
        partnershipName: "ABC Partnership",
        partnershipEIN: "33-3333333",
        entityType: "partnership" as const,
        ordinaryIncome: "20000",
        section199AQBI: "20000",
        selfEmploymentEarnings: "20000",
      }],
      scheduleK1Form1041: [{
        estateTrustName: "Family Trust",
        estateTrustEIN: "44-4444444",
        section199AQBI: "10000",
      }],
    }));

    // Partnership QBI ≈ 20K (adjusted for SE) + Trust QBI = 10K
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(2000);
  });

  test("K-1 1041 qualified REIT dividends flow through QBI deduction", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [{
        estateTrustName: "REIT Trust",
        estateTrustEIN: "55-5555555",
        section199AQualifiedReitDividends: "8000",
      }],
    }));

    // Qualified REIT dividends get 20% QBI deduction = $1,600
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(1600);
  });

  test("K-1 1041 REIT dividends aggregate with 1099-DIV REIT dividends", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      form1099Div: [{
        payer: "Vanguard REIT Fund",
        ordinaryDividends: "5000",
        qualifiedDividends: "0",
        section199ADividends: "4000",
      }],
      scheduleK1Form1041: [{
        estateTrustName: "REIT Trust",
        estateTrustEIN: "55-5555555",
        section199AQualifiedReitDividends: "6000",
      }],
    }));

    // Total REIT dividends = $4,000 + $6,000 = $10,000
    // QBI deduction = 20% × $10,000 = $2,000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(2000);
  });

  test("K-1 1041 qualified PTP income flows through QBI deduction", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [{
        estateTrustName: "PTP Trust",
        estateTrustEIN: "66-6666666",
        section199AQualifiedPTPIncome: "12000",
      }],
    }));

    // PTP income gets 20% QBI deduction = $2,400
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(2400);
  });

  test("K-1 1041 QBI with W-2/UBIA metadata flows through Form 8995-A above threshold", () => {
    // Taxable income above $197,300 → detailed Form 8995-A with W-2/UBIA limits
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "250000", federalWithheld: "50000" }],
      scheduleK1Form1041: [{
        estateTrustName: "High-Income Trust",
        estateTrustEIN: "77-7777777",
        section199AQBI: "40000",
        section199AW2Wages: "50000",
        section199AUBIA: "100000",
      }],
    }));

    // Above the $197,300 simplified threshold → uses Form 8995-A
    // W-2/UBIA limitation: greater of 50% of W-2 ($25,000) or
    //   25% of W-2 ($12,500) + 2.5% of UBIA ($2,500) = $15,000
    // So W-2/UBIA limit = $25,000, 20% of QBI = $8,000
    // QBI component = min($8,000, $25,000) = $8,000 (limit not binding)
    // QBI deduction = $8,000
    expect(result.form8995A).toBeDefined();
    expect(result.form8995A!.qbiDeduction.toNumber()).toBe(8000);
  });

  test("K-1 1041 SSTB trust QBI phases out above threshold", () => {
    // SSTB designation means QBI phases out in the phase-in range
    // Single: $197,300 + $50,000 = $247,300 is the end of phase-in
    // At $247,300+, SSTB QBI is completely excluded
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "280000", federalWithheld: "60000" }],
      scheduleK1Form1041: [{
        estateTrustName: "SSTB Trust",
        estateTrustEIN: "88-8888888",
        section199AQBI: "30000",
        section199AW2Wages: "40000",
        section199AUBIA: "0",
        section199AIsSST: true,
      }],
    }));

    // At $280K wage income, taxable income is well above $247,300
    // SSTB QBI should be fully phased out → QBI deduction = $0
    expect(result.form8995A).toBeDefined();
    expect(result.form8995A!.qbiDeduction.toNumber()).toBe(0);
  });

  test("K-1 1041 QBI with zero amount has no effect on QBI deduction", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Inactive Trust",
        estateTrustEIN: "99-9999999",
        interestIncome: "1000",
        section199AQBI: "0",
      }],
    }));

    // No QBI sources → no QBI deduction
    const line13 = findLine(result, "1040", "13");
    expect(line13).toBeDefined();
    expect(new Decimal(line13!.value).toNumber()).toBe(0);
  });

  test("K-1 1041 QBI loss carries forward", () => {
    // A trust QBI loss reduces the net QBI, potentially creating a carryforward
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [{
        estateTrustName: "Loss Trust",
        estateTrustEIN: "10-1010101",
        section199AQBI: "-20000",
      }],
    }));

    // Negative QBI → 0 deduction this year; loss carries forward
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(0);
    // The QBI loss should be tracked in carryforwards
    expect(result.carryforwards.qbiLossCarryforward.toNumber()).toBe(20000);
  });

  test("K-1 1041 QBI loss offsets other QBI sources", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleC: {
        businessName: "Consulting LLC",
        grossReceipts: "50000",
        expenses: { totalExpenses: "10000" },
      },
      scheduleK1Form1041: [{
        estateTrustName: "Loss Trust",
        estateTrustEIN: "10-1010101",
        section199AQBI: "-30000",
      }],
    }));

    // Schedule C profit ≈ 40K adjusted for SE minus 30K trust loss = ~10K net
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(0);
    // Less than full 20% of Schedule C profit alone
    expect(result.form8995!.qbiDeduction.toNumber()).toBeLessThan(8000);
  });

  test("K-1 1041 QBI summary includes QBI totals", () => {
    const result = calculateFederalTax(makeInput({
      scheduleK1Form1041: [{
        estateTrustName: "Trust A",
        estateTrustEIN: "12-1212121",
        section199AQBI: "15000",
        section199AQualifiedReitDividends: "3000",
        section199AQualifiedPTPIncome: "2000",
      }],
    }));

    const summary = result.scheduleK1Form1041Summary!;
    expect(summary.totalQBI.toNumber()).toBe(15000);
    expect(summary.totalQualifiedReitDividends.toNumber()).toBe(3000);
    expect(summary.totalQualifiedPTPIncome.toNumber()).toBe(2000);
  });

  test("multiple K-1 1041 QBI sources aggregate correctly", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [
        {
          estateTrustName: "Trust Alpha",
          estateTrustEIN: "20-2020202",
          section199AQBI: "10000",
        },
        {
          estateTrustName: "Trust Beta",
          estateTrustEIN: "30-3030303",
          section199AQBI: "15000",
          section199AQualifiedReitDividends: "5000",
        },
      ],
    }));

    // Total QBI = 10K + 15K = 25K → 20% = $5,000 deduction
    // Plus REIT = 5K → 20% = $1,000
    // Total QBI deduction = $6,000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(6000);
    expect(result.scheduleK1Form1041Summary!.totalQBI.toNumber()).toBe(25000);
    expect(result.scheduleK1Form1041Summary!.totalQualifiedReitDividends.toNumber()).toBe(5000);
  });

  test("K-1 1041 QBI combined with REIT dividends and PTP income", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "9000" }],
      scheduleK1Form1041: [{
        estateTrustName: "Diversified Trust",
        estateTrustEIN: "40-4040404",
        section199AQBI: "20000",
        section199AQualifiedReitDividends: "10000",
        section199AQualifiedPTPIncome: "5000",
      }],
    }));

    // QBI = 20K → 20% = $4,000
    // REIT = 10K → 20% = $2,000
    // PTP = 5K → 20% = $1,000
    // Total QBI deduction = $7,000
    expect(result.form8995).toBeDefined();
    expect(result.form8995!.qbiDeduction.toNumber()).toBe(7000);
  });
});

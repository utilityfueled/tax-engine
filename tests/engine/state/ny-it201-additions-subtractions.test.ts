/**
 * Tests for New York IT-201 additions, subtractions, and NY AGI computation.
 * Spec: spec/state/ny-it201-additions-subtractions.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201AdditionsSubtractions,
  type NYIT201AdditionsSubtractionsInput,
} from "@/engine/state/ny-it201-additions-subtractions.js";

const d = (value: string | number) => new Decimal(value);

/** Shorthand for 2025 computations */
const compute = (overrides: Partial<NYIT201AdditionsSubtractionsInput> = {}) =>
  calculateNYIT201AdditionsSubtractions({
    federalAgi: 100000,
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  });

describe("NY IT-201 additions, subtractions, and NY AGI", () => {
  /* ========== Line 19: Federal AGI ========== */

  it("Line 19 - federal AGI flows through as starting point", () => {
    const result = compute({ federalAgi: 85000 });
    expect(result.federalAgi.toNumber()).toBe(85000);
  });

  /* ========== Additions (lines 20-23) ========== */

  it("Line 20 - out-of-state muni bond interest added back", () => {
    const result = compute({ outOfStateMuniBondInterest: 3500 });
    expect(result.line20.toNumber()).toBe(3500);
    expect(result.totalAdditions.toNumber()).toBe(3500);
  });

  it("Line 21 - 414(h) retirement contributions added", () => {
    const result = compute({ publicEmployee414hContributions: 4200 });
    expect(result.line21.toNumber()).toBe(4200);
    expect(result.totalAdditions.toNumber()).toBe(4200);
  });

  it("Line 22 - 529 non-qualified distributions added", () => {
    const result = compute({ nonQualified529Distributions: 5000 });
    expect(result.line22.toNumber()).toBe(5000);
    expect(result.totalAdditions.toNumber()).toBe(5000);
  });

  it("Line 23 - other additions combines NYC flexible benefits and IT-225 passthrough", () => {
    const result = compute({
      nycFlexibleSpendingContributions: 2850,
      otherAdditions: 1500,
    });
    expect(result.line23.toNumber()).toBe(4350);
    expect(result.totalAdditions.toNumber()).toBe(4350);
  });

  it("Line 24 - total additions is sum of lines 20-23", () => {
    const result = compute({
      outOfStateMuniBondInterest: 1000,
      publicEmployee414hContributions: 2000,
      nycFlexibleSpendingContributions: 500,
      nonQualified529Distributions: 300,
      otherAdditions: 700,
    });
    expect(result.totalAdditions.toNumber()).toBe(4500);
  });

  it("Line 24 - no additions yields zero total", () => {
    const result = compute();
    expect(result.totalAdditions.toNumber()).toBe(0);
  });

  /* ========== Subtractions (lines 25-31) ========== */

  it("Line 25 - state/local tax refunds subtracted", () => {
    const result = compute({ stateLocalTaxRefunds: 2500 });
    expect(result.line25.toNumber()).toBe(2500);
    expect(result.totalSubtractions.toNumber()).toBe(2500);
  });

  it("Line 26 - government pension income subtracted", () => {
    const result = compute({ governmentPensionIncome: 45000 });
    expect(result.line26.toNumber()).toBe(45000);
    expect(result.totalSubtractions.toNumber()).toBe(45000);
  });

  it("Line 27 - taxable SS benefits subtracted", () => {
    const result = compute({ taxableSocialSecurityBenefits: 12000 });
    expect(result.line27.toNumber()).toBe(12000);
    expect(result.totalSubtractions.toNumber()).toBe(12000);
  });

  it("Line 28 - US government bond interest subtracted", () => {
    const result = compute({ usGovernmentBondInterest: 3000 });
    expect(result.line28.toNumber()).toBe(3000);
    expect(result.totalSubtractions.toNumber()).toBe(3000);
  });

  /* ---------- Line 29: Pension exclusion ---------- */

  it("Line 29 - pension exclusion capped at $20,000", () => {
    const result = compute({
      pensionExclusion: { nonGovernmentPensionIncome: 35000, isAge59AndHalf: true },
    });
    expect(result.line29.toNumber()).toBe(20000);
  });

  it("Line 29 - pension exclusion uses actual amount when under cap", () => {
    const result = compute({
      pensionExclusion: { nonGovernmentPensionIncome: 12000, isAge59AndHalf: true },
    });
    expect(result.line29.toNumber()).toBe(12000);
  });

  it("Line 29 - no exclusion when under age 59½", () => {
    const result = compute({
      pensionExclusion: { nonGovernmentPensionIncome: 30000, isAge59AndHalf: false },
    });
    expect(result.line29.toNumber()).toBe(0);
  });

  it("Line 29 - no exclusion when no pension detail provided", () => {
    const result = compute();
    expect(result.line29.toNumber()).toBe(0);
  });

  it("Line 29 - MFJ both spouses qualify: each can exclude up to $20,000", () => {
    const result = compute({
      filingStatus: "married_filing_jointly",
      pensionExclusion: { nonGovernmentPensionIncome: 25000, isAge59AndHalf: true },
      spousePensionExclusion: { nonGovernmentPensionIncome: 18000, isAge59AndHalf: true },
    });
    // Primary: min(25000, 20000) = 20000; Spouse: min(18000, 20000) = 18000; Total: 38000
    expect(result.line29.toNumber()).toBe(38000);
  });

  it("Line 29 - MFJ one spouse under 59½: only qualifying spouse gets exclusion", () => {
    const result = compute({
      filingStatus: "married_filing_jointly",
      pensionExclusion: { nonGovernmentPensionIncome: 15000, isAge59AndHalf: true },
      spousePensionExclusion: { nonGovernmentPensionIncome: 25000, isAge59AndHalf: false },
    });
    expect(result.line29.toNumber()).toBe(15000);
  });

  it("Line 29 - spouse exclusion ignored for non-MFJ filing status", () => {
    const result = compute({
      filingStatus: "single",
      pensionExclusion: { nonGovernmentPensionIncome: 10000, isAge59AndHalf: true },
      spousePensionExclusion: { nonGovernmentPensionIncome: 20000, isAge59AndHalf: true },
    });
    // Single filer: spouse exclusion ignored
    expect(result.line29.toNumber()).toBe(10000);
  });

  it("Line 29 - zero pension income yields zero exclusion even if age qualifies", () => {
    const result = compute({
      pensionExclusion: { nonGovernmentPensionIncome: 0, isAge59AndHalf: true },
    });
    expect(result.line29.toNumber()).toBe(0);
  });

  /* ---------- Line 30: College tuition deduction ---------- */

  it("Line 30 - college tuition deduction capped at $10,000 per student", () => {
    const result = compute({
      collegeTuitionStudents: [{ tuitionPaid: 15000 }],
    });
    expect(result.line30.toNumber()).toBe(10000);
  });

  it("Line 30 - tuition under cap uses actual amount", () => {
    const result = compute({
      collegeTuitionStudents: [{ tuitionPaid: 7500 }],
    });
    expect(result.line30.toNumber()).toBe(7500);
  });

  it("Line 30 - multiple students each capped separately", () => {
    const result = compute({
      collegeTuitionStudents: [
        { tuitionPaid: 12000 },
        { tuitionPaid: 8000 },
        { tuitionPaid: 25000 },
      ],
    });
    // min(12000,10000) + min(8000,10000) + min(25000,10000) = 10000 + 8000 + 10000 = 28000
    expect(result.line30.toNumber()).toBe(28000);
  });

  it("Line 30 - no students yields zero deduction", () => {
    const result = compute();
    expect(result.line30.toNumber()).toBe(0);
  });

  it("Line 30 - zero tuition yields zero deduction", () => {
    const result = compute({
      collegeTuitionStudents: [{ tuitionPaid: 0 }],
    });
    expect(result.line30.toNumber()).toBe(0);
  });

  it("Line 31 - other subtractions from IT-225 passthrough", () => {
    const result = compute({ otherSubtractions: 4000 });
    expect(result.line31.toNumber()).toBe(4000);
    expect(result.totalSubtractions.toNumber()).toBe(4000);
  });

  it("Line 32 - total subtractions is sum of lines 25-31", () => {
    const result = compute({
      stateLocalTaxRefunds: 1000,
      governmentPensionIncome: 5000,
      taxableSocialSecurityBenefits: 3000,
      usGovernmentBondInterest: 500,
      pensionExclusion: { nonGovernmentPensionIncome: 8000, isAge59AndHalf: true },
      collegeTuitionStudents: [{ tuitionPaid: 6000 }],
      otherSubtractions: 2000,
    });
    // 1000 + 5000 + 3000 + 500 + 8000 + 6000 + 2000 = 25500
    expect(result.totalSubtractions.toNumber()).toBe(25500);
  });

  it("Line 32 - no subtractions yields zero total", () => {
    const result = compute();
    expect(result.totalSubtractions.toNumber()).toBe(0);
  });

  /* ========== Line 33: NY AGI ========== */

  it("Line 33 - NY AGI = federal AGI + additions - subtractions", () => {
    const result = compute({
      federalAgi: 100000,
      outOfStateMuniBondInterest: 2000,
      publicEmployee414hContributions: 3000,
      taxableSocialSecurityBenefits: 8000,
      usGovernmentBondInterest: 1000,
    });
    // NY AGI = 100000 + (2000 + 3000) - (8000 + 1000) = 100000 + 5000 - 9000 = 96000
    expect(result.nyAgi.toNumber()).toBe(96000);
  });

  it("Line 33 - no additions or subtractions: NY AGI equals federal AGI", () => {
    const result = compute({ federalAgi: 75000 });
    expect(result.nyAgi.toNumber()).toBe(75000);
  });

  it("Line 33 - large subtractions make NY AGI lower than federal", () => {
    const result = compute({
      federalAgi: 80000,
      governmentPensionIncome: 50000,
      taxableSocialSecurityBenefits: 15000,
    });
    // 80000 + 0 - 65000 = 15000
    expect(result.nyAgi.toNumber()).toBe(15000);
  });

  it("Line 33 - NY AGI can be negative when subtractions exceed AGI", () => {
    const result = compute({
      federalAgi: 20000,
      governmentPensionIncome: 25000,
    });
    // 20000 + 0 - 25000 = -5000
    expect(result.nyAgi.toNumber()).toBe(-5000);
  });

  it("Line 33 - additions increase NY AGI above federal", () => {
    const result = compute({
      federalAgi: 60000,
      outOfStateMuniBondInterest: 5000,
      publicEmployee414hContributions: 4000,
    });
    // 60000 + 9000 - 0 = 69000
    expect(result.nyAgi.toNumber()).toBe(69000);
  });

  /* ========== Comprehensive scenario ========== */

  it("comprehensive MFJ scenario with multiple additions and subtractions", () => {
    const result = compute({
      federalAgi: 150000,
      filingStatus: "married_filing_jointly",
      outOfStateMuniBondInterest: 2000,
      publicEmployee414hContributions: 5000,
      nycFlexibleSpendingContributions: 1200,
      stateLocalTaxRefunds: 3000,
      governmentPensionIncome: 30000,
      taxableSocialSecurityBenefits: 10000,
      usGovernmentBondInterest: 800,
      pensionExclusion: { nonGovernmentPensionIncome: 15000, isAge59AndHalf: true },
      spousePensionExclusion: { nonGovernmentPensionIncome: 22000, isAge59AndHalf: true },
      collegeTuitionStudents: [{ tuitionPaid: 9000 }, { tuitionPaid: 12000 }],
      otherSubtractions: 1500,
    });

    // Additions: 2000 + 5000 + 1200 + 0 + 0 = 8200
    expect(result.totalAdditions.toNumber()).toBe(8200);

    // Subtractions:
    // 25: 3000
    // 26: 30000
    // 27: 10000
    // 28: 800
    // 29: min(15000,20000) + min(22000,20000) = 15000 + 20000 = 35000
    // 30: min(9000,10000) + min(12000,10000) = 9000 + 10000 = 19000
    // 31: 1500
    // Total: 3000 + 30000 + 10000 + 800 + 35000 + 19000 + 1500 = 99300
    expect(result.line29.toNumber()).toBe(35000);
    expect(result.line30.toNumber()).toBe(19000);
    expect(result.totalSubtractions.toNumber()).toBe(99300);

    // NY AGI = 150000 + 8200 - 99300 = 58900
    expect(result.nyAgi.toNumber()).toBe(58900);
  });

  /* ========== Audit trail ========== */

  it("audit trail records all addition and subtraction lines", () => {
    const result = compute({
      outOfStateMuniBondInterest: 100,
      stateLocalTaxRefunds: 200,
    });
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("19");
    expect(lineNumbers).toContain("20");
    expect(lineNumbers).toContain("21");
    expect(lineNumbers).toContain("22");
    expect(lineNumbers).toContain("23");
    expect(lineNumbers).toContain("24");
    expect(lineNumbers).toContain("25");
    expect(lineNumbers).toContain("26");
    expect(lineNumbers).toContain("27");
    expect(lineNumbers).toContain("28");
    expect(lineNumbers).toContain("29");
    expect(lineNumbers).toContain("30");
    expect(lineNumbers).toContain("31");
    expect(lineNumbers).toContain("32");
    expect(lineNumbers).toContain("33");
  });

  /* ========== Error handling ========== */

  it("unsupported tax year throws a clear error", () => {
    expect(() =>
      compute({ taxYear: 2024 })
    ).toThrow("NY IT-201 additions/subtractions not available for tax year 2024");
  });
});

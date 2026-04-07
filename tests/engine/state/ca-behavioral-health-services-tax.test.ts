/**
 * Tests for California Behavioral Health Services Tax.
 * Spec: spec/state/ca-behavioral-health-services-tax.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCABehavioralHealthServicesTax } from "@/engine/state/ca-behavioral-health-services-tax.js";

const d = (value: string | number) => new Decimal(value);

describe("California Behavioral Health Services Tax", () => {
  it("CA BHST Line 1 - resident taxable income flows into the worksheet base", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1250000),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.taxableIncomeBase.toNumber()).toBe(1250000);
  });

  it("CA BHST Line 2 - the threshold stays at $1,000,000 even for married filing separately", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1200000),
      taxYear: 2025,
      filingStatus: "married_filing_separately",
      returnType: "resident",
    });

    expect(result.threshold.toNumber()).toBe(1000000);
    expect(result.excessTaxableIncome.toNumber()).toBe(200000);
    expect(result.tax.toNumber()).toBe(2000);
  });

  it("CA BHST Line 3 - income below the threshold floors the excess at zero", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(999999),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("CA BHST Line 4 - the worksheet uses a flat 1% rate", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1100000),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.rate.toString()).toBe("0.01");
  });

  it("CA BHST Line 5 - nonresident California source taxable income above the threshold produces the same 1% tax", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1350000),
      taxYear: 2025,
      returnType: "nonresident",
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(350000);
    expect(result.tax.toNumber()).toBe(3500);
  });

  it("CA BHST - exactly $1,000,000 produces zero tax", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1000000),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("CA BHST - $1 over the threshold rounds the tax down to $0", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1000001),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(1);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("CA BHST - $50 over the threshold rounds the tax up to $1", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1000050),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(50);
    expect(result.tax.toNumber()).toBe(1);
  });

  it("CA BHST - audit trail records all 5 worksheet lines", () => {
    const result = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1250000),
      taxYear: 2025,
      returnType: "resident",
    });

    expect(result.lines).toHaveLength(5);
    expect(result.lines.map((line) => line.line)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("CA BHST - audit trail preserves whether the resident or nonresident worksheet path was used", () => {
    const residentResult = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1250000),
      taxYear: 2025,
      returnType: "resident",
    });
    const nonresidentResult = calculateCABehavioralHealthServicesTax({
      taxableIncome: d(1350000),
      taxYear: 2025,
      returnType: "nonresident",
    });

    expect(residentResult.lines[0]?.inputs).toMatchObject({
      "Return type": "resident",
      "Source line": "Form 540 line 19",
    });
    expect(residentResult.lines[4]?.inputs).toMatchObject({
      "Return type": "resident",
    });

    expect(nonresidentResult.lines[0]?.inputs).toMatchObject({
      "Return type": "nonresident",
      "Source line": "Form 540NR line 35",
    });
    expect(nonresidentResult.lines[4]?.inputs).toMatchObject({
      "Return type": "nonresident",
    });
  });

  it("CA BHST - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCABehavioralHealthServicesTax({
        taxableIncome: d(1250000),
        taxYear: 2024,
        returnType: "resident",
      })
    ).toThrow("CA Behavioral Health Services Tax constants not available for 2024");
  });
});

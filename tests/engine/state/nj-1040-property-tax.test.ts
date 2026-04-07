/**
 * Tests for New Jersey NJ-1040 property tax benefit.
 * Spec: spec/state/nj-1040-property-tax.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateNJ1040PropertyTax,
  type NJ1040PropertyTaxInput,
} from "@/engine/state/nj-1040-property-tax.js";

describe("NJ-1040 property tax benefit", () => {
  // --- Homeowner deduction ---

  it("NJ-1040 property tax homeowner deduction for $8,000 property tax", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 8000,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(8000);
    expect(result.deductionAmount.toNumber()).toBe(8000);
  });

  it("NJ-1040 property tax homeowner deduction caps at $15,000", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 22000,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(22000);
    expect(result.deductionAmount.toNumber()).toBe(15000);
  });

  it("NJ-1040 property tax homeowner with exactly $15,000 gets full deduction", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 15000,
    });
    expect(result.deductionAmount.toNumber()).toBe(15000);
  });

  it("NJ-1040 property tax homeowner with zero property tax", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 0,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(0);
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax MFS same-home deduction caps at $7,500", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "married_filing_separately",
      sharedMainHomeWithSpouse: true,
      isHomeowner: true,
      propertyTaxesPaid: 9000,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(9000);
    expect(result.deductionAmount.toNumber()).toBe(7500);
  });

  // --- Tenant deduction ---

  it("NJ-1040 property tax tenant deduction is 18% of rent", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isTenant: true,
      rentPaid: 24000,
    });
    // 18% of $24,000 = $4,320
    expect(result.propertyTaxAmount.toNumber()).toBe(4320);
    expect(result.deductionAmount.toNumber()).toBe(4320);
  });

  it("NJ-1040 property tax tenant 18% of high rent caps at $15,000", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isTenant: true,
      rentPaid: 100000,
    });
    // 18% of $100,000 = $18,000, capped at $15,000
    expect(result.propertyTaxAmount.toNumber()).toBe(18000);
    expect(result.deductionAmount.toNumber()).toBe(15000);
  });

  it("NJ-1040 property tax tenant with zero rent", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isTenant: true,
      rentPaid: 0,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(0);
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax tenant rent at cap boundary - 18% of $83,333.33", () => {
    // 18% of $83,333.33 = $14,999.9994 → rounds to $15,000
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isTenant: true,
      rentPaid: 83334,
    });
    // 18% of $83,334 = $15,000.12, capped at $15,000
    expect(result.deductionAmount.toNumber()).toBe(15000);
  });

  // --- Property tax credit ---

  it("NJ-1040 property tax credit is $50 when eligible", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 5000,
      njGrossIncome: 100000,
      electCredit: true,
    });
    expect(result.creditAmount.toNumber()).toBe(50);
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax credit eligible at $250,000 income", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 5000,
      njGrossIncome: 250000,
      electCredit: true,
    });
    expect(result.creditEligible).toBe(true);
    expect(result.creditAmount.toNumber()).toBe(50);
  });

  it("NJ-1040 property tax credit ineligible above $250,000 income", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 5000,
      njGrossIncome: 250001,
      electCredit: true,
    });
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax deduction unavailable below filing threshold for non-senior filer", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isHomeowner: true,
      propertyTaxesPaid: 5000,
      njGrossIncome: 9000,
    });
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax credit allowed for age-65 filer below filing threshold", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isHomeowner: true,
      propertyTaxesPaid: 5000,
      njGrossIncome: 9000,
      taxpayerAge65OrOlder: true,
      electCredit: true,
    });
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(true);
    expect(result.creditAmount.toNumber()).toBe(50);
  });

  it("NJ-1040 property tax credit for tenant", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isTenant: true,
      rentPaid: 18000,
      njGrossIncome: 50000,
      electCredit: true,
    });
    expect(result.creditEligible).toBe(true);
    expect(result.creditAmount.toNumber()).toBe(50);
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax credit is $25 for MFS spouses in the same home", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "married_filing_separately",
      sharedMainHomeWithSpouse: true,
      isHomeowner: true,
      propertyTaxesPaid: 7000,
      njGrossIncome: 40000,
      electCredit: true,
    });
    expect(result.creditEligible).toBe(true);
    expect(result.creditAmount.toNumber()).toBe(25);
  });

  it("NJ-1040 property tax credit is prorated for part-year residents", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      monthsOfResidency: 6,
      isTenant: true,
      rentPaid: 18000,
      njGrossIncome: 40000,
      electCredit: true,
    });
    expect(result.creditAmount.toNumber()).toBe(25);
  });

  it("NJ-1040 property tax disabled-veteran exemption makes homeowner ineligible for deduction and credit", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isHomeowner: true,
      propertyTaxesPaid: 9000,
      njGrossIncome: 60000,
      hasDisabledVeteranPropertyTaxExemption: true,
      electCredit: true,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(9000);
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax PILOT payments make homeowner ineligible for deduction and credit", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isHomeowner: true,
      propertyTaxesPaid: 9000,
      njGrossIncome: 60000,
      madePilotPayments: true,
      electCredit: true,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(9000);
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax tax-exempt rental makes tenant ineligible for deduction and credit", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isTenant: true,
      rentPaid: 18000,
      njGrossIncome: 60000,
      rentedTaxExemptProperty: true,
      electCredit: true,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(3240);
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax mixed homeowner and tenant status combines both amounts", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      isTenant: true,
      propertyTaxesPaid: 4000,
      rentPaid: 10000,
    });
    // Worksheet G line 10 = homeowner property tax + (18% of rent)
    // = $4,000 + $1,800 = $5,800
    expect(result.propertyTaxAmount.toNumber()).toBe(5800);
    expect(result.deductionAmount.toNumber()).toBe(5800);
  });

  it("NJ-1040 property tax mixed homeowner and tenant credit remains available", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      filingStatus: "single",
      isHomeowner: true,
      isTenant: true,
      propertyTaxesPaid: 4000,
      rentPaid: 10000,
      njGrossIncome: 40000,
      electCredit: true,
    });
    expect(result.creditEligible).toBe(true);
    expect(result.creditAmount.toNumber()).toBe(50);
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  // --- Default election (deduction) ---

  it("NJ-1040 property tax defaults to deduction when property taxes exist", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 10000,
    });
    expect(result.electedDeduction).toBe(true);
    expect(result.deductionAmount.toNumber()).toBe(10000);
    expect(result.creditAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax credit election zeroes out deduction", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 10000,
      njGrossIncome: 100000,
      electCredit: true,
    });
    expect(result.electedDeduction).toBe(false);
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditAmount.toNumber()).toBe(50);
  });

  // --- Neither homeowner nor tenant ---

  it("NJ-1040 property tax no benefit when neither homeowner nor tenant", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
    });
    expect(result.propertyTaxAmount.toNumber()).toBe(0);
    expect(result.deductionAmount.toNumber()).toBe(0);
    expect(result.creditAmount.toNumber()).toBe(0);
    expect(result.creditEligible).toBe(false);
  });

  // --- Edge cases ---

  it("NJ-1040 property tax credit election with income over limit falls back to zero credit", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 10000,
      njGrossIncome: 300000,
      electCredit: true,
    });
    // Elected credit but not eligible — credit is $0
    expect(result.creditEligible).toBe(false);
    expect(result.creditAmount.toNumber()).toBe(0);
    // Deduction is also $0 since credit was elected
    expect(result.deductionAmount.toNumber()).toBe(0);
  });

  it("NJ-1040 property tax small property tax amount", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 100,
    });
    expect(result.deductionAmount.toNumber()).toBe(100);
  });

  // --- Audit trail ---

  it("NJ-1040 property tax audit trail records all computed lines", () => {
    const result = calculateNJ1040PropertyTax({
      taxYear: 2025,
      isHomeowner: true,
      propertyTaxesPaid: 12000,
      njGrossIncome: 80000,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("property-tax-paid");
    expect(lineIds).toContain("deduction-amount");
    expect(lineIds).toContain("credit-eligible");
  });
});

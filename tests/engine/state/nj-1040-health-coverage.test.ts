/**
 * Tests for New Jersey Health Insurance Mandate — Shared Responsibility Payment.
 * Spec: spec/state/nj-1040-health-coverage.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNJ1040HealthCoverage,
  type NJ1040HealthCoverageInput,
} from "@/engine/state/nj-1040-health-coverage.js";

const d = (value: string | number) => new Decimal(value);

/** Helper: default input with full coverage (no penalty) */
function defaultInput(
  overrides: Partial<NJ1040HealthCoverageInput> = {}
): NJ1040HealthCoverageInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalIncome: 50000,
    adults: 1,
    children: 0,
    uncoveredMonths: 0,
    ...overrides,
  };
}

describe("NJ-1040 health coverage", () => {
  // --- Full coverage → no penalty ---

  it("NJ-1040 health coverage - fully covered household owes $0", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({ uncoveredMonths: 0 })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
  });

  // --- Short coverage gap exemption ---

  it("NJ-1040 health coverage - 1 month gap is exempt (short gap)", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({ uncoveredMonths: 1 })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
  });

  it("NJ-1040 health coverage - 2 month gap is exempt (short gap)", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({ uncoveredMonths: 2 })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
  });

  it("NJ-1040 health coverage - 3 month gap triggers penalty", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({ uncoveredMonths: 3 })
    );
    expect(result.sharedResponsibilityPayment.greaterThan(0)).toBe(true);
  });

  // --- Flat dollar penalty ---

  it("NJ-1040 health coverage - flat dollar penalty for single adult", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 15000, // low income → flat dollar will be used
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695 × 1 = $695
    // Income: 2.5% × ($15,000 - $10,000) = $125
    // Penalty = max($695, $125) = $695
    // Bronze cap: $9,012 × 1 = $9,012
    // Final = min($695, $9,012) = $695
    expect(result.flatDollarAmount.toNumber()).toBe(695);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(695);
  });

  it("NJ-1040 health coverage - flat dollar penalty for family with children", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 25000,
        adults: 2,
        children: 2,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695 × 2 + $347.50 × 2 = $1,390 + $695 = $2,085
    // This equals the max flat ($2,085), so it's at the cap
    expect(result.flatDollarAmount.toNumber()).toBe(2085);
  });

  it("NJ-1040 health coverage - flat dollar caps at $2,085", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 25000,
        adults: 2,
        children: 5,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695 × 2 + $347.50 × 5 = $1,390 + $1,737.50 = $3,127.50
    // Capped at $2,085
    expect(result.flatDollarAmount.toNumber()).toBe(2085);
  });

  it("NJ-1040 health coverage - child penalty is half adult", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 12000,
        adults: 0,
        children: 1,
        uncoveredMonths: 12,
      })
    );
    // Flat: $347.50 × 1 = $347.50 → rounded to $348
    // Income: 2.5% × ($12,000 - $10,000) = $50
    // Penalty = max($347.50, $50) = $347.50 → rounds to $348
    expect(result.flatDollarAmount.toNumber()).toBe(347.5);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(348);
  });

  // --- Income-based penalty ---

  it("NJ-1040 health coverage - income-based penalty for income above threshold", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 100000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695
    // Income: 2.5% × ($100,000 - $10,000) = $2,250
    // Penalty = max($695, $2,250) = $2,250
    // Bronze cap: $9,012
    // Final = min($2,250, $9,012) = $2,250
    expect(result.incomeBasedAmount.toNumber()).toBe(2250);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(2250);
  });

  it("NJ-1040 health coverage - household income includes tax-exempt interest and dependent income", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 60000,
        taxExemptInterest: 8000,
        dependentIncome: 12000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Household income = $60,000 + $8,000 + $12,000 = $80,000
    // Income-based penalty = 2.5% × ($80,000 - $10,000) = $1,750
    expect(result.householdIncome.toNumber()).toBe(80000);
    expect(result.incomeBasedAmount.toNumber()).toBe(1750);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1750);
  });

  it("NJ-1040 health coverage - income below filing threshold produces $0 income-based", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 8000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × max(0, $8,000 - $10,000) = $0
    // Flat: $695
    // Penalty = max($695, $0) = $695
    expect(result.incomeBasedAmount.toNumber()).toBe(0);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(695);
  });

  it("NJ-1040 health coverage - MFJ filing threshold is $20,000", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 70000,
        adults: 2,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($70,000 - $20,000) = $1,250
    // Flat: $695 × 2 = $1,390
    // Penalty = max($1,390, $1,250) = $1,390
    expect(result.incomeBasedAmount.toNumber()).toBe(1250);
    expect(result.flatDollarAmount.toNumber()).toBe(1390);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1390);
  });

  it("NJ-1040 health coverage - high income uses income-based over flat", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 200000,
        adults: 2,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($200,000 - $20,000) = $4,500
    // Flat: $695 × 2 = $1,390
    // Penalty = max($1,390, $4,500) = $4,500
    // Bronze cap: $9,012 × 2 = $18,024
    // Final = min($4,500, $18,024) = $4,500
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(4500);
  });

  // --- Bronze plan cap ---

  it("NJ-1040 health coverage - penalty capped at bronze plan cost", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 500000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($500,000 - $10,000) = $12,250
    // Flat: $695
    // Penalty = max($695, $12,250) = $12,250
    // Bronze cap: $9,012 × 1 = $9,012
    // Final = min($12,250, $9,012) = $9,012
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(9012);
    expect(result.bronzePlanCap.toNumber()).toBe(9012);
  });

  it("NJ-1040 health coverage - bronze cap scales with household size", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 500000,
        adults: 2,
        children: 3,
        uncoveredMonths: 12,
      })
    );
    // Bronze cap: $9,012 × 5 = $45,060
    expect(result.bronzePlanCap.toNumber()).toBe(45060);
  });

  // --- Monthly proration ---

  it("NJ-1040 health coverage - penalty prorated for partial year", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 50000,
        adults: 1,
        children: 0,
        uncoveredMonths: 6,
      })
    );
    // Annual penalty: max($695, 2.5%×$40,000=$1,000) = $1,000
    // Prorated: $1,000 × 6/12 = $500
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(500);
  });

  it("NJ-1040 health coverage - 3 months uncovered prorates to 3/12", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 50000,
        adults: 1,
        children: 0,
        uncoveredMonths: 3,
      })
    );
    // Annual penalty: max($695, $1,000) = $1,000
    // Prorated: $1,000 × 3/12 = $250
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(250);
  });

  it("NJ-1040 health coverage - full year uninsured single filer", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 50000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695
    // Income: 2.5% × ($50,000 - $10,000) = $1,000
    // Penalty = max($695, $1,000) = $1,000
    // Bronze: $9,012
    // Final = $1,000
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1000);
  });

  // --- Filing status thresholds ---

  it("NJ-1040 health coverage - HOH uses $10,000 threshold", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "head_of_household",
        totalIncome: 60000,
        adults: 1,
        children: 1,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($60,000 - $10,000) = $1,250
    // Flat: $695 + $347.50 = $1,042.50
    // Penalty = max($1,042.50, $1,250) = $1,250
    expect(result.incomeBasedAmount.toNumber()).toBe(1250);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1250);
  });

  it("NJ-1040 health coverage - MFS uses $10,000 threshold", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_separately",
        totalIncome: 50000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($50,000 - $10,000) = $1,000
    expect(result.incomeBasedAmount.toNumber()).toBe(1000);
  });

  it("NJ-1040 health coverage - QSS uses $20,000 threshold", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "qualifying_surviving_spouse",
        totalIncome: 50000,
        adults: 1,
        children: 1,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($50,000 - $20,000) = $750
    // Flat: $695 + $347.50 = $1,042.50
    // Penalty = max($1,042.50, $750) = $1,042.50 → rounds to $1,043
    expect(result.incomeBasedAmount.toNumber()).toBe(750);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1043);
  });

  // --- Edge cases ---

  it("NJ-1040 health coverage - zero income with no coverage", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 0,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × max(0, 0 - 10000) = $0
    // Flat: $695
    // Penalty = max($695, $0) = $695
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(695);
  });

  it("NJ-1040 health coverage - zero household members produces $0", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        adults: 0,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
  });

  it("NJ-1040 health coverage - proration rounds to nearest dollar", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 15000,
        adults: 1,
        children: 0,
        uncoveredMonths: 7,
      })
    );
    // Annual: max($695, 2.5%×$5,000=$125) = $695
    // Prorated: $695 × 7/12 = $405.4166... → rounds to $405
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(405);
  });

  it("NJ-1040 health coverage - large family flat dollar at cap", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 25000,
        adults: 2,
        children: 10,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695×2 + $347.50×10 = $1,390 + $3,475 = $4,865 → capped at $2,085
    // Income: 2.5% × ($25,000 - $20,000) = $125
    // Penalty = max($2,085, $125) = $2,085
    // Bronze cap: $9,012 × 12 = $108,144
    expect(result.flatDollarAmount.toNumber()).toBe(2085);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(2085);
  });

  it("NJ-1040 health coverage - produces audit trail", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({ uncoveredMonths: 12 })
    );
    expect(result.lines.length).toBeGreaterThan(0);
    const srpLines = result.lines.filter(
      (l) => l.form === "NJ-HCC"
    );
    expect(srpLines.length).toBeGreaterThan(0);
  });

  // --- Integration-style tests ---

  it("NJ-1040 health coverage - typical uninsured family scenario", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        filingStatus: "married_filing_jointly",
        totalIncome: 80000,
        adults: 2,
        children: 2,
        uncoveredMonths: 12,
      })
    );
    // Flat: $695×2 + $347.50×2 = $1,390 + $695 = $2,085 (at cap)
    // Income: 2.5% × ($80,000 - $20,000) = $1,500
    // Penalty = max($2,085, $1,500) = $2,085
    // Bronze cap: $9,012 × 4 = $36,048
    // Final = $2,085
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(2085);
  });

  it("NJ-1040 health coverage - high-income family hits bronze cap", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 600000,
        adults: 1,
        children: 0,
        uncoveredMonths: 12,
      })
    );
    // Income: 2.5% × ($600,000 - $10,000) = $14,750
    // Flat: $695
    // Penalty = max($695, $14,750) = $14,750
    // Bronze: $9,012
    // Final = $9,012
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(9012);
  });

  it("NJ-1040 health coverage - mid-year coverage loss with 4 months uncovered", () => {
    const result = calculateNJ1040HealthCoverage(
      defaultInput({
        totalIncome: 50000,
        adults: 1,
        children: 0,
        uncoveredMonths: 4,
      })
    );
    // Annual penalty: max($695, $1,000) = $1,000
    // Prorated: $1,000 × 4/12 = $333.33 → rounds to $333
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(333);
  });
});

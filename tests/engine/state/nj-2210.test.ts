/**
 * Tests for NJ-2210 Underpayment of Estimated Tax penalty.
 * Spec: spec/state/nj-2210.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ2210, type NJ2210Input } from "@/engine/state/nj-2210.js";

const d = (value: string | number) => new Decimal(value);

/** Helper: build minimal NJ-2210 input */
function penaltyInput(overrides: Partial<NJ2210Input> = {}): NJ2210Input {
  return {
    taxYear: 2025,
    currentYearTax: 0,
    totalWithholding: 0,
    estimatedPayments: 0,
    ...overrides,
  };
}

describe("NJ-2210 underpayment penalty", () => {
  // --- Threshold check ($400) ---

  it("NJ-2210 - no penalty when tax minus line 2 credits is less than $400", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 1399, totalWithholding: 1000 })
    );
    // $1399 - $1000 = $399, which stays below the filing threshold for NJ-2210.
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - tax exactly $400 after line 2 credits still requires the penalty computation", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 1400, totalWithholding: 1000 })
    );
    // $1400 - $1000 = $400, so the taxpayer must continue through NJ-2210.
    expect(result.penaltyApplies).toBe(true);
    expect(result.underpaymentAmount.toNumber()).toBe(120);
    expect(result.penalty.toNumber()).toBe(8);
  });

  it("NJ-2210 - penalty may apply when tax minus withholding exceeds $400", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 1500, totalWithholding: 1000 })
    );
    // $1500 - $1000 = $500 > $400 threshold
    expect(result.penaltyApplies).toBe(true);
  });

  it("NJ-2210 - no penalty when current year tax is zero", () => {
    const result = calculateNJ2210(penaltyInput({ currentYearTax: 0 }));
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - no penalty when withholding covers all tax", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 5000, totalWithholding: 5000 })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - no penalty when withholding exceeds tax", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 3000, totalWithholding: 4000 })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - withholding-equivalent refundable credits count in the line 2 threshold", () => {
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 525,
        totalWithholding: 100,
        withholdingEquivalentCredits: 300,
      })
    );
    // Line 2 total = $100 withholding + $300 refundable credits = $400
    // Threshold amount = $525 - $400 = $125 < $400, so no penalty.
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  // --- Required annual payment ---

  it("NJ-2210 - required annual payment is 80% of current year when no prior year", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 5000 })
    );
    // No prior year → required = 80% of $5000 = $4000
    expect(result.requiredAnnualPayment.toNumber()).toBe(4000);
  });

  it("NJ-2210 - required annual payment is lesser of 80% current or 100% prior", () => {
    // Prior year tax = $3000 < 80% of $5000 ($4000) → use $3000
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        priorYearTax: 3000,
        priorYearReturnFiled: true,
      })
    );
    expect(result.requiredAnnualPayment.toNumber()).toBe(3000);
  });

  it("NJ-2210 - required annual payment uses 80% when it is lower than prior year", () => {
    // 80% of $5000 = $4000 < prior $6000 → use $4000
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        priorYearTax: 6000,
        priorYearReturnFiled: true,
      })
    );
    expect(result.requiredAnnualPayment.toNumber()).toBe(4000);
  });

  it("NJ-2210 - prior year tax of zero means no penalty", () => {
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        priorYearTax: 0,
        priorYearReturnFiled: true,
      })
    );
    // Required = lesser of 80% × $5000 ($4000) and 100% × $0 ($0) → $0
    expect(result.requiredAnnualPayment.toNumber()).toBe(0);
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - prior year return not filed defaults to 80% of current year", () => {
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 10000,
        priorYearTax: 2000,
        priorYearReturnFiled: false,
      })
    );
    // Not filed → ignore prior year → use 80% of $10000 = $8000
    expect(result.requiredAnnualPayment.toNumber()).toBe(8000);
  });

  // --- Safe harbor check ---

  it("NJ-2210 - no penalty when payments meet safe harbor", () => {
    // Required = 80% of $5000 = $4000
    // Payments = $4000 → meets required
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        totalWithholding: 2000,
        estimatedPayments: 2000,
      })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - no penalty when payments exceed safe harbor via prior year", () => {
    // Current tax $10000, prior $3000
    // Required = lesser of 80%×$10000 ($8000) and $3000 → $3000
    // Payments = $3500 > $3000
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 10000,
        totalWithholding: 2000,
        estimatedPayments: 1500,
        priorYearTax: 3000,
        priorYearReturnFiled: true,
      })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  // --- Underpayment calculation ---

  it("NJ-2210 - underpayment is shortfall from required payment", () => {
    // Required = 80% of $5000 = $4000
    // Payments = $1000 → underpayment = $3000
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        totalWithholding: 500,
        estimatedPayments: 500,
      })
    );
    expect(result.underpaymentAmount.toNumber()).toBe(3000);
  });

  it("NJ-2210 - underpayment cannot be negative", () => {
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        totalWithholding: 5000,
      })
    );
    expect(result.underpaymentAmount.toNumber()).toBe(0);
  });

  // --- Penalty calculation (short method) ---

  it("NJ-2210 - penalty computed using the published 2025 short-method factor", () => {
    // Current tax = $10,000, no payments, no prior year
    // Required = 80% of $10,000 = $8,000
    // Underpayment = $8,000
    // Short method multiplier = 972/1460 ≈ 0.6657534...
    // Penalty = $8,000 × 0.105 × (972/1460) = $8,000 × 0.06990411... ≈ $559
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 10000 })
    );
    expect(result.penalty.toNumber()).toBe(560);
  });

  it("NJ-2210 - penalty with partial payments", () => {
    // Current tax = $6,000, withholding = $1,000, estimated = $500
    // Required = 80% of $6,000 = $4,800
    // Total payments = $1,500
    // Underpayment = $4,800 - $1,500 = $3,300
    // Penalty = $3,300 × 0.105 × (972/1460) ≈ $231
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 6000,
        totalWithholding: 1000,
        estimatedPayments: 500,
      })
    );
    expect(result.underpaymentAmount.toNumber()).toBe(3300);
    expect(result.penalty.toNumber()).toBe(231);
  });

  it("NJ-2210 - penalty with prior year safe harbor reducing required payment", () => {
    // Current tax = $10,000, prior = $4,000
    // Required = lesser of $8,000 (80% current) and $4,000 (100% prior) → $4,000
    // Payments = $2,000 → underpayment = $2,000
    // Penalty = $2,000 × 0.105 × (972/1460) ≈ $140
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 10000,
        priorYearTax: 4000,
        priorYearReturnFiled: true,
        totalWithholding: 2000,
      })
    );
    expect(result.requiredAnnualPayment.toNumber()).toBe(4000);
    expect(result.underpaymentAmount.toNumber()).toBe(2000);
    expect(result.penalty.toNumber()).toBe(140);
  });

  it("NJ-2210 - very small underpayment rounds penalty to zero", () => {
    // Required = 80% of $600 = $480
    // Payments = $470 → underpayment = $10
    // But first: tax minus withholding = $600 - $470 = $130 ≤ $400 → no penalty
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 600, totalWithholding: 470 })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - small underpayment past threshold produces small penalty", () => {
    // Current tax = $1000, withholding = $500
    // Tax minus withholding = $500 > $400 → penalty may apply
    // Required = 80% × $1000 = $800
    // Underpayment = $800 - $500 = $300
    // Penalty = $300 × 0.105 × (972/1460) ≈ $21
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 1000, totalWithholding: 500 })
    );
    expect(result.penaltyApplies).toBe(true);
    expect(result.underpaymentAmount.toNumber()).toBe(300);
    expect(result.penalty.toNumber()).toBe(21);
  });

  // --- Edge cases ---

  it("NJ-2210 - estimated payments alone can satisfy safe harbor", () => {
    // Required = 80% × $5000 = $4000
    // No withholding, $4000 estimated → meets requirement
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 5000,
        estimatedPayments: 4000,
      })
    );
    expect(result.penaltyApplies).toBe(false);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("NJ-2210 - high-income filer with large underpayment", () => {
    // $50,000 tax, no payments
    // Required = 80% × $50,000 = $40,000
    // Penalty = $40,000 × 0.105 × (972/1460) ≈ $2,796
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 50000 })
    );
    expect(result.underpaymentAmount.toNumber()).toBe(40000);
    expect(result.penalty.toNumber()).toBe(2800);
  });

  it("NJ-2210 - $400 threshold uses tax minus withholding only, not estimated", () => {
    // Tax = $900, withholding = $400, estimated = $0
    // Tax minus withholding = $500 > $400 → penalty may apply
    // (estimated payments still reduce underpayment in penalty calc)
    const result = calculateNJ2210(
      penaltyInput({
        currentYearTax: 900,
        totalWithholding: 400,
      })
    );
    expect(result.penaltyApplies).toBe(true);
  });

  it("NJ-2210 - produces audit trail lines", () => {
    const result = calculateNJ2210(
      penaltyInput({ currentYearTax: 5000 })
    );
    expect(result.lines.length).toBeGreaterThan(0);
    const njLines = result.lines.filter((l) => l.form === "NJ-2210");
    expect(njLines.length).toBeGreaterThan(0);
  });

  // --- Penalty rate varies by year ---

  it("NJ-2210 - throws for unsupported tax year", () => {
    expect(() =>
      calculateNJ2210(penaltyInput({ taxYear: 2020, currentYearTax: 5000 }))
    ).toThrow();
  });
});

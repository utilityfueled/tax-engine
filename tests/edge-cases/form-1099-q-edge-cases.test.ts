/**
 * Edge case tests for Form 1099-Q — Payments From Qualified Education Programs.
 * Spec: spec/federal/form-1099-q.yaml
 *
 * Covers boundary conditions for taxable earnings proration, penalty
 * calculations, trustee-to-trustee transfer interactions, and QEE adjustments.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import type { Form1099Q, QualifiedEducationExpenseSummary } from "@/models/inputs.js";

function q(overrides: Partial<Form1099Q> = {}): Form1099Q {
  return {
    accountType: overrides.accountType ?? "529",
    grossDistribution: overrides.grossDistribution ?? "0",
    earnings: overrides.earnings ?? "0",
    basis: overrides.basis ?? "0",
    isTrusteeToTrustee: overrides.isTrusteeToTrustee ?? false,
  };
}

function qee(overrides: Partial<QualifiedEducationExpenseSummary> = {}): QualifiedEducationExpenseSummary {
  return {
    totalQualifiedExpenses: overrides.totalQualifiedExpenses ?? "0",
    taxFreeEducationalAssistance: overrides.taxFreeEducationalAssistance ?? "0",
    amountsUsedForEducationCredits: overrides.amountsUsedForEducationCredits ?? "0",
    penaltyExceptionScholarshipAmount: overrides.penaltyExceptionScholarshipAmount ?? "0",
    penaltyExceptionDeath: overrides.penaltyExceptionDeath ?? false,
    penaltyExceptionDisability: overrides.penaltyExceptionDisability ?? false,
    penaltyExceptionMilitaryAcademyAmount: overrides.penaltyExceptionMilitaryAcademyAmount ?? "0",
  };
}

describe("Form 1099-Q Edge Cases", () => {
  // ── Taxable Earnings Boundary Conditions ──────────────────────────

  describe("Taxable earnings at exact boundaries", () => {
    it("Form 1099-Q - distribution $1 above QEE produces minimal taxable earnings", () => {
      // $10,001 distribution, $3,000 earnings, $10,000 QEE
      // Excess: $1 / $10,001 = very small ratio
      // Taxable: $3,000 × (1/10001) = $0.30 (rounded)
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10001", earnings: "3000", basis: "7001" })],
        qee({ totalQualifiedExpenses: "10000" }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal("0.30"));
      expect(result.taxFreeEarnings).toEqual(new Decimal("2999.70"));
    });

    it("Form 1099-Q - distribution exactly equals QEE: zero taxable", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "25000", earnings: "8000", basis: "17000" })],
        qee({ totalQualifiedExpenses: "25000" }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.taxFreeEarnings).toEqual(new Decimal(8000));
    });

    it("Form 1099-Q - distribution $1 below QEE: zero taxable", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "9999", earnings: "2500", basis: "7499" })],
        qee({ totalQualifiedExpenses: "10000" }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - all earnings no basis: taxable equals full excess", () => {
      // Distribution is 100% earnings
      const result = calculateForm1099Q(
        [q({ grossDistribution: "5000", earnings: "5000", basis: "0" })],
        qee({ totalQualifiedExpenses: "2000" }),
      );

      // Excess: $3000/$5000 = 60% → taxable = $5000 × 0.60 = $3000
      expect(result.taxableEarnings).toEqual(new Decimal(3000));
    });

    it("Form 1099-Q - earnings exactly 50% of distribution", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "10000", basis: "10000" })],
        qee({ totalQualifiedExpenses: "15000" }),
      );

      // Excess: $5000/$20000 = 25% → taxable = $10000 × 0.25 = $2500
      expect(result.taxableEarnings).toEqual(new Decimal(2500));
    });
  });

  // ── Adjusted QEE Edge Cases ───────────────────────────────────────

  describe("Adjusted QEE boundary conditions", () => {
    it("Form 1099-Q - all QEE reductions combined exceed total QEE: adjusted QEE floors at $0", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "8000",
          taxFreeEducationalAssistance: "5000",
          amountsUsedForEducationCredits: "5000",
        }),
      );

      // 8000 - 5000 - 5000 = -2000 → floored to 0
      expect(result.adjustedQEE).toEqual(new Decimal(0));
      expect(result.taxableEarnings).toEqual(new Decimal(3000)); // All taxable
    });

    it("Form 1099-Q - QEE reductions exactly equal total QEE: adjusted QEE is $0", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({
          totalQualifiedExpenses: "10000",
          taxFreeEducationalAssistance: "6000",
          amountsUsedForEducationCredits: "4000",
        }),
      );

      expect(result.adjustedQEE).toEqual(new Decimal(0));
      expect(result.taxableEarnings).toEqual(new Decimal(2000));
    });

    it("Form 1099-Q - large QEE with no reductions: all distributions tax-free", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "50000", earnings: "15000", basis: "35000" })],
        qee({ totalQualifiedExpenses: "100000" }),
      );

      expect(result.adjustedQEE).toEqual(new Decimal(100000));
      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });
  });

  // ── Penalty Exception Combinations ────────────────────────────────

  describe("Penalty exception edge cases", () => {
    it("Form 1099-Q - death AND scholarship combined: death takes full exemption", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "4000", basis: "6000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionDeath: true,
          penaltyExceptionScholarshipAmount: "2000",
        }),
      );

      // Death exempts ALL earnings from penalty
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(4000));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - disability AND military combined: disability takes full exemption", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "8000", earnings: "2500", basis: "5500" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionDisability: true,
          penaltyExceptionMilitaryAcademyAmount: "1000",
        }),
      );

      expect(result.penaltyExceptionAmount).toEqual(new Decimal(2500));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - scholarship + military combined exactly equal taxable earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "2000",
          penaltyExceptionMilitaryAcademyAmount: "1000",
        }),
      );

      expect(result.penaltyExceptionAmount).toEqual(new Decimal(3000));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - scholarship + military combined exceed taxable earnings: capped", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "3000",
          penaltyExceptionMilitaryAcademyAmount: "2000",
        }),
      );

      // Exceptions = min(3000 + 2000, 2000) = 2000
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(2000));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - no exceptions on zero taxable earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "15000", // Fully covered
          penaltyExceptionScholarshipAmount: "5000",
        }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal(0));
      // Exceptions apply to taxable earnings (which is 0)
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });
  });

  // ── Penalty Rounding ──────────────────────────────────────────────

  describe("Penalty rounding precision", () => {
    it("Form 1099-Q - penalty on $0.01 taxable earnings rounds to $0.00", () => {
      // Construct a scenario producing very small taxable earnings
      // $100,000 distribution, $1 earnings, $99,999 QEE
      // Excess: $1/$100,000 = 0.00001 → taxable = $1 × 0.00001 = $0.00 (rounded)
      const result = calculateForm1099Q(
        [q({ grossDistribution: "100000", earnings: "1", basis: "99999" })],
        qee({ totalQualifiedExpenses: "99999" }),
      );

      // Excess: $1 / $100,000 → taxable earnings = $1 × 0.00001 = ~$0.00
      expect(result.taxableEarnings).toEqual(new Decimal("0.00"));
      expect(result.netPenalty).toEqual(new Decimal("0.00"));
    });

    it("Form 1099-Q - penalty rounds to 2 decimal places", () => {
      // $10,000 distribution, $3333 earnings, $0 QEE
      // Penalty: $3333 × 10% = $333.30
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3333", basis: "6667" })],
        qee({ totalQualifiedExpenses: "0" }),
      );

      expect(result.grossPenalty).toEqual(new Decimal("333.30"));
      expect(result.netPenalty).toEqual(new Decimal("333.30"));
    });

    it("Form 1099-Q - penalty on odd cent amount", () => {
      // $7777 earnings → penalty = $777.70
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "7777", basis: "2223" })],
        qee({ totalQualifiedExpenses: "0" }),
      );

      expect(result.netPenalty).toEqual(new Decimal("777.70"));
    });
  });

  // ── Trustee-to-Trustee Transfer Interactions ──────────────────────

  describe("Trustee-to-trustee transfer edge cases", () => {
    it("Form 1099-Q - only trustee-to-trustee transfers with QEE: all zero", () => {
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "20000", earnings: "5000", basis: "15000", isTrusteeToTrustee: true }),
        ],
        qee({ totalQualifiedExpenses: "10000" }),
      );

      expect(result.trusteeToTrusteeTransfers).toEqual(new Decimal(20000));
      expect(result.taxableGrossDistribution).toEqual(new Decimal(0));
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - mixed transfers: QEE applied only against non-transfer distributions", () => {
      // Transfer: $10K, Non-transfer: $5K with $2K earnings
      // QEE: $3K → excess from non-transfer: $2K/$5K = 40%
      // Taxable: $2K × 0.40 = $800
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "5000", earnings: "2000", basis: "3000" }),
          q({ grossDistribution: "10000", earnings: "4000", basis: "6000", isTrusteeToTrustee: true }),
        ],
        qee({ totalQualifiedExpenses: "3000" }),
      );

      expect(result.taxableGrossDistribution).toEqual(new Decimal(5000));
      expect(result.taxableEarnings).toEqual(new Decimal(800));
    });

    it("Form 1099-Q - multiple non-transfers with one transfer in the middle", () => {
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "8000", earnings: "2000", basis: "6000" }),
          q({ grossDistribution: "3000", earnings: "500", basis: "2500", isTrusteeToTrustee: true }),
          q({ grossDistribution: "7000", earnings: "1500", basis: "5500" }),
        ],
        qee({ totalQualifiedExpenses: "10000" }),
      );

      // Non-transfer total: $15K dist, $3.5K earnings
      // QEE: $10K → excess: $5K/$15K = 33.33%
      // Taxable: $3500 × (5000/15000) = $1166.67
      expect(result.taxableGrossDistribution).toEqual(new Decimal(15000));
      expect(result.taxableEarnings).toEqual(new Decimal("1166.67"));
    });
  });

  // ── Large and Small Value Edge Cases ──────────────────────────────

  describe("Extreme value edge cases", () => {
    it("Form 1099-Q - very large distribution ($1M) with precision", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "1000000", earnings: "350000", basis: "650000" })],
        qee({ totalQualifiedExpenses: "500000" }),
      );

      // Excess: $500K/$1M = 50% → taxable = $350K × 0.50 = $175,000
      expect(result.taxableEarnings).toEqual(new Decimal(175000));
      expect(result.netPenalty).toEqual(new Decimal(17500));
    });

    it("Form 1099-Q - many forms aggregated (10 forms)", () => {
      const forms = Array.from({ length: 10 }, (_, i) =>
        q({ grossDistribution: "5000", earnings: "1000", basis: "4000" }),
      );
      const result = calculateForm1099Q(forms, qee({ totalQualifiedExpenses: "30000" }));

      // Total: $50K dist, $10K earnings. Excess: $20K/$50K = 40%
      // Taxable: $10K × 0.40 = $4,000
      expect(result.grossDistribution).toEqual(new Decimal(50000));
      expect(result.taxableEarnings).toEqual(new Decimal(4000));
    });

    it("Form 1099-Q - distribution of exactly $0.01 with $0.01 earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "0.01", earnings: "0.01", basis: "0" })],
        qee({ totalQualifiedExpenses: "0" }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal("0.01"));
      expect(result.netPenalty).toEqual(new Decimal("0.00")); // 0.01 × 0.10 = 0.001 → rounds to 0.00
    });
  });

  // ── Earnings Edge Cases ───────────────────────────────────────────

  describe("Earnings edge cases", () => {
    it("Form 1099-Q - zero earnings with positive basis: no tax regardless of QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "0", basis: "10000" })],
        qee({ totalQualifiedExpenses: "0" }),
      );

      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - earnings greater than distribution: uses reported earnings", () => {
      // Box 2 can technically exceed Box 1 in some edge cases (e.g., partial redemptions)
      const result = calculateForm1099Q(
        [q({ grossDistribution: "5000", earnings: "6000", basis: "0" })],
        qee({ totalQualifiedExpenses: "0" }),
      );

      // All of the reported earnings are taxable (ratio = 5000/5000 = 1.0)
      expect(result.taxableEarnings).toEqual(new Decimal(6000));
    });

    it("Form 1099-Q - negative earnings on multiple forms: net negative yields zero taxable", () => {
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "10000", earnings: "-500", basis: "10500" }),
          q({ grossDistribution: "5000", earnings: "-200", basis: "5200" }),
        ],
        qee({ totalQualifiedExpenses: "0" }),
      );

      // Net earnings: -700, so no taxable amount
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("Form 1099-Q - mixed positive and negative earnings: net positive gets prorated", () => {
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "10000", earnings: "3000", basis: "7000" }),
          q({ grossDistribution: "5000", earnings: "-500", basis: "5500" }),
        ],
        qee({ totalQualifiedExpenses: "10000" }),
      );

      // Taxable dist: $15K, earnings from taxable: $2500
      // Excess: $5K/$15K = 33.33% → taxable = $2500 × (5000/15000) = $833.33
      expect(result.taxableEarnings).toEqual(new Decimal("833.33"));
    });
  });
});

/**
 * Tests for Form 1099-Q — Payments From Qualified Education Programs.
 * Spec: spec/federal/form-1099-q.yaml
 *
 * IRC §529 (QTPs/529 plans) and IRC §530 (Coverdell ESAs).
 * Distributions used for qualified education expenses are tax-free.
 * Excess distributions have taxable earnings and a 10% additional tax.
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

describe("Form 1099-Q Qualified Education Program Distributions", () => {
  // ── Aggregation ─────────────────────────────────────────────────

  describe("Distribution Aggregation", () => {
    it("Form 1099-Q aggregates gross distributions from multiple forms", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "10000", earnings: "2000", basis: "8000" }),
        q({ grossDistribution: "5000", earnings: "1500", basis: "3500" }),
      ]);
      expect(result.grossDistribution).toEqual(new Decimal(15000));
    });

    it("Form 1099-Q aggregates earnings from multiple forms", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "10000", earnings: "3000", basis: "7000" }),
        q({ grossDistribution: "6000", earnings: "1000", basis: "5000" }),
      ]);
      expect(result.totalEarnings).toEqual(new Decimal(4000));
    });

    it("Form 1099-Q tracks basis from distributions", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "8000", earnings: "2000", basis: "6000" }),
      ]);
      expect(result.totalBasis).toEqual(new Decimal(6000));
    });

    it("Form 1099-Q excludes trustee-to-trustee transfers from taxable computation", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "10000", earnings: "2000", basis: "8000" }),
        q({ grossDistribution: "5000", earnings: "1000", basis: "4000", isTrusteeToTrustee: true }),
      ], qee({ totalQualifiedExpenses: "0" }));
      expect(result.trusteeToTrusteeTransfers).toEqual(new Decimal(5000));
      expect(result.taxableGrossDistribution).toEqual(new Decimal(10000));
      // Only the non-transfer distribution's earnings are taxable
      expect(result.taxableEarnings).toEqual(new Decimal(2000));
    });

    it("single 1099-Q form flows correctly", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "20000", earnings: "5000", basis: "15000" }),
      ]);
      expect(result.grossDistribution).toEqual(new Decimal(20000));
      expect(result.totalEarnings).toEqual(new Decimal(5000));
      expect(result.totalBasis).toEqual(new Decimal(15000));
    });

    it("empty array produces zero results", () => {
      const result = calculateForm1099Q([]);
      expect(result.grossDistribution).toEqual(new Decimal(0));
      expect(result.totalEarnings).toEqual(new Decimal(0));
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });
  });

  // ── Adjusted QEE ────────────────────────────────────────────────

  describe("Adjusted Qualified Education Expenses", () => {
    it("Form 1099-Q adjusted QEE subtracts scholarships and credit amounts", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({
          totalQualifiedExpenses: "25000",
          taxFreeEducationalAssistance: "5000",
          amountsUsedForEducationCredits: "4000",
        })
      );
      // AQEE = 25000 - 5000 - 4000 = 16000
      expect(result.adjustedQEE).toEqual(new Decimal(16000));
    });

    it("adjusted QEE cannot be negative", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "5000", earnings: "1000", basis: "4000" })],
        qee({
          totalQualifiedExpenses: "3000",
          taxFreeEducationalAssistance: "5000",
        })
      );
      expect(result.adjustedQEE).toEqual(new Decimal(0));
    });

    it("adjusted QEE is zero when no QEE summary provided", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "10000", earnings: "3000", basis: "7000" }),
      ]);
      expect(result.adjustedQEE).toEqual(new Decimal(0));
    });

    it("full QEE with no reductions", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({ totalQualifiedExpenses: "15000" })
      );
      expect(result.adjustedQEE).toEqual(new Decimal(15000));
    });
  });

  // ── Taxable Earnings ────────────────────────────────────────────

  describe("Taxable Earnings Computation", () => {
    it("Form 1099-Q computes taxable earnings when distributions exceed adjusted QEE", () => {
      // Distribution: $20K (earnings $5K, basis $15K)
      // Adjusted QEE: $12K
      // Excess: $8K out of $20K → ratio = 0.40
      // Taxable earnings: $5000 × 0.40 = $2000
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({ totalQualifiedExpenses: "12000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(2000));
    });

    it("zero taxable earnings when distributions equal adjusted QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "15000", earnings: "4000", basis: "11000" })],
        qee({ totalQualifiedExpenses: "15000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });

    it("zero taxable earnings when distributions are less than adjusted QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "25000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });

    it("all earnings taxable when no QEE at all", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      // Excess: 10000/10000 = 1.0 → all earnings taxable
      expect(result.taxableEarnings).toEqual(new Decimal(3000));
    });

    it("all earnings taxable when no QEE summary provided", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "8000", earnings: "2500", basis: "5500" }),
      ]);
      expect(result.taxableEarnings).toEqual(new Decimal(2500));
    });

    it("Form 1099-Q tax-free earnings are the complement of taxable earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({ totalQualifiedExpenses: "12000" })
      );
      // Taxable: $2000, Tax-free: $3000
      expect(result.taxFreeEarnings).toEqual(new Decimal(3000));
      expect(result.taxableEarnings.plus(result.taxFreeEarnings)).toEqual(new Decimal(5000));
    });

    it("Form 1099-Q allocates excess between earnings and basis", () => {
      // $20K distribution, $5K earnings, $15K basis, $12K QEE
      // Excess $8K: 40% of dist → $2K from earnings, $6K from basis
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({ totalQualifiedExpenses: "12000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(2000));
      // Basis portion of excess = basis × (excess / gross) = 15000 × 0.40 = 6000
      // But basis itself is never taxed — this just verifies the split
    });

    it("negative earnings (loss) produce zero taxable amount", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "-500", basis: "10500" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });

    it("zero distributions produce zero taxable amount", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "0", earnings: "0", basis: "0" })],
        qee({ totalQualifiedExpenses: "5000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
    });

    it("very small excess correctly prorated", () => {
      // Distribution: $10000, Earnings: $2000, QEE: $9999
      // Excess: $1 out of $10000 → ratio = 0.0001
      // Taxable earnings: $2000 × 0.0001 = $0.20
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({ totalQualifiedExpenses: "9999" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal("0.20"));
    });

    it("multiple 1099-Q forms aggregated before comparison to QEE", () => {
      // Two 529 plans: total $30K distributions, $8K earnings
      // QEE: $20K → excess $10K out of $30K → 33.33%
      // Taxable: $8000 × (10000/30000) = $2666.67
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "20000", earnings: "5000", basis: "15000" }),
          q({ grossDistribution: "10000", earnings: "3000", basis: "7000" }),
        ],
        qee({ totalQualifiedExpenses: "20000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal("2666.67"));
    });
  });

  // ── 10% Additional Tax ──────────────────────────────────────────

  describe("10% Additional Tax (Penalty)", () => {
    it("Form 1099-Q computes 10% penalty on taxable earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      // All $3000 earnings taxable → penalty = $300
      expect(result.grossPenalty).toEqual(new Decimal(300));
      expect(result.netPenalty).toEqual(new Decimal(300));
    });

    it("no penalty when distributions fully covered by QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "15000" })
      );
      expect(result.grossPenalty).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("penalty on partial excess", () => {
      // $20K distribution, $5K earnings, $12K QEE
      // Taxable earnings: $2000
      // Penalty: $200
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({ totalQualifiedExpenses: "12000" })
      );
      expect(result.netPenalty).toEqual(new Decimal(200));
    });

    it("no penalty when earnings are negative", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "5000", earnings: "-200", basis: "5200" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.netPenalty).toEqual(new Decimal(0));
    });
  });

  // ── Penalty Exceptions ──────────────────────────────────────────

  describe("Penalty Exceptions", () => {
    it("Form 1099-Q scholarship exception reduces penalty but earnings remain taxable", () => {
      // $10K distribution, $3K earnings, no QEE → all $3K taxable
      // Scholarship exception: $2K → only ($3K - $2K) = $1K subject to penalty
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "2000",
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(3000)); // Still taxable income
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(2000));
      expect(result.netPenalty).toEqual(new Decimal(100)); // 10% of $1000
    });

    it("Form 1099-Q net penalty is zero when death exception applies", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionDeath: true,
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(3000)); // Still income
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(3000)); // Full exemption
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("disability exception exempts all earnings from penalty", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "15000", earnings: "4500", basis: "10500" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionDisability: true,
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(4500));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("military academy exception reduces penalty amount", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionMilitaryAcademyAmount: "1500",
        })
      );
      // Taxable: $3000, exception: $1500, subject to penalty: $1500
      expect(result.netPenalty).toEqual(new Decimal(150));
    });

    it("combined scholarship and military exceptions", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "4000", basis: "6000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "1000",
          penaltyExceptionMilitaryAcademyAmount: "1000",
        })
      );
      // Taxable: $4000, exceptions: $2000, subject to penalty: $2000
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(2000));
      expect(result.netPenalty).toEqual(new Decimal(200));
    });

    it("penalty exceptions cannot exceed taxable earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "1000", basis: "9000" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "5000",
        })
      );
      // Taxable: $1000, scholarship exception capped at $1000
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(1000));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("no penalty exceptions when all distributions covered by QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({
          totalQualifiedExpenses: "15000",
          penaltyExceptionScholarshipAmount: "2000",
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.penaltyExceptionAmount).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });
  });

  // ── Trustee-to-Trustee Transfers ────────────────────────────────

  describe("Trustee-to-Trustee Transfers", () => {
    it("all trustee-to-trustee transfers produce zero taxable result", () => {
      const result = calculateForm1099Q([
        q({ grossDistribution: "10000", earnings: "3000", basis: "7000", isTrusteeToTrustee: true }),
        q({ grossDistribution: "5000", earnings: "1000", basis: "4000", isTrusteeToTrustee: true }),
      ]);
      expect(result.trusteeToTrusteeTransfers).toEqual(new Decimal(15000));
      expect(result.taxableGrossDistribution).toEqual(new Decimal(0));
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("mixed transfers and distributions — only non-transfers are taxable", () => {
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "8000", earnings: "2000", basis: "6000" }),
          q({ grossDistribution: "12000", earnings: "3000", basis: "9000", isTrusteeToTrustee: true }),
        ],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.grossDistribution).toEqual(new Decimal(20000));
      expect(result.trusteeToTrusteeTransfers).toEqual(new Decimal(12000));
      expect(result.taxableGrossDistribution).toEqual(new Decimal(8000));
      expect(result.taxableEarnings).toEqual(new Decimal(2000));
    });
  });

  // ── Account Types ───────────────────────────────────────────────

  describe("Account Types", () => {
    it("529 plan distributions follow standard QEE computation", () => {
      const result = calculateForm1099Q(
        [q({ accountType: "529", grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({ totalQualifiedExpenses: "8000" })
      );
      // Excess: $2000/10000 = 0.20 → taxable earnings = $400
      expect(result.taxableEarnings).toEqual(new Decimal(400));
    });

    it("Coverdell ESA distributions follow same computation", () => {
      const result = calculateForm1099Q(
        [q({ accountType: "coverdell_esa", grossDistribution: "5000", earnings: "1500", basis: "3500" })],
        qee({ totalQualifiedExpenses: "3000" })
      );
      // Excess: $2000/5000 = 0.40 → taxable earnings = $600
      expect(result.taxableEarnings).toEqual(new Decimal(600));
    });

    it("mixed 529 and Coverdell distributions are aggregated", () => {
      const result = calculateForm1099Q(
        [
          q({ accountType: "529", grossDistribution: "10000", earnings: "2000", basis: "8000" }),
          q({ accountType: "coverdell_esa", grossDistribution: "5000", earnings: "1000", basis: "4000" }),
        ],
        qee({ totalQualifiedExpenses: "12000" })
      );
      // Total: $15K dist, $3K earnings. Excess: $3K/15K = 0.20
      // Taxable earnings: $3000 × 0.20 = $600
      expect(result.taxableEarnings).toEqual(new Decimal(600));
    });
  });

  // ── Realistic Scenarios ─────────────────────────────────────────

  describe("Realistic Scenarios", () => {
    it("typical college student with full QEE coverage — no tax", () => {
      // Parent withdrew $25K from 529 for tuition, room, board
      // QEE covers everything
      const result = calculateForm1099Q(
        [q({ grossDistribution: "25000", earnings: "7000", basis: "18000" })],
        qee({ totalQualifiedExpenses: "30000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("student with partial scholarship reduces QEE", () => {
      // $20K distribution, $5K earnings. QEE $25K but $8K scholarship
      // Adjusted QEE: $17K → excess $3K of $20K = 15%
      // Taxable earnings: $5000 × 0.15 = $750
      const result = calculateForm1099Q(
        [q({ grossDistribution: "20000", earnings: "5000", basis: "15000" })],
        qee({
          totalQualifiedExpenses: "25000",
          taxFreeEducationalAssistance: "8000",
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(750));
      expect(result.netPenalty).toEqual(new Decimal(75));
    });

    it("student receiving AOTC — credit amounts reduce QEE", () => {
      // $15K distribution, $4K earnings. QEE $18K, $4K used for AOTC
      // Adjusted QEE: $14K → excess $1K of $15K ≈ 6.67%
      // Taxable: $4000 × (1000/15000) = $266.67
      const result = calculateForm1099Q(
        [q({ grossDistribution: "15000", earnings: "4000", basis: "11000" })],
        qee({
          totalQualifiedExpenses: "18000",
          amountsUsedForEducationCredits: "4000",
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal("266.67"));
    });

    it("non-qualified withdrawal for non-education purpose — full penalty", () => {
      // Used 529 distribution for non-education expense
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3500", basis: "6500" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(3500));
      expect(result.netPenalty).toEqual(new Decimal(350));
    });

    it("beneficiary received scholarship — penalty-free but taxable", () => {
      // Student got a $5K scholarship, parent withdrew $5K from 529
      // No QEE to offset (scholarship covered everything)
      // But scholarship exception prevents penalty on $5K of earnings
      const result = calculateForm1099Q(
        [q({ grossDistribution: "5000", earnings: "1500", basis: "3500" })],
        qee({
          totalQualifiedExpenses: "0",
          penaltyExceptionScholarshipAmount: "5000",
        })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(1500)); // Still taxable income
      expect(result.netPenalty).toEqual(new Decimal(0)); // No penalty (scholarship exception)
    });

    it("K-12 tuition from 529 plan — tax-free up to QEE", () => {
      // $10K 529 distribution for K-12 private school tuition
      const result = calculateForm1099Q(
        [q({ accountType: "529", grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({ totalQualifiedExpenses: "10000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("multiple 529 plans for same beneficiary", () => {
      // Grandparent and parent each have a 529 plan
      const result = calculateForm1099Q(
        [
          q({ grossDistribution: "15000", earnings: "4000", basis: "11000" }),
          q({ grossDistribution: "10000", earnings: "2500", basis: "7500" }),
        ],
        qee({ totalQualifiedExpenses: "20000" })
      );
      // Total: $25K dist, $6.5K earnings. QEE: $20K
      // Excess: $5K of $25K = 20% → taxable: $6500 × 0.20 = $1300
      expect(result.taxableEarnings).toEqual(new Decimal(1300));
      expect(result.netPenalty).toEqual(new Decimal(130));
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("distribution of exactly $1 with $1 of earnings", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "1", earnings: "1", basis: "0" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(1));
      expect(result.netPenalty).toEqual(new Decimal("0.10"));
    });

    it("distribution with zero earnings — no tax regardless of QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "0", basis: "10000" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });

    it("rounding: taxable earnings rounded to 2 decimal places", () => {
      // $30K distribution, $10K earnings, $20K QEE
      // Excess: $10K/30K = 0.33333...
      // Taxable: $10000 × 0.33333... = $3333.33
      const result = calculateForm1099Q(
        [q({ grossDistribution: "30000", earnings: "10000", basis: "20000" })],
        qee({ totalQualifiedExpenses: "20000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal("3333.33"));
    });

    it("large distribution with small excess", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "100000", earnings: "30000", basis: "70000" })],
        qee({ totalQualifiedExpenses: "99000" })
      );
      // Excess: $1000/100000 = 0.01 → taxable: $300
      expect(result.taxableEarnings).toEqual(new Decimal(300));
      expect(result.netPenalty).toEqual(new Decimal(30));
    });

    it("audit trail records all lines", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "2000", basis: "8000" })],
        qee({ totalQualifiedExpenses: "5000" })
      );
      const lineNames = result.lines.map((l) => l.line);
      expect(lineNames).toContain("gross-distribution");
      expect(lineNames).toContain("total-earnings");
      expect(lineNames).toContain("total-basis");
      expect(lineNames).toContain("adjusted-qee");
      expect(lineNames).toContain("taxable-earnings");
      expect(lineNames).toContain("tax-free-earnings");
      expect(lineNames).toContain("penalty-amount");
      expect(lineNames).toContain("penalty-exception-amount");
      expect(lineNames).toContain("net-penalty");
    });
  });

  // ── Federal Integration ─────────────────────────────────────────

  describe("Federal Integration Values", () => {
    it("taxable earnings flow to Schedule 1 Line 8z as other income", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      // The federal orchestrator adds taxableEarnings to otherIncome
      expect(result.taxableEarnings).toEqual(new Decimal(3000));
    });

    it("net penalty flows to Schedule 2 additional taxes", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "0" })
      );
      expect(result.netPenalty).toEqual(new Decimal(300));
    });

    it("no impact on federal taxes when fully covered by QEE", () => {
      const result = calculateForm1099Q(
        [q({ grossDistribution: "10000", earnings: "3000", basis: "7000" })],
        qee({ totalQualifiedExpenses: "12000" })
      );
      expect(result.taxableEarnings).toEqual(new Decimal(0));
      expect(result.netPenalty).toEqual(new Decimal(0));
    });
  });
});

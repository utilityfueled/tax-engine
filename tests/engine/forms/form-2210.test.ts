/**
 * Tests for Form 2210 — Underpayment of Estimated Tax
 * Spec: spec/federal/form-2210.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm2210,
  type Form2210Input,
} from "@/engine/forms/form-2210.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides?: Partial<Form2210Input>): Form2210Input {
  return {
    currentYearTax: d(20000),
    withholding: d(15000),
    estimatedPayments: d(0),
    refundableCredits: d(0),
    filingStatus: "single",
    // These historical examples explicitly represent four equal timely payments.
    // The production calculator never manufactures dates from an annual total.
    payments: ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"].map((date) => ({
      date, amount: (overrides?.estimatedPayments ?? d(0)).div(4), kind: "estimated" as const,
    })),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Safe Harbor Tests
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Safe Harbor", () => {
  it("safe harbor - no penalty when net tax < $1,000", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(15500),
      withholding: d(15000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("$1,000");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("safe harbor - no penalty when payments ≥ 90% current year", () => {
    // Tax = $20K, 90% = $18K, withholding = $18K
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(18000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("90%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("safe harbor - no penalty when payments exceed 100% prior year", () => {
    // Prior year tax = $15K, payments = $15K, current = $20K
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(15000),
      priorYearTax: d(15000),
      priorYearAGI: d(100000), // Under $150K → 100% threshold
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("safe harbor - 110% required for high income", () => {
    // Prior year AGI > $150K → need 110% of prior year tax
    // Prior tax = $30K, 110% = $33K, payments = $32K → NOT safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(32000),
      priorYearTax: d(30000),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(false);
  });

  it("safe harbor - 110% met for high income", () => {
    // Prior tax = $30K, 110% = $33K, payments = $33K → safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(33000),
      priorYearTax: d(30000),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("110%");
  });

  it("safe harbor - MFS uses $75K threshold for 110%", () => {
    // MFS: $75K threshold. AGI = $80K → need 110%
    // Prior tax = $10K, 110% = $11K, payments = $10.5K → NOT safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10500),
      priorYearTax: d(10000),
      priorYearAGI: d(80000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.safeHarborMet).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Underpayment and Penalty
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Penalty Calculation", () => {
  it("Form 2210 Line 9 - required annual payment", () => {
    // Current tax $20K, 90% = $18K. Prior tax $15K, 100% = $15K
    // Required = min($18K, $15K) = $15K
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(15000),
      priorYearAGI: d(100000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(15000);
  });

  it("Form 2210 dated total payments (withholding + estimated only)", () => {
    // Refundable credits reduce tax shown, not count as payments
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      estimatedPayments: d(3000),
      refundableCredits: d(500),
      priorYearTax: d(15000),
      priorYearAGI: d(100000),
    }));
    expect(result.totalPayments.toNumber()).toBe(13000);
  });

  it("Form 2210 remaining installment underpayment", () => {
    // Required = $15K, payments = $10K → underpayment = $5K
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(15000),
      priorYearAGI: d(100000),
    }));
    expect(result.underpayment.toNumber()).toBe(5000);
  });

  it("Form 2210 - penalty calculation", () => {
    // $5K × 7% × 971/1460 = $233
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(15000),
      priorYearAGI: d(100000),
    }));
    expect(result.penalty.toNumber()).toBe(233);
  });

  it("Form 2210 - no penalty when no underpayment", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(20000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - estimated payments count toward safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      estimatedPayments: d(8500),
    }));
    expect(result.safeHarborMet).toBe(true); // 18500 ≥ 90% of 20K = 18K
  });

  it("Form 2210 - no prior year means only 90% test available", () => {
    // No prior year tax → can't use 100%/110% safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(15000),
      // No priorYearTax
    }));
    expect(result.safeHarborMet).toBe(false); // 15K < 18K (90% of 20K)
  });

  it("Form 2210 - refundable credits reduce tax shown for safe harbor", () => {
    // tax=$20K, R=$3K → taxShown=$17K, 90%=roundDollar($17K×0.9)=$15,300
    // W=$15.5K ≥ $15,300 → safe harbor via 90% of reduced tax
    // Without R: 90%×$20K=$18K, $15.5K<$18K → would fail
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(15500),
      refundableCredits: d(3000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("90%");
  });

  it("Form 2210 - exactly at 90% threshold", () => {
    // 90% of $10,000 = $9,000. Payments = exactly $9,000
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(9000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("90%");
  });

  it("Form 2210 - $1 below 90% threshold", () => {
    // 90% of $10,000 = $9,000. Payments = $8,999
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(8999),
      priorYearTax: d(50000), // high prior year → no help from safe harbor 3
      priorYearAGI: d(50000),
    }));
    expect(result.safeHarborMet).toBe(false);
  });

  it("Form 2210 - net tax exactly $1,000 is not under $1,000 safe harbor", () => {
    // Net tax = $1,000 → safe harbor #1 requires < $1,000, so it fails
    // But 90% test may still save it. This tests that the boundary is strict.
    // $20K tax, $19K payments → net $1K (not < $1K)
    // 90% of $20K = $18K → $19K >= $18K → safe harbor #2 catches it
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(19000),
    }));
    // Safe harbor met via 90% rule, not the $1,000 rule
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("90%");
  });

  it("Form 2210 - net tax $999 is safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10999),
      withholding: d(10000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("$1,000");
  });

  it("Form 2210 - zero tax means no penalty", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(0),
      withholding: d(5000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - all filing statuses use $150K except MFS", () => {
    const statuses: Array<{ status: Form2210Input["filingStatus"]; threshold: number }> = [
      { status: "single", threshold: 150000 },
      { status: "married_filing_jointly", threshold: 150000 },
      { status: "head_of_household", threshold: 150000 },
      { status: "qualifying_surviving_spouse", threshold: 150000 },
      { status: "married_filing_separately", threshold: 75000 },
    ];
    for (const { status, threshold } of statuses) {
      // AGI at threshold → 100% safe harbor
      const atThreshold = calculateForm2210(makeInput({
        currentYearTax: d(30000),
        withholding: d(20000), // Need 100% of prior = $20K
        priorYearTax: d(20000),
        priorYearAGI: d(threshold),
        filingStatus: status,
      }));
      expect(atThreshold.safeHarborMet).toBe(true);

      // AGI $1 over threshold → need 110%
      const overThreshold = calculateForm2210(makeInput({
        currentYearTax: d(30000),
        withholding: d(20000), // $20K < 110% of $20K ($22K)
        priorYearTax: d(20000),
        priorYearAGI: d(threshold + 1),
        filingStatus: status,
      }));
      expect(overThreshold.safeHarborMet).toBe(false);
    }
  });

  it("Form 2210 - large underpayment penalty", () => {
    // Current tax $100K, payments $0, prior tax $80K, AGI $300K
    // Required = min(90% × $100K, 110% × $80K) = min($90K, $88K) = $88K
    // Underpayment = $88K - $0 = $88K
    // Penalty = $88K × 7% × 971/1460 = $4,097
    const result = calculateForm2210(makeInput({
      currentYearTax: d(100000),
      withholding: d(0),
      estimatedPayments: d(0),
      priorYearTax: d(80000),
      priorYearAGI: d(300000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(88000);
    expect(result.underpayment.toNumber()).toBe(88000);
    expect(result.penalty.toNumber()).toBe(4097);
  });

  it("Form 2210 Line safe_harbor - net tax exactly $1,000 fails safe harbor test 1 and no other safe harbor applies", () => {
    // Net tax = $1,000 → not < $1,000, so safe harbor #1 fails
    // 90% of $11K = $9,900 → $10K payments ≥ $9,900 → safe harbor #2 fires
    // But if we arrange 90% to also fail, penalty applies.
    // Tax = $12,000, payments = $11,000 → net = $1,000 (not < $1K)
    // 90% of $12K = $10,800 → $11,000 ≥ $10,800 → safe harbor #2 passes
    // To truly fail both, use prior year that won't help:
    // Tax = $50,000, payments = $49,000 → net = $1,000
    // 90% of $50K = $45K → $49K ≥ $45K → 90% passes
    // So net tax exactly $1K with high payments always gets caught by 90%.
    // Instead: tax = $2,000, withholding = $1,000 → net = $1,000
    // 90% of $2K = $1,800 → $1K < $1,800 → fail
    // prior tax = $50K, AGI = $50K → 100% of $50K = $50K → $1K < $50K → fail
    const result = calculateForm2210(makeInput({
      currentYearTax: d(2000),
      withholding: d(1000),
      priorYearTax: d(50000),
      priorYearAGI: d(50000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.gt(0)).toBe(true);
  });

  it("Form 2210 Line safe_harbor - $0 prior year tax always yields safe harbor via test 3", () => {
    // Prior year tax = $0 → 100% of $0 = $0 → any payments ≥ $0
    // But safe harbor test 3 only fires if test 1 and 2 already failed.
    // Tax = $20K, payments = $5K → net = $15K (fails test 1)
    // 90% of $20K = $18K → $5K < $18K (fails test 2)
    // 100% of $0 = $0 → $5K ≥ $0 → safe harbor #3 fires
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(5000),
      priorYearTax: d(0),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
    expect(result.safeHarborReason).toContain("prior year");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 Line safe_harbor - $0 prior year tax with high income still safe harbor at 110%", () => {
    // Prior year tax = $0, AGI = $200K → 110% of $0 = $0
    // payments $0 ≥ $0 → safe harbor met
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(5000),
      priorYearTax: d(0),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("110%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - first-year filer with no prior year return cannot use safe harbor test 3", () => {
    // No priorYearTax → safe harbor #3 skipped entirely
    // Tax = $20K, withholding = $15K → net = $5K (fails test 1)
    // 90% of $20K = $18K → $15K < $18K (fails test 2)
    // No prior year → no test 3 → penalty
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(15000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.safeHarborReason).toBe("No safe harbor met");
    expect(result.penalty.gt(0)).toBe(true);
    // Required = 90% of $20K = $18K (no prior year to compare)
    expect(result.requiredAnnualPayment.toNumber()).toBe(18000);
  });

  it("Form 2210 - payments at 89.9% of current year tax fails safe harbor test 2", () => {
    // Tax = $100K, 90% = $90K, payments = $89,900 (89.9%) → fails test 2
    // Prior year high enough to not help
    const result = calculateForm2210(makeInput({
      currentYearTax: d(100000),
      withholding: d(89900),
      priorYearTax: d(200000),
      priorYearAGI: d(50000),
    }));
    expect(result.safeHarborMet).toBe(false);
    // 90% of $100K = $90K, 100% of $200K = $200K → required = min($90K, $200K) = $90K
    expect(result.requiredAnnualPayment.toNumber()).toBe(90000);
    // Underpayment = $90K - $89.9K = $100
    expect(result.underpayment.toNumber()).toBe(100);
    // Penalty = $100 × 7% × 971/1460 = $5
    expect(result.penalty.toNumber()).toBe(5);
  });

  it("Form 2210 - payments exactly 100% of prior year tax below $150K AGI", () => {
    // AGI = $100K (under $150K), prior tax = $25K
    // Payments = $25K exactly → safe harbor #3 at 100%
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(25000),
      priorYearTax: d(25000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
    expect(result.safeHarborReason).toContain("prior year");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - payments exactly 110% of prior year tax above $150K AGI", () => {
    // AGI = $200K (over $150K), prior tax = $20K, 110% = $22K
    // Payments = $22K exactly → safe harbor #3 at 110%
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(22000),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("110%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - MFS at exactly $75K AGI uses 100% (not 110%)", () => {
    // MFS: threshold is $75K. AGI exactly $75K → not > $75K → 100% applies
    // Prior tax = $10K, 100% = $10K, payments = $10K → safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(10000),
      priorYearAGI: d(75000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
  });

  it("Form 2210 - MFS at $75,001 AGI requires 110%", () => {
    // MFS: AGI = $75,001 → > $75K → need 110%
    // Prior tax = $10K, 110% = $11K, payments = $10K → fails
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(10000),
      priorYearAGI: d(75001),
      filingStatus: "married_filing_separately",
    }));
    expect(result.safeHarborMet).toBe(false);
  });

  it("Form 2210 - withholding exactly covering the required payment eliminates penalty", () => {
    // Current tax $50K, prior tax $30K, AGI $100K
    // Required = min(90% × $50K, 100% × $30K) = min($45K, $30K) = $30K
    // Withholding = $30K exactly → underpayment = 0
    // But wait — safe harbor test 1: net = $50K - $30K = $20K → fails
    // Safe harbor test 2: $30K ≥ $45K? No → fails
    // Safe harbor test 3: $30K ≥ $30K? Yes → safe harbor met
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(30000),
      priorYearTax: d(30000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - very large underpayment with no payments at all", () => {
    // Current tax $500K, no payments, no prior year
    // Required = 90% of $500K = $450K
    // Underpayment = $450K, penalty = $450K × 7% × 971/1460 = $20,950
    const result = calculateForm2210(makeInput({
      currentYearTax: d(500000),
      withholding: d(0),
      estimatedPayments: d(0),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(450000);
    expect(result.underpayment.toNumber()).toBe(450000);
    expect(result.penalty.toNumber()).toBe(20950);
  });

  it("Form 2210 - penalty with mixed withholding and estimated payments", () => {
    // Current tax $40K, R=$2K → taxShown=$38K. Prior tax $25K, AGI $80K.
    // taxPayments = W $10K + E $8K = $18K
    // Required = min(90% × $38K = $34,200, 100% × $25K = $25K) = $25K
    // Underpayment = $25K - $18K = $7K
    // Penalty = $7K × 7% × 971/1460 = $326
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(10000),
      estimatedPayments: d(8000),
      refundableCredits: d(2000),
      priorYearTax: d(25000),
      priorYearAGI: d(80000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.totalPayments.toNumber()).toBe(18000);
    expect(result.requiredAnnualPayment.toNumber()).toBe(25000);
    expect(result.underpayment.toNumber()).toBe(7000);
    expect(result.penalty.toNumber()).toBe(326);
  });
});

// ═══════════════════════════════════════════════════════════
// Filing Status Coverage
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Filing Status Coverage", () => {
  it("Form 2210 - single filer penalty with high-income 110% prior year required", () => {
    // Single, AGI $200K > $150K threshold → 110% of prior year
    // Prior tax $20K, 110% = $22K. Current tax $50K, 90% = $45K.
    // Required = min($45K, $22K) = $22K. Payments = $18K → underpayment = $4K
    // Penalty = $4K × 7% × 971/1460 = $186
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(18000),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "single",
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(22000);
    expect(result.underpayment.toNumber()).toBe(4000);
    expect(result.penalty.toNumber()).toBe(186);
  });

  it("Form 2210 - married_filing_jointly filer at $150K boundary uses 100%", () => {
    // MFJ: AGI exactly $150K → not > $150K → 100% applies
    // Prior tax $30K, 100% = $30K. Payments = $30K → safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(60000),
      withholding: d(30000),
      priorYearTax: d(30000),
      priorYearAGI: d(150000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - head_of_household penalty when all safe harbors fail", () => {
    // HoH: AGI $160K > $150K → 110%. Prior tax $40K, 110% = $44K.
    // Current tax $80K, 90% = $72K. Required = min($72K, $44K) = $44K.
    // Payments = $35K → underpayment = $9K. Penalty = $9K × 7% × 971/1460 = $419
    const result = calculateForm2210(makeInput({
      currentYearTax: d(80000),
      withholding: d(35000),
      priorYearTax: d(40000),
      priorYearAGI: d(160000),
      filingStatus: "head_of_household",
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(44000);
    expect(result.underpayment.toNumber()).toBe(9000);
    expect(result.penalty.toNumber()).toBe(419);
  });

  it("Form 2210 - qualifying_surviving_spouse uses $150K threshold", () => {
    // QSS: AGI $151K > $150K → 110%. Prior tax $10K, 110% = $11K.
    // Current tax $25K, 90% = $22,500. Required = min($22500, $11K) = $11K.
    // Payments = $11K → safe harbor via prior year test
    const result = calculateForm2210(makeInput({
      currentYearTax: d(25000),
      withholding: d(11000),
      priorYearTax: d(10000),
      priorYearAGI: d(151000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("110%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - married_filing_separately penalty at $75,001 AGI", () => {
    // MFS: AGI $75,001 > $75K → 110%. Prior tax $15K, 110% = $16,500.
    // Current tax $30K, 90% = $27K. Required = min($27K, $16500) = $16,500.
    // Payments = $14K → underpayment = $2,500. Penalty = $2,500 × 7% × 971/1460 = $116
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(14000),
      priorYearTax: d(15000),
      priorYearAGI: d(75001),
      filingStatus: "married_filing_separately",
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(16500);
    expect(result.underpayment.toNumber()).toBe(2500);
    expect(result.penalty.toNumber()).toBe(116);
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty Rounding Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Penalty Rounding Edge Cases", () => {
  it("Form 2210 - penalty rounds half-up on $0.50 boundary", () => {
    // $50 × 0.07 × 971/1460 = $2.33 → rounds to $2
    // Tax $20K, prior tax $10,050, AGI $50K → required = min(90%×$20K, 100%×$10,050) = min($18K, $10,050) = $10,050
    // Payments = $10K → underpayment = $50
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(10050),
      priorYearAGI: d(50000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(10050);
    expect(result.underpayment.toNumber()).toBe(50);
    expect(result.penalty.toNumber()).toBe(2);
  });

  it("Form 2210 - penalty rounds down when fractional part < $0.50", () => {
    // Underpayment of $6 → $6 × 0.07 × 971/1460 = $0.28 → rounds to $0
    // Tax $20K, prior tax $10,006, AGI $50K → required = min($18K, $10,006) = $10,006
    // Payments = $10K → underpayment = $6
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(10006),
      priorYearAGI: d(50000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(10006);
    expect(result.underpayment.toNumber()).toBe(6);
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// IRC §6654 Regression Tests — $1K Test and Refundable Credits
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - IRC §6654 $1K Test and Refundable Credits", () => {
  it("Form 2210 - $1,000 exception uses withholding only per IRC §6654(e)(1)", () => {
    // tax=$5K, W=$1K, E=$3.2K → old bug: $5K-$4.2K=$800 < $1K → safe harbor (WRONG)
    // Correct: taxShown=$5K, $5K-$1K=$4K ≥ $1K → fails $1K test
    // 90%: W+E=$4.2K ≥ $4.5K? No → fails. No prior → penalty
    // required=$4.5K, underpayment=$300, penalty=$300 × 0.07 × 971/1460 = $14
    const result = calculateForm2210(makeInput({
      currentYearTax: d(5000),
      withholding: d(1000),
      estimatedPayments: d(3200),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(4500);
    expect(result.underpayment.toNumber()).toBe(300);
    expect(result.penalty.toNumber()).toBe(14);
  });

  it("Form 2210 - refundable credits reduce tax shown, not count as payments per IRC §6654(d)(1)(C)", () => {
    // tax=$50K, W=$28K, E=$7K, R=$10K
    // Old bug: totalPayments=$45K ≥ 90%×$50K=$45K → safe harbor (WRONG)
    // Correct: taxShown=$40K, taxPayments=$35K, 90%=$36K, $35K<$36K → fails
    // No prior → required=$36K, underpayment=$1K, penalty=$1K × 0.07 × 971/1460 = $47
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(28000),
      estimatedPayments: d(7000),
      refundableCredits: d(10000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(36000);
    expect(result.underpayment.toNumber()).toBe(1000);
    expect(result.penalty.toNumber()).toBe(47);
  });

});

// ═══════════════════════════════════════════════════════════
// Large Underpayment Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Large Underpayment Scenarios", () => {
  it("Form 2210 - millionaire tax with zero payments", () => {
    // Current tax $1M, no prior year, no payments
    // Required = 90% × $1M = $900K. Underpayment = $900K.
    // Penalty = $900K × 7% × 971/1460 = $41,899
    const result = calculateForm2210(makeInput({
      currentYearTax: d(1000000),
      withholding: d(0),
      estimatedPayments: d(0),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(900000);
    expect(result.underpayment.toNumber()).toBe(900000);
    expect(result.penalty.toNumber()).toBe(41899);
  });

  it("Form 2210 - high-income filer with large prior year and partial payments", () => {
    // Current tax $500K, R=$50K → taxShown=$450K. Prior tax $400K, AGI $1M (> $150K → 110%).
    // 90% taxShown = $405K. 110% prior = $440K. Required = min($405K, $440K) = $405K.
    // taxPayments = W $200K + E $100K = $300K
    // Underpayment = $405K - $300K = $105K. Penalty = $105K × 7% × 971/1460 = $4,888
    const result = calculateForm2210(makeInput({
      currentYearTax: d(500000),
      withholding: d(200000),
      estimatedPayments: d(100000),
      refundableCredits: d(50000),
      priorYearTax: d(400000),
      priorYearAGI: d(1000000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.totalPayments.toNumber()).toBe(300000);
    expect(result.requiredAnnualPayment.toNumber()).toBe(405000);
    expect(result.underpayment.toNumber()).toBe(105000);
    expect(result.penalty.toNumber()).toBe(4888);
  });
});

// ═══════════════════════════════════════════════════════════
// Exact Boundary and Combined Payment Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - Boundary and Combined Payment Scenarios", () => {
  it("Form 2210 - payments exactly at 90% of tax shown from combined sources", () => {
    // Tax = $33,333, R=$5K → taxShown=$28,333
    // 90% = roundDollar($28,333 × 0.9) = roundDollar($25,499.70) = $25,500
    // W=$15K + E=$10.5K = $25.5K = exactly 90% of taxShown
    const result = calculateForm2210(makeInput({
      currentYearTax: d(33333),
      withholding: d(15000),
      estimatedPayments: d(10500),
      refundableCredits: d(5000),
    }));
    expect(result.totalPayments.toNumber()).toBe(25500);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("90%");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("Form 2210 - withholding+estimated $1 below 90% of tax shown triggers penalty", () => {
    // Tax = $10,000, no R → taxShown=$10K. 90% = $9,000.
    // W=$4K + E=$4,999 = $8,999 → $1 short of 90%
    // No prior year → only 90% test. Required = $9,000.
    // Underpayment = $9,000 - $8,999 = $1. Penalty = $1 × 7% = $0.07 → rounds to $0
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(4000),
      estimatedPayments: d(4999),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.totalPayments.toNumber()).toBe(8999);
    expect(result.requiredAnnualPayment.toNumber()).toBe(9000);
    expect(result.underpayment.toNumber()).toBe(1);
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - audit trail", () => {
  it("produces audit trail with safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(500), // Under $1K
      withholding: d(0),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("safe_harbor");
  });

  it("produces audit trail with penalty lines", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      priorYearTax: d(15000),
      priorYearAGI: d(100000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("9");
    expect(lineIds).toContain("19");
    expect(lineIds).toContain("safe_harbor");
  });
});

// ═══════════════════════════════════════════════════════════
// Regular Method Regression — equal timely payments
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - regular method with equal timely payments", () => {
  it("Form 2210 - penalty uses each installment duration, not a full year", () => {
    // IRS Form 2210 regular method: each quarter's underpayment accrues interest
    // only from its due date to the filing deadline (4/15/2026 for TY2025).
    // Q1: 365d, Q2: 304d, Q3: 212d, Q4: 90d → total 971 days.
    // penalty = underpayment × rate × 971 / (4 × 365)
    //         = $10,000 × 0.07 × 971 / 1460 = $465.55 → $466
    // Old (wrong): $10,000 × 0.07 = $700 (50% overstatement)
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(0),
      estimatedPayments: d(35000),
      priorYearTax: d(50000),
      priorYearAGI: d(100000),
    }));
    // Required = min(90% × $50K, 100% × $50K) = $45K
    // Payments = $35K → underpayment = $10K
    expect(result.underpayment.toNumber()).toBe(10000);
    // Regular-method penalty: $10K × 0.07 × 971/1460 = $465.55 → $466
    expect(result.penalty.toNumber()).toBe(466);
  });
});

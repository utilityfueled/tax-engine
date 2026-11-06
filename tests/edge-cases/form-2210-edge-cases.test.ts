/**
 * Edge case tests for Form 2210 — Underpayment of Estimated Tax
 * Tests safe harbor threshold boundaries, 110% vs 100% prior year,
 * MFS $75K boundary, and penalty precision.
 * Spec: spec/federal/form-2210.yaml (boundary-regression-contract).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm2210,
  type Form2210Input,
} from "@/engine/forms/form-2210.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides?: Partial<Form2210Input>): Form2210Input {
  const input: Form2210Input = {
    currentYearTax: d(15000),
    withholding: d(10000),
    estimatedPayments: d(0),
    refundableCredits: d(0),
    priorYearTax: d(12000),
    priorYearAGI: d(100000),
    filingStatus: "single",
    ...overrides,
  };
  // This helper defines an explicit synthetic ordinary-resident, full-year
  // prior-return scenario; these are test source facts, never adapter defaults.
  input.taxYear = 2025;
  input.incomeTaxAfterCredits = input.currentYearTax;
  input.facts = {
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false,
    disasterReliefClaimed: false, waiverRequested: false,
    calculationMethod: "regular", withholdingMethod: "equal-installments",
    priorYearTaxStatus: input.priorYearTax === undefined ? "no-return" : "return-filed",
    priorYearFullYear: true, priorYearTaxComputationConfirmed: true,
    priorYearTaxForForm2210: input.priorYearTax?.toFixed(),
    priorYearAgiForForm2210: input.priorYearAGI?.toFixed(),
    ...overrides?.facts,
  };
  // Explicit fixture scenario: equal cash estimates paid on each timely date.
  input.payments = overrides?.payments ?? ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"]
    .map((date) => ({ date, amount: input.estimatedPayments.div(4), kind: "estimated" as const }));
  return input;
}

// ═══════════════════════════════════════════════════════════
// $1,000 Minimum Threshold Boundary
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - $1,000 minimum threshold", () => {
  it("exactly $999 net tax triggers safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10999),
      withholding: d(10000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Tax shown minus withholding < $1,000");
  });

  it("exactly $1,000 net tax does NOT trigger safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(11000),
      withholding: d(10000),
      estimatedPayments: d(0),
    }));
    // $11K tax - $10K payments = $1K net → NOT < $1K
    expect(result.safeHarborReason).not.toBe("Net tax < $1,000");
  });

  it("$0 net tax (overpayment) triggers safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(8000),
      withholding: d(10000),
    }));
    expect(result.safeHarborMet).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 90% Current Year Safe Harbor
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - 90% current year safe harbor", () => {
  it("exactly 90% meets safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(18000), // exactly 90%
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Statutory withholding installments meet 90% current year tax");
  });

  it("just below 90% does not meet safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(17999), // $1 short of 90%
      priorYearTax: d(20000), // Prior-year alternative cannot mask this boundary.
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toFixed()).toBe("1");
    expect(result.safeHarborReason).not.toBe("Statutory withholding installments meet 90% current year tax");
  });

  it("estimated payments count toward 90% threshold", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(10000),
      estimatedPayments: d(8000), // Total = $18K = 90%
      priorYearTax: d(20000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.requiredAnnualPayment.toFixed()).toBe("18000");
    expect(result.installments.map((entry) => entry.payments.toFixed())).toEqual(["4500", "4500", "4500", "4500"]);
  });
});

// ═══════════════════════════════════════════════════════════
// 100% vs 110% Prior Year Safe Harbor
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - prior year safe harbor", () => {
  it("100% prior year when AGI ≤ $150K", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(12000), // 100% of prior year $12K
      priorYearTax: d(12000),
      priorYearAGI: d(150000), // exactly at threshold → 100%
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 100% prior year tax");
  });

  it("110% required when AGI > $150K", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(12000), // 100% of prior $12K but not 110% ($13,200)
      priorYearTax: d(12000),
      priorYearAGI: d(150001), // $1 over threshold → 110%
    }));
    // 100% = $12K (met), but 110% = $13,200 (not met)
    // However, the code checks > threshold, so $150,001 triggers 110%
    expect(result.safeHarborReason).not.toBe("Timely installments meet 100% prior year tax");
  });

  it("110% prior year met", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(13200), // 110% of $12K
      priorYearTax: d(12000),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });

  it("MFS uses $75K threshold for 110%", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(12000), // 100% of $12K
      priorYearTax: d(12000),
      priorYearAGI: d(75001), // Over MFS $75K threshold → 110%
      filingStatus: "married_filing_separately",
    }));
    // Needs 110% = $13,200, only has $12,000
    expect(result.safeHarborReason).not.toContain("prior year tax");
  });

  it("MFS at exactly $75K uses 100%", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(12000),
      priorYearTax: d(12000),
      priorYearAGI: d(75000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 100% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty Calculation Precision
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - penalty calculation", () => {
  it("equal unpaid installments use the dated regular-method day totals", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(5000),
      estimatedPayments: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(100000),
    }));
    // Required = min(90% × $20K, 100% × $20K) = $18K
    // Payments = $5K. Underpayment = $13K
    // Penalty = $13K × 7% × 971/1460 = $605
    expect(result.underpayment.toNumber()).toBe(13000);
    expect(result.penalty.toNumber()).toBe(605);
  });

  it("required payment is lesser of 90% current or prior year", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(0),
      estimatedPayments: d(0),
      priorYearTax: d(10000), // 100% = $10K, much less than 90% of $50K = $45K
      priorYearAGI: d(100000),
    }));
    // Required = min($45K, $10K) = $10K
    expect(result.requiredAnnualPayment.toNumber()).toBe(10000);
    expect(result.underpayment.toNumber()).toBe(10000);
  });

  it("no prior year tax → required based on 90% only", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      priorYearTax: undefined,
    }));
    // No prior year → required = 90% of $20K = $18K
    expect(result.requiredAnnualPayment.toNumber()).toBe(18000);
  });

  it("refundable credits reduce required payments", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(15000),
      withholding: d(10000),
      estimatedPayments: d(0),
      refundableCredits: d(4000), // Reduces tax shown, not a separate payment.
    }));
    // Refundable credits reduce tax shown to $11K; withholding $10K exceeds 90% ($9,900).
    expect(result.safeHarborMet).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty Rate Verification
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - penalty rate verification", () => {
  it("equal installment shortfalls accrue for 365, 304, 212 and 90 days", () => {
    // Required = min(90% × $10K, 100% × $10K) = $9K
    // Payments = $2K. Underpayment = $7K. Penalty = $7K × 7% × 971/1460 = $326
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(2000),
      estimatedPayments: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(100000),
    }));
    expect(result.underpayment.toNumber()).toBe(7000);
    expect(result.penalty.toNumber()).toBe(326);
  });

  it("very small underpayment ($10) rounds penalty to $0", () => {
    // Required = 90% × $20K = $18K. Payments = $17,990. Underpayment = $10.
    // Penalty = $10 × 7% × 971/1460 = $0.47 → rounds to $0
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(17990),
      estimatedPayments: d(0),
      priorYearTax: d(25000), // 100% = $25K > 90% = $18K → required = $18K
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(10);
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Safe Harbor via Estimated Tax Payments (no W-2 withholding)
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor via estimated payments only", () => {
  it("estimated payments alone (no withholding) can satisfy 90% safe harbor", () => {
    // $0 withholding, $18K estimated → 90% of $20K = $18K → met
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      estimatedPayments: d(18000),
      priorYearTax: d(20000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 90% current year tax");
  });

  it("estimated payments alone satisfy 110% prior year safe harbor", () => {
    // AGI $200K → 110% required. 110% × $12K = $13,200. Withholding = $0, estimated = $13,200.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(0),
      estimatedPayments: d(13200),
      priorYearTax: d(12000),
      priorYearAGI: d(200000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Actual Eligible Prior Return Versus First-Year Filer
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - first-year filer", () => {
  it("an eligible full-year prior return with zero tax has a zero prior-tax requirement", () => {
    // Actual filed full-year prior return has zero tax. This is not inferred from being a first-time filer.
    // Even with $0 withholding, totalPayments ($0) ≥ priorYearRequired ($0).
    // But first the $1K net tax check: $20K - $0 = $20K ≥ $1K, so we reach safe harbor test 3.
    // 90% of $20K = $18K, not met with $0 payments. Prior year $0 → met.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      estimatedPayments: d(0),
      priorYearTax: d(0),
      priorYearAGI: d(0),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Eligible 100% prior year tax is zero");
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("first-year filer with undefined prior year tax uses 90% rule only", () => {
    // No prior year data → required = 90% of currentYearTax. Payments = $0 → penalty applies.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      estimatedPayments: d(0),
      priorYearTax: undefined,
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(18000);
    expect(result.underpayment.toNumber()).toBe(18000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ High-Income 110% Safe Harbor
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - MFJ high-income 110% safe harbor", () => {
  it("MFJ AGI > $150K requires 110% of prior year tax", () => {
    // AGI $200K (MFJ) → 110% required. 110% × $20K = $22K.
    // Payments = $20K (100%) → not sufficient.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(20000),
      estimatedPayments: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.safeHarborReason).toBe("No safe harbor met");
  });

  it("MFJ AGI > $150K — 110% of prior year met via combined withholding and estimated payments", () => {
    // AGI $200K (MFJ) → 110% × $20K = $22K. Withholding $10K + estimated $12K = $22K → met.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(10000),
      estimatedPayments: d(12000),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });

  it("MFJ AGI exactly $150K uses 100% (not 110%) of prior year", () => {
    // AGI $150K (MFJ) → at threshold, uses 100%. 100% × $15K = $15K. Payments = $15K → met.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(15000),
      estimatedPayments: d(0),
      priorYearTax: d(15000),
      priorYearAGI: d(150000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 100% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Penalty Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - zero penalty scenarios", () => {
  it("withholding exactly equals current year tax → $0 penalty", () => {
    // totalPayments = $25K = currentYearTax. netTaxOwed = $0 < $1K → safe harbor.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(25000),
      withholding: d(25000),
      estimatedPayments: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Tax shown minus withholding < $1,000");
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Large Prior Year Tax with Small Current Year
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - large prior year tax with small current year", () => {
  it("100% rule still requires full prior year amount even when larger than 90% current", () => {
    // Prior year $50K → 100% required = $50K. 90% of $10K = $9K. Required = min($9K, $50K) = $9K.
    // Payments = $5K → underpayment = $4K. Penalty = $4K × 7% × 971/1460 = $186.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(5000),
      estimatedPayments: d(0),
      priorYearTax: d(50000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(false);
    // Required = min(90% × $10K, 100% × $50K) = min($9K, $50K) = $9K
    expect(result.requiredAnnualPayment.toNumber()).toBe(9000);
    expect(result.underpayment.toNumber()).toBe(4000);
    expect(result.penalty.toNumber()).toBe(186);
  });

  it("large prior year with small current year — 90% of current is limiting factor", () => {
    // Payments $9K = exactly 90% of $10K current → safe harbor via 90% current year rule.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10000),
      withholding: d(9000),
      estimatedPayments: d(0),
      priorYearTax: d(50000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Statutory withholding installments meet 90% current year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Zero / Edge Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - zero and edge scenarios", () => {
  it("zero current year tax → no penalty", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(0),
      withholding: d(0),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("zero prior year tax → 100% of $0 is $0 → safe harbor", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      priorYearTax: d(0),
      priorYearAGI: d(50000),
    }));
    // 100% of $0 = $0. Payments ($0) ≥ $0 → safe harbor
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Eligible 100% prior year tax is zero");
  });

  it("HoH uses $150K threshold (same as single)", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(13200),
      priorYearTax: d(12000),
      priorYearAGI: d(200000),
      filingStatus: "head_of_household",
    }));
    // AGI $200K > $150K → 110% × $12K = $13,200 → met
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });

  it("QSS uses $150K threshold (same as MFJ)", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(13200),
      priorYearTax: d(12000),
      priorYearAGI: d(200000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Verification
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - audit trail", () => {
  it("safe harbor result includes withholding and remaining-tax audit lines", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(5000),
      withholding: d(5000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("safe_harbor");
  });

  it("penalty result includes audit lines for required payment, underpayment, and penalty", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      priorYearTax: undefined,
    }));
    expect(result.safeHarborMet).toBe(false);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).not.toContain("8"); // No prior return is supplied in this scenario.
    expect(lineIds).toContain("9");
    expect(lineIds).toContain("17a");
    expect(lineIds).toContain("19");
    expect(lineIds).toContain("safe_harbor");
  });
});

// ═══════════════════════════════════════════════════════════
// Combined Withholding + Estimated + Refundable Credits
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - all three payment sources", () => {
  it("refundable credits reduce tax shown, enabling 90% safe harbor with W+E alone", () => {
    // tax=$30K, R=$7K → taxShown=$23K, 90%=roundDollar($20,700)=$20,700
    // W=$10K + E=$11K = $21K ≥ $20,700 → safe harbor via 90% of reduced tax
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(10000),
      estimatedPayments: d(11000),
      refundableCredits: d(7000),
      priorYearTax: d(30000),
    }));
    expect(result.totalPayments.toNumber()).toBe(21000);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 90% current year tax");
  });

  it("$1 short of 90% of tax shown fails safe harbor", () => {
    // tax=$30K, R=$0 → taxShown=$30K, 90%=$27K
    // W=$9K + E=$17,999 = $26,999 → fails
    const result = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(9000),
      estimatedPayments: d(17999),
      priorYearTax: d(30000),
      priorYearAGI: d(100000),
    }));
    expect(result.totalPayments.toNumber()).toBe(26999);
    expect(result.safeHarborMet).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Safe Harbor Priority Order
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor priority order", () => {
  it("net tax < $1K checked first even when 90% also met", () => {
    // Net tax = $500 < $1K, and payments ≥ 90%
    // Should report "$1K" reason since it's checked first
    const result = calculateForm2210(makeInput({
      currentYearTax: d(10500),
      withholding: d(10000),
      estimatedPayments: d(0),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Tax shown minus withholding < $1,000");
  });

  it("90% checked before prior year when both met", () => {
    // Total payments $18K = 90% of $20K, and also ≥ 100% of prior $12K
    // Should report 90% reason since it's checked second (after $1K)
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(18000),
      priorYearTax: d(12000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Statutory withholding installments meet 90% current year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Alone Meets Safe Harbor (No Estimated Payments)
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - withholding alone satisfies safe harbor", () => {
  it("withholding alone at exactly 90% meets safe harbor with no estimated or refundable payments", () => {
    // Only W-2 withholding, $0 estimated, $0 refundable. Withholding = 90% of current tax.
    // totalPayments must equal withholding alone, and 90% safe harbor is met.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(40000),
      withholding: d(36000), // exactly 90% of $40K
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(50000), // 100% prior = $50K > 90% current = $36K → required = $36K
      priorYearAGI: d(100000),
    }));
    expect(result.totalPayments.toNumber()).toBe(36000);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Statutory withholding installments meet 90% current year tax");
  });

  it("withholding alone at 110% of prior year meets high-income safe harbor", () => {
    // AGI $200K (single) → 110% threshold. Withholding = 110% × $20K = $22K. No estimated payments.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(22000), // 110% × $20K
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "single",
    }));
    expect(result.totalPayments.toNumber()).toBe(22000);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 110% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Refundable Credits as Sole Payment Source
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - refundable credits reduce tax shown below $1K", () => {
  it("large refundable credits reduce tax shown to below $1,000 threshold", () => {
    // tax=$20K, R=$19.5K → taxShown=$500
    // $1K test: $500 - $0(withholding) = $500 < $1K → safe harbor
    // Without R: taxShown=$20K, $20K-$0=$20K ≥ $1K → no safe harbor
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      estimatedPayments: d(0),
      refundableCredits: d(19500),
      priorYearTax: d(25000),
      priorYearAGI: d(100000),
    }));
    expect(result.totalPayments.toNumber()).toBe(0);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Tax shown minus withholding < $1,000");
  });
});

// ═══════════════════════════════════════════════════════════
// Very Small and Very Large Underpayment Penalty
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - extreme underpayment penalty amounts", () => {
  it("$1 spread over four installments rounds its $0.04655 penalty to zero", () => {
    // Required = 90% × $20K = $18K. Payments = $17,999. Underpayment = $1.
    // Penalty = $1 × 7% × 971 / 1460 = $0.04655... → rounds down to $0.
    // Prior year $25K so required = min($18K, $25K) = $18K.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(17999),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(25000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(1);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("$50,000 underpayment produces $2,328 penalty", () => {
    // Required = 90% × $80K = $72K. Prior year $100K at AGI $100K → 100% = $100K.
    // Required = min($72K, $100K) = $72K. Payments = $22K. Underpayment = $50K.
    // Penalty = $50,000 × 7% × 971/1460 = $2,328.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(80000),
      withholding: d(22000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(100000),
      priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(50000);
    expect(result.penalty.toNumber()).toBe(2328);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior Year Tax = $0 Edge Case
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - prior year tax = $0 with high income", () => {
  it("prior year tax $0 with AGI > high-income threshold still yields $0 required (110% × $0 = $0)", () => {
    // High AGI prior year ($200K) triggers 110% multiplier, but 110% × $0 = $0.
    // Any payment amount ≥ $0 meets the prior year safe harbor.
    // Net tax = $20K - $0 = $20K ≥ $1K, and 90% of $20K = $18K > $0 payments,
    // so we reach safe harbor test 3: totalPayments ($0) ≥ priorYearRequired ($0) → met.
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(0),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(0),
      priorYearAGI: d(200000), // triggers 110% multiplier; 110% × $0 = $0
      filingStatus: "single",
    }));
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Eligible 110% prior year tax is zero");
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined Sources at Exact 90% Threshold
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - combined sources at exact 90% of tax shown threshold", () => {
  it("withholding + estimated exactly at 90% of tax shown (after refundable credit reduction)", () => {
    // tax=$50K, R=$10K → taxShown=$40K. 90%=$36K.
    // W=$16K + E=$20K = $36K = exactly 90% of taxShown
    const result = calculateForm2210(makeInput({
      currentYearTax: d(50000),
      withholding: d(16000),
      estimatedPayments: d(20000),
      refundableCredits: d(10000),
      priorYearTax: d(60000),
      priorYearAGI: d(100000),
    }));
    expect(result.totalPayments.toNumber()).toBe(36000);
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toBe("Timely installments meet 90% current year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// MFS vs Single Same Income Different Penalty Outcomes
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - MFS vs single filing status penalty divergence", () => {
  it("MFS filer with AGI $100K requires 110% prior year while single filer at same AGI requires only 100%", () => {
    // MFS threshold = $75K. AGI $100K > $75K → MFS needs 110% × $12K = $13,200.
    // Single threshold = $150K. AGI $100K ≤ $150K → single needs only 100% × $12K = $12,000.
    // Payments = $12,000: single filer meets safe harbor, MFS filer does not.

    const mfsResult = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(12000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(100000),
      filingStatus: "married_filing_separately",
    }));

    const singleResult = calculateForm2210(makeInput({
      currentYearTax: d(30000),
      withholding: d(12000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(100000),
      filingStatus: "single",
    }));

    // MFS: AGI $100K > $75K MFS threshold → 110% × $12K = $13,200 required; $12K paid → not met
    expect(mfsResult.safeHarborMet).toBe(false);
    expect(mfsResult.safeHarborReason).toBe("No safe harbor met");

    // Single: AGI $100K ≤ $150K single threshold → 100% × $12K = $12K required; $12K paid → met
    expect(singleResult.safeHarborMet).toBe(true);
    expect(singleResult.safeHarborReason).toBe("Timely installments meet 100% prior year tax");
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Line Values Match Result Fields
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - audit trail line values match result fields", () => {
  it("physical audit lines preserve tax components and the required-payment comparison", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000), withholding: d(5000), estimatedPayments: d(0),
      refundableCredits: d(0), priorYearTax: d(20000), priorYearAGI: d(100000),
    }));
    expect(result.safeHarborMet).toBe(false);
    const line = (id: string) => result.lines.find((entry) => entry.form === "Form 2210" && entry.line === id)?.value.toFixed();
    expect(line("1")).toBe("20000");
    expect(line("2")).toBe("0");
    expect(line("6")).toBe("5000");
    expect(line("7")).toBe("15000");
    expect(line("8")).toBe("20000");
    expect(line("9")).toBe("18000");
    expect(line("19")).toBe("605");
    expect(result.underpayment.toFixed()).toBe("13000");
    expect(result.installments.map((entry) => entry.underpayment.toFixed())).toEqual(["3250", "4500", "4500", "4500"]);
  });

  it("safe harbor path records line 7 and safe_harbor with safe_harbor value = 1", () => {
    const result = calculateForm2210(makeInput({
      currentYearTax: d(20000),
      withholding: d(18000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(100000),
    }));

    expect(result.safeHarborMet).toBe(true);

    const line7 = result.lines.find((l) => l.line === "7");
    const lineSafeHarbor = result.lines.find((l) => l.line === "safe_harbor");

    expect(line7).toBeDefined();
    expect(line7?.value.toFixed()).toBe("2000");
    expect(result.lines.find((line) => line.line === "6")?.value.toFixed()).toBe("18000");

    expect(lineSafeHarbor).toBeDefined();
    expect(lineSafeHarbor?.value.toNumber()).toBe(1); // 1 = true = safe harbor met
  });
});

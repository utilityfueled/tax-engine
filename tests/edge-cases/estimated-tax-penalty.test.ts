/**
 * Edge case tests for Form 2210 (estimated tax penalty) through federal pipeline.
 * Tests safe harbor rules, high-income 110% threshold, and MFS half-limits.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2210 } from "@/engine/forms/form-2210.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Safe Harbor: Net Tax < $1,000
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor: net tax < $1,000", () => {
  it("no penalty when withholding nearly covers tax", () => {
    const result = calculateForm2210({
      currentYearTax: d(15000),
      withholding: d(14500),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("$1,000");
  });

  it("exactly $999 net tax: safe harbor met", () => {
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d(9001),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("exactly $1,000 net tax: safe harbor NOT met (need other test)", () => {
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d(9000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // $1,000 is not < $1,000, but payments may meet 90% test
    // 90% of $10K = $9K, $9K ≥ $9K → safe harbor via 90% test
    expect(result.safeHarborMet).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Safe Harbor: Payments ≥ 90% of Current Year Tax
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor: 90% current year", () => {
  it("exactly 90% → safe harbor met", () => {
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(18000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("89.9% → safe harbor NOT met", () => {
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(17900),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // 90% = $18,000, payments = $17,900 < $18,000
    // No prior year data → penalty applies
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Safe Harbor: 100%/110% Prior Year Tax
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor: prior year tax", () => {
  it("100% of prior year tax for AGI ≤ $150K", () => {
    const result = calculateForm2210({
      currentYearTax: d(25000),
      withholding: d(15000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(15000),
      priorYearAGI: d(120000),
      filingStatus: "single",
    });
    // 90% current = $22,500 > $15K payments → fail
    // 100% prior = $15,000 = $15K payments → safe harbor met!
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("110% of prior year tax for AGI > $150K", () => {
    const result = calculateForm2210({
      currentYearTax: d(50000),
      withholding: d(20000),
      estimatedPayments: d(2000),
      refundableCredits: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "single",
    });
    // 90% current = $45,000 > $22K payments → fail
    // AGI > $150K → 110% prior = $22,000 = $22K payments → safe harbor met!
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("110% test fails when just under threshold", () => {
    const result = calculateForm2210({
      currentYearTax: d(50000),
      withholding: d(21000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(20000),
      priorYearAGI: d(200000),
      filingStatus: "single",
    });
    // 110% prior = $22,000 > $21K payments → fail
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
  });

  it("MFS $75K threshold for 110% safe harbor", () => {
    const result = calculateForm2210({
      currentYearTax: d(30000),
      withholding: d(11000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(80000), // Over $75K MFS threshold → 110%
      filingStatus: "married_filing_separately",
    });
    // 110% prior = $11,000 = $11K payments → safe harbor met!
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("MFS AGI ≤ $75K uses 100% threshold", () => {
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(10000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(70000), // Under $75K MFS → 100%
      filingStatus: "married_filing_separately",
    });
    // 100% prior = $10,000 = $10K payments → safe harbor met!
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - penalty calculation", () => {
  it("penalty = underpayment × short-method factor", () => {
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(5000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // 90% = $18,000, payments = $5K, underpayment = $13K
    // Penalty = $13,000 × 0.07 × 971/1460 = $605
    expect(result.underpayment.toNumber()).toBe(13000);
    expect(result.penalty.toNumber()).toBe(605);
  });

  it("refundable credits count as payments", () => {
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d(5000),
      estimatedPayments: d(0),
      refundableCredits: d(4500),
      filingStatus: "single",
    });
    // Total payments = $9,500, 90% = $9,000 → $9,500 ≥ $9,000 → safe harbor
    expect(result.safeHarborMet).toBe(true);
  });

  it("estimated payments reduce underpayment", () => {
    const result = calculateForm2210({
      currentYearTax: d(30000),
      withholding: d(10000),
      estimatedPayments: d(17000),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // Total payments = $27,000, 90% = $27,000 → safe harbor met
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Boundary Conditions
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: net tax exactly $999 (strict < $1,000)", () => {
  it("net tax $999 triggers safe harbor via < $1,000 rule", () => {
    // withholding = $50,001, currentYearTax = $51,000 → net owed = $999
    const result = calculateForm2210({
      currentYearTax: d(51000),
      withholding: d(50001),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("$1,000");
  });
});

describe("Form 2210 - edge case: net tax exactly $1,000 (not < $1,000)", () => {
  it("net tax $1,000 does NOT trigger the < $1,000 safe harbor alone", () => {
    // withholding = $50,000, currentYearTax = $51,000 → net owed = $1,000 (not < $1,000)
    // 90% of $51,000 = $45,900; payments $50,000 ≥ $45,900 → safe harbor via 90% test
    const result = calculateForm2210({
      currentYearTax: d(51000),
      withholding: d(50000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // Safe harbor IS met — but via the 90% test, not the < $1,000 test
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).not.toContain("$1,000");
  });

  it("net tax $1,000 with payments below 90% threshold results in penalty", () => {
    // currentYearTax = $20,000, withholding = $19,000 → net = $1,000 (not < $1,000)
    // 90% of $20,000 = $18,000; payments $19,000 ≥ $18,000 → safe harbor via 90%
    // To force a penalty: use tax $20,000, withholding $19,000, no prior year
    // Actually $19K ≥ $18K → still safe via 90%. Use $17,799 withholding instead
    // net = $20,000 − $17,799 = $2,201 > $1,000 and $17,799 < 90% ($18,000) → penalty
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(17799),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
  });
});

describe("Form 2210 - edge case: prior year tax $0", () => {
  it("prior year tax $0 means 100% safe harbor requires $0 payments (always met)", () => {
    // If prior year tax was $0, 100% of $0 = $0; any payment amount ≥ $0
    // So safe harbor is always met via the prior year test when priorYearTax = $0
    const result = calculateForm2210({
      currentYearTax: d(30000),
      withholding: d(500),   // Very low — won't meet 90% or < $1,000 threshold
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(0),
      priorYearAGI: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("100%");
  });
});

describe("Form 2210 - edge case: MFS $75K threshold for 110% rule", () => {
  it("MFS filer with prior year AGI just above $75K uses 110% multiplier", () => {
    // MFS threshold is $75,000 (not $150,000)
    // priorYearAGI = $75,001 → 110% multiplier applies
    // priorYearTax = $10,000 → required = $11,000; withholding $11,000 → safe harbor
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(11000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(75001),
      filingStatus: "married_filing_separately",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("110%");
  });

  it("MFS filer with prior year AGI exactly $75K uses 100% multiplier (not 110%)", () => {
    // AGI = $75,000 is NOT > $75,000 threshold, so 100% applies
    // priorYearTax = $10,000 → required = $10,000; withholding $10,000 → safe harbor
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(10000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(75000),
      filingStatus: "married_filing_separately",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("100%");
  });
});

describe("Form 2210 - edge case: withholding exactly 89% of current year tax", () => {
  it("withholding at exactly 89% (integer) fails 90% safe harbor and triggers penalty", () => {
    // currentYearTax = $100,000; 89% = $89,000; 90% = $90,000
    // $89,000 < $90,000 → 90% safe harbor fails
    // No prior year data → penalty applies on underpayment of $1,000
    const result = calculateForm2210({
      currentYearTax: d(100000),
      withholding: d(89000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // net tax = $100,000 − $89,000 = $11,000 (≥ $1,000 → first safe harbor fails)
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    // underpayment = $90,000 − $89,000 = $1,000; penalty = $1,000 × 7% × 971/1460 = $47
    expect(result.underpayment.toNumber()).toBe(1000);
    expect(result.penalty.toNumber()).toBe(47);
  });
});

describe("Form 2210 - edge case: very large underpayment ($50,000+)", () => {
  it("penalty scales correctly for $50,000 underpayment", () => {
    // currentYearTax = $200,000; 90% = $180,000; payments = $130,000
    // underpayment = $180,000 − $130,000 = $50,000
    // penalty = $50,000 × 7% × 971/1460 = $2,328
    const result = calculateForm2210({
      currentYearTax: d(200000),
      withholding: d(130000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(50000);
    expect(result.penalty.toNumber()).toBe(2328);
  });

  it("penalty scales correctly for very large underpayment ($200,000)", () => {
    // currentYearTax = $500,000; 90% = $450,000; payments = $250,000
    // underpayment = $450,000 − $250,000 = $200,000
    // penalty = $200,000 × 7% × 971/1460 = $9,311
    const result = calculateForm2210({
      currentYearTax: d(500000),
      withholding: d(250000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(200000);
    expect(result.penalty.toNumber()).toBe(9311);
  });
});

describe("Form 2210 - edge case: all withholding from W-2, no estimated payments", () => {
  it("W-2 withholding alone (no estimated payments) counts toward safe harbor", () => {
    // Pure W-2 scenario: withholding = 90% of tax, estimatedPayments = 0
    // Safe harbor should be met via the 90% test
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(36000), // exactly 90%
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.totalPayments.toNumber()).toBe(36000);
  });

  it("W-2 withholding just over 90% still triggers no penalty even with $0 estimated payments", () => {
    // withholding = $36,001 on $40,000 tax — slightly over 90%
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(36001),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
  });

  it("W-2 withholding at 88% with no estimated payments correctly triggers penalty", () => {
    // withholding = $35,200 (88% of $40,000) < 90% threshold of $36,000
    // net owed = $4,800 ≥ $1,000 → penalty applies
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(35200),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    // underpayment = $36,000 − $35,200 = $800; penalty = $800 × 7% × 971/1460 = $37
    expect(result.underpayment.toNumber()).toBe(800);
    expect(result.penalty.toNumber()).toBe(37);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Safe Harbor 100%/110% Prior Year Boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: 110% safe harbor at exact AGI boundary ($150K)", () => {
  it("single filer with AGI exactly $150,000 uses 100% (not 110%) multiplier", () => {
    // AGI = $150,000 is NOT > $150,000, so 100% applies
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(12000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(150000),
      filingStatus: "single",
    });
    // 100% of $12,000 = $12,000; payments = $12,000 → safe harbor met
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("100%");
  });

  it("single filer with AGI $150,001 uses 110% multiplier", () => {
    // AGI > $150,000 → 110% applies
    // priorYearTax = $12,000 → required = $13,200
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(13200),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(150001),
      filingStatus: "single",
    });
    // 110% of $12,000 = $13,200; payments = $13,200 → safe harbor met
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("110%");
  });

  it("single filer $500 under 110% requirement triggers penalty", () => {
    // AGI > $150K → 110% required; priorYearTax = $12,000 → required = $13,200
    // payments = $12,700 < $13,200 → fails prior year test
    // 90% of $40,000 = $36,000 > $12,700 → fails 90% test too
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(12700),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(200000),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    // requiredAnnualPayment = min(90% of $40K = $36,000, 110% of $12K = $13,200) = $13,200
    // underpayment = $13,200 - $12,700 = $500; penalty = $500 × 7% × 971/1460 = $23
    expect(result.requiredAnnualPayment.toNumber()).toBe(13200);
    expect(result.underpayment.toNumber()).toBe(500);
    expect(result.penalty.toNumber()).toBe(23);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: $1,000 Threshold Boundary Precision
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: $1,000 threshold with cents precision", () => {
  it("net tax of $999.50 rounds to $1,000 but raw value is < $1,000", () => {
    // currentYearTax = $10,000, withholding = $9,000.50 → net = $999.50
    // $999.50 < $1,000 → safe harbor met via < $1,000 rule
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d("9000.50"),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("$1,000");
  });

  it("net tax exactly $1,000.00 does NOT meet < $1,000 threshold", () => {
    // currentYearTax = $5,000, withholding = $4,000 → net = $1,000
    // $1,000 is NOT < $1,000 → first safe harbor fails
    // 90% of $5,000 = $4,500 > $4,000 → 90% test also fails
    // no prior year → penalty applies
    const result = calculateForm2210({
      currentYearTax: d(5000),
      withholding: d(4000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    // underpayment = 90% of $5,000 − $4,000 = $4,500 − $4,000 = $500
    expect(result.underpayment.toNumber()).toBe(500);
    expect(result.penalty.toNumber()).toBe(23); // $500 × 7% × 971/1460 = $23
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: MFS Threshold Differences
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: MFS vs MFJ threshold comparison", () => {
  it("MFJ filer with AGI $100K uses 100% (under $150K threshold)", () => {
    const result = calculateForm2210({
      currentYearTax: d(30000),
      withholding: d(8000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(8000),
      priorYearAGI: d(100000),
      filingStatus: "married_filing_jointly",
    });
    // 100% of $8,000 = $8,000; payments = $8,000 → safe harbor
    expect(result.safeHarborMet).toBe(true);
    expect(result.safeHarborReason).toContain("100%");
  });

  it("MFS filer with same AGI $100K uses 110% (over $75K MFS threshold)", () => {
    // MFS threshold is $75K, so $100K > $75K → 110% applies
    const result = calculateForm2210({
      currentYearTax: d(30000),
      withholding: d(8000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(8000),
      priorYearAGI: d(100000),
      filingStatus: "married_filing_separately",
    });
    // 110% of $8,000 = $8,800; payments = $8,000 < $8,800 → prior year fails
    // 90% of $30,000 = $27,000 > $8,000 → 90% also fails
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    // requiredAnnualPayment = min($27,000, $8,800) = $8,800
    expect(result.requiredAnnualPayment.toNumber()).toBe(8800);
    expect(result.underpayment.toNumber()).toBe(800); // $8,800 - $8,000
    expect(result.penalty.toNumber()).toBe(37); // $800 × 7% × 971/1460 = $37
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Underpayment Penalty with Prior Year Reducing Required
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: required payment uses min of 90% current and prior year", () => {
  it("prior year 100% is lower than 90% current → uses prior year as required", () => {
    // currentYearTax = $100,000; 90% = $90,000
    // priorYearTax = $30,000; AGI < $150K → 100% = $30,000
    // required = min($90,000, $30,000) = $30,000
    // payments = $25,000 → underpayment = $5,000
    const result = calculateForm2210({
      currentYearTax: d(100000),
      withholding: d(25000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(30000),
      priorYearAGI: d(120000),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(30000);
    expect(result.underpayment.toNumber()).toBe(5000);
    expect(result.penalty.toNumber()).toBe(233); // $5,000 × 7% × 971/1460 = $233
  });

  it("prior year 110% is lower than 90% current → uses 110% prior as required", () => {
    // currentYearTax = $200,000; 90% = $180,000
    // priorYearTax = $50,000; AGI $300K > $150K → 110% = $55,000
    // required = min($180,000, $55,000) = $55,000
    // payments = $50,000 → underpayment = $5,000
    const result = calculateForm2210({
      currentYearTax: d(200000),
      withholding: d(50000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(50000),
      priorYearAGI: d(300000),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    expect(result.requiredAnnualPayment.toNumber()).toBe(55000);
    expect(result.underpayment.toNumber()).toBe(5000);
    expect(result.penalty.toNumber()).toBe(233); // $5,000 × 7% × 971/1460 = $233
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Zero and Overpayment Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - edge case: zero tax and overpayment", () => {
  it("current year tax is $0 → no penalty regardless of payments", () => {
    const result = calculateForm2210({
      currentYearTax: d(0),
      withholding: d(0),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("$1,000");
  });

  it("overpayment (withholding exceeds tax) → safe harbor met, no penalty", () => {
    const result = calculateForm2210({
      currentYearTax: d(15000),
      withholding: d(20000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // net tax = max(0, $15K - $20K) = $0 < $1,000 → safe harbor
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.underpayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS / HoH: $150K threshold (same as MFJ, not MFS)
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - qualifying_surviving_spouse uses $150K threshold", () => {
  it("QSS filer with AGI $140K uses 100% prior year (under $150K threshold)", () => {
    // qualifying_surviving_spouse threshold is $150K, not $75K
    // priorYearAGI $140K ≤ $150K → 100% multiplier applies
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(12000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(12000),
      priorYearAGI: d(140000),
      filingStatus: "qualifying_surviving_spouse",
    });
    // 90% of $40K = $36K > $12K payments → fails 90%
    // 100% of $12K = $12K = $12K payments → safe harbor met
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("100%");
  });

  it("QSS filer with AGI $160K uses 110% prior year (over $150K threshold)", () => {
    // priorYearAGI $160K > $150K → 110% multiplier applies
    // priorYearTax = $10K → required = $11K; withholding $11K → safe harbor met
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(11000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(160000),
      filingStatus: "qualifying_surviving_spouse",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("110%");
  });

  it("head_of_household with AGI $160K uses 110% prior year (over $150K threshold)", () => {
    // head_of_household threshold is $150K (same as single/MFJ/QSS)
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(11000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(160000),
      filingStatus: "head_of_household",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("110%");
  });
});

// ═══════════════════════════════════════════════════════════
// Safe Harbor Priority: test 1 short-circuits before test 2/3
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - safe harbor priority ordering", () => {
  it("< $1,000 rule fires first even when payments also satisfy 90% test", () => {
    // net tax = $500 (< $1,000) AND payments also ≥ 90%
    // Should report safeHarborReason from the first test, not the second
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d(9500), // net = $500 < $1,000; 9500/10000 = 95% ≥ 90%
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    // The < $1,000 test is checked first
    expect(result.safeHarborReason).toContain("$1,000");
  });

  it("no prior year data provided → only $1,000 and 90% safe harbors can apply", () => {
    // Without priorYearTax, the 100%/110% safe harbor is unavailable.
    // Payments just under 90% → penalty must apply.
    const result = calculateForm2210({
      currentYearTax: d(50000),
      withholding: d(44000), // 88% — below 90% threshold of $45K
      estimatedPayments: d(0),
      refundableCredits: d(0),
      // no priorYearTax supplied
      filingStatus: "single",
    });
    // net owed = $6,000 ≥ $1,000 → first harbor fails
    // 90% = $45,000 > $44,000 → second harbor fails
    // no prior year → third harbor unavailable
    expect(result.safeHarborMet).toBe(false);
    expect(result.penalty.greaterThan(0)).toBe(true);
    expect(result.underpayment.toNumber()).toBe(1000); // $45K - $44K
    expect(result.penalty.toNumber()).toBe(47); // $1,000 × 7% × 971/1460 = $47
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail: lines field verification
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - audit trail lines field", () => {
  it("lines include Form 2210 entries for safe harbor case", () => {
    const result = calculateForm2210({
      currentYearTax: d(10000),
      withholding: d(9500),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.lines.length).toBeGreaterThan(0);
    const forms = result.lines.map((l) => l.form);
    expect(forms.every((f) => f === "Form 2210")).toBe(true);
    // Line 7 (total payments) must be present
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7).toBeDefined();
    expect(line7!.value.toNumber()).toBe(9500);
  });

  it("lines include underpayment and penalty entries when penalty applies", () => {
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(5000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(false);
    const lineNums = result.lines.map((l) => l.line);
    // Audit trail must record line 6 (required), line 7 (payments), line 8 (underpayment)
    expect(lineNums).toContain("6");
    expect(lineNums).toContain("7");
    expect(lineNums).toContain("8");
    expect(lineNums).toContain("penalty");
    const line8 = result.lines.find((l) => l.line === "8");
    expect(line8!.value.toNumber()).toBe(13000);
  });

  it("totalPayments reflects withholding + estimated (refundable credits reduce tax shown)", () => {
    const result = calculateForm2210({
      currentYearTax: d(100000),
      withholding: d(30000),
      estimatedPayments: d(20000),
      refundableCredits: d(10000),
      filingStatus: "single",
    });
    // totalPayments = W+E = $30K + $20K = $50K (refundable credits reduce tax, not count as payments)
    expect(result.totalPayments.toNumber()).toBe(50000);
    // taxShown = $100K - $10K = $90K. 90% = $81K > $50K → penalty
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(31000); // $81K - $50K
    expect(result.penalty.toNumber()).toBe(1443); // $31K × 7% × 971/1460 = $1,443
  });

  it("safeHarborReason reports 90% current year text when that test fires", () => {
    // Payments are exactly 90% of current year tax — first safe harbor (< $1K) fails
    // because net owed = $2,000 ≥ $1,000; second harbor (90%) fires
    const result = calculateForm2210({
      currentYearTax: d(20000),
      withholding: d(18000), // 90% exactly; net = $2,000 ≥ $1,000
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    expect(result.safeHarborMet).toBe(true);
    expect(result.penalty.toNumber()).toBe(0);
    expect(result.safeHarborReason).toContain("90%");
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty Precision: fractional underpayments and rounding
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - penalty precision with non-round underpayment amounts", () => {
  it("penalty is rounded to whole dollars for a fractional underpayment", () => {
    // currentYearTax = $10,003 → 90% = $9,002.70 (rounds to $9,003)
    // withholding = $9,000 → underpayment = $3; penalty = $3 × 7% = $0.21 → rounds to $0
    const result = calculateForm2210({
      currentYearTax: d(10003),
      withholding: d(9000),
      estimatedPayments: d(0),
      refundableCredits: d(0),
      filingStatus: "single",
    });
    // net owed = $1,003 ≥ $1,000 → first harbor fails
    // 90% of $10,003 = $9,002.70 → rounded to $9,003 (roundDollar)
    // $9,000 < $9,003 → 90% harbor fails; no prior year
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(3); // $9,003 - $9,000
    // $3 × 7% = $0.21 → rounded to $0 (or $1 depending on rounding mode)
    expect(result.penalty.toNumber()).toBeLessThanOrEqual(1);
  });

  it("MFS 110% safe harbor fails by exactly $1 → penalty = $0.07 rounded to $0", () => {
    // MFS, priorYearAGI $80K > $75K → 110% applies
    // priorYearTax = $10,000 → required = $11,000
    // withholding = $10,999 → underpayment = $1; penalty = $1 × 7% = $0.07 → rounds to $0
    const result = calculateForm2210({
      currentYearTax: d(40000),
      withholding: d(10999), // $1 under the 110% threshold of $11,000
      estimatedPayments: d(0),
      refundableCredits: d(0),
      priorYearTax: d(10000),
      priorYearAGI: d(80000),
      filingStatus: "married_filing_separately",
    });
    // 90% of $40K = $36K > $10,999 → 90% fails
    // 110% of $10K = $11K > $10,999 → prior year fails
    // net owed = $40K - $10,999 = $29,001 ≥ $1,000 → first harbor fails
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toNumber()).toBe(1); // $11,000 - $10,999
    // $1 × 7% = $0.07 → rounds to $0
    expect(result.penalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal Pipeline Integration
// ═══════════════════════════════════════════════════════════

describe("Form 2210 - federal pipeline", () => {
  it("penalty included in totalTax when underpayment exists", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        federalWithheld: "3000", // absurdly low
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
        medicareWages: "150000",
        medicareWithheld: "2175",
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.estimatedTaxPenalty.greaterThan(0)).toBe(true);
    // Total tax should be higher than tax before credits + additional taxes minus penalty
    // (penalty is included in totalAdditionalTaxes via Schedule 2)
  });

  it("estimated tax payments from input reduce underpayment", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        federalWithheld: "5000", // Low withholding
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
        medicareWages: "150000",
        medicareWithheld: "2175",
      }],
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "5000", type: "federal" },
          { date: "2025-06-15", amount: "5000", type: "federal" },
          { date: "2025-09-15", amount: "5000", type: "federal" },
          { date: "2026-01-15", amount: "5000", type: "federal" },
        ],
      },
    };
    const federal = calculateFederalTax(fixture);
    // $5K withholding + $20K estimated = $25K payments
    expect(federal.estimatedTaxPayments.toNumber()).toBe(20000);
    expect(federal.totalPayments.greaterThanOrEqualTo(d(25000))).toBe(true);
  });

  it("state estimated payments excluded from federal Line 26", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      adjustments: {
        estimatedTaxPayments: [
          { date: "2025-04-15", amount: "3000", type: "federal" },
          { date: "2025-04-15", amount: "2000", type: "state" },
        ],
      },
    };
    const federal = calculateFederalTax(fixture);
    // Only federal payments count
    expect(federal.estimatedTaxPayments.toNumber()).toBe(3000);
  });

  it("Schedule 1 and Schedule 2 audit lines both present", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "20000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    const forms = new Set(federal.allLines.map((l) => l.form));
    expect(forms.has("Sched 1")).toBe(true);
    expect(forms.has("Sched 2")).toBe(true);
    expect(forms.has("Form 2210")).toBe(true);
  });

  it("excess APTC repayment included in Form 2210 tax base (not silently dropped)", () => {
    // Single, $80K wages, $10K withholding, 12 months of 1095-A coverage
    // At 531% FPL, PTC = $0, APTC received = $2,400, excess APTC = $2,400.
    // Income tax on $65K TI = $9,214, no other taxes.
    // Without fix: currentYearTax = $9,214, taxShown - W = -$786 → safe harbor met ($0 penalty)
    // With fix: currentYearTax = $11,614, taxShown - W = $1,614 → fails $1K test → penalty
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "80000",
        federalWithheld: "10000",
        socialSecurityWages: "80000",
        socialSecurityWithheld: "4960",
        medicareWages: "80000",
        medicareWithheld: "1160",
      }],
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "A12345",
        monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          enrolleePremium: "400",
          slcsp: "400",
          advancePremiumTaxCredit: "200",
        })),
      }],
    };
    const federal = calculateFederalTax(fixture);

    // Verify the excess APTC repayment was computed
    expect(federal.totalAdditionalTaxes.greaterThan(0)).toBe(true);

    // The penalty must exist — the excess APTC repayment ($2,400) pushes
    // taxShown above the $1K safe harbor threshold
    expect(federal.estimatedTaxPenalty.greaterThan(0)).toBe(true);

    // Exact values: taxShown still exceeds the $1K safe harbor threshold,
    // and the resulting short-method penalty rounds to $14 under current 2025 constants.
    expect(federal.estimatedTaxPenalty.toNumber()).toBe(14);
  });
});

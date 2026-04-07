/**
 * Tests for Taxable Refund Worksheet (Schedule 1 Line 1).
 * Spec: spec/federal/taxable-refund-worksheet.yaml
 *
 * Covers the IRC §111 tax benefit rule and the SALT cap (IRC §164(b)(6))
 * interaction for determining how much of a prior-year state/local income
 * tax refund is taxable.
 */

import { describe, expect, it } from "vitest";
import { calculateTaxableRefundWorksheet } from "@/engine/forms/taxable-refund-worksheet.js";
import type { TaxableRefundWorksheetInput } from "@/models/inputs.js";

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function makeWorksheet(overrides: Partial<TaxableRefundWorksheetInput> = {}): TaxableRefundWorksheetInput {
  return {
    priorYearItemized: true,
    priorYearItemizedTotal: "20000",
    priorYearStandardDeduction: "14600",
    priorYearStateLocalTaxesPaid: "8000",
    priorYearFilingStatus: "single",
    ...overrides,
  };
}

function make1099Gs(...amounts: string[]) {
  return amounts.map((amt, i) => ({
    payer: `State ${i + 1}`,
    unemploymentCompensation: "0",
    stateLocalIncomeTaxRefund: amt,
  }));
}

// ═══════════════════════════════════════════════════════════
// Basic tax benefit rule (no SALT cap interaction)
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — basic tax benefit rule", () => {
  it("Line 1 — zero refund is trivially not taxable", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("0"),
      makeWorksheet()
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.totalRefund.toNumber()).toBe(0);
  });

  it("Line 1 — no 1099-G forms means zero refund", () => {
    const result = calculateTaxableRefundWorksheet([], makeWorksheet());
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Line 3 — did not itemize in prior year → refund not taxable", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearItemized: false })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.totalRefund.toNumber()).toBe(3000);
  });

  it("Line 6 — itemized equals standard deduction → no tax benefit → not taxable", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({
        priorYearItemizedTotal: "14600",
        priorYearStandardDeduction: "14600",
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.excessItemized.toNumber()).toBe(0);
  });

  it("Line 6 — itemized less than standard deduction → not taxable", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("1500"),
      makeWorksheet({
        priorYearItemizedTotal: "14000",
        priorYearStandardDeduction: "14600",
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Line 7 — refund fully taxable when less than excess of itemized over standard", () => {
    // Itemized $20,000, standard $14,600 → excess $5,400
    // Refund $3,000 < $5,400 → fully taxable
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: undefined })
    );
    expect(result.taxableRefund.toNumber()).toBe(3000);
    expect(result.taxBenefitAmount.toNumber()).toBe(3000);
  });

  it("Line 7 — refund capped at excess of itemized over standard", () => {
    // Itemized $15,000, standard $14,600 → excess $400
    // Refund $2,000 > $400 → only $400 taxable
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({
        priorYearItemizedTotal: "15000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: undefined,
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(400);
    expect(result.excessItemized.toNumber()).toBe(400);
  });

  it("multiple 1099-G Box 2 amounts are aggregated", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000", "1500", "500"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: undefined })
    );
    // Total refund = 4000, excess itemized = 5400 → taxable = 4000
    expect(result.totalRefund.toNumber()).toBe(4000);
    expect(result.taxableRefund.toNumber()).toBe(4000);
  });

  it("1099-G with no Box 2 field contributes zero", () => {
    const forms = [
      { payer: "State A", unemploymentCompensation: "5000" },
      { payer: "State B", unemploymentCompensation: "0", stateLocalIncomeTaxRefund: "1000" },
    ];
    const result = calculateTaxableRefundWorksheet(forms, makeWorksheet({
      priorYearStateLocalTaxesPaid: undefined,
    }));
    expect(result.totalRefund.toNumber()).toBe(1000);
    expect(result.taxableRefund.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// SALT cap interaction (Lines 8-13)
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — SALT cap interaction", () => {
  it("taxes paid below SALT cap — no cap adjustment, taxable = tax benefit amount", () => {
    // Paid $8,000 < $10,000 cap → no excess → Line 7 is the answer
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "8000" })
    );
    expect(result.saltCapApplied).toBe(false);
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });

  it("taxes paid exactly at SALT cap — no excess, no cap adjustment", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("1500"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "10000" })
    );
    expect(result.saltCapApplied).toBe(false);
    expect(result.excessOverSaltCap.toNumber()).toBe(0);
    expect(result.taxableRefund.toNumber()).toBe(1500);
  });

  it("SALT cap fully protects the refund — refund entirely from above-cap taxes", () => {
    // Paid $18,000, cap $10,000 → excess $8,000
    // Refund $5,000 ≤ $8,000 → fully protected → taxable = 0
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "18000" })
    );
    expect(result.saltCapApplied).toBe(true);
    expect(result.excessOverSaltCap.toNumber()).toBe(8000);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("SALT cap partially protects the refund", () => {
    // Paid $13,000, cap $10,000 → excess $3,000
    // Refund $5,000 → $3,000 protected, $2,000 could affect deduction
    // Itemized $20,000, standard $14,600 → excess $5,400
    // Tax benefit = min(5000, 5400) = 5000
    // Taxable = min(5000, 2000) = 2000
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "13000" })
    );
    expect(result.saltCapApplied).toBe(true);
    expect(result.excessOverSaltCap.toNumber()).toBe(3000);
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });

  it("SALT cap + tax benefit rule interact — both limit the result", () => {
    // Paid $12,000, cap $10,000 → excess $2,000
    // Refund $4,000 → $2,000 protected, $2,000 could affect deduction
    // Itemized $15,000, standard $14,600 → excess $400
    // Tax benefit = min(4000, 400) = 400
    // Taxable = min(400, 2000) = 400
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("4000"),
      makeWorksheet({
        priorYearItemizedTotal: "15000",
        priorYearStateLocalTaxesPaid: "12000",
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(400);
  });

  it("SALT cap is binding and excess < refund — partial protection", () => {
    // Paid $11,000, cap $10,000 → excess $1,000
    // Refund $3,000 → $1,000 protected, $2,000 could affect
    // Itemized $20,000, standard $14,600 → excess $5,400
    // Tax benefit = min(3000, 5400) = 3000
    // Taxable = min(3000, 2000) = 2000
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "11000" })
    );
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Alternative sales-tax deduction cap (Pub. 525)
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — sales-tax alternative cap", () => {
  it("caps taxable refund at the excess of the chosen income-tax deduction over alternative sales tax", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2500"),
      makeWorksheet({
        priorYearStateLocalTaxesPaid: "10000",
        priorYearAlternativeGeneralSalesTaxDeduction: "9000",
      })
    );

    expect(result.taxableRefund.toNumber()).toBe(1000);
  });

  it("applies the alternative sales-tax cap after SALT-cap protection", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5000"),
      makeWorksheet({
        priorYearStateLocalTaxesPaid: "13000",
        priorYearAlternativeGeneralSalesTaxDeduction: "9000",
      })
    );

    // SALT cap alone would leave $2,000 taxable.
    // Alternative sales-tax cap further limits the taxable refund to
    // min(10,000 chosen income-tax deduction - 9,000 alternative sales tax, 2,000) = 1,000.
    expect(result.taxableRefund.toNumber()).toBe(1000);
  });

  it("does not change the result when the alternative sales-tax deduction is lower by more than the refund", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("1500"),
      makeWorksheet({
        priorYearStateLocalTaxesPaid: "10000",
        priorYearAlternativeGeneralSalesTaxDeduction: "7000",
      })
    );

    expect(result.taxableRefund.toNumber()).toBe(1500);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS filing status ($5,000 SALT cap)
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — MFS filing status", () => {
  it("MFS uses $5,000 SALT cap instead of $10,000", () => {
    // MFS: cap $5,000
    // Paid $8,000 → excess $3,000
    // Refund $4,000 → $3,000 protected, $1,000 could affect
    // Itemized $10,000, standard $7,300 (MFS) → excess $2,700
    // Tax benefit = min(4000, 2700) = 2700
    // Taxable = min(2700, 1000) = 1000
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("4000"),
      makeWorksheet({
        priorYearFilingStatus: "married_filing_separately",
        priorYearItemizedTotal: "10000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "8000",
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(1000);
    expect(result.saltCapApplied).toBe(true);
  });

  it("MFS with taxes below $5,000 cap — no cap adjustment", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({
        priorYearFilingStatus: "married_filing_separately",
        priorYearItemizedTotal: "12000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "4000",
      })
    );
    expect(result.saltCapApplied).toBe(false);
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });

  it("MFS SALT cap fully protects a large refund", () => {
    // MFS: cap $5,000
    // Paid $12,000 → excess $7,000
    // Refund $6,000 ≤ $7,000 → fully protected → taxable = 0
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("6000"),
      makeWorksheet({
        priorYearFilingStatus: "married_filing_separately",
        priorYearItemizedTotal: "15000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "12000",
      })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Other filing statuses
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — filing status variations", () => {
  it("MFJ uses $10,000 SALT cap", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({
        priorYearFilingStatus: "married_filing_jointly",
        priorYearItemizedTotal: "32000",
        priorYearStandardDeduction: "29200",
        priorYearStateLocalTaxesPaid: "15000",
      })
    );
    // Excess itemized = 32000 - 29200 = 2800
    // Tax benefit = min(3000, 2800) = 2800
    // Excess over cap = 15000 - 10000 = 5000
    // Protected = min(3000, 5000) = 3000
    // Affecting deduction = 3000 - 3000 = 0
    // Taxable = min(2800, 0) = 0
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("HoH uses $10,000 SALT cap", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({
        priorYearFilingStatus: "head_of_household",
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "21900",
        priorYearStateLocalTaxesPaid: "9000",
      })
    );
    // Excess = 25000 - 21900 = 3100
    // Tax benefit = min(2000, 3100) = 2000
    // Taxes $9,000 < $10K cap → no adjustment
    expect(result.saltCapApplied).toBe(false);
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });

  it("QSS uses $10,000 SALT cap", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("1000"),
      makeWorksheet({
        priorYearFilingStatus: "qualifying_surviving_spouse",
        priorYearItemizedTotal: "30000",
        priorYearStandardDeduction: "29200",
        priorYearStateLocalTaxesPaid: "11000",
      })
    );
    // Excess = 30000 - 29200 = 800
    // Tax benefit = min(1000, 800) = 800
    // Excess over cap = 11000 - 10000 = 1000
    // Protected = min(1000, 1000) = 1000
    // Affecting = 1000 - 1000 = 0
    // Taxable = min(800, 0) = 0
    expect(result.taxableRefund.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases and boundary conditions
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — edge cases", () => {
  it("refund exactly equals excess of itemized over standard", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5400"),
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: undefined,
      })
    );
    // Excess = $5,400, refund = $5,400 → fully taxable
    expect(result.taxableRefund.toNumber()).toBe(5400);
  });

  it("refund exceeds excess of itemized over standard", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("10000"),
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: undefined,
      })
    );
    // Excess = $5,400, refund = $10,000 → capped at $5,400
    expect(result.taxableRefund.toNumber()).toBe(5400);
  });

  it("very small refund ($1) is still computed correctly", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("1"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: undefined })
    );
    expect(result.taxableRefund.toNumber()).toBe(1);
  });

  it("itemized barely above standard ($1 excess)", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5000"),
      makeWorksheet({
        priorYearItemizedTotal: "14601",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: undefined,
      })
    );
    // Excess = $1, refund = $5,000 → taxable = $1
    expect(result.taxableRefund.toNumber()).toBe(1);
  });

  it("SALT cap excess exactly equals refund — fully protected", () => {
    // Paid $13,000, cap $10,000 → excess $3,000
    // Refund $3,000 → exactly protected → taxable = 0
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "13000" })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("SALT cap excess is $1 less than refund — $1 could affect deduction", () => {
    // Paid $12,999, cap $10,000 → excess $2,999
    // Refund $3,000 → $2,999 protected, $1 could affect
    // Excess itemized = $5,400
    // Tax benefit = min(3000, 5400) = 3000
    // Taxable = min(3000, 1) = 1
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "12999" })
    );
    expect(result.taxableRefund.toNumber()).toBe(1);
  });

  it("priorYearStateLocalTaxesPaid zero behaves like not provided", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("2000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "0" })
    );
    // Zero SALT paid → no cap adjustment → result = tax benefit
    expect(result.saltCapApplied).toBe(false);
    expect(result.taxableRefund.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit trail
// ═══════════════════════════════════════════════════════════

describe("Taxable Refund Worksheet — audit trail", () => {
  it("produces audit lines for all computed worksheet lines", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("5000"),
      makeWorksheet({ priorYearStateLocalTaxesPaid: "13000" })
    );
    const auditForms = result.lines.filter(l => l.form === "Taxable Refund WS");
    expect(auditForms.length).toBeGreaterThan(0);
    // Should have lines for 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13
    const lineNumbers = auditForms.map(l => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("7");
    expect(lineNumbers).toContain("13");
  });

  it("audit trail for non-itemized case is concise", () => {
    const result = calculateTaxableRefundWorksheet(
      make1099Gs("3000"),
      makeWorksheet({ priorYearItemized: false })
    );
    const auditForms = result.lines.filter(l => l.form === "Taxable Refund WS");
    // Should have Line 1, Line 3, and result — but not Lines 4-13
    expect(auditForms.length).toBeLessThanOrEqual(4);
  });
});

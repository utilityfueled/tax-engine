/**
 * Edge case tests for Taxable Refund Worksheet — Schedule 1, Line 1.
 * Spec: spec/federal/taxable-refund-worksheet.yaml
 *
 * Key thresholds:
 *   SALT cap: $10,000 (general), $5,000 (MFS)
 *   Tax benefit rule: refund taxable only to extent prior-year SALT produced benefit
 *   Prior-year standard deduction (2024): $14,600 single, $29,200 MFJ
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateTaxableRefundWorksheet,
  type TaxableRefundWorksheetResult,
} from "@/engine/forms/taxable-refund-worksheet.js";
import type { TaxableRefundWorksheetInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";

const d = (v: string | number) => new Decimal(v);

function makeWorksheet(overrides: Partial<TaxableRefundWorksheetInput> = {}): TaxableRefundWorksheetInput {
  return {
    priorYearItemized: true,
    priorYearItemizedTotal: "20000",
    priorYearStandardDeduction: "14600",
    priorYearStateLocalTaxesPaid: "12000",
    priorYearAlternativeGeneralSalesTaxDeduction: "0",
    priorYearFilingStatus: "single" as FilingStatus,
    ...overrides,
  };
}

function calc(
  form1099Gs: Array<{ stateLocalIncomeTaxRefund?: string }>,
  worksheet: TaxableRefundWorksheetInput
): TaxableRefundWorksheetResult {
  return calculateTaxableRefundWorksheet(form1099Gs, worksheet);
}

describe("Taxable Refund Worksheet - standard deduction filer (no tax benefit)", () => {
  it("Taxable Refund WS Line 3 - took standard deduction, refund is not taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({ priorYearItemized: false })
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
  });
});

describe("Taxable Refund Worksheet - zero refund", () => {
  it("Taxable Refund WS Line 1 - zero refund is trivially not taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "0" }],
      makeWorksheet()
    );
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.totalRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS Line 1 - no 1099-G forms", () => {
    const result = calc([], makeWorksheet());
    expect(result.taxableRefund.toNumber()).toBe(0);
  });
});

describe("Taxable Refund Worksheet - itemized vs standard boundary", () => {
  it("Taxable Refund WS Line 6 - itemized exactly equals standard deduction yields zero taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "1500" }],
      makeWorksheet({
        priorYearItemizedTotal: "14600",
        priorYearStandardDeduction: "14600",
      })
    );
    // Excess: 14600 - 14600 = 0
    expect(result.excessItemized.toNumber()).toBe(0);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS Line 6 - itemized $1 above standard makes $1 potentially taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "1500" }],
      makeWorksheet({
        priorYearItemizedTotal: "14601",
        priorYearStandardDeduction: "14600",
      })
    );
    // Excess: 14601 - 14600 = 1
    // Tax benefit: min(1500, 1) = 1
    expect(result.excessItemized.toNumber()).toBe(1);
    expect(result.taxBenefitAmount.toNumber()).toBe(1);
  });

  it("Taxable Refund WS Line 7 - refund less than excess: full refund is taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "500" }],
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "0", // no SALT cap adjustment
      })
    );
    // Excess: 5400, tax benefit: min(500, 5400) = 500
    expect(result.taxableRefund.toNumber()).toBe(500);
  });

  it("Taxable Refund WS Line 7 - refund exceeds excess: capped at excess", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "10000" }],
      makeWorksheet({
        priorYearItemizedTotal: "15000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "0",
      })
    );
    // Excess: 400, tax benefit: min(10000, 400) = 400
    expect(result.taxableRefund.toNumber()).toBe(400);
  });
});

describe("Taxable Refund Worksheet - SALT cap interaction", () => {
  it("Taxable Refund WS Line 10 - taxes under SALT cap: no cap adjustment", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStateLocalTaxesPaid: "8000",
      })
    );
    // 8000 ≤ 10000 cap → excess over cap = 0 → no adjustment
    expect(result.excessOverSaltCap.toNumber()).toBe(0);
    expect(result.saltCapApplied).toBe(false);
  });

  it("Taxable Refund WS Line 10 - taxes at exactly SALT cap: no adjustment", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStateLocalTaxesPaid: "10000",
      })
    );
    expect(result.excessOverSaltCap.toNumber()).toBe(0);
    expect(result.saltCapApplied).toBe(false);
  });

  it("Taxable Refund WS Line 10 - SALT cap fully protects refund", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "5000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "18000",
      })
    );
    // Excess over cap: 18000 - 10000 = 8000
    // Non-taxable from cap: min(5000, 8000) = 5000 → entire refund protected
    // Refund affecting deduction: 5000 - 5000 = 0
    expect(result.excessOverSaltCap.toNumber()).toBe(8000);
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS Line 13 - SALT cap partially protects refund", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "5000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "13000",
      })
    );
    // Excess: 25000 - 14600 = 10400
    // Tax benefit: min(5000, 10400) = 5000
    // Excess over cap: 13000 - 10000 = 3000
    // Non-taxable from cap: min(5000, 3000) = 3000
    // Refund affecting deduction: 5000 - 3000 = 2000
    // Taxable: min(5000, 2000) = 2000
    expect(result.taxableRefund.toNumber()).toBe(2000);
    expect(result.saltCapApplied).toBe(true);
  });
});

describe("Taxable Refund Worksheet - MFS SALT cap ($5,000)", () => {
  it("Taxable Refund WS MFS - uses $5,000 SALT cap instead of $10,000", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "15000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "8000",
        priorYearFilingStatus: "married_filing_separately",
      })
    );
    // Excess: 15000 - 7300 = 7700
    // Tax benefit: min(2000, 7700) = 2000
    // MFS cap = 5000, excess over cap: 8000 - 5000 = 3000
    // Non-taxable from cap: min(2000, 3000) = 2000 → fully protected
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.saltCapApplied).toBe(true);
  });

  it("Taxable Refund WS MFS - taxes at exactly $5,000 cap: no adjustment", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "1000" }],
      makeWorksheet({
        priorYearItemizedTotal: "12000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "5000",
        priorYearFilingStatus: "married_filing_separately",
      })
    );
    expect(result.excessOverSaltCap.toNumber()).toBe(0);
    expect(result.saltCapApplied).toBe(false);
  });
});

describe("Taxable Refund Worksheet - multiple 1099-G forms", () => {
  it("Taxable Refund WS Line 1 - aggregates refunds from multiple states", () => {
    const result = calc(
      [
        { stateLocalIncomeTaxRefund: "2000" },
        { stateLocalIncomeTaxRefund: "1500" },
      ],
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStateLocalTaxesPaid: "0",
      })
    );
    expect(result.totalRefund.toNumber()).toBe(3500);
    // Excess: 20000 - 14600 = 5400
    // Tax benefit: min(3500, 5400) = 3500
    expect(result.taxableRefund.toNumber()).toBe(3500);
  });
});

describe("Taxable Refund Worksheet - MFJ and HoH filing statuses", () => {
  it("Taxable Refund WS MFJ - uses $10,000 SALT cap (same as single)", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "3000" }],
      makeWorksheet({
        priorYearItemizedTotal: "40000",
        priorYearStandardDeduction: "29200",
        priorYearStateLocalTaxesPaid: "15000",
        priorYearFilingStatus: "married_filing_jointly",
      })
    );
    // Excess: 40000 - 29200 = 10800
    // Tax benefit: min(3000, 10800) = 3000
    // Excess over cap: 15000 - 10000 = 5000
    // Non-taxable: min(3000, 5000) = 3000 → fully protected
    expect(result.excessOverSaltCap.toNumber()).toBe(5000);
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS MFJ - SALT cap partially protects large refund", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "8000" }],
      makeWorksheet({
        priorYearItemizedTotal: "45000",
        priorYearStandardDeduction: "29200",
        priorYearStateLocalTaxesPaid: "14000",
        priorYearFilingStatus: "married_filing_jointly",
      })
    );
    // Excess: 45000 - 29200 = 15800
    // Tax benefit: min(8000, 15800) = 8000
    // Excess over cap: 14000 - 10000 = 4000
    // Non-taxable: min(8000, 4000) = 4000
    // Refund affecting deduction: 8000 - 4000 = 4000
    // Taxable: min(8000, 4000) = 4000
    expect(result.taxableRefund.toNumber()).toBe(4000);
  });

  it("Taxable Refund WS HoH - uses $10,000 SALT cap", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "21900",
        priorYearStateLocalTaxesPaid: "12000",
        priorYearFilingStatus: "head_of_household",
      })
    );
    // Excess: 25000 - 21900 = 3100
    // Tax benefit: min(2000, 3100) = 2000
    // Excess over cap: 12000 - 10000 = 2000
    // Non-taxable: min(2000, 2000) = 2000 → fully protected
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS HoH - partial protection when excess over cap is small", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "5000" }],
      makeWorksheet({
        priorYearItemizedTotal: "30000",
        priorYearStandardDeduction: "21900",
        priorYearStateLocalTaxesPaid: "11000",
        priorYearFilingStatus: "head_of_household",
      })
    );
    // Excess: 30000 - 21900 = 8100
    // Tax benefit: min(5000, 8100) = 5000
    // Excess over cap: 11000 - 10000 = 1000
    // Non-taxable: min(5000, 1000) = 1000
    // Refund affecting deduction: 5000 - 1000 = 4000
    // Taxable: min(5000, 4000) = 4000
    expect(result.taxableRefund.toNumber()).toBe(4000);
  });
});

describe("Taxable Refund Worksheet - additional boundary conditions", () => {
  it("Taxable Refund WS Line 6 - itemized $1 below standard yields zero taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "3000" }],
      makeWorksheet({
        priorYearItemizedTotal: "14599",
        priorYearStandardDeduction: "14600",
      })
    );
    // Excess: max(0, 14599 - 14600) = 0
    expect(result.excessItemized.toNumber()).toBe(0);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });

  it("Taxable Refund WS Line 1 - $1 refund with large excess is fully taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "1" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "0",
      })
    );
    // Excess: 10400
    // Tax benefit: min(1, 10400) = 1
    expect(result.taxableRefund.toNumber()).toBe(1);
  });

  it("Taxable Refund WS Line 10 - SALT $1 above cap ($10,001) creates $1 excess", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "5000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "10001",
      })
    );
    // Excess over cap: 10001 - 10000 = 1
    // Non-taxable: min(5000, 1) = 1
    // Refund affecting deduction: 5000 - 1 = 4999
    // Tax benefit: min(5000, 10400) = 5000
    // Taxable: min(5000, 4999) = 4999
    expect(result.excessOverSaltCap.toNumber()).toBe(1);
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(4999);
  });

  it("Taxable Refund WS - multiple 1099-Gs including zero-refund entries", () => {
    const result = calc(
      [
        { stateLocalIncomeTaxRefund: "2000" },
        { stateLocalIncomeTaxRefund: "0" },
        { stateLocalIncomeTaxRefund: "500" },
      ],
      makeWorksheet({
        priorYearItemizedTotal: "20000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "0",
      })
    );
    expect(result.totalRefund.toNumber()).toBe(2500);
    // Excess: 5400, tax benefit: min(2500, 5400) = 2500
    expect(result.taxableRefund.toNumber()).toBe(2500);
  });

  it("Taxable Refund WS - very large refund capped by tiny excess", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "50000" }],
      makeWorksheet({
        priorYearItemizedTotal: "14602",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "0",
      })
    );
    // Excess: 14602 - 14600 = 2
    // Tax benefit: min(50000, 2) = 2
    expect(result.taxableRefund.toNumber()).toBe(2);
  });
});

describe("Taxable Refund Worksheet - alternative sales-tax cap", () => {
  it("Taxable Refund WS sales-tax cap - reduces taxable refund when income-tax deduction barely exceeds sales-tax alternative", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2500" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "10000",
        priorYearAlternativeGeneralSalesTaxDeduction: "9000",
      })
    );
    // Tax benefit: min(2500, 10400) = 2500
    // No SALT excess (10000 ≤ 10000)
    // Sales-tax alt cap: min(10000, 10000) - min(9000, 10000) = 10000 - 9000 = 1000
    // Taxable: min(2500, 1000) = 1000
    expect(result.taxableRefund.toNumber()).toBe(1000);
    expect(result.alternativeSalesTaxCapApplied).toBe(true);
  });

  it("Taxable Refund WS sales-tax cap - sales-tax equals income-tax yields zero taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "10000",
        priorYearAlternativeGeneralSalesTaxDeduction: "10000",
      })
    );
    // Sales-tax alt cap: 10000 - 10000 = 0
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.alternativeSalesTaxCapApplied).toBe(true);
  });

  it("Taxable Refund WS sales-tax cap - sales-tax exceeds income-tax yields zero taxable", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "3000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "8000",
        priorYearAlternativeGeneralSalesTaxDeduction: "12000",
      })
    );
    // Sales-tax alt cap: min(8000, 10000) - min(12000, 10000) = 8000 - 10000 → max(0, -2000) = 0
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.alternativeSalesTaxCapApplied).toBe(true);
  });

  it("Taxable Refund WS sales-tax cap - both taxes above SALT cap use capped values yielding zero alt cap", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "1000" }],
      makeWorksheet({
        priorYearItemizedTotal: "25000",
        priorYearStandardDeduction: "14600",
        priorYearStateLocalTaxesPaid: "10500",
        priorYearAlternativeGeneralSalesTaxDeduction: "11000",
      })
    );
    // Excess: 25000 - 14600 = 10400, tax benefit: min(1000, 10400) = 1000
    // SALT excess: 10500 - 10000 = 500, non-taxable: min(1000, 500) = 500
    // Refund affecting deduction: 1000 - 500 = 500, provisional: min(1000, 500) = 500
    // Sales-tax alt cap: min(10500, 10000) - min(11000, 10000) = 10000 - 10000 = 0
    // 0 < 500, so sales-tax cap applies → taxable = 0
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(0);
    expect(result.alternativeSalesTaxCapApplied).toBe(true);
  });

  it("Taxable Refund WS sales-tax cap - MFS uses $5,000 cap for both", () => {
    const result = calc(
      [{ stateLocalIncomeTaxRefund: "2000" }],
      makeWorksheet({
        priorYearItemizedTotal: "15000",
        priorYearStandardDeduction: "7300",
        priorYearStateLocalTaxesPaid: "7000",
        priorYearAlternativeGeneralSalesTaxDeduction: "4000",
        priorYearFilingStatus: "married_filing_separately",
      })
    );
    // MFS cap = $5,000
    // Sales-tax alt cap: min(7000, 5000) - min(4000, 5000) = 5000 - 4000 = 1000
    // Excess: 15000 - 7300 = 7700
    // Tax benefit: min(2000, 7700) = 2000
    // Excess over MFS cap: 7000 - 5000 = 2000
    // Non-taxable: min(2000, 2000) = 2000 → fully protected by SALT cap
    // But SALT cap makes provisional 0, so sales-tax doesn't further reduce
    expect(result.saltCapApplied).toBe(true);
    expect(result.taxableRefund.toNumber()).toBe(0);
  });
});

/**
 * Edge case tests for State and Local General Sales Tax Deduction Worksheet.
 * Spec: spec/federal/state-sales-tax-deduction.yaml
 *
 * Key boundaries:
 *   AGI bracket transitions ($20K, $30K, $40K, $50K, $60K, $70K, $80K, $100K, $125K, $150K, $200K)
 *   Local rate capped at state rate (except Alaska local-only path)
 *   Exemption multiplier scaling for large families
 *   Combined rate precision with fractional state rates (e.g., MN 6.875%)
 *   No-sales-tax states return $0 even with specific purchases
 *   Actual vs table method interaction with specific purchases
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSalesTaxDeduction } from "@/engine/forms/state-sales-tax-deduction-worksheet.js";
import {
  STATE_SALES_TAX_RATES_2025,
  getExemptionMultiplier,
  getAGIBracketIndex,
  BASE_TAXABLE_SPENDING_2025,
  ADDITIONAL_EXEMPTION_INCREMENT,
} from "@/models/sales-tax-tables.js";
import type { SalesTaxDeduction } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function makeSalesTax(overrides: Partial<SalesTaxDeduction> = {}): SalesTaxDeduction {
  return {
    state: "TX",
    localSalesTaxRate: "0",
    method: "table" as const,
    actualGeneralSalesTax: "0",
    specificPurchaseSalesTax: [],
    autoCompare: true,
    ...overrides,
  };
}

// ════��══════════════════════════════════════════════════════
// AGI bracket boundary transitions
// ═════════════════════��═════════════════════════════════════

describe("Sales tax worksheet - AGI bracket boundary transitions", () => {
  it("WS Line 4 - AGI $19,999 uses bracket 0, AGI $20,000 uses bracket 1 with different base spending", () => {
    // Bracket 0: base $5,480 × 0.0625 = $343
    // Bracket 1: base $8,620 × 0.0625 = $539
    const below = calculateSalesTaxDeduction(makeSalesTax(), d(19999), 1);
    const atBoundary = calculateSalesTaxDeduction(makeSalesTax(), d(20000), 1);
    expect(below.totalSalesTaxDeduction.toNumber()).toBe(343);
    expect(atBoundary.totalSalesTaxDeduction.toNumber()).toBe(539);
  });

  it("WS Line 4 - AGI $79,999 uses bracket 6 ($70K-$80K), AGI $80,000 uses bracket 7 ($80K-$100K)", () => {
    // Bracket 6: base $14,580 × 0.0625 = $911
    // Bracket 7: base $16,520 × 0.0625 = $1,033
    const below = calculateSalesTaxDeduction(makeSalesTax(), d(79999), 1);
    const atBoundary = calculateSalesTaxDeduction(makeSalesTax(), d(80000), 1);
    expect(below.totalSalesTaxDeduction.toNumber()).toBe(911);
    expect(atBoundary.totalSalesTaxDeduction.toNumber()).toBe(1033);
  });

  it("WS Line 4 - AGI $199,999 uses bracket 10, AGI $200,000 uses bracket 11 (final)", () => {
    // Bracket 10: base $26,480 × 0.0625 = $1,655
    // Bracket 11: base $36,840 × 0.0625 = $2,303
    const below = calculateSalesTaxDeduction(makeSalesTax(), d(199999), 1);
    const atBoundary = calculateSalesTaxDeduction(makeSalesTax(), d(200000), 1);
    expect(below.totalSalesTaxDeduction.toNumber()).toBe(1655);
    expect(atBoundary.totalSalesTaxDeduction.toNumber()).toBe(2303);
  });

  it("WS Line 4 - AGI $99,999 uses bracket 7 ($80K-$100K), AGI $100,000 uses bracket 8 ($100K-$125K)", () => {
    // Bracket 7: base $16,520 × 0.0625 = $1,033
    // Bracket 8: base $19,640 × 0.0625 = $1,228
    const below = calculateSalesTaxDeduction(makeSalesTax(), d(99999), 1);
    const atBoundary = calculateSalesTaxDeduction(makeSalesTax(), d(100000), 1);
    expect(below.totalSalesTaxDeduction.toNumber()).toBe(1033);
    expect(atBoundary.totalSalesTaxDeduction.toNumber()).toBe(1228);
  });

  it("WS Line 4 - very high AGI ($5M) still uses final bracket", () => {
    // Final bracket: base $36,840 × 0.0625 = $2,303
    const result = calculateSalesTaxDeduction(makeSalesTax(), d(5000000), 1);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2303);
    expect(getAGIBracketIndex(d(5000000))).toBe(11);
  });

  it("WS Line 4 - negative AGI treated as bracket 0", () => {
    // Negative AGI is below all brackets → bracket 0
    const result = calculateSalesTaxDeduction(makeSalesTax(), d(-50000), 1);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(343);
    expect(getAGIBracketIndex(d(-50000))).toBe(0);
  });
});

// ═══���═══════════════��═══════════════════════════════════════
// Local rate cap behavior
// ═════════��═══════════════════════════════���═════════════════

describe("Sales tax worksheet - local rate cap at state rate boundary", () => {
  it("WS Line 2 - local rate exactly equal to state rate is not capped (TX 6.25% + 6.25% local)", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX", localSalesTaxRate: "0.0625" }),
      d(75000),
      1,
    );
    // Local equals state → not capped, combined = 0.0625 + 0.0625 = 0.125
    expect(result.combinedRate.toNumber()).toBe(0.125);
    // Base spending $14,580 × 0.125 = $1,823
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(1823);
  });

  it("WS Line 2 - local rate $0.001 above state rate is capped (TX 6.26% local capped to 6.25%)", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX", localSalesTaxRate: "0.0626" }),
      d(75000),
      1,
    );
    // Local 0.0626 > state 0.0625 → capped at 0.0625
    expect(result.combinedRate.toNumber()).toBe(0.125);
  });

  it("WS Line 2 - Alaska local rate is NOT capped because state rate is zero", () => {
    // Alaska special path: local-only general sales tax
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "AK", localSalesTaxRate: "0.05" }),
      d(75000),
      1,
    );
    // Alaska: state = 0, local = 0.05 (uncapped), combined = 0.05
    expect(result.stateRate.toNumber()).toBe(0);
    expect(result.combinedRate.toNumber()).toBe(0.05);
    // Base spending $14,580 × 0.05 = $729
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(729);
  });

  it("WS Line 7 - Alaska with zero local rate produces zero deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "AK", localSalesTaxRate: "0" }),
      d(75000),
      1,
    );
    expect(result.combinedRate.toNumber()).toBe(0);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
  });
});

// ════════════════════════════���══════════════════════════════
// No-sales-tax states with specific purchases
// ══════════════════���════════════════════════════════���═══════

describe("Sales tax worksheet - no-sales-tax states ignore specific purchases", () => {
  it("WS Line 7 - Oregon with specific vehicle purchase still returns $0", () => {
    // Combined rate = 0 → early return with $0
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "OR",
        specificPurchaseSalesTax: [
          { description: "Car bought in WA", salesTaxPaid: "3000" },
        ],
      }),
      d(75000),
      1,
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
    expect(result.specificPurchaseTotal.toNumber()).toBe(0);
  });

  it("WS Line 7 - New Hampshire actual method with receipts still returns $0", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "NH",
        method: "actual",
        actualGeneralSalesTax: "500",
      }),
      d(75000),
      1,
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════���═══════════════
// Exemption multiplier edge cases
// ═══════════════���═══════════════════════════════════════════

describe("Sales tax worksheet - exemption multiplier scaling", () => {
  it("WS Line 5 - family of 10 applies multiplier 1.863 + 6×0.107 = 2.505", () => {
    const multiplier = getExemptionMultiplier(10);
    // 4-exemption base 1.863 + (10-4) × 0.107 = 1.863 + 0.642 = 2.505
    expect(multiplier.toNumber()).toBe(2.505);

    const result = calculateSalesTaxDeduction(makeSalesTax(), d(75000), 10);
    // Base spending $14,580 × 0.0625 = $911.25 → $911 for 1 exemption
    // $911 × 2.505 = $2,282 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2282);
  });

  it("WS Line 5 - single exemption (1) gives no multiplier adjustment", () => {
    const result = calculateSalesTaxDeduction(makeSalesTax(), d(75000), 1);
    // Base × rate × 1.000 = $911
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(911);
  });

  it("WS Line 5 - transition from 4 to 5 exemptions adds exactly 0.107", () => {
    const result4 = calculateSalesTaxDeduction(makeSalesTax(), d(75000), 4);
    const result5 = calculateSalesTaxDeduction(makeSalesTax(), d(75000), 5);
    // 4 exemptions: $911 × 1.863 = $1,697
    // 5 exemptions: $911 × 1.970 = $1,795
    expect(result4.totalSalesTaxDeduction.toNumber()).toBe(1697);
    expect(result5.totalSalesTaxDeduction.toNumber()).toBe(1795);
  });
});

// ═══════════��═══════════════════════════════════════════════
// Fractional rate precision
// ═��═══════════════════���══════════════════════���══════════════

describe("Sales tax worksheet - fractional rate precision", () => {
  it("WS Line 1 - Minnesota 6.875% rate produces correct Decimal multiplication", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "MN" }),
      d(75000),
      1,
    );
    expect(result.stateRate.toNumber()).toBe(0.06875);
    // Base spending $14,580 × 0.06875 = $1,002.375 → rounded to $1,002
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(1002);
  });

  it("WS Line 3 - Missouri fractional state rate 4.225% plus local 2% combined precisely", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "MO", localSalesTaxRate: "0.02" }),
      d(75000),
      1,
    );
    // State 0.04225, local 0.02, combined 0.06225
    expect(result.combinedRate.toNumber()).toBe(0.06225);
    // Base spending $14,580 × 0.06225 = $907.605 → $908 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(908);
  });
});

// ═════���═════════════════════════════════════════════════════
// Actual method edge cases
// ═══════════════════���═════════════════════════��═════════════

describe("Sales tax worksheet - actual method edge cases", () => {
  it("WS Line 7 - actual method $0 general sales tax plus specific purchase yields purchase total only", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "TX",
        method: "actual",
        actualGeneralSalesTax: "0",
        specificPurchaseSalesTax: [
          { description: "Boat", salesTaxPaid: "4500" },
        ],
      }),
      d(75000),
      1,
    );
    // $0 actual + $4,500 specific = $4,500
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(4500);
    expect(result.tableAmount.toNumber()).toBe(0);
    expect(result.specificPurchaseTotal.toNumber()).toBe(4500);
  });

  it("WS Line 7 - actual method includes both receipt total and specific purchases", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "FL",
        method: "actual",
        actualGeneralSalesTax: "3200",
        specificPurchaseSalesTax: [
          { description: "Car", salesTaxPaid: "2100" },
          { description: "Boat", salesTaxPaid: "900" },
        ],
      }),
      d(100000),
      2,
    );
    // $3,200 actual + $2,100 + $900 = $6,200
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(6200);
    expect(result.method).toBe("actual");
    expect(result.tableAmount.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Table method with maximum local rate doubling deduction
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet - local rate doubles effective deduction", () => {
  it("WS Line 3 - Indiana 7% state with 7% max local rate yields 14% combined", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "IN", localSalesTaxRate: "0.07" }),
      d(75000),
      1,
    );
    // State 0.07, local 0.07 (capped at state = 0.07), combined = 0.14
    expect(result.combinedRate.toNumber()).toBe(0.14);
    // Base spending $14,580 × 0.14 = $2,041
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2041);
  });

  it("WS Line 7 - no-local-rate Indiana vs max-local-rate Indiana shows doubling", () => {
    const noLocal = calculateSalesTaxDeduction(
      makeSalesTax({ state: "IN", localSalesTaxRate: "0" }),
      d(75000),
      1,
    );
    const maxLocal = calculateSalesTaxDeduction(
      makeSalesTax({ state: "IN", localSalesTaxRate: "0.07" }),
      d(75000),
      1,
    );
    // No local: $14,580 × 0.07 = $1,021
    // Max local: $14,580 × 0.14 = $2,041
    expect(noLocal.totalSalesTaxDeduction.toNumber()).toBe(1021);
    expect(maxLocal.totalSalesTaxDeduction.toNumber()).toBe(2041);
    // Exactly double (within rounding)
    expect(maxLocal.totalSalesTaxDeduction.toNumber()).toBe(
      noLocal.totalSalesTaxDeduction.toNumber() * 2 - 1, // $1021 × 2 = $2042, rounding gives $2041
    );
  });
});

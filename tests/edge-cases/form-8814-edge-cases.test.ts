/**
 * Edge case tests for Form 8814 — Parents' Election To Report Child's Interest and Dividends.
 * Spec: spec/federal/form-8814.yaml
 *
 * Key thresholds (2025):
 *   amountNotTaxed = $1,350 (below this, form does not apply)
 *   baseAmount = $2,700 (above this, excess flows to parent's return)
 *   maximumChildIncome = $13,500 (at or above, must use Form 8615)
 *   taxRate = 10% on the tier from $1,350 to $2,700
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8814, aggregateForm8814Results } from "@/engine/forms/form-8814.js";
import { getConstants } from "@/models/constants.js";

const c = getConstants(2025);

describe("Form 8814 threshold boundaries", () => {
  it("Form 8814 Line 4 - child income at exactly $1,350 does not trigger the form", () => {
    const result = calculateForm8814({
      taxableInterest: "1350",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(1350);
    expect(result.applies).toBe(false);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Line 4 - child income at $1,351 triggers the form with $0.10 tax", () => {
    const result = calculateForm8814({
      taxableInterest: "1351",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(1351);
    expect(result.applies).toBe(true);
    expect(result.exceedsMaximum).toBe(false);
    // Line 14: 1351 - 1350 = 1, tax = 1 * 0.10 = 0.10
    expect(result.tax.toNumber()).toBe(0);
    // Line 6: 1351 - 2700 < 0 → 0, no income flows to parent
    expect(result.line6.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Line 5 - child income at exactly $2,700 base amount produces maximum flat tax and zero flow-through", () => {
    const result = calculateForm8814({
      taxableInterest: "2700",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(2700);
    expect(result.applies).toBe(true);
    // Line 14: 2700 - 1350 = 1350, tax = min(1350, 1350) * 0.10 = 135
    expect(result.tax.toNumber()).toBe(135);
    // Line 6: 2700 - 2700 = 0
    expect(result.line6.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Line 6 - child income at $2,701 sends $1 to parent at ordinary rates", () => {
    const result = calculateForm8814({
      taxableInterest: "2701",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(2701);
    expect(result.applies).toBe(true);
    expect(result.tax.toNumber()).toBe(135);
    // Line 6: 2701 - 2700 = 1
    expect(result.line6.toNumber()).toBe(1);
    expect(result.otherIncomeToReport.toNumber()).toBe(1);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(0);
    expect(result.capitalGainsToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Line 4 - child income at $13,499 is just under the maximum and the form applies", () => {
    const result = calculateForm8814({
      taxableInterest: "13499",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(13499);
    expect(result.applies).toBe(true);
    expect(result.exceedsMaximum).toBe(false);
    expect(result.tax.toNumber()).toBe(135);
    // Line 6: 13499 - 2700 = 10799
    expect(result.line6.toNumber()).toBe(10799);
    expect(result.otherIncomeToReport.toNumber()).toBe(10799);
  });

  it("Form 8814 Line 4 - child income at exactly $13,500 exceeds maximum and form cannot be used", () => {
    const result = calculateForm8814({
      taxableInterest: "13500",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(13500);
    expect(result.applies).toBe(false);
    expect(result.exceedsMaximum).toBe(true);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });
});

describe("Form 8814 proportional allocation", () => {
  it("Form 8814 Lines 7-9 - allocates 100% of excess to qualified dividends when all income is qualified dividends", () => {
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "5000",
      qualifiedDividends: "5000",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(5000);
    // Line 6: 5000 - 2700 = 2300
    expect(result.line6.toNumber()).toBe(2300);
    // Line 7: 5000 / 5000 = 1.0000
    // Line 9: 2300 * 1.0000 = 2300
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(2300);
    expect(result.capitalGainsToReport.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Lines 7-10 - allocates 100% of excess to capital gains when all income is capital gain distributions", () => {
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "5000",
    }, c);

    expect(result.line4.toNumber()).toBe(5000);
    expect(result.line6.toNumber()).toBe(2300);
    // Line 8: 5000 / 5000 = 1.0000
    // Line 10: 2300 * 1.0000 = 2300
    expect(result.capitalGainsToReport.toNumber()).toBe(2300);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Lines 7-12 - mixed income allocates proportionally with rounding and captures remainder as ordinary", () => {
    // Interest: 3000, Ordinary dividends: 4000 (qualified: 2000), Capital gains: 3000
    // Line 4: 3000 + 4000 + 3000 = 10000
    // Line 6: 10000 - 2700 = 7300
    // Line 7: 2000 / 10000 = 0.2000
    // Line 8: 3000 / 10000 = 0.3000
    // Line 9: 7300 * 0.2000 = 1460
    // Line 10: 7300 * 0.3000 = 2190
    // Line 11: 1460 + 2190 = 3650
    // Line 12: 7300 - 3650 = 3650
    const result = calculateForm8814({
      taxableInterest: "3000",
      taxExemptInterest: "100",
      ordinaryDividends: "4000",
      qualifiedDividends: "2000",
      capitalGainDistributions: "3000",
    }, c);

    expect(result.line4.toNumber()).toBe(10000);
    expect(result.line6.toNumber()).toBe(7300);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(1460);
    expect(result.capitalGainsToReport.toNumber()).toBe(2190);
    expect(result.otherIncomeToReport.toNumber()).toBe(3650);
    expect(result.tax.toNumber()).toBe(135);
    expect(result.taxExemptInterest.toNumber()).toBe(100);
  });

  it("Form 8814 Lines 7-12 - ratio truncation at 4 decimal places causes ordinary remainder to absorb rounding", () => {
    // Interest: 1000, Ordinary dividends: 2000 (qualified: 1000), Capital gains: 700
    // Line 4: 1000 + 2000 + 700 = 3700
    // Line 6: 3700 - 2700 = 1000
    // Line 7: 1000 / 3700 = 0.2702... → 0.2702 (truncated)
    // Line 8: 700 / 3700 = 0.1891... → 0.1891 (truncated)
    // Line 9: 1000 * 0.2702 = 270.2 → 270
    // Line 10: 1000 * 0.1891 = 189.1 → 189
    // Line 11: 270 + 189 = 459
    // Line 12: 1000 - 459 = 541
    const result = calculateForm8814({
      taxableInterest: "1000",
      taxExemptInterest: "0",
      ordinaryDividends: "2000",
      qualifiedDividends: "1000",
      capitalGainDistributions: "700",
    }, c);

    expect(result.line4.toNumber()).toBe(3700);
    expect(result.line6.toNumber()).toBe(1000);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(270);
    expect(result.capitalGainsToReport.toNumber()).toBe(189);
    expect(result.otherIncomeToReport.toNumber()).toBe(541);
  });

  it("Form 8814 Lines 7-12 - no preferential items routes all excess to ordinary income", () => {
    const result = calculateForm8814({
      taxableInterest: "5000",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(5000);
    expect(result.line6.toNumber()).toBe(2300);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(0);
    expect(result.capitalGainsToReport.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(2300);
  });
});

describe("Form 8814 aggregation", () => {
  it("Form 8814 aggregation - sums results from multiple children and excludes those exceeding the maximum", () => {
    const result = aggregateForm8814Results([
      {
        taxableInterest: "5000",
        taxExemptInterest: "50",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
      {
        taxableInterest: "14000",
        taxExemptInterest: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
      {
        taxableInterest: "0",
        taxExemptInterest: "25",
        ordinaryDividends: "4000",
        qualifiedDividends: "3000",
        capitalGainDistributions: "1000",
      },
    ], c);

    // Child 1: applies (5000 < 13500), other income = 5000 - 2700 = 2300, tax = 135
    // Child 2: exceeds maximum (14000 >= 13500), excluded
    // Child 3: applies (5000 < 13500), with preferential allocation
    //   Line 6: 5000 - 2700 = 2300
    //   QD ratio: 3000/5000 = 0.6000, CG ratio: 1000/5000 = 0.2000
    //   QD: 2300 * 0.6000 = 1380, CG: 2300 * 0.2000 = 460, Other: 2300 - 1380 - 460 = 460
    expect(result.children.length).toBe(3);
    expect(result.children[0].applies).toBe(true);
    expect(result.children[1].applies).toBe(false);
    expect(result.children[1].exceedsMaximum).toBe(true);
    expect(result.children[2].applies).toBe(true);

    expect(result.totalOtherIncome.toNumber()).toBe(2760); // 2300 + 460
    expect(result.totalQualifiedDividends.toNumber()).toBe(1380);
    expect(result.totalCapitalGains.toNumber()).toBe(460);
    expect(result.totalTax.toNumber()).toBe(270); // 135 + 135
    // Tax-exempt interest includes all children (even non-applicable)
    expect(result.totalTaxExemptInterest.toNumber()).toBe(75);
  });

  it("Form 8814 aggregation - zero-income child produces no tax and no flow-through", () => {
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
    expect(result.exceedsMaximum).toBe(false);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8814 aggregation - all children exceeding maximum produces zero totals", () => {
    const result = aggregateForm8814Results([
      {
        taxableInterest: "14000",
        taxExemptInterest: "100",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
      {
        taxableInterest: "15000",
        taxExemptInterest: "50",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
    ], c);

    expect(result.children.every((ch) => ch.exceedsMaximum)).toBe(true);
    expect(result.totalOtherIncome.toNumber()).toBe(0);
    expect(result.totalQualifiedDividends.toNumber()).toBe(0);
    expect(result.totalCapitalGains.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    // Tax-exempt interest still aggregates from all children
    expect(result.totalTaxExemptInterest.toNumber()).toBe(150);
  });

  it("Form 8814 aggregation - all children below $1,350 threshold produces zero totals", () => {
    const result = aggregateForm8814Results([
      {
        taxableInterest: "500",
        taxExemptInterest: "0",
        ordinaryDividends: "800",
        qualifiedDividends: "800",
        capitalGainDistributions: "0",
      },
      {
        taxableInterest: "1000",
        taxExemptInterest: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
    ], c);

    expect(result.children.every((ch) => !ch.applies)).toBe(true);
    expect(result.children.every((ch) => !ch.exceedsMaximum)).toBe(true);
    expect(result.totalOtherIncome.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Form 8814 aggregation - single child produces no aggregation line in audit", () => {
    const result = aggregateForm8814Results([
      {
        taxableInterest: "5000",
        taxExemptInterest: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      },
    ], c);

    expect(result.children.length).toBe(1);
    expect(result.totalTax.toNumber()).toBe(135);
    expect(result.totalOtherIncome.toNumber()).toBe(2300);
    // Single child: no aggregation audit line
    const aggLine = result.lines.find((l) => l.line === "agg");
    expect(aggLine).toBeUndefined();
  });
});

describe("Form 8814 spec-documented tax calculations", () => {
  it("Form 8814 Line 15 - child income at $1,800 produces $45 tax (spec edge case)", () => {
    const result = calculateForm8814({
      taxableInterest: "1800",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.applies).toBe(true);
    // Line 14: 1800 - 1350 = 450, tax = 450 * 0.10 = 45
    expect(result.tax.toNumber()).toBe(45);
    expect(result.line6.toNumber()).toBe(0); // 1800 < 2700
  });

  it("Form 8814 Line 15 - child income at $2,000 produces $65 tax (spec edge case)", () => {
    const result = calculateForm8814({
      taxableInterest: "2000",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.applies).toBe(true);
    // Line 14: 2000 - 1350 = 650, tax = 650 * 0.10 = 65
    expect(result.tax.toNumber()).toBe(65);
    expect(result.line6.toNumber()).toBe(0);
  });

  it("Form 8814 Line 15 - child income at $13,501 exceeds maximum by $1", () => {
    const result = calculateForm8814({
      taxableInterest: "13501",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.applies).toBe(false);
    expect(result.exceedsMaximum).toBe(true);
    expect(result.tax.toNumber()).toBe(0);
  });
});

describe("Form 8814 income composition edge cases", () => {
  it("Form 8814 Lines 7-12 - all income is qualified dividends with equal ordinary dividends", () => {
    // ordinaryDividends includes qualifiedDividends per 1099-DIV Box 1a vs 1b
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "4000",
      qualifiedDividends: "4000",
      capitalGainDistributions: "0",
    }, c);

    expect(result.line4.toNumber()).toBe(4000);
    expect(result.line6.toNumber()).toBe(1300); // 4000 - 2700
    // Ratio: 4000/4000 = 1.0000
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(1300);
    expect(result.capitalGainsToReport.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Lines 7-12 - large tax-exempt interest with small taxable interest above threshold", () => {
    const result = calculateForm8814({
      taxableInterest: "1400",
      taxExemptInterest: "10000",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "0",
    }, c);

    expect(result.applies).toBe(true);
    expect(result.line4.toNumber()).toBe(1400); // tax-exempt NOT in Line 4
    // Line 14: 1400 - 1350 = 50, tax = 50 * 0.10 = 5
    expect(result.tax.toNumber()).toBe(5);
    expect(result.line6.toNumber()).toBe(0); // 1400 < 2700
    expect(result.taxExemptInterest.toNumber()).toBe(10000);
  });

  it("Form 8814 Lines 7-12 - only capital gains above base produces 100% CG allocation and $0 ordinary", () => {
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "0",
      qualifiedDividends: "0",
      capitalGainDistributions: "4000",
    }, c);

    expect(result.line6.toNumber()).toBe(1300); // 4000 - 2700
    expect(result.capitalGainsToReport.toNumber()).toBe(1300);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(0);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });

  it("Form 8814 Lines 7-12 - mixed qualified dividends and capital gains with no interest", () => {
    // Line 4: 3000 + 2000 = 5000, Line 6: 5000 - 2700 = 2300
    // QD ratio: 3000/5000 = 0.6000, CG ratio: 2000/5000 = 0.4000
    // QD: 2300 * 0.6000 = 1380, CG: 2300 * 0.4000 = 920
    // Other: 2300 - 1380 - 920 = 0
    const result = calculateForm8814({
      taxableInterest: "0",
      taxExemptInterest: "0",
      ordinaryDividends: "3000",
      qualifiedDividends: "3000",
      capitalGainDistributions: "2000",
    }, c);

    expect(result.line4.toNumber()).toBe(5000);
    expect(result.line6.toNumber()).toBe(2300);
    expect(result.qualifiedDividendsToReport.toNumber()).toBe(1380);
    expect(result.capitalGainsToReport.toNumber()).toBe(920);
    expect(result.otherIncomeToReport.toNumber()).toBe(0);
  });
});

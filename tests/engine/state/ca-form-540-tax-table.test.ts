/**
 * Tests for California Form 540 tax table.
 * Spec: spec/state/ca-form-540-tax-table.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540TaxTable } from "@/engine/state/ca-form-540-tax-table.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 tax table", () => {
  it("CA Form 540 tax table Line 1 - zero taxable income returns zero tax", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(0),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.taxableIncome.toNumber()).toBe(0);
    expect(result.selectedRange.lowerBound.toNumber()).toBe(0);
    expect(result.selectedRange.upperBound.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("CA Form 540 tax table Line 2 - $51 moves into the $51-$150 published row", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(51),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(51);
    expect(result.selectedRange.upperBound.toNumber()).toBe(150);
    expect(result.tax.toNumber()).toBe(1);
  });

  it("CA Form 540 tax table Line 3 - the final $99,951-$100,000 row uses a floor midpoint representative income of $99,975", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(100000),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(99951);
    expect(result.selectedRange.upperBound.toNumber()).toBe(100000);
    expect(result.representativeIncome.toNumber()).toBe(99975);
  });

  it("CA Form 540 tax table Line 4 - head of household uses Schedule Z for a high tax-table row", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(99700),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });

    expect(result.scheduleCode).toBe("Z");
    expect(result.selectedBracket?.lowerBound.toNumber()).toBe(98990);
    expect(result.selectedBracket?.rate.toString()).toBe("0.093");
  });

  it("CA Form 540 tax table Line 5 - the $33,451-$33,550 single row produces the official pre-rounding amount", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(33500),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(33451);
    expect(result.selectedRange.upperBound.toNumber()).toBe(33550);
    expect(result.representativeIncome.toNumber()).toBe(33500);
    expect(result.taxBeforeRounding.toString()).toBe("703.93");
  });

  it("CA Form 540 tax table Line 6 - $100,000 uses the final published row and returns the official filing-status taxes", () => {
    const singleResult = calculateCAForm540TaxTable({
      taxableIncome: d(100000),
      filingStatus: "single",
      taxYear: 2025,
    });
    const jointResult = calculateCAForm540TaxTable({
      taxableIncome: d(100000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    const hohResult = calculateCAForm540TaxTable({
      taxableIncome: d(100000),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });

    expect(singleResult.tax.toNumber()).toBe(5736);
    expect(jointResult.tax.toNumber()).toBe(3068);
    expect(hohResult.tax.toNumber()).toBe(3708);
  });

  it("CA Form 540 tax table - the first published row covers $1 through $50 and keeps tax at $0", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(50),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(1);
    expect(result.selectedRange.upperBound.toNumber()).toBe(50);
    expect(result.representativeIncome.toNumber()).toBe(25);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("CA Form 540 tax table - the official $52,051-$52,150 joint row produces $820 of tax", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(52100),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(52051);
    expect(result.selectedRange.upperBound.toNumber()).toBe(52150);
    expect(result.tax.toNumber()).toBe(820);
  });

  it("CA Form 540 tax table - the official $99,651-$99,750 head-of-household row produces $3,682 of tax", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(99700),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });

    expect(result.selectedRange.lowerBound.toNumber()).toBe(99651);
    expect(result.selectedRange.upperBound.toNumber()).toBe(99750);
    expect(result.representativeIncome.toNumber()).toBe(99700);
    expect(result.tax.toNumber()).toBe(3682);
  });

  it("CA Form 540 tax table - audit trail records the selected table row and filing-status metadata", () => {
    const result = calculateCAForm540TaxTable({
      taxableIncome: d(99700),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });

    expect(result.lines).toHaveLength(6);
    expect(result.lines.map((line) => line.line)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.lines[1]?.inputs).toMatchObject({
      "Filing status": "head_of_household",
      "Table row lower bound": "99651",
      "Table row upper bound": "99750",
    });
    expect(result.lines[3]?.inputs).toMatchObject({
      "Schedule code": "Z",
      "Row lower bound": "98990",
      "Marginal rate": "0.093",
    });
  });

  it("CA Form 540 tax table - taxable income over $100,000 throws because the tax-rate schedules are required", () => {
    expect(() =>
      calculateCAForm540TaxTable({
        taxableIncome: d(100001),
        filingStatus: "single",
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 tax table applies only when taxable income is $100,000 or less");
  });

  it("CA Form 540 tax table - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540TaxTable({
        taxableIncome: d(50000),
        filingStatus: "single",
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 tax table not available for 2024");
  });
});

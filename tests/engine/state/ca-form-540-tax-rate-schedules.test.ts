/**
 * Tests for California Form 540 tax-rate schedules.
 * Spec: spec/state/ca-form-540-tax-rate-schedules.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540TaxRateSchedules } from "@/engine/state/ca-form-540-tax-rate-schedules.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 tax-rate schedules", () => {
  it("CA Form 540 tax rate schedules Line 1 - taxable income above $100,000 is accepted", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(100001),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.taxableIncome.toNumber()).toBe(100001);
  });

  it("CA Form 540 tax rate schedules Line 2 - qualifying surviving spouse uses Schedule Y", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
    });

    expect(result.scheduleCode).toBe("Y");
    expect(result.selectedBracket.lowerBound.toNumber()).toBe(115084);
    expect(result.selectedBracket.upperBound?.toNumber()).toBe(145448);
  });

  it("CA Form 540 tax rate schedules Line 3 - the official Schedule Y example computes the row excess", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.excessTaxableIncome.toNumber()).toBe(9916);
  });

  it("CA Form 540 tax rate schedules Line 4 - the official Schedule Y example computes the marginal tax to cents", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.marginalTax.toString()).toBe("793.28");
  });

  it("CA Form 540 tax rate schedules Line 5 - the official Schedule Y example produces the booklet total before whole-dollar rounding", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.taxBeforeRounding.toString()).toBe("4768.1");
  });

  it("CA Form 540 tax rate schedules Line 6 - the official Schedule Y example rounds to the Form 540 line 31 amount", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.tax.toNumber()).toBe(4768);
  });

  it("CA Form 540 tax rate schedules - a single filer just over $100,000 uses Schedule X and rounds to the nearest whole dollar", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(100001),
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.scheduleCode).toBe("X");
    expect(result.excessTaxableIncome.toNumber()).toBe(27277);
    expect(result.tax.toNumber()).toBe(5739);
  });

  it("CA Form 540 tax rate schedules - married filing separately uses Schedule X", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_separately",
      taxYear: 2025,
    });

    expect(result.scheduleCode).toBe("X");
    expect(result.tax.toNumber()).toBe(8064);
  });

  it("CA Form 540 tax rate schedules - head of household uses Schedule Z thresholds", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(100001),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });

    expect(result.scheduleCode).toBe("Z");
    expect(result.selectedBracket.lowerBound.toNumber()).toBe(98990);
    expect(result.tax.toNumber()).toBe(3710);
  });

  it("CA Form 540 tax rate schedules - the top Schedule Y bracket applies the 12.3% rate above $1,485,906", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(1500000),
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
    });

    expect(result.selectedBracket.lowerBound.toNumber()).toBe(1485906);
    expect(result.selectedBracket.rate.toString()).toBe("0.123");
    expect(result.tax.toNumber()).toBe(146173);
  });

  it("CA Form 540 tax rate schedules - audit trail records line 2 schedule metadata", () => {
    const result = calculateCAForm540TaxRateSchedules({
      taxableIncome: d(125000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });

    expect(result.lines).toHaveLength(6);
    expect(result.lines.map((line) => line.line)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(result.lines[1]?.inputs).toMatchObject({
      "Schedule code": "Y",
      "Row lower bound": "115084",
      "Row upper bound": "145448",
      "Marginal rate": "0.08",
    });
  });

  it("CA Form 540 tax rate schedules - taxable income of $100,000 or less throws because the Tax Table is required", () => {
    expect(() =>
      calculateCAForm540TaxRateSchedules({
        taxableIncome: d(100000),
        filingStatus: "single",
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 tax rate schedules apply only when taxable income exceeds $100,000");
  });

  it("CA Form 540 tax rate schedules - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540TaxRateSchedules({
        taxableIncome: d(125000),
        filingStatus: "married_filing_jointly",
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 tax rate schedules not available for 2024");
  });
});

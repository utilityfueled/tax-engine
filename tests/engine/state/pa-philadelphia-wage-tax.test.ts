/**
 * Tests for Philadelphia Wage Tax / Earnings Tax
 * Spec: spec/state/pa-philadelphia-wage-tax.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePhiladelphiaWageTax,
  type PhiladelphiaWageTaxInput,
} from "@/engine/state/pa-philadelphia-wage-tax.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<PhiladelphiaWageTaxInput> = {}): PhiladelphiaWageTaxInput {
  return {
    taxYear: 2025,
    residencyStatus: "resident",
    taxableCompensationPreJuly: d(0),
    taxableCompensationPostJuly: d(0),
    scheduleSPApproved: false,
    withholding: d(0),
    ...overrides,
  };
}

describe("Philadelphia Wage Tax / Earnings Tax", () => {
  it("Philadelphia Wage Tax Line 1 uses pre-July taxable compensation", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(40000),
    }));

    expect(result.taxableCompensationPreJuly.toFixed(2)).toBe("40000.00");
  });

  it("Philadelphia Wage Tax Line 2 uses post-July taxable compensation", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPostJuly: d(55000),
    }));

    expect(result.taxableCompensationPostJuly.toFixed(2)).toBe("55000.00");
  });

  it("Philadelphia Wage Tax Line 3 selects the 2025 resident and nonresident rates", () => {
    const resident = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(1000),
      taxableCompensationPostJuly: d(1000),
    }));
    const nonresident = calculatePhiladelphiaWageTax(makeInput({
      residencyStatus: "nonresident",
      taxableCompensationPreJuly: d(1000),
      taxableCompensationPostJuly: d(1000),
    }));

    expect(resident.preJulyRate.toFixed(4)).toBe("0.0375");
    expect(resident.postJulyRate.toFixed(4)).toBe("0.0374");
    expect(nonresident.preJulyRate.toFixed(4)).toBe("0.0344");
    expect(nonresident.postJulyRate.toFixed(4)).toBe("0.0343");
  });

  it("Philadelphia Wage Tax Line 4 computes standard resident tax across the 2025 rate change", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(40000),
      taxableCompensationPostJuly: d(60000),
    }));

    expect(result.standardTax.toFixed(2)).toBe("3744.00");
    expect(result.finalTax.toFixed(2)).toBe("3744.00");
  });

  it("Philadelphia Wage Tax Line 5 recognizes Schedule SP reduced-rate eligibility", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(25000),
      taxableCompensationPostJuly: d(25000),
      scheduleSPApproved: true,
    }));

    expect(result.scheduleSPApproved).toBe(true);
  });

  it("Philadelphia Wage Tax Line 6 computes the approved 1.5% reduced-rate tax", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(25000),
      taxableCompensationPostJuly: d(25000),
      scheduleSPApproved: true,
    }));

    expect(result.reducedRateTax.toFixed(2)).toBe("750.00");
  });

  it("Philadelphia Wage Tax Line 7 uses the reduced rate when Schedule SP is approved", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(25000),
      taxableCompensationPostJuly: d(25000),
      scheduleSPApproved: true,
    }));

    expect(result.standardTax.toFixed(2)).toBe("1872.50");
    expect(result.finalTax.toFixed(2)).toBe("750.00");
  });

  it("Philadelphia Wage Tax Line 8 carries withholding into reconciliation", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(30000),
      taxableCompensationPostJuly: d(30000),
      withholding: d("2000.50"),
    }));

    expect(result.withholding.toFixed(2)).toBe("2000.50");
  });

  it("Philadelphia Wage Tax Line 9 computes an overpayment when withholding exceeds liability", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      taxableCompensationPreJuly: d(20000),
      taxableCompensationPostJuly: d(20000),
      scheduleSPApproved: true,
      withholding: d(800),
    }));

    expect(result.finalTax.toFixed(2)).toBe("600.00");
    expect(result.overpayment.toFixed(2)).toBe("200.00");
    expect(result.balanceDue.toFixed(2)).toBe("0.00");
  });

  it("Philadelphia Wage Tax Line 10 computes a balance due when liability exceeds withholding", () => {
    const result = calculatePhiladelphiaWageTax(makeInput({
      residencyStatus: "nonresident",
      taxableCompensationPreJuly: d(10000),
      taxableCompensationPostJuly: d(20000),
      withholding: d(500),
    }));

    expect(result.finalTax.toFixed(2)).toBe("1030.00");
    expect(result.overpayment.toFixed(2)).toBe("0.00");
    expect(result.balanceDue.toFixed(2)).toBe("530.00");
  });

  it("Philadelphia Wage Tax rejects unsupported tax years", () => {
    expect(() => calculatePhiladelphiaWageTax(makeInput({
      taxYear: 2024,
      taxableCompensationPreJuly: d(10000),
    }))).toThrow("Philadelphia Wage Tax constants not available for tax year 2024");
  });
});

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


describe("Philadelphia actual 2026 effective periods", () => {
  it("Philadelphia 2026 selects actual resident and nonresident effective-period rates", () => {
    // Spec: pa-philadelphia-wage-tax.yaml 2026-rates.
    const resident = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026,
      taxableCompensationPreJuly: d("30000"), taxableCompensationPostJuly: d("30000") }));
    const nonresident = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026, residencyStatus: "nonresident",
      taxableCompensationPreJuly: d("30000"), taxableCompensationPostJuly: d("30000") }));
    expect([resident.preJulyRate.toString(), resident.postJulyRate.toString(), resident.standardTax.toFixed(2)])
      .toEqual(["0.0374", "0.03735", "2242.50"]);
    expect([nonresident.preJulyRate.toString(), nonresident.postJulyRate.toString(), nonresident.standardTax.toFixed(2)])
      .toEqual(["0.0343", "0.03425", "2056.50"]);
  });

  it("Philadelphia 2026 preserves period cents and actual withholding settlement", () => {
    // Spec: pa-philadelphia-wage-tax.yaml 2026-cents-and-settlement.
    const resident = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026,
      taxableCompensationPreJuly: d("10000.25"), taxableCompensationPostJuly: d("20000.75"), withholding: d("1200") }));
    const nonresident = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026, residencyStatus: "nonresident",
      taxableCompensationPreJuly: d("10000.25"), taxableCompensationPostJuly: d("20000.75"), withholding: d("1000") }));
    expect([resident.standardTax.toFixed(2), resident.overpayment.toFixed(2), resident.balanceDue.toFixed(2)])
      .toEqual(["1121.04", "78.96", "0.00"]);
    expect([nonresident.standardTax.toFixed(2), nonresident.overpayment.toFixed(2), nonresident.balanceDue.toFixed(2)])
      .toEqual(["1028.04", "0.00", "28.04"]);
  });

  it("Philadelphia 2026 uses reduced tax only with actual Schedule SP approval", () => {
    // Spec: pa-philadelphia-wage-tax.yaml 2026-approved-reduced-rate.
    for (const residencyStatus of ["resident", "nonresident"] as const) {
      const source = makeInput({ taxYear: 2026, residencyStatus,
        taxableCompensationPreJuly: d("30000"), taxableCompensationPostJuly: d("30000"), withholding: d("1000") });
      const approved = calculatePhiladelphiaWageTax({ ...source, scheduleSPApproved: true });
      expect([approved.finalTax.toFixed(2), approved.overpayment.toFixed(2)]).toEqual(["900.00", "100.00"]);
      for (const scheduleSPApproved of [false, undefined]) {
        const unapproved = calculatePhiladelphiaWageTax({ ...source, scheduleSPApproved });
        expect(unapproved.finalTax.equals(unapproved.standardTax)).toBe(true);
        expect(unapproved.scheduleSPApproved).toBe(false);
      }
    }
  });

  it("Philadelphia 2026 retains explicit zero and one-period source amounts", () => {
    // Spec: pa-philadelphia-wage-tax.yaml 2026-period-boundaries.
    for (const [residencyStatus, preTax, postTax] of [["resident", "374.00", "373.50"], ["nonresident", "343.00", "342.50"]] as const) {
      expect(calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026, residencyStatus })).standardTax.toFixed(2)).toBe("0.00");
      const pre = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026, residencyStatus, taxableCompensationPreJuly: d("10000") }));
      const post = calculatePhiladelphiaWageTax(makeInput({ taxYear: 2026, residencyStatus, taxableCompensationPostJuly: d("10000") }));
      expect(pre.standardTax.toFixed(2)).toBe(preTax);
      expect(post.standardTax.toFixed(2)).toBe(postTax);
    }
  });

  it("Philadelphia audit labels follow the selected year without changing historical rates", () => {
    // Spec: pa-philadelphia-wage-tax.yaml year-aware-audit.
    for (const taxYear of [2025, 2026]) {
      const result = calculatePhiladelphiaWageTax(makeInput({ taxYear,
        taxableCompensationPreJuly: d("30000"), taxableCompensationPostJuly: d("30000") }));
      const periodLines = result.lines.filter(line => ["1", "2", "3-pre", "3-post"].includes(line.line));
      expect(periodLines).toHaveLength(4);
      for (const line of periodLines) {
        expect(line.description).toContain(String(taxYear));
        expect(line.formula ?? "").not.toContain(String(taxYear === 2025 ? 2026 : 2025));
      }
      expect(result.standardTax.toFixed(2)).toBe(taxYear === 2025 ? "2247.00" : "2242.50");
    }
  });
});

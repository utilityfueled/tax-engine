/**
 * Tests for Pennsylvania Schedule SD — School District Personal Income Tax
 * Spec: spec/state/pa-schedule-sd.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleSD,
  type ScheduleSDInput,
} from "@/engine/state/pa-schedule-sd.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

function makeInput(overrides: Partial<ScheduleSDInput> = {}): ScheduleSDInput {
  return {
    taxYear: 2025,
    method: "EI",
    schoolDistrictRate: d("0.015"),
    paTotalTaxableIncome: ZERO,
    netCompensation: ZERO,
    netBusinessIncome: ZERO,
    otherDeductions: ZERO,
    forgivenessPercentage: ZERO,
    schoolDistrictWithholding: ZERO,
    estimatedPayments: ZERO,
    ...overrides,
  };
}

describe("Pennsylvania Schedule SD — School District Personal Income Tax", () => {
  // =================================================================
  // Line 1: PSD method tax base
  // =================================================================

  describe("Line 1 — PSD Method", () => {
    it("PSD method uses PA-40 total taxable income", () => {
      const result = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: d(75000),
        schoolDistrictRate: d("0.02"),
      }));
      expect(result.psdTaxBase.toNumber()).toBe(75000);
      expect(result.taxBase.toNumber()).toBe(75000);
    });

    it("PSD method includes all 8 income classes via PA-40 total", () => {
      // PA-40 total is pre-computed: sum of positive classes
      const result = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: d(120000),
        schoolDistrictRate: d("0.01"),
      }));
      expect(result.psdTaxBase.toNumber()).toBe(120000);
      expect(result.grossTax.toNumber()).toBe(1200);
    });
  });

  // =================================================================
  // Line 2: EI method tax base
  // =================================================================

  describe("Line 2 — EI Method", () => {
    it("EI method uses compensation plus net positive business income", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(50000),
        netBusinessIncome: d(10000),
        schoolDistrictRate: d("0.015"),
      }));
      expect(result.eiTaxBase.toNumber()).toBe(60000);
      expect(result.taxBase.toNumber()).toBe(60000);
    });

    it("EI method with only W-2 income uses net compensation", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(45000),
        netBusinessIncome: ZERO,
      }));
      expect(result.eiTaxBase.toNumber()).toBe(45000);
    });

    it("EI method with business loss floors business income to $0", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(40000),
        netBusinessIncome: d(-5000),
      }));
      // Business loss floored to $0 → tax base = $40,000
      expect(result.eiTaxBase.toNumber()).toBe(40000);
    });
  });

  // =================================================================
  // Line 3: Method selection
  // =================================================================

  describe("Line 3 — Tax Base Selection", () => {
    it("selects correct tax base for method", () => {
      const psdResult = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: d(80000),
        netCompensation: d(50000),
        netBusinessIncome: d(10000),
      }));
      expect(psdResult.taxBase.toNumber()).toBe(80000);

      const eiResult = calculateScheduleSD(makeInput({
        method: "EI",
        paTotalTaxableIncome: d(80000),
        netCompensation: d(50000),
        netBusinessIncome: d(10000),
      }));
      expect(eiResult.taxBase.toNumber()).toBe(60000);
    });
  });

  // =================================================================
  // Line 4: Other deductions (EI method only)
  // =================================================================

  describe("Line 4 — Other Deductions", () => {
    it("EI method applies other deductions", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(50000),
        otherDeductions: d(3000),
        schoolDistrictRate: d("0.01"),
      }));
      expect(result.otherDeductions.toNumber()).toBe(3000);
      expect(result.adjustedTaxBase.toNumber()).toBe(47000);
    });

    it("PSD method ignores other deductions (already in PA-40)", () => {
      const result = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: d(50000),
        otherDeductions: d(3000),
        schoolDistrictRate: d("0.01"),
      }));
      expect(result.otherDeductions.toNumber()).toBe(0);
      expect(result.adjustedTaxBase.toNumber()).toBe(50000);
    });

    it("§529 deductions reduce EI method tax base", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        otherDeductions: d(5000),
        schoolDistrictRate: d("0.015"),
      }));
      expect(result.adjustedTaxBase.toNumber()).toBe(55000);
      expect(result.grossTax.toNumber()).toBe(825); // $55,000 × 1.5%
    });
  });

  // =================================================================
  // Line 5: Adjusted tax base
  // =================================================================

  describe("Line 5 — Adjusted Tax Base", () => {
    it("adjusted tax base cannot go negative", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(2000),
        otherDeductions: d(5000),
      }));
      expect(result.adjustedTaxBase.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Line 6: School district income tax
  // =================================================================

  describe("Line 6 — School District Tax", () => {
    it("computes tax at school district rate", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        schoolDistrictRate: d("0.015"),
      }));
      // $60,000 × 1.5% = $900
      expect(result.grossTax.toNumber()).toBe(900);
    });

    it("zero school district rate produces $0 tax", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(100000),
        schoolDistrictRate: ZERO,
      }));
      expect(result.grossTax.toNumber()).toBe(0);
    });

    it("rounds tax to nearest dollar", () => {
      // $33,333 × 1.5% = $499.995 → rounds to $500
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(33333),
        schoolDistrictRate: d("0.015"),
      }));
      expect(result.grossTax.toNumber()).toBe(500);
    });

    it("zero income produces zero tax regardless of rate", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: ZERO,
        schoolDistrictRate: d("0.032"),
      }));
      expect(result.grossTax.toNumber()).toBe(0);
    });

    it("high school district rate (3.2%)", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(50000),
        schoolDistrictRate: d("0.032"),
      }));
      // $50,000 × 3.2% = $1,600
      expect(result.grossTax.toNumber()).toBe(1600);
    });
  });

  // =================================================================
  // Line 7: Tax Forgiveness credit
  // =================================================================

  describe("Line 7 — Tax Forgiveness", () => {
    it("applies Schedule SP forgiveness to school district tax", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(10000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: d(50),
      }));
      // Tax = $10,000 × 1.5% = $150
      // Forgiveness = $150 × 50% = $75
      expect(result.grossTax.toNumber()).toBe(150);
      expect(result.forgivenessCredit.toNumber()).toBe(75);
    });

    it("100% Tax Forgiveness eliminates school district tax", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(5000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: d(100),
      }));
      // Tax = $5,000 × 1.5% = $75
      // Forgiveness = 100% = $75
      expect(result.grossTax.toNumber()).toBe(75);
      expect(result.forgivenessCredit.toNumber()).toBe(75);
      expect(result.netTax.toNumber()).toBe(0);
    });

    it("partial forgiveness reduces tax proportionally", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(8000),
        schoolDistrictRate: d("0.02"),
        forgivenessPercentage: d(30),
      }));
      // Tax = $8,000 × 2% = $160
      // Forgiveness = $160 × 30% = $48
      expect(result.grossTax.toNumber()).toBe(160);
      expect(result.forgivenessCredit.toNumber()).toBe(48);
      expect(result.netTax.toNumber()).toBe(112);
    });

    it("0% forgiveness leaves tax unchanged", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(50000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: ZERO,
      }));
      expect(result.forgivenessCredit.toNumber()).toBe(0);
      expect(result.netTax.toNumber()).toBe(750);
    });
  });

  // =================================================================
  // Line 8: Net tax after forgiveness
  // =================================================================

  describe("Line 8 — Net Tax", () => {
    it("net tax after forgiveness", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(40000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: d(10),
      }));
      // Tax = $600, forgiveness = $60, net = $540
      expect(result.netTax.toNumber()).toBe(540);
    });

    it("net tax cannot go below zero", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(5000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: d(100),
      }));
      expect(result.netTax.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Lines 9–10: Withholding and Estimated Payments
  // =================================================================

  describe("Lines 9–10 — Payments", () => {
    it("applies withholding", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        schoolDistrictRate: d("0.015"),
        schoolDistrictWithholding: d(900),
      }));
      expect(result.withholding.toNumber()).toBe(900);
    });

    it("applies estimated payments", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        schoolDistrictRate: d("0.015"),
        estimatedPayments: d(500),
      }));
      expect(result.estimatedPayments.toNumber()).toBe(500);
    });
  });

  // =================================================================
  // Line 11: Total payments and credits
  // =================================================================

  describe("Line 11 — Total Payments and Credits", () => {
    it("sums all payments and credits", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        schoolDistrictRate: d("0.015"),
        forgivenessPercentage: d(10),
        schoolDistrictWithholding: d(400),
        estimatedPayments: d(200),
      }));
      // Tax = $900, forgiveness = $90
      // Total payments = $90 (forgiveness) + $400 (withholding) + $200 (est.) = $690
      expect(result.forgivenessCredit.toNumber()).toBe(90);
      expect(result.totalPaymentsAndCredits.toNumber()).toBe(690);
    });
  });

  // =================================================================
  // Line 12: Overpayment
  // =================================================================

  describe("Line 12 — Overpayment", () => {
    it("computes overpayment when payments exceed tax", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(40000),
        schoolDistrictRate: d("0.015"),
        schoolDistrictWithholding: d(700),
      }));
      // Tax = $600, withholding = $700
      // Total payments = $0 forgiveness + $700 = $700
      // Overpayment = $700 - $600 = $100
      expect(result.grossTax.toNumber()).toBe(600);
      expect(result.overpayment.toNumber()).toBe(100);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("withholding exceeds tax: refund generated", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(30000),
        schoolDistrictRate: d("0.01"),
        schoolDistrictWithholding: d(500),
      }));
      // Tax = $300, withholding $500 → refund $200
      expect(result.overpayment.toNumber()).toBe(200);
    });
  });

  // =================================================================
  // Line 13: Amount owed
  // =================================================================

  describe("Line 13 — Amount Owed", () => {
    it("computes balance due when tax exceeds payments", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(80000),
        schoolDistrictRate: d("0.015"),
        schoolDistrictWithholding: d(500),
      }));
      // Tax = $1,200, withholding = $500
      // Amount owed = $1,200 - $500 = $700
      expect(result.grossTax.toNumber()).toBe(1200);
      expect(result.amountOwed.toNumber()).toBe(700);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("no withholding on self-employment income: full balance due", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: ZERO,
        netBusinessIncome: d(50000),
        schoolDistrictRate: d("0.015"),
      }));
      // Tax = $50,000 × 1.5% = $750, no withholding
      expect(result.grossTax.toNumber()).toBe(750);
      expect(result.amountOwed.toNumber()).toBe(750);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("zero income: zero tax regardless of rate or method", () => {
      const eiResult = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: ZERO,
        netBusinessIncome: ZERO,
        schoolDistrictRate: d("0.032"),
      }));
      expect(eiResult.grossTax.toNumber()).toBe(0);

      const psdResult = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: ZERO,
        schoolDistrictRate: d("0.032"),
      }));
      expect(psdResult.grossTax.toNumber()).toBe(0);
    });

    it("PSD method with mixed income classes", () => {
      // PA-40 total = 120000 (pre-computed from all 8 classes)
      const result = calculateScheduleSD(makeInput({
        method: "PSD",
        paTotalTaxableIncome: d(120000),
        schoolDistrictRate: d("0.015"),
      }));
      expect(result.grossTax.toNumber()).toBe(1800);
    });

    it("exact payments match tax: no overpayment or amount owed", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(60000),
        schoolDistrictRate: d("0.015"),
        schoolDistrictWithholding: d(900),
      }));
      // Tax = $900, withholding = $900
      expect(result.overpayment.toNumber()).toBe(0);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("forgiveness + withholding together exceed tax", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(10000),
        schoolDistrictRate: d("0.02"),
        forgivenessPercentage: d(50),
        schoolDistrictWithholding: d(200),
      }));
      // Tax = $200, forgiveness = $100, withholding = $200
      // Total payments = $100 + $200 = $300 > $200 tax → overpayment $100
      expect(result.grossTax.toNumber()).toBe(200);
      expect(result.forgivenessCredit.toNumber()).toBe(100);
      expect(result.overpayment.toNumber()).toBe(100);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("audit trail is populated", () => {
      const result = calculateScheduleSD(makeInput({
        method: "EI",
        netCompensation: d(50000),
        schoolDistrictRate: d("0.015"),
      }));
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines.some((l) => l.form === "PA-40-SD")).toBe(true);
    });
  });
});

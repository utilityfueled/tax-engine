/**
 * Tests for Pennsylvania Local Earned Income Tax (EIT)
 * Spec: spec/state/pa-local-eit.yaml
 *
 * PA Act 511 local earned income tax on residents' earned income.
 * Rates vary by municipality. Earned income = compensation + net positive
 * self-employment income.
 * Source: PA DCED Local Income Tax Information
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePALocalEIT,
  type PALocalEITInput,
  type NonresidentEITCredit,
} from "@/engine/state/pa-local-eit.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

/** Helper to build a PALocalEITInput with defaults */
function makeInput(overrides: Partial<PALocalEITInput> = {}): PALocalEITInput {
  return {
    taxYear: 2025,
    municipality: "Test Township",
    localEITRate: d("0.01"), // 1% default
    compensation: ZERO,
    netSelfEmploymentIncome: ZERO,
    nonresidentCredits: [],
    localWithholding: ZERO,
    ...overrides,
  };
}

describe("Pennsylvania Local Earned Income Tax (EIT)", () => {
  // =================================================================
  // Earned Income Computation
  // =================================================================

  describe("Earned Income Computation", () => {
    it("PA Local EIT Line 1 - compensation", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(75000),
      }));
      expect(result.compensation.toNumber()).toBe(75000);
      expect(result.totalEarnedIncome.toNumber()).toBe(75000);
    });

    it("PA Local EIT Line 2 - net self-employment income", () => {
      const result = calculatePALocalEIT(makeInput({
        netSelfEmploymentIncome: d(40000),
      }));
      expect(result.netSelfEmploymentIncome.toNumber()).toBe(40000);
      expect(result.totalEarnedIncome.toNumber()).toBe(40000);
    });

    it("PA Local EIT Line 2 - negative self-employment income floors at zero", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        netSelfEmploymentIncome: d(-10000),
      }));
      // Net SE income clamped to 0; only compensation counts
      expect(result.netSelfEmploymentIncome.toNumber()).toBe(0);
      expect(result.totalEarnedIncome.toNumber()).toBe(50000);
    });

    it("PA Local EIT Line 3 - total earned income sums both sources", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(60000),
        netSelfEmploymentIncome: d(20000),
      }));
      expect(result.totalEarnedIncome.toNumber()).toBe(80000);
    });

    it("PA Local EIT - zero earned income produces zero tax", () => {
      const result = calculatePALocalEIT(makeInput({}));
      expect(result.totalEarnedIncome.toNumber()).toBe(0);
      expect(result.computedLocalTax.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Tax Computation
  // =================================================================

  describe("Tax Computation", () => {
    it("PA Local EIT Line 4 - local EIT rate", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        localEITRate: d("0.015"), // 1.5%
      }));
      expect(result.localEITRate.toNumber()).toBe(0.015);
    });

    it("PA Local EIT Line 5 - computed local tax at 1%", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(75000),
        localEITRate: d("0.01"),
      }));
      // $75,000 × 1% = $750
      expect(result.computedLocalTax.toNumber()).toBe(750);
    });

    it("PA Local EIT Line 5 - computed local tax at 1.5%", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(60000),
        localEITRate: d("0.015"),
      }));
      // $60,000 × 1.5% = $900
      expect(result.computedLocalTax.toNumber()).toBe(900);
    });

    it("PA Local EIT Line 5 - computed local tax at 2%", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.02"),
      }));
      // $80,000 × 2% = $1,600
      expect(result.computedLocalTax.toNumber()).toBe(1600);
    });

    it("PA Local EIT Line 5 - computed local tax at 3.5% (high rate)", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(100000),
        localEITRate: d("0.035"),
      }));
      // $100,000 × 3.5% = $3,500
      expect(result.computedLocalTax.toNumber()).toBe(3500);
    });

    it("PA Local EIT Line 5 - rounding: $33,333 × 1% = $333.33 → $333", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(33333),
        localEITRate: d("0.01"),
      }));
      expect(result.computedLocalTax.toNumber()).toBe(333);
    });

    it("PA Local EIT Line 5 - rounding: $45,000 × 1.5% = $675 (exact)", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(45000),
        localEITRate: d("0.015"),
      }));
      expect(result.computedLocalTax.toNumber()).toBe(675);
    });

    it("PA Local EIT Line 5 - rounding up: $17 × 3% = $0.51 → $1", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(17),
        localEITRate: d("0.03"),
      }));
      expect(result.computedLocalTax.toNumber()).toBe(1);
    });

    it("PA Local EIT - includes both compensation and SE income in tax base", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        netSelfEmploymentIncome: d(25000),
        localEITRate: d("0.01"),
      }));
      // $75,000 × 1% = $750
      expect(result.totalEarnedIncome.toNumber()).toBe(75000);
      expect(result.computedLocalTax.toNumber()).toBe(750);
    });
  });

  // =================================================================
  // Nonresident EIT Credit
  // =================================================================

  describe("Nonresident EIT Credit", () => {
    it("PA Local EIT Line 6 - nonresident credit when work municipality tax is lower", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.015"), // Resident rate: 1.5%
        nonresidentCredits: [{
          municipality: "Work City",
          incomeInWorkMunicipality: d(80000),
          taxPaidToWorkMunicipality: d(400), // 0.5% paid to work city
        }],
      }));
      // Resident tax on that income: $80,000 × 1.5% = $1,200
      // Credit = min($400 paid, $1,200 resident rate) = $400
      expect(result.nonresidentCredit.toNumber()).toBe(400);
      // Net: $1,200 - $400 = $800
      expect(result.netLocalTax.toNumber()).toBe(800);
    });

    it("PA Local EIT Line 6 - nonresident credit when work municipality tax is higher", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.01"), // Resident rate: 1%
        nonresidentCredits: [{
          municipality: "Work City",
          incomeInWorkMunicipality: d(80000),
          taxPaidToWorkMunicipality: d(1200), // 1.5% paid to work city
        }],
      }));
      // Resident tax on that income: $80,000 × 1% = $800
      // Credit = min($1,200 paid, $800 resident rate) = $800
      expect(result.nonresidentCredit.toNumber()).toBe(800);
      // Net: $800 - $800 = $0
      expect(result.netLocalTax.toNumber()).toBe(0);
    });

    it("PA Local EIT Line 6 - nonresident credit capped at computed local tax", () => {
      // If credit exceeds computed tax, it's capped
      const result = calculatePALocalEIT(makeInput({
        compensation: d(30000),
        localEITRate: d("0.005"), // Resident rate: 0.5%
        nonresidentCredits: [{
          municipality: "Work City",
          incomeInWorkMunicipality: d(30000),
          taxPaidToWorkMunicipality: d(600), // 2% paid (much higher)
        }],
      }));
      // Computed local tax: $30,000 × 0.5% = $150
      // Resident tax on work income: $30,000 × 0.5% = $150
      // Per-municipality credit: min($600, $150) = $150
      // Total credit capped at computed tax: min($150, $150) = $150
      expect(result.computedLocalTax.toNumber()).toBe(150);
      expect(result.nonresidentCredit.toNumber()).toBe(150);
      expect(result.netLocalTax.toNumber()).toBe(0);
    });

    it("PA Local EIT Line 6 - multiple work municipality credits", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(100000),
        localEITRate: d("0.01"), // 1%
        nonresidentCredits: [
          {
            municipality: "City A",
            incomeInWorkMunicipality: d(60000),
            taxPaidToWorkMunicipality: d(300), // 0.5%
          },
          {
            municipality: "City B",
            incomeInWorkMunicipality: d(40000),
            taxPaidToWorkMunicipality: d(200), // 0.5%
          },
        ],
      }));
      // City A: resident rate × income = $600; credit = min($300, $600) = $300
      // City B: resident rate × income = $400; credit = min($200, $400) = $200
      // Total: $500
      expect(result.nonresidentCredit.toNumber()).toBe(500);
      // Computed: $1,000; net: $1,000 - $500 = $500
      expect(result.netLocalTax.toNumber()).toBe(500);
    });

    it("PA Local EIT Line 6 - no nonresident credits", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        localEITRate: d("0.01"),
        nonresidentCredits: [],
      }));
      expect(result.nonresidentCredit.toNumber()).toBe(0);
      expect(result.netLocalTax.toNumber()).toBe(500);
    });

    it("PA Local EIT Line 6 - negative work municipality tax paid is rejected", () => {
      const workCredit: NonresidentEITCredit = {
        municipality: "Work City",
        incomeInWorkMunicipality: d(80000),
        taxPaidToWorkMunicipality: d(-1),
      };

      expect(() => calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.01"),
        nonresidentCredits: [workCredit],
      }))).toThrow("PA Local EIT nonresident credit tax paid to Work City must be non-negative");
    });
  });

  // =================================================================
  // Withholding and Refund/Balance Due
  // =================================================================

  describe("Withholding and Refund/Balance Due", () => {
    it("PA Local EIT Line 8 - local withholding", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(75000),
        localEITRate: d("0.01"),
        localWithholding: d(750),
      }));
      expect(result.localWithholding.toNumber()).toBe(750);
    });

    it("PA Local EIT - overpayment when withholding exceeds tax", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        localEITRate: d("0.01"),
        localWithholding: d(600), // Withheld $600, tax is $500
      }));
      expect(result.computedLocalTax.toNumber()).toBe(500);
      expect(result.netLocalTax.toNumber()).toBe(500);
      expect(result.overpayment.toNumber()).toBe(100);
      expect(result.balanceDue.toNumber()).toBe(0);
    });

    it("PA Local EIT - balance due when tax exceeds withholding", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.01"),
        localWithholding: d(500), // Withheld $500, tax is $800
      }));
      expect(result.netLocalTax.toNumber()).toBe(800);
      expect(result.balanceDue.toNumber()).toBe(300);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA Local EIT - exact withholding produces zero owed and zero refund", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(60000),
        localEITRate: d("0.01"),
        localWithholding: d(600),
      }));
      expect(result.netLocalTax.toNumber()).toBe(600);
      expect(result.balanceDue.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA Local EIT - no income, no withholding: zero across the board", () => {
      const result = calculatePALocalEIT(makeInput({}));
      expect(result.computedLocalTax.toNumber()).toBe(0);
      expect(result.netLocalTax.toNumber()).toBe(0);
      expect(result.localWithholding.toNumber()).toBe(0);
      expect(result.balanceDue.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA Local EIT - withholding with nonresident credit reduces net tax", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.015"), // 1.5%
        nonresidentCredits: [{
          municipality: "Work City",
          incomeInWorkMunicipality: d(80000),
          taxPaidToWorkMunicipality: d(400),
        }],
        localWithholding: d(500),
      }));
      // Computed: $1,200; credit: $400; net: $800
      // Withholding: $500; balance due: $300
      expect(result.computedLocalTax.toNumber()).toBe(1200);
      expect(result.nonresidentCredit.toNumber()).toBe(400);
      expect(result.netLocalTax.toNumber()).toBe(800);
      expect(result.balanceDue.toNumber()).toBe(300);
    });

    it("PA Local EIT - self-employed: no withholding, full balance due", () => {
      const result = calculatePALocalEIT(makeInput({
        netSelfEmploymentIncome: d(100000),
        localEITRate: d("0.01"),
        localWithholding: ZERO,
      }));
      // $100,000 × 1% = $1,000; no withholding; owed $1,000
      expect(result.computedLocalTax.toNumber()).toBe(1000);
      expect(result.balanceDue.toNumber()).toBe(1000);
    });
  });

  // =================================================================
  // Realistic Scenarios
  // =================================================================

  describe("Realistic Scenarios", () => {
    it("PA Local EIT - typical W-2 employee in 1% municipality", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Springfield Township",
        compensation: d(85000),
        localEITRate: d("0.01"),
        localWithholding: d(850),
      }));
      // $85,000 × 1% = $850; exact match
      expect(result.computedLocalTax.toNumber()).toBe(850);
      expect(result.balanceDue.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA Local EIT - W-2 employee with side business", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Lower Merion Township",
        compensation: d(60000),
        netSelfEmploymentIncome: d(25000),
        localEITRate: d("0.015"),
        localWithholding: d(900), // Only W-2 withholding (no SE withholding)
      }));
      // Earned income: $60,000 + $25,000 = $85,000
      // Tax: $85,000 × 1.5% = $1,275
      // Withholding: $900 (only from W-2)
      // Balance due: $375 (SE income not withheld)
      expect(result.totalEarnedIncome.toNumber()).toBe(85000);
      expect(result.computedLocalTax.toNumber()).toBe(1275);
      expect(result.balanceDue.toNumber()).toBe(375);
    });

    it("PA Local EIT - PA resident working in different municipality", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Abington Township",
        compensation: d(90000),
        localEITRate: d("0.01"), // Resident rate: 1%
        nonresidentCredits: [{
          municipality: "Philadelphia",
          incomeInWorkMunicipality: d(90000),
          taxPaidToWorkMunicipality: d(2700), // Philly nonresident rate ~3%
        }],
        localWithholding: ZERO,
      }));
      // Computed tax: $90,000 × 1% = $900
      // Credit: min($2,700 paid, $900 resident rate on income) = $900
      // Net tax: $0 (work municipality tax fully covers)
      expect(result.computedLocalTax.toNumber()).toBe(900);
      expect(result.nonresidentCredit.toNumber()).toBe(900);
      expect(result.netLocalTax.toNumber()).toBe(0);
      expect(result.balanceDue.toNumber()).toBe(0);
    });

    it("PA Local EIT - Pittsburgh area with higher rate (3%)", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Pittsburgh",
        compensation: d(70000),
        localEITRate: d("0.03"), // Pittsburgh 3%
        localWithholding: d(2100),
      }));
      // $70,000 × 3% = $2,100; exact match
      expect(result.computedLocalTax.toNumber()).toBe(2100);
      expect(result.balanceDue.toNumber()).toBe(0);
    });

    it("PA Local EIT - low-income earner: small tax amount", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Small Borough",
        compensation: d(12000),
        localEITRate: d("0.005"), // 0.5%
        localWithholding: d(60),
      }));
      // $12,000 × 0.5% = $60
      expect(result.computedLocalTax.toNumber()).toBe(60);
      expect(result.balanceDue.toNumber()).toBe(0);
    });

    it("PA Local EIT - high-income earner in low-rate municipality", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Rural Township",
        compensation: d(200000),
        netSelfEmploymentIncome: d(100000),
        localEITRate: d("0.005"),
        localWithholding: d(1000),
      }));
      // $300,000 × 0.5% = $1,500
      // Withholding: $1,000; owed: $500
      expect(result.totalEarnedIncome.toNumber()).toBe(300000);
      expect(result.computedLocalTax.toNumber()).toBe(1500);
      expect(result.balanceDue.toNumber()).toBe(500);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA Local EIT - zero rate produces zero tax", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(100000),
        localEITRate: ZERO,
      }));
      expect(result.computedLocalTax.toNumber()).toBe(0);
    });

    it("PA Local EIT - very small income: $1 × 1% = $0 (rounds down)", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(1),
        localEITRate: d("0.01"),
      }));
      // $1 × 1% = $0.01 → $0
      expect(result.computedLocalTax.toNumber()).toBe(0);
    });

    it("PA Local EIT - minimum income to owe $1 at 1%: $50", () => {
      // $49 × 1% = $0.49 → $0
      const result49 = calculatePALocalEIT(makeInput({
        compensation: d(49),
        localEITRate: d("0.01"),
      }));
      expect(result49.computedLocalTax.toNumber()).toBe(0);

      // $50 × 1% = $0.50 → $1 (rounds up)
      const result50 = calculatePALocalEIT(makeInput({
        compensation: d(50),
        localEITRate: d("0.01"),
      }));
      expect(result50.computedLocalTax.toNumber()).toBe(1);
    });

    it("PA Local EIT - very large income: $10M × 1% = $100,000", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(10000000),
        localEITRate: d("0.01"),
      }));
      expect(result.computedLocalTax.toNumber()).toBe(100000);
    });

    it("PA Local EIT - business loss with wages: only wages taxed", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(40000),
        netSelfEmploymentIncome: d(-50000), // Big business loss
        localEITRate: d("0.01"),
      }));
      // SE income floors at 0; only wages count
      expect(result.totalEarnedIncome.toNumber()).toBe(40000);
      expect(result.computedLocalTax.toNumber()).toBe(400);
    });

    it("PA Local EIT - only business income, no wages", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: ZERO,
        netSelfEmploymentIncome: d(80000),
        localEITRate: d("0.01"),
      }));
      expect(result.totalEarnedIncome.toNumber()).toBe(80000);
      expect(result.computedLocalTax.toNumber()).toBe(800);
    });

    it("PA Local EIT - municipality name preserved in result", () => {
      const result = calculatePALocalEIT(makeInput({
        municipality: "Upper Darby Township",
        compensation: d(50000),
      }));
      expect(result.municipality).toBe("Upper Darby Township");
    });

    it("PA Local EIT rejects Philadelphia because the city uses a separate wage tax", () => {
      expect(() => calculatePALocalEIT(makeInput({
        municipality: "Philadelphia",
        compensation: d(50000),
        localEITRate: d("0.01"),
      }))).toThrow(
        "Philadelphia uses a separate Wage Tax and is not supported by the PA Local EIT module",
      );
    });
  });

  // =================================================================
  // Audit Trail
  // =================================================================

  describe("Audit Trail", () => {
    it("PA Local EIT - audit trail records all key lines", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
        localEITRate: d("0.01"),
        localWithholding: d(500),
      }));
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("1");
      expect(lineNumbers).toContain("2");
      expect(lineNumbers).toContain("3");
      expect(lineNumbers).toContain("4");
      expect(lineNumbers).toContain("5");
      expect(lineNumbers).toContain("6");
      expect(lineNumbers).toContain("7");
      expect(lineNumbers).toContain("8");
      expect(lineNumbers).toContain("9");
      expect(lineNumbers).toContain("10");
    });

    it("PA Local EIT - all audit trail entries have form 'PA-Local-EIT'", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(50000),
      }));
      for (const line of result.lines) {
        expect(line.form).toBe("PA-Local-EIT");
      }
    });

    it("PA Local EIT - nonresident credit audit trail records per-municipality lines", () => {
      const result = calculatePALocalEIT(makeInput({
        compensation: d(80000),
        localEITRate: d("0.01"),
        nonresidentCredits: [{
          municipality: "Work City",
          incomeInWorkMunicipality: d(80000),
          taxPaidToWorkMunicipality: d(400),
        }],
      }));
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("6-Work City");
      expect(lineNumbers).toContain("6");
    });

    it("PA Local EIT - throws for unsupported tax year", () => {
      expect(() => calculatePALocalEIT(makeInput({
        taxYear: 2023,
        compensation: d(50000),
      }))).toThrow("PA Local EIT constants not available for tax year 2023");
    });
  });
});

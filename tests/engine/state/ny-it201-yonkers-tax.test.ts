/**
 * Tests for New York IT-201 Yonkers Tax Computation (lines 55-57).
 * Spec: spec/state/ny-it201-yonkers-tax.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201YonkersTax,
  NY_YONKERS_CONSTANTS,
  type NYIT201YonkersTaxInput,
} from "@/engine/state/ny-it201-yonkers-tax.js";

const d = (value: string | number) => new Decimal(value);

function yonkersTax2025(overrides: Partial<NYIT201YonkersTaxInput> = {}) {
  return calculateNYIT201YonkersTax({
    totalNewYorkStateTaxes: 5000,
    yonkersResidencyStatus: "full_year",
    taxYear: 2025,
    ...overrides,
  });
}

describe("NY IT-201 Yonkers Tax Computation", () => {
  /* ========== Constants ========== */

  describe("Constants", () => {
    it("2025 resident surcharge rate is 16.75%", () => {
      expect(NY_YONKERS_CONSTANTS[2025].residentSurchargeRate.toString()).toBe("0.1675");
    });

    it("2025 nonresident earnings rate is 0.5%", () => {
      expect(NY_YONKERS_CONSTANTS[2025].nonresidentEarningsRate.toString()).toBe("0.005");
    });
  });

  /* ========== Line 55 — Full-Year Yonkers Resident Surcharge ========== */

  describe("Line 55 - full-year Yonkers resident surcharge", () => {
    it("Line 55 - full-year Yonkers resident surcharge uses the IT-201 worksheet base", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 5000 });
      // $5,000 × 16.75% = $837.50 → $838
      expect(result.yonkersResidentSurcharge.toString()).toBe("838");
      expect(result.totalYonkersTax.toString()).toBe("838");
    });

    it("Line 55 - worksheet offsets reduce the surcharge base before applying 16.75%", () => {
      const result = yonkersTax2025({
        totalNewYorkStateTaxes: 5000,
        empireStateChildCredit: 660,
        realPropertyTaxCredit: 50,
        nysChildDependentCareCredit: 100,
        nyEarnedIncomeCredit: 300,
        nycSchoolTaxCreditFixedAmount: 63,
        nycSchoolTaxCreditRateReductionAmount: 21,
        it201attLine13RefundableCredits: 40,
        starReconciliationAmount: 10,
      });
      // Worksheet base = 5000 - (660 + 50 + 100 + 300 + 63 + 21 + 40) + 10 = 3776
      // 3776 × 16.75% = 632.48 → $632
      expect(result.yonkersResidentSurcharge.toString()).toBe("632");
    });

    it("Line 55 - worksheet base floors at zero when refundable offsets exceed line 46", () => {
      const result = yonkersTax2025({
        totalNewYorkStateTaxes: 500,
        empireStateChildCredit: 400,
        realPropertyTaxCredit: 200,
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
    });

    it("Line 55 - surcharge on $10,000 line 46 total", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 10000 });
      // $10,000 × 16.75% = $1,675
      expect(result.yonkersResidentSurcharge.toString()).toBe("1675");
    });

    it("Line 55 - surcharge on $1 line 46 total rounds to zero", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 1 });
      // $1 × 16.75% = $0.1675 → $0
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
    });

    it("Line 55 - surcharge on $3 line 46 total rounds to $1", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 3 });
      // $3 × 16.75% = $0.5025 → $1
      expect(result.yonkersResidentSurcharge.toString()).toBe("1");
    });

    it("Line 55 - surcharge on $100 line 46 total", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 100 });
      // $100 × 16.75% = $16.75 → $17
      expect(result.yonkersResidentSurcharge.toString()).toBe("17");
    });

    it("Line 55 - surcharge on $50,000 line 46 total", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 50000 });
      // $50,000 × 16.75% = $8,375
      expect(result.yonkersResidentSurcharge.toString()).toBe("8375");
    });

    it("Line 55 - surcharge on $0 line 46 total is zero", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 0 });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
    });

    it("Line 55 - negative line 46 total treated as zero", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: -500 });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
    });

    it("Line 55 - high income $200,000 line 46 total", () => {
      const result = yonkersTax2025({ totalNewYorkStateTaxes: 200000 });
      // $200,000 × 16.75% = $33,500
      expect(result.yonkersResidentSurcharge.toString()).toBe("33500");
    });

    it("Line 55 - nonresident and part-year lines are zero for full-year resident", () => {
      const result = yonkersTax2025();
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });
  });

  /* ========== Line 56 — Yonkers Nonresident Earnings Tax ========== */

  describe("Line 56 - nonresident earnings tax", () => {
    it("Line 56 - nonresident earnings tax 0.5% of Yonkers wages", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 80000,
      });
      // $80,000 × 0.5% = $400
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("400");
      expect(result.totalYonkersTax.toString()).toBe("400");
    });

    it("Line 56 - nonresident tax on $50,000 Yonkers wages", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 50000,
      });
      // $50,000 × 0.5% = $250
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("250");
    });

    it("Line 56 - nonresident tax on $1,000 Yonkers wages", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 1000,
      });
      // $1,000 × 0.5% = $5
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("5");
    });

    it("Line 56 - nonresident tax on $150 Yonkers wages rounds to $1", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 150,
      });
      // $150 × 0.5% = $0.75 → $1
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("1");
    });

    it("Line 56 - nonresident tax on $0 Yonkers wages is zero", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 0,
      });
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
    });

    it("Line 56 - nonresident tax with no wages provided defaults to zero", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
      });
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
    });

    it("Line 56 - nonresident tax on high wages $500,000", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 500000,
      });
      // $500,000 × 0.5% = $2,500
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("2500");
    });

    it("Line 56 - resident surcharge and part-year lines are zero for nonresident", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 80000,
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });
  });

  /* ========== Line 57 — Part-Year Yonkers Resident Surcharge ========== */

  describe("Line 57 - part-year Yonkers surcharge", () => {
    it("Line 57 - part-year Yonkers surcharge uses IT-360.1 line 65 and line 73 income percentage", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        totalNewYorkStateTaxes: 10000,
        empireStateChildCredit: 600,
        nysChildDependentCareCredit: 100,
        nyEarnedIncomeCredit: 300,
        realPropertyTaxCredit: 50,
        collegeTuitionCreditAmount: 25,
        it201attLine13RefundableCredits: 25,
        yonkersResidentIncomePercentage: "0.4",
      });
      // IT-360.1 line 64 credits = 600 + 100 + 300 + 50 + 25 + 25 = 1,100
      // IT-360.1 line 65 = 10,000 - 1,100 = 8,900
      // IT-360.1 line 74 = 8,900 × 0.4 = 3,560
      // IT-360.1 line 77 = 3,560 × 16.75% = 596.30 -> $596
      expect(result.partYearYonkersSurcharge.toString()).toBe("596");
      expect(result.totalYonkersTax.toString()).toBe("596");
    });

    it("Line 57 - zero income percentage yields no surcharge", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        totalNewYorkStateTaxes: 8000,
        yonkersResidentIncomePercentage: "0",
      });
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });

    it("Line 57 - refundable credits can reduce line 65 to zero before the percentage applies", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        totalNewYorkStateTaxes: 1200,
        empireStateChildCredit: 500,
        nysChildDependentCareCredit: 300,
        nyEarnedIncomeCredit: 200,
        realPropertyTaxCredit: 200,
        yonkersResidentIncomePercentage: "0.75",
      });
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });

    it("Line 57 - part-year Yonkers path rejects missing IT-360.1 line 73 income percentage", () => {
      expect(() =>
        yonkersTax2025({
          yonkersResidencyStatus: "part_year",
          totalNewYorkStateTaxes: 10000,
        })
      ).toThrow(
        "Yonkers part-year resident tax requires yonkersResidentIncomePercentage from Form IT-360.1 line 73"
      );
    });

    it("Line 57 - part-year with zero line 56 total stays zero", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        totalNewYorkStateTaxes: 0,
        yonkersResidentIncomePercentage: "0.65",
      });
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });

    it("Line 57 - resident and nonresident lines are zero for part-year", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        yonkersResidentIncomePercentage: "0.5",
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
    });
  });

  /* ========== No Yonkers Connection ========== */

  describe("No Yonkers connection", () => {
    it("no Yonkers connection produces zero on all lines", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "none",
        totalNewYorkStateTaxes: 50000,
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
      expect(result.totalYonkersTax.toString()).toBe("0");
    });
  });

  /* ========== Mutual Exclusivity ========== */

  describe("Mutual exclusivity of Yonkers statuses", () => {
    it("full-year status only populates line 55", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "full_year",
        totalNewYorkStateTaxes: 5000,
      });
      expect(result.yonkersResidentSurcharge.greaterThan(d(0))).toBe(true);
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });

    it("nonresident status only populates line 56", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 80000,
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
      expect(result.yonkersNonresidentEarningsTax.greaterThan(d(0))).toBe(true);
      expect(result.partYearYonkersSurcharge.toString()).toBe("0");
    });

    it("part-year status only populates line 57", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        totalNewYorkStateTaxes: 5000,
        yonkersResidentIncomePercentage: "0.5",
      });
      expect(result.yonkersResidentSurcharge.toString()).toBe("0");
      expect(result.yonkersNonresidentEarningsTax.toString()).toBe("0");
      expect(result.partYearYonkersSurcharge.greaterThan(d(0))).toBe(true);
    });
  });

  /* ========== Audit Trail ========== */

  describe("Audit trail", () => {
    it("full-year resident produces audit line for line 55", () => {
      const result = yonkersTax2025({ yonkersResidencyStatus: "full_year" });
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("55");
    });

    it("nonresident produces audit line for line 56", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 50000,
      });
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("56");
    });

    it("part-year resident produces audit line for line 57", () => {
      const result = yonkersTax2025({
        yonkersResidencyStatus: "part_year",
        yonkersResidentIncomePercentage: "0.5",
      });
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("57");
    });

    it("no Yonkers connection produces audit line for line 55", () => {
      const result = yonkersTax2025({ yonkersResidencyStatus: "none" });
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("55");
    });
  });

  /* ========== Year Validation ========== */

  describe("Year validation", () => {
    it("throws for unsupported tax year", () => {
      expect(() =>
        yonkersTax2025({ taxYear: 2020 })
      ).toThrow("Yonkers tax computation not available for tax year 2020");
    });
  });
});

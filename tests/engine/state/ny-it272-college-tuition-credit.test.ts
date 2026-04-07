/**
 * Tests for NY IT-272 College Tuition Tax Credit.
 * Spec: spec/state/ny-it272-college-tuition-credit.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYIT272,
  type NYIT272Input,
  NY_COLLEGE_TUITION_CREDIT_CONSTANTS,
} from "@/engine/state/ny-it272-college-tuition-credit.js";

/* ---------- Helpers ---------- */

function baseInput(overrides: Partial<NYIT272Input> = {}): NYIT272Input {
  return {
    students: [{ tuitionPaid: 8000 }],
    nyStateTax: 5000,
    taxYear: 2025,
    ...overrides,
  };
}

function d(v: number | string): Decimal {
  return new Decimal(v);
}

/* ---------- Constants ---------- */

describe("NY IT-272 College Tuition Credit", () => {
  describe("Constants", () => {
    it("2025 constants match IT-272 instructions", () => {
      const c = NY_COLLEGE_TUITION_CREDIT_CONSTANTS[2025];
      expect(c).toBeDefined();
      expect(c.creditRate.equals(d("0.04"))).toBe(true);
      expect(c.maxQualifyingExpensesPerStudent.equals(d(10000))).toBe(true);
    });
  });

  /* ---------- Line 1: Per-student qualifying expenses ---------- */

  describe("Line 1 - qualifying expenses capped at $10,000 per student", () => {
    it("tuition under cap uses actual amount", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 5000 }],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(5000))).toBe(true);
    });

    it("tuition at cap uses $10,000", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(10000))).toBe(true);
    });

    it("tuition over cap is capped at $10,000", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 25000 }],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(10000))).toBe(true);
    });

    it("zero tuition results in zero qualifying expenses", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 0 }],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(0))).toBe(true);
    });

    it("negative tuition is floored to zero", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: -500 }],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(0))).toBe(true);
    });

    it("each student is capped independently", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 15000 },
          { tuitionPaid: 3000 },
          { tuitionPaid: 12000 },
        ],
      }));

      expect(result.students[0].qualifyingExpenses.equals(d(10000))).toBe(true);
      expect(result.students[1].qualifyingExpenses.equals(d(3000))).toBe(true);
      expect(result.students[2].qualifyingExpenses.equals(d(10000))).toBe(true);
    });
  });

  /* ---------- Line 2: Total qualifying expenses ---------- */

  describe("Line 2 - total qualifying expenses summed across students", () => {
    it("single student total equals their qualifying expenses", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 7500 }],
      }));

      expect(result.totalQualifyingExpenses.equals(d(7500))).toBe(true);
    });

    it("multiple students total is sum of capped amounts", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 8000 },
          { tuitionPaid: 12000 },
        ],
      }));

      // 8000 + 10000 (capped) = 18000
      expect(result.totalQualifyingExpenses.equals(d(18000))).toBe(true);
    });

    it("empty student list results in zero", () => {
      const result = calculateNYIT272(baseInput({
        students: [],
      }));

      expect(result.totalQualifyingExpenses.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Line 3: Credit computation ---------- */

  describe("Line 3 - credit is 4% of qualifying expenses", () => {
    it("$10,000 tuition yields $400 credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
      }));

      expect(result.computedCredit.equals(d(400))).toBe(true);
    });

    it("$5,000 tuition yields $200 credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 5000 }],
      }));

      expect(result.computedCredit.equals(d(200))).toBe(true);
    });

    it("$25,000 tuition (capped at $10,000) yields $400 credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 25000 }],
      }));

      expect(result.computedCredit.equals(d(400))).toBe(true);
    });

    it("two students at $10,000 each yields $800 credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 10000 },
          { tuitionPaid: 10000 },
        ],
      }));

      expect(result.computedCredit.equals(d(800))).toBe(true);
    });

    it("three students with varied tuition", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 10000 },
          { tuitionPaid: 5000 },
          { tuitionPaid: 15000 },
        ],
      }));

      // (10000 + 5000 + 10000) × 4% = 25000 × 0.04 = 1000
      expect(result.computedCredit.equals(d(1000))).toBe(true);
    });

    it("odd tuition amount rounds credit to nearest dollar", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 7777 }],
      }));

      // 7777 × 0.04 = 311.08 → rounds to $311
      expect(result.computedCredit.equals(d(311))).toBe(true);
    });

    it("tuition producing half-dollar rounds up", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 6250 }],
      }));

      // 6250 × 0.04 = 250.00 → exactly $250
      expect(result.computedCredit.equals(d(250))).toBe(true);
    });

    it("zero students yields zero credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [],
      }));

      expect(result.computedCredit.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Line 4: Refundable credit amount ---------- */

  describe("Line 4 - credit remains refundable even when it exceeds tax liability", () => {
    it("credit less than tax: full credit allowed", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
        nyStateTax: 5000,
      }));

      // Credit $400 < tax $5000 → full $400
      expect(result.credit.equals(d(400))).toBe(true);
    });

    it("credit exceeds tax: full refundable amount preserved", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 10000 },
          { tuitionPaid: 10000 },
          { tuitionPaid: 10000 },
        ],
        nyStateTax: 500,
      }));

      // Credit $1200 > tax $500 → still fully refundable
      expect(result.credit.equals(d(1200))).toBe(true);
      expect(result.computedCredit.equals(d(1200))).toBe(true);
    });

    it("credit equals tax exactly", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
        nyStateTax: 400,
      }));

      expect(result.credit.equals(d(400))).toBe(true);
    });

    it("zero tax still allows the refundable credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
        nyStateTax: 0,
      }));

      expect(result.computedCredit.equals(d(400))).toBe(true);
      expect(result.credit.equals(d(400))).toBe(true);
    });

    it("very small tax does not reduce the refundable credit", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 8000 }],
        nyStateTax: 50,
      }));
      // Credit $320 > tax $50 → still fully refundable
      expect(result.credit.equals(d(320))).toBe(true);
    });
  });

  /* ---------- Credit vs. deduction comparison ---------- */

  describe("Credit vs. deduction comparison", () => {
    it("equivalentDeductionAmount matches total qualifying expenses", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 8000 }],
      }));

      expect(result.equivalentDeductionAmount.equals(result.totalQualifyingExpenses)).toBe(true);
    });

    it("deduction is more beneficial at higher marginal rates", () => {
      // At 6.85% marginal rate: deduction saves 10000 × 6.85% = $685
      // Credit gives: 10000 × 4% = $400
      // Deduction wins by $285
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
      }));

      const deductionBenefit = result.equivalentDeductionAmount.times("0.0685");
      expect(deductionBenefit.greaterThan(result.computedCredit)).toBe(true);
    });

    it("at 4% marginal rate credit and deduction are equivalent", () => {
      // At 4% marginal rate: deduction saves 10000 × 4% = $400
      // Credit gives: 10000 × 4% = $400
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
      }));

      const deductionBenefitAt4Pct = result.equivalentDeductionAmount.times("0.04");
      expect(deductionBenefitAt4Pct.equals(result.computedCredit)).toBe(true);
    });

    it("credit may be more beneficial than deduction for zero-tax filer", () => {
      // If filer has zero tax, the deduction provides no benefit but the credit is refundable
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 10000 }],
        nyStateTax: 0,
      }));

      expect(result.credit.equals(d(400))).toBe(true);
    });
  });

  /* ---------- Audit trail ---------- */

  describe("Audit trail", () => {
    it("produces audit lines for all computation steps", () => {
      const result = calculateNYIT272(baseInput({
        students: [
          { tuitionPaid: 8000 },
          { tuitionPaid: 12000 },
        ],
      }));

      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));

      // Per-student lines
      expect(lineMap.has("NY-IT272:1-1")).toBe(true);
      expect(lineMap.has("NY-IT272:1-2")).toBe(true);

      // Summary lines
      expect(lineMap.has("NY-IT272:2")).toBe(true);
      expect(lineMap.has("NY-IT272:3")).toBe(true);
      expect(lineMap.has("NY-IT272:4")).toBe(true);
    });

    it("audit line values match result fields", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 9000 }],
      }));

      const line3 = result.lines.find(l => l.form === "NY-IT272" && l.line === "3");
      expect(line3).toBeDefined();
      expect(line3!.value.equals(result.computedCredit)).toBe(true);

      const line4 = result.lines.find(l => l.form === "NY-IT272" && l.line === "4");
      expect(line4).toBeDefined();
      expect(line4!.value.equals(result.credit)).toBe(true);
    });
  });

  /* ---------- Edge cases ---------- */

  describe("Edge cases", () => {
    it("single student with $1 tuition", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 1 }],
      }));

      // 1 × 0.04 = 0.04 → rounds to $0
      expect(result.computedCredit.equals(d(0))).toBe(true);
    });

    it("single student with $13 tuition rounds credit to $1", () => {
      const result = calculateNYIT272(baseInput({
        students: [{ tuitionPaid: 13 }],
      }));

      // 13 × 0.04 = 0.52 → rounds to $1
      expect(result.computedCredit.equals(d(1))).toBe(true);
    });

    it("many students accumulate correctly", () => {
      const students = Array.from({ length: 5 }, () => ({ tuitionPaid: 10000 }));
      const result = calculateNYIT272(baseInput({
        students,
        nyStateTax: 10000,
      }));

      // 5 × $10,000 = $50,000 × 4% = $2,000
      expect(result.computedCredit.equals(d(2000))).toBe(true);
      expect(result.credit.equals(d(2000))).toBe(true);
    });

    it("string and number inputs are handled", () => {
      const result = calculateNYIT272({
        students: [{ tuitionPaid: "8000" }],
        nyStateTax: "5000",
        taxYear: 2025,
      });

      expect(result.computedCredit.equals(d(320))).toBe(true);
    });

    it("unsupported tax year throws", () => {
      expect(() =>
        calculateNYIT272(baseInput({ taxYear: 2020 }))
      ).toThrow("not available for tax year 2020");
    });
  });
});

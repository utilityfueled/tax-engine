/**
 * Edge case tests for Form 4952 — Investment Interest Expense Deduction.
 * Spec: spec/federal/form-4952.yaml
 *
 * Covers boundary conditions: deduction limited to net investment income,
 * carryforward of disallowed amounts, qualified dividend exclusion,
 * election of preferential income, zero investment income, prior year
 * carryforward, and investment expenses reducing net investment income.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4952 } from "@/engine/forms/form-4952.js";
import type { Form4952Input } from "@/models/inputs.js";

function make(overrides: Partial<Form4952Input> = {}): Form4952Input {
  return {
    investmentInterestExpense: overrides.investmentInterestExpense ?? "0",
    priorYearDisallowed: overrides.priorYearDisallowed ?? "0",
    grossInvestmentIncome: overrides.grossInvestmentIncome ?? "0",
    qualifiedDividendsIncluded: overrides.qualifiedDividendsIncluded ?? "0",
    netGainFromInvestmentProperty: overrides.netGainFromInvestmentProperty ?? "0",
    electedPreferentialIncome: overrides.electedPreferentialIncome ?? "0",
    investmentExpenses: overrides.investmentExpenses ?? "0",
    ...overrides,
  };
}

describe("Form 4952 edge cases", () => {
  // ═══════════════════════════════════════════════════════════
  // Deduction limited to net investment income
  // ═══════════════════════════════════════════════════════════

  describe("deduction limited to net investment income", () => {
    it("Form 4952 Line 8 - deduction equals interest when income exceeds expense", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "10000",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(5000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });

    it("Form 4952 Line 8 - deduction limited when expense exceeds income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "15000",
        grossInvestmentIncome: "8000",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(8000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(7000));
    });

    it("Form 4952 Line 8 - deduction equals expense when income exactly matches", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "10000",
        grossInvestmentIncome: "10000",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(10000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Qualified dividend exclusion
  // ═══════════════════════════════════════════════════════════

  describe("qualified dividend exclusion from investment income", () => {
    it("Form 4952 Line 4c - qualified dividends removed from investment income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "8000",
        qualifiedDividendsIncluded: "6000",
      }));
      // Line 4c = max(0, 8000 - 6000) = 2000
      expect(result.line4c).toEqual(new Decimal(2000));
      // Net investment income = 2000
      expect(result.line6).toEqual(new Decimal(2000));
      // Deduction limited to 2000
      expect(result.deductibleAmount).toEqual(new Decimal(2000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(3000));
    });

    it("Form 4952 Line 4c - all dividends qualified reduces income to zero", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "5000",
        qualifiedDividendsIncluded: "5000",
      }));
      expect(result.line4c).toEqual(new Decimal(0));
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Election of preferential income (IRC §163(d)(4)(B))
  // ═══════════════════════════════════════════════════════════

  describe("election to include preferential income", () => {
    it("Form 4952 Line 4g - electing qualified dividends as investment income increases deduction", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "10000",
        grossInvestmentIncome: "6000",
        qualifiedDividendsIncluded: "6000",
        electedPreferentialIncome: "4000",
      }));
      // Line 4c = max(0, 6000 - 6000) = 0
      // Line 6 = max(0, 0 + 0 + 4000 - 0) = 4000
      expect(result.line6).toEqual(new Decimal(4000));
      expect(result.deductibleAmount).toEqual(new Decimal(4000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(6000));
    });

    it("Form 4952 Line 4g - electing full amount restores all investment income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "8000",
        qualifiedDividendsIncluded: "8000",
        electedPreferentialIncome: "8000",
      }));
      // Line 4c = 0, Line 4g = 8000
      // Line 6 = max(0, 0 + 0 + 8000 - 0) = 8000
      expect(result.line6).toEqual(new Decimal(8000));
      expect(result.deductibleAmount).toEqual(new Decimal(5000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Prior year carryforward
  // ═══════════════════════════════════════════════════════════

  describe("prior year disallowed carryforward", () => {
    it("Form 4952 Line 3 - prior year carryforward adds to current expense", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        priorYearDisallowed: "3000",
        grossInvestmentIncome: "10000",
      }));
      // Line 3 = 5000 + 3000 = 8000
      expect(result.line3).toEqual(new Decimal(8000));
      expect(result.deductibleAmount).toEqual(new Decimal(8000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });

    it("Form 4952 Line 7 - carryforward creates new carryforward when income insufficient", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        priorYearDisallowed: "8000",
        grossInvestmentIncome: "6000",
      }));
      // Line 3 = 13000, deductible = 6000, carryforward = 7000
      expect(result.line3).toEqual(new Decimal(13000));
      expect(result.deductibleAmount).toEqual(new Decimal(6000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(7000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Investment expenses reducing net income
  // ═══════════════════════════════════════════════════════════

  describe("investment expenses reduce net investment income", () => {
    it("Form 4952 Line 6 - investment expenses reduce net investment income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "8000",
        grossInvestmentIncome: "12000",
        investmentExpenses: "5000",
      }));
      // Line 6 = max(0, 12000 + 0 + 0 - 5000) = 7000
      expect(result.line6).toEqual(new Decimal(7000));
      expect(result.deductibleAmount).toEqual(new Decimal(7000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(1000));
    });

    it("Form 4952 Line 6 - expenses exceeding income floor at zero", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "3000",
        investmentExpenses: "5000",
      }));
      // Line 6 = max(0, 3000 - 5000) = 0
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Zero values
  // ═══════════════════════════════════════════════════════════

  describe("zero values", () => {
    it("Form 4952 - zero expense yields zero deduction and zero carryforward", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "0",
        grossInvestmentIncome: "10000",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });

    it("Form 4952 - zero income with expense creates full carryforward", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "10000",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(10000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Net gain from investment property
  // ═══════════════════════════════════════════════════════════

  describe("net gain from investment property disposition", () => {
    it("Form 4952 Line 4d - net gain increases investment income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "15000",
        grossInvestmentIncome: "5000",
        netGainFromInvestmentProperty: "8000",
      }));
      // Line 6 = max(0, 5000 + 8000 + 0 - 0) = 13000
      expect(result.line6).toEqual(new Decimal(13000));
      expect(result.deductibleAmount).toEqual(new Decimal(13000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(2000));
    });

    it("Form 4952 Line 4d - negative net gain floored at zero", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "8000",
        netGainFromInvestmentProperty: "-3000",
      }));
      // Line 4d = max(0, -3000) = 0
      expect(result.line4d).toEqual(new Decimal(0));
      // Line 6 = 8000 + 0 = 8000
      expect(result.line6).toEqual(new Decimal(8000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Qualified dividends exceeding gross investment income
  // ═══════════════════════════════════════════════════════════

  describe("qualified dividends exceeding gross investment income", () => {
    it("Form 4952 Line 4c - signed difference is preserved before line6 zero floor", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "3000",
        qualifiedDividendsIncluded: "5000",
      }));
      // Printed4c =3000-5000=-2000; the net-income floor belongs to line6.
      expect(result.line4c).toEqual(new Decimal(-2000));
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
    });

    it("Form 4952 Line 4c - qualified dividends exceeding gross income can be rescued by electing them back", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "3000",
        qualifiedDividendsIncluded: "3000",
        electedPreferentialIncome: "3000",
      }));
      // Line 4c = 0, Line 4g = 3000, Line 6 = 3000
      expect(result.line4c).toEqual(new Decimal(0));
      expect(result.line6).toEqual(new Decimal(3000));
      expect(result.deductibleAmount).toEqual(new Decimal(3000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(2000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Prior year carryforward only (no current year expense)
  // ═══════════════════════════════════════════════════════════

  describe("prior year carryforward only", () => {
    it("Form 4952 Line 3 - prior year carryforward alone is deductible against current income", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "0",
        priorYearDisallowed: "7000",
        grossInvestmentIncome: "10000",
      }));
      // Line 3 = 0 + 7000 = 7000
      expect(result.line1).toEqual(new Decimal(0));
      expect(result.line3).toEqual(new Decimal(7000));
      expect(result.deductibleAmount).toEqual(new Decimal(7000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });

    it("Form 4952 Line 7 - prior year carryforward alone exceeding income carries forward again", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "0",
        priorYearDisallowed: "12000",
        grossInvestmentIncome: "5000",
      }));
      expect(result.line3).toEqual(new Decimal(12000));
      expect(result.deductibleAmount).toEqual(new Decimal(5000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(7000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Multi-component interaction at exact boundaries
  // ═══════════════════════════════════════════════════════════

  describe("multi-component net investment income boundaries", () => {
    it("Form 4952 Line 6 - all components combine to exactly match total expense, zero carryforward", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "10000",
        grossInvestmentIncome: "6000",
        qualifiedDividendsIncluded: "2000",
        netGainFromInvestmentProperty: "3000",
        electedPreferentialIncome: "1000",
        investmentExpenses: "0",
      }));
      // Line 4c = 6000 - 2000 = 4000
      // Line 6 = 4000 + 3000 + 1000 - 0 = 8000
      expect(result.line4c).toEqual(new Decimal(4000));
      expect(result.line6).toEqual(new Decimal(8000));
      expect(result.deductibleAmount).toEqual(new Decimal(8000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(2000));
    });

    it("Form 4952 Line 6 - investment expenses exactly offset all other income components", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "5000",
        grossInvestmentIncome: "8000",
        qualifiedDividendsIncluded: "3000",
        netGainFromInvestmentProperty: "2000",
        electedPreferentialIncome: "1000",
        investmentExpenses: "8000",
      }));
      // Line 4c = 8000 - 3000 = 5000
      // Line 6 = max(0, 5000 + 2000 + 1000 - 8000) = 0
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
    });

    it("Form 4952 Line 6 - $1 of net investment income allows $1 deduction on a large expense", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "50000",
        priorYearDisallowed: "25000",
        grossInvestmentIncome: "10001",
        qualifiedDividendsIncluded: "10000",
      }));
      // Line 4c = max(0, 10001 - 10000) = 1
      // Line 6 = 1
      expect(result.line4c).toEqual(new Decimal(1));
      expect(result.line6).toEqual(new Decimal(1));
      // Line 3 = 50000 + 25000 = 75000
      expect(result.line3).toEqual(new Decimal(75000));
      expect(result.deductibleAmount).toEqual(new Decimal(1));
      expect(result.disallowedCarryforward).toEqual(new Decimal(74999));
    });

    it("Form 4952 Line 8 - election of net capital gain plus all other components produces exact deduction match", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "20000",
        grossInvestmentIncome: "12000",
        qualifiedDividendsIncluded: "4000",
        netGainFromInvestmentProperty: "5000",
        electedPreferentialIncome: "4000",
        investmentExpenses: "1000",
      }));
      // Line 4c = 12000 - 4000 = 8000
      // Line 6 = max(0, 8000 + 5000 + 4000 - 1000) = 16000
      expect(result.line6).toEqual(new Decimal(16000));
      expect(result.deductibleAmount).toEqual(new Decimal(16000));
      expect(result.disallowedCarryforward).toEqual(new Decimal(4000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Minimum meaningful values
  // ═══════════════════════════════════════════════════════════

  describe("minimum meaningful values", () => {
    it("Form 4952 - $1 expense with $1 income produces $1 deduction and zero carryforward", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "1",
        grossInvestmentIncome: "1",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(1));
      expect(result.disallowedCarryforward).toEqual(new Decimal(0));
    });

    it("Form 4952 - $1 expense with zero income produces full $1 carryforward", () => {
      const result = calculateForm4952(make({
        investmentInterestExpense: "1",
      }));
      expect(result.deductibleAmount).toEqual(new Decimal(0));
      expect(result.disallowedCarryforward).toEqual(new Decimal(1));
    });
  });
});

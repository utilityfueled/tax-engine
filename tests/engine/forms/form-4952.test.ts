/**
 * Tests for Form 4952 — Investment Interest Expense Deduction.
 * Spec: spec/federal/form-4952.yaml
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4952 } from "@/engine/forms/form-4952.js";
import type { Form4952Input } from "@/models/inputs.js";

function form4952(overrides: Partial<Form4952Input> & Pick<Form4952Input, "investmentInterestExpense">): Form4952Input {
  return {
    investmentInterestExpense: overrides.investmentInterestExpense,
    priorYearDisallowed: overrides.priorYearDisallowed ?? "0",
    grossInvestmentIncome: overrides.grossInvestmentIncome ?? "0",
    qualifiedDividendsIncluded: overrides.qualifiedDividendsIncluded ?? "0",
    netGainFromInvestmentProperty: overrides.netGainFromInvestmentProperty ?? "0",
    electedPreferentialIncome: overrides.electedPreferentialIncome ?? "0",
    investmentExpenses: overrides.investmentExpenses ?? "0",
  };
}

describe("Form 4952 Investment Interest Expense Deduction", () => {
  // ── Part I: Total Investment Interest Expense ───────────────────
  it("Form 4952 Line 1 - current year investment interest expense", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      grossInvestmentIncome: "10000",
    }));
    expect(result.line1).toEqual(new Decimal(5000));
  });

  it("Form 4952 Line 2 - prior year disallowed carryforward", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "3000",
      priorYearDisallowed: "2000",
      grossInvestmentIncome: "10000",
    }));
    expect(result.line2).toEqual(new Decimal(2000));
  });

  it("Form 4952 Line 3 - total investment interest expense", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "3000",
      priorYearDisallowed: "2000",
      grossInvestmentIncome: "10000",
    }));
    expect(result.line3).toEqual(new Decimal(5000));
  });

  // ── Part II: Net Investment Income ──────────────────────────────
  it("Form 4952 Line 4a - gross investment income", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "8500",
    }));
    expect(result.line4a).toEqual(new Decimal(8500));
  });

  it("Form 4952 Line 4b - qualified dividends removed", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "8000",
      qualifiedDividendsIncluded: "3000",
    }));
    expect(result.line4b).toEqual(new Decimal(3000));
    expect(result.line4c).toEqual(new Decimal(5000));
  });

  it("Form 4952 Line 4c - gross income minus qualified dividends", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "10000",
      qualifiedDividendsIncluded: "4000",
    }));
    expect(result.line4c).toEqual(new Decimal(6000));
  });

  it("Form 4952 Line 4d - non-preferential investment gain", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "5000",
      netGainFromInvestmentProperty: "2500",
    }));
    expect(result.line4d).toEqual(new Decimal(2500));
  });

  it("Form 4952 Line 4d - negative gain is floored at zero", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "5000",
      netGainFromInvestmentProperty: "-500",
    }));
    expect(result.line4d).toEqual(new Decimal(0));
  });

  it("Form 4952 Line 4e - election increases net investment income", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "12000",
      grossInvestmentIncome: "8000",
      qualifiedDividendsIncluded: "3000",
      electedPreferentialIncome: "3000",
    }));
    // 4c = 8000 - 3000 = 5000
    // 4g = 5000 + 0 + 3000 - 0 = 8000
    expect(result.line4e).toEqual(new Decimal(3000));
    expect(result.line4g).toEqual(new Decimal(8000));
    expect(result.deductibleAmount).toEqual(new Decimal(8000));
  });

  it("Form 4952 Line 4f - investment expenses reduce net income", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "1000",
      grossInvestmentIncome: "5000",
      investmentExpenses: "1500",
    }));
    // 4g = 5000 - 0 + 0 + 0 - 1500 = 3500
    expect(result.line4g).toEqual(new Decimal(3500));
    expect(result.deductibleAmount).toEqual(new Decimal(1000));
  });

  it("Form 4952 Line 4g - net investment income floored at zero", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      grossInvestmentIncome: "1000",
      investmentExpenses: "2000",
    }));
    // 4g = max(0, 1000 + 0 + 0 - 2000) = 0
    expect(result.line4g).toEqual(new Decimal(0));
    expect(result.deductibleAmount).toEqual(new Decimal(0));
  });

  // ── Part III: Deduction and Carryforward ────────────────────────
  it("Form 4952 Line 5 - deduction limited to net investment income", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "10000",
      grossInvestmentIncome: "6000",
    }));
    // 4g = 6000
    // deduction = min(10000, 6000) = 6000
    expect(result.deductibleAmount).toEqual(new Decimal(6000));
  });

  it("Form 4952 Line 5 - full deduction when income exceeds expense", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "3000",
      grossInvestmentIncome: "8000",
    }));
    expect(result.deductibleAmount).toEqual(new Decimal(3000));
    expect(result.disallowedCarryforward).toEqual(new Decimal(0));
  });

  it("Form 4952 Line 7 - carryforward to next year", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "10000",
      grossInvestmentIncome: "6000",
    }));
    // carryforward = 10000 - 6000 = 4000
    expect(result.disallowedCarryforward).toEqual(new Decimal(4000));
  });

  it("Form 4952 Line 7 - full carryforward when net investment income is zero", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      grossInvestmentIncome: "0",
    }));
    expect(result.deductibleAmount).toEqual(new Decimal(0));
    expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
  });

  // ── Comprehensive scenarios ─────────────────────────────────────
  it("margin investor with dividends and prior carryforward gets partial deduction", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "8000",
      priorYearDisallowed: "3000",
      grossInvestmentIncome: "12000",
      qualifiedDividendsIncluded: "4000",
      netGainFromInvestmentProperty: "1500",
      investmentExpenses: "500",
    }));
    // Line 3 = 8000 + 3000 = 11000
    // 4c = 12000 - 4000 = 8000
    // 4g = max(0, 8000 + 1500 + 0 - 500) = 9000
    // deduction = min(11000, 9000) = 9000
    // carryforward = 11000 - 9000 = 2000
    expect(result.line3).toEqual(new Decimal(11000));
    expect(result.line4g).toEqual(new Decimal(9000));
    expect(result.deductibleAmount).toEqual(new Decimal(9000));
    expect(result.disallowedCarryforward).toEqual(new Decimal(2000));
  });

  it("election to include qualified dividends eliminates carryforward", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "8000",
      priorYearDisallowed: "3000",
      grossInvestmentIncome: "12000",
      qualifiedDividendsIncluded: "4000",
      netGainFromInvestmentProperty: "1500",
      electedPreferentialIncome: "4000",
      investmentExpenses: "500",
    }));
    // Line 3 = 11000
    // 4c = 8000
    // 4g = max(0, 8000 + 1500 + 4000 - 500) = 13000
    // deduction = min(11000, 13000) = 11000
    // carryforward = 0
    expect(result.line4g).toEqual(new Decimal(13000));
    expect(result.deductibleAmount).toEqual(new Decimal(11000));
    expect(result.disallowedCarryforward).toEqual(new Decimal(0));
  });

  it("zero investment interest expense produces zero deduction", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "0",
      grossInvestmentIncome: "50000",
    }));
    expect(result.deductibleAmount).toEqual(new Decimal(0));
    expect(result.disallowedCarryforward).toEqual(new Decimal(0));
  });

  it("only prior year carryforward with no current expense still gets deducted", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "0",
      priorYearDisallowed: "4000",
      grossInvestmentIncome: "10000",
    }));
    expect(result.line3).toEqual(new Decimal(4000));
    expect(result.deductibleAmount).toEqual(new Decimal(4000));
    expect(result.disallowedCarryforward).toEqual(new Decimal(0));
  });

  it("investment expenses exceeding gross income floor net investment income at zero", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      grossInvestmentIncome: "3000",
      investmentExpenses: "4000",
    }));
    // 4g = max(0, 3000 + 0 + 0 - 4000) = 0
    expect(result.line4g).toEqual(new Decimal(0));
    expect(result.deductibleAmount).toEqual(new Decimal(0));
    expect(result.disallowedCarryforward).toEqual(new Decimal(5000));
  });

  it("all components present with partial election", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "15000",
      priorYearDisallowed: "5000",
      grossInvestmentIncome: "20000",
      qualifiedDividendsIncluded: "6000",
      netGainFromInvestmentProperty: "3000",
      electedPreferentialIncome: "2000",
      investmentExpenses: "1000",
    }));
    // Line 3 = 15000 + 5000 = 20000
    // 4c = 20000 - 6000 = 14000
    // 4g = max(0, 14000 + 3000 + 2000 - 1000) = 18000
    // deduction = min(20000, 18000) = 18000
    // carryforward = 20000 - 18000 = 2000
    expect(result.line3).toEqual(new Decimal(20000));
    expect(result.line4c).toEqual(new Decimal(14000));
    expect(result.line4g).toEqual(new Decimal(18000));
    expect(result.deductibleAmount).toEqual(new Decimal(18000));
    expect(result.disallowedCarryforward).toEqual(new Decimal(2000));
  });

  it("audit trail records all key lines", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      priorYearDisallowed: "1000",
      grossInvestmentIncome: "8000",
      qualifiedDividendsIncluded: "2000",
      netGainFromInvestmentProperty: "500",
      electedPreferentialIncome: "1000",
      investmentExpenses: "300",
    }));
    const formNames = result.lines.map((l) => l.form);
    expect(formNames.every((n) => n === "Form 4952")).toBe(true);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("3");
    expect(lineNumbers).toContain("4c");
    expect(lineNumbers).toContain("4g");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("7");
  });

  // ── Edge cases ──────────────────────────────────────────────────
  it("qualified dividends cannot exceed gross investment income", () => {
    // If someone enters more qualified dividends than gross income,
    // the 4c floor at 0 prevents negative base
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "5000",
      grossInvestmentIncome: "3000",
      qualifiedDividendsIncluded: "5000",
    }));
    // 4c = max(0, 3000 - 5000) = 0 (floored)
    expect(result.line4c).toEqual(new Decimal(0));
  });

  it("large margin interest with small dividend income", () => {
    // Common for leveraged investors: margin interest >> dividend income
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "25000",
      grossInvestmentIncome: "4000",
      qualifiedDividendsIncluded: "2500",
    }));
    // 4c = 4000 - 2500 = 1500
    // 4g = 1500
    // deduction = min(25000, 1500) = 1500
    // carryforward = 25000 - 1500 = 23500
    expect(result.deductibleAmount).toEqual(new Decimal(1500));
    expect(result.disallowedCarryforward).toEqual(new Decimal(23500));
  });

  it("one dollar of net investment income allows one dollar deduction", () => {
    const result = calculateForm4952(form4952({
      investmentInterestExpense: "10000",
      grossInvestmentIncome: "1",
    }));
    expect(result.deductibleAmount).toEqual(new Decimal(1));
    expect(result.disallowedCarryforward).toEqual(new Decimal(9999));
  });
});

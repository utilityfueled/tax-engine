/**
 * Edge case tests for Form 2441 — Child and Dependent Care Expenses
 * Spec: spec/federal/form-2441.yaml
 *
 * Focuses on:
 * - Earned income exactly equal to qualifying expenses (both limits binding)
 * - Very small and $1 values
 * - qualifyingIndividuals > 2 still uses $6K cap
 * - AGI at exact $2K step boundaries
 * - Maximum credit amounts (theoretical max $2,100 for 2 at 35%)
 * - Interaction between earned income and expense caps
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
import type { Form2441Input } from "@/engine/forms/form-2441.js";

const d = (n: number | string) => new Decimal(n);

function make(overrides: Partial<Form2441Input> = {}): Form2441Input {
  return {
    careExpenses: d(5000),
    qualifyingIndividuals: 1,
    earnedIncome: d(50000),
    agi: d(50000),
    ...overrides,
  };
}

describe("Form 2441 Edge Cases — Earned Income Exactly at Expense Limit", () => {
  it("Form 2441 Line 4 - earned income exactly $3,000 equals one-person cap", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(3000),
      agi: d(15000),
    }));
    // Expenses capped at $3K, earned income $3K → both limits bind at $3K
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(3000);
    // Credit = $3,000 × 35% = $1,050
    expect(result.credit.toNumber()).toBe(1050);
  });

  it("Form 2441 Line 4 - earned income exactly $6,000 equals two-person cap", () => {
    const result = calculateForm2441(make({
      careExpenses: d(10000),
      qualifyingIndividuals: 2,
      earnedIncome: d(6000),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(6000);
    // Credit = $6,000 × 35% = $2,100 — theoretical maximum
    expect(result.credit.toNumber()).toBe(2100);
  });

  it("Form 2441 Line 4 - earned income $2,999 is below one-person cap by $1", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(2999),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(2999);
    // Credit = $2,999 × 35% = $1,049.65 → rounded to $1,050
    expect(result.credit.toNumber()).toBe(1050);
  });
});

describe("Form 2441 Edge Cases — Very Small Values", () => {
  it("Form 2441 Line 3 - $1 in expenses yields $1 qualifying expenses", () => {
    const result = calculateForm2441(make({
      careExpenses: d(1),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(1);
    expect(result.earnedIncomeLimit.toNumber()).toBe(1);
    // $1 × 35% = $0.35 → rounded to $0
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Form 2441 Line 9 - $3 expenses at 35% = $1.05 rounds to $1", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    expect(result.credit.toNumber()).toBe(1);
  });

  it("Form 2441 Line 4 - $1 earned income limits credit to minimum", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(1),
      agi: d(15000),
    }));
    expect(result.earnedIncomeLimit.toNumber()).toBe(1);
    // $1 × 35% = $0.35 → $0
    expect(result.credit.toNumber()).toBe(0);
  });
});

describe("Form 2441 Edge Cases — qualifyingIndividuals > 2", () => {
  it("Form 2441 Line 3 - 3 qualifying individuals still use $6K cap (same as 2+)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(10000),
      qualifyingIndividuals: 3,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
  });

  it("Form 2441 Line 3 - 10 qualifying individuals still use $6K cap", () => {
    const result = calculateForm2441(make({
      careExpenses: d(30000),
      qualifyingIndividuals: 10,
      earnedIncome: d(100000),
      agi: d(100000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    // 20% floor × $6K = $1,200
    expect(result.credit.toNumber()).toBe(1200);
  });
});

describe("Form 2441 Edge Cases — AGI at Exact $2K Step Boundaries", () => {
  // The IRS ceiling rounding: "round to next higher whole number"
  // Tests at the exact $2K boundaries where the step function transitions

  it("Form 2441 Line 8 - AGI $17,000 is top of first reduced bracket (34%)", () => {
    // ($17K - $15K) / $2K = 1.0 → ceil = 1 → 35% - 1% = 34%
    const result = calculateForm2441(make({ agi: d(17000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - AGI $19,000 is top of second reduced bracket (33%)", () => {
    // ($19K - $15K) / $2K = 2.0 → ceil = 2 → 35% - 2% = 33%
    const result = calculateForm2441(make({ agi: d(19000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.33);
  });

  it("Form 2441 Line 8 - AGI $19,001 drops to 32% (enters third bracket)", () => {
    // ($19,001 - $15,000) / $2,000 = 2.0005 → ceil = 3 → 35% - 3% = 32%
    const result = calculateForm2441(make({ agi: d(19001) }));
    expect(result.creditPercentage.toNumber()).toBe(0.32);
  });

  it("Form 2441 Line 8 - AGI $41,000 yields 22% (13 steps)", () => {
    // ($41K - $15K) / $2K = 13 → ceil = 13 → 35% - 13% = 22%
    const result = calculateForm2441(make({ agi: d(41000) }));
    expect(result.creditPercentage.toNumber()).toBe(0.22);
  });

  it("Form 2441 Line 8 - AGI $41,001 yields 21% (fraction rounds up)", () => {
    // ($41,001 - $15,000) / $2,000 = 13.0005 → ceil = 14 → 35% - 14% = 21%
    const result = calculateForm2441(make({ agi: d(41001) }));
    expect(result.creditPercentage.toNumber()).toBe(0.21);
  });
});

describe("Form 2441 Edge Cases — Maximum Credit Amounts", () => {
  it("Form 2441 Line 9 - theoretical max $1,050 for one individual (35% × $3K)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    expect(result.credit.toNumber()).toBe(1050);
  });

  it("Form 2441 Line 9 - theoretical max $2,100 for two+ individuals (35% × $6K)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(6000),
      qualifyingIndividuals: 2,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    expect(result.credit.toNumber()).toBe(2100);
  });

  it("Form 2441 Line 9 - minimum credit at 20% floor: $600 for one ($3K × 20%)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(100000),
      agi: d(100000),
    }));
    expect(result.credit.toNumber()).toBe(600);
  });

  it("Form 2441 Line 9 - minimum credit at 20% floor: $1,200 for two ($6K × 20%)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(6000),
      qualifyingIndividuals: 2,
      earnedIncome: d(100000),
      agi: d(100000),
    }));
    expect(result.credit.toNumber()).toBe(1200);
  });
});

describe("Form 2441 Edge Cases — Earned Income Interaction with Expenses", () => {
  it("Form 2441 - low earned income is binding constraint even at maximum AGI rate", () => {
    // Earned income $500, expenses $5000 (capped $3K), AGI $15K (35%)
    // Earned income limit = min($3K, $500) = $500
    // Credit = $500 × 35% = $175
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(500),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(500);
    expect(result.credit.toNumber()).toBe(175);
  });

  it("Form 2441 - earned income below expenses passes through (expenses are binding)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(2000),
      qualifyingIndividuals: 1,
      earnedIncome: d(5000),
      agi: d(15000),
    }));
    // Expenses $2K < $3K cap → $2K; earned income $5K > $2K
    expect(result.qualifyingExpenses.toNumber()).toBe(2000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(2000);
    // $2,000 × 35% = $700
    expect(result.credit.toNumber()).toBe(700);
  });

  it("Form 2441 - two individuals with earned income between $3K and $6K", () => {
    // Expenses $8K capped to $6K; earned income $4K is binding
    const result = calculateForm2441(make({
      careExpenses: d(8000),
      qualifyingIndividuals: 2,
      earnedIncome: d(4000),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(6000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(4000);
    // $4,000 × 35% = $1,400
    expect(result.credit.toNumber()).toBe(1400);
  });
});

describe("Form 2441 Edge Cases — AGI at Zero and Below Threshold", () => {
  it("Form 2441 Line 8 - AGI $0 yields maximum 35% rate", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(3000),
      agi: d(0),
    }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
    expect(result.credit.toNumber()).toBe(1050);
  });

  it("Form 2441 Line 8 - AGI $14,999 still yields 35% ($1 below threshold)", () => {
    const result = calculateForm2441(make({ agi: d(14999) }));
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  it("Form 2441 - zero AGI with zero earned income yields zero credit", () => {
    const result = calculateForm2441(make({
      careExpenses: d(5000),
      qualifyingIndividuals: 1,
      earnedIncome: d(0),
      agi: d(0),
    }));
    // 35% rate but $0 earned income limit → $0 credit
    expect(result.creditPercentage.toNumber()).toBe(0.35);
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });
});

describe("Form 2441 Edge Cases — 20% Floor Boundary", () => {
  it("Form 2441 Line 8 - AGI exactly $15,000 yields 35% (no excess over threshold)", () => {
    const result = calculateForm2441(make({ agi: d(15000) }));
    // ($15,000 - $15,000) / $2,000 = 0 → 35% - 0% = 35%
    expect(result.creditPercentage.toNumber()).toBe(0.35);
  });

  it("Form 2441 Line 8 - AGI $15,001 drops to 34% (first $1 over triggers ceiling to 1 step)", () => {
    const result = calculateForm2441(make({ agi: d(15001) }));
    // ($15,001 - $15,000) / $2,000 = 0.0005 → ceil = 1 → 35% - 1% = 34%
    expect(result.creditPercentage.toNumber()).toBe(0.34);
  });

  it("Form 2441 Line 8 - AGI $43,000 yields 21% (last step before 20% floor)", () => {
    const result = calculateForm2441(make({ agi: d(43000) }));
    // ($43,000 - $15,000) / $2,000 = 14 → ceil = 14 → 35% - 14% = 21%
    expect(result.creditPercentage.toNumber()).toBe(0.21);
  });

  it("Form 2441 Line 8 - AGI $43,001 reaches 20% floor (spec: floor at $43,001)", () => {
    const result = calculateForm2441(make({ agi: d(43001) }));
    // ($43,001 - $15,000) / $2,000 = 14.0005 → ceil = 15 → 35% - 15% = 20%
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - AGI $45,000 stays at 20% (formula agrees with floor)", () => {
    const result = calculateForm2441(make({ agi: d(45000) }));
    // ($45,000 - $15,000) / $2,000 = 15 → ceil = 15 → 35% - 15% = 20%
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - AGI $45,001 stays at 20% (floor prevents going below)", () => {
    const result = calculateForm2441(make({ agi: d(45001) }));
    // ($45,001 - $15,000) / $2,000 = 15.0005 → ceil = 16 → 35% - 16% = 19% → floor at 20%
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 8 - AGI $200,000 stays at 20% floor (well above range)", () => {
    const result = calculateForm2441(make({ agi: d(200000) }));
    // Without floor: ($200,000 - $15,000) / $2,000 = 92.5 → ceil = 93 → 35% - 93% = -58%
    // With floor: max(20%, -58%) = 20%
    expect(result.creditPercentage.toNumber()).toBe(0.20);
  });

  it("Form 2441 Line 9 - credit at 20% floor: $3K expenses × 20% = $600 for one qualifying individual", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    expect(result.creditPercentage.toNumber()).toBe(0.20);
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    expect(result.credit.toNumber()).toBe(600);
  });
});

describe("Form 2441 Edge Cases — Zero Expenses and Credit Rounding", () => {
  it("Form 2441 - zero care expenses yields zero credit regardless of income", () => {
    const result = calculateForm2441(make({
      careExpenses: d(0),
      qualifyingIndividuals: 2,
      earnedIncome: d(100000),
      agi: d(15000),
    }));
    expect(result.qualifyingExpenses.toNumber()).toBe(0);
    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Form 2441 Line 9 - $10 expenses at 20% = $2 (exact dollar, no rounding needed)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(10),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(50000),
    }));
    // $10 × 20% = $2.00
    expect(result.credit.toNumber()).toBe(2);
  });

  it("Form 2441 Line 9 - $7 expenses at 35% = $2.45 rounds to $2", () => {
    const result = calculateForm2441(make({
      careExpenses: d(7),
      qualifyingIndividuals: 1,
      earnedIncome: d(50000),
      agi: d(15000),
    }));
    // $7 × 35% = $2.45 → rounds to $2
    expect(result.credit.toNumber()).toBe(2);
  });

  it("Form 2441 - earned income exactly $1 more than qualifying expenses (expenses are binding)", () => {
    const result = calculateForm2441(make({
      careExpenses: d(3000),
      qualifyingIndividuals: 1,
      earnedIncome: d(3001),
      agi: d(15000),
    }));
    // Expense cap $3K is binding; earned income $3,001 does not constrain
    expect(result.qualifyingExpenses.toNumber()).toBe(3000);
    expect(result.earnedIncomeLimit.toNumber()).toBe(3000);
    expect(result.credit.toNumber()).toBe(1050);
  });
});

/**
 * Tests for New Jersey NJ-1040 Child Tax Credit.
 * Spec: spec/state/nj-1040-child-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040ChildTaxCredit } from "@/engine/state/nj-1040-child-tax-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 Child Tax Credit", () => {
  // --- Zero / no credit cases ---

  it("NJ-1040 CTC - zero qualifying children produces zero credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 0,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(1000);
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 CTC - income over $80,000 produces zero credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 80001,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(0);
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 CTC - married filing separately is ineligible even within income limit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(0);
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  // --- Income bracket: $0-$30,000 ($1,000/child) ---

  it("NJ-1040 CTC - income at $0 gets $1,000 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 0,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(1000);
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  it("NJ-1040 CTC - income at $30,000 boundary gets $1,000 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 30000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(1000);
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  // --- Income bracket: $30,001-$40,000 ($800/child) ---

  it("NJ-1040 CTC - income at $30,001 drops to $800 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 30001,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(800);
    expect(result.totalCredit.toNumber()).toBe(800);
  });

  it("NJ-1040 CTC - income at $40,000 boundary gets $800 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 40000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(800);
    expect(result.totalCredit.toNumber()).toBe(800);
  });

  // --- Income bracket: $40,001-$50,000 ($600/child) ---

  it("NJ-1040 CTC - income at $40,001 drops to $600 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 40001,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(600);
    expect(result.totalCredit.toNumber()).toBe(600);
  });

  it("NJ-1040 CTC - income at $50,000 boundary gets $600 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 50000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(600);
    expect(result.totalCredit.toNumber()).toBe(600);
  });

  // --- Income bracket: $50,001-$60,000 ($400/child) ---

  it("NJ-1040 CTC - income at $50,001 drops to $400 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 50001,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(400);
    expect(result.totalCredit.toNumber()).toBe(400);
  });

  it("NJ-1040 CTC - income at $60,000 boundary gets $400 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 60000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(400);
    expect(result.totalCredit.toNumber()).toBe(400);
  });

  // --- Income bracket: $60,001-$80,000 ($200/child) ---

  it("NJ-1040 CTC - income at $60,001 drops to $200 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 60001,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(200);
    expect(result.totalCredit.toNumber()).toBe(200);
  });

  it("NJ-1040 CTC - income exactly at $80,000 gets $200 per child", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 80000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(200);
    expect(result.totalCredit.toNumber()).toBe(200);
  });

  // --- Multiple children ---

  it("NJ-1040 CTC - two qualifying children doubles the credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(1000);
    expect(result.totalCredit.toNumber()).toBe(2000);
  });

  it("NJ-1040 CTC - three qualifying children triples the credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 35000,
      qualifyingChildrenAge5OrUnder: 3,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(800);
    expect(result.totalCredit.toNumber()).toBe(2400);
  });

  it("NJ-1040 CTC - four children at lowest bracket", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 20000,
      qualifyingChildrenAge5OrUnder: 4,
      monthsOfResidency: 12,
    });
    expect(result.totalCredit.toNumber()).toBe(4000);
  });

  // --- Part-year resident proration ---

  it("NJ-1040 CTC - part-year resident with 6 months gets half credit", () => {
    // 1 child, $25,000 income → $1,000 credit × (6/12) = $500
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 6,
    });
    expect(result.totalCredit.toNumber()).toBe(500);
  });

  it("NJ-1040 CTC - part-year resident with 1 month gets 1/12 credit", () => {
    // 1 child, $25,000 income → $1,000 × (1/12) = $83.33 → rounds to $83
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 1,
    });
    expect(result.totalCredit.toNumber()).toBe(83);
  });

  it("NJ-1040 CTC - part-year resident with 9 months and multiple children", () => {
    // 2 children, $45,000 income → $600/child × 2 = $1,200 × (9/12) = $900
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 45000,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 9,
    });
    expect(result.totalCredit.toNumber()).toBe(900);
  });

  it("NJ-1040 CTC - part-year resident with 7 months rounds correctly", () => {
    // 1 child, $25,000 income → $1,000 × (7/12) = $583.33 → rounds to $583
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 7,
    });
    expect(result.totalCredit.toNumber()).toBe(583);
  });

  // --- Zero months of residency ---

  it("NJ-1040 CTC - zero months of residency produces zero credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 0,
    });
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  // --- Months clamped ---

  it("NJ-1040 CTC - months clamped to maximum of 12", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 15,
    });
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  // --- Decimal input support ---

  it("NJ-1040 CTC - accepts Decimal input for taxable income", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: d(25000),
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  it("NJ-1040 CTC - accepts string input for taxable income", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: "55000",
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(400);
    expect(result.totalCredit.toNumber()).toBe(400);
  });

  // --- Negative income ---

  it("NJ-1040 CTC - negative taxable income gets maximum credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: -5000,
      qualifyingChildrenAge5OrUnder: 1,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(1000);
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  // --- Audit trail ---

  it("NJ-1040 CTC - audit trail records all computation steps", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 25000,
      qualifyingChildrenAge5OrUnder: 2,
      monthsOfResidency: 12,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("credit-per-child");
    expect(lineIds).toContain("total-credit-before-proration");
    expect(lineIds).toContain("nj-ctc");
  });

  // --- Over $80,000 boundary ---

  it("NJ-1040 CTC - income at $80,001 gets zero credit", () => {
    const result = calculateNJ1040ChildTaxCredit({
      filingStatus: "single",
      taxYear: 2025,
      njTaxableIncome: 80001,
      qualifyingChildrenAge5OrUnder: 3,
      monthsOfResidency: 12,
    });
    expect(result.creditPerChild.toNumber()).toBe(0);
    expect(result.totalCredit.toNumber()).toBe(0);
  });
});

/**
 * Tests for NY Form IT-216: Child and Dependent Care Credit.
 * Spec: spec/state/ny-it216-child-dependent-care-credit.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYIT216,
  lookupFederalDecimal,
  lookupNYSLimitationDecimal,
  lookupNYCLimitationDecimal,
  getExpenseLimit,
  type NYIT216Input,
} from "@/engine/state/ny-it216-child-dependent-care-credit.js";

/* ---------- Helper ---------- */

function input(overrides: Partial<NYIT216Input> = {}): NYIT216Input {
  return {
    qualifiedExpenses: 5000,
    numberOfQualifyingPersons: 1,
    taxpayerEarnedIncome: 40000,
    federalAgi: 40000,
    nyAgi: 40000,
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  };
}

/** Compare a Decimal to a number */
function expectDecimal(actual: Decimal, expected: number) {
  expect(actual.toNumber()).toBe(expected);
}

/* ---------- Federal Decimal Table (Line 10) ---------- */

describe("IT-216 Federal Credit Decimal Table (Line 10)", () => {
  it("FAGI at or below $15,000 returns .35", () => {
    expectDecimal(lookupFederalDecimal(new Decimal(0)), 0.35);
    expectDecimal(lookupFederalDecimal(new Decimal(15000)), 0.35);
  });

  it("FAGI $15,001-$17,000 returns .34", () => {
    expectDecimal(lookupFederalDecimal(new Decimal(15001)), 0.34);
    expectDecimal(lookupFederalDecimal(new Decimal(17000)), 0.34);
  });

  it("FAGI $23,001-$25,000 returns .30", () => {
    expectDecimal(lookupFederalDecimal(new Decimal(24000)), 0.30);
  });

  it("FAGI $41,001-$43,000 returns .21", () => {
    expectDecimal(lookupFederalDecimal(new Decimal(42000)), 0.21);
    expectDecimal(lookupFederalDecimal(new Decimal(43000)), 0.21);
  });

  it("FAGI over $43,000 returns .20", () => {
    expectDecimal(lookupFederalDecimal(new Decimal(43001)), 0.20);
    expectDecimal(lookupFederalDecimal(new Decimal(100000)), 0.20);
    expectDecimal(lookupFederalDecimal(new Decimal(500000)), 0.20);
  });
});

/* ---------- NYS Limitation Table (Line 13) ---------- */

describe("IT-216 NYS Limitation Decimal Table (Line 13)", () => {
  const year = 2025;

  it("NY AGI $0 returns 1.100", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(0), year), 1.1);
  });

  it("NY AGI $25,000 returns 1.100 (at boundary, included in low flat)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(25000), year), 1.1);
  });

  it("NY AGI $25,001 returns 1.099 (first $200 bracket)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(25001), year), 1.099);
  });

  it("NY AGI $25,200 returns 1.099 (upper bound of first bracket)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(25200), year), 1.099);
  });

  it("NY AGI $25,201 returns 1.098 (second bracket)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(25201), year), 1.098);
  });

  it("NY AGI $30,000 returns 1.067", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(30000), year), 1.067);
  });

  it("NY AGI $35,000 returns 1.034", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(35000), year), 1.034);
  });

  it("NY AGI over $39,800 but not over $40,000 returns 1.001", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(39801), year), 1.001);
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(40000), year), 1.001);
  });

  it("NY AGI $40,001 returns 1.000 (flat mid range)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(40001), year), 1.0);
  });

  it("NY AGI $45,000 returns 1.000", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(45000), year), 1.0);
  });

  it("NY AGI $50,000 returns 1.000 (boundary)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(50000), year), 1.0);
  });

  it("NY AGI $50,001 returns 1.162 (first bracket of 50-55k range)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(50001), year), 1.162);
  });

  it("NY AGI $50,200 returns 1.162 (upper bound of first 50k bracket)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(50200), year), 1.162);
  });

  it("NY AGI $50,201 returns 1.150 (second bracket)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(50201), year), 1.15);
  });

  it("NY AGI $52,601-$52,800 returns 1.000", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(52601), year), 1.0);
  });

  it("NY AGI $54,801-$55,000 returns 0.863 (last bracket of 50-55k)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(54801), year), 0.863);
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(55000), year), 0.863);
  });

  it("NY AGI $55,001 returns 0.927 (first bracket of 55-60k range)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(55001), year), 0.927);
  });

  it("NY AGI $57,601-$57,800 returns 0.750", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(57601), year), 0.75);
  });

  it("NY AGI $59,801-$60,000 returns 0.601 (last bracket of 55-60k)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(59801), year), 0.601);
  });

  it("NY AGI $60,001 returns 1.070 (first bracket of 60-65k range)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(60001), year), 1.07);
  });

  it("NY AGI $62,601-$62,800 returns 0.750", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(62601), year), 0.75);
  });

  it("NY AGI $64,801-$65,000 returns 0.476 (last bracket of 60-65k)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(64801), year), 0.476);
  });

  it("NY AGI $65,001 returns 0.600 (flat upper range)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(65001), year), 0.6);
  });

  it("NY AGI $100,000 returns 0.600", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(100000), year), 0.6);
  });

  it("NY AGI $150,000 returns 0.600 (boundary)", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(150000), year), 0.6);
  });

  it("NY AGI $150,001 returns 0.200", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(150001), year), 0.2);
  });

  it("NY AGI $500,000 returns 0.200", () => {
    expectDecimal(lookupNYSLimitationDecimal(new Decimal(500000), year), 0.2);
  });

  it("throws for unsupported tax year", () => {
    expect(() => lookupNYSLimitationDecimal(new Decimal(50000), 2020)).toThrow();
  });
});

/* ---------- NYC Limitation Table (Worksheet 2 Line 6) ---------- */

describe("IT-216 NYC Limitation Decimal Table (Worksheet 2, Line 6)", () => {
  const year = 2025;

  it("FAGI $0 returns 0.750", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(0), year), 0.75);
  });

  it("FAGI $25,000 returns 0.750 (boundary)", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(25000), year), 0.75);
  });

  it("FAGI $25,001 returns 0.735 (first granular bracket)", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(25001), year), 0.735);
  });

  it("FAGI $27,001-$27,200 returns 0.435", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(27001), year), 0.435);
  });

  it("FAGI $29,801-$30,000 returns 0.015 (last granular bracket)", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(29801), year), 0.015);
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(30000), year), 0.015);
  });

  it("FAGI over $30,000 returns 0", () => {
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(30001), year), 0);
    expectDecimal(lookupNYCLimitationDecimal(new Decimal(50000), year), 0);
  });
});

/* ---------- Expense Limit ---------- */

describe("IT-216 Expense Limit", () => {
  it("0 qualifying persons returns $0", () => {
    expect(getExpenseLimit(0).toNumber()).toBe(0);
  });

  it("1 qualifying person returns $3,000", () => {
    expect(getExpenseLimit(1).toNumber()).toBe(3000);
  });

  it("2 qualifying persons returns $6,000", () => {
    expect(getExpenseLimit(2).toNumber()).toBe(6000);
  });

  it("3+ qualifying persons returns $6,000", () => {
    expect(getExpenseLimit(3).toNumber()).toBe(6000);
    expect(getExpenseLimit(5).toNumber()).toBe(6000);
  });
});

/* ---------- Full Credit Computation ---------- */

describe("IT-216 NYS Child and Dependent Care Credit", () => {
  it("Line 3a - total qualified expenses paid preserved before caps", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 7200,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 50000,
      federalAgi: 50000,
      nyAgi: 50000,
    }));

    expect(result.qualifiedExpenses.equals(new Decimal(7200))).toBe(true);
    expect(result.lines.find(line => line.line === "3a")?.value.equals(new Decimal(7200))).toBe(true);
  });

  it("Line 9 - federal adjusted gross income captured for percentage lookup", () => {
    const result = calculateNYIT216(input({
      federalAgi: 27500,
      nyAgi: 27500,
      taxpayerEarnedIncome: 27500,
    }));

    expect(result.federalDecimal.equals(new Decimal("0.28"))).toBe(true);
    expect(result.lines.find(line => line.line === "9")?.value.equals(new Decimal(27500))).toBe(true);
  });

  it("Line 11 - tentative federal-style credit equals allowable expenses times federal decimal", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 5000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 40000,
      federalAgi: 40000,
      nyAgi: 40000,
    }));

    const line11 = result.lines.find(line => line.line === "11");
    expect(line11?.value.equals(result.allowableExpenses.times(result.federalDecimal))).toBe(true);
    expect(line11?.value.equals(result.federalStyleCredit)).toBe(true);
  });

  it("Line 12 - federal-style credit carried forward equals line 11 absent adjustments", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 30000,
      federalAgi: 30000,
      nyAgi: 30000,
    }));

    const line11 = result.lines.find(line => line.line === "11");
    const line12 = result.lines.find(line => line.line === "12");

    expect(line11?.value.equals(result.federalStyleCredit)).toBe(true);
    expect(line12?.value.equals(result.federalStyleCredit)).toBe(true);
    expect(line12?.value.equals(line11!.value)).toBe(true);
  });

  it("single filer, 1 child, $5,000 expenses, $40,000 income — credit = $661", () => {
    // expenses $5,000 capped at $3,000 (1 child)
    // allowable = $3,000
    // FAGI $40,000 → federal decimal .22 (39,000-41,000)
    // federal-style credit = $3,000 × .22 = $660
    // NY AGI $40,000 → NYS decimal 1.001 (over $39,800 not over $40,000)
    // NYS credit = $660 × 1.001 = $660.66 → rounds to $661
    const result = calculateNYIT216(input({
      qualifiedExpenses: 5000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 40000,
      federalAgi: 40000,
      nyAgi: 40000,
    }));
    expect(result.expenseLimit.toNumber()).toBe(3000);
    expect(result.allowableExpenses.toNumber()).toBe(3000);
    expectDecimal(result.federalDecimal, 0.22);
    expect(result.federalStyleCredit.toNumber()).toBe(660);
    expectDecimal(result.nysLimitationDecimal, 1.001);
    expect(result.nysCredit.toNumber()).toBe(661);
  });

  it("MFJ, 2 children, $8,000 expenses, $20,000 income — enhanced credit at 110%", () => {
    // expenses $8,000 capped at $6,000 (2 children)
    // both spouses earn $20,000
    // FAGI $20,000 → federal decimal .32 (19,000-21,000)
    // federal-style credit = $6,000 × .32 = $1,920
    // NY AGI $20,000 → NYS decimal 1.100
    // NYS credit = $1,920 × 1.100 = $2,112
    const result = calculateNYIT216(input({
      qualifiedExpenses: 8000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 20000,
      spouseEarnedIncome: 20000,
      federalAgi: 20000,
      nyAgi: 20000,
      filingStatus: "married_filing_jointly",
    }));
    expect(result.expenseLimit.toNumber()).toBe(6000);
    expect(result.allowableExpenses.toNumber()).toBe(6000);
    expectDecimal(result.federalDecimal, 0.32);
    expectDecimal(result.nysLimitationDecimal, 1.1);
    expect(result.nysCredit.toNumber()).toBe(2112);
  });

  it("low-income single filer with maximum enhancement (110%)", () => {
    // FAGI $10,000 → federal decimal .35
    // 1 child, $3,000 expenses
    // federal-style credit = $3,000 × .35 = $1,050
    // NYS decimal = 1.100
    // NYS credit = $1,050 × 1.100 = $1,155
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 10000,
      federalAgi: 10000,
      nyAgi: 10000,
    }));
    expect(result.nysCredit.toNumber()).toBe(1155);
  });

  it("high-income filer gets 20% of federal credit", () => {
    // FAGI $200,000 → federal decimal .20
    // 2 children, $10,000 expenses capped at $6,000
    // federal-style credit = $6,000 × .20 = $1,200
    // NY AGI $200,000 → NYS decimal 0.200
    // NYS credit = $1,200 × 0.200 = $240
    const result = calculateNYIT216(input({
      qualifiedExpenses: 10000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 200000,
      federalAgi: 200000,
      nyAgi: 200000,
    }));
    expectDecimal(result.federalDecimal, 0.20);
    expectDecimal(result.nysLimitationDecimal, 0.2);
    expect(result.nysCredit.toNumber()).toBe(240);
  });

  it("mid-range income ($45,000) gets 100% of federal credit", () => {
    // FAGI $45,000 → federal decimal .20
    // 1 child, $3,000 expenses
    // federal-style credit = $3,000 × .20 = $600
    // NY AGI $45,000 → NYS decimal 1.000
    // NYS credit = $600 × 1.000 = $600
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 45000,
      federalAgi: 45000,
      nyAgi: 45000,
    }));
    expect(result.nysCredit.toNumber()).toBe(600);
  });

  it("$65,000-$150,000 range gets 60% of federal credit", () => {
    // FAGI $80,000 → federal decimal .20
    // 2 children, $6,000 expenses
    // federal-style credit = $6,000 × .20 = $1,200
    // NY AGI $80,000 → NYS decimal 0.600
    // NYS credit = $1,200 × 0.600 = $720
    const result = calculateNYIT216(input({
      qualifiedExpenses: 6000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 80000,
      federalAgi: 80000,
      nyAgi: 80000,
    }));
    expect(result.nysCredit.toNumber()).toBe(720);
  });

  it("expenses capped by earned income when earned income is lower", () => {
    // 1 child, $3,000 expenses, but only $2,000 earned income
    // allowable = min(3000, 3000, 2000) = $2,000
    // FAGI $2,000 → federal decimal .35
    // federal-style credit = $2,000 × .35 = $700
    // NYS decimal = 1.100
    // NYS credit = $700 × 1.100 = $770
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 2000,
      federalAgi: 2000,
      nyAgi: 2000,
    }));
    expect(result.allowableExpenses.toNumber()).toBe(2000);
    expect(result.nysCredit.toNumber()).toBe(770);
  });

  it("MFJ with lower-earning spouse caps expenses", () => {
    // MFJ, 1 child, $3,000 expenses
    // Taxpayer earns $50,000, spouse earns $1,500
    // allowable = min(3000, 3000, 50000, 1500) = $1,500
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 50000,
      spouseEarnedIncome: 1500,
      federalAgi: 51500,
      nyAgi: 51500,
      filingStatus: "married_filing_jointly",
    }));
    expect(result.allowableExpenses.toNumber()).toBe(1500);
  });

  it("zero qualifying persons returns zero credit", () => {
    const result = calculateNYIT216(input({ numberOfQualifyingPersons: 0 }));
    expect(result.nysCredit.toNumber()).toBe(0);
  });

  it("zero earned income returns zero credit", () => {
    const result = calculateNYIT216(input({ taxpayerEarnedIncome: 0 }));
    expect(result.nysCredit.toNumber()).toBe(0);
  });

  it("zero expenses returns zero credit", () => {
    const result = calculateNYIT216(input({ qualifiedExpenses: 0 }));
    expect(result.nysCredit.toNumber()).toBe(0);
  });

  it("MFJ with zero spouse earned income returns zero credit", () => {
    const result = calculateNYIT216(input({
      filingStatus: "married_filing_jointly",
      taxpayerEarnedIncome: 50000,
      spouseEarnedIncome: 0,
    }));
    expect(result.nysCredit.toNumber()).toBe(0);
  });

  it("head of household uses taxpayer earned income as spouse income", () => {
    const result = calculateNYIT216(input({
      filingStatus: "head_of_household",
      taxpayerEarnedIncome: 30000,
      qualifiedExpenses: 4000,
      numberOfQualifyingPersons: 1,
      federalAgi: 30000,
      nyAgi: 30000,
    }));
    // Spouse earned income defaults to taxpayer's for non-MFJ
    // allowable = min(4000, 3000, 30000, 30000) = 3000
    expect(result.allowableExpenses.toNumber()).toBe(3000);
    expect(result.nysCredit.greaterThan(0)).toBe(true);
  });

  it("generates audit trail lines", () => {
    const result = calculateNYIT216(input());
    expect(result.lines.length).toBeGreaterThan(0);
    const lineIds = result.lines.map(l => l.line);
    expect(lineIds).toContain("14");
  });
});

/* ---------- NYS Credit at Specific Table Breakpoints ---------- */

describe("IT-216 NYS credit at table breakpoints", () => {
  it("NY AGI exactly $25,000 — 110% multiplier", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 25000,
      federalAgi: 25000,
      nyAgi: 25000,
    }));
    expectDecimal(result.nysLimitationDecimal, 1.1);
  });

  it("NY AGI $25,100 — 1.099 multiplier (in first $200 bracket)", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 25100,
      federalAgi: 25100,
      nyAgi: 25100,
    }));
    expectDecimal(result.nysLimitationDecimal, 1.099);
  });

  it("NY AGI exactly $50,000 — flat mid range", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 50000,
      federalAgi: 50000,
      nyAgi: 50000,
    }));
    expectDecimal(result.nysLimitationDecimal, 1.0);
  });

  it("NY AGI $150,000 — boundary of upper flat range", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 6000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 150000,
      federalAgi: 150000,
      nyAgi: 150000,
    }));
    expectDecimal(result.nysLimitationDecimal, 0.6);
  });

  it("NY AGI $150,001 — top flat range", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 6000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 150001,
      federalAgi: 150001,
      nyAgi: 150001,
    }));
    expectDecimal(result.nysLimitationDecimal, 0.2);
  });
});

/* ---------- NYC Credit ---------- */

describe("IT-216 NYC Child and Dependent Care Credit", () => {
  it("NYC resident with FAGI <= $25,000 and child under 4 gets 75% of NYS credit", () => {
    // FAGI $20,000 → federal decimal .32
    // 1 child, all expenses for child under 4
    // federal-style credit = $3,000 × .32 = $960
    // NYS decimal = 1.100
    // NYS credit = $960 × 1.100 = $1,056
    // NYC: under4 ratio = 1.0, FAGI $20,000 → NYC decimal 0.750
    // NYC credit = $1,056 × 1.0 × 0.750 = $792
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 20000,
      federalAgi: 20000,
      nyAgi: 20000,
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 3000,
    }));
    expect(result.nycQualified).toBe(true);
    expectDecimal(result.nycLimitationDecimal, 0.75);
    expect(result.nycCredit.toNumber()).toBe(792);
  });

  it("non-NYC resident gets no NYC credit", () => {
    const result = calculateNYIT216(input({
      isNYCResident: false,
      qualifiedExpensesForChildrenUnder4: 3000,
      federalAgi: 20000,
      nyAgi: 20000,
    }));
    expect(result.nycQualified).toBe(false);
    expect(result.nycCredit.toNumber()).toBe(0);
  });

  it("NYC resident with FAGI over $30,000 gets no NYC credit", () => {
    const result = calculateNYIT216(input({
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 3000,
      federalAgi: 35000,
      nyAgi: 35000,
      taxpayerEarnedIncome: 35000,
    }));
    expect(result.nycQualified).toBe(false);
    expect(result.nycCredit.toNumber()).toBe(0);
  });

  it("NYC resident with no children under 4 gets no NYC credit", () => {
    const result = calculateNYIT216(input({
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 0,
      federalAgi: 20000,
      nyAgi: 20000,
      taxpayerEarnedIncome: 20000,
    }));
    expect(result.nycQualified).toBe(false);
    expect(result.nycCredit.toNumber()).toBe(0);
  });

  it("partial under-4 expenses reduce NYC credit proportionally", () => {
    // 2 children, $6,000 total expenses, $2,000 for under-4
    // under4 ratio = 2000 / 6000 = 0.3333
    // FAGI $15,000 → federal decimal .35
    // federal-style credit = $6,000 × .35 = $2,100
    // NYS decimal = 1.100
    // NYS credit = $2,100 × 1.100 = $2,310
    // NYC credit base = $2,310 × 0.3333 = $769.923
    // NYC decimal = 0.750
    // NYC credit = $769.923 × 0.750 = $577.44 → $577
    const result = calculateNYIT216(input({
      qualifiedExpenses: 6000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 15000,
      federalAgi: 15000,
      nyAgi: 15000,
      filingStatus: "single",
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 2000,
    }));
    expect(result.nycQualified).toBe(true);
    expect(result.nycCredit.toNumber()).toBe(577);
  });

  it("NYC FAGI $27,500 — phases down NYC decimal", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 27500,
      federalAgi: 27500,
      nyAgi: 27500,
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 3000,
    }));
    expect(result.nycQualified).toBe(true);
    // FAGI $27,400-$27,600 → NYC decimal 0.375
    expectDecimal(result.nycLimitationDecimal, 0.375);
  });

  it("NYC FAGI at $30,000 boundary gets very small credit", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 30000,
      federalAgi: 30000,
      nyAgi: 30000,
      isNYCResident: true,
      qualifiedExpensesForChildrenUnder4: 3000,
    }));
    // FAGI $29,800-$30,000 → NYC decimal 0.015
    expect(result.nycQualified).toBe(true);
    expectDecimal(result.nycLimitationDecimal, 0.015);
    expect(result.nycCredit.greaterThan(0)).toBe(true);
  });
});

/* ---------- Edge Cases ---------- */

describe("IT-216 edge cases", () => {
  it("negative NY AGI treated as $0 for limitation table", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 10000,
      federalAgi: -5000,
      nyAgi: -5000,
    }));
    // Negative AGI → falls in $0-$25,000 range → 1.100
    expectDecimal(result.nysLimitationDecimal, 1.1);
    // Federal decimal for negative FAGI: falls in $0-$15,000 range → .35
    expectDecimal(result.federalDecimal, 0.35);
  });

  it("expenses of $1 for 1 child", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 1,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 50000,
      federalAgi: 50000,
      nyAgi: 50000,
    }));
    // $1 × .20 × 1.000 = $0.20 → rounds to $0
    expect(result.nysCredit.toNumber()).toBe(0);
  });

  it("very high income ($1M) — still gets 20% credit", () => {
    const result = calculateNYIT216(input({
      qualifiedExpenses: 6000,
      numberOfQualifyingPersons: 2,
      taxpayerEarnedIncome: 1000000,
      federalAgi: 1000000,
      nyAgi: 1000000,
    }));
    // $6,000 × .20 × 0.200 = $240
    expect(result.nysCredit.toNumber()).toBe(240);
  });

  it("MFS filing status treated as unmarried — gets credit", () => {
    // MFS treated as unmarried: spouse income defaults to taxpayer's
    // 1 child, $3,000 expenses, $50,000 earned income
    // allowable = min(3000, 3000, 50000, 50000) = $3,000
    // FAGI $50,000 → federal decimal .20
    // federal-style credit = $3,000 × .20 = $600
    // NY AGI $50,000 → NYS decimal 1.000
    // NYS credit = $600 × 1.000 = $600
    const result = calculateNYIT216(input({
      filingStatus: "married_filing_separately",
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 50000,
      federalAgi: 50000,
      nyAgi: 50000,
    }));
    // MFS treated as unmarried: spouse income = taxpayer income
    expect(result.allowableExpenses.toNumber()).toBe(3000);
    expect(result.nysCredit.toNumber()).toBe(600);
  });

  it("QSS filing status treats spouse income as taxpayer income", () => {
    const result = calculateNYIT216(input({
      filingStatus: "qualifying_surviving_spouse",
      qualifiedExpenses: 3000,
      numberOfQualifyingPersons: 1,
      taxpayerEarnedIncome: 30000,
      federalAgi: 30000,
      nyAgi: 30000,
    }));
    // Non-MFJ: spouse income defaults to taxpayer's
    expect(result.allowableExpenses.toNumber()).toBe(3000);
    expect(result.nysCredit.greaterThan(0)).toBe(true);
  });
});

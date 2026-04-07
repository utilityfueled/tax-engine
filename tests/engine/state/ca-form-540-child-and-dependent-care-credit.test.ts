/**
 * Tests for California Form 540 line 40 child and dependent care expenses credit.
 * Spec: spec/state/ca-form-540-child-and-dependent-care-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540ChildAndDependentCareCredit } from "@/engine/state/ca-form-540-child-and-dependent-care-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 line 40 child and dependent care expenses credit", () => {
  it("CA Form 540 line 40 Line 3 - one qualifying person is capped at $3,000", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      qualifiedExpensesIncurredInCalifornia: d(4200),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(35000),
      taxYear: 2025,
    });

    expect(result.line3QualifiedExpenses.toNumber()).toBe(3000);
  });

  it("CA Form 540 line 40 Line 5 - non-joint filers reuse line 4", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "head_of_household",
      qualifiedExpensesIncurredInCalifornia: d(2400),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(1800),
      federalAgi: d(28000),
      taxYear: 2025,
    });

    expect(result.line4TaxpayerEarnedIncome.toNumber()).toBe(1800);
    expect(result.line5ComparisonEarnedIncome.toNumber()).toBe(1800);
  });

  it("CA Form 540 line 40 Line 6 - the credit base uses the smallest of lines 3, 4, and 5", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "married_filing_jointly",
      qualifiedExpensesIncurredInCalifornia: d(6500),
      qualifyingPersonCount: 2,
      taxpayerEarnedIncome: d(70000),
      spouseEarnedIncomeForLine5: d(2000),
      federalAgi: d(50000),
      taxYear: 2025,
    });

    expect(result.line3QualifiedExpenses.toNumber()).toBe(6000);
    expect(result.line6AllowedExpenses.toNumber()).toBe(2000);
  });

  it("CA Form 540 line 40 Line 7 - federal AGI of $15,001 uses a .34 decimal", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      qualifiedExpensesIncurredInCalifornia: d(1000),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(15001),
      taxYear: 2025,
    });

    expect(result.line7FederalAgiDecimal.equals(d("0.34"))).toBe(true);
  });

  it("CA Form 540 line 40 Line 9 - federal AGI above $100,000 disqualifies the credit", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      qualifiedExpensesIncurredInCalifornia: d(3000),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(100001),
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("federal_agi_limit_exceeded");
    expect(result.line10CurrentYearCredit.toNumber()).toBe(0);
    expect(result.line12Line40Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 line 40 Line 11 - prior-year expenses paid in 2025 add to the credit", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      qualifiedExpensesIncurredInCalifornia: d(4000),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(35000),
      priorYearExpensesCredit: d(25),
      taxYear: 2025,
    });

    expect(result.line10CurrentYearCredit.toNumber()).toBe(375);
    expect(result.line11PriorYearExpensesCredit.toNumber()).toBe(25);
    expect(result.line12Line40Credit.toNumber()).toBe(400);
  });

  it("CA Form 540 line 40 Line 12 - current-year credit computes through line 10", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      qualifiedExpensesIncurredInCalifornia: d(4000),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(35000),
      taxYear: 2025,
    });

    expect(result.line6AllowedExpenses.toNumber()).toBe(3000);
    expect(result.line7FederalAgiDecimal.equals(d("0.25"))).toBe(true);
    expect(result.line8FederalAgiScaledAmount.toNumber()).toBe(750);
    expect(result.line9CaliforniaCreditDecimal.equals(d("0.50"))).toBe(true);
    expect(result.line10CurrentYearCredit.toNumber()).toBe(375);
    expect(result.line12Line40Credit.toNumber()).toBe(375);
  });

  it("CA Form 540 line 40 - Part IV line 33 override replaces raw expense capping", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "single",
      line3QualifiedExpensesOverride: d(1500),
      qualifyingPersonCount: 2,
      taxpayerEarnedIncome: d(50000),
      federalAgi: d(30000),
      taxYear: 2025,
    });

    expect(result.line3QualifiedExpenses.toNumber()).toBe(1500);
    expect(result.line12Line40Credit.toNumber()).toBe(203);
  });

  it("CA Form 540 line 40 - married filing separately without the Section E exception does not qualify", () => {
    const result = calculateCAForm540ChildAndDependentCareCredit({
      filingStatus: "married_filing_separately",
      qualifiedExpensesIncurredInCalifornia: d(3000),
      qualifyingPersonCount: 1,
      taxpayerEarnedIncome: d(40000),
      federalAgi: d(30000),
      marriedFilingSeparatelyMeetsSectionEException: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("married_filing_separately_without_section_e_exception");
    expect(result.line12Line40Credit.toNumber()).toBe(0);
  });
});

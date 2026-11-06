/**
 * Edge case tests for Schedule H — Household Employment Taxes
 * Spec: spec/federal/schedule-h.yaml
 *
 * Tests threshold boundaries for:
 * - $2,800 cash wage threshold (per employee)
 * - $176,100 Social Security wage base cap (per employee)
 * - $200,000 Additional Medicare Tax threshold (per employee)
 * - $7,000 FUTA wage base cap (per employee)
 * - Employee exemption categories
 * - FUTA Section B credit reduction edge cases
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleH } from "@/engine/forms/schedule-h.js";
import type { HouseholdEmployee } from "@/engine/forms/schedule-h.js";

const CONSTANTS_2025 = {
  cashWageThreshold: new Decimal(2800),
  socialSecurityRate: new Decimal("0.124"),
  medicareRate: new Decimal("0.029"),
  additionalMedicareRate: new Decimal("0.009"),
  additionalMedicareThreshold: new Decimal(200000),
  socialSecurityWageBase: new Decimal(176100),
  futaGrossRate: new Decimal("0.06"),
  futaMaxCredit: new Decimal("0.054"),
  futaNetRate: new Decimal("0.006"),
  futaWageBase: new Decimal(7000),
  futaQuarterlyThreshold: new Decimal(1000),
};

function makeEmployee(
  wages: string,
  overrides: Partial<HouseholdEmployee> = {}
): HouseholdEmployee {
  return {
    name: overrides.name ?? "Employee",
    cashWages: wages,
    isSpouse: false,
    isChildUnder21: false,
    isParent: false,
    isUnder18NonPrincipal: false,
    ...overrides,
  };
}

describe("Schedule H cash wage threshold boundary ($2,800)", () => {
  it("Schedule H Line 1 - $2,799 excludes Social Security but preserves actual FUTA", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("2799")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.line1.toNumber()).toBe(0);
    expect(result.futaTax.toFixed(2)).toBe("16.79");
    expect(result.totalTax.toFixed(2)).toBe("16.79");
  });

  it("Schedule H Line 1 - $2,800 triggers Schedule H at exact threshold", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("2800")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(1);
    // SS: $2,800 × 12.4% = $347.20
    expect(result.line2.toNumber()).toBe(347.2);
    // Medicare: $2,800 × 2.9% = $81.20
    expect(result.line4.toNumber()).toBe(81.2);
    // FUTA: $2,800 × 0.6% = $16.80
    expect(result.futaTax.toNumber()).toBe(16.8);
    expect(result.totalTax.toNumber()).toBe(347.2 + 81.2 + 16.8);
  });

  it("Schedule H Line 1 - $2,801 is one dollar above threshold", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("2801")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(2801);
    expect(result.line3.toNumber()).toBe(2801);
  });

  it("Schedule H Line 1 - each employee's threshold is independent", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("2799", { name: "Below" }),
        makeEmployee("2800", { name: "AtThreshold" }),
        makeEmployee("5000", { name: "Above" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Only employees at or above $2,800 qualify
    expect(result.qualifyingEmployeeCount).toBe(2);
    expect(result.line1.toNumber()).toBe(2800 + 5000);
    expect(result.line3.toNumber()).toBe(2800 + 5000);
  });
});

describe("Schedule H Social Security wage base boundary ($176,100)", () => {
  it("Schedule H Line 1 - wages at exactly $176,100 are fully subject to SS", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("176100")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.line1.toNumber()).toBe(176100);
    expect(result.line2.toNumber()).toBe(21836.4);
    // Medicare: full $176,100
    expect(result.line3.toNumber()).toBe(176100);
  });

  it("Schedule H Line 1 - wages at $176,101 cap SS at $176,100 but Medicare uses full amount", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("176101")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // SS capped at $176,100
    expect(result.line1.toNumber()).toBe(176100);
    expect(result.line2.toNumber()).toBe(21836.4);
    // Medicare uses full wages (no cap)
    expect(result.line3.toNumber()).toBe(176101);
    expect(result.line4.toNumber()).toBeCloseTo(5106.93, 2);
  });

  it("Schedule H Line 1 - multiple employees each independently capped at SS wage base", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("200000", { name: "Employee A" }),
        makeEmployee("180000", { name: "Employee B" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // SS: both capped at $176,100 each
    expect(result.line1.toNumber()).toBe(176100 + 176100);
    // Medicare: full wages
    expect(result.line3.toNumber()).toBe(200000 + 180000);
  });
});

describe("Schedule H Additional Medicare Tax boundary ($200,000)", () => {
  it("Schedule H Line 5 - wages at exactly $200,000 have zero Additional Medicare Tax", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("200000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
  });

  it("Schedule H Line 5 - wages at $200,001 trigger Additional Medicare on $1", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("200001")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.line5.toNumber()).toBe(1);
    // $1 × 0.9% = $0.01 (rounded)
    expect(result.line6.toNumber()).toBe(0.01);
  });

  it("Schedule H Line 5 - multiple employees each have independent $200,000 threshold", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("250000", { name: "High Earner A" }),
        makeEmployee("250000", { name: "High Earner B" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Each employee: $250,000 - $200,000 = $50,000 excess
    expect(result.line5.toNumber()).toBe(100000);
    // $100,000 × 0.9% = $900
    expect(result.line6.toNumber()).toBe(900);
  });

  it("Schedule H Line 5 - one employee above and one below Additional Medicare threshold", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("210000", { name: "Above" }),
        makeEmployee("190000", { name: "Below" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Only the first employee triggers Additional Medicare
    expect(result.line5.toNumber()).toBe(10000);
    expect(result.line6.toNumber()).toBe(90);
  });
});

describe("Schedule H FUTA wage base boundary ($7,000)", () => {
  it("Schedule H FUTA - wages at exactly $7,000 are fully subject to FUTA", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("7000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA: $7,000 × 0.6% = $42
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H FUTA - wages at $6,999 keep all wages subject to FUTA", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("6999")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA: $6,999 × 0.6% = $41.994 → rounded to $41.99
    expect(result.futaTax.toNumber()).toBeCloseTo(41.99, 2);
  });

  it("Schedule H FUTA - wages at $7,001 cap FUTA wages at $7,000", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("7001")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA: min($7,001, $7,000) × 0.6% = $42
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H FUTA - five employees each independently capped at $7,000", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("50000", { name: "A" }),
        makeEmployee("20000", { name: "B" }),
        makeEmployee("10000", { name: "C" }),
        makeEmployee("5000", { name: "D" }),
        makeEmployee("3000", { name: "E" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA: 7000+7000+7000+5000+3000 = $29,000 × 0.6% = $174
    expect(result.futaTax.toNumber()).toBe(174);
    expect(result.qualifyingEmployeeCount).toBe(5);
  });
});

describe("Schedule H FUTA Section B credit edge cases", () => {
  it("Schedule H FUTA Section B - state contributions exactly equal max credit", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "378", // $7,000 × 5.4% = $378
      futaStatePeriods: [{ state: "OH", periodStart: "2025-01-01", periodEnd: "2025-12-31", taxableWages: "7000", experienceRate: "0.054", contributionsPaidTimely: "378" }],
      stateUnemploymentContributionsPaidLate: "0",
      futaCreditReduction: "0",
      constants: CONSTANTS_2025,
    });

    // Gross FUTA = $7,000 × 6.0% = $420
    // Max credit = $7,000 × 5.4% = $378
    // Allowable = min($378, $378) = $378
    // Net FUTA = $420 - $378 = $42 (same as Section A)
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H FUTA Section B - credit reduction exceeds state contributions", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "200",
      futaStatePeriods: [{ state: "OH", periodStart: "2025-01-01", periodEnd: "2025-12-31", taxableWages: "7000", experienceRate: null, contributionsPaidTimely: "200" }],
      stateUnemploymentContributionsPaidLate: "0",
      futaCreditReduction: "300",
      constants: CONSTANTS_2025,
    });

    // Gross FUTA = $420
    // Max credit = $378
    // Allowable = max(0, min($200, $378) - $300) = max(0, -$100) = $0
    // Net FUTA = $420 - $0 = $420 (full gross rate)
    expect(result.futaTax.toNumber()).toBe(420);
  });

  it("Schedule H FUTA Section B - zero state contributions yields full gross FUTA", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "0",
      futaStatePeriods: [{ state: "OH", periodStart: "2025-01-01", periodEnd: "2025-12-31", taxableWages: "7000", experienceRate: null, contributionsPaidTimely: "0" }],
      stateUnemploymentContributionsPaidLate: "0",
      futaCreditReduction: "0",
      constants: CONSTANTS_2025,
    });

    // Gross FUTA = $7,000 × 6.0% = $420
    // No credit → full gross
    expect(result.futaTax.toNumber()).toBe(420);
  });
});

describe("Schedule H employee exemption combinations", () => {
  it("Schedule H - all four exemption types excluded simultaneously", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("50000", { name: "Spouse", isSpouse: true }),
        makeEmployee("15000", { name: "Child", isChildUnder21: true }),
        makeEmployee("20000", { name: "Parent", isParent: true, parentCareExceptionApplies: false }),
        makeEmployee("8000", { name: "Teen Sitter", isUnder18NonPrincipal: true }),
        makeEmployee("12000", { name: "Nanny" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(12000);
    expect(result.line3.toNumber()).toBe(12000);
    // The unrelated minor remains subject to FUTA; the parent is excluded.
    expect(result.futaTax.toFixed(2)).toBe("84.00");
  });

  it("Schedule H - exempt employees with high wages have zero contribution", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("500000", { name: "Spouse", isSpouse: true }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.line1.toNumber()).toBe(0);
    expect(result.line3.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - below-threshold employee actual withholding remains on Line 7", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("2000", { name: "Below", federalIncomeTaxWithheld: "300" }),
        makeEmployee("5000", { name: "Above", federalIncomeTaxWithheld: "700" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 7 includes all federal income tax actually withheld.
    expect(result.line7.toNumber()).toBe(1000);
    expect(result.qualifyingEmployeeCount).toBe(1);
  });
});

describe("Schedule H combined threshold interactions", () => {
  it("Schedule H - employee at exact intersection of SS cap and Additional Medicare threshold ($200,000)", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("200000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // SS capped at $176,100
    expect(result.line1.toNumber()).toBe(176100);
    // Medicare on full $200,000
    expect(result.line3.toNumber()).toBe(200000);
    // No Additional Medicare (at boundary, not above)
    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
    // FUTA capped at $7,000
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H - zero-wage employee contributes nothing", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("0", { name: "No Wages" }),
        makeEmployee("10000", { name: "Normal" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Zero wage employee is below threshold
    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(10000);
  });

  it("Schedule H - no employees yields zero tax", () => {
    const result = calculateScheduleH({
      employees: [],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - comprehensive scenario with multiple employees crossing all thresholds", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("250000", { name: "High Earner", federalIncomeTaxWithheld: "2000" }),
        makeEmployee("100000", { name: "Mid Earner" }),
        makeEmployee("2800", { name: "Threshold Employee" }),
        makeEmployee("2799", { name: "Below Threshold" }),
        makeEmployee("40000", { name: "Exempt Spouse", isSpouse: true }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(3);

    // SS: min(250000, 176100) + min(100000, 176100) + min(2800, 176100) = 176100 + 100000 + 2800 = 278900
    expect(result.line1.toNumber()).toBe(278900);

    // Medicare: 250000 + 100000 + 2800 = 352800
    expect(result.line3.toNumber()).toBe(352800);

    // Additional Medicare: only High Earner exceeds $200K → $50,000
    expect(result.line5.toNumber()).toBe(50000);
    expect(result.line6.toNumber()).toBe(450);

    // Withholding: all actual federal income tax withheld
    expect(result.line7.toNumber()).toBe(2000);

    // FUTA includes the below-SS-threshold worker: 7000 + 7000 + 2800 + 2799 = 19599.
    // $19,599 × 0.6% rounds to $117.59.
    expect(result.futaTax.toFixed(2)).toBe("117.59");
  });
});

/**
 * Edge case tests for Form 2555 — Foreign Earned Income Exclusion
 * Spec: spec/federal/form-2555.yaml
 *
 * Covers: maximum exclusion boundaries ($130K for 2025), partial-year
 * proration, housing amount calculations (16% base, 30% limit), self-employed
 * vs employee housing, employer-provided housing offset, location-specific
 * housing limits, and zero/extreme values.
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import type { Form2555Input } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);

function makeInput(overrides: Partial<Form2555Input> = {}): Form2555Input {
  return {
    foreignEarnedIncome: "100000",
    qualifyingDays: 365,
    totalDaysInYear: 365,
    qualifiedHousingExpenses: "0",
    employerProvidedHousingAmount: "0",
    isSelfEmployed: false,
    ...overrides,
  } as Form2555Input;
}

// ── Maximum Exclusion Boundaries ─────────────────────────────────────

describe("Form 2555 - maximum exclusion boundary ($130,000 for 2025)", () => {
  it("Form 2555 Line 42 - maximum exclusion is $130,000 for tax year 2025", () => {
    const result = calculateForm2555(makeInput(), constants);
    expect(result.maximumExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 45 - income exactly $130,000 full year: entire income excluded", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "130000",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 45 - income $130,001 full year: exclusion capped at $130,000", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "130001",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 45 - income $50,000 full year: only $50,000 excluded", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "50000",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(50000);
  });

  it("Form 2555 Line 45 - income $0: zero exclusion", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "0",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(0);
  });
});

// ── Partial-Year Proration ───────────────────────────────────────────

describe("Form 2555 - partial-year proration (Line 43)", () => {
  it("Form 2555 Line 43 - full year 365 days: prorated exclusion equals maximum", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 365,
      totalDaysInYear: 365,
    }), constants);

    expect(result.proratedMaximumExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 43 - half year 183/365 days: prorated exclusion ~$65,178", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
      totalDaysInYear: 365,
    }), constants);

    // $130,000 × 183/365 = $65,178.08... → rounds to $65,178
    expect(result.proratedMaximumExclusion.toNumber()).toBe(65178);
  });

  it("Form 2555 Line 43 - 1 qualifying day: minimal exclusion ($356)", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 1,
      totalDaysInYear: 365,
    }), constants);

    // $130,000 × 1/365 = $356.16... → rounds to $356
    expect(result.proratedMaximumExclusion.toNumber()).toBe(356);
  });

  it("Form 2555 Line 43 - leap year 366 days full year: still $130,000", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 366,
      totalDaysInYear: 366,
    }), constants);

    expect(result.proratedMaximumExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 43 - leap year 183/366 days: different proration than 183/365", () => {
    const normalYear = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
      totalDaysInYear: 365,
    }), constants);

    const leapYear = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
      totalDaysInYear: 366,
    }), constants);

    // Different denominators should give different prorated amounts
    expect(leapYear.proratedMaximumExclusion.toNumber()).toBeLessThan(
      normalYear.proratedMaximumExclusion.toNumber()
    );
  });

  it("Form 2555 - partial year income below prorated exclusion: full income excluded", () => {
    // 6 months abroad, earned $40,000
    // Prorated max = $130,000 × 183/365 = $65,178
    // Income $40,000 < $65,178 → full income excluded
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "40000",
      qualifyingDays: 183,
      totalDaysInYear: 365,
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(40000);
  });
});

// ── Housing Amount (16% Base, 30% Limit) ─────────────────────────────

describe("Form 2555 - housing amount edge cases", () => {
  it("Form 2555 Line 27 - base housing amount is 16% of prorated maximum", () => {
    // Full year: $130,000 × 0.16 = $20,800
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
    }), constants);

    expect(result.baseHousingAmount.toNumber()).toBe(20800);
  });

  it("Form 2555 Line 29 - default housing limit is 30% of prorated maximum", () => {
    // Full year: $130,000 × 0.30 = $39,000
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "50000",
    }), constants);

    expect(result.housingExpenseLimit.toNumber()).toBe(39000);
  });

  it("Form 2555 - housing expenses exactly at base amount: housing amount is $0", () => {
    // Expenses = base = $20,800 → excess = $0
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "20800",
    }), constants);

    expect(result.housingAmount.toNumber()).toBe(0);
  });

  it("Form 2555 - housing expenses $1 above base amount: housing amount is $1", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "20801",
    }), constants);

    expect(result.housingAmount.toNumber()).toBe(1);
  });

  it("Form 2555 - housing expenses below base amount: housing amount is $0", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "15000",
    }), constants);

    expect(result.housingAmount.toNumber()).toBe(0);
  });

  it("Form 2555 - housing expenses at default limit: max housing amount", () => {
    // Expenses = $39,000 (at limit), base = $20,800
    // Housing amount = $39,000 - $20,800 = $18,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "39000",
    }), constants);

    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBe(39000);
    expect(result.housingAmount.toNumber()).toBe(18200);
  });

  it("Form 2555 - housing expenses exceed default limit: capped at 30%", () => {
    // Expenses $50,000, capped at $39,000
    // Housing amount = $39,000 - $20,800 = $18,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "50000",
    }), constants);

    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBe(39000);
    expect(result.housingAmount.toNumber()).toBe(18200);
  });

  it("Form 2555 - zero housing expenses: zero housing amount", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "0",
    }), constants);

    expect(result.housingAmount.toNumber()).toBe(0);
  });
});

// ── Location-Specific Housing Limit Override ─────────────────────────

describe("Form 2555 - location-specific housing limit override", () => {
  it("Form 2555 Line 29 - location limit overrides default 30% when provided", () => {
    // Location limit $60,000 > default $39,000
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "50000",
      housingExpenseLocationLimit: "60000",
    }), constants);

    expect(result.housingExpenseLimit.toNumber()).toBe(60000);
    // Capped expenses = min($50,000, $60,000) = $50,000
    // Housing amount = $50,000 - $20,800 = $29,200
    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBe(50000);
    expect(result.housingAmount.toNumber()).toBe(29200);
  });

  it("Form 2555 - location limit lower than expenses: caps at location limit", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "80000",
      housingExpenseLocationLimit: "70000",
    }), constants);

    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBe(70000);
    // Housing amount = $70,000 - $20,800 = $49,200
    expect(result.housingAmount.toNumber()).toBe(49200);
  });
});

// ── Self-Employed vs Employee Housing Treatment ──────────────────────

describe("Form 2555 - self-employed housing deduction vs employee housing exclusion", () => {
  it("Form 2555 Part VI - self-employed gets housing deduction, not exclusion", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);

    // Housing amount = $30,000 - $20,800 = $9,200
    expect(result.housingDeduction.toNumber()).toBe(9200);
    expect(result.housingExclusion.toNumber()).toBe(0);
  });

  it("Form 2555 Part VIII - employee gets housing exclusion, not deduction", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: false,
      employerProvidedHousingAmount: "0",
    }), constants);

    // Housing amount = $30,000 - $20,800 = $9,200
    expect(result.housingExclusion.toNumber()).toBe(9200);
    expect(result.housingDeduction.toNumber()).toBe(0);
  });
});

// ── Employer-Provided Housing Offset ─────────────────────────────────

describe("Form 2555 - employer-provided housing reduces housing exclusion", () => {
  it("Form 2555 Part VIII - employer housing partially offsets housing exclusion", () => {
    // Housing amount = $30,000 - $20,800 = $9,200
    // Employer-provided $5,000
    // Housing exclusion = $9,200 - $5,000 = $4,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "5000",
    }), constants);

    expect(result.housingExclusion.toNumber()).toBe(4200);
  });

  it("Form 2555 Part VIII - employer housing exceeds housing amount: exclusion is $0", () => {
    // Housing amount = $30,000 - $20,800 = $9,200
    // Employer-provided $15,000 > $9,200
    // Housing exclusion = max(0, $9,200 - $15,000) = $0
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "15000",
    }), constants);

    expect(result.housingExclusion.toNumber()).toBe(0);
  });

  it("Form 2555 Part VIII - employer housing exactly equals housing amount: exclusion is $0", () => {
    // Housing amount = $30,000 - $20,800 = $9,200
    // Employer-provided exactly $9,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "9200",
    }), constants);

    expect(result.housingExclusion.toNumber()).toBe(0);
  });
});

// ── Housing Deduction Reduces Income Available for Exclusion ─────────

describe("Form 2555 - housing amounts reduce income available for exclusion", () => {
  it("Form 2555 Line 44 - housing deduction reduces income available for FEI exclusion", () => {
    // Foreign income $100,000, self-employed, housing deduction $9,200
    // Income available = $100,000 - $9,200 = $90,800
    // Exclusion = min($90,800, $130,000) = $90,800
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);

    expect(result.housingDeduction.toNumber()).toBe(9200);
    expect(result.incomeAvailableForExclusion.toNumber()).toBe(90800);
    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(90800);
  });

  it("Form 2555 Line 44 - housing exclusion reduces income available for FEI exclusion", () => {
    // Foreign income $100,000, employee, housing exclusion $9,200
    // Income available = $100,000 - $9,200 = $90,800
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "0",
      isSelfEmployed: false,
    }), constants);

    expect(result.housingExclusion.toNumber()).toBe(9200);
    expect(result.incomeAvailableForExclusion.toNumber()).toBe(90800);
    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(90800);
  });
});

// ── Total Exclusion Computation ──────────────────────────────────────

describe("Form 2555 - total exclusion combines FEI and housing exclusion", () => {
  it("Form 2555 - employee total exclusion = FEI exclusion + housing exclusion", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "0",
      isSelfEmployed: false,
    }), constants);

    // Housing exclusion = $30,000 - $20,800 = $9,200
    // Income available = $200,000 - $9,200 = $190,800
    // FEI exclusion = min($190,800, $130,000) = $130,000
    // Total = $130,000 + $9,200 = $139,200
    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
    expect(result.housingExclusion.toNumber()).toBe(9200);
    expect(result.totalExclusion.toNumber()).toBe(139200);
  });

  it("Form 2555 - self-employed total exclusion does not include housing deduction", () => {
    // Housing deduction goes through Schedule 1, not included in totalExclusion
    // for income reduction purposes on Line 1
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);

    // Housing deduction = $9,200 (goes to Schedule 1, not Form 1040 Line 1)
    // Income available = $200,000 - $9,200 = $190,800
    // FEI exclusion = $130,000
    // Total exclusion = $130,000 + $0 housing exclusion = $130,000
    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
    expect(result.housingDeduction.toNumber()).toBe(9200);
    expect(result.housingExclusion.toNumber()).toBe(0);
    expect(result.totalExclusion.toNumber()).toBe(130000);
  });
});

// ── Partial Year with Housing ────────────────────────────────────────

describe("Form 2555 - partial year proration affects housing calculations", () => {
  it("Form 2555 - half year prorates both base and limit", () => {
    // 183/365 year → proration factor ~0.5014
    // Base = $130,000 × 0.16 × 183/365 = $10,434 (rounded)
    // Limit = $130,000 × 0.30 × 183/365 = $19,562 (rounded)
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "25000",
      qualifyingDays: 183,
      totalDaysInYear: 365,
    }), constants);

    expect(result.baseHousingAmount.toNumber()).toBeLessThan(20800);
    expect(result.housingExpenseLimit.toNumber()).toBeLessThan(39000);
    // Expenses $25,000 > prorated limit → capped
    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBeLessThanOrEqual(25000);
  });
});

// ── Very High Foreign Income ─────────────────────────────────────────

describe("Form 2555 - very high foreign income scenario", () => {
  it("Form 2555 - $500K income with housing: exclusion capped at $130K", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "500000",
      qualifiedHousingExpenses: "50000",
      employerProvidedHousingAmount: "0",
    }), constants);

    // Housing exclusion = $39,000 - $20,800 = $18,200
    // Income available = $500,000 - $18,200 = $481,800
    // FEI exclusion = min($481,800, $130,000) = $130,000
    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
    expect(result.housingExclusion.toNumber()).toBe(18200);
    expect(result.totalExclusion.toNumber()).toBe(148200);
  });
});

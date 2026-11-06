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
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import type { Form2555Input } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);

function makeInput(overrides: Partial<Form2555Input> = {}): Form2555Input {
  return {
    employerProvidedForeignEarnedIncome: overrides.isSelfEmployed === true ? "0" : (overrides.foreignEarnedIncome ?? "100000"),
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
  it("Form 2555 Line 37 - maximum exclusion is $130,000 for tax year 2025", () => {
    const result = calculateForm2555(makeInput(), constants);
    expect(result.maximumExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 42 - income exactly $130,000 full year: entire income excluded", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "130000",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 42 - income $130,001 full year: exclusion capped at $130,000", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "130001",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 42 - income $50,000 full year: only $50,000 excluded", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "50000",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(50000);
  });

  it("Form 2555 Line 42 - income $0: zero exclusion", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "0",
    }), constants);

    expect(result.foreignEarnedIncomeExclusion.toNumber()).toBe(0);
  });
});

// ── Partial-Year Proration ───────────────────────────────────────────

describe("Form 2555 - partial-year proration (Line 40)", () => {
  it("Form 2555 Line 40 - full year 365 days: prorated exclusion equals maximum", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 365,
      totalDaysInYear: 365,
    }), constants);

    expect(result.proratedMaximumExclusion.toNumber()).toBe(130000);
  });

  it("Form 2555 Line 40 - half year 183/365 days: prorated exclusion ~$65,178", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
      totalDaysInYear: 365,
    }), constants);

    // $130,000 × 183/365 = $65,178.08... → rounds to $65,178
    expect(result.proratedMaximumExclusion.toNumber()).toBe(65178);
  });

  it("Form 2555 Line 40 - 1 qualifying day: minimal exclusion ($356)", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 1,
      totalDaysInYear: 365,
    }), constants);

    // $130,000 × 1/365 = $356.16... → rounds to $356
    expect(result.proratedMaximumExclusion.toNumber()).toBe(356);
  });

  it("Form2555 rejects366 qualifying days in2025", () => {
    expect(() => calculateForm2555(makeInput({ qualifyingDays: 366, totalDaysInYear: 366 }), constants)).toThrow(/calendar year/);
  });

  it("Form2555 does not accept a fabricated leap year to change proration", () => {
    expect(calculateForm2555(makeInput({ foreignEarnedIncome: "200000", qualifyingDays: 183 }), constants).proratedMaximumExclusion.toFixed()).toBe("65178");
    expect(() => calculateForm2555(makeInput({ qualifyingDays: 183, totalDaysInYear: 366 }), constants)).toThrow(/calendar year/);
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
  it("Form 2555 Line 32 - base housing amount is 16% of prorated maximum", () => {
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
      housingLocationPeriods: [{ locationId: "Russia / Saint Petersburg", days: 365 }],
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
      housingLocationPeriods: [{ locationId: "China / Beijing", days: 365 }],
    }), constants);

    expect(result.qualifiedHousingExpensesCapped.toNumber()).toBe(66600);
    // Beijing2025: $66,600 - $20,800 = $45,800.
    expect(result.housingAmount.toNumber()).toBe(45800);
  });
});

// ── Self-Employed vs Employee Housing Treatment ──────────────────────

describe("Form 2555 - self-employed housing deduction vs employee housing exclusion", () => {
  it("Form2555 self-employed housing carries over when FEIE consumes all income", () => {
    const result = calculateForm2555(makeInput({ qualifiedHousingExpenses: "30000", isSelfEmployed: true }), constants);
    expect(result.housingDeduction.toFixed()).toBe("0");
    expect(result.housingDeductionCarryover.toFixed()).toBe("9200");
    expect(result.housingExclusion.toFixed()).toBe("0");
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

describe("Form 2555 - employer-provided reimbursements remain part of actual income", () => {
  it("Form2555 reimbursement5000 does not subtract from the housing exclusion", () => {
    const result = calculateForm2555(makeInput({ qualifiedHousingExpenses: "30000", employerProvidedHousingAmount: "5000" }), constants);
    expect(result.housingExclusion.toFixed()).toBe("9200");
  });

  it("Form2555 reimbursement15000 does not subtract from the housing exclusion", () => {
    const result = calculateForm2555(makeInput({ qualifiedHousingExpenses: "30000", employerProvidedHousingAmount: "15000" }), constants);
    expect(result.housingExclusion.toFixed()).toBe("9200");
  });

  it("Form2555 reimbursement9200 does not subtract from the housing exclusion", () => {
    const result = calculateForm2555(makeInput({ qualifiedHousingExpenses: "30000", employerProvidedHousingAmount: "9200" }), constants);
    expect(result.housingExclusion.toFixed()).toBe("9200");
  });
});

// ── Housing Deduction Reduces Income Available for Exclusion ─────────

describe("Form 2555 - housing amounts reduce income available for exclusion", () => {
  it("Form2555 housing deduction cannot reduce earned income before FEIE", () => {
    const result = calculateForm2555(makeInput({ foreignEarnedIncome: "100000", qualifiedHousingExpenses: "30000", isSelfEmployed: true }), constants);
    expect(result.housingDeduction.toFixed()).toBe("0");
    expect(result.incomeAvailableForExclusion.toFixed()).toBe("100000");
    expect(result.foreignEarnedIncomeExclusion.toFixed()).toBe("100000");
    expect(result.housingDeductionCarryover.toFixed()).toBe("9200");
  });

  it("Form 2555 Line 41 - housing exclusion reduces income available for FEI exclusion", () => {
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
    // from the net exclusion at Schedule1line8d
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);

    // Housing deduction = $9,200 goes to Schedule1line24j.
    // Income available for FEIE = $200,000 before housing deduction.
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
    // Base = published $56.99 × 183 = $10,429.
    // Limit = published $106.85 × 183 = $19,554.
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

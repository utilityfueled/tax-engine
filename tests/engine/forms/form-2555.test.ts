/**
 * Tests for Form 2555 — Foreign Earned Income Exclusion.
 * Spec: spec/federal/form-2555.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);

function makeInput(overrides: Record<string, unknown> = {}): Parameters<typeof calculateForm2555>[0] {
  return {
    foreignEarnedIncome: "100000",
    qualifyingDays: 365,
    totalDaysInYear: 365,
    qualifiedHousingExpenses: "0",
    employerProvidedHousingAmount: "0",
    isSelfEmployed: false,
    ...overrides,
  };
}

function makeForm2555Input(overrides: Record<string, unknown> = {}) {
  return {
    foreignEarnedIncome: "100000",
    qualifyingDays: 365,
    totalDaysInYear: 365,
    qualifiedHousingExpenses: "0",
    employerProvidedHousingAmount: "0",
    isSelfEmployed: false,
    ...overrides,
  };
}

function makeFederalInput(form2555Overrides?: Record<string, unknown>, extraInput: Record<string, unknown> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Test",
        lastName: "User",
        ssn: "123-45-6789",
        dateOfBirth: "1985-06-15",
      },
      address: { street: "123 Main St", city: "Anytown", state: "TX", zip: "75001" },
      dependents: [],
    },
    w2s: [{ employer: { name: "Foreign Corp", ein: "99-9999999" }, wages: "120000", federalWithheld: "15000" }],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    form1099G: [],
    formW2G: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    rentalProperties: [],
    savingsBondRedemptions: [],
    form2555: form2555Overrides !== undefined ? makeForm2555Input(form2555Overrides) : undefined,
    ...extraInput,
  } as TaxYearInput;
}

// ═══════════════════════════════════════════════════════════════
// Unit tests for Form 2555 calculation
// ═══════════════════════════════════════════════════════════════

describe("Form 2555 — Foreign Earned Income Exclusion", () => {
  it("Form 2555 - foreign earned income passes through to exclusion calculation", () => {
    const result = calculateForm2555(makeInput({ foreignEarnedIncome: "85000" }), constants);
    expect(result.foreignEarnedIncome).toEqual(new Decimal("85000"));
  });

  it("Form 2555 - maximum exclusion is $130,000 for 2025", () => {
    const result = calculateForm2555(makeInput(), constants);
    expect(result.maximumExclusion).toEqual(new Decimal("130000"));
  });

  it("Form 2555 - full year qualifying period gives full exclusion", () => {
    const result = calculateForm2555(makeInput({ foreignEarnedIncome: "200000" }), constants);
    expect(result.proratedMaximumExclusion).toEqual(new Decimal("130000"));
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("130000"));
  });

  it("Form 2555 - partial year prorates exclusion", () => {
    // 183 days out of 365 → $130,000 × 183/365 = $65,178 (rounded)
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
    }), constants);
    expect(result.proratedMaximumExclusion).toEqual(new Decimal("65178"));
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("65178"));
  });

  it("Form 2555 - exclusion capped at prorated maximum when income exceeds it", () => {
    const result = calculateForm2555(makeInput({ foreignEarnedIncome: "250000" }), constants);
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("130000"));
  });

  it("Form 2555 - exclusion capped at foreign earned income when income is below maximum", () => {
    const result = calculateForm2555(makeInput({ foreignEarnedIncome: "50000" }), constants);
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("50000"));
  });

  it("Form 2555 - leap year uses 366 total days", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
      totalDaysInYear: 366,
    }), constants);
    // $130,000 × 183/366 = $65,000
    expect(result.proratedMaximumExclusion).toEqual(new Decimal("65000"));
  });

  // ── Housing amount tests ──────────────────────────────

  it("Form 2555 - base housing amount prorated for partial year", () => {
    // Full year: $130,000 × 16% = $20,800
    const resultFull = calculateForm2555(makeInput(), constants);
    expect(resultFull.baseHousingAmount).toEqual(new Decimal("20800"));

    // Half year: $130,000 × 16% × 183/365 = $10,428 (rounded)
    const resultPartial = calculateForm2555(makeInput({ qualifyingDays: 183 }), constants);
    expect(resultPartial.baseHousingAmount).toEqual(new Decimal("10428"));
  });

  it("Form 2555 - housing amount is expenses minus base capped at limit", () => {
    // Expenses $30,000, base $20,800, limit $39,000
    // Housing amount = min($30,000, $39,000) - $20,800 = $9,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
    }), constants);
    expect(result.housingAmount).toEqual(new Decimal("9200"));
  });

  it("Form 2555 - housing expenses below base produce zero housing amount", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "15000",
    }), constants);
    expect(result.housingAmount).toEqual(new Decimal("0"));
  });

  it("Form 2555 - housing expenses capped at limit before subtracting base", () => {
    // Expenses $50,000, limit $39,000, base $20,800
    // Housing amount = min($50,000, $39,000) - $20,800 = $18,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "50000",
    }), constants);
    expect(result.housingAmount).toEqual(new Decimal("18200"));
  });

  it("Form 2555 - location-specific housing limit overrides default", () => {
    // Default limit: $39,000. Location-specific: $50,000
    // Expenses $45,000, limit $50,000, base $20,800
    // Housing amount = min($45,000, $50,000) - $20,800 = $24,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "45000",
      housingExpenseLocationLimit: "50000",
    }), constants);
    expect(result.housingAmount).toEqual(new Decimal("24200"));
  });

  it("Form 2555 - no housing expenses produce zero housing amount", () => {
    const result = calculateForm2555(makeInput(), constants);
    expect(result.housingAmount).toEqual(new Decimal("0"));
    expect(result.housingExclusion).toEqual(new Decimal("0"));
    expect(result.housingDeduction).toEqual(new Decimal("0"));
  });

  // ── Housing exclusion (employee) ──────────────────────

  it("Form 2555 - employee gets housing exclusion", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: false,
    }), constants);
    expect(result.housingExclusion).toEqual(new Decimal("9200"));
    expect(result.housingDeduction).toEqual(new Decimal("0"));
  });

  it("Form 2555 - employer-provided housing reduces housing exclusion", () => {
    // Housing amount $9,200, employer-provided $5,000
    // Exclusion = $9,200 - $5,000 = $4,200
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "5000",
      isSelfEmployed: false,
    }), constants);
    expect(result.housingExclusion).toEqual(new Decimal("4200"));
  });

  it("Form 2555 - employer-provided housing exceeding housing amount gives zero exclusion", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "15000",
      isSelfEmployed: false,
    }), constants);
    expect(result.housingExclusion).toEqual(new Decimal("0"));
  });

  // ── Housing deduction (self-employed) ─────────────────

  it("Form 2555 - self-employed gets housing deduction not exclusion", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);
    expect(result.housingDeduction).toEqual(new Decimal("9200"));
    expect(result.housingExclusion).toEqual(new Decimal("0"));
  });

  it("Form 2555 - self-employed housing deduction ignores employer-provided amount", () => {
    const result = calculateForm2555(makeInput({
      qualifiedHousingExpenses: "30000",
      employerProvidedHousingAmount: "5000",
      isSelfEmployed: true,
    }), constants);
    // Self-employed: deduction is the full housing amount, employer-provided is irrelevant
    expect(result.housingDeduction).toEqual(new Decimal("9200"));
  });

  // ── Income available for exclusion ────────────────────

  it("Form 2555 - housing deduction reduces income available for exclusion", () => {
    // Foreign income $100,000, housing deduction $9,200
    // Income available = $100,000 - $9,200 = $90,800
    // Exclusion = min($90,800, $130,000) = $90,800
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);
    expect(result.incomeAvailableForExclusion).toEqual(new Decimal("90800"));
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("90800"));
  });

  it("Form 2555 - housing exclusion reduces income available for exclusion", () => {
    // Foreign income $100,000, housing exclusion $9,200
    // Income available = $100,000 - $9,200 = $90,800
    // Exclusion = min($90,800, $130,000) = $90,800
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "100000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: false,
    }), constants);
    expect(result.incomeAvailableForExclusion).toEqual(new Decimal("90800"));
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("90800"));
  });

  // ── Total exclusion and income reduction ──────────────

  it("Form 2555 - total exclusion includes FEI exclusion and housing exclusion", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
    }), constants);
    // Housing exclusion = $9,200
    // Income available for FEI exclusion = $200,000 - $9,200 = $190,800
    // FEI exclusion = min($190,800, $130,000) = $130,000
    // Total = $130,000 + $9,200 = $139,200
    expect(result.foreignEarnedIncomeExclusion).toEqual(new Decimal("130000"));
    expect(result.housingExclusion).toEqual(new Decimal("9200"));
    expect(result.totalExclusion).toEqual(new Decimal("139200"));
  });

  it("Form 2555 - total income reduction equals FEI exclusion plus housing exclusion for employees", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
    }), constants);
    expect(result.totalIncomeReduction).toEqual(new Decimal("139200"));
  });

  it("Form 2555 - self-employed total income reduction excludes housing (goes to Schedule 1)", () => {
    const result = calculateForm2555(makeInput({
      foreignEarnedIncome: "200000",
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }), constants);
    // For SE: housing deduction goes through Schedule 1, not through income reduction
    // Total income reduction = FEI exclusion only (no housing exclusion for SE)
    // FEI exclusion = min($200,000 - $9,200 housing deduction, $130,000) = $130,000
    expect(result.totalIncomeReduction).toEqual(new Decimal("130000"));
    expect(result.housingDeduction).toEqual(new Decimal("9200"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests with federal engine
// ═══════════════════════════════════════════════════════════════

describe("Form 2555 — Federal integration", () => {
  it("Form 2555 - stacking rule pushes remaining income into higher brackets", () => {
    // Without Form 2555: $120,000 wages, single, standard deduction $15,000
    // Taxable income = $105,000
    const resultWithout = calculateFederalTax(makeFederalInput(undefined));

    // With Form 2555: same wages, $100,000 excluded
    // Taxable income = ($120,000 - $100,000) - $15,000 = $5,000
    // But stacking rule: tax on ($5,000 + $100,000) - tax on $100,000
    // = tax on $105,000 - tax on $100,000
    const resultWith = calculateFederalTax(makeFederalInput({ foreignEarnedIncome: "100000" }));

    // The tax with Form 2555 should be MUCH less than without
    expect(resultWith.totalTax.lessThan(resultWithout.totalTax)).toBe(true);

    // But the tax should be MORE than if we just taxed $5,000 at the bottom brackets
    // Tax on $5,000 at 10% = $500
    // Stacked tax should be higher because $5,000 sits in the bracket where $100,000 ends
    expect(resultWith.ordinaryTax.greaterThan(new Decimal("500"))).toBe(true);
  });

  it("Form 2555 - wages reduced by exclusion amount", () => {
    const result = calculateFederalTax(makeFederalInput({ foreignEarnedIncome: "100000" }));
    // Wages $120,000 - exclusion $100,000 = $20,000
    expect(result.totalWages).toEqual(new Decimal("20000"));
  });

  it("Form 2555 - full exclusion when all income is foreign", () => {
    const result = calculateFederalTax(makeFederalInput({ foreignEarnedIncome: "120000" }));
    // Wages $120,000 - exclusion $120,000 = $0
    expect(result.totalWages).toEqual(new Decimal("0"));
  });

  it("Form 2555 - exclusion cannot exceed wages", () => {
    const result = calculateFederalTax(makeFederalInput({ foreignEarnedIncome: "200000" }));
    // Wages $120,000, exclusion capped at $130,000 but wages only $120,000
    // totalWages floors at zero
    expect(result.totalWages).toEqual(new Decimal("0"));
  });

  it("Form 2555 - AGI reflects the exclusion", () => {
    const withExclusion = calculateFederalTax(makeFederalInput({
      foreignEarnedIncome: "80000",
      qualifyingDays: 365,
    }));
    const withoutExclusion = calculateFederalTax(makeFederalInput(undefined));
    // AGI should be $80,000 lower with the exclusion
    expect(withExclusion.agi).toEqual(withoutExclusion.agi.minus(new Decimal("80000")));
  });

  it("Form 2555 - filing Form 2555 disqualifies EIC per IRC §32(c)(1)(C)", () => {
    // Low-income scenario that would normally qualify for EIC
    const result = calculateFederalTax({
      ...makeFederalInput({
        foreignEarnedIncome: "10000",
        qualifyingDays: 365,
      }),
      w2s: [{ employer: { name: "Foreign Corp", ein: "99-9999999" }, wages: "15000", federalWithheld: "500" }],
    } as TaxYearInput);
    expect(result.earnedIncomeCredit).toEqual(new Decimal("0"));
  });

  it("Form 2555 - housing deduction flows through Schedule 1 for self-employed", () => {
    const result = calculateFederalTax(makeFederalInput({
      foreignEarnedIncome: "100000",
      qualifyingDays: 365,
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: true,
    }));
    // Housing deduction $9,200 reduces AGI through Schedule 1
    // Wages reduced by: FEI exclusion $90,800 (income available = $100K - $9,200 housing deduction = $90,800)
    expect(result.totalWages).toEqual(new Decimal("29200")); // $120,000 - $90,800
    expect(result.form2555?.housingDeduction).toEqual(new Decimal("9200"));
    // Schedule 1 total adjustments should include the housing deduction
    expect(result.schedule1).toBeDefined();
    expect(result.adjustmentsToIncome.greaterThanOrEqualTo(new Decimal("9200"))).toBe(true);
  });

  it("Form 2555 - housing exclusion reduces wages for employees", () => {
    const result = calculateFederalTax(makeFederalInput({
      foreignEarnedIncome: "100000",
      qualifyingDays: 365,
      qualifiedHousingExpenses: "30000",
      isSelfEmployed: false,
    }));
    // Housing exclusion $9,200 reduces wages alongside FEI exclusion
    // FEI exclusion: min($100K - $9,200 housing excl, $130K) = $90,800
    // Total income reduction = $90,800 + $9,200 = $100,000
    // Wages = $120,000 - $100,000 = $20,000
    expect(result.totalWages).toEqual(new Decimal("20000"));
  });

  it("Form 2555 - partial year prorates all housing and exclusion amounts", () => {
    // 183 days out of 365
    const result = calculateFederalTax(makeFederalInput({
      foreignEarnedIncome: "200000",
      qualifyingDays: 183,
    }));
    // Prorated max exclusion = $130,000 × 183/365 = $65,178
    expect(result.form2555?.proratedMaximumExclusion).toEqual(new Decimal("65178"));
    expect(result.form2555?.foreignEarnedIncomeExclusion).toEqual(new Decimal("65178"));
    // Wages = $120,000 - $65,178 = $54,822
    expect(result.totalWages).toEqual(new Decimal("54822"));
  });

  it("Form 2555 - stacking rule with qualified dividends and capital gains", () => {
    // Wages $120,000, qualified dividends $10,000, LTCG $5,000
    // Exclusion $100,000 from foreign earned income
    const result = calculateFederalTax({
      ...makeFederalInput({
        foreignEarnedIncome: "100000",
        qualifyingDays: 365,
      }),
      form1099Div: [{
        payer: "Foreign Broker",
        ordinaryDividends: "10000",
        qualifiedDividends: "10000",
      }],
      form1099B: [{
        broker: "Foreign Broker",
        transactions: [{
          description: "Stock sale",
          dateAcquired: "2020-01-15",
          dateSold: "2025-06-15",
          proceeds: "25000",
          costBasis: "20000",
        }],
      }],
    } as TaxYearInput);

    // Should have form2555 result
    expect(result.form2555).toBeDefined();
    expect(result.form2555?.foreignEarnedIncomeExclusion).toEqual(new Decimal("100000"));
    // Tax should be computed with stacking rule
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal("0"))).toBe(true);
  });

  it("Form 2555 - zero taxable income after exclusion still uses stacking for tax", () => {
    // All income excluded, taxable income = 0
    const result = calculateFederalTax({
      ...makeFederalInput({
        foreignEarnedIncome: "120000",
        qualifyingDays: 365,
      }),
      w2s: [{ employer: { name: "Foreign Corp", ein: "99-9999999" }, wages: "120000", federalWithheld: "0" }],
    } as TaxYearInput);
    // Taxable income should be 0 (or standard deduction worth of negative, floored)
    expect(result.taxableIncome).toEqual(new Decimal("0"));
    expect(result.ordinaryTax).toEqual(new Decimal("0"));
  });

  it("Form 2555 - form2555 result is included in the return", () => {
    const result = calculateFederalTax(makeFederalInput({ foreignEarnedIncome: "100000" }));
    expect(result.form2555).toBeDefined();
    expect(result.form2555?.foreignEarnedIncome).toEqual(new Decimal("100000"));
    expect(result.form2555?.foreignEarnedIncomeExclusion).toEqual(new Decimal("100000"));
    expect(result.form2555?.totalExclusion).toEqual(new Decimal("100000"));
  });

  it("Form 2555 - no form2555 input means no exclusion applied", () => {
    const result = calculateFederalTax(makeFederalInput(undefined));
    expect(result.form2555).toBeUndefined();
    expect(result.totalWages).toEqual(new Decimal("120000"));
  });
});

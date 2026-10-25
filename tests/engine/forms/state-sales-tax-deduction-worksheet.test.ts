/**
 * Tests for State and Local General Sales Tax Deduction Worksheet.
 * Spec: spec/federal/state-sales-tax-deduction.yaml
 *
 * Covers the IRS Optional Sales Tax Table lookup, exemption multipliers,
 * local rate adjustment, specific large purchases, actual receipts method,
 * and Schedule A Line 5a integration (income tax vs sales tax comparison).
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSalesTaxDeduction } from "@/engine/forms/state-sales-tax-deduction-worksheet.js";
import {
  STATE_SALES_TAX_RATES_2025,
  getExemptionMultiplier,
  getAGIBracketIndex,
} from "@/models/sales-tax-tables.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type SalesTaxDeduction } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function makeSalesTax(overrides: Partial<SalesTaxDeduction> = {}): SalesTaxDeduction {
  return {
    state: "TX",
    localSalesTaxRate: "0",
    method: "table" as const,
    actualGeneralSalesTax: "0",
    specificPurchaseSalesTax: [],
    autoCompare: true,
    ...overrides,
  };
}

function makeW2(overrides: Record<string, unknown> = {}) {
  return {
    employer: { name: "Employer", ein: "12-3456789" },
    wages: "75000",
    federalWithheld: "10000",
    stateTaxWithheld: "0",
    localTaxWithheld: "0",
    socialSecurityWages: "75000",
    socialSecurityTax: "4650",
    medicareWages: "75000",
    medicareTax: "1087.50",
    state: "TX",
    ...overrides,
  };
}

function makeMinimalInput(overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: { firstName: "Test", lastName: "User", ssn: "000-00-0001", dateOfBirth: "1980-01-01" },
      address: { street: "1 Main St", city: "Houston", state: "TX", zip: "77001" },
      dependents: [],
    },
    w2s: [makeW2()],
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════
// State sales tax rate lookup
// ═══════════════════════════════════════════════════════════

describe("State sales tax rates", () => {
  it("Texas rate is 6.25%", () => {
    expect(STATE_SALES_TAX_RATES_2025.TX.toNumber()).toBe(0.0625);
  });

  it("Florida rate is 6.0%", () => {
    expect(STATE_SALES_TAX_RATES_2025.FL.toNumber()).toBe(0.06);
  });

  it("Washington rate is 6.5%", () => {
    expect(STATE_SALES_TAX_RATES_2025.WA.toNumber()).toBe(0.065);
  });

  it("Oregon has no sales tax", () => {
    expect(STATE_SALES_TAX_RATES_2025.OR.toNumber()).toBe(0);
  });

  it("Delaware has no sales tax", () => {
    expect(STATE_SALES_TAX_RATES_2025.DE.toNumber()).toBe(0);
  });

  it("California rate is 7.25%", () => {
    expect(STATE_SALES_TAX_RATES_2025.CA.toNumber()).toBe(0.0725);
  });

  it("Tennessee rate is 7.0%", () => {
    expect(STATE_SALES_TAX_RATES_2025.TN.toNumber()).toBe(0.07);
  });
});

// ═══════════════════════════════════════════════════════════
// Exemption multiplier lookup
// ═══════════════════════════════════════════════════════════

describe("Exemption multipliers", () => {
  it("1 exemption gives multiplier 1.000", () => {
    expect(getExemptionMultiplier(1).toNumber()).toBe(1.0);
  });

  it("2 exemptions gives multiplier 1.614", () => {
    expect(getExemptionMultiplier(2).toNumber()).toBe(1.614);
  });

  it("3 exemptions gives multiplier 1.756", () => {
    expect(getExemptionMultiplier(3).toNumber()).toBe(1.756);
  });

  it("4 exemptions gives multiplier 1.863", () => {
    expect(getExemptionMultiplier(4).toNumber()).toBe(1.863);
  });

  it("5 exemptions adds 0.107 increment beyond 4", () => {
    expect(getExemptionMultiplier(5).toNumber()).toBe(1.97);
  });

  it("6 exemptions adds two increments beyond 4", () => {
    expect(getExemptionMultiplier(6).toNumber()).toBe(2.077);
  });

  it("0 or negative exemptions defaults to multiplier 1.0", () => {
    expect(getExemptionMultiplier(0).toNumber()).toBe(1);
    expect(getExemptionMultiplier(-1).toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI bracket lookup
// ═══════════════════════════════════════════════════════════

describe("AGI bracket index", () => {
  it("$15,000 AGI is in first bracket (under $20K)", () => {
    expect(getAGIBracketIndex(d(15000))).toBe(0);
  });

  it("$25,000 AGI is in second bracket ($20K-$30K)", () => {
    expect(getAGIBracketIndex(d(25000))).toBe(1);
  });

  it("$75,000 AGI is in bracket 6 ($70K-$80K)", () => {
    expect(getAGIBracketIndex(d(75000))).toBe(6);
  });

  it("$200,000+ AGI is in final bracket", () => {
    expect(getAGIBracketIndex(d(250000))).toBe(11);
  });

  it("$0 AGI is in first bracket", () => {
    expect(getAGIBracketIndex(d(0))).toBe(0);
  });

  it("Boundary: $20,000 exactly is in second bracket", () => {
    expect(getAGIBracketIndex(d(20000))).toBe(1);
  });

  it("Boundary: $19,999 is still in first bracket", () => {
    expect(getAGIBracketIndex(d(19999))).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Table method — basic calculations
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — table method", () => {
  it("Texas single filer with $75K AGI and 1 exemption produces positive deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX" }),
      d(75000),
      1
    );
    // Base spending for $70K-$80K bracket = $14,580 × 0.0625 = $911
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(911);
    expect(result.stateRate.toNumber()).toBe(0.0625);
    expect(result.combinedRate.toNumber()).toBe(0.0625);
    expect(result.method).toBe("table");
  });

  it("Florida MFJ with $100K AGI and 2 exemptions applies multiplier", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "FL" }),
      d(100000),
      2
    );
    // Base spending $19,640 × 0.06 = $1,178 for 1 exemption
    // × 1.614 = $1,901 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(1901);
  });

  it("Texas single with $25K AGI and 1 exemption", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX" }),
      d(25000),
      1
    );
    // Base spending $8,620 × 0.0625 = $539 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(539);
  });

  it("Washington family of 4 with $120K AGI", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "WA" }),
      d(120000),
      4
    );
    // Base spending $19,640 × 0.065 = $1,277 for 1 exemption
    // × 1.863 = $2,379 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2379);
  });

  it("High income ($200K+) Texas single filer", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX" }),
      d(350000),
      1
    );
    // Base spending $36,840 × 0.0625 = $2,303 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2303);
  });

  it("Low income under $20K", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX" }),
      d(15000),
      1
    );
    // Base spending $5,480 × 0.0625 = $343 (rounded)
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(343);
  });
});

// ═══════════════════════════════════════════════════════════
// Local rate adjustment
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — local rate adjustment", () => {
  it("Local rate adds to combined rate for table lookup", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX", localSalesTaxRate: "0.02" }),
      d(75000),
      1
    );
    // Combined: 0.0625 + 0.02 = 0.0825
    // Base spending $14,580 × 0.0825 = $1,203 (rounded)
    expect(result.combinedRate.toNumber()).toBe(0.0825);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(1203);
  });

  it("Local rate is capped at state rate per IRS instructions", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX", localSalesTaxRate: "0.10" }),
      d(75000),
      1
    );
    // Local capped at state rate: 0.0625
    // Combined: 0.0625 + 0.0625 = 0.125
    expect(result.combinedRate.toNumber()).toBe(0.125);
  });

  it("Zero local rate produces no adjustment", () => {
    const resultNoLocal = calculateSalesTaxDeduction(
      makeSalesTax({ state: "FL", localSalesTaxRate: "0" }),
      d(50000),
      1
    );
    const resultZero = calculateSalesTaxDeduction(
      makeSalesTax({ state: "FL" }),
      d(50000),
      1
    );
    expect(resultNoLocal.totalSalesTaxDeduction.toNumber()).toBe(
      resultZero.totalSalesTaxDeduction.toNumber()
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Specific large purchases
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — specific large purchases", () => {
  it("Vehicle purchase sales tax adds on top of table amount", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "TX",
        specificPurchaseSalesTax: [
          { description: "2025 Toyota Camry", salesTaxPaid: "2500" },
        ],
      }),
      d(75000),
      1
    );
    // Table: $911 + vehicle: $2,500 = $3,411
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(3411);
    expect(result.specificPurchaseTotal.toNumber()).toBe(2500);
  });

  it("Multiple specific purchases aggregate", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "FL",
        specificPurchaseSalesTax: [
          { description: "Boat", salesTaxPaid: "3000" },
          { description: "Car", salesTaxPaid: "1800" },
        ],
      }),
      d(75000),
      1
    );
    // FL table for $70K-$80K: $14,580 × 0.06 = $875 (rounded)
    // + $3,000 + $1,800 = $5,675
    expect(result.specificPurchaseTotal.toNumber()).toBe(4800);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(875 + 4800);
  });
});

// ═══════════════════════════════════════════════════════════
// Actual receipts method
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — actual method", () => {
  it("Actual total replaces table lookup", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "TX",
        method: "actual",
        actualGeneralSalesTax: "2000",
      }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(2000);
    expect(result.method).toBe("actual");
  });

  it("Actual plus specific purchases", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "TX",
        method: "actual",
        actualGeneralSalesTax: "1500",
        specificPurchaseSalesTax: [
          { description: "Truck", salesTaxPaid: "3125" },
        ],
      }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(4625);
  });
});

// ═══════════════════════════════════════════════════════════
// No-sales-tax states
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — no-sales-tax states", () => {
  it("Alaska local sales tax still produces a positive table deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "AK",
        localSalesTaxRate: "0.015",
      }),
      d(75000),
      1
    );

    expect(result.stateRate.toNumber()).toBe(0);
    expect(result.combinedRate.toNumber()).toBe(0.015);
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(219);
  });

  it("Oregon produces zero deduction (no state sales tax)", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "OR" }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
    expect(result.stateRate.toNumber()).toBe(0);
  });

  it("Delaware produces zero deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "DE" }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
  });

  it("Montana produces zero deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "MT" }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
  });

  it("Unknown state code produces zero deduction", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "XX" }),
      d(75000),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule A integration — income tax vs sales tax comparison
// ═══════════════════════════════════════════════════════════

describe("Schedule A integration — sales tax election", () => {
  it("Sales tax replaces income tax on Line 5a when elected", () => {
    const input = makeMinimalInput() as Parameters<typeof calculateScheduleA>[0];
    const result = calculateScheduleA(input, d(75000), "single", {
      saltCap: d(40000),
      saltPhaseDown: { magiThreshold: d(500000), minimumCap: d(10000), rate: d("0.30") },
      mortgageInterest: { debtLimit: d(750000) },
    } as Parameters<typeof calculateScheduleA>[3], {
      salesTaxDeduction: d(911),
      salesTaxElected: true,
    });
    expect(result.saltDeduction.toNumber()).toBe(911);
    expect(result.salesTaxElected).toBe(true);
  });

  it("Income tax used when not elected even if sales tax provided", () => {
    const input = makeMinimalInput({
      w2s: [makeW2({ stateTaxWithheld: "3000", state: "NY" })],
    }) as Parameters<typeof calculateScheduleA>[0];
    const result = calculateScheduleA(input, d(75000), "single", {
      saltCap: d(40000),
      saltPhaseDown: { magiThreshold: d(500000), minimumCap: d(10000), rate: d("0.30") },
      mortgageInterest: { debtLimit: d(750000) },
    } as Parameters<typeof calculateScheduleA>[3], {
      salesTaxDeduction: d(500),
      salesTaxElected: false,
    });
    expect(result.saltDeduction.toNumber()).toBe(3000);
    expect(result.salesTaxElected).toBe(false);
  });

  it("2025 sales tax and property tax below the SALT limit are fully deductible", () => {
    const input = makeMinimalInput({
      form1098: [{ lender: "Bank", mortgageInterestReceived: "5000", outstandingMortgagePrincipal: "200000", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTax: "6000" }],
    }) as Parameters<typeof calculateScheduleA>[0];
    const result = calculateScheduleA(input, d(75000), "single", {
      saltCap: d(40000),
      saltPhaseDown: { magiThreshold: d(500000), minimumCap: d(10000), rate: d("0.30") },
      mortgageInterest: { debtLimit: d(750000) },
    } as Parameters<typeof calculateScheduleA>[3], {
      salesTaxDeduction: d(8000),
      salesTaxElected: true,
    });
    expect(result.saltDeduction.toNumber()).toBe(14000);
  });

  it("MFS sales tax election is below the 2025 $20K SALT limit", () => {
    const input = makeMinimalInput() as Parameters<typeof calculateScheduleA>[0];
    const result = calculateScheduleA(input, d(75000), "married_filing_separately", {
      saltCap: d(40000),
      saltPhaseDown: { magiThreshold: d(500000), minimumCap: d(10000), rate: d("0.30") },
      mortgageInterest: { debtLimit: d(750000) },
    } as Parameters<typeof calculateScheduleA>[3], {
      salesTaxDeduction: d(8000),
      salesTaxElected: true,
    });
    expect(result.saltDeduction.toNumber()).toBe(8000);
  });

  it("Default salesTaxElected is false when not provided", () => {
    const input = makeMinimalInput() as Parameters<typeof calculateScheduleA>[0];
    const result = calculateScheduleA(input, d(75000), "single", {
      saltCap: d(40000),
      saltPhaseDown: { magiThreshold: d(500000), minimumCap: d(10000), rate: d("0.30") },
      mortgageInterest: { debtLimit: d(750000) },
    } as Parameters<typeof calculateScheduleA>[3]);
    expect(result.salesTaxElected).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal orchestrator integration
// ═══════════════════════════════════════════════════════════

describe("Federal orchestrator — sales tax deduction", () => {
  it("Texas filer with no income tax uses sales tax deduction via autoCompare", () => {
    const result = calculateFederalTax(makeMinimalInput({
      salesTaxDeduction: {
        state: "TX",
        localSalesTaxRate: "0.02",
        method: "table",
        specificPurchaseSalesTax: [
          { description: "Truck", salesTaxPaid: "2000" },
        ],
        autoCompare: true,
      },
      scheduleA: { medicalExpenses: "0", personalPropertyTaxes: "0" },
      donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "5000", organization: "Charity", dateOfDonation: "2025-06-15" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "4000" }],
    }) as Parameters<typeof calculateFederalTax>[0]);

    // Income tax = $0 (TX), so sales tax wins via autoCompare
    expect(result.salesTaxDeduction).toBeDefined();
    expect(result.salesTaxDeduction!.totalSalesTaxDeduction.greaterThan(0)).toBe(true);
    // Should itemize since we have mortgage interest + donations + sales tax
    const line5aAudit = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "5a"
    );
    expect(line5aAudit?.description).toContain("sales taxes");
  });

  it("NY filer with high income tax uses income tax over sales tax via autoCompare", () => {
    const result = calculateFederalTax(makeMinimalInput({
      w2s: [makeW2({ wages: "150000", federalWithheld: "30000", stateTaxWithheld: "9000", socialSecurityWages: "150000", socialSecurityTax: "9300", medicareWages: "150000", medicareTax: "2175", state: "NY" })],
      salesTaxDeduction: {
        state: "NY",
        localSalesTaxRate: "0.045",
        method: "table",
        specificPurchaseSalesTax: [],
        autoCompare: true,
      },
      scheduleA: { medicalExpenses: "0", personalPropertyTaxes: "0" },
      donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "5000", organization: "Charity", dateOfDonation: "2025-06-15" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "12000", outstandingMortgagePrincipal: "300000", propertyTax: "5000" }],
    }) as Parameters<typeof calculateFederalTax>[0]);

    // Income tax $9,000 should exceed NY sales tax deduction
    const line5aAudit = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "5a"
    );
    expect(line5aAudit?.description).toContain("income taxes");
  });

  it("Unconditional sales tax election (autoCompare false) uses sales tax even when income tax is larger", () => {
    const result = calculateFederalTax(makeMinimalInput({
      w2s: [makeW2({ stateTaxWithheld: "4000", state: "CA" })],
      salesTaxDeduction: {
        state: "CA",
        localSalesTaxRate: "0.0125",
        method: "table",
        specificPurchaseSalesTax: [],
        autoCompare: false,
      },
      scheduleA: { medicalExpenses: "0", personalPropertyTaxes: "0" },
      donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "3000", organization: "Charity", dateOfDonation: "2025-06-15" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "3000" }],
    }) as Parameters<typeof calculateFederalTax>[0]);

    // autoCompare=false means sales tax is used regardless
    const line5aAudit = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "5a"
    );
    expect(line5aAudit?.description).toContain("sales taxes");
  });

  it("No sales tax deduction input produces no sales tax sub-result", () => {
    const result = calculateFederalTax(makeMinimalInput() as Parameters<typeof calculateFederalTax>[0]);
    expect(result.salesTaxDeduction).toBeUndefined();
  });

  it("Sales tax deduction with vehicle purchase is included in SALT and subject to cap", () => {
    const result = calculateFederalTax(makeMinimalInput({
      salesTaxDeduction: {
        state: "TX",
        localSalesTaxRate: "0.02",
        method: "table",
        specificPurchaseSalesTax: [
          { description: "Truck", salesTaxPaid: "5000" },
        ],
        autoCompare: true,
      },
      scheduleA: { medicalExpenses: "0", personalPropertyTaxes: "0" },
      donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "3000", organization: "Charity", dateOfDonation: "2025-06-15" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "8000", outstandingMortgagePrincipal: "200000", propertyTax: "6000" }],
    }) as Parameters<typeof calculateFederalTax>[0]);

    const saltAudit = result.allLines.find(
      (l) => l.form === "Sched A" && l.line === "5e"
    );
    expect(saltAudit).toBeDefined();
    expect(saltAudit!.value.lessThanOrEqualTo(40000)).toBe(true);
  });

  it("Exemption count includes spouse and dependents for MFJ", () => {
    const result = calculateFederalTax(makeMinimalInput({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "Test", lastName: "User", ssn: "000-00-0001", dateOfBirth: "1980-01-01" },
        spouse: { firstName: "Spouse", lastName: "User", ssn: "000-00-0002", dateOfBirth: "1982-06-15" },
        address: { street: "1 Main St", city: "Houston", state: "TX", zip: "77001" },
        dependents: [
          { firstName: "Child", lastName: "User", ssn: "000-00-0003", relationship: "son", dateOfBirth: "2015-03-20", monthsLivedWithYou: 12, qualifiesForCTC: true },
        ],
      },
      w2s: [makeW2({ wages: "100000", federalWithheld: "15000", socialSecurityWages: "100000", socialSecurityTax: "6200", medicareWages: "100000", medicareTax: "1450" })],
      salesTaxDeduction: {
        state: "TX",
        localSalesTaxRate: "0",
        method: "table",
        specificPurchaseSalesTax: [],
        autoCompare: true,
      },
      scheduleA: { medicalExpenses: "0", personalPropertyTaxes: "0" },
      donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "3000", organization: "Charity", dateOfDonation: "2025-06-15" }],
      form1098: [{ lender: "Bank", mortgageInterestReceived: "10000", outstandingMortgagePrincipal: "300000", propertyTax: "5000" }],
    }) as Parameters<typeof calculateFederalTax>[0]);

    // 3 exemptions (primary + spouse + 1 dependent), multiplier 1.756
    expect(result.salesTaxDeduction).toBeDefined();
    const wsLines = result.allLines.filter(
      (l) => l.form === "Sales Tax WS" && l.line === "5"
    );
    expect(wsLines.length).toBe(1);
    // The formula string contains "3 exemptions"
    expect(wsLines[0].formula).toContain("3 exemptions");
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

describe("Sales tax worksheet — edge cases", () => {
  it("$0 AGI puts filer in first bracket", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({ state: "TX" }),
      d(0),
      1
    );
    expect(result.totalSalesTaxDeduction.toNumber()).toBe(343);
  });

  it("Exactly $20,000 AGI is in second bracket", () => {
    const r1 = calculateSalesTaxDeduction(makeSalesTax({ state: "TX" }), d(19999), 1);
    const r2 = calculateSalesTaxDeduction(makeSalesTax({ state: "TX" }), d(20000), 1);
    // $19,999 → bracket 0, $20,000 → bracket 1, different table amounts
    expect(r1.totalSalesTaxDeduction.toNumber()).not.toBe(r2.totalSalesTaxDeduction.toNumber());
  });

  it("Low-rate state (Colorado 2.9%) produces smaller deduction than high-rate state", () => {
    const colo = calculateSalesTaxDeduction(makeSalesTax({ state: "CO" }), d(75000), 1);
    const tenn = calculateSalesTaxDeduction(makeSalesTax({ state: "TN" }), d(75000), 1);
    expect(colo.totalSalesTaxDeduction.lessThan(tenn.totalSalesTaxDeduction)).toBe(true);
  });

  it("State code is case-insensitive", () => {
    const upper = calculateSalesTaxDeduction(makeSalesTax({ state: "TX" }), d(75000), 1);
    const lower = calculateSalesTaxDeduction(makeSalesTax({ state: "tx" }), d(75000), 1);
    expect(upper.totalSalesTaxDeduction.toNumber()).toBe(lower.totalSalesTaxDeduction.toNumber());
  });

  it("Audit trail records all worksheet steps", () => {
    const result = calculateSalesTaxDeduction(
      makeSalesTax({
        state: "TX",
        localSalesTaxRate: "0.02",
        specificPurchaseSalesTax: [{ description: "Car", salesTaxPaid: "1000" }],
      }),
      d(75000),
      2
    );
    const forms = result.lines.map((l) => l.form);
    expect(forms.every((f) => f === "Sales Tax WS")).toBe(true);
    expect(result.lines.length).toBeGreaterThanOrEqual(5);
  });
});

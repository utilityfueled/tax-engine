/**
 * Tests for Illinois Use Tax Worksheet (IL-1040 Line 21)
 * Spec: spec/state/il-use-tax.yaml
 *
 * Two computation modes:
 * 1. UT Table: standard amounts based on federal AGI brackets
 * 2. UT Worksheet: actual use tax from out-of-state purchase amounts
 *
 * Source: Illinois Department of Revenue, 2025 IL-1040 Instructions, Step 7
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  lookupUseTaxTable,
  calculateUseTaxWorksheet,
  type UseTaxWorksheetInput,
  IL_USE_TAX_CONSTANTS,
} from "@/engine/state/il-use-tax.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

function makeWorksheetInput(overrides: Partial<UseTaxWorksheetInput> = {}): UseTaxWorksheetInput {
  return {
    taxYear: 2025,
    federalAGI: d(75000),
    generalMerchandisePurchases: ZERO,
    qualifyingFoodDrugMedicalPurchases: ZERO,
    salesTaxPaidToOtherStates: ZERO,
    filingStatus: "single",
    ...overrides,
  };
}

// ===========================================================================
// UT Table — Standard amounts based on AGI
// ===========================================================================

describe("Illinois Use Tax — UT Table Lookup", () => {
  it("UT Table — AGI $0 returns $3", () => {
    expect(lookupUseTaxTable(d(0), 2025).toNumber()).toBe(3);
  });

  it("UT Table — AGI $5,000 returns $3", () => {
    expect(lookupUseTaxTable(d(5000), 2025).toNumber()).toBe(3);
  });

  it("UT Table — AGI exactly $10,000 returns $3 (upper bound inclusive)", () => {
    expect(lookupUseTaxTable(d(10000), 2025).toNumber()).toBe(3);
  });

  it("UT Table — AGI $10,001 returns $8", () => {
    expect(lookupUseTaxTable(d(10001), 2025).toNumber()).toBe(8);
  });

  it("UT Table — AGI $15,000 returns $8", () => {
    expect(lookupUseTaxTable(d(15000), 2025).toNumber()).toBe(8);
  });

  it("UT Table — AGI exactly $20,000 returns $8", () => {
    expect(lookupUseTaxTable(d(20000), 2025).toNumber()).toBe(8);
  });

  it("UT Table — AGI $20,001 returns $13", () => {
    expect(lookupUseTaxTable(d(20001), 2025).toNumber()).toBe(13);
  });

  it("UT Table — AGI $25,000 returns $13", () => {
    expect(lookupUseTaxTable(d(25000), 2025).toNumber()).toBe(13);
  });

  it("UT Table — AGI exactly $30,000 returns $13", () => {
    expect(lookupUseTaxTable(d(30000), 2025).toNumber()).toBe(13);
  });

  it("UT Table — AGI $30,001 returns $18", () => {
    expect(lookupUseTaxTable(d(30001), 2025).toNumber()).toBe(18);
  });

  it("UT Table — AGI exactly $40,000 returns $18", () => {
    expect(lookupUseTaxTable(d(40000), 2025).toNumber()).toBe(18);
  });

  it("UT Table — AGI $40,001 returns $23", () => {
    expect(lookupUseTaxTable(d(40001), 2025).toNumber()).toBe(23);
  });

  it("UT Table — AGI exactly $50,000 returns $23", () => {
    expect(lookupUseTaxTable(d(50000), 2025).toNumber()).toBe(23);
  });

  it("UT Table — AGI $50,001 returns $31", () => {
    expect(lookupUseTaxTable(d(50001), 2025).toNumber()).toBe(31);
  });

  it("UT Table — AGI $60,000 returns $31", () => {
    expect(lookupUseTaxTable(d(60000), 2025).toNumber()).toBe(31);
  });

  it("UT Table — AGI exactly $75,000 returns $31", () => {
    expect(lookupUseTaxTable(d(75000), 2025).toNumber()).toBe(31);
  });

  it("UT Table — AGI $75,001 returns $44", () => {
    expect(lookupUseTaxTable(d(75001), 2025).toNumber()).toBe(44);
  });

  it("UT Table — AGI $90,000 returns $44", () => {
    expect(lookupUseTaxTable(d(90000), 2025).toNumber()).toBe(44);
  });

  it("UT Table — AGI exactly $100,000 returns $44", () => {
    expect(lookupUseTaxTable(d(100000), 2025).toNumber()).toBe(44);
  });

  it("UT Table — AGI $100,001 uses formula: AGI × 0.0005 = $50", () => {
    expect(lookupUseTaxTable(d(100001), 2025).toNumber()).toBe(50);
  });

  it("UT Table — AGI $150,000 uses formula: $75", () => {
    expect(lookupUseTaxTable(d(150000), 2025).toNumber()).toBe(75);
  });

  it("UT Table — AGI $200,000 uses formula: $100", () => {
    expect(lookupUseTaxTable(d(200000), 2025).toNumber()).toBe(100);
  });

  it("UT Table — AGI $500,000 uses formula: $250", () => {
    expect(lookupUseTaxTable(d(500000), 2025).toNumber()).toBe(250);
  });

  it("UT Table — AGI $1,000,000 uses formula: $500", () => {
    expect(lookupUseTaxTable(d(1000000), 2025).toNumber()).toBe(500);
  });

  it("UT Table — AGI $200,001 rounds: 200001 × 0.0005 = 100.0005 → $100", () => {
    expect(lookupUseTaxTable(d(200001), 2025).toNumber()).toBe(100);
  });

  it("UT Table — AGI $333,333 rounds: 333333 × 0.0005 = 166.6665 → $167", () => {
    expect(lookupUseTaxTable(d(333333), 2025).toNumber()).toBe(167);
  });

  it("UT Table — negative AGI returns $0", () => {
    expect(lookupUseTaxTable(d(-5000), 2025).toNumber()).toBe(0);
  });
});

// ===========================================================================
// UT Worksheet — Actual use tax computation
// ===========================================================================

describe("Illinois Use Tax — UT Worksheet", () => {
  it("UT Worksheet — no purchases returns zero", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput());
    expect(result.generalMerchandiseTax.toNumber()).toBe(0);
    expect(result.qualifyingItemsTax.toNumber()).toBe(0);
    expect(result.netUseTax.toNumber()).toBe(0);
  });

  it("UT Worksheet — general merchandise at 6.25%", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(1000),
    }));
    // 1000 × 0.0625 = 62.50 → 63 (rounded)
    expect(result.generalMerchandiseTax.toNumber()).toBe(63);
    expect(result.netUseTax.toNumber()).toBe(63);
  });

  it("UT Worksheet — qualifying food/drugs/medical at 1%", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      qualifyingFoodDrugMedicalPurchases: d(500),
    }));
    // 500 × 0.01 = 5.00 → 5
    expect(result.qualifyingItemsTax.toNumber()).toBe(5);
    expect(result.netUseTax.toNumber()).toBe(5);
  });

  it("UT Worksheet — both purchase types combined", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(2000),
      qualifyingFoodDrugMedicalPurchases: d(800),
    }));
    // General: 2000 × 0.0625 = 125
    // Qualifying: 800 × 0.01 = 8
    // Net: 125 + 8 = 133
    expect(result.generalMerchandiseTax.toNumber()).toBe(125);
    expect(result.qualifyingItemsTax.toNumber()).toBe(8);
    expect(result.netUseTax.toNumber()).toBe(133);
  });

  it("UT Worksheet — sales tax paid to other states reduces net", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(1000),
      salesTaxPaidToOtherStates: d(30),
    }));
    // General tax: 1000 × 0.0625 = 62.50 → 63
    // Net: 63 - 30 = 33
    expect(result.generalMerchandiseTax.toNumber()).toBe(63);
    expect(result.netUseTax.toNumber()).toBe(33);
  });

  it("UT Worksheet — sales tax credit cannot make net negative", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(100),
      salesTaxPaidToOtherStates: d(500),
    }));
    // General tax: 100 × 0.0625 = 6.25 → 6
    // Net: max(6 - 500, 0) = 0
    expect(result.generalMerchandiseTax.toNumber()).toBe(6);
    expect(result.netUseTax.toNumber()).toBe(0);
  });

  it("UT Worksheet — large general merchandise purchase", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(10000),
    }));
    // 10000 × 0.0625 = 625
    expect(result.generalMerchandiseTax.toNumber()).toBe(625);
    expect(result.netUseTax.toNumber()).toBe(625);
  });

  it("UT Worksheet — rounding: $99 general → $6", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(99),
    }));
    // 99 × 0.0625 = 6.1875 → 6
    expect(result.generalMerchandiseTax.toNumber()).toBe(6);
  });

  it("UT Worksheet — rounding: $101 general → $6", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(101),
    }));
    // 101 × 0.0625 = 6.3125 → 6
    expect(result.generalMerchandiseTax.toNumber()).toBe(6);
  });

  it("UT Worksheet — rounding: $104 general → $7 (rounds up at 0.5)", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(104),
    }));
    // 104 × 0.0625 = 6.5 → 7 (round half up)
    expect(result.generalMerchandiseTax.toNumber()).toBe(7);
  });

  it("UT Worksheet — table amount also returned for comparison", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      federalAGI: d(60000),
      generalMerchandisePurchases: d(200),
    }));
    expect(result.tableAmount.toNumber()).toBe(31); // AGI 60K → $31
    expect(result.generalMerchandiseTax.toNumber()).toBe(13); // 200 × 0.0625 = 12.5 → 13
    expect(result.netUseTax.toNumber()).toBe(13);
  });
});

// ===========================================================================
// ST-44 threshold
// ===========================================================================

describe("Illinois Use Tax — ST-44 Threshold", () => {
  it("UT Worksheet — net use tax under $600 single: no ST-44 required", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(5000),
    }));
    // 5000 × 0.0625 = 312.50 → 313
    expect(result.netUseTax.toNumber()).toBe(313);
    expect(result.requiresST44).toBe(false);
    expect(result.reportableUseTax.toNumber()).toBe(313);
  });

  it("UT Worksheet — net use tax exactly $600 single: requires ST-44", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(9600),
    }));
    // 9600 × 0.0625 = 600
    expect(result.netUseTax.toNumber()).toBe(600);
    expect(result.requiresST44).toBe(true);
  });

  it("UT Worksheet — net use tax over $600 single: requires ST-44", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(15000),
    }));
    // 15000 × 0.0625 = 937.50 → 938
    expect(result.netUseTax.toNumber()).toBe(938);
    expect(result.requiresST44).toBe(true);
  });

  it("UT Worksheet — MFJ threshold is $1,200", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      filingStatus: "married_filing_jointly",
      generalMerchandisePurchases: d(15000),
    }));
    // 15000 × 0.0625 = 937.50 → 938
    expect(result.netUseTax.toNumber()).toBe(938);
    expect(result.requiresST44).toBe(false); // Under $1,200 MFJ threshold
  });

  it("UT Worksheet — MFJ exactly $1,200: requires ST-44", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      filingStatus: "married_filing_jointly",
      generalMerchandisePurchases: d(19200),
    }));
    // 19200 × 0.0625 = 1200
    expect(result.netUseTax.toNumber()).toBe(1200);
    expect(result.requiresST44).toBe(true);
  });

  it("UT Worksheet — MFS uses $600 threshold (not MFJ)", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      filingStatus: "married_filing_separately",
      generalMerchandisePurchases: d(9600),
    }));
    expect(result.netUseTax.toNumber()).toBe(600);
    expect(result.requiresST44).toBe(true);
  });

  it("UT Worksheet — ST-44 threshold zeroes the IL-1040 reportable amount", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(9600),
    }));

    expect(result.netUseTax.toNumber()).toBe(600);
    expect(result.requiresST44).toBe(true);
    expect(result.reportableUseTax.toNumber()).toBe(0);
  });
});

// ===========================================================================
// Audit trail
// ===========================================================================

describe("Illinois Use Tax — Audit Trail", () => {
  it("UT Worksheet produces audit trail entries", () => {
    const result = calculateUseTaxWorksheet(makeWorksheetInput({
      generalMerchandisePurchases: d(500),
      qualifyingFoodDrugMedicalPurchases: d(200),
      salesTaxPaidToOtherStates: d(10),
    }));
    expect(result.lines.length).toBeGreaterThan(0);
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("UT Worksheet")).toBe(true);
  });
});

// ===========================================================================
// Constants
// ===========================================================================

describe("Illinois Use Tax — Constants", () => {
  it("2025 constants have correct rates", () => {
    const c = IL_USE_TAX_CONSTANTS[2025];
    expect(c).toBeDefined();
    expect(c.generalMerchandiseRate.toNumber()).toBe(0.0625);
    expect(c.qualifyingItemRate.toNumber()).toBe(0.01);
    expect(c.formulaRate.toNumber()).toBe(0.0005);
    expect(c.st44Threshold.other.toNumber()).toBe(600);
    expect(c.st44Threshold.mfj.toNumber()).toBe(1200);
  });

  it("2025 table has 7 fixed brackets (AGI over $100K uses formula)", () => {
    const c = IL_USE_TAX_CONSTANTS[2025];
    expect(c.table.length).toBe(7);
  });
});

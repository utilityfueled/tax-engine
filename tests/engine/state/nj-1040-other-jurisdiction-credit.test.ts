/**
 * Tests for NJ-1040 Schedule A — Credit for Income or Wage Tax Paid to Other Jurisdictions.
 * Spec: spec/state/nj-1040-other-jurisdiction-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNJ1040OtherJurisdictionCredit,
  type NJ1040OtherJurisdictionCreditInput,
  type OtherJurisdictionEntry,
} from "@/engine/state/nj-1040-other-jurisdiction-credit.js";

const d = (value: string | number) => new Decimal(value);

function entry(
  jurisdiction: string,
  incomeInJurisdiction: number,
  taxPaid: number
): OtherJurisdictionEntry {
  return {
    jurisdiction,
    incomeInJurisdiction: new Decimal(incomeInJurisdiction),
    taxPaid: new Decimal(taxPaid),
  };
}

function makeInput(
  overrides: Partial<NJ1040OtherJurisdictionCreditInput> & {
    jurisdictions: OtherJurisdictionEntry[];
  }
): NJ1040OtherJurisdictionCreditInput {
  return {
    taxYear: 2025,
    njGrossIncome: new Decimal(100000),
    njTax: new Decimal(3000),
    jurisdictions: overrides.jurisdictions,
    ...overrides,
  };
}

describe("NJ-1040 Schedule A — Credit for Taxes Paid to Other Jurisdictions", () => {
  // --- Basic single-state scenarios ---

  it("NJ-1040 Schedule A - single state with income less than NJ gross income", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("NY", 80000, 4000)],
      })
    );
    // Proportional limit: (80000 / 100000) × 3000 = 2400
    // Credit = min(4000 tax paid, 2400 limit) = 2400
    expect(result.totalCredit.toNumber()).toBe(2400);
    expect(result.jurisdictionCredits.length).toBe(1);
    expect(result.jurisdictionCredits[0].credit.toNumber()).toBe(2400);
  });

  it("NJ-1040 Schedule A - credit limited to tax actually paid", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(5000),
        jurisdictions: [entry("NY", 80000, 2000)],
      })
    );
    // Proportional limit: (80000 / 100000) × 5000 = 4000
    // Credit = min(2000 tax paid, 4000 limit) = 2000
    expect(result.totalCredit.toNumber()).toBe(2000);
    expect(result.jurisdictionCredits[0].credit.toNumber()).toBe(2000);
  });

  it("NJ-1040 Schedule A - proportional limit caps credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("NY", 50000, 5000)],
      })
    );
    // Proportional limit: (50000 / 100000) × 3000 = 1500
    // Credit = min(5000, 1500) = 1500
    expect(result.totalCredit.toNumber()).toBe(1500);
    expect(result.jurisdictionCredits[0].proportionalLimit.toNumber()).toBe(
      1500
    );
  });

  it("NJ-1040 Schedule A - credit is lesser of tax paid and proportional limit", () => {
    // Case 1: tax paid < proportional limit
    const r1 = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(5000),
        jurisdictions: [entry("PA", 60000, 1000)],
      })
    );
    // Proportional limit: (60000/100000) × 5000 = 3000
    expect(r1.jurisdictionCredits[0].credit.toNumber()).toBe(1000);

    // Case 2: proportional limit < tax paid
    const r2 = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(2000),
        jurisdictions: [entry("PA", 60000, 5000)],
      })
    );
    // Proportional limit: (60000/100000) × 2000 = 1200
    expect(r2.jurisdictionCredits[0].credit.toNumber()).toBe(1200);
  });

  // --- All income in other state ---

  it("NJ-1040 Schedule A - all income earned in another state (ratio = 1.0)", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(80000),
        njTax: d(2500),
        jurisdictions: [entry("NY", 80000, 4000)],
      })
    );
    // Ratio = 80000 / 80000 = 1.0
    // Proportional limit = 1.0 × 2500 = 2500
    // Credit = min(4000, 2500) = 2500
    expect(result.totalCredit.toNumber()).toBe(2500);
  });

  it("NJ-1040 Schedule A - income in other state exceeds NJ gross income (ratio capped at 1.0)", () => {
    // This shouldn't normally happen, but guard against it
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(50000),
        njTax: d(1500),
        jurisdictions: [entry("NY", 60000, 3000)],
      })
    );
    // Ratio = min(60000/50000, 1.0) = 1.0
    // Proportional limit = 1.0 × 1500 = 1500
    // Credit = min(3000, 1500) = 1500
    expect(result.totalCredit.toNumber()).toBe(1500);
  });

  // --- Multiple states ---

  it("NJ-1040 Schedule A - multiple states computed independently then summed", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(120000),
        njTax: d(4000),
        jurisdictions: [
          entry("NY", 80000, 3500),
          entry("CT", 20000, 800),
        ],
      })
    );
    // NY: proportional = (80000/120000) × 4000 = 2666.67; credit = min(3500, 2666.67) = 2666.67 → rounded = 2667
    // CT: proportional = (20000/120000) × 4000 = 666.67; credit = min(800, 666.67) = 666.67 → rounded = 667
    // Total = 2667 + 667 = 3334
    expect(result.jurisdictionCredits.length).toBe(2);
    expect(result.totalCredit.toNumber()).toBe(3334);
  });

  it("NJ-1040 Schedule A - total credit capped at NJ tax", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(2000),
        jurisdictions: [
          entry("NY", 60000, 3000),
          entry("PA", 40000, 2000),
        ],
      })
    );
    // NY: proportional = (60000/100000) × 2000 = 1200; credit = min(3000, 1200) = 1200
    // PA: proportional = (40000/100000) × 2000 = 800; credit = min(2000, 800) = 800
    // Sum = 1200 + 800 = 2000
    // Cap at NJ tax = 2000
    expect(result.totalCredit.toNumber()).toBe(2000);
  });

  it("NJ-1040 Schedule A - multi-state total exceeds NJ tax and is capped", () => {
    // All income is in other states, those states charge more tax than NJ
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(1500),
        jurisdictions: [
          entry("NY", 50000, 3000),
          entry("CT", 50000, 3000),
        ],
      })
    );
    // NY: proportional = (50000/100000) × 1500 = 750; credit = min(3000, 750) = 750
    // CT: proportional = (50000/100000) × 1500 = 750; credit = min(3000, 750) = 750
    // Sum = 1500, cap at NJ tax 1500 → 1500
    expect(result.totalCredit.toNumber()).toBe(1500);
  });

  // --- Edge cases ---

  it("NJ-1040 Schedule A - zero NJ gross income produces zero credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(0),
        njTax: d(0),
        jurisdictions: [entry("NY", 50000, 2000)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 Schedule A - zero NJ tax produces zero credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(50000),
        njTax: d(0),
        jurisdictions: [entry("NY", 30000, 1500)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 Schedule A - zero tax paid to other state produces zero credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("NY", 50000, 0)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
    expect(result.jurisdictionCredits[0].credit.toNumber()).toBe(0);
  });

  it("NJ-1040 Schedule A - zero income in other state produces zero credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("NY", 0, 1000)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 Schedule A - no jurisdictions produces zero credit", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
    expect(result.jurisdictionCredits.length).toBe(0);
  });

  it("NJ-1040 Schedule A - negative income in other state treated as zero", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("PA", -5000, 500)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 Schedule A - negative tax paid treated as zero", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("PA", 50000, -200)],
      })
    );
    expect(result.totalCredit.toNumber()).toBe(0);
  });

  // --- Realistic NYC commuter scenario ---

  it("NJ-1040 Schedule A - NYC commuter with typical income and NY tax", () => {
    // NJ resident working in NYC, earning $150K salary
    // NJ gross income = $150K, NJ tax ~ $6,289 (approximation for test)
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(150000),
        njTax: d(6289),
        jurisdictions: [entry("NY", 150000, 8500)],
      })
    );
    // All income is in NY → ratio = 1.0
    // Proportional limit = 1.0 × 6289 = 6289
    // Credit = min(8500, 6289) = 6289
    // NJ filer owes $0 to NJ (credit wipes out NJ tax)
    expect(result.totalCredit.toNumber()).toBe(6289);
  });

  it("NJ-1040 Schedule A - NJ resident with NY wages and NJ investment income", () => {
    // $120K NY wages + $30K NJ investment income = $150K NJ gross income
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(150000),
        njTax: d(6289),
        jurisdictions: [entry("NY", 120000, 7000)],
      })
    );
    // Ratio = 120000/150000 = 0.8
    // Proportional limit = 0.8 × 6289 = 5031.20 → rounded 5031
    // Credit = min(7000, 5031) = 5031
    expect(result.totalCredit.toNumber()).toBe(5031);
  });

  // --- Rounding ---

  it("NJ-1040 Schedule A - proportional limit rounds to nearest dollar", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(90000),
        njTax: d(2700),
        jurisdictions: [entry("NY", 33333, 2000)],
      })
    );
    // Proportional limit: (33333/90000) × 2700 = 999.99
    // Rounded to $1000
    // Credit = min(2000, 1000) = 1000
    expect(result.jurisdictionCredits[0].proportionalLimit.toNumber()).toBe(
      1000
    );
    expect(result.totalCredit.toNumber()).toBe(1000);
  });

  // --- Audit trail ---

  it("NJ-1040 Schedule A - produces audit trail lines", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(100000),
        njTax: d(3000),
        jurisdictions: [entry("NY", 80000, 4000)],
      })
    );
    expect(result.lines.length).toBeGreaterThan(0);
    const schedALines = result.lines.filter(
      (l) => l.form === "NJ-1040 Schedule A"
    );
    expect(schedALines.length).toBeGreaterThan(0);
  });

  // --- Three states ---

  it("NJ-1040 Schedule A - three states computed correctly", () => {
    const result = calculateNJ1040OtherJurisdictionCredit(
      makeInput({
        njGrossIncome: d(200000),
        njTax: d(8000),
        jurisdictions: [
          entry("NY", 100000, 5000),
          entry("PA", 30000, 900),
          entry("CT", 20000, 1200),
        ],
      })
    );
    // NY: proportional = (100000/200000) × 8000 = 4000; credit = min(5000, 4000) = 4000
    // PA: proportional = (30000/200000) × 8000 = 1200; credit = min(900, 1200) = 900
    // CT: proportional = (20000/200000) × 8000 = 800; credit = min(1200, 800) = 800
    // Total = 4000 + 900 + 800 = 5700
    expect(result.jurisdictionCredits.length).toBe(3);
    expect(result.totalCredit.toNumber()).toBe(5700);
  });
});

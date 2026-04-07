/**
 * Tests for New Jersey NJ-1040 tax rate computation.
 * Spec: spec/state/nj-1040-tax-rate.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040TaxRate } from "@/engine/state/nj-1040-tax-rate.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 tax rate computation", () => {
  // --- Line 42: taxable income passthrough ---

  it("NJ-1040 tax rate Line 42 - taxable income is passed through", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.taxableIncome.toNumber()).toBe(50000);
  });

  it("NJ-1040 tax rate Line 42 - negative taxable income is floored at zero", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(-5000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.taxableIncome.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Table selection ---

  it("NJ-1040 tax rate Line 43 - single filer uses Table A", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tableCode).toBe("A");
  });

  it("NJ-1040 tax rate Line 43 - married filing separately uses Table A", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "married_filing_separately",
      taxYear: 2025,
    });
    expect(result.tableCode).toBe("A");
  });

  it("NJ-1040 tax rate Line 43 - married filing jointly uses Table B", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tableCode).toBe("B");
  });

  it("NJ-1040 tax rate Line 43 - head of household uses Table B", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });
    expect(result.tableCode).toBe("B");
  });

  it("NJ-1040 tax rate Line 43 - qualifying surviving spouse uses Table B", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
    });
    expect(result.tableCode).toBe("B");
  });

  // --- Table A (Single/MFS) bracket computations ---

  it("NJ-1040 tax rate Line 43 - zero income produces zero tax", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(0),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(0);
  });

  it("NJ-1040 tax rate Line 43 - single filer $10,000 stays in first bracket", () => {
    // $10,000 × 1.4% = $140
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(10000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(140);
  });

  it("NJ-1040 tax rate Line 43 - single filer $20,000 fills first bracket exactly", () => {
    // $20,000 × 1.4% = $280
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(20000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(280);
  });

  it("NJ-1040 tax rate Line 43 - single filer $35,000 fills first two brackets", () => {
    // $20,000 × 1.4% = $280
    // $15,000 × 1.75% = $262.50
    // Total = $542.50 → rounds to $543
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(35000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(543);
  });

  it("NJ-1040 tax rate Line 43 - single filer $50,000 uses the published tax table amount of $1,271", () => {
    // Taxable income under $100,000 uses the published NJ tax table.
    // The $50,000 row is $50,000-$50,050, so the supported table emulation
    // uses midpoint $50,025:
    // $20,000 × 1.4%    = $280.00
    // $15,000 × 1.75%   = $262.50
    // $5,000 × 3.5%     = $175.00
    // $10,025 × 5.525%  = $553.88
    // Total = $1,271.38 → rounds to $1,271
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(1271);
  });

  it("NJ-1040 tax rate Line 43 - single filer $75,000 still uses the tax table below $100,000", () => {
    // The $75,000 row uses midpoint $75,025, which produces $2,653 after rounding.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(75000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(2653);
  });

  it("NJ-1040 tax rate Line 43 - single filer $39,850 uses the published table row rather than direct exact-income tax", () => {
    // The table row for $39,850 is $39,850-$39,900, midpoint $39,875.
    // Table tax = $713, whereas direct tax on exact income would round to $712.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(39850),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(713);
  });

  it("NJ-1040 tax rate Line 43 - single filer $99,950 still uses the tax table but $100,000 switches to schedules", () => {
    const tableResult = calculateNJ1040TaxRate({
      taxableIncome: d(99950),
      filingStatus: "single",
      taxYear: 2025,
    });
    const scheduleResult = calculateNJ1040TaxRate({
      taxableIncome: d(100000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(tableResult.tax.toNumber()).toBe(4242);
    expect(scheduleResult.tax.toNumber()).toBe(4244);
  });

  it("NJ-1040 tax rate Line 43 - single filer $100,000 includes 6.37% bracket", () => {
    // $20,000 × 1.4%   = $280.00
    // $15,000 × 1.75%  = $262.50
    // $5,000 × 3.5%    = $175.00
    // $35,000 × 5.525% = $1,933.75
    // $25,000 × 6.37%  = $1,592.50
    // Total = $4,243.75 → rounds to $4,244
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(100000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(4244);
  });

  it("NJ-1040 tax rate Line 43 - single filer $500,000 fills through 6.37% bracket", () => {
    // $20,000 × 1.4%     = $280.00
    // $15,000 × 1.75%    = $262.50
    // $5,000 × 3.5%      = $175.00
    // $35,000 × 5.525%   = $1,933.75
    // $425,000 × 6.37%   = $27,072.50
    // Total = $29,723.75 → rounds to $29,724
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(500000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(29724);
  });

  it("NJ-1040 tax rate Line 43 - single filer $1,000,000 fills through 8.97% bracket", () => {
    // $20,000 × 1.4%     = $280.00
    // $15,000 × 1.75%    = $262.50
    // $5,000 × 3.5%      = $175.00
    // $35,000 × 5.525%   = $1,933.75
    // $425,000 × 6.37%   = $27,072.50
    // $500,000 × 8.97%   = $44,850.00
    // Total = $74,573.75 → rounds to $74,574
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(1000000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(74574);
  });

  it("NJ-1040 tax rate Line 43 - single filer $1,000,001 pays 10.75% on $1 above $1M", () => {
    // Base through $1M = $74,573.75
    // $1 × 10.75% = $0.1075
    // Total = $74,573.8575 → rounds to $74,574
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(1000001),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(74574);
  });

  it("NJ-1040 tax rate Line 43 - single filer $2,000,000 uses top bracket on $1M", () => {
    // Base through $1M = $74,573.75
    // $1,000,000 × 10.75% = $107,500
    // Total = $182,073.75 → rounds to $182,074
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(2000000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(182074);
  });

  // --- Table B (MFJ/HOH/QSS) bracket computations ---

  it("NJ-1040 tax rate Line 43 - MFJ filer $50,000 uses the published Table B tax-table amount of $806", () => {
    // The $50,000 row is still in the tax-table path and uses midpoint $50,025.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(806);
  });

  it("NJ-1040 tax rate Line 43 - head of household $39,850 uses the published Table B row amount of $628", () => {
    // 2025 NJ-1040 Tax Table, p. 58, row $39,850-$39,900, filing-status column 2/4/5.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(39850),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(628);
  });

  it("NJ-1040 tax rate Line 43 - MFJ filer $70,000 still uses the tax table below $100,000", () => {
    // Midpoint $70,025 produces the published tax-table amount of $1,296.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(70000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(1296);
  });

  it("NJ-1040 tax rate Line 43 - MFJ filer $80,000 uses the published Table B tax-table amount of $1,646", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(80000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(1646);
  });

  it("NJ-1040 tax rate Line 43 - MFJ filer $150,000 fills through 5.525% bracket", () => {
    // $20,000 × 1.4%   = $280.00
    // $30,000 × 1.75%  = $525.00
    // $20,000 × 2.45%  = $490.00
    // $10,000 × 3.5%   = $350.00
    // $70,000 × 5.525% = $3,867.50
    // Total = $5,512.50 → rounds to $5,513
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(150000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(5513);
  });

  it("NJ-1040 tax rate Line 43 - qualifying surviving spouse $150,000 matches the published Table B schedule amount of $5,513", () => {
    // 2025 NJ-1040 Tax Rate Schedules, p. 64 Table B:
    // ($150,000 × 5.525%) - $2,775 = $5,512.50 → $5,513 after rounding.
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(150000),
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(5513);
  });

  it("NJ-1040 tax rate Line 43 - MFJ filer $500,000 fills through 6.37% bracket", () => {
    // $20,000 × 1.4%     = $280.00
    // $30,000 × 1.75%    = $525.00
    // $20,000 × 2.45%    = $490.00
    // $10,000 × 3.5%     = $350.00
    // $70,000 × 5.525%   = $3,867.50
    // $350,000 × 6.37%   = $22,295.00
    // Total = $27,807.50 → rounds to $27,808
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(500000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(27808);
  });

  it("NJ-1040 tax rate Line 43 - MFJ filer $1,000,000 fills through 8.97% bracket", () => {
    // $20,000 × 1.4%     = $280.00
    // $30,000 × 1.75%    = $525.00
    // $20,000 × 2.45%    = $490.00
    // $10,000 × 3.5%     = $350.00
    // $70,000 × 5.525%   = $3,867.50
    // $350,000 × 6.37%   = $22,295.00
    // $500,000 × 8.97%   = $44,850.00
    // Total = $72,657.50 → rounds to $72,658
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(1000000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(72658);
  });

  // --- Table B difference from Table A ---

  it("NJ-1040 tax rate Line 43 - Table B produces different tax than Table A at $50,000", () => {
    const single = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "single",
      taxYear: 2025,
    });
    const mfj = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    // Published tax-table amounts differ by filing-status column.
    expect(single.tax.toNumber()).toBe(1271);
    expect(mfj.tax.toNumber()).toBe(806);
    expect(single.tax.greaterThan(mfj.tax)).toBe(true);
  });

  // --- Boundary at bracket edge ---

  it("NJ-1040 tax rate Line 43 - income exactly at bracket boundary pays nothing in next bracket", () => {
    // $20,000 exactly: $280 total (all at 1.4%)
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(20000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result.tax.toNumber()).toBe(280);

    // $20,001: $280 + $0.0175 = $280.0175 → rounds to $280
    const result2 = calculateNJ1040TaxRate({
      taxableIncome: d(20001),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(result2.tax.toNumber()).toBe(280);
  });

  // --- Audit trail ---

  it("NJ-1040 tax rate - audit trail records all lines", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(50000),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.lines).toHaveLength(3);
    expect(result.lines.map((l) => l.line)).toEqual(["42", "43-table", "43"]);
    expect(result.lines[2]?.inputs).toMatchObject({
      Table: "A",
    });
  });

  // --- Error cases ---

  it("NJ-1040 tax rate - unsupported tax year throws a clear error", () => {
    expect(() =>
      calculateNJ1040TaxRate({
        taxableIncome: d(50000),
        filingStatus: "single",
        taxYear: 2024,
      })
    ).toThrow("NJ-1040 tax rate rules not available for tax year 2024");
  });

  // --- Effective rate ---

  it("NJ-1040 tax rate - effective rate is computed correctly", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(100000),
      filingStatus: "single",
      taxYear: 2025,
    });
    // Tax = $4,244 on $100,000 → effective rate = 4.244%
    expect(result.effectiveRate.toNumber()).toBeCloseTo(0.04244, 5);
  });

  it("NJ-1040 tax rate - zero income has zero effective rate", () => {
    const result = calculateNJ1040TaxRate({
      taxableIncome: d(0),
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.effectiveRate.toNumber()).toBe(0);
  });

  // --- MFS uses Table A ---

  it("NJ-1040 tax rate Line 43 - MFS pays same as single at same income", () => {
    const single = calculateNJ1040TaxRate({
      taxableIncome: d(75000),
      filingStatus: "single",
      taxYear: 2025,
    });
    const mfs = calculateNJ1040TaxRate({
      taxableIncome: d(75000),
      filingStatus: "married_filing_separately",
      taxYear: 2025,
    });
    expect(mfs.tax.toNumber()).toBe(single.tax.toNumber());
  });

  // --- HOH uses Table B ---

  it("NJ-1040 tax rate Line 43 - HOH pays same as MFJ at same income", () => {
    const mfj = calculateNJ1040TaxRate({
      taxableIncome: d(100000),
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    const hoh = calculateNJ1040TaxRate({
      taxableIncome: d(100000),
      filingStatus: "head_of_household",
      taxYear: 2025,
    });
    expect(hoh.tax.toNumber()).toBe(mfj.tax.toNumber());
  });
});

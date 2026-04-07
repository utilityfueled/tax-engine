/**
 * Tests for New York IT-201 tax computation (Line 39).
 * Spec: spec/state/ny-it201-tax-computation.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201Tax,
  computeRateScheduleTax,
  getBracketGroup,
  NY_TAX_RATE_SCHEDULES,
} from "@/engine/state/ny-it201-tax-computation.js";

const d = (value: string | number) => new Decimal(value);
const tax2025 = (nyAgi: number, taxableIncome: number, filingStatus: Parameters<typeof calculateNYIT201Tax>[0]["filingStatus"]) =>
  calculateNYIT201Tax({ nyAgi, taxableIncome, filingStatus, taxYear: 2025 });

describe("NY IT-201 tax computation", () => {
  /* ---------- Bracket group mapping ---------- */

  it("Line 1 - single maps to single_mfs bracket group", () => {
    expect(getBracketGroup("single")).toBe("single_mfs");
  });

  it("Line 1 - married filing separately maps to single_mfs bracket group", () => {
    expect(getBracketGroup("married_filing_separately")).toBe("single_mfs");
  });

  it("Line 1 - married filing jointly maps to mfj_qss bracket group", () => {
    expect(getBracketGroup("married_filing_jointly")).toBe("mfj_qss");
  });

  it("Line 1 - qualifying surviving spouse maps to mfj_qss bracket group", () => {
    expect(getBracketGroup("qualifying_surviving_spouse")).toBe("mfj_qss");
  });

  it("Line 1 - head of household maps to hoh bracket group", () => {
    expect(getBracketGroup("head_of_household")).toBe("hoh");
  });

  /* ---------- Rate schedule - zero and edge cases ---------- */

  it("Line 3 - zero taxable income produces zero tax", () => {
    const result = tax2025(50000, 0, "single");
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Line 3 - very small taxable income uses the published tax table", () => {
    // Official 2025 NY tax table row $5,000-$5,050 for single: $201
    const result = tax2025(50000, 5000, "single");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(201);
  });

  /* ---------- Tax table - Single / MFS ---------- */

  it("Line 3 - single filer $8,500 taxable income uses the tax table boundary row", () => {
    // Official 2025 NY tax table row $8,500-$8,550 for single: $341
    const result = tax2025(50000, 8500, "single");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(341);
  });

  it("Line 3 - single filer $10,000 uses the published tax table", () => {
    // Official 2025 NY tax table row $10,000-$10,050 for single: $409
    const result = tax2025(50000, 10000, "single");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(409);
  });

  it("Line 3 - single filer $50,000 uses the published tax table", () => {
    // Official 2025 NY tax table row $50,000-$50,050 for single: $2,587
    const result = tax2025(50000, 50000, "single");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(2587);
  });

  /* ---------- Rate schedule - Single / MFS ---------- */

  it("Line 3 - single filer $100,000 in fifth bracket uses the rate schedule", () => {
    // $4,271 + 6% * ($100,000 - $80,650) = $4,271 + $1,161 = $5,432
    const result = tax2025(100000, 100000, "single");
    expect(result.computationMethod).toBe("rate_schedule");
    expect(result.tax.toNumber()).toBe(5432);
  });

  it("Line 3 - single filer $80,650 at exact bracket boundary", () => {
    // $600 + 5.5% * ($80,650 - $13,900) = $600 + $3,671.25 = $4,271.25 → $4,271
    const result = tax2025(80000, 80650, "single");
    expect(result.tax.toNumber()).toBe(4271);
  });

  it("Line 3 - single filer $500,000 in sixth bracket", () => {
    // $12,356 + 6.85% * ($500,000 - $215,400) = $12,356 + $19,495.10 = $31,851.10 → $31,851
    const result = tax2025(100000, 500000, "single");
    expect(result.tax.toNumber()).toBe(31851);
  });

  /* ---------- Rate schedule - MFJ / QSS ---------- */

  it("Line 3 - MFJ filer $38,275 uses the official published example", () => {
    // Official 2025 NY tax table example: row $38,250-$38,300 for MFJ = $1,773
    const result = tax2025(50000, 38275, "married_filing_jointly");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(1773);
  });

  it("Line 3 - MFJ filer $17,150 at exact bracket boundary", () => {
    // Official 2025 NY tax table row $17,150-$17,200 for MFJ: $687
    const result = tax2025(50000, 17150, "married_filing_jointly");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(687);
  });

  it("Line 3 - MFJ filer $100,000 in fourth bracket", () => {
    // $1,202 + 5.5% * ($100,000 - $27,900) = $1,202 + $3,965.50 = $5,167.50 → $5,168
    const result = tax2025(100000, 100000, "married_filing_jointly");
    expect(result.tax.toNumber()).toBe(5168);
  });

  it("Line 3 - QSS uses same brackets as MFJ", () => {
    const mfj = tax2025(100000, 100000, "married_filing_jointly");
    const qss = tax2025(100000, 100000, "qualifying_surviving_spouse");
    expect(qss.tax.toNumber()).toBe(mfj.tax.toNumber());
  });

  /* ---------- Rate schedule - Head of household ---------- */

  it("Line 3 - HoH filer $50,000 uses the published tax table", () => {
    // Official 2025 NY tax table row $50,000-$50,050 for HoH: $2,503
    const result = tax2025(50000, 50000, "head_of_household");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(2503);
  });

  it("Line 3 - HoH filer $200,000 in fifth bracket", () => {
    // $5,672 + 6% * ($200,000 - $107,650) = $5,672 + $5,541 = $11,213
    const result = tax2025(100000, 200000, "head_of_household");
    expect(result.tax.toNumber()).toBe(11213);
  });

  /* ---------- Computation method selection ---------- */

  it("Line 1 - AGI at or below $107,650 and taxable income below $65,000 uses the tax table", () => {
    const result = tax2025(107650, 64999, "single");
    expect(result.computationMethod).toBe("tax_table");
    expect(result.tax.toNumber()).toBe(3409);
  });

  it("Line 1 - AGI of $107,650.40 rounds down to the non-recapture threshold", () => {
    const result = calculateNYIT201Tax({
      nyAgi: "107650.40",
      taxableIncome: 90000,
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.nyAgi.toNumber()).toBe(107650);
    expect(result.computationMethod).toBe("rate_schedule");
    expect(result.recaptureAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(4832);
  });

  it("Line 1 - taxable income of exactly $65,000 uses the rate schedule", () => {
    const result = tax2025(107650, 65000, "single");
    expect(result.computationMethod).toBe("rate_schedule");
    expect(result.tax.toNumber()).toBe(3411);
  });

  it("Line 3 - taxable income of $64,999.60 rounds to $65,000 and uses the rate schedule", () => {
    const result = calculateNYIT201Tax({
      nyAgi: 107650,
      taxableIncome: "64999.60",
      filingStatus: "single",
      taxYear: 2025,
    });

    expect(result.taxableIncome.toNumber()).toBe(65000);
    expect(result.computationMethod).toBe("rate_schedule");
    expect(result.tax.toNumber()).toBe(3411);
  });

  it("Line 1 - AGI at exactly $107,650 uses rate schedule (no recapture)", () => {
    const result = tax2025(107650, 90000, "single");
    expect(result.computationMethod).toBe("rate_schedule");
    expect(result.recaptureAmount.toNumber()).toBe(0);
  });

  it("Line 1 - AGI at $107,651 triggers recapture worksheet", () => {
    const result = tax2025(107651, 90000, "single");
    expect(result.computationMethod).toBe("recapture_worksheet");
    expect(result.worksheetNumber).toBe(7);
  });

  /* ---------- Recapture worksheets - MFJ ---------- */

  it("Line 4 - MFJ worksheet 1: AGI $120,000, TI $100,000 in first tier", () => {
    // WS1: simple rate 5.5%, phase-in over $50,000
    // Excess AGI = $120,000 - $107,650 = $12,350
    // Ratio = $12,350 / $50,000 = 0.2470
    // Simple-rate tax = $100,000 × 0.055 = $5,500
    // Rate schedule tax = $1,202 + 5.5% × ($100,000 - $27,900) = $5,167.50
    // Additional recapture = ($5,500 - $5,167.50) × 0.2470 = $82.1475
    // Final = $5,167.50 + $82.1475 = $5,249.6475 → $5,250
    const result = tax2025(120000, 100000, "married_filing_jointly");
    expect(result.computationMethod).toBe("recapture_worksheet");
    expect(result.worksheetNumber).toBe(1);
    expect(result.tax.toNumber()).toBe(5250);
  });

  it("Line 4 - MFJ worksheet 1: AGI $157,650 or more triggers stop condition", () => {
    // WS1: AGI ≥ $157,650 means line 9 equals the simple-rate tax directly
    // TI = $150,000: simple-rate tax = $150,000 × 0.055 = $8,250
    // Rate schedule tax = $1,202 + 5.5% × ($150,000 - $27,900) = $7,917.50
    // Final = $8,250
    const result = tax2025(157650, 150000, "married_filing_jointly");
    expect(result.worksheetNumber).toBe(1);
    expect(result.tax.toNumber()).toBe(8250);
  });

  it("Line 4 - MFJ worksheet 2: AGI $200,000, TI $200,000", () => {
    // WS2: recaptureBase=333, benefit=807, excess over 161550
    // Excess AGI = $200,000 - $161,550 = $38,450
    // Ratio = $38,450 / $50,000 = 0.7690
    // Phased benefit = $807 × 0.7690 = $620.583 (exact Decimal)
    // Recapture = $333 + $620.583 = $953.583
    // Rate schedule tax = $8,553 + 6% × ($200,000 - $161,550) = $8,553 + $2,307 = $10,860
    // Final = $10,860 + $953.583 = $11,813.583 → $11,814
    const result = tax2025(200000, 200000, "married_filing_jointly");
    expect(result.computationMethod).toBe("recapture_worksheet");
    expect(result.worksheetNumber).toBe(2);
    expect(result.tax.toNumber()).toBe(11814);
  });

  it("Line 4 - MFJ worksheet 6: AGI over $25M uses flat 10.9%", () => {
    // TI = $30,000,000 × 10.9% = $3,270,000
    const result = tax2025(30000000, 30000000, "married_filing_jointly");
    expect(result.computationMethod).toBe("flat_rate");
    expect(result.worksheetNumber).toBe(6);
    expect(result.tax.toNumber()).toBe(3270000);
  });

  /* ---------- Recapture worksheets - Single ---------- */

  it("Line 4 - Single worksheet 7: AGI $130,000, TI $120,000 in first tier", () => {
    // WS7: simple rate 6%, phase-in over $50,000
    // Excess AGI = $130,000 - $107,650 = $22,350
    // Ratio = $22,350 / $50,000 = 0.4470
    // Simple-rate tax = $120,000 × 0.06 = $7,200
    // Rate schedule: $4,271 + 6% × ($120,000 - $80,650) = $4,271 + $2,361 = $6,632
    // Additional recapture = ($7,200 - $6,632) × 0.4470 = $253.896
    // Final = $6,632 + $253.896 = $6,885.896 → $6,886
    const result = tax2025(130000, 120000, "single");
    expect(result.computationMethod).toBe("recapture_worksheet");
    expect(result.worksheetNumber).toBe(7);
    expect(result.tax.toNumber()).toBe(6886);
  });

  it("Line 4 - Single worksheet 8: AGI $300,000, TI $280,000", () => {
    // WS8: recaptureBase=568, benefit=1831, excess over $215,400
    // Excess AGI = $300,000 - $215,400 = $84,600 → capped at $50,000
    // Ratio = $50,000 / $50,000 = 1.0000
    // Phased benefit = $1,831 × 1.0000 = $1,831
    // Recapture = $568 + $1,831 = $2,399
    // Rate schedule: $12,356 + 6.85% × ($280,000 - $215,400) = $12,356 + $4,424.90 = $16,780.90
    // Final = $16,780.90 + $2,399 = $19,179.90 → $19,180
    const result = tax2025(300000, 280000, "single");
    expect(result.worksheetNumber).toBe(8);
    expect(result.tax.toNumber()).toBe(19180);
  });

  it("Line 4 - Single worksheet 11: AGI over $25M uses flat 10.9%", () => {
    const result = tax2025(26000000, 25500000, "single");
    expect(result.computationMethod).toBe("flat_rate");
    expect(result.worksheetNumber).toBe(11);
    // $25,500,000 × 10.9% = $2,779,500
    expect(result.tax.toNumber()).toBe(2779500);
  });

  /* ---------- Recapture worksheets - Head of household ---------- */

  it("Line 4 - HoH worksheet 12: AGI $140,000, TI $130,000", () => {
    // WS12: simple rate 6%, phase-in over $50,000
    // Excess AGI = $140,000 - $107,650 = $32,350
    // Ratio = $32,350 / $50,000 = 0.6470
    // Simple-rate tax = $130,000 × 0.06 = $7,800
    // Rate schedule: $5,672 + 6% × ($130,000 - $107,650) = $5,672 + $1,341 = $7,013
    // Additional recapture = ($7,800 - $7,013) × 0.6470 = $509.189
    // Final = $7,013 + $509.189 = $7,522.189 → $7,522
    const result = tax2025(140000, 130000, "head_of_household");
    expect(result.worksheetNumber).toBe(12);
    expect(result.tax.toNumber()).toBe(7522);
  });

  it("Line 4 - HoH worksheet 16: AGI over $25M uses flat 10.9%", () => {
    const result = tax2025(30000000, 28000000, "head_of_household");
    expect(result.computationMethod).toBe("flat_rate");
    expect(result.worksheetNumber).toBe(16);
    expect(result.tax.toNumber()).toBe(3052000);
  });

  /* ---------- High bracket tests ---------- */

  it("Line 3 - single filer in 9.65% bracket", () => {
    // TI = $2,000,000
    // $71,413 + 9.65% × ($2,000,000 - $1,077,550) = $71,413 + $89,016.425 = $160,429.425 → $160,429
    const result = tax2025(100000, 2000000, "single");
    expect(result.tax.toNumber()).toBe(160429);
  });

  it("Line 3 - MFJ filer in 10.3% bracket", () => {
    // TI = $10,000,000
    // $418,263 + 10.3% × ($10,000,000 - $5,000,000) = $418,263 + $515,000 = $933,263
    const result = tax2025(100000, 10000000, "married_filing_jointly");
    expect(result.tax.toNumber()).toBe(933263);
  });

  it("Line 3 - single filer in top 10.9% bracket", () => {
    // TI = $30,000,000
    // $2,509,929 + 10.9% × ($30,000,000 - $25,000,000) = $2,509,929 + $545,000 = $3,054,929
    const result = tax2025(100000, 30000000, "single");
    expect(result.tax.toNumber()).toBe(3054929);
  });

  /* ---------- Audit trail ---------- */

  it("Line 5 - audit trail records all computation lines", () => {
    const result = tax2025(50000, 50000, "single");
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const formLines = result.lines.filter((l) => l.form === "NY-IT201");
    expect(formLines.length).toBeGreaterThanOrEqual(3);
  });

  it("Line 5 - recapture audit trail includes worksheet number", () => {
    const result = tax2025(200000, 200000, "married_filing_jointly");
    const rcLine = result.lines.find((l) => l.line === "39-RC");
    expect(rcLine).toBeDefined();
    expect(rcLine!.inputs["Worksheet number"]).toBe("2");
  });

  /* ---------- Error handling ---------- */

  it("unsupported tax year throws a clear error", () => {
    expect(() =>
      calculateNYIT201Tax({
        nyAgi: 50000,
        taxableIncome: 40000,
        filingStatus: "single",
        taxYear: 2024,
      })
    ).toThrow("NY IT-201 tax computation not available for tax year 2024");
  });

  /* ---------- Married filing separately uses same brackets as single ---------- */

  it("MFS uses same rate schedule as single", () => {
    const single = tax2025(50000, 50000, "single");
    const mfs = tax2025(50000, 50000, "married_filing_separately");
    expect(mfs.tax.toNumber()).toBe(single.tax.toNumber());
    expect(mfs.bracketGroup).toBe("single_mfs");
  });
});

/**
 * Form 6251 — Alternative Minimum Tax (AMT)
 * Spec: spec/federal/form-6251.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import type { Form6251Input } from "@/engine/forms/form-6251.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeInput(overrides: Partial<Form6251Input> = {}): Form6251Input {
  return {
    taxableIncome: d(100000),
    saltDeduction: d(10000),
    regularTax: d(15000),
    filingStatus: "single",
    isItemizing: true,
    ...overrides,
  };
}

describe("Form 6251", () => {
  // ── Line 1: Taxable income ──────────────────────────────
  it("Line 1 - taxable income passes through", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(250000) }), c);
    expect(result.taxableIncome.toNumber()).toBe(250000);
  });

  // ── Line 2a: SALT add-back ──────────────────────────────
  it("Line 2a - SALT add-back when itemizing", () => {
    const result = calculateForm6251(makeInput({ saltDeduction: d(10000), isItemizing: true }), c);
    expect(result.saltAddBack.toNumber()).toBe(10000);
  });

  it("Line 2a - no SALT add-back when not itemizing", () => {
    const result = calculateForm6251(makeInput({ saltDeduction: d(10000), isItemizing: false }), c);
    expect(result.saltAddBack.toNumber()).toBe(0);
  });

  // ── Line 7: AMTI ───────────────────────────────────────
  it("Line 7 - AMTI equals taxable income plus SALT add-back", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(200000), saltDeduction: d(10000) }), c);
    expect(result.amti.toNumber()).toBe(210000);
  });

  it("Line 7 - AMTI equals taxable income when standard deduction", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(200000), isItemizing: false }), c);
    expect(result.amti.toNumber()).toBe(200000);
  });

  // ── Line 8: Exemption ──────────────────────────────────
  it("Line 8 - full exemption for single filer below phase-out", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(200000) }), c);
    // AMTI = 210000, well below phase-out of 626350
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("Line 8 - full exemption for MFJ below phase-out", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(500000),
      filingStatus: "married_filing_jointly",
    }), c);
    // AMTI = 510000, below MFJ phase-out of 1252700
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("Line 8 - MFS exemption is half of MFJ", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    // AMTI = 205000, below MFS phase-out of 626350
    expect(result.exemption.toNumber()).toBe(68500);
  });

  it("Line 8 - exemption phases out at 25 cents per dollar over threshold (single)", () => {
    // Single phase-out starts at 626350, exemption = 88100
    // AMTI = 700000. Excess = 700000 - 626350 = 73650
    // Reduction = 73650 * 0.25 = 18412.50 → rounded = 18413
    // Exemption = 88100 - 18413 = 69687
    const result = calculateForm6251(makeInput({
      taxableIncome: d(690000),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(700000);
    const excess = 700000 - 626350;
    const reduction = Math.round(excess * 0.25);
    expect(result.exemption.toNumber()).toBe(88100 - reduction);
  });

  it("Line 8 - exemption fully phased out at very high income", () => {
    // Full phase-out when reduction >= exemption
    // 88100 / 0.25 = 352400 over threshold → AMTI = 626350 + 352400 = 978750
    const result = calculateForm6251(makeInput({
      taxableIncome: d(990000),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(1000000);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Line 8 - exemption at exact phase-out threshold", () => {
    // AMTI exactly at threshold → no reduction
    const result = calculateForm6251(makeInput({
      taxableIncome: d(616350),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(626350);
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("Line 8 - exemption $1 over phase-out threshold", () => {
    // AMTI = 626351, excess = 1, reduction = round(0.25) = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(616351),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(626351);
    // Reduction = round(1 * 0.25) = round(0.25) = 0
    expect(result.exemption.toNumber()).toBe(88100);
  });

  // ── Line 9: AMT base ──────────────────────────────────
  it("Line 9 - AMT base is AMTI minus exemption", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(200000) }), c);
    // AMTI = 210000, exemption = 88100
    expect(result.amtBase.toNumber()).toBe(210000 - 88100);
  });

  it("Line 9 - AMT base floors at zero", () => {
    // Very low income: AMTI < exemption
    const result = calculateForm6251(makeInput({
      taxableIncome: d(50000),
      saltDeduction: d(0),
      isItemizing: false,
    }), c);
    // AMTI = 50000, exemption = 88100
    expect(result.amtBase.toNumber()).toBe(0);
  });

  // ── Line 10: Tentative minimum tax ─────────────────────
  it("Line 10 - tentative minimum tax at 26% for base under limit", () => {
    // Single rate26Limit = 239100
    const result = calculateForm6251(makeInput({ taxableIncome: d(200000) }), c);
    // AMT base = 210000 - 88100 = 121900
    const expected = Math.round(121900 * 0.26);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expected);
  });

  it("Line 10 - tentative minimum tax with 26%/28% split", () => {
    // Need AMT base > 239100
    // Single: taxable=800000, SALT=10000 → AMTI=810000
    // Exemption: 810000-626350=183650 excess, reduction=round(183650*0.25)=45913
    // Exemption = 88100-45913 = 42187
    // AMT base = 810000-42187 = 767813
    const result = calculateForm6251(makeInput({
      taxableIncome: d(800000),
      saltDeduction: d(10000),
    }), c);
    const amtBase = result.amtBase.toNumber();
    expect(amtBase).toBeGreaterThan(239100);
    const at26 = Math.round(239100 * 0.26);
    const at28 = Math.round((amtBase - 239100) * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });

  it("Line 10 - MFS rate26Limit is $119,550", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    // AMTI = 305000, exemption = 68500 (below phase-out 626350)
    // AMT base = 305000 - 68500 = 236500
    // 236500 > 119550 → split rates
    const at26 = Math.round(119550 * 0.26);
    const at28 = Math.round((236500 - 119550) * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });

  it("Line 10 - qualified dividends use preferential AMT rates from Part III", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(250000),
      saltDeduction: d(10000),
      regularTax: d(35000),
      qualifiedDividends: d(50000),
    }), c);
    expect(result.amti.toNumber()).toBe(260000);
    expect(result.amtBase.toNumber()).toBe(171900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(39194);
    expect(result.amt.toNumber()).toBe(4194);
  });

  it("Line 10 - zero AMT base means zero tentative minimum tax", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(50000),
      saltDeduction: d(0),
      isItemizing: false,
    }), c);
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
  });

  // ── Line 11: AMT ──────────────────────────────────────
  it("Line 11 - AMT is zero when regular tax exceeds tentative minimum", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      regularTax: d(50000),
    }), c);
    // Tentative minimum = 26% * 121900 = 31694
    expect(result.amt.toNumber()).toBe(0);
  });

  it("Line 11 - AMT is positive when tentative minimum exceeds regular tax", () => {
    // High SALT add-back pushes AMT up
    const result = calculateForm6251(makeInput({
      taxableIncome: d(500000),
      saltDeduction: d(10000),
      regularTax: d(100000),
    }), c);
    // AMTI = 510000, exemption = 88100, base = 421900
    // TMT = 239100*0.26 + (421900-239100)*0.28 = 62166 + 51184 = 113350
    // AMT = 113350 - 100000 = 13350
    expect(result.amt.toNumber()).toBeGreaterThan(0);
    expect(result.amt.toNumber()).toBe(
      result.tentativeMinimumTax.minus(d(100000)).toNumber()
    );
  });

  it("Line 11 - AMT floors at zero", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(100000),
      regularTax: d(999999),
    }), c);
    expect(result.amt.toNumber()).toBe(0);
  });

  // ── Filing status variants ─────────────────────────────
  it("HoH uses same exemption and thresholds as single", () => {
    const singleResult = calculateForm6251(makeInput({
      taxableIncome: d(700000),
      filingStatus: "single",
    }), c);
    const hohResult = calculateForm6251(makeInput({
      taxableIncome: d(700000),
      filingStatus: "head_of_household",
    }), c);
    expect(hohResult.exemption.toNumber()).toBe(singleResult.exemption.toNumber());
    expect(hohResult.amtBase.toNumber()).toBe(singleResult.amtBase.toNumber());
  });

  it("QSS uses same exemption and thresholds as MFJ", () => {
    const mfjResult = calculateForm6251(makeInput({
      taxableIncome: d(500000),
      filingStatus: "married_filing_jointly",
    }), c);
    const qssResult = calculateForm6251(makeInput({
      taxableIncome: d(500000),
      filingStatus: "qualifying_surviving_spouse",
    }), c);
    expect(qssResult.exemption.toNumber()).toBe(mfjResult.exemption.toNumber());
  });

  // ── Edge cases: exemption phase-out boundaries ────────

  it("Line 8 - MFJ exemption at exact phase-out threshold ($1,252,700 AMTI)", () => {
    // AMTI exactly at MFJ phase-out → full exemption preserved
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1242700),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amti.toNumber()).toBe(1252700);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("Line 8 - MFJ exemption fully phased out at very high income", () => {
    // Full phase-out when reduction >= 137000
    // 137000 / 0.25 = 548000 over threshold → AMTI = 1252700 + 548000 = 1800700
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1790700),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amti.toNumber()).toBe(1800700);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Line 8 - MFS exemption is exactly half of MFJ exemption (68500 vs 137000)", () => {
    // Both below their respective phase-outs
    const mfsResult = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      isItemizing: false,
      filingStatus: "married_filing_separately",
    }), c);
    const mfjResult = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      isItemizing: false,
      filingStatus: "married_filing_jointly",
    }), c);
    expect(mfsResult.exemption.toNumber()).toBe(68500);
    expect(mfjResult.exemption.toNumber()).toBe(137000);
    expect(mfsResult.exemption.times(2).toNumber()).toBe(mfjResult.exemption.toNumber());
  });

  it("Line 8 - MFS phase-out threshold ($626,350) and rate26Limit ($119,550) reflect the lower MFS breakpoint", () => {
    // MFS: AMTI = 700000, excess = 700000 - 626350 = 73650
    // Reduction = round(73650 * 0.25) = 18413
    // Exemption = 68500 - 18413 = 50087
    const result = calculateForm6251(makeInput({
      taxableIncome: d(695000),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    expect(result.amti.toNumber()).toBe(700000);
    const reduction = new Decimal(73650).times(new Decimal(0.25)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(result.exemption.toNumber()).toBe(68500 - reduction);
  });

  it("Line 8 - single exemption fully phased out boundary (AMTI = $978,750)", () => {
    // Exact boundary: 88100 / 0.25 = 352400 → AMTI = 626350 + 352400 = 978750
    // Reduction = round(352400 * 0.25) = 88100 → exemption = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(968750),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(978750);
    expect(result.exemption.toNumber()).toBe(0);
  });

  // ── Edge cases: AMTI at exemption amount ──────────────

  it("Line 9 - AMTI exactly equals exemption produces zero AMT base (single)", () => {
    // Single exemption = 88100, need AMTI = 88100
    const result = calculateForm6251(makeInput({
      taxableIncome: d(88100),
      saltDeduction: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(88100);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("Line 9 - AMTI one dollar above exemption produces AMT base of $1 (single)", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(88101),
      saltDeduction: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(88101);
    expect(result.amtBase.toNumber()).toBe(1);
    // TMT = round(1 * 0.26) = 0
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
  });

  // ── Edge cases: AMT = $0 scenarios ────────────────────

  it("Line 11 - AMT is $0 when regular tax greatly exceeds tentative minimum (standard deduction)", () => {
    // Standard deduction filer with moderate income — unlikely to trigger AMT
    const result = calculateForm6251(makeInput({
      taxableIncome: d(150000),
      saltDeduction: d(0),
      isItemizing: false,
      regularTax: d(30000),
    }), c);
    // AMTI = 150000, exemption = 88100, base = 61900
    // TMT = round(61900 * 0.26) = 16094
    // AMT = max(0, 16094 - 30000) = 0
    expect(result.amt.toNumber()).toBe(0);
    expect(result.tentativeMinimumTax.toNumber()).toBe(
      new Decimal(61900).times(new Decimal(0.26)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    );
  });

  it("Line 11 - AMT triggered by large SALT deduction add-back (>$10K)", () => {
    // Filer with $10K SALT deduction — the add-back pushes AMTI high enough
    // to create a positive AMT when regular tax is carefully set
    const result = calculateForm6251(makeInput({
      taxableIncome: d(400000),
      saltDeduction: d(10000),
      isItemizing: true,
      regularTax: d(80000),
    }), c);
    // AMTI = 410000, exemption = 88100, base = 321900
    // TMT = 239100*0.26 + (321900-239100)*0.28 = 62166 + 23184 = 85350
    // AMT = max(0, 85350 - 80000) = 5350
    const at26 = new Decimal(239100).times(new Decimal(0.26)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const at28 = new Decimal(321900 - 239100).times(new Decimal(0.28)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const expectedTMT = at26.plus(at28);
    expect(result.amti.toNumber()).toBe(410000);
    expect(result.amtBase.toNumber()).toBe(321900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expectedTMT.toNumber());
    expect(result.amt.toNumber()).toBe(expectedTMT.minus(d(80000)).toNumber());
    expect(result.amt.toNumber()).toBeGreaterThan(0);
  });

  it("Line 11 - AMT equals exactly zero when tentative minimum equals regular tax", () => {
    // Construct case where TMT == regular tax exactly
    // AMTI = 210000, exemption = 88100, base = 121900
    // TMT = round(121900 * 0.26) = 31694
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(10000),
      isItemizing: true,
      regularTax: d(31694),
    }), c);
    expect(result.tentativeMinimumTax.toNumber()).toBe(31694);
    expect(result.amt.toNumber()).toBe(0);
  });

  // ── Edge cases: negative AMTI adjustments ─────────────

  it("Line 7 - zero SALT with standard deduction means AMTI equals taxable income exactly", () => {
    // No adjustments at all — AMTI = taxable income
    const result = calculateForm6251(makeInput({
      taxableIncome: d(75000),
      saltDeduction: d(15000),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(75000);
    expect(result.saltAddBack.toNumber()).toBe(0);
  });

  it("Line 7 - zero taxable income produces zero AMTI (no SALT if not itemizing)", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(0),
      saltDeduction: d(0),
      isItemizing: false,
      regularTax: d(0),
    }), c);
    expect(result.amti.toNumber()).toBe(0);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  // ── Edge cases: rate boundary ─────────────────────────

  it("Line 10 - AMT base exactly at rate26Limit ($239,100) uses only 26% rate", () => {
    // Need AMT base = 239100 exactly
    // Single: AMTI below phase-out, so exemption = 88100
    // AMT base = AMTI - 88100 = 239100 → AMTI = 327200
    const result = calculateForm6251(makeInput({
      taxableIncome: d(317200),
      saltDeduction: d(10000),
      isItemizing: true,
    }), c);
    expect(result.amti.toNumber()).toBe(327200);
    expect(result.amtBase.toNumber()).toBe(239100);
    const expected = new Decimal(239100).times(new Decimal(0.26)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expected.toNumber());
  });

  it("Line 10 - AMT base one dollar over rate26Limit triggers 28% on excess", () => {
    // AMT base = 239101 → 239100*0.26 + 1*0.28
    const result = calculateForm6251(makeInput({
      taxableIncome: d(317201),
      saltDeduction: d(10000),
      isItemizing: true,
    }), c);
    expect(result.amtBase.toNumber()).toBe(239101);
    const at26 = new Decimal(239100).times(new Decimal(0.26)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const at28 = new Decimal(1).times(new Decimal(0.28)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26.plus(at28).toNumber());
  });

  // ── Audit trail ────────────────────────────────────────
  it("produces audit trail lines for all form lines", () => {
    const result = calculateForm6251(makeInput(), c);
    expect(result.lines.length).toBeGreaterThanOrEqual(6);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("2a");
    expect(lineNumbers).toContain("7");
    expect(lineNumbers).toContain("8");
    expect(lineNumbers).toContain("9");
    expect(lineNumbers).toContain("10");
    expect(lineNumbers).toContain("11");
  });

  // ── New tests ───────────────────────────────────────────

  // AMT exemption amounts by filing status (explicit numeric assertions)
  it("Line 8 - HoH exemption is $88,100 matching single (below phase-out)", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      isItemizing: false,
      filingStatus: "head_of_household",
    }), c);
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("Line 8 - QSS exemption is $137,000 matching MFJ (below phase-out)", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      isItemizing: false,
      filingStatus: "qualifying_surviving_spouse",
    }), c);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  // Phase-out thresholds
  it("Line 8 - MFJ partial phase-out reduces exemption proportionally", () => {
    // MFJ phase-out starts at 1,252,700; full exemption = 137,000
    // AMTI = 1,400,000. Excess = 1,400,000 - 1,252,700 = 147,300
    // Reduction = round(147,300 * 0.25) = 36,825
    // Exemption = 137,000 - 36,825 = 100,175
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1390000),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amti.toNumber()).toBe(1400000);
    const reduction = new Decimal(147300).times(new Decimal(0.25))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(result.exemption.toNumber()).toBe(137000 - reduction);
  });

  it("Line 8 - QSS uses MFJ phase-out threshold ($1,252,700)", () => {
    // QSS: AMTI at MFJ phase-out threshold → full exemption preserved
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1242700),
      saltDeduction: d(10000),
      filingStatus: "qualifying_surviving_spouse",
    }), c);
    expect(result.amti.toNumber()).toBe(1252700);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("Line 8 - MFS exemption fully phased out at AMTI = $900,350", () => {
    // MFS phase-out threshold = 626,350; exemption = 68,500
    // Full phase-out: 68,500 / 0.25 = 274,000 over threshold
    // AMTI = 626,350 + 274,000 = 900,350
    const result = calculateForm6251(makeInput({
      taxableIncome: d(895350),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    expect(result.amti.toNumber()).toBe(900350);
    expect(result.exemption.toNumber()).toBe(0);
  });

  // 26% / 28% rate boundary
  it("Line 10 - MFJ rate26Limit is also $239,100", () => {
    // MFJ: AMTI below phase-out, AMT base = 239,100 exactly → only 26% applies
    // Need AMTI - 137,000 = 239,100 → AMTI = 376,100
    const result = calculateForm6251(makeInput({
      taxableIncome: d(366100),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amtBase.toNumber()).toBe(239100);
    const expected = new Decimal(239100).times(new Decimal(0.26))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expected.toNumber());
  });

  // AMT = max(0, TMT - regularTax) edge cases
  it("Line 11 - AMT is zero when regular tax exceeds TMT by exactly $1", () => {
    // AMTI = 210,000, exemption = 88,100, base = 121,900
    // TMT = round(121,900 * 0.26) = 31,694
    // regularTax = 31,695 → AMT = max(0, 31,694 - 31,695) = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(10000),
      isItemizing: true,
      regularTax: d(31695),
    }), c);
    expect(result.tentativeMinimumTax.toNumber()).toBe(31694);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("Line 11 - AMT is $1 when TMT exceeds regular tax by exactly $1", () => {
    // Using same TMT = 31,694; set regularTax = 31,693 → AMT = 1
    const result = calculateForm6251(makeInput({
      taxableIncome: d(200000),
      saltDeduction: d(10000),
      isItemizing: true,
      regularTax: d(31693),
    }), c);
    expect(result.tentativeMinimumTax.toNumber()).toBe(31694);
    expect(result.amt.toNumber()).toBe(1);
  });

  // SALT add-back as AMT preference
  it("Line 2a - itemizing with zero SALT produces no add-back", () => {
    const result = calculateForm6251(makeInput({
      saltDeduction: d(0),
      isItemizing: true,
    }), c);
    expect(result.saltAddBack.toNumber()).toBe(0);
    expect(result.amti.toNumber()).toBe(result.taxableIncome.toNumber());
  });

  it("Line 2a - SALT add-back increases AMTI and can push filer into AMT", () => {
    // Without SALT: AMTI = 300,000, base = 211,900, TMT = 55,094 (26%)
    // With SALT = 10,000: AMTI = 310,000, base = 221,900, TMT = 57,694 (26%)
    // regularTax set so only the SALT version triggers AMT
    const withoutSalt = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      isItemizing: false,
      regularTax: d(56000),
    }), c);
    const withSalt = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      isItemizing: true,
      regularTax: d(56000),
    }), c);
    expect(withoutSalt.amt.toNumber()).toBe(0);
    expect(withSalt.amt.toNumber()).toBeGreaterThan(0);
  });

  // Audit trail line descriptions
  it("audit trail Line 1 description references taxable income", () => {
    const result = calculateForm6251(makeInput({ taxableIncome: d(150000) }), c);
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(150000);
  });

  it("audit trail Line 11 value matches amt output field", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(500000),
      saltDeduction: d(10000),
      regularTax: d(90000),
    }), c);
    const line11 = result.lines.find((l) => l.line === "11");
    expect(line11).toBeDefined();
    expect(line11!.value.toNumber()).toBe(result.amt.toNumber());
  });

  // Very high income fully phasing out exemption
  it("Line 8 - single at AMTI $1,500,000 produces zero exemption and full 28% TMT on all base", () => {
    // AMTI = 1,500,000, well past 978,750 phase-out point → exemption = 0
    // AMT base = 1,500,000
    // TMT = 248,300*0.26 + (1,500,000 - 248,300)*0.28
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1490000),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(1500000);
    expect(result.exemption.toNumber()).toBe(0);
    expect(result.amtBase.toNumber()).toBe(1500000);
    const at26 = new Decimal(239100).times(new Decimal(0.26))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const at28 = new Decimal(1500000 - 239100).times(new Decimal(0.28))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26.plus(at28).toNumber());
  });

  // ── Rounding boundary tests ───────────────────────────────
  // ROUND_HALF_UP on the 25% reduction shifts boundaries by $2 from the
  // "neat" algebraic values. These tests pin the actual rounding behavior.

  it("Line 8 - first $1 exemption reduction at AMTI $626,352 (single) due to ROUND_HALF_UP of 0.50", () => {
    // Excess = 626352 - 626350 = 2
    // Reduction = roundDollar(2 * 0.25) = roundDollar(0.50) = 1 (ROUND_HALF_UP)
    // Exemption = 88100 - 1 = 88099
    const result = calculateForm6251(makeInput({
      taxableIncome: d(616352),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(626352);
    expect(result.exemption.toNumber()).toBe(88099);
  });

  it("Line 8 - actual full phase-out boundary at AMTI $978,748 (single), 2 below neat $978,750", () => {
    // Excess = 978748 - 626350 = 352398
    // Reduction = roundDollar(352398 * 0.25) = roundDollar(88099.50) = 88100 (ROUND_HALF_UP)
    // Exemption = 88100 - 88100 = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(968748),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(978748);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Line 8 - $1 exemption remains at AMTI $978,747 (single), confirming rounding boundary", () => {
    // Excess = 978747 - 626350 = 352397
    // Reduction = roundDollar(352397 * 0.25) = roundDollar(88099.25) = 88099
    // Exemption = 88100 - 88099 = 1
    const result = calculateForm6251(makeInput({
      taxableIncome: d(968747),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(978747);
    expect(result.exemption.toNumber()).toBe(1);
  });

  it("Line 8 - MFJ actual full phase-out at AMTI $1,800,698 (2 below neat $1,800,700)", () => {
    // Excess = 1800698 - 1252700 = 547998
    // Reduction = roundDollar(547998 * 0.25) = roundDollar(136999.50) = 137000 (ROUND_HALF_UP)
    // Exemption = 137000 - 137000 = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1790698),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amti.toNumber()).toBe(1800698);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Line 8 - MFJ $1 exemption remains at AMTI $1,800,697", () => {
    // Excess = 1800697 - 1252700 = 547997
    // Reduction = roundDollar(547997 * 0.25) = roundDollar(136999.25) = 136999
    // Exemption = 137000 - 136999 = 1
    const result = calculateForm6251(makeInput({
      taxableIncome: d(1790697),
      saltDeduction: d(10000),
      filingStatus: "married_filing_jointly",
    }), c);
    expect(result.amti.toNumber()).toBe(1800697);
    expect(result.exemption.toNumber()).toBe(1);
  });

  it("Line 8 - MFS actual full phase-out at AMTI $900,348 (2 below neat $900,350)", () => {
    // Excess = 900348 - 626350 = 273998
    // Reduction = roundDollar(273998 * 0.25) = roundDollar(68499.50) = 68500 (ROUND_HALF_UP)
    // Exemption = 68500 - 68500 = 0
    const result = calculateForm6251(makeInput({
      taxableIncome: d(895348),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    expect(result.amti.toNumber()).toBe(900348);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Line 8 - MFS $1 exemption remains at AMTI $900,347", () => {
    // Excess = 900347 - 626350 = 273997
    // Reduction = roundDollar(273997 * 0.25) = roundDollar(68499.25) = 68499
    // Exemption = 68500 - 68499 = 1
    const result = calculateForm6251(makeInput({
      taxableIncome: d(895347),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
    }), c);
    expect(result.amti.toNumber()).toBe(900347);
    expect(result.exemption.toNumber()).toBe(1);
  });

  // ── Lines 2c, 2k, 2l, 3: K-1 AMT adjustments ──────────

  it("Line 2c - depletion adjustment increases AMTI", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depletionAdjustment: d(5000),
    }), c);
    // AMTI = 300000 + 10000 (SALT) + 5000 (depletion) = 315000
    expect(result.amti.toNumber()).toBe(315000);
    expect(result.depletionAdjustment.toNumber()).toBe(5000);
  });

  it("Line 2k - disposition adjustment affects AMTI", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      dispositionAdjustment: d(8000),
    }), c);
    // AMTI = 300000 + 10000 + 8000 = 318000
    expect(result.amti.toNumber()).toBe(318000);
    expect(result.dispositionAdjustment.toNumber()).toBe(8000);
  });

  it("Line 2l - depreciation adjustment increases AMTI", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depreciationAdjustment: d(12000),
    }), c);
    // AMTI = 300000 + 10000 + 12000 = 322000
    expect(result.amti.toNumber()).toBe(322000);
    expect(result.depreciationAdjustment.toNumber()).toBe(12000);
  });

  it("Line 2l - negative depreciation adjustment decreases AMTI", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depreciationAdjustment: d(-6000),
    }), c);
    // AMTI = 300000 + 10000 - 6000 = 304000
    expect(result.amti.toNumber()).toBe(304000);
    expect(result.depreciationAdjustment.toNumber()).toBe(-6000);
  });

  it("Line 3 - other AMT adjustments increase AMTI", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      otherAdjustments: d(7000),
    }), c);
    // AMTI = 300000 + 10000 + 7000 = 317000
    expect(result.amti.toNumber()).toBe(317000);
    expect(result.otherAdjustments.toNumber()).toBe(7000);
  });

  it("all AMT adjustments combine additively", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depletionAdjustment: d(3000),
      dispositionAdjustment: d(2000),
      depreciationAdjustment: d(5000),
      otherAdjustments: d(1000),
    }), c);
    // AMTI = 300000 + 10000 + 3000 + 2000 + 5000 + 1000 = 321000
    expect(result.amti.toNumber()).toBe(321000);
  });

  it("zero AMT adjustments do not produce audit lines for Lines 2c, 2k, 2l, 3", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      // All AMT adjustments default to zero
    }), c);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).not.toContain("2c");
    expect(lineNumbers).not.toContain("2k");
    expect(lineNumbers).not.toContain("2l");
    expect(lineNumbers).not.toContain("3");
  });

  it("nonzero AMT adjustments produce audit trail lines", () => {
    const result = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depletionAdjustment: d(1000),
      depreciationAdjustment: d(2000),
    }), c);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("2c");
    expect(lineNumbers).toContain("2l");
    // 2k and 3 are zero so should not appear
    expect(lineNumbers).not.toContain("2k");
    expect(lineNumbers).not.toContain("3");
  });

  it("AMT adjustments can push a filer from no-AMT to AMT", () => {
    // Without adjustments: AMTI = 310000, base = 221900, TMT = 57694
    // regularTax = 60000 → AMT = max(0, 57694 - 60000) = 0
    const noAdj = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      regularTax: d(60000),
    }), c);

    // With $40K depreciation adjustment: AMTI = 350000, base = 261900
    // TMT = 239100*0.26 + 22800*0.28 = 62166 + 6384 = 68550
    // AMT = max(0, 68550 - 60000) = 8550
    const withAdj = calculateForm6251(makeInput({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      depreciationAdjustment: d(40000),
      regularTax: d(60000),
    }), c);

    expect(noAdj.amt.toNumber()).toBe(0);
    expect(withAdj.amt.toNumber()).toBe(8550);
  });

  // ── HoH partial phase-out verification ──────────────────
  it("Line 8 - HoH partial phase-out matches single at same AMTI", () => {
    // HoH uses single thresholds. Verify partial phase-out gives identical results.
    // AMTI = 700000, excess = 73650, reduction = round(18412.5) = 18413
    // Exemption = 88100 - 18413 = 69687
    const singleResult = calculateForm6251(makeInput({
      taxableIncome: d(690000),
      saltDeduction: d(10000),
      filingStatus: "single",
    }), c);
    const hohResult = calculateForm6251(makeInput({
      taxableIncome: d(690000),
      saltDeduction: d(10000),
      filingStatus: "head_of_household",
    }), c);
    expect(hohResult.amti.toNumber()).toBe(700000);
    expect(hohResult.exemption.toNumber()).toBe(69687);
    expect(hohResult.exemption.toNumber()).toBe(singleResult.exemption.toNumber());
    expect(hohResult.tentativeMinimumTax.toNumber()).toBe(singleResult.tentativeMinimumTax.toNumber());
  });
});

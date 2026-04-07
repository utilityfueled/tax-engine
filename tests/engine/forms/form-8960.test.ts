/**
 * Tests for Form 8960 — Net Investment Income Tax
 * Spec: spec/federal/form-8960.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8960, type Form8960Input } from "@/engine/forms/form-8960.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeInput(overrides?: Partial<Form8960Input>): Form8960Input {
  return {
    taxableInterest: d(0),
    ordinaryDividends: d(0),
    netCapitalGain: d(0),
    magi: d(0),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Line Calculations
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - Lines", () => {
  it("Form 8960 Line 1 - taxable interest", () => {
    const result = calculateForm8960(makeInput({ taxableInterest: d(5000) }), "single", c);
    expect(result.taxableInterest.toNumber()).toBe(5000);
  });

  it("Form 8960 Line 4a - dividends", () => {
    const result = calculateForm8960(makeInput({ ordinaryDividends: d(8000) }), "single", c);
    expect(result.dividends.toNumber()).toBe(8000);
  });

  it("Form 8960 Line 5a - net capital gain", () => {
    const result = calculateForm8960(makeInput({ netCapitalGain: d(15000) }), "single", c);
    expect(result.netCapitalGain.toNumber()).toBe(15000);
  });

  it("Form 8960 Line 8 - net investment income", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(3000),
      ordinaryDividends: d(5000),
      netCapitalGain: d(10000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(18000);
  });

  it("Form 8960 Line 8 - NII with expenses", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      investmentExpenses: d(2000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(8000);
  });

  it("Form 8960 Line 11 - single threshold $200K", () => {
    const result = calculateForm8960(makeInput(), "single", c);
    expect(result.threshold.toNumber()).toBe(200000);
  });

  it("Form 8960 Line 11 - MFS threshold $125K", () => {
    const result = calculateForm8960(makeInput(), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
  });

  it("Form 8960 Line 13 - MAGI excess", () => {
    const result = calculateForm8960(makeInput({ magi: d(250000) }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(50000);
  });

  it("Form 8960 Line 14 - taxable base uses lesser of NII or excess", () => {
    // NII = $30K, excess = $50K → base = $30K
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(20000),
      magi: d(250000),
    }), "single", c);
    expect(result.taxableBase.toNumber()).toBe(30000);
  });

  it("Form 8960 Line 14 - excess less than NII", () => {
    // NII = $100K, excess = $10K → base = $10K
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      ordinaryDividends: d(50000),
      magi: d(210000),
    }), "single", c);
    expect(result.taxableBase.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// NIIT Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - NIIT", () => {
  it("Form 8960 Line 17 - no tax below threshold", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      magi: d(180000),
    }), "single", c);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("Form 8960 Line 17 - tax on investment income", () => {
    // MAGI $300K, NII $80K. Excess = $100K. Base = min($80K, $100K) = $80K
    // NIIT = $80K × 3.8% = $3,040
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(30000),
      netCapitalGain: d(30000),
      magi: d(300000),
    }), "single", c);
    expect(result.niitTax.toNumber()).toBe(3040);
  });

  it("Form 8960 Line 17 - zero NII means zero tax", () => {
    const result = calculateForm8960(makeInput({
      magi: d(500000),
    }), "single", c);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("Form 8960 Line 17 - MFS lower threshold increases tax", () => {
    // MFS: threshold $125K. MAGI $200K, NII $50K
    // Excess = $75K. Base = min($50K, $75K) = $50K
    // NIIT = $50K × 3.8% = $1,900
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(50000),
      magi: d(200000),
    }), "married_filing_separately", c);
    expect(result.niitTax.toNumber()).toBe(1900);
  });

  it("Form 8960 Line 17 - other investment income included", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      otherInvestmentIncome: d(10000),
      magi: d(250000),
    }), "single", c);
    // NII = $15K. Excess = $50K. Base = $15K. Tax = $570
    expect(result.niitTax.toNumber()).toBe(570);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      ordinaryDividends: d(3000),
      netCapitalGain: d(10000),
      magi: d(250000),
    }), "single", c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("4a");
    expect(lineIds).toContain("5a");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("17");
  });
});

// ═══════════════════════════════════════════════════════════
// Threshold Tests by Filing Status
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - all filing status thresholds", () => {
  it("MFJ threshold $250K", () => {
    const result = calculateForm8960(makeInput(), "married_filing_jointly", c);
    expect(result.threshold.toNumber()).toBe(250000);
  });

  it("HoH threshold $200K (same as single)", () => {
    const result = calculateForm8960(makeInput(), "head_of_household", c);
    expect(result.threshold.toNumber()).toBe(200000);
  });

  it("QSS threshold $250K (same as MFJ)", () => {
    const result = calculateForm8960(makeInput(), "qualifying_surviving_spouse", c);
    expect(result.threshold.toNumber()).toBe(250000);
  });

  it("exactly at single threshold — zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      magi: d(200000),
    }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("$1 over MFJ threshold — minimal NIIT", () => {
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(50000),
      magi: d(250001),
    }), "married_filing_jointly", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    // Base = min($50K, $1) = $1. Tax = $1 × 3.8% = $0 (rounds to 0)
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("$1,000 over single threshold", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      magi: d(201000),
    }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(1000);
    // Base = min($10K, $1K) = $1K. Tax = $1K × 3.8% = $38
    expect(result.taxableBase.toNumber()).toBe(1000);
    expect(result.niitTax.toNumber()).toBe(38);
  });
});

// ═══════════════════════════════════════════════════════════
// NIIT Threshold Boundary Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - threshold boundary precision", () => {
  it("MFJ MAGI exactly at $250K threshold — zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(40000),
      magi: d(250000),
    }), "married_filing_jointly", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS MAGI exactly at $125K threshold — zero NIIT", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(30000),
      magi: d(125000),
    }), "married_filing_separately", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("single MAGI $1 over $200K threshold — minimal NIIT rounds to $0", () => {
    // Excess = $1. NII = $100K. Base = $1. Tax = $1 × 3.8% = $0.038 → rounds to $0
    const result = calculateForm8960(makeInput({
      taxableInterest: d(100000),
      magi: d(200001),
    }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS MAGI $1 over $125K threshold — minimal NIIT rounds to $0", () => {
    // Excess = $1. NII = $50K. Base = $1. Tax = $1 × 3.8% = $0.038 → rounds to $0
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(50000),
      magi: d(125001),
    }), "married_filing_separately", c);
    expect(result.magiExcess.toNumber()).toBe(1);
    expect(result.taxableBase.toNumber()).toBe(1);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("MFS threshold is exactly half of MFJ threshold", () => {
    const mfjResult = calculateForm8960(makeInput(), "married_filing_jointly", c);
    const mfsResult = calculateForm8960(makeInput(), "married_filing_separately", c);
    expect(mfsResult.threshold.toNumber()).toBe(mfjResult.threshold.dividedBy(2).toNumber());
  });

  it("very large NII with MAGI below single threshold — no tax regardless of NII size", () => {
    // NII = $5M, MAGI = $199,999 (below $200K). No excess → no NIIT.
    const result = calculateForm8960(makeInput({
      netCapitalGain: d(5000000),
      magi: d(199999),
    }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("QSS NIIT equals MFJ NIIT for identical income and MAGI", () => {
    const input = makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(15000),
      netCapitalGain: d(25000),
      magi: d(400000),
    });
    const qssResult = calculateForm8960(input, "qualifying_surviving_spouse", c);
    const mfjResult = calculateForm8960(input, "married_filing_jointly", c);
    expect(qssResult.threshold.toNumber()).toBe(mfjResult.threshold.toNumber());
    expect(qssResult.magiExcess.toNumber()).toBe(mfjResult.magiExcess.toNumber());
    expect(qssResult.niitTax.toNumber()).toBe(mfjResult.niitTax.toNumber());
    // Excess = $150K. NII = $60K. Base = $60K. Tax = $60K × 3.8% = $2,280
    expect(qssResult.niitTax.toNumber()).toBe(2280);
  });

  it("all four investment income types combined with expenses — correct NII and NIIT", () => {
    // Gross NII = $10K + $20K + $30K + $15K = $75K. Expenses = $5K. Net NII = $70K.
    // MFJ: MAGI $400K. Excess = $150K. Base = min($70K, $150K) = $70K. Tax = $2,660
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(20000),
      netCapitalGain: d(30000),
      otherInvestmentIncome: d(15000),
      investmentExpenses: d(5000),
      magi: d(400000),
    }), "married_filing_jointly", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(70000);
    expect(result.magiExcess.toNumber()).toBe(150000);
    expect(result.taxableBase.toNumber()).toBe(70000);
    expect(result.niitTax.toNumber()).toBe(2660);
  });

  it("high MAGI with NII zeroed by expenses — no NIIT despite large MAGI excess", () => {
    // Gross NII = $80K. Expenses = $80K. Net NII = $0. MAGI = $1M (excess = $800K).
    // Base = min($0, $800K) = $0. Tax = $0.
    const result = calculateForm8960(makeInput({
      taxableInterest: d(40000),
      ordinaryDividends: d(40000),
      investmentExpenses: d(80000),
      magi: d(1000000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.magiExcess.toNumber()).toBe(800000);
    expect(result.taxableBase.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("audit trail line values match computed results", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(20000),
      ordinaryDividends: d(10000),
      magi: d(240000),
    }), "single", c);
    // NII = $30K, threshold = $200K, excess = $40K, base = $30K, tax = $1,140
    const findLine = (id: string) => result.lines.find((l) => l.line === id);
    expect(findLine("8")?.value.toNumber()).toBe(30000);
    expect(findLine("11")?.value.toNumber()).toBe(200000);
    expect(findLine("13")?.value.toNumber()).toBe(40000);
    expect(findLine("14")?.value.toNumber()).toBe(30000);
    expect(findLine("17")?.value.toNumber()).toBe(1140);
  });

  it("MFS produces higher NIIT than single at same $175K MAGI with same NII", () => {
    // Single: threshold $200K. MAGI $175K < $200K → no NIIT.
    // MFS: threshold $125K. MAGI $175K > $125K → excess $50K → NIIT on NII.
    const sharedInput = makeInput({
      ordinaryDividends: d(60000),
      magi: d(175000),
    });
    const singleResult = calculateForm8960(sharedInput, "single", c);
    const mfsResult = calculateForm8960(sharedInput, "married_filing_separately", c);
    expect(singleResult.niitTax.toNumber()).toBe(0);
    // MFS: excess = $50K. NII = $60K. Base = $50K. Tax = $50K × 3.8% = $1,900
    expect(mfsResult.niitTax.toNumber()).toBe(1900);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8960 - edge cases", () => {
  it("all income types combined", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(10000),
      ordinaryDividends: d(20000),
      netCapitalGain: d(30000),
      otherInvestmentIncome: d(15000),
      magi: d(350000),
    }), "single", c);
    // NII = $75K. Excess = $150K. Base = $75K. Tax = $2,850
    expect(result.netInvestmentIncome.toNumber()).toBe(75000);
    expect(result.niitTax.toNumber()).toBe(2850);
  });

  it("investment expenses reduce NII to zero (floor)", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      investmentExpenses: d(10000),
      magi: d(300000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("very high income — large NIIT", () => {
    // $1M MAGI, $500K NII. Single threshold $200K.
    // Excess = $800K. Base = min($500K, $800K) = $500K.
    // NIIT = $500K × 3.8% = $19,000
    const result = calculateForm8960(makeInput({
      taxableInterest: d(100000),
      ordinaryDividends: d(200000),
      netCapitalGain: d(200000),
      magi: d(1000000),
    }), "single", c);
    expect(result.niitTax.toNumber()).toBe(19000);
  });

  it("MFS with low threshold — higher effective tax rate", () => {
    // MFS: $125K threshold. MAGI $200K, NII $40K.
    // Excess = $75K. Base = min($40K, $75K) = $40K.
    // Same scenario with single: excess = $0 → no tax
    const mfsResult = calculateForm8960(makeInput({
      ordinaryDividends: d(40000),
      magi: d(200000),
    }), "married_filing_separately", c);
    const singleResult = calculateForm8960(makeInput({
      ordinaryDividends: d(40000),
      magi: d(200000),
    }), "single", c);

    expect(mfsResult.niitTax.toNumber()).toBe(1520); // $40K × 3.8%
    expect(singleResult.niitTax.toNumber()).toBe(0); // At threshold, no excess
  });

  it("zero MAGI with investment income — no tax", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      magi: d(0),
    }), "single", c);
    expect(result.magiExcess.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("interest only — single source of NII", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(30000),
      magi: d(250000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(30000);
    expect(result.niitTax.toNumber()).toBe(1140); // $30K × 3.8%
  });

  it("dividends only — single source of NII", () => {
    const result = calculateForm8960(makeInput({
      ordinaryDividends: d(25000),
      magi: d(280000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(25000);
    expect(result.niitTax.toNumber()).toBe(950); // $25K × 3.8%
  });

  it("capital gains only — single source of NII", () => {
    const result = calculateForm8960(makeInput({
      netCapitalGain: d(100000),
      magi: d(400000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(100000);
    // Excess = $200K. Base = min($100K, $200K) = $100K. Tax = $3,800
    expect(result.niitTax.toNumber()).toBe(3800);
  });

  it("other investment income only (rental/royalty)", () => {
    const result = calculateForm8960(makeInput({
      otherInvestmentIncome: d(20000),
      magi: d(230000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(20000);
    // Excess = $30K. Base = min($20K, $30K) = $20K. Tax = $760
    expect(result.niitTax.toNumber()).toBe(760);
  });

  it("NII exactly equals MAGI excess — tax on NII", () => {
    // NII = $50K, excess = $50K → base = $50K
    const result = calculateForm8960(makeInput({
      taxableInterest: d(50000),
      magi: d(250000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(50000);
    expect(result.magiExcess.toNumber()).toBe(50000);
    expect(result.taxableBase.toNumber()).toBe(50000);
    expect(result.niitTax.toNumber()).toBe(1900);
  });

  it("very large NII $10M+", () => {
    const result = calculateForm8960(makeInput({
      netCapitalGain: d(10000000),
      magi: d(12000000),
    }), "single", c);
    // Excess = $11.8M. Base = min($10M, $11.8M) = $10M. Tax = $380,000
    expect(result.niitTax.toNumber()).toBe(380000);
  });

  it("expenses exactly equal gross NII — zero NII", () => {
    const result = calculateForm8960(makeInput({
      taxableInterest: d(5000),
      ordinaryDividends: d(5000),
      investmentExpenses: d(10000),
      magi: d(300000),
    }), "single", c);
    expect(result.netInvestmentIncome.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
  });

  it("NIIT rounding: 3.8% of $263 = $9.994 rounds to $10", () => {
    // Need NII and excess both ≥ $263
    const result = calculateForm8960(makeInput({
      taxableInterest: d(263),
      magi: d(201000),
    }), "single", c);
    // Base = min($263, $1000) = $263. Tax = round($263 × 0.038) = round(9.994) = 10
    expect(result.niitTax.toNumber()).toBe(10);
  });

  it("QSS uses $250K threshold (same as MFJ)", () => {
    const qss = calculateForm8960(makeInput({
      ordinaryDividends: d(30000),
      magi: d(300000),
    }), "qualifying_surviving_spouse", c);
    const mfj = calculateForm8960(makeInput({
      ordinaryDividends: d(30000),
      magi: d(300000),
    }), "married_filing_jointly", c);
    expect(qss.niitTax.toNumber()).toBe(mfj.niitTax.toNumber());
    expect(qss.niitTax.toNumber()).toBe(1140); // min(30K, 50K) × 3.8%
  });
});

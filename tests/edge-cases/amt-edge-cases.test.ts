/**
 * Edge case tests for AMT (Form 6251).
 * Covers phase-out boundaries, filing status variants, and extreme scenarios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import type { Form6251Input } from "@/engine/forms/form-6251.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function make(overrides: Partial<Form6251Input> = {}): Form6251Input {
  return {
    taxableIncome: d(100000),
    saltDeduction: d(10000),
    regularTax: d(15000),
    filingStatus: "single",
    isItemizing: true,
    ...overrides,
  };
}

describe("AMT Edge Cases - Phase-out precision", () => {
  it("exemption phase-out: $4 over threshold reduces by $1", () => {
    // Single threshold = 609350. AMTI = 609354 → excess = 4
    // Reduction = round(4 * 0.25) = round(1) = 1
    // Exemption = 88100 - 1 = 88099
    const result = calculateForm6251(make({
      taxableIncome: d(599354),
      saltDeduction: d(10000),
    }), c);
    expect(result.amti.toNumber()).toBe(609354);
    expect(result.exemption.toNumber()).toBe(88099);
  });

  it("MFS phase-out starts at $626,350", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(626350),
      saltDeduction: d(0),
      filingStatus: "married_filing_separately",
      isItemizing: false,
    }), c);
    // AMTI = 626350 = exactly at MFS threshold
    expect(result.exemption.toNumber()).toBe(68500);
  });

  it("MFS exemption fully phased out", () => {
    // MFS exemption = 68500. Full phase-out needs 68500/0.25 = 274000 over threshold
    // AMTI = 626350 + 274000 = 900350
    const result = calculateForm6251(make({
      taxableIncome: d(900350),
      saltDeduction: d(0),
      filingStatus: "married_filing_separately",
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("MFJ phase-out starts at $1,252,700", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(1252700),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("MFJ exemption fully phased out", () => {
    // MFJ exemption = 137000. Full phase-out: 137000/0.25 = 548000 over threshold
    // AMTI = 1252700 + 548000 = 1800700
    const result = calculateForm6251(make({
      taxableIncome: d(1800700),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(0);
  });
});

describe("AMT Edge Cases - Zero and extreme income", () => {
  it("zero taxable income → zero AMT", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(0),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amt.toNumber()).toBe(0);
    expect(result.amti.toNumber()).toBe(0);
    expect(result.amtBase.toNumber()).toBe(0);
  });

  it("$1 taxable income → zero AMT", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(1),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("$10M income → exemption fully phased out, 28% bracket applies", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(10000000),
      saltDeduction: d(10000),
      regularTax: d(3500000),
    }), c);
    expect(result.exemption.toNumber()).toBe(0);
    expect(result.amtBase.toNumber()).toBe(result.amti.toNumber());
    // At this income, regular tax should exceed AMT
    // (37% bracket > 28% AMT rate)
    expect(result.amt.toNumber()).toBe(0);
  });

  it("SALT-only add-back with moderate income", () => {
    // Taxpayer with $200K income, standard deduction filer
    // No SALT add-back → AMTI = taxable income → exemption covers
    const result = calculateForm6251(make({
      taxableIncome: d(200000),
      saltDeduction: d(10000),
      regularTax: d(35000),
      isItemizing: false,
    }), c);
    expect(result.saltAddBack.toNumber()).toBe(0);
    expect(result.amti.toNumber()).toBe(200000);
  });

  it("very large SALT add-back pushes into AMT", () => {
    // Hypothetical: high-earner itemizing with full $10K SALT
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(10000),
      regularTax: d(100000), // artificially low regular tax
    }), c);
    // AMTI = 510000, exemption = 88100, base = 421900
    expect(result.amti.toNumber()).toBe(510000);
    expect(result.tentativeMinimumTax.greaterThan(d(100000))).toBe(true);
    expect(result.amt.greaterThan(d(0))).toBe(true);
  });
});

describe("AMT Edge Cases - Rate bracket boundary", () => {
  it("AMT base exactly at 26% limit ($239,100 single)", () => {
    // Need AMTI such that AMTI - exemption = 239100
    // With full exemption (88100): AMTI = 327200
    const result = calculateForm6251(make({
      taxableIncome: d(317200),
      saltDeduction: d(10000),
      regularTax: d(0),
    }), c);
    expect(result.amtBase.toNumber()).toBe(239100);
    expect(result.tentativeMinimumTax.toNumber()).toBe(Math.round(239100 * 0.26));
  });

  it("AMT base $1 over 26% limit hits 28% rate", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(317201),
      saltDeduction: d(10000),
      regularTax: d(0),
    }), c);
    expect(result.amtBase.toNumber()).toBe(239101);
    const at26 = Math.round(239100 * 0.26);
    const at28 = Math.round(1 * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });

  it("HoH uses same brackets as single ($239,100)", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(317200),
      saltDeduction: d(10000),
      filingStatus: "head_of_household",
      regularTax: d(0),
    }), c);
    expect(result.amtBase.toNumber()).toBe(239100);
    expect(result.tentativeMinimumTax.toNumber()).toBe(Math.round(239100 * 0.26));
  });

  it("QSS uses same rate bracket as single ($239,100)", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(473300), // AMTI = 473300, exemption = 137000, base = 336300
      saltDeduction: d(0),
      filingStatus: "qualifying_surviving_spouse",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    // base = 336300 > 239100 → splits between 26% and 28%
    expect(result.amtBase.toNumber()).toBe(336300);
    const at26 = Math.round(239100 * 0.26);
    const at28 = Math.round((336300 - 239100) * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });

  it("MFS 26% limit is $119,550", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(200000),
      saltDeduction: d(5000),
      filingStatus: "married_filing_separately",
      regularTax: d(0),
    }), c);
    // AMTI = 205000, exemption = 68500, base = 136500 > 119550
    expect(result.amtBase.toNumber()).toBe(136500);
    const at26 = Math.round(119550 * 0.26);
    const at28 = Math.round((136500 - 119550) * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Edge Cases - New targeted scenarios
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - Exemption boundaries", () => {
  it("single exemption at full $88,100 when AMTI is below phase-out threshold", () => {
    // AMTI = 599350 < 609350 threshold → no reduction → full exemption
    const result = calculateForm6251(make({
      taxableIncome: d(599350),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(599350);
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("single exemption reduced to exactly $1 just before fully phased out", () => {
    // Reduction = round(excess * 0.25). Need reduction = 88099 → excess = 352396.
    // AMTI = 609350 + 352396 = 961746. round(352396 * 0.25) = round(88099) = 88099.
    // Exemption = 88100 - 88099 = 1.
    const result = calculateForm6251(make({
      taxableIncome: d(961746),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(961746);
    expect(result.exemption.toNumber()).toBe(1);
  });

  it("MFJ base exemption is $137,000 when income is well below phase-out threshold", () => {
    // AMTI = 500000 << 1252700 threshold → full MFJ exemption
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("MFJ exemption unchanged at exactly the $1,252,700 phase-out threshold", () => {
    // AMTI = 1252700 = exactly at threshold → excess = 0 → no reduction
    const result = calculateForm6251(make({
      taxableIncome: d(1252700),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(1252700);
    expect(result.exemption.toNumber()).toBe(137000);
  });
});

describe("AMT Edge Cases - AMT applies and non-itemizer", () => {
  it("AMT applies when TMT exceeds regular tax (moderate income, high SALT add-back)", () => {
    // Single, taxable income $300K, SALT $10K itemized, low regular tax $50K.
    // AMTI = 310000, exemption = 88100 (below 609350), base = 221900.
    // TMT = round(221900 * 0.26) = 57694. AMT = 57694 - 50000 = 7694 > 0.
    const result = calculateForm6251(make({
      taxableIncome: d(300000),
      saltDeduction: d(10000),
      regularTax: d(50000),
      isItemizing: true,
    }), c);
    expect(result.amti.toNumber()).toBe(310000);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(221900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(Math.round(221900 * 0.26));
    expect(result.amt.toNumber()).toBeGreaterThan(0);
    expect(result.amt.toNumber()).toBe(Math.round(221900 * 0.26) - 50000);
  });

  it("non-itemizer has zero SALT add-back resulting in lower AMTI than equivalent itemizer", () => {
    // Non-itemizer: saltDeduction supplied but isItemizing=false → saltAddBack = 0
    const result = calculateForm6251(make({
      taxableIncome: d(350000),
      saltDeduction: d(10000),
      regularTax: d(70000),
      isItemizing: false,
    }), c);
    expect(result.saltAddBack.toNumber()).toBe(0);
    expect(result.amti.toNumber()).toBe(350000);
    // vs itemizer AMTI would be 360000
    const itemizerResult = calculateForm6251(make({
      taxableIncome: d(350000),
      saltDeduction: d(10000),
      regularTax: d(70000),
      isItemizing: true,
    }), c);
    expect(itemizerResult.amti.toNumber()).toBe(360000);
    expect(result.amti.lessThan(itemizerResult.amti)).toBe(true);
  });
});

describe("AMT Edge Cases - MFJ 26%/28% rate bracket boundary", () => {
  it("MFJ AMT base exactly at $239,100 (26%/28% boundary) uses only 26% rate", () => {
    // MFJ rate26Limit = 239100. Need amtBase = 239100.
    // amtBase = AMTI - exemption. With no SALT (non-itemizer) and income below threshold:
    // exemption = 137000, so AMTI = 239100 + 137000 = 376100. taxableIncome = 376100.
    const result = calculateForm6251(make({
      taxableIncome: d(376100),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amtBase.toNumber()).toBe(239100);
    expect(result.tentativeMinimumTax.toNumber()).toBe(Math.round(239100 * 0.26));
  });

  it("MFJ AMT base $1 over $239,100 boundary triggers 28% rate on excess", () => {
    // AMTI = 376101, exemption = 137000, base = 239101.
    // TMT = round(239100 * 0.26) + round(1 * 0.28) = 62166 + 0 = 62166.
    // Note: round(1 * 0.28) = round(0.28) = 0.
    const result = calculateForm6251(make({
      taxableIncome: d(376101),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amtBase.toNumber()).toBe(239101);
    const at26 = Math.round(239100 * 0.26);
    const at28 = Math.round(1 * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(at26 + at28);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Audit Trail
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - Audit trail", () => {
  it("produces complete audit trail when AMT applies", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(10000),
      regularTax: d(100000),
    }), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1"); // Taxable income
    expect(lineIds).toContain("2a"); // SALT add-back
    expect(lineIds).toContain("7"); // AMTI
    expect(lineIds).toContain("8"); // Exemption
    expect(lineIds).toContain("9"); // AMT base
    expect(lineIds).toContain("10"); // Tentative minimum tax
    expect(lineIds).toContain("11"); // AMT
  });

  it("produces audit trail even when AMT is zero", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(50000),
      saltDeduction: d(5000),
      regularTax: d(5000),
    }), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("11"); // AMT line
    expect(result.amt.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT vs Regular Tax Comparison
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - AMT vs regular tax", () => {
  it("regular tax exceeds TMT → AMT is zero", () => {
    // At very high incomes, regular 37% rate > AMT 28% rate
    const result = calculateForm6251(make({
      taxableIncome: d(2000000),
      saltDeduction: d(10000),
      regularTax: d(600000),
    }), c);
    // TMT ≈ $2,010,000 × 28% ≈ $562K (no exemption at this income)
    // Regular tax $600K > TMT → AMT = 0
    expect(result.amt.toNumber()).toBe(0);
  });

  it("TMT exactly equals regular tax → AMT is precisely zero", () => {
    // Find an input where TMT = regular tax
    // With AMTI = 400000, exemption = 88100, base = 311900
    // TMT = round(239100*0.26) + round(72800*0.28) = 62166 + 20384 = 82550
    const result = calculateForm6251(make({
      taxableIncome: d(390000),
      saltDeduction: d(10000),
      regularTax: d(82550),
    }), c);
    expect(result.amt.toNumber()).toBe(0);
    expect(result.tentativeMinimumTax.toNumber()).toBe(82550);
  });

  it("AMT = $1 when TMT exceeds regular tax by $1", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(390000),
      saltDeduction: d(10000),
      regularTax: d(82549), // one less than TMT
    }), c);
    expect(result.amt.toNumber()).toBe(1);
  });

  it("standard deduction filer never triggers AMT (low income)", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(75000),
      saltDeduction: d(0),
      regularTax: d(10000),
      isItemizing: false,
    }), c);
    // AMTI = 75000, fully covered by exemption (88100)
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("AMTI exactly equals exemption → zero AMT base", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(88100),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(88100);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("HoH uses single exemption ($88,100) and single phase-out ($609,350)", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(0),
      filingStatus: "head_of_household",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(500000 - 88100);
  });

  it("QSS uses MFJ exemption ($137,000) and phase-out ($1,252,700)", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(0),
      filingStatus: "qualifying_surviving_spouse",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(137000);
    expect(result.amtBase.toNumber()).toBe(500000 - 137000);
  });

  it("negative AMTI scenario → AMT base floors at zero", () => {
    // If taxable income is negative (from large losses) and no SALT add-back
    const result = calculateForm6251(make({
      taxableIncome: d(-5000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    // AMTI = -5000, but exemption covers it → base = max(0, AMTI - exemption)
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("very large SALT ($10K capped) triggers AMT for mid-income itemizer", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(250000),
      saltDeduction: d(10000),
      regularTax: d(40000), // artificially low
    }), c);
    expect(result.amti.toNumber()).toBe(260000);
    expect(result.amt.greaterThan(d(0))).toBe(true);
  });

  it("all filing statuses produce non-negative AMT", () => {
    const statuses = [
      "single", "married_filing_jointly", "married_filing_separately",
      "head_of_household", "qualifying_surviving_spouse",
    ] as const;
    for (const status of statuses) {
      const result = calculateForm6251(make({
        taxableIncome: d(300000),
        saltDeduction: d(10000),
        regularTax: d(60000),
        filingStatus: status,
      }), c);
      expect(result.amt.greaterThanOrEqualTo(d(0))).toBe(true);
    }
  });

  it("non-itemizer has no SALT add-back → lower AMTI", () => {
    const itemizer = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(10000),
      regularTax: d(80000),
      isItemizing: true,
    }), c);
    const nonItemizer = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(0),
      regularTax: d(80000),
      isItemizing: false,
    }), c);
    // Itemizer AMTI = $410K, non-itemizer AMTI = $400K
    expect(itemizer.amti.greaterThan(nonItemizer.amti)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Edge Cases - New targeted scenarios
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - Exact phase-out thresholds", () => {
  it("single exemption unchanged at exactly the $609,350 phase-out threshold", () => {
    // AMTI = 609350 = exactly at threshold → excess = 0 → no reduction → full exemption
    const result = calculateForm6251(make({
      taxableIncome: d(609350),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(609350);
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("single exemption fully phased out at AMTI $961,750", () => {
    // Need reduction = 88100. Excess = 88100 / 0.25 = 352400.
    // AMTI = 609350 + 352400 = 961750. round(352400 * 0.25) = 88100.
    // Exemption = 88100 - 88100 = 0.
    const result = calculateForm6251(make({
      taxableIncome: d(961750),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(961750);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("MFJ exemption at exactly the $1,252,700 threshold is full $137,000", () => {
    // AMTI = 1252700 = exactly at MFJ threshold → excess = 0 → no reduction
    const result = calculateForm6251(make({
      taxableIncome: d(1252700),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(1252700);
    expect(result.exemption.toNumber()).toBe(137000);
  });

  it("MFS exemption is exactly half the MFJ exemption ($68,500 vs $137,000)", () => {
    // Verify MFS base exemption is precisely half of MFJ base exemption
    const mfjResult = calculateForm6251(make({
      taxableIncome: d(100000),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    const mfsResult = calculateForm6251(make({
      taxableIncome: d(100000),
      saltDeduction: d(0),
      filingStatus: "married_filing_separately",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(mfsResult.exemption.toNumber()).toBe(68500);
    expect(mfjResult.exemption.toNumber()).toBe(137000);
    expect(mfsResult.exemption.times(2).toNumber()).toBe(mfjResult.exemption.toNumber());
  });

  it("QSS uses MFJ phase-out threshold ($1,252,700), not single threshold", () => {
    // At AMTI just above single threshold (609350) but well below MFJ threshold (1252700),
    // QSS filer keeps full MFJ exemption while single filer starts losing theirs.
    const qssResult = calculateForm6251(make({
      taxableIncome: d(700000),
      saltDeduction: d(0),
      filingStatus: "qualifying_surviving_spouse",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    const singleResult = calculateForm6251(make({
      taxableIncome: d(700000),
      saltDeduction: d(0),
      filingStatus: "single",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    // QSS: AMTI 700000 < 1252700 threshold → full exemption 137000
    expect(qssResult.exemption.toNumber()).toBe(137000);
    // Single: AMTI 700000 > 609350 threshold → reduced exemption
    expect(singleResult.exemption.toNumber()).toBeLessThan(88100);
  });
});

describe("AMT Edge Cases - AMT crossover and zero AMT scenarios", () => {
  it("AMT crossover point: TMT exceeds regular tax by exactly $1", () => {
    // AMTI = 400000, exemption = 88100, base = 311900
    // TMT = round(239100*0.26) + round(72800*0.28) = 62166 + 20384 = 82550
    // Set regularTax = 82549 → AMT = 82550 - 82549 = 1
    const result = calculateForm6251(make({
      taxableIncome: d(390000),
      saltDeduction: d(10000),
      regularTax: d(82549),
      isItemizing: true,
    }), c);
    expect(result.tentativeMinimumTax.toNumber()).toBe(82550);
    expect(result.amt.toNumber()).toBe(1);
  });

  it("AMT is zero for typical $80K single filer taking standard deduction", () => {
    // Standard deduction filer, income well below exemption threshold
    // AMTI = 80000, exemption = 88100 → base = 0 → AMT = 0
    const result = calculateForm6251(make({
      taxableIncome: d(80000),
      saltDeduction: d(0),
      regularTax: d(12000),
      isItemizing: false,
    }), c);
    expect(result.amtBase.toNumber()).toBe(0);
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("AMT is zero for typical $150K MFJ couple taking standard deduction", () => {
    // MFJ couple, income well below MFJ exemption of $137K
    // AMTI = 150000, exemption = 137000, base = 13000
    // TMT = round(13000 * 0.26) = 3380. regularTax for $150K MFJ >> $3380 → AMT = 0
    const result = calculateForm6251(make({
      taxableIncome: d(150000),
      saltDeduction: d(0),
      filingStatus: "married_filing_jointly",
      regularTax: d(20000),
      isItemizing: false,
    }), c);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("SALT add-back pushes moderate-income itemizer into AMT", () => {
    // Single filer, $280K taxable income, $10K SALT, reasonable regular tax $65K.
    // Non-itemizer AMTI = 280000, base = 280000 - 88100 = 191900, TMT = round(191900*0.26) = 49894 < 65000 → AMT=0
    // Itemizer AMTI = 290000, base = 290000 - 88100 = 201900, TMT = round(201900*0.26) = 52494 < 65000 → AMT=0
    // Use artificially low regular tax to show SALT causes AMT
    const withSalt = calculateForm6251(make({
      taxableIncome: d(280000),
      saltDeduction: d(10000),
      regularTax: d(50000),
      isItemizing: true,
    }), c);
    const withoutSalt = calculateForm6251(make({
      taxableIncome: d(280000),
      saltDeduction: d(10000),
      regularTax: d(50000),
      isItemizing: false,
    }), c);
    // Itemizer has higher AMTI and thus higher TMT
    expect(withSalt.amti.toNumber()).toBe(290000);
    expect(withoutSalt.amti.toNumber()).toBe(280000);
    expect(withSalt.tentativeMinimumTax.greaterThan(withoutSalt.tentativeMinimumTax)).toBe(true);
  });
});

describe("AMT Edge Cases - ISO and capital gains scenarios", () => {
  it("ISO exercise spread added to taxable income as AMT preference triggers AMT", () => {
    // ISO exercise: spread of $200K is an AMT preference item that increases AMTI.
    // Simulate: base salary taxable income = $150K, ISO spread = $200K → total income subject to AMT = $350K.
    // Regular tax based on $150K income only (ISO not taxed for regular tax purposes).
    // AMTI = 350000, exemption = 88100, base = 261900
    // TMT = round(239100*0.26) + round(22800*0.28) = 62166 + 6384 = 68550
    // Regular tax on $150K ≈ $25K → AMT well above zero
    const result = calculateForm6251(make({
      taxableIncome: d(350000), // includes ISO spread for AMT purposes
      saltDeduction: d(0),
      regularTax: d(25000), // regular tax only on non-ISO income
      isItemizing: false,
    }), c);
    expect(result.amti.toNumber()).toBe(350000);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(261900);
    const expectedTMT = Math.round(239100 * 0.26) + Math.round(22800 * 0.28);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expectedTMT);
    expect(result.amt.toNumber()).toBeGreaterThan(0);
  });

  it("large capital gains increase AMTI but regular tax rate advantage prevents AMT", () => {
    // High-income filer with large capital gains. At very high income, regular 37%
    // marginal rate on ordinary income + 20% LTCG rate can exceed the flat 26%/28% AMT.
    // $3M taxable income (mix of ordinary + LTCG), exemption fully phased out.
    // TMT ≈ 3M * 28% = 840K. Regular tax on $3M >> $840K at 37% bracket.
    const result = calculateForm6251(make({
      taxableIncome: d(3000000),
      saltDeduction: d(10000),
      regularTax: d(1000000),
      isItemizing: true,
      netLongTermCapitalGain: d(2000000),
    }), c);
    // Exemption fully phased out at this income
    expect(result.exemption.toNumber()).toBe(0);
    // Regular tax $1M >> TMT → no AMT
    expect(result.amt.toNumber()).toBe(0);
  });

  it("large long-term capital gains at moderate ordinary income can trigger AMT", () => {
    // Filer with $80K ordinary income + $400K LTCG = $480K taxable income.
    // Regular tax is lower due to preferential LTCG rates, making AMT more likely.
    // Simulate with low regularTax relative to the AMT Part III result.
    // AMTI = 480000, exemption = 88100 (below 609350 threshold), base = 391900
    // Under Part III, the entire $391,900 AMT base is preferential income and
    // is taxed at 15% because $80K of ordinary income already fills the 0% bracket.
    // Tentative minimum tax = round(391900 * 0.15) = 58785.
    const result = calculateForm6251(make({
      taxableIncome: d(480000),
      saltDeduction: d(0),
      regularTax: d(50000), // low due to LTCG preferential rates
      isItemizing: false,
      netLongTermCapitalGain: d(400000),
    }), c);
    expect(result.amti.toNumber()).toBe(480000);
    expect(result.exemption.toNumber()).toBe(88100);
    expect(result.amtBase.toNumber()).toBe(391900);
    const expectedTMT = Math.round(391900 * 0.15);
    expect(result.tentativeMinimumTax.toNumber()).toBe(expectedTMT);
    expect(result.amt.toNumber()).toBeGreaterThan(0);
  });
});

describe("AMT Edge Cases - Audit trail completeness", () => {
  it("audit trail includes descriptive labels for all key lines", () => {
    const result = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(10000),
      regularTax: d(80000),
      isItemizing: true,
    }), c);
    const lines = result.lines;
    const line1 = lines.find((l) => l.line === "1");
    const line2a = lines.find((l) => l.line === "2a");
    const line7 = lines.find((l) => l.line === "7");
    const line8 = lines.find((l) => l.line === "8");
    const line11 = lines.find((l) => l.line === "11");
    expect(line1).toBeDefined();
    expect(line2a).toBeDefined();
    expect(line7).toBeDefined();
    expect(line8).toBeDefined();
    expect(line11).toBeDefined();
    // Verify values are consistent with calculation
    expect(line1!.value.toNumber()).toBe(400000);
    expect(line2a!.value.toNumber()).toBe(10000);
    expect(line7!.value.toNumber()).toBe(410000);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Edge Cases - Part III Preferential Income Path
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - Part III qualified dividends at 0% bracket", () => {
  it("all qualified dividends taxed at 0% when ordinary portion below zero-rate threshold", () => {
    // taxableIncome = $100K entirely from QDs, single, non-itemizer
    // AMTI = 100000, exemption = 88100, amtBase = 11900
    // preferentialIncome = 100000, preferentialAmtIncome = min(100000, 11900) = 11900
    // ordinaryAmtPortion = 0, ordinaryAmtTax = 0
    // regularOrdinaryPortion = max(0, 100000 - 100000) = 0
    // remainingPreferential = 11900 stacks on 0 → all in 0% bracket (threshold $48,350)
    // preferentialMethodTax = 0
    // fullOrdinaryTax = round(11900 * 0.26) = 3094
    // TMT = min(3094, 0) = 0
    const result = calculateForm6251(make({
      taxableIncome: d(100000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      qualifiedDividends: d(100000),
    }), c);
    expect(result.amtBase.toNumber()).toBe(11900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(0);
    expect(result.amt.toNumber()).toBe(0);
  });

  it("qualified dividends span 0% and 15% brackets when stacked on ordinary income", () => {
    // taxableIncome = $200K, QDs = $100K (rest ordinary), single, non-itemizer
    // AMTI = 200000, exemption = 88100, amtBase = 111900
    // preferentialIncome = 100000, preferentialAmtIncome = min(100000, 111900) = 100000
    // ordinaryAmtPortion = 11900, ordinaryAmtTax = round(11900 * 0.26) = 3094
    // regularOrdinaryPortion = max(0, 200000 - 100000) = 100000
    // No special-rate gains, remainingPreferential = 100000
    // currentStack = 100000 > zeroThreshold(48350) → no 0% room
    // fifteenThreshold(533400), room = 433400 → taxedAtFifteen = 100000
    // preferentialTax = 100000 * 0.15 = 15000
    // preferentialMethodTax = 3094 + 15000 = 18094
    // fullOrdinaryTax = round(111900 * 0.26) = 29094
    // TMT = min(29094, 18094) = 18094
    const result = calculateForm6251(make({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      qualifiedDividends: d(100000),
    }), c);
    expect(result.amtBase.toNumber()).toBe(111900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(18094);
  });
});

describe("AMT Edge Cases - Part III collectibles at 28%", () => {
  it("collectibles at 28% can exceed AMT ordinary rate making ordinary method cheaper", () => {
    // taxableIncome = $200K, LTCG = $100K (all collectibles), single, non-itemizer
    // AMTI = 200000, exemption = 88100, amtBase = 111900
    // preferentialIncome = 100000, preferentialAmtIncome = min(100000, 111900) = 100000
    // ordinaryAmtPortion = 11900, ordinaryAmtTax = round(11900 * 0.26) = 3094
    // specialRateGain = min(100000, 100000) = 100000 (all collectibles)
    // collectiblesPortion = 100000, preferentialTax = 100000 * 0.28 = 28000
    // remainingPreferential = 0
    // preferentialMethodTax = 3094 + 28000 = 31094
    // fullOrdinaryTax = round(111900 * 0.26) = 29094
    // TMT = min(29094, 31094) = 29094 (ordinary method wins!)
    const result = calculateForm6251(make({
      taxableIncome: d(200000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      netLongTermCapitalGain: d(100000),
      collectiblesGain: d(100000),
    }), c);
    expect(result.amtBase.toNumber()).toBe(111900);
    // Ordinary method (26% flat) beats Part III because collectibles are at 28%
    expect(result.tentativeMinimumTax.toNumber()).toBe(29094);
  });
});

describe("AMT Edge Cases - Part III section 1250 at 25%", () => {
  it("unrecaptured section 1250 gain taxed at 25% with remainder at 15%", () => {
    // taxableIncome = $400K, LTCG = $100K (of which $40K is §1250), single, non-itemizer
    // AMTI = 400000, exemption = 88100, amtBase = 311900
    // preferentialIncome = 100000, preferentialAmtIncome = 100000
    // ordinaryAmtPortion = 211900, ordinaryAmtTax = round(211900 * 0.26) = 55094
    // regularOrdinaryPortion = 300000
    // specialRateGain = min(40000, 100000) = 40000, section1250Portion = 40000
    // preferentialTax = 40000 * 0.25 = 10000
    // remainingPreferential = 60000, currentStack = 300000 > zeroThreshold
    // fifteenThreshold(533400), room = 233400 → taxedAtFifteen = 60000
    // preferentialTax = 10000 + 9000 = 19000
    // preferentialMethodTax = 55094 + 19000 = 74094
    // fullOrdinaryTax = round(239100*0.26) + round(72800*0.28) = 62166 + 20384 = 82550
    // TMT = min(82550, 74094) = 74094
    const result = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      netLongTermCapitalGain: d(100000),
      section1250Gain: d(40000),
    }), c);
    expect(result.amtBase.toNumber()).toBe(311900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(74094);
  });
});

describe("AMT Edge Cases - Part III 20% rate bracket", () => {
  it("LTCG reaches 20% bracket when stacked income exceeds $533,400 threshold", () => {
    // taxableIncome = $700K, LTCG = $200K (no QDs), single, non-itemizer
    // AMTI = 700000, exemption reduced (700000 > 609350)
    //   excess = 700000 - 609350 = 90650, reduction = round(90650*0.25) = round(22662.50) = 22663
    //   exemption = 88100 - 22663 = 65437
    // amtBase = 700000 - 65437 = 634563
    // preferentialIncome = 200000, preferentialAmtIncome = 200000
    // ordinaryAmtPortion = 434563
    // ordinaryAmtTax = round(239100*0.26) + round(195463*0.28) = 62166 + 54730 = 116896
    // regularOrdinaryPortion = 500000
    // remainingPreferential = 200000, currentStack = 500000
    // 0% threshold 48350 → no room (500000 > 48350)
    // 15% threshold 533400 → room = 33400 → taxedAtFifteen = 33400
    // preferentialTax = 33400 * 0.15 = 5010
    // remainingPreferential = 166600 → all at 20%
    // preferentialTax = 5010 + 166600 * 0.20 = 5010 + 33320 = 38330
    // preferentialMethodTax = 116896 + round(38330) = 155226
    // fullOrdinaryTax = round(239100*0.26) + round(395463*0.28) = 62166 + 110730 = 172896
    // TMT = min(172896, 155226) = 155226
    const result = calculateForm6251(make({
      taxableIncome: d(700000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      netLongTermCapitalGain: d(200000),
    }), c);
    expect(result.exemption.toNumber()).toBe(65437);
    expect(result.amtBase.toNumber()).toBe(634563);
    expect(result.tentativeMinimumTax.toNumber()).toBe(155226);
  });
});

describe("AMT Edge Cases - Part III mixed special-rate gains", () => {
  it("section 1250 and collectibles combined with regular LTCG", () => {
    // taxableIncome = $350K, LTCG = $150K, §1250 = $30K, collectibles = $20K, single
    // AMTI = 350000, exemption = 88100, amtBase = 261900
    // preferentialIncome = 150000, preferentialAmtIncome = 150000
    // ordinaryAmtPortion = 111900, ordinaryAmtTax = round(111900*0.26) = 29094
    // regularOrdinaryPortion = 200000
    // specialRateGain = min(30000 + 20000, 150000) = 50000
    // section1250Portion = min(30000, 50000) = 30000
    // collectiblesPortion = min(20000, 50000-30000) = 20000
    // preferentialTax = 20000*0.28 + 30000*0.25 = 5600 + 7500 = 13100
    // remainingPreferential = 100000, currentStack = 200000
    // 0% threshold 48350 → no room
    // 15% threshold 533400 → room = 333400 → taxedAtFifteen = 100000
    // preferentialTax = 13100 + 15000 = 28100
    // preferentialMethodTax = 29094 + 28100 = 57194
    // fullOrdinaryTax = round(239100*0.26) + round(22800*0.28) = 62166 + 6384 = 68550
    // TMT = min(68550, 57194) = 57194
    const result = calculateForm6251(make({
      taxableIncome: d(350000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      netLongTermCapitalGain: d(150000),
      section1250Gain: d(30000),
      collectiblesGain: d(20000),
    }), c);
    expect(result.amtBase.toNumber()).toBe(261900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(57194);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Edge Cases - K-1 AMT Preference Items
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - K-1 AMT adjustments", () => {
  it("depreciation adjustment increases AMTI and triggers AMT", () => {
    // $500K income, $25K depreciation adjustment, single, non-itemizer
    // AMTI = 525000, exemption = 88100, amtBase = 436900
    // TMT = round(239100*0.26) + round(197800*0.28) = 62166 + 55384 = 117550
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(0),
      regularTax: d(115000),
      isItemizing: false,
      depreciationAdjustment: d(25000),
    }), c);
    expect(result.amti.toNumber()).toBe(525000);
    expect(result.depreciationAdjustment.toNumber()).toBe(25000);
    expect(result.tentativeMinimumTax.toNumber()).toBe(117550);
    expect(result.amt.toNumber()).toBe(117550 - 115000);
  });

  it("depletion adjustment increases AMTI", () => {
    // $400K income, $15K depletion adjustment
    // AMTI = 415000, exemption = 88100, amtBase = 326900
    // TMT = round(239100*0.26) + round(87800*0.28) = 62166 + 24584 = 86750
    const result = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      depletionAdjustment: d(15000),
    }), c);
    expect(result.amti.toNumber()).toBe(415000);
    expect(result.depletionAdjustment.toNumber()).toBe(15000);
    expect(result.tentativeMinimumTax.toNumber()).toBe(86750);
  });

  it("disposition adjustment increases AMTI", () => {
    // $300K income, $50K disposition adjustment
    // AMTI = 350000, exemption = 88100, amtBase = 261900
    // TMT = round(239100*0.26) + round(22800*0.28) = 62166 + 6384 = 68550
    const result = calculateForm6251(make({
      taxableIncome: d(300000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      dispositionAdjustment: d(50000),
    }), c);
    expect(result.amti.toNumber()).toBe(350000);
    expect(result.dispositionAdjustment.toNumber()).toBe(50000);
    expect(result.tentativeMinimumTax.toNumber()).toBe(68550);
  });

  it("multiple K-1 adjustments combine to increase AMTI", () => {
    // $400K income + $10K depreciation + $5K depletion + $8K disposition + $3K other = $426K AMTI
    // AMTI = 426000, exemption = 88100, amtBase = 337900
    // TMT = round(239100*0.26) + round(98800*0.28) = 62166 + 27664 = 89830
    const result = calculateForm6251(make({
      taxableIncome: d(400000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      depreciationAdjustment: d(10000),
      depletionAdjustment: d(5000),
      dispositionAdjustment: d(8000),
      otherAdjustments: d(3000),
    }), c);
    expect(result.amti.toNumber()).toBe(426000);
    expect(result.amtBase.toNumber()).toBe(337900);
    expect(result.tentativeMinimumTax.toNumber()).toBe(89830);
  });

  it("negative disposition adjustment reduces AMTI", () => {
    // Negative disposition adjustment (AMT basis > regular basis on sale) reduces AMTI
    // $500K income - $30K disposition = $470K AMTI
    const result = calculateForm6251(make({
      taxableIncome: d(500000),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
      dispositionAdjustment: d(-30000),
    }), c);
    expect(result.amti.toNumber()).toBe(470000);
    expect(result.dispositionAdjustment.toNumber()).toBe(-30000);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Edge Cases - Phase-out rounding precision
// ═══════════════════════════════════════════════════════════

describe("AMT Edge Cases - Phase-out rounding edge cases", () => {
  it("$1 over threshold: reduction rounds to $0 so exemption unchanged", () => {
    // Single threshold = 609350. AMTI = 609351 → excess = 1
    // reduction = roundHalfUp(1 * 0.25) = roundHalfUp(0.25) = 0
    // exemption = 88100 - 0 = 88100 (unchanged!)
    const result = calculateForm6251(make({
      taxableIncome: d(609351),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88100);
  });

  it("$2 over threshold: reduction rounds to $1 at the 0.50 boundary", () => {
    // AMTI = 609352 → excess = 2 → reduction = roundHalfUp(0.50) = 1
    // exemption = 88100 - 1 = 88099
    const result = calculateForm6251(make({
      taxableIncome: d(609352),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88099);
  });

  it("$3 over threshold: reduction rounds to $1", () => {
    // AMTI = 609353 → excess = 3 → reduction = roundHalfUp(0.75) = 1
    const result = calculateForm6251(make({
      taxableIncome: d(609353),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88099);
  });

  it("$4 over threshold: reduction is exactly $1", () => {
    // AMTI = 609354 → excess = 4 → reduction = roundHalfUp(1.00) = 1
    const result = calculateForm6251(make({
      taxableIncome: d(609354),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88099);
  });

  it("single exemption $1 above full phase-out point → exemption still $0", () => {
    // Full phase-out at AMTI = 961750 (exemption = 0)
    // $1 over: AMTI = 961751 → excess = 352401, reduction = roundHalfUp(88100.25) = 88100
    // exemption = max(0, 88100 - 88100) = 0
    const result = calculateForm6251(make({
      taxableIncome: d(961751),
      saltDeduction: d(0),
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("HoH at exact phase-out threshold keeps full exemption", () => {
    // HoH uses single thresholds: threshold = 609350, exemption = 88100
    const result = calculateForm6251(make({
      taxableIncome: d(609350),
      saltDeduction: d(0),
      filingStatus: "head_of_household",
      regularTax: d(0),
      isItemizing: false,
    }), c);
    expect(result.exemption.toNumber()).toBe(88100);
  });
});

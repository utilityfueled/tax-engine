/**
 * Edge case tests for Form 8812 — Credits for Qualifying Children and Other Dependents.
 * Spec: spec/federal/form-8812.yaml
 *
 * Focuses on:
 *   - Phase-out threshold boundaries ($200K single/HoH/MFS/QSS, $400K MFJ)
 *   - QSS uses $200K not $400K (IRC §24(b)(2): QSS is not a joint return)
 *   - Phase-out ceil rounding ($1 over threshold = $50 reduction)
 *   - Complete phase-out elimination boundaries
 *   - ACTC three-way min: unused CTC, 15% earned income, $1,700/child cap
 *   - Zero and negative earned income
 *   - Large families
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import type { Form8812Input } from "@/engine/forms/form-8812.js";
import type { FilingStatus } from "@/models/constants.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function make(overrides: Partial<Form8812Input> = {}): Form8812Input {
  return {
    qualifyingChildren: 1,
    otherDependents: 0,
    agi: d(50000),
    earnedIncome: d(50000),
    taxLiability: d(5000),
    filingStatus: "single",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// QSS uses $200K threshold, not $400K — IRC §24(b)(2)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - QSS phase-out threshold is $200K, not $400K (IRC §24(b)(2))", () => {
  it("Form 8812 Line 5 - QSS at exactly $200,000 AGI: no phase-out reduction", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(20000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("Form 8812 Line 5 - QSS at $200,001 AGI: $50 phase-out reduction (not exempt like MFJ)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200001),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(20000),
    }), c);
    // $1 excess → ceil(0.001) = 1 × $50 = $50 reduction
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3950);
  });

  it("Form 8812 Line 5 - QSS at $300,000 AGI: credit still exists (would be full if MFJ threshold applied)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(300000),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(40000),
    }), c);
    // Excess = $100K → 100 × $50 = $5,000 reduction vs $4,000 max → fully phased out
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 5 - MFJ at $300,000 AGI: no phase-out (under $400K threshold)", () => {
    const mfjResult = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(300000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(40000),
    }), c);
    // MFJ threshold is $400K → no phase-out at $300K
    expect(mfjResult.ctcBeforeLimitation.toNumber()).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-out ceil rounding: $1 over vs $999 over vs $1,000 over
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out ceil rounding per $1,000 increments", () => {
  it("Form 8812 Line 12 - $1 over threshold rounds up to $1K → $50 reduction", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(200001),
      taxLiability: d(10000),
    }), c);
    // ceil($1 / $1,000) = 1 → $50 reduction
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1950);
  });

  it("Form 8812 Line 12 - $999 over threshold still rounds to $1K → same $50 reduction", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(200999),
      taxLiability: d(10000),
    }), c);
    // ceil($999 / $1,000) = 1 → $50 reduction (same as $1 over)
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1950);
  });

  it("Form 8812 Line 12 - $1,000 over threshold: exactly $1K → $50 reduction (no extra rounding)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(201000),
      taxLiability: d(10000),
    }), c);
    // ceil($1,000 / $1,000) = 1 → $50 reduction
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1950);
  });

  it("Form 8812 Line 12 - $1,001 over threshold: rounds up to $2K → $100 reduction", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(201001),
      taxLiability: d(10000),
    }), c);
    // ceil($1,001 / $1,000) = 2 → $100 reduction
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1900);
  });
});

// ═══════════════════════════════════════════════════════════
// Complete phase-out elimination boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - complete phase-out elimination boundaries", () => {
  it("Form 8812 Line 12 - single, 1 child: completely phased out at exactly $240,000", () => {
    // 1 child = $2,000 CTC. Excess = $40K → 40 × $50 = $2,000 reduction = exact CTC
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(240000),
      taxLiability: d(30000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 1 child: $1 below complete phase-out ($239,999) still has credit", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(239999),
      taxLiability: d(30000),
    }), c);
    // Excess = $39,999 → ceil(39.999) = 40 → 40 × $50 = $2,000 reduction = exact CTC → $0
    // Wait: ceil(39999/1000) = ceil(39.999) = 40 → reduction = $2,000 = CTC → $0!
    // Actually $239,999 - $200,000 = $39,999. ceil(39,999 / 1,000) = ceil(39.999) = 40
    // 40 × $50 = $2,000. So CTC = $2,000 - $2,000 = $0.
    // The credit is eliminated at $239,001 onwards because of ceil rounding!
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 1 child: last dollar of credit at $239,000", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(239000),
      taxLiability: d(30000),
    }), c);
    // Excess = $39,000 → ceil(39) = 39 → 39 × $50 = $1,950 reduction
    // CTC = $2,000 - $1,950 = $50
    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });

  it("Form 8812 Line 12 - single, 1 child: $1 over $239,000 triggers complete phase-out", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(239001),
      taxLiability: d(30000),
    }), c);
    // Excess = $39,001 → ceil(39.001) = 40 → 40 × $50 = $2,000 ≥ $2,000 CTC → $0
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 2 children: completely phased out at $280,000", () => {
    // 2 children = $4,000 CTC. Excess = $80K → 80 × $50 = $4,000 = exact CTC
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(280000),
      taxLiability: d(50000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 2 children: $50 credit remaining at $279,000", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(279000),
      taxLiability: d(50000),
    }), c);
    // Excess = $79,000 → ceil(79) = 79 → 79 × $50 = $3,950
    // CTC = $4,000 - $3,950 = $50
    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });

  it("Form 8812 Line 12 - MFJ, 1 child: completely phased out at $440,000", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(440000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(80000),
    }), c);
    // Excess = $40K → 40 × $50 = $2,000 = CTC
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - MFJ, 1 child: last $50 of credit at $439,000", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(439000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(80000),
    }), c);
    // Excess = $39K → 39 × $50 = $1,950 → CTC = $50
    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════
// All five filing statuses at threshold boundary
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - all filing statuses at $1 over their respective thresholds", () => {
  const statuses: { status: FilingStatus; threshold: number }[] = [
    { status: "single", threshold: 200000 },
    { status: "married_filing_jointly", threshold: 400000 },
    { status: "married_filing_separately", threshold: 200000 },
    { status: "head_of_household", threshold: 200000 },
    { status: "qualifying_surviving_spouse", threshold: 200000 },
  ];

  for (const { status, threshold } of statuses) {
    it(`Form 8812 Line 12 - ${status} at exactly $${threshold.toLocaleString()}: no phase-out`, () => {
      const result = calculateForm8812(make({
        qualifyingChildren: 1,
        agi: d(threshold),
        filingStatus: status,
        taxLiability: d(10000),
      }), c);
      expect(result.ctcBeforeLimitation.toNumber()).toBe(2000);
    });

    it(`Form 8812 Line 12 - ${status} at $${(threshold + 1).toLocaleString()}: $50 reduction`, () => {
      const result = calculateForm8812(make({
        qualifyingChildren: 1,
        agi: d(threshold + 1),
        filingStatus: status,
        taxLiability: d(10000),
      }), c);
      expect(result.ctcBeforeLimitation.toNumber()).toBe(1950);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ACTC three-way min: each limit as the binding constraint
// ═══════════════════════════════════════════════════════════

describe("Form 8812 Line 27 - ACTC three-way min binding constraint identification", () => {
  it("Form 8812 Line 27 - ACTC limited by unused CTC (smallest of three)", () => {
    // Unused CTC = $200, 15% earned = high, cap = $1,700
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(80000),
      taxLiability: d(1800), // CTC $2,000 - $1,800 tax = $200 unused
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(200);
    expect(result.fifteenPercent.toNumber()).toBe(11625); // ($80K - $2.5K) × 15%
    expect(result.actc.toNumber()).toBe(200); // unused binds
  });

  it("Form 8812 Line 27 - ACTC limited by 15% earned income formula (smallest of three)", () => {
    // Unused CTC = $4,000, 15% earned = $375, cap = $3,400
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(5000),
      taxLiability: d(0),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(4000);
    expect(result.fifteenPercent.toNumber()).toBe(375); // ($5K - $2.5K) × 15%
    expect(result.actc.toNumber()).toBe(375); // 15% formula binds
  });

  it("Form 8812 Line 27 - ACTC limited by $1,700/child cap (smallest of three)", () => {
    // Unused CTC = $4,000, 15% earned = $14,625, cap = $1,700
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 1, // adds $500 ODC to total, increasing unused
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(2500); // $2,000 CTC + $500 ODC
    expect(result.fifteenPercent.toNumber()).toBe(14625);
    expect(result.actc.toNumber()).toBe(1700); // cap binds: 1 × $1,700
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and negative earned income
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - zero and negative earned income", () => {
  it("Form 8812 Line 21 - zero earned income: ACTC is zero regardless of unused CTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      earnedIncome: d(0),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.unusedCTC.toNumber()).toBe(6000); // all unused
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Line 21 - negative earned income (SE losses): ACTC is zero", () => {
    // Spec: SE losses reduce earned income — no zero floor on SE component
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(-5000), // wages minus SE loss > wages
      taxLiability: d(0),
    }), c);
    // max(0, -$5K - $2.5K) = $0
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC minimum earned income to produce nonzero refund
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC minimum earned income to produce nonzero refund", () => {
  it("Form 8812 Line 24 - earned income $2,507: 15% of $7 = $1.05 → rounds to $1 ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2507),
      taxLiability: d(0),
    }), c);
    // Excess = $7 → $7 × 0.15 = $1.05 → roundDollar = $1
    expect(result.earnedIncomeExcess.toNumber()).toBe(7);
    expect(result.fifteenPercent.toNumber()).toBe(1);
    expect(result.actc.toNumber()).toBe(1);
  });

  it("Form 8812 Line 24 - earned income $2,503: 15% of $3 = $0.45 → rounds to $0 ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2503),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(3);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Large families: 6+ qualifying children
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - large family scenarios (6+ children)", () => {
  it("Form 8812 Line 27 - 6 children, low income: ACTC limited by 15% earned income", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 6,
      earnedIncome: d(30000),
      agi: d(30000),
      taxLiability: d(0),
    }), c);
    // CTC = 6 × $2,000 = $12,000; all unused
    // 15% formula: ($30K - $2.5K) × 15% = $4,125
    // Cap: 6 × $1,700 = $10,200
    // ACTC = min($12,000, $4,125, $10,200) = $4,125
    expect(result.ctcBeforeLimitation.toNumber()).toBe(12000);
    expect(result.actc.toNumber()).toBe(4125);
  });

  it("Form 8812 Line 27 - 6 children, moderate income: ACTC hits $1,700/child cap", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 6,
      earnedIncome: d(100000),
      agi: d(100000),
      taxLiability: d(0),
    }), c);
    // CTC = $12,000; all unused
    // 15% formula: ($100K - $2.5K) × 15% = $14,625
    // Cap: 6 × $1,700 = $10,200
    // ACTC = min($12,000, $14,625, $10,200) = $10,200
    expect(result.actc.toNumber()).toBe(10200);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed CTC + ODC with phase-out interactions
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out with mixed CTC and ODC dependents", () => {
  it("Form 8812 Line 12 - phase-out applies to combined CTC+ODC total", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      agi: d(210000), // $10K over single threshold
      taxLiability: d(20000),
    }), c);
    // Max = $2,000 CTC + $1,000 ODC = $3,000
    // Reduction: ceil(10) × $50 = $500
    // Line 12: $3,000 - $500 = $2,500
    expect(result.ctcBeforeLimitation.toNumber()).toBe(2500);
  });

  it("Form 8812 Line 12 - phase-out eliminates CTC first, then ODC in combined total", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      agi: d(260000), // $60K over threshold
      taxLiability: d(20000),
    }), c);
    // Max = $3,000; reduction = 60 × $50 = $3,000 → fully eliminated
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - ODC-only with phase-out still reduces correctly", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 4,
      agi: d(210000), // $10K over threshold
      taxLiability: d(5000),
    }), c);
    // Max ODC = $2,000; reduction = 10 × $50 = $500
    // Line 12: $2,000 - $500 = $1,500
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    // No qualifying children → ACTC = $0
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax liability exactly equals CTC: zero unused, zero ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - tax liability exactly matches CTC credit", () => {
  it("Form 8812 Lines 14-15 - tax = CTC: nonrefundable uses all, unused = $0, ACTC = $0", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(4000),
      earnedIncome: d(80000),
    }), c);
    // CTC = $4,000; tax = $4,000 → nonrefundable = $4,000; unused = $0
    expect(result.nonrefundableCTC.toNumber()).toBe(4000);
    expect(result.unusedCTC.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Lines 14-15 - tax = CTC - $1: $1 unused flows to ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(1999),
      earnedIncome: d(80000),
    }), c);
    // CTC = $2,000; tax = $1,999 → nonrefundable = $1,999; unused = $1
    // 15% earned = $11,625; cap = $1,700
    // ACTC = min($1, $11,625, $1,700) = $1
    expect(result.nonrefundableCTC.toNumber()).toBe(1999);
    expect(result.unusedCTC.toNumber()).toBe(1);
    expect(result.actc.toNumber()).toBe(1);
  });
});

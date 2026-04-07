/**
 * Form 8812 — Credits for Qualifying Children and Other Dependents
 * Spec: spec/federal/form-8812.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import type { Form8812Input } from "@/engine/forms/form-8812.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function make(overrides: Partial<Form8812Input> = {}): Form8812Input {
  return {
    qualifyingChildren: 2,
    otherDependents: 0,
    agi: d(50000),
    earnedIncome: d(50000),
    taxLiability: d(3000),
    filingStatus: "single",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Line 12: CTC Before Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - CTC before limitation", () => {
  it("Form 8812 Line 12 - CTC before limitation", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 1,
    }), c);
    // 2 × $2,000 + 1 × $500 = $4,500 (no phase-out at $50K AGI)
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4500);
  });

  it("Form 8812 Line 12 - with phase-out at high AGI", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(210000),
    }), c);
    // max CTC = $4,000. AGI $210K, threshold $200K, excess $10K
    // 10 × $50 = $500 reduction. $4,000 - $500 = $3,500
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3500);
  });

  it("Form 8812 Line 12 - fully phased out", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(240000),
    }), c);
    // max CTC = $2,000. AGI $240K, threshold $200K, excess $40K
    // 40 × $50 = $2,000 reduction. $2,000 - $2,000 = $0
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("no dependents: zero CTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 0,
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 14: Nonrefundable CTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - nonrefundable CTC", () => {
  it("Form 8812 Line 14 - nonrefundable limited to tax", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(1500),
    }), c);
    // CTC = $4,000 but tax is only $1,500
    expect(result.nonrefundableCTC.toNumber()).toBe(1500);
  });

  it("Form 8812 Line 14 - full CTC when tax exceeds credit", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(10000),
    }), c);
    expect(result.nonrefundableCTC.toNumber()).toBe(2000);
  });

  it("zero tax liability: zero nonrefundable", () => {
    const result = calculateForm8812(make({
      taxLiability: d(0),
    }), c);
    expect(result.nonrefundableCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 15: Unused CTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - unused CTC", () => {
  it("Form 8812 Line 15 - unused CTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(1500),
    }), c);
    // CTC $4,000 - nonrefundable $1,500 = $2,500 unused
    expect(result.unusedCTC.toNumber()).toBe(2500);
  });

  it("no unused when tax covers full CTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(10000),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Lines 20-24: Earned Income Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - earned income for ACTC", () => {
  it("Form 8812 Line 20 - earned income includes SE", () => {
    const result = calculateForm8812(make({
      earnedIncome: d(35000),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(32500);
  });

  it("Form 8812 Line 21 - earned income excess", () => {
    const result = calculateForm8812(make({
      earnedIncome: d(10000),
    }), c);
    // $10K - $2.5K = $7.5K
    expect(result.earnedIncomeExcess.toNumber()).toBe(7500);
  });

  it("Form 8812 Line 21 - earned income below $2,500: no excess", () => {
    const result = calculateForm8812(make({
      earnedIncome: d(2000),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Line 21 - exactly $2,500: no excess", () => {
    const result = calculateForm8812(make({
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
  });

  it("Form 8812 Line 24 - 15% calculation", () => {
    const result = calculateForm8812(make({
      earnedIncome: d(20000),
    }), c);
    // $20K - $2.5K = $17.5K × 15% = $2,625
    expect(result.fifteenPercent.toNumber()).toBe(2625);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 27: ACTC (Refundable)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - Additional Child Tax Credit", () => {
  it("Form 8812 Line 27 - ACTC refundable amount", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(30000),
      taxLiability: d(500),
    }), c);
    // CTC = $4,000, nonrefundable = $500, unused = $3,500
    // Earned excess: $30K - $2.5K = $27.5K × 15% = $4,125
    // Max refundable: 2 × $1,700 = $3,400
    // ACTC = min($3,500, $4,125, $3,400) = $3,400
    expect(result.actc.toNumber()).toBe(3400);
  });

  it("ACTC limited by 15% earned income formula", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(5000),
      taxLiability: d(0),
    }), c);
    // CTC = $4,000, nonrefundable = $0, unused = $4,000
    // Earned excess: $5K - $2.5K = $2.5K × 15% = $375
    // Max refundable: 2 × $1,700 = $3,400
    // ACTC = min($4,000, $375, $3,400) = $375
    expect(result.actc.toNumber()).toBe(375);
  });

  it("ACTC limited by unused CTC (high tax covers most)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(80000),
      taxLiability: d(3500),
    }), c);
    // CTC = $4,000, nonrefundable = $3,500, unused = $500
    // Earned excess: $80K - $2.5K = $77.5K × 15% = $11,625
    // Max refundable: $3,400
    // ACTC = min($500, $11,625, $3,400) = $500
    expect(result.actc.toNumber()).toBe(500);
  });

  it("no qualifying children: no ACTC (ODC not refundable)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 2,
      earnedIncome: d(30000),
      taxLiability: d(0),
    }), c);
    // ODC = $1,000, nonrefundable = $0, unused = $1,000
    // But ACTC max per child = 0 × $1,700 = $0
    expect(result.actc.toNumber()).toBe(0);
  });

  it("high earner: full CTC used nonrefundably, no ACTC needed", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(150000),
      taxLiability: d(25000),
    }), c);
    // CTC = $2,000, tax = $25K → nonrefundable = $2,000, unused = $0
    expect(result.nonrefundableCTC.toNumber()).toBe(2000);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("MFJ higher phase-out threshold ($400K)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      agi: d(350000),
      earnedIncome: d(350000),
      taxLiability: d(50000),
      filingStatus: "married_filing_jointly",
    }), c);
    // Under $400K threshold → no phase-out. CTC = $6,000
    expect(result.ctcBeforeLimitation.toNumber()).toBe(6000);
  });

  it("single parent with 3 children, low income", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      earnedIncome: d(25000),
      agi: d(25000),
      taxLiability: d(0),
    }), c);
    // CTC = $6,000, nonrefundable = $0, unused = $6,000
    // Earned excess: $25K - $2.5K = $22.5K × 15% = $3,375
    // Max refundable: 3 × $1,700 = $5,100
    // ACTC = min($6,000, $3,375, $5,100) = $3,375
    expect(result.actc.toNumber()).toBe(3375);
  });
});

// ═══════════════════════════════════════════════════════════
// Nonrefundable CTC limited by tax liability
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - nonrefundable CTC capped at tax liability", () => {
  it("nonrefundable CTC equals tax when tax is less than credit", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      taxLiability: d(800),
    }), c);
    // CTC = $6,000 but tax liability is only $800
    expect(result.nonrefundableCTC.toNumber()).toBe(800);
  });

  it("nonrefundable CTC equals full credit when tax exceeds credit", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(5000),
    }), c);
    // CTC = $4,000, tax = $5,000 → nonrefundable = $4,000
    expect(result.nonrefundableCTC.toNumber()).toBe(4000);
  });

  it("nonrefundable CTC equals credit exactly when tax matches credit", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(2000),
    }), c);
    // CTC = $2,000, tax = $2,000 → nonrefundable = $2,000, unused = $0
    expect(result.nonrefundableCTC.toNumber()).toBe(2000);
    expect(result.unusedCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC: 15% of earned income above $2,500
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC 15% of earned income above $2,500", () => {
  it("ACTC is 15% of earned income above $2,500 threshold", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(12500),
      taxLiability: d(0),
    }), c);
    // Excess: $12,500 - $2,500 = $10,000 × 15% = $1,500
    expect(result.fifteenPercent.toNumber()).toBe(1500);
    expect(result.actc.toNumber()).toBe(1500);
  });

  it("earned income exactly at $2,500 yields zero ACTC via 15% method", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("$1 above $2,500 threshold produces small ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2501),
      taxLiability: d(0),
    }), c);
    // Excess: $1 × 15% = $0.15 → rounds to $0
    expect(result.earnedIncomeExcess.toNumber()).toBe(1);
    expect(result.fifteenPercent.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC cap: $1,700 per qualifying child
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC cap at $1,700 per qualifying child", () => {
  it("ACTC capped at $1,700 per child with high earned income", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    // 15% formula: ($100K - $2.5K) × 15% = $14,625 → exceeds cap
    // Cap: 1 × $1,700 = $1,700
    expect(result.actc.toNumber()).toBe(1700);
  });

  it("ACTC cap scales with number of qualifying children", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    // Cap: 4 × $1,700 = $6,800; 15% formula also well above cap
    expect(result.actc.toNumber()).toBe(6800);
  });
});

// ═══════════════════════════════════════════════════════════
// ODC: $500 per non-qualifying dependent
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ODC $500 per other dependent", () => {
  it("ODC is $500 per non-child qualifying dependent", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 3,
      taxLiability: d(5000),
      earnedIncome: d(0),
    }), c);
    // ODC = 3 × $500 = $1,500; no phase-out at $50K AGI
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    expect(result.nonrefundableCTC.toNumber()).toBe(1500);
  });

  it("ODC combined with CTC sums correctly before limitation", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 4,
      taxLiability: d(10000),
    }), c);
    // CTC: 2 × $2,000 = $4,000; ODC: 4 × $500 = $2,000; total = $6,000
    expect(result.ctcBeforeLimitation.toNumber()).toBe(6000);
    expect(result.nonrefundableCTC.toNumber()).toBe(6000);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-out: $50 reduction per $1,000 over threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out $50 per $1,000 over threshold", () => {
  it("phase-out reduces credit by $50 per thousand over threshold (single)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(205000),
      taxLiability: d(10000),
    }), c);
    // Max CTC = $4,000. Excess over $200K: $5,000 → ceil(5) = 5 thousands × $50 = $250
    // $4,000 - $250 = $3,750
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3750);
  });

  it("partial-thousand excess rounds up to next thousand for phase-out", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200001),
      taxLiability: d(10000),
    }), c);
    // Excess: $1 → ceil(0.001) = 1 thousand × $50 = $50 reduction
    // $4,000 - $50 = $3,950
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3950);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ threshold ($400K) vs single ($200K)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - MFJ vs single phase-out thresholds", () => {
  it("single filer begins phase-out at $200K AGI", () => {
    const singleAtThreshold = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);
    const singleOverThreshold = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(201000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);
    // At $200K: no reduction. At $201K: 1 × $50 = $50 reduction
    expect(singleAtThreshold.ctcBeforeLimitation.toNumber()).toBe(4000);
    expect(singleOverThreshold.ctcBeforeLimitation.toNumber()).toBe(3950);
  });

  it("MFJ filer has no phase-out at $200K (threshold is $400K)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(10000),
    }), c);
    // MFJ threshold is $400K, so $200K AGI → no phase-out
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("MFJ phase-out begins above $400K", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(402000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(10000),
    }), c);
    // Excess over $400K: $2,000 → ceil(2) = 2 × $50 = $100 reduction
    // $4,000 - $100 = $3,900
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3900);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero qualifying children, only ODC dependents
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - zero qualifying children, ODC only", () => {
  it("ODC only: nonrefundable credit limited to tax, no ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 2,
      earnedIncome: d(60000),
      taxLiability: d(400),
    }), c);
    // ODC = 2 × $500 = $1,000; tax = $400 → nonrefundable = $400
    // No qualifying children → ACTC = $0
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1000);
    expect(result.nonrefundableCTC.toNumber()).toBe(400);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("ODC only: unused CTC is not refundable", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 1,
      earnedIncome: d(80000),
      taxLiability: d(0),
    }), c);
    // ODC = $500; tax = $0 → nonrefundable = $0, unused = $500
    // No qualifying children → ACTC = $0 (ODC is never refundable)
    expect(result.unusedCTC.toNumber()).toBe(500);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-out: exact threshold and one-dollar-over
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out at exact threshold and just above", () => {
  it("single AGI exactly $200K: no phase-out reduction", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);
    // Excess = $0 → reduction = $0; CTC = 2 × $2,000 = $4,000
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("single AGI $201K: reduced by exactly $50", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(201000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);
    // Excess = $1,000 → ceil(1) = 1 thousand × $50 = $50; $4,000 - $50 = $3,950
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3950);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS: phase-out at $200K (same as single, not $400K like MFJ)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - MFS phase-out threshold is $200K", () => {
  it("MFS AGI $200K: no phase-out (at threshold)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "married_filing_separately",
      taxLiability: d(10000),
    }), c);
    // MFS threshold = $200K; AGI at threshold → no reduction
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("MFS AGI $210K: reduced by $500 (not exempt like MFJ)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(210000),
      filingStatus: "married_filing_separately",
      taxLiability: d(10000),
    }), c);
    // MFS threshold = $200K; excess = $10K → 10 × $50 = $500; $4,000 - $500 = $3,500
    expect(result.ctcBeforeLimitation.toNumber()).toBe(3500);
  });
});

// ═══════════════════════════════════════════════════════════
// 4+ children ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC with 4 qualifying children", () => {
  it("4 children: ACTC cap is $6,800 (4 × $1,700)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(200000),
      taxLiability: d(0),
    }), c);
    // CTC = 4 × $2,000 = $8,000; nonrefundable = $0; unused = $8,000
    // 15% formula: ($200K - $2.5K) × 15% = $29,625 → well above cap
    // Cap = 4 × $1,700 = $6,800
    expect(result.actc.toNumber()).toBe(6800);
  });

  it("4 children low income: ACTC limited by 15% formula", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(10000),
      taxLiability: d(0),
    }), c);
    // CTC = $8,000; nonrefundable = $0; unused = $8,000
    // 15% formula: ($10K - $2.5K) × 15% = $1,125
    // Cap = 4 × $1,700 = $6,800
    // ACTC = min($8,000, $1,125, $6,800) = $1,125
    expect(result.actc.toNumber()).toBe(1125);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC: earned income boundary cases at $2,500
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC earned income boundary at $2,500", () => {
  it("earned income exactly $2,500: ACTC is zero", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);
    // Excess = $2,500 - $2,500 = $0 → 15% × $0 = $0 → ACTC = $0
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("earned income $2,501: minimal ACTC of $0 (rounds down from $0.15)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(2501),
      taxLiability: d(0),
    }), c);
    // Excess = $1; 15% of $1 = $0.15 → rounds down to $0
    expect(result.earnedIncomeExcess.toNumber()).toBe(1);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC fully consumed vs. partially consumed by tax liability
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - CTC interaction with tax liability for ACTC", () => {
  it("CTC fully consumed by tax liability: no unused CTC so no ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(80000),
      taxLiability: d(4000),
    }), c);
    // CTC = $4,000; tax = $4,000 → nonrefundable = $4,000; unused = $0 → ACTC = $0
    expect(result.nonrefundableCTC.toNumber()).toBe(4000);
    expect(result.unusedCTC.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("CTC exceeds tax liability: remainder flows to ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(60000),
      taxLiability: d(1000),
    }), c);
    // CTC = $4,000; tax = $1,000 → nonrefundable = $1,000; unused = $3,000
    // 15% formula: ($60K - $2.5K) × 15% = $8,625
    // Cap = 2 × $1,700 = $3,400
    // ACTC = min($3,000, $8,625, $3,400) = $3,000
    expect(result.nonrefundableCTC.toNumber()).toBe(1000);
    expect(result.unusedCTC.toNumber()).toBe(3000);
    expect(result.actc.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// ODC not eligible for ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ODC is never refundable via ACTC", () => {
  it("mixed CTC and ODC: unused ODC portion does not contribute to ACTC", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      earnedIncome: d(80000),
      taxLiability: d(0),
    }), c);
    // CTC from child = $2,000; ODC = $1,000; total = $3,000
    // nonrefundable = $0; unusedCTC (Line 15) = $3,000
    // 15% formula: ($80K - $2.5K) × 15% = $11,625
    // Cap = 1 × $1,700 = $1,700
    // ACTC = min($3,000, $11,625, $1,700) = $1,700 (cap binds, not ODC separation)
    expect(result.actc.toNumber()).toBe(1700);
    expect(result.unusedCTC.toNumber()).toBe(3000);
  });

  it("ODC only (no qualifying children): zero ACTC regardless of earned income", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 3,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    // ODC = $1,500; max refundable = 0 × $1,700 = $0 → ACTC = $0
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC uses Line 15 (total unused CTC+ODC) per IRS form
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC uses Line 15 total unused (not CTC-only)", () => {
  it("phase-out exceeds per-child CTC: ACTC uses remaining total credit (Line 15)", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 4,
      agi: d(250000),
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    // CTC = $2,000; ODC = $2,000; total = $4,000
    // Phase-out: ($250K - $200K) = $50K → ceil(50) × $50 = $2,500 reduction
    // Line 12: $4,000 - $2,500 = $1,500
    // Line 14: min($1,500, $0) = $0
    // Line 15 (total unused): $1,500
    // 15% earned: ($100K - $2.5K) × 15% = $14,625
    // Cap: 1 × $1,700 = $1,700
    // ACTC = min(min($14,625, $1,700), $1,500) = $1,500
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    expect(result.unusedCTC.toNumber()).toBe(1500);
    expect(result.actc.toNumber()).toBe(1500);
  });

  it("phase-out exceeds CTC, partial tax: ACTC equals remaining unused total", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 3,
      agi: d(245000),
      earnedIncome: d(100000),
      taxLiability: d(500),
    }), c);
    // CTC = $2,000; ODC = $1,500; total = $3,500
    // Phase-out: ($245K - $200K) = $45K → ceil(45) × $50 = $2,250 reduction
    // Line 12: $3,500 - $2,250 = $1,250
    // Line 14: min($1,250, $500) = $500
    // Line 15 (total unused): $750
    // 15% earned: ($100K - $2.5K) × 15% = $14,625
    // Cap: 1 × $1,700 = $1,700
    // ACTC = min(min($14,625, $1,700), $750) = $750
    expect(result.ctcBeforeLimitation.toNumber()).toBe(1250);
    expect(result.nonrefundableCTC.toNumber()).toBe(500);
    expect(result.unusedCTC.toNumber()).toBe(750);
    expect(result.actc.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8812(make(), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("15");
    expect(lineIds).toContain("18/20");
    expect(lineIds).toContain("21");
    expect(lineIds).toContain("24");
    expect(lineIds).toContain("27");
  });

  it("audit trail contains all 7 Form 8812 line IDs and no duplicates", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 1,
      earnedIncome: d(30000),
      taxLiability: d(1000),
    }), c);
    const lineIds = result.lines.map((l) => l.line);
    const expectedLines = ["12", "14", "15", "18/20", "21", "24", "27"];
    for (const id of expectedLines) {
      expect(lineIds).toContain(id);
    }
    // Each line should appear exactly once
    expect(lineIds.length).toBe(expectedLines.length);
  });

  it("audit trail line values match computed results", () => {
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(30000),
      taxLiability: d(500),
    }), c);
    // Verify each recorded line value matches the returned result field
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l.value]));
    expect(byLine["12"].toNumber()).toBe(result.ctcBeforeLimitation.toNumber());
    expect(byLine["14"].toNumber()).toBe(result.nonrefundableCTC.toNumber());
    expect(byLine["15"].toNumber()).toBe(result.unusedCTC.toNumber());
    expect(byLine["21"].toNumber()).toBe(result.earnedIncomeExcess.toNumber());
    expect(byLine["24"].toNumber()).toBe(result.fifteenPercent.toNumber());
    expect(byLine["27"].toNumber()).toBe(result.actc.toNumber());
  });
});

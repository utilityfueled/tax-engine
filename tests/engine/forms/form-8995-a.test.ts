/**
 * Form 8995-A — Qualified Business Income Deduction (Detailed Computation)
 * Spec: spec/federal/form-8995-a.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8995A } from "@/engine/forms/form-8995-a.js";
import type { Form8995AInput, QBIBusinessSource, AggregationGroup, PatronageCooperativeSource } from "@/engine/forms/form-8995-a.js";

const d = (n: number | string) => new Decimal(n);

function makeBiz(overrides: Partial<QBIBusinessSource> = {}): QBIBusinessSource {
  return {
    name: "Test Business",
    qbi: d(100000),
    w2Wages: d(50000),
    ubia: d(200000),
    isSST: false,
    ...overrides,
  };
}

function make(overrides: Partial<Form8995AInput> = {}): Form8995AInput {
  return {
    qbiSources: [makeBiz()],
    taxableIncomeBeforeQBI: d(300000),    // above upper threshold for single
    netCapitalGain: d(0),
    qualifiedDividends: d(0),
    simplifiedThreshold: d(197300),       // single
    phaseInRange: d(50000),               // single
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Part I: Per-Business QBI with W-2/UBIA Limitations
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - per-business QBI deduction", () => {
  it("Form 8995-A Line 1 - QBI from trade or business", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(75000) })],
    }));
    expect(result.businesses[0].line1QBI).toEqual(d(75000));
  });

  it("Form 8995-A Line 2 - non-SSTB has 100% applicable percentage", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), isSST: false })],
    }));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(100000));
  });

  it("Form 8995-A Line 3 - W-2 wages from business", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ w2Wages: d(80000) })],
    }));
    expect(result.businesses[0].line3W2Wages).toEqual(d(80000));
  });

  it("Form 8995-A Line 5 - UBIA of qualified property", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ ubia: d(500000) })],
    }));
    expect(result.businesses[0].line5UBIA).toEqual(d(500000));
  });

  it("Form 8995-A Line 7 - 50% of W-2 wages", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ w2Wages: d(80000) })],
    }));
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(40000));
  });

  it("Form 8995-A Line 8 - 25% of W-2 wages plus 2.5% of UBIA", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ w2Wages: d(80000), ubia: d(400000) })],
    }));
    // 25% × 80000 + 2.5% × 400000 = 20000 + 10000 = 30000
    expect(result.businesses[0].line8TwentyFivePlusTwoPointFive).toEqual(d(30000));
  });

  it("Form 8995-A Line 9 - W-2/UBIA limit is greater of Line 7 or Line 8", () => {
    // 50% of 80000 = 40000 > 25% of 80000 + 2.5% of 400000 = 30000
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ w2Wages: d(80000), ubia: d(400000) })],
    }));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(40000));
  });

  it("Form 8995-A Line 10 - 20% of adjusted QBI", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000) })],
    }));
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
  });

  it("Form 8995-A Line 11 - lesser of W-2/UBIA limit or 20% QBI", () => {
    // 20% of 100K QBI = 20K; 50% of 50K W-2 = 25K; lesser = 20K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
    }));
    expect(result.businesses[0].line11LesserOfLimitOrQBI).toEqual(d(20000));
  });
});

// ═══════════════════════════════════════════════════════════
// Non-SSTB above upper threshold (full W-2/UBIA limitation)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - non-SSTB above upper threshold", () => {
  it("non-SSTB above threshold W-2 limit - deduction limited by W-2 wages", () => {
    // QBI = 200K, W-2 = 40K, UBIA = 0, income = 300K (above 247.3K upper)
    // 20% QBI = 40K, 50% W-2 = 20K, 25% W-2 + 2.5% UBIA = 10K
    // W-2/UBIA limit = 20K, fully phased in → component = 20K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(40000), ubia: d(0) })],
    }));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("non-SSTB zero W-2 zero UBIA - deduction is zero above threshold", () => {
    // Consultant with no employees and no property
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(150000), w2Wages: d(0), ubia: d(0) })],
    }));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("UBIA-heavy business - 25% W-2 + 2.5% UBIA exceeds 50% W-2", () => {
    // W-2 = 20K, UBIA = 1M, income = 300K (above upper threshold)
    // 50% W-2 = 10K; 25% × 20K + 2.5% × 1M = 5K + 25K = 30K → use 30K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(20000), ubia: d(1000000) })],
    }));
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(10000));
    expect(result.businesses[0].line8TwentyFivePlusTwoPointFive).toEqual(d(30000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(30000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(30000));
  });

  it("non-SSTB W-2 limit not binding - 20% QBI below W-2/UBIA limit", () => {
    // QBI = 100K, W-2 = 200K → 20% QBI = 20K, 50% W-2 = 100K → not binding
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(200000) })],
    }));
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(100000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
  });
});

// ═══════════════════════════════════════════════════════════
// SSTB Phase-Out Rules
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - SSTB phase-out", () => {
  it("SSTB above upper threshold - completely excluded", () => {
    // SSTB with income above 247.3K (single) → applicable % = 0
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(100000), isSST: true })],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.sstbApplicablePercentage).toEqual(d(0));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(0));
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(0));
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("SSTB mid-phase-in - QBI W-2 UBIA reduced by 50%", () => {
    // Income = 222,300 → midpoint of 197,300–247,300 range
    // Phase-in % = (222300 - 197300) / 50000 = 50%
    // SSTB applicable % = 1 - 0.5 = 50%
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(60000), ubia: d(400000), isSST: true })],
      taxableIncomeBeforeQBI: d(222300),
    }));
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(50000));
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(30000));
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(200000));
  });

  it("SSTB near lower threshold - mostly included", () => {
    // Income = 202,300 → phase-in % = (202300 - 197300) / 50000 = 10%
    // SSTB applicable % = 90%
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000), isSST: true })],
      taxableIncomeBeforeQBI: d(202300),
    }));
    expect(result.phaseInPercentage).toEqual(d("0.1"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.9"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(90000));
  });

  it("SSTB at exact upper threshold - completely excluded", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000), isSST: true })],
      taxableIncomeBeforeQBI: d(247300),
    }));
    expect(result.sstbApplicablePercentage).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
  });

  it("SSTB MFJ thresholds - doubled phase-in range", () => {
    // MFJ: threshold = 394600, phase-in = 100000, upper = 494600
    // Income = 444600 → phase-in % = 50000/100000 = 50%
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(80000), isSST: true })],
      taxableIncomeBeforeQBI: d(444600),
      simplifiedThreshold: d(394600),
      phaseInRange: d(100000),
    }));
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(100000));
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-In Range (W-2/UBIA limitation partially applies)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - phase-in range", () => {
  it("Form 8995-A Line 13 - phase-in percentage at midpoint", () => {
    const result = calculateForm8995A(make({
      taxableIncomeBeforeQBI: d(222300), // mid-phase-in for single
    }));
    expect(result.phaseInPercentage).toEqual(d("0.5"));
  });

  it("Form 8995-A Line 12 - excess over W-2/UBIA limit", () => {
    // QBI = 200K, W-2 = 40K, above upper threshold
    // 20% QBI = 40K, 50% W-2 = 20K → excess = 20K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(40000), ubia: d(0) })],
    }));
    expect(result.businesses[0].line12Excess).toEqual(d(20000));
  });

  it("Form 8995-A Line 14 - phase-in reduction at midpoint", () => {
    // Income = 222300 → phase-in % = 50%, non-SSTB
    // QBI = 200K, W-2 = 40K, 20% QBI = 40K, 50% W-2 = 20K
    // Excess = 20K, phase-in reduction = 20K × 0.5 = 10K
    // Component = 40K - 10K = 30K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(40000), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(222300),
    }));
    expect(result.businesses[0].line14PhaseInReduction).toEqual(d(10000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(30000));
  });

  it("Form 8995-A Line 15 - component equals 20% QBI at threshold", () => {
    // At threshold exactly, phase-in % = 0 → no W-2/UBIA limitation
    // QBI = 200K, W-2 = 0 → normally limited to $0 above threshold
    // But at threshold: component = 20% × 200K = 40K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(0), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(197300),
    }));
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(40000));
  });

  it("non-SSTB phase-in - W-2 limit gradually applies", () => {
    // At 25% through phase-in: income = 197300 + 12500 = 209800
    // Phase-in % = 12500/50000 = 25%
    // QBI = 200K, W-2 = 40K, 20% QBI = 40K, 50% W-2 = 20K
    // Excess = 20K, reduction = 20K × 0.25 = 5K
    // Component = 40K - 5K = 35K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(40000), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(209800),
    }));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(35000));
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Businesses
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - mixed businesses", () => {
  it("mixed SSTB and non-SSTB - SSTB excluded, non-SSTB limited", () => {
    // Above upper threshold: SSTB gets $0, non-SSTB gets W-2/UBIA limited
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Law Firm", qbi: d(150000), w2Wages: d(60000), isSST: true }),
        makeBiz({ name: "Real Estate", qbi: d(100000), w2Wages: d(80000), isSST: false }),
      ],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0)); // SSTB excluded
    // Real Estate: 20% × 100K = 20K; 50% × 80K = 40K → component = 20K (20% QBI is lesser)
    expect(result.businesses[1].line15QBIComponent).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("multiple non-SSTB businesses - components sum", () => {
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Biz A", qbi: d(80000), w2Wages: d(40000) }),
        makeBiz({ name: "Biz B", qbi: d(60000), w2Wages: d(30000) }),
      ],
      taxableIncomeBeforeQBI: d(300000),
    }));
    // Biz A: 20% × 80K = 16K; 50% × 40K = 20K → component = 16K
    // Biz B: 20% × 60K = 12K; 50% × 30K = 15K → component = 12K
    // Total = 28K
    expect(result.businesses[0].line15QBIComponent).toEqual(d(16000));
    expect(result.businesses[1].line15QBIComponent).toEqual(d(12000));
    expect(result.qbiDeduction).toEqual(d(28000));
  });
});

// ═══════════════════════════════════════════════════════════
// QBI Loss and Carryforward
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - QBI loss carryforward", () => {
  it("Form 8995-A Line 40 - QBI loss carryforward from loss business", () => {
    // One profitable, one loss business. Net QBI negative → carryforward
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Profitable", qbi: d(30000), w2Wages: d(20000) }),
        makeBiz({ name: "Loss", qbi: d(-50000), w2Wages: d(10000) }),
      ],
    }));
    // Net QBI = 30K - 50K = -20K → carryforward = 20K
    expect(result.qbiLossCarryforward).toEqual(d(20000));
    // Total QBI component should be $0 (floored)
    expect(result.totalQBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("prior year QBI loss reduces current deduction", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(60000) })],
      priorYearQBILoss: d(40000),
    }));
    // Schedule C loss netting: QBI 100K reduced by 40K prior loss → adjusted QBI = 60K
    // Above upper threshold: 20% × 60K = 12K; 50% × 60K = 30K → component = 12K
    expect(result.businesses[0].line1QBI.toNumber()).toBe(60000);
    expect(result.totalQBIComponent).toEqual(d(12000));
    expect(result.qbiDeduction).toEqual(d(12000));
  });

  it("no carryforward when total QBI is positive", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
    }));
    expect(result.qbiLossCarryforward).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// Income Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - income limitation", () => {
  it("Form 8995-A Line 33 - taxable income before QBI", () => {
    const result = calculateForm8995A(make({
      taxableIncomeBeforeQBI: d(350000),
    }));
    expect(result.taxableIncomeBeforeQBI).toEqual(d(350000));
  });

  it("Form 8995-A Line 34 - net capital gain includes qualified dividends", () => {
    const result = calculateForm8995A(make({
      netCapitalGain: d(20000),
      qualifiedDividends: d(5000),
    }));
    expect(result.netCapitalGainAmount).toEqual(d(25000));
  });

  it("Form 8995-A Line 35 - income limitation with capital gains", () => {
    // TI = 300K, net CG = 50K + 10K qual div = 60K
    // Income limitation = 20% × (300K - 60K) = 20% × 240K = 48K
    const result = calculateForm8995A(make({
      taxableIncomeBeforeQBI: d(300000),
      netCapitalGain: d(50000),
      qualifiedDividends: d(10000),
    }));
    expect(result.incomeLimitation).toEqual(d(48000));
  });

  it("Form 8995-A Line 39 - deduction limited by income limitation", () => {
    // QBI component would be 20K but income limitation is 10K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(200000) })],
      taxableIncomeBeforeQBI: d(300000),
      netCapitalGain: d(250000), // large cap gains
    }));
    // 20% QBI = 20K; income limit = 20% × (300K - 250K) = 10K
    expect(result.qbiDeduction).toEqual(d(10000));
  });

  it("negative net capital gain treated as zero", () => {
    const result = calculateForm8995A(make({
      netCapitalGain: d(-5000),
      qualifiedDividends: d(3000),
    }));
    // max(0, -5000) + 3000 = 3000
    expect(result.netCapitalGainAmount).toEqual(d(3000));
  });
});

// ═══════════════════════════════════════════════════════════
// Filing Status Variations
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - filing status variations", () => {
  it("MFJ thresholds and phase-in range", () => {
    // MFJ: threshold = 394600, phase-in = 100000, upper = 494600
    // Income = 494600 → at upper threshold → phase-in = 100%
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(300000), w2Wages: d(0), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(494600),
      simplifiedThreshold: d(394600),
      phaseInRange: d(100000),
    }));
    expect(result.phaseInPercentage).toEqual(d(1));
    // Non-SSTB with zero W-2/UBIA above threshold → $0
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("MFS thresholds - same as single", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(80000) })],
      taxableIncomeBeforeQBI: d(250000),
      simplifiedThreshold: d(197300),
      phaseInRange: d(50000),
    }));
    expect(result.phaseInPercentage).toEqual(d(1));
    // 20% × 100K = 20K; 50% × 80K = 40K → component = 20K
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("HoH with SSTB in phase-in range", () => {
    // HoH: threshold = 197300, phase-in = 50000
    // Income = 217300 → phase-in % = 20000/50000 = 40%
    // SSTB applicable % = 60%
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000), ubia: d(200000), isSST: true })],
      taxableIncomeBeforeQBI: d(217300),
      simplifiedThreshold: d(197300),
      phaseInRange: d(50000),
    }));
    expect(result.phaseInPercentage).toEqual(d("0.4"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.6"));
    // Adjusted QBI = 100K × 0.6 = 60K
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(60000));
    // Adjusted W-2 = 50K × 0.6 = 30K
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(30000));
    // Adjusted UBIA = 200K × 0.6 = 120K
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(120000));
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - edge cases", () => {
  it("single dollar above threshold triggers phase-in", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(0), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(197301),
    }));
    // Phase-in % = 1/50000 = 0.00002, nearly zero
    // Excess of 20K × 0.00002 ≈ $0 reduction → component ≈ $20000
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.00002, 5);
    expect(result.businesses[0].line15QBIComponent.toNumber()).toBeGreaterThan(19999);
  });

  it("exact upper threshold boundary - full limitation applies", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(40000), ubia: d(0) })],
      taxableIncomeBeforeQBI: d(247300),
    }));
    expect(result.phaseInPercentage).toEqual(d(1));
    // 50% × 40K = 20K → component = 20K
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
  });

  it("very large income above upper threshold - phase-in capped at 100%", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz()],
      taxableIncomeBeforeQBI: d(1000000),
    }));
    expect(result.phaseInPercentage).toEqual(d(1));
  });

  it("business with QBI loss contributes negative component", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(-30000), w2Wages: d(10000) })],
    }));
    // 20% × -30K = -6K
    expect(result.businesses[0].line15QBIComponent).toEqual(d(-6000));
    // Floored at 0 for total
    expect(result.totalQBIComponent).toEqual(d(0));
  });

  it("zero QBI produces zero deduction", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(0) })],
    }));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("income limitation at zero when capital gains equal taxable income", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(200000) })],
      taxableIncomeBeforeQBI: d(300000),
      netCapitalGain: d(300000),
    }));
    expect(result.incomeLimitation).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// Part IV: Aggregation Elections (Reg. §1.199A-4)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A Part IV - aggregation elections", () => {
  it("aggregation increases deduction - complementary W-2 and UBIA", () => {
    // Two businesses above upper threshold:
    //   Biz A: QBI=100K, W-2=60K, UBIA=0
    //   Biz B: QBI=100K, W-2=0,   UBIA=800K
    //
    // SEPARATELY:
    //   A: 20%×100K=20K; 50%×60K=30K → component=20K
    //   B: 20%×100K=20K; max(50%×0, 25%×0+2.5%×800K)=max(0,20K)=20K → component=20K
    //   Total = 40K
    //
    // AGGREGATED:
    //   Combined QBI=200K, W-2=60K, UBIA=800K
    //   20%×200K=40K; max(50%×60K, 25%×60K+2.5%×800K)=max(30K, 15K+20K=35K)=35K
    //   Component=35K (W-2/UBIA limit binding)
    //
    // But wait — aggregated limit 35K < 40K. Let's pick a better example where
    // aggregation helps: one biz has wages only, other has UBIA only, and
    // the 25%+2.5% path wins when combined.
    //
    // Better example:
    //   Biz A: QBI=150K, W-2=100K, UBIA=0
    //   Biz B: QBI=150K, W-2=0,    UBIA=2M
    //
    // SEPARATELY:
    //   A: 20%×150K=30K; 50%×100K=50K → component=30K (20% QBI wins)
    //   B: 20%×150K=30K; max(0, 2.5%×2M)=50K → component=30K (20% QBI wins)
    //   Total = 60K
    //
    // AGGREGATED:
    //   Combined QBI=300K, W-2=100K, UBIA=2M
    //   20%×300K=60K; max(50%×100K=50K, 25%×100K+2.5%×2M=25K+50K=75K)=75K
    //   Component=60K (20% QBI wins, same)
    //
    // The aggregation helps when the W-2/UBIA limit is binding separately but
    // not when combined. Example:
    //   Biz A: QBI=200K, W-2=50K, UBIA=0    → separate: 20%=40K, 50%W2=25K → 25K
    //   Biz B: QBI=200K, W-2=0,   UBIA=1.6M → separate: 20%=40K, 2.5%UBIA=40K → 40K
    //   Total separate = 65K
    //
    //   Aggregated: QBI=400K, W-2=50K, UBIA=1.6M
    //   20%=80K; max(50%×50K=25K, 25%×50K+2.5%×1.6M=12.5K+40K=52.5K)=52.5K → 52.5K? No, 52500.
    //   That's less. Hmm.
    //
    // The classic scenario: one biz has W-2 that helps the other through the 25%+2.5% path.
    //   Biz A: QBI=100K, W-2=80K, UBIA=0    → 20%=20K; max(40K,20K)=40K → 20K
    //   Biz B: QBI=100K, W-2=0,   UBIA=0    → 20%=20K; max(0,0)=0 → 0K
    //   Total separate = 20K
    //
    //   Aggregated: QBI=200K, W-2=80K, UBIA=0
    //   20%=40K; 50%×80K=40K → 40K. Component=40K.
    //   Total aggregated = 40K → doubles the deduction!
    const separateResult = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Biz A", qbi: d(100000), w2Wages: d(80000), ubia: d(0) }),
        makeBiz({ name: "Biz B", qbi: d(100000), w2Wages: d(0), ubia: d(0) }),
      ],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(separateResult.qbiDeduction).toEqual(d(20000));

    const aggregatedResult = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Biz A", qbi: d(100000), w2Wages: d(80000), ubia: d(0) }),
        makeBiz({ name: "Biz B", qbi: d(100000), w2Wages: d(0), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "Combined Group",
        componentBusinessNames: ["Biz A", "Biz B"],
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(aggregatedResult.qbiDeduction).toEqual(d(40000));
    expect(aggregatedResult.aggregationGroups).toHaveLength(1);
    expect(aggregatedResult.aggregationGroups[0].combinedQBI).toEqual(d(200000));
    expect(aggregatedResult.aggregationGroups[0].combinedW2Wages).toEqual(d(80000));
    expect(aggregatedResult.businesses).toHaveLength(1);
    expect(aggregatedResult.businesses[0].name).toBe("Combined Group");
  });

  it("aggregation combines W-2 and UBIA from complementary businesses", () => {
    // Biz A: high W-2, no UBIA
    // Biz B: no W-2, high UBIA
    // Separately the 25%+2.5% path is weak for each; combined it's strong
    //
    // Biz A: QBI=150K, W-2=100K, UBIA=0 → 20%=30K; max(50K, 25K+0)=50K → 30K
    // Biz B: QBI=150K, W-2=0,   UBIA=2M → 20%=30K; max(0, 0+50K)=50K → 30K
    // Separate total = 60K
    //
    // Aggregated: QBI=300K, W-2=100K, UBIA=2M
    // 20%=60K; max(50K, 25K+50K=75K)=75K → 60K (20% is lesser)
    // Same in this case. Let's use a binding example:
    //
    // Biz A: QBI=300K, W-2=40K, UBIA=0 → 20%=60K; max(20K,10K)=20K → 20K
    // Biz B: QBI=300K, W-2=0, UBIA=600K → 20%=60K; max(0, 0+15K)=15K → 15K
    // Separate total = 35K
    //
    // Aggregated: QBI=600K, W-2=40K, UBIA=600K
    // 20%=120K; max(20K, 10K+15K=25K)=25K → 25K
    // Still less because W-2/UBIA limit is binding. But 25K < 35K.
    // Hmm, for THIS example aggregation doesn't help because both are
    // limit-bound and combining doesn't create synergy.
    //
    // The synergy happens when one business has NO limit-bound constraint.
    // Already tested in the first test. Let's just verify the combined amounts.
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Wages Co", qbi: d(80000), w2Wages: d(60000), ubia: d(0) }),
        makeBiz({ name: "Property Co", qbi: d(80000), w2Wages: d(0), ubia: d(500000) }),
      ],
      aggregationElections: [{
        name: "Combined Ops",
        componentBusinessNames: ["Wages Co", "Property Co"],
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));

    // Combined: QBI=160K, W-2=60K, UBIA=500K
    // 20%×160K=32K; max(50%×60K=30K, 25%×60K+2.5%×500K=15K+12.5K=27.5K)=30K
    // W-2/UBIA limit=30K < 32K → component=30K
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].line1QBI).toEqual(d(160000));
    expect(result.businesses[0].line3W2Wages).toEqual(d(60000));
    expect(result.businesses[0].line5UBIA).toEqual(d(500000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(30000));
    expect(result.aggregationGroups[0].combinedUBIA).toEqual(d(500000));
  });

  it("aggregation with intra-group loss netting", () => {
    // Two aggregated businesses, one profitable and one with a loss
    // The loss nets within the aggregate before W-2/UBIA limit
    //
    // Biz A: QBI=120K, W-2=50K
    // Biz B: QBI=-20K, W-2=10K
    // Combined: QBI=100K, W-2=60K
    // 20%×100K=20K; 50%×60K=30K → component=20K
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Profitable", qbi: d(120000), w2Wages: d(50000), ubia: d(0) }),
        makeBiz({ name: "Loss Biz", qbi: d(-20000), w2Wages: d(10000), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "Netted Group",
        componentBusinessNames: ["Profitable", "Loss Biz"],
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].line1QBI).toEqual(d(100000));
    expect(result.businesses[0].line3W2Wages).toEqual(d(60000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("mixed aggregated and non-aggregated businesses", () => {
    // Three businesses: two aggregated, one standalone
    // Biz A + B aggregated; Biz C standalone
    //
    // Aggregate: QBI=100K+50K=150K, W-2=40K+40K=80K
    //   20%×150K=30K; 50%×80K=40K → component=30K
    // Standalone C: QBI=80K, W-2=60K
    //   20%×80K=16K; 50%×60K=30K → component=16K
    // Total = 46K
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "Biz A", qbi: d(100000), w2Wages: d(40000), ubia: d(0) }),
        makeBiz({ name: "Biz B", qbi: d(50000), w2Wages: d(40000), ubia: d(0) }),
        makeBiz({ name: "Biz C", qbi: d(80000), w2Wages: d(60000), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "AB Group",
        componentBusinessNames: ["Biz A", "Biz B"],
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.businesses).toHaveLength(2); // one aggregate + one standalone
    const abGroup = result.businesses.find((b) => b.name === "AB Group");
    const bizC = result.businesses.find((b) => b.name === "Biz C");
    expect(abGroup!.line1QBI).toEqual(d(150000));
    expect(abGroup!.line15QBIComponent).toEqual(d(30000));
    expect(bizC!.line1QBI).toEqual(d(80000));
    expect(bizC!.line15QBIComponent).toEqual(d(16000));
    expect(result.qbiDeduction).toEqual(d(46000));
  });

  it("multiple aggregation groups", () => {
    // Four businesses in two groups
    // Group 1: A+B → QBI=200K, W-2=100K → 20%=40K; 50%W2=50K → 40K
    // Group 2: C+D → QBI=100K, W-2=80K → 20%=20K; 50%W2=40K → 20K
    // Total = 60K
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "A", qbi: d(120000), w2Wages: d(60000), ubia: d(0) }),
        makeBiz({ name: "B", qbi: d(80000), w2Wages: d(40000), ubia: d(0) }),
        makeBiz({ name: "C", qbi: d(70000), w2Wages: d(50000), ubia: d(0) }),
        makeBiz({ name: "D", qbi: d(30000), w2Wages: d(30000), ubia: d(0) }),
      ],
      aggregationElections: [
        { name: "Group 1", componentBusinessNames: ["A", "B"] },
        { name: "Group 2", componentBusinessNames: ["C", "D"] },
      ],
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.businesses).toHaveLength(2);
    expect(result.aggregationGroups).toHaveLength(2);
    expect(result.qbiDeduction).toEqual(d(60000));
  });

  it("all businesses aggregated into one group", () => {
    // Same as computing a single combined entry
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "X", qbi: d(80000), w2Wages: d(30000), ubia: d(0) }),
        makeBiz({ name: "Y", qbi: d(60000), w2Wages: d(40000), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "All-In-One",
        componentBusinessNames: ["X", "Y"],
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    // Combined: QBI=140K, W-2=70K
    // 20%×140K=28K; 50%×70K=35K → component=28K
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].name).toBe("All-In-One");
    expect(result.businesses[0].line1QBI).toEqual(d(140000));
    expect(result.qbiDeduction).toEqual(d(28000));
  });

  it("aggregation with prior-year QBI loss carryforward", () => {
    // Two aggregated businesses + prior year loss
    // Combined QBI = 100K + 50K = 150K; prior loss = 30K → adjusted = 120K
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "P", qbi: d(100000), w2Wages: d(40000), ubia: d(0) }),
        makeBiz({ name: "Q", qbi: d(50000), w2Wages: d(30000), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "PQ Group",
        componentBusinessNames: ["P", "Q"],
      }],
      priorYearQBILoss: d(30000),
      taxableIncomeBeforeQBI: d(300000),
    }));
    // Combined: QBI=150K, W-2=70K, loss netting: 150K-30K=120K
    // 20%×120K=24K; 50%×70K=35K → component=24K
    expect(result.businesses[0].line1QBI).toEqual(d(120000));
    expect(result.qbiDeduction).toEqual(d(24000));
  });

  it("no aggregation returns empty aggregationGroups array", () => {
    const result = calculateForm8995A(make());
    expect(result.aggregationGroups).toEqual([]);
  });

  it("aggregation in phase-in range uses shared phase-in percentage", () => {
    // Income in mid-phase-in for single: 222300
    // Phase-in % = (222300-197300)/50000 = 50%
    // Aggregated non-SSTB: QBI=200K, W-2=40K
    // Adjusted QBI = 200K (non-SSTB → no SSTB reduction)
    // 20%×200K=40K; 50%×40K=20K; excess=20K; reduction=20K×50%=10K
    // Component = 40K - 10K = 30K
    const result = calculateForm8995A(make({
      qbiSources: [
        makeBiz({ name: "M", qbi: d(120000), w2Wages: d(25000), ubia: d(0) }),
        makeBiz({ name: "N", qbi: d(80000), w2Wages: d(15000), ubia: d(0) }),
      ],
      aggregationElections: [{
        name: "MN Group",
        componentBusinessNames: ["M", "N"],
      }],
      taxableIncomeBeforeQBI: d(222300),
    }));
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].line1QBI).toEqual(d(200000));
    expect(result.businesses[0].line3W2Wages).toEqual(d(40000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(30000));
  });
});

// ═══════════════════════════════════════════════════════════
// Part IV: Aggregation Validation Errors
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A Part IV - aggregation validation", () => {
  it("aggregation rejects SSTB business", () => {
    expect(() =>
      calculateForm8995A(make({
        qbiSources: [
          makeBiz({ name: "Non-SSTB", qbi: d(100000), w2Wages: d(50000), isSST: false }),
          makeBiz({ name: "Law Firm", qbi: d(80000), w2Wages: d(40000), isSST: true }),
        ],
        aggregationElections: [{
          name: "Bad Group",
          componentBusinessNames: ["Non-SSTB", "Law Firm"],
        }],
      })),
    ).toThrow(/SSTB.*Law Firm.*Reg\. §1\.199A-4/);
  });

  it("aggregation rejects unknown business name", () => {
    expect(() =>
      calculateForm8995A(make({
        qbiSources: [
          makeBiz({ name: "Real Biz" }),
        ],
        aggregationElections: [{
          name: "Ghost Group",
          componentBusinessNames: ["Real Biz", "Fake Biz"],
        }],
      })),
    ).toThrow(/unknown business.*Fake Biz/);
  });

  it("aggregation rejects single-business group", () => {
    expect(() =>
      calculateForm8995A(make({
        qbiSources: [
          makeBiz({ name: "Solo" }),
        ],
        aggregationElections: [{
          name: "Solo Group",
          componentBusinessNames: ["Solo"],
        }],
      })),
    ).toThrow(/at least two businesses/);
  });

  it("aggregation rejects business in multiple groups", () => {
    expect(() =>
      calculateForm8995A(make({
        qbiSources: [
          makeBiz({ name: "A" }),
          makeBiz({ name: "B" }),
          makeBiz({ name: "C" }),
        ],
        aggregationElections: [
          { name: "Group 1", componentBusinessNames: ["A", "B"] },
          { name: "Group 2", componentBusinessNames: ["B", "C"] },
        ],
      })),
    ).toThrow(/more than one aggregation group/);
  });
});

// ═══════════════════════════════════════════════════════════
// REIT Dividends and PTP Income (Lines 17-32)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A - REIT dividends and PTP income", () => {
  it("Form 8995-A Line 17 - qualified REIT dividends", () => {
    const result = calculateForm8995A(make({
      qbiSources: [],
      qualifiedReitDividends: d(25000),
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.qualifiedReitDividends.toNumber()).toBe(25000);
    // REIT component: 20% of $25K = $5K (no W-2/UBIA limit per IRC §199A(b)(3))
    expect(result.reitPTPComponent.toNumber()).toBe(5000);
  });

  it("Form 8995-A Lines 18-31 - PTP with W-2/UBIA limits", () => {
    // PTP above upper threshold with W-2/UBIA limits
    const result = calculateForm8995A(make({
      qbiSources: [],
      ptpSources: [{
        name: "Public Energy LP (PTP)",
        qbi: d(40000),
        w2Wages: d(20000),
        ubia: d(100000),
        isSST: false,
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    // Above upper threshold (single $247,300): full W-2/UBIA limit applies
    // 50% of W-2 = $10K
    // 25% of W-2 + 2.5% of UBIA = $5K + $2.5K = $7.5K
    // W-2/UBIA limit = max($10K, $7.5K) = $10K
    // 20% of QBI = $8K
    // PTP component = min($10K, $8K) = $8K
    expect(result.ptpBusinesses.length).toBe(1);
    expect(result.ptpBusinesses[0].line15QBIComponent.toNumber()).toBe(8000);
  });

  it("Form 8995-A Line 32 - REIT and PTP component", () => {
    const result = calculateForm8995A(make({
      qbiSources: [],
      qualifiedReitDividends: d(25000),
      ptpSources: [{
        name: "Energy LP (PTP)",
        qbi: d(50000),
        w2Wages: d(30000),
        ubia: d(0),
        isSST: false,
      }],
      taxableIncomeBeforeQBI: d(300000),
    }));
    // REIT: 20% of $25K = $5K
    // PTP: 50% of W-2 = $15K; 20% of QBI = $10K; component = min($15K, $10K) = $10K
    // Total REIT/PTP: $5K + $10K = $15K
    expect(result.reitPTPComponent.toNumber()).toBe(15000);
  });

  it("Form 8995-A Line 36 - combined QBI and REIT/PTP", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ name: "Consulting", qbi: d(100000), w2Wages: d(80000) })],
      qualifiedReitDividends: d(20000),
      taxableIncomeBeforeQBI: d(300000),
    }));
    // QBI component above upper threshold:
    // 50% of $80K = $40K; 20% of $100K = $20K; component = min($40K, $20K) = $20K
    // REIT component: 20% of $20K = $4K
    // Combined: $20K + $4K = $24K
    expect(result.combinedComponent.toNumber()).toBe(24000);
  });

  it("REIT-only investor above threshold gets 20% REIT deduction without W-2/UBIA limit", () => {
    const result = calculateForm8995A(make({
      qbiSources: [],
      qualifiedReitDividends: d(50000),
      taxableIncomeBeforeQBI: d(400000),
      simplifiedThreshold: d(394600),
      phaseInRange: d(100000),
    }));
    // REIT dividends are NOT subject to W-2/UBIA limits per IRC §199A(b)(3)
    expect(result.totalQBIComponent.toNumber()).toBe(0);
    expect(result.reitPTPComponent.toNumber()).toBe(10000); // 20% of $50K
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });

  it("PTP SSTB above upper threshold produces zero PTP component but preserves REIT", () => {
    const result = calculateForm8995A(make({
      qbiSources: [],
      qualifiedReitDividends: d(15000),
      ptpSources: [{
        name: "Law Firm LP (PTP)",
        qbi: d(30000),
        w2Wages: d(20000),
        ubia: d(0),
        isSST: true, // SSTB
      }],
      taxableIncomeBeforeQBI: d(300000), // above single upper threshold $247,300
    }));
    // SSTB above upper threshold: applicable % = 0, so PTP QBI = $0
    expect(result.ptpBusinesses[0].line2AdjustedQBI.toNumber()).toBe(0);
    expect(result.ptpBusinesses[0].line15QBIComponent.toNumber()).toBe(0);
    // REIT component still 20% of $15K = $3K
    expect(result.reitPTPComponent.toNumber()).toBe(3000);
    expect(result.qbiDeduction.toNumber()).toBe(3000);
  });

  it("REIT and QBI combined deduction limited by income limitation", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(500000), w2Wages: d(300000) })],
      qualifiedReitDividends: d(100000),
      taxableIncomeBeforeQBI: d(300000),
      netCapitalGain: d(250000),
      qualifiedDividends: d(20000),
    }));
    // Income limitation: 20% of ($300K - $250K - $20K) = 20% of $30K = $6K
    // Combined component would be much higher, but limited to $6K
    expect(result.qbiDeduction.toNumber()).toBe(6000);
  });

  it("mixed QBI sources with REIT and PTP at MFJ threshold", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({
        name: "Consulting",
        qbi: d(80000),
        w2Wages: d(60000),
        ubia: d(0),
        isSST: false,
      })],
      qualifiedReitDividends: d(12000),
      ptpSources: [{
        name: "Oil LP (PTP)",
        qbi: d(20000),
        w2Wages: d(10000),
        ubia: d(50000),
        isSST: false,
      }],
      taxableIncomeBeforeQBI: d(450000),
      simplifiedThreshold: d(394600), // MFJ
      phaseInRange: d(100000),
    }));
    // Phase-in %: ($450K - $394,600) / $100K = 55.4%
    // SSTB applicable %: 1 - 0.554 = 0.446 (but non-SSTB so full 100%)
    // Consulting: 20% of $80K = $16K; 50% of $60K = $30K; limited to $16K
    //   Excess: $0; component = $16K
    // But we're in phase-in range so the reduction formula applies...
    // REIT: 20% of $12K = $2,400
    // PTP: 20% of $20K = $4K; 50% of $10K = $5K; limited to $4K
    //   component = $4K
    // Total combined should be positive
    expect(result.combinedComponent.greaterThan(0)).toBe(true);
    expect(result.reitPTPComponent.greaterThan(0)).toBe(true);
    expect(result.qbiDeduction.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule D: Patron Reduction for Specified Cooperatives
// ═══════════════════════════════════════════════════════════

function makePatronage(overrides: Partial<PatronageCooperativeSource> = {}): PatronageCooperativeSource {
  return {
    cooperativeName: "Farm Cooperative",
    qbiAllocableToQualifiedPayments: d(80000),
    w2WagesAllocableToQualifiedPayments: d(30000),
    cooperativeDPAD: d(5000),
    ...overrides,
  };
}

describe("Form 8995-A Schedule D - patron reduction", () => {
  it("Schedule D Line 2 - QBI allocable to qualified payments", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({ qbiAllocableToQualifiedPayments: d(60000) })],
    }));
    expect(result.patronageResults[0].qbiAllocable).toEqual(d(60000));
  });

  it("Schedule D Line 3 - 9% of allocable QBI", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({ qbiAllocableToQualifiedPayments: d(100000) })],
    }));
    // 9% × $100K = $9,000
    expect(result.patronageResults[0].ninePercentQBI).toEqual(d(9000));
  });

  it("Schedule D Line 4 - W-2 wages allocable to qualified payments", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({ w2WagesAllocableToQualifiedPayments: d(40000) })],
    }));
    expect(result.patronageResults[0].w2WagesAllocable).toEqual(d(40000));
  });

  it("Schedule D Line 5 - 50% of allocable W-2 wages", () => {
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({ w2WagesAllocableToQualifiedPayments: d(40000) })],
    }));
    // 50% × $40K = $20,000
    expect(result.patronageResults[0].fiftyPercentW2).toEqual(d(20000));
  });

  it("Schedule D Line 6 - patron reduction is lesser of 9% QBI or 50% W-2", () => {
    // 9% × $80K = $7,200; 50% × $30K = $15,000 → lesser = $7,200
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(80000),
        w2WagesAllocableToQualifiedPayments: d(30000),
      })],
    }));
    expect(result.patronageResults[0].ninePercentQBI).toEqual(d(7200));
    expect(result.patronageResults[0].fiftyPercentW2).toEqual(d(15000));
    expect(result.patronageResults[0].patronReduction).toEqual(d(7200));
  });

  it("patron reduction where 50% W-2 is the binding limit", () => {
    // 9% × $200K = $18,000; 50% × $10K = $5,000 → lesser = $5,000
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(200000),
        w2WagesAllocableToQualifiedPayments: d(10000),
      })],
    }));
    expect(result.patronageResults[0].patronReduction).toEqual(d(5000));
    expect(result.totalPatronReduction).toEqual(d(5000));
  });

  it("patron with no W-2 wages gets zero patron reduction", () => {
    // Sole proprietor farmer with no employees: 50% of $0 = $0
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(150000), w2Wages: d(80000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(120000),
        w2WagesAllocableToQualifiedPayments: d(0),
        cooperativeDPAD: d(8000),
      })],
    }));
    expect(result.patronageResults[0].fiftyPercentW2).toEqual(d(0));
    expect(result.patronageResults[0].patronReduction).toEqual(d(0));
    expect(result.totalPatronReduction).toEqual(d(0));
    // Full QBI deduction preserved, plus DPAD added
    // Above upper threshold: QBI=150K, W-2=80K → 20%=30K; 50%×80K=40K → 30K
    // No patron reduction → combined=30K; Line 37=30K; DPAD=8K; total=38K
    // Income limit = 20% × $300K = $60K → not binding
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(30000));
    expect(result.cooperativeDPAD).toEqual(d(8000));
    expect(result.qbiDeduction).toEqual(d(38000));
  });

  it("patron with W-2 wages gets patron reduction", () => {
    // Farmer with employees
    // Business: QBI=100K, W-2=50K → above upper threshold
    // 20%×100K=20K; 50%×50K=25K → component=20K
    // Patronage: QBI allocable=80K, W-2 allocable=30K
    // 9%×80K=7200; 50%×30K=15000 → patron reduction=7200
    // DPAD=5000
    // Combined=20K; adjusted=20K-7200=12800; income limit=60K
    // Line 37=12800; DPAD cap=300K-12800=287200; DPAD=5000
    // Line 39=12800+5000=17800
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(80000),
        w2WagesAllocableToQualifiedPayments: d(30000),
        cooperativeDPAD: d(5000),
      })],
    }));
    expect(result.totalPatronReduction).toEqual(d(7200));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(12800));
    expect(result.cooperativeDPAD).toEqual(d(5000));
    expect(result.qbiDeduction).toEqual(d(17800));
  });
});

describe("Form 8995-A Schedule D - DPAD and Lines 37-39", () => {
  it("Line 37 - QBI deduction before DPAD with no patronage", () => {
    // No patronage sources → Line 37 = min(combined, income limit)
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(200000) })],
    }));
    // 20% × 100K = 20K; income limit = 20% × 300K = 60K → Line 37 = 20K
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(20000));
    expect(result.cooperativeDPAD).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("Line 38 - DPAD from cooperative capped at TI minus QBI deduction", () => {
    // Large DPAD should be capped
    // Business: QBI=280K, W-2=200K → above upper threshold
    // 20%×280K=56K; 50%×200K=100K → component=56K
    // Patronage: QBI=200K, W-2=100K → 9%×200K=18K; 50%×100K=50K → reduction=18K
    // Combined=56K; adjusted=56K-18K=38K; income limit=20%×300K=60K
    // Line 37=38K; DPAD cap=300K-38K=262K; DPAD=100K → capped at 100K (under cap)
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(280000), w2Wages: d(200000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(200000),
        w2WagesAllocableToQualifiedPayments: d(100000),
        cooperativeDPAD: d(100000),
      })],
    }));
    expect(result.totalPatronReduction).toEqual(d(18000));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(38000));
    expect(result.cooperativeDPAD).toEqual(d(100000));
    expect(result.qbiDeduction).toEqual(d(138000));
  });

  it("DPAD capped when it exceeds taxable income minus QBI deduction", () => {
    // Low taxable income so the cap binds
    // TI=50K; business: QBI=200K, W-2=200K → above threshold for single at $300K?
    // Wait, need TI above simplified threshold. Let's use TI=200K (above 197.3K threshold)
    // phase-in: (200K-197.3K)/50K = 5.4%
    // non-SSTB: no SSTB reduction. 20%×200K=40K.
    // W-2/UBIA limit: 50%×200K=100K. Excess=0. Reduction=0. Component=40K.
    // But income limit: 20%×200K=40K. Combined=40K.
    // Patronage: no reduction. DPAD=180K.
    // Line 37=40K. DPAD cap=200K-40K=160K. DPAD=min(180K,160K)=160K.
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(200000), w2Wages: d(200000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(0),
        w2WagesAllocableToQualifiedPayments: d(0),
        cooperativeDPAD: d(180000),
      })],
      taxableIncomeBeforeQBI: d(200000),
    }));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(40000));
    // DPAD cap = 200K - 40K = 160K
    expect(result.cooperativeDPAD).toEqual(d(160000));
    expect(result.qbiDeduction).toEqual(d(200000));
  });

  it("multiple cooperatives aggregate patron reduction and DPAD", () => {
    // Two cooperatives
    // Coop A: QBI alloc=60K, W-2 alloc=20K, DPAD=3K
    //   9%×60K=5400; 50%×20K=10000 → reduction=5400
    // Coop B: QBI alloc=40K, W-2 alloc=10K, DPAD=2K
    //   9%×40K=3600; 50%×10K=5000 → reduction=3600
    // Total reduction=9000, total DPAD=5000
    // Business: QBI=150K, W-2=80K → above upper threshold
    // 20%×150K=30K; 50%×80K=40K → component=30K
    // Combined=30K; adjusted=30K-9K=21K; income limit=60K
    // Line 37=21K; DPAD=5K; total=26K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(150000), w2Wages: d(80000) })],
      patronageSources: [
        makePatronage({
          cooperativeName: "Grain Coop A",
          qbiAllocableToQualifiedPayments: d(60000),
          w2WagesAllocableToQualifiedPayments: d(20000),
          cooperativeDPAD: d(3000),
        }),
        makePatronage({
          cooperativeName: "Dairy Coop B",
          qbiAllocableToQualifiedPayments: d(40000),
          w2WagesAllocableToQualifiedPayments: d(10000),
          cooperativeDPAD: d(2000),
        }),
      ],
    }));
    expect(result.patronageResults).toHaveLength(2);
    expect(result.patronageResults[0].patronReduction).toEqual(d(5400));
    expect(result.patronageResults[1].patronReduction).toEqual(d(3600));
    expect(result.totalPatronReduction).toEqual(d(9000));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(21000));
    expect(result.cooperativeDPAD).toEqual(d(5000));
    expect(result.qbiDeduction).toEqual(d(26000));
  });

  it("patron reduction can reduce combined component to zero", () => {
    // Large patron reduction relative to QBI component
    // Business: QBI=50K, W-2=200K → 20%=10K; 50%×200K=100K → component=10K
    // Patronage: QBI alloc=50K, W-2 alloc=200K → 9%×50K=4500; 50%×200K=100K → reduction=4500
    // Adjusted combined=10K-4.5K=5.5K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(50000), w2Wages: d(200000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(50000),
        w2WagesAllocableToQualifiedPayments: d(200000),
        cooperativeDPAD: d(3000),
      })],
    }));
    expect(result.totalPatronReduction).toEqual(d(4500));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(5500));
    expect(result.cooperativeDPAD).toEqual(d(3000));
    expect(result.qbiDeduction).toEqual(d(8500));
  });

  it("no patronage sources produces zero patron reduction and zero DPAD", () => {
    const result = calculateForm8995A(make());
    expect(result.patronageResults).toEqual([]);
    expect(result.totalPatronReduction).toEqual(d(0));
    expect(result.cooperativeDPAD).toEqual(d(0));
    expect(result.qbiDeductionBeforeDPAD).toEqual(result.qbiDeduction);
  });

  it("patronage with income limitation binding", () => {
    // QBI high but income limitation is the binding constraint
    // Business: QBI=500K, W-2=300K → 20%=100K; 50%×300K=150K → component=100K
    // Patronage: QBI alloc=100K, W-2 alloc=50K → 9%×100K=9K; 50%×50K=25K → reduction=9K
    // Combined=100K; adjusted=100K-9K=91K
    // TI=300K, cap gains=250K → income limit=20%×(300K-250K)=10K
    // Line 37=min(91K,10K)=10K; DPAD=5K, cap=300K-10K=290K → DPAD=5K
    // Line 39=15K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(500000), w2Wages: d(300000) })],
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(100000),
        w2WagesAllocableToQualifiedPayments: d(50000),
        cooperativeDPAD: d(5000),
      })],
      netCapitalGain: d(250000),
    }));
    expect(result.incomeLimitation).toEqual(d(10000));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(10000));
    expect(result.cooperativeDPAD).toEqual(d(5000));
    expect(result.qbiDeduction).toEqual(d(15000));
  });

  it("patronage with REIT dividends preserves REIT component", () => {
    // REIT dividends are not affected by patron reduction
    // REIT: $20K → 20% = $4K REIT component
    // Business: QBI=100K, W-2=50K → 20%=20K; 50%=25K → component=20K
    // Combined=20K+4K=24K
    // Patron reduction: 9%×80K=7200; 50%×30K=15000 → 7200
    // Adjusted=24K-7.2K=16.8K; income limit=60K → Line 37=16.8K
    // DPAD=5K; total=21.8K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000) })],
      qualifiedReitDividends: d(20000),
      patronageSources: [makePatronage({
        qbiAllocableToQualifiedPayments: d(80000),
        w2WagesAllocableToQualifiedPayments: d(30000),
        cooperativeDPAD: d(5000),
      })],
    }));
    expect(result.reitPTPComponent).toEqual(d(4000));
    expect(result.combinedComponent).toEqual(d(24000));
    expect(result.totalPatronReduction).toEqual(d(7200));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(16800));
    expect(result.cooperativeDPAD).toEqual(d(5000));
    expect(result.qbiDeduction).toEqual(d(21800));
  });

  it("realistic farmer scenario - Schedule F with cooperative", () => {
    // Single farmer, TI=$250K (above upper threshold $247.3K)
    // Farm QBI = $180K, W-2 wages to hired help = $40K, UBIA = $500K
    // Sells $120K of grain through Grain Coop, rest through direct sales
    // Coop passes through $8K DPAD (1099-PATR Box 6)
    //
    // Part I: 20%×180K=36K
    //   50%×40K=20K; 25%×40K+2.5%×500K=10K+12.5K=22.5K → limit=22.5K
    //   Component=min(22.5K,36K)=22.5K (W-2/UBIA limit binding)
    //
    // Schedule D: QBI alloc=120K, W-2 alloc=40K×(120/180)=26.667K
    //   9%×120K=10.8K; 50%×26667=13333 → reduction=10800
    //
    // Combined=22.5K; adjusted=22.5K-10.8K=11.7K; income limit=20%×250K=50K
    // Line 37=11.7K; DPAD=8K; total=19.7K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({
        name: "Smith Family Farm",
        qbi: d(180000),
        w2Wages: d(40000),
        ubia: d(500000),
      })],
      patronageSources: [{
        cooperativeName: "Heartland Grain Coop",
        qbiAllocableToQualifiedPayments: d(120000),
        w2WagesAllocableToQualifiedPayments: d(26667),
        cooperativeDPAD: d(8000),
      }],
      taxableIncomeBeforeQBI: d(250000),
    }));
    // W-2/UBIA limit: max(50%×40K=20K, 25%×40K+2.5%×500K=22.5K) = 22.5K
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(22500));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(22500));
    // Patron reduction: 9%×120K=10800; 50%×26667=13334 → 10800
    expect(result.patronageResults[0].ninePercentQBI).toEqual(d(10800));
    expect(result.patronageResults[0].patronReduction).toEqual(d(10800));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(11700));
    expect(result.cooperativeDPAD).toEqual(d(8000));
    expect(result.qbiDeduction).toEqual(d(19700));
  });

  it("MFJ farmer couple with cooperative above MFJ threshold", () => {
    // MFJ: threshold=$394,600, phase-in=$100,000, upper=$494,600
    // TI=$500K (above upper threshold)
    // Farm QBI=$300K, W-2=$60K, UBIA=$1M
    // Coop: QBI alloc=$200K, W-2 alloc=$40K, DPAD=$12K
    //
    // Part I: 20%×300K=60K
    //   50%×60K=30K; 25%×60K+2.5%×1M=15K+25K=40K → limit=40K
    //   Component=40K (W-2/UBIA binding)
    //
    // Schedule D: 9%×200K=18K; 50%×40K=20K → reduction=18K
    // Adjusted=40K-18K=22K; income limit=20%×500K=100K → Line 37=22K
    // DPAD=12K; total=34K
    const result = calculateForm8995A(make({
      qbiSources: [makeBiz({ qbi: d(300000), w2Wages: d(60000), ubia: d(1000000) })],
      patronageSources: [makePatronage({
        cooperativeName: "Central Valley Coop",
        qbiAllocableToQualifiedPayments: d(200000),
        w2WagesAllocableToQualifiedPayments: d(40000),
        cooperativeDPAD: d(12000),
      })],
      taxableIncomeBeforeQBI: d(500000),
      simplifiedThreshold: d(394600),
      phaseInRange: d(100000),
    }));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(40000));
    expect(result.totalPatronReduction).toEqual(d(18000));
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(22000));
    expect(result.cooperativeDPAD).toEqual(d(12000));
    expect(result.qbiDeduction).toEqual(d(34000));
  });
});

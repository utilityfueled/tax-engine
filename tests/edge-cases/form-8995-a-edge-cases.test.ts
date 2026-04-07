/**
 * Form 8995-A — Qualified Business Income Deduction (Detailed Computation)
 * Edge case tests for SSTB phase-outs, W-2/UBIA limits, filing status
 * boundaries, aggregation, and income limitation interactions.
 *
 * Spec: spec/federal/form-8995-a.yaml
 * Constants: src/models/constants.ts (qbi thresholds)
 *
 * 2025 thresholds per Rev. Proc. 2024-40 §3.01:
 *   Single/MFS/HoH/QSS: $197,300 simplified threshold, $50,000 phase-in
 *   MFJ: $394,600 simplified threshold, $100,000 phase-in
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8995A } from "@/engine/forms/form-8995-a.js";
import type {
  Form8995AInput,
  QBIBusinessSource,
  PatronageCooperativeSource,
} from "@/engine/forms/form-8995-a.js";

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
    taxableIncomeBeforeQBI: d(300000),
    netCapitalGain: d(0),
    qualifiedDividends: d(0),
    simplifiedThreshold: d(197300),
    phaseInRange: d(50000),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// 1. SSTB phase-out boundary precision
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A SSTB phase-out boundary precision", () => {
  const sstbBiz = (overrides: Partial<QBIBusinessSource> = {}): QBIBusinessSource =>
    makeBiz({ name: "SSTB Practice", isSST: true, ...overrides });

  it("SSTB at exactly the simplified threshold ($197,300 single) — 0% phase-in, full QBI", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(197300),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.sstbApplicablePercentage).toEqual(d(1));
    // Full 20% of QBI with no W-2/UBIA limitation at the threshold
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(100000));
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
  });

  it("SSTB $1 above simplified threshold ($197,301 single) — phase-in begins", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(197301),
      }),
    );
    // phase-in% = 1/50000 = 0.00002
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.00002, 8);
    // SSTB applicable% = 1 - 0.00002 = 0.99998
    expect(result.sstbApplicablePercentage.toNumber()).toBeCloseTo(0.99998, 8);
    // Adjusted QBI is very slightly reduced
    expect(result.businesses[0].line2AdjustedQBI.lessThan(d(100000))).toBe(true);
  });

  it("SSTB $1 below upper threshold ($247,299 single) — SSTB almost fully excluded", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(247299),
      }),
    );
    // phase-in% = 49999/50000 = 0.99998
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.99998, 4);
    // SSTB applicable% ≈ 0.00002 — nearly zero
    expect(result.sstbApplicablePercentage.toNumber()).toBeCloseTo(0.00002, 4);
    // Adjusted QBI is nearly $0
    expect(result.businesses[0].line2AdjustedQBI.toNumber()).toBeCloseTo(2, 0);
  });

  it("SSTB exactly at upper threshold ($247,300 single) — SSTB fully excluded", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(247300),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(1));
    expect(result.sstbApplicablePercentage).toEqual(d(0));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
  });

  it("SSTB at exact midpoint of phase-in ($222,300 single) — 50% applicable", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(222300),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
    // QBI reduced by 50%
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(50000));
    // W-2 also reduced by 50%
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(25000));
    // UBIA also reduced by 50%
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(100000));
  });
});

// ═══════════════════════════════════════════════════════════
// 2. MFJ SSTB phase-out boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A MFJ SSTB phase-out boundaries", () => {
  const sstbBiz = (): QBIBusinessSource =>
    makeBiz({ name: "SSTB Consulting", isSST: true, qbi: d(200000), w2Wages: d(100000), ubia: d(400000) });

  it("MFJ at exactly $394,600 — full SSTB inclusion", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(394600),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.sstbApplicablePercentage).toEqual(d(1));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(200000));
  });

  it("MFJ $1 above $394,600 — SSTB phase-out begins", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(394601),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    // phase-in% = 1/100000 = 0.00001
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.00001, 8);
    expect(result.businesses[0].line2AdjustedQBI.lessThan(d(200000))).toBe(true);
  });

  it("MFJ at exact upper threshold ($494,600) — SSTB fully excluded", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(494600),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(1));
    expect(result.sstbApplicablePercentage).toEqual(d(0));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
  });

  it("MFJ at midpoint ($444,600) — 50% SSTB applicable", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(444600),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(100000));
  });
});

// ═══════════════════════════════════════════════════════════
// 3. W-2/UBIA limit crossover — where 50% W-2 = 25% W-2 + 2.5% UBIA
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A W-2/UBIA limit crossover point", () => {
  it("50% W-2 exactly equals 25% W-2 + 2.5% UBIA — both paths yield same limit", () => {
    // 50% * W2 = 25% * W2 + 2.5% * UBIA  →  25% * W2 = 2.5% * UBIA  →  UBIA = 10 * W2
    // At W2=50000, UBIA=500000: Line 7 = 25000, Line 8 = 12500 + 12500 = 25000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ w2Wages: d(50000), ubia: d(500000) })],
        taxableIncomeBeforeQBI: d(300000), // above upper threshold
      }),
    );
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(25000));
    expect(result.businesses[0].line8TwentyFivePlusTwoPointFive).toEqual(d(25000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(25000));
  });

  it("W-2 heavy (UBIA < 10x W-2) — 50% W-2 path dominates", () => {
    // W2=80000, UBIA=100000: Line 7 = 40000, Line 8 = 20000 + 2500 = 22500
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ w2Wages: d(80000), ubia: d(100000) })],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(40000));
    expect(result.businesses[0].line8TwentyFivePlusTwoPointFive).toEqual(d(22500));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(40000));
  });

  it("UBIA heavy (UBIA > 10x W-2) — 25% W-2 + 2.5% UBIA path dominates", () => {
    // W2=20000, UBIA=800000: Line 7 = 10000, Line 8 = 5000 + 20000 = 25000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ w2Wages: d(20000), ubia: d(800000) })],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(10000));
    expect(result.businesses[0].line8TwentyFivePlusTwoPointFive).toEqual(d(25000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(25000));
  });
});

// ═══════════════════════════════════════════════════════════
// 4. Income limitation edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A income limitation edge cases", () => {
  it("Line 35 - capital gains exactly equal taxable income — income limitation is $0", () => {
    // All income is capital gains/qualified dividends → Line 35 = 20% × 0 = 0
    const result = calculateForm8995A(
      make({
        taxableIncomeBeforeQBI: d(300000),
        netCapitalGain: d(250000),
        qualifiedDividends: d(50000), // total Line 34 = 300000
      }),
    );
    expect(result.netCapitalGainAmount).toEqual(d(300000));
    expect(result.incomeLimitation).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("Line 35 - capital gains exceed taxable income — income limitation still $0 (floored)", () => {
    const result = calculateForm8995A(
      make({
        taxableIncomeBeforeQBI: d(200000),
        netCapitalGain: d(250000),
        qualifiedDividends: d(0),
      }),
    );
    // Line 34 = 250000, but base = max(0, 200000 - 250000) = 0
    expect(result.incomeLimitation).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("Line 35 - no capital gains — income limitation is 20% of full taxable income", () => {
    const result = calculateForm8995A(
      make({
        taxableIncomeBeforeQBI: d(300000),
        netCapitalGain: d(0),
        qualifiedDividends: d(0),
      }),
    );
    expect(result.incomeLimitation).toEqual(d(60000)); // 20% × 300000
  });

  it("combined QBI component exactly equals income limitation — neither is binding", () => {
    // Set up so 20% of QBI = 20% of (TI - cap gains)
    // QBI = 100000, TI = 300000, cap gains = 200000
    // 20% × 100000 = 20000; 20% × (300000 - 200000) = 20000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(100000), ubia: d(1000000) })],
        taxableIncomeBeforeQBI: d(300000),
        netCapitalGain: d(200000),
        qualifiedDividends: d(0),
      }),
    );
    // W-2/UBIA limit: max(50000, 25000+25000) = 50000; 20% QBI = 20000 → Line 11 = 20000
    expect(result.combinedComponent).toEqual(d(20000));
    expect(result.incomeLimitation).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
  });
});

// ═══════════════════════════════════════════════════════════
// 5. QSS filing status — same thresholds as MFJ
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A QSS (qualifying surviving spouse) filing status", () => {
  it("QSS uses same thresholds as single ($197,300) per Rev. Proc. 2024-40", () => {
    // QSS threshold is $197,300 with $50,000 phase-in (same as single/MFS/HoH per spec)
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ isSST: true, name: "SSTB" })],
        taxableIncomeBeforeQBI: d(222300), // midpoint for $197,300 threshold
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
  });
});

// ═══════════════════════════════════════════════════════════
// 6. Non-SSTB above upper threshold — W-2/UBIA limit fully binding
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A non-SSTB W-2/UBIA hard cap above upper threshold", () => {
  it("non-SSTB with zero W-2 and zero UBIA above upper threshold — QBI deduction is $0", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ w2Wages: d(0), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // W-2/UBIA limit = max(0, 0) = 0; phase-in = 100%; reduction = excess × 1
    // Line 10 (20% QBI) = 20000; Line 11 = min(0, 20000) = 0; excess = 20000
    // Line 14 = 20000 × 1 = 20000; Line 15 = 20000 - 20000 = 0
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("non-SSTB exactly at upper threshold — W-2/UBIA limit fully applies", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(30000), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(247300), // exactly at upper threshold
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(1));
    // W-2/UBIA limit = max(15000, 7500) = 15000
    // 20% QBI = 20000, lesser = 15000, deduction = 15000
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(15000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(15000));
  });
});

// ═══════════════════════════════════════════════════════════
// 7. Loss carryforward compound scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A loss carryforward compound scenarios", () => {
  it("prior-year loss + current-year loss exceed positive QBI — partial carryforward", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [
          makeBiz({ name: "Profitable", qbi: d(50000), w2Wages: d(30000), ubia: d(100000) }),
          makeBiz({ name: "Loss Biz", qbi: d(-20000), w2Wages: d(0), ubia: d(0) }),
        ],
        priorYearQBILoss: d(40000),
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // Total losses = 40000 (prior) + 20000 (current) = 60000
    // Total positive QBI = 50000
    // Nettable = min(60000, 50000) = 50000
    // Remaining loss = 60000 - 50000 = 10000 carryforward
    expect(result.qbiLossCarryforward).toEqual(d(10000));
    // QBI component should be $0 (all positive QBI netted away)
    expect(result.totalQBIComponent).toEqual(d(0));
  });

  it("prior-year loss exactly equals positive QBI — zero deduction, zero carryforward", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "Biz", qbi: d(100000), w2Wages: d(50000), ubia: d(200000) })],
        priorYearQBILoss: d(100000),
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // Losses = 100000, positive QBI = 100000, nettable = 100000
    // All QBI netted, carryforward = 0
    expect(result.qbiLossCarryforward).toEqual(d(0));
    expect(result.totalQBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });

  it("current-year loss with no prior loss and no positive QBI — full carryforward", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "Loss Only", qbi: d(-75000), w2Wages: d(0), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    expect(result.qbiLossCarryforward).toEqual(d(75000));
    expect(result.totalQBIComponent).toEqual(d(0));
    expect(result.qbiDeduction).toEqual(d(0));
  });
});

// ═══════════════════════════════════════════════════════════
// 8. REIT dividends unaffected by SSTB phase-out
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A REIT dividends bypass SSTB and W-2/UBIA rules", () => {
  it("SSTB fully phased out above upper threshold, but REIT component preserved", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "SSTB", isSST: true, qbi: d(100000), w2Wages: d(50000), ubia: d(200000) })],
        qualifiedReitDividends: d(50000),
        taxableIncomeBeforeQBI: d(300000), // above upper threshold
      }),
    );
    // SSTB component = $0 (fully phased out)
    expect(result.totalQBIComponent).toEqual(d(0));
    // REIT component = 20% × 50000 = 10000
    expect(result.reitPTPComponent).toEqual(d(10000));
    // Total deduction = min(0 + 10000, 20% × 300000) = min(10000, 60000) = 10000
    expect(result.qbiDeduction).toEqual(d(10000));
  });

  it("REIT-only investor with no trade/business QBI — gets 20% of REIT dividends", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [],
        qualifiedReitDividends: d(100000),
        taxableIncomeBeforeQBI: d(500000), // well above threshold
      }),
    );
    expect(result.totalQBIComponent).toEqual(d(0));
    expect(result.reitPTPComponent).toEqual(d(20000)); // 20% × 100000
    expect(result.qbiDeduction).toEqual(d(20000));
  });
});

// ═══════════════════════════════════════════════════════════
// 9. Phase-in with non-SSTB — partial W-2/UBIA limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A non-SSTB in phase-in range — partial limitation", () => {
  it("non-SSTB $1 above threshold — W-2/UBIA limit barely applies", () => {
    // Non-SSTB: SSTB applicable% stays 100%, but phase-in% = 1/50000
    // So the W-2/UBIA excess reduction is nearly zero
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(10000), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(197301),
      }),
    );
    // phase-in% = 1/50000 = 0.00002
    // 20% QBI = 20000; W-2/UBIA limit = max(5000, 2500) = 5000
    // Line 11 = min(5000, 20000) = 5000; excess = 15000
    // Line 14 = 15000 × 0.00002 = 0.3 → rounds to $0
    // Line 15 = 20000 - 0 = 20000
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.00002, 8);
    // Deduction should be nearly the full 20% of QBI
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
  });

  it("non-SSTB at midpoint of phase-in — W-2/UBIA excess halved", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(10000), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(222300), // midpoint
      }),
    );
    // Non-SSTB: SSTB applicable% = 100%, line2 = 100000, line4 = 10000
    // 20% QBI = 20000; W-2/UBIA = max(5000, 2500) = 5000
    // excess = 15000; phase-in reduction = 15000 × 0.5 = 7500
    // Line 15 = 20000 - 7500 = 12500
    expect(result.businesses[0].line15QBIComponent).toEqual(d(12500));
  });
});

// ═══════════════════════════════════════════════════════════
// 10. Patronage cooperative edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A Schedule D patron reduction edge cases", () => {
  const patronSource = (overrides: Partial<PatronageCooperativeSource> = {}): PatronageCooperativeSource => ({
    cooperativeName: "Farm Co-op",
    qbiAllocableToQualifiedPayments: d(100000),
    w2WagesAllocableToQualifiedPayments: d(50000),
    cooperativeDPAD: d(5000),
    ...overrides,
  });

  it("patron reduction exactly equals combined component — QBI deduction before DPAD is $0", () => {
    // Set up a small combined component that patron reduction wipes out
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(10000), w2Wages: d(100000), ubia: d(1000000) })],
        patronageSources: [patronSource({
          qbiAllocableToQualifiedPayments: d(100000),
          w2WagesAllocableToQualifiedPayments: d(100000),
          cooperativeDPAD: d(3000),
        })],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // 20% × 10000 = 2000 QBI component
    // Patron reduction = min(9% × 100000, 50% × 100000) = min(9000, 50000) = 9000
    // adjusted combined = max(0, 2000 - 9000) = 0
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(0));
    // DPAD = min(3000, 300000 - 0) = 3000
    expect(result.cooperativeDPAD).toEqual(d(3000));
    expect(result.qbiDeduction).toEqual(d(3000));
  });

  it("DPAD exactly at the cap (TI - Line 37)", () => {
    // Low TI so DPAD gets capped
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(50000), w2Wages: d(100000), ubia: d(1000000) })],
        patronageSources: [patronSource({
          qbiAllocableToQualifiedPayments: d(10000),
          w2WagesAllocableToQualifiedPayments: d(10000),
          cooperativeDPAD: d(200000), // very large DPAD
        })],
        taxableIncomeBeforeQBI: d(210000),
      }),
    );
    // QBI component = 20% × 50000 = 10000
    // Patron reduction = min(9% × 10000, 50% × 10000) = min(900, 5000) = 900
    // income limitation = 20% × 210000 = 42000
    // adjusted combined = max(0, 10000 - 900) = 9100
    // Line 37 = min(9100, 42000) = 9100
    // DPAD cap = 210000 - 9100 = 200900
    // DPAD = min(200000, 200900) = 200000
    expect(result.qbiDeductionBeforeDPAD).toEqual(d(9100));
    expect(result.cooperativeDPAD).toEqual(d(200000));
    expect(result.qbiDeduction).toEqual(d(209100));
  });
});

// ═══════════════════════════════════════════════════════════
// 11. Mixed SSTB + non-SSTB + REIT combined
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A mixed business types at boundary", () => {
  it("SSTB excluded + non-SSTB W-2 limited + REIT preserved above upper threshold", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [
          makeBiz({ name: "SSTB Law", isSST: true, qbi: d(200000), w2Wages: d(100000), ubia: d(0) }),
          makeBiz({ name: "Non-SSTB Mfg", isSST: false, qbi: d(150000), w2Wages: d(40000), ubia: d(0) }),
        ],
        qualifiedReitDividends: d(30000),
        taxableIncomeBeforeQBI: d(500000), // well above upper threshold
      }),
    );
    // SSTB: excluded → component = $0
    const sstb = result.businesses.find((b) => b.name === "SSTB Law")!;
    expect(sstb.line2AdjustedQBI).toEqual(d(0));
    expect(sstb.line15QBIComponent).toEqual(d(0));

    // Non-SSTB: 20% QBI = 30000; W-2/UBIA = max(20000, 10000) = 20000
    // Full W-2/UBIA limit: component = 20000
    const nonSstb = result.businesses.find((b) => b.name === "Non-SSTB Mfg")!;
    expect(nonSstb.line9W2UBIALimit).toEqual(d(20000));
    expect(nonSstb.line15QBIComponent).toEqual(d(20000));

    // REIT: 20% × 30000 = 6000
    expect(result.reitPTPComponent).toEqual(d(6000));

    // Total: 20000 QBI + 6000 REIT = 26000
    expect(result.combinedComponent).toEqual(d(26000));
    // Income limitation: 20% × 500000 = 100000 (not binding)
    expect(result.qbiDeduction).toEqual(d(26000));
  });
});

// ═══════════════════════════════════════════════════════════
// 12. Loss netting pro-rata allocation
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A loss netting pro-rata allocation across businesses", () => {
  it("loss proportionally reduces two profitable businesses", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [
          makeBiz({ name: "Big Profit", qbi: d(75000), w2Wages: d(100000), ubia: d(500000) }),
          makeBiz({ name: "Small Profit", qbi: d(25000), w2Wages: d(50000), ubia: d(200000) }),
          makeBiz({ name: "Loss Biz", qbi: d(-40000), w2Wages: d(0), ubia: d(0) }),
        ],
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // Total positive = 100000, loss = 40000
    // Big Profit share: 75000/100000 = 75%, reduction = 30000, net = 45000
    // Small Profit share: 25000/100000 = 25%, reduction = 10000, net = 15000
    const bigProfit = result.businesses.find((b) => b.name === "Big Profit")!;
    const smallProfit = result.businesses.find((b) => b.name === "Small Profit")!;
    expect(bigProfit.line1QBI).toEqual(d(45000));
    expect(smallProfit.line1QBI).toEqual(d(15000));
  });
});

// ═══════════════════════════════════════════════════════════
// 13. PTP SSTB above threshold with non-SSTB PTP
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A PTP edge cases", () => {
  it("PTP SSTB above upper threshold zeroed, non-SSTB PTP W-2/UBIA limited", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [],
        ptpSources: [
          makeBiz({ name: "SSTB PTP", isSST: true, qbi: d(50000), w2Wages: d(20000), ubia: d(0) }),
          makeBiz({ name: "Non-SSTB PTP", isSST: false, qbi: d(80000), w2Wages: d(60000), ubia: d(0) }),
        ],
        taxableIncomeBeforeQBI: d(300000), // above upper threshold
      }),
    );
    // SSTB PTP fully excluded
    const sstbPtp = result.ptpBusinesses.find((b) => b.name === "SSTB PTP")!;
    expect(sstbPtp.line2AdjustedQBI).toEqual(d(0));
    expect(sstbPtp.line15QBIComponent).toEqual(d(0));

    // Non-SSTB PTP: 20% × 80000 = 16000; W-2/UBIA = max(30000, 15000) = 30000
    // 20% QBI < W-2/UBIA limit → deduction = 16000
    const nonSstbPtp = result.ptpBusinesses.find((b) => b.name === "Non-SSTB PTP")!;
    expect(nonSstbPtp.line15QBIComponent).toEqual(d(16000));

    // Total QBI component = 0 (no trade/business QBI)
    expect(result.totalQBIComponent).toEqual(d(0));
    // REIT/PTP component = 16000
    expect(result.reitPTPComponent).toEqual(d(16000));
    expect(result.qbiDeduction).toEqual(d(16000));
  });
});

// ═══════════════════════════════════════════════════════════
// 14. SSTB phase-in at 25% and 75% gradient points
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A SSTB phase-in gradient at 25% and 75%", () => {
  const sstbBiz = (): QBIBusinessSource =>
    makeBiz({ name: "SSTB", isSST: true, qbi: d(100000), w2Wages: d(50000), ubia: d(200000) });

  it("SSTB at 25% phase-in ($209,800 single) — 75% of QBI retained", () => {
    // $197,300 + 25% × $50,000 = $209,800
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(209800),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.25"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.75"));
    // QBI = 100000 × 0.75 = 75000
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(75000));
    // W-2 = 50000 × 0.75 = 37500
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(37500));
    // UBIA = 200000 × 0.75 = 150000
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(150000));
  });

  it("SSTB at 75% phase-in ($234,800 single) — 25% of QBI retained", () => {
    // $197,300 + 75% × $50,000 = $234,800
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(234800),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.75"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.25"));
    // QBI = 100000 × 0.25 = 25000
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(25000));
    // W-2 = 50000 × 0.25 = 12500
    expect(result.businesses[0].line4AdjustedW2).toEqual(d(12500));
    // UBIA = 200000 × 0.25 = 50000
    expect(result.businesses[0].line6AdjustedUBIA).toEqual(d(50000));
  });
});

// ═══════════════════════════════════════════════════════════
// 15. MFS filing status — same thresholds as single
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A MFS filing status thresholds", () => {
  const sstbBiz = (): QBIBusinessSource =>
    makeBiz({ name: "SSTB MFS", isSST: true, qbi: d(80000), w2Wages: d(40000), ubia: d(160000) });

  it("MFS at exactly $197,300 threshold — 0% phase-in, full SSTB inclusion", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(197300),
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.sstbApplicablePercentage).toEqual(d(1));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(80000));
  });

  it("MFS at upper threshold ($247,300) — SSTB fully excluded", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(247300),
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(1));
    expect(result.sstbApplicablePercentage).toEqual(d(0));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(0));
  });

  it("MFS at midpoint ($222,300) — 50% SSTB applicable", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(222300),
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.5"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.5"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(40000));
  });
});

// ═══════════════════════════════════════════════════════════
// 16. HoH filing status — same thresholds as single
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A HoH filing status thresholds", () => {
  it("HoH at exactly $197,300 threshold — full SSTB inclusion", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "SSTB HoH", isSST: true })],
        taxableIncomeBeforeQBI: d(197300),
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.sstbApplicablePercentage).toEqual(d(1));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(100000));
  });

  it("HoH at 75% phase-in ($234,800) — 25% SSTB applicable", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "SSTB HoH", isSST: true })],
        taxableIncomeBeforeQBI: d(234800),
        simplifiedThreshold: d(197300),
        phaseInRange: d(50000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.75"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.25"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(25000));
  });
});

// ═══════════════════════════════════════════════════════════
// 17. MFJ phase-in at 25% and 75% gradient points
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A MFJ phase-in gradient at 25% and 75%", () => {
  const sstbBiz = (): QBIBusinessSource =>
    makeBiz({ name: "SSTB MFJ", isSST: true, qbi: d(200000), w2Wages: d(100000), ubia: d(400000) });

  it("MFJ at 25% phase-in ($419,600) — 75% of QBI retained", () => {
    // $394,600 + 25% × $100,000 = $419,600
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(419600),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d("0.25"));
    expect(result.sstbApplicablePercentage).toEqual(d("0.75"));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(150000));
  });

  it("MFJ $1 below upper threshold ($494,599) — SSTB nearly fully excluded", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [sstbBiz()],
        taxableIncomeBeforeQBI: d(494599),
        simplifiedThreshold: d(394600),
        phaseInRange: d(100000),
      }),
    );
    // phase-in% = 99999/100000 = 0.99999
    expect(result.phaseInPercentage.toNumber()).toBeCloseTo(0.99999, 4);
    expect(result.sstbApplicablePercentage.toNumber()).toBeCloseTo(0.00001, 4);
    // QBI = 200000 × 0.00001 = 2
    expect(result.businesses[0].line2AdjustedQBI.toNumber()).toBeCloseTo(2, 0);
  });
});

// ═══════════════════════════════════════════════════════════
// 18. Non-SSTB below simplified threshold — no W-2/UBIA limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A non-SSTB below simplified threshold", () => {
  it("non-SSTB with zero W-2 and zero UBIA below threshold — full 20% QBI deduction", () => {
    // Below threshold: phase-in% = 0, so reduction = excess × 0 = 0
    // Even with no W-2 wages, no limitation applies
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(0), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(150000), // well below $197,300
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    // W-2/UBIA limit = 0, but excess × 0% = 0, so no reduction
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
    expect(result.businesses[0].line14PhaseInReduction).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
  });

  it("SSTB below threshold — no phase-out, treated as full QBI source", () => {
    // Below threshold, even SSTBs get full QBI deduction with no W-2/UBIA limit
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "SSTB", isSST: true, qbi: d(50000), w2Wages: d(0), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(100000),
      }),
    );
    expect(result.phaseInPercentage).toEqual(d(0));
    expect(result.sstbApplicablePercentage).toEqual(d(1));
    expect(result.businesses[0].line2AdjustedQBI).toEqual(d(50000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(10000)); // 20% × 50000
    expect(result.qbiDeduction).toEqual(d(10000));
  });
});

// ═══════════════════════════════════════════════════════════
// 19. W-2/UBIA limit exactly equals 20% QBI (crossover)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A W-2/UBIA limit exactly equals 20% QBI", () => {
  it("W-2/UBIA limit = 20% QBI above upper threshold — no excess, no reduction", () => {
    // 20% × QBI = W-2/UBIA limit → excess = 0 → no phase-in reduction needed
    // Need: 50% × W2 = 20% × QBI → W2 = 0.4 × QBI
    // QBI = 100000, W2 = 40000: 20% × 100000 = 20000; 50% × 40000 = 20000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(40000), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(300000), // above upper threshold
      }),
    );
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(20000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(20000));
    expect(result.businesses[0].line11LesserOfLimitOrQBI).toEqual(d(20000));
    expect(result.businesses[0].line12Excess).toEqual(d(0));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
  });

  it("W-2/UBIA limit $1 below 20% QBI — $1 excess triggers binding limit", () => {
    // W2 = 39998 → 50% × 39998 = 19999; 20% × 100000 = 20000; excess = 1
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(39998), ubia: d(0) })],
        taxableIncomeBeforeQBI: d(300000), // above upper threshold → phase-in = 1
      }),
    );
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
    expect(result.businesses[0].line7FiftyPercentW2).toEqual(d(19999));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(19999));
    expect(result.businesses[0].line12Excess).toEqual(d(1));
    // Phase-in = 1 → full reduction: 20000 - 1 = 19999
    expect(result.businesses[0].line15QBIComponent).toEqual(d(19999));
  });
});

// ═══════════════════════════════════════════════════════════
// 20. Income limitation binding (Line 35 < combined component)
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A income limitation binding", () => {
  it("income limitation binds when TI is low relative to QBI component", () => {
    // Large QBI relative to taxable income → income limitation becomes binding
    // QBI = 500000, W2 = 300000, TI = 120000, cap gains = 0
    // 20% × QBI = 100000; W-2/UBIA limit = 150000
    // Combined component = 100000; Income limitation = 20% × 120000 = 24000
    // Deduction capped at 24000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(500000), w2Wages: d(300000), ubia: d(1000000) })],
        taxableIncomeBeforeQBI: d(120000), // below threshold → no W-2/UBIA limitation
        netCapitalGain: d(0),
        qualifiedDividends: d(0),
      }),
    );
    expect(result.incomeLimitation).toEqual(d(24000)); // 20% × 120000
    expect(result.combinedComponent).toEqual(d(100000)); // 20% × 500000
    expect(result.qbiDeduction).toEqual(d(24000)); // min(100000, 24000)
  });

  it("income limitation with capital gains reducing the base", () => {
    // TI = 300000, cap gains = 200000 → base = 100000 → limit = 20000
    // QBI component = 20% × 100000 = 20000; W-2/UBIA = max(25000, 12500+5000) = 25000
    // Component = 20000 (20% QBI is lesser); income limit = 20000
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ qbi: d(100000), w2Wages: d(50000), ubia: d(200000) })],
        taxableIncomeBeforeQBI: d(300000),
        netCapitalGain: d(200000),
        qualifiedDividends: d(0),
      }),
    );
    expect(result.incomeLimitation).toEqual(d(20000)); // 20% × (300000 - 200000)
    expect(result.qbiDeduction).toEqual(d(20000));
  });
});

// ═══════════════════════════════════════════════════════════
// 21. Aggregation election edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A aggregation election edge cases", () => {
  it("aggregated group combines W-2 and UBIA — produces higher deduction than separate", () => {
    // Biz A: QBI = 80000, W2 = 0, UBIA = 0 (alone: 20% QBI = 16000, W2/UBIA = 0, component = 0 above threshold)
    // Biz B: QBI = 20000, W2 = 100000, UBIA = 500000 (alone: 20% QBI = 4000, W2/UBIA = 50000)
    // Aggregated: QBI = 100000, W2 = 100000, UBIA = 500000
    // 20% QBI = 20000; W2/UBIA = max(50000, 25000+12500) = 50000; component = 20000
    const result = calculateForm8995A(
      make({
        qbiSources: [
          makeBiz({ name: "Biz A", qbi: d(80000), w2Wages: d(0), ubia: d(0) }),
          makeBiz({ name: "Biz B", qbi: d(20000), w2Wages: d(100000), ubia: d(500000) }),
        ],
        aggregationElections: [
          { name: "Group AB", componentBusinessNames: ["Biz A", "Biz B"] },
        ],
        taxableIncomeBeforeQBI: d(300000), // above upper threshold
      }),
    );
    // Aggregated group should appear as single business
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].name).toBe("Group AB");
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(20000));
    expect(result.businesses[0].line9W2UBIALimit).toEqual(d(50000));
    expect(result.businesses[0].line15QBIComponent).toEqual(d(20000));
    expect(result.qbiDeduction).toEqual(d(20000));
    // Aggregation group detail recorded
    expect(result.aggregationGroups).toHaveLength(1);
    expect(result.aggregationGroups[0].combinedQBI).toEqual(d(100000));
    expect(result.aggregationGroups[0].combinedW2Wages).toEqual(d(100000));
    expect(result.aggregationGroups[0].combinedUBIA).toEqual(d(500000));
  });

  it("aggregation rejects SSTB business in group", () => {
    expect(() =>
      calculateForm8995A(
        make({
          qbiSources: [
            makeBiz({ name: "NonSST", isSST: false }),
            makeBiz({ name: "SSTB", isSST: true }),
          ],
          aggregationElections: [
            { name: "Bad Group", componentBusinessNames: ["NonSST", "SSTB"] },
          ],
          taxableIncomeBeforeQBI: d(300000),
        }),
      ),
    ).toThrow(/cannot include SSTB/);
  });

  it("aggregation rejects single-business group", () => {
    expect(() =>
      calculateForm8995A(
        make({
          qbiSources: [makeBiz({ name: "Solo" })],
          aggregationElections: [
            { name: "Solo Group", componentBusinessNames: ["Solo"] },
          ],
          taxableIncomeBeforeQBI: d(300000),
        }),
      ),
    ).toThrow(/at least two businesses/);
  });

  it("aggregation rejects business in multiple groups", () => {
    expect(() =>
      calculateForm8995A(
        make({
          qbiSources: [
            makeBiz({ name: "A" }),
            makeBiz({ name: "B" }),
            makeBiz({ name: "C" }),
          ],
          aggregationElections: [
            { name: "Group 1", componentBusinessNames: ["A", "B"] },
            { name: "Group 2", componentBusinessNames: ["B", "C"] },
          ],
          taxableIncomeBeforeQBI: d(300000),
        }),
      ),
    ).toThrow(/more than one aggregation group/);
  });
});

// ═══════════════════════════════════════════════════════════
// 22. Prior-year loss partially reducing positive QBI
// ═══════════════════════════════════════════════════════════

describe("Form 8995-A prior-year loss partial netting", () => {
  it("prior-year loss smaller than positive QBI — partial reduction with carryforward of $0", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [makeBiz({ name: "Profitable", qbi: d(100000), w2Wages: d(60000), ubia: d(200000) })],
        priorYearQBILoss: d(30000),
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // QBI after netting: 100000 - 30000 = 70000
    expect(result.businesses[0].line1QBI).toEqual(d(70000));
    expect(result.qbiLossCarryforward).toEqual(d(0));
    // 20% × 70000 = 14000
    expect(result.businesses[0].line10TwentyPercentQBI).toEqual(d(14000));
  });

  it("prior-year loss pro-rates across multiple profitable businesses", () => {
    const result = calculateForm8995A(
      make({
        qbiSources: [
          makeBiz({ name: "Biz60", qbi: d(60000), w2Wages: d(50000), ubia: d(200000) }),
          makeBiz({ name: "Biz40", qbi: d(40000), w2Wages: d(30000), ubia: d(100000) }),
        ],
        priorYearQBILoss: d(20000),
        taxableIncomeBeforeQBI: d(300000),
      }),
    );
    // Total positive = 100000
    // Biz60 share: 60%, reduction = 12000, net = 48000
    // Biz40 share: 40%, reduction = 8000, net = 32000
    const biz60 = result.businesses.find((b) => b.name === "Biz60")!;
    const biz40 = result.businesses.find((b) => b.name === "Biz40")!;
    expect(biz60.line1QBI).toEqual(d(48000));
    expect(biz40.line1QBI).toEqual(d(32000));
    expect(result.qbiLossCarryforward).toEqual(d(0));
  });
});

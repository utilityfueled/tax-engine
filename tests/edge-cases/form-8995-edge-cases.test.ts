/**
 * Form 8995 — Qualified Business Income Deduction Simplified Computation
 * Edge case tests for boundary conditions, phase-outs, and interactions
 * Spec: spec/federal/form-8995.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import type { Form8995Input } from "@/engine/forms/form-8995.js";

const d = (n: number | string) => new Decimal(n);

function make(overrides: Partial<Form8995Input> = {}): Form8995Input {
  return {
    qbiSources: [{ name: "Business A", qbi: d(60000) }],
    taxableIncomeBeforeQBI: d(100000),
    netCapitalGain: d(0),
    qualifiedDividends: d(0),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Income limitation vs QBI component boundary
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - income limitation binding boundary", () => {
  it("Form 8995 Line 15 - deduction equals QBI component when income limitation exceeds it", () => {
    // QBI = $50,000 → 20% = $10,000
    // TI = $200,000, no cap gains → income limit = $200,000 × 20% = $40,000
    // Deduction = min($10,000, $40,000) = $10,000 (QBI binds)
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(200000),
    }));
    expect(result.qbiDeduction.toNumber()).toBe(10000);
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.incomeLimitation.toNumber()).toBe(40000);
  });

  it("Form 8995 Line 15 - deduction equals income limitation when QBI component exceeds it", () => {
    // QBI = $200,000 → 20% = $40,000
    // TI = $50,000, no cap gains → income limit = $50,000 × 20% = $10,000
    // Deduction = min($40,000, $10,000) = $10,000 (income binds)
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(200000) }],
      taxableIncomeBeforeQBI: d(50000),
    }));
    expect(result.qbiDeduction.toNumber()).toBe(10000);
    expect(result.combinedComponent.toNumber()).toBe(40000);
    expect(result.incomeLimitation.toNumber()).toBe(10000);
  });

  it("Form 8995 Line 15 - deduction when QBI component exactly equals income limitation", () => {
    // QBI = $100,000 → 20% = $20,000
    // TI = $100,000, no cap gains → income limit = $100,000 × 20% = $20,000
    // min($20,000, $20,000) = $20,000 — both bind equally
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(100000) }],
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.qbiDeduction.toNumber()).toBe(20000);
    expect(result.combinedComponent.toNumber()).toBe(20000);
    expect(result.incomeLimitation.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital gains eliminating income limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - capital gains reducing income limitation", () => {
  it("Form 8995 Line 14 - capital gains equal to taxable income yield zero income limitation", () => {
    // TI = $100,000, net cap gain = $100,000 → TI - cap gain = 0 → limit = 0
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(100000),
    }));
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 14 - capital gains exceeding taxable income floored at zero", () => {
    // TI = $50,000, net cap gain = $80,000 → max(0, -$30,000) = 0 → limit = 0
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(50000),
      netCapitalGain: d(80000),
    }));
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 14 - $1 of ordinary income after capital gains yields tiny income limit", () => {
    // TI = $100,001, net cap gain = $100,000 → $1 ordinary → limit = $1 × 20% = $0 (rounds)
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(100001),
      netCapitalGain: d(100000),
    }));
    expect(result.incomeLimitation.toNumber()).toBe(0);
    // Deduction capped at $0 by income limitation
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 14 - qualified dividends reduce income limitation alongside capital gains", () => {
    // TI = $100,000, net cap gain = $40,000, qual div = $30,000
    // Line 12 = $40,000 + $30,000 = $70,000
    // Line 14 = ($100,000 - $70,000) × 20% = $6,000
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(40000),
      qualifiedDividends: d(30000),
    }));
    expect(result.netCapitalGainAmount.toNumber()).toBe(70000);
    expect(result.incomeLimitation.toNumber()).toBe(6000);
  });

  it("Form 8995 Line 12 - negative capital gain treated as zero, only qualified dividends count", () => {
    // Net cap gain = -$5,000 → zeroFloor = 0 → Line 12 = 0 + $10,000 qual div = $10,000
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(-5000),
      qualifiedDividends: d(10000),
    }));
    expect(result.netCapitalGainAmount.toNumber()).toBe(10000);
    expect(result.incomeLimitation.toNumber()).toBe(18000);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior year QBI loss carryforward boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - prior year loss carryforward edge cases", () => {
  it("Form 8995 Line 6 - prior year loss exactly equals current QBI yields zero total", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      priorYearQBILoss: d(50000),
    }));
    expect(result.totalQBI.toNumber()).toBe(0);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Form 8995 Line 6 - prior year loss exceeds current QBI by $1 creates new carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      priorYearQBILoss: d(50001),
    }));
    expect(result.totalQBI.toNumber()).toBe(-1);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(1);
  });

  it("Form 8995 Line 6 - prior year loss $1 less than current QBI yields $1 QBI", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      priorYearQBILoss: d(49999),
    }));
    expect(result.totalQBI.toNumber()).toBe(1);
    expect(result.qbiComponent.toNumber()).toBe(0); // 20% of $1 rounds to $0
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Form 8995 Line 16 - large prior year loss with zero current QBI carries forward full amount", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(0) }],
      priorYearQBILoss: d(100000),
    }));
    expect(result.totalQBI.toNumber()).toBe(-100000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(100000);
  });

  it("Form 8995 Line 16 - current year loss with no prior carryforward creates new carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Loss Business", qbi: d(-80000) },
        { name: "Profit Business", qbi: d(30000) },
      ],
    }));
    expect(result.totalQBI.toNumber()).toBe(-50000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(50000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and extreme values
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - zero and extreme values", () => {
  it("Form 8995 Line 15 - all zeros yield zero deduction", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      taxableIncomeBeforeQBI: d(0),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    expect(result.totalQBI.toNumber()).toBe(0);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Form 8995 Line 15 - very large QBI ($10M) limited by income limitation", () => {
    // QBI = $10,000,000 → 20% = $2,000,000
    // TI = $197,000 → income limit = $39,400
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Big Business", qbi: d(10000000) }],
      taxableIncomeBeforeQBI: d(197000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(2000000);
    expect(result.incomeLimitation.toNumber()).toBe(39400);
    expect(result.qbiDeduction.toNumber()).toBe(39400);
  });

  it("Form 8995 Line 15 - $1 QBI yields $0 deduction (20% of $1 rounds to $0)", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Tiny Business", qbi: d(1) }],
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 15 - $5 QBI yields $1 deduction (20% of $5 = $1)", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Tiny Business", qbi: d(5) }],
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(1);
    expect(result.qbiDeduction.toNumber()).toBe(1);
  });

  it("Form 8995 Line 15 - negative taxable income yields zero income limitation", () => {
    // TI before QBI could be negative if deductions exceed income
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(60000) }],
      taxableIncomeBeforeQBI: d(-5000),
    }));
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// REIT/PTP edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - REIT and PTP edge cases", () => {
  it("Form 8995 Line 9 - REIT-only investor with no QBI gets full 20% of REIT dividends", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(50000),
      taxableIncomeBeforeQBI: d(200000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.reitPTPComponent.toNumber()).toBe(10000);
    expect(result.combinedComponent.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });

  it("Form 8995 Line 8 - PTP loss exactly offsets REIT dividends to zero", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(20000),
      qualifiedPTPIncome: d(-20000),
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(0);
    expect(result.reitPTPComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 9 - PTP loss exceeds REIT dividends yields zero component (floored)", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(10000),
      qualifiedPTPIncome: d(-30000),
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(-20000);
    expect(result.reitPTPComponent.toNumber()).toBe(0);
  });

  it("Form 8995 Line 10 - QBI component plus REIT/PTP component both positive", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(40000) }],
      qualifiedReitDividends: d(25000),
      qualifiedPTPIncome: d(5000),
      taxableIncomeBeforeQBI: d(300000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(8000);
    expect(result.reitPTPAmount.toNumber()).toBe(30000);
    expect(result.reitPTPComponent.toNumber()).toBe(6000);
    expect(result.combinedComponent.toNumber()).toBe(14000);
    expect(result.qbiDeduction.toNumber()).toBe(14000);
  });

  it("Form 8995 Line 15 - REIT/PTP component limited by income limitation", () => {
    // REIT = $500,000 → 20% = $100,000
    // TI = $50,000 → income limit = $10,000
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(500000),
      taxableIncomeBeforeQBI: d(50000),
    }));
    expect(result.reitPTPComponent.toNumber()).toBe(100000);
    expect(result.incomeLimitation.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple business interaction edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - multiple business interactions", () => {
  it("Form 8995 Lines 1-5 - five businesses with mixed gains and losses netting to $1", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "A", qbi: d(100000) },
        { name: "B", qbi: d(-50000) },
        { name: "C", qbi: d(25000) },
        { name: "D", qbi: d(-74999) },
        { name: "E", qbi: d(0) },
      ],
      taxableIncomeBeforeQBI: d(200000),
    }));
    expect(result.totalQBI.toNumber()).toBe(1);
    // 20% of $1 rounds to $0
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Form 8995 Lines 1-5 - all businesses have losses creating full carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "A", qbi: d(-10000) },
        { name: "B", qbi: d(-20000) },
        { name: "C", qbi: d(-5000) },
      ],
    }));
    expect(result.totalQBI.toNumber()).toBe(-35000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(35000);
  });

  it("Form 8995 Line 6 - single business with negative QBI plus prior year loss compounds", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(-20000) }],
      priorYearQBILoss: d(30000),
    }));
    // Total = -$20,000 - $30,000 = -$50,000
    expect(result.totalQBI.toNumber()).toBe(-50000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(50000);
  });
});

// ═══════════════════════════════════════════════════════════
// All-capital-gains scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - all income from capital gains", () => {
  it("Form 8995 Line 14 - taxable income entirely from qualified dividends eliminates QBI deduction", () => {
    // TI = $100,000, all from qual div → Line 12 = $100,000 → Line 14 = 0
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(80000) }],
      taxableIncomeBeforeQBI: d(100000),
      qualifiedDividends: d(100000),
    }));
    expect(result.netCapitalGainAmount.toNumber()).toBe(100000);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Form 8995 Line 14 - mix of capital gains and qualified dividends exceeding TI", () => {
    // TI = $150,000, net CG = $80,000, qual div = $80,000 → Line 12 = $160,000
    // Line 14 = max(0, $150,000 - $160,000) × 20% = 0
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(150000),
      netCapitalGain: d(80000),
      qualifiedDividends: d(80000),
    }));
    expect(result.netCapitalGainAmount.toNumber()).toBe(160000);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

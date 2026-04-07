/**
 * Edge case tests for Form 461 — Limitation on Business Losses
 * Spec: spec/federal/form-461.yaml
 *
 * Covers: threshold boundary tests for all filing statuses, positive vs negative
 * net business amounts, mixed income/loss aggregation, SE deduction interactions,
 * prior-year NOL carryforward, zero activity, and extreme values.
 *
 * 2025 constants: single/MFS/HoH/QSS $313,000, MFJ $626,000.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm461 } from "@/engine/forms/form-461.js";
import type { Form461Input } from "@/engine/forms/form-461.js";
import { getConstants } from "@/models/constants.js";

const ZERO = new Decimal(0);
const d = (v: string | number) => new Decimal(v);
const CONSTANTS = getConstants(2025);

function makeInput(overrides: Partial<Form461Input> = {}): Form461Input {
  return {
    totalWages: ZERO,
    scheduleCNetProfit: ZERO,
    scheduleFNetProfit: ZERO,
    form4797OrdinaryGainOrLoss: ZERO,
    nonpassiveK1Income: ZERO,
    nonpassiveK1Loss: ZERO,
    otherBusinessIncome: ZERO,
    deductibleSETax: ZERO,
    seHealthInsurance: ZERO,
    seRetirementContributions: ZERO,
    priorYearEBLNol: ZERO,
    ...overrides,
  };
}

// ── Threshold boundary tests (single) ──────────────────────────

describe("Form 461 threshold boundaries - single filer", () => {
  it("Form 461 Line 16 - net business loss exactly at threshold ($313,000) yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313000) }),
      "single",
      CONSTANTS,
    );

    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313000);
    expect(result.line15Threshold.toNumber()).toBe(313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - net business loss $1 above threshold yields $1 excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313001) }),
      "single",
      CONSTANTS,
    );

    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313001);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });

  it("Form 461 Line 16 - net business loss $1 below threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-312999) }),
      "single",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

// ── Threshold boundary tests (MFJ) ─────────────────────────────

describe("Form 461 threshold boundaries - MFJ", () => {
  it("Form 461 Line 16 - MFJ net loss exactly at $626,000 threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-626000) }),
      "married_filing_jointly",
      CONSTANTS,
    );

    expect(result.line15Threshold.toNumber()).toBe(626000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - MFJ net loss $1 above $626,000 threshold yields $1 excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-626001) }),
      "married_filing_jointly",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });
});

// ── All filing statuses share correct thresholds ────────────────

describe("Form 461 filing status thresholds", () => {
  it("Form 461 Line 15 - MFS uses $313,000 threshold", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313001) }),
      "married_filing_separately",
      CONSTANTS,
    );

    expect(result.line15Threshold.toNumber()).toBe(313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
  });

  it("Form 461 Line 15 - HoH uses $313,000 threshold", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313001) }),
      "head_of_household",
      CONSTANTS,
    );

    expect(result.line15Threshold.toNumber()).toBe(313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
  });

  it("Form 461 Line 15 - QSS uses $313,000 threshold", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-400000) }),
      "qualifying_surviving_spouse",
      CONSTANTS,
    );

    expect(result.line15Threshold.toNumber()).toBe(313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(87000);
  });
});

// ── Positive net business income (form does not apply) ──────────

describe("Form 461 positive net business income", () => {
  it("Form 461 Line 16 - positive net business income means no excess loss", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(100000),
        scheduleCNetProfit: d(50000),
      }),
      "single",
      CONSTANTS,
    );

    expect(result.line14NetBusinessAmount.toNumber()).toBe(150000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 14 - zero net business activity yields no excess", () => {
    const result = calculateForm461(makeInput(), "single", CONSTANTS);

    expect(result.line14NetBusinessAmount.toNumber()).toBe(0);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

// ── Mixed income/loss aggregation ───────────────────────────────

describe("Form 461 mixed income and loss aggregation", () => {
  it("Form 461 Lines 8-9 - positive and negative lines separated correctly", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(100000),              // positive
        scheduleCNetProfit: d(-200000),      // negative
        scheduleFNetProfit: d(50000),        // positive
        form4797OrdinaryGainOrLoss: d(-30000), // negative
      }),
      "single",
      CONSTANTS,
    );

    // Line 8: sum of positives = 100000 + 50000 = 150000
    expect(result.line8TotalBusinessIncome.toNumber()).toBe(150000);
    // Line 9: sum of |negatives| = 200000 + 30000 = 230000
    expect(result.line9BusinessDeductionsFromLines.toNumber()).toBe(230000);
  });

  it("Form 461 Lines 8-13 - SE deductions added to total deductions", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-400000),
        deductibleSETax: d(15000),
        seHealthInsurance: d(8000),
        seRetirementContributions: d(5000),
      }),
      "single",
      CONSTANTS,
    );

    // Line 9: 400000 (from Schedule C loss)
    // Line 13: 400000 + 15000 + 8000 + 5000 = 428000
    expect(result.line13TotalBusinessDeductions.toNumber()).toBe(428000);
    // Line 14: 0 - 428000 = -428000
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-428000);
    // Excess: 428000 - 313000 = 115000
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(115000);
  });

  it("Form 461 - K-1 income and loss net together on Line 5", () => {
    const result = calculateForm461(
      makeInput({
        nonpassiveK1Income: d(80000),
        nonpassiveK1Loss: d(-120000),
      }),
      "single",
      CONSTANTS,
    );

    // K-1 nets to -40000 on Line 5
    expect(result.line5NonpassiveK1.toNumber()).toBe(-40000);
    // Line 9: |negative amounts| from lines → 40000
    expect(result.line9BusinessDeductionsFromLines.toNumber()).toBe(40000);
  });

  it("Form 461 - wages offset business losses before threshold check", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(200000),
        scheduleCNetProfit: d(-500000),
      }),
      "single",
      CONSTANTS,
    );

    // Line 8: 200000, Line 13: 500000
    // Line 14: 200000 - 500000 = -300000
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-300000);
    // |-300000| = 300000 < 313000 threshold → no excess
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

// ── Prior-year NOL carryforward ─────────────────────────────────

describe("Form 461 prior-year NOL carryforward", () => {
  it("Form 461 NOL - current excess added to prior year carryforward", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-413000),
        priorYearEBLNol: d(50000),
      }),
      "single",
      CONSTANTS,
    );

    // Excess: 413000 - 313000 = 100000
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(100000);
    // NOL carryforward: 100000 + 50000 = 150000
    expect(result.nolCarryforward.toNumber()).toBe(150000);
  });

  it("Form 461 NOL - no current excess but prior carryforward preserved", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-100000),
        priorYearEBLNol: d(75000),
      }),
      "single",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    // Prior carryforward preserved: 0 + 75000
    expect(result.nolCarryforward.toNumber()).toBe(75000);
  });

  it("Form 461 NOL - zero prior carryforward with current excess", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-500000),
        priorYearEBLNol: ZERO,
      }),
      "single",
      CONSTANTS,
    );

    const excess = 500000 - 313000;
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(excess);
    expect(result.nolCarryforward.toNumber()).toBe(excess);
  });
});

// ── Large excess business loss ──────────────────────────────────

describe("Form 461 extreme values", () => {
  it("Form 461 Line 16 - very large business loss ($10M) produces large excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-10000000) }),
      "single",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(10000000 - 313000);
    expect(result.applies).toBe(true);
  });

  it("Form 461 Line 16 - MFJ very large loss ($10M)", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-10000000) }),
      "married_filing_jointly",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(10000000 - 626000);
    expect(result.applies).toBe(true);
  });
});

// ── Missing boundary tests per filing status ────────────────────

describe("Form 461 threshold boundaries - MFJ $1 below", () => {
  it("Form 461 Line 16 - MFJ net loss $1 below $626,000 threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-625999) }),
      "married_filing_jointly",
      CONSTANTS,
    );

    expect(result.line14NetBusinessAmount.toNumber()).toBe(-625999);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

describe("Form 461 threshold boundaries - MFS", () => {
  it("Form 461 Line 16 - MFS net loss exactly at $313,000 threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313000) }),
      "married_filing_separately",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - MFS net loss $1 below threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-312999) }),
      "married_filing_separately",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

describe("Form 461 threshold boundaries - HoH", () => {
  it("Form 461 Line 16 - HoH net loss exactly at $313,000 threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313000) }),
      "head_of_household",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - HoH net loss $1 below threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-312999) }),
      "head_of_household",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

describe("Form 461 threshold boundaries - QSS", () => {
  it("Form 461 Line 16 - QSS net loss exactly at $313,000 threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313000) }),
      "qualifying_surviving_spouse",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - QSS net loss $1 below threshold yields zero excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-312999) }),
      "qualifying_surviving_spouse",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - QSS net loss $1 above threshold yields $1 excess", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: d(-313001) }),
      "qualifying_surviving_spouse",
      CONSTANTS,
    );

    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });
});

// ── SE deductions pushing loss over threshold ───────────────────

describe("Form 461 SE deductions at threshold boundary", () => {
  it("Form 461 - SE deductions push net loss from below threshold to exactly at threshold", () => {
    // Schedule C loss of $300,000 → Line 9 = 300000
    // SE deductions total $13,000 → Line 13 = 313000
    // Line 8 = 0, Line 14 = 0 - 313000 = -313000 = exactly at threshold
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-300000),
        deductibleSETax: d(8000),
        seHealthInsurance: d(3000),
        seRetirementContributions: d(2000),
      }),
      "single",
      CONSTANTS,
    );

    expect(result.line13TotalBusinessDeductions.toNumber()).toBe(313000);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 - SE deductions push net loss $1 over threshold", () => {
    // Schedule C loss of $300,000 → Line 9 = 300000
    // SE deductions total $13,001 → Line 13 = 313001
    // Line 14 = -313001 → excess = 1
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-300000),
        deductibleSETax: d(8000),
        seHealthInsurance: d(3001),
        seRetirementContributions: d(2000),
      }),
      "single",
      CONSTANTS,
    );

    expect(result.line13TotalBusinessDeductions.toNumber()).toBe(313001);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313001);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });

  it("Form 461 - only SE deductions create net loss (no line-item losses)", () => {
    // All line items zero, but SE deductions total $50,000
    // Line 8 = 0, Line 13 = 50000, Line 14 = -50000
    // Below threshold → no excess
    const result = calculateForm461(
      makeInput({
        deductibleSETax: d(20000),
        seHealthInsurance: d(15000),
        seRetirementContributions: d(15000),
      }),
      "single",
      CONSTANTS,
    );

    expect(result.line8TotalBusinessIncome.toNumber()).toBe(0);
    expect(result.line13TotalBusinessDeductions.toNumber()).toBe(50000);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-50000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

// ── Multiple sources combining to threshold boundary ────────────

describe("Form 461 multiple sources at threshold boundary", () => {
  it("Form 461 - multiple loss sources combine to exactly at threshold", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-100000),
        scheduleFNetProfit: d(-100000),
        form4797OrdinaryGainOrLoss: d(-113000),
      }),
      "single",
      CONSTANTS,
    );

    // Line 9: 100000 + 100000 + 113000 = 313000
    // Line 14: 0 - 313000 = -313000, exactly at threshold
    expect(result.line9BusinessDeductionsFromLines.toNumber()).toBe(313000);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 - mixed income/loss from multiple sources nets to $1 over threshold", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(50000),                    // +50000 → line8
        scheduleCNetProfit: d(-200000),           // -200000 → line9
        scheduleFNetProfit: d(-100000),           // -100000 → line9
        form4797OrdinaryGainOrLoss: d(20000),     // +20000 → line8
        nonpassiveK1Income: d(10000),
        nonpassiveK1Loss: d(-93001),              // net K-1: -83001 → line9
      }),
      "single",
      CONSTANTS,
    );

    // Line 5 (K-1 net): 10000 + (-93001) = -83001 (negative → contributes to line9)
    // Line 8 (positives): 50000 + 20000 = 70000
    // Line 9 (|negatives|): 200000 + 100000 + 83001 = 383001
    // Line 14: 70000 - 383001 = -313001
    expect(result.line5NonpassiveK1.toNumber()).toBe(-83001);
    expect(result.line8TotalBusinessIncome.toNumber()).toBe(70000);
    expect(result.line9BusinessDeductionsFromLines.toNumber()).toBe(383001);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313001);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });
});

// ── All income sources active simultaneously ────────────────────

describe("Form 461 all sources active", () => {
  it("Form 461 - all line items and SE deductions populated, net loss exceeds MFJ threshold", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(150000),
        scheduleCNetProfit: d(-400000),
        scheduleFNetProfit: d(-200000),
        form4797OrdinaryGainOrLoss: d(75000),
        nonpassiveK1Income: d(50000),
        nonpassiveK1Loss: d(-350000),
        otherBusinessIncome: d(25000),
        deductibleSETax: d(15000),
        seHealthInsurance: d(10000),
        seRetirementContributions: d(8000),
        priorYearEBLNol: d(100000),
      }),
      "married_filing_jointly",
      CONSTANTS,
    );

    // Line 5 (K-1 net): 50000 + (-350000) = -300000
    // Positives: 150000 + 75000 + 25000 = 250000
    // Negatives: 400000 + 200000 + 300000 = 900000
    // Line 8 = 250000, Line 9 = 900000
    // Line 13 = 900000 + 15000 + 10000 + 8000 = 933000
    // Line 14 = 250000 - 933000 = -683000
    // Excess = 683000 - 626000 = 57000
    // NOL carryforward = 57000 + 100000 = 157000
    expect(result.line8TotalBusinessIncome.toNumber()).toBe(250000);
    expect(result.line9BusinessDeductionsFromLines.toNumber()).toBe(900000);
    expect(result.line13TotalBusinessDeductions.toNumber()).toBe(933000);
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-683000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(57000);
    expect(result.nolCarryforward.toNumber()).toBe(157000);
    expect(result.applies).toBe(true);
  });
});

// ── Rounding edge cases ─────────────────────────────────────────

describe("Form 461 rounding behavior", () => {
  it("Form 461 - fractional cents round to nearest dollar per IRS rules", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: new Decimal("-313000.50"),
      }),
      "single",
      CONSTANTS,
    );

    // -313000.50 rounds to -313001 (nearest dollar)
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313001);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(1);
    expect(result.applies).toBe(true);
  });

  it("Form 461 - fractional amount rounds down keeping loss within threshold", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: new Decimal("-313000.49"),
      }),
      "single",
      CONSTANTS,
    );

    // -313000.49 rounds to -313000 (nearest dollar)
    expect(result.line14NetBusinessAmount.toNumber()).toBe(-313000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });
});

// ── Filing status comparison ────────────────────────────────────

describe("Form 461 same loss across all filing statuses", () => {
  const LOSS = d(-500000);

  it("Form 461 - $500K loss: single excess = $187,000", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: LOSS }),
      "single",
      CONSTANTS,
    );
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(187000);
  });

  it("Form 461 - $500K loss: MFJ has no excess (below $626K threshold)", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: LOSS }),
      "married_filing_jointly",
      CONSTANTS,
    );
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    expect(result.applies).toBe(false);
  });

  it("Form 461 - $500K loss: MFS excess = $187,000 (same as single)", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: LOSS }),
      "married_filing_separately",
      CONSTANTS,
    );
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(187000);
  });

  it("Form 461 - $500K loss: HoH excess = $187,000 (same as single)", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: LOSS }),
      "head_of_household",
      CONSTANTS,
    );
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(187000);
  });

  it("Form 461 - $500K loss: QSS excess = $187,000 (same as single)", () => {
    const result = calculateForm461(
      makeInput({ scheduleCNetProfit: LOSS }),
      "qualifying_surviving_spouse",
      CONSTANTS,
    );
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(187000);
  });
});

// ── Prior-year NOL interaction edge cases ────────────────────────

describe("Form 461 prior-year NOL edge cases", () => {
  it("Form 461 NOL - large prior carryforward with positive current business income", () => {
    const result = calculateForm461(
      makeInput({
        totalWages: d(200000),
        scheduleCNetProfit: d(100000),
        priorYearEBLNol: d(500000),
      }),
      "single",
      CONSTANTS,
    );

    // Positive net income → no current excess
    expect(result.line14NetBusinessAmount.toNumber()).toBe(300000);
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(0);
    // Prior carryforward still passes through
    expect(result.nolCarryforward.toNumber()).toBe(500000);
    expect(result.applies).toBe(false);
  });

  it("Form 461 NOL - both current excess and large prior carryforward accumulate", () => {
    const result = calculateForm461(
      makeInput({
        scheduleCNetProfit: d(-1000000),
        priorYearEBLNol: d(2000000),
      }),
      "married_filing_jointly",
      CONSTANTS,
    );

    // Excess: 1000000 - 626000 = 374000
    // NOL: 374000 + 2000000 = 2374000
    expect(result.line16ExcessBusinessLoss.toNumber()).toBe(374000);
    expect(result.nolCarryforward.toNumber()).toBe(2374000);
  });
});

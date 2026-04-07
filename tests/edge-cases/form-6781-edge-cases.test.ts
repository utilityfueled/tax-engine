/**
 * Edge case tests for Form 6781 — Gains and Losses From Section 1256 Contracts and Straddles
 * Spec: spec/federal/form-6781.yaml
 *
 * Covers: 60/40 long-term/short-term split, carryback election mechanics,
 * straddle gain/loss flows, rounding on split amounts, zero/extreme values,
 * and combined Part I + Part II Schedule D totals.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm6781 } from "@/engine/forms/form-6781.js";
import type { Form6781Input } from "@/models/inputs.js";

const d = (v: string | number) => new Decimal(v);

function makeInput(overrides: Partial<Form6781Input> = {}): Form6781Input {
  return {
    section1256Gains: "0",
    section1256Losses: "0",
    adjustments: "0",
    carrybackElection: false,
    carrybackAmount: "0",
    shortTermStraddleLosses: "0",
    longTermStraddleLosses: "0",
    shortTermStraddleGains: "0",
    longTermStraddleGains: "0",
    ...overrides,
  } as Form6781Input;
}

// ── 60/40 split on gains ────────────────────────────────────────

describe("Form 6781 60/40 split on gains", () => {
  it("Form 6781 Lines 8-9 - $10,000 net gain splits to $4,000 ST / $6,000 LT", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "10000",
    }));

    expect(result.line3.toNumber()).toBe(10000);
    expect(result.line7.toNumber()).toBe(10000);
    expect(result.line8.toNumber()).toBe(4000);  // 40% short-term
    expect(result.line9.toNumber()).toBe(6000);  // 60% long-term
  });

  it("Form 6781 Lines 8-9 - $1 net gain splits to $0.40 ST / $0.60 LT", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "1",
    }));

    expect(result.line8.toNumber()).toBe(0.4);
    expect(result.line9.toNumber()).toBe(0.6);
    // Verify no rounding gap: line8 + line9 = line7
    expect(result.line8.plus(result.line9).toNumber()).toBe(1);
  });

  it("Form 6781 Lines 8-9 - odd amount $333 splits without rounding gap", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "333",
    }));

    // 333 × 0.40 = 133.20
    expect(result.line8.toNumber()).toBe(133.2);
    // Line 9 = 333 - 133.20 = 199.80
    expect(result.line9.toNumber()).toBe(199.8);
    expect(result.line8.plus(result.line9).toNumber()).toBe(333);
  });

  it("Form 6781 Lines 8-9 - amount producing half-penny rounding ($5)", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "5",
    }));

    // 5 × 0.40 = 2.00
    expect(result.line8.toNumber()).toBe(2);
    expect(result.line9.toNumber()).toBe(3);
    expect(result.line8.plus(result.line9).toNumber()).toBe(5);
  });
});

// ── 60/40 split on losses ───────────────────────────────────────

describe("Form 6781 60/40 split on losses", () => {
  it("Form 6781 Lines 8-9 - net loss splits 40/60 as negative values", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "8000",
    }));

    expect(result.line3.toNumber()).toBe(-8000);
    expect(result.line7.toNumber()).toBe(-8000);
    expect(result.line8.toNumber()).toBe(-3200);  // 40% of -8000
    expect(result.line9.toNumber()).toBe(-4800);  // 60% of -8000
  });

  it("Form 6781 Lines 8-9 - $1 net loss", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "1",
    }));

    expect(result.line8.toNumber()).toBe(-0.4);
    expect(result.line9.toNumber()).toBe(-0.6);
  });
});

// ── Carryback election ──────────────────────────────────────────

describe("Form 6781 carryback election", () => {
  it("Form 6781 Line 6 - carryback elected with net loss reduces Line 7", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "10000",
      carrybackElection: true,
      carrybackAmount: "6000",
    }));

    expect(result.line5.toNumber()).toBe(-10000);
    expect(result.line6.toNumber()).toBe(6000);     // Positive amount reducing loss
    expect(result.line7.toNumber()).toBe(-4000);     // -10000 + 6000
    expect(result.line8.toNumber()).toBe(-1600);     // 40% of -4000
    expect(result.line9.toNumber()).toBe(-2400);     // 60% of -4000
  });

  it("Form 6781 Line 6 - carryback amount capped at net loss", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "5000",
      carrybackElection: true,
      carrybackAmount: "8000", // Exceeds net loss
    }));

    expect(result.line5.toNumber()).toBe(-5000);
    expect(result.line6.toNumber()).toBe(5000);  // Capped at loss amount
    expect(result.line7.toNumber()).toBe(0);     // Fully offset
  });

  it("Form 6781 Line 6 - carryback election ignored when net is a gain", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "10000",
      carrybackElection: true,
      carrybackAmount: "5000",
    }));

    expect(result.line6.toNumber()).toBe(0);     // No carryback on gains
    expect(result.line7.toNumber()).toBe(10000);
  });

  it("Form 6781 Line 6 - no carryback when election not made", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "10000",
      carrybackElection: false,
      carrybackAmount: "6000",
    }));

    expect(result.line6.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(-10000);
  });

  it("Form 6781 Line 6 - full carryback of entire net loss to zero", () => {
    const result = calculateForm6781(makeInput({
      section1256Losses: "10000",
      carrybackElection: true,
      carrybackAmount: "10000",
    }));

    expect(result.line6.toNumber()).toBe(10000);
    expect(result.line7.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0);
  });
});

// ── Adjustments (Line 4) ───────────────────────────────────────

describe("Form 6781 adjustments", () => {
  it("Form 6781 Line 5 - positive adjustment increases net gain", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "10000",
      adjustments: "2000",
    }));

    expect(result.line4.toNumber()).toBe(2000);
    expect(result.line5.toNumber()).toBe(12000);
  });

  it("Form 6781 Line 5 - negative adjustment reduces net gain", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "10000",
      adjustments: "-3000",
    }));

    expect(result.line5.toNumber()).toBe(7000);
  });

  it("Form 6781 Line 5 - adjustment that flips gain to loss", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "5000",
      adjustments: "-8000",
    }));

    expect(result.line5.toNumber()).toBe(-3000);
    expect(result.line8.toNumber()).toBe(-1200);
    expect(result.line9.toNumber()).toBe(-1800);
  });
});

// ── Part II: Straddle gains and losses ──────────────────────────

describe("Form 6781 Part II straddle gains and losses", () => {
  it("Form 6781 Lines 11a/11b - straddle losses reported as negatives on Schedule D", () => {
    const result = calculateForm6781(makeInput({
      shortTermStraddleLosses: "3000",
      longTermStraddleLosses: "5000",
    }));

    expect(result.line11a.toNumber()).toBe(-3000);
    expect(result.line11b.toNumber()).toBe(-5000);
  });

  it("Form 6781 Lines 13a/13b - straddle gains flow as positives", () => {
    const result = calculateForm6781(makeInput({
      shortTermStraddleGains: "2000",
      longTermStraddleGains: "4000",
    }));

    expect(result.line13a.toNumber()).toBe(2000);
    expect(result.line13b.toNumber()).toBe(4000);
  });

  it("Form 6781 - zero straddle amounts produce zero lines", () => {
    const result = calculateForm6781(makeInput());

    expect(result.line11a.toNumber()).toBe(0);
    expect(result.line11b.toNumber()).toBe(0);
    expect(result.line13a.toNumber()).toBe(0);
    expect(result.line13b.toNumber()).toBe(0);
  });
});

// ── Schedule D totals (combined Part I + Part II) ───────────────

describe("Form 6781 Schedule D totals", () => {
  it("Form 6781 - combined Part I 60/40 split + Part II straddles flow to Schedule D", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "20000",
      shortTermStraddleLosses: "1000",
      longTermStraddleGains: "3000",
    }));

    // Part I: 20000 × 0.40 = 8000 ST, 20000 × 0.60 = 12000 LT
    // Schedule D ST: 8000 + (-1000) + 0 = 7000
    expect(result.scheduleDShortTerm.toNumber()).toBe(7000);
    // Schedule D LT: 12000 + 0 + 3000 = 15000
    expect(result.scheduleDLongTerm.toNumber()).toBe(15000);
  });

  it("Form 6781 - all zeros yield zero Schedule D totals", () => {
    const result = calculateForm6781(makeInput());

    expect(result.scheduleDShortTerm.toNumber()).toBe(0);
    expect(result.scheduleDLongTerm.toNumber()).toBe(0);
  });

  it("Form 6781 - large gain ($1,000,000) 60/40 split is precise", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "1000000",
    }));

    expect(result.line8.toNumber()).toBe(400000);
    expect(result.line9.toNumber()).toBe(600000);
    expect(result.scheduleDShortTerm.toNumber()).toBe(400000);
    expect(result.scheduleDLongTerm.toNumber()).toBe(600000);
  });

  it("Form 6781 - straddle losses can make Schedule D totals negative even with Part I gains", () => {
    const result = calculateForm6781(makeInput({
      section1256Gains: "5000",
      shortTermStraddleLosses: "10000",
      longTermStraddleLosses: "10000",
    }));

    // Part I: ST = 2000, LT = 3000
    // Schedule D ST: 2000 + (-10000) = -8000
    expect(result.scheduleDShortTerm.toNumber()).toBe(-8000);
    // Schedule D LT: 3000 + (-10000) = -7000
    expect(result.scheduleDLongTerm.toNumber()).toBe(-7000);
  });
});

/**
 * Edge case tests for Form 8815 — Exclusion of Interest from Series EE and I Savings Bonds.
 * Spec: spec/federal/form-8815.yaml
 *
 * Key thresholds (2025):
 *   Phase-out threshold: $99,500 (single/HoH/QSS), $149,250 (MFJ)
 *   Phase-out range: $15,000 (single/HoH/QSS), $30,000 (MFJ)
 *   Phase-out end: $114,500 (single), $179,250 (MFJ)
 *   MFS: ineligible
 *   Expense-to-proceeds ratio capped at 1.0
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";

const d = (v: string | number) => new Decimal(v);

const sampleRedemption = (opts?: { proceeds?: string; interest?: string; qualifiedExpenses?: string }) => ({
  proceeds: opts?.proceeds ?? "10000",
  interest: opts?.interest ?? "3000",
  qualifiedExpenses: opts?.qualifiedExpenses ?? "15000",
});

describe("Form 8815 MFS ineligibility", () => {
  it("Form 8815 Line 13 - married filing separately filer receives zero exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(50000),
      "married_filing_separately"
    );

    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
    expect(result.totalProceeds.toNumber()).toBe(0);
    expect(result.totalInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 single filer phase-out boundaries", () => {
  it("Form 8815 Line 9 - single filer at exactly $99,500 MAGI has no phase-out reduction", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(99500),
      "single"
    );

    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    // Expense ratio: min(1, 15000/10000) = 1.0
    // Excludable before phase-out: 3000 * 1.0 = 3000
    // Excess: 99500 - 99500 = 0, ratio = 0
    // Reduction: 3000 * 0 = 0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 Line 9 - single filer at $99,501 MAGI begins phase-out with minimal reduction", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(99501),
      "single"
    );

    // Excess: 99501 - 99500 = 1
    // Phase-out ratio: min(1, 1/15000) = 0.0000666...
    // Reduction: round(3000 * (1/15000)) = round(0.2) = 0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 Line 11 - single filer at midpoint of phase-out range loses roughly half the exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(107000),
      "single"
    );

    // Excess: 107000 - 99500 = 7500
    // Phase-out ratio: 7500 / 15000 = 0.5
    // Reduction: round(3000 * 0.5) = 1500
    // Excludable: 3000 - 1500 = 1500
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("Form 8815 Line 13 - single filer at exactly $114,500 loses the entire exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(114500),
      "single"
    );

    // Excess: 114500 - 99500 = 15000
    // Phase-out ratio: min(1, 15000/15000) = 1.0
    // Reduction: 3000 * 1.0 = 3000
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("Form 8815 Line 13 - single filer above $114,500 still loses the entire exclusion (capped ratio)", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(200000),
      "single"
    );

    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 MFJ phase-out boundaries", () => {
  it("Form 8815 Line 9 - MFJ at exactly $149,250 MAGI has no phase-out reduction", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(149250),
      "married_filing_jointly"
    );

    expect(result.phaseOutThreshold.toNumber()).toBe(149250);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 Line 13 - MFJ at exactly $179,250 loses the entire exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(179250),
      "married_filing_jointly"
    );

    // Excess: 179250 - 149250 = 30000, ratio = 30000/30000 = 1.0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 QSS and HoH use single thresholds", () => {
  it("Form 8815 Line 8 - qualifying surviving spouse uses the $99,500 single threshold, not MFJ", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(99500),
      "qualifying_surviving_spouse"
    );

    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    expect(result.phaseOutRange.toNumber()).toBe(15000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 Line 8 - head of household uses the $99,500 threshold and $15,000 range", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(107000),
      "head_of_household"
    );

    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    // Same as single midpoint test: 1500 exclusion
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });
});

describe("Form 8815 expense-to-proceeds ratio", () => {
  it("Form 8815 Line 5 - expenses exceeding proceeds cap the ratio at 1.0", () => {
    const result = calculateForm8815(
      [{ proceeds: "5000", interest: "1500", qualifiedExpenses: "10000" }],
      d(50000),
      "single"
    );

    expect(result.expenseRatio.toNumber()).toBe(1);
    // Excludable = 1500 * 1.0 = 1500
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("Form 8815 Line 5 - expenses less than proceeds reduce the excludable interest proportionally", () => {
    const result = calculateForm8815(
      [{ proceeds: "10000", interest: "3000", qualifiedExpenses: "4000" }],
      d(50000),
      "single"
    );

    // Ratio: 4000 / 10000 = 0.4
    // Excludable before phase-out: round(3000 * 0.4) = 1200
    expect(result.expenseRatio.toNumber()).toBe(0.4);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1200);
  });

  it("Form 8815 Line 5 - zero proceeds yields zero ratio and zero exclusion", () => {
    const result = calculateForm8815(
      [{ proceeds: "0", interest: "0", qualifiedExpenses: "5000" }],
      d(50000),
      "single"
    );

    expect(result.expenseRatio.toNumber()).toBe(0);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 multiple redemptions", () => {
  it("Form 8815 Lines 2-4 - aggregates proceeds and interest from multiple bond redemptions", () => {
    const result = calculateForm8815(
      [
        { proceeds: "5000", interest: "1000", qualifiedExpenses: "3000" },
        { proceeds: "8000", interest: "2000", qualifiedExpenses: "5000" },
      ],
      d(50000),
      "single"
    );

    expect(result.totalProceeds.toNumber()).toBe(13000);
    expect(result.totalInterest.toNumber()).toBe(3000);
    expect(result.qualifiedExpenses.toNumber()).toBe(8000);
    // Ratio: min(1, 8000 / 13000) = 0.6153...
    // Excludable before phase-out: round(3000 * 0.6153...) = 1846
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1846);
  });

  it("Form 8815 Lines 2-4 - multiple redemptions with MAGI at midpoint of single phase-out", () => {
    const result = calculateForm8815(
      [
        { proceeds: "5000", interest: "1500", qualifiedExpenses: "5000" },
        { proceeds: "5000", interest: "1500", qualifiedExpenses: "5000" },
      ],
      d(107000), // midpoint: 99500 + 7500
      "single"
    );

    expect(result.totalProceeds.toNumber()).toBe(10000);
    expect(result.totalInterest.toNumber()).toBe(3000);
    // Ratio: min(1, 10000/10000) = 1.0
    // Excludable before phase-out: 3000 * 1.0 = 3000
    // Phase-out ratio: 7500/15000 = 0.5
    // Reduction: round(3000 * 0.5) = 1500
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("Form 8815 - empty redemptions array produces zero exclusion", () => {
    const result = calculateForm8815(
      [],
      d(50000),
      "single"
    );

    expect(result.totalProceeds.toNumber()).toBe(0);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 single filer $1 below threshold", () => {
  it("Form 8815 Line 9 - single filer at $99,499 has zero excess and full exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(99499),
      "single"
    );

    // Excess: max(0, 99499 - 99500) = 0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });
});

describe("Form 8815 MFJ additional boundaries", () => {
  it("Form 8815 Line 9 - MFJ at $149,251 begins phase-out with minimal reduction", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(149251),
      "married_filing_jointly"
    );

    // Excess: 149251 - 149250 = 1
    // Phase-out ratio: min(1, 1/30000) = 0.0000333...
    // Reduction: round(3000 * 0.0000333...) = round(0.1) = 0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 Line 11 - MFJ at midpoint of phase-out range loses roughly half the exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(164250), // 149250 + 15000 = midpoint
      "married_filing_jointly"
    );

    // Excess: 164250 - 149250 = 15000
    // Phase-out ratio: 15000/30000 = 0.5
    // Reduction: round(3000 * 0.5) = 1500
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("Form 8815 Line 9 - MFJ at $149,249 is below threshold and gets full exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(149249),
      "married_filing_jointly"
    );

    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });
});

describe("Form 8815 HoH and QSS at phase-out end", () => {
  it("Form 8815 Line 13 - head of household at exactly $114,500 loses entire exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(114500),
      "head_of_household"
    );

    // Excess: 114500 - 99500 = 15000
    // Phase-out ratio: 15000/15000 = 1.0
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("Form 8815 Line 13 - qualifying surviving spouse at exactly $114,500 loses entire exclusion", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(114500),
      "qualifying_surviving_spouse"
    );

    // QSS uses single/HoH thresholds per IRC §135(b)(2)(B)
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("Form 8815 Line 13 - QSS at $120,000 is above phase-out end, still gets zero (capped)", () => {
    const result = calculateForm8815(
      [sampleRedemption()],
      d(120000),
      "qualifying_surviving_spouse"
    );

    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

describe("Form 8815 expense ratio edge cases", () => {
  it("Form 8815 Line 5 - very small expense relative to large proceeds yields near-zero exclusion", () => {
    const result = calculateForm8815(
      [{ proceeds: "100000", interest: "20000", qualifiedExpenses: "1" }],
      d(50000),
      "single"
    );

    // Ratio: 1/100000 = 0.00001
    // Excludable: round(20000 * 0.00001) = round(0.2) = 0
    expect(result.expenseRatio.toNumber()).toBeCloseTo(0.00001, 5);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("Form 8815 Line 5 - expense ratio with repeating decimal produces correct rounding", () => {
    const result = calculateForm8815(
      [{ proceeds: "10000", interest: "3000", qualifiedExpenses: "3333" }],
      d(50000),
      "single"
    );

    // Ratio: 3333/10000 = 0.3333
    // Excludable: round(3000 * 0.3333) = round(999.9) = 1000
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1000);
  });

  it("Form 8815 Line 5 - expenses exactly equal to proceeds yields ratio of 1.0", () => {
    const result = calculateForm8815(
      [{ proceeds: "8000", interest: "2500", qualifiedExpenses: "8000" }],
      d(50000),
      "single"
    );

    expect(result.expenseRatio.toNumber()).toBe(1);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2500);
  });
});

describe("Form 8815 phase-out with reduced expense ratio", () => {
  it("Form 8815 Lines 5-13 - partial expense ratio combined with partial phase-out", () => {
    // Expenses < proceeds AND MAGI in phase-out range → double reduction
    const result = calculateForm8815(
      [{ proceeds: "20000", interest: "5000", qualifiedExpenses: "10000" }],
      d(107000), // midpoint of single phase-out
      "single"
    );

    // Ratio: 10000/20000 = 0.5
    // Excludable before phase-out: round(5000 * 0.5) = 2500
    // Phase-out ratio: 7500/15000 = 0.5
    // Reduction: round(2500 * 0.5) = 1250
    // Final: 2500 - 1250 = 1250
    expect(result.expenseRatio.toNumber()).toBe(0.5);
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(2500);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1250);
  });
});

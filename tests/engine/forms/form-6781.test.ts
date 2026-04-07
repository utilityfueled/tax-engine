/**
 * Tests for Form 6781 — Gains and Losses From Section 1256 Contracts and Straddles.
 * Spec: spec/federal/form-6781.yaml
 *
 * IRC §1256 mark-to-market with 60/40 long-term/short-term split.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm6781 } from "@/engine/forms/form-6781.js";
import type { Form6781Input } from "@/models/inputs.js";

function form6781(overrides: Partial<Form6781Input> = {}): Form6781Input {
  return {
    section1256Gains: overrides.section1256Gains ?? "0",
    section1256Losses: overrides.section1256Losses ?? "0",
    adjustments: overrides.adjustments ?? "0",
    carrybackElection: overrides.carrybackElection ?? false,
    carrybackAmount: overrides.carrybackAmount ?? "0",
    shortTermStraddleLosses: overrides.shortTermStraddleLosses ?? "0",
    longTermStraddleLosses: overrides.longTermStraddleLosses ?? "0",
    shortTermStraddleGains: overrides.shortTermStraddleGains ?? "0",
    longTermStraddleGains: overrides.longTermStraddleGains ?? "0",
  };
}

describe("Form 6781 Section 1256 Contracts and Straddles", () => {
  // ── Part I: Section 1256 Contracts Marked to Market ─────────────

  describe("Part I: Section 1256 Contracts", () => {
    it("Form 6781 Line 3 - net gain combines all section 1256 gains and losses", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "25000",
        section1256Losses: "10000",
      }));
      expect(result.line3).toEqual(new Decimal(15000));
    });

    it("Form 6781 Line 3 - net loss when losses exceed gains", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "5000",
        section1256Losses: "18000",
      }));
      expect(result.line3).toEqual(new Decimal(-13000));
    });

    it("Form 6781 Line 3 - gains only with no losses", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "50000",
      }));
      expect(result.line3).toEqual(new Decimal(50000));
    });

    it("Form 6781 Line 3 - losses only with no gains", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "7500",
      }));
      expect(result.line3).toEqual(new Decimal(-7500));
    });

    it("Form 6781 Line 3 - zero when no contracts", () => {
      const result = calculateForm6781(form6781());
      expect(result.line3).toEqual(new Decimal(0));
    });

    it("Form 6781 Line 4 - adjustments modify the net section 1256 result", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "20000",
        adjustments: "-3000",
      }));
      expect(result.line4).toEqual(new Decimal(-3000));
      expect(result.line5).toEqual(new Decimal(17000));
    });

    it("Form 6781 Line 4 - positive adjustment increases net result", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "10000",
        adjustments: "2000",
      }));
      expect(result.line5).toEqual(new Decimal(-8000));
    });

    it("Form 6781 Line 5 - combined amount includes adjustments", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "30000",
        section1256Losses: "12000",
        adjustments: "-1500",
      }));
      // Line 3: 30000 - 12000 = 18000; Line 5: 18000 + (-1500) = 16500
      expect(result.line5).toEqual(new Decimal(16500));
    });

    it("Form 6781 Line 6 - carryback reduces net loss when elected", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "20000",
        carrybackElection: true,
        carrybackAmount: "12000",
      }));
      expect(result.line5).toEqual(new Decimal(-20000));
      expect(result.line6).toEqual(new Decimal(12000));
      expect(result.line7).toEqual(new Decimal(-8000));
    });

    it("Form 6781 Line 6 - carryback amount capped at net loss", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "5000",
        carrybackElection: true,
        carrybackAmount: "10000",
      }));
      // Net loss is -5000, carryback cannot exceed 5000
      expect(result.line6).toEqual(new Decimal(5000));
      expect(result.line7).toEqual(new Decimal(0));
    });

    it("Form 6781 Line 6 - carryback is zero when Line 5 is a gain", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "30000",
        section1256Losses: "10000",
        carrybackElection: true,
        carrybackAmount: "5000",
      }));
      expect(result.line6).toEqual(new Decimal(0));
    });

    it("Form 6781 Line 6 - carryback is zero when election not made", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "15000",
        carrybackElection: false,
        carrybackAmount: "10000",
      }));
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.line7).toEqual(new Decimal(-15000));
    });

    it("Form 6781 Line 6 - full carryback of entire loss", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "8000",
        carrybackElection: true,
        carrybackAmount: "8000",
      }));
      expect(result.line6).toEqual(new Decimal(8000));
      expect(result.line7).toEqual(new Decimal(0));
    });

    it("Form 6781 Line 7 - net section 1256 gain or loss after carryback", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "10000",
        section1256Losses: "30000",
        carrybackElection: true,
        carrybackAmount: "10000",
      }));
      // Line 5: -20000, Line 6: 10000, Line 7: -10000
      expect(result.line7).toEqual(new Decimal(-10000));
    });
  });

  // ── 60/40 Split ─────────────────────────────────────────────────

  describe("60/40 Split (Lines 8-9)", () => {
    it("Form 6781 Line 8 - 40% short-term split on net gain", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "100000",
      }));
      expect(result.line8).toEqual(new Decimal(40000));
    });

    it("Form 6781 Line 9 - 60% long-term split on net gain", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "100000",
      }));
      expect(result.line9).toEqual(new Decimal(60000));
    });

    it("60/40 split on net loss", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "50000",
      }));
      expect(result.line8).toEqual(new Decimal(-20000));
      expect(result.line9).toEqual(new Decimal(-30000));
    });

    it("60/40 split with zero net", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "10000",
        section1256Losses: "10000",
      }));
      expect(result.line8).toEqual(new Decimal(0));
      expect(result.line9).toEqual(new Decimal(0));
    });

    it("60/40 split sums to Line 7 exactly (no rounding gap)", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "33333",
      }));
      // 33333 * 0.40 = 13333.20, 33333 - 13333.20 = 19999.80
      expect(result.line8.plus(result.line9)).toEqual(new Decimal(33333));
    });

    it("60/40 split handles odd amounts correctly", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "1",
      }));
      // 1 * 0.40 = 0.40, remainder = 0.60
      expect(result.line8).toEqual(new Decimal("0.40"));
      expect(result.line9).toEqual(new Decimal("0.60"));
    });

    it("60/40 split handles very large amounts", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "10000000",
      }));
      expect(result.line8).toEqual(new Decimal(4000000));
      expect(result.line9).toEqual(new Decimal(6000000));
    });

    it("60/40 split after partial carryback", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "20000",
        carrybackElection: true,
        carrybackAmount: "15000",
      }));
      // Line 7: -20000 + 15000 = -5000
      expect(result.line7).toEqual(new Decimal(-5000));
      expect(result.line8).toEqual(new Decimal(-2000));
      expect(result.line9).toEqual(new Decimal(-3000));
    });

    it("60/40 split rounds 40% to 2 decimal places with half-up rounding", () => {
      // 12345 * 0.40 = 4938.00 exactly
      const result = calculateForm6781(form6781({
        section1256Gains: "12345",
      }));
      expect(result.line8).toEqual(new Decimal("4938"));
      expect(result.line9).toEqual(new Decimal("7407"));
      expect(result.line8.plus(result.line9)).toEqual(new Decimal(12345));
    });

    it("60/40 split with amount producing half-cent boundary", () => {
      // 5 * 0.40 = 2.00
      const result = calculateForm6781(form6781({
        section1256Gains: "5",
      }));
      expect(result.line8).toEqual(new Decimal("2"));
      expect(result.line9).toEqual(new Decimal("3"));
    });
  });

  // ── Part II: Straddle Gains and Losses ──────────────────────────

  describe("Part II: Straddle Gains and Losses", () => {
    it("Form 6781 Line 11a - short-term straddle losses flow to Schedule D", () => {
      const result = calculateForm6781(form6781({
        shortTermStraddleLosses: "3000",
      }));
      expect(result.line11a).toEqual(new Decimal(-3000));
    });

    it("Form 6781 Line 11b - long-term straddle losses flow to Schedule D", () => {
      const result = calculateForm6781(form6781({
        longTermStraddleLosses: "5000",
      }));
      expect(result.line11b).toEqual(new Decimal(-5000));
    });

    it("Form 6781 Line 13a - short-term straddle gains flow to Schedule D", () => {
      const result = calculateForm6781(form6781({
        shortTermStraddleGains: "7500",
      }));
      expect(result.line13a).toEqual(new Decimal(7500));
    });

    it("Form 6781 Line 13b - long-term straddle gains flow to Schedule D", () => {
      const result = calculateForm6781(form6781({
        longTermStraddleGains: "12000",
      }));
      expect(result.line13b).toEqual(new Decimal(12000));
    });

    it("straddle losses are reported as negative values", () => {
      const result = calculateForm6781(form6781({
        shortTermStraddleLosses: "2500",
        longTermStraddleLosses: "4000",
      }));
      expect(result.line11a.isNegative()).toBe(true);
      expect(result.line11b.isNegative()).toBe(true);
    });

    it("zero straddle losses remain zero (not negative zero)", () => {
      const result = calculateForm6781(form6781());
      expect(result.line11a).toEqual(new Decimal(0));
      expect(result.line11b).toEqual(new Decimal(0));
    });
  });

  // ── Schedule D Integration Totals ───────────────────────────────

  describe("Schedule D Integration", () => {
    it("Form 6781 total short-term flows to Schedule D Line 4", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "50000",
        shortTermStraddleLosses: "2000",
        shortTermStraddleGains: "1000",
      }));
      // Line 8: 50000 * 0.40 = 20000
      // scheduleDShortTerm: 20000 + (-2000) + 1000 = 19000
      expect(result.scheduleDShortTerm).toEqual(new Decimal(19000));
    });

    it("Form 6781 total long-term flows to Schedule D Line 11", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "50000",
        longTermStraddleLosses: "3000",
        longTermStraddleGains: "5000",
      }));
      // Line 9: 50000 * 0.60 = 30000
      // scheduleDLongTerm: 30000 + (-3000) + 5000 = 32000
      expect(result.scheduleDLongTerm).toEqual(new Decimal(32000));
    });

    it("combined short-term and long-term with all Part I and Part II items", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "40000",
        section1256Losses: "10000",
        shortTermStraddleLosses: "1500",
        longTermStraddleLosses: "2500",
        shortTermStraddleGains: "3000",
        longTermStraddleGains: "4000",
      }));
      // Line 7: 30000
      // Line 8: 12000, Line 9: 18000
      // scheduleDShortTerm: 12000 + (-1500) + 3000 = 13500
      // scheduleDLongTerm: 18000 + (-2500) + 4000 = 19500
      expect(result.scheduleDShortTerm).toEqual(new Decimal(13500));
      expect(result.scheduleDLongTerm).toEqual(new Decimal(19500));
    });

    it("straddle-only amounts with no section 1256 contracts", () => {
      const result = calculateForm6781(form6781({
        shortTermStraddleGains: "5000",
        longTermStraddleLosses: "8000",
      }));
      expect(result.line8).toEqual(new Decimal(0));
      expect(result.line9).toEqual(new Decimal(0));
      expect(result.scheduleDShortTerm).toEqual(new Decimal(5000));
      expect(result.scheduleDLongTerm).toEqual(new Decimal(-8000));
    });

    it("net short-term and long-term can both be negative", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "20000",
        shortTermStraddleLosses: "3000",
        longTermStraddleLosses: "5000",
      }));
      // Line 8: -8000, Line 9: -12000
      // scheduleDShortTerm: -8000 + (-3000) = -11000
      // scheduleDLongTerm: -12000 + (-5000) = -17000
      expect(result.scheduleDShortTerm).toEqual(new Decimal(-11000));
      expect(result.scheduleDLongTerm).toEqual(new Decimal(-17000));
    });
  });

  // ── Realistic Scenarios ─────────────────────────────────────────

  describe("Realistic Scenarios", () => {
    it("index options trader with moderate gains — SPX options treated as section 1256", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "45000",
        section1256Losses: "12000",
      }));
      // Net: 33000 → 40% ST = 13200, 60% LT = 19800
      expect(result.line3).toEqual(new Decimal(33000));
      expect(result.line8).toEqual(new Decimal(13200));
      expect(result.line9).toEqual(new Decimal(19800));
    });

    it("futures trader with net loss electing carryback", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "8000",
        section1256Losses: "35000",
        carrybackElection: true,
        carrybackAmount: "20000",
      }));
      // Line 5: -27000, carryback: 20000, Line 7: -7000
      expect(result.line5).toEqual(new Decimal(-27000));
      expect(result.line6).toEqual(new Decimal(20000));
      expect(result.line7).toEqual(new Decimal(-7000));
      expect(result.line8).toEqual(new Decimal(-2800));
      expect(result.line9).toEqual(new Decimal(-4200));
    });

    it("mixed section 1256 and straddle positions", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "75000",
        section1256Losses: "20000",
        adjustments: "-5000",
        shortTermStraddleLosses: "4000",
        longTermStraddleGains: "8000",
      }));
      // Line 5: 55000 + (-5000) = 50000
      // Line 8: 20000, Line 9: 30000
      // scheduleDShortTerm: 20000 + (-4000) = 16000
      // scheduleDLongTerm: 30000 + 8000 = 38000
      expect(result.line5).toEqual(new Decimal(50000));
      expect(result.scheduleDShortTerm).toEqual(new Decimal(16000));
      expect(result.scheduleDLongTerm).toEqual(new Decimal(38000));
    });

    it("small forex trader with foreign currency contract gains", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "2750",
        section1256Losses: "1200",
      }));
      // Net: 1550; 40% = 620.00, 60% = 930.00
      expect(result.line3).toEqual(new Decimal(1550));
      expect(result.line8).toEqual(new Decimal(620));
      expect(result.line9).toEqual(new Decimal(930));
    });

    it("hedging adjustment converts part of gain to ordinary income", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "100000",
        adjustments: "-30000", // 30K is hedging gain → ordinary income, not capital
      }));
      // Line 5: 70000 → 40% = 28000, 60% = 42000
      expect(result.line5).toEqual(new Decimal(70000));
      expect(result.line8).toEqual(new Decimal(28000));
      expect(result.line9).toEqual(new Decimal(42000));
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("negative adjustment cannot create a gain from zero contracts", () => {
      const result = calculateForm6781(form6781({
        adjustments: "-5000",
      }));
      // Line 3: 0, Line 5: -5000 (adjustment alone creates a loss)
      expect(result.line5).toEqual(new Decimal(-5000));
      expect(result.line8).toEqual(new Decimal(-2000));
      expect(result.line9).toEqual(new Decimal(-3000));
    });

    it("positive adjustment can create a gain from zero contracts", () => {
      const result = calculateForm6781(form6781({
        adjustments: "5000",
      }));
      expect(result.line5).toEqual(new Decimal(5000));
      expect(result.line8).toEqual(new Decimal(2000));
      expect(result.line9).toEqual(new Decimal(3000));
    });

    it("negative losses input treated as zero", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "-500",
      }));
      // Negative loss input is floored at zero
      expect(result.line3).toEqual(new Decimal(0));
    });

    it("negative gains input treated as zero", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "-1000",
      }));
      expect(result.line3).toEqual(new Decimal(0));
    });

    it("very small fractional amounts maintain precision", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "0.01",
      }));
      expect(result.line8).toEqual(new Decimal("0.00")); // 0.01 * 0.40 = 0.004 → rounds to 0.00
      expect(result.line9).toEqual(new Decimal("0.01")); // remainder
    });

    it("carryback of zero is harmless even when elected", () => {
      const result = calculateForm6781(form6781({
        section1256Losses: "10000",
        carrybackElection: true,
        carrybackAmount: "0",
      }));
      expect(result.line6).toEqual(new Decimal(0));
      expect(result.line7).toEqual(new Decimal(-10000));
    });

    it("negative straddle loss input treated as zero (not double-negated)", () => {
      const result = calculateForm6781(form6781({
        shortTermStraddleLosses: "-500",
      }));
      expect(result.line11a).toEqual(new Decimal(0));
    });

    it("audit trail records all lines", () => {
      const result = calculateForm6781(form6781({
        section1256Gains: "10000",
        shortTermStraddleLosses: "1000",
      }));
      const lineNames = result.lines.map(l => l.line);
      expect(lineNames).toContain("3");
      expect(lineNames).toContain("4");
      expect(lineNames).toContain("5");
      expect(lineNames).toContain("6");
      expect(lineNames).toContain("7");
      expect(lineNames).toContain("8");
      expect(lineNames).toContain("9");
      expect(lineNames).toContain("11a");
      expect(lineNames).toContain("11b");
      expect(lineNames).toContain("13a");
      expect(lineNames).toContain("13b");
      expect(lineNames).toContain("schedule-d-short-term");
      expect(lineNames).toContain("schedule-d-long-term");
    });
  });
});

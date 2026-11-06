/**
 * Edge case tests for IRA Deduction Worksheet (Pub 590-A).
 * Spec: spec/federal/ira-deduction-worksheet.yaml
 *
 * Tests boundary conditions for phase-out thresholds, $200 floor with age 50+,
 * $10 rounding, QSS spouse-active-participant, and nondeductible tracking.
 */

import { describe, it, expect } from "vitest";
import { calculateIraDeduction } from "@/engine/forms/ira-deduction-worksheet.js";

describe("IRA Deduction Worksheet — Edge Cases", () => {
  // ── Single active participant: $1 below phase-out ceiling ───────────

  describe("Single active participant — near phase-out ceiling", () => {
    it("IRA Deduction - single active at MAGI $88,999 ($1 below ceiling) still gets partial deduction", () => {
      // Phase-out: $79K-$89K. excess = $9,999; ratio = 0.9999
      // Remaining ceiling is1;1 ×0.70 =0.70 →10, then200minimum.
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "88999",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(200);
      expect(result.fullyPhasedOut).toBe(false);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - single active at MAGI $88,900 triggers $200 floor", () => {
      // excess = $9,900; ratio = 0.99; reduction = 0.99 × $7,000 = $6,930 → ceil $10 = $6,930
      // raw = $7,000 - $6,930 = $70 → floor $200
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "88900",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(200);
    });
  });

  // ── Age 50+ with phase-out and $200 floor ───────────────────────────

  describe("Age 50+ with phase-out", () => {
    it("IRA Deduction - age 50+ at $88,999 MAGI: $200 floor with $8K limit", () => {
      // Remaining ceiling1 ×0.80 =0.80 →10, then200minimum.
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "88999",
        contributions: "8000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: true,
      });
      expect(result.contributionLimit.toNumber()).toBe(8000);
      expect(result.deductibleAmount.toNumber()).toBe(200);
    });

    it("IRA Deduction - age 50+ at $79,001 MAGI rounds remaining deduction to $8,000", () => {
      // Worksheet1-2 line4: (89000 - 79001) × 0.80 = 7999.20, rounded up to8000.
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "79001",
        contributions: "8000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: true,
      });
      expect(result.deductibleAmount.toNumber()).toBe(8000);
    });
  });

  // ── MFJ active participant: $1 boundaries ──────────────────────────

  describe("MFJ active participant — exact boundaries", () => {
    it("IRA Deduction - MFJ active at $125,999 ($1 below start) gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "125999",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFJ active at $126,001 rounds the remaining deduction to $7,000", () => {
      // Worksheet1-2 line4: (146000 - 126001) × 0.35 = 6999.65, rounded up to7000.
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "126001",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - MFJ active at $145,999 ($1 below ceiling) gets $200 floor", () => {
      // Remaining ceiling1 ×0.35 =0.35 →10, then200minimum.
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "145999",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(200);
      expect(result.fullyPhasedOut).toBe(false);
    });
  });

  // ── Table1-3: QSS nonparticipants have no income phaseout ─────────

  describe("QSS non-participant with active spouse", () => {
    it("IRA Deduction - QSS non-participant at $241K retains full deduction", () => {
      // Table1-3 lists QSS separately from married filing jointly: any MAGI, full deduction.
      const result = calculateIraDeduction({
        filingStatus: "qualifying_surviving_spouse",
        taxYear: 2025,
        magi: "241000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - QSS non-participant with active spouse at $236K gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "qualifying_surviving_spouse",
        taxYear: 2025,
        magi: "236000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - QSS non-participant at $246K retains full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "qualifying_surviving_spouse",
        taxYear: 2025,
        magi: "246000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.fullyPhasedOut).toBe(false);
    });
  });

  // ── MFS active participant at $0 MAGI boundary ─────────────────────

  describe("MFS $0-$10K phase-out precision", () => {
    it("IRA Deduction - MFS active at MAGI $1 rounds the remaining deduction to $7,000", () => {
      // Worksheet1-2 line4: (10000 - 1) × 0.70 = 6999.30, rounded up to7000.
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "1",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
    });

    it("IRA Deduction - MFS active at MAGI $9,999 ($1 below ceiling) gets $200 floor", () => {
      // Remaining ceiling1 ×0.70 =0.70 →10, then200minimum.
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "9999",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(200);
      expect(result.fullyPhasedOut).toBe(false);
    });
  });

  // ── Nondeductible amount tracking ──────────────────────────────────

  describe("Nondeductible amount tracking", () => {
    it("IRA Deduction - fully phased out: entire contribution is nondeductible", () => {
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "100000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.nondeductibleAmount.toNumber()).toBe(7000);
    });

    it("IRA Deduction - partial phase-out: remainder is nondeductible", () => {
      // MAGI $84K → deduction = $3,500
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "84000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(3500);
      expect(result.nondeductibleAmount.toNumber()).toBe(3500);
    });

    it("IRA Deduction - contributions over limit separate excess from nondeductible basis", () => {
      // Not active participant, $10K contributions, $7K limit
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "50000",
        contributions: "10000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.nondeductibleAmount.toNumber()).toBe(0);
      expect(result.excessContributions.toNumber()).toBe(3000);
    });
  });

  // ── HoH boundary at exact phase-out start ──────────────────────────

  describe("HoH active participant boundaries", () => {
    it("IRA Deduction - HoH active at $79,000 MAGI gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "head_of_household",
        taxYear: 2025,
        magi: "79000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - HoH active at $89,000 MAGI gets $0 deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "head_of_household",
        taxYear: 2025,
        magi: "89000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });

    it("IRA Deduction - HoH active at $79,001 MAGI rounds the remaining deduction to $7,000", () => {
      const result = calculateIraDeduction({
        filingStatus: "head_of_household",
        taxYear: 2025,
        magi: "79001",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
    });
  });

  // ── Round-up to $10: boundary where exact multiple doesn't round ────

  describe("$10 rounding precision", () => {
    it("IRA Deduction - remaining deduction that is an exact $10 multiple stays unchanged", () => {
      // MAGI $80,000, excess = $1,000; ratio = 0.1; reduction = $700 → already $10 multiple
      // deduction = $7,000 - $700 = $6,300
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "80000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(6300);
    });

    it("IRA Deduction - $80,100 MAGI leaves an exact $6,230 remaining deduction", () => {
      // MAGI $80,100, excess = $1,100; ratio = 0.11; reduction = 0.11 × $7,000 = $770 → $770
      // deduction = $7,000 - $770 = $6,230
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "80100",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(6230);
    });
  });

  // ── Exact phase-out boundaries (at, not $1 off) ────────────────────

  describe("Exact phase-out boundary values", () => {
    it("IRA Deduction - single active at exactly $79,000 (phase-out start) gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "79000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - single active at exactly $89,000 (phase-out ceiling) gets $0", () => {
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "89000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });

    it("IRA Deduction - MFJ active at exactly $126,000 (phase-out start) gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "126000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFJ active at exactly $146,000 (phase-out ceiling) gets $0", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "146000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });

    it("IRA Deduction - MFS active at exactly $0 MAGI gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "0",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFS active at exactly $10,000 (phase-out ceiling) gets $0", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "10000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });
  });

  // ── MFJ non-participant with active spouse ─────────────────────────

  describe("MFJ non-participant with active spouse — $236K-$246K phase-out", () => {
    it("IRA Deduction - MFJ non-participant with active spouse at $235,999 gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "235999",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFJ non-participant with active spouse at $236,000 gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "236000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFJ non-participant with active spouse at $241,000 gets partial deduction", () => {
      // excess = $5,000; ratio = 0.5; reduction = 0.5 × $7,000 = $3,500 (exact $10 multiple)
      // deduction = $7,000 - $3,500 = $3,500
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "241000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(3500);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - MFJ non-participant with active spouse at $246,000 gets $0", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        magi: "246000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });
  });

  // ── MFS lived-apart rule: treated as single ────────────────────────

  describe("MFS lived apart from spouse all year — treated as single per Pub 590-A", () => {
    it("IRA Deduction - MFS active lived apart uses single $79K-$89K thresholds, not $0-$10K", () => {
      // Without lived-apart flag, MFS active at $15K would be fully phased out ($0-$10K range).
      // With lived-apart, uses single thresholds: $79K-$89K, so $15K MAGI → full deduction.
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "15000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });

    it("IRA Deduction - MFS active lived apart at $84,000 MAGI gets partial deduction (single range)", () => {
      // Single thresholds: $79K-$89K. excess = $5,000; ratio = 0.5
      // reduction = 0.5 × $7,000 = $3,500; deduction = $3,500
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "84000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(3500);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - MFS active lived apart at $89,000 is fully phased out (single ceiling)", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "89000",
        contributions: "7000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });

    it("IRA Deduction - MFS non-participant with active spouse, lived apart: full deduction (no phase-out)", () => {
      // Lived apart → treated as single non-participant → no phase-out regardless of MAGI
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "500000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });
  });

  // ── MFS non-participant with active spouse (lived with spouse) ─────

  describe("MFS non-participant with active spouse — lived with spouse uses $0-$10K", () => {
    it("IRA Deduction - MFS non-participant with active spouse at $5,000 MAGI gets partial deduction", () => {
      // MFS non-participant whose spouse is active AND lived with spouse:
      // Uses $0-$10K phase-out. excess = $5,000; ratio = 0.5
      // reduction = 0.5 × $7,000 = $3,500; deduction = $3,500
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "5000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: true,
      });
      expect(result.deductibleAmount.toNumber()).toBe(3500);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - MFS non-participant with active spouse at $10,000 MAGI is fully phased out", () => {
      const result = calculateIraDeduction({
        filingStatus: "married_filing_separately",
        taxYear: 2025,
        magi: "10000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: true,
        age50OrOlder: false,
        livedWithSpouseAtAnyTimeDuringYear: true,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.fullyPhasedOut).toBe(true);
    });
  });

  // ── Zero and boundary contribution amounts ─────────────────────────

  describe("Zero and boundary contribution amounts", () => {
    it("IRA Deduction - zero contributions yields $0 deduction even when not phased out", () => {
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "50000",
        contributions: "0",
        isActiveParticipant: false,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(0);
      expect(result.nondeductibleAmount.toNumber()).toBe(0);
    });

    it("IRA Deduction - contributions below reduced limit: deduction capped at contributions", () => {
      // Single active at $84K → reduced limit = $3,500
      // But only contributed $2,000 → deduction = $2,000
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "84000",
        contributions: "2000",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(2000);
      expect(result.nondeductibleAmount.toNumber()).toBe(0);
      expect(result.phaseOutApplied).toBe(true);
    });

    it("IRA Deduction - contributions below $200 floor: deduction equals contributions", () => {
      // At $88,999 MAGI the floor is $200, but if only contributed $100
      // deduction = min($200, $100) = $100
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "88999",
        contributions: "100",
        isActiveParticipant: true,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(100);
      expect(result.nondeductibleAmount.toNumber()).toBe(0);
    });
  });

  // ── Single non-participant: no phase-out at any income ─────────────

  describe("Non-participant with no active spouse", () => {
    it("IRA Deduction - single non-participant at $500K MAGI gets full deduction", () => {
      const result = calculateIraDeduction({
        filingStatus: "single",
        taxYear: 2025,
        magi: "500000",
        contributions: "7000",
        isActiveParticipant: false,
        isSpouseActiveParticipant: false,
        age50OrOlder: false,
      });
      expect(result.deductibleAmount.toNumber()).toBe(7000);
      expect(result.phaseOutApplied).toBe(false);
    });
  });
});

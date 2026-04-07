/**
 * Tests for IRA Deduction Worksheet (Pub 590-A Worksheets 1-1 and 1-2).
 * Spec: spec/federal/ira-deduction-worksheet.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateIraDeduction } from "@/engine/forms/ira-deduction-worksheet.js";

describe("IRA Deduction Worksheet", () => {
  // ── No active participation: full deduction ──────────────────────────

  it("IRA Deduction Worksheet - not an active participant gets full deduction regardless of income", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "200000",
      contributions: "7000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(7000);
  });

  it("IRA Deduction Worksheet - contributions below limit are fully deductible when not active participant", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "200000",
      contributions: "3000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3000);
  });

  // ── Age 50+ catch-up contribution ─────────────────────────────────

  it("IRA Deduction Worksheet - age 50+ gets $8,000 contribution limit", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "50000",
      contributions: "8000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: true,
    });
    expect(result.contributionLimit.toNumber()).toBe(8000);
    expect(result.deductibleAmount.toNumber()).toBe(8000);
  });

  it("IRA Deduction Worksheet - under age 50 cannot deduct more than $7,000", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "50000",
      contributions: "8000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.contributionLimit.toNumber()).toBe(7000);
    expect(result.deductibleAmount.toNumber()).toBe(7000);
  });

  // ── Single active participant phase-out ───────────────────────────

  it("IRA Deduction Worksheet - single active participant below phase-out gets full deduction", () => {
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
  });

  it("IRA Deduction Worksheet - single active participant mid-phase-out gets partial deduction", () => {
    // MAGI $84,000, phase-out $79K-$89K, range $10K
    // excess = $84,000 - $79,000 = $5,000
    // ratio = $5,000 / $10,000 = 0.5
    // reduction = 0.5 × $7,000 = $3,500 → round up to $10 = $3,500 (already multiple of $10)
    // deduction = $7,000 - $3,500 = $3,500
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
  });

  it("IRA Deduction Worksheet - single active participant at phase-out ceiling gets $0 deduction", () => {
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
  });

  it("IRA Deduction Worksheet - single active participant above phase-out ceiling gets $0 deduction", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "150000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(0);
    expect(result.fullyPhasedOut).toBe(true);
  });

  // ── $200 minimum floor ─────────────────────────────────────────────

  it("IRA Deduction Worksheet - partial phase-out applies $200 minimum floor", () => {
    // MAGI $88,700, phase-out $79K-$89K
    // excess = $9,700; ratio = 0.97; reduction = 0.97 × $7,000 = $6,790 → round up to $6,790 (already multiple of $10)
    // raw deduction = $7,000 - $6,790 = $210 → $210 (above $200 floor)
    // Actually let me verify: $9,700 / $10,000 = 0.97, 0.97 × $7,000 = $6,790 exactly, ceiling to $10 = $6,790
    // deduction = $7,000 - $6,790 = $210
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "88700",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(210);
  });

  it("IRA Deduction Worksheet - partial phase-out enforces $200 minimum when reduction leaves less", () => {
    // MAGI $88,800, phase-out $79K-$89K
    // excess = $9,800; ratio = 0.98; reduction = 0.98 × $7,000 = $6,860 → round up to $6,860
    // raw deduction = $7,000 - $6,860 = $140 → bumped to $200 floor
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "88800",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(200);
  });

  // ── Round-up to next $10 ──────────────────────────────────────────

  it("IRA Deduction Worksheet - reduction is rounded up to next $10 multiple", () => {
    // MAGI $80,001, phase-out $79K-$89K
    // excess = $1,001; ratio = 0.1001; reduction = 0.1001 × $7,000 = $700.70 → ceil to $10 = $710
    // deduction = $7,000 - $710 = $6,290
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "80001",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(6290);
  });

  // ── MFJ active participant phase-out ──────────────────────────────

  it("IRA Deduction Worksheet - MFJ active participant below phase-out gets full deduction", () => {
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
  });

  it("IRA Deduction Worksheet - MFJ active participant mid-phase-out gets partial deduction", () => {
    // MAGI $136,000, phase-out $126K-$146K, range $20K
    // excess = $10,000; ratio = 0.5; reduction = 0.5 × $7,000 = $3,500 → $3,500
    // deduction = $3,500
    const result = calculateIraDeduction({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      magi: "136000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3500);
  });

  it("IRA Deduction Worksheet - MFJ active participant fully phased out at $146,000", () => {
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
  });

  // ── MFJ non-participant married to active participant ─────────────

  it("IRA Deduction Worksheet - MFJ non-participant with active spouse below $236K gets full deduction", () => {
    const result = calculateIraDeduction({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      magi: "235000",
      contributions: "7000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: true,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(7000);
  });

  it("IRA Deduction Worksheet - MFJ non-participant with active spouse mid-phase-out gets partial deduction", () => {
    // MAGI $241,000, phase-out $236K-$246K, range $10K
    // excess = $5,000; ratio = 0.5; reduction = $3,500; deduction = $3,500
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
  });

  it("IRA Deduction Worksheet - MFJ non-participant with active spouse fully phased out at $246K", () => {
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
  });

  // ── MFS active participant phase-out ──────────────────────────────

  it("IRA Deduction Worksheet - MFS active participant has $0-$10K phase-out range", () => {
    // MAGI $5,000, phase-out $0-$10K
    // excess = $5,000; ratio = 0.5; reduction = $3,500; deduction = $3,500
    const result = calculateIraDeduction({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      magi: "5000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3500);
  });

  it("IRA Deduction Worksheet - MFS active participant fully phased out at $10K", () => {
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
  });

  it("IRA Deduction Worksheet - MFS active participant at $0 MAGI gets full deduction", () => {
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
  });

  // ── MFS non-participant with active spouse (lived with spouse) ────
  // Per Pub 590-A, MFS filers who lived with their spouse and whose
  // spouse is an active participant get the same $0-$10K phase-out
  // as an active MFS participant.

  it("IRA Deduction Worksheet - MFS non-participant with active spouse (lived with spouse) gets $0-$10K phase-out", () => {
    // MAGI $5,000, phase-out $0-$10K
    // excess = $5,000; ratio = 0.5; reduction = 0.5 × $7,000 = $3,500; deduction = $3,500
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

  it("IRA Deduction Worksheet - MFS non-participant with active spouse (lived with spouse) fully phased out at $10K", () => {
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

  it("IRA Deduction Worksheet - MFS non-participant with active spouse defaults to lived-with-spouse (conservative)", () => {
    // livedWithSpouseAtAnyTimeDuringYear not provided → treated as lived with spouse
    const result = calculateIraDeduction({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      magi: "5000",
      contributions: "7000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: true,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3500);
    expect(result.phaseOutApplied).toBe(true);
  });

  // ── MFS lived apart from spouse all year ────────────────────────
  // Per Pub 590-A, MFS filers who lived apart from their spouse
  // all year are treated as single for IRA deduction purposes.

  it("IRA Deduction Worksheet - MFS active participant lived apart uses single $79K-$89K phase-out", () => {
    // Lived apart → treated as single, MAGI $84K → same as single active participant
    // excess = $5,000; ratio = 0.5; reduction = $3,500; deduction = $3,500
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

  it("IRA Deduction Worksheet - MFS active participant lived apart fully phased out at $89K (single ceiling)", () => {
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

  it("IRA Deduction Worksheet - MFS active participant lived apart gets full deduction below $79K", () => {
    const result = calculateIraDeduction({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      magi: "50000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
      livedWithSpouseAtAnyTimeDuringYear: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(7000);
    expect(result.phaseOutApplied).toBe(false);
  });

  it("IRA Deduction Worksheet - MFS non-participant lived apart with active spouse gets full deduction (treated as single)", () => {
    // Lived apart → treated as single non-participant → no phase-out at any income
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

  // ── HoH active participant ────────────────────────────────────────

  it("IRA Deduction Worksheet - HoH active participant uses single phase-out thresholds", () => {
    // MAGI $84,000, phase-out $79K-$89K (same as single)
    const result = calculateIraDeduction({
      filingStatus: "head_of_household",
      taxYear: 2025,
      magi: "84000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3500);
  });

  // ── QSS uses MFJ thresholds ───────────────────────────────────────

  it("IRA Deduction Worksheet - QSS active participant uses MFJ phase-out thresholds", () => {
    // MAGI $136,000, phase-out $126K-$146K (MFJ thresholds)
    const result = calculateIraDeduction({
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
      magi: "136000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(3500);
  });

  // ── Contributions less than limit ─────────────────────────────────

  it("IRA Deduction Worksheet - deduction capped at actual contributions even when limit is higher", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "50000",
      contributions: "2000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(2000);
  });

  it("IRA Deduction Worksheet - partial phase-out still capped at contributions", () => {
    // MAGI $84,000, reduced limit = $3,500, but contributions = $2,000
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
  });

  // ── Zero contributions ────────────────────────────────────────────

  it("IRA Deduction Worksheet - zero contributions produce zero deduction", () => {
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
  });

  // ── MFJ combines both spouses deductions ──────────────────────────

  it("IRA Deduction Worksheet - MFJ combines both spouses deductions", () => {
    // Primary: active, $7K contributions, MAGI $136K → $3,500 deduction
    // Spouse: not active, $5K contributions → $5,000 deduction (no phase-out)
    const primary = calculateIraDeduction({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      magi: "136000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    const spouse = calculateIraDeduction({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      magi: "136000",
      contributions: "5000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(primary.deductibleAmount.toNumber()).toBe(3500);
    expect(spouse.deductibleAmount.toNumber()).toBe(5000);
    expect(primary.deductibleAmount.plus(spouse.deductibleAmount).toNumber()).toBe(8500);
  });

  // ── MFJ non-participant neither spouse active: full deduction ─────

  it("IRA Deduction Worksheet - MFJ neither spouse active participant gets full deduction", () => {
    const result = calculateIraDeduction({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      magi: "500000",
      contributions: "7000",
      isActiveParticipant: false,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(7000);
  });

  // ── Audit trail ───────────────────────────────────────────────────

  it("IRA Deduction Worksheet - produces audit trail lines", () => {
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "84000",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.form === "IRA Deduction Worksheet")).toBe(true);
  });

  // ── Edge: exact phase-out boundary ────────────────────────────────

  it("IRA Deduction Worksheet - MAGI exactly at phase-out start gets full deduction", () => {
    // excess = $0, so full deduction
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
  });

  it("IRA Deduction Worksheet - MAGI $1 above phase-out start triggers reduction", () => {
    // excess = $1; ratio = 0.0001; reduction = 0.0001 × $7,000 = $0.70 → ceil to $10 = $10
    // deduction = $7,000 - $10 = $6,990
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "79001",
      contributions: "7000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: false,
    });
    expect(result.deductibleAmount.toNumber()).toBe(6990);
  });

  // ── Age 50+ with phase-out ────────────────────────────────────────

  it("IRA Deduction Worksheet - age 50+ active participant mid-phase-out uses $8,000 limit", () => {
    // MAGI $84,000, phase-out $79K-$89K
    // excess = $5,000; ratio = 0.5; reduction = 0.5 × $8,000 = $4,000
    // deduction = $8,000 - $4,000 = $4,000
    const result = calculateIraDeduction({
      filingStatus: "single",
      taxYear: 2025,
      magi: "84000",
      contributions: "8000",
      isActiveParticipant: true,
      isSpouseActiveParticipant: false,
      age50OrOlder: true,
    });
    expect(result.contributionLimit.toNumber()).toBe(8000);
    expect(result.deductibleAmount.toNumber()).toBe(4000);
  });

  // ── $200 floor does not apply when fully phased out ───────────────

  it("IRA Deduction Worksheet - $200 floor does not apply when fully phased out", () => {
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
});

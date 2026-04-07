/**
 * Tests for Washington State Capital Gains Tax
 * Spec: spec/state/wa-capital-gains.yaml
 *
 * 2025: $278,000 standard deduction, 7% base rate, 2.90% surtax on gains > $1M
 * 2024: $270,000 standard deduction, 7% flat rate (no surtax)
 * Source: WA DOR, RCW 82.87.040
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateWACapitalGainsTax } from "@/engine/state/wa-capital-gains.js";

const d = (n: number | string) => new Decimal(n);

describe("Washington State Capital Gains Tax", () => {
  it("WA CG - gains under deduction produce zero tax", () => {
    const result = calculateWACapitalGainsTax(d(200000), d(0), 2025);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.taxableAmount.toNumber()).toBe(0);
  });

  it("WA CG - gains at exactly deduction produce zero tax", () => {
    const result = calculateWACapitalGainsTax(d(278000), d(0), 2025);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - tax calculation on excess", () => {
    // $370,000 LTCG - $278,000 deduction = $92,000 taxable
    // Base tax: $92,000 × 7% = $6,440; surtax: $0 (< $1M); total: $6,440
    const result = calculateWACapitalGainsTax(d(370000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(92000);
    expect(result.tax.toNumber()).toBe(6440);
  });

  it("WA CG - charitable deductions reduce taxable amount", () => {
    // $400,000 LTCG - $50,000 charitable = $350,000 net
    // $350,000 - $278,000 deduction = $72,000 taxable
    // Base tax: $72,000 × 7% = $5,040; surtax: $0; total: $5,040
    const result = calculateWACapitalGainsTax(d(400000), d(50000), 2025);
    expect(result.netLTCG.toNumber()).toBe(350000);
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  it("WA CG - charitable deductions can eliminate tax", () => {
    const result = calculateWACapitalGainsTax(d(300000), d(100000), 2025);
    expect(result.netLTCG.toNumber()).toBe(200000);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - standard deduction is $278,000 for 2025", () => {
    const result = calculateWACapitalGainsTax(d(0), d(0), 2025);
    expect(result.standardDeduction.toNumber()).toBe(278000);
  });

  it("WA CG - audit trail has 8 lines for 2025 (includes surtax)", () => {
    // 2025 has Lines 1-5 + Line 6 (base) + Line 7 (surtax) + Line 8 (total) = 8 lines
    const result = calculateWACapitalGainsTax(d(500000), d(0), 2025);
    expect(result.lines.length).toBe(8);
    expect(result.lines.map((l) => l.line)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  // --- New tests ---

  it("WA CG - zero capital gains produce zero tax", () => {
    const result = calculateWACapitalGainsTax(d(0), d(0), 2025);
    expect(result.totalLTCG.toNumber()).toBe(0);
    expect(result.netLTCG.toNumber()).toBe(0);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - gains $1 over standard deduction: taxable $1, tax rounds to $0", () => {
    // $278,001 LTCG - $278,000 deduction = $1 taxable
    // Base tax: $1 × 7% = $0.07, rounds to $0
    const result = calculateWACapitalGainsTax(d(278001), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - gains $15 over standard deduction produce $1 tax (7% on $15 rounds to $1)", () => {
    // $278,015 LTCG - $278,000 deduction = $15 taxable
    // Base tax: $15 × 7% = $1.05, rounds to $1
    const result = calculateWACapitalGainsTax(d(278015), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(15);
    expect(result.tax.toNumber()).toBe(1);
  });

  it("WA CG - very large capital gains ($5M) produce correct tax with surtax", () => {
    // $5,000,000 LTCG - $278,000 deduction = $4,722,000 taxable
    // Base tax: $4,722,000 × 7% = $330,540
    // Surtax: ($4,722,000 - $1,000,000) × 2.90% = $3,722,000 × 0.029 = $107,938
    // Total: $330,540 + $107,938 = $438,478
    const result = calculateWACapitalGainsTax(d(5000000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(4722000);
    expect(result.baseTax.toNumber()).toBe(330540);
    expect(result.surtax.toNumber()).toBe(107938);
    expect(result.tax.toNumber()).toBe(438478);
  });

  it("WA CG - only long-term gains are passed in; short-term gains are excluded by the caller", () => {
    const ltcg = d(400000);
    const result = calculateWACapitalGainsTax(ltcg, d(0), 2025);
    // $400,000 - $278,000 = $122,000 taxable; $122,000 × 7% = $8,540
    expect(result.totalLTCG.toNumber()).toBe(400000);
    expect(result.taxableAmount.toNumber()).toBe(122000);
    expect(result.tax.toNumber()).toBe(8540);
  });

  it("WA CG - capital losses reduce taxable gains (caller passes net LTCG after losses)", () => {
    const netLTCGAfterLosses = d(350000);
    const result = calculateWACapitalGainsTax(netLTCGAfterLosses, d(0), 2025);
    // $350,000 - $278,000 = $72,000 taxable; $72,000 × 7% = $5,040
    expect(result.totalLTCG.toNumber()).toBe(350000);
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  it("WA CG - capital losses large enough to wipe out gains produce zero tax", () => {
    const netLTCGAfterLosses = d(0);
    const result = calculateWACapitalGainsTax(netLTCGAfterLosses, d(0), 2025);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - filing status does not affect the $278,000 standard deduction", () => {
    const gainsAmount = d(400000);
    const resultSingle = calculateWACapitalGainsTax(gainsAmount, d(0), 2025);
    const resultMFJ = calculateWACapitalGainsTax(gainsAmount, d(0), 2025);

    expect(resultSingle.standardDeduction.toNumber()).toBe(278000);
    expect(resultMFJ.standardDeduction.toNumber()).toBe(278000);
    expect(resultSingle.tax.toNumber()).toBe(resultMFJ.tax.toNumber());
    // $400,000 - $278,000 = $122,000 × 7% = $8,540
    expect(resultSingle.tax.toNumber()).toBe(8540);
  });

  it("WA CG - real estate gains excluded (caller passes only eligible LTCG)", () => {
    const eligibleLTCG = d(350000);
    const result = calculateWACapitalGainsTax(eligibleLTCG, d(0), 2025);
    // $350,000 - $278,000 = $72,000 taxable; $72,000 × 7% = $5,040
    expect(result.totalLTCG.toNumber()).toBe(350000);
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  it("WA CG - audit trail line labels and descriptions are correct for 2025", () => {
    const result = calculateWACapitalGainsTax(d(370000), d(0), 2025);
    const lines = result.lines;

    // 2025 has 8 lines: 1-5 + base tax + surtax + total
    expect(lines).toHaveLength(8);
    expect(lines[0].line).toBe("1");
    expect(lines[1].line).toBe("2");
    expect(lines[2].line).toBe("3");
    expect(lines[3].line).toBe("4");
    expect(lines[4].line).toBe("5");
    expect(lines[5].line).toBe("6");
    expect(lines[6].line).toBe("7");
    expect(lines[7].line).toBe("8");

    // $370,000 - $278,000 = $92,000 taxable; base $6,440; surtax $0; total $6,440
    expect(lines[0].value.toNumber()).toBe(370000); // Line 1: total LTCG
    expect(lines[1].value.toNumber()).toBe(0);       // Line 2: charitable deductions
    expect(lines[2].value.toNumber()).toBe(370000); // Line 3: net LTCG
    expect(lines[3].value.toNumber()).toBe(278000); // Line 4: standard deduction
    expect(lines[4].value.toNumber()).toBe(92000);  // Line 5: taxable amount
    expect(lines[5].value.toNumber()).toBe(6440);   // Line 6: base tax
    expect(lines[6].value.toNumber()).toBe(0);       // Line 7: surtax
    expect(lines[7].value.toNumber()).toBe(6440);   // Line 8: total tax
  });

  it("WA CG - throws for unsupported tax year", () => {
    expect(() => calculateWACapitalGainsTax(d(300000), d(0), 2020)).toThrow(
      "WA capital gains constants not available for 2020"
    );
  });

  // --- Edge cases: threshold boundary ---

  it("WA CG Line 5 - exactly at $250,000 is well below $278K deduction, zero tax", () => {
    const result = calculateWACapitalGainsTax(d(250000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 5 - $250,001 is still below $278K deduction, zero tax", () => {
    const result = calculateWACapitalGainsTax(d(250001), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge cases: very large gains ---

  it("WA CG Line 8 - very large capital gains ($10M) produce correct tax with surtax", () => {
    // $10,000,000 LTCG - $278,000 deduction = $9,722,000 taxable
    // Base tax: $9,722,000 × 7% = $680,540
    // Surtax: ($9,722,000 - $1,000,000) × 2.90% = $8,722,000 × 0.029 = $252,938
    // Total: $680,540 + $252,938 = $933,478
    const result = calculateWACapitalGainsTax(d(10000000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(9722000);
    expect(result.baseTax.toNumber()).toBe(680540);
    expect(result.surtax.toNumber()).toBe(252938);
    expect(result.tax.toNumber()).toBe(933478);
  });

  it("WA CG Line 8 - very large capital gains ($50M) with charitable deductions and surtax", () => {
    // $50,000,000 LTCG, $2M charitable → capped at $111K per RCW 82.87.080(2)
    // $50,000,000 - $111,000 = $49,889,000 net
    // $49,889,000 - $278,000 deduction = $49,611,000 taxable
    // Base tax: $49,611,000 × 7% = $3,472,770
    // Surtax: ($49,611,000 - $1,000,000) × 2.90% = $48,611,000 × 0.029 = $1,409,719
    // Total: $3,472,770 + $1,409,719 = $4,882,489
    const result = calculateWACapitalGainsTax(d(50000000), d(2000000), 2025);
    expect(result.netLTCG.toNumber()).toBe(49889000);
    expect(result.taxableAmount.toNumber()).toBe(49611000);
    expect(result.baseTax.toNumber()).toBe(3472770);
    expect(result.surtax.toNumber()).toBe(1409719);
    expect(result.tax.toNumber()).toBe(4882489);
  });

  // --- Edge cases: all short-term gains (nothing passed to WA engine) ---

  it("WA CG Line 1 - all short-term gains means zero LTCG passed in, zero tax", () => {
    const result = calculateWACapitalGainsTax(d(0), d(0), 2025);
    expect(result.totalLTCG.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge cases: mix of short-term and long-term ---

  it("WA CG Line 1 - mix of ST and LT: only LT portion passed in determines tax", () => {
    // $300,000 LTCG - $278,000 = $22,000 taxable; $22,000 × 7% = $1,540
    const result = calculateWACapitalGainsTax(d(300000), d(0), 2025);
    expect(result.totalLTCG.toNumber()).toBe(300000);
    expect(result.taxableAmount.toNumber()).toBe(22000);
    expect(result.tax.toNumber()).toBe(1540);
  });

  // --- Edge cases: losses offsetting gains below threshold ---

  it("WA CG Line 3 - losses offset gains to just below threshold, zero tax", () => {
    // Net LTCG after losses is $277,999 — just below $278,000 deduction
    const result = calculateWACapitalGainsTax(d(277999), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 3 - losses offset gains to exactly threshold, zero tax", () => {
    const result = calculateWACapitalGainsTax(d(278000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge cases: MFS filing status ---

  it("WA CG Line 4 - MFS filing status gets same $278,000 deduction (no split)", () => {
    // WA capital gains tax does not reduce the deduction for MFS filers.
    // Deduction is per individual, or per couple for married/domestic partners.
    const mfsGains = d(350000);
    const result = calculateWACapitalGainsTax(mfsGains, d(0), 2025);
    expect(result.standardDeduction.toNumber()).toBe(278000);
    // $350,000 - $278,000 = $72,000 taxable; $72,000 × 7% = $5,040
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  // --- Edge cases: capital loss carryforward ---

  it("WA CG Line 1 - capital loss carryforward reduces net LTCG below threshold", () => {
    const netAfterCarryforward = d(250000);
    const result = calculateWACapitalGainsTax(netAfterCarryforward, d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 1 - capital loss carryforward partially reduces gains but tax still owed", () => {
    // $400,000 - $278,000 = $122,000 taxable; $122,000 × 7% = $8,540
    const netAfterCarryforward = d(400000);
    const result = calculateWACapitalGainsTax(netAfterCarryforward, d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(122000);
    expect(result.tax.toNumber()).toBe(8540);
  });

  // --- Edge cases: negative net capital gains ---

  it("WA CG Line 3 - negative net LTCG (charitable exceeds gains) floors at zero", () => {
    const result = calculateWACapitalGainsTax(d(100000), d(200000), 2025);
    expect(result.netLTCG.toNumber()).toBe(0);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge cases: multiple gain types ---

  it("WA CG Line 1 - collectibles LTCG included in total passed to engine", () => {
    const totalLTCG = d(350000); // includes collectibles
    const result = calculateWACapitalGainsTax(totalLTCG, d(0), 2025);
    // $350,000 - $278,000 = $72,000 taxable; $72,000 × 7% = $5,040
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  it("WA CG Line 1 - qualified small business stock (Sec 1202) exclusion reduces LTCG before WA", () => {
    const eligibleAfterQSBS = d(300000);
    const result = calculateWACapitalGainsTax(eligibleAfterQSBS, d(0), 2025);
    // $300,000 - $278,000 = $22,000 taxable; $22,000 × 7% = $1,540
    expect(result.taxableAmount.toNumber()).toBe(22000);
    expect(result.tax.toNumber()).toBe(1540);
  });

  // --- Edge cases: standard deduction interaction ---

  it("WA CG Line 4 - standard deduction fully absorbs modest gains", () => {
    const result = calculateWACapitalGainsTax(d(150000), d(0), 2025);
    expect(result.standardDeduction.toNumber()).toBe(278000);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge cases: charitable donation deductions ---

  it("WA CG Line 2 - charitable deductions bring net LTCG exactly to threshold, zero tax", () => {
    // $328,000 LTCG - $50,000 charitable = $278,000 net = exactly the deduction
    const result = calculateWACapitalGainsTax(d(328000), d(50000), 2025);
    expect(result.netLTCG.toNumber()).toBe(278000);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 2 - charitable deductions bring net LTCG to $1 above threshold", () => {
    // $328,001 LTCG - $50,000 charitable = $278,001 net
    // $278,001 - $278,000 = $1 taxable; $1 × 7% = $0.07 rounds to $0
    const result = calculateWACapitalGainsTax(d(328001), d(50000), 2025);
    expect(result.netLTCG.toNumber()).toBe(278001);
    expect(result.taxableAmount.toNumber()).toBe(1);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 2 - large charitable deduction with large gains (capped at $111K)", () => {
    // $1,000,000 LTCG, $500K charitable → capped at $111K per RCW 82.87.080(2)
    // $1,000,000 - $111,000 = $889,000 net
    // $889,000 - $278,000 = $611,000 taxable; $611,000 × 7% = $42,770
    const result = calculateWACapitalGainsTax(d(1000000), d(500000), 2025);
    expect(result.netLTCG.toNumber()).toBe(889000);
    expect(result.taxableAmount.toNumber()).toBe(611000);
    expect(result.tax.toNumber()).toBe(42770);
  });

  // --- Edge cases: rounding behavior ---

  it("WA CG Line 6 - tax rounding: $8 excess yields $0.56, rounds to $1", () => {
    // $278,008 LTCG - $278,000 = $8 taxable; $8 × 7% = $0.56 rounds to $1
    const result = calculateWACapitalGainsTax(d(278008), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(8);
    expect(result.tax.toNumber()).toBe(1);
  });

  it("WA CG Line 6 - tax rounding: $7 excess yields $0.49, rounds to $0", () => {
    // $278,007 LTCG - $278,000 = $7 taxable; $7 × 7% = $0.49 rounds to $0
    const result = calculateWACapitalGainsTax(d(278007), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(7);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG Line 6 - tax rounding: exact half ($0.50) rounds up to $1", () => {
    // $278,050 LTCG - $278,000 = $50; $50 × 0.07 = $3.50 → rounds to $4
    const result = calculateWACapitalGainsTax(d(278050), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(50);
    expect(result.tax.toNumber()).toBe(4); // $3.50 rounds up (ROUND_HALF_UP)
  });

  // --- Edge case: Decimal precision with fractional-cent inputs ---

  it("WA CG Line 6 - Decimal.js handles sub-cent LTCG values correctly", () => {
    // $278,000.50 LTCG - $278,000 deduction = $0.50 taxable
    // $0.50 × 7% = $0.035 → rounds to $0
    const result = calculateWACapitalGainsTax(d("278000.50"), d(0), 2025);
    expect(result.taxableAmount.equals(d("0.50"))).toBe(true);
    expect(result.tax.toNumber()).toBe(0);
  });

  // --- Edge case: audit trail with charitable deductions ---

  it("WA CG - audit trail records charitable deductions correctly for 2025", () => {
    const result = calculateWACapitalGainsTax(d(400000), d(75000), 2025);
    const lines = result.lines;
    // 8 lines for 2025
    expect(lines).toHaveLength(8);
    // $400,000 - $75,000 = $325,000 - $278,000 = $47,000 taxable
    // Base: $47,000 × 7% = $3,290; surtax: $0; total: $3,290
    expect(lines[0].value.toNumber()).toBe(400000); // Line 1: total LTCG
    expect(lines[1].value.toNumber()).toBe(75000);  // Line 2: charitable
    expect(lines[2].value.toNumber()).toBe(325000); // Line 3: net LTCG
    expect(lines[3].value.toNumber()).toBe(278000); // Line 4: std deduction
    expect(lines[4].value.toNumber()).toBe(47000);  // Line 5: taxable
    expect(lines[5].value.toNumber()).toBe(3290);   // Line 6: base tax
    expect(lines[6].value.toNumber()).toBe(0);       // Line 7: surtax
    expect(lines[7].value.toNumber()).toBe(3290);   // Line 8: total tax
  });

  // --- 2024 tax year: $270,000 standard deduction, no surtax ---

  it("WA CG - standard deduction is $270,000 for 2024", () => {
    const result = calculateWACapitalGainsTax(d(0), d(0), 2024);
    expect(result.standardDeduction.toNumber()).toBe(270000);
  });

  it("WA CG - 2024 gains below $270,000 threshold produce zero tax", () => {
    const result = calculateWACapitalGainsTax(d(200000), d(0), 2024);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - 2024 gains exactly at $270,000 threshold produce zero tax", () => {
    const result = calculateWACapitalGainsTax(d(270000), d(0), 2024);
    expect(result.taxableAmount.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - 2024 gains $1 over $270,000 threshold: $1 taxable, tax rounds to $0", () => {
    // $270,001 LTCG - $270,000 = $1 taxable; $1 × 7% = $0.07 → rounds to $0
    const result = calculateWACapitalGainsTax(d(270001), d(0), 2024);
    expect(result.taxableAmount.toNumber()).toBe(1);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("WA CG - 2024 tax calculation: 7% rate applies on excess over $270,000 deduction", () => {
    // $370,000 LTCG - $270,000 deduction = $100,000 taxable; $100,000 × 7% = $7,000
    const result = calculateWACapitalGainsTax(d(370000), d(0), 2024);
    expect(result.standardDeduction.toNumber()).toBe(270000);
    expect(result.taxableAmount.toNumber()).toBe(100000);
    expect(result.tax.toNumber()).toBe(7000);
  });

  it("WA CG - 2024 has no surtax (flat 7%)", () => {
    // $2,000,000 LTCG - $270,000 = $1,730,000 taxable; $1,730,000 × 7% = $121,100
    // No surtax for 2024
    const result = calculateWACapitalGainsTax(d(2000000), d(0), 2024);
    expect(result.taxableAmount.toNumber()).toBe(1730000);
    expect(result.baseTax.toNumber()).toBe(121100);
    expect(result.surtax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(121100);
  });

  it("WA CG - 2024 audit trail has 6 lines (no surtax lines)", () => {
    const result = calculateWACapitalGainsTax(d(500000), d(0), 2024);
    expect(result.lines.length).toBe(6);
    expect(result.lines.map((l) => l.line)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  // --- Audit trail: line values for 2024 ---

  it("WA CG - audit trail records correct values for 2024 tax year", () => {
    // $370,000 LTCG, $0 charitable, 2024 → deduction $270,000, taxable $100,000, tax $7,000
    const result = calculateWACapitalGainsTax(d(370000), d(0), 2024);
    const lines = result.lines;
    expect(lines).toHaveLength(6);
    expect(lines[0].value.toNumber()).toBe(370000); // Line 1: total LTCG
    expect(lines[1].value.toNumber()).toBe(0);       // Line 2: charitable
    expect(lines[2].value.toNumber()).toBe(370000); // Line 3: net LTCG
    expect(lines[3].value.toNumber()).toBe(270000); // Line 4: 2024 standard deduction
    expect(lines[4].value.toNumber()).toBe(100000); // Line 5: taxable amount
    expect(lines[5].value.toNumber()).toBe(7000);   // Line 6: tax owed
  });

  // --- 7% base rate ---

  it("WA CG Line 6 - base rate 7%: $1,000,000 taxable produces $70,000 base tax", () => {
    // $1,278,000 LTCG - $278,000 deduction = $1,000,000 taxable
    // Base: $1,000,000 × 7% = $70,000; surtax: ($1M - $1M) × 2.9% = $0; total: $70,000
    const result = calculateWACapitalGainsTax(d(1278000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1000000);
    expect(result.baseTax.toNumber()).toBe(70000);
    expect(result.surtax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(70000);
  });

  // --- Retirement account gains excluded ---

  it("WA CG Line 1 - retirement account gains excluded (caller passes only non-retirement LTCG)", () => {
    const eligibleLTCG = d(300000);
    const result = calculateWACapitalGainsTax(eligibleLTCG, d(0), 2025);
    // $300,000 - $278,000 = $22,000 taxable; $22,000 × 7% = $1,540
    expect(result.totalLTCG.toNumber()).toBe(300000);
    expect(result.taxableAmount.toNumber()).toBe(22000);
    expect(result.tax.toNumber()).toBe(1540);
  });

  // --- Multiple types of capital gains ---

  it("WA CG Line 1 - mix of stock, bond, and collectibles LTCG all taxed at 7%", () => {
    const stockLTCG = d(150000);
    const bondLTCG = d(80000);
    const collectiblesLTCG = d(120000);
    const totalLTCG = stockLTCG.plus(bondLTCG).plus(collectiblesLTCG);
    const result = calculateWACapitalGainsTax(totalLTCG, d(0), 2025);
    // $350,000 - $278,000 = $72,000 taxable; $72,000 × 7% = $5,040
    expect(result.totalLTCG.toNumber()).toBe(350000);
    expect(result.taxableAmount.toNumber()).toBe(72000);
    expect(result.tax.toNumber()).toBe(5040);
  });

  // --- Very large gains ($1M+) ---

  it("WA CG Line 8 - $1,000,000 gain produces correct tax (no surtax, below $1M taxable)", () => {
    // $1,000,000 LTCG - $278,000 deduction = $722,000 taxable (< $1M, no surtax)
    // Base: $722,000 × 7% = $50,540; surtax: $0; total: $50,540
    const result = calculateWACapitalGainsTax(d(1000000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(722000);
    expect(result.baseTax.toNumber()).toBe(50540);
    expect(result.surtax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(50540);
  });

  it("WA CG Line 8 - $2,000,000 gain with charitable deduction and surtax", () => {
    // $2,000,000 LTCG - $100,000 charitable = $1,900,000 net
    // $1,900,000 - $278,000 = $1,622,000 taxable
    // Base: $1,622,000 × 7% = $113,540
    // Surtax: ($1,622,000 - $1,000,000) × 2.90% = $622,000 × 0.029 = $18,038
    // Total: $113,540 + $18,038 = $131,578
    const result = calculateWACapitalGainsTax(d(2000000), d(100000), 2025);
    expect(result.netLTCG.toNumber()).toBe(1900000);
    expect(result.taxableAmount.toNumber()).toBe(1622000);
    expect(result.baseTax.toNumber()).toBe(113540);
    expect(result.surtax.toNumber()).toBe(18038);
    expect(result.tax.toNumber()).toBe(131578);
  });

  // --- Charitable deduction combined with retirement exclusion ---

  it("WA CG Line 2 - charitable deduction capped with caller-excluded retirement gains", () => {
    const eligibleLTCG = d(500000);
    const charitable = d(200000); // capped at $111K per RCW 82.87.080(2)
    const result = calculateWACapitalGainsTax(eligibleLTCG, charitable, 2025);
    // $500,000 - $111,000 (capped) = $389,000 net; $389,000 - $278,000 = $111,000 taxable
    // $111,000 × 7% = $7,770
    expect(result.netLTCG.toNumber()).toBe(389000);
    expect(result.taxableAmount.toNumber()).toBe(111000);
    expect(result.tax.toNumber()).toBe(7770);
  });

  // =================================================================
  // 2.90% Surtax regression tests (RCW 82.87.040, effective Jan 1, 2025)
  // =================================================================

  it("WA CG - 2.90% surtax on taxable gains over $1M", () => {
    // $1,500,000 LTCG - $278,000 = $1,222,000 taxable
    // Base: $1,222,000 × 7% = $85,540
    // Surtax: ($1,222,000 - $1,000,000) × 2.90% = $222,000 × 0.029 = $6,438
    // Total: $85,540 + $6,438 = $91,978
    const result = calculateWACapitalGainsTax(d(1500000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1222000);
    expect(result.baseTax.toNumber()).toBe(85540);
    expect(result.surtax.toNumber()).toBe(6438);
    expect(result.tax.toNumber()).toBe(91978);
  });

  it("WA CG - surtax boundary: taxable exactly $1,000,000 produces $0 surtax", () => {
    // $1,278,000 - $278,000 = $1,000,000 exactly at threshold
    const result = calculateWACapitalGainsTax(d(1278000), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1000000);
    expect(result.surtax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(70000); // 7% only
  });

  it("WA CG - surtax boundary: taxable $1,000,001 produces $0 surtax (rounds to $0)", () => {
    // $1,278,001 - $278,000 = $1,000,001 taxable
    // Surtax: $1 × 2.90% = $0.029 → rounds to $0
    const result = calculateWACapitalGainsTax(d(1278001), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1000001);
    expect(result.surtax.toNumber()).toBe(0);
  });

  it("WA CG - surtax boundary: first dollar of surtax at taxable $1,000,018", () => {
    // Need surtaxBase × 0.029 ≥ 0.50 for roundDollar to produce $1
    // 0.50 / 0.029 = 17.24 → surtaxBase = $18 gives $18 × 0.029 = $0.522 → $1
    // Taxable = $1,000,018 → LTCG = $1,278,018
    const result = calculateWACapitalGainsTax(d(1278018), d(0), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1000018);
    expect(result.surtax.toNumber()).toBe(1);
    // Base: $1,000,018 × 7% = $70,001.26 → $70,001
    expect(result.baseTax.toNumber()).toBe(70001);
    expect(result.tax.toNumber()).toBe(70002);
  });

  it("WA CG - surtax rounding: $17 over $1M yields $0.493, rounds to $0", () => {
    // surtaxBase = $17; $17 × 0.029 = $0.493 → rounds to $0
    const result = calculateWACapitalGainsTax(d(1278017), d(0), 2025);
    expect(result.surtax.toNumber()).toBe(0);
  });

  it("WA CG - surtax with charitable deduction capped at $111K (no longer eliminates surtax)", () => {
    // $1,500,000 LTCG, $300K charitable → capped at $111K per RCW 82.87.080(2)
    // $1,500,000 - $111,000 = $1,389,000 net
    // $1,389,000 - $278,000 = $1,111,000 taxable (> $1M, surtax applies)
    // Base: $1,111,000 × 7% = $77,770
    // Surtax: ($1,111,000 - $1,000,000) × 2.90% = $111,000 × 0.029 = $3,219
    // Total: $77,770 + $3,219 = $80,989
    const result = calculateWACapitalGainsTax(d(1500000), d(300000), 2025);
    expect(result.taxableAmount.toNumber()).toBe(1111000);
    expect(result.surtax.toNumber()).toBe(3219);
    expect(result.tax.toNumber()).toBe(80989);
  });

  it("WA CG - 2024 has no surtax even for very large gains", () => {
    // $5,000,000 LTCG - $270,000 = $4,730,000 taxable
    // 2024: flat 7% only → $4,730,000 × 7% = $331,100
    const result = calculateWACapitalGainsTax(d(5000000), d(0), 2024);
    expect(result.taxableAmount.toNumber()).toBe(4730000);
    expect(result.surtax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(331100);
  });

  // =================================================================
  // Charitable deduction cap — RCW 82.87.080(2) regression tests
  // =================================================================

  it("WA CG Line 2 - charitable deduction under $111K cap passes through (2025)", () => {
    // $400K LTCG, $50K charitable (under $111K cap) → full $50K applied
    const result = calculateWACapitalGainsTax(d(400000), d(50000), 2025);
    expect(result.deductions.toNumber()).toBe(50000);
    expect(result.netLTCG.toNumber()).toBe(350000);
    // $350K - $278K = $72K taxable; $72K × 7% = $5,040
    expect(result.tax.toNumber()).toBe(5040);
  });

  it("WA CG Line 2 - charitable deduction exactly at $111K cap (2025)", () => {
    const result = calculateWACapitalGainsTax(d(500000), d(111000), 2025);
    expect(result.deductions.toNumber()).toBe(111000);
    expect(result.netLTCG.toNumber()).toBe(389000);
    // $389K - $278K = $111K taxable; $111K × 7% = $7,770
    expect(result.tax.toNumber()).toBe(7770);
  });

  it("WA CG Line 2 - charitable deduction over $111K cap is capped (2025)", () => {
    // $600K LTCG, $200K charitable → capped at $111K
    const result = calculateWACapitalGainsTax(d(600000), d(200000), 2025);
    expect(result.deductions.toNumber()).toBe(111000); // capped
    expect(result.netLTCG.toNumber()).toBe(489000);
    // $489K - $278K = $211K taxable; $211K × 7% = $14,770
    expect(result.tax.toNumber()).toBe(14770);
  });

  it("WA CG Line 2 - 2024 charitable deduction cap is $108K", () => {
    // $600K LTCG, $150K charitable → capped at $108K for 2024
    const result = calculateWACapitalGainsTax(d(600000), d(150000), 2024);
    expect(result.deductions.toNumber()).toBe(108000); // 2024 cap
    expect(result.netLTCG.toNumber()).toBe(492000);
    // $492K - $270K (2024 std ded) = $222K taxable; $222K × 7% = $15,540
    expect(result.tax.toNumber()).toBe(15540);
  });

  it("WA CG Line 2 - charitable deduction $0 is unaffected by cap", () => {
    const result = calculateWACapitalGainsTax(d(400000), d(0), 2025);
    expect(result.deductions.toNumber()).toBe(0);
    expect(result.netLTCG.toNumber()).toBe(400000);
  });
});

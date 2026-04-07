/**
 * Tests for New Jersey NJ-1040 Earned Income Tax Credit (NJEITC).
 * Spec: spec/state/nj-1040-eitc.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040EITC } from "@/engine/state/nj-1040-eitc.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 Earned Income Tax Credit", () => {
  // --- Zero / no credit cases ---

  it("NJ-1040 EITC - zero federal EITC produces zero NJ EITC", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 0,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(0);
  });

  it("NJ-1040 EITC - childless age-18 exception gives fixed $260 when federal EITC is zero", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 0,
      monthsOfResidency: 12,
      qualifiesForChildlessAge18Exception: true,
      qualifyingEICChildrenCount: 0,
      hasAdult18OrOlderTaxpayer: true,
    });
    expect(result.njEITC.toNumber()).toBe(260);
  });

  it("NJ-1040 EITC - childless age-18 exception prorates fixed $260 for part-year residents", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 0,
      monthsOfResidency: 6,
      qualifiesForChildlessAge18Exception: true,
      qualifyingEICChildrenCount: 0,
      hasAdult18OrOlderTaxpayer: true,
    });
    expect(result.njEITC.toNumber()).toBe(130);
  });

  it("NJ-1040 EITC - zero months of residency produces zero NJ EITC", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 0,
    });
    expect(result.njEITC.toNumber()).toBe(0);
    expect(result.proratedFederalEITC.toNumber()).toBe(0);
  });

  // --- Full-year resident ---

  it("NJ-1040 EITC - full-year resident gets 40% of federal EITC", () => {
    // $4,000 federal × 40% = $1,600
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 12,
    });
    expect(result.proratedFederalEITC.toNumber()).toBe(4000);
    expect(result.njEITC.toNumber()).toBe(1600);
    expect(result.njEITCRate.toNumber()).toBe(0.4);
  });

  it("NJ-1040 EITC - full-year resident with $632 federal EITC (no children)", () => {
    // $632 × 40% = $252.80 → rounds to $253
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 632,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(253);
  });

  it("NJ-1040 EITC - full-year resident with $7,830 federal EITC (3+ children)", () => {
    // $7,830 × 40% = $3,132
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 7830,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(3132);
  });

  it("NJ-1040 EITC - full-year resident with $6,960 federal EITC (2 children)", () => {
    // $6,960 × 40% = $2,784
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 6960,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(2784);
  });

  it("NJ-1040 EITC - full-year resident with $4,213 federal EITC (1 child)", () => {
    // $4,213 × 40% = $1,685.20 → rounds to $1,685
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4213,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(1685);
  });

  // --- Part-year resident proration ---

  it("NJ-1040 EITC - part-year resident with 6 months gets half credit", () => {
    // Federal EITC $4,000
    // Prorated: $4,000 / 12 × 6 = $2,000
    // NJ EITC: $2,000 × 40% = $800
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 6,
    });
    expect(result.proratedFederalEITC.toNumber()).toBe(2000);
    expect(result.njEITC.toNumber()).toBe(800);
  });

  it("NJ-1040 EITC - part-year resident with 1 month gets 1/12 credit", () => {
    // Federal EITC $6,000
    // Prorated: $6,000 / 12 × 1 = $500
    // NJ EITC: $500 × 40% = $200
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 6000,
      monthsOfResidency: 1,
    });
    expect(result.proratedFederalEITC.toNumber()).toBe(500);
    expect(result.njEITC.toNumber()).toBe(200);
  });

  it("NJ-1040 EITC - part-year resident with 3 months prorates correctly", () => {
    // Federal EITC $4,800
    // Prorated: $4,800 / 12 × 3 = $1,200
    // NJ EITC: $1,200 × 40% = $480
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4800,
      monthsOfResidency: 3,
    });
    expect(result.proratedFederalEITC.toNumber()).toBe(1200);
    expect(result.njEITC.toNumber()).toBe(480);
  });

  it("NJ-1040 EITC - part-year resident with 7 months and non-round federal EITC", () => {
    // Federal EITC $5,000
    // Prorated: $5,000 / 12 × 7 = $2,916.6667
    // NJ EITC: $2,916.6667 × 40% = $1,166.6667 → rounds to $1,167
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 5000,
      monthsOfResidency: 7,
    });
    expect(result.proratedFederalEITC.toFixed(2)).toBe("2916.67");
    expect(result.njEITC.toNumber()).toBe(1167);
  });

  it("NJ-1040 EITC - part-year resident with 11 months", () => {
    // Federal EITC $4,000
    // Prorated: $4,000 / 12 × 11 = $3,666.6667
    // NJ EITC: $3,666.6667 × 40% = $1,466.6667 → rounds to $1,467
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 11,
    });
    expect(result.njEITC.toNumber()).toBe(1467);
  });

  // --- Decimal input support ---

  it("NJ-1040 EITC - accepts Decimal input for federal EITC", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: d(4000),
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(1600);
  });

  it("NJ-1040 EITC - accepts string input for federal EITC", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: "3500",
      monthsOfResidency: 12,
    });
    // $3,500 × 40% = $1,400
    expect(result.njEITC.toNumber()).toBe(1400);
  });

  // --- Rounding ---

  it("NJ-1040 EITC - rounds result to nearest dollar", () => {
    // Federal EITC $1,001
    // NJ EITC: $1,001 × 40% = $400.40 → rounds to $400
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 1001,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(400);
  });

  it("NJ-1040 EITC - rounds up at exactly $0.50", () => {
    // Need federal EITC where × 0.4 gives exactly .50
    // $1,001.25 × 0.4 = $400.50 → rounds to $401
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: "1001.25",
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(401);
  });

  // --- Negative federal EITC (edge case) ---

  it("NJ-1040 EITC - negative federal EITC is floored at zero", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: -500,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(0);
    expect(result.proratedFederalEITC.toNumber()).toBe(0);
  });

  // --- Months boundary ---

  it("NJ-1040 EITC - months clamped to maximum of 12", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 15,
    });
    // Should treat as 12 months max
    expect(result.proratedFederalEITC.toNumber()).toBe(4000);
    expect(result.njEITC.toNumber()).toBe(1600);
  });

  // --- Audit trail ---

  it("NJ-1040 EITC - audit trail records all computation steps", () => {
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 4000,
      monthsOfResidency: 12,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("federal-eitc");
    expect(lineIds).toContain("prorated-federal-eitc");
    expect(lineIds).toContain("nj-eitc");
  });

  // --- Small federal EITC ---

  it("NJ-1040 EITC - very small federal EITC of $1", () => {
    // $1 × 40% = $0.40 → rounds to $0
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 1,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(0);
  });

  it("NJ-1040 EITC - federal EITC of $2 produces $1 NJ EITC", () => {
    // $2 × 40% = $0.80 → rounds to $1
    const result = calculateNJ1040EITC({
      taxYear: 2025,
      federalEITC: 2,
      monthsOfResidency: 12,
    });
    expect(result.njEITC.toNumber()).toBe(1);
  });
});

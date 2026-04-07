/**
 * Tests for New Jersey NJ-1040 Use Tax computation (Line 51).
 * Spec: spec/state/nj-1040-use-tax.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040UseTax } from "@/engine/state/nj-1040-use-tax.js";

describe("NJ-1040 use tax", () => {
  // --- Safe harbor table lookup ---

  it("NJ-1040 use tax - safe harbor $0 for income under $15,000", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 10000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(0);
    expect(result.usedSafeHarbor).toBe(true);
  });

  it("NJ-1040 use tax - safe harbor $8 for income $15,000-$24,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 15000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(8);
  });

  it("NJ-1040 use tax - safe harbor $8 at $24,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 24999,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(8);
  });

  it("NJ-1040 use tax - safe harbor $17 for income $25,000-$34,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 30000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(17);
  });

  it("NJ-1040 use tax - safe harbor $29 for income $35,000-$49,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 40000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(29);
  });

  it("NJ-1040 use tax - safe harbor $48 for income $50,000-$74,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 60000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(48);
  });

  it("NJ-1040 use tax - safe harbor $68 for income $75,000-$99,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 85000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(68);
  });

  it("NJ-1040 use tax - safe harbor $103 for income $100,000-$149,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 125000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(103);
  });

  it("NJ-1040 use tax - safe harbor $137 for income $150,000-$199,999", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 175000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(137);
  });

  it("NJ-1040 use tax - safe harbor $166 for income $200,000 and over", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 200000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(166);
  });

  it("NJ-1040 use tax - safe harbor $166 for very high income", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 5000000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(166);
  });

  it("NJ-1040 use tax - safe harbor $0 for zero income", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 0,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(0);
  });

  // --- Boundary tests ---

  it("NJ-1040 use tax - boundary: $14,999 falls in under-$15K bracket", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 14999,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(0);
  });

  it("NJ-1040 use tax - boundary: exactly $25,000 falls in $25K-$35K bracket", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 25000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(17);
  });

  it("NJ-1040 use tax - boundary: exactly $100,000 falls in $100K-$150K bracket", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 100000,
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(103);
  });

  // --- Actual use tax amount ---

  it("NJ-1040 use tax - actual amount reported", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 75000,
      actualUseTax: 250,
    });
    expect(result.useTax.toNumber()).toBe(250);
    expect(result.usedSafeHarbor).toBe(false);
  });

  it("NJ-1040 use tax - actual amount floored at zero", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 50000,
      actualUseTax: -10,
    });
    expect(result.useTax.toNumber()).toBe(0);
  });

  it("NJ-1040 use tax - actual amount can exceed safe harbor", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 100000,
      actualUseTax: 500,
    });
    expect(result.useTax.toNumber()).toBe(500);
    // Safe harbor would be $103
    expect(result.useTax.greaterThan(103)).toBe(true);
  });

  // --- No use tax ---

  it("NJ-1040 use tax - $0 when neither safe harbor nor actual amount", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 75000,
    });
    expect(result.useTax.toNumber()).toBe(0);
    expect(result.usedSafeHarbor).toBe(false);
  });

  // --- Safe harbor takes priority when both provided ---

  it("NJ-1040 use tax - safe harbor election used when flagged", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 75000,
      useSafeHarbor: true,
      actualUseTax: 500,
    });
    // Safe harbor is elected — uses table, not actual
    expect(result.useTax.toNumber()).toBe(68);
    expect(result.usedSafeHarbor).toBe(true);
  });

  // --- Audit trail ---

  it("NJ-1040 use tax - produces audit trail", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: 50000,
      useSafeHarbor: true,
    });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines[0].form).toBe("NJ-1040");
    expect(result.lines[0].line).toBe("51");
  });

  // --- Decimal inputs ---

  it("NJ-1040 use tax - accepts Decimal input for gross income", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: new Decimal("87500.50"),
      useSafeHarbor: true,
    });
    expect(result.useTax.toNumber()).toBe(68);
  });

  it("NJ-1040 use tax - accepts string input for actual amount", () => {
    const result = calculateNJ1040UseTax({
      taxYear: 2025,
      njGrossIncome: "60000",
      actualUseTax: "123.45",
    });
    expect(result.useTax.toNumber()).toBe(123.45);
  });
});

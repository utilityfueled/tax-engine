/**
 * Tests for New Jersey NJ-1040 Child and Dependent Care Credit.
 * Spec: spec/state/nj-1040-dependent-care-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNJ1040DependentCareCredit,
  type NJ1040DependentCareCreditInput,
} from "@/engine/state/nj-1040-dependent-care-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 Child and Dependent Care Credit", () => {
  // --- Zero / no credit cases ---

  it("NJ-1040 dependent care credit - zero federal credit produces zero NJ credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 0,
      njTaxableIncome: 25000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 dependent care credit - zero months of residency produces zero NJ credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 1200,
      njTaxableIncome: 25000,
      monthsOfResidency: 0,
    });
    expect(result.njCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 dependent care credit - income over $150,000 produces zero credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 150001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0);
    expect(result.njCredit.toNumber()).toBe(0);
  });

  // --- Income bracket: ≤ $30,000 (50%) ---

  it("NJ-1040 dependent care credit - income at $0 gets 50% of federal credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 0,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.5);
    expect(result.njCredit.toNumber()).toBe(1000);
  });

  it("NJ-1040 dependent care credit - income at $30,000 boundary gets 50%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 30000,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.5);
    expect(result.njCredit.toNumber()).toBe(1000);
  });

  // --- Income bracket: $30,001–$60,000 (40%) ---

  it("NJ-1040 dependent care credit - income at $30,001 drops to 40%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 30001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.4);
    expect(result.njCredit.toNumber()).toBe(800);
  });

  it("NJ-1040 dependent care credit - income at $60,000 boundary gets 40%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 60000,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.4);
    expect(result.njCredit.toNumber()).toBe(800);
  });

  // --- Income bracket: $60,001–$90,000 (30%) ---

  it("NJ-1040 dependent care credit - income at $60,001 drops to 30%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 60001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.3);
    expect(result.njCredit.toNumber()).toBe(600);
  });

  it("NJ-1040 dependent care credit - income at $90,000 boundary gets 30%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 90000,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.3);
    expect(result.njCredit.toNumber()).toBe(600);
  });

  // --- Income bracket: $90,001–$120,000 (20%) ---

  it("NJ-1040 dependent care credit - income at $90,001 drops to 20%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 90001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.2);
    expect(result.njCredit.toNumber()).toBe(400);
  });

  it("NJ-1040 dependent care credit - income at $120,000 boundary gets 20%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 120000,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.2);
    expect(result.njCredit.toNumber()).toBe(400);
  });

  // --- Income bracket: $120,001–$150,000 (10%) ---

  it("NJ-1040 dependent care credit - income at $120,001 drops to 10%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 120001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.1);
    expect(result.njCredit.toNumber()).toBe(200);
  });

  it("NJ-1040 dependent care credit - income at $150,000 boundary still gets 10%", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 150000,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.1);
    expect(result.njCredit.toNumber()).toBe(200);
  });

  // --- Over $150,000 cutoff ---

  it("NJ-1040 dependent care credit - income at $150,001 gets zero credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 150001,
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0);
    expect(result.njCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 dependent care credit - very high income ($500K) gets zero credit", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 500000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(0);
  });

  // --- Different federal credit amounts ---

  it("NJ-1040 dependent care credit - small federal credit of $200", () => {
    // $200 × 50% = $100
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 200,
      njTaxableIncome: 20000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(100);
  });

  it("NJ-1040 dependent care credit - maximum federal credit of $2,100 (one qualifying person)", () => {
    // $2,100 × 50% = $1,050
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2100,
      njTaxableIncome: 25000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(1050);
  });

  it("NJ-1040 dependent care credit - large federal credit of $1,200 at 40% bracket", () => {
    // $1,200 × 40% = $480
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 1200,
      njTaxableIncome: 45000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(480);
  });

  // --- Part-year resident proration ---

  it("NJ-1040 dependent care credit - part-year resident with 6 months gets half credit", () => {
    // $2,000 × 50% = $1,000 × (6/12) = $500
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 6,
    });
    expect(result.njCredit.toNumber()).toBe(500);
  });

  it("NJ-1040 dependent care credit - part-year resident with 1 month gets 1/12 credit", () => {
    // $2,000 × 50% = $1,000 × (1/12) = $83.33 → rounds to $83
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 1,
    });
    expect(result.njCredit.toNumber()).toBe(83);
  });

  it("NJ-1040 dependent care credit - part-year resident with 9 months", () => {
    // $1,200 × 40% = $480 × (9/12) = $360
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 1200,
      njTaxableIncome: 45000,
      monthsOfResidency: 9,
    });
    expect(result.njCredit.toNumber()).toBe(360);
  });

  it("NJ-1040 dependent care credit - part-year resident with 7 months rounds correctly", () => {
    // $2,000 × 50% = $1,000 × (7/12) = $583.33 → rounds to $583
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 7,
    });
    expect(result.njCredit.toNumber()).toBe(583);
  });

  it("NJ-1040 dependent care credit - part-year resident with 11 months", () => {
    // $2,000 × 50% = $1,000 × (11/12) = $916.67 → rounds to $917
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 11,
    });
    expect(result.njCredit.toNumber()).toBe(917);
  });

  // --- Months boundary ---

  it("NJ-1040 dependent care credit - months clamped to maximum of 12", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 15,
    });
    // Should treat as 12 months
    expect(result.njCredit.toNumber()).toBe(1000);
  });

  // --- Rounding ---

  it("NJ-1040 dependent care credit - rounds to nearest dollar", () => {
    // $1,001 × 50% = $500.50 → rounds to $501
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 1001,
      njTaxableIncome: 25000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(501);
  });

  it("NJ-1040 dependent care credit - rounds down at $0.49", () => {
    // $1,003 × 30% = $300.90 → rounds to $301
    // Actually let's find a case that rounds down
    // $1,001 × 40% = $400.40 → rounds to $400
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 1001,
      njTaxableIncome: 45000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(400);
  });

  // --- Decimal input support ---

  it("NJ-1040 dependent care credit - accepts Decimal input", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: d(2000),
      njTaxableIncome: d(25000),
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(1000);
  });

  it("NJ-1040 dependent care credit - accepts string input", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: "2000",
      njTaxableIncome: "50000",
      monthsOfResidency: 12,
    });
    expect(result.njPercentage.toNumber()).toBe(0.4);
    expect(result.njCredit.toNumber()).toBe(800);
  });

  // --- Negative federal credit (edge case) ---

  it("NJ-1040 dependent care credit - negative federal credit floored at zero", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: -500,
      njTaxableIncome: 25000,
      monthsOfResidency: 12,
    });
    expect(result.njCredit.toNumber()).toBe(0);
  });

  // --- Audit trail ---

  it("NJ-1040 dependent care credit - audit trail records all computation steps", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 25000,
      monthsOfResidency: 12,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("64-federal-credit");
    expect(lineIds).toContain("64-nj-percentage");
    expect(lineIds).toContain("64");
  });

  // --- Result fields ---

  it("NJ-1040 dependent care credit - result includes all intermediate values", () => {
    const result = calculateNJ1040DependentCareCredit({
      taxYear: 2025,
      federalDependentCareCredit: 2000,
      njTaxableIncome: 45000,
      monthsOfResidency: 12,
    });
    expect(result.federalCredit.toNumber()).toBe(2000);
    expect(result.njTaxableIncome.toNumber()).toBe(45000);
    expect(result.njPercentage.toNumber()).toBe(0.4);
    expect(result.creditBeforeProration.toNumber()).toBe(800);
    expect(result.monthsOfResidency).toBe(12);
    expect(result.njCredit.toNumber()).toBe(800);
  });
});

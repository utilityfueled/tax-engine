/**
 * Edge case tests for Schedule 2 — Additional Taxes
 * Spec: spec/federal/schedule-2.yaml
 *
 * Focuses on:
 * - Household employment tax (Line 9) flow-through
 * - HSA additional tax + recapture tax combined (Lines 17c + 17d)
 * - All 9+ Part II tax types simultaneously
 * - Boundary precision with sub-dollar amounts across all lines
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule2, type Schedule2Input } from "@/engine/schedules/schedule-2.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides?: Partial<Schedule2Input>): Schedule2Input {
  return {
    selfEmploymentTax: d(0),
    additionalMedicareTax: d(0),
    niitTax: d(0),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Household Employment Tax (Line 9 — Schedule H)
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 Line 9 - household employment tax edge cases", () => {
  it("Schedule 2 Line 9 - household employment tax flows to Part II total", () => {
    const result = calculateSchedule2(makeInput({
      householdEmploymentTax: d(4200),
    }));
    expect(result.householdEmploymentTax.toNumber()).toBe(4200);
    expect(result.partIITotal.toNumber()).toBe(4200);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(4200);

    const line9 = result.lines.find((l) => l.line === "9");
    expect(line9).toBeDefined();
    expect(line9!.value.toNumber()).toBe(4200);
  });

  it("Schedule 2 Line 9 - household employment tax with SE tax keeps them separate in Part II", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),
      householdEmploymentTax: d(3800),
    }));
    expect(result.selfEmploymentTax.toNumber()).toBe(14130);
    expect(result.householdEmploymentTax.toNumber()).toBe(3800);
    // Both flow to Part II: 14130 + 3800 = 17930
    expect(result.partIITotal.toNumber()).toBe(17930);
  });

  it("Schedule 2 Line 9 - household employment tax does not affect Part I", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(5000),
      householdEmploymentTax: d(2500),
    }));
    expect(result.partITotal.toNumber()).toBe(5000);
    expect(result.partIITotal.toNumber()).toBe(2500);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(7500);
  });

  it("Schedule 2 Line 9 - household employment tax with fractional cents", () => {
    // Schedule H can produce non-round amounts from the FUTA calculation
    const result = calculateSchedule2(makeInput({
      householdEmploymentTax: d("1847.63"),
    }));
    expect(result.householdEmploymentTax.toString()).toBe("1847.63");
    expect(result.partIITotal.toString()).toBe("1847.63");
  });
});

// ═══════════════════════════════════════════════════════════
// HSA Taxes Combined (Lines 17c + 17d)
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 Lines 17c + 17d - HSA taxes combined", () => {
  it("Schedule 2 - HSA additional tax and recapture tax both present in Part II", () => {
    const result = calculateSchedule2(makeInput({
      hsaAdditionalTax: d(800),    // 20% on $4000 non-qualified distribution
      hsaRecaptureTax: d(350),     // 10% on $3500 testing-period failure
    }));
    expect(result.hsaAdditionalTax.toNumber()).toBe(800);
    expect(result.hsaRecaptureTax.toNumber()).toBe(350);
    expect(result.partIITotal.toNumber()).toBe(1150);
  });

  it("Schedule 2 - HSA taxes combined with SE tax and Medicare", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(900),
      hsaAdditionalTax: d(400),
      hsaRecaptureTax: d(200),
    }));
    // 10000 + 900 + 400 + 200 = 11500
    expect(result.partIITotal.toNumber()).toBe(11500);
  });

  it("Schedule 2 - HSA additional tax only, no recapture", () => {
    const result = calculateSchedule2(makeInput({
      hsaAdditionalTax: d(1200),
    }));
    expect(result.hsaAdditionalTax.toNumber()).toBe(1200);
    expect(result.hsaRecaptureTax.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(1200);
  });

  it("Schedule 2 - HSA recapture tax only, no additional tax", () => {
    const result = calculateSchedule2(makeInput({
      hsaRecaptureTax: d(550),
    }));
    expect(result.hsaAdditionalTax.toNumber()).toBe(0);
    expect(result.hsaRecaptureTax.toNumber()).toBe(550);
    expect(result.partIITotal.toNumber()).toBe(550);
  });
});

// ═══════════════════════════════════════════════════════════
// All Part II Tax Types Simultaneously
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - every Part II tax type populated", () => {
  it("Schedule 2 Line 18 - all nine Part II inputs produce correct total", () => {
    // Every Part II input line populated: SE, unreported SS, Form 8919,
    // penalty tax, household employment, additional Medicare, NIIT,
    // uncollected SS, HSA additional, HSA recapture
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),       // Line 4
      unreportedSSTax: d(800),           // Line 5
      form8919Tax: d(650),               // Line 6
      penaltyTax: d(1000),              // Line 8
      householdEmploymentTax: d(3200),   // Line 9
      additionalMedicareTax: d(900),     // Line 11
      niitTax: d(3800),                  // Line 12
      uncollectedSSTax: d(450),          // Line 13
      hsaAdditionalTax: d(160),          // Line 17c
      hsaRecaptureTax: d(270),           // Line 17d
    }));
    // Line 7 = 800 + 650 = 1450
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7!.value.toNumber()).toBe(1450);
    // Line 18 = 14130 + 1450 + 1000 + 3200 + 900 + 3800 + 450 + 160 + 270 = 25360
    expect(result.partIITotal.toNumber()).toBe(25360);
  });

  it("Schedule 2 Line 21 - grand total with all Part I, Part II, and penalty", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(8000),
      excessAPTCRepayment: d(1500),
      selfEmploymentTax: d(14130),
      unreportedSSTax: d(800),
      form8919Tax: d(650),
      penaltyTax: d(1000),
      householdEmploymentTax: d(3200),
      additionalMedicareTax: d(900),
      niitTax: d(3800),
      uncollectedSSTax: d(450),
      hsaAdditionalTax: d(160),
      hsaRecaptureTax: d(270),
      estimatedTaxPenalty: d(500),
    }));
    // Part I: 8000 + 1500 = 9500
    expect(result.partITotal.toNumber()).toBe(9500);
    // Part II: 14130 + 1450 + 1000 + 3200 + 900 + 3800 + 450 + 160 + 270 = 25360
    expect(result.partIITotal.toNumber()).toBe(25360);
    // Line 21: 9500 + 25360 + 500 = 35360
    expect(result.totalAdditionalTaxes.toNumber()).toBe(35360);
  });
});

// ═══════════════════════════════════════════════════════════
// Household Employment Tax + Other Optional Lines
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - household employment tax interactions", () => {
  it("Schedule 2 - household employment tax with AMT and estimated penalty spans all three sections", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(6000),
      householdEmploymentTax: d(5500),
      estimatedTaxPenalty: d(300),
    }));
    expect(result.partITotal.toNumber()).toBe(6000);
    expect(result.partIITotal.toNumber()).toBe(5500);
    // 6000 + 5500 + 300 = 11800
    expect(result.totalAdditionalTaxes.toNumber()).toBe(11800);
  });

  it("Schedule 2 - household employment tax with unreported SS tax and penalty tax", () => {
    const result = calculateSchedule2(makeInput({
      unreportedSSTax: d(1200),
      householdEmploymentTax: d(2800),
      penaltyTax: d(750),
    }));
    // 1200 + 2800 + 750 = 4750
    expect(result.partIITotal.toNumber()).toBe(4750);
  });
});

// ═══════════════════════════════════════════════════════════
// Precision Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - precision with all optional fields at sub-dollar amounts", () => {
  it("Schedule 2 - all optional fields at $0.01 produce exact sum", () => {
    const result = calculateSchedule2(makeInput({
      amt: d("0.01"),
      excessAPTCRepayment: d("0.01"),
      selfEmploymentTax: d("0.01"),
      additionalMedicareTax: d("0.01"),
      niitTax: d("0.01"),
      unreportedSSTax: d("0.01"),
      form8919Tax: d("0.01"),
      uncollectedSSTax: d("0.01"),
      penaltyTax: d("0.01"),
      hsaAdditionalTax: d("0.01"),
      hsaRecaptureTax: d("0.01"),
      householdEmploymentTax: d("0.01"),
      estimatedTaxPenalty: d("0.01"),
    }));
    // Part I: 0.01 + 0.01 = 0.02
    expect(result.partITotal.toNumber()).toBe(0.02);
    // Part II: 10 lines × 0.01 = 0.10
    // SE(0.01) + line7(0.02) + penalty(0.01) + household(0.01) + medicare(0.01) + niit(0.01) + uncollected(0.01) + hsa(0.01) + hsaRecapture(0.01) = 0.10
    expect(result.partIITotal.toNumber()).toBe(0.10);
    // Total: 0.02 + 0.10 + 0.01 = 0.13
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0.13);
  });
});

// ═══════════════════════════════════════════════════════════
// Part I Isolation
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 Part I - AMT and excess APTC in isolation", () => {
  it("Schedule 2 Line 1 - AMT only with no Part II taxes", () => {
    const result = calculateSchedule2(makeInput({ amt: d(12500) }));
    expect(result.amt.toNumber()).toBe(12500);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
    expect(result.partITotal.toNumber()).toBe(12500);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(12500);
  });

  it("Schedule 2 Line 2 - excess APTC repayment only with no other taxes", () => {
    const result = calculateSchedule2(makeInput({ excessAPTCRepayment: d(3200) }));
    expect(result.amt.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(3200);
    expect(result.partITotal.toNumber()).toBe(3200);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(3200);
  });

  it("Schedule 2 Line 3 - AMT and excess APTC combine in Part I", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(8000),
      excessAPTCRepayment: d(2750),
    }));
    expect(result.partITotal.toNumber()).toBe(10750);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(10750);
  });
});

// ═══════════════════════════════════════════════════════════
// Estimated Tax Penalty Isolation
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 Line 19 - estimated tax penalty in isolation", () => {
  it("Schedule 2 Line 19 - estimated tax penalty alone does not affect Part I or Part II", () => {
    const result = calculateSchedule2(makeInput({ estimatedTaxPenalty: d(450) }));
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    // Penalty is separate from both Part I and Part II
    expect(result.totalAdditionalTaxes.toNumber()).toBe(450);
  });

  it("Schedule 2 Line 19 - estimated tax penalty with Part I only", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(5000),
      estimatedTaxPenalty: d(200),
    }));
    expect(result.partITotal.toNumber()).toBe(5000);
    expect(result.partIITotal.toNumber()).toBe(0);
    // 5000 + 0 + 200 = 5200
    expect(result.totalAdditionalTaxes.toNumber()).toBe(5200);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 7 Subtotal (Form 4137 + Form 8919) in Isolation
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 Line 7 - unreported SS and Form 8919 subtotal", () => {
  it("Schedule 2 Line 7 - Form 4137 and Form 8919 combine in line 7 subtotal", () => {
    const result = calculateSchedule2(makeInput({
      unreportedSSTax: d(1200),
      form8919Tax: d(800),
    }));
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7!.value.toNumber()).toBe(2000);
    expect(result.partIITotal.toNumber()).toBe(2000);
  });

  it("Schedule 2 Line 7 - Form 4137 only, Form 8919 defaults to zero", () => {
    const result = calculateSchedule2(makeInput({
      unreportedSSTax: d(500),
    }));
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7!.value.toNumber()).toBe(500);
    expect(result.unreportedSSTax.toNumber()).toBe(500);
    expect(result.form8919Tax.toNumber()).toBe(0);
  });

  it("Schedule 2 Line 7 - Form 8919 only, Form 4137 defaults to zero", () => {
    const result = calculateSchedule2(makeInput({
      form8919Tax: d(750),
    }));
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7!.value.toNumber()).toBe(750);
    expect(result.unreportedSSTax.toNumber()).toBe(0);
    expect(result.form8919Tax.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// All-Zero Input
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - all-zero inputs", () => {
  it("Schedule 2 - default input with only required zeros produces all-zero totals", () => {
    const result = calculateSchedule2(makeInput());
    expect(result.amt.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.selfEmploymentTax.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Common Tax Combinations
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - common tax combinations", () => {
  it("Schedule 2 - SE tax + NIIT only (common self-employed high-income scenario)", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(21068),
      niitTax: d(3800),
    }));
    expect(result.partIITotal.toNumber()).toBe(24868);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(24868);
  });

  it("Schedule 2 - SE tax + additional Medicare only (common W-2 + side business)", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(900),
    }));
    expect(result.partIITotal.toNumber()).toBe(15030);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(15030);
  });

  it("Schedule 2 - AMT + SE tax + NIIT + additional Medicare (high-income self-employed)", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(25000),
      selfEmploymentTax: d(21068),
      additionalMedicareTax: d(4500),
      niitTax: d(12000),
    }));
    expect(result.partITotal.toNumber()).toBe(25000);
    expect(result.partIITotal.toNumber()).toBe(37568);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(62568);
  });
});

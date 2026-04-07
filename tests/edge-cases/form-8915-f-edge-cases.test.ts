/**
 * Edge case tests for Form 8915-F — Qualified Disaster Distributions
 * Spec: spec/federal/form-8915-f.yaml
 *
 * Tests boundary conditions for:
 * - $22,000 per-disaster cap (IRC §72(t)(2)(J))
 * - 3-year income spread rounding (1/3 with roundDollar)
 * - Repayment caps and zero-net scenarios
 * - IRA vs pension source proration at boundary fractions
 * - Prior-year spread year-2/year-3 transitions
 * - Carryforward generation and exhaustion
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8915F } from "@/engine/forms/form-8915-f.js";
import type { Form8915FInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════════════
// $22,000 per-disaster cap boundary
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F $22,000 per-disaster cap boundaries", () => {
  it("Line 1 - $21,999 distribution passes through uncapped", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "21999",
      }],
      priorYearDeferrals: [],
    });
    expect(result.line1).toEqual(d("21999"));
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("21999"));
  });

  it("Line 1 - $22,000 distribution exactly at cap passes through", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "22000",
      }],
      priorYearDeferrals: [],
    });
    expect(result.line1).toEqual(d("22000"));
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("22000"));
  });

  it("Line 1 - $22,001 distribution capped at $22,000", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "22001",
      }],
      priorYearDeferrals: [],
    });
    expect(result.line1).toEqual(d("22000"));
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("22000"));
  });

  it("Line 1 - two disasters each independently capped at $22,000", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Alpha",
          disasterDate: "2025-03-01",
          grossDistribution: "30000",
        },
        {
          disasterName: "2025 Hurricane Beta",
          disasterDate: "2025-08-01",
          grossDistribution: "25000",
        },
      ],
      priorYearDeferrals: [],
    });
    // Each disaster capped independently: 22000 + 22000 = 44000
    expect(result.line1).toEqual(d("44000"));
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("22000"));
    expect(result.currentYearDetail[1].qualifiedAmount).toEqual(d("22000"));
  });

  it("Line 1 - one disaster at cap, one under cap", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Alpha",
          disasterDate: "2025-03-01",
          grossDistribution: "22000",
        },
        {
          disasterName: "2025 Hurricane Beta",
          disasterDate: "2025-08-01",
          grossDistribution: "10000",
        },
      ],
      priorYearDeferrals: [],
    });
    expect(result.line1).toEqual(d("32000"));
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("22000"));
    expect(result.currentYearDetail[1].qualifiedAmount).toEqual(d("10000"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3-year income spread rounding boundaries
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F 3-year spread rounding edge cases", () => {
  it("Line 4 - $3 net distribution divides evenly into $1 per year", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-05-01",
        grossDistribution: "3",
      }],
      priorYearDeferrals: [],
    });
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("1"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("2"));
    expect(result.currentYearDetail[0].annualSpreadAmount).toEqual(d("1"));
  });

  it("Line 4 - $4 net distribution: 1/3 rounds to $1, deferred $3", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-05-01",
        grossDistribution: "4",
      }],
      priorYearDeferrals: [],
    });
    // $4/3 = $1.333... rounds to $1
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("1"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("3"));
  });

  it("Line 4 - $5 net distribution: 1/3 rounds to $2, deferred $3", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-05-01",
        grossDistribution: "5",
      }],
      priorYearDeferrals: [],
    });
    // $5/3 = $1.666... rounds to $2
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("2"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("3"));
  });

  it("Line 4 - $10 net distribution: 1/3 rounds to $3, deferred $7", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-05-01",
        grossDistribution: "10",
      }],
      priorYearDeferrals: [],
    });
    // $10/3 = $3.333... rounds to $3
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("3"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("7"));
  });

  it("Line 4 - $22,000 spread: $7,333 per year with $7,334 in year 3", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Disaster",
        disasterDate: "2025-01-15",
        grossDistribution: "22000",
      }],
      priorYearDeferrals: [],
    });
    // $22,000/3 = $7,333.333... rounds to $7,333
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("7333"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("14667"));
    // Year 3 should get the remaining $14667 - $7333 = $7334
  });

  it("Line 4 - full inclusion election includes entire net in year 1", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Disaster",
        disasterDate: "2025-01-15",
        grossDistribution: "22000",
        electFullInclusion: true,
      }],
      priorYearDeferrals: [],
    });
    expect(result.currentYearDetail[0].currentYearIncludable).toEqual(d("22000"));
    expect(result.currentYearDetail[0].deferredToFutureYears).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Repayment boundary conditions
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F repayment boundary conditions", () => {
  it("Line 2 - repayment exactly equals qualified amount zeroes net", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "15000",
        currentYearRepayments: "15000",
      }],
      priorYearDeferrals: [],
    });
    expect(result.currentYearDetail[0].repayments).toEqual(d("15000"));
    expect(result.currentYearDetail[0].netAfterRepayments).toEqual(d("0"));
    expect(result.line4).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
  });

  it("Line 2 - repayment exceeding qualified amount capped at qualified amount", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "15000",
        currentYearRepayments: "20000",
      }],
      priorYearDeferrals: [],
    });
    // Repayment capped at 15000 (the qualified amount)
    expect(result.currentYearDetail[0].repayments).toEqual(d("15000"));
    expect(result.currentYearDetail[0].netAfterRepayments).toEqual(d("0"));
  });

  it("Line 2 - repayment of $1 leaves $21,999 net on a $22,000 cap distribution", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "30000",
        currentYearRepayments: "1",
      }],
      priorYearDeferrals: [],
    });
    // Distribution capped at $22,000, repayment $1
    expect(result.currentYearDetail[0].qualifiedAmount).toEqual(d("22000"));
    expect(result.currentYearDetail[0].repayments).toEqual(d("1"));
    expect(result.currentYearDetail[0].netAfterRepayments).toEqual(d("21999"));
  });

  it("Line 2 - full repayment with 3-year spread produces zero income and no carryforward", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Flood",
        disasterDate: "2025-03-01",
        grossDistribution: "22000",
        currentYearRepayments: "22000",
      }],
      priorYearDeferrals: [],
    });
    expect(result.line3).toEqual(d("0"));
    expect(result.line4).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
    expect(result.carryforwardDeferrals.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// IRA vs pension source proration boundaries
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F IRA/pension source proration boundaries", () => {
  it("Line 7 - 100% IRA source: all includable flows to IRA line", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-06-01",
        grossDistribution: "12000",
        iraDistribution: "12000",
        electFullInclusion: true,
      }],
      priorYearDeferrals: [],
    });
    expect(result.line7).toEqual(d("12000"));
    expect(result.line8).toEqual(d("0"));
  });

  it("Line 7 - 0% IRA source: all includable flows to pension line", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-06-01",
        grossDistribution: "12000",
        iraDistribution: "0",
        electFullInclusion: true,
      }],
      priorYearDeferrals: [],
    });
    expect(result.line7).toEqual(d("0"));
    expect(result.line8).toEqual(d("12000"));
  });

  it("Line 7 - 50% IRA source: includable split evenly", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-06-01",
        grossDistribution: "10000",
        iraDistribution: "5000",
        electFullInclusion: true,
      }],
      priorYearDeferrals: [],
    });
    expect(result.line7).toEqual(d("5000"));
    expect(result.line8).toEqual(d("5000"));
  });

  it("Line 7 - IRA proration with 3-year spread rounds to nearest dollar", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-06-01",
        grossDistribution: "10000",
        iraDistribution: "3333",
      }],
      priorYearDeferrals: [],
    });
    // Net = 10000, 1/3 = 3333 (rounded). IRA fraction = 3333/10000 = 0.3333
    // IRA portion of includable = roundDollar(3333 * 0.3333) = roundDollar(1110.9889) = 1111
    const detail = result.currentYearDetail[0];
    expect(detail.currentYearIncludable).toEqual(d("3333"));
    expect(detail.iraPortionOfIncludable).toEqual(d("1111"));
    expect(detail.pensionPortionOfIncludable).toEqual(d("2222"));
  });

  it("Line 7 - zero gross distribution produces zero IRA fraction without division error", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-06-01",
        grossDistribution: "0",
        iraDistribution: "0",
      }],
      priorYearDeferrals: [],
    });
    expect(result.line7).toEqual(d("0"));
    expect(result.line8).toEqual(d("0"));
    expect(result.currentYearDetail[0].iraFraction).toEqual(d("0"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Prior-year deferral spread year transitions
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F prior-year deferral spread year transitions", () => {
  it("Line 5 - year-2 spread includes the annual spread amount from remaining balance", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0.5",
      }],
    });
    expect(result.line5).toEqual(d("7333"));
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("7333"));
  });

  it("Line 5 - year-3 spread includes entire remaining balance (may differ from annual amount)", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2023 Hurricane",
        distributionYear: 2023,
        spreadYear: 3,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "7334",
        iraFraction: "1",
      }],
    });
    // Year 3 includes the full remaining balance, not just the annual spread amount
    expect(result.line5).toEqual(d("7334"));
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("7334"));
  });

  it("Line 5 - year-2 repayment reduces includable amount", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Storm",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0",
        currentYearRepayments: "3000",
      }],
    });
    // Includable = max(0, annualSpread - repayments) = max(0, 7333 - 3000) = 4333
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("4333"));
    expect(result.priorYearDetail[0].repayments).toEqual(d("3000"));
  });

  it("Line 5 - year-2 repayment exceeding annual spread but not remaining balance is capped at remaining", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Storm",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0",
        currentYearRepayments: "20000",
      }],
    });
    // Repayment capped at remainingDeferredBalance (14667)
    expect(result.priorYearDetail[0].repayments).toEqual(d("14667"));
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("0"));
  });

  it("Line 5 - year-3 repayment exactly equals remaining balance produces zero income", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2023 Fire",
        distributionYear: 2023,
        spreadYear: 3,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "7334",
        iraFraction: "0.5",
        currentYearRepayments: "7334",
      }],
    });
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("0"));
    expect(result.line5).toEqual(d("0"));
  });

  it("Carryforward: year-2 deferral generates year-3 carryforward when balance remains after inclusion", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0.4",
      }],
    });
    // After year 2 inclusion of 7333, remaining = 14667 - 7333 = 7334
    expect(result.carryforwardDeferrals.length).toBe(1);
    expect(result.carryforwardDeferrals[0].spreadYear).toBe(3);
    expect(result.carryforwardDeferrals[0].remainingDeferredBalance).toBe("7334");
  });

  it("Carryforward: year-2 deferral with repayment reducing balance to zero generates no year-3 carryforward", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0.4",
        currentYearRepayments: "14667",
      }],
    });
    // Repayment = 14667 = full remaining balance, so nothing left
    expect(result.carryforwardDeferrals.length).toBe(0);
  });

  it("Carryforward: year-3 deferral never generates further carryforward", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2023 Flood",
        distributionYear: 2023,
        spreadYear: 3,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "7334",
        iraFraction: "1",
      }],
    });
    expect(result.carryforwardDeferrals.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Combined current + prior year scenarios
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F combined current and prior year edge cases", () => {
  it("Line 6 - current year spread + prior year spread sum correctly", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Earthquake",
        disasterDate: "2025-02-01",
        grossDistribution: "21000",
      }],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7000",
        remainingDeferredBalance: "14000",
        iraFraction: "0.3",
      }],
    });
    // Current: 21000/3 = 7000
    // Prior: 7000
    // Total: 14000
    expect(result.line4).toEqual(d("7000"));
    expect(result.line5).toEqual(d("7000"));
    expect(result.line6).toEqual(d("14000"));
  });

  it("Line 9 - penalty exception covers both current and prior year qualified amounts", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-07-01",
        grossDistribution: "22000",
      }],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "14667",
        iraFraction: "0",
      }],
    });
    // Penalty exception = current year qualified (22000) + prior year remaining (14667)
    expect(result.line9).toEqual(d("36667"));
  });

  it("Line 7/8 - mixed IRA sources across current and prior year distributions", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [{
        disasterName: "2025 Storm",
        disasterDate: "2025-07-01",
        grossDistribution: "12000",
        iraDistribution: "12000", // 100% IRA
        electFullInclusion: true,
      }],
      priorYearDeferrals: [{
        disasterName: "2024 Flood",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "6000",
        remainingDeferredBalance: "12000",
        iraFraction: "0", // 0% IRA (all pension)
      }],
    });
    // Current: 12000 all IRA
    // Prior: 6000 all pension
    expect(result.line7).toEqual(d("12000"));
    expect(result.line8).toEqual(d("6000"));
    expect(result.line6).toEqual(d("18000"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Empty and zero edge cases
// ═══════════════════════════════════════════════════════════════════

describe("Form 8915-F zero and empty edge cases", () => {
  it("No distributions and no deferrals produces all zeros", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [],
    });
    expect(result.line1).toEqual(d("0"));
    expect(result.line4).toEqual(d("0"));
    expect(result.line5).toEqual(d("0"));
    expect(result.line6).toEqual(d("0"));
    expect(result.line7).toEqual(d("0"));
    expect(result.line8).toEqual(d("0"));
    expect(result.line9).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
    expect(result.carryforwardDeferrals.length).toBe(0);
  });

  it("Prior year deferral with zero remaining balance produces zero income", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Storm",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "0",
        iraFraction: "0.5",
      }],
    });
    expect(result.line5).toEqual(d("0"));
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("0"));
  });

  it("Year-2 remaining balance less than annual spread includes only remaining balance", () => {
    const result = calculateForm8915F({
      currentYearDistributions: [],
      priorYearDeferrals: [{
        disasterName: "2024 Storm",
        distributionYear: 2024,
        spreadYear: 2,
        annualSpreadAmount: "7333",
        remainingDeferredBalance: "5000",
        iraFraction: "0",
      }],
    });
    // min(annualSpread=7333, remaining=5000) = 5000
    expect(result.priorYearDetail[0].includableThisYear).toEqual(d("5000"));
  });
});

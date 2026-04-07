/**
 * Form 8915-F tests — Qualified Disaster Retirement Plan Distributions and Repayments
 * Spec: spec/federal/form-8915-f.yaml
 *
 * IRC §72(t)(2)(J) as made permanent by Secure 2.0 Act §331.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8915F } from "@/engine/forms/form-8915-f.js";
import type { Form8915FInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

describe("Form 8915-F Qualified Disaster Distributions", () => {

  // ═══════════════════════════════════════════════════════════════════
  // Line-by-line coverage: current-year distributions
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F Line 1 - current-year distributions capped at $22,000 per disaster", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Alpha",
          disasterDate: "2025-08-15",
          grossDistribution: "30000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line1).toEqual(d("22000"));
  });

  it("Form 8915-F Line 1 - distribution under cap passes through in full", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Wildfire Beta",
          disasterDate: "2025-06-01",
          grossDistribution: "15000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line1).toEqual(d("15000"));
  });

  it("Form 8915-F Line 2 - repayments reduce current-year includable amount", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Gamma",
          disasterDate: "2025-03-10",
          grossDistribution: "22000",
          currentYearRepayments: "5000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line2).toEqual(d("5000"));
    expect(result.line3).toEqual(d("17000"));
  });

  it("Form 8915-F Line 2 - repayment capped at qualified amount per disaster", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Earthquake Delta",
          disasterDate: "2025-01-05",
          grossDistribution: "10000",
          currentYearRepayments: "15000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line2).toEqual(d("10000"));
    expect(result.line3).toEqual(d("0"));
  });

  it("Form 8915-F Line 3 - net distributions equal gross minus repayments", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Tornado Epsilon",
          disasterDate: "2025-04-20",
          grossDistribution: "22000",
          currentYearRepayments: "8000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line3).toEqual(d("14000"));
  });

  it("Form 8915-F Line 4 - 3-year spread includes one-third in current year", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Zeta",
          disasterDate: "2025-09-01",
          grossDistribution: "21000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // 21000 / 3 = 7000 exactly
    expect(result.line4).toEqual(d("7000"));
  });

  it("Form 8915-F Line 4 - 3-year spread rounds to nearest dollar", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Eta",
          disasterDate: "2025-07-15",
          grossDistribution: "22000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // 22000 / 3 = 7333.333... → rounds to 7333
    expect(result.line4).toEqual(d("7333"));
  });

  it("Form 8915-F Line 4 - full inclusion election includes entire net amount", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Wildfire Theta",
          disasterDate: "2025-05-22",
          grossDistribution: "18000",
          electFullInclusion: true,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line4).toEqual(d("18000"));
    expect(result.line10).toEqual(d("0"));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Prior-year deferred amounts
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F Line 5 - prior-year deferred amounts flow into current-year income", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2024 Hurricane Iota",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "7000",
          remainingDeferredBalance: "14000",
        },
      ],
    };
    const result = calculateForm8915F(input);
    expect(result.line5).toEqual(d("7000"));
    expect(result.line6).toEqual(d("7000"));
  });

  it("Form 8915-F - third year of spread includes remaining deferred balance", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2023 Wildfire Kappa",
          distributionYear: 2023,
          spreadYear: 3,
          annualSpreadAmount: "7333",
          remainingDeferredBalance: "7334",
          // 22000 - 7333 - 7333 = 7334 (rounding remainder in final year)
        },
      ],
    };
    const result = calculateForm8915F(input);
    // In the final year, the entire remaining balance is included
    expect(result.line5).toEqual(d("7334"));
  });

  it("Form 8915-F - fully repaid prior-year distribution includes zero", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2024 Flood Lambda",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "5000",
          remainingDeferredBalance: "10000",
          currentYearRepayments: "10000",
        },
      ],
    };
    const result = calculateForm8915F(input);
    expect(result.line5).toEqual(d("0"));
  });

  it("Form 8915-F - prior-year repayment reduces includable but not below zero", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2024 Tornado Mu",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "7000",
          remainingDeferredBalance: "14000",
          currentYearRepayments: "4000",
        },
      ],
    };
    const result = calculateForm8915F(input);
    // min(7000, 14000) = 7000, minus 4000 repayment = 3000
    expect(result.line5).toEqual(d("3000"));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Total includable and IRA/pension proration
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F Line 6 - total includable combines current and prior year amounts", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Nu",
          disasterDate: "2025-08-01",
          grossDistribution: "12000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [
        {
          disasterName: "2024 Flood Xi",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "5000",
          remainingDeferredBalance: "10000",
        },
      ],
    };
    const result = calculateForm8915F(input);
    // Current year: 12000 / 3 = 4000
    // Prior year: 5000
    expect(result.line4).toEqual(d("4000"));
    expect(result.line5).toEqual(d("5000"));
    expect(result.line6).toEqual(d("9000"));
  });

  it("Form 8915-F Line 7 - IRA portion prorated from source mix", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Wildfire Omicron",
          disasterDate: "2025-06-15",
          grossDistribution: "21000",
          iraDistribution: "14000", // 2/3 from IRA
          electFullInclusion: true,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // IRA fraction = 14000/21000 = 2/3
    // Line 6 = 21000 (full inclusion)
    // Line 7 = round(21000 * 2/3) = 14000
    expect(result.line6).toEqual(d("21000"));
    expect(result.line7).toEqual(d("14000"));
    expect(result.line8).toEqual(d("7000"));
  });

  it("Form 8915-F Line 8 - pension portion is remainder after IRA portion", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Earthquake Pi",
          disasterDate: "2025-02-10",
          grossDistribution: "15000",
          iraDistribution: "0", // All non-IRA
          electFullInclusion: true,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line7).toEqual(d("0"));
    expect(result.line8).toEqual(d("15000"));
  });

  it("Form 8915-F - mixed IRA and non-IRA sources are tracked and prorated", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Rho",
          disasterDate: "2025-07-01",
          grossDistribution: "20000",
          iraDistribution: "8000", // 40% IRA
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // Net = 20000, spread = 20000/3 = 6667
    // IRA portion = round(6667 * 0.4) = 2667
    // Pension portion = 6667 - 2667 = 4000
    expect(result.line4).toEqual(d("6667"));
    expect(result.line7).toEqual(d("2667"));
    expect(result.line8).toEqual(d("4000"));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Penalty exception
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F Line 9 - full distribution amount is exempt from early penalty", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Sigma",
          disasterDate: "2025-04-01",
          grossDistribution: "22000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // Even though only 1/3 is included in income, the full $22K is exempt from penalty
    expect(result.line9).toEqual(d("22000"));
  });

  it("Form 8915-F Line 9 - penalty exception includes prior-year deferred amounts", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Tornado Tau",
          disasterDate: "2025-05-15",
          grossDistribution: "10000",
        },
      ],
      priorYearDeferrals: [
        {
          disasterName: "2024 Wildfire Upsilon",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "7000",
          remainingDeferredBalance: "14000",
        },
      ],
    };
    const result = calculateForm8915F(input);
    // Current year: 10000, prior year remaining: 14000
    expect(result.line9).toEqual(d("24000"));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Deferred amounts and carryforward
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F Line 10 - deferred amount equals 2/3 of net distribution for 3-year spread", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Phi",
          disasterDate: "2025-09-10",
          grossDistribution: "21000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // 21000 / 3 = 7000 included, 14000 deferred
    expect(result.line10).toEqual(d("14000"));
  });

  it("Form 8915-F - carryforward records generated for 3-year spread elections", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Chi",
          disasterDate: "2025-03-20",
          grossDistribution: "22000",
          iraDistribution: "11000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.carryforwardDeferrals).toHaveLength(1);
    expect(result.carryforwardDeferrals[0].disasterName).toBe("2025 Flood Chi");
    expect(result.carryforwardDeferrals[0].spreadYear).toBe(2);
    expect(result.carryforwardDeferrals[0].annualSpreadAmount).toBe("7333");
    // 22000 - 7333 = 14667
    expect(result.carryforwardDeferrals[0].remainingDeferredBalance).toBe("14667");
    expect(result.carryforwardDeferrals[0].iraFraction).toBe("0.5");
  });

  it("Form 8915-F - year-2 prior deferral generates year-3 carryforward when balance remains", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2024 Wildfire Psi",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "7333",
          remainingDeferredBalance: "14667",
          iraFraction: "0.5",
        },
      ],
    };
    const result = calculateForm8915F(input);
    expect(result.line5).toEqual(d("7333"));
    expect(result.carryforwardDeferrals).toHaveLength(1);
    expect(result.carryforwardDeferrals[0].spreadYear).toBe(3);
    // 14667 - 7333 = 7334
    expect(result.carryforwardDeferrals[0].remainingDeferredBalance).toBe("7334");
  });

  it("Form 8915-F - no carryforward generated for full-inclusion elections", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Earthquake Omega",
          disasterDate: "2025-01-15",
          grossDistribution: "15000",
          electFullInclusion: true,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.carryforwardDeferrals).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Multiple disasters
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F - multiple disasters each get independent $22,000 cap", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Hurricane Alpha",
          disasterDate: "2025-06-01",
          grossDistribution: "22000",
          electFullInclusion: false,
        },
        {
          disasterName: "2025 Wildfire Beta",
          disasterDate: "2025-08-15",
          grossDistribution: "22000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // Two disasters × $22,000 cap = $44,000 total qualified
    expect(result.line1).toEqual(d("44000"));
    // Each 22000/3 = 7333, total = 14666
    expect(result.line4).toEqual(d("14666"));
  });

  it("Form 8915-F - per-disaster election allows mixed spread and full inclusion", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood A",
          disasterDate: "2025-03-01",
          grossDistribution: "15000",
          electFullInclusion: true,
        },
        {
          disasterName: "2025 Tornado B",
          disasterDate: "2025-07-20",
          grossDistribution: "18000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // Disaster A: full inclusion = 15000
    // Disaster B: 18000/3 = 6000
    expect(result.line4).toEqual(d("21000"));
    expect(result.line10).toEqual(d("12000")); // Only from disaster B
    expect(result.carryforwardDeferrals).toHaveLength(1);
    expect(result.carryforwardDeferrals[0].disasterName).toBe("2025 Tornado B");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F - zero distribution produces zero across all lines", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line1).toEqual(d("0"));
    expect(result.line6).toEqual(d("0"));
    expect(result.line9).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
  });

  it("Form 8915-F - repayment of full distribution with 3-year spread results in zero income", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Flood Repaid",
          disasterDate: "2025-02-01",
          grossDistribution: "22000",
          currentYearRepayments: "22000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line3).toEqual(d("0"));
    expect(result.line4).toEqual(d("0"));
    expect(result.line10).toEqual(d("0"));
    expect(result.carryforwardDeferrals).toHaveLength(0);
  });

  it("Form 8915-F - exact $22,000 distribution evenly divisible by 3 produces no rounding remainder", () => {
    // Not evenly divisible: 22000/3 = 7333.33
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Rounding Test",
          disasterDate: "2025-01-01",
          grossDistribution: "22000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line4).toEqual(d("7333"));
    // Deferred: 22000 - 7333 = 14667
    expect(result.line10).toEqual(d("14667"));
  });

  it("Form 8915-F - distribution exactly divisible by 3 produces clean spread", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Clean Spread",
          disasterDate: "2025-01-01",
          grossDistribution: "21000",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.line4).toEqual(d("7000"));
    expect(result.line10).toEqual(d("14000"));
  });

  it("Form 8915-F - prior-year IRA fraction prorates prior-year includable amount", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [],
      priorYearDeferrals: [
        {
          disasterName: "2024 IRA Mix",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "6000",
          remainingDeferredBalance: "12000",
          iraFraction: "0.75",
        },
      ],
    };
    const result = calculateForm8915F(input);
    expect(result.line5).toEqual(d("6000"));
    // IRA portion = round(6000 * 0.75) = 4500
    expect(result.line7).toEqual(d("4500"));
    expect(result.line8).toEqual(d("1500"));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Realistic scenario
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F - realistic multi-year scenario with mixed disasters and partial repayment", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 LA Wildfires",
          disasterDate: "2025-01-07",
          grossDistribution: "22000",
          iraDistribution: "22000", // All from IRA
          electFullInclusion: false,
          currentYearRepayments: "3000",
        },
      ],
      priorYearDeferrals: [
        {
          disasterName: "2024 Hurricane Helene",
          distributionYear: 2024,
          spreadYear: 2,
          annualSpreadAmount: "7333",
          remainingDeferredBalance: "14667",
          iraFraction: "0",
          currentYearRepayments: "2000",
        },
        {
          disasterName: "2023 Maui Wildfires",
          distributionYear: 2023,
          spreadYear: 3,
          annualSpreadAmount: "7333",
          remainingDeferredBalance: "7334",
          iraFraction: "1",
        },
      ],
    };
    const result = calculateForm8915F(input);

    // Current year: 22000 cap, 3000 repaid, net = 19000, spread = 19000/3 = 6333
    expect(result.line1).toEqual(d("22000"));
    expect(result.line2).toEqual(d("3000"));
    expect(result.line3).toEqual(d("19000"));
    expect(result.line4).toEqual(d("6333"));

    // Prior year:
    // Hurricane Helene (year 2): min(7333, 14667) = 7333, minus 2000 = 5333
    // Maui Wildfires (year 3): remaining 7334, no repayments = 7334
    expect(result.line5).toEqual(d("12667"));

    // Total: 6333 + 12667 = 19000
    expect(result.line6).toEqual(d("19000"));

    // IRA portions:
    // LA Wildfires: 100% IRA → 6333
    // Hurricane Helene: 0% IRA → 0
    // Maui Wildfires: 100% IRA → 7334
    expect(result.line7).toEqual(d("13667"));
    expect(result.line8).toEqual(d("5333"));

    // Penalty exception: 22000 (current) + 14667 + 7334 (prior) = 44001
    expect(result.line9).toEqual(d("44001"));

    // Deferred: 19000 - 6333 = 12667
    expect(result.line10).toEqual(d("12667"));

    // Carryforwards: LA Wildfires year-2, Hurricane Helene year-3
    expect(result.carryforwardDeferrals).toHaveLength(2);
    expect(result.carryforwardDeferrals[0].disasterName).toBe("2025 LA Wildfires");
    expect(result.carryforwardDeferrals[0].spreadYear).toBe(2);
    expect(result.carryforwardDeferrals[1].disasterName).toBe("2024 Hurricane Helene");
    expect(result.carryforwardDeferrals[1].spreadYear).toBe(3);
  });

  it("Form 8915-F - audit trail records lines for all computed amounts", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Audit Test",
          disasterDate: "2025-01-01",
          grossDistribution: "15000",
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    expect(result.lines.length).toBeGreaterThanOrEqual(10);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("6");
    expect(lineNumbers).toContain("9");
    expect(lineNumbers).toContain("10");
  });

  // ═══════════════════════════════════════════════════════════════════
  // Small-dollar rounding edge case
  // ═══════════════════════════════════════════════════════════════════

  it("Form 8915-F - one dollar distribution produces correct 3-year spread", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Minimum",
          disasterDate: "2025-01-01",
          grossDistribution: "1",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // 1 / 3 = 0.333... → rounds to 0
    expect(result.line4).toEqual(d("0"));
    // Deferred: 1 - 0 = 1
    expect(result.line10).toEqual(d("1"));
  });

  it("Form 8915-F - two dollar distribution with 3-year spread", () => {
    const input: Form8915FInput = {
      currentYearDistributions: [
        {
          disasterName: "2025 Two Dollar",
          disasterDate: "2025-01-01",
          grossDistribution: "2",
          electFullInclusion: false,
        },
      ],
      priorYearDeferrals: [],
    };
    const result = calculateForm8915F(input);
    // 2 / 3 = 0.666... → rounds to 1
    expect(result.line4).toEqual(d("1"));
    // Deferred: 2 - 1 = 1
    expect(result.line10).toEqual(d("1"));
  });
});

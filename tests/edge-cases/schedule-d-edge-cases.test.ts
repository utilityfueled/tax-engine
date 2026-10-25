/**
 * Edge case tests for Schedule D — Capital Gains and Losses
 * Tests carryforward allocation, loss deduction limits, MFS half-limits,
 * and interactions between ST/LT gains and losses.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";
const c = getConstants(2025);

function makeTx(holdingPeriod: "short" | "long", proceeds: string, costBasis: string) {
  return {
    description: "Test",
    dateAcquired: "2020-01-01",
    dateSold: "2025-06-01",
    proceeds,
    costBasis,
    adjustments: "0",
    basisReportedToIRS: true,
    holdingPeriod,
    washSale: false,
    washSaleDisallowed: "0",
  };
}

function makeFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099B: [],
    form1099Div: [],
    scheduleK1: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Capital Loss Deduction Limits
// ═══════════════════════════════════════════════════════════

describe("Schedule D - loss deduction limit", () => {
  it("net loss of exactly $3,000: full deduction", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "7000", "10000")] }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-3000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.abs().toNumber()).toBe(0);
  });

  it("net loss of $10,000: deduction capped at $3,000, rest carries forward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "5000", "15000")] }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-10000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(-7000);
  });

  it("MFS: loss capped at $1,500", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "5000", "10000")] }],
    }), "married_filing_separately", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-5000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    expect(result.carryforwardShortTerm.toNumber()).toBe(-3500);
  });

  it("net gain passes through fully (no cap)", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "50000", "10000")] }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(40000);
    expect(result.capitalLossDeduction.toNumber()).toBe(40000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward Allocation (ST vs LT)
// ═══════════════════════════════════════════════════════════

describe("Schedule D - carryforward allocation", () => {
  it("short-term loss used first in carryforward allocation", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "2000", "8000"),  // ST: -$6K
          makeTx("long", "3000", "8000"),   // LT: -$5K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-6000);
    expect(result.netLongTerm.toNumber()).toBe(-5000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST used first: $3K from ST
    expect(result.carryforwardShortTerm.toNumber()).toBe(-3000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-5000);
  });

  it("small ST loss fully used, remainder from LT", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "9000", "10000"),  // ST: -$1K
          makeTx("long", "2000", "12000"),   // LT: -$10K
        ],
      }],
    }), "single", c);
    // Net: -$11K, Deduction: -$3K
    // ST $1K fully used, LT $2K used → LT carry -$8K
    expect(result.carryforwardShortTerm.abs().toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-8000);
  });

  it("only long-term loss: all carryforward is LT", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "0", "20000")] }],
    }), "single", c);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-17000);
  });

  it("ST loss offset by LT gain: no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "2000", "7000"),   // ST: -$5K
          makeTx("long", "20000", "10000"),  // LT: +$10K
        ],
      }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior Year Carryforward Input
// ═══════════════════════════════════════════════════════════

describe("Schedule D - prior year carryforward", () => {
  it("prior year ST loss carryforward adds to current ST", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "8000", "5000")] }],
      priorYear: { shortTermCapitalLoss: "-5000" },
    }), "single", c);
    // ST gain $3K + prior ST loss -$5K = -$2K
    expect(result.netShortTerm.toNumber()).toBe(-2000);
  });

  it("prior year LT loss carryforward adds to current LT", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "15000", "10000")] }],
      priorYear: { longTermCapitalLoss: "-8000" },
    }), "single", c);
    // LT gain $5K + prior LT loss -$8K = -$3K
    expect(result.netLongTerm.toNumber()).toBe(-3000);
  });

  it("both carryforwards with current gains", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "10000", "8000"),  // ST: +$2K
          makeTx("long", "10000", "7000"),   // LT: +$3K
        ],
      }],
      priorYear: {
        shortTermCapitalLoss: "-1000",
        longTermCapitalLoss: "-2000",
      },
    }), "single", c);
    // ST: $2K + (-$1K) = $1K, LT: $3K + (-$2K) = $1K
    expect(result.netShortTerm.toNumber()).toBe(1000);
    expect(result.netLongTerm.toNumber()).toBe(1000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Edge Scenarios
// ═══════════════════════════════════════════════════════════

describe("Schedule D - zero and edge scenarios", () => {
  it("no capital transactions: all zeros", () => {
    const result = calculateScheduleD(makeFixture({}), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
  });

  it("exactly zero net capital gain/loss: no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "10000", "5000"),  // ST: +$5K
          makeTx("long", "5000", "10000"),   // LT: -$5K
        ],
      }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("loss of exactly $1: full deduction, no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "999", "1000")] }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-1);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1);
    expect(result.carryforwardShortTerm.abs().toNumber()).toBe(0);
  });

  it("MFS loss of exactly $1,500: no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "8500", "10000")] }],
    }), "married_filing_separately", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    expect(result.carryforwardLongTerm.abs().toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// New Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule D - only short-term gains, no long-term", () => {
  it("ST-only gains land in netShortTerm; netLongTerm is zero", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "15000", "10000"),  // ST: +$5K
          makeTx("short", "8000", "6000"),    // ST: +$2K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(7000);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(7000);
    expect(result.capitalLossDeduction.toNumber()).toBe(7000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("ST-only loss is fully categorized as short-term carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "2000", "7000"),  // ST: -$5K
          makeTx("short", "1000", "3000"),  // ST: -$2K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-7000);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-7000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // All carryforward is ST, LT carryforward is zero
    expect(result.carryforwardShortTerm.toNumber()).toBe(-4000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Schedule D - capital gain distributions from 1099-DIV (Line 13)", () => {
  it("1099-DIV capital gain distributions flow into netLongTerm (Line 15)", () => {
    // Box 2a on 1099-DIV is capital gain distributions — added to LT on Schedule D Line 13
    const result = calculateScheduleD(makeFixture({
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "1000",
        qualifiedDividends: "800",
        totalCapitalGainDistributions: "4500",  // Box 2a → Schedule D Line 13
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    }), "single", c);
    // No 1099-B or K-1 transactions, so LT is purely from distributions
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(4500);
    expect(result.netCapitalGainLoss.toNumber()).toBe(4500);
    expect(result.capitalLossDeduction.toNumber()).toBe(4500);
  });

  it("1099-DIV distributions from multiple payers aggregate correctly", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [
        {
          payer: "Fidelity",
          ordinaryDividends: "500",
          qualifiedDividends: "400",
          totalCapitalGainDistributions: "2000",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          foreignCountry: "",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
        {
          payer: "Schwab",
          ordinaryDividends: "300",
          qualifiedDividends: "200",
          totalCapitalGainDistributions: "1500",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          foreignCountry: "",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
      ],
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(3500);
    expect(result.netCapitalGainLoss.toNumber()).toBe(3500);
  });
});

describe("Schedule D - net gain exactly $0", () => {
  it("gains perfectly offset losses: zero net, zero deduction, zero carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "20000", "12000"),  // ST: +$8K
          makeTx("long", "5000", "10000"),    // LT: -$5K
          makeTx("long", "7000", "10000"),    // LT: -$3K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(8000);
    expect(result.netLongTerm.toNumber()).toBe(-8000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Schedule D - very large gains ($5M+)", () => {
  it("$5M long-term gain passes through without overflow or precision loss", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "6000000", "1000000")] }],
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(5000000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000000);
    expect(result.capitalLossDeduction.toNumber()).toBe(5000000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("$8M gain with $500K loss: net $7.5M, no precision loss", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("long", "8000000", "0"),     // LT: +$8M
          makeTx("short", "0", "500000"),     // ST: -$500K
        ],
      }],
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(8000000);
    expect(result.netShortTerm.toNumber()).toBe(-500000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(7500000);
    // Net is positive — full gain flows through
    expect(result.capitalLossDeduction.toNumber()).toBe(7500000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Schedule D - MFS $1,500 loss limit vs single $3,000", () => {
  it("same $4,000 loss: single deducts $3K, MFS deducts $1.5K", () => {
    const fixture = makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "6000", "10000")] }],
    });
    const singleResult = calculateScheduleD(fixture, "single", c);
    const mfsResult = calculateScheduleD(fixture, "married_filing_separately", c);

    expect(singleResult.netCapitalGainLoss.toNumber()).toBe(-4000);
    expect(singleResult.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(singleResult.carryforwardLongTerm.toNumber()).toBe(-1000);

    expect(mfsResult.netCapitalGainLoss.toNumber()).toBe(-4000);
    expect(mfsResult.capitalLossDeduction.toNumber()).toBe(-1500);
    expect(mfsResult.carryforwardLongTerm.toNumber()).toBe(-2500);
  });
});

describe("Schedule D - prior year carryforward applied against current gains", () => {
  it("large prior year LT carryforward reduces current LT gain to zero net", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "20000", "10000")] }],
      priorYear: { longTermCapitalLoss: "-10000" },
    }), "single", c);
    // LT gain $10K + prior LT loss -$10K = $0 net LT
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("prior year carryforward exceeding current gain produces deductible net loss", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "15000", "10000")] }],
      priorYear: { longTermCapitalLoss: "-12000" },
    }), "single", c);
    // LT gain $5K + prior LT loss -$12K = -$7K net LT
    expect(result.netLongTerm.toNumber()).toBe(-7000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-7000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-4000);
  });
});

describe("Schedule D - QDCG worksheet trigger", () => {
  it("positive net long-term gain signals QDCG worksheet is needed", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "30000", "10000")] }],
    }), "single", c);
    // QDCG worksheet applies when net LT capital gain is positive
    expect(result.netLongTerm.greaterThan(0)).toBe(true);
    expect(result.netCapitalGainLoss.greaterThan(0)).toBe(true);
  });

  it("no net long-term gain means QDCG worksheet is NOT needed", () => {
    // Only short-term gains — no preferential rate applies
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "20000", "10000")] }],
    }), "single", c);
    expect(result.netLongTerm.greaterThan(0)).toBe(false);
    expect(result.netShortTerm.toNumber()).toBe(10000);
  });

  it("ST loss wiping out LT gain: no positive net LT, QDCG worksheet not triggered", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "0", "15000"),    // ST: -$15K
          makeTx("long", "20000", "10000"), // LT: +$10K
        ],
      }],
    }), "single", c);
    // Net is -$5K overall; even though LT is +$10K individually, net gain is negative
    expect(result.netLongTerm.toNumber()).toBe(10000);
    expect(result.netShortTerm.toNumber()).toBe(-15000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-5000);
    // Net is negative, so no QDCG worksheet needed (no net gain to tax preferentially)
    expect(result.netCapitalGainLoss.greaterThan(0)).toBe(false);
  });
});

describe("Schedule D - additional edge cases", () => {
  it("zero gains and zero losses produces all-zero results", () => {
    const result = calculateScheduleD(makeFixture({ form1099B: [] }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
  });

  it("very large capital gain ($5M) flows through correctly", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Goldman",
        transactions: [makeTx("long", "5100000", "100000")],
      }],
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(5000000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000000);
  });

  it("HoH uses $3K capital loss limit (same as single)", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Test",
        transactions: [makeTx("long", "1000", "10000")],
      }],
    }), "head_of_household", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("QSS uses $3K capital loss limit (same as MFJ)", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Test",
        transactions: [makeTx("long", "1000", "10000")],
      }],
    }), "qualifying_surviving_spouse", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("ST loss fully offsets LT gain — net zero", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Test",
        transactions: [
          makeTx("short", "5000", "10000"), // -5000 ST
          makeTx("long", "15000", "10000"),  // +5000 LT
        ],
      }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
  });

  it("1099-DIV capital gain distributions add to LT gain", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4000",
        totalCapitalGainDistributions: "3000",
        foreignTaxPaid: "0",
        foreignCountry: "",
        exemptInterestDividends: "0",
        section1202Gain: "0",
        section1250Gain: "0",
        collectiblesGain: "0",
        federalWithheld: "0",
        nondividendDistributions: "0",
      }],
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 1202 QSBS Exclusion
// ═══════════════════════════════════════════════════════════

function makeDiv1202(section1202Gain: string) {
  return {
    payer: "Startup Inc",
    ordinaryDividends: "0",
    qualifiedDividends: "0",
    totalCapitalGainDistributions: "0",
    federalWithheld: "0",
    foreignTaxPaid: "0",
    foreignCountry: "",
    section1250Gain: "0",
    section1202Gain,
    collectiblesGain: "0",
    nondividendDistributions: "0",
    exemptInterestDividends: "0",
  };
}

function makeK1(overrides: Record<string, unknown>) {
  return {
    partnershipName: "Test Fund LP",
    partnershipEIN: "99-1234567",
    ordinaryIncome: "0",
    guaranteedPayments: "0",
    netShortTermCapitalGain: "0",
    netLongTermCapitalGain: "0",
    interestIncome: "0",
    ordinaryDividends: "0",
    qualifiedDividends: "0",
    selfEmploymentEarnings: "0",
    isPassiveActivity: false,
    netRentalIncome: "0",
    otherNetRentalIncome: "0",
    royalties: "0",
    section1231Gain: "0",
    otherIncome: "0",
    section179Deduction: "0",
    otherDeductions: "0",
    ...overrides,
  };
}

describe("Schedule D - Section 1202 QSBS exclusion", () => {
  it("$10M cap: $8M QSBS gain excluded in full for single filer", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [makeDiv1202("8000000")],
    }), "single", c);
    // $8M < $10M cap → full exclusion
    expect(result.section1202Exclusion.toNumber()).toBe(8000000);
    // Exclusion subtracts from LT: 0 cap gain dist - 8M exclusion = -8M
    // But the gain reported via 1202 is also in the LT pipeline
    // Net LT = capGainDist(0) + 1099-B LT(0) + K-1 LT(0) + prior(0) - exclusion(8M) = -8M
    expect(result.netLongTerm.toNumber()).toBe(-8000000);
  });

  it("$10M cap: $12M QSBS gain capped at $10M exclusion for single filer", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [makeDiv1202("12000000")],
    }), "single", c);
    expect(result.section1202Exclusion.toNumber()).toBe(10000000);
  });

  it("MFS $5M cap: $7M QSBS gain capped at $5M for married_filing_separately", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [makeDiv1202("7000000")],
    }), "married_filing_separately", c);
    expect(result.section1202Exclusion.toNumber()).toBe(5000000);
  });

  it("MFS $5M cap: $3M QSBS gain fully excluded (under cap)", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [makeDiv1202("3000000")],
    }), "married_filing_separately", c);
    expect(result.section1202Exclusion.toNumber()).toBe(3000000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Capital Gains Flowing to Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - K-1 capital gains flow-through", () => {
  it("K-1 short-term gain flows into netShortTerm (Box 8)", () => {
    const result = calculateScheduleD(makeFixture({
      scheduleK1: [makeK1({ netShortTermCapitalGain: "4500" })],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(4500);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(4500);
  });

  it("K-1 long-term gain flows into netLongTerm (Box 9a)", () => {
    const result = calculateScheduleD(makeFixture({
      scheduleK1: [makeK1({ netLongTermCapitalGain: "12000" })],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(12000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(12000);
  });

  it("multiple K-1s: ST and LT gains aggregate correctly", () => {
    const result = calculateScheduleD(makeFixture({
      scheduleK1: [
        makeK1({ partnershipName: "Fund A", netShortTermCapitalGain: "2000", netLongTermCapitalGain: "5000" }),
        makeK1({ partnershipName: "Fund B", netShortTermCapitalGain: "1500", netLongTermCapitalGain: "3000" }),
      ],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(3500);
    expect(result.netLongTerm.toNumber()).toBe(8000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(11500);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined 1099-B + K-1 + 1099-DIV Capital Gains
// ═══════════════════════════════════════════════════════════

describe("Schedule D - combined 1099-B + K-1 + 1099-DIV", () => {
  it("all three sources aggregate into correct ST/LT buckets", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Schwab",
        transactions: [
          makeTx("short", "20000", "15000"), // ST: +$5K
          makeTx("long", "30000", "20000"),  // LT: +$10K
        ],
      }],
      scheduleK1: [makeK1({ netShortTermCapitalGain: "2000", netLongTermCapitalGain: "3000" })],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "1000",
        qualifiedDividends: "800",
        totalCapitalGainDistributions: "4000",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    }), "single", c);
    // ST: 1099-B(+5K) + K-1(+2K) = +$7K
    expect(result.netShortTerm.toNumber()).toBe(7000);
    // LT: 1099-B(+10K) + K-1(+3K) + 1099-DIV(+4K) = +$17K
    expect(result.netLongTerm.toNumber()).toBe(17000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(24000);
    expect(result.capitalLossDeduction.toNumber()).toBe(24000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("1099-B loss partially offset by K-1 + 1099-DIV gains", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "5000", "15000"),  // ST: -$10K
          makeTx("long", "10000", "25000"),  // LT: -$15K
        ],
      }],
      scheduleK1: [makeK1({ netShortTermCapitalGain: "3000", netLongTermCapitalGain: "6000" })],
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "500",
        qualifiedDividends: "400",
        totalCapitalGainDistributions: "2000",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    }), "single", c);
    // ST: -10K + 3K(K-1) = -$7K
    expect(result.netShortTerm.toNumber()).toBe(-7000);
    // LT: -15K + 6K(K-1) + 2K(DIV) = -$7K
    expect(result.netLongTerm.toNumber()).toBe(-7000);
    // Net: -$14K, deduction capped at -$3K
    expect(result.netCapitalGainLoss.toNumber()).toBe(-14000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // Carryforward: ST loss -7K, used 3K from ST → carry -4K ST; LT -7K all carries
    expect(result.carryforwardShortTerm.toNumber()).toBe(-4000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net ST Gain + Net LT Gain (Both Positive)
// ═══════════════════════════════════════════════════════════

describe("Schedule D - net ST gain and net LT gain (both positive)", () => {
  it("net ST gain plus net LT gain: no deduction cap, no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "15000", "10000"), // ST: +$5K
          makeTx("long", "30000", "20000"),  // LT: +$10K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(5000);
    expect(result.netLongTerm.toNumber()).toBe(10000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(15000);
    // Positive net: full gain flows through, no capping
    expect(result.capitalLossDeduction.toNumber()).toBe(15000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("small ST gain plus large LT gain: total passes through without loss mechanics", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Schwab",
        transactions: [
          makeTx("short", "1200", "1000"),   // ST: +$200
          makeTx("long", "500000", "100000"), // LT: +$400K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(200);
    expect(result.netLongTerm.toNumber()).toBe(400000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(400200);
    expect(result.capitalLossDeduction.toNumber()).toBe(400200);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Net ST Loss + Net LT Gain Where LT Exceeds ST Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule D - net ST loss offset by larger net LT gain", () => {
  it("ST loss of $4K offset by LT gain of $9K: net +$5K, no deduction cap, no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "6000", "10000"),  // ST: -$4K
          makeTx("long", "25000", "16000"),  // LT: +$9K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-4000);
    expect(result.netLongTerm.toNumber()).toBe(9000);
    // Net is +$5K: positive, so no loss deduction cap applies
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000);
    expect(result.capitalLossDeduction.toNumber()).toBe(5000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("ST loss of $2K offset by LT gain of $2,001: net +$1, no carryforward", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Test",
        transactions: [
          makeTx("short", "8000", "10000"),    // ST: -$2K
          makeTx("long", "12001", "10000"),    // LT: +$2,001
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-2000);
    expect(result.netLongTerm.toNumber()).toBe(2001);
    expect(result.netCapitalGainLoss.toNumber()).toBe(1);
    // Net is positive — full amount flows through
    expect(result.capitalLossDeduction.toNumber()).toBe(1);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Net ST Gain + Net LT Loss Where LT Loss Exceeds $3K
// ═══════════════════════════════════════════════════════════

describe("Schedule D - net ST gain with large net LT loss", () => {
  it("ST gain $2K + LT loss $8K: net -$6K, deduction -$3K, only LT carryforward", () => {
    // Because the net is negative and ST is positive, the entire net loss originates
    // from LT. Carryforward allocation: ST is positive (no ST loss to allocate from),
    // so all $3K deduction comes from LT, and LT carries the remainder.
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "12000", "10000"),  // ST: +$2K
          makeTx("long", "2000", "10000"),    // LT: -$8K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(2000);
    expect(result.netLongTerm.toNumber()).toBe(-8000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-6000);
    // $3K deduction cap applied
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST is positive — no ST carryforward
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    // The $2K ST gain offsets part of the LT loss first, leaving $3K LT to carry.
    expect(result.carryforwardLongTerm.toNumber()).toBe(-3000);
  });

  it("ST gain $500 + LT loss $5K: net -$4.5K, deduction -$3K, LT carries -$3K (not ST)", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Test",
        transactions: [
          makeTx("short", "10500", "10000"),  // ST: +$500
          makeTx("long", "0", "5000"),        // LT: -$5K
        ],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(500);
    expect(result.netLongTerm.toNumber()).toBe(-5000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-4500);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST is positive, so no ST carryforward; LT carries remaining loss
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    // The $500 ST gain offsets part of the LT loss first, leaving $1.5K LT to carry.
    expect(result.carryforwardLongTerm.toNumber()).toBe(-1500);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior Year Carryforward with Current Year Gains and Losses
// ═══════════════════════════════════════════════════════════

describe("Schedule D - prior year carryforward combined with current year activity", () => {
  it("prior ST carryforward converts current-year ST gain into small ST loss", () => {
    // Current ST gain $3K absorbed by prior ST loss $5K → net ST -$2K
    // No current LT activity, so net overall is -$2K → full deduction
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("short", "13000", "10000")] }],
      priorYear: { shortTermCapitalLoss: "-5000" },
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-2000);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-2000);
    // -$2K is within the $3K cap: full deduction, no carryforward
    expect(result.capitalLossDeduction.toNumber()).toBe(-2000);
    expect(result.carryforwardShortTerm.abs().toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.abs().toNumber()).toBe(0);
  });

  it("prior LT carryforward partially offsets current LT gain, leaving positive net LT", () => {
    // Current LT gain $20K, prior LT loss $8K → net LT +$12K
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Fidelity", transactions: [makeTx("long", "30000", "10000")] }],
      priorYear: { longTermCapitalLoss: "-8000" },
    }), "single", c);
    expect(result.netLongTerm.toNumber()).toBe(12000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(12000);
    expect(result.capitalLossDeduction.toNumber()).toBe(12000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("prior ST and LT carryforwards both contribute to a new current-year net loss with new carryforward", () => {
    // Current: ST +$1K, LT +$1K
    // Prior: ST -$6K, LT -$8K
    // Net ST: 1K - 6K = -5K; Net LT: 1K - 8K = -7K; Total: -12K
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "11000", "10000"),  // ST: +$1K
          makeTx("long", "11000", "10000"),   // LT: +$1K
        ],
      }],
      priorYear: {
        shortTermCapitalLoss: "-6000",
        longTermCapitalLoss: "-8000",
      },
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-5000);
    expect(result.netLongTerm.toNumber()).toBe(-7000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-12000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST used first: $3K from ST -5K → carry -2K; LT -7K all carries
    expect(result.carryforwardShortTerm.toNumber()).toBe(-2000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Qualified Dividends NOT Flowing to Schedule D
// ═══════════════════════════════════════════════════════════

describe("Schedule D - qualified dividends do NOT flow into Schedule D", () => {
  it("1099-DIV with only ordinary and qualified dividends produces zero Schedule D activity", () => {
    // Qualified dividends affect only the QDCG worksheet — not Schedule D lines
    const result = calculateScheduleD(makeFixture({
      form1099Div: [{
        payer: "Vanguard",
        ordinaryDividends: "5000",
        qualifiedDividends: "4200",        // Box 1b — QDCG worksheet only, NOT Sched D
        totalCapitalGainDistributions: "0", // Box 2a — zero means nothing flows to Sched D
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    }), "single", c);
    // Schedule D should see nothing from qualified dividends
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
  });

  it("mixing qualified dividends with cap gain distributions: only Box 2a flows to Schedule D", () => {
    const result = calculateScheduleD(makeFixture({
      form1099Div: [{
        payer: "Schwab",
        ordinaryDividends: "8000",
        qualifiedDividends: "6000",         // Box 1b — does NOT affect Schedule D
        totalCapitalGainDistributions: "2500", // Box 2a — this does flow to Schedule D Line 13
        federalWithheld: "0",
        foreignTaxPaid: "0",
        foreignCountry: "",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    }), "single", c);
    // Only Box 2a ($2,500) flows to Schedule D LT; qualified dividends do not
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(2500);
    expect(result.netCapitalGainLoss.toNumber()).toBe(2500);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Portfolio with Many Transactions
// ═══════════════════════════════════════════════════════════

describe("Schedule D - very large portfolio with many transactions", () => {
  it("50 short-term and 50 long-term transactions aggregate to correct net totals", () => {
    // 50 ST transactions each: proceeds $1,100, basis $1,000 → +$100 each → ST total: +$5,000
    // 50 LT transactions each: proceeds $900, basis $1,000 → -$100 each → LT total: -$5,000
    const stTxns = Array.from({ length: 50 }, () => makeTx("short", "1100", "1000"));
    const ltTxns = Array.from({ length: 50 }, () => makeTx("long", "900", "1000"));
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [...stTxns, ...ltTxns],
      }],
    }), "single", c);
    expect(result.netShortTerm.toNumber()).toBe(5000);
    expect(result.netLongTerm.toNumber()).toBe(-5000);
    // Net ST +5K cancels net LT -5K → zero net
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("100 mixed transactions across multiple brokers aggregate without precision loss", () => {
    // Each broker has 10 ST transactions gaining $333.33 each = $3,333.30 per broker
    // 3 brokers: total ST gain = $9,999.90
    const brokerTxns = Array.from({ length: 10 }, () => makeTx("short", "1333.33", "1000"));
    const result = calculateScheduleD(makeFixture({
      form1099B: [
        { broker: "Fidelity", transactions: brokerTxns },
        { broker: "Schwab", transactions: brokerTxns },
        { broker: "Vanguard", transactions: brokerTxns },
      ],
    }), "single", c);
    // 30 transactions × $333.33 = $9,999.90
    expect(result.netShortTerm.toNumber()).toBe(9999.90);
    expect(result.netCapitalGainLoss.toNumber()).toBe(9999.90);
    // Positive net — no carryforward
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule D Line 16 Equals Net Capital Gain/Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Line 16 equals Line 7 plus Line 15", () => {
  it("Line 16 (netCapitalGainLoss) equals the sum of netShortTerm and netLongTerm", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "18000", "10000"),  // ST: +$8K
          makeTx("long", "5000", "12000"),    // LT: -$7K
        ],
      }],
    }), "single", c);
    // Line 16 must always equal Line 7 + Line 15
    expect(result.netCapitalGainLoss.toNumber())
      .toBe(result.netShortTerm.plus(result.netLongTerm).toNumber());
    expect(result.netCapitalGainLoss.toNumber()).toBe(1000);
  });

  it("Line 16 equals Line 7 + Line 15 when both are negative", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Schwab",
        transactions: [
          makeTx("short", "4000", "6000"),  // ST: -$2K
          makeTx("long", "3000", "7000"),   // LT: -$4K
        ],
      }],
    }), "single", c);
    expect(result.netCapitalGainLoss.toNumber())
      .toBe(result.netShortTerm.plus(result.netLongTerm).toNumber());
    expect(result.netCapitalGainLoss.toNumber()).toBe(-6000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail for All Schedule D Lines
// ═══════════════════════════════════════════════════════════

describe("Schedule D - audit trail records all key lines", () => {
  it("audit trail includes entries for Lines 7, 13, 15, 16, and 21", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "12000", "10000"),  // ST: +$2K
          makeTx("long", "8000", "10000"),    // LT: -$2K
        ],
      }],
    }), "single", c);

    const lineNumbers = result.lines.map((l) => l.line);

    // All five key Schedule D lines must appear in the audit trail
    expect(lineNumbers).toContain("7");   // Net short-term
    expect(lineNumbers).toContain("13");  // Section 1202 exclusion
    expect(lineNumbers).toContain("15");  // Net long-term
    expect(lineNumbers).toContain("16");  // Net capital gain/loss
    expect(lineNumbers).toContain("21");  // Capital loss deduction
  });

  it("audit trail Line 7 value matches netShortTerm result", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{ broker: "Test", transactions: [makeTx("short", "15000", "10000")] }],
    }), "single", c);

    const line7 = result.lines.find((l) => l.line === "7" && l.form === "Sched D");
    expect(line7).toBeDefined();
    expect(line7!.value.toNumber()).toBe(result.netShortTerm.toNumber());
  });

  it("audit trail Line 16 value matches netCapitalGainLoss result", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Goldman",
        transactions: [
          makeTx("short", "5000", "8000"),   // ST: -$3K
          makeTx("long", "20000", "10000"),  // LT: +$10K
        ],
      }],
    }), "single", c);

    const line16 = result.lines.find((l) => l.line === "16" && l.form === "Sched D");
    expect(line16).toBeDefined();
    expect(line16!.value.toNumber()).toBe(result.netCapitalGainLoss.toNumber());
  });

  it("audit trail inputs show source subtotals and resulting carryforward character", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "11000", "10000"), // ST: +$1K
          makeTx("long", "12000", "10000"),  // LT: +$2K
        ],
      }],
      form1099Div: [{
        payer: "Growth Fund",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "300",
        section1250Gain: "0",
        section1202Gain: "200",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Venture Fund",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "0",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        guaranteedPayments: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        royalties: "0",
        netShortTermCapitalGain: "500",
        netLongTermCapitalGain: "250",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
      }],
      priorYear: {
        capitalLossCarryforward: "0",
        shortTermCapitalLoss: "0",
        longTermCapitalLoss: "-7000",
        suspendedPassiveLosses: [],
        foreignTaxCreditCarryforward: "0",
        charitableCarryforward: "0",
      },
    }), "single", c);

    const line7 = result.lines.find((l) => l.line === "7" && l.form === "Sched D");
    const line13 = result.lines.find((l) => l.line === "13" && l.form === "Sched D");
    const qsbsAdjustment = result.lines.find((l) => l.line === "1202-adjustment" && l.form === "Sched D");
    const line15 = result.lines.find((l) => l.line === "15" && l.form === "Sched D");
    const line16 = result.lines.find((l) => l.line === "16" && l.form === "Sched D");
    const line21 = result.lines.find((l) => l.line === "21" && l.form === "Sched D");
    const carryforwardST = result.lines.find((l) => l.line === "carryforward-short-term" && l.form === "Sched D");
    const carryforwardLT = result.lines.find((l) => l.line === "carryforward-long-term" && l.form === "Sched D");

    expect(line7).toBeDefined();
    expect((line7!.inputs["Form 8949 Part I"] as Decimal).toNumber()).toBe(1000);
    expect((line7!.inputs["K-1 Box 8"] as Decimal).toNumber()).toBe(500);
    expect((line7!.inputs["Prior year ST carryforward"] as Decimal).toNumber()).toBe(0);

    expect(line13).toBeDefined();
    expect(line13?.value.toFixed()).toBe("300");
    expect((line13?.inputs["1099-DIV Box 2a"] as Decimal).toFixed()).toBe("300");
    expect((qsbsAdjustment?.inputs["1099-DIV Box 2c eligible gain"] as Decimal).toFixed()).toBe("200");

    expect(line15).toBeDefined();
    expect((line15!.inputs["Form 8949 Part II"] as Decimal).toNumber()).toBe(2000);
    expect((line15!.inputs["K-1 Box 9a"] as Decimal).toNumber()).toBe(250);
    expect((line15!.inputs["1099-DIV Box 2a"] as Decimal).toNumber()).toBe(300);
    expect((line15!.inputs["Prior year LT carryforward"] as Decimal).toNumber()).toBe(-7000);
    expect((line15!.inputs["Section 1202 exclusion"] as Decimal).toNumber()).toBe(200);

    expect(line16).toBeDefined();
    expect((line16!.inputs["Line 7"] as Decimal).toNumber()).toBe(1500);
    expect((line16!.inputs["Line 15"] as Decimal).toNumber()).toBe(-4650);

    expect(line21).toBeDefined();
    expect((line21!.inputs["Line 16"] as Decimal).toNumber()).toBe(-3150);
    expect((line21!.inputs["Annual loss limit"] as Decimal).toNumber()).toBe(3000);

    expect(carryforwardST).toBeDefined();
    expect(carryforwardST!.value.toNumber()).toBe(0);
    expect(carryforwardLT).toBeDefined();
    expect(carryforwardLT!.value.toNumber()).toBe(-150);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward Allocation with Both ST and LT from Prior Year
// ═══════════════════════════════════════════════════════════

describe("Schedule D - carryforward with both ST and LT from prior year", () => {
  it("both prior ST and LT carryforwards reduce current gains, net still positive", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "20000", "10000"), // ST: +$10K
          makeTx("long", "25000", "10000"),  // LT: +$15K
        ],
      }],
      priorYear: {
        shortTermCapitalLoss: "-4000",
        longTermCapitalLoss: "-6000",
      },
    }), "single", c);
    // ST: +10K + (-4K prior) = +$6K
    expect(result.netShortTerm.toNumber()).toBe(6000);
    // LT: +15K + (-6K prior) = +$9K
    expect(result.netLongTerm.toNumber()).toBe(9000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(15000);
    expect(result.capitalLossDeduction.toNumber()).toBe(15000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("both prior ST and LT carryforwards exceed current gains, producing new carryforwards", () => {
    const result = calculateScheduleD(makeFixture({
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "12000", "10000"), // ST: +$2K
          makeTx("long", "14000", "10000"),  // LT: +$4K
        ],
      }],
      priorYear: {
        shortTermCapitalLoss: "-8000",
        longTermCapitalLoss: "-12000",
      },
    }), "single", c);
    // ST: +2K + (-8K prior) = -$6K
    expect(result.netShortTerm.toNumber()).toBe(-6000);
    // LT: +4K + (-12K prior) = -$8K
    expect(result.netLongTerm.toNumber()).toBe(-8000);
    // Net: -$14K, deduction capped at -$3K
    expect(result.netCapitalGainLoss.toNumber()).toBe(-14000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // Carryforward: ST -6K used first (3K used) → carry -3K ST; LT -8K all carries
    expect(result.carryforwardShortTerm.toNumber()).toBe(-3000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-8000);
  });
});

// ═══════════════════════════════════════════════════════════
// QDCG Line 3 — ST loss reduces preferential capital gain
// Per IRS: "Enter the smaller of Schedule D line 15 or line 16.
// If either line 15 or line 16 is blank or a loss, enter -0-."
// ═══════════════════════════════════════════════════════════

describe("QDCG Line 3 - ST loss reduces preferential capital gain", () => {
  it("ST loss partially offsets LT gain — preferential income uses net capital gain, not raw LT", () => {
    // Single filer, $85K wages, ST -$5K + LT +$10K = net +$5K
    // QDCG Line 3 = min(netLongTerm $10K, netCapitalGainLoss $5K) = $5K
    // Only $5K (not $10K) should get preferential 15% rate
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "5000", "10000"),  // ST: -$5K
          makeTx("long", "20000", "10000"),  // LT: +$10K
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Total income: $85K + $5K (net cap gain) = $90K
    expect(federal.totalIncome.toNumber()).toBe(90000);
    // Taxable income: $90K - $15.75K standard deduction = $74,250
    expect(federal.taxableIncome.toNumber()).toBe(74250);
    // QDCG ordinary portion74250-5000=69250; published single69250–69300 row10155.
    // preferentialTax = $5K × 15% = $750 (stacked on $69,250, above 0% threshold $48,350)
    // total = $10,155 + $750 = $10,905
    expect(federal.totalTaxBeforeCredits.toNumber()).toBe(10905);
    // Capital gains tax (preferential portion) should be $750, not $1,500
    expect(federal.capitalGainsTax.toNumber()).toBe(750);
  });

  it("ST loss exceeds LT gain (overall net loss) — zero preferential capital gain per QDCG Line 3", () => {
    // Single filer, $85K wages, ST -$20K + LT +$10K = net -$10K, deduction -$3K
    // QDCG Line 3 = 0 (because netCapitalGainLoss is a loss)
    // All income taxed at ordinary rates
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          makeTx("short", "0", "20000"),     // ST: -$20K
          makeTx("long", "20000", "10000"),  // LT: +$10K
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Total income: $85K + (-$3K cap loss deduction) = $82K
    expect(federal.totalIncome.toNumber()).toBe(82000);
    // Taxable income: $82K - $15.75K = $66,250
    expect(federal.taxableIncome.toNumber()).toBe(66250);
    // All ordinary: published single66250–66300 table row9495.
    expect(federal.totalTaxBeforeCredits.toNumber()).toBe(9495);
    // Capital gains tax should be $0 — no preferential rate applies
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
  });
});

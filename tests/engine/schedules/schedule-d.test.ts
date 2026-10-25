/**
 * Tests for Schedule D — Capital Gains and Losses
 * Spec: spec/federal/schedule-d.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeFixtureWithTransactions(
  transactions: Array<{
    holdingPeriod: "short" | "long";
    proceeds: string;
    costBasis: string;
    adjustments?: string;
  }>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099B: [{
      broker: "Fidelity",
      transactions: transactions.map((t, i) => ({
        description: `Stock ${i}`,
        dateAcquired: "2020-01-01",
        dateSold: "2025-06-01",
        proceeds: t.proceeds,
        costBasis: t.costBasis,
        adjustments: t.adjustments ?? "0",
        basisReportedToIRS: true,
        holdingPeriod: t.holdingPeriod,
        washSale: false,
        washSaleDisallowed: "0",
      })),
    }],
  };
}

// ═══════════════════════════════════════════════════════════
// Net Short-Term and Long-Term
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Net Gains/Losses", () => {
  it("Schedule D Line 7 - net short-term gain", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "10000", costBasis: "8000" },
      { holdingPeriod: "short", proceeds: "5000", costBasis: "6000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    // $2000 + (-$1000) = $1000
    expect(result.netShortTerm.toNumber()).toBe(1000);
  });

  it("Schedule D Line 7 - net short-term loss", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "10000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-5000);
  });

  it("Schedule D Line 15 - net long-term gain", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "25000", costBasis: "15000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netLongTerm.toNumber()).toBe(10000);
  });

  it("Schedule D Line 15 - includes 1099-DIV cap gain distributions", () => {
    const result = calculateScheduleD(complexMFJFixture, "married_filing_jointly", c);
    // LTCG from 8949: $25K - $15K = $10K
    // K-1 LT: $2K
    // 1099-DIV cap gain dist: $3K
    // Total: $15K
    expect(result.netLongTerm.toNumber()).toBe(15000);
  });

  it("Schedule D Line 15 - includes Form 4797 section 1231 long-term gain", () => {
    const result = calculateScheduleD({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "9000",
        nonrecapturedNetSection1231Losses: "2500",
      },
    }, "single", c);

    expect(result.netLongTerm.toNumber()).toBe(6500);

    const line15 = result.lines.find((line) => line.line === "15");
    expect(String(line15?.inputs["Form 4797 Line 9"])).toBe("6500");
  });

  it("Schedule D Line 16 - net capital gain", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "3000" }, // +$2K
      { holdingPeriod: "long", proceeds: "20000", costBasis: "12000" }, // +$8K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(10000);
  });

  it("Schedule D Line 16 - net capital loss", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "10000" }, // -$5K
      { holdingPeriod: "long", proceeds: "3000", costBasis: "6000" }, // -$3K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss Deduction (Line 21)
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Capital Loss Deduction", () => {
  it("Schedule D Line 21 - loss capped at $3,000", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "15000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("Schedule D Line 21 - MFS loss capped at $1,500", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "15000" },
    ]);
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
  });

  it("Schedule D Line 21 - small loss fully deductible", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "9000", costBasis: "10000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1000);
  });

  it("Schedule D Line 21 - gain passes through fully", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "50000", costBasis: "10000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Carryforward
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Carryforward", () => {
  it("carries forward excess short-term loss", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "15000" }, // -$10K
    ]);
    const result = calculateScheduleD(input, "single", c);
    // Used $3K, remaining $7K carries forward as short-term
    expect(result.carryforwardShortTerm.toNumber()).toBe(-7000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("carries forward excess long-term loss", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "2000", costBasis: "12000" }, // -$10K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-7000);
  });

  it("no carryforward when gain", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "20000", costBasis: "10000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("applies prior year carryforward", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Stock",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "3000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        capitalLossCarryforward: "0",
        shortTermCapitalLoss: "0",
        longTermCapitalLoss: "-5000",
        suspendedPassiveLosses: [],
        foreignTaxCreditCarryforward: "0",
        charitableCarryforward: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // LT gain $2K + prior LT loss -$5K = net -$3K
    expect(result.netLongTerm.toNumber()).toBe(-3000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("mixed ST and LT losses — ST consumed first", () => {
    // -$4K short-term, -$6K long-term = -$10K total, $3K deduction used
    // Short-term: $3K used against deduction, $1K carries forward
    // Long-term: none used, $6K carries forward
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "6000", costBasis: "10000" }, // -$4K
      { holdingPeriod: "long", proceeds: "4000", costBasis: "10000" }, // -$6K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(-1000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-6000);
  });

  it("MFS carryforward with $1,500 limit", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "2000", costBasis: "12000" }, // -$10K
    ]);
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    // $10K loss - $1.5K used = $8.5K carryforward
    expect(result.carryforwardLongTerm.toNumber()).toBe(-8500);
  });

  it("loss exactly at $3,000 limit — no carryforward", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "7000", costBasis: "10000" }, // -$3K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("ST gain offsets LT loss before deduction limit", () => {
    // +$2K short-term, -$8K long-term = -$6K net
    // IRS worksheet: effective LT loss = $8K - $2K(ST gain) = $6K
    // Deduction: $3K from LT → LT carryforward = $6K - $3K = $3K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "12000", costBasis: "10000" }, // +$2K
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(2000);
    expect(result.netLongTerm.toNumber()).toBe(-8000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-6000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST gain cross-nets with LT loss per IRS worksheet
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-3000);
  });

  it("zero transactions produce zero results", () => {
    const result = calculateScheduleD({
      ...simpleW2Fixture,
      form1099B: [],
      scheduleK1: [],
      form1099Div: [],
    }, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 1202 QSBS Exclusion
// ═══════════════════════════════════════════════════════════

describe("Schedule D - QSBS exclusion", () => {
  it("Schedule D QSBS adjustment - QSBS exclusion reduces long-term gain", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "StartupCo QSBS",
          dateAcquired: "2019-01-01",
          dateSold: "2025-06-01",
          proceeds: "500000",
          costBasis: "100000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long",
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      form1099Div: [{
        payer: "StartupCo",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        section1202Gain: "400000", // $400K eligible for exclusion
        section1250Gain: "0",
        collectiblesGain: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // $400K gain, $400K QSBS exclusion → net LT = $400K - $400K = $0 from QSBS
    // Plus $400K from 8949 long-term = ($500K-$100K) = $400K
    // Net LT = $400K (8949) - $400K (exclusion) = $0
    expect(result.section1202Exclusion.toNumber()).toBe(400000);
    expect(result.netLongTerm.toNumber()).toBe(0);
  });

  it("Schedule D QSBS adjustment - QSBS capped at $10M for non-MFS", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "BigStartup",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        section1202Gain: "15000000", // $15M eligible
        section1250Gain: "0",
        collectiblesGain: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    expect(result.section1202Exclusion.toNumber()).toBe(10000000);
  });

  it("Schedule D QSBS adjustment - QSBS capped at $5M for MFS", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "BigStartup",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        section1202Gain: "8000000",
        section1250Gain: "0",
        collectiblesGain: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.section1202Exclusion.toNumber()).toBe(5000000);
  });

  it("Schedule D QSBS adjustment - no QSBS when section1202Gain is zero", () => {
    const result = calculateScheduleD(simpleW2Fixture, "single", c);
    expect(result.section1202Exclusion.toNumber()).toBe(0);
  });

  it("QSBS exclusion shows in audit trail", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "StartupCo",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "0",
        section1202Gain: "200000",
        section1250Gain: "0",
        collectiblesGain: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    const adjustment = result.lines.find((l) => l.line === "1202-adjustment");
    expect(adjustment).toBeDefined();
    expect(adjustment?.value.toNumber()).toBe(200000);
    expect(result.lines.find((l) => l.line === "13")?.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule D - audit trail", () => {
  it("produces complete audit trail", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "10000", costBasis: "8000" },
      { holdingPeriod: "long", proceeds: "20000", costBasis: "15000" },
    ]);
    const result = calculateScheduleD(input, "single", c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("15");
    expect(lineIds).toContain("16");
    expect(lineIds).toContain("21");
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Gain/Loss Interactions
// ═══════════════════════════════════════════════════════════

describe("Schedule D - edge cases: gain/loss interactions", () => {
  it("Schedule D Line 7/16 - net short-term gain only (taxed as ordinary income)", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "15000", costBasis: "10000" }, // +$5K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(5000);
    expect(result.netLongTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000);
    // Full gain passes through — no cap on gains
    expect(result.capitalLossDeduction.toNumber()).toBe(5000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 15/16 - net long-term gain only (preferential rates)", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "50000", costBasis: "20000" }, // +$30K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netLongTerm.toNumber()).toBe(30000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(30000);
    expect(result.capitalLossDeduction.toNumber()).toBe(30000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 16 - short-term loss offsets long-term gain", () => {
    // -$4K ST + $10K LT = $6K net gain
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "6000", costBasis: "10000" }, // -$4K
      { holdingPeriod: "long", proceeds: "25000", costBasis: "15000" }, // +$10K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-4000);
    expect(result.netLongTerm.toNumber()).toBe(10000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(6000);
    // Net gain — passes through, no loss deduction limit applies
    expect(result.capitalLossDeduction.toNumber()).toBe(6000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 16 - long-term loss offsets short-term gain", () => {
    // +$3K ST + -$7K LT = -$4K net loss
    // IRS worksheet: effective LT loss = $7K - $3K(ST gain) = $4K
    // Deduction: $3K from LT → LT carryforward = $4K - $3K = $1K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "13000", costBasis: "10000" }, // +$3K
      { holdingPeriod: "long", proceeds: "3000", costBasis: "10000" }, // -$7K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(3000);
    expect(result.netLongTerm.toNumber()).toBe(-7000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-4000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST gain cross-nets with LT loss per IRS worksheet
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-1000);
  });

  it("Schedule D Line 21 - both net ST and LT losses ($3K capital loss limit)", () => {
    // -$5K ST + -$5K LT = -$10K total, capped at -$3K deduction
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "10000" }, // -$5K
      { holdingPeriod: "long", proceeds: "5000", costBasis: "10000" }, // -$5K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.toNumber()).toBe(-5000);
    expect(result.netLongTerm.toNumber()).toBe(-5000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-10000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    // ST consumed first: $3K from ST used, $2K ST carries forward, $5K LT carries forward
    expect(result.carryforwardShortTerm.toNumber()).toBe(-2000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-5000);
  });

  it("Schedule D Line 21 - capital loss exactly $3,000 (max deduction, no carryforward)", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "7000", costBasis: "10000" }, // -$3K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-3000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 21 - capital loss $3,001 (carryforward of $1)", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "6999", costBasis: "10000" }, // -$3001
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-3001);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-1);
  });

  it("Schedule D Line 21 - MFS capital loss limit $1,500", () => {
    // -$5K loss, MFS cap is $1,500
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "10000" }, // -$5K
    ]);
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    // $5K - $1.5K = $3.5K carryforward
    expect(result.carryforwardShortTerm.toNumber()).toBe(-3500);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Prior Year Carryforward
// ═══════════════════════════════════════════════════════════

describe("Schedule D - edge cases: prior year carryforward", () => {
  it("Schedule D Line 7 - capital loss carryforward from prior year (ST)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Schwab",
        transactions: [{
          description: "Stock A",
          dateAcquired: "2025-01-01",
          dateSold: "2025-03-01",
          proceeds: "10000",
          costBasis: "8000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "short" as const,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        capitalLossCarryforward: "0",
        shortTermCapitalLoss: "-4000",
        longTermCapitalLoss: "0",
        suspendedPassiveLosses: [],
        foreignTaxCreditCarryforward: "0",
        charitableCarryforward: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // ST gain $2K + prior ST loss -$4K = -$2K
    expect(result.netShortTerm.toNumber()).toBe(-2000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-2000);
  });

  it("Schedule D Line 15 - prior year LT carryforward wipes out current LT gain", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Schwab",
        transactions: [{
          description: "Stock B",
          dateAcquired: "2023-01-01",
          dateSold: "2025-06-01",
          proceeds: "20000",
          costBasis: "15000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long" as const,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        capitalLossCarryforward: "0",
        shortTermCapitalLoss: "0",
        longTermCapitalLoss: "-12000",
        suspendedPassiveLosses: [],
        foreignTaxCreditCarryforward: "0",
        charitableCarryforward: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // LT gain $5K + prior LT loss -$12K = -$7K
    expect(result.netLongTerm.toNumber()).toBe(-7000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-7000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-4000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Special Gain Types (1099-DIV fields)
// ═══════════════════════════════════════════════════════════

describe("Schedule D - edge cases: special gain types", () => {
  it("Schedule D Line 15 - 28% rate gain (collectibles) flows through 1099-DIV", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "Gold Fund",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "5000",
        section1202Gain: "0",
        section1250Gain: "0",
        collectiblesGain: "3000", // 28% rate gain reported in Box 2d
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // Capital gain distributions $5K includes the collectibles gain
    // Net LT = $5K from cap gain dist (collectibles gain is a subset, not additive)
    expect(result.netLongTerm.toNumber()).toBe(5000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(5000);
  });

  it("Schedule D Line 15 - unrecaptured Section 1250 gain (25% rate) flows through 1099-DIV", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Div: [{
        payer: "REIT Fund",
        ordinaryDividends: "2000",
        qualifiedDividends: "0",
        totalCapitalGainDistributions: "8000",
        section1202Gain: "0",
        section1250Gain: "4000", // 25% rate gain reported in Box 2b
        collectiblesGain: "0",
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // Cap gain distributions $8K includes §1250 gain (subset, not additive)
    expect(result.netLongTerm.toNumber()).toBe(8000);
    expect(result.capitalLossDeduction.toNumber()).toBe(8000);
  });

  it("Schedule D Lines 7/15/16 - mix of all gain types (ST, LT, collectibles, 1250)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "Day trade stock",
            dateAcquired: "2025-03-01",
            dateSold: "2025-04-01",
            proceeds: "12000",
            costBasis: "10000",
            adjustments: "0",
            basisReportedToIRS: true,
            holdingPeriod: "short" as const,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-held stock",
            dateAcquired: "2020-01-01",
            dateSold: "2025-06-01",
            proceeds: "30000",
            costBasis: "20000",
            adjustments: "0",
            basisReportedToIRS: true,
            holdingPeriod: "long" as const,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
      form1099Div: [{
        payer: "Mixed Fund",
        ordinaryDividends: "1000",
        qualifiedDividends: "500",
        totalCapitalGainDistributions: "6000",
        section1202Gain: "0",
        section1250Gain: "2000", // subset of cap gain dist
        collectiblesGain: "1500", // subset of cap gain dist
        federalWithheld: "0",
        foreignTaxPaid: "0",
        nondividendDistributions: "0",
        exemptInterestDividends: "0",
      }],
      scheduleK1: [{
        partnershipName: "Venture Fund",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "1000",
        netLongTermCapitalGain: "3000",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        atRiskAmount: "100000",
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // ST: $2K (8949) + $1K (K-1) = $3K
    expect(result.netShortTerm.toNumber()).toBe(3000);
    // LT: $10K (8949) + $3K (K-1) + $6K (1099-DIV cap gain dist) = $19K
    expect(result.netLongTerm.toNumber()).toBe(19000);
    // Total: $3K + $19K = $22K
    expect(result.netCapitalGainLoss.toNumber()).toBe(22000);
    expect(result.capitalLossDeduction.toNumber()).toBe(22000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Boundary Conditions
// ═══════════════════════════════════════════════════════════

describe("Schedule D - edge cases: boundary conditions", () => {
  it("Schedule D Line 16 - zero gains and zero losses", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [],
      scheduleK1: [],
      form1099Div: [],
    };
    const result = calculateScheduleD(input, "single", c);
    expect(result.netShortTerm.isZero()).toBe(true);
    expect(result.netLongTerm.isZero()).toBe(true);
    expect(result.netCapitalGainLoss.isZero()).toBe(true);
    expect(result.capitalLossDeduction.isZero()).toBe(true);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
    expect(result.section1202Exclusion.isZero()).toBe(true);
  });

  it("Schedule D Line 16 - very large capital gain ($10M+)", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "15000000", costBasis: "2500000" }, // +$12.5M
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netLongTerm.equals(d("12500000"))).toBe(true);
    expect(result.netCapitalGainLoss.equals(d("12500000"))).toBe(true);
    expect(result.capitalLossDeduction.equals(d("12500000"))).toBe(true);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
    expect(result.carryforwardLongTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 16 - gains exactly at QDCG worksheet threshold (positive LT with zero ST)", () => {
    // Net long-term gain > 0 and net capital gain > 0 triggers QDCG worksheet
    // This verifies the condition: netLongTerm > 0 && netCapitalGainLoss > 0
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "10001", costBasis: "10000" }, // +$1
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.netLongTerm.toNumber()).toBe(1);
    expect(result.netCapitalGainLoss.toNumber()).toBe(1);
    // Both positive — qualifies for QDCG worksheet
    expect(result.netLongTerm.greaterThan(0)).toBe(true);
    expect(result.netCapitalGainLoss.greaterThan(0)).toBe(true);
    expect(result.capitalLossDeduction.toNumber()).toBe(1);
  });

  it("Schedule D - wash sale adjustments flow through Form 8949", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL wash sale",
            dateAcquired: "2025-01-10",
            dateSold: "2025-02-15",
            proceeds: "8000",
            costBasis: "10000",
            adjustments: "0",
            basisReportedToIRS: true,
            holdingPeriod: "short" as const,
            washSale: true,
            washSaleDisallowed: "2000", // Full $2K loss disallowed
          },
        ],
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // Proceeds $8K - cost $10K = -$2K loss, but +$2K wash sale adjustment = $0 gain/loss
    expect(result.netShortTerm.toNumber()).toBe(0);
    expect(result.netCapitalGainLoss.toNumber()).toBe(0);
    expect(result.capitalLossDeduction.toNumber()).toBe(0);
  });

  it("Schedule D - partial wash sale disallowance reduces loss", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [
          {
            description: "TSLA partial wash",
            dateAcquired: "2025-02-01",
            dateSold: "2025-03-01",
            proceeds: "7000",
            costBasis: "10000",
            adjustments: "0",
            basisReportedToIRS: true,
            holdingPeriod: "short" as const,
            washSale: true,
            washSaleDisallowed: "1500", // $1.5K of $3K loss disallowed
          },
        ],
      }],
    };
    const result = calculateScheduleD(input, "single", c);
    // Proceeds $7K - cost $10K = -$3K, plus $1.5K wash sale adjustment = -$1.5K
    expect(result.netShortTerm.toNumber()).toBe(-1500);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    expect(result.carryforwardShortTerm.isZero()).toBe(true);
  });

  it("Schedule D Line 21 - MFS with both ST and LT losses, $1,500 limit", () => {
    // -$2K ST + -$3K LT = -$5K, MFS cap $1,500
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "8000", costBasis: "10000" }, // -$2K
      { holdingPeriod: "long", proceeds: "7000", costBasis: "10000" }, // -$3K
    ]);
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-5000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    // ST consumed first: $1.5K from $2K ST → $0.5K ST carryforward, $3K LT carryforward
    expect(result.carryforwardShortTerm.toNumber()).toBe(-500);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-3000);
  });

  it("Schedule D - HOH filing status uses $3,000 loss limit", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const result = calculateScheduleD(input, "head_of_household", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(-5000);
  });

  it("Schedule D - QSS filing status uses $3,000 loss limit", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "1000", costBasis: "7000" }, // -$6K
    ]);
    const result = calculateScheduleD(input, "qualifying_surviving_spouse", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// IRS Capital Loss Carryover Worksheet — Cross-Netting
// Per IRS Schedule D Instructions: gains in one category
// offset losses in the other before the $3K deduction is
// allocated, then remaining loss retains its character.
// ═══════════════════════════════════════════════════════════

describe("Schedule D - IRS carryover worksheet cross-netting", () => {
  it("LT loss reduced by ST gain before carryforward (IRS worksheet Part 2)", () => {
    // +$2K ST, -$8K LT → net -$6K, deduction $3K
    // IRS: effective LT loss = $8K - $2K(ST gain offset) = $6K
    // LT carryforward = $6K - $3K(deduction) = $3K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "12000", costBasis: "10000" }, // +$2K
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-3000);
  });

  it("ST loss reduced by LT gain before carryforward (IRS worksheet Part 1)", () => {
    // -$10K ST, +$2K LT → net -$8K, deduction $3K
    // IRS: effective ST loss = $10K - $2K(LT gain offset) = $8K
    // ST carryforward = $8K - $3K(deduction) = $5K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "5000", costBasis: "15000" }, // -$10K
      { holdingPeriod: "long", proceeds: "12000", costBasis: "10000" }, // +$2K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.carryforwardShortTerm.toNumber()).toBe(-5000);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("no carryforward when cross-netting + deduction absorbs full loss", () => {
    // -$4K ST, +$1K LT → net -$3K, deduction $3K
    // effective ST loss = $4K - $1K = $3K, fully deducted → $0 carry
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "6000", costBasis: "10000" }, // -$4K
      { holdingPeriod: "long", proceeds: "11000", costBasis: "10000" }, // +$1K
    ]);
    const result = calculateScheduleD(input, "single", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(0);
  });

  it("MFS cross-netting with $1,500 limit", () => {
    // +$1K ST, -$5K LT → net -$4K, MFS deduction $1.5K
    // effective LT loss = $5K - $1K = $4K
    // LT carryforward = $4K - $1.5K = $2.5K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "11000", costBasis: "10000" }, // +$1K
      { holdingPeriod: "long", proceeds: "5000", costBasis: "10000" }, // -$5K
    ]);
    const result = calculateScheduleD(input, "married_filing_separately", c);
    expect(result.capitalLossDeduction.toNumber()).toBe(-1500);
    expect(result.carryforwardShortTerm.toNumber()).toBe(0);
    expect(result.carryforwardLongTerm.toNumber()).toBe(-2500);
  });
});

// ═══════════════════════════════════════════════════════════
// IRS Capital Loss Carryover Worksheet — effective deduction
// Per IRS Schedule D Instructions Lines 1-4: when taxable
// income (before zero-floor) is negative, the deduction
// provided no tax benefit, so more loss carries forward.
// ═══════════════════════════════════════════════════════════

import { recomputeCarryforward } from "@/engine/schedules/schedule-d.js";

describe("Schedule D - recomputeCarryforward (IRS Capital Loss Carryover Worksheet)", () => {
  it("negative raw TI: full $8K LT loss carries forward (deduction was wasted)", () => {
    // $12K wages, $8K LTCL, $15K std ded → raw TI = ($12K-$3K) - $15K = -$6K
    // IRS Line 3: -$6K + $3K = -$3K ≤ 0 → effective deduction = $0
    // Full $8K carries forward
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const schedDResult = calculateScheduleD(input, "single", c);
    expect(schedDResult.capitalLossDeduction.toNumber()).toBe(-3000);
    // Preliminary carryforward (without taxable income adjustment):
    expect(schedDResult.carryforwardLongTerm.toNumber()).toBe(-5000); // wrong

    // Recompute with negative raw taxable income:
    const adjusted = recomputeCarryforward(schedDResult, d(-6000));
    expect(adjusted.carryforwardLongTerm.toNumber()).toBe(-8000); // correct: full loss
    expect(adjusted.carryforwardShortTerm.toNumber()).toBe(0);
  });

  it("partially negative raw TI: $1K of deduction was effective, $2K wasted", () => {
    // $16K wages, $8K LTCL, $15K std ded → raw TI = ($16K-$3K) - $15K = -$2K
    // IRS Line 3: -$2K + $3K = $1K > 0 → effective deduction = min($3K, $1K) = $1K
    // LT carry = $8K - $1K = $7K
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const schedDResult = calculateScheduleD(input, "single", c);
    const adjusted = recomputeCarryforward(schedDResult, d(-2000));
    expect(adjusted.carryforwardLongTerm.toNumber()).toBe(-7000);
    expect(adjusted.carryforwardShortTerm.toNumber()).toBe(0);
  });

  it("positive raw TI: full deduction effective, same as preliminary", () => {
    // $100K wages, $8K LTCL, $15K std ded → raw TI = ($100K-$3K) - $15K = $82K
    // IRS Line 3: $82K + $3K = $85K > 0 → effective deduction = min($3K, $85K) = $3K
    // LT carry = $8K - $3K = $5K (same as preliminary)
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const schedDResult = calculateScheduleD(input, "single", c);
    const adjusted = recomputeCarryforward(schedDResult, d(82000));
    expect(adjusted.carryforwardLongTerm.toNumber()).toBe(-5000); // same
    expect(adjusted.carryforwardShortTerm.toNumber()).toBe(0);
  });

  it("negative raw TI with cross-netting: +$2K ST, -$8K LT, wasted deduction", () => {
    // Cross-netting: effective LT loss = $8K - $2K = $6K
    // With raw TI = -$10K: Line 3 = -$10K + $3K = -$7K ≤ 0 → effective deduction = $0
    // ST carry: stLoss=0, stReduction=0+$2K=2K → max(0, 0-2K) = 0
    // Actually: ST has no loss. LT has $6K effective loss after cross-net.
    // LT reduction: stGain($2K) + effectiveDeductionNotUsedOnST($0) = $2K
    // Wait, cross-netting already reduced LT by the ST gain.
    // effectiveLTLoss = max(0, $8K - $2K(stGain)) = $6K... no, stGain is used in
    // cross-netting, but the worksheet uses a different path.
    // Let me trace through the worksheet:
    // Line 5 (ST loss): $0 (ST is a gain)
    // Line 6 (LT gain): $0 (LT is a loss)
    // Line 7: effectiveDeduction($0) + ltGain($0) = $0
    // Line 8: max(0, $0 - $0) = $0 (ST carry)
    // Line 9 (LT loss): $8K
    // Line 10 (ST gain): $2K
    // Line 11: effectiveDeduction($0) - effectiveDeductionUsedOnST($0) = $0
    // Line 12: $2K + $0 = $2K
    // Line 13: max(0, $8K - $2K) = $6K (LT carry)
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "short", proceeds: "12000", costBasis: "10000" }, // +$2K
      { holdingPeriod: "long", proceeds: "2000", costBasis: "10000" }, // -$8K
    ]);
    const schedDResult = calculateScheduleD(input, "single", c);
    // Preliminary: LT carry = $6K - $3K = $3K
    expect(schedDResult.carryforwardLongTerm.toNumber()).toBe(-3000);

    // With wasted deduction:
    const adjusted = recomputeCarryforward(schedDResult, d(-10000));
    expect(adjusted.carryforwardLongTerm.toNumber()).toBe(-6000); // full cross-netted loss
    expect(adjusted.carryforwardShortTerm.toNumber()).toBe(0);
  });

  it("net capital gain: no carryforward regardless of raw TI", () => {
    const input = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "20000", costBasis: "10000" }, // +$10K
    ]);
    const schedDResult = calculateScheduleD(input, "single", c);
    const adjusted = recomputeCarryforward(schedDResult, d(-50000));
    expect(adjusted.carryforwardLongTerm.toNumber()).toBe(0);
    expect(adjusted.carryforwardShortTerm.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 6781 Integration (Section 1256 Contracts)
// ═══════════════════════════════════════════════════════════

describe("Schedule D - Form 6781 integration", () => {
  it("Form 6781 60/40 split flows into Schedule D Lines 7 and 15", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form6781: {
        section1256Gains: "50000",
        section1256Losses: "0",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // 50000 * 0.40 = 20000 short-term, 50000 * 0.60 = 30000 long-term
    expect(result.netShortTerm.toNumber()).toBe(20000);
    expect(result.netLongTerm.toNumber()).toBe(30000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(50000);
  });

  it("Form 6781 combines with Form 8949 transactions", () => {
    const input: TaxYearInput = {
      ...makeFixtureWithTransactions([
        { holdingPeriod: "short", proceeds: "10000", costBasis: "8000" }, // +$2000 ST
        { holdingPeriod: "long", proceeds: "15000", costBasis: "10000" }, // +$5000 LT
      ]),
      form6781: {
        section1256Gains: "30000",
        section1256Losses: "10000",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // Form 6781: net 20000 → ST 8000, LT 12000
    // Schedule D Line 7: 2000 + 8000 = 10000
    // Schedule D Line 15: 5000 + 12000 = 17000
    expect(result.netShortTerm.toNumber()).toBe(10000);
    expect(result.netLongTerm.toNumber()).toBe(17000);
  });

  it("Form 6781 net loss reduces Schedule D capital gain", () => {
    const input: TaxYearInput = {
      ...makeFixtureWithTransactions([
        { holdingPeriod: "long", proceeds: "20000", costBasis: "10000" }, // +$10000 LT
      ]),
      form6781: {
        section1256Gains: "5000",
        section1256Losses: "25000",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // Form 6781: net -20000 → ST -8000, LT -12000
    // Schedule D Line 7: -8000
    // Schedule D Line 15: 10000 + (-12000) = -2000
    expect(result.netShortTerm.toNumber()).toBe(-8000);
    expect(result.netLongTerm.toNumber()).toBe(-2000);
    // Net: -10000, capped at -3000
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("Form 6781 straddle gains and losses flow to Schedule D", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form6781: {
        section1256Gains: "0",
        section1256Losses: "0",
        adjustments: "0",
        carrybackElection: false,
        carrybackAmount: "0",
        shortTermStraddleLosses: "2000",
        longTermStraddleLosses: "3000",
        shortTermStraddleGains: "5000",
        longTermStraddleGains: "8000",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // Short-term: 0 (60/40) + (-2000) + 5000 = 3000
    // Long-term: 0 (60/40) + (-3000) + 8000 = 5000
    expect(result.netShortTerm.toNumber()).toBe(3000);
    expect(result.netLongTerm.toNumber()).toBe(5000);
  });

  it("Form 6781 absent has no effect on Schedule D", () => {
    const withoutForm6781 = makeFixtureWithTransactions([
      { holdingPeriod: "long", proceeds: "20000", costBasis: "15000" },
    ]);
    const result = calculateScheduleD(withoutForm6781, "single", c);
    expect(result.netLongTerm.toNumber()).toBe(5000);
    expect(result.netShortTerm.toNumber()).toBe(0);
  });

  it("Form 6781 carryback reduces the loss flowing to Schedule D", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form6781: {
        section1256Gains: "0",
        section1256Losses: "20000",
        adjustments: "0",
        carrybackElection: true,
        carrybackAmount: "15000",
        shortTermStraddleLosses: "0",
        longTermStraddleLosses: "0",
        shortTermStraddleGains: "0",
        longTermStraddleGains: "0",
      },
    };
    const result = calculateScheduleD(input, "single", c);
    // After carryback: -20000 + 15000 = -5000
    // ST: -2000, LT: -3000
    expect(result.netShortTerm.toNumber()).toBe(-2000);
    expect(result.netLongTerm.toNumber()).toBe(-3000);
    expect(result.netCapitalGainLoss.toNumber()).toBe(-5000);
    expect(result.capitalLossDeduction.toNumber()).toBe(-3000);
  });
});

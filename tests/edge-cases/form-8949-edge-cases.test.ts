/**
 * Edge case tests for Form 8949 — Sales and Other Dispositions of Capital Assets
 * Tests wash sales, mixed holding periods, zero-gain transactions,
 * large volumes, and loss-only portfolios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8949 } from "@/engine/forms/form-8949.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput, CapitalTransaction } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function makeTx(overrides: Partial<CapitalTransaction>): CapitalTransaction {
  return {
    description: "TEST STOCK",
    dateAcquired: "2024-01-15",
    dateSold: "2025-06-01",
    proceeds: "10000",
    costBasis: "8000",
    adjustments: "0",
    basisReportedToIRS: true,
    holdingPeriod: "long",
    washSale: false,
    washSaleDisallowed: "0",
    ...overrides,
  };
}

function makeInput(transactions: CapitalTransaction[], broker = "Fidelity"): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099B: [{ broker, transactions }],
  };
}

// ═══════════════════════════════════════════════════════════
// Wash Sale Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - wash sale edge cases", () => {
  it("wash sale adds disallowed amount to adjustment", () => {
    const input = makeInput([
      makeTx({
        description: "MSFT 100 shares",
        proceeds: "10000",
        costBasis: "12000",
        holdingPeriod: "short",
        washSale: true,
        washSaleDisallowed: "2000",
      }),
    ]);
    const result = calculateForm8949(input);
    // Loss: $10K - $12K = -$2K, but wash sale disallowed adds $2K adjustment
    // Net gain/loss: $10K - $12K + $2K = $0
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxA.transactions[0].adjustment.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);
  });

  it("partial wash sale preserves remaining loss", () => {
    const input = makeInput([
      makeTx({
        proceeds: "8000",
        costBasis: "12000",
        holdingPeriod: "short",
        washSale: true,
        washSaleDisallowed: "1500", // Only $1,500 of $4,000 loss disallowed
      }),
    ]);
    const result = calculateForm8949(input);
    // Loss: $8K - $12K = -$4K, plus $1.5K adjustment = -$2.5K
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(-2500);
  });

  it("multiple wash sales aggregate in disallowed total", () => {
    const input = makeInput([
      makeTx({
        description: "AAPL",
        proceeds: "5000",
        costBasis: "7000",
        holdingPeriod: "short",
        washSale: true,
        washSaleDisallowed: "2000",
      }),
      makeTx({
        description: "TSLA",
        proceeds: "3000",
        costBasis: "5000",
        holdingPeriod: "short",
        washSale: true,
        washSaleDisallowed: "1000",
      }),
    ]);
    const result = calculateForm8949(input);
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine?.value.toNumber()).toBe(3000); // $2K + $1K
  });

  it("wash sale on long-term transaction", () => {
    const input = makeInput([
      makeTx({
        holdingPeriod: "long",
        proceeds: "10000",
        costBasis: "15000",
        washSale: true,
        washSaleDisallowed: "5000",
      }),
    ]);
    const result = calculateForm8949(input);
    // Goes to long-term box D (basis reported)
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.longTermBoxD.transactions[0].adjustmentCode).toBe("W");
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Holding Periods and Basis Reporting
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - mixed categories", () => {
  it("same security held short-term and long-term separately", () => {
    const input = makeInput([
      makeTx({
        description: "AAPL Lot 1",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "5000",
        costBasis: "4000",
        holdingPeriod: "short",
      }),
      makeTx({
        description: "AAPL Lot 2",
        dateAcquired: "2023-01-01",
        dateSold: "2025-06-01",
        proceeds: "5000",
        costBasis: "3000",
        holdingPeriod: "long",
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(2000);
  });

  it("all four boxes populated", () => {
    const input = makeInput([
      makeTx({ holdingPeriod: "short", basisReportedToIRS: true, proceeds: "5000", costBasis: "4000" }),
      makeTx({ holdingPeriod: "short", basisReportedToIRS: false, proceeds: "6000", costBasis: "5500" }),
      makeTx({ holdingPeriod: "long", basisReportedToIRS: true, proceeds: "10000", costBasis: "7000" }),
      makeTx({ holdingPeriod: "long", basisReportedToIRS: false, proceeds: "8000", costBasis: "9000" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions).toHaveLength(1);

    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(1000);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(500);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(3000);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(-1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Extreme Values
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - zero and extreme values", () => {
  it("zero gain transaction (proceeds equals basis)", () => {
    const input = makeInput([
      makeTx({ proceeds: "5000", costBasis: "5000" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("very large transaction amounts", () => {
    const input = makeInput([
      makeTx({
        proceeds: "10000000",
        costBasis: "8000000",
        holdingPeriod: "long",
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(2000000);
  });

  it("empty 1099-B (no transactions)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{ broker: "Empty Broker", transactions: [] }],
    };
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("no 1099-B at all", () => {
    const input: TaxYearInput = { ...simpleW2Fixture, form1099B: [] };
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("loss-only portfolio", () => {
    const input = makeInput([
      makeTx({ proceeds: "3000", costBasis: "5000", holdingPeriod: "short" }),
      makeTx({ proceeds: "7000", costBasis: "10000", holdingPeriod: "long" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-2000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multi-Broker Aggregation
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - multi-broker aggregation", () => {
  it("transactions from multiple brokers aggregate correctly", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            makeTx({ proceeds: "10000", costBasis: "8000", holdingPeriod: "long" }),
          ],
        },
        {
          broker: "Schwab",
          transactions: [
            makeTx({ proceeds: "5000", costBasis: "6000", holdingPeriod: "long" }),
          ],
        },
        {
          broker: "Vanguard",
          transactions: [
            makeTx({ proceeds: "3000", costBasis: "2000", holdingPeriod: "short" }),
          ],
        },
      ],
    };
    const result = calculateForm8949(input);
    // Long-term: $2K + (-$1K) = $1K
    expect(result.totalLongTermGainLoss.toNumber()).toBe(1000);
    // Short-term: $1K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1000);
    // Total transactions = 3
    const totalTx = result.shortTermBoxA.transactions.length +
      result.longTermBoxD.transactions.length;
    expect(totalTx).toBe(3);
  });

  it("high volume: 20 transactions across 3 brokers", () => {
    const txs = Array.from({ length: 20 }, (_, i) => makeTx({
      description: `Stock ${i}`,
      proceeds: String(1000 + i * 100),
      costBasis: String(900 + i * 100),
      holdingPeriod: i % 2 === 0 ? "short" : "long",
    }));
    // Split across brokers
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        { broker: "A", transactions: txs.slice(0, 7) },
        { broker: "B", transactions: txs.slice(7, 14) },
        { broker: "C", transactions: txs.slice(14) },
      ],
    };
    const result = calculateForm8949(input);
    // Each transaction has $100 gain. 10 short + 10 long = $1000 each
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - additional edge cases", () => {
  it("single transaction with $0 proceeds (gifted/abandoned stock) yields zero gain", () => {
    const input = makeInput([
      makeTx({
        description: "ABANDONED STOCK",
        proceeds: "0",
        costBasis: "0",
        holdingPeriod: "long",
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions[0].proceeds.toNumber()).toBe(0);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });

  it("50+ transactions aggregate correctly with high volume", () => {
    // 30 short-term @ $200 gain each = $6,000; 25 long-term @ $300 gain each = $7,500
    const shortTxs = Array.from({ length: 30 }, (_, i) =>
      makeTx({
        description: `SHORT ${i}`,
        proceeds: "1200",
        costBasis: "1000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      })
    );
    const longTxs = Array.from({ length: 25 }, (_, i) =>
      makeTx({
        description: `LONG ${i}`,
        proceeds: "1300",
        costBasis: "1000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      })
    );
    const input = makeInput([...shortTxs, ...longTxs]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(30);
    expect(result.longTermBoxD.transactions).toHaveLength(25);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(6000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(7500);
  });

  it("all transactions in Box B (short-term, basis not reported to IRS) are categorized correctly", () => {
    const input = makeInput([
      makeTx({ holdingPeriod: "short", basisReportedToIRS: false, proceeds: "5000", costBasis: "4000" }),
      makeTx({ holdingPeriod: "short", basisReportedToIRS: false, proceeds: "3000", costBasis: "3500" }),
      makeTx({ holdingPeriod: "short", basisReportedToIRS: false, proceeds: "7000", costBasis: "6000" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxB.transactions).toHaveLength(3);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
    // Total: ($5K-$4K) + ($3K-$3.5K) + ($7K-$6K) = $1K - $0.5K + $1K = $1,500
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(1500);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("mix of gains and losses netting to exactly $0", () => {
    const input = makeInput([
      makeTx({ description: "GAIN STOCK", proceeds: "15000", costBasis: "10000", holdingPeriod: "long" }),
      makeTx({ description: "LOSS STOCK", proceeds: "5000", costBasis: "10000", holdingPeriod: "long" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });

  it("single $1 gain transaction (minimal gain)", () => {
    const input = makeInput([
      makeTx({
        description: "PENNY GAIN",
        proceeds: "1001",
        costBasis: "1000",
        holdingPeriod: "short",
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(1);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("wash sale on Box B (short-term, basis not reported) transaction", () => {
    const input = makeInput([
      makeTx({
        holdingPeriod: "short",
        basisReportedToIRS: false,
        proceeds: "4000",
        costBasis: "6000",
        washSale: true,
        washSaleDisallowed: "2000",
      }),
    ]);
    const result = calculateForm8949(input);
    // Transaction lands in Box B
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    // Loss: $4K - $6K = -$2K, wash sale adds $2K adjustment → net $0
    expect(result.shortTermBoxB.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxB.transactions[0].adjustment.toNumber()).toBe(2000);
    expect(result.shortTermBoxB.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });

  it("transaction with non-zero pre-existing adjustments field is combined with wash sale", () => {
    // Pre-existing adjustment of -$500 (e.g., ordinary income adjustment) plus wash sale of $1,000
    const input = makeInput([
      makeTx({
        proceeds: "9000",
        costBasis: "11000",
        adjustments: "-500",
        holdingPeriod: "long",
        washSale: true,
        washSaleDisallowed: "1000",
      }),
    ]);
    const result = calculateForm8949(input);
    // Net adjustment: -$500 + $1,000 = $500
    expect(result.longTermBoxD.transactions[0].adjustment.toNumber()).toBe(500);
    expect(result.longTermBoxD.transactions[0].adjustmentCode).toBe("W");
    // Gain/loss: $9K - $11K + $500 = -$1,500
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(-1500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-1500);
  });

  it("only long-term transactions produce zero short-term totals", () => {
    const input = makeInput([
      makeTx({ holdingPeriod: "long", basisReportedToIRS: true, proceeds: "20000", costBasis: "15000" }),
      makeTx({ holdingPeriod: "long", basisReportedToIRS: false, proceeds: "8000", costBasis: "9000" }),
    ]);
    const result = calculateForm8949(input);
    // Short-term boxes should be empty
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Long-term: $5K + (-$1K) = $4K
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════
// New Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - negative adjustment (basis increase reported by broker)", () => {
  it("negative adjustment reduces gain when broker over-reported basis", () => {
    // Broker reported basis higher than actual; negative adjustment corrects it.
    // proceeds $12K, costBasis $10K, adjustment -$500 (basis increase) → gain $1,500
    const input = makeInput([
      makeTx({
        description: "CORRECTED BASIS STOCK",
        proceeds: "12000",
        costBasis: "10000",
        adjustments: "-500",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    const tx = result.longTermBoxD.transactions[0];
    expect(tx.adjustment.toNumber()).toBe(-500);
    // gainLoss = $12K - $10K + (-$500) = $1,500
    expect(tx.gainLoss.toNumber()).toBe(1500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(1500);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 - all gains no losses", () => {
  it("portfolio with only gains has strictly positive totals across all boxes", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Broker",
          transactions: [
            makeTx({ holdingPeriod: "short", basisReportedToIRS: true,  proceeds: "5000", costBasis: "4000" }),
            makeTx({ holdingPeriod: "short", basisReportedToIRS: false, proceeds: "6000", costBasis: "5000" }),
            makeTx({ holdingPeriod: "long",  basisReportedToIRS: true,  proceeds: "9000", costBasis: "7000" }),
            makeTx({ holdingPeriod: "long",  basisReportedToIRS: false, proceeds: "8000", costBasis: "6500" }),
          ],
        },
      ],
    };
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBeGreaterThan(0);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBeGreaterThan(0);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBeGreaterThan(0);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBeGreaterThan(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBeGreaterThan(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBeGreaterThan(0);
    // Spot-check exact values: ST $1K + $1K = $2K; LT $2K + $1.5K = $3.5K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(2000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(3500);
  });
});

describe("Form 8949 - exactly one transaction per box", () => {
  it("four transactions land one each in Box A, B, D, and E", () => {
    const input = makeInput([
      makeTx({ description: "BOX A",  holdingPeriod: "short", basisReportedToIRS: true,  proceeds: "2000", costBasis: "1500" }),
      makeTx({ description: "BOX B",  holdingPeriod: "short", basisReportedToIRS: false, proceeds: "3000", costBasis: "2800" }),
      makeTx({ description: "BOX D",  holdingPeriod: "long",  basisReportedToIRS: true,  proceeds: "4000", costBasis: "3000" }),
      makeTx({ description: "BOX E",  holdingPeriod: "long",  basisReportedToIRS: false, proceeds: "5000", costBasis: "4500" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions[0].description).toBe("BOX A");
    expect(result.shortTermBoxB.transactions[0].description).toBe("BOX B");
    expect(result.longTermBoxD.transactions[0].description).toBe("BOX D");
    expect(result.longTermBoxE.transactions[0].description).toBe("BOX E");
  });
});

describe("Form 8949 - audit trail summary lines", () => {
  it("result lines include all required Form 8949 summary entries", () => {
    const input = makeInput([
      makeTx({ holdingPeriod: "short", basisReportedToIRS: true,  proceeds: "5000", costBasis: "4000" }),
      makeTx({ holdingPeriod: "long",  basisReportedToIRS: true,  proceeds: "9000", costBasis: "7000" }),
    ]);
    const result = calculateForm8949(input);

    const lineIds = result.lines.map((l) => l.line);
    // Part I summary lines
    expect(lineIds).toContain("Part I Box A");
    expect(lineIds).toContain("Part I Box B");
    expect(lineIds).toContain("Part I totals");
    // Part II summary lines
    expect(lineIds).toContain("Part II Box D");
    expect(lineIds).toContain("Part II Box E");
    expect(lineIds).toContain("Part II totals");
    // Wash sale and Schedule D flow
    expect(lineIds).toContain("adjustment-W");
    expect(lineIds).toContain("to-schedule-d");

    // All lines belong to Form 8949
    expect(result.lines.every((l) => l.form === "Form 8949")).toBe(true);

    // Part I totals line carries the correct value
    const partILine = result.lines.find((l) => l.line === "Part I totals");
    expect(partILine?.value.toNumber()).toBe(1000);

    // Part II totals line carries the correct value
    const partIILine = result.lines.find((l) => l.line === "Part II totals");
    expect(partIILine?.value.toNumber()).toBe(2000);
  });
});

describe("Form 8949 - very small amounts precision", () => {
  it("$1 gain and $1 loss are tracked precisely without floating-point error", () => {
    const input = makeInput([
      makeTx({
        description: "ONE DOLLAR GAIN",
        proceeds: "1001",
        costBasis: "1000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
      makeTx({
        description: "ONE DOLLAR LOSS",
        proceeds: "999",
        costBasis: "1000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(1);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(-1);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-1);
    // Combined net is $0
    expect(
      result.totalShortTermGainLoss.plus(result.totalLongTermGainLoss).toNumber()
    ).toBe(0);
  });
});

describe("Form 8949 - 100 transactions across multiple brokers", () => {
  it("100 transactions from 4 brokers aggregate to correct totals", () => {
    // 50 short-term @ $100 gain = $5,000; 50 long-term @ $200 gain = $10,000
    const shortTxs = Array.from({ length: 50 }, (_, i) =>
      makeTx({
        description: `SHORT ${i}`,
        proceeds: "1100",
        costBasis: "1000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      })
    );
    const longTxs = Array.from({ length: 50 }, (_, i) =>
      makeTx({
        description: `LONG ${i}`,
        proceeds: "1200",
        costBasis: "1000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      })
    );
    const all = [...shortTxs, ...longTxs];
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        { broker: "Broker A", transactions: all.slice(0, 25) },
        { broker: "Broker B", transactions: all.slice(25, 50) },
        { broker: "Broker C", transactions: all.slice(50, 75) },
        { broker: "Broker D", transactions: all.slice(75) },
      ],
    };
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(50);
    expect(result.longTermBoxD.transactions).toHaveLength(50);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(5000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(10000);
  });
});

describe("Form 8949 - long-term loss and short-term gain independence", () => {
  it("long-term loss and short-term gain remain in separate boxes and do not offset", () => {
    const input = makeInput([
      makeTx({
        description: "SHORT TERM GAIN",
        proceeds: "15000",
        costBasis: "10000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
      makeTx({
        description: "LONG TERM LOSS",
        proceeds: "5000",
        costBasis: "12000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    // Each box retains its own gross figure — no cross-period netting on Form 8949
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(5000);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(-7000);
    // Aggregate totals also remain separated
    expect(result.totalShortTermGainLoss.toNumber()).toBe(5000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-7000);
    // The combined net (handled by Schedule D, not Form 8949) would be -$2K
    expect(
      result.totalShortTermGainLoss.plus(result.totalLongTermGainLoss).toNumber()
    ).toBe(-2000);
  });
});

describe("Form 8949 - additional edge cases", () => {
  it("Form 8949 - adjusted breakeven (proceeds + adjustment = cost basis)", () => {
    const input = makeInput([makeTx({
      proceeds: "1000",
      costBasis: "1200",
      adjustments: "200",
      holdingPeriod: "short",
    })]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);
  });

  it("Form 8949 - very large loss passes through without cap", () => {
    const input = makeInput([makeTx({
      proceeds: "100",
      costBasis: "1000000",
      holdingPeriod: "long",
    })]);
    const result = calculateForm8949(input);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-999900);
  });

  it("Form 8949 - 10 fractional transactions aggregate precisely", () => {
    const transactions = [];
    for (let i = 0; i < 10; i++) {
      transactions.push(makeTx({
        description: `Micro ${i}`,
        proceeds: "1.23",
        costBasis: "1.00",
        holdingPeriod: "short",
      }));
    }
    const input = makeInput(transactions);
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.equals(d("2.30"))).toBe(true);
  });

  it("Form 8949 - wash sale exactly cancels full loss", () => {
    const input = makeInput([makeTx({
      proceeds: "5000",
      costBasis: "8000",
      holdingPeriod: "short",
      washSale: true,
      washSaleDisallowed: "3000",
    })]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);
  });

  it("Form 8949 - Box E large inherited stock gain", () => {
    const input = makeInput([makeTx({
      description: "Inherited stock",
      proceeds: "500000",
      costBasis: "50000",
      holdingPeriod: "long",
      basisReportedToIRS: false,
    })], "OldBroker");
    const result = calculateForm8949(input);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(450000);
  });

  it("Form 8949 - all four boxes populated from single broker", () => {
    const input = makeInput([
      makeTx({ description: "ST-A", holdingPeriod: "short", basisReportedToIRS: true, proceeds: "1000", costBasis: "800" }),
      makeTx({ description: "ST-B", holdingPeriod: "short", basisReportedToIRS: false, proceeds: "2000", costBasis: "1500" }),
      makeTx({ description: "LT-D", holdingPeriod: "long", basisReportedToIRS: true, proceeds: "5000", costBasis: "3000" }),
      makeTx({ description: "LT-E", holdingPeriod: "long", basisReportedToIRS: false, proceeds: "8000", costBasis: "6000" }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Expanded Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - all-wash-sale portfolio", () => {
  it("every transaction is a wash sale with fully disallowed losses", () => {
    const input = makeInput([
      makeTx({
        description: "WASH A",
        proceeds: "3000",
        costBasis: "5000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
        washSale: true,
        washSaleDisallowed: "2000",
      }),
      makeTx({
        description: "WASH B",
        proceeds: "7000",
        costBasis: "10000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
        washSale: true,
        washSaleDisallowed: "3000",
      }),
      makeTx({
        description: "WASH C",
        proceeds: "12000",
        costBasis: "15000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
        washSale: true,
        washSaleDisallowed: "3000",
      }),
    ]);
    const result = calculateForm8949(input);
    // All losses fully disallowed: each transaction nets to $0
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.transactions[1].gainLoss.toNumber()).toBe(0);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    // All three adjustment codes should be "W"
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxA.transactions[1].adjustmentCode).toBe("W");
    expect(result.longTermBoxD.transactions[0].adjustmentCode).toBe("W");
    // Wash sale summary line totals $8K disallowed
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine?.value.toNumber()).toBe(8000);
  });
});

describe("Form 8949 - proceeds exactly equal to basis (zero gain)", () => {
  it("multiple zero-gain transactions across short and long term", () => {
    const input = makeInput([
      makeTx({
        description: "ZERO SHORT",
        proceeds: "7777.77",
        costBasis: "7777.77",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
      makeTx({
        description: "ZERO LONG",
        proceeds: "99999.99",
        costBasis: "99999.99",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    // Proceeds and cost basis should be preserved exactly
    expect(result.shortTermBoxA.transactions[0].proceeds.equals(d("7777.77"))).toBe(true);
    expect(result.shortTermBoxA.transactions[0].costBasis.equals(d("7777.77"))).toBe(true);
  });
});

describe("Form 8949 - fractional share transactions", () => {
  it("fractional cents in proceeds and basis aggregate without floating-point drift", () => {
    // 7 transactions of $33.33 proceeds and $22.22 basis each
    // Total proceeds: 7 * 33.33 = 233.31; Total basis: 7 * 22.22 = 155.54
    // Total gain: 233.31 - 155.54 = 77.77
    const transactions = Array.from({ length: 7 }, (_, i) =>
      makeTx({
        description: `FRAC SHARE ${i}`,
        proceeds: "33.33",
        costBasis: "22.22",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      })
    );
    const input = makeInput(transactions);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(7);
    expect(result.shortTermBoxA.totalProceeds.equals(d("233.31"))).toBe(true);
    expect(result.shortTermBoxA.totalCostBasis.equals(d("155.54"))).toBe(true);
    expect(result.totalShortTermGainLoss.equals(d("77.77"))).toBe(true);
  });

  it("sub-penny fractional share amounts are handled precisely", () => {
    const input = makeInput([
      makeTx({
        description: "MICRO FRAC",
        proceeds: "0.123",
        costBasis: "0.100",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions[0].gainLoss.equals(d("0.023"))).toBe(true);
    expect(result.totalLongTermGainLoss.equals(d("0.023"))).toBe(true);
  });
});

describe("Form 8949 - very large dollar amounts ($10M+)", () => {
  it("$50M proceeds and $45M basis produce correct $5M long-term gain", () => {
    const input = makeInput([
      makeTx({
        description: "MEGA STOCK SALE",
        proceeds: "50000000",
        costBasis: "45000000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions[0].proceeds.toNumber()).toBe(50000000);
    expect(result.longTermBoxD.transactions[0].costBasis.toNumber()).toBe(45000000);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(5000000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(5000000);
  });

  it("multiple $10M+ transactions aggregate without overflow", () => {
    const input = makeInput([
      makeTx({
        description: "BIG SALE 1",
        proceeds: "25000000",
        costBasis: "20000000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
      makeTx({
        description: "BIG SALE 2",
        proceeds: "75000000",
        costBasis: "60000000",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
      makeTx({
        description: "BIG SALE 3",
        proceeds: "100000000",
        costBasis: "110000000",
        holdingPeriod: "long",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    // Short-term: $5M + $15M = $20M
    expect(result.totalShortTermGainLoss.toNumber()).toBe(20000000);
    // Long-term: -$10M
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-10000000);
    // Combined via to-schedule-d line: $20M + (-$10M) = $10M
    const schedDLine = result.lines.find((l) => l.line === "to-schedule-d");
    expect(schedDLine?.value.toNumber()).toBe(10000000);
  });
});

describe("Form 8949 - single transaction per category", () => {
  it("exactly one short-term reported transaction, all other boxes empty", () => {
    const input = makeInput([
      makeTx({
        description: "SOLE SHORT-TERM",
        proceeds: "4200",
        costBasis: "3800",
        holdingPeriod: "short",
        basisReportedToIRS: true,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(400);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(400);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });

  it("exactly one long-term unreported transaction, all other boxes empty", () => {
    const input = makeInput([
      makeTx({
        description: "SOLE LONG-TERM UNREPORTED",
        proceeds: "10000",
        costBasis: "12500",
        holdingPeriod: "long",
        basisReportedToIRS: false,
      }),
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(-2500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-2500);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 - empty transactions array", () => {
  it("form1099B with empty transactions array produces zero totals and empty boxes", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{ broker: "EmptyBroker", transactions: [] }],
    };
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    // Wash sale line should be zero
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine?.value.toNumber()).toBe(0);
    // Schedule D flow line should be zero
    const schedDLine = result.lines.find((l) => l.line === "to-schedule-d");
    expect(schedDLine?.value.toNumber()).toBe(0);
  });

  it("multiple brokers all with empty transactions still produces valid result", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        { broker: "Broker A", transactions: [] },
        { broker: "Broker B", transactions: [] },
        { broker: "Broker C", transactions: [] },
      ],
    };
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    expect(result.lines.every((l) => l.form === "Form 8949")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// New Tests: Schedule D net effect, special asset types, audit trail
// ═══════════════════════════════════════════════════════════

const c2025 = getConstants(2025);

function makeSchedDFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    form1099B: [],
    form1099Div: [],
    scheduleK1: [],
    ...overrides,
  };
}

describe("Form 8949 + Schedule D - short-term gain and long-term loss net effect", () => {
  it("ST gain of $8K and LT loss of $10K net to -$2K on Schedule D with full deduction and no carryforward", () => {
    // Form 8949: ST gain stays in Box A, LT loss stays in Box D — no cross-period netting
    // Schedule D: combines them → net -$2K, deduction capped at -$3K (so full -$2K allowed), no carryforward
    const input = makeSchedDFixture({
      form1099B: [
        {
          broker: "TD Ameritrade",
          transactions: [
            makeTx({
              description: "NVDA short-term gain",
              proceeds: "18000",
              costBasis: "10000",
              holdingPeriod: "short",
              basisReportedToIRS: true,
            }),
            makeTx({
              description: "META long-term loss",
              proceeds: "5000",
              costBasis: "15000",
              holdingPeriod: "long",
              basisReportedToIRS: true,
            }),
          ],
        },
      ],
    });

    const form8949 = calculateForm8949(input);
    // Form 8949 preserves each period independently
    expect(form8949.totalShortTermGainLoss.toNumber()).toBe(8000);
    expect(form8949.totalLongTermGainLoss.toNumber()).toBe(-10000);

    const schedD = calculateScheduleD(input, "single", c2025);
    // Schedule D nets: $8K ST + (-$10K LT) = -$2K
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(-2000);
    // -$2K is within the $3K cap so full -$2K is deductible
    expect(schedD.capitalLossDeduction.toNumber()).toBe(-2000);
    // No carryforward because the entire loss was absorbed within the $3K cap
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(0);
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Form 8949 + Schedule D - all gains scenario produces zero carryforward", () => {
  it("portfolio with only gains across all holding periods has zero carryforward on Schedule D", () => {
    const input = makeSchedDFixture({
      form1099B: [
        {
          broker: "Vanguard",
          transactions: [
            makeTx({ description: "VOO ST",  proceeds: "12000", costBasis: "10000", holdingPeriod: "short", basisReportedToIRS: true }),
            makeTx({ description: "BND LT",  proceeds: "9000",  costBasis: "7500",  holdingPeriod: "long",  basisReportedToIRS: true }),
            makeTx({ description: "VTI LT",  proceeds: "20000", costBasis: "14000", holdingPeriod: "long",  basisReportedToIRS: false }),
          ],
        },
      ],
    });

    const form8949 = calculateForm8949(input);
    // All transactions are gains
    expect(form8949.totalShortTermGainLoss.toNumber()).toBeGreaterThan(0);
    expect(form8949.totalLongTermGainLoss.toNumber()).toBeGreaterThan(0);

    const schedD = calculateScheduleD(input, "single", c2025);
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(9500); // $2K ST + $1.5K + $6K LT
    // Positive net — full gain passes through, no carryforward
    expect(schedD.capitalLossDeduction.toNumber()).toBe(9500);
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(0);
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Form 8949 + Schedule D - all losses scenario applies $3K cap and creates carryforward", () => {
  it("portfolio with only long-term losses of $20K caps deduction at $3K and carries forward $17K", () => {
    const input = makeSchedDFixture({
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            makeTx({ description: "ARKK loss 1", proceeds: "5000",  costBasis: "15000", holdingPeriod: "long", basisReportedToIRS: true }),
            makeTx({ description: "ARKK loss 2", proceeds: "2000",  costBasis: "12000", holdingPeriod: "long", basisReportedToIRS: true }),
          ],
        },
      ],
    });

    const form8949 = calculateForm8949(input);
    // Both transactions are losses
    expect(form8949.totalLongTermGainLoss.toNumber()).toBe(-20000);
    expect(form8949.totalShortTermGainLoss.toNumber()).toBe(0);

    const schedD = calculateScheduleD(input, "single", c2025);
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(-20000);
    // Deduction capped at -$3K
    expect(schedD.capitalLossDeduction.toNumber()).toBe(-3000);
    // $17K carries forward as long-term
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(-17000);
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(0);
  });
});

describe("Form 8949 - inherited property stepped-up basis with gain", () => {
  it("inherited stock sold above date-of-death FMV uses Box E (basis not reported) and records long-term gain", () => {
    // Inherited property always qualifies as long-term regardless of holding period.
    // The estate's stepped-up basis (FMV at death) is typically not reported to the IRS
    // by the broker, so it lands in Box E. Any appreciation above stepped-up basis is gain.
    const input = makeInput([
      makeTx({
        description: "Berkshire Hathaway inherited 50 shares",
        dateAcquired: "VARIOUS",   // date of decedent's death
        dateSold: "2025-09-15",
        proceeds: "175000",
        costBasis: "150000",      // stepped-up basis = FMV at date of death
        holdingPeriod: "long",    // inherited property is always long-term (IRC §1223(11))
        basisReportedToIRS: false, // estate/executor sets basis; broker doesn't report it
        adjustments: "0",
      }),
    ]);

    const result = calculateForm8949(input);
    // Should be in Box E (long-term, basis not reported)
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);

    const tx = result.longTermBoxE.transactions[0];
    expect(tx.description).toContain("inherited");
    expect(tx.proceeds.toNumber()).toBe(175000);
    expect(tx.costBasis.toNumber()).toBe(150000);
    expect(tx.gainLoss.toNumber()).toBe(25000); // appreciation above stepped-up basis

    expect(result.totalLongTermGainLoss.toNumber()).toBe(25000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 - same-day purchase and sale (day trading)", () => {
  it("stock purchased and sold on the same day is short-term with gain calculated correctly", () => {
    // Day trades: dateAcquired === dateSold, always short-term
    const sameDay = "2025-07-14";
    const input = makeInput([
      makeTx({
        description: "SPY day trade 100 shares",
        dateAcquired: sameDay,
        dateSold: sameDay,
        proceeds: "55000",
        costBasis: "54200",
        holdingPeriod: "short",
        basisReportedToIRS: true,
        adjustments: "0",
      }),
      makeTx({
        description: "QQQ day trade 50 shares",
        dateAcquired: sameDay,
        dateSold: sameDay,
        proceeds: "21000",
        costBasis: "21500",
        holdingPeriod: "short",
        basisReportedToIRS: true,
        adjustments: "0",
      }),
    ]);

    const result = calculateForm8949(input);
    // Both land in Box A (short-term, basis reported)
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    expect(result.longTermBoxD.transactions).toHaveLength(0);

    const [spy, qqq] = result.shortTermBoxA.transactions;
    // Verify same-day dates are preserved
    expect(spy.dateAcquired).toBe(sameDay);
    expect(spy.dateSold).toBe(sameDay);
    expect(spy.gainLoss.toNumber()).toBe(800);

    expect(qqq.gainLoss.toNumber()).toBe(-500);

    // Net short-term: $800 - $500 = $300
    expect(result.totalShortTermGainLoss.toNumber()).toBe(300);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 - multiple brokers with overlapping securities", () => {
  it("same security sold through three different brokers aggregates correctly without cross-contamination", () => {
    // Taxpayer holds AAPL through three brokers; each sells at a different time and price.
    // All transactions should aggregate to their respective boxes independently.
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            makeTx({ description: "AAPL",  proceeds: "30000", costBasis: "20000", holdingPeriod: "long",  basisReportedToIRS: true }),
          ],
        },
        {
          broker: "Schwab",
          transactions: [
            makeTx({ description: "AAPL",  proceeds: "28000", costBasis: "25000", holdingPeriod: "long",  basisReportedToIRS: true }),
            makeTx({ description: "AAPL",  proceeds: "5000",  costBasis: "6000",  holdingPeriod: "short", basisReportedToIRS: true }),
          ],
        },
        {
          broker: "Robinhood",
          transactions: [
            makeTx({ description: "AAPL",  proceeds: "12000", costBasis: "10000", holdingPeriod: "short", basisReportedToIRS: true }),
            makeTx({ description: "AAPL",  proceeds: "9000",  costBasis: "11000", holdingPeriod: "long",  basisReportedToIRS: false }),
          ],
        },
      ],
    };

    const result = calculateForm8949(input);
    // Box A: 2 short-term reported ($5K loss + $2K gain = $1K net)
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1000); // -$1K + $2K

    // Box D: 2 long-term reported ($10K + $3K = $13K gain)
    expect(result.longTermBoxD.transactions).toHaveLength(2);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(13000);

    // Box E: 1 long-term unreported (-$2K loss)
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(-2000);

    // Total long-term: $13K - $2K = $11K
    expect(result.totalLongTermGainLoss.toNumber()).toBe(11000);
  });
});

describe("Form 8949 + Schedule D - QSBS Section 1202 exclusion reduces long-term gain", () => {
  it("$5M of QSBS gain reported on 1099-DIV Box 2c is excluded via Schedule D Line 13", () => {
    // IRC §1202: up to $10M (or 10× basis) of gain from qualified small-business stock held 5+ years
    // is excluded from income. The gain first flows through 1099-DIV Box 2c into Schedule D Line 13.
    const input = makeSchedDFixture({
      form1099B: [
        {
          broker: "E*Trade",
          transactions: [
            // The QSBS sale is recorded on Form 8949 as a normal LT transaction;
            // the exclusion happens on Schedule D Line 13 via 1099-DIV.
            makeTx({ description: "Startup Corp QSBS", proceeds: "6000000", costBasis: "1000000", holdingPeriod: "long", basisReportedToIRS: false }),
          ],
        },
      ],
      form1099Div: [
        {
          payer: "E*Trade",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          totalCapitalGainDistributions: "0",
          section1250Gain: "0",
          section1202Gain: "5000000", // Box 2c: $5M eligible for §1202 exclusion
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          exemptInterestDividends: "0",
        },
      ],
    });

    // Form 8949 records the full gain without any exclusion
    const form8949 = calculateForm8949(input);
    expect(form8949.totalLongTermGainLoss.toNumber()).toBe(5000000);

    // Schedule D applies the §1202 exclusion: net LT = $5M gain - $5M exclusion = $0
    const schedD = calculateScheduleD(input, "single", c2025);
    expect(schedD.section1202Exclusion.toNumber()).toBe(5000000);
    expect(schedD.netLongTerm.toNumber()).toBe(0); // $5M - $5M exclusion
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(0);
    expect(schedD.capitalLossDeduction.toNumber()).toBe(0);
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Form 8949 - collectibles (28% rate) transactions flow through as long-term", () => {
  it("sale of gold coins and art appears in Box E (long-term, basis not reported) with correct gain", () => {
    // Collectibles (coins, art, antiques, etc.) are taxed at a maximum 28% rate per IRC §1(h)(5).
    // They are reported on Form 8949 as long-term transactions; the 28% rate itself is
    // applied on the Unrecaptured §1250 / collectibles worksheet, not on Form 8949.
    // Brokers typically don't track collectibles basis so Box E is the natural landing spot.
    const input = makeInput([
      makeTx({
        description: "Gold American Eagle coins 10 oz",
        dateAcquired: "2015-03-01",
        dateSold: "2025-10-01",
        proceeds: "22000",
        costBasis: "12000",
        holdingPeriod: "long",
        basisReportedToIRS: false, // collectibles: broker does not report cost basis
        adjustments: "0",
      }),
      makeTx({
        description: "Original oil painting",
        dateAcquired: "2016-06-15",
        dateSold: "2025-11-20",
        proceeds: "45000",
        costBasis: "30000",
        holdingPeriod: "long",
        basisReportedToIRS: false,
        adjustments: "0",
      }),
    ]);

    const result = calculateForm8949(input);
    // Both should be in Box E (long-term, basis not reported to IRS)
    expect(result.longTermBoxE.transactions).toHaveLength(2);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);

    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(25000); // $10K + $15K
    expect(result.totalLongTermGainLoss.toNumber()).toBe(25000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 - options and derivatives expiring worthless", () => {
  it("call option that expires worthless produces short-term loss equal to the premium paid", () => {
    // When an option expires worthless, the holder's loss equals the premium paid.
    // Proceeds = $0 (no sale; the option simply expires).
    // Holding period is short if the option was held less than 1 year.
    // Per IRC §1234(a), the character follows the option's holding period, not the underlying.
    const input = makeInput([
      makeTx({
        description: "TSLA Jan 2025 $400 call option 10 contracts",
        dateAcquired: "2024-11-01",
        dateSold: "2025-01-17",     // expiration date
        proceeds: "0",              // expired worthless
        costBasis: "3500",          // premium paid for 10 contracts
        holdingPeriod: "short",     // held ~77 days < 1 year
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      }),
      makeTx({
        description: "AAPL Feb 2025 $220 put option 5 contracts",
        dateAcquired: "2024-12-15",
        dateSold: "2025-02-21",     // expiration date
        proceeds: "0",              // expired worthless
        costBasis: "1200",
        holdingPeriod: "short",
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      }),
    ]);

    const result = calculateForm8949(input);
    // Both options expire worthless → short-term losses in Box A
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    expect(result.longTermBoxD.transactions).toHaveLength(0);

    const [tsla, aapl] = result.shortTermBoxA.transactions;
    expect(tsla.proceeds.toNumber()).toBe(0);
    expect(tsla.costBasis.toNumber()).toBe(3500);
    expect(tsla.gainLoss.toNumber()).toBe(-3500);

    expect(aapl.proceeds.toNumber()).toBe(0);
    expect(aapl.gainLoss.toNumber()).toBe(-1200);

    expect(result.totalShortTermGainLoss.toNumber()).toBe(-4700);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 8949 + Schedule D - capital gain distributions from mutual funds flow through", () => {
  it("1099-DIV Box 2a capital gain distributions increase Schedule D Line 15 long-term gain", () => {
    // Mutual fund capital gain distributions are reported on 1099-DIV Box 2a.
    // They are treated as long-term capital gains and added to Schedule D Line 15.
    // They do NOT appear on Form 8949 because the fund, not the taxpayer, sold the securities.
    const input = makeSchedDFixture({
      form1099B: [],  // no direct stock sales
      form1099Div: [
        {
          payer: "Vanguard Total Stock Market",
          ordinaryDividends: "4000",
          qualifiedDividends: "3500",
          totalCapitalGainDistributions: "8500", // Box 2a
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          exemptInterestDividends: "0",
        },
        {
          payer: "Fidelity Contrafund",
          ordinaryDividends: "1200",
          qualifiedDividends: "1000",
          totalCapitalGainDistributions: "3200", // Box 2a
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "0",
          exemptInterestDividends: "0",
        },
      ],
    });

    // Form 8949 has nothing (no 1099-B transactions)
    const form8949 = calculateForm8949(input);
    expect(form8949.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(form8949.totalLongTermGainLoss.toNumber()).toBe(0);

    // Schedule D adds 1099-DIV Box 2a distributions to Line 15 long-term
    const schedD = calculateScheduleD(input, "single", c2025);
    expect(schedD.netShortTerm.toNumber()).toBe(0);
    // $8,500 + $3,200 = $11,700 of cap gain distributions added to LT
    expect(schedD.netLongTerm.toNumber()).toBe(11700);
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(11700);
    // Positive gain — passes through fully
    expect(schedD.capitalLossDeduction.toNumber()).toBe(11700);
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Form 8949 - audit trail tracks all transaction-level adjustments", () => {
  it("audit lines record wash sale total, per-box summaries, and Schedule D flow for a mixed portfolio", () => {
    // Comprehensive portfolio: ST wash sale, LT gain, and LT unreported loss
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Interactive Brokers",
          transactions: [
            // Short-term wash sale: $4K proceeds, $7K basis, $3K disallowed
            makeTx({
              description: "AMD wash sale",
              proceeds: "4000",
              costBasis: "7000",
              holdingPeriod: "short",
              basisReportedToIRS: true,
              washSale: true,
              washSaleDisallowed: "3000",
            }),
            // Long-term gain: basis reported
            makeTx({
              description: "GOOGL long-term gain",
              proceeds: "25000",
              costBasis: "18000",
              holdingPeriod: "long",
              basisReportedToIRS: true,
            }),
            // Long-term loss: basis not reported
            makeTx({
              description: "Crypto fund long-term loss",
              proceeds: "3000",
              costBasis: "5000",
              holdingPeriod: "long",
              basisReportedToIRS: false,
            }),
          ],
        },
      ],
    };

    const result = calculateForm8949(input);

    // ── Box-level checks ──────────────────────────────────
    // Box A: AMD wash sale; loss -$3K + $3K disallowed = $0
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxA.transactions[0].adjustment.toNumber()).toBe(3000);
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(0);

    // Box D: GOOGL gain $7K
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions[0].gainLoss.toNumber()).toBe(7000);

    // Box E: Crypto loss -$2K
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions[0].gainLoss.toNumber()).toBe(-2000);

    // ── Audit trail checks ────────────────────────────────
    const lineIds = result.lines.map((l) => l.line);

    // All standard audit line IDs are present
    expect(lineIds).toContain("Part I Box A");
    expect(lineIds).toContain("Part I Box B");
    expect(lineIds).toContain("Part I totals");
    expect(lineIds).toContain("Part II Box D");
    expect(lineIds).toContain("Part II Box E");
    expect(lineIds).toContain("Part II totals");
    expect(lineIds).toContain("adjustment-W");
    expect(lineIds).toContain("to-schedule-d");

    // Wash sale audit line totals $3K disallowed
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine?.value.toNumber()).toBe(3000);

    // Part I totals = $0 (the wash sale nets to $0)
    const partILine = result.lines.find((l) => l.line === "Part I totals");
    expect(partILine?.value.toNumber()).toBe(0);

    // Part II totals = $7K - $2K = $5K
    const partIILine = result.lines.find((l) => l.line === "Part II totals");
    expect(partIILine?.value.toNumber()).toBe(5000);

    // to-schedule-d = $0 + $5K = $5K
    const schedDLine = result.lines.find((l) => l.line === "to-schedule-d");
    expect(schedDLine?.value.toNumber()).toBe(5000);

    // All audit lines belong to Form 8949
    expect(result.lines.every((l) => l.form === "Form 8949")).toBe(true);
  });
});

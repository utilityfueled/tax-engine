/**
 * Tests for Form 8949 — Sales and Other Dispositions of Capital Assets
 * Spec: spec/federal/form-8949.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8949 } from "@/engine/forms/form-8949.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

function make8949Fixture(brokerForms: TaxYearInput["form1099B"]): TaxYearInput {
  return { ...simpleW2Fixture, form1099B: brokerForms };
}

// ═══════════════════════════════════════════════════════════
// Part I: Short-Term
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Part I - Short-Term", () => {
  it("Form 8949 Part I Box A - short-term basis reported", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL 10 shares",
            dateAcquired: "2025-01-15",
            dateSold: "2025-06-01",
            proceeds: "2000",
            costBasis: "1500",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(500);
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(1500);
  });

  it("Form 8949 Part I Box B - short-term basis not reported", () => {
    const input = make8949Fixture([
      {
        broker: "Schwab",
        transactions: [
          {
            description: "BTC 0.5",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-01",
            proceeds: "30000",
            costBasis: "25000",
            holdingPeriod: "short",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(5000);
  });

  it("Form 8949 Part I totals - short-term summary", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Stock A", dateAcquired: "2025-01-01", dateSold: "2025-03-01",
            proceeds: "5000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Stock B", dateAcquired: "2025-02-01", dateSold: "2025-04-01",
            proceeds: "3000", costBasis: "3500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Stock A: +1000, Stock B: -500, Total: +500
    expect(result.totalShortTermGainLoss.toNumber()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Long-Term
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Part II - Long-Term", () => {
  it("Form 8949 Part II Box D - long-term basis reported", () => {
    const input = make8949Fixture([
      {
        broker: "Vanguard",
        transactions: [
          {
            description: "VTI 200 shares", dateAcquired: "2020-06-15", dateSold: "2025-08-01",
            proceeds: "60000", costBasis: "40000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(20000);
  });

  it("Form 8949 Part II Box E - long-term basis not reported", () => {
    const input = make8949Fixture([
      {
        broker: "Legacy Broker",
        transactions: [
          {
            description: "Old Stock", dateAcquired: "2010-01-01", dateSold: "2025-07-01",
            proceeds: "10000", costBasis: "2000", holdingPeriod: "long",
            basisReportedToIRS: false, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(8000);
  });

  it("Form 8949 Part II totals - long-term summary", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Stock X", dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "15000", costBasis: "10000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Stock Y", dateAcquired: "2019-05-01", dateSold: "2025-03-01",
            proceeds: "8000", costBasis: "12000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Stock X: +5000, Stock Y: -4000, Total: +1000
    expect(result.totalLongTermGainLoss.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sales
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Wash Sales", () => {
  it("Form 8949 wash sale adjustment", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "MSFT 50 shares (wash sale)",
            dateAcquired: "2025-01-10",
            dateSold: "2025-02-15",
            proceeds: "8000",
            costBasis: "10000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: true,
            washSaleDisallowed: "2000",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.adjustmentCode).toBe("W");
    expect(tx.adjustment.toNumber()).toBe(2000);
    // Gain/loss: 8000 - 10000 + 2000 = 0 (loss disallowed)
    expect(tx.gainLoss.toNumber()).toBe(0);
  });

  it("Form 8949 wash sale - partial disallowance", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "GOOG 20 shares",
            dateAcquired: "2025-03-01",
            dateSold: "2025-04-15",
            proceeds: "5000",
            costBasis: "8000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: true,
            washSaleDisallowed: "1500",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    // Gain/loss: 5000 - 8000 + 1500 = -1500 (partial loss allowed)
    expect(tx.gainLoss.toNumber()).toBe(-1500);
  });
});

// ═══════════════════════════════════════════════════════════
// Multi-broker, mixed transactions
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Multi-broker scenarios", () => {
  it("Form 8949 totals flow to Schedule D", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Short gain", dateAcquired: "2025-01-01", dateSold: "2025-03-01",
            proceeds: "5000", costBasis: "3000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Long gain", dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "20000", costBasis: "10000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
      {
        broker: "Schwab",
        transactions: [
          {
            description: "Short loss", dateAcquired: "2025-02-01", dateSold: "2025-05-01",
            proceeds: "4000", costBasis: "6000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Short: +2000 + (-2000) = 0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Long: +10000
    expect(result.totalLongTermGainLoss.toNumber()).toBe(10000);
  });

  it("complex MFJ fixture produces correct Form 8949", () => {
    const result = calculateForm8949(complexMFJFixture);
    // From fixture: AAPL long gain +10000, TSLA short loss -2000
    expect(result.totalLongTermGainLoss.toNumber()).toBe(10000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-2000);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
  });

  it("Form 8949 - empty transactions", () => {
    const input = make8949Fixture([]);
    const result = calculateForm8949(input);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - audit trail", () => {
  it("produces audit trail for all categories", () => {
    const result = calculateForm8949(complexMFJFixture);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("Part I Box A");
    expect(lineIds).toContain("Part I Box B");
    expect(lineIds).toContain("Part I totals");
    expect(lineIds).toContain("Part II Box D");
    expect(lineIds).toContain("Part II Box E");
    expect(lineIds).toContain("Part II totals");
    expect(lineIds).toContain("adjustment-W");
    expect(lineIds).toContain("to-schedule-d");
  });
});

// ═══════════════════════════════════════════════════════════
// Many Transactions
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Many Transactions", () => {
  it("Form 8949 handles 10+ transactions across short and long term", () => {
    const transactions = [];
    // 6 short-term transactions: alternating gains and losses
    for (let i = 0; i < 6; i++) {
      transactions.push({
        description: `Short Stock ${i}`,
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: String(1000 + i * 100),
        costBasis: String(i % 2 === 0 ? 800 : 1200),
        holdingPeriod: "short" as const,
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      });
    }
    // 6 long-term transactions
    for (let i = 0; i < 6; i++) {
      transactions.push({
        description: `Long Stock ${i}`,
        dateAcquired: "2020-01-01",
        dateSold: "2025-06-01",
        proceeds: String(5000 + i * 500),
        costBasis: String(3000),
        holdingPeriod: "long" as const,
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      });
    }
    const input = make8949Fixture([{ broker: "Fidelity", transactions }]);
    const result = calculateForm8949(input);

    expect(result.shortTermBoxA.transactions).toHaveLength(6);
    expect(result.longTermBoxD.transactions).toHaveLength(6);

    // Short-term: proceeds = 1000+1100+1200+1300+1400+1500 = 7500
    // Short-term: cost = 800+1200+800+1200+800+1200 = 6000
    // Short-term gain = 7500 - 6000 = 1500
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(7500);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(6000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1500);

    // Long-term: proceeds = 5000+5500+6000+6500+7000+7500 = 37500
    // Long-term: cost = 3000*6 = 18000
    // Long-term gain = 37500 - 18000 = 19500
    expect(result.longTermBoxD.totalProceeds.toNumber()).toBe(37500);
    expect(result.longTermBoxD.totalCostBasis.toNumber()).toBe(18000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(19500);
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sale Adjustments (additional scenarios)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Wash Sale Edge Cases", () => {
  it("Form 8949 wash sale - full disallowance equals entire loss", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "NVDA 100 shares (full wash)",
            dateAcquired: "2025-03-01",
            dateSold: "2025-03-20",
            proceeds: "7000",
            costBasis: "10000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: true,
            washSaleDisallowed: "3000", // entire loss disallowed
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.adjustmentCode).toBe("W");
    expect(tx.adjustment.toNumber()).toBe(3000);
    // 7000 - 10000 + 3000 = 0 (full loss disallowed)
    expect(tx.gainLoss.toNumber()).toBe(0);
  });

  it("Form 8949 wash sale - long-term with partial disallowance", () => {
    const input = make8949Fixture([
      {
        broker: "Vanguard",
        transactions: [
          {
            description: "AMZN 5 shares (wash)",
            dateAcquired: "2022-01-15",
            dateSold: "2025-06-01",
            proceeds: "15000",
            costBasis: "20000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: true,
            washSaleDisallowed: "2000",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.longTermBoxD.transactions[0];
    expect(tx.adjustmentCode).toBe("W");
    expect(tx.adjustment.toNumber()).toBe(2000);
    // 15000 - 20000 + 2000 = -3000
    expect(tx.gainLoss.toNumber()).toBe(-3000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-3000);
  });

  it("Form 8949 wash sale with existing adjustment is additive", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "META 30 shares",
            dateAcquired: "2025-02-01",
            dateSold: "2025-04-01",
            proceeds: "9000",
            costBasis: "12000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "500", // pre-existing adjustment
            washSale: true,
            washSaleDisallowed: "1000",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    // adjustment = 500 (existing) + 1000 (wash sale) = 1500
    expect(tx.adjustment.toNumber()).toBe(1500);
    // 9000 - 12000 + 1500 = -1500
    expect(tx.gainLoss.toNumber()).toBe(-1500);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Cost Basis (gifted stock)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Zero Cost Basis", () => {
  it("Form 8949 gifted stock with $0 cost basis", () => {
    const input = make8949Fixture([
      {
        broker: "Schwab",
        transactions: [
          {
            description: "Gifted MSFT 50 shares",
            dateAcquired: "2018-06-01",
            dateSold: "2025-09-01",
            proceeds: "25000",
            costBasis: "0",
            holdingPeriod: "long",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalCostBasis.toNumber()).toBe(0);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(25000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(25000);
  });
});

// ═══════════════════════════════════════════════════════════
// Fractional Shares
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Fractional Shares", () => {
  it("Form 8949 fractional share sale with precise decimal amounts", () => {
    const input = make8949Fixture([
      {
        broker: "Robinhood",
        transactions: [
          {
            description: "AMZN 0.12345 shares",
            dateAcquired: "2025-01-15",
            dateSold: "2025-05-20",
            proceeds: "22.17",
            costBasis: "19.53",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.proceeds.equals(d("22.17"))).toBe(true);
    expect(tx.costBasis.equals(d("19.53"))).toBe(true);
    // 22.17 - 19.53 = 2.64
    expect(tx.gainLoss.equals(d("2.64"))).toBe(true);
  });

  it("Form 8949 multiple fractional share sales with sub-penny precision", () => {
    const input = make8949Fixture([
      {
        broker: "Robinhood",
        transactions: [
          {
            description: "BRK.B 0.001 shares",
            dateAcquired: "2025-01-01",
            dateSold: "2025-04-01",
            proceeds: "0.45",
            costBasis: "0.38",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "GOOGL 0.005 shares",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-01",
            proceeds: "0.87",
            costBasis: "0.91",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // 0.45 + 0.87 = 1.32
    expect(result.shortTermBoxA.totalProceeds.equals(d("1.32"))).toBe(true);
    // 0.38 + 0.91 = 1.29
    expect(result.shortTermBoxA.totalCostBasis.equals(d("1.29"))).toBe(true);
    // (0.45-0.38) + (0.87-0.91) = 0.07 + (-0.04) = 0.03
    expect(result.totalShortTermGainLoss.equals(d("0.03"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Same-Day Transactions
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Same-Day Transactions", () => {
  it("Form 8949 multiple buy/sell on same date are tracked separately", () => {
    const input = make8949Fixture([
      {
        broker: "Interactive Brokers",
        transactions: [
          {
            description: "SPY lot 1",
            dateAcquired: "2025-03-15",
            dateSold: "2025-03-15",
            proceeds: "5000",
            costBasis: "4900",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "SPY lot 2",
            dateAcquired: "2025-03-15",
            dateSold: "2025-03-15",
            proceeds: "5100",
            costBasis: "5200",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "SPY lot 3",
            dateAcquired: "2025-03-15",
            dateSold: "2025-03-15",
            proceeds: "5050",
            costBasis: "5000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(3);
    // lot 1: +100, lot 2: -100, lot 3: +50 = net +50
    expect(result.totalShortTermGainLoss.toNumber()).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════
// $0 Gain/Loss
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Zero Gain/Loss", () => {
  it("Form 8949 purchase and sale at exactly the same price", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "TSLA 10 shares (breakeven)",
            dateAcquired: "2025-01-10",
            dateSold: "2025-06-10",
            proceeds: "7500",
            costBasis: "7500",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.gainLoss.toNumber()).toBe(0);
    expect(tx.gainLoss.isZero()).toBe(true);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Gains
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Very Large Gains", () => {
  it("Form 8949 $1M+ gains maintain precision", () => {
    const input = make8949Fixture([
      {
        broker: "Goldman Sachs",
        transactions: [
          {
            description: "IPO Stock 50000 shares",
            dateAcquired: "2020-01-01",
            dateSold: "2025-12-01",
            proceeds: "5000000",
            costBasis: "500000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Real Estate Fund Units",
            dateAcquired: "2019-06-15",
            dateSold: "2025-09-01",
            proceeds: "2500000.50",
            costBasis: "1000000.25",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // IPO: 5000000 - 500000 = 4500000
    // Fund: 2500000.50 - 1000000.25 = 1500000.25
    // Total: 6000000.25
    expect(result.longTermBoxD.totalGainLoss.equals(d("6000000.25"))).toBe(true);
    expect(result.totalLongTermGainLoss.equals(d("6000000.25"))).toBe(true);

    // Verify individual transaction precision
    const ipTx = result.longTermBoxD.transactions[0];
    expect(ipTx.gainLoss.equals(d("4500000"))).toBe(true);
    const fundTx = result.longTermBoxD.transactions[1];
    expect(fundTx.gainLoss.equals(d("1500000.25"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Loss - No Capping (Form 8949 passes full loss through)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Net Loss Pass-Through", () => {
  it("Form 8949 does not cap losses - full loss passes through to Schedule D", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Crypto crash position",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "50000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Meme stock loss",
            dateAcquired: "2021-01-01",
            dateSold: "2025-03-01",
            proceeds: "1000",
            costBasis: "30000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Short-term loss: 5000 - 50000 = -45000 (no $3000 cap here)
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-45000);
    // Long-term loss: 1000 - 30000 = -29000 (no cap)
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-29000);
    // Combined: -74000 (Schedule D would cap at -3000, but Form 8949 does not)
    expect(
      result.totalShortTermGainLoss.plus(result.totalLongTermGainLoss).toNumber()
    ).toBe(-74000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Brokers
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Mixed Brokers", () => {
  it("Form 8949 combines transactions from multiple 1099-B sources", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL 20 shares",
            dateAcquired: "2025-01-01",
            dateSold: "2025-04-01",
            proceeds: "4000",
            costBasis: "3000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
      {
        broker: "Schwab",
        transactions: [
          {
            description: "GOOG 5 shares",
            dateAcquired: "2020-06-01",
            dateSold: "2025-06-01",
            proceeds: "15000",
            costBasis: "10000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
      {
        broker: "Robinhood",
        transactions: [
          {
            description: "TSLA 3 shares",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-01",
            proceeds: "600",
            costBasis: "900",
            holdingPeriod: "short",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
      {
        broker: "Vanguard",
        transactions: [
          {
            description: "VTI 100 shares",
            dateAcquired: "2015-01-01",
            dateSold: "2025-07-01",
            proceeds: "30000",
            costBasis: "12000",
            holdingPeriod: "long",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);

    // Box A (short, reported): Fidelity AAPL gain +1000
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(1000);

    // Box B (short, not reported): Robinhood TSLA loss -300
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(-300);

    // Box D (long, reported): Schwab GOOG gain +5000
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(5000);

    // Box E (long, not reported): Vanguard VTI gain +18000
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(18000);

    // Totals
    expect(result.totalShortTermGainLoss.toNumber()).toBe(700);  // 1000 + (-300)
    expect(result.totalLongTermGainLoss.toNumber()).toBe(23000); // 5000 + 18000
  });
});

// ═══════════════════════════════════════════════════════════
// Broker with empty transaction list
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Edge Cases", () => {
  it("Form 8949 broker with zero transactions does not affect totals", () => {
    const input = make8949Fixture([
      {
        broker: "Empty Broker",
        transactions: [],
      },
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Single trade",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "1000",
            costBasis: "800",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(200);
  });

  it("Form 8949 worthless security with $0 proceeds", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Worthless Corp 1000 shares",
            dateAcquired: "2022-01-01",
            dateSold: "2025-12-31",
            proceeds: "0",
            costBasis: "15000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.longTermBoxD.transactions[0];
    expect(tx.proceeds.toNumber()).toBe(0);
    expect(tx.gainLoss.toNumber()).toBe(-15000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-15000);
  });

  it("Form 8949 all six boxes populated simultaneously", () => {
    const input = make8949Fixture([
      {
        broker: "Broker A",
        transactions: [
          {
            description: "ST reported", dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "1000", costBasis: "800", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "ST not reported", dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "2000", costBasis: "1500", holdingPeriod: "short",
            basisReportedToIRS: false, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT reported", dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "5000", costBasis: "3000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT not reported", dateAcquired: "2018-01-01", dateSold: "2025-06-01",
            proceeds: "8000", costBasis: "6000", holdingPeriod: "long",
            basisReportedToIRS: false, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    // ST: 200 + 500 = 700; LT: 2000 + 2000 = 4000
    expect(result.totalShortTermGainLoss.toNumber()).toBe(700);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(4000);
  });

  it("Form 8949 20+ transactions across multiple brokers", () => {
    const brokerA = [];
    const brokerB = [];
    for (let i = 0; i < 12; i++) {
      brokerA.push({
        description: `A-${i}`, dateAcquired: "2025-01-01", dateSold: "2025-06-01",
        proceeds: "1000", costBasis: "900", holdingPeriod: "short" as const,
        basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
      });
    }
    for (let i = 0; i < 10; i++) {
      brokerB.push({
        description: `B-${i}`, dateAcquired: "2020-01-01", dateSold: "2025-06-01",
        proceeds: "5000", costBasis: "4500", holdingPeriod: "long" as const,
        basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
      });
    }
    const input = make8949Fixture([
      { broker: "Broker A", transactions: brokerA },
      { broker: "Broker B", transactions: brokerB },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(12);
    expect(result.longTermBoxD.transactions).toHaveLength(10);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1200); // 12 * 100
    expect(result.totalLongTermGainLoss.toNumber()).toBe(5000); // 10 * 500
  });

  it("Form 8949 wash sale on gain has no effect (gain with wash flag)", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Gain with wash flag",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "3000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: true,
            washSaleDisallowed: "0", // no disallowed amount on a gain
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    // With washSaleDisallowed = 0, adjustment is 0 even though washSale flag is true
    expect(tx.adjustment.toNumber()).toBe(0);
    expect(tx.gainLoss.toNumber()).toBe(2000);
  });

  it("Form 8949 single transaction - exact proceeds equals basis", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Breakeven LT",
            dateAcquired: "2020-06-01",
            dateSold: "2025-06-01",
            proceeds: "10000.50",
            costBasis: "10000.50",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions[0].gainLoss.isZero()).toBe(true);
    expect(result.totalLongTermGainLoss.isZero()).toBe(true);
  });

  it("Form 8949 mixed wash sale and non-wash-sale in same box", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Clean gain", dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "5000", costBasis: "3000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Wash sale loss", dateAcquired: "2025-02-01", dateSold: "2025-04-01",
            proceeds: "2000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "2000",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    // Clean gain: +2000, Wash sale: 2000-4000+2000 = 0 → total +2000
    expect(result.totalShortTermGainLoss.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2000);
  });

  it("Form 8949 audit trail includes wash sale count", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Wash 1", dateAcquired: "2025-01-01", dateSold: "2025-03-01",
            proceeds: "1000", costBasis: "2000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "500",
          },
          {
            description: "Wash 2", dateAcquired: "2025-02-01", dateSold: "2025-04-01",
            proceeds: "3000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "300",
          },
          {
            description: "Clean", dateAcquired: "2025-01-01", dateSold: "2025-05-01",
            proceeds: "5000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const washLine = result.lines.find(l => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.formula).toContain("2 wash sale");
    expect(washLine!.value.toNumber()).toBe(800); // 500 + 300
  });

  it("Form 8949 wash sale with multiple lots across same security", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL lot 1 (wash)", dateAcquired: "2025-01-05", dateSold: "2025-01-25",
            proceeds: "3000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "500",
          },
          {
            description: "AAPL lot 2 (wash)", dateAcquired: "2025-01-10", dateSold: "2025-01-28",
            proceeds: "2500", costBasis: "3500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "700",
          },
          {
            description: "AAPL lot 3 (wash)", dateAcquired: "2025-01-12", dateSold: "2025-02-01",
            proceeds: "1800", costBasis: "2200", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "400",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(3);
    // lot 1: 3000-4000+500 = -500, lot 2: 2500-3500+700 = -300, lot 3: 1800-2200+400 = 0
    expect(result.shortTermBoxA.transactions[0].gainLoss.toNumber()).toBe(-500);
    expect(result.shortTermBoxA.transactions[1].gainLoss.toNumber()).toBe(-300);
    expect(result.shortTermBoxA.transactions[2].gainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(1600); // 500+700+400
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-800);
  });

  it("Form 8949 Box A vs Box D categorization by holding period with basis reported", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Short-term reported", dateAcquired: "2025-03-01", dateSold: "2025-06-01",
            proceeds: "10000", costBasis: "8000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Long-term reported", dateAcquired: "2023-01-01", dateSold: "2025-06-01",
            proceeds: "10000", costBasis: "8000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Same gain amount but different boxes
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions[0].description).toBe("Short-term reported");
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(2000);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions[0].description).toBe("Long-term reported");
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(2000);
    // Boxes B and E should be empty
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
  });

  it("Form 8949 zero proceeds with non-zero cost basis (worthless security)", () => {
    const input = make8949Fixture([
      {
        broker: "Schwab",
        transactions: [
          {
            description: "Bankrupt Inc 500 shares", dateAcquired: "2025-01-15", dateSold: "2025-09-30",
            proceeds: "0", costBasis: "25000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Defunct Corp 200 shares", dateAcquired: "2019-03-01", dateSold: "2025-12-31",
            proceeds: "0", costBasis: "8500.75", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-25000);
    expect(result.longTermBoxD.totalProceeds.toNumber()).toBe(0);
    expect(result.longTermBoxD.totalGainLoss.equals(d("-8500.75"))).toBe(true);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-25000);
    expect(result.totalLongTermGainLoss.equals(d("-8500.75"))).toBe(true);
  });

  it("Form 8949 negative adjustment reduces gain (e.g., previously reported income)", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "ESPP shares with adjustment",
            dateAcquired: "2024-06-01", dateSold: "2025-08-01",
            proceeds: "12000", costBasis: "8000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "-1500", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.longTermBoxD.transactions[0];
    // 12000 - 8000 + (-1500) = 2500
    expect(tx.adjustment.toNumber()).toBe(-1500);
    expect(tx.gainLoss.toNumber()).toBe(2500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(2500);
  });

  it("Form 8949 handles 100+ transactions without precision loss", () => {
    const transactions = [];
    for (let i = 0; i < 150; i++) {
      transactions.push({
        description: `Lot ${i}`,
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "100.01",
        costBasis: "99.99",
        holdingPeriod: "short" as const,
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      });
    }
    const input = make8949Fixture([{ broker: "Fidelity", transactions }]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(150);
    // Each lot: 100.01 - 99.99 = 0.02; 150 * 0.02 = 3.00
    expect(result.totalShortTermGainLoss.equals(d("3"))).toBe(true);
    // 150 * 100.01 = 15001.50
    expect(result.shortTermBoxA.totalProceeds.equals(d("15001.50"))).toBe(true);
    // 150 * 99.99 = 14998.50
    expect(result.shortTermBoxA.totalCostBasis.equals(d("14998.50"))).toBe(true);
  });

  it("Form 8949 mixed short-term and long-term from same broker", () => {
    const input = make8949Fixture([
      {
        broker: "Interactive Brokers",
        transactions: [
          {
            description: "MSFT short", dateAcquired: "2025-02-01", dateSold: "2025-05-01",
            proceeds: "7000", costBasis: "6500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "MSFT long", dateAcquired: "2022-02-01", dateSold: "2025-05-01",
            proceeds: "7000", costBasis: "4000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "AAPL short", dateAcquired: "2025-01-01", dateSold: "2025-04-01",
            proceeds: "3000", costBasis: "3500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "AAPL long", dateAcquired: "2021-01-01", dateSold: "2025-04-01",
            proceeds: "3000", costBasis: "1500", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    expect(result.longTermBoxD.transactions).toHaveLength(2);
    // Short: (7000-6500) + (3000-3500) = 500 + (-500) = 0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Long: (7000-4000) + (3000-1500) = 3000 + 1500 = 4500
    expect(result.totalLongTermGainLoss.toNumber()).toBe(4500);
  });

  it("Form 8949 audit trail wash sale count reflects actual wash transactions in formula", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Wash A", dateAcquired: "2025-01-01", dateSold: "2025-02-01",
            proceeds: "1000", costBasis: "1500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "200",
          },
          {
            description: "Wash B", dateAcquired: "2025-01-15", dateSold: "2025-02-15",
            proceeds: "2000", costBasis: "2800", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "350",
          },
          {
            description: "Wash C", dateAcquired: "2025-02-01", dateSold: "2025-03-01",
            proceeds: "500", costBasis: "900", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: true, washSaleDisallowed: "150",
          },
          {
            description: "Clean D", dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "5000", costBasis: "4000", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const washLine = result.lines.find(l => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    // Formula should contain "3 wash sale transactions" (only 3 of 4 are wash sales)
    expect(washLine!.formula).toContain("3 wash sale");
    // Total disallowed: 200 + 350 + 150 = 700
    expect(washLine!.value.toNumber()).toBe(700);
  });

  it("Form 8949 wash sale on long-term Box E (not reported) categorizes correctly", () => {
    const input = make8949Fixture([
      {
        broker: "Legacy Broker",
        transactions: [
          {
            description: "Old crypto (wash)", dateAcquired: "2018-01-01", dateSold: "2025-06-01",
            proceeds: "5000", costBasis: "12000", holdingPeriod: "long",
            basisReportedToIRS: false, adjustments: "0", washSale: true, washSaleDisallowed: "3000",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Should be in Box E (long-term, not reported)
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    const tx = result.longTermBoxE.transactions[0];
    expect(tx.adjustmentCode).toBe("W");
    expect(tx.adjustment.toNumber()).toBe(3000);
    // 5000 - 12000 + 3000 = -4000
    expect(tx.gainLoss.toNumber()).toBe(-4000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-4000);
  });

  it("Form 8949 non-wash-sale transaction has empty adjustment code", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Normal sale",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "3000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.adjustmentCode).toBe("");
    expect(tx.adjustment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Box A: Short-Term, Basis Reported to IRS (comprehensive)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box A - Short-Term Basis Reported to IRS", () => {
  it("Form 8949 Box A - multiple transactions all column totals are correct", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "AAPL 50 shares",
            dateAcquired: "2025-01-10",
            dateSold: "2025-04-10",
            proceeds: "9500",
            costBasis: "8000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "NVDA 20 shares",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-15",
            proceeds: "12000",
            costBasis: "14000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "META 10 shares",
            dateAcquired: "2025-03-01",
            dateSold: "2025-06-01",
            proceeds: "5500",
            costBasis: "5000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // All three are short-term with basis reported → Box A only
    expect(result.shortTermBoxA.transactions).toHaveLength(3);
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
    // Proceeds: 9500 + 12000 + 5500 = 27000
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(27000);
    // Basis: 8000 + 14000 + 5000 = 27000
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(27000);
    // Gain/loss: 1500 + (-2000) + 500 = 0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Box B: Short-Term, Basis NOT Reported to IRS
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box B - Short-Term Basis Not Reported to IRS", () => {
  it("Form 8949 Box B - multiple transactions with proceeds, basis and gain totals verified", () => {
    const input = make8949Fixture([
      {
        broker: "Coinbase",
        transactions: [
          {
            description: "ETH 2.5",
            dateAcquired: "2025-01-20",
            dateSold: "2025-05-10",
            proceeds: "6250",
            costBasis: "5000",
            holdingPeriod: "short",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "SOL 40",
            dateAcquired: "2025-02-15",
            dateSold: "2025-06-01",
            proceeds: "3200",
            costBasis: "4800",
            holdingPeriod: "short",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.shortTermBoxB.transactions).toHaveLength(2);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    // Proceeds: 6250 + 3200 = 9450
    expect(result.shortTermBoxB.totalProceeds.toNumber()).toBe(9450);
    // Basis: 5000 + 4800 = 9800
    expect(result.shortTermBoxB.totalCostBasis.toNumber()).toBe(9800);
    // Gain/loss: 1250 + (-1600) = -350
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(-350);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-350);
  });
});

// ═══════════════════════════════════════════════════════════
// Box C equivalent: Short-Term, No 1099-B (basis not reported, no broker form)
// Per IRS instructions Box C covers transactions where a 1099-B was not received.
// In this engine that maps to basisReportedToIRS=false (same as Box B path) but
// the test documents the real-world scenario of an asset sold without a broker.
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box C equivalent - Short-Term No 1099-B Received", () => {
  it("Form 8949 Box C scenario - short-term sale with no broker 1099-B routes to Box B bucket", () => {
    // IRS Box C (short-term, no 1099-B) uses basisReportedToIRS=false in this engine
    const input = make8949Fixture([
      {
        broker: "Self-reported",
        transactions: [
          {
            description: "Collectible coins sold privately",
            dateAcquired: "2025-01-05",
            dateSold: "2025-08-15",
            proceeds: "4500",
            costBasis: "2000",
            holdingPeriod: "short",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // No 1099-B received → lands in shortTermBoxB (basis not reported)
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.shortTermBoxB.totalProceeds.toNumber()).toBe(4500);
    expect(result.shortTermBoxB.totalCostBasis.toNumber()).toBe(2000);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(2500);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(2500);
  });
});

// ═══════════════════════════════════════════════════════════
// Box D: Long-Term, Basis Reported to IRS (comprehensive)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box D - Long-Term Basis Reported to IRS", () => {
  it("Form 8949 Box D - all column totals are correct for multiple long-term reported transactions", () => {
    const input = make8949Fixture([
      {
        broker: "Vanguard",
        transactions: [
          {
            description: "VTI 100 shares",
            dateAcquired: "2019-06-01",
            dateSold: "2025-03-01",
            proceeds: "24000",
            costBasis: "18000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "VXUS 50 shares",
            dateAcquired: "2020-01-15",
            dateSold: "2025-07-01",
            proceeds: "3500",
            costBasis: "4000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxD.transactions).toHaveLength(2);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
    // Proceeds: 24000 + 3500 = 27500
    expect(result.longTermBoxD.totalProceeds.toNumber()).toBe(27500);
    // Basis: 18000 + 4000 = 22000
    expect(result.longTermBoxD.totalCostBasis.toNumber()).toBe(22000);
    // Gain/loss: 6000 + (-500) = 5500
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(5500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(5500);
  });
});

// ═══════════════════════════════════════════════════════════
// Box E: Long-Term, Basis NOT Reported to IRS (comprehensive)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box E - Long-Term Basis Not Reported to IRS", () => {
  it("Form 8949 Box E - multiple loss transactions with correct totals", () => {
    const input = make8949Fixture([
      {
        broker: "Self-reported",
        transactions: [
          {
            description: "Rental property units pre-2012",
            dateAcquired: "2008-05-01",
            dateSold: "2025-04-01",
            proceeds: "85000",
            costBasis: "120000",
            holdingPeriod: "long",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Land sold at a loss",
            dateAcquired: "2010-11-01",
            dateSold: "2025-09-01",
            proceeds: "30000",
            costBasis: "45000",
            holdingPeriod: "long",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    expect(result.longTermBoxE.transactions).toHaveLength(2);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    // Proceeds: 85000 + 30000 = 115000
    expect(result.longTermBoxE.totalProceeds.toNumber()).toBe(115000);
    // Basis: 120000 + 45000 = 165000
    expect(result.longTermBoxE.totalCostBasis.toNumber()).toBe(165000);
    // Gain/loss: -35000 + -15000 = -50000
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(-50000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-50000);
  });
});

// ═══════════════════════════════════════════════════════════
// Box F equivalent: Long-Term, No 1099-B Received
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Box F equivalent - Long-Term No 1099-B Received", () => {
  it("Form 8949 Box F scenario - long-term sale with no broker 1099-B routes to Box E bucket", () => {
    // IRS Box F (long-term, no 1099-B) maps to basisReportedToIRS=false in this engine
    const input = make8949Fixture([
      {
        broker: "Estate sale",
        transactions: [
          {
            description: "Inherited farmland",
            dateAcquired: "2005-03-01",
            dateSold: "2025-11-01",
            proceeds: "500000",
            costBasis: "150000",
            holdingPeriod: "long",
            basisReportedToIRS: false,
            adjustments: "0",
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // No 1099-B received → lands in longTermBoxE (basis not reported)
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.longTermBoxE.totalProceeds.toNumber()).toBe(500000);
    expect(result.longTermBoxE.totalCostBasis.toNumber()).toBe(150000);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(350000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(350000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Boxes in a Single Return — All Four Boxes Simultaneously
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Mixed Boxes in Single Return", () => {
  it("Form 8949 all four active boxes in one return with per-box and aggregate totals verified", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          // Box A: short, reported
          {
            description: "MSFT short reported",
            dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "8000", costBasis: "6000",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "AMZN short reported",
            dateAcquired: "2025-03-01", dateSold: "2025-08-01",
            proceeds: "3000", costBasis: "4500",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          // Box B: short, not reported
          {
            description: "Crypto short unreported",
            dateAcquired: "2025-02-01", dateSold: "2025-07-01",
            proceeds: "11000", costBasis: "9000",
            holdingPeriod: "short", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
      {
        broker: "Schwab",
        transactions: [
          // Box D: long, reported
          {
            description: "GOOG long reported",
            dateAcquired: "2021-01-01", dateSold: "2025-05-01",
            proceeds: "20000", costBasis: "12000",
            holdingPeriod: "long", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          // Box E: long, not reported
          {
            description: "Pre-2012 fund long unreported",
            dateAcquired: "2008-06-01", dateSold: "2025-06-01",
            proceeds: "45000", costBasis: "30000",
            holdingPeriod: "long", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);

    // Box A: 2 transactions, proceeds 11000, basis 10500, gain 500
    expect(result.shortTermBoxA.transactions).toHaveLength(2);
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(11000);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(10500);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(500);

    // Box B: 1 transaction, gain 2000
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(2000);

    // Box D: 1 transaction, gain 8000
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(8000);

    // Box E: 1 transaction, gain 15000
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(15000);

    // Aggregates
    expect(result.totalShortTermGainLoss.toNumber()).toBe(2500);  // 500 + 2000
    expect(result.totalLongTermGainLoss.toNumber()).toBe(23000);  // 8000 + 15000
  });
});

// ═══════════════════════════════════════════════════════════
// Totals Aggregation Across All Boxes
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Totals Aggregation Across All Boxes", () => {
  it("Form 8949 combined total of all four boxes equals sum of short-term and long-term totals", () => {
    const input = make8949Fixture([
      {
        broker: "Broker",
        transactions: [
          {
            description: "ST reported gain",
            dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "10000", costBasis: "7000",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "ST not-reported loss",
            dateAcquired: "2025-02-01", dateSold: "2025-07-01",
            proceeds: "2000", costBasis: "4000",
            holdingPeriod: "short", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT reported gain",
            dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "50000", costBasis: "35000",
            holdingPeriod: "long", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT not-reported gain",
            dateAcquired: "2015-01-01", dateSold: "2025-06-01",
            proceeds: "25000", costBasis: "18000",
            holdingPeriod: "long", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);

    // Per-box gains: A=3000, B=-2000, D=15000, E=7000
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(3000);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(-2000);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(15000);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(7000);

    // Short-term total = Box A + Box B = 3000 + (-2000) = 1000
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1000);
    // Long-term total = Box D + Box E = 15000 + 7000 = 22000
    expect(result.totalLongTermGainLoss.toNumber()).toBe(22000);

    // Overall combined total across all boxes
    const combinedTotal = result.totalShortTermGainLoss.plus(result.totalLongTermGainLoss);
    expect(combinedTotal.toNumber()).toBe(23000);
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sale Adjustment Code W — Additional Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Wash Sale Code W - Additional Scenarios", () => {
  it("Form 8949 wash sale code W not set when washSaleDisallowed is zero even with washSale flag true", () => {
    // A transaction flagged as wash sale but with $0 disallowed should have no W code and zero adjustment
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "Wash flag but no disallowance",
            dateAcquired: "2025-01-01", dateSold: "2025-03-01",
            proceeds: "6000", costBasis: "5000",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: true, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    const tx = result.shortTermBoxA.transactions[0];
    expect(tx.adjustmentCode).toBe("");
    expect(tx.adjustment.toNumber()).toBe(0);
    // Gain is pure proceeds minus basis
    expect(tx.gainLoss.toNumber()).toBe(1000);
  });

  it("Form 8949 wash sale in Box B (short, not reported) receives code W and adjustment", () => {
    const input = make8949Fixture([
      {
        broker: "Robinhood",
        transactions: [
          {
            description: "Crypto wash sale unreported",
            dateAcquired: "2025-04-01", dateSold: "2025-06-01",
            proceeds: "8000", costBasis: "11000",
            holdingPeriod: "short", basisReportedToIRS: false,
            adjustments: "0", washSale: true, washSaleDisallowed: "1500",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Lands in Box B, not Box A
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    const tx = result.shortTermBoxB.transactions[0];
    expect(tx.adjustmentCode).toBe("W");
    expect(tx.adjustment.toNumber()).toBe(1500);
    // 8000 - 11000 + 1500 = -1500
    expect(tx.gainLoss.toNumber()).toBe(-1500);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Number of Transactions
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Very Large Number of Transactions", () => {
  it("Form 8949 30 short-term and 20 long-term transactions aggregate totals correctly", () => {
    const shortTransactions = [];
    for (let i = 0; i < 30; i++) {
      shortTransactions.push({
        description: `ST-Lot-${i}`,
        dateAcquired: "2025-01-01",
        dateSold: "2025-09-01",
        proceeds: "500",
        costBasis: "400",
        holdingPeriod: "short" as const,
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      });
    }
    const longTransactions = [];
    for (let i = 0; i < 20; i++) {
      longTransactions.push({
        description: `LT-Lot-${i}`,
        dateAcquired: "2018-01-01",
        dateSold: "2025-09-01",
        proceeds: "2000",
        costBasis: "1200",
        holdingPeriod: "long" as const,
        basisReportedToIRS: true,
        adjustments: "0",
        washSale: false,
        washSaleDisallowed: "0",
      });
    }
    const input = make8949Fixture([
      { broker: "Broker A", transactions: shortTransactions },
      { broker: "Broker B", transactions: longTransactions },
    ]);
    const result = calculateForm8949(input);

    expect(result.shortTermBoxA.transactions).toHaveLength(30);
    expect(result.longTermBoxD.transactions).toHaveLength(20);

    // Short: 30 × 500 = 15000 proceeds, 30 × 400 = 12000 basis, gain = 3000
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(15000);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(12000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(3000);

    // Long: 20 × 2000 = 40000 proceeds, 20 × 1200 = 24000 basis, gain = 16000
    expect(result.longTermBoxD.totalProceeds.toNumber()).toBe(40000);
    expect(result.longTermBoxD.totalCostBasis.toNumber()).toBe(24000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(16000);
  });
});

// ═══════════════════════════════════════════════════════════
// Proceeds and Basis with Fractional Cents
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Proceeds and Basis with Fractional Cents", () => {
  it("Form 8949 fractional-cent proceeds and basis aggregate without floating-point drift", () => {
    // Each transaction has sub-penny amounts; Decimal.js must preserve exact sums
    const input = make8949Fixture([
      {
        broker: "Fractional Broker",
        transactions: [
          {
            description: "Micro lot 1",
            dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "1.001", costBasis: "0.999",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Micro lot 2",
            dateAcquired: "2025-02-01", dateSold: "2025-07-01",
            proceeds: "2.003", costBasis: "1.997",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Micro lot 3",
            dateAcquired: "2025-03-01", dateSold: "2025-08-01",
            proceeds: "3.007", costBasis: "2.993",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);
    // Total proceeds: 1.001 + 2.003 + 3.007 = 6.011
    expect(result.shortTermBoxA.totalProceeds.equals(d("6.011"))).toBe(true);
    // Total basis: 0.999 + 1.997 + 2.993 = 5.989
    expect(result.shortTermBoxA.totalCostBasis.equals(d("5.989"))).toBe(true);
    // Total gain: 0.002 + 0.006 + 0.014 = 0.022
    expect(result.totalShortTermGainLoss.equals(d("0.022"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Verification
// ═══════════════════════════════════════════════════════════

describe("Form 8949 Audit Trail Verification", () => {
  it("Form 8949 audit trail to-schedule-d line value equals sum of all short-term and long-term totals", () => {
    const input = make8949Fixture([
      {
        broker: "Fidelity",
        transactions: [
          {
            description: "ST gain",
            dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "5000", costBasis: "3000",
            holdingPeriod: "short", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT gain",
            dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "12000", costBasis: "8000",
            holdingPeriod: "long", basisReportedToIRS: true,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "ST loss unreported",
            dateAcquired: "2025-02-01", dateSold: "2025-09-01",
            proceeds: "1000", costBasis: "1500",
            holdingPeriod: "short", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT loss unreported",
            dateAcquired: "2019-01-01", dateSold: "2025-09-01",
            proceeds: "6000", costBasis: "9000",
            holdingPeriod: "long", basisReportedToIRS: false,
            adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);

    // ST: 2000 + (-500) = 1500; LT: 4000 + (-3000) = 1000; combined = 2500
    expect(result.totalShortTermGainLoss.toNumber()).toBe(1500);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(1000);

    const schedDLine = result.lines.find((l) => l.line === "to-schedule-d");
    expect(schedDLine).toBeDefined();
    // The to-schedule-d audit line must equal total short + total long
    expect(schedDLine!.value.toNumber()).toBe(2500);
  });

  it("Form 8949 audit trail records correct transaction counts for each box", () => {
    const input = make8949Fixture([
      {
        broker: "Mixed",
        transactions: [
          {
            description: "ST-A-1", dateAcquired: "2025-01-01", dateSold: "2025-06-01",
            proceeds: "1000", costBasis: "800", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "ST-A-2", dateAcquired: "2025-02-01", dateSold: "2025-07-01",
            proceeds: "2000", costBasis: "1500", holdingPeriod: "short",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "ST-B-1", dateAcquired: "2025-01-15", dateSold: "2025-08-01",
            proceeds: "500", costBasis: "600", holdingPeriod: "short",
            basisReportedToIRS: false, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT-D-1", dateAcquired: "2020-01-01", dateSold: "2025-06-01",
            proceeds: "10000", costBasis: "7000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT-D-2", dateAcquired: "2019-06-01", dateSold: "2025-06-01",
            proceeds: "8000", costBasis: "5000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "LT-D-3", dateAcquired: "2018-03-01", dateSold: "2025-06-01",
            proceeds: "4000", costBasis: "6000", holdingPeriod: "long",
            basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
          },
        ],
      },
    ]);
    const result = calculateForm8949(input);

    const boxALine = result.lines.find((l) => l.line === "Part I Box A");
    const boxBLine = result.lines.find((l) => l.line === "Part I Box B");
    const boxDLine = result.lines.find((l) => l.line === "Part II Box D");
    const boxELine = result.lines.find((l) => l.line === "Part II Box E");

    expect(boxALine).toBeDefined();
    expect(boxALine!.formula).toContain("2 transactions");
    expect(boxBLine).toBeDefined();
    expect(boxBLine!.formula).toContain("1 transactions");
    expect(boxDLine).toBeDefined();
    expect(boxDLine!.formula).toContain("3 transactions");
    expect(boxELine).toBeDefined();
    expect(boxELine!.formula).toContain("0 transactions");
  });
});

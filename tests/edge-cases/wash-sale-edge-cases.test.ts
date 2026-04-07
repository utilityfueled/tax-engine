/**
 * Edge case tests for wash sale adjustments through Form 8949 → Schedule D.
 * Tests wash sale disallowed loss, basis adjustment, and multiple wash sales.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8949 } from "@/engine/forms/form-8949.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Wash Sale Adjustment
// ═══════════════════════════════════════════════════════════

describe("Wash sale - Form 8949 adjustment", () => {
  it("wash sale adds disallowed loss as positive adjustment", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "XYZ 100 shares",
          dateAcquired: "2025-01-10",
          dateSold: "2025-03-15",
          proceeds: "8000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "2000",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Without wash sale: $8K - $10K = -$2K loss
    // With wash sale adjustment +$2K: $8K - $10K + $2K = $0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
  });

  it("partial wash sale: only portion disallowed", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "ABC 200 shares (100 repurchased)",
          dateAcquired: "2025-02-01",
          dateSold: "2025-04-01",
          proceeds: "6000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "2000", // Only $2K of $4K loss disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $6K - $10K = -$4K, adjustment: +$2K → net: -$2K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-2000);
  });

  it("wash sale on long-term position", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT stock wash sale",
          dateAcquired: "2023-01-01",
          dateSold: "2025-03-01",
          proceeds: "15000",
          costBasis: "20000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "5000",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $15K - $20K = -$5K, adjustment: +$5K → net: $0
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(0);
  });

  it("multiple wash sales across short and long term", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale",
            dateAcquired: "2025-01-01",
            dateSold: "2025-03-01",
            proceeds: "5000",
            costBasis: "8000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          },
          {
            description: "LT wash sale",
            dateAcquired: "2023-06-01",
            dateSold: "2025-06-01",
            proceeds: "10000",
            costBasis: "14000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "4000",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // ST: $5K - $8K + $3K = $0
    // LT: $10K - $14K + $4K = $0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);

    // Wash sale summary in audit trail
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.value.toNumber()).toBe(7000); // Total disallowed
  });

  it("wash sale flows through to federal capital gain/loss", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Wash sale stock",
          dateAcquired: "2025-01-01",
          dateSold: "2025-04-01",
          proceeds: "7000",
          costBasis: "12000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "3000", // $5K loss, $3K disallowed → $2K allowed
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Reported loss: -$2K (after wash sale)
    expect(federal.capitalGainLoss.toNumber()).toBe(-2000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("non-wash-sale transaction unaffected", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Clean sale",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "15000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(5000);
    expect(result.longTermBoxD.totalAdjustments.toNumber()).toBe(0);
  });
});

describe("Wash sale - combined scenarios", () => {
  it("wash sale combined with gains: net still positive", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Winning trade",
            dateAcquired: "2025-01-01",
            dateSold: "2025-04-01",
            proceeds: "20000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Wash sale loser",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-01",
            proceeds: "5000",
            costBasis: "8000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000", // Full loss disallowed
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Win: +$10K, Wash sale: $5K - $8K + $3K = $0
    // Total ST: $10K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(10000);
  });

  it("zero wash sale disallowed has no effect", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Flagged but zero",
          dateAcquired: "2025-01-01",
          dateSold: "2025-03-01",
          proceeds: "8000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-2000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sale Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Wash sale - federal pipeline", () => {
  it("wash sale loss disallowed exceeds annual $3K deduction limit", () => {
    // Large wash sale that would create a big carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Big wash sale",
          dateAcquired: "2025-01-01",
          dateSold: "2025-06-01",
          proceeds: "50000",
          costBasis: "80000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "20000", // $30K loss, $20K disallowed → $10K allowed
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Net ST loss: -$10K. Capped at -$3K deduction.
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // Carryforward: -$7K
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Basis Not Reported (Box B / Box E)
// ═══════════════════════════════════════════════════════════

describe("Form 8949 - basis not reported categorization", () => {
  it("wash sale with gain (disallowed amount on losing share, but net gain)", () => {
    // Taxpayer sold at a loss, repurchased, and sold again at a gain
    // The wash sale flag is on the loss transaction
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Loss sale (wash)",
            dateAcquired: "2025-01-01",
            dateSold: "2025-02-01",
            proceeds: "9000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1000", // Full loss disallowed
          },
          {
            description: "Repurchase sale (gain)",
            dateAcquired: "2025-02-05",
            dateSold: "2025-05-01",
            proceeds: "13000",
            costBasis: "10000", // Basis not yet adjusted in 1099-B
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $9K - $10K + $1K = $0 (wash sale nullified)
    // Gain: $13K - $10K = $3K
    // Net ST: $3K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(3000);
  });

  it("wash sale across multiple brokers", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Broker A",
          transactions: [{
            description: "Loss at Broker A",
            dateAcquired: "2025-01-01",
            dateSold: "2025-03-01",
            proceeds: "4000",
            costBasis: "6000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          }],
        },
        {
          broker: "Broker B",
          transactions: [{
            description: "Gain at Broker B",
            dateAcquired: "2025-02-01",
            dateSold: "2025-05-01",
            proceeds: "15000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          }],
        },
      ],
    };
    const result = calculateForm8949(fixture);
    // Broker A: $4K - $6K + $2K = $0
    // Broker B: $15K - $10K = $5K
    // Total ST: $5K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(5000);
  });

  it("unreported basis goes to Box B (short-term) or Box E (long-term)", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST no basis",
            dateAcquired: "2025-01-01",
            dateSold: "2025-03-01",
            proceeds: "5000",
            costBasis: "4000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: false,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "LT no basis",
            dateAcquired: "2010-01-01",
            dateSold: "2025-06-01",
            proceeds: "20000",
            costBasis: "5000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: false,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(1000);
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(15000);
    // Box A and D should be empty
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.longTermBoxD.transactions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Wash sale - additional edge cases", () => {
  it("minimal $1 wash sale disallowed amount applies correctly", () => {
    // Edge case: smallest meaningful disallowed amount
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Nearly break-even wash sale",
          dateAcquired: "2025-01-15",
          dateSold: "2025-03-15",
          proceeds: "9999",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "1", // Only $1 disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $9999 - $10000 = -$1; adjustment: +$1 → net: $0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(1);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
  });

  it("wash sale on a position with net gain: disallowed amount still adds to adjustment", () => {
    // washSale=true but proceeds > costBasis — disallowed still bumps the gain higher
    // This models a broker erroneously or edge-case flagging a gain transaction
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Gain transaction flagged as wash sale",
          dateAcquired: "2025-02-01",
          dateSold: "2025-05-01",
          proceeds: "12000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "500", // Adds to adjustment even on a gain
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Gain: $12000 - $10000 = $2000; adjustment: +$500 → net: $2500
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(2500);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(500);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
  });

  it("all transactions in portfolio are wash sales: total gain/loss is zero", () => {
    // Every single transaction is a fully-disallowed wash sale
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Wash sale 1",
            dateAcquired: "2025-01-01",
            dateSold: "2025-02-01",
            proceeds: "8000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "Wash sale 2",
            dateAcquired: "2025-02-15",
            dateSold: "2025-04-01",
            proceeds: "5000",
            costBasis: "7000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "Wash sale 3 (long-term)",
            dateAcquired: "2023-03-01",
            dateSold: "2025-05-01",
            proceeds: "20000",
            costBasis: "25000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "5000",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // All losses fully disallowed: each nets to $0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(0);
    // All 3 are wash sales; total disallowed = $2K + $2K + $5K = $9K
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.value.toNumber()).toBe(9000);
  });

  it("very large wash sale ($1M+ loss, $500K disallowed): correct partial loss allowed", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Large position crash",
          dateAcquired: "2025-01-01",
          dateSold: "2025-09-01",
          proceeds: "500000",
          costBasis: "1600000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "500000", // Half of $1.1M loss disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $500K - $1.6M = -$1.1M; adjustment: +$500K → net: -$600K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-600000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(500000);

    // Federal pipeline: -$600K ST loss → capped at -$3K deduction, $597K carryforward
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-597000);
  });

  it("wash sale with basis-not-reported (Box B): categorized correctly and gain/loss net is right", () => {
    // basisReportedToIRS: false → goes to Box B (short-term) even with wash sale
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Old shares, basis not reported",
          dateAcquired: "2019-06-01",
          dateSold: "2025-03-01",
          proceeds: "4000",
          costBasis: "6000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: false, // Basis not reported → Box B
          washSale: true,
          washSaleDisallowed: "1500",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Loss: $4K - $6K = -$2K; wash sale adjustment: +$1.5K → net: -$500
    expect(result.shortTermBoxB.transactions).toHaveLength(1);
    expect(result.shortTermBoxB.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxB.totalGainLoss.toNumber()).toBe(-500);
    expect(result.shortTermBoxB.totalAdjustments.toNumber()).toBe(1500);
    // Box A should remain empty
    expect(result.shortTermBoxA.transactions).toHaveLength(0);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-500);
  });

  it("MFS filer: wash sale loss capped at $1,500 instead of $3,000", () => {
    // Married Filing Separately filer hits the $1,500 capital loss limit
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "MFS wash sale partial loss",
          dateAcquired: "2025-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "50000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "10000", // $20K loss, $10K disallowed → $10K allowed
        }],
      }],
    };
    const federal = calculateFederalTax(mfsFixture);
    // Net ST loss after wash sale: $30K - $50K + $10K = -$10K
    // MFS cap: $1,500 (not $3,000)
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
    // Carryforward: -$8,500
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-8500);
  });
});

// ═══════════════════════════════════════════════════════════
// New Edge Cases (items 1–7)
// ═══════════════════════════════════════════════════════════

describe("Wash sale - multiple wash sales totaling more than $3K annual loss limit", () => {
  it("multiple wash sales whose combined allowed loss exceeds $3K: carryforward is generated", () => {
    // Three transactions, each partially disallowed, leaving a $3K allowed loss each = $9K total
    // Net ST loss: -$9K → capped at -$3K deduction → $6K carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Wash sale A",
            dateAcquired: "2025-01-05",
            dateSold: "2025-02-05",
            proceeds: "7000",
            costBasis: "12000",   // $5K loss, $2K disallowed → $3K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "Wash sale B",
            dateAcquired: "2025-03-01",
            dateSold: "2025-04-01",
            proceeds: "5000",
            costBasis: "10000",   // $5K loss, $2K disallowed → $3K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "Wash sale C",
            dateAcquired: "2025-05-01",
            dateSold: "2025-07-01",
            proceeds: "9000",
            costBasis: "14000",   // $5K loss, $2K disallowed → $3K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Each: proceeds - costBasis + disallowed = -3K; combined = -9K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-9000);

    const federal = calculateFederalTax(fixture);
    // $3K annual deduction limit
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // $6K carried forward to next year
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-6000);
  });
});

describe("Wash sale - zero costBasis position", () => {
  it("wash sale with zero costBasis: entire proceeds is gain, disallowed adjustment adds on top", () => {
    // Inherited / gifted shares with zero basis. Taxpayer sold at a gain.
    // washSale flag set by broker, but because there is no loss the adjustment is still added.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Zero-basis shares with wash-sale flag",
          dateAcquired: "2025-01-10",
          dateSold: "2025-03-10",
          proceeds: "5000",
          costBasis: "0",         // Zero basis → full proceeds is gain
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "2000",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // gainLoss = $5K - $0 + $2K = $7K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(7000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
    // Net gain flows through positively — no deduction limit needed
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(7000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - combined with long-term gains netting", () => {
  it("short-term wash sale loss and long-term gain net to a positive overall capital gain", () => {
    // ST wash sale creates a small allowed loss; LT gain is larger; net is positive
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale with partial loss",
            dateAcquired: "2025-02-01",
            dateSold: "2025-04-01",
            proceeds: "8000",
            costBasis: "12000",   // $4K loss, $1K disallowed → $3K allowed loss
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1000",
          },
          {
            description: "LT clean gain",
            dateAcquired: "2022-01-15",
            dateSold: "2025-06-15",
            proceeds: "20000",
            costBasis: "8000",    // $12K LT gain
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // ST: $8K - $12K + $1K = -$3K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-3000);
    // LT: $20K - $8K = $12K
    expect(result.totalLongTermGainLoss.toNumber()).toBe(12000);

    const federal = calculateFederalTax(fixture);
    // Net: -$3K ST + $12K LT = +$9K → positive, full gain reported (no cap)
    expect(federal.capitalGainLoss.toNumber()).toBe(9000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - across 3+ brokers", () => {
  it("wash sales at three different brokers all aggregate into the same category totals", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Broker Alpha",
          transactions: [{
            description: "Loss at Alpha (wash)",
            dateAcquired: "2025-01-03",
            dateSold: "2025-02-03",
            proceeds: "3000",
            costBasis: "5000",    // $2K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          }],
        },
        {
          broker: "Broker Beta",
          transactions: [{
            description: "Loss at Beta (wash)",
            dateAcquired: "2025-03-01",
            dateSold: "2025-04-01",
            proceeds: "4000",
            costBasis: "6000",    // $2K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          }],
        },
        {
          broker: "Broker Gamma",
          transactions: [{
            description: "Loss at Gamma (wash)",
            dateAcquired: "2025-05-01",
            dateSold: "2025-06-01",
            proceeds: "7000",
            costBasis: "10000",   // $3K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          }],
        },
      ],
    };
    const result = calculateForm8949(fixture);
    // All three fully disallowed → net ST = $0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Total wash-sale disallowed across all brokers = $2K + $2K + $3K = $7K
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.value.toNumber()).toBe(7000);
    // Three transactions contributed
    expect(result.shortTermBoxA.transactions).toHaveLength(3);
  });
});

describe("Wash sale - partial wash leaving exactly $3K allowed loss", () => {
  it("partial wash sale leaving exactly $3K allowed loss: deduction is -$3K and carryforward is zero", () => {
    // Total loss = $8K, disallowed = $5K → allowed = $3K exactly
    // $3K is exactly the annual cap, so capitalGainLoss = -$3K and carryforward = $0
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Partial wash, exactly $3K remains",
          dateAcquired: "2025-01-20",
          dateSold: "2025-04-20",
          proceeds: "12000",
          costBasis: "20000",     // $8K loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "5000", // $5K disallowed → $3K allowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $12K - $20K + $5K = -$3K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-3000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(5000);

    const federal = calculateFederalTax(fixture);
    // Exactly hits the $3K cap; nothing left to carry forward
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - Box E (long-term, basis not reported)", () => {
  it("wash sale on long-term position with basis not reported goes to longTermBoxE with W code", () => {
    // basisReportedToIRS: false + holdingPeriod: long → Box E
    // Wash sale still applies the disallowed amount as a positive adjustment
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Old shares, LT, basis not reported, wash sale",
          dateAcquired: "2015-03-01",
          dateSold: "2025-05-01",
          proceeds: "18000",
          costBasis: "25000",     // $7K loss, $4K disallowed → $3K allowed
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: false,  // Basis not reported → Box E
          washSale: true,
          washSaleDisallowed: "4000",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Transaction must land in Box E (long-term, basis not reported)
    expect(result.longTermBoxE.transactions).toHaveLength(1);
    expect(result.longTermBoxE.transactions[0].adjustmentCode).toBe("W");
    // $18K - $25K + $4K = -$3K
    expect(result.longTermBoxE.totalGainLoss.toNumber()).toBe(-3000);
    expect(result.longTermBoxE.totalAdjustments.toNumber()).toBe(4000);
    // Box D should remain empty
    expect(result.longTermBoxD.transactions).toHaveLength(0);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-3000);
  });
});

describe("Wash sale - federal pipeline audit trail", () => {
  it("wash sale adjustment is visible in the federal allLines audit trail", () => {
    // Ensures the Form 8949 wash-sale summary line (adjustment-W) propagates all
    // the way through the federal pipeline and is discoverable in allLines.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale audit check",
            dateAcquired: "2025-01-10",
            dateSold: "2025-03-10",
            proceeds: "6000",
            costBasis: "9000",    // $3K loss, $1.5K disallowed → $1.5K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1500",
          },
          {
            description: "LT wash sale audit check",
            dateAcquired: "2023-04-01",
            dateSold: "2025-08-01",
            proceeds: "10000",
            costBasis: "14500",   // $4.5K loss, $2K disallowed → $2.5K allowed
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);

    // The "adjustment-W" line must appear in the federal-level allLines audit trail
    const washAuditLine = federal.allLines.find((l) => l.line === "adjustment-W");
    expect(washAuditLine).toBeDefined();
    // Total disallowed = $1.5K + $2K = $3.5K
    expect(washAuditLine!.value.toNumber()).toBe(3500);

    // Net allowed loss: ST = -$1.5K, LT = -$2.5K → combined = -$4K
    // Capped at -$3K for single filer; $1K carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Extended Edge Cases (tests 26–36)
// ═══════════════════════════════════════════════════════════

describe("Wash sale - full disallowance (100% of loss)", () => {
  it("Form 8949 adjustment-W: 100% wash sale disallowance zeroes out the loss completely", () => {
    // Full disallowance: loss equals disallowed amount exactly
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Full disallowance 100%",
          dateAcquired: "2025-01-05",
          dateSold: "2025-02-20",
          proceeds: "7500",
          costBasis: "12500",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "5000", // Entire $5K loss disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $7500 - $12500 + $5000 = $0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(5000);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");

    const federal = calculateFederalTax(fixture);
    // No loss to deduct, no carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(0);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - $0 loss (no disallowance needed)", () => {
  it("Form 8949 adjustment-W: wash sale with zero loss produces zero adjustment even if flagged", () => {
    // Proceeds exactly equal cost basis: no loss to disallow
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Break-even sale flagged as wash",
          dateAcquired: "2025-03-01",
          dateSold: "2025-05-01",
          proceeds: "10000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "0", // No loss to disallow
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $10K - $10K + $0 = $0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(0);
  });
});

describe("Wash sale - gain transaction (wash sale rules inapplicable)", () => {
  it("Form 8949 adjustment-W: wash sale rules do not apply to gains; no disallowed amount when gain", () => {
    // Gain transaction: washSale=false, washSaleDisallowed=0.
    // Wash sale rules only apply to losses per IRC §1091.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Gain sale - wash sale inapplicable",
          dateAcquired: "2025-01-15",
          dateSold: "2025-06-15",
          proceeds: "15000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // Pure gain: $15K - $10K = $5K, no wash sale adjustment
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(5000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(0);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("");
  });
});

describe("Wash sale - multiple wash sales on same security", () => {
  it("Form 8949 adjustment-W: two wash sale transactions on same security aggregate correctly", () => {
    // Taxpayer sold same stock twice at a loss within the wash sale window,
    // repurchasing each time. Both sales are flagged as wash sales.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "XYZ 100 shares - 1st wash sale",
            dateAcquired: "2025-01-05",
            dateSold: "2025-02-10",
            proceeds: "9000",
            costBasis: "11000",   // $2K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "XYZ 100 shares - 2nd wash sale",
            dateAcquired: "2025-02-15",
            dateSold: "2025-03-20",
            proceeds: "8500",
            costBasis: "11000",   // $2.5K loss, $1.5K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1500",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // 1st: $9K - $11K + $2K = $0
    // 2nd: $8.5K - $11K + $1.5K = -$1K
    // Total ST: -$1K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-1000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(3500);
    // Both coded as W
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
    expect(result.shortTermBoxA.transactions[1].adjustmentCode).toBe("W");

    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine!.value.toNumber()).toBe(3500);
  });
});

describe("Wash sale - across different accounts (IRA and taxable)", () => {
  it("Form 8949 adjustment-W: wash sale triggered by repurchase in different account at different broker", () => {
    // Loss in taxable account, repurchase in IRA triggers wash sale.
    // The loss is disallowed and cannot be added to IRA basis.
    // Per IRC §1091(a), the broker reports the disallowed amount on 1099-B.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Taxable Broker",
          transactions: [{
            description: "Taxable acct loss (repurchased in IRA)",
            dateAcquired: "2025-01-10",
            dateSold: "2025-03-10",
            proceeds: "7000",
            costBasis: "10000",   // $3K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          }],
        },
        {
          broker: "IRA Broker",
          transactions: [], // IRA transactions are not reported on Form 8949
        },
      ],
    };
    const result = calculateForm8949(fixture);
    // $7K - $10K + $3K = $0 (entire loss permanently disallowed when replacement is in IRA)
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(3000);
  });
});

describe("Wash sale - cost basis adjustment on replacement shares", () => {
  it("Form 8949 adjustment-W: disallowed loss adds to basis of replacement shares, reducing gain on later sale", () => {
    // Sale 1: $2K loss fully disallowed (wash sale)
    // Sale 2: replacement shares sold; broker adjusted basis upward by $2K disallowed
    // Net effect: the deferred loss is recognized on the replacement sale
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Original loss sale (wash)",
            dateAcquired: "2025-01-10",
            dateSold: "2025-02-15",
            proceeds: "8000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000", // Full $2K loss disallowed
          },
          {
            description: "Replacement shares sold (basis adjusted by broker)",
            dateAcquired: "2025-02-10",
            dateSold: "2025-07-01",
            proceeds: "11000",
            costBasis: "12000",  // $10K original + $2K wash sale adjustment = $12K
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Sale 1: $8K - $10K + $2K = $0 (loss deferred)
    // Sale 2: $11K - $12K = -$1K (deferred loss now recognized via higher basis)
    // Total ST: -$1K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-1000);
    // Only the wash sale transaction has an adjustment
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2000);
  });
});

describe("Wash sale - very small loss ($0.01)", () => {
  it("Form 8949 adjustment-W: penny loss disallowed rounds correctly with Decimal.js", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Penny loss wash sale",
          dateAcquired: "2025-04-01",
          dateSold: "2025-05-15",
          proceeds: "99.99",
          costBasis: "100.00",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "0.01", // $0.01 disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $99.99 - $100.00 + $0.01 = $0.00
    expect(result.shortTermBoxA.totalGainLoss.eq(d("0"))).toBe(true);
    expect(result.shortTermBoxA.totalAdjustments.eq(d("0.01"))).toBe(true);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
  });
});

describe("Wash sale - very large loss ($1M+)", () => {
  it("Form 8949 adjustment-W: $1.5M loss with $1.2M disallowed leaves $300K allowed loss", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Massive position liquidation",
          dateAcquired: "2025-01-02",
          dateSold: "2025-08-15",
          proceeds: "3500000",
          costBasis: "5000000",   // $1.5M loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "1200000", // $1.2M disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $3.5M - $5M + $1.2M = -$300K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-300000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(1200000);

    const federal = calculateFederalTax(fixture);
    // -$300K loss capped at -$3K deduction; $297K carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-297000);
  });
});

describe("Wash sale - short-term vs long-term position treatment", () => {
  it("Form 8949 Part I/II: wash sale on ST goes to Box A and LT goes to Box D independently", () => {
    // Verify ST and LT wash sales land in their respective categories
    // and adjustments are tracked per-category
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale",
            dateAcquired: "2025-03-01",
            dateSold: "2025-05-01",
            proceeds: "4000",
            costBasis: "6000",    // $2K loss, $2K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "LT wash sale",
            dateAcquired: "2023-01-15",
            dateSold: "2025-06-15",
            proceeds: "9000",
            costBasis: "15000",   // $6K loss, $3K disallowed
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // ST Box A: $4K - $6K + $2K = $0
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2000);
    expect(result.shortTermBoxA.transactions).toHaveLength(1);
    // LT Box D: $9K - $15K + $3K = -$3K
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(-3000);
    expect(result.longTermBoxD.totalAdjustments.toNumber()).toBe(3000);
    expect(result.longTermBoxD.transactions).toHaveLength(1);
    // No cross-contamination
    expect(result.shortTermBoxB.transactions).toHaveLength(0);
    expect(result.longTermBoxE.transactions).toHaveLength(0);
  });
});

describe("Wash sale - net effect with replacement sale in same year", () => {
  it("Sched D Line 16: wash sale + replacement sale in same year: deferred loss recognized via basis", () => {
    // Original sale: $4K loss, fully disallowed
    // Replacement sold same year with adjusted basis: loss recognized
    // Net effect: the overall capital loss is correctly computed
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Original sale (wash)",
            dateAcquired: "2025-01-05",
            dateSold: "2025-02-10",
            proceeds: "6000",
            costBasis: "10000",   // $4K loss, fully disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "4000",
          },
          {
            description: "Replacement sale (basis includes deferred loss)",
            dateAcquired: "2025-02-05",
            dateSold: "2025-09-01",
            proceeds: "12000",
            costBasis: "14000",   // $10K + $4K deferred = $14K
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Original: $6K - $10K + $4K = $0
    // Replacement: $12K - $14K = -$2K
    // Net ST: -$2K (deferred loss partially recognized)
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-2000);

    const federal = calculateFederalTax(fixture);
    // -$2K < $3K limit, so full loss deducted, no carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(-2000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - reducing total capital loss below $3K limit", () => {
  it("Sched D Line 21: wash sale disallowance reduces allowed loss to below $3K cap, no carryforward needed", () => {
    // Without wash sale: $5K loss would trigger $3K cap + $2K carryforward
    // With wash sale disallowing $3K: only $2K allowed loss, fits within $3K cap
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Wash sale that reduces loss below cap",
          dateAcquired: "2025-02-01",
          dateSold: "2025-04-15",
          proceeds: "15000",
          costBasis: "20000",     // $5K loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "3000", // $3K disallowed → $2K allowed
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Net loss: $15K - $20K + $3K = -$2K (below $3K limit)
    expect(federal.capitalGainLoss.toNumber()).toBe(-2000);
    // No carryforward since $2K < $3K cap
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - MFS $1,500 capital loss limit interaction", () => {
  it("Sched D Line 21: MFS filer with wash sale: allowed loss exceeds $1,500 cap, generates carryforward", () => {
    const mfsFixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "MFS wash sale edge case",
          dateAcquired: "2025-01-10",
          dateSold: "2025-05-10",
          proceeds: "10000",
          costBasis: "15000",     // $5K loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "1000", // $1K disallowed → $4K allowed
        }],
      }],
    };
    const federal = calculateFederalTax(mfsFixture);
    // Net loss: $10K - $15K + $1K = -$4K
    // MFS cap: $1,500
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
    // Carryforward: $4K - $1.5K = $2.5K
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-2500);
  });
});

describe("Wash sale - multiple securities with different wash sale treatments", () => {
  it("Form 8949 adjustment-W: mixed portfolio - one wash sale, one clean loss, one gain", () => {
    // Three different securities: AAPL (wash sale), GOOG (clean loss), MSFT (gain)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "AAPL 50 shares (wash sale)",
            dateAcquired: "2025-01-10",
            dateSold: "2025-03-10",
            proceeds: "7000",
            costBasis: "10000",   // $3K loss, $3K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          },
          {
            description: "GOOG 20 shares (clean loss)",
            dateAcquired: "2025-02-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "8000",    // $3K clean loss
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "MSFT 30 shares (gain)",
            dateAcquired: "2025-01-20",
            dateSold: "2025-04-20",
            proceeds: "12000",
            costBasis: "9000",    // $3K gain
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // AAPL: $7K - $10K + $3K = $0 (wash sale nullified)
    // GOOG: $5K - $8K = -$3K (clean loss)
    // MSFT: $12K - $9K = $3K (gain)
    // Total ST: $0 - $3K + $3K = $0
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(3000);
    expect(result.shortTermBoxA.transactions).toHaveLength(3);

    // Only 1 wash sale transaction in the summary
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine!.value.toNumber()).toBe(3000);
  });
});

describe("Wash sale - disallowed loss exceeds proceeds", () => {
  it("Form 8949 adjustment-W: disallowed loss amount can exceed proceeds when basis is very high", () => {
    // Edge case: extremely high basis, low proceeds, disallowed amount
    // exceeds the proceeds value (but not the loss)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "High basis, low proceeds, large disallowance",
          dateAcquired: "2025-01-05",
          dateSold: "2025-03-05",
          proceeds: "1000",
          costBasis: "50000",     // $49K loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "5000", // $5K exceeds $1K proceeds, but valid (< $49K loss)
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $1K - $50K + $5K = -$44K
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-44000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(5000);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");

    const federal = calculateFederalTax(fixture);
    // -$44K loss capped at -$3K; $41K carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-41000);
  });
});

// ═══════════════════════════════════════════════════════════
// New Tests (10-12 additional)
// ═══════════════════════════════════════════════════════════

import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { getConstants } from "@/models/constants.js";

const constants2025 = getConstants(2025);

describe("Wash sale - long-term fully disallowed (loss equals disallowed amount)", () => {
  it("Form 8949 Part II Box D: long-term wash sale with 100% loss disallowed zeros out longTermBoxD gain/loss", () => {
    // Full disallowance on a long-term position: $8K loss, $8K disallowed → $0 net
    // Verifies that the full-disallowance path works identically for LT as it does for ST
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT full disallowance",
          dateAcquired: "2022-04-01",
          dateSold: "2025-04-01",
          proceeds: "12000",
          costBasis: "20000",   // $8K LT loss, fully disallowed
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "8000",
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $12K - $20K + $8K = $0
    expect(result.longTermBoxD.totalGainLoss.toNumber()).toBe(0);
    expect(result.longTermBoxD.totalAdjustments.toNumber()).toBe(8000);
    expect(result.longTermBoxD.transactions[0].adjustmentCode).toBe("W");
    // No short-term contamination
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Federal: zero net capital gain/loss, no carryforward
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(0);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

describe("Wash sale - partial disallowance with Schedule D net line verification", () => {
  it("Sched D Line 7: partial ST wash sale reduces allowed loss; netShortTerm reflects post-disallowance amount", () => {
    // $9K loss, $4K disallowed → $5K allowed ST loss
    // Schedule D Line 7 (netShortTerm) should equal -$5K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Partial wash sale, $4K of $9K disallowed",
          dateAcquired: "2025-02-10",
          dateSold: "2025-04-10",
          proceeds: "11000",
          costBasis: "20000",   // $9K loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "4000",
        }],
      }],
    };
    const schedD = calculateScheduleD(fixture, "single", constants2025);
    // netShortTerm = $11K - $20K + $4K = -$5K
    expect(schedD.netShortTerm.toNumber()).toBe(-5000);
    // netLongTerm is zero (no LT transactions)
    expect(schedD.netLongTerm.toNumber()).toBe(0);
    // netCapitalGainLoss = -$5K, capped at -$3K deduction
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(-5000);
    expect(schedD.capitalLossDeduction.toNumber()).toBe(-3000);
    // Carryforward: -$2K
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(-2000);
  });
});

describe("Wash sale - ST wash sale and LT wash sale Schedule D net lines are independent", () => {
  it("Sched D Lines 7 and 15: ST wash and LT wash post-disallowance amounts flow to their respective Schedule D lines", () => {
    // ST: $6K loss, $2K disallowed → $4K allowed loss (Line 7)
    // LT: $10K loss, $7K disallowed → $3K allowed loss (Line 15)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale partial",
            dateAcquired: "2025-01-20",
            dateSold: "2025-03-20",
            proceeds: "4000",
            costBasis: "10000",   // $6K ST loss, $2K disallowed → $4K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "LT wash sale partial",
            dateAcquired: "2022-06-01",
            dateSold: "2025-06-01",
            proceeds: "15000",
            costBasis: "25000",   // $10K LT loss, $7K disallowed → $3K allowed
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "7000",
          },
        ],
      }],
    };
    const schedD = calculateScheduleD(fixture, "single", constants2025);
    // Line 7: $4K - $10K + $2K = -$4K
    expect(schedD.netShortTerm.toNumber()).toBe(-4000);
    // Line 15: $15K - $25K + $7K = -$3K
    expect(schedD.netLongTerm.toNumber()).toBe(-3000);
    // Line 16: -$4K + -$3K = -$7K
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(-7000);
    // Line 21: capped at -$3K
    expect(schedD.capitalLossDeduction.toNumber()).toBe(-3000);
  });
});

describe("Wash sale - multiple wash sales in same account, same broker", () => {
  it("Form 8949 adjustment-W: four wash sales in same account aggregate total disallowed correctly", () => {
    // Four different securities in one brokerage, all wash sales, varying disallowance
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Single Broker Account",
        transactions: [
          {
            description: "Security A wash sale",
            dateAcquired: "2025-01-02",
            dateSold: "2025-02-02",
            proceeds: "3000",
            costBasis: "5000",   // $2K loss, $2K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "Security B wash sale",
            dateAcquired: "2025-02-10",
            dateSold: "2025-03-10",
            proceeds: "6000",
            costBasis: "9000",   // $3K loss, $1K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1000",
          },
          {
            description: "Security C wash sale",
            dateAcquired: "2025-04-01",
            dateSold: "2025-05-01",
            proceeds: "2500",
            costBasis: "4000",   // $1.5K loss, $1.5K disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "1500",
          },
          {
            description: "Security D wash sale",
            dateAcquired: "2025-06-15",
            dateSold: "2025-07-15",
            proceeds: "8000",
            costBasis: "11000",  // $3K loss, $500 disallowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "500",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // A: $3K - $5K + $2K = $0
    // B: $6K - $9K + $1K = -$2K
    // C: $2.5K - $4K + $1.5K = $0
    // D: $8K - $11K + $0.5K = -$2.5K
    // Total ST: -$4.5K
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-4500);
    // All four have W code
    result.shortTermBoxA.transactions.forEach((t) => {
      expect(t.adjustmentCode).toBe("W");
    });
    // Total adjustments: $2K + $1K + $1.5K + $0.5K = $5K
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(5000);
    // Audit trail wash line: same $5K
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.value.toNumber()).toBe(5000);
  });
});

describe("Wash sale - washSale flag false with nonzero washSaleDisallowed: no W code applied", () => {
  it("Form 8949 adjustment-W: when washSale is false the disallowed field is ignored and no W code is set", () => {
    // Per form-8949.ts processTransaction: the wash sale branch only fires when washSale===true
    // If a broker sends a nonzero washSaleDisallowed but washSale=false, no adjustment is made
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Clean loss, washSale=false, nonzero disallowed field",
          dateAcquired: "2025-03-01",
          dateSold: "2025-06-01",
          proceeds: "7000",
          costBasis: "10000",   // $3K loss; washSale=false so disallowed field is ignored
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "3000", // Non-zero but washSale=false → ignored
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // No wash sale adjustment applied: $7K - $10K = -$3K (no +$3K from disallowed)
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(-3000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(0);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("");
    // Audit wash line: $0 total disallowed (no wash sale transactions)
    const washLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washLine).toBeDefined();
    expect(washLine!.value.toNumber()).toBe(0);
  });
});

describe("Wash sale - basis adjustment on long-term replacement shares", () => {
  it("Form 8949: LT wash sale deferred loss is recognized when LT replacement shares are sold later in same year", () => {
    // Original LT sale: $6K loss, fully disallowed
    // Replacement shares: broker added $6K to basis; sold at a slight gain (net of basis adjustment → loss)
    // Net LT effect: the deferred loss flows through the adjusted basis of the replacement shares
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Original LT sale (wash)",
            dateAcquired: "2022-05-01",
            dateSold: "2025-02-20",
            proceeds: "14000",
            costBasis: "20000",  // $6K LT loss, fully disallowed
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "6000",
          },
          {
            description: "LT replacement shares (basis adjusted +$6K by broker)",
            dateAcquired: "2022-02-10",  // Holding period carries over in real-world, modeled as LT
            dateSold: "2025-09-15",
            proceeds: "22000",
            costBasis: "26000",  // $20K original + $6K deferred = $26K adjusted basis
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Original: $14K - $20K + $6K = $0 (loss deferred)
    // Replacement: $22K - $26K = -$4K (deferred loss recognized via higher basis)
    // Total LT: -$4K
    expect(result.totalLongTermGainLoss.toNumber()).toBe(-4000);
    expect(result.totalShortTermGainLoss.toNumber()).toBe(0);
    // Only the wash sale transaction carries the adjustment
    expect(result.longTermBoxD.totalAdjustments.toNumber()).toBe(6000);

    const federal = calculateFederalTax(fixture);
    // -$4K LT loss → exceeds $3K cap; $1K carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-1000);
  });
});

describe("Wash sale - net effect on Schedule D with offsetting LT gain", () => {
  it("Sched D Line 16: ST wash sale allowed loss and LT clean gain net to zero on Schedule D Line 16", () => {
    // ST wash sale: $6K loss, $3K disallowed → $3K allowed ST loss
    // LT clean gain: $3K
    // Net on Sched D Line 16 = $0
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale, $3K allowed loss",
            dateAcquired: "2025-02-01",
            dateSold: "2025-04-01",
            proceeds: "4000",
            costBasis: "10000",   // $6K ST loss, $3K disallowed → $3K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "3000",
          },
          {
            description: "LT clean gain",
            dateAcquired: "2021-07-01",
            dateSold: "2025-07-01",
            proceeds: "18000",
            costBasis: "15000",   // $3K LT gain
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const schedD = calculateScheduleD(fixture, "single", constants2025);
    // Line 7: $4K - $10K + $3K = -$3K
    expect(schedD.netShortTerm.toNumber()).toBe(-3000);
    // Line 15: $18K - $15K = +$3K
    expect(schedD.netLongTerm.toNumber()).toBe(3000);
    // Line 16: -$3K + $3K = $0
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(0);
    // No deduction cap needed, no carryforward
    expect(schedD.capitalLossDeduction.toNumber()).toBe(0);
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(0);
    expect(schedD.carryforwardLongTerm.toNumber()).toBe(0);
  });
});

describe("Wash sale - combined with multiple non-wash transactions in same box", () => {
  it("Form 8949 Box A totals: two clean ST transactions plus one ST wash sale aggregate correctly", () => {
    // Two clean ST trades + one ST wash sale — all in Box A (basis reported)
    // Verifies totalProceeds, totalCostBasis, totalAdjustments, totalGainLoss are correct
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Clean ST gain",
            dateAcquired: "2025-01-05",
            dateSold: "2025-04-05",
            proceeds: "20000",
            costBasis: "15000",   // +$5K gain
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Clean ST loss",
            dateAcquired: "2025-03-01",
            dateSold: "2025-06-01",
            proceeds: "8000",
            costBasis: "10000",   // -$2K loss
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "ST wash sale partial",
            dateAcquired: "2025-04-10",
            dateSold: "2025-06-10",
            proceeds: "5000",
            costBasis: "9000",   // $4K loss, $2.5K disallowed → $1.5K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2500",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);
    // Box A totals:
    //   Proceeds: $20K + $8K + $5K = $33K
    //   Basis:    $15K + $10K + $9K = $34K
    //   Adjustments: $0 + $0 + $2.5K = $2.5K
    //   Gain/Loss: +$5K + (-$2K) + (-$1.5K) = +$1.5K
    expect(result.shortTermBoxA.totalProceeds.toNumber()).toBe(33000);
    expect(result.shortTermBoxA.totalCostBasis.toNumber()).toBe(34000);
    expect(result.shortTermBoxA.totalAdjustments.toNumber()).toBe(2500);
    expect(result.shortTermBoxA.totalGainLoss.toNumber()).toBe(1500);
    expect(result.shortTermBoxA.transactions).toHaveLength(3);
  });
});

describe("Wash sale - very large fractional amounts with Decimal precision", () => {
  it("Form 8949 adjustment-W: $2.5M position with fractional cent disallowance preserves Decimal precision", () => {
    // Large position with a fractional disallowed amount to exercise Decimal.js precision
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Large fractional wash sale",
          dateAcquired: "2025-01-03",
          dateSold: "2025-10-03",
          proceeds: "2000000.50",
          costBasis: "2500000.75",   // $500,000.25 loss
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "250000.13", // $250,000.13 disallowed
        }],
      }],
    };
    const result = calculateForm8949(fixture);
    // $2,000,000.50 - $2,500,000.75 + $250,000.13 = -$250,000.12
    expect(result.shortTermBoxA.totalGainLoss.eq(d("-250000.12"))).toBe(true);
    expect(result.shortTermBoxA.totalAdjustments.eq(d("250000.13"))).toBe(true);
    expect(result.shortTermBoxA.transactions[0].adjustmentCode).toBe("W");
  });
});

describe("Wash sale - audit trail tracks adjustment-W and to-schedule-d lines in Form 8949", () => {
  it("Form 8949 audit lines: adjustment-W and to-schedule-d lines both present with correct values", () => {
    // Verify both the wash sale summary line and the Schedule D flow line appear
    // in the Form 8949 audit trail with correct aggregated values
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "ST wash sale for audit trail test",
            dateAcquired: "2025-01-15",
            dateSold: "2025-03-15",
            proceeds: "5000",
            costBasis: "8000",   // $3K ST loss, $2K disallowed → $1K allowed
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: true,
            washSaleDisallowed: "2000",
          },
          {
            description: "LT clean gain for audit trail test",
            dateAcquired: "2020-06-01",
            dateSold: "2025-06-01",
            proceeds: "12000",
            costBasis: "9000",   // $3K LT gain
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const result = calculateForm8949(fixture);

    // adjustment-W line: total wash sale disallowed = $2K
    const washAuditLine = result.lines.find((l) => l.line === "adjustment-W");
    expect(washAuditLine).toBeDefined();
    expect(washAuditLine!.value.toNumber()).toBe(2000);

    // to-schedule-d line: total of all gain/loss = ST (-$1K) + LT (+$3K) = +$2K
    const scheduleDLine = result.lines.find((l) => l.line === "to-schedule-d");
    expect(scheduleDLine).toBeDefined();
    expect(scheduleDLine!.value.toNumber()).toBe(2000);

    // totalShortTermGainLoss and totalLongTermGainLoss are consistent with audit
    expect(result.totalShortTermGainLoss.toNumber()).toBe(-1000);
    expect(result.totalLongTermGainLoss.toNumber()).toBe(3000);
  });
});

describe("Wash sale - prior year short-term carryforward combined with wash sale loss in current year", () => {
  it("Sched D Line 7: prior year ST carryforward plus current year ST wash sale allowed loss aggregate on Line 7", () => {
    // Prior year: -$4K ST carryforward
    // Current year: $5K ST loss, $2K disallowed → $3K allowed current-year loss
    // Sched D Line 7 = -$4K + -$3K = -$7K → capped at -$3K deduction, $4K carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      priorYear: {
        shortTermCapitalLoss: "-4000",
        longTermCapitalLoss: "0",
      },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Current year ST wash sale with prior carryforward",
          dateAcquired: "2025-03-01",
          dateSold: "2025-06-01",
          proceeds: "10000",
          costBasis: "15000",   // $5K loss, $2K disallowed → $3K allowed
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: true,
          washSaleDisallowed: "2000",
        }],
      }],
    };
    const schedD = calculateScheduleD(fixture, "single", constants2025);
    // Line 7: -$3K (current allowed) + -$4K (prior carryforward) = -$7K
    expect(schedD.netShortTerm.toNumber()).toBe(-7000);
    // Line 16: -$7K total
    expect(schedD.netCapitalGainLoss.toNumber()).toBe(-7000);
    // Line 21: capped at -$3K
    expect(schedD.capitalLossDeduction.toNumber()).toBe(-3000);
    // Carryforward: -$4K (used $3K of $7K)
    expect(schedD.carryforwardShortTerm.toNumber()).toBe(-4000);
  });
});

/**
 * Tests for Crypto Lot Matching, Income Recognition, and Digital Asset Tax Rules
 * Spec: spec/federal/form-1099-da.yaml, spec/federal/crypto-income.yaml, spec/federal/defi-transactions.yaml
 *
 * Covers: Form 1099-DA processing, lot matching (FIFO/LIFO/HIFO/Specific ID),
 * mining/staking/airdrop income routing, Form 1040 digital asset question,
 * wash sale interaction with crypto lots, and DeFi token swaps (DEX trades,
 * wrapping events, bridge transactions).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateCryptoIncome,
  calculateCryptoLendingIncome,
  calculateCryptoDonations,
  calculateYieldRewards,
  initializeLots,
  matchLots,
  addIncomeLot,
  processCryptoLiquidations,
  processDeFiLPPositions,
  processDeFiTokenSwaps,
  processNFTTransactions,
  trackWashSaleCarryforward,
  type TrackedLot,
} from "@/engine/forms/crypto-lot-matching.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

function makeCryptoFixture(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return { ...simpleW2Fixture, ...overrides };
}

// ═══════════════════════════════════════════════════════════
// Lot Matching — FIFO
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - FIFO", () => {
  it("FIFO sells earliest acquired lot first", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-15", quantity: d(1), costBasisPerUnit: d(30000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2024-06-15", quantity: d(1), costBasisPerUnit: d(50000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2025-01-15", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2024-01-15",
        dateSold: "2025-06-01",
        proceeds: "60000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // FIFO: should match the earliest lot (2024-01-15, cost $30,000)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(30000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(30000); // 60000 - 30000
    expect(result.dispositions[0].dateAcquired).toBe("2024-01-15");
  });
});

// ═══════════════════════════════════════════════════════════
// Lot Matching — LIFO
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - LIFO", () => {
  it("LIFO sells most recently acquired lot first", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(5), costBasisPerUnit: d(2000), source: "purchase" },
      { asset: "ETH", dateAcquired: "2024-06-01", quantity: d(5), costBasisPerUnit: d(3000), source: "purchase" },
      { asset: "ETH", dateAcquired: "2025-03-01", quantity: d(5), costBasisPerUnit: d(4000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        dateAcquired: "VARIOUS",
        dateSold: "2025-06-15",
        proceeds: "25000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Kraken",
    }];

    const result = matchLots(transactions, lots, "lifo");
    expect(result.dispositions).toHaveLength(1);
    // LIFO: should match the most recent lot (2025-03-01, cost $4000 * 5 = $20,000)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(20000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(5000); // 25000 - 20000
  });
});

// ═══════════════════════════════════════════════════════════
// Lot Matching — HIFO
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - HIFO", () => {
  it("HIFO sells highest cost basis lot first to minimize gain", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2024-03-01", quantity: d(1), costBasisPerUnit: d(65000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2024-06-01", quantity: d(1), costBasisPerUnit: d(55000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "VARIOUS",
        dateSold: "2025-07-01",
        proceeds: "70000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Gemini",
    }];

    const result = matchLots(transactions, lots, "hifo");
    expect(result.dispositions).toHaveLength(1);
    // HIFO: should match the highest cost lot ($65,000)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(65000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(5000); // 70000 - 65000
  });
});

// ═══════════════════════════════════════════════════════════
// Lot Matching — Specific ID
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Specific ID", () => {
  it("Specific ID preserves lot order (no resorting)", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-06-01", quantity: d(1), costBasisPerUnit: d(55000), source: "purchase", lotId: "lot-1" },
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase", lotId: "lot-2" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2024-06-01",
        dateSold: "2025-07-01",
        proceeds: "70000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "specific_id");
    expect(result.dispositions).toHaveLength(1);
    // Specific ID: first lot in input order (lot-1, cost $55,000)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(55000);
  });
});

// ═══════════════════════════════════════════════════════════
// Partial Lot Consumption (quantity-based)
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Partial Lot Consumption", () => {
  it("FIFO partial consumption: sells portion of a lot, remainder stays", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-15", quantity: d(5), costBasisPerUnit: d(30000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2024-06-15", quantity: d(3), costBasisPerUnit: d(50000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        quantity: "2", // Sell only 2 of 5 in first lot
        dateAcquired: "2024-01-15",
        dateSold: "2025-06-01",
        proceeds: "120000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // FIFO: 2 units from first lot at $30,000 each = $60,000 basis
    expect(result.dispositions[0].costBasis.toNumber()).toBe(60000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(60000); // 120000 - 60000
    // Remaining: 3 BTC in first lot + 3 BTC in second lot
    expect(result.remainingLots).toHaveLength(2);
    expect(result.remainingLots[0].quantity.toNumber()).toBe(3);
    expect(result.remainingLots[1].quantity.toNumber()).toBe(3);
  });

  it("FIFO multi-lot consumption: sale spans across two lots", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(2), costBasisPerUnit: d(2000), source: "purchase" },
      { asset: "ETH", dateAcquired: "2024-06-01", quantity: d(5), costBasisPerUnit: d(3000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        quantity: "4", // Sell 4: 2 from first lot + 2 from second
        dateAcquired: "VARIOUS",
        dateSold: "2025-07-01",
        proceeds: "16000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Kraken",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // FIFO: 2 * $2000 + 2 * $3000 = $4000 + $6000 = $10,000 basis
    expect(result.dispositions[0].costBasis.toNumber()).toBe(10000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(6000); // 16000 - 10000
    expect(result.dispositions[0].dateAcquired).toBe("VARIOUS"); // Spans two lots
    // Remaining: 3 ETH in second lot
    expect(result.remainingLots).toHaveLength(1);
    expect(result.remainingLots[0].quantity.toNumber()).toBe(3);
  });

  it("HIFO partial consumption: picks highest-cost lot and partially consumes it", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(3), costBasisPerUnit: d(40000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2024-03-01", quantity: d(3), costBasisPerUnit: d(65000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        quantity: "1",
        dateAcquired: "2024-03-01",
        dateSold: "2025-07-01",
        proceeds: "70000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Gemini",
    }];

    const result = matchLots(transactions, lots, "hifo");
    expect(result.dispositions).toHaveLength(1);
    // HIFO: 1 unit from the $65,000 lot
    expect(result.dispositions[0].costBasis.toNumber()).toBe(65000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(5000);
    // Remaining: 3 BTC at $40k + 2 BTC at $65k
    expect(result.remainingLots).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Specific ID by lotId
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Specific ID by lotId", () => {
  it("Specific ID matches transaction to lot by lotId", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase", lotId: "lot-A" },
      { asset: "BTC", dateAcquired: "2024-06-01", quantity: d(1), costBasisPerUnit: d(55000), source: "purchase", lotId: "lot-B" },
      { asset: "BTC", dateAcquired: "2024-09-01", quantity: d(1), costBasisPerUnit: d(60000), source: "purchase", lotId: "lot-C" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        quantity: "1",
        dateAcquired: "2024-06-01",
        dateSold: "2025-07-01",
        proceeds: "70000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        lotId: "lot-B", // Explicitly select lot-B
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "specific_id");
    expect(result.dispositions).toHaveLength(1);
    // Should match lot-B ($55,000 cost basis)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(55000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(15000);
    // lot-A and lot-C remain
    expect(result.remainingLots).toHaveLength(2);
    expect(result.remainingLots.find((l) => l.lotId === "lot-B")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Broker-Reported Basis (1099-DA with basis)
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Broker reported basis", () => {
  it("Uses broker-reported cost basis when provided", () => {
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2024-01-15",
        dateSold: "2025-06-01",
        proceeds: "60000",
        costBasis: "42000",
        holdingPeriod: "long" as const,
        basisReportedToIRS: true,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, [], "fifo");
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(42000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(18000); // 60000 - 42000
    expect(result.dispositions[0].basisReportedToIRS).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Mining Income
// ═══════════════════════════════════════════════════════════

describe("Crypto Mining Income", () => {
  it("Hobby mining income computed as quantity * FMV", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "BTC", dateReceived: "2025-03-15", quantity: "0.5", fairMarketValuePerUnit: "60000", poolFees: "100" },
        { asset: "BTC", dateReceived: "2025-04-15", quantity: "0.3", fairMarketValuePerUnit: "62000", poolFees: "50" },
      ],
      stakingIncome: [],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    // 0.5 * 60000 + 0.3 * 62000 = 30000 + 18600 = 48600
    expect(result.hobbyMiningIncome.toNumber()).toBe(48600);
    expect(result.businessMiningGrossReceipts.toNumber()).toBe(0);
    expect(result.newLots).toHaveLength(2);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(60000);
  });

  it("Business mining routes to Schedule C with deductible expenses", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "BTC", dateReceived: "2025-03-15", quantity: "1.0", fairMarketValuePerUnit: "60000", poolFees: "500" },
      ],
      stakingIncome: [],
      airdropIncome: [],
      isMiningBusiness: true,
      isStakingBusiness: false,
    });

    expect(result.businessMiningGrossReceipts.toNumber()).toBe(60000);
    expect(result.businessMiningExpenses.toNumber()).toBe(500);
    expect(result.hobbyMiningIncome.toNumber()).toBe(0);
  });

  it("Mined coins establish basis lots at FMV (IRS Notice 2014-21 Q&A 6)", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "ETH", dateReceived: "2025-01-20", quantity: "10", fairMarketValuePerUnit: "3000" },
      ],
      stakingIncome: [],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("ETH");
    expect(result.newLots[0].dateAcquired).toBe("2025-01-20");
    expect(result.newLots[0].quantity.toNumber()).toBe(10);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(3000);
    expect(result.newLots[0].source).toBe("mining");
  });
});

// ═══════════════════════════════════════════════════════════
// Staking Income
// ═══════════════════════════════════════════════════════════

describe("Crypto Staking Income", () => {
  it("Hobby staking income computed as quantity * FMV (Rev. Rul. 2023-14)", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [
        { asset: "ETH", dateReceived: "2025-02-01", quantity: "2.5", fairMarketValuePerUnit: "3200" },
        { asset: "SOL", dateReceived: "2025-03-01", quantity: "100", fairMarketValuePerUnit: "120" },
      ],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    // 2.5 * 3200 + 100 * 120 = 8000 + 12000 = 20000
    expect(result.hobbyStakingIncome.toNumber()).toBe(20000);
    expect(result.businessStakingGrossReceipts.toNumber()).toBe(0);
  });

  it("Business staking routes to Schedule C with validator expenses", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [
        { asset: "ETH", dateReceived: "2025-02-01", quantity: "10", fairMarketValuePerUnit: "3200", validatorExpenses: "200" },
      ],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: true,
    });

    expect(result.businessStakingGrossReceipts.toNumber()).toBe(32000);
    expect(result.businessStakingExpenses.toNumber()).toBe(200);
    expect(result.hobbyStakingIncome.toNumber()).toBe(0);
  });

  it("Staking rewards establish basis lots at FMV", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [
        { asset: "DOT", dateReceived: "2025-04-01", quantity: "50", fairMarketValuePerUnit: "7.50" },
      ],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("DOT");
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(7.5);
    expect(result.newLots[0].source).toBe("staking");
  });
});

// ═══════════════════════════════════════════════════════════
// Airdrop and Hard Fork Income
// ═══════════════════════════════════════════════════════════

describe("Crypto Airdrop/Hard Fork Income", () => {
  it("Airdrop income = quantity * FMV at receipt (Rev. Rul. 2019-24)", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [],
      airdropIncome: [
        { asset: "UNI", dateReceived: "2025-01-10", quantity: "400", fairMarketValuePerUnit: "12.50", source: "airdrop" },
      ],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    // 400 * 12.50 = 5000
    expect(result.airdropIncome.toNumber()).toBe(5000);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(12.5);
    expect(result.newLots[0].source).toBe("airdrop");
  });

  it("Hard fork with zero FMV has $0 income and $0 basis", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [],
      airdropIncome: [
        { asset: "BCH", dateReceived: "2025-08-01", quantity: "2.0", fairMarketValuePerUnit: "0", source: "hard_fork" },
      ],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    expect(result.airdropIncome.toNumber()).toBe(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
    expect(result.newLots[0].source).toBe("hard_fork");
  });

  it("Hard fork with determinable FMV is ordinary income", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [],
      airdropIncome: [
        { asset: "ETHW", dateReceived: "2025-09-15", quantity: "5.0", fairMarketValuePerUnit: "8.00", source: "hard_fork" },
      ],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    // 5.0 * 8.00 = 40
    expect(result.airdropIncome.toNumber()).toBe(40);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(8);
  });

  it("Airdrop income always routes to Schedule 1 Line 8z (never SE)", () => {
    const result = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [],
      airdropIncome: [
        { asset: "ARB", dateReceived: "2025-03-23", quantity: "1000", fairMarketValuePerUnit: "1.20", source: "airdrop" },
      ],
      isMiningBusiness: true, // Even with business flag, airdrops are not SE
      isStakingBusiness: true,
    });

    expect(result.airdropIncome.toNumber()).toBe(1200);
    expect(result.businessMiningGrossReceipts.toNumber()).toBe(0);
    expect(result.businessStakingGrossReceipts.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 1040 Digital Asset Question
// ═══════════════════════════════════════════════════════════

describe("Form 1040 Digital Asset Question", () => {
  it("Yes when form1099DA entries exist", () => {
    const input = makeCryptoFixture({
      form1099DA: [{
        brokerName: "Coinbase",
        transactions: [{
          digitalAssetName: "Bitcoin",
          ticker: "BTC",
          dateAcquired: "2024-01-15",
          dateSold: "2025-06-01",
          proceeds: "60000",
          costBasis: "42000",
          holdingPeriod: "long",
          basisReportedToIRS: true,
          transactionType: "sale",
        }],
      }],
    });
    const result = calculateFederalTax(input);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Yes when capitalTransactions have digitalAsset flag", () => {
    const input = makeCryptoFixture({
      form1099B: [{
        broker: "Coinbase",
        transactions: [{
          description: "BTC 0.5",
          dateAcquired: "2024-01-15",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "20000",
          holdingPeriod: "short",
          basisReportedToIRS: true,
          digitalAsset: true,
        }],
      }],
    });
    const result = calculateFederalTax(input);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Yes when crypto income (mining) exists", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [
          { asset: "BTC", dateReceived: "2025-03-15", quantity: "0.01", fairMarketValuePerUnit: "60000" },
        ],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });
    const result = calculateFederalTax(input);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("No when no crypto activity", () => {
    const result = calculateFederalTax(simpleW2Fixture);
    expect(result.digitalAssetQuestion).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sale Interaction with Crypto
// ═══════════════════════════════════════════════════════════

describe("Crypto Wash Sales", () => {
  it("Wash sale disallowed loss added as adjustment on 1099-DA transaction", () => {
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-01-15",
        dateSold: "2025-02-01",
        proceeds: "40000",
        costBasis: "50000",
        holdingPeriod: "short" as const,
        basisReportedToIRS: true,
        transactionType: "sale" as const,
        washSale: true,
        washSaleDisallowed: "10000", // Full loss disallowed
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, [], "fifo");
    expect(result.dispositions).toHaveLength(1);
    // Loss of -10000 (40000 - 50000) but wash sale adds 10000 back
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(0);
    expect(result.dispositions[0].washSale).toBe(true);
    expect(result.dispositions[0].washSaleDisallowed.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Crypto Edge Cases", () => {
  it("Zero-cost-basis airdrop: full proceeds are gain on later sale", () => {
    // First recognize the airdrop (basis = $0)
    const incomeResult = calculateCryptoIncome({
      miningIncome: [],
      stakingIncome: [],
      airdropIncome: [
        { asset: "NEWTOKEN", dateReceived: "2025-01-01", quantity: "1000", fairMarketValuePerUnit: "0", source: "hard_fork" },
      ],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    expect(incomeResult.airdropIncome.toNumber()).toBe(0);
    expect(incomeResult.newLots[0].costBasisPerUnit.toNumber()).toBe(0);

    // Now sell those tokens — full proceeds are gain
    const lots = incomeResult.newLots;
    const transactions = [{
      transaction: {
        digitalAssetName: "NEWTOKEN",
        ticker: "NEWTOKEN",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "5000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Uniswap",
    }];

    const saleResult = matchLots(transactions, lots, "fifo");
    expect(saleResult.dispositions[0].costBasis.toNumber()).toBe(0);
    expect(saleResult.dispositions[0].gainOrLoss.toNumber()).toBe(5000);
  });

  it("Multiple income types combine correctly in totalOrdinaryIncome", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "BTC", dateReceived: "2025-01-15", quantity: "0.1", fairMarketValuePerUnit: "50000" },
      ],
      stakingIncome: [
        { asset: "ETH", dateReceived: "2025-02-15", quantity: "1.0", fairMarketValuePerUnit: "3000" },
      ],
      airdropIncome: [
        { asset: "UNI", dateReceived: "2025-03-15", quantity: "100", fairMarketValuePerUnit: "10", source: "airdrop" },
      ],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    // Mining: 0.1 * 50000 = 5000
    // Staking: 1.0 * 3000 = 3000
    // Airdrop: 100 * 10 = 1000
    // Total: 9000
    expect(result.totalOrdinaryIncome.toNumber()).toBe(9000);
    expect(result.newLots).toHaveLength(3);
  });

  it("initializeLots normalizes asset names to uppercase", () => {
    const lots = initializeLots([
      { asset: "btc", dateAcquired: "2024-01-01", quantity: "1.0", costBasisPerUnit: "30000", source: "purchase" },
      { asset: "Eth", dateAcquired: "2024-01-01", quantity: "10", costBasisPerUnit: "2000", source: "purchase" },
    ]);

    expect(lots[0].asset).toBe("BTC");
    expect(lots[1].asset).toBe("ETH");
  });

  it("addIncomeLot creates lot with correct fields", () => {
    const lots: TrackedLot[] = [];
    addIncomeLot(lots, "sol", "2025-05-01", d(100), d(120), "staking");
    expect(lots).toHaveLength(1);
    expect(lots[0].asset).toBe("SOL");
    expect(lots[0].source).toBe("staking");
    expect(lots[0].quantity.toNumber()).toBe(100);
    expect(lots[0].costBasisPerUnit.toNumber()).toBe(120);
  });

  it("1099-DA transactions flow through Form 8949 to Schedule D", () => {
    const input = makeCryptoFixture({
      form1099DA: [{
        brokerName: "Coinbase",
        transactions: [
          {
            digitalAssetName: "Bitcoin",
            ticker: "BTC",
            dateAcquired: "2024-01-15",
            dateSold: "2025-06-01",
            proceeds: "60000",
            costBasis: "42000",
            holdingPeriod: "long",
            basisReportedToIRS: true,
            transactionType: "sale",
          },
          {
            digitalAssetName: "Ethereum",
            ticker: "ETH",
            dateAcquired: "2025-01-15",
            dateSold: "2025-04-01",
            proceeds: "5000",
            costBasis: "3000",
            holdingPeriod: "short",
            basisReportedToIRS: true,
            transactionType: "sale",
          },
        ],
      }],
    });
    const result = calculateFederalTax(input);
    // Capital gain: (60000-42000) + (5000-3000) = 18000 + 2000 = 20000
    expect(result.capitalGainLoss.toNumber()).toBe(20000);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Crypto hobby income flows to otherIncome (Schedule 1 Line 8z)", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [
          { asset: "BTC", dateReceived: "2025-03-15", quantity: "0.1", fairMarketValuePerUnit: "60000" },
        ],
        stakingIncome: [
          { asset: "ETH", dateReceived: "2025-04-15", quantity: "1.0", fairMarketValuePerUnit: "3000" },
        ],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });
    const result = calculateFederalTax(input);
    // Mining: 0.1 * 60000 = 6000, Staking: 1.0 * 3000 = 3000
    // Both are hobby → otherIncome should include 9000
    expect(result.otherIncome.toNumber()).toBe(9000);
  });

  it("Same-day trades: FIFO uses input order for lots acquired on same date", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-03-01", quantity: d(1), costBasisPerUnit: d(55000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2025-03-01", quantity: d(1), costBasisPerUnit: d(58000), source: "purchase" },
    ];

    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-03-01",
        dateSold: "2025-03-01",
        proceeds: "60000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // Same date: FIFO stable sort → first lot in array ($55,000 basis)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(55000);
    expect(result.dispositions[0].holdingPeriod).toBe("short");
  });

  it("Cross-exchange lot matching: lots from multiple acquisition sources match correctly", () => {
    // Lots acquired via different methods (purchased on different exchanges)
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-06-01", quantity: d(5), costBasisPerUnit: d(2500), source: "purchase", lotId: "coinbase-1" },
      { asset: "ETH", dateAcquired: "2024-09-01", quantity: d(3), costBasisPerUnit: d(3000), source: "purchase", lotId: "kraken-1" },
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(2), costBasisPerUnit: d(3500), source: "purchase", lotId: "gemini-1" },
    ];

    // Sell on Coinbase — should match against earliest lot regardless of where acquired
    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        dateAcquired: "VARIOUS",
        dateSold: "2025-07-01",
        proceeds: "20000",
        costBasis: "0",
        holdingPeriod: "long" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // FIFO: earliest lot (2024-06-01, $2500 * 5 = $12,500)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(12500);
    // Remaining lots should have the other two
    expect(result.remainingLots).toHaveLength(2);
    expect(result.remainingLots[0].lotId).toBe("kraken-1");
    expect(result.remainingLots[1].lotId).toBe("gemini-1");
  });

  it("Crypto business mining income increases Schedule C net profit and SE tax", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [
          { asset: "BTC", dateReceived: "2025-03-15", quantity: "1.0", fairMarketValuePerUnit: "60000", poolFees: "1000" },
        ],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: true,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });
    const result = calculateFederalTax(input);
    // Business mining net: 60000 - 1000 = 59000
    // This should flow through Schedule C → Schedule SE → self-employment tax
    expect(result.selfEmploymentTax.greaterThan(d(0))).toBe(true);
  });

  it("Orchestrator lot matching: user-provided lots determine basis for untracked 1099-DA transactions", () => {
    // User has 1099-DA from exchange that did not report basis, plus pre-existing lots
    const input = makeCryptoFixture({
      form1099DA: [{
        brokerName: "DeFi Aggregator",
        transactions: [{
          digitalAssetName: "Ethereum",
          ticker: "ETH",
          dateAcquired: "VARIOUS",
          dateSold: "2025-07-01",
          proceeds: "10000",
          costBasis: "0", // Broker did NOT report basis
          holdingPeriod: "long",
          basisReportedToIRS: false,
          transactionType: "sale",
        }],
      }],
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [
          { asset: "ETH", dateAcquired: "2024-01-15", quantity: "5", costBasisPerUnit: "2000", source: "purchase" },
          { asset: "ETH", dateAcquired: "2024-09-01", quantity: "3", costBasisPerUnit: "3500", source: "purchase" },
        ],
      },
    });
    const result = calculateFederalTax(input);
    // FIFO lot matching: earliest lot (2024-01-15, $2000 * 5 = $10,000 basis)
    // Gain = 10000 - 10000 = 0
    expect(result.capitalGainLoss.toNumber()).toBe(0);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Orchestrator lot matching: income-generated lots available for subsequent sales", () => {
    // Mine some ETH, then sell it via 1099-DA — mined lots should be available for matching
    const input = makeCryptoFixture({
      form1099DA: [{
        brokerName: "Coinbase",
        transactions: [{
          digitalAssetName: "Ethereum",
          ticker: "ETH",
          dateAcquired: "2025-01-20",
          dateSold: "2025-08-01",
          proceeds: "5000",
          costBasis: "0",
          holdingPeriod: "short",
          basisReportedToIRS: false,
          transactionType: "sale",
        }],
      }],
      cryptoIncome: {
        miningIncome: [
          { asset: "ETH", dateReceived: "2025-01-20", quantity: "2", fairMarketValuePerUnit: "2500" },
        ],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });
    const result = calculateFederalTax(input);
    // Mined ETH basis: 2 * $2500 = $5000
    // Sale: $5000 proceeds - $5000 basis = $0 gain
    // But also $5000 mining hobby income in otherIncome
    expect(result.capitalGainLoss.toNumber()).toBe(0);
    expect(result.otherIncome.toNumber()).toBe(5000); // Mining hobby income
    expect(result.digitalAssetQuestion).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// DeFi Token Swaps — DEX Trades
// Spec: spec/federal/defi-transactions.yaml
// ═══════════════════════════════════════════════════════════

describe("DeFi Token Swaps — DEX Trades", () => {
  it("DEX swap ETH→USDC generates taxable disposition with correct gain/loss", () => {
    // Bought 10 ETH at $2000 each. Swap to USDC when ETH = $3000.
    // Gain = $30000 proceeds - $20000 basis = $10000 gain.
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      protocol: "Uniswap",
      fromAsset: "ETH",
      fromQuantity: "5",
      toAsset: "USDC",
      toQuantity: "15000",
      fairMarketValueAtSwap: "15000",
      dateSwapped: "2025-06-15",
      gasFee: "25",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    expect(result.dispositions).toHaveLength(1);
    const disp = result.dispositions[0];
    expect(disp.proceeds.toNumber()).toBe(15000); // FMV at swap
    expect(disp.costBasis.toNumber()).toBe(10000); // 5 ETH * $2000
    expect(disp.gainOrLoss.toNumber()).toBe(5000); // $15000 - $10000
    expect(disp.holdingPeriod).toBe("long"); // Held > 1 year
    expect(disp.description).toBe("ETH→USDC swap via Uniswap");
    expect(disp.dateAcquired).toBe("2024-01-15");
    expect(disp.dateSold).toBe("2025-06-15");
  });

  it("DEX swap capitalizes gas fee into new token basis", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "2",
      toAsset: "UNI",
      toQuantity: "1000",
      fairMarketValueAtSwap: "6000", // 2 ETH worth $3000 each
      dateSwapped: "2025-03-01",
      gasFee: "50",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    // New lot for UNI: basis = FMV ($6000) + gas ($50) = $6050
    expect(result.newLots).toHaveLength(1);
    const newLot = result.newLots[0];
    expect(newLot.asset).toBe("UNI");
    expect(newLot.quantity.toNumber()).toBe(1000);
    // $6050 / 1000 = $6.05 per unit
    expect(newLot.costBasisPerUnit.toNumber()).toBe(6.05);
    expect(newLot.dateAcquired).toBe("2025-03-01");
    expect(newLot.source).toBe("swap");
  });

  it("DEX swap spanning multiple lots reports VARIOUS dateAcquired", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(2), costBasisPerUnit: d(1500), source: "purchase" },
      { asset: "ETH", dateAcquired: "2024-07-15", quantity: d(3), costBasisPerUnit: d(2500), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "4", // Spans both lots (FIFO: 2 from first + 2 from second)
      toAsset: "USDC",
      toQuantity: "12000",
      fairMarketValueAtSwap: "12000",
      dateSwapped: "2025-06-15",
      gasFee: "0",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    expect(result.dispositions).toHaveLength(1);
    const disp = result.dispositions[0];
    expect(disp.dateAcquired).toBe("VARIOUS"); // Multiple lots consumed
    // Cost basis: 2 * $1500 + 2 * $2500 = $3000 + $5000 = $8000
    expect(disp.costBasis.toNumber()).toBe(8000);
    expect(disp.gainOrLoss.toNumber()).toBe(4000); // $12000 - $8000
  });

  it("DEX swap with loss (sold token declined in value)", () => {
    const lots: TrackedLot[] = [
      { asset: "LUNA", dateAcquired: "2024-03-01", quantity: d(1000), costBasisPerUnit: d(100), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "LUNA",
      fromQuantity: "1000",
      toAsset: "USDC",
      toQuantity: "500",
      fairMarketValueAtSwap: "500", // LUNA crashed
      dateSwapped: "2025-01-15",
      gasFee: "5",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    const disp = result.dispositions[0];
    expect(disp.proceeds.toNumber()).toBe(500);
    expect(disp.costBasis.toNumber()).toBe(100000); // 1000 * $100
    expect(disp.gainOrLoss.toNumber()).toBe(-99500); // Loss
    expect(disp.holdingPeriod).toBe("short"); // < 1 year
  });

  it("short-term holding period for DEX swap within 1 year", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(5), costBasisPerUnit: d(3000), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "1",
      toAsset: "DAI",
      toQuantity: "3200",
      fairMarketValueAtSwap: "3200",
      dateSwapped: "2025-06-01",
      gasFee: "10",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");
    expect(result.dispositions[0].holdingPeriod).toBe("short");
  });

  it("no lots available: zero cost basis (full proceeds = gain)", () => {
    const lots: TrackedLot[] = []; // No lots

    const swaps = [{
      fromAsset: "SHIB",
      fromQuantity: "1000000",
      toAsset: "USDC",
      toQuantity: "100",
      fairMarketValueAtSwap: "100",
      dateSwapped: "2025-06-15",
      gasFee: "5",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    const disp = result.dispositions[0];
    expect(disp.costBasis.toNumber()).toBe(0);
    expect(disp.gainOrLoss.toNumber()).toBe(100); // Full proceeds = gain
    expect(disp.dateAcquired).toBe("UNKNOWN"); // No lots to derive date from
  });

  it("remaining lots updated after swap consumption", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "3",
      toAsset: "USDC",
      toQuantity: "9000",
      fairMarketValueAtSwap: "9000",
      dateSwapped: "2025-06-15",
      gasFee: "0",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    processDeFiTokenSwaps(swaps, lots, "fifo");

    // Original lots passed by reference are NOT mutated (function copies internally)
    expect(lots[0].quantity.toNumber()).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════
// DeFi Wrapped Token Conversions — Non-Taxable
// Spec: spec/federal/defi-transactions.yaml
// ═══════════════════════════════════════════════════════════

describe("DeFi Wrapped Token Conversions", () => {
  it("Wrapping ETH→WETH is non-taxable with basis carryover", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(5), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "3",
      toAsset: "WETH",
      toQuantity: "3",
      fairMarketValueAtSwap: "9000",
      dateSwapped: "2025-06-15",
      gasFee: "20",
      isWrappingEvent: true,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    // No taxable dispositions
    expect(result.dispositions).toHaveLength(0);
    expect(result.totalGainOrLoss.toNumber()).toBe(0);

    // Non-taxable event recorded
    expect(result.nonTaxableEvents).toHaveLength(1);
    expect(result.nonTaxableEvents[0].type).toBe("wrapping");
    expect(result.nonTaxableEvents[0].basisCarryover.toNumber()).toBe(6000); // 3 * $2000

    // New lot with carried-over basis (NOT FMV)
    expect(result.newLots).toHaveLength(1);
    const newLot = result.newLots[0];
    expect(newLot.asset).toBe("WETH");
    expect(newLot.quantity.toNumber()).toBe(3);
    expect(newLot.costBasisPerUnit.toNumber()).toBe(2000); // Carried over, NOT current FMV
  });

  it("Wrapping preserves original acquisition date for holding period", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2023-06-15", quantity: d(2), costBasisPerUnit: d(1800), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "2",
      toAsset: "WETH",
      toQuantity: "2",
      fairMarketValueAtSwap: "6000",
      dateSwapped: "2025-06-15",
      gasFee: "10",
      isWrappingEvent: true,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    // Holding period tacks — original date preserved
    const newLot = result.newLots[0];
    expect(newLot.dateAcquired).toBe("2023-06-15"); // Original date, not swap date
  });

  it("Gas fee on wrapping is personal expense, not added to basis", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(1), costBasisPerUnit: d(2500), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "1",
      toAsset: "WETH",
      toQuantity: "1",
      fairMarketValueAtSwap: "3000",
      dateSwapped: "2025-06-15",
      gasFee: "50", // Should NOT be added to WETH basis
      isWrappingEvent: true,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    // Basis = carried-over $2500, NOT $2500 + $50
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(2500);
  });

  it("Unwrapping WETH→ETH is non-taxable with basis carryover", () => {
    const lots: TrackedLot[] = [
      { asset: "WETH", dateAcquired: "2024-03-01", quantity: d(5), costBasisPerUnit: d(2200), source: "swap" },
    ];

    const swaps = [{
      fromAsset: "WETH",
      fromQuantity: "2",
      toAsset: "ETH",
      toQuantity: "2",
      fairMarketValueAtSwap: "6000",
      dateSwapped: "2025-06-15",
      gasFee: "15",
      isWrappingEvent: true, // Unwrapping uses same flag
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    expect(result.dispositions).toHaveLength(0); // Non-taxable
    expect(result.newLots[0].asset).toBe("ETH");
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(2200); // Basis carryover
  });
});

// ═══════════════════════════════════════════════════════════
// DeFi Bridge Transactions — Non-Taxable
// Spec: spec/federal/defi-transactions.yaml
// ═══════════════════════════════════════════════════════════

describe("DeFi Bridge Transactions", () => {
  it("Bridge transaction is non-taxable with basis carryover", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      protocol: "Arbitrum Bridge",
      fromAsset: "ETH",
      fromQuantity: "5",
      toAsset: "ETH",
      toQuantity: "5",
      fairMarketValueAtSwap: "15000",
      dateSwapped: "2025-06-15",
      gasFee: "10",
      isWrappingEvent: false,
      isBridgeTransaction: true,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    // No taxable dispositions
    expect(result.dispositions).toHaveLength(0);
    expect(result.totalGainOrLoss.toNumber()).toBe(0);

    // Non-taxable event recorded
    expect(result.nonTaxableEvents).toHaveLength(1);
    expect(result.nonTaxableEvents[0].type).toBe("bridge");
    expect(result.nonTaxableEvents[0].basisCarryover.toNumber()).toBe(10000); // 5 * $2000

    // New lot with carried-over basis
    expect(result.newLots).toHaveLength(1);
    const newLot = result.newLots[0];
    expect(newLot.asset).toBe("ETH");
    expect(newLot.costBasisPerUnit.toNumber()).toBe(2000);
    expect(newLot.quantity.toNumber()).toBe(5);
  });

  it("Bridge transaction preserves basis and holding period", () => {
    const lots: TrackedLot[] = [
      { asset: "USDC", dateAcquired: "2023-12-01", quantity: d(10000), costBasisPerUnit: d(1), source: "purchase" },
    ];

    const swaps = [{
      protocol: "Optimism Bridge",
      fromAsset: "USDC",
      fromQuantity: "5000",
      toAsset: "USDC",
      toQuantity: "5000",
      fairMarketValueAtSwap: "5000",
      dateSwapped: "2025-03-15",
      gasFee: "5",
      isWrappingEvent: false,
      isBridgeTransaction: true,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");

    const newLot = result.newLots[0];
    expect(newLot.dateAcquired).toBe("2023-12-01"); // Original date preserved
    expect(newLot.costBasisPerUnit.toNumber()).toBe(1); // Basis carried over
  });
});

// ═══════════════════════════════════════════════════════════
// DeFi Integration — Full Return Flow
// Spec: spec/federal/defi-transactions.yaml
// ═══════════════════════════════════════════════════════════

describe("DeFi Integration — Full Return", () => {
  it("DEX swap dispositions flow to Form 8949 with digitalAsset flag", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [{
          protocol: "Uniswap",
          fromAsset: "ETH",
          fromQuantity: "2",
          toAsset: "USDC",
          toQuantity: "6000",
          fairMarketValueAtSwap: "6000",
          dateSwapped: "2025-06-15",
          gasFee: "20",
          isWrappingEvent: false,
          isBridgeTransaction: false,
        }],
        cryptoCostBasisMethod: "fifo",
        lots: [
          { asset: "ETH", dateAcquired: "2024-01-15", quantity: "10", costBasisPerUnit: "2000", source: "purchase" },
        ],
      },
    });

    const result = calculateFederalTax(input);

    // 2 ETH: proceeds $6000, basis $4000 = $2000 long-term gain
    expect(result.capitalGainLoss.toNumber()).toBe(2000);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("DeFi token swaps trigger digitalAssetQuestion = true", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [{
          fromAsset: "ETH",
          fromQuantity: "1",
          toAsset: "WETH",
          toQuantity: "1",
          fairMarketValueAtSwap: "3000",
          dateSwapped: "2025-06-15",
          gasFee: "10",
          isWrappingEvent: true, // Even non-taxable swaps trigger the question
          isBridgeTransaction: false,
        }],
        cryptoCostBasisMethod: "fifo",
        lots: [
          { asset: "ETH", dateAcquired: "2024-01-15", quantity: "5", costBasisPerUnit: "2000", source: "purchase" },
        ],
      },
    });

    const result = calculateFederalTax(input);
    expect(result.digitalAssetQuestion).toBe(true);
    // Wrapping is non-taxable, so no capital gain
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });

  it("mixed taxable and non-taxable DeFi events in same return", () => {
    const input = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [
          // 1. Wrap ETH→WETH (non-taxable)
          {
            fromAsset: "ETH",
            fromQuantity: "5",
            toAsset: "WETH",
            toQuantity: "5",
            fairMarketValueAtSwap: "15000",
            dateSwapped: "2025-03-01",
            gasFee: "10",
            isWrappingEvent: true,
            isBridgeTransaction: false,
          },
          // 2. Swap WETH→USDC on Uniswap (taxable)
          {
            protocol: "Uniswap",
            fromAsset: "WETH",
            fromQuantity: "3",
            toAsset: "USDC",
            toQuantity: "9000",
            fairMarketValueAtSwap: "9000",
            dateSwapped: "2025-06-15",
            gasFee: "25",
            isWrappingEvent: false,
            isBridgeTransaction: false,
          },
        ],
        cryptoCostBasisMethod: "fifo",
        lots: [
          { asset: "ETH", dateAcquired: "2024-01-15", quantity: "10", costBasisPerUnit: "2000", source: "purchase" },
        ],
      },
    });

    const result = calculateFederalTax(input);

    // Step 1: Wrap 5 ETH → 5 WETH. Basis carries over at $2000/unit. Non-taxable.
    // Step 2: Swap 3 WETH → USDC. Proceeds $9000, basis 3*$2000=$6000, gain=$3000.
    // The WETH lots were created by the wrapping step at basis $2000 each.
    expect(result.capitalGainLoss.toNumber()).toBe(3000);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("DeFi swap with HIFO method minimizes gain", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-15", quantity: d(5), costBasisPerUnit: d(1500), source: "purchase" },
      { asset: "ETH", dateAcquired: "2024-06-15", quantity: d(5), costBasisPerUnit: d(3500), source: "purchase" },
    ];

    const swaps = [{
      fromAsset: "ETH",
      fromQuantity: "3",
      toAsset: "USDC",
      toQuantity: "9000",
      fairMarketValueAtSwap: "9000",
      dateSwapped: "2025-06-15",
      gasFee: "0",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps, lots, "hifo");

    // HIFO picks highest basis first: 3 * $3500 = $10500 basis
    // Proceeds $9000 - basis $10500 = -$1500 loss
    expect(result.dispositions[0].costBasis.toNumber()).toBe(10500);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(-1500);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: DeFi LP Positions
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

import {
  processDeFiLPPositions,
  calculateYieldRewards,
  processNFTTransactions,
  calculateCryptoLendingIncome,
  processCryptoLiquidations,
  calculateCryptoDonations,
  trackWashSaleCarryforward,
} from "@/engine/forms/crypto-lot-matching.js";
import type {
  DeFiLPPosition,
  DeFiYieldReward,
  NFTTransaction,
  CryptoLendingIncome,
  CryptoLiquidation,
  CryptoDonation,
} from "@/models/inputs.js";

describe("DeFi LP Positions", () => {
  it("LP entry is non-taxable and establishes LP token lot", () => {
    const positions: DeFiLPPosition[] = [{
      protocol: "Uniswap V3",
      poolAssets: ["ETH", "USDC"],
      lpTokensReceived: "100",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },
        { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" },
      ],
      dateEntered: "2025-03-01",
      gasFeeEntry: "25",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");

    // No dispositions (entry is non-taxable)
    expect(result.dispositions).toHaveLength(0);
    // LP token lot established: basis = (5*2000 + 10000*1) + 25 gas = $20025
    const lpLot = result.newLots.find((l) => l.asset.includes("LP-"));
    expect(lpLot).toBeDefined();
    const lp = lpLot as NonNullable<typeof lpLot>;
    expect(lp.costBasisPerUnit.times(d(lp.quantity)).toNumber()).toBe(20025);
    expect(lp.dateAcquired).toBe("2025-03-01");
  });

  it("LP entry capitalizes gas fee into LP token basis", () => {
    const positions: DeFiLPPosition[] = [{
      protocol: "Curve",
      poolAssets: ["USDC", "USDT"],
      lpTokensReceived: "50",
      underlyingAssetsDeposited: [
        { asset: "USDC", quantity: "5000", costBasisPerUnit: "1" },
        { asset: "USDT", quantity: "5000", costBasisPerUnit: "1" },
      ],
      dateEntered: "2025-01-15",
      gasFeeEntry: "10",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");
    const lpLot = result.newLots[0];
    // Basis = 5000 + 5000 + 10 gas = 10010, per unit = 10010/50 = 200.2
    expect(lpLot.costBasisPerUnit.toNumber()).toBeCloseTo(200.2, 4);
  });

  it("LP exit generates taxable disposition with correct gain/loss", () => {
    const positions: DeFiLPPosition[] = [{
      protocol: "Uniswap V3",
      poolAssets: ["ETH", "USDC"],
      lpTokensReceived: "100",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },
        { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" },
      ],
      dateEntered: "2024-01-01",
      dateExited: "2025-06-01",
      underlyingAssetsReceived: [
        { asset: "ETH", quantity: "4", fairMarketValuePerUnit: "3000" },
        { asset: "USDC", quantity: "13000", fairMarketValuePerUnit: "1" },
      ],
      gasFeeEntry: "0",
      gasFeeExit: "30",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");

    expect(result.dispositions).toHaveLength(1);
    const disp = result.dispositions[0];
    // Proceeds = (4*3000 + 13000*1) - 30 gas = 24970
    expect(disp.proceeds.toNumber()).toBe(24970);
    // Basis = 5*2000 + 10000 = 20000
    expect(disp.costBasis.toNumber()).toBe(20000);
    // Gain = 24970 - 20000 = 4970
    expect(disp.gainOrLoss.toNumber()).toBe(4970);
    // Held >1 year → long-term
    expect(disp.holdingPeriod).toBe("long");
  });

  it("LP exit gas fee reduces proceeds", () => {
    const positions: DeFiLPPosition[] = [{
      protocol: "SushiSwap",
      poolAssets: ["WETH", "DAI"],
      lpTokensReceived: "10",
      underlyingAssetsDeposited: [
        { asset: "WETH", quantity: "1", costBasisPerUnit: "1500" },
        { asset: "DAI", quantity: "1500", costBasisPerUnit: "1" },
      ],
      dateEntered: "2025-01-01",
      dateExited: "2025-03-01",
      underlyingAssetsReceived: [
        { asset: "WETH", quantity: "1", fairMarketValuePerUnit: "1800" },
        { asset: "DAI", quantity: "1200", fairMarketValuePerUnit: "1" },
      ],
      gasFeeEntry: "0",
      gasFeeExit: "50",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");
    // Proceeds = (1800 + 1200) - 50 = 2950
    expect(result.dispositions[0].proceeds.toNumber()).toBe(2950);
  });

  it("LP exit tracks impermanent loss (informational only)", () => {
    // Scenario: deposited 5 ETH @ $2000 + 10000 USDC, total $20000 basis
    // Received back 4 ETH @ $2500 + 12000 USDC = $22000 FMV
    // If had just held: 5 ETH @ $2500 + 10000 USDC = $22500
    // IL = $20000 (deposit basis) - $22000 (received FMV) = negative (no IL here)
    // Use a case where IL is positive
    const positions: DeFiLPPosition[] = [{
      protocol: "Uniswap V3",
      poolAssets: ["ETH", "USDC"],
      lpTokensReceived: "100",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },
        { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" },
      ],
      dateEntered: "2025-01-01",
      dateExited: "2025-06-01",
      underlyingAssetsReceived: [
        { asset: "ETH", quantity: "3", fairMarketValuePerUnit: "2000" },
        { asset: "USDC", quantity: "8000", fairMarketValuePerUnit: "1" },
      ],
      gasFeeEntry: "0",
      gasFeeExit: "0",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");
    // Deposited basis = 10000 + 10000 = 20000
    // Received FMV = 6000 + 8000 = 14000
    // IL = 20000 - 14000 = 6000 (positive, meaning IL occurred)
    expect(result.impermanentLoss).toHaveLength(1);
    expect(result.impermanentLoss[0].amount.toNumber()).toBe(6000);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: DeFi Yield / Liquidity Mining Rewards
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("DeFi Yield / Liquidity Mining Rewards", () => {
  it("Yield reward income = quantity × FMV at receipt", () => {
    const rewards: DeFiYieldReward[] = [{
      protocol: "Aave",
      asset: "AAVE",
      dateReceived: "2025-04-01",
      quantity: "10",
      fairMarketValuePerUnit: "85",
      rewardType: "liquidity_mining",
    }];

    const result = calculateYieldRewards(rewards);
    expect(result.totalOrdinaryIncome.toNumber()).toBe(850);
  });

  it("Yield rewards establish basis lots at FMV", () => {
    const rewards: DeFiYieldReward[] = [{
      protocol: "SushiSwap",
      asset: "SUSHI",
      dateReceived: "2025-05-15",
      quantity: "200",
      fairMarketValuePerUnit: "1.50",
      rewardType: "yield_farming",
    }];

    const result = calculateYieldRewards(rewards);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("SUSHI");
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(1.5);
    expect(result.newLots[0].quantity.toNumber()).toBe(200);
  });

  it("Yield rewards aggregate by protocol for audit trail", () => {
    const rewards: DeFiYieldReward[] = [
      {
        protocol: "Aave",
        asset: "AAVE",
        dateReceived: "2025-04-01",
        quantity: "10",
        fairMarketValuePerUnit: "85",
        rewardType: "liquidity_mining",
      },
      {
        protocol: "Aave",
        asset: "AAVE",
        dateReceived: "2025-05-01",
        quantity: "5",
        fairMarketValuePerUnit: "90",
        rewardType: "liquidity_mining",
      },
      {
        protocol: "Compound",
        asset: "COMP",
        dateReceived: "2025-04-15",
        quantity: "2",
        fairMarketValuePerUnit: "50",
        rewardType: "governance_distribution",
      },
    ];

    const result = calculateYieldRewards(rewards);
    // Total = 10*85 + 5*90 + 2*50 = 850 + 450 + 100 = 1400
    expect(result.totalOrdinaryIncome.toNumber()).toBe(1400);
    expect(result.byProtocol).toHaveLength(3);
    expect(result.newLots).toHaveLength(3);
  });

  it("Zero-value governance token has $0 income", () => {
    const rewards: DeFiYieldReward[] = [{
      protocol: "Uniswap",
      asset: "UNI",
      dateReceived: "2025-06-01",
      quantity: "100",
      fairMarketValuePerUnit: "0",
      rewardType: "governance_distribution",
    }];

    const result = calculateYieldRewards(rewards);
    expect(result.totalOrdinaryIncome.toNumber()).toBe(0);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: NFT Transactions
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("NFT Transactions", () => {
  it("NFT purchase establishes lot with basis = price + gas", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "CryptoPunk #1234",
      collectionName: "CryptoPunks",
      tokenId: "1234",
      transactionType: "buy",
      costBasis: "50000",
      gasFee: "100",
      dateAcquired: "2025-02-15",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions).toHaveLength(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(50100); // price + gas
    expect(result.newLots[0].asset).toContain("NFT:");
  });

  it("NFT sale generates Form 8949 disposition with correct gain/loss", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "BoredApe #5678",
      collectionName: "BAYC",
      tokenId: "5678",
      transactionType: "sell",
      proceeds: "75000",
      costBasis: "50000",
      gasFee: "150",
      dateAcquired: "2024-01-01",
      dateSold: "2025-06-15",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions).toHaveLength(1);
    const disp = result.dispositions[0];
    // Proceeds = 75000 - 150 gas = 74850
    expect(disp.proceeds.toNumber()).toBe(74850);
    expect(disp.costBasis.toNumber()).toBe(50000);
    expect(disp.gainOrLoss.toNumber()).toBe(24850);
    expect(disp.holdingPeriod).toBe("long");
  });

  it("NFT sale gas fee reduces proceeds", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "Azuki #100",
      transactionType: "sell",
      proceeds: "10000",
      costBasis: "8000",
      gasFee: "500",
      dateAcquired: "2025-01-01",
      dateSold: "2025-03-01",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(9500);
  });

  it("Collectible NFT long-term gain tracked at 28% max rate", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "RareArt #1",
      transactionType: "sell",
      proceeds: "100000",
      costBasis: "20000",
      gasFee: "0",
      dateAcquired: "2023-01-01",
      dateSold: "2025-06-01",
      isCollectible: true,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.collectibleGains.toNumber()).toBe(80000);
    expect(result.dispositions[0].holdingPeriod).toBe("long");
  });

  it("Non-collectible NFT does not add to collectibleGains", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "GameItem #1",
      transactionType: "sell",
      proceeds: "5000",
      costBasis: "1000",
      gasFee: "0",
      dateAcquired: "2023-01-01",
      dateSold: "2025-06-01",
      isCollectible: false,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.collectibleGains.toNumber()).toBe(0);
  });

  it("NFT airdrop recognized as ordinary income at FMV", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "FreeNFT #42",
      collectionName: "PromoCollection",
      transactionType: "airdrop",
      dateAcquired: "2025-04-01",
      fairMarketValueAtTransaction: "500",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.airdropIncome.toNumber()).toBe(500);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(500);
    expect(result.newLots[0].source).toBe("nft-airdrop");
  });

  it("NFT mint sale by creator routes to Schedule C income", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "MyArt #1",
      transactionType: "mint",
      proceeds: "2000",
      gasFee: "50",
      dateAcquired: "2025-03-01",
      isBusiness: true,
    }];

    const result = processNFTTransactions(transactions);
    // Creator income = 2000 - 50 gas = 1950
    expect(result.mintSaleIncome.toNumber()).toBe(1950);
    expect(result.dispositions).toHaveLength(0); // Not a capital gain
  });

  it("NFT mint for personal use: basis = gas fee only", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "PersonalArt #1",
      transactionType: "mint",
      gasFee: "30",
      dateAcquired: "2025-05-01",
      isBusiness: false,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.mintSaleIncome.toNumber()).toBe(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(30);
    expect(result.newLots[0].source).toBe("nft-mint");
  });

  it("NFT gift received has no income and uses donor basis", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "GiftedNFT #99",
      transactionType: "gift",
      costBasis: "15000",
      dateAcquired: "2025-01-01",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.airdropIncome.toNumber()).toBe(0);
    expect(result.mintSaleIncome.toNumber()).toBe(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(15000);
    expect(result.newLots[0].source).toBe("nft-gift");
  });

  it("NFT short-term sale is short-term holding period", () => {
    const transactions: NFTTransaction[] = [{
      nftName: "QuickFlip #1",
      transactionType: "sell",
      proceeds: "5000",
      costBasis: "3000",
      gasFee: "0",
      dateAcquired: "2025-05-01",
      dateSold: "2025-06-01",
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions[0].holdingPeriod).toBe("short");
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Crypto Lending Income
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("Crypto Lending Income", () => {
  it("Crypto lending interest income = quantity × FMV", () => {
    const income: CryptoLendingIncome[] = [{
      platform: "Aave",
      asset: "USDC",
      interestReceived: "500",
      fairMarketValuePerUnit: "1",
      dateReceived: "2025-04-01",
    }];

    const result = calculateCryptoLendingIncome(income);
    expect(result.totalInterestIncome.toNumber()).toBe(500);
  });

  it("Lending interest establishes basis lots at FMV", () => {
    const income: CryptoLendingIncome[] = [{
      platform: "Compound",
      asset: "ETH",
      interestReceived: "0.5",
      fairMarketValuePerUnit: "3000",
      dateReceived: "2025-05-01",
    }];

    const result = calculateCryptoLendingIncome(income);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].asset).toBe("ETH");
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(3000);
    expect(result.newLots[0].quantity.toNumber()).toBe(0.5);
    expect(result.newLots[0].source).toBe("lending:Compound");
  });

  it("Multiple lending platforms aggregate correctly", () => {
    const income: CryptoLendingIncome[] = [
      {
        platform: "Aave",
        asset: "USDC",
        interestReceived: "100",
        fairMarketValuePerUnit: "1",
        dateReceived: "2025-03-01",
      },
      {
        platform: "Compound",
        asset: "DAI",
        interestReceived: "200",
        fairMarketValuePerUnit: "1",
        dateReceived: "2025-04-01",
      },
      {
        platform: "Aave",
        asset: "ETH",
        interestReceived: "0.1",
        fairMarketValuePerUnit: "2500",
        dateReceived: "2025-05-01",
      },
    ];

    const result = calculateCryptoLendingIncome(income);
    // Total = 100 + 200 + 250 = 550
    expect(result.totalInterestIncome.toNumber()).toBe(550);
    expect(result.byPlatform).toHaveLength(3);
    expect(result.newLots).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Crypto Collateral Liquidation
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("Crypto Collateral Liquidation", () => {
  it("Collateral liquidation generates taxable disposition", () => {
    const lots: TrackedLot[] = [{
      asset: "ETH",
      dateAcquired: "2024-06-01",
      quantity: d(10),
      costBasisPerUnit: d(2000),
      source: "purchase",
    }];

    const liquidations: CryptoLiquidation[] = [{
      platform: "Aave",
      collateralAsset: "ETH",
      collateralQuantity: "5",
      fairMarketValueAtLiquidation: "15000",
      dateOfLiquidation: "2025-07-01",
    }];

    const result = processCryptoLiquidations(liquidations, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    const disp = result.dispositions[0];
    expect(disp.proceeds.toNumber()).toBe(15000);
    expect(disp.costBasis.toNumber()).toBe(10000); // 5 * 2000
    expect(disp.gainOrLoss.toNumber()).toBe(5000);
    expect(disp.holdingPeriod).toBe("long");
    expect(disp.description).toContain("liquidation");
  });

  it("Liquidation with loss when collateral value drops", () => {
    const lots: TrackedLot[] = [{
      asset: "ETH",
      dateAcquired: "2025-01-01",
      quantity: d(5),
      costBasisPerUnit: d(3000),
      source: "purchase",
    }];

    const liquidations: CryptoLiquidation[] = [{
      platform: "Compound",
      collateralAsset: "ETH",
      collateralQuantity: "5",
      fairMarketValueAtLiquidation: "10000",
      dateOfLiquidation: "2025-03-01",
    }];

    const result = processCryptoLiquidations(liquidations, lots, "fifo");
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(-5000);
    expect(result.dispositions[0].holdingPeriod).toBe("short");
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Crypto Donations
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("Crypto Donations to Charity", () => {
  it("Long-term crypto donation deducts FMV and avoids capital gains", () => {
    const donations: CryptoDonation[] = [{
      asset: "BTC",
      quantity: "1",
      dateAcquired: "2023-01-01",
      dateDonated: "2025-06-01",
      fairMarketValueAtDonation: "60000",
      costBasis: "20000",
      charityName: "Red Cross",
    }];

    const result = calculateCryptoDonations(donations);
    expect(result.totalDeduction.toNumber()).toBe(60000);
    expect(result.longTermDonations).toHaveLength(1);
    expect(result.longTermDonations[0].avoidedGain.toNumber()).toBe(40000);
    expect(result.shortTermDonations).toHaveLength(0);
  });

  it("Short-term crypto donation deducts basis only", () => {
    const donations: CryptoDonation[] = [{
      asset: "ETH",
      quantity: "5",
      dateAcquired: "2025-03-01",
      dateDonated: "2025-06-01",
      fairMarketValueAtDonation: "15000",
      costBasis: "12000",
      charityName: "Wikipedia Foundation",
    }];

    const result = calculateCryptoDonations(donations);
    expect(result.totalDeduction.toNumber()).toBe(12000); // basis, not FMV
    expect(result.shortTermDonations).toHaveLength(1);
    expect(result.longTermDonations).toHaveLength(0);
  });

  it("Mixed long-term and short-term donations", () => {
    const donations: CryptoDonation[] = [
      {
        asset: "BTC",
        quantity: "0.5",
        dateAcquired: "2023-06-01",
        dateDonated: "2025-06-01",
        fairMarketValueAtDonation: "30000",
        costBasis: "10000",
        charityName: "EFF",
      },
      {
        asset: "ETH",
        quantity: "2",
        dateAcquired: "2025-04-01",
        dateDonated: "2025-06-01",
        fairMarketValueAtDonation: "6000",
        costBasis: "5000",
        charityName: "Charity Water",
      },
    ];

    const result = calculateCryptoDonations(donations);
    // Long-term BTC: deduct FMV $30000
    // Short-term ETH: deduct basis $5000
    expect(result.totalDeduction.toNumber()).toBe(35000);
    expect(result.longTermDonations).toHaveLength(1);
    expect(result.shortTermDonations).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Wash Sale Carryforward
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

describe("Wash Sale Carryforward", () => {
  it("Wash sale disallowed loss carries forward to replacement lot basis", () => {
    const lots: TrackedLot[] = [{
      asset: "BTC",
      dateAcquired: "2025-06-20",
      quantity: d(1),
      costBasisPerUnit: d(28000),
      source: "purchase",
      lotId: "replacement-1",
    }];

    const dispositions = [{
      description: "BTC (Bitcoin) via Coinbase",
      dateAcquired: "2025-01-01",
      dateSold: "2025-06-15",
      proceeds: d(25000),
      costBasis: d(30000),
      gainOrLoss: d(-5000),
      holdingPeriod: "short" as const,
      basisReportedToIRS: false,
      washSale: true,
      washSaleDisallowed: d(5000),
      adjustments: d(5000),
    }];

    const result = trackWashSaleCarryforward(dispositions, lots);
    expect(result.entries).toHaveLength(1);
    expect(result.totalDisallowedLoss.toNumber()).toBe(5000);
    // Replacement lot basis should be increased
    expect(lots[0].costBasisPerUnit.toNumber()).toBe(33000); // 28000 + 5000
  });

  it("Wash sale carryforward tracks total disallowed amount", () => {
    const lots: TrackedLot[] = [
      {
        asset: "ETH",
        dateAcquired: "2025-07-01",
        quantity: d(5),
        costBasisPerUnit: d(2000),
        source: "purchase",
      },
    ];

    const dispositions = [
      {
        description: "ETH via Kraken",
        dateAcquired: "2025-03-01",
        dateSold: "2025-06-25",
        proceeds: d(9000),
        costBasis: d(12000),
        gainOrLoss: d(-3000),
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        washSale: true,
        washSaleDisallowed: d(3000),
        adjustments: d(3000),
      },
      {
        description: "ETH via Uniswap",
        dateAcquired: "2025-04-01",
        dateSold: "2025-06-28",
        proceeds: d(4500),
        costBasis: d(5500),
        gainOrLoss: d(-1000),
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        washSale: true,
        washSaleDisallowed: d(1000),
        adjustments: d(1000),
      },
    ];

    const result = trackWashSaleCarryforward(dispositions, lots);
    expect(result.entries).toHaveLength(2);
    expect(result.totalDisallowedLoss.toNumber()).toBe(4000);
  });

  it("Non-wash-sale disposition is ignored by carryforward tracker", () => {
    const dispositions = [{
      description: "BTC via Coinbase",
      dateAcquired: "2025-01-01",
      dateSold: "2025-06-15",
      proceeds: d(35000),
      costBasis: d(30000),
      gainOrLoss: d(5000),
      holdingPeriod: "short" as const,
      basisReportedToIRS: false,
      washSale: false,
      washSaleDisallowed: d(0),
      adjustments: d(0),
    }];

    const result = trackWashSaleCarryforward(dispositions, []);
    expect(result.entries).toHaveLength(0);
    expect(result.totalDisallowedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase 2 — Federal Orchestrator Integration Tests
// Verify DeFi/NFT/lending/donation flows wire through to Form 1040
// ═══════════════════════════════════════════════════════════

describe("Phase 2 Orchestrator — LP positions flow to Schedule D", () => {
  it("LP exit generates capital gain visible in federal return", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [{
          protocol: "Uniswap V3",
          poolAssets: ["ETH", "USDC"],
          lpTokensReceived: "100",
          underlyingAssetsDeposited: [
            { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },
            { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" },
          ],
          dateEntered: "2024-01-15",
          dateExited: "2025-06-01",
          underlyingAssetsReceived: [
            { asset: "ETH", quantity: "4", fairMarketValuePerUnit: "3500" },
            { asset: "USDC", quantity: "12000", fairMarketValuePerUnit: "1" },
          ],
          gasFeeEntry: "50",
          gasFeeExit: "40",
        }],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
    // LP exit proceeds: (4*3500 + 12000) - 40 gas = 25960
    // LP basis: (5*2000 + 10000) + 50 gas = 20050
    // Gain: 25960 - 20050 = 5910
    expect(result.capitalGainLoss.toNumber()).toBeGreaterThan(0);
  });
});

describe("Phase 2 Orchestrator — Yield rewards flow to ordinary income", () => {
  it("Yield farming income increases AGI via Schedule 1 Line 8z", () => {
    const fixtureNoYield = makeCryptoFixture();
    const baseResult = calculateFederalTax(fixtureNoYield);

    const fixtureWithYield = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [{
          protocol: "Aave",
          asset: "AAVE",
          dateReceived: "2025-03-15",
          quantity: "10",
          fairMarketValuePerUnit: "100",
          rewardType: "yield_farming",
        }],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const yieldResult = calculateFederalTax(fixtureWithYield);
    expect(yieldResult.digitalAssetQuestion).toBe(true);
    // $1000 yield income → Schedule 1 Line 8z → increases AGI by exactly $1000
    // (not subject to SE tax, so no SE deduction offset)
    expect(yieldResult.agi.minus(baseResult.agi).toNumber()).toBe(1000);
  });
});

describe("Phase 2 Orchestrator — NFT sale flows to Schedule D", () => {
  it("NFT sale generates capital gain in federal return", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [{
          nftName: "CryptoPunk #1234",
          collectionName: "CryptoPunks",
          transactionType: "sell",
          proceeds: "50000",
          costBasis: "10000",
          gasFee: "100",
          dateAcquired: "2024-01-01",
          dateSold: "2025-07-01",
          isCollectible: false,
          isBusiness: false,
        }],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
    // NFT gain: (50000 - 100 gas) - 10000 basis = 39900
    expect(result.capitalGainLoss.toNumber()).toBeGreaterThan(0);
  });
});

describe("Phase 2 Orchestrator — Lending income flows to ordinary income", () => {
  it("Crypto lending interest increases AGI", () => {
    const fixtureNoLending = makeCryptoFixture();
    const baseResult = calculateFederalTax(fixtureNoLending);

    const fixtureWithLending = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [{
          platform: "Aave",
          asset: "USDC",
          interestReceived: "500",
          fairMarketValuePerUnit: "1",
          dateReceived: "2025-06-01",
        }],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixtureWithLending);
    expect(result.digitalAssetQuestion).toBe(true);
    // $500 lending interest → Schedule 1 Line 8z → increases AGI by exactly $500
    expect(result.agi.minus(baseResult.agi).toNumber()).toBe(500);
  });
});

describe("Phase 2 Orchestrator — Collateral liquidation flows to Schedule D", () => {
  it("Liquidation generates taxable disposition in federal return", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [{
          platform: "Aave",
          collateralAsset: "ETH",
          collateralQuantity: "2",
          fairMarketValueAtLiquidation: "5000",
          dateOfLiquidation: "2025-04-15",
        }],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [{ asset: "ETH", dateAcquired: "2024-01-01", quantity: "5", costBasisPerUnit: "3000", source: "purchase" }],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
    // Liquidation: proceeds $5000 - basis (2 * $3000 = $6000) = -$1000 loss
    expect(result.capitalGainLoss.toNumber()).toBeLessThan(0);
  });
});

describe("Phase 2 Orchestrator — Crypto donation affects itemized deductions", () => {
  it("Long-term crypto donation adds FMV to charitable deduction", () => {
    const fixtureNoDonation = makeCryptoFixture({
      scheduleA: {
        medicalExpenses: "0",
        personalPropertyTaxes: "5000",
        investmentInterestExpense: "0",
        gamblingLosses: "0",
        cashCharitableContributions: "5000",
        nonCashCharitableContributions: "0",
      },
    });
    const baseResult = calculateFederalTax(fixtureNoDonation);

    const fixtureWithDonation = makeCryptoFixture({
      scheduleA: {
        medicalExpenses: "0",
        personalPropertyTaxes: "5000",
        investmentInterestExpense: "0",
        gamblingLosses: "0",
        cashCharitableContributions: "5000",
        nonCashCharitableContributions: "0",
      },
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [{
          asset: "BTC",
          quantity: "0.5",
          dateAcquired: "2023-01-01",
          dateDonated: "2025-06-01",
          fairMarketValueAtDonation: "30000",
          costBasis: "15000",
          charityName: "Red Cross",
        }],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixtureWithDonation);
    expect(result.digitalAssetQuestion).toBe(true);
    // $30,000 FMV deduction for long-term donation should increase itemized deductions
    expect(result.itemizedDeductions.toNumber()).toBeGreaterThan(
      baseResult.itemizedDeductions.toNumber()
    );
  });
});

describe("Phase 2 Orchestrator — NFT creator mint sale flows to Schedule C", () => {
  it("NFT business creator mint sale increases AGI via Schedule C", () => {
    const fixtureNoNFT = makeCryptoFixture();
    const baseResult = calculateFederalTax(fixtureNoNFT);

    const fixtureWithNFT = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [{
          nftName: "My Art #1",
          transactionType: "mint",
          proceeds: "5000",
          costBasis: "0",
          gasFee: "50",
          dateAcquired: "2025-03-01",
          isCollectible: false,
          isBusiness: true,
        }],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixtureWithNFT);
    expect(result.digitalAssetQuestion).toBe(true);
    // Mint sale income: $5000 - $50 gas = $4950 → Schedule C
    // AGI increases by less than $4950 due to deductible half of SE tax
    const agiIncrease = result.agi.minus(baseResult.agi).toNumber();
    expect(agiIncrease).toBeGreaterThan(0);
    expect(agiIncrease).toBeLessThanOrEqual(4950);
  });
});

describe("Phase 2 Orchestrator — Digital asset question comprehensive", () => {
  it("LP positions trigger digitalAssetQuestion", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [{
          protocol: "Curve",
          poolAssets: ["USDC", "DAI"],
          lpTokensReceived: "1000",
          underlyingAssetsDeposited: [
            { asset: "USDC", quantity: "500", costBasisPerUnit: "1" },
            { asset: "DAI", quantity: "500", costBasisPerUnit: "1" },
          ],
          dateEntered: "2025-03-01",
          gasFeeEntry: "5",
          gasFeeExit: "0",
        }],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Lending income triggers digitalAssetQuestion", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [{
          platform: "Compound",
          asset: "DAI",
          interestReceived: "10",
          fairMarketValuePerUnit: "1",
          dateReceived: "2025-06-01",
        }],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
  });

  it("Crypto donation triggers digitalAssetQuestion", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [{
          asset: "ETH",
          quantity: "1",
          dateAcquired: "2023-01-01",
          dateDonated: "2025-06-01",
          fairMarketValueAtDonation: "3500",
          costBasis: "1500",
          charityName: "EFF",
        }],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.digitalAssetQuestion).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase 2 Output Fields — sub-results exposed on TaxReturnResult
// ═══════════════════════════════════════════════════════════

describe("Phase 2 Output — sub-results populated on TaxReturnResult", () => {
  it("cryptoLPPositions populated when LP positions present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [{
          protocol: "Uniswap V3",
          poolAssets: ["ETH", "USDC"],
          lpTokensReceived: "100",
          underlyingAssetsDeposited: [
            { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },
            { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" },
          ],
          dateEntered: "2024-01-15",
          dateExited: "2025-06-01",
          underlyingAssetsReceived: [
            { asset: "ETH", quantity: "4", fairMarketValuePerUnit: "3500" },
            { asset: "USDC", quantity: "12000", fairMarketValuePerUnit: "1" },
          ],
          gasFeeEntry: "50",
          gasFeeExit: "40",
        }],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoLPPositions).toBeDefined();
    const lpPos = result.cryptoLPPositions as NonNullable<typeof result.cryptoLPPositions>;
    expect(lpPos.dispositions).toHaveLength(1);
    expect(lpPos.totalGainOrLoss.toNumber()).toBe(5910);
    expect(lpPos.impermanentLoss).toHaveLength(1);
  });

  it("cryptoYieldRewards populated when yield rewards present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [{
          protocol: "Aave",
          asset: "AAVE",
          dateReceived: "2025-03-15",
          quantity: "10",
          fairMarketValuePerUnit: "100",
          rewardType: "yield_farming",
        }],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoYieldRewards).toBeDefined();
    const yieldRewards = result.cryptoYieldRewards as NonNullable<typeof result.cryptoYieldRewards>;
    expect(yieldRewards.totalOrdinaryIncome.toNumber()).toBe(1000);
    expect(yieldRewards.byProtocol).toHaveLength(1);
    expect(yieldRewards.byProtocol[0].protocol).toBe("Aave");
  });

  it("cryptoNFT populated when NFT transactions present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [{
          nftName: "CryptoPunk #1234",
          collectionName: "CryptoPunks",
          transactionType: "sell",
          proceeds: "50000",
          costBasis: "10000",
          gasFee: "100",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-15",
          isCollectible: true,
        }],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoNFT).toBeDefined();
    const nft = result.cryptoNFT as NonNullable<typeof result.cryptoNFT>;
    expect(nft.dispositions).toHaveLength(1);
    expect(nft.collectibleGains.toNumber()).toBe(39900);
  });

  it("cryptoLending populated when lending income present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [{
          platform: "Aave",
          asset: "USDC",
          interestReceived: "500",
          fairMarketValuePerUnit: "1",
          dateReceived: "2025-06-01",
        }],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoLending).toBeDefined();
    const lending = result.cryptoLending as NonNullable<typeof result.cryptoLending>;
    expect(lending.totalInterestIncome.toNumber()).toBe(500);
    expect(lending.byPlatform[0].platform).toBe("Aave");
  });

  it("cryptoLiquidations populated when liquidation events present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [{
          platform: "Aave",
          collateralAsset: "ETH",
          collateralQuantity: "2",
          fairMarketValueAtLiquidation: "5000",
          dateOfLiquidation: "2025-06-01",
        }],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [{ asset: "ETH", dateAcquired: "2024-01-01", quantity: "10", costBasisPerUnit: "2000", source: "purchase" }],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoLiquidations).toBeDefined();
    const liquidations = result.cryptoLiquidations as NonNullable<typeof result.cryptoLiquidations>;
    expect(liquidations.dispositions).toHaveLength(1);
    expect(liquidations.totalGainOrLoss.toNumber()).toBe(1000);
  });

  it("cryptoDonations populated when crypto donations present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [{
          asset: "BTC",
          quantity: "1",
          dateAcquired: "2023-01-01",
          dateDonated: "2025-06-01",
          fairMarketValueAtDonation: "60000",
          costBasis: "20000",
          charityName: "EFF",
        }],
        cryptoCostBasisMethod: "fifo",
        lots: [],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoDonations).toBeDefined();
    const donations = result.cryptoDonations as NonNullable<typeof result.cryptoDonations>;
    expect(donations.totalDeduction.toNumber()).toBe(60000);
    expect(donations.longTermDonations).toHaveLength(1);
    expect(donations.longTermDonations[0].avoidedGain.toNumber()).toBe(40000);
  });

  it("cryptoDeFiSwaps populated when token swaps present", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [{
          protocol: "Uniswap",
          fromAsset: "ETH",
          fromQuantity: "5",
          toAsset: "USDC",
          toQuantity: "15000",
          fairMarketValueAtSwap: "15000",
          dateSwapped: "2025-06-01",
          gasFee: "20",
        }],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [{ asset: "ETH", dateAcquired: "2024-01-01", quantity: "10", costBasisPerUnit: "2000", source: "purchase" }],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoDeFiSwaps).toBeDefined();
    const defiSwaps = result.cryptoDeFiSwaps as NonNullable<typeof result.cryptoDeFiSwaps>;
    expect(defiSwaps.dispositions).toHaveLength(1);
    expect(defiSwaps.totalGainOrLoss.toNumber()).toBe(5000);
    expect(defiSwaps.nonTaxableEvents).toHaveLength(0);
  });

  it("cryptoDeFiSwaps tracks wrapping as non-taxable event", () => {
    const fixture = makeCryptoFixture({
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        tokenSwaps: [{
          protocol: "WETH Contract",
          fromAsset: "ETH",
          fromQuantity: "5",
          toAsset: "WETH",
          toQuantity: "5",
          fairMarketValueAtSwap: "15000",
          dateSwapped: "2025-06-01",
          gasFee: "10",
          isWrappingEvent: true,
        }],
        lpPositions: [],
        yieldRewards: [],
        nftTransactions: [],
        lendingIncome: [],
        liquidations: [],
        donations: [],
        cryptoCostBasisMethod: "fifo",
        lots: [{ asset: "ETH", dateAcquired: "2024-01-01", quantity: "10", costBasisPerUnit: "2000", source: "purchase" }],
      },
    });

    const result = calculateFederalTax(fixture);
    expect(result.cryptoDeFiSwaps).toBeDefined();
    const defiSwapsWrap = result.cryptoDeFiSwaps as NonNullable<typeof result.cryptoDeFiSwaps>;
    expect(defiSwapsWrap.dispositions).toHaveLength(0);
    expect(defiSwapsWrap.nonTaxableEvents).toHaveLength(1);
    expect(defiSwapsWrap.nonTaxableEvents[0].type).toBe("wrapping");
  });

  it("sub-results undefined when no crypto activity", () => {
    const fixture = makeCryptoFixture();
    const result = calculateFederalTax(fixture);
    expect(result.cryptoLPPositions).toBeUndefined();
    expect(result.cryptoYieldRewards).toBeUndefined();
    expect(result.cryptoNFT).toBeUndefined();
    expect(result.cryptoLending).toBeUndefined();
    expect(result.cryptoLiquidations).toBeUndefined();
    expect(result.cryptoDonations).toBeUndefined();
    expect(result.cryptoDeFiSwaps).toBeUndefined();
    expect(result.cryptoWashSaleCarryforward).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Phase 2 Edge Cases — Dust, Failed Txns, Gas-Only, Realistic DeFi
// Spec: spec/federal/defi-transactions.yaml, spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════

describe("DeFi Edge Cases — Dust Amounts", () => {
  it("Dust amount DEX swap (< $0.01) is still a taxable disposition", () => {
    const lots: TrackedLot[] = [
      { asset: "SHIB", dateAcquired: "2024-06-01", quantity: d(1000000), costBasisPerUnit: d("0.000005"), source: "purchase" },
    ];

    const swaps = [{
      protocol: "Uniswap",
      fromAsset: "SHIB",
      fromQuantity: "100",
      toAsset: "ETH",
      toQuantity: "0.0000001",
      fairMarketValueAtSwap: "0.005", // < $0.01 — dust
      dateSwapped: "2025-03-15",
      gasFee: "0",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps as Parameters<typeof processDeFiTokenSwaps>[0], lots, "fifo");
    // Dust is still taxable — must generate a disposition
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(0.005);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(0.0005); // 100 × $0.000005
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBeCloseTo(0.0045);
  });

  it("Dust amount NFT airdrop with $0.001 FMV is ordinary income", () => {
    const result = processNFTTransactions([{
      nftName: "SpamNFT",
      transactionType: "airdrop" as const,
      dateAcquired: "2025-02-01",
      fairMarketValueAtTransaction: "0.001",
      proceeds: "0",
      costBasis: "0",
      gasFee: "0",
    }]);
    expect(result.airdropIncome.toNumber()).toBe(0.001);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0.001);
  });

  it("Dust yield reward (sub-cent value) still counted as income", () => {
    const result = calculateYieldRewards([{
      protocol: "Compound",
      asset: "COMP",
      dateReceived: "2025-04-01",
      quantity: "0.0001",
      fairMarketValuePerUnit: "0.05",
      rewardType: "governance_distribution" as const,
    }]);
    // 0.0001 × $0.05 = $0.000005
    expect(result.totalOrdinaryIncome.toNumber()).toBe(0.000005);
  });
});

describe("DeFi Edge Cases — Failed / Reverted Transactions", () => {
  it("Failed DEX swap (zero fromQuantity) produces no disposition", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    const swaps = [{
      protocol: "Uniswap",
      fromAsset: "ETH",
      fromQuantity: "0", // Failed — no tokens moved
      toAsset: "USDC",
      toQuantity: "0",
      fairMarketValueAtSwap: "0",
      dateSwapped: "2025-03-15",
      gasFee: "15", // Gas was still consumed
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps as Parameters<typeof processDeFiTokenSwaps>[0], lots, "fifo");
    // No disposition — the transaction reverted
    expect(result.dispositions).toHaveLength(0);
    // No new lot created either (no tokens received)
    expect(result.newLots).toHaveLength(0);
    // Lots unchanged — nothing was consumed
    expect(lots[0].quantity.toNumber()).toBe(10);
  });

  it("Failed swap does not consume any lots", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(5), costBasisPerUnit: d(3000), source: "purchase" },
    ];
    const originalQty = lots[0].quantity.toNumber();

    processDeFiTokenSwaps([{
      protocol: "SushiSwap",
      fromAsset: "ETH",
      fromQuantity: "0",
      toAsset: "DAI",
      toQuantity: "0",
      fairMarketValueAtSwap: "0",
      dateSwapped: "2025-06-01",
      gasFee: "20",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }] as Parameters<typeof processDeFiTokenSwaps>[0], lots, "fifo");

    expect(lots[0].quantity.toNumber()).toBe(originalQty);
  });
});

describe("DeFi Edge Cases — Gas-Only Transactions", () => {
  it("Gas-only approval transaction (no swap) produces no taxable event", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    // ERC-20 approval: gas spent, no tokens swapped
    const swaps = [{
      protocol: "Uniswap",
      fromAsset: "UNI",
      fromQuantity: "0",
      toAsset: "UNI",
      toQuantity: "0",
      fairMarketValueAtSwap: "0",
      dateSwapped: "2025-03-10",
      gasFee: "8.50",
      isWrappingEvent: false,
      isBridgeTransaction: false,
    }];

    const result = processDeFiTokenSwaps(swaps as Parameters<typeof processDeFiTokenSwaps>[0], lots, "fifo");
    expect(result.dispositions).toHaveLength(0);
    expect(result.newLots).toHaveLength(0);
    expect(result.totalGainOrLoss.toNumber()).toBe(0);
  });
});

describe("Realistic DeFi Scenario — Uniswap V3 LP (ETH/USDC)", () => {
  it("Uniswap V3 concentrated liquidity: enter pool, earn fees, exit with impermanent loss", () => {
    const positions = [{
      protocol: "Uniswap V3",
      poolAssets: ["ETH", "USDC"] as [string, string],
      lpTokensReceived: "1",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "5", costBasisPerUnit: "2000" },   // $10,000
        { asset: "USDC", quantity: "10000", costBasisPerUnit: "1" }, // $10,000
      ],
      dateEntered: "2024-06-01",
      dateExited: "2025-06-02", // 366 days = long-term
      underlyingAssetsReceived: [
        { asset: "ETH", quantity: "3", fairMarketValuePerUnit: "4000" },    // $12,000 (ETH up)
        { asset: "USDC", quantity: "12000", fairMarketValuePerUnit: "1" },  // $12,000
      ],
      gasFeeEntry: "25",
      gasFeeExit: "30",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");

    // Entry: LP token basis = $10,000 + $10,000 + $25 gas = $20,025
    expect(result.newLots.length).toBeGreaterThanOrEqual(1);
    const lpLot = result.newLots.find(l => l.asset.includes("LP-"));
    expect(lpLot).toBeDefined();
    const lp2 = lpLot as NonNullable<typeof lpLot>;
    expect(lp2.costBasisPerUnit.toNumber()).toBe(20025); // $20,025 for 1 LP token

    // Exit: proceeds = ($12,000 + $12,000) - $30 gas = $23,970
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(23970);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(20025);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(3945); // $23,970 - $20,025

    // Long-term holding (June 2024 → June 2025 = 366 days)
    expect(result.dispositions[0].holdingPeriod).toBe("long");

    // Impermanent loss tracked (informational)
    // HODL value: 5 ETH × $4000 + 10000 USDC × $1 = $30,000
    // Actual received: $24,000
    // IL = $30,000 - $24,000 = $6,000
    expect(result.impermanentLoss).toHaveLength(1);
    expect(result.impermanentLoss[0].protocol).toBe("Uniswap V3");
    expect(result.impermanentLoss[0].amount.toNumber()).toBe(6000);
  });

  it("Uniswap V3 LP position still open (no exit) — entry only, no disposition", () => {
    const positions = [{
      protocol: "Uniswap V3",
      poolAssets: ["ETH", "USDC"] as [string, string],
      lpTokensReceived: "1",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "2", costBasisPerUnit: "3000" },
        { asset: "USDC", quantity: "6000", costBasisPerUnit: "1" },
      ],
      dateEntered: "2025-01-15",
      gasFeeEntry: "15",
    }];

    const result = processDeFiLPPositions(positions, [], "fifo");
    expect(result.dispositions).toHaveLength(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(12015); // $6000 + $6000 + $15
  });
});

describe("Realistic DeFi Scenario — OpenSea NFT Sale", () => {
  it("Buy BAYC on OpenSea, sell later at profit with gas fees", () => {
    const transactions = [
      // Purchase: 15 ETH at $3,000/ETH = $45,000 + $50 gas
      {
        nftName: "Bored Ape",
        collectionName: "Bored Ape Yacht Club",
        tokenId: "4293",
        transactionType: "buy" as const,
        proceeds: "0",
        costBasis: "45000",
        gasFee: "50",
        dateAcquired: "2024-01-20",
        fairMarketValueAtTransaction: "0",
      },
      // Sale: 20 ETH at $4,000/ETH = $80,000 - $35 gas
      {
        nftName: "Bored Ape",
        collectionName: "Bored Ape Yacht Club",
        tokenId: "4293",
        transactionType: "sell" as const,
        proceeds: "80000",
        costBasis: "45050", // Original cost + gas on purchase
        gasFee: "35",
        dateAcquired: "2024-01-20",
        dateSold: "2025-06-15",
        fairMarketValueAtTransaction: "0",
        isCollectible: true, // NFTs may be collectibles per Notice 2023-27
      },
    ];

    const result = processNFTTransactions(transactions);

    // Purchase creates lot with basis = $45,000 + $50 = $45,050
    const buyLot = result.newLots.find(l => l.source === "nft-purchase");
    expect(buyLot).toBeDefined();
    const buy = buyLot as NonNullable<typeof buyLot>;
    expect(buy.costBasisPerUnit.toNumber()).toBe(45050);

    // Sale: proceeds = $80,000 - $35 gas = $79,965
    // Gain = $79,965 - $45,050 = $34,915
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(79965);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(45050);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(34915);
    expect(result.dispositions[0].holdingPeriod).toBe("long");

    // Collectible: long-term gain tracked at 28% max rate
    expect(result.collectibleGains.toNumber()).toBe(34915);
  });

  it("OpenSea NFT flip within 30 days — short-term capital gain", () => {
    const result = processNFTTransactions([
      {
        nftName: "Pudgy Penguin",
        collectionName: "Pudgy Penguins",
        tokenId: "1234",
        transactionType: "sell" as const,
        proceeds: "5000",
        costBasis: "3000",
        gasFee: "20",
        dateAcquired: "2025-05-01",
        dateSold: "2025-05-25",
        fairMarketValueAtTransaction: "0",
        isCollectible: false,
      },
    ]);

    expect(result.dispositions[0].holdingPeriod).toBe("short");
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(1980); // (5000-20) - 3000
    // Not collectible — no 28% tracking
    expect(result.collectibleGains.toNumber()).toBe(0);
  });
});

describe("Realistic DeFi Scenario — Aave Lending + Liquidation", () => {
  it("Aave lending: earn USDC interest over 6 months, multiple deposits", () => {
    const lendingEntries = [
      { platform: "Aave V3", asset: "USDC", interestReceived: "150.50", fairMarketValuePerUnit: "1", dateReceived: "2025-01-31" },
      { platform: "Aave V3", asset: "USDC", interestReceived: "175.25", fairMarketValuePerUnit: "1", dateReceived: "2025-02-28" },
      { platform: "Aave V3", asset: "USDC", interestReceived: "200.00", fairMarketValuePerUnit: "1", dateReceived: "2025-03-31" },
    ];

    const result = calculateCryptoLendingIncome(lendingEntries);
    // Total interest = $150.50 + $175.25 + $200 = $525.75
    expect(result.totalInterestIncome.toNumber()).toBe(525.75);
    // Each deposit creates a basis lot
    expect(result.newLots).toHaveLength(3);
    // Aggregated by platform
    expect(result.byPlatform).toHaveLength(3);
  });

  it("Aave collateral liquidation: ETH collateral partially liquidated", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-03-01", quantity: d(10), costBasisPerUnit: d(2500), source: "purchase" },
    ];

    const liquidations = [{
      platform: "Aave V3",
      collateralAsset: "ETH",
      collateralQuantity: "3", // Only 3 of 10 ETH liquidated
      fairMarketValueAtLiquidation: "6000", // $2,000/ETH × 3 = $6,000
      dateOfLiquidation: "2025-04-15",
    }];

    const result = processCryptoLiquidations(liquidations, lots, "fifo");
    // Proceeds = $6,000 (FMV at liquidation)
    // Basis = 3 × $2,500 = $7,500
    // Loss = $6,000 - $7,500 = -$1,500
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(6000);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(7500);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(-1500);
    expect(result.totalGainOrLoss.toNumber()).toBe(-1500);
  });
});

describe("DeFi Edge Cases — Multi-Hop Swap (Router Aggregation)", () => {
  it("Multi-hop swap: each leg is a separate taxable event (ETH→WETH→USDC)", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(5), costBasisPerUnit: d(2000), source: "purchase" },
    ];

    // Leg 1: ETH→WETH (wrapping — non-taxable)
    // Leg 2: WETH→USDC (taxable swap)
    const swaps = [
      {
        protocol: "1inch",
        fromAsset: "ETH",
        fromQuantity: "2",
        toAsset: "WETH",
        toQuantity: "2",
        fairMarketValueAtSwap: "6000", // 2 ETH × $3000
        dateSwapped: "2025-04-01",
        gasFee: "0",
        isWrappingEvent: true,
        isBridgeTransaction: false,
      },
      {
        protocol: "1inch",
        fromAsset: "WETH",
        fromQuantity: "2",
        toAsset: "USDC",
        toQuantity: "6000",
        fairMarketValueAtSwap: "6000",
        dateSwapped: "2025-04-01",
        gasFee: "12",
        isWrappingEvent: false,
        isBridgeTransaction: false,
      },
    ];

    const result = processDeFiTokenSwaps(swaps as Parameters<typeof processDeFiTokenSwaps>[0], lots, "fifo");

    // Leg 1: wrapping is non-taxable
    expect(result.nonTaxableEvents).toHaveLength(1);
    expect(result.nonTaxableEvents[0].type).toBe("wrapping");

    // Leg 2: WETH→USDC is taxable, basis carried from ETH lots
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].proceeds.toNumber()).toBe(6000);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(4000); // 2 × $2000 (original ETH basis carried through wrap)
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(2000);

    // New USDC lot: basis = FMV + gas = $6000 + $12 = $6012
    const usdcLot = result.newLots.find(l => l.asset === "USDC");
    expect(usdcLot).toBeDefined();
    const usdc = usdcLot as NonNullable<typeof usdcLot>;
    expect(usdc.costBasisPerUnit.times(usdc.quantity).toNumber()).toBeCloseTo(6012);
  });
});

describe("Phase 2 Orchestrator — Wash sale carryforward on federal return", () => {
  it("1099-DA wash sale populates cryptoWashSaleCarryforward on result", () => {
    // Scenario: sell BTC at a loss, broker reports wash sale because
    // taxpayer repurchased BTC within 30 days. Replacement lot exists.
    const fixture = makeCryptoFixture({
      form1099DA: [{
        brokerName: "Coinbase",
        transactions: [{
          digitalAssetName: "Bitcoin",
          ticker: "BTC",
          dateAcquired: "2025-01-01",
          dateSold: "2025-06-15",
          proceeds: "25000",
          costBasis: "0",      // Broker did NOT report basis
          holdingPeriod: "short",
          basisReportedToIRS: false,
          transactionType: "sale",
          quantity: "1",
          washSale: true,
          washSaleDisallowed: "5000",
          adjustments: "0",
        }],
      }],
      cryptoIncome: {
        miningIncome: [],
        stakingIncome: [],
        airdropIncome: [],
        isMiningBusiness: false,
        isStakingBusiness: false,
        cryptoCostBasisMethod: "fifo",
        lots: [
          // Original lot (will be consumed by the sale)
          { asset: "BTC", dateAcquired: "2025-01-01", quantity: "1", costBasisPerUnit: "30000", source: "purchase" },
          // Replacement lot (bought within 30 days of sale, absorbs disallowed loss)
          { asset: "BTC", dateAcquired: "2025-06-20", quantity: "1", costBasisPerUnit: "28000", source: "purchase" },
        ],
      },
    });

    const result = calculateFederalTax(fixture);

    // cryptoWashSaleCarryforward should be populated
    expect(result.cryptoWashSaleCarryforward).toBeDefined();
    expect(result.cryptoWashSaleCarryforward!.totalDisallowedLoss.toNumber()).toBe(5000);
    expect(result.cryptoWashSaleCarryforward!.entries).toHaveLength(1);
    expect(result.digitalAssetQuestion).toBe(true);
  });
});

describe("DeFi Edge Cases — Donation of Appreciated Crypto to Charity", () => {
  it("Donate BTC held >2 years to Red Cross: deduct FMV, avoid capital gains", () => {
    const result = calculateCryptoDonations([{
      asset: "BTC",
      quantity: "0.5",
      dateAcquired: "2023-01-15",
      dateDonated: "2025-06-01",
      fairMarketValueAtDonation: "35000",
      costBasis: "10000",
      charityName: "American Red Cross",
      charityEIN: "53-0196605",
      isQualifiedOrganization: true,
    }]);

    // Long-term (>1 year): deduction = FMV = $35,000
    expect(result.longTermDonations).toHaveLength(1);
    expect(result.longTermDonations[0].deduction.toNumber()).toBe(35000);
    expect(result.longTermDonations[0].charity).toBe("American Red Cross");
    // Capital gains avoided = FMV - basis = $25,000
    expect(result.longTermDonations[0].avoidedGain.toNumber()).toBe(25000);
    expect(result.totalDeduction.toNumber()).toBe(35000);
  });
});

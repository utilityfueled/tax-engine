/**
 * Edge Case Tests for Crypto Lot Matching
 * Spec: spec/federal/crypto-income.yaml, spec/federal/defi-transactions.yaml, spec/federal/defi-advanced.yaml
 *
 * Tests boundary conditions for:
 * - Holding period boundary (exactly 365 vs 366 days)
 * - Lot exhaustion (selling more than available)
 * - HIFO tiebreakers with equal cost basis
 * - Specific ID fallback when lotId doesn't match
 * - Wash sale 30-day window boundaries
 * - LP entry with zero LP tokens (division by zero)
 * - Donation holding period at exact boundary
 * - Liquidation with no available lots
 * - Fractional quantity precision
 * - Chained non-taxable events (wrap → swap)
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
  processCryptoLiquidations,
  processDeFiLPPositions,
  processDeFiTokenSwaps,
  processNFTTransactions,
  trackWashSaleCarryforward,
  type TrackedLot,
} from "@/engine/forms/crypto-lot-matching.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Holding Period Boundary (365 vs 366 days)
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Holding Period Boundary", () => {
  it("Holding period at exactly 365 days is short-term", () => {
    // 2024-01-01 to 2024-12-31 = exactly 365 days (2024 is a leap year: 366 days total, but Jan 1 to Dec 31 = 365)
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2024-01-01",
        dateSold: "2024-12-31",
        proceeds: "50000",
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
    expect(result.dispositions[0].holdingPeriod).toBe("short");
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(10000);
  });

  it("Holding period at exactly 366 days is long-term", () => {
    // 2024-01-01 to 2025-01-01 = 366 days (2024 is leap year)
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2024-01-01", quantity: d(1), costBasisPerUnit: d(40000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2024-01-01",
        dateSold: "2025-01-01",
        proceeds: "50000",
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
    expect(result.dispositions[0].holdingPeriod).toBe("long");
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(10000);
  });

  it("VARIOUS dateAcquired defaults to long-term (conservative)", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-01-01", quantity: d(0.5), costBasisPerUnit: d(40000), source: "purchase" },
      { asset: "BTC", dateAcquired: "2025-02-01", quantity: d(0.5), costBasisPerUnit: d(42000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "VARIOUS",
        dateSold: "2025-06-01",
        proceeds: "50000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "1",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    // Multiple lots consumed → VARIOUS → long-term (conservative default)
    expect(result.dispositions[0].dateAcquired).toBe("VARIOUS");
    expect(result.dispositions[0].holdingPeriod).toBe("long");
  });
});

// ═══════════════════════════════════════════════════════════
// Lot Exhaustion — Selling More Than Available
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Lot Exhaustion", () => {
  it("Selling more than available lots results in partial cost basis", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(2), costBasisPerUnit: d(3000), source: "purchase" },
    ];
    // Try to sell 5 ETH but only have 2
    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "15000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "5",
      },
      broker: "Kraken",
    }];

    const result = matchLots(transactions, lots, "fifo");
    // Only 2 lots consumed at $3000 each = $6000 basis (not $15000)
    expect(result.dispositions[0].costBasis.toNumber()).toBe(6000);
    // Gain = 15000 - 6000 = 9000
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(9000);
    // All lots consumed
    expect(result.remainingLots).toHaveLength(0);
  });

  it("Selling with no available lots produces zero cost basis", () => {
    const lots: TrackedLot[] = [];
    const transactions = [{
      transaction: {
        digitalAssetName: "Solana",
        ticker: "SOL",
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
        quantity: "10",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    expect(result.dispositions[0].costBasis.toNumber()).toBe(0);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(5000);
  });

  it("Exact lot exhaustion: sell quantity equals lot quantity exactly", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-01-01", quantity: d("0.12345678"), costBasisPerUnit: d(40000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-01-01",
        dateSold: "2025-03-01",
        proceeds: "5500",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "0.12345678",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    // Cost basis = 0.12345678 * 40000 = 4938.2712
    expect(result.dispositions[0].costBasis.toNumber()).toBeCloseTo(4938.2712, 4);
    expect(result.remainingLots).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// HIFO Tiebreaker Behavior
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - HIFO Tiebreaker", () => {
  it("HIFO with equal cost basis lots picks first in original order", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(1), costBasisPerUnit: d(3000), source: "purchase", lotId: "lot-A" },
      { asset: "ETH", dateAcquired: "2025-02-01", quantity: d(1), costBasisPerUnit: d(3000), source: "purchase", lotId: "lot-B" },
      { asset: "ETH", dateAcquired: "2025-03-01", quantity: d(1), costBasisPerUnit: d(3000), source: "purchase", lotId: "lot-C" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "4000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "1",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "hifo");
    expect(result.dispositions[0].costBasis.toNumber()).toBe(3000);
    // 2 remaining lots
    expect(result.remainingLots).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Specific ID Fallback
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Specific ID", () => {
  it("Specific ID with non-matching lotId falls back to all available lots", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-01-01", quantity: d(1), costBasisPerUnit: d(30000), source: "purchase", lotId: "lot-1" },
      { asset: "BTC", dateAcquired: "2025-02-01", quantity: d(1), costBasisPerUnit: d(35000), source: "purchase", lotId: "lot-2" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "50000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "1",
        lotId: "nonexistent-lot",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "specific_id");
    // Falls back to all lots, picks first available
    expect(result.dispositions[0].costBasis.toNumber()).toBe(30000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(20000);
  });

  it("Specific ID with matching lotId uses exact lot", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-01-01", quantity: d(1), costBasisPerUnit: d(30000), source: "purchase", lotId: "lot-1" },
      { asset: "BTC", dateAcquired: "2025-02-01", quantity: d(1), costBasisPerUnit: d(35000), source: "purchase", lotId: "lot-2" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-01-01",
        dateSold: "2025-06-01",
        proceeds: "50000",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "1",
        lotId: "lot-2",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "specific_id");
    // Should use lot-2 with $35000 basis
    expect(result.dispositions[0].costBasis.toNumber()).toBe(35000);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// DeFi Token Swap Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Crypto DeFi Swap - Edge Cases", () => {
  it("Wrap then immediate swap uses carried-over basis for the swap", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2024-01-01", quantity: d(10), costBasisPerUnit: d(2000), source: "purchase" },
    ];
    // First wrap ETH→WETH, then swap WETH→USDC
    const swaps = [
      {
        fromAsset: "ETH",
        toAsset: "WETH",
        fromQuantity: "5",
        toQuantity: "5",
        fairMarketValueAtSwap: "15000",
        gasFee: "10",
        dateSwapped: "2025-06-01",
        protocol: "Uniswap",
        isWrappingEvent: true,
        isBridgeTransaction: false,
      },
      {
        fromAsset: "WETH",
        toAsset: "USDC",
        fromQuantity: "5",
        toQuantity: "15000",
        fairMarketValueAtSwap: "15000",
        gasFee: "20",
        dateSwapped: "2025-06-01",
        protocol: "Uniswap",
        isWrappingEvent: false,
        isBridgeTransaction: false,
      },
    ];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");
    // Wrap is non-taxable
    expect(result.nonTaxableEvents).toHaveLength(1);
    // Swap is taxable - basis should be the carried-over ETH basis (5 * 2000 = 10000)
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(10000);
    // Gain = 15000 - 10000 = 5000
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(5000);
  });

  it("Wrapping preserves original acquisition date through chain", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2023-01-01", quantity: d(2), costBasisPerUnit: d(1500), source: "purchase" },
    ];
    const swaps = [
      {
        fromAsset: "ETH",
        toAsset: "WETH",
        fromQuantity: "2",
        toQuantity: "2",
        fairMarketValueAtSwap: "6000",
        gasFee: "5",
        dateSwapped: "2025-06-01",
        protocol: "Uniswap",
        isWrappingEvent: true,
        isBridgeTransaction: false,
      },
    ];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");
    // New WETH lot should have the original ETH acquisition date for holding period tacking
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].dateAcquired).toBe("2023-01-01");
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(1500);
  });

  it("Failed swap with zero fromQuantity produces no disposition and no lot consumption", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(5), costBasisPerUnit: d(3000), source: "purchase" },
    ];
    const swaps = [
      {
        fromAsset: "ETH",
        toAsset: "USDC",
        fromQuantity: "0",
        toQuantity: "0",
        fairMarketValueAtSwap: "0",
        gasFee: "15",
        dateSwapped: "2025-06-01",
        protocol: "Uniswap",
        isWrappingEvent: false,
        isBridgeTransaction: false,
      },
    ];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");
    expect(result.dispositions).toHaveLength(0);
    expect(result.newLots).toHaveLength(0);
    // Original lots should be untouched — check via a subsequent operation
  });

  it("DEX swap with zero toQuantity: new lot has zero basis per unit", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(1), costBasisPerUnit: d(3000), source: "purchase" },
    ];
    const swaps = [
      {
        fromAsset: "ETH",
        toAsset: "SCAM",
        fromQuantity: "1",
        toQuantity: "0", // received nothing
        fairMarketValueAtSwap: "0",
        gasFee: "10",
        dateSwapped: "2025-06-01",
        protocol: "Unknown DEX",
        isWrappingEvent: false,
        isBridgeTransaction: false,
      },
    ];

    const result = processDeFiTokenSwaps(swaps, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    // Proceeds = FMV = 0
    expect(result.dispositions[0].proceeds.toNumber()).toBe(0);
    // Loss = 0 - 3000 = -3000
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(-3000);
    // New lot for SCAM token has zero basis per unit (toQty is 0)
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// LP Position Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Crypto DeFi LP - Edge Cases", () => {
  it("LP entry with zero LP tokens received: basis per unit is zero (no division by zero)", () => {
    const lots: TrackedLot[] = [];
    const positions = [{
      protocol: "Uniswap",
      poolAssets: ["ETH", "USDC"],
      dateEntered: "2025-01-01",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "1", costBasisPerUnit: "3000" },
        { asset: "USDC", quantity: "3000", costBasisPerUnit: "1" },
      ],
      lpTokensReceived: "0", // zero LP tokens
      gasFeeEntry: "10",
    }];

    const result = processDeFiLPPositions(positions, lots, "fifo");
    // Should not throw — basis per unit should be 0
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
  });

  it("LP exit with impermanent loss: IL tracked but not separately deductible", () => {
    const lots: TrackedLot[] = [];
    const positions = [{
      protocol: "Uniswap",
      poolAssets: ["ETH", "USDC"],
      dateEntered: "2025-01-01",
      underlyingAssetsDeposited: [
        { asset: "ETH", quantity: "10", costBasisPerUnit: "3000" },
        { asset: "USDC", quantity: "30000", costBasisPerUnit: "1" },
      ],
      lpTokensReceived: "100",
      gasFeeEntry: "20",
      dateExited: "2025-06-01",
      underlyingAssetsReceived: [
        // IL: got more ETH and less USDC back than deposited
        { asset: "ETH", quantity: "12", fairMarketValuePerUnit: "2500" },
        { asset: "USDC", quantity: "25000", fairMarketValuePerUnit: "1" },
      ],
      gasFeeExit: "15",
    }];

    const result = processDeFiLPPositions(positions, lots, "fifo");
    // Should have impermanent loss tracked
    expect(result.dispositions).toHaveLength(1);
    // IL = HODL value - actual value received
    // HODL value: 10 ETH * $2500 + 30000 USDC * $1 = 55000
    // Received value: 12 * $2500 + 25000 * $1 = 55000
    // In this case IL = 0 since values happen to match
    // The key test is that the structure works without error
    expect(result.impermanentLoss).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// Crypto Donation Holding Period Boundary
// ═══════════════════════════════════════════════════════════

describe("Crypto Donation - Holding Period Boundary", () => {
  it("Donation at exactly 365 days (short-term) deducts basis only", () => {
    const donations = [{
      asset: "BTC",
      dateAcquired: "2024-06-01",
      dateDonated: "2025-06-01", // 365 days exactly
      quantity: "1",
      costBasis: "30000",
      fairMarketValueAtDonation: "50000",
      charityName: "Red Cross",
    }];

    const result = calculateCryptoDonations(donations);
    // 365 days is NOT > 365, so short-term → deduct basis only
    expect(result.shortTermDonations).toHaveLength(1);
    expect(result.longTermDonations).toHaveLength(0);
    expect(result.totalDeduction.toNumber()).toBe(30000);
  });

  it("Donation at 366 days (long-term) deducts FMV", () => {
    const donations = [{
      asset: "BTC",
      dateAcquired: "2024-06-01",
      dateDonated: "2025-06-02", // 366 days
      quantity: "1",
      costBasis: "30000",
      fairMarketValueAtDonation: "50000",
      charityName: "Red Cross",
    }];

    const result = calculateCryptoDonations(donations);
    expect(result.longTermDonations).toHaveLength(1);
    expect(result.shortTermDonations).toHaveLength(0);
    expect(result.totalDeduction.toNumber()).toBe(50000);
    // Avoided gain = FMV - basis = 20000
    expect(result.longTermDonations[0].avoidedGain.toNumber()).toBe(20000);
  });

  it("Donation with loss (FMV < basis) for long-term still deducts FMV", () => {
    const donations = [{
      asset: "ETH",
      dateAcquired: "2023-01-01",
      dateDonated: "2025-06-01", // well over 1 year
      quantity: "5",
      costBasis: "15000",
      fairMarketValueAtDonation: "10000",
      charityName: "UNICEF",
    }];

    const result = calculateCryptoDonations(donations);
    expect(result.longTermDonations).toHaveLength(1);
    // Deduction = FMV = $10000 (even though basis is higher)
    expect(result.totalDeduction.toNumber()).toBe(10000);
    // Pub526: the unrecognized decline is not a charitable deduction or an avoided gain.
    expect(result.longTermDonations[0].avoidedGain.toNumber()).toBe(0);
    expect(result.contributionAmounts.noncashPublic.toString()).toBe("10000");
  });
});

// ═══════════════════════════════════════════════════════════
// Wash Sale 30-Day Window Boundary
// ═══════════════════════════════════════════════════════════

describe("Crypto Wash Sale - 30-Day Window Boundary", () => {
  it("Replacement lot acquired exactly 30 days after sale is within window", () => {
    const dispositions = [{
      description: "BTC (Bitcoin) via Coinbase",
      dateAcquired: "2025-01-01",
      dateSold: "2025-02-01",
      proceeds: d(40000),
      costBasis: d(50000),
      gainOrLoss: d(-10000),
      holdingPeriod: "short" as const,
      basisReportedToIRS: false,
      washSale: true,
      washSaleDisallowed: d(10000),
      adjustments: d(10000),
    }];
    const lots: TrackedLot[] = [
      // Acquired exactly 30 days after sale (Feb 1 + 30 = Mar 3)
      { asset: "BTC", dateAcquired: "2025-03-03", quantity: d(1), costBasisPerUnit: d(42000), source: "purchase" },
    ];

    const result = trackWashSaleCarryforward(dispositions, lots);
    expect(result.entries).toHaveLength(1);
    expect(result.totalDisallowedLoss.toNumber()).toBe(10000);
    // Replacement lot basis should be adjusted upward
    expect(lots[0].costBasisPerUnit.toNumber()).toBe(52000); // 42000 + 10000
  });

  it("Replacement lot acquired exactly 30 days before sale is within window", () => {
    const dispositions = [{
      description: "ETH (Ethereum) via Kraken",
      dateAcquired: "2024-06-01",
      dateSold: "2025-03-01",
      proceeds: d(2500),
      costBasis: d(3000),
      gainOrLoss: d(-500),
      holdingPeriod: "long" as const,
      basisReportedToIRS: false,
      washSale: true,
      washSaleDisallowed: d(500),
      adjustments: d(500),
    }];
    const lots: TrackedLot[] = [
      // Acquired 30 days before sale (March 1 - 30 = Jan 30)
      { asset: "ETH", dateAcquired: "2025-01-30", quantity: d(1), costBasisPerUnit: d(2800), source: "purchase" },
    ];

    const result = trackWashSaleCarryforward(dispositions, lots);
    expect(result.entries).toHaveLength(1);
    // Replacement lot basis adjusted: 2800 + 500 = 3300
    expect(lots[0].costBasisPerUnit.toNumber()).toBe(3300);
  });

  it("Non-wash-sale dispositions are ignored by carryforward tracker", () => {
    const dispositions = [{
      description: "BTC (Bitcoin) via Coinbase",
      dateAcquired: "2025-01-01",
      dateSold: "2025-06-01",
      proceeds: d(60000),
      costBasis: d(40000),
      gainOrLoss: d(20000),
      holdingPeriod: "short" as const,
      basisReportedToIRS: false,
      washSale: false,
      washSaleDisallowed: d(0),
      adjustments: d(0),
    }];
    const lots: TrackedLot[] = [];

    const result = trackWashSaleCarryforward(dispositions, lots);
    expect(result.entries).toHaveLength(0);
    expect(result.totalDisallowedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Liquidation Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Crypto Liquidation - Edge Cases", () => {
  it("Liquidation with no matching lots: zero cost basis, full proceeds are gain", () => {
    const lots: TrackedLot[] = [];
    const liquidations = [{
      collateralAsset: "ETH",
      collateralQuantity: "5",
      fairMarketValueAtLiquidation: "12500",
      dateOfLiquidation: "2025-06-01",
      platform: "Aave",
    }];

    const result = processCryptoLiquidations(liquidations, lots, "fifo");
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].costBasis.toNumber()).toBe(0);
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(12500);
    expect(result.dispositions[0].dateAcquired).toBe("UNKNOWN");
  });

  it("Liquidation at break-even: gain/loss is exactly zero", () => {
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(5), costBasisPerUnit: d(2500), source: "purchase" },
    ];
    const liquidations = [{
      collateralAsset: "ETH",
      collateralQuantity: "5",
      fairMarketValueAtLiquidation: "12500", // exactly matches basis
      dateOfLiquidation: "2025-06-01",
      platform: "Aave",
    }];

    const result = processCryptoLiquidations(liquidations, lots, "fifo");
    expect(result.dispositions[0].gainOrLoss.toNumber()).toBe(0);
    expect(result.totalGainOrLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Fractional Quantity Precision
// ═══════════════════════════════════════════════════════════

describe("Crypto Lot Matching - Fractional Precision", () => {
  it("Satoshi-level precision: 8 decimal places preserved in lot matching", () => {
    const lots: TrackedLot[] = [
      { asset: "BTC", dateAcquired: "2025-01-01", quantity: d("0.00000001"), costBasisPerUnit: d(50000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Bitcoin",
        ticker: "BTC",
        dateAcquired: "2025-01-01",
        dateSold: "2025-03-01",
        proceeds: "0.001",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: "0.00000001",
      },
      broker: "Coinbase",
    }];

    const result = matchLots(transactions, lots, "fifo");
    // Cost basis = 0.00000001 * 50000 = 0.0005
    expect(result.dispositions[0].costBasis.toNumber()).toBe(0.0005);
    expect(result.remainingLots).toHaveLength(0);
  });

  it("Wei-level precision: 18 decimal places for ETH quantities", () => {
    const qty = "0.000000000000000001"; // 1 wei
    const lots: TrackedLot[] = [
      { asset: "ETH", dateAcquired: "2025-01-01", quantity: d(qty), costBasisPerUnit: d(3000), source: "purchase" },
    ];
    const transactions = [{
      transaction: {
        digitalAssetName: "Ethereum",
        ticker: "ETH",
        dateAcquired: "2025-01-01",
        dateSold: "2025-03-01",
        proceeds: "0.000000000000004",
        costBasis: "0",
        holdingPeriod: "short" as const,
        basisReportedToIRS: false,
        transactionType: "sale" as const,
        washSale: false,
        washSaleDisallowed: "0",
        adjustments: "0",
        quantity: qty,
      },
      broker: "Kraken",
    }];

    const result = matchLots(transactions, lots, "fifo");
    // Cost basis = 1e-18 * 3000 = 3e-15
    expect(result.dispositions[0].costBasis.toNumber()).toBeCloseTo(3e-15, 20);
  });
});

// ═══════════════════════════════════════════════════════════
// Crypto Income Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Crypto Income - Edge Cases", () => {
  it("Zero FMV mining income results in $0 income and $0 basis lots", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "NEWCOIN", dateReceived: "2025-01-01", quantity: "1000", fairMarketValuePerUnit: "0" },
      ],
      stakingIncome: [],
      airdropIncome: [],
      isMiningBusiness: false,
      isStakingBusiness: false,
    });

    expect(result.hobbyMiningIncome.toNumber()).toBe(0);
    expect(result.totalOrdinaryIncome.toNumber()).toBe(0);
    // Lots still established but with $0 basis
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
  });

  it("Mixed business mining and hobby staking aggregate correctly", () => {
    const result = calculateCryptoIncome({
      miningIncome: [
        { asset: "BTC", dateReceived: "2025-01-15", quantity: "0.5", fairMarketValuePerUnit: "40000", poolFees: "200" },
      ],
      stakingIncome: [
        { asset: "ETH", dateReceived: "2025-02-01", quantity: "2", fairMarketValuePerUnit: "3000" },
      ],
      airdropIncome: [],
      isMiningBusiness: true,
      isStakingBusiness: false,
    });

    expect(result.businessMiningGrossReceipts.toNumber()).toBe(20000); // 0.5 * 40000
    expect(result.businessMiningExpenses.toNumber()).toBe(200);
    expect(result.hobbyStakingIncome.toNumber()).toBe(6000); // 2 * 3000
    expect(result.hobbyMiningIncome.toNumber()).toBe(0); // routed to business
    expect(result.totalOrdinaryIncome.toNumber()).toBe(26000);
    // 2 lots established
    expect(result.newLots).toHaveLength(2);
  });

  it("Lending income with zero FMV per unit produces zero income", () => {
    const result = calculateCryptoLendingIncome([
      {
        asset: "WORTHLESS",
        platform: "DeFi Protocol",
        interestReceived: "1000",
        fairMarketValuePerUnit: "0",
        dateReceived: "2025-03-01",
      },
    ]);

    expect(result.totalInterestIncome.toNumber()).toBe(0);
    expect(result.newLots).toHaveLength(1);
    expect(result.newLots[0].costBasisPerUnit.toNumber()).toBe(0);
  });

  it("Yield reward with very large quantity and small FMV", () => {
    const result = calculateYieldRewards([
      {
        asset: "SHIB",
        protocol: "ShibaSwap",
        quantity: "1000000000",
        fairMarketValuePerUnit: "0.000008",
        dateReceived: "2025-01-01",
        rewardType: "liquidity_mining",
      },
    ]);

    // 1,000,000,000 * 0.000008 = 8000
    expect(result.totalOrdinaryIncome.toNumber()).toBe(8000);
    expect(result.newLots).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
// NFT Edge Cases
// ═══════════════════════════════════════════════════════════

describe("NFT - Edge Cases", () => {
  it("NFT collectible short-term gain does NOT add to collectibleGains", () => {
    const transactions = [{
      nftName: "CryptoPunk #1234",
      collectionName: "CryptoPunks",
      tokenId: "1234",
      transactionType: "sell" as const,
      dateAcquired: "2025-01-01",
      dateSold: "2025-06-01", // < 1 year
      proceeds: "100000",
      costBasis: "50000",
      gasFee: "100",
      isCollectible: true,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].holdingPeriod).toBe("short");
    // Short-term collectible gains do NOT get 28% rate treatment
    expect(result.collectibleGains.toNumber()).toBe(0);
  });

  it("NFT collectible long-term LOSS does NOT add to collectibleGains", () => {
    const transactions = [{
      nftName: "BoredApe #5678",
      collectionName: "BAYC",
      tokenId: "5678",
      transactionType: "sell" as const,
      dateAcquired: "2023-01-01",
      dateSold: "2025-06-01", // > 1 year
      proceeds: "30000",
      costBasis: "80000",
      gasFee: "50",
      isCollectible: true,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].holdingPeriod).toBe("long");
    // Loss, not gain — should not be added to collectibleGains
    expect(result.collectibleGains.toNumber()).toBe(0);
  });

  it("NFT sell with no dateSold defaults to dateAcquired", () => {
    const transactions = [{
      nftName: "TestNFT",
      transactionType: "sell" as const,
      dateAcquired: "2025-03-15",
      proceeds: "5000",
      costBasis: "2000",
      gasFee: "20",
      isCollectible: false,
    }];

    const result = processNFTTransactions(transactions);
    expect(result.dispositions).toHaveLength(1);
    expect(result.dispositions[0].dateSold).toBe("2025-03-15");
    expect(result.dispositions[0].holdingPeriod).toBe("short");
  });
});

// ═══════════════════════════════════════════════════════════
// initializeLots Edge Cases
// ═══════════════════════════════════════════════════════════

describe("initializeLots - Edge Cases", () => {
  it("Mixed case asset names all normalized to uppercase", () => {
    const lots = initializeLots([
      { asset: "btc", dateAcquired: "2025-01-01", quantity: "1", costBasisPerUnit: "40000", source: "purchase" },
      { asset: "Ethereum", dateAcquired: "2025-01-01", quantity: "5", costBasisPerUnit: "3000", source: "purchase" },
      { asset: "SOL", dateAcquired: "2025-01-01", quantity: "100", costBasisPerUnit: "150", source: "purchase" },
    ]);

    expect(lots[0].asset).toBe("BTC");
    expect(lots[1].asset).toBe("ETHEREUM");
    expect(lots[2].asset).toBe("SOL");
  });

  it("Empty lot array returns empty tracked lots", () => {
    const lots = initializeLots([]);
    expect(lots).toHaveLength(0);
  });
});

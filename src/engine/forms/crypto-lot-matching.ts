import { resolveCharitableRecipient } from "@/utils/charitable-recipient.js";
/**
 * Crypto Lot Matching — Cost Basis Tracking for Digital Assets
 * Spec: spec/federal/crypto-income.yaml, spec/federal/defi-transactions.yaml
 *
 * Implements FIFO, LIFO, HIFO, and Specific ID lot matching for
 * digital asset dispositions per IRS Notice 2014-21 Q&A 7.
 *
 * Each sale/exchange matches against available lots to determine
 * cost basis and holding period, generating Form 8949 entries.
 *
 * DeFi token swaps, wrapping events, and bridge transactions are
 * also processed here. Taxable swaps generate Form 8949 entries;
 * non-taxable events (wrapping, bridging) carry over basis.
 */

import Decimal from "decimal.js";
import type {
  CryptoCostBasisMethod,
  CryptoDonation,
  CryptoLendingIncome,
  CryptoLiquidation,
  CryptoLot,
  DeFiLPPosition,
  DeFiTokenSwap,
  DeFiYieldReward,
  Form1099DATransaction,
  NFTTransaction,
} from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CharitableContributionWorksheetInput } from "./charitable-contribution-worksheet.js";

export interface TrackedLot {
  asset: string;
  dateAcquired: string;
  quantity: Decimal;
  costBasisPerUnit: Decimal;
  source: string;
  lotId?: string;
}

export interface MatchedDisposition {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: Decimal;
  costBasis: Decimal;
  gainOrLoss: Decimal;
  holdingPeriod: "short" | "long";
  basisReportedToIRS: boolean;
  washSale: boolean;
  washSaleDisallowed: Decimal;
  adjustments: Decimal;
}

export interface LotMatchingResult {
  dispositions: MatchedDisposition[];
  remainingLots: TrackedLot[];
  totalProceeds: Decimal;
  totalCostBasis: Decimal;
  totalGainOrLoss: Decimal;
  lines: CalculatedLine[];
}

/**
 * Determine holding period from acquisition and sale dates.
 * Long-term = held more than 1 year (366+ days).
 */
function getHoldingPeriod(dateAcquired: string, dateSold: string): "short" | "long" {
  if (dateAcquired === "VARIOUS") return "long"; // Conservative default
  const acquired = new Date(dateAcquired);
  const sold = new Date(dateSold);
  const diffMs = sold.getTime() - acquired.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 365 ? "long" : "short";
}

/**
 * Sort lots according to the elected cost basis method.
 * Returns a copy sorted so that index 0 is the lot to sell first.
 */
function sortLotsByMethod(lots: TrackedLot[], method: CryptoCostBasisMethod): TrackedLot[] {
  const sorted = [...lots];
  switch (method) {
    case "fifo":
      // Earliest acquired first
      sorted.sort((a, b) => a.dateAcquired.localeCompare(b.dateAcquired));
      break;
    case "lifo":
      // Most recently acquired first
      sorted.sort((a, b) => b.dateAcquired.localeCompare(a.dateAcquired));
      break;
    case "hifo":
      // Highest cost basis per unit first (minimizes gain / maximizes loss)
      sorted.sort((a, b) => b.costBasisPerUnit.minus(a.costBasisPerUnit).toNumber());
      break;
    case "specific_id":
      // No sort needed — specific ID matching is handled by lotId
      break;
  }
  return sorted;
}

/**
 * Initialize tracked lots from input CryptoLot array.
 */
export function initializeLots(lots: CryptoLot[]): TrackedLot[] {
  return lots.map((lot) => ({
    asset: lot.asset.toUpperCase(),
    dateAcquired: lot.dateAcquired,
    quantity: d(lot.quantity),
    costBasisPerUnit: d(lot.costBasisPerUnit),
    source: lot.source,
    lotId: lot.lotId,
  }));
}

/**
 * Add a new lot from mining/staking/airdrop income recognition.
 * The cost basis per unit = FMV at time of receipt.
 */
export function addIncomeLot(
  lots: TrackedLot[],
  asset: string,
  dateReceived: string,
  quantity: Decimal,
  fmvPerUnit: Decimal,
  source: string,
): void {
  lots.push({
    asset: asset.toUpperCase(),
    dateAcquired: dateReceived,
    quantity,
    costBasisPerUnit: fmvPerUnit,
    source,
  });
}

/**
 * Match 1099-DA transactions against available lots using the elected method.
 * Generates Form 8949 entries for each matched disposition.
 *
 * When a 1099-DA provides cost basis directly, we use that instead of lot matching
 * (the broker already did the tracking). Lot matching is for transactions where
 * the taxpayer needs to determine basis themselves.
 */
export function matchLots(
  transactions: Array<{ transaction: Form1099DATransaction; broker: string }>,
  lots: TrackedLot[],
  method: CryptoCostBasisMethod,
): LotMatchingResult {
  const audit = new AuditTrail();
  const dispositions: MatchedDisposition[] = [];
  const remainingLots = lots.map((l) => ({ ...l, quantity: l.quantity }));

  for (const { transaction, broker } of transactions) {
    const costBasisProvided = d(transaction.costBasis);

    // If broker reported cost basis, use it directly (no lot matching needed)
    if (costBasisProvided.greaterThan(0) || transaction.basisReportedToIRS) {
      const proceeds = d(transaction.proceeds);
      const costBasis = costBasisProvided;
      const washSaleDisallowed = d(transaction.washSaleDisallowed);
      const adjustments = d(transaction.adjustments).plus(
        transaction.washSale ? washSaleDisallowed : new Decimal(0)
      );
      const gainOrLoss = proceeds.minus(costBasis).plus(adjustments);

      dispositions.push({
        description: `${transaction.digitalAssetName}${transaction.ticker ? ` (${transaction.ticker})` : ""} via ${broker}`,
        dateAcquired: transaction.dateAcquired,
        dateSold: transaction.dateSold,
        proceeds,
        costBasis,
        gainOrLoss,
        holdingPeriod: transaction.holdingPeriod,
        basisReportedToIRS: transaction.basisReportedToIRS,
        washSale: transaction.washSale,
        washSaleDisallowed,
        adjustments,
      });
      continue;
    }

    // Lot matching: find matching lots for this asset
    const asset = (transaction.ticker ?? transaction.digitalAssetName).toUpperCase();
    const proceeds = d(transaction.proceeds);
    const sellQty = d(transaction.quantity); // Quantity being disposed

    // Filter lots for this asset
    const assetLots = remainingLots.filter(
      (l) => l.asset === asset && l.quantity.greaterThan(0)
    );

    // For specific_id, match by lotId if provided on the transaction
    let sortedLots: TrackedLot[];
    if (method === "specific_id" && transaction.lotId) {
      const matched = assetLots.filter((l) => l.lotId === transaction.lotId);
      sortedLots = matched.length > 0 ? matched : assetLots;
    } else {
      sortedLots = sortLotsByMethod(assetLots, method);
    }

    let totalCostBasis = new Decimal(0);
    const lotDateAcquired: string[] = [];

    if (sellQty.greaterThan(0)) {
      // Quantity-based lot matching: consume lots until sellQty is fulfilled
      let remaining = sellQty;
      for (const lot of sortedLots) {
        if (remaining.isZero()) break;
        if (lot.quantity.isZero()) continue;

        const consumed = Decimal.min(lot.quantity, remaining);
        totalCostBasis = totalCostBasis.plus(consumed.times(lot.costBasisPerUnit));
        lotDateAcquired.push(lot.dateAcquired);
        lot.quantity = lot.quantity.minus(consumed);
        remaining = remaining.minus(consumed);
      }
    } else {
      // Fallback: no quantity available — consume one full lot per transaction
      for (const lot of sortedLots) {
        if (lot.quantity.greaterThan(0)) {
          totalCostBasis = totalCostBasis.plus(lot.quantity.times(lot.costBasisPerUnit));
          lotDateAcquired.push(lot.dateAcquired);
          lot.quantity = new Decimal(0);
          break;
        }
      }
    }

    const washSaleDisallowed = d(transaction.washSaleDisallowed);
    const adjustments = d(transaction.adjustments).plus(
      transaction.washSale ? washSaleDisallowed : new Decimal(0)
    );
    const gainOrLoss = proceeds.minus(totalCostBasis).plus(adjustments);
    const dateAcquired = lotDateAcquired.length === 1
      ? lotDateAcquired[0]
      : lotDateAcquired.length > 1
        ? "VARIOUS"
        : transaction.dateAcquired;

    dispositions.push({
      description: `${transaction.digitalAssetName}${transaction.ticker ? ` (${transaction.ticker})` : ""} via ${broker}`,
      dateAcquired,
      dateSold: transaction.dateSold,
      proceeds,
      costBasis: totalCostBasis,
      gainOrLoss,
      holdingPeriod: totalCostBasis.greaterThan(0)
        ? getHoldingPeriod(dateAcquired, transaction.dateSold)
        : transaction.holdingPeriod,
      basisReportedToIRS: false,
      washSale: transaction.washSale,
      washSaleDisallowed,
      adjustments,
    });
  }

  const totalProceeds = sum(...dispositions.map((d) => d.proceeds));
  const totalCostBasis = sum(...dispositions.map((d) => d.costBasis));
  const totalGainOrLoss = sum(...dispositions.map((d) => d.gainOrLoss));

  audit.record(
    "Crypto Lot Matching",
    "Summary",
    "Total digital asset dispositions",
    totalGainOrLoss,
    `${dispositions.length} transactions matched via ${method.toUpperCase()} method`,
    { totalProceeds, totalCostBasis }
  );

  return {
    dispositions,
    remainingLots: remainingLots.filter((l) => l.quantity.greaterThan(0)),
    totalProceeds,
    totalCostBasis,
    totalGainOrLoss,
    lines: audit.getLines(),
  };
}

/**
 * Calculate crypto income (mining, staking, airdrops) and return
 * the income amounts routed to the appropriate forms, plus new lots
 * established from the received assets.
 */
export interface CryptoIncomeResult {
  /** Hobby mining income → Schedule 1 Line 8z */
  hobbyMiningIncome: Decimal;
  /** Business mining gross receipts → Schedule C */
  businessMiningGrossReceipts: Decimal;
  /** Business mining pool fees → Schedule C expenses */
  businessMiningExpenses: Decimal;
  /** Hobby staking income → Schedule 1 Line 8z */
  hobbyStakingIncome: Decimal;
  /** Business staking gross receipts → Schedule C */
  businessStakingGrossReceipts: Decimal;
  /** Business staking validator expenses → Schedule C expenses */
  businessStakingExpenses: Decimal;
  /** Airdrop/hard fork income → Schedule 1 Line 8z */
  airdropIncome: Decimal;
  /** New lots created from income events (basis = FMV at receipt) */
  newLots: TrackedLot[];
  /** Total ordinary crypto income (all sources) */
  totalOrdinaryIncome: Decimal;
  lines: CalculatedLine[];
}

export function calculateCryptoIncome(input: {
  miningIncome: Array<{ asset: string; dateReceived: string; quantity: string; fairMarketValuePerUnit: string; poolFees?: string; description?: string }>;
  stakingIncome: Array<{ asset: string; dateReceived: string; quantity: string; fairMarketValuePerUnit: string; validatorExpenses?: string; description?: string }>;
  airdropIncome: Array<{ asset: string; dateReceived: string; quantity: string; fairMarketValuePerUnit: string; source: string; description?: string }>;
  isMiningBusiness: boolean;
  isStakingBusiness: boolean;
}): CryptoIncomeResult {
  const audit = new AuditTrail();
  const newLots: TrackedLot[] = [];

  // ── Mining Income ──
  let hobbyMiningIncome = new Decimal(0);
  let businessMiningGrossReceipts = new Decimal(0);
  let businessMiningExpenses = new Decimal(0);

  for (const entry of input.miningIncome) {
    const qty = d(entry.quantity);
    const fmv = d(entry.fairMarketValuePerUnit);
    const income = qty.times(fmv);
    const fees = d(entry.poolFees);

    if (input.isMiningBusiness) {
      businessMiningGrossReceipts = businessMiningGrossReceipts.plus(income);
      businessMiningExpenses = businessMiningExpenses.plus(fees);
    } else {
      hobbyMiningIncome = hobbyMiningIncome.plus(income);
    }

    // Establish basis lot: FMV at receipt per IRS Notice 2014-21 Q&A 6
    addIncomeLot(newLots, entry.asset, entry.dateReceived, qty, fmv, "mining");
  }

  audit.record("Crypto Income", "Mining", "Mining income",
    input.isMiningBusiness ? businessMiningGrossReceipts : hobbyMiningIncome,
    input.isMiningBusiness
      ? "Business mining → Schedule C gross receipts (IRS Notice 2014-21 Q&A 8)"
      : "Hobby mining → Schedule 1 Line 8z (IRS Notice 2014-21 Q&A 8)");

  // ── Staking Income ──
  let hobbyStakingIncome = new Decimal(0);
  let businessStakingGrossReceipts = new Decimal(0);
  let businessStakingExpenses = new Decimal(0);

  for (const entry of input.stakingIncome) {
    const qty = d(entry.quantity);
    const fmv = d(entry.fairMarketValuePerUnit);
    const income = qty.times(fmv);
    const expenses = d(entry.validatorExpenses);

    if (input.isStakingBusiness) {
      businessStakingGrossReceipts = businessStakingGrossReceipts.plus(income);
      businessStakingExpenses = businessStakingExpenses.plus(expenses);
    } else {
      hobbyStakingIncome = hobbyStakingIncome.plus(income);
    }

    // Establish basis lot: FMV at receipt per Rev. Rul. 2023-14
    addIncomeLot(newLots, entry.asset, entry.dateReceived, qty, fmv, "staking");
  }

  audit.record("Crypto Income", "Staking", "Staking income",
    input.isStakingBusiness ? businessStakingGrossReceipts : hobbyStakingIncome,
    input.isStakingBusiness
      ? "Business staking → Schedule C gross receipts (Rev. Rul. 2023-14)"
      : "Hobby staking → Schedule 1 Line 8z (Rev. Rul. 2023-14)");

  // ── Airdrop / Hard Fork Income ──
  let airdropIncome = new Decimal(0);

  for (const entry of input.airdropIncome) {
    const qty = d(entry.quantity);
    const fmv = d(entry.fairMarketValuePerUnit);
    const income = qty.times(fmv);
    airdropIncome = airdropIncome.plus(income);

    // Establish basis lot: FMV at receipt (Rev. Rul. 2019-24)
    // Hard fork with $0 FMV = $0 basis
    addIncomeLot(newLots, entry.asset, entry.dateReceived, qty, fmv, entry.source);
  }

  audit.record("Crypto Income", "Airdrop", "Airdrop/hard fork income",
    airdropIncome,
    "Ordinary income at FMV → Schedule 1 Line 8z (Rev. Rul. 2019-24)");

  const totalOrdinaryIncome = sum(
    hobbyMiningIncome,
    businessMiningGrossReceipts,
    hobbyStakingIncome,
    businessStakingGrossReceipts,
    airdropIncome
  );

  audit.record("Crypto Income", "Total", "Total crypto ordinary income",
    totalOrdinaryIncome, "Mining + Staking + Airdrop income");

  return {
    hobbyMiningIncome,
    businessMiningGrossReceipts,
    businessMiningExpenses,
    hobbyStakingIncome,
    businessStakingGrossReceipts,
    businessStakingExpenses,
    airdropIncome,
    newLots,
    totalOrdinaryIncome,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// DeFi Token Swap Processing
// Spec: spec/federal/defi-transactions.yaml
// ═══════════════════════════════════════════════════════════════

export interface NonTaxableEvent {
  description: string;
  type: "wrapping" | "bridge";
  fromAsset: string;
  toAsset: string;
  basisCarryover: Decimal;
  dateAcquired: string;
}

export interface DeFiSwapResult {
  /** Taxable dispositions to flow to Form 8949 */
  dispositions: MatchedDisposition[];
  /** New lots established from received tokens */
  newLots: TrackedLot[];
  /** Non-taxable events (wrapping, bridging) for audit trail only */
  nonTaxableEvents: NonTaxableEvent[];
  totalProceeds: Decimal;
  totalCostBasis: Decimal;
  totalGainOrLoss: Decimal;
  lines: CalculatedLine[];
}

/**
 * Process DeFi token swaps (DEX trades, wrapping events, bridge transactions).
 *
 * Taxable swaps (standard DEX trades):
 * - Disposition of fromAsset: proceeds = FMV at swap time
 * - Cost basis = lot-matched basis of fromAsset
 * - Gain/loss = proceeds - cost basis
 * - New lot for toAsset: basis = FMV at swap + gas fee (capitalized per IRC §1012)
 * - Generates Form 8949 entry
 *
 * Non-taxable events (wrapping ETH→WETH, bridging):
 * - No Form 8949 entry
 * - Basis carries over from old token to new token
 * - Gas fee on wrapping/bridging is personal expense, not deductible
 * - Tracked for audit trail
 *
 * IRS References:
 * - IRS Notice 2014-21: virtual currency is property; exchanges are taxable
 * - IRC §1001: recognition of gain/loss on disposition of property
 * - IRC §1012: basis = cost of acquisition (includes capitalized fees)
 */
export function processDeFiTokenSwaps(
  swaps: DeFiTokenSwap[],
  lots: TrackedLot[],
  method: CryptoCostBasisMethod,
): DeFiSwapResult {
  const audit = new AuditTrail();
  const dispositions: MatchedDisposition[] = [];
  const newLots: TrackedLot[] = [];
  const nonTaxableEvents: NonTaxableEvent[] = [];
  // Work on a mutable copy of lots so we can consume them
  const remainingLots = lots.map((l) => ({ ...l, quantity: l.quantity }));

  for (const swap of swaps) {
    const fromAsset = swap.fromAsset.toUpperCase();
    const toAsset = swap.toAsset.toUpperCase();
    const fromQty = d(swap.fromQuantity);
    const toQty = d(swap.toQuantity);
    const fmv = d(swap.fairMarketValueAtSwap);
    const gasFee = d(swap.gasFee);
    const protocol = swap.protocol ?? "Unknown DEX";

    // ── Non-taxable: Wrapping event (ETH→WETH, BTC→WBTC) ──
    // Same economic substance — carry over basis, no realization event.
    if (swap.isWrappingEvent) {
      // Capture acquisition date BEFORE consuming lots (tacking holding period)
      const originalDate = findEarliestAcquisitionDate(remainingLots, fromAsset, swap.dateSwapped);
      // Find and consume lots for the fromAsset to carry basis
      const basisCarryover = consumeLotsForBasis(remainingLots, fromAsset, fromQty, method);

      // Create new lot for wrapped token with carried-over basis
      const basisPerUnit = fromQty.greaterThan(0)
        ? basisCarryover.dividedBy(fromQty)
        : new Decimal(0);
      const newLot: TrackedLot = {
        asset: toAsset,
        dateAcquired: originalDate,
        quantity: toQty,
        costBasisPerUnit: basisPerUnit,
        source: "swap",
      };
      newLots.push(newLot);
      // Make lot available for subsequent swaps in the same batch
      remainingLots.push(newLot);

      nonTaxableEvents.push({
        description: `${fromAsset}→${toAsset} wrap via ${protocol}`,
        type: "wrapping",
        fromAsset,
        toAsset,
        basisCarryover,
        dateAcquired: swap.dateSwapped,
      });

      audit.record("DeFi", "wrap", `Wrapping ${fromAsset}→${toAsset} (non-taxable)`,
        new Decimal(0),
        `Basis carryover: $${basisCarryover} (same economic substance, no realization event)`, {
          protocol, fromAsset, toAsset, basisCarryover,
        });
      continue;
    }

    // ── Non-taxable: Bridge transaction (same asset, different chain) ──
    if (swap.isBridgeTransaction) {
      const originalDate = findEarliestAcquisitionDate(remainingLots, fromAsset, swap.dateSwapped);
      const basisCarryover = consumeLotsForBasis(remainingLots, fromAsset, fromQty, method);

      const basisPerUnit = fromQty.greaterThan(0)
        ? basisCarryover.dividedBy(fromQty)
        : new Decimal(0);
      const newLot: TrackedLot = {
        asset: toAsset,
        dateAcquired: originalDate,
        quantity: toQty,
        costBasisPerUnit: basisPerUnit,
        source: "swap",
      };
      newLots.push(newLot);
      remainingLots.push(newLot);

      nonTaxableEvents.push({
        description: `${fromAsset} bridge via ${protocol}`,
        type: "bridge",
        fromAsset,
        toAsset,
        basisCarryover,
        dateAcquired: swap.dateSwapped,
      });

      audit.record("DeFi", "bridge", `Bridge ${fromAsset} via ${protocol} (non-taxable)`,
        new Decimal(0),
        `Basis carryover: $${basisCarryover} (same asset cross-chain, no realization event)`, {
          protocol, fromAsset, toAsset, basisCarryover,
        });
      continue;
    }

    // ── Skip failed/reverted transactions ──
    // If fromQuantity is 0, no actual disposition occurred (failed tx).
    // Gas on failed transactions is a personal expense, not deductible.
    if (fromQty.isZero()) {
      audit.record("DeFi", "skip", `Skipped failed/reverted swap via ${protocol}`,
        new Decimal(0),
        "Zero fromQuantity — no disposition occurred (gas is personal expense)");
      continue;
    }

    // ── Taxable: Standard DEX swap ──
    // Disposition of fromAsset: proceeds = FMV at swap time
    // New acquisition of toAsset: basis = FMV + gas fee (capitalized)
    const proceeds = fmv;
    const { costBasis, dateAcquired } = consumeLotsWithDateTracking(
      remainingLots, fromAsset, fromQty, method
    );
    const gainOrLoss = proceeds.minus(costBasis);
    const holdingPeriod = getHoldingPeriod(dateAcquired, swap.dateSwapped);

    dispositions.push({
      description: `${fromAsset}→${toAsset} swap via ${protocol}`,
      dateAcquired,
      dateSold: swap.dateSwapped,
      proceeds,
      costBasis,
      gainOrLoss,
      holdingPeriod,
      basisReportedToIRS: false,
      washSale: false,
      washSaleDisallowed: new Decimal(0),
      adjustments: new Decimal(0),
    });

    // New lot for received token: basis = FMV + gas (IRC §1012)
    const newBasisTotal = fmv.plus(gasFee);
    const newBasisPerUnit = toQty.greaterThan(0)
      ? newBasisTotal.dividedBy(toQty)
      : new Decimal(0);
    const newLot: TrackedLot = {
      asset: toAsset,
      dateAcquired: swap.dateSwapped,
      quantity: toQty,
      costBasisPerUnit: newBasisPerUnit,
      source: "swap",
    };
    newLots.push(newLot);
    // Make lot available for subsequent swaps in the same batch
    remainingLots.push(newLot);

    audit.record("DeFi", "swap", `${fromAsset}→${toAsset} swap via ${protocol}`,
      gainOrLoss,
      `Proceeds $${proceeds} - basis $${costBasis} = ${gainOrLoss.isNegative() ? "loss" : "gain"} $${gainOrLoss}`, {
        protocol, fromAsset, toAsset,
        proceeds, costBasis, gainOrLoss,
        gasFee, newLotBasis: newBasisTotal,
      });
  }

  const totalProceeds = sum(...dispositions.map((dp) => dp.proceeds));
  const totalCostBasis = sum(...dispositions.map((dp) => dp.costBasis));
  const totalGainOrLoss = sum(...dispositions.map((dp) => dp.gainOrLoss));

  if (dispositions.length > 0) {
    audit.record("DeFi", "swap-summary", "DeFi token swap summary",
      totalGainOrLoss,
      `${dispositions.length} taxable swaps, ${nonTaxableEvents.length} non-taxable events`, {
        totalProceeds, totalCostBasis,
      });
  }

  return {
    dispositions,
    newLots,
    nonTaxableEvents,
    totalProceeds,
    totalCostBasis,
    totalGainOrLoss,
    lines: audit.getLines(),
  };
}

/**
 * Consume lots for a given asset and return the total cost basis consumed.
 * Mutates the remainingLots array by reducing quantities.
 */
function consumeLotsForBasis(
  lots: TrackedLot[],
  asset: string,
  quantity: Decimal,
  method: CryptoCostBasisMethod,
): Decimal {
  const assetLots = lots.filter((l) => l.asset === asset && l.quantity.greaterThan(0));
  const sorted = sortLotsByMethod(assetLots, method);

  let remaining = quantity;
  let totalBasis = new Decimal(0);

  for (const lot of sorted) {
    if (remaining.isZero()) break;
    if (lot.quantity.isZero()) continue;

    const consumed = Decimal.min(lot.quantity, remaining);
    totalBasis = totalBasis.plus(consumed.times(lot.costBasisPerUnit));
    lot.quantity = lot.quantity.minus(consumed);
    remaining = remaining.minus(consumed);
  }

  return totalBasis;
}

/**
 * Consume lots and track the acquisition date(s) for holding period determination.
 * Returns total cost basis and a single dateAcquired string ("VARIOUS" if multiple).
 */
function consumeLotsWithDateTracking(
  lots: TrackedLot[],
  asset: string,
  quantity: Decimal,
  method: CryptoCostBasisMethod,
): { costBasis: Decimal; dateAcquired: string } {
  const assetLots = lots.filter((l) => l.asset === asset && l.quantity.greaterThan(0));
  const sorted = sortLotsByMethod(assetLots, method);

  let remaining = quantity;
  let totalBasis = new Decimal(0);
  const dates: string[] = [];

  for (const lot of sorted) {
    if (remaining.isZero()) break;
    if (lot.quantity.isZero()) continue;

    const consumed = Decimal.min(lot.quantity, remaining);
    totalBasis = totalBasis.plus(consumed.times(lot.costBasisPerUnit));
    dates.push(lot.dateAcquired);
    lot.quantity = lot.quantity.minus(consumed);
    remaining = remaining.minus(consumed);
  }

  const dateAcquired = dates.length === 1 ? dates[0]
    : dates.length > 1 ? "VARIOUS"
    : "UNKNOWN";

  return { costBasis: totalBasis, dateAcquired };
}

/**
 * Find the earliest acquisition date for an asset in the lot pool.
 * Used for basis carryover on non-taxable events to preserve holding period.
 */
function findEarliestAcquisitionDate(
  lots: TrackedLot[],
  asset: string,
  fallback: string,
): string {
  const assetLots = lots.filter((l) => l.asset === asset && l.quantity.greaterThan(0));
  if (assetLots.length === 0) return fallback;
  return assetLots.reduce((earliest, lot) =>
    lot.dateAcquired < earliest ? lot.dateAcquired : earliest,
    assetLots[0].dateAcquired
  );
}

// ═══════════════════════════════════════════════════════════════
// DeFi LP (Liquidity Pool) Processing
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface LPPositionResult {
  /** Taxable dispositions from LP exits → Form 8949 */
  dispositions: MatchedDisposition[];
  /** New lots from LP entry (LP token lots) and exit (underlying asset lots) */
  newLots: TrackedLot[];
  /** Informational: impermanent loss per position (not deductible) */
  impermanentLoss: Array<{ protocol: string; pool: string; amount: Decimal }>;
  totalProceeds: Decimal;
  totalCostBasis: Decimal;
  totalGainOrLoss: Decimal;
  lines: CalculatedLine[];
}

/**
 * Process DeFi LP positions (enter and exit).
 *
 * Entry: Deposit assets → receive LP tokens. Non-taxable.
 *   LP token basis = sum of deposited asset bases + gas fee.
 *
 * Exit: Redeem LP tokens → receive underlying assets. Taxable.
 *   Proceeds = total FMV of received assets.
 *   Cost basis = LP token basis (lot-matched).
 *   Gain/loss = proceeds - cost basis - gas fee.
 *   Generates Form 8949 entry.
 *
 * Impermanent loss is tracked for informational purposes but is NOT
 * separately deductible — it's embedded in the gain/loss on exit.
 *
 * IRS References:
 * - IRS Notice 2014-21: crypto is property
 * - IRC §1001: gain/loss on disposition
 * - IRC §1012: basis includes acquisition costs
 */
export function processDeFiLPPositions(
  positions: DeFiLPPosition[],
  lots: TrackedLot[],
  method: CryptoCostBasisMethod,
): LPPositionResult {
  const audit = new AuditTrail();
  const dispositions: MatchedDisposition[] = [];
  const newLots: TrackedLot[] = [];
  const impermanentLoss: Array<{ protocol: string; pool: string; amount: Decimal }> = [];

  for (const pos of positions) {
    const protocol = pos.protocol;
    const pool = `${pos.poolAssets[0]}/${pos.poolAssets[1]}`;
    const gasFeeEntry = d(pos.gasFeeEntry);
    const lpTokenQty = d(pos.lpTokensReceived);

    // ── Entry: establish LP token lot ──
    // Basis of LP token = total basis of deposited assets + entry gas fee
    let depositedBasis = new Decimal(0);
    for (const dep of pos.underlyingAssetsDeposited) {
      depositedBasis = depositedBasis.plus(d(dep.quantity).times(d(dep.costBasisPerUnit)));
    }
    const lpBasisTotal = depositedBasis.plus(gasFeeEntry);
    const lpBasisPerUnit = lpTokenQty.greaterThan(0)
      ? lpBasisTotal.dividedBy(lpTokenQty)
      : new Decimal(0);

    const lpTokenAsset = `LP-${pool}`.toUpperCase();
    const entryLot: TrackedLot = {
      asset: lpTokenAsset,
      dateAcquired: pos.dateEntered,
      quantity: lpTokenQty,
      costBasisPerUnit: lpBasisPerUnit,
      source: `lp-entry:${protocol}`,
    };
    newLots.push(entryLot);

    audit.record("DeFi LP", "entry", `LP entry: ${pool} on ${protocol}`,
      new Decimal(0),
      `Non-taxable deposit. LP token basis = $${lpBasisTotal} (deposited basis $${depositedBasis} + gas $${gasFeeEntry})`, {
        protocol, pool, lpBasisTotal, depositedBasis, gasFeeEntry,
      });

    // ── Exit: taxable disposition of LP tokens ──
    if (pos.dateExited && pos.underlyingAssetsReceived) {
      const gasFeeExit = d(pos.gasFeeExit);

      // Proceeds = total FMV of received assets - exit gas fee
      let totalFMVReceived = new Decimal(0);
      for (const rec of pos.underlyingAssetsReceived) {
        totalFMVReceived = totalFMVReceived.plus(d(rec.quantity).times(d(rec.fairMarketValuePerUnit)));
      }
      const proceeds = totalFMVReceived.minus(gasFeeExit);

      // Cost basis = LP token basis (lot-match against the entry lot)
      // Add the entry lot to the available pool first
      const allLots = [...lots, entryLot];
      const { costBasis, dateAcquired } = consumeLotsWithDateTracking(
        allLots, lpTokenAsset, lpTokenQty, method,
      );
      const gainOrLoss = proceeds.minus(costBasis);
      const holdingPeriod = getHoldingPeriod(dateAcquired, pos.dateExited);

      dispositions.push({
        description: `LP exit: ${pool} on ${protocol}`,
        dateAcquired,
        dateSold: pos.dateExited,
        proceeds,
        costBasis,
        gainOrLoss,
        holdingPeriod,
        basisReportedToIRS: false,
        washSale: false,
        washSaleDisallowed: new Decimal(0),
        adjustments: new Decimal(0),
      });

      // Establish new lots for received underlying assets
      for (const rec of pos.underlyingAssetsReceived) {
        const recQty = d(rec.quantity);
        const recFMV = d(rec.fairMarketValuePerUnit);
        newLots.push({
          asset: rec.asset.toUpperCase(),
          dateAcquired: pos.dateExited,
          quantity: recQty,
          costBasisPerUnit: recFMV,
          source: `lp-exit:${protocol}`,
        });
      }

      // Impermanent loss (informational): HODL value vs actual LP value received.
      // IL = (value if deposited assets were simply held) - (FMV of assets received from pool).
      // This is embedded in gain/loss, NOT separately deductible.
      // Build exit-time price map from received assets to compute HODL value.
      const exitPriceMap = new Map<string, Decimal>();
      for (const rec of pos.underlyingAssetsReceived) {
        exitPriceMap.set(rec.asset.toUpperCase(), d(rec.fairMarketValuePerUnit));
      }
      let hodlValue = new Decimal(0);
      for (const dep of pos.underlyingAssetsDeposited) {
        const exitPrice = exitPriceMap.get(dep.asset.toUpperCase()) ?? new Decimal(0);
        hodlValue = hodlValue.plus(d(dep.quantity).times(exitPrice));
      }
      const ilAmount = hodlValue.minus(totalFMVReceived);
      if (ilAmount.greaterThan(0)) {
        impermanentLoss.push({ protocol, pool, amount: ilAmount });
      }

      audit.record("DeFi LP", "exit", `LP exit: ${pool} on ${protocol}`,
        gainOrLoss,
        `Proceeds $${proceeds} - basis $${costBasis} = ${gainOrLoss.isNegative() ? "loss" : "gain"} $${gainOrLoss}`, {
          protocol, pool, proceeds, costBasis, gainOrLoss,
          impermanentLoss: ilAmount.greaterThan(0) ? ilAmount : new Decimal(0),
        });
    }
  }

  const totalProceeds = sum(...dispositions.map((dp) => dp.proceeds));
  const totalCostBasis = sum(...dispositions.map((dp) => dp.costBasis));
  const totalGainOrLoss = sum(...dispositions.map((dp) => dp.gainOrLoss));

  return {
    dispositions,
    newLots,
    impermanentLoss,
    totalProceeds,
    totalCostBasis,
    totalGainOrLoss,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// DeFi Yield / Liquidity Mining Rewards
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface YieldRewardResult {
  /** Ordinary income → Schedule 1 Line 8z */
  totalOrdinaryIncome: Decimal;
  /** Per-protocol breakdown for audit trail */
  byProtocol: Array<{ protocol: string; asset: string; income: Decimal }>;
  /** New lots established from reward tokens (basis = FMV at receipt) */
  newLots: TrackedLot[];
  lines: CalculatedLine[];
}

/**
 * Process DeFi yield farming and liquidity mining rewards.
 *
 * FMV at receipt = ordinary income → Schedule 1 Line 8z (or Schedule C if business).
 * Basis of received tokens = FMV at receipt for future disposal.
 *
 * IRS References:
 * - IRS Notice 2014-21 Q&A 8: mining income analogy
 * - Rev. Rul. 2023-14: staking rewards analogy
 * - IRC §61: gross income includes all income from whatever source
 */
export function calculateYieldRewards(
  rewards: DeFiYieldReward[],
): YieldRewardResult {
  const audit = new AuditTrail();
  const newLots: TrackedLot[] = [];
  const byProtocol: Array<{ protocol: string; asset: string; income: Decimal }> = [];
  let totalOrdinaryIncome = new Decimal(0);

  for (const reward of rewards) {
    const qty = d(reward.quantity);
    const fmv = d(reward.fairMarketValuePerUnit);
    const income = qty.times(fmv);
    totalOrdinaryIncome = totalOrdinaryIncome.plus(income);

    byProtocol.push({
      protocol: reward.protocol,
      asset: reward.asset,
      income,
    });

    // Establish basis lot for received reward tokens
    addIncomeLot(newLots, reward.asset, reward.dateReceived, qty, fmv,
      `${reward.rewardType}:${reward.protocol}`);

    audit.record("DeFi Yield", reward.rewardType, `${reward.asset} ${reward.rewardType} from ${reward.protocol}`,
      income,
      `${qty} × $${fmv} = $${income} ordinary income → Schedule 1 Line 8z`);
  }

  audit.record("DeFi Yield", "total", "Total DeFi yield/reward income",
    totalOrdinaryIncome,
    `${rewards.length} reward events across ${new Set(rewards.map((r) => r.protocol)).size} protocols`);

  return {
    totalOrdinaryIncome,
    byProtocol,
    newLots,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// NFT Transaction Processing
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface NFTResult {
  /** Taxable dispositions (sells) → Form 8949 */
  dispositions: MatchedDisposition[];
  /** Ordinary income from airdrops/minting sales → Schedule 1 or Schedule C */
  airdropIncome: Decimal;
  /** Mint sale income for creators → Schedule C */
  mintSaleIncome: Decimal;
  /** New lots from purchases and airdrops */
  newLots: TrackedLot[];
  /** Collectible gains (28% max rate) — subset of dispositions */
  collectibleGains: Decimal;
  lines: CalculatedLine[];
}

/**
 * Process NFT transactions (buy, sell, mint, airdrop, gift).
 *
 * Buy: basis = purchase price + gas. No income event.
 * Sell: proceeds - basis = gain/loss → Form 8949.
 * Mint (creator selling): proceeds = income → Schedule C if business.
 * Airdrop: FMV at receipt = ordinary income; basis = FMV.
 * Gift: no income/gain for recipient at receipt; basis = donor's basis.
 *
 * Collectible NFTs: 28% max LTCG rate per IRS Notice 2023-27.
 *
 * IRS References:
 * - IRS Notice 2014-21: digital assets are property
 * - IRS Notice 2023-27: NFTs may be collectibles under IRC §408(m)
 * - IRC §1(h)(4): 28% max rate for collectibles
 */
export function processNFTTransactions(
  transactions: NFTTransaction[],
): NFTResult {
  const audit = new AuditTrail();
  const dispositions: MatchedDisposition[] = [];
  const newLots: TrackedLot[] = [];
  let airdropIncome = new Decimal(0);
  let mintSaleIncome = new Decimal(0);
  let collectibleGains = new Decimal(0);

  for (const tx of transactions) {
    const nftLabel = tx.collectionName
      ? `${tx.collectionName} #${tx.tokenId ?? tx.nftName}`
      : tx.nftName;
    const gasFee = d(tx.gasFee);

    switch (tx.transactionType) {
      case "buy": {
        // Establish lot: basis = purchase price + gas
        const basis = d(tx.costBasis).plus(gasFee);
        newLots.push({
          asset: `NFT:${nftLabel}`.toUpperCase(),
          dateAcquired: tx.dateAcquired,
          quantity: new Decimal(1),
          costBasisPerUnit: basis,
          source: "nft-purchase",
        });
        audit.record("NFT", "buy", `Purchase NFT: ${nftLabel}`,
          basis, `Basis = $${d(tx.costBasis)} + gas $${gasFee} = $${basis}`);
        break;
      }
      case "sell": {
        const proceeds = d(tx.proceeds).minus(gasFee);
        const costBasis = d(tx.costBasis);
        const gainOrLoss = proceeds.minus(costBasis);
        const holdingPeriod = tx.dateSold
          ? getHoldingPeriod(tx.dateAcquired, tx.dateSold)
          : "short";

        dispositions.push({
          description: `NFT sale: ${nftLabel}`,
          dateAcquired: tx.dateAcquired,
          dateSold: tx.dateSold ?? tx.dateAcquired,
          proceeds,
          costBasis,
          gainOrLoss,
          holdingPeriod,
          basisReportedToIRS: false,
          washSale: false,
          washSaleDisallowed: new Decimal(0),
          adjustments: new Decimal(0),
        });

        if (tx.isCollectible && holdingPeriod === "long" && gainOrLoss.greaterThan(0)) {
          collectibleGains = collectibleGains.plus(gainOrLoss);
        }

        audit.record("NFT", "sell", `Sell NFT: ${nftLabel}`,
          gainOrLoss,
          `Proceeds $${proceeds} - basis $${costBasis} = ${gainOrLoss.isNegative() ? "loss" : "gain"} $${gainOrLoss}${tx.isCollectible ? " (collectible, 28% max rate)" : ""}`);
        break;
      }
      case "mint": {
        if (tx.isBusiness && d(tx.proceeds).greaterThan(0)) {
          // Creator selling own NFT → Schedule C income
          const income = d(tx.proceeds).minus(gasFee);
          mintSaleIncome = mintSaleIncome.plus(income);
          audit.record("NFT", "mint-sale", `Mint & sell NFT: ${nftLabel}`,
            income, `Creator income $${income} → Schedule C`);
        } else {
          // Minting for personal use: basis = gas fee only
          newLots.push({
            asset: `NFT:${nftLabel}`.toUpperCase(),
            dateAcquired: tx.dateAcquired,
            quantity: new Decimal(1),
            costBasisPerUnit: gasFee,
            source: "nft-mint",
          });
          audit.record("NFT", "mint", `Mint NFT: ${nftLabel}`,
            gasFee, `Basis = gas fee $${gasFee}`);
        }
        break;
      }
      case "airdrop": {
        const fmv = d(tx.fairMarketValueAtTransaction);
        airdropIncome = airdropIncome.plus(fmv);
        newLots.push({
          asset: `NFT:${nftLabel}`.toUpperCase(),
          dateAcquired: tx.dateAcquired,
          quantity: new Decimal(1),
          costBasisPerUnit: fmv,
          source: "nft-airdrop",
        });
        audit.record("NFT", "airdrop", `Airdrop NFT: ${nftLabel}`,
          fmv, `FMV $${fmv} = ordinary income; basis = $${fmv}`);
        break;
      }
      case "gift": {
        // Gift received: basis = donor's basis (costBasis field)
        newLots.push({
          asset: `NFT:${nftLabel}`.toUpperCase(),
          dateAcquired: tx.dateAcquired,
          quantity: new Decimal(1),
          costBasisPerUnit: d(tx.costBasis),
          source: "nft-gift",
        });
        audit.record("NFT", "gift", `Gift NFT: ${nftLabel}`,
          new Decimal(0), `No income on receipt. Basis = donor's basis $${d(tx.costBasis)}`);
        break;
      }
    }
  }

  return {
    dispositions,
    airdropIncome,
    mintSaleIncome,
    newLots,
    collectibleGains,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Crypto Lending Income
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface CryptoLendingResult {
  /** Total lending interest income → Schedule 1 Line 8z */
  totalInterestIncome: Decimal;
  /** Per-platform breakdown */
  byPlatform: Array<{ platform: string; asset: string; income: Decimal }>;
  /** New lots from interest tokens (basis = FMV at receipt) */
  newLots: TrackedLot[];
  lines: CalculatedLine[];
}

/**
 * Process crypto lending interest income.
 *
 * Interest earned from lending crypto = ordinary income at FMV when received.
 * Basis of interest tokens = FMV at receipt for future disposal.
 *
 * IRS References:
 * - IRC §61(a)(4): interest is gross income
 * - IRS Notice 2014-21: crypto is property; income at FMV
 */
export function calculateCryptoLendingIncome(
  income: CryptoLendingIncome[],
): CryptoLendingResult {
  const audit = new AuditTrail();
  const newLots: TrackedLot[] = [];
  const byPlatform: Array<{ platform: string; asset: string; income: Decimal }> = [];
  let totalInterestIncome = new Decimal(0);

  for (const entry of income) {
    const qty = d(entry.interestReceived);
    const fmv = d(entry.fairMarketValuePerUnit);
    const interestIncome = qty.times(fmv);
    totalInterestIncome = totalInterestIncome.plus(interestIncome);

    byPlatform.push({
      platform: entry.platform,
      asset: entry.asset,
      income: interestIncome,
    });

    // Establish basis lot for interest tokens
    addIncomeLot(newLots, entry.asset, entry.dateReceived, qty, fmv,
      `lending:${entry.platform}`);

    audit.record("Crypto Lending", "interest", `${entry.asset} interest from ${entry.platform}`,
      interestIncome,
      `${qty} × $${fmv} = $${interestIncome} → Schedule 1 Line 8z (IRC §61(a)(4))`);
  }

  audit.record("Crypto Lending", "total", "Total crypto lending income",
    totalInterestIncome, `${income.length} interest payments`);

  return {
    totalInterestIncome,
    byPlatform,
    newLots,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Crypto Liquidation Processing
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface LiquidationResult {
  /** Taxable dispositions from liquidated collateral → Form 8949 */
  dispositions: MatchedDisposition[];
  totalProceeds: Decimal;
  totalCostBasis: Decimal;
  totalGainOrLoss: Decimal;
  lines: CalculatedLine[];
}

/**
 * Process crypto collateral liquidations.
 *
 * When collateral is liquidated in a DeFi lending protocol, it's a taxable
 * disposition. Gain/loss = FMV at liquidation − lot-matched basis.
 *
 * IRS References:
 * - IRC §1001: disposition of property
 * - IRS Notice 2014-21: crypto is property
 */
export function processCryptoLiquidations(
  liquidations: CryptoLiquidation[],
  lots: TrackedLot[],
  method: CryptoCostBasisMethod,
): LiquidationResult {
  const audit = new AuditTrail();
  const dispositions: MatchedDisposition[] = [];
  const remainingLots = lots.map((l) => ({ ...l, quantity: l.quantity }));

  for (const liq of liquidations) {
    const asset = liq.collateralAsset.toUpperCase();
    const qty = d(liq.collateralQuantity);
    const proceeds = d(liq.fairMarketValueAtLiquidation);

    const { costBasis, dateAcquired } = consumeLotsWithDateTracking(
      remainingLots, asset, qty, method,
    );
    const gainOrLoss = proceeds.minus(costBasis);
    const holdingPeriod = getHoldingPeriod(dateAcquired, liq.dateOfLiquidation);

    dispositions.push({
      description: `Collateral liquidation: ${asset} on ${liq.platform}`,
      dateAcquired,
      dateSold: liq.dateOfLiquidation,
      proceeds,
      costBasis,
      gainOrLoss,
      holdingPeriod,
      basisReportedToIRS: false,
      washSale: false,
      washSaleDisallowed: new Decimal(0),
      adjustments: new Decimal(0),
    });

    audit.record("Liquidation", "collateral", `${asset} liquidated on ${liq.platform}`,
      gainOrLoss,
      `Proceeds $${proceeds} - basis $${costBasis} = ${gainOrLoss.isNegative() ? "loss" : "gain"} $${gainOrLoss}`);
  }

  const totalProceeds = sum(...dispositions.map((dp) => dp.proceeds));
  const totalCostBasis = sum(...dispositions.map((dp) => dp.costBasis));
  const totalGainOrLoss = sum(...dispositions.map((dp) => dp.gainOrLoss));

  return {
    dispositions,
    totalProceeds,
    totalCostBasis,
    totalGainOrLoss,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Crypto Donations to Charity
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface CryptoDonationResult {
  /** Tentative contribution value BEFORE Schedule A limits/floor; not the final deduction. */
  totalDeduction: Decimal;
  contributionAmounts: CharitableContributionWorksheetInput["amounts"];
  sourceFactsVerified: boolean;
  /** Long-term gifts and their tentative value; second-category gifts can require basis reduction. */
  longTermDonations: Array<{ asset: string; charity: string; deduction: Decimal; avoidedGain: Decimal }>;
  /** Short-term gifts use the lesser of basis and FMV. */
  shortTermDonations: Array<{ asset: string; charity: string; deduction: Decimal }>;
  lines: CalculatedLine[];
}

/**
 * Process crypto charitable donations.
 *
 * Held >1 year: FMV before applicable foundation reduction; no capital gains recognized.
 * Held ≤1 year: tentative contribution is min(basis, FMV) (IRC §170(e)(1)(A)).
 * Actual category values enter Schedule A before its percentage limits/floor.
 *
 * IRS References:
 * - IRC §170: charitable contribution deduction
 * - IRC §170(e)(1)(A): limitation for short-term capital gain property
 * - IRS Notice 2014-21: crypto is property for donation purposes
 */
export function calculateCryptoDonations(
  donations: CryptoDonation[],
  taxYear = 2025,
): CryptoDonationResult {
  if (![2025, 2026].includes(taxYear)) throw new Error("Unsupported crypto donation tax year");
  const audit = new AuditTrail();
  let totalDeduction = new Decimal(0);
  let sourceFactsVerified = true;
  const contributionAmounts = { cashPublic: d("0"), noncashPublic: d("0"), capitalGainPublic: d("0"), cashPrivate: d("0"), noncashPrivate: d("0"), capitalGainPrivate: d("0") };
  const longTermDonations: CryptoDonationResult["longTermDonations"] = [];
  const shortTermDonations: CryptoDonationResult["shortTermDonations"] = [];

  for (const don of donations) {
    const fmv = d(don.fairMarketValueAtDonation);
    const basis = d(don.costBasis);
    if ([fmv, basis, d(don.quantity)].some(value => !value.isFinite() || value.lt(0))) throw new Error("Crypto donation values must be finite and nonnegative");
    for (const raw of [don.dateAcquired, don.dateDonated]) {
      const date = new Date(`${raw}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error("Crypto donation requires actual valid dates");
    }
    if (!don.dateDonated.startsWith(`${taxYear}-`) || don.dateAcquired > don.dateDonated) throw new Error("Crypto donation date must match the return year and follow acquisition");
    if (don.isQualifiedOrganization === false) continue;
    const strict = taxYear >= 2026 || don.sourceFactsConfirmed === true
      || don.recipientCategory === "private-nonoperating" || don.recipientCategory === "other-thirty-percent";
    if (strict) {
      if (don.isQualifiedOrganization !== true || don.recipientCategory === undefined || don.capitalAsset === undefined
        || don.sourceFactsConfirmed !== true || don.fullOwnershipInterestDonated !== true || don.noGoodsOrServicesReceived !== true
        || don.substantiationRequirementsMet !== true || don.appraisalRequired === undefined) {
        throw new Error("Crypto donation actual qualification, property and substantiation sources are required");
      }
    } else sourceFactsVerified = false;
    // More than one calendar year; a leap day does not shorten the statutory year.
    const acquiredYear = Number(don.dateAcquired.slice(0, 4));
    const heldLongTerm = taxYear - acquiredYear > 1
      || (taxYear - acquiredYear === 1 && don.dateDonated.slice(5) > don.dateAcquired.slice(5));
    const capitalGainProperty = heldLongTerm && don.capitalAsset !== false && fmv.gt(basis);
    // Historical unconfirmed omissions stay explicitly unverified; a supplied ambiguous category never acquires a guessed valuation.
    const recipient = don.recipientCategory === undefined && !strict ? undefined : resolveCharitableRecipient(don);
    const otherRecipient = recipient?.percentageCategory === "other-thirty-percent";
    const contribution = capitalGainProperty && recipient?.privateNonoperating !== true ? fmv : Decimal.min(fmv, basis);
    if (strict && ((contribution.gt(5000) && don.appraisalRequired !== true)
      || (don.appraisalRequired === true && don.qualifiedAppraisalObtained !== true))) throw new Error("Crypto donation qualified appraisal source is required");
    const category = capitalGainProperty ? otherRecipient ? "capitalGainPrivate" : "capitalGainPublic"
      : otherRecipient ? "noncashPrivate" : "noncashPublic";
    contributionAmounts[category] = contributionAmounts[category].plus(contribution);
    totalDeduction = totalDeduction.plus(contribution);

    if (heldLongTerm) {
      const avoidedGain = Decimal.max(0, fmv.minus(basis));
      longTermDonations.push({
        asset: don.asset,
        charity: don.charityName,
        deduction: contribution,
        avoidedGain,
      });
      audit.record("Crypto Donation", "long-term", `${don.asset} donated to ${don.charityName}`,
        contribution,
        `Tentative ${category} property value before ScheduleA; FMV ${fmv}, basis ${basis}, unrecognized appreciation ${avoidedGain}`);
    } else {
      shortTermDonations.push({
        asset: don.asset,
        charity: don.charityName,
        deduction: contribution,
      });
      audit.record("Crypto Donation", "short-term", `${don.asset} donated to ${don.charityName}`,
        contribution,
        `Held one year or less: tentative min(FMV ${fmv}, basis ${basis}) before ScheduleA limits`);
    }
  }

  audit.record("Crypto Donation", "total", "Tentative crypto charitable contribution value",
    totalDeduction, "Actual property values enter ScheduleA category limits and floor before deduction");

  return {
    totalDeduction,
    contributionAmounts,
    sourceFactsVerified,
    longTermDonations,
    shortTermDonations,
    lines: audit.getLines(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Wash Sale Carryforward Tracking
// Spec: spec/federal/defi-advanced.yaml
// ═══════════════════════════════════════════════════════════════

export interface WashSaleCarryforwardEntry {
  asset: string;
  replacementLotId: string | undefined;
  disallowedLoss: Decimal;
  adjustedBasisIncrease: Decimal;
  originalSaleDate: string;
  replacementAcquiredDate: string;
}

export interface WashSaleCarryforwardResult {
  entries: WashSaleCarryforwardEntry[];
  totalDisallowedLoss: Decimal;
  lines: CalculatedLine[];
}

/**
 * Track wash sale disallowed losses and their carryforward to replacement lots.
 *
 * When a wash sale disallows a loss, the disallowed amount is added to the
 * basis of the replacement lot. This adjusted basis carries forward to the
 * next tax year if the replacement lot is not sold in the current year.
 *
 * IRS References:
 * - IRC §1091: wash sale rules
 * - IRC §1091(d): basis adjustment for wash sale replacement property
 * - IRS Notice 2014-21: wash sales apply to crypto (same as securities)
 */
export function trackWashSaleCarryforward(
  dispositions: MatchedDisposition[],
  lots: TrackedLot[],
): WashSaleCarryforwardResult {
  const audit = new AuditTrail();
  const entries: WashSaleCarryforwardEntry[] = [];
  let totalDisallowedLoss = new Decimal(0);

  for (const disp of dispositions) {
    if (!disp.washSale || disp.washSaleDisallowed.isZero()) continue;

    totalDisallowedLoss = totalDisallowedLoss.plus(disp.washSaleDisallowed);

    // Find the replacement lot: acquired within 30 days before/after the sale
    const saleDate = new Date(disp.dateSold);
    const windowStart = new Date(saleDate);
    windowStart.setDate(windowStart.getDate() - 30);
    const windowEnd = new Date(saleDate);
    windowEnd.setDate(windowEnd.getDate() + 30);

    // Extract asset from description (e.g., "BTC (Bitcoin) via Coinbase" → "BTC")
    const assetMatch = disp.description.match(/^(\S+)/);
    const asset = assetMatch ? assetMatch[1].toUpperCase() : "";

    const replacementLot = lots.find((l) => {
      if (l.asset !== asset) return false;
      const acqDate = new Date(l.dateAcquired);
      return acqDate >= windowStart && acqDate <= windowEnd
        && l.dateAcquired !== disp.dateSold; // Not the sale itself
    });

    if (replacementLot) {
      // Adjust replacement lot basis upward by disallowed loss
      replacementLot.costBasisPerUnit = replacementLot.costBasisPerUnit.plus(
        replacementLot.quantity.greaterThan(0)
          ? disp.washSaleDisallowed.dividedBy(replacementLot.quantity)
          : new Decimal(0)
      );
    }

    entries.push({
      asset,
      replacementLotId: replacementLot?.lotId,
      disallowedLoss: disp.washSaleDisallowed,
      adjustedBasisIncrease: disp.washSaleDisallowed,
      originalSaleDate: disp.dateSold,
      replacementAcquiredDate: replacementLot?.dateAcquired ?? "UNKNOWN",
    });

    audit.record("Wash Sale", "carryforward", `Wash sale: ${asset} sold ${disp.dateSold}`,
      disp.washSaleDisallowed,
      `Disallowed loss $${disp.washSaleDisallowed} → basis of replacement lot (IRC §1091(d))`);
  }

  audit.record("Wash Sale", "total", "Total wash sale carryforward",
    totalDisallowedLoss,
    `${entries.length} wash sale disallowances`);

  return {
    entries,
    totalDisallowedLoss,
    lines: audit.getLines(),
  };
}

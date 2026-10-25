/**
 * Form 8949 — Sales and Other Dispositions of Capital Assets
 * Spec: spec/federal/form-8949.yaml
 *
 * Categorizes capital transactions by holding period and basis reporting,
 * calculates totals, and feeds into Schedule D.
 */

import Decimal from "decimal.js";
import type { TaxYearInput, CapitalTransaction } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateSection1202Sources, type Section1202SourceResult } from "./section-1202-sources.js";

export interface TransactionSummary {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: Decimal;
  costBasis: Decimal;
  adjustment: Decimal;
  adjustmentCode: string;
  gainLoss: Decimal;
}

export interface CategoryTotals {
  transactions: TransactionSummary[];
  totalProceeds: Decimal;
  totalCostBasis: Decimal;
  totalAdjustments: Decimal;
  totalGainLoss: Decimal;
}

export interface Form8949Result {
  /** Part I: Short-term */
  shortTermBoxA: CategoryTotals; // Basis reported to IRS
  shortTermBoxB: CategoryTotals; // Basis NOT reported to IRS

  /** Part II: Long-term */
  longTermBoxD: CategoryTotals; // Basis reported to IRS
  longTermBoxE: CategoryTotals; // Basis NOT reported to IRS
  longTermBoxF: CategoryTotals; // No1099-B: actual fund issuer Q adjustments
  section1202?: Section1202SourceResult;

  /** Aggregate totals for Schedule D */
  totalShortTermGainLoss: Decimal;
  totalLongTermGainLoss: Decimal;

  lines: CalculatedLine[];
}

function processTransaction(t: CapitalTransaction, exclusion = new Decimal(0)): TransactionSummary {
  const proceeds = d(t.proceeds);
  const costBasis = d(t.costBasis);
  let adjustment = d(t.adjustments);
  let adjustmentCode = "";

  // Wash sale: disallowed loss is added as positive adjustment
  if (t.washSale && d(t.washSaleDisallowed).greaterThan(0)) {
    adjustment = adjustment.plus(d(t.washSaleDisallowed));
    adjustmentCode = "W";
  }
  if (exclusion.gt(0)) {
    adjustment = adjustment.minus(exclusion);
    adjustmentCode = `Q${adjustmentCode}`;
  }

  const gainLoss = proceeds.minus(costBasis).plus(adjustment);

  return {
    description: t.description,
    dateAcquired: t.dateAcquired,
    dateSold: t.dateSold,
    proceeds,
    costBasis,
    adjustment,
    adjustmentCode,
    gainLoss,
  };
}

function aggregateCategory(transactions: TransactionSummary[]): CategoryTotals {
  const totalProceeds = transactions.reduce((acc, t) => acc.plus(t.proceeds), new Decimal(0));
  const totalCostBasis = transactions.reduce((acc, t) => acc.plus(t.costBasis), new Decimal(0));
  const totalAdjustments = transactions.reduce((acc, t) => acc.plus(t.adjustment), new Decimal(0));
  const totalGainLoss = transactions.reduce((acc, t) => acc.plus(t.gainLoss), new Decimal(0));

  return { transactions, totalProceeds, totalCostBasis, totalAdjustments, totalGainLoss };
}

export function calculateForm8949(input: TaxYearInput): Form8949Result {
  const audit = new AuditTrail();
  const section1202 = calculateSection1202Sources(input);
  const brokerExclusions = new Map<string, Decimal>();
  const fundAdjustments: TransactionSummary[] = [];
  for (const binding of section1202?.bindings ?? []) {
    const lot = section1202?.lots.find(row => row.sourceId === binding.lotId);
    if (!lot) throw new Error('Section1202 computed source lot is incomplete');
    if (binding.sourceKind === 'broker') brokerExclusions.set(binding.originalSourceId, lot.exclusion);
    else if (lot.exclusion.gt(0)) fundAdjustments.push({
      description: binding.issuerName, dateAcquired: '', dateSold: '', proceeds: new Decimal(0), costBasis: new Decimal(0),
      adjustment: lot.exclusion.negated(), adjustmentCode: 'Q', gainLoss: lot.exclusion.negated(),
    });
  }
  if (section1202) audit.merge(section1202.lines);

  // Collect all transactions from all 1099-B forms
  const allTransactions: Array<{ transaction: CapitalTransaction; sourceId: string }> = [];
  for (const [formIndex, form] of input.form1099B.entries()) {
    for (const [transactionIndex, t] of form.transactions.entries()) {
      allTransactions.push({ transaction: t, sourceId: `form1099B:${formIndex}:transaction:${transactionIndex}` });
    }
  }

  // Categorize by holding period and basis reporting
  const shortTermReported: TransactionSummary[] = [];
  const shortTermNotReported: TransactionSummary[] = [];
  const longTermReported: TransactionSummary[] = [];
  const longTermNotReported: TransactionSummary[] = [];

  for (const { transaction, sourceId } of allTransactions) {
    const summary = processTransaction(transaction, brokerExclusions.get(sourceId));
    if (transaction.holdingPeriod === "short") {
      if (transaction.basisReportedToIRS) {
        shortTermReported.push(summary);
      } else {
        shortTermNotReported.push(summary);
      }
    } else {
      if (transaction.basisReportedToIRS) {
        longTermReported.push(summary);
      } else {
        longTermNotReported.push(summary);
      }
    }
  }

  const shortTermBoxA = aggregateCategory(shortTermReported);
  const shortTermBoxB = aggregateCategory(shortTermNotReported);
  const longTermBoxD = aggregateCategory(longTermReported);
  const longTermBoxE = aggregateCategory(longTermNotReported);
  const longTermBoxF = aggregateCategory(fundAdjustments);

  // Audit Part I
  audit.record(
    "Form 8949",
    "Part I Box A",
    "Short-term, basis reported",
    shortTermBoxA.totalGainLoss,
    `${shortTermBoxA.transactions.length} transactions`,
    { proceeds: shortTermBoxA.totalProceeds, cost: shortTermBoxA.totalCostBasis, adjustments: shortTermBoxA.totalAdjustments }
  );
  audit.record(
    "Form 8949",
    "Part I Box B",
    "Short-term, basis not reported",
    shortTermBoxB.totalGainLoss,
    `${shortTermBoxB.transactions.length} transactions`,
    { proceeds: shortTermBoxB.totalProceeds, cost: shortTermBoxB.totalCostBasis, adjustments: shortTermBoxB.totalAdjustments }
  );

  const totalShortTermGainLoss = shortTermBoxA.totalGainLoss.plus(shortTermBoxB.totalGainLoss);
  audit.record(
    "Form 8949",
    "Part I totals",
    "Total short-term gain/loss",
    totalShortTermGainLoss,
    "Box A + Box B"
  );

  // Audit Part II
  audit.record(
    "Form 8949",
    "Part II Box D",
    "Long-term, basis reported",
    longTermBoxD.totalGainLoss,
    `${longTermBoxD.transactions.length} transactions`,
    { proceeds: longTermBoxD.totalProceeds, cost: longTermBoxD.totalCostBasis, adjustments: longTermBoxD.totalAdjustments }
  );
  audit.record(
    "Form 8949",
    "Part II Box E",
    "Long-term, basis not reported",
    longTermBoxE.totalGainLoss,
    `${longTermBoxE.transactions.length} transactions`,
    { proceeds: longTermBoxE.totalProceeds, cost: longTermBoxE.totalCostBasis, adjustments: longTermBoxE.totalAdjustments }
  );

  audit.record("Form 8949", "Part II Box F", "Long-term, no1099-B issuer adjustments", longTermBoxF.totalGainLoss,
    `${longTermBoxF.transactions.length} actual issuer Q adjustments`,
    { proceeds: longTermBoxF.totalProceeds, cost: longTermBoxF.totalCostBasis, adjustments: longTermBoxF.totalAdjustments });
  const totalLongTermGainLoss = longTermBoxD.totalGainLoss.plus(longTermBoxE.totalGainLoss).plus(longTermBoxF.totalGainLoss);
  audit.record(
    "Form 8949",
    "Part II totals",
    "Total long-term gain/loss",
    totalLongTermGainLoss,
    "Box D + Box E + Box F"
  );

  // Wash sale summary
  const washSaleCount = allTransactions.filter((t) => t.transaction.washSale).length;
  const washSaleDisallowed = allTransactions
    .filter((t) => t.transaction.washSale)
    .reduce((acc, t) => acc.plus(d(t.transaction.washSaleDisallowed)), new Decimal(0));
  audit.record(
    "Form 8949",
    "adjustment-W",
    "Wash sale disallowed",
    washSaleDisallowed,
    `${washSaleCount} wash sale transactions`
  );

  // Flow to Schedule D
  audit.record(
    "Form 8949",
    "to-schedule-d",
    "Totals to Schedule D",
    totalShortTermGainLoss.plus(totalLongTermGainLoss),
    "Part I → Sched D Lines 1-3; Part II → Sched D Lines 8-10"
  );

  return {
    shortTermBoxA,
    shortTermBoxB,
    longTermBoxD,
    longTermBoxE,
    longTermBoxF,
    section1202,
    totalShortTermGainLoss,
    totalLongTermGainLoss,
    lines: audit.getLines(),
  };
}

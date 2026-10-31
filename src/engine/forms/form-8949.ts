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
import { normalizeDigitalAssetCapitalInput } from './digital-asset-capital-input.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';

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
  shortTermBoxC: CategoryTotals; // Other assets, neither1099-B nor1099-DA
  shortTermBoxG: CategoryTotals; //1099-DA, basis reported
  shortTermBoxH: CategoryTotals; //1099-DA, basis not reported
  shortTermBoxI: CategoryTotals; // Digital assets, neither reporting document

  /** Part II: Long-term */
  longTermBoxD: CategoryTotals; // Basis reported to IRS
  longTermBoxE: CategoryTotals; // Basis NOT reported to IRS
  longTermBoxF: CategoryTotals; // Other assets with neither document, including issuer Q adjustments
  longTermBoxJ: CategoryTotals; //1099-DA, basis reported
  longTermBoxK: CategoryTotals; //1099-DA, basis not reported
  longTermBoxL: CategoryTotals; // Digital assets, neither reporting document
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
  if (t.qofInclusion) adjustmentCode = `Y${adjustmentCode}`;
  if (t.adjustmentCodes) adjustmentCode = `${t.adjustmentCodes}${adjustmentCode}`;

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

type ReportingBox = 'A' | 'B' | 'C' | 'G' | 'H' | 'I' | 'D' | 'E' | 'F' | 'J' | 'K' | 'L';

function reportingBox(transaction: CapitalTransaction): ReportingBox {
  // Older original1099-B records retain their collection's explicit meaning.
  // Normalized DA and nonstatement rows must carry their actual source type.
  const source = transaction.sourceDocumentType ?? '1099-b';
  const short = transaction.holdingPeriod === 'short';
  if (source === '1099-da') {
    if (!transaction.digitalAsset) throw new Error('Form8949 source1099-DA must describe a digital asset');
    return short ? (transaction.basisReportedToIRS ? 'G' : 'H') : (transaction.basisReportedToIRS ? 'J' : 'K');
  }
  if (source === 'not-reported') {
    if (transaction.basisReportedToIRS) throw new Error('Form8949 source without a reporting document cannot claim reported basis');
    return transaction.digitalAsset ? (short ? 'I' : 'L') : (short ? 'C' : 'F');
  }
  if (source !== '1099-b') throw new Error('Form8949 original reporting document is unsupported');
  return short ? (transaction.basisReportedToIRS ? 'A' : 'B') : (transaction.basisReportedToIRS ? 'D' : 'E');
}

export function calculateForm8949(input: TaxYearInput): Form8949Result {
  const audit = new AuditTrail();
  const capitalInput = normalizeDigitalAssetCapitalInput(input);
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

  // Normalization appends originalDA sources without changing originalB indexes
  // used by the independently bound Section1202 lots. Already normalized input
  // has no rawDA rows and is not converted a second time.
  const allTransactions: Array<{ transaction: CapitalTransaction; sourceId: string }> = [];
  for (const [formIndex, form] of capitalInput.form1099B.entries()) {
    for (const [transactionIndex, t] of form.transactions.entries()) {
      allTransactions.push({ transaction: t, sourceId: `form1099B:${formIndex}:transaction:${transactionIndex}` });
    }
  }

  const transactions: Record<ReportingBox, TransactionSummary[]> = {
    A: [], B: [], C: [], G: [], H: [], I: [], D: [], E: [], F: [...fundAdjustments], J: [], K: [], L: [],
  };
  for (const { transaction, sourceId } of allTransactions) {
    transactions[reportingBox(transaction)].push(processTransaction(transaction, brokerExclusions.get(sourceId)));
  }
  // Owner-level distribution gains are separate from the entity's reported
  // capital amounts and basis income. Original source validation determines
  // character and reported columns; no synthetic1099-B statement is created.
  if (input.k1CharitableSources?.statements?.some(source => source.cashDistribution !== undefined)) {
    const source = calculateK1CharitableReturnSources(input);
    for (const statement of source?.statements ?? []) {
      const distribution = statement.distributionGain;
      if (!distribution?.gain.gt(0)) continue;
      transactions[distribution.holdingPeriod === 'short' ? 'C' : 'F'].push({
        description: `${input.scheduleK1[statement.k1Index].partnershipName} - cash distribution`,
        dateAcquired: distribution.acquisitionDate, dateSold: distribution.distributionDate,
        proceeds: distribution.proceeds, costBasis: distribution.reportedBasis,
        adjustment: new Decimal(0), adjustmentCode: '', gainLoss: distribution.gain,
      });
    }
  }
  const shortTermBoxA = aggregateCategory(transactions.A);
  const shortTermBoxB = aggregateCategory(transactions.B);
  const shortTermBoxC = aggregateCategory(transactions.C);
  const shortTermBoxG = aggregateCategory(transactions.G);
  const shortTermBoxH = aggregateCategory(transactions.H);
  const shortTermBoxI = aggregateCategory(transactions.I);
  const longTermBoxD = aggregateCategory(transactions.D);
  const longTermBoxE = aggregateCategory(transactions.E);
  const longTermBoxF = aggregateCategory(transactions.F);
  const longTermBoxJ = aggregateCategory(transactions.J);
  const longTermBoxK = aggregateCategory(transactions.K);
  const longTermBoxL = aggregateCategory(transactions.L);
  for (const [part, box, category] of [
    ['I', 'A', shortTermBoxA], ['I', 'B', shortTermBoxB], ['I', 'C', shortTermBoxC],
    ['I', 'G', shortTermBoxG], ['I', 'H', shortTermBoxH], ['I', 'I', shortTermBoxI],
    ['II', 'D', longTermBoxD], ['II', 'E', longTermBoxE], ['II', 'F', longTermBoxF],
    ['II', 'J', longTermBoxJ], ['II', 'K', longTermBoxK], ['II', 'L', longTermBoxL],
  ] as const) {
    audit.record('Form 8949', `Part ${part} Box ${box}`, `${part === 'I' ? 'Short' : 'Long'}-term original reporting category ${box}`,
      category.totalGainLoss, `${category.transactions.length} transactions`,
      { proceeds: category.totalProceeds, cost: category.totalCostBasis, adjustments: category.totalAdjustments });
  }

  const totalShortTermGainLoss = [shortTermBoxA, shortTermBoxB, shortTermBoxC, shortTermBoxG, shortTermBoxH, shortTermBoxI]
    .reduce((total, category) => total.plus(category.totalGainLoss), new Decimal(0));
  audit.record(
    "Form 8949",
    "Part I totals",
    "Total short-term gain/loss",
    totalShortTermGainLoss,
    "Box A + Box B + Box C + Box G + Box H + Box I"
  );

  const totalLongTermGainLoss = [longTermBoxD, longTermBoxE, longTermBoxF, longTermBoxJ, longTermBoxK, longTermBoxL]
    .reduce((total, category) => total.plus(category.totalGainLoss), new Decimal(0));
  audit.record(
    "Form 8949",
    "Part II totals",
    "Total long-term gain/loss",
    totalLongTermGainLoss,
    "Box D + Box E + Box F + Box J + Box K + Box L"
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
    shortTermBoxC,
    shortTermBoxG,
    shortTermBoxH,
    shortTermBoxI,
    longTermBoxD,
    longTermBoxE,
    longTermBoxF,
    longTermBoxJ,
    longTermBoxK,
    longTermBoxL,
    section1202,
    totalShortTermGainLoss,
    totalLongTermGainLoss,
    lines: audit.getLines(),
  };
}

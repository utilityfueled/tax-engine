/**
 * Form 8995-A — Qualified Business Income Deduction (Detailed Computation)
 * Spec: spec/federal/form-8995-a.yaml
 *
 * Computes the Section 199A QBI deduction for taxpayers with taxable income
 * above the simplified threshold ($197,300 single / $394,600 MFJ for 2025).
 * Applies W-2 wage / UBIA limitations and SSTB phase-out rules.
 *
 * Includes qualified REIT dividends (Line 17, no W-2/UBIA limit per IRC §199A(b)(3))
 * and qualified PTP income (Lines 18-31, subject to per-PTP W-2/UBIA limits).
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { zeroFloor, min, max, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface QBIBusinessSource {
  name: string;
  /** QBI from this trade or business */
  qbi: Decimal;
  /** W-2 wages paid by this business */
  w2Wages: Decimal;
  /** UBIA of qualified property held by this business */
  ubia: Decimal;
  /** Whether this is a specified service trade or business */
  isSST: boolean;
}

/** Part IV aggregation election — combines two or more businesses into a single QBI source */
export interface AggregationGroup {
  /** Name of the aggregated group (e.g., "Real Estate Group") */
  name: string;
  /** Names of the component businesses (must match QBIBusinessSource.name) */
  componentBusinessNames: string[];
}

/** Schedule D (Form 8995-A) — patronage source from a specified ag/hort cooperative */
export interface PatronageCooperativeSource {
  /** Name of the specified cooperative */
  cooperativeName: string;
  /** QBI properly allocable to qualified payments from this cooperative (Schedule D Line 2) */
  qbiAllocableToQualifiedPayments: Decimal;
  /** W-2 wages from the trade or business allocable to qualified payments (Schedule D Line 4) */
  w2WagesAllocableToQualifiedPayments: Decimal;
  /** Section 199A(g) DPAD passed through from the cooperative (Form 1099-PATR Box 6) */
  cooperativeDPAD: Decimal;
}

export interface Form8995AInput {
  /** QBI sources with W-2/UBIA/SSTB detail per business */
  qbiSources: QBIBusinessSource[];
  /** Qualified PTP sources with W-2/UBIA/SSTB detail per PTP */
  ptpSources?: QBIBusinessSource[];
  /** Qualified REIT dividends (1099-DIV Box 5 + K-1 Section 199A statement) */
  qualifiedReitDividends?: Decimal;
  /** Part IV aggregation elections (Reg. §1.199A-4) */
  aggregationElections?: AggregationGroup[];
  /** Schedule D patronage sources from specified ag/hort cooperatives (IRC §199A(b)(7), §199A(g)) */
  patronageSources?: PatronageCooperativeSource[];
  /** Prior year QBI loss carryforward (positive number representing loss) */
  priorYearQBILoss?: Decimal;
  /** Taxable income before QBI deduction (AGI - standard/itemized) */
  taxableIncomeBeforeQBI: Decimal;
  /** Net capital gain from Schedule D (if positive) */
  netCapitalGain: Decimal;
  /** Qualified dividends */
  qualifiedDividends: Decimal;
  /** Simplified threshold for the filing status */
  simplifiedThreshold: Decimal;
  /** Phase-in range for the filing status */
  phaseInRange: Decimal;
}

export interface Form8995ABusinessResult {
  name: string;
  isSST: boolean;
  line1QBI: Decimal;
  line2AdjustedQBI: Decimal;
  line3W2Wages: Decimal;
  line4AdjustedW2: Decimal;
  line5UBIA: Decimal;
  line6AdjustedUBIA: Decimal;
  line7FiftyPercentW2: Decimal;
  line8TwentyFivePlusTwoPointFive: Decimal;
  line9W2UBIALimit: Decimal;
  line10TwentyPercentQBI: Decimal;
  line11LesserOfLimitOrQBI: Decimal;
  line12Excess: Decimal;
  line14PhaseInReduction: Decimal;
  line15QBIComponent: Decimal;
}

/** Part IV aggregation group detail in the result */
export interface AggregationGroupResult {
  name: string;
  componentBusinessNames: string[];
  combinedQBI: Decimal;
  combinedW2Wages: Decimal;
  combinedUBIA: Decimal;
}

/** Schedule D per-cooperative patron reduction result */
export interface PatronageCooperativeResult {
  cooperativeName: string;
  /** Schedule D Line 2: QBI allocable to qualified payments */
  qbiAllocable: Decimal;
  /** Schedule D Line 3: 9% of Line 2 */
  ninePercentQBI: Decimal;
  /** Schedule D Line 4: W-2 wages allocable */
  w2WagesAllocable: Decimal;
  /** Schedule D Line 5: 50% of Line 4 */
  fiftyPercentW2: Decimal;
  /** Schedule D Line 6: patron reduction = min(Line 3, Line 5) */
  patronReduction: Decimal;
  /** DPAD passed through from the cooperative (1099-PATR Box 6) */
  cooperativeDPAD: Decimal;
}

export interface Form8995AResult {
  businesses: Form8995ABusinessResult[];
  /** Per-PTP results from Lines 18-31 (same structure as Part I) */
  ptpBusinesses: Form8995ABusinessResult[];
  /** Part IV aggregation groups applied (empty if no aggregation) */
  aggregationGroups: AggregationGroupResult[];
  /** Schedule D per-cooperative patron reduction details */
  patronageResults: PatronageCooperativeResult[];
  /** Line 16: Total QBI component (sum of per-business, floor 0) */
  totalQBIComponent: Decimal;
  /** Line 17: Qualified REIT dividends */
  qualifiedReitDividends: Decimal;
  /** Line 32: Total REIT and PTP component */
  reitPTPComponent: Decimal;
  /** Line 33: Taxable income before QBI */
  taxableIncomeBeforeQBI: Decimal;
  /** Line 34: Net capital gain + qualified dividends */
  netCapitalGainAmount: Decimal;
  /** Line 35: Income limitation (20% of TI minus cap gains) */
  incomeLimitation: Decimal;
  /** Line 36: Combined QBI + REIT/PTP */
  combinedComponent: Decimal;
  /** Total patron reduction from Schedule D (sum of per-cooperative Line 6) */
  totalPatronReduction: Decimal;
  /** Line 37: QBI deduction before DPAD = min(Line 36 - patron reduction, Line 35) */
  qbiDeductionBeforeDPAD: Decimal;
  /** Line 38: Section 199A(g) DPAD from cooperatives (capped at TI - Line 37) */
  cooperativeDPAD: Decimal;
  /** Line 39: Section 199A deduction = Line 37 + Line 38 */
  qbiDeduction: Decimal;
  /** Line 40: QBI loss carryforward */
  qbiLossCarryforward: Decimal;
  /** Phase-in percentage used (0 at threshold, 1 at upper threshold) */
  phaseInPercentage: Decimal;
  /** Applicable SSTB percentage (1 at threshold, 0 above upper threshold) */
  sstbApplicablePercentage: Decimal;
  lines: CalculatedLine[];
}

const QBI_RATE = new Decimal("0.20");
const W2_FIFTY_RATE = new Decimal("0.50");
const W2_TWENTY_FIVE_RATE = new Decimal("0.25");
const UBIA_TWO_POINT_FIVE_RATE = new Decimal("0.025");
const PATRON_QBI_RATE = new Decimal("0.09");
const PATRON_W2_RATE = new Decimal("0.50");

/**
 * Part IV: Apply aggregation elections to produce the effective source list.
 * Aggregated businesses are combined into a single QBIBusinessSource entry;
 * non-aggregated businesses pass through unchanged.
 */
function applyAggregationElections(
  sources: QBIBusinessSource[],
  elections: AggregationGroup[],
): { effectiveSources: QBIBusinessSource[]; groupResults: AggregationGroupResult[] } {
  const sourceMap = new Map<string, QBIBusinessSource>();
  for (const s of sources) {
    sourceMap.set(s.name, s);
  }

  // Track which business names are consumed by an aggregation group
  const consumed = new Set<string>();
  const groupResults: AggregationGroupResult[] = [];
  const aggregatedSources: QBIBusinessSource[] = [];

  for (const group of elections) {
    if (group.componentBusinessNames.length < 2) {
      throw new Error(
        `Aggregation group "${group.name}" must contain at least two businesses`,
      );
    }

    let combinedQBI = new Decimal(0);
    let combinedW2 = new Decimal(0);
    let combinedUBIA = new Decimal(0);

    for (const bizName of group.componentBusinessNames) {
      const biz = sourceMap.get(bizName);
      if (!biz) {
        throw new Error(
          `Aggregation group "${group.name}" references unknown business "${bizName}"`,
        );
      }
      if (biz.isSST) {
        throw new Error(
          `Aggregation group "${group.name}" cannot include SSTB "${bizName}" (Reg. §1.199A-4(b)(1)(v))`,
        );
      }
      if (consumed.has(bizName)) {
        throw new Error(
          `Business "${bizName}" appears in more than one aggregation group`,
        );
      }
      consumed.add(bizName);
      combinedQBI = combinedQBI.plus(biz.qbi);
      combinedW2 = combinedW2.plus(biz.w2Wages);
      combinedUBIA = combinedUBIA.plus(biz.ubia);
    }

    groupResults.push({
      name: group.name,
      componentBusinessNames: group.componentBusinessNames,
      combinedQBI,
      combinedW2Wages: combinedW2,
      combinedUBIA,
    });

    aggregatedSources.push({
      name: group.name,
      qbi: combinedQBI,
      w2Wages: combinedW2,
      ubia: combinedUBIA,
      isSST: false, // SSTBs cannot be aggregated
    });
  }

  // Non-aggregated businesses pass through unchanged
  const standalone = sources.filter((s) => !consumed.has(s.name));

  return {
    effectiveSources: [...aggregatedSources, ...standalone],
    groupResults,
  };
}

/**
 * Compute per-entity QBI deduction components (shared between Part I trade/business
 * sources and Lines 18-31 PTP sources).
 */
function computePerEntityComponents(
  effectiveSources: QBIBusinessSource[],
  phaseInPercentage: Decimal,
  sstbApplicablePercentage: Decimal,
  priorLoss: Decimal,
  audit: AuditTrail,
  linePrefix: string,
): { businesses: Form8995ABusinessResult[]; totalComponent: Decimal; totalGrossQBI: Decimal } {
  // Schedule C loss netting
  const currentYearLosses = effectiveSources
    .filter((s) => s.qbi.lessThan(0))
    .reduce((acc, s) => acc.plus(s.qbi.abs()), new Decimal(0));
  const totalLosses = priorLoss.plus(currentYearLosses);
  const totalPositiveQBI = effectiveSources
    .filter((s) => s.qbi.greaterThan(0))
    .reduce((acc, s) => acc.plus(s.qbi), new Decimal(0));
  const nettableLoss = Decimal.min(totalLosses, totalPositiveQBI);

  const businesses: Form8995ABusinessResult[] = [];
  let totalGrossQBI = new Decimal(0);

  for (const source of effectiveSources) {
    const applicablePct = source.isSST ? sstbApplicablePercentage : new Decimal(1);

    // Line 1: QBI after loss netting
    let line1 = roundDollar(source.qbi);
    if (source.qbi.greaterThan(0) && totalPositiveQBI.greaterThan(0) && nettableLoss.greaterThan(0)) {
      const share = source.qbi.dividedBy(totalPositiveQBI);
      const reduction = roundDollar(nettableLoss.times(share));
      line1 = zeroFloor(line1.minus(reduction));
    }

    const line2 = roundDollar(line1.times(applicablePct));
    const line3 = roundDollar(source.w2Wages);
    const line4 = roundDollar(line3.times(applicablePct));
    const line5 = roundDollar(source.ubia);
    const line6 = roundDollar(line5.times(applicablePct));
    const line7 = roundDollar(line4.times(W2_FIFTY_RATE));
    const line8 = roundDollar(line4.times(W2_TWENTY_FIVE_RATE).plus(line6.times(UBIA_TWO_POINT_FIVE_RATE)));
    const line9 = max(line7, line8);
    const line10 = line2.greaterThan(0)
      ? roundDollar(line2.times(QBI_RATE))
      : roundDollar(line2.times(QBI_RATE));

    let line11: Decimal;
    if (line2.lessThanOrEqualTo(0)) {
      line11 = line10;
    } else {
      line11 = min(line9, line10);
    }

    const line12 = line2.greaterThan(0) ? zeroFloor(line10.minus(line11)) : new Decimal(0);
    const line14 = roundDollar(line12.times(phaseInPercentage));
    const line15 = line10.minus(line14);

    totalGrossQBI = totalGrossQBI.plus(line1);

    const biz: Form8995ABusinessResult = {
      name: source.name,
      isSST: source.isSST,
      line1QBI: line1,
      line2AdjustedQBI: line2,
      line3W2Wages: line3,
      line4AdjustedW2: line4,
      line5UBIA: line5,
      line6AdjustedUBIA: line6,
      line7FiftyPercentW2: line7,
      line8TwentyFivePlusTwoPointFive: line8,
      line9W2UBIALimit: line9,
      line10TwentyPercentQBI: line10,
      line11LesserOfLimitOrQBI: line11,
      line12Excess: line12,
      line14PhaseInReduction: line14,
      line15QBIComponent: line15,
    };
    businesses.push(biz);

    audit.record("8995-A", `${linePrefix}${source.name}`, `Line 1 QBI`, line1, source.name);
    audit.record("8995-A", `${linePrefix}${source.name}`, `Line 2 adj QBI`, line2,
      `${line1} × ${applicablePct} SSTB%`);
    audit.record("8995-A", `${linePrefix}${source.name}`, `Line 15 component`, line15,
      `20%×$${line2} = $${line10}; W2/UBIA limit = $${line9}; excess = $${line12}; phase-in reduction = $${line14}`);
  }

  const rawTotal = businesses.reduce((acc, b) => acc.plus(b.line15QBIComponent), new Decimal(0));
  const totalComponent = zeroFloor(rawTotal);

  return { businesses, totalComponent, totalGrossQBI };
}

export function calculateForm8995A(input: Form8995AInput): Form8995AResult {
  const audit = new AuditTrail();

  // Part IV: Apply aggregation elections before any computation
  const elections = input.aggregationElections ?? [];
  const { effectiveSources, groupResults: aggregationGroups } =
    elections.length > 0
      ? applyAggregationElections(input.qbiSources, elections)
      : { effectiveSources: input.qbiSources, groupResults: [] as AggregationGroupResult[] };

  if (aggregationGroups.length > 0) {
    for (const g of aggregationGroups) {
      audit.record("8995-A", `agg-${g.name}`, "Aggregation group",
        g.combinedQBI,
        `${g.componentBusinessNames.join(" + ")}: QBI=$${g.combinedQBI}, W-2=$${g.combinedW2Wages}, UBIA=$${g.combinedUBIA}`);
    }
  }

  const threshold = input.simplifiedThreshold;
  const phaseInRange = input.phaseInRange;
  const upperThreshold = threshold.plus(phaseInRange);
  const taxableIncome = input.taxableIncomeBeforeQBI;

  // Phase-in percentage: 0 at threshold, 1 at/above upper threshold
  let phaseInPercentage: Decimal;
  if (taxableIncome.lte(threshold)) {
    phaseInPercentage = new Decimal(0);
  } else if (taxableIncome.gte(upperThreshold)) {
    phaseInPercentage = new Decimal(1);
  } else {
    phaseInPercentage = taxableIncome.minus(threshold).dividedBy(phaseInRange);
  }

  const sstbApplicablePercentage = new Decimal(1).minus(phaseInPercentage);

  audit.record("8995-A", "phase-in", "Phase-in percentage", phaseInPercentage,
    `(${taxableIncome} - ${threshold}) / ${phaseInRange}`);
  audit.record("8995-A", "sstb-%", "SSTB applicable percentage", sstbApplicablePercentage,
    `1 - ${phaseInPercentage}`);

  // Part I: Per-business QBI deduction components (Lines 1-15)
  const priorLoss = input.priorYearQBILoss ?? new Decimal(0);
  const partI = computePerEntityComponents(
    effectiveSources, phaseInPercentage, sstbApplicablePercentage,
    priorLoss, audit, "biz-"
  );

  // Line 16: Total QBI component
  audit.record("8995-A", "16", "Total QBI component", partI.totalComponent,
    `Sum of per-business: $${partI.businesses.reduce((a, b) => a.plus(b.line15QBIComponent), new Decimal(0))} (after Schedule C loss netting)`);

  // ── REIT and PTP (Lines 17-32) ──────────────────────────────────────

  // Line 17: Qualified REIT dividends — flat 20%, no W-2/UBIA limit per IRC §199A(b)(3)
  const qualifiedReitDividends = roundDollar(input.qualifiedReitDividends ?? new Decimal(0));
  const reitComponent = qualifiedReitDividends.greaterThan(0)
    ? roundDollar(qualifiedReitDividends.times(QBI_RATE))
    : new Decimal(0);
  audit.record("8995-A", "17", "Qualified REIT dividends", qualifiedReitDividends,
    "1099-DIV Box 5 + K-1 Section 199A REIT dividends (no W-2/UBIA limitation)");

  // Lines 18-31: Per-PTP computation (same W-2/UBIA/SSTB treatment as Part I)
  const ptpSources = input.ptpSources ?? [];
  let ptpBusinesses: Form8995ABusinessResult[] = [];
  let ptpComponent = new Decimal(0);
  if (ptpSources.length > 0) {
    const ptpResult = computePerEntityComponents(
      ptpSources, phaseInPercentage, sstbApplicablePercentage,
      new Decimal(0), // PTP prior loss is handled separately from trade/business QBI
      audit, "ptp-"
    );
    ptpBusinesses = ptpResult.businesses;
    ptpComponent = ptpResult.totalComponent;
  }

  // Line 32: Total REIT and PTP component
  const reitPTPComponent = zeroFloor(reitComponent.plus(ptpComponent));
  audit.record("8995-A", "32", "Total REIT and PTP component", reitPTPComponent,
    `$${reitComponent} REIT component (20% of $${qualifiedReitDividends}) + $${ptpComponent} PTP component`);

  // Line 33: Taxable income before QBI
  audit.record("8995-A", "33", "Taxable income before QBI", taxableIncome,
    "AGI - standard/itemized deduction");

  // Line 34: Net capital gain
  const netCapitalGainAmount = zeroFloor(input.netCapitalGain).plus(input.qualifiedDividends);
  audit.record("8995-A", "34", "Net capital gain", netCapitalGainAmount,
    `max(0, ${input.netCapitalGain}) + $${input.qualifiedDividends} qual div`);

  // Line 35: Income limitation = 20% of (taxable income - net capital gain)
  const incomeBase = zeroFloor(taxableIncome.minus(netCapitalGainAmount));
  const incomeLimitation = roundDollar(incomeBase.times(QBI_RATE));
  audit.record("8995-A", "35", "Income limitation", incomeLimitation,
    `max(0, ${taxableIncome} - ${netCapitalGainAmount}) × 20%`);

  // Line 36: Combined QBI + REIT/PTP
  const combinedComponent = partI.totalComponent.plus(reitPTPComponent);
  audit.record("8995-A", "36", "Combined QBI, REIT, and PTP", combinedComponent,
    `$${partI.totalComponent} QBI component + $${reitPTPComponent} REIT/PTP component`);

  // ── Schedule D: Patron Reduction ────────────────────────────────────
  const patronageSources = input.patronageSources ?? [];
  const patronageResults: PatronageCooperativeResult[] = [];
  let totalPatronReduction = new Decimal(0);
  let totalCooperativeDPAD = new Decimal(0);

  for (const source of patronageSources) {
    const qbiAllocable = zeroFloor(roundDollar(source.qbiAllocableToQualifiedPayments));
    const ninePercentQBI = roundDollar(qbiAllocable.times(PATRON_QBI_RATE));
    const w2WagesAllocable = zeroFloor(roundDollar(source.w2WagesAllocableToQualifiedPayments));
    const fiftyPercentW2 = roundDollar(w2WagesAllocable.times(PATRON_W2_RATE));
    const patronReduction = min(ninePercentQBI, fiftyPercentW2);
    const dpad = zeroFloor(roundDollar(source.cooperativeDPAD));

    totalPatronReduction = totalPatronReduction.plus(patronReduction);
    totalCooperativeDPAD = totalCooperativeDPAD.plus(dpad);

    patronageResults.push({
      cooperativeName: source.cooperativeName,
      qbiAllocable,
      ninePercentQBI,
      w2WagesAllocable,
      fiftyPercentW2,
      patronReduction,
      cooperativeDPAD: dpad,
    });

    audit.record("8995-A", `sched-d-${source.cooperativeName}`, "Schedule D Line 6 patron reduction",
      patronReduction,
      `min(9% × $${qbiAllocable} = $${ninePercentQBI}, 50% × $${w2WagesAllocable} = $${fiftyPercentW2})`,
      {
        "Cooperative": source.cooperativeName,
        "QBI allocable to qualified payments": qbiAllocable,
        "9% of QBI allocable": ninePercentQBI,
        "W-2 wages allocable": w2WagesAllocable,
        "50% of W-2 allocable": fiftyPercentW2,
        "DPAD from cooperative (1099-PATR Box 6)": dpad,
      });
  }

  // Line 37: QBI deduction before DPAD = min(combined - patron reduction, income limitation)
  const adjustedCombined = zeroFloor(combinedComponent.minus(totalPatronReduction));
  const qbiDeductionBeforeDPAD = min(adjustedCombined, incomeLimitation);
  audit.record("8995-A", "37", "QBI deduction before DPAD", qbiDeductionBeforeDPAD,
    totalPatronReduction.isZero()
      ? `min($${combinedComponent} combined, $${incomeLimitation} income limit)`
      : `min($${combinedComponent} combined - $${totalPatronReduction} patron reduction = $${adjustedCombined}, $${incomeLimitation} income limit)`);

  // Line 38: DPAD from cooperatives (capped at TI - Line 37)
  const dpadCap = zeroFloor(taxableIncome.minus(qbiDeductionBeforeDPAD));
  const cooperativeDPAD = min(totalCooperativeDPAD, dpadCap);
  audit.record("8995-A", "38", "Section 199A(g) DPAD from cooperatives", cooperativeDPAD,
    totalCooperativeDPAD.isZero()
      ? "$0 — no cooperative patronage sources"
      : `min($${totalCooperativeDPAD} total DPAD, $${dpadCap} cap = TI $${taxableIncome} - Line 37 $${qbiDeductionBeforeDPAD})`);

  // Line 39: Total 199A deduction = Line 37 + Line 38
  const qbiDeduction = qbiDeductionBeforeDPAD.plus(cooperativeDPAD);
  audit.record("8995-A", "39", "Section 199A deduction", qbiDeduction,
    cooperativeDPAD.isZero()
      ? `$${qbiDeductionBeforeDPAD} (no DPAD)`
      : `$${qbiDeductionBeforeDPAD} QBI deduction before DPAD + $${cooperativeDPAD} cooperative DPAD`);

  // Line 40: QBI loss carryforward
  const currentYearLosses = effectiveSources
    .filter((s) => s.qbi.lessThan(0))
    .reduce((acc, s) => acc.plus(s.qbi.abs()), new Decimal(0));
  const totalLosses = priorLoss.plus(currentYearLosses);
  const totalPositiveQBI = effectiveSources
    .filter((s) => s.qbi.greaterThan(0))
    .reduce((acc, s) => acc.plus(s.qbi), new Decimal(0));
  const nettableLoss = Decimal.min(totalLosses, totalPositiveQBI);
  const remainingLoss = totalLosses.minus(nettableLoss);
  const qbiLossCarryforward = remainingLoss.greaterThan(0) ? remainingLoss : new Decimal(0);
  audit.record("8995-A", "40", "QBI loss carryforward", qbiLossCarryforward,
    qbiLossCarryforward.greaterThan(0)
      ? `Total losses $${totalLosses} - netted $${nettableLoss} = $${remainingLoss}`
      : "No carryforward");

  return {
    businesses: partI.businesses,
    ptpBusinesses,
    aggregationGroups,
    patronageResults,
    totalQBIComponent: partI.totalComponent,
    qualifiedReitDividends,
    reitPTPComponent,
    taxableIncomeBeforeQBI: taxableIncome,
    netCapitalGainAmount,
    incomeLimitation,
    combinedComponent,
    totalPatronReduction,
    qbiDeductionBeforeDPAD,
    cooperativeDPAD,
    qbiDeduction,
    qbiLossCarryforward,
    phaseInPercentage,
    sstbApplicablePercentage,
    lines: audit.getLines(),
  };
}

/**
 * Form 8915-F — Qualified Disaster Retirement Plan Distributions and Repayments
 * Spec: spec/federal/form-8915-f.yaml
 *
 * Implements IRC §72(t)(2)(J) as made permanent by Secure 2.0 Act §331:
 * - Up to $22,000 per disaster per individual
 * - 3-year income spread election (default) or full inclusion
 * - Repayment tracking within 3 years
 * - Penalty exception for early distributions
 * - IRA vs non-IRA source tracking for Form 1040 Lines 4b/5b
 */

import Decimal from "decimal.js";
import type {
  Form8915FInput,
  QualifiedDisasterDistribution,
  PriorYearDisasterDeferral,
} from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";

const QUALIFIED_DISASTER_DISTRIBUTION_LIMIT = new Decimal(22000);

export interface Form8915FPerDisasterResult {
  disasterName: string;
  qualifiedAmount: Decimal;
  repayments: Decimal;
  netAfterRepayments: Decimal;
  currentYearIncludable: Decimal;
  deferredToFutureYears: Decimal;
  iraPortionOfIncludable: Decimal;
  pensionPortionOfIncludable: Decimal;
  /** Annual spread amount for carryforward (1/3 of net, if spread elected) */
  annualSpreadAmount: Decimal;
  /** Remaining deferred balance for carryforward tracking */
  remainingDeferredBalance: Decimal;
  /** IRA fraction of the qualified distribution (for prior-year proration) */
  iraFraction: Decimal;
  electFullInclusion: boolean;
}

export interface Form8915FPriorYearResult {
  disasterName: string;
  distributionYear: number;
  spreadYear: number;
  annualSpreadAmount: Decimal;
  remainingBefore: Decimal;
  repayments: Decimal;
  includableThisYear: Decimal;
  iraPortionOfIncludable: Decimal;
  pensionPortionOfIncludable: Decimal;
}

export interface Form8915FResult {
  /** Line 1: Total qualified disaster distributions for current year (after $22K cap per disaster) */
  line1: Decimal;
  /** Line 2: Current-year repayments allocated to current-year distributions */
  line2: Decimal;
  /** Line 3: Net current-year distributions after repayments */
  line3: Decimal;
  /** Line 4: Current-year includable amount (1/3 or full) */
  line4: Decimal;
  /** Line 5: Prior-year deferred amounts includable this year */
  line5: Decimal;
  /** Line 6: Total amount includable in income this year */
  line6: Decimal;
  /** Line 7: IRA portion of total includable amount */
  line7: Decimal;
  /** Line 8: Non-IRA (pension) portion of total includable amount */
  line8: Decimal;
  /** Line 9: Penalty exception amount (all qualified distributions exempt from §72(t)) */
  line9: Decimal;
  /** Line 10: Total deferred to future years from current-year distributions */
  line10: Decimal;

  /** Per-disaster detail for current-year distributions */
  currentYearDetail: Form8915FPerDisasterResult[];
  /** Per-disaster detail for prior-year deferred amounts */
  priorYearDetail: Form8915FPriorYearResult[];

  /** Carryforward records for year-over-year tracking of deferred amounts */
  carryforwardDeferrals: Array<{
    disasterName: string;
    distributionYear: number;
    spreadYear: number;
    annualSpreadAmount: string;
    remainingDeferredBalance: string;
    iraFraction: string;
  }>;

  lines: CalculatedLine[];
}

function computeIraFraction(dist: QualifiedDisasterDistribution): Decimal {
  const gross = d(dist.grossDistribution);
  if (gross.isZero()) return new Decimal(0);
  const ira = d(dist.iraDistribution);
  return ira.dividedBy(gross);
}

function processCurrentYearDistribution(
  dist: QualifiedDisasterDistribution,
): Form8915FPerDisasterResult {
  const gross = d(dist.grossDistribution);
  const qualifiedAmount = min(zeroFloor(gross), QUALIFIED_DISASTER_DISTRIBUTION_LIMIT);
  const repayments = min(zeroFloor(d(dist.currentYearRepayments)), qualifiedAmount);
  const netAfterRepayments = qualifiedAmount.minus(repayments);
  const iraFraction = computeIraFraction(dist);

  let currentYearIncludable: Decimal;
  let deferredToFutureYears: Decimal;
  let annualSpreadAmount: Decimal;

  if (dist.electFullInclusion || netAfterRepayments.isZero()) {
    currentYearIncludable = netAfterRepayments;
    deferredToFutureYears = new Decimal(0);
    annualSpreadAmount = new Decimal(0);
  } else {
    // 3-year spread: include 1/3 this year, defer 2/3
    annualSpreadAmount = roundDollar(netAfterRepayments.dividedBy(3));
    currentYearIncludable = annualSpreadAmount;
    deferredToFutureYears = netAfterRepayments.minus(currentYearIncludable);
  }

  const iraPortionOfIncludable = roundDollar(currentYearIncludable.times(iraFraction));
  const pensionPortionOfIncludable = currentYearIncludable.minus(iraPortionOfIncludable);

  return {
    disasterName: dist.disasterName,
    qualifiedAmount,
    repayments,
    netAfterRepayments,
    currentYearIncludable,
    deferredToFutureYears,
    iraPortionOfIncludable,
    pensionPortionOfIncludable,
    annualSpreadAmount,
    remainingDeferredBalance: deferredToFutureYears,
    iraFraction,
    electFullInclusion: dist.electFullInclusion,
  };
}

function processPriorYearDeferral(
  deferral: PriorYearDisasterDeferral,
): Form8915FPriorYearResult {
  const annualSpreadAmount = d(deferral.annualSpreadAmount);
  const remainingBefore = d(deferral.remainingDeferredBalance);
  const repayments = min(zeroFloor(d(deferral.currentYearRepayments)), remainingBefore);
  const iraFraction = d(deferral.iraFraction);

  // In year 3 (final year), include the remaining balance (may differ from 1/3 due to rounding)
  // In year 2, include the standard annual spread amount
  const baseIncludable = deferral.spreadYear === 3
    ? remainingBefore
    : min(annualSpreadAmount, remainingBefore);

  const includableThisYear = zeroFloor(baseIncludable.minus(repayments));
  const iraPortionOfIncludable = roundDollar(includableThisYear.times(iraFraction));
  const pensionPortionOfIncludable = includableThisYear.minus(iraPortionOfIncludable);

  return {
    disasterName: deferral.disasterName,
    distributionYear: deferral.distributionYear,
    spreadYear: deferral.spreadYear,
    annualSpreadAmount,
    remainingBefore,
    repayments,
    includableThisYear,
    iraPortionOfIncludable,
    pensionPortionOfIncludable,
  };
}

export function calculateForm8915F(input: Form8915FInput): Form8915FResult {
  const audit = new AuditTrail();

  // ── Current-year distributions ──────────────────────────────────
  const currentYearDetail = (input.currentYearDistributions ?? []).map(processCurrentYearDistribution);

  const line1 = sum(...currentYearDetail.map((r) => r.qualifiedAmount));
  audit.record("Form 8915-F", "1", "Total qualified disaster distributions (current year)",
    line1, "Sum of per-disaster grossDistribution each capped at $22,000",
    { disasters: currentYearDetail.length.toString() });

  const line2 = sum(...currentYearDetail.map((r) => r.repayments));
  audit.record("Form 8915-F", "2", "Current-year repayments for current-year distributions",
    line2, "Sum of per-disaster currentYearRepayments, each limited to qualified amount");

  const line3 = line1.minus(line2);
  audit.record("Form 8915-F", "3", "Net current-year distributions after repayments",
    line3, "Line 1 minus Line 2");

  const line4 = sum(...currentYearDetail.map((r) => r.currentYearIncludable));
  audit.record("Form 8915-F", "4", "Current-year includable amount",
    line4, "Sum of per-disaster includable: 1/3 for 3-year spread, full for full-inclusion election",
    {
      "3-year spread disasters": currentYearDetail.filter((r) => !r.electFullInclusion).length.toString(),
      "Full inclusion disasters": currentYearDetail.filter((r) => r.electFullInclusion).length.toString(),
    });

  // ── Prior-year deferred amounts ─────────────────────────────────
  const priorYearDetail = (input.priorYearDeferrals ?? []).map(processPriorYearDeferral);

  const line5 = sum(...priorYearDetail.map((r) => r.includableThisYear));
  audit.record("Form 8915-F", "5", "Prior-year deferred amounts includable this year",
    line5, "Sum of prior-year per-disaster deferred records after repayments",
    { "Prior-year records": priorYearDetail.length.toString() });

  // ── Totals ──────────────────────────────────────────────────────
  const line6 = line4.plus(line5);
  audit.record("Form 8915-F", "6", "Total amount includable in income this year",
    line6, "Line 4 plus Line 5");

  const line7 = sum(
    ...currentYearDetail.map((r) => r.iraPortionOfIncludable),
    ...priorYearDetail.map((r) => r.iraPortionOfIncludable),
  );
  audit.record("Form 8915-F", "7", "IRA portion of includable amount",
    line7, "Prorated from IRA/non-IRA source mix per disaster");

  const line8 = line6.minus(line7);
  audit.record("Form 8915-F", "8", "Non-IRA (pension) portion of includable amount",
    line8, "Line 6 minus Line 7");

  // Penalty exception: all qualified disaster distributions are exempt from §72(t)
  const priorYearGrossDistributions = sum(
    ...(input.priorYearDeferrals ?? []).map((def) => d(def.remainingDeferredBalance)),
  );
  const line9 = line1.plus(priorYearGrossDistributions);
  audit.record("Form 8915-F", "9", "Penalty exception amount",
    line9, "Total qualified distributions (current + prior year deferred) exempt from IRC §72(t) 10% penalty");

  const line10 = sum(...currentYearDetail.map((r) => r.deferredToFutureYears));
  audit.record("Form 8915-F", "10", "Total deferred to future years",
    line10, "Remaining 2/3 for 3-year spread elections");

  // ── Build carryforward records ──────────────────────────────────
  const carryforwardDeferrals: Form8915FResult["carryforwardDeferrals"] = [];

  // From current-year 3-year spread elections: generate year-2 and year-3 records
  for (const detail of currentYearDetail) {
    if (detail.deferredToFutureYears.isZero()) continue;

    // Year 2: include annualSpreadAmount
    const year2Remaining = detail.deferredToFutureYears;
    carryforwardDeferrals.push({
      disasterName: detail.disasterName,
      distributionYear: 0, // Caller should replace with actual tax year
      spreadYear: 2,
      annualSpreadAmount: detail.annualSpreadAmount.toString(),
      remainingDeferredBalance: year2Remaining.toString(),
      iraFraction: detail.iraFraction.toString(),
    });
  }

  // From prior-year year-2 records: generate year-3 if balance remains
  for (const detail of priorYearDetail) {
    if (detail.spreadYear !== 2) continue;
    const remainingAfterThisYear = zeroFloor(
      detail.remainingBefore.minus(detail.includableThisYear).minus(detail.repayments)
    );
    if (remainingAfterThisYear.isZero()) continue;

    carryforwardDeferrals.push({
      disasterName: detail.disasterName,
      distributionYear: detail.distributionYear,
      spreadYear: 3,
      annualSpreadAmount: detail.annualSpreadAmount.toString(),
      remainingDeferredBalance: remainingAfterThisYear.toString(),
      iraFraction: d((input.priorYearDeferrals ?? []).find(
        (def) => def.disasterName === detail.disasterName && def.distributionYear === detail.distributionYear
      )?.iraFraction).toString(),
    });
  }

  return {
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    currentYearDetail,
    priorYearDetail,
    carryforwardDeferrals,
    lines: audit.getLines(),
  };
}

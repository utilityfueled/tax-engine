/** Actual carry sources and Section172(a)/(b) worksheets.
 * Spec: spec/federal/net-operating-loss-vintages.yaml.
 * Canonical return computations supply income contexts; they are not source inputs.
 */
import Decimal from "decimal.js";
import type { FilingUnitHistory } from "@/models/filing-unit-sources.js";
import type { NolFilingUnitOrigin, NolFilingUnitUse, NolSameCoupleJointHistory } from "@/models/net-operating-loss-filing-unit.js";
import { calculateNolFilingUnitHistory } from "./net-operating-loss-filing-unit-history.js";
import { calculateJointNolComponents } from "./net-operating-loss-joint-components.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export interface NetOperatingLossVintageSource {
  sourceId?: string;
  lossTaxYear?: number;
  sourceReference?: string;
  originKind?: "individual_nol" | "excess_business_loss" | "estate_termination";
  originalLoss?: string;
  openingCarryforward?: string;
  carrybackTreatment?: "not_required" | "waived" | "completed";
  carrybackSourceReference?: string;
  ordinaryHistoricalCarrybackConfirmed?: boolean;
  adjustedThroughTaxYear?: number;
  historySourceReference?: string;
  allHistoryIncluded?: boolean;
  farmingLossIncluded?: boolean;
  filingUnitOrigin?: NolFilingUnitOrigin;
  history?: Array<{ taxYear?: number; nolUsed?: string; attributeReduction?: string; sourceReference?: string; filingUnitUses?: NolFilingUnitUse[] }>;
}
export interface NetOperatingLossSources {
  sourceTaxYear?: number;
  sourceReference?: string;
  sourceFactsConfirmed?: boolean;
  allCarryoversIncluded?: boolean;
  calendarYearTaxpayer?: boolean;
  returnMembership?: "continuous_individual" | "same_spouses_joint" | "changed_membership";
  filingUnitHistory?: FilingUnitHistory;
  sameCoupleJointHistory?: NolSameCoupleJointHistory;
  membershipUnchangedConfirmed?: boolean;
  primaryName?: string;
  primaryTaxpayerIdLast4?: string;
  spouseName?: string;
  spouseTaxpayerIdLast4?: string;
  vintages?: NetOperatingLossVintageSource[];
}
/** Each modified amount is a separately refigured canonical return, retaining
 * only earlier NOL deductions recomputed on the modified limit basis and applying
 * Section172(d) modifications. Reg1.172-5(a)(2)(ii) recomputes percentage limits.
 * Do not substitute the ordinary final taxable income or an input override.
 */
export interface NetOperatingLossContext {
  taxableIncomeWithoutNolQbiAndSection250: Decimal;
  modifiedTaxableIncomeWithoutNolQbiAndSection250?: Decimal;
  carryoverContexts?: Array<{
    sourceId: string;
    priorNolDeductions: Decimal;
    modifiedTaxableIncomeBeforeTwentyPercentReduction: Decimal;
  }>;
}
export interface NetOperatingLossVintageResult {
  sourceId: string;
  lossTaxYear: number;
  originKind: "individual_nol" | "excess_business_loss";
  originalLoss: Decimal;
  openingCarryforward: Decimal;
  expiredBeforeYear: Decimal;
  /** Incoming originals. Only a determined461 pool receives component use;
   * ordinary-only pools retain their existing aggregate ownership boundary. */
  jointPool?: { components: Array<{ sourceId: string; ownerPersonId: string; originalReturnSourceId: string;
    originKind?: "individual_nol" | "excess_business_loss";
    originalLoss: Decimal; openingCarryforward: Decimal; expiredBeforeYear: Decimal;
    deduction?: Decimal; absorbed?: Decimal; expired?: Decimal; remainingCarryforward?: Decimal }> };
  deduction?: Decimal;
  earlierClaimedNolDeductions?: Decimal;
  earlierModifiedNolDeductions?: Decimal;
  absorbed?: Decimal;
  expired?: Decimal;
  remainingCarryforward?: Decimal;
}
export interface NetOperatingLossResult {
  sourceFactsVerified: true;
  calculationComplete: boolean;
  availableCarryforward: Decimal;
  pre2018Carryforward: Decimal;
  post2017Carryforward: Decimal;
  pre2018Deduction?: Decimal;
  post2017Deduction?: Decimal;
  deduction?: Decimal;
  absorbed?: Decimal;
  expired?: Decimal;
  carryforward?: Decimal;
  vintages: NetOperatingLossVintageResult[];
  lines: CalculatedLine[];
}

function filedAmount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`NOL requires actual nonnegative filed whole-dollar ${label}`);
  const amount = d(value);
  if (!amount.isFinite()) throw new Error(`NOL requires finite ${label}`);
  return amount;
}
function name(value: string | undefined): string { return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? ""; }
function contextAmount(value: Decimal, label: string): Decimal {
  if (!(value instanceof Decimal) || !value.isFinite()) throw new Error(`NOL canonical ${label} must be finite`);
  return roundDollar(value);
}

export function calculateNetOperatingLoss(input: {
  taxYear: number;
  filingStatus: FilingStatus;
  taxpayer: { primary: { firstName: string; lastName: string; ssn: string }; spouse?: { firstName: string; lastName: string; ssn: string } };
  facts: NetOperatingLossSources;
  standardDeductionFacts?: { primaryDeathDate?: string | null; spouseDeathDate?: string | null };
  context?: NetOperatingLossContext;
}): NetOperatingLossResult {
  const { facts, taxYear, context } = input;
  if (![2025, 2026].includes(taxYear) || facts.sourceTaxYear !== taxYear || facts.sourceFactsConfirmed !== true
    || facts.allCarryoversIncluded !== true || facts.calendarYearTaxpayer !== true || !facts.sourceReference?.trim()) {
    throw new Error("NOL requires actual confirmed calendar-year carry sources and complete source records");
  }
  const joint = input.filingStatus === "married_filing_jointly";
  const changed = facts.returnMembership === "changed_membership";
  if (!changed && (facts.membershipUnchangedConfirmed !== true || facts.returnMembership !== (joint ? "same_spouses_joint" : "continuous_individual"))) {
    throw new Error("NOL changed return membership requires its separate actual allocation worksheet");
  }
  const filingHistory = calculateNolFilingUnitHistory({ ...input, taxpayer: { ...input.taxpayer, taxYear, filingStatus: input.filingStatus } });
  const matches = (person: typeof input.taxpayer.primary | undefined, sourceName: string | undefined, sourceLast4: string | undefined): boolean =>
    person !== undefined && /^\d{4}$/.test(sourceLast4 ?? "") && /^\d{9}$/.test(person.ssn.replace(/-/g, ""))
      && person.ssn.replace(/-/g, "").slice(-4) === sourceLast4 && name(`${person.firstName} ${person.lastName}`) === name(sourceName);
  if (!matches(input.taxpayer.primary, facts.primaryName, facts.primaryTaxpayerIdLast4)
    || (joint && !matches(input.taxpayer.spouse, facts.spouseName, facts.spouseTaxpayerIdLast4))
    || (!joint && (facts.spouseName !== undefined || facts.spouseTaxpayerIdLast4 !== undefined))) {
    throw new Error("NOL source identity must match the actual continuing return members");
  }
  if (!Array.isArray(facts.vintages)) throw new Error("NOL requires actual vintage history, including an explicit empty list when none");
  const audit = new AuditTrail();
  audit.merge(filingHistory.lines);
  const sourceIds = new Set<string>();
  const lossYears = new Set<number>();
  let vintages: NetOperatingLossVintageResult[] = facts.vintages.map(row => {
    const year = row.lossTaxYear;
    if (!row.sourceId?.trim() || sourceIds.has(row.sourceId) || !Number.isInteger(year) || year === undefined || year < 1 || year >= taxYear) {
      throw new Error("NOL requires unique source identity and an actual earlier loss year");
    }
    if (lossYears.has(year) && filingHistory.jointOwners === undefined) throw new Error("NOL same-year mixed sources require one reconciled originating worksheet, not duplicate vintages");
    sourceIds.add(row.sourceId); lossYears.add(year);
    if (!row.sourceReference?.trim() || !row.historySourceReference?.trim() || row.allHistoryIncluded !== true
      || row.adjustedThroughTaxYear !== taxYear - 1 || !Array.isArray(row.history)) {
      throw new Error("NOL requires actual complete history adjusted through the prior year");
    }
    if (row.farmingLossIncluded !== false) throw new Error("NOL farming loss history requires its separate carryback and source ordering worksheet");
    if (row.originKind !== "individual_nol" && row.originKind !== "excess_business_loss") {
      throw new Error("NOL estate termination or unknown originating character requires its separate actual source binding");
    }
    if (row.originKind === "excess_business_loss" && year < 2021) throw new Error("Section461 excess business loss cannot originate before2021 after the CARES Act correction");
    if (year <= 2020 && row.originKind !== "excess_business_loss") {
      if (!["waived", "completed"].includes(row.carrybackTreatment ?? "") || !row.carrybackSourceReference?.trim()) {
        throw new Error("NOL requires the actual historical carryback disposition and source record");
      }
    } else if (row.carrybackTreatment !== "not_required") {
      throw new Error("NOL nonfarming post2020 or EBL carry cannot manufacture a carryback");
    }
    if (row.carrybackTreatment === "completed" && year < 2018
      && (year < 2005 || row.ordinaryHistoricalCarrybackConfirmed !== true)) {
      throw new Error("NOL completed pre2018 carryback requires confirmed ordinary historical rules; extended or older history needs its separate worksheet");
    }
    const originalLoss = filedAmount(row.originalLoss, "original loss");
    const openingCarryforward = filedAmount(row.openingCarryforward, "opening carryforward");
    const historyYears = new Set<number>();
    const reductions = row.history.map(history => {
      const historyYear = history.taxYear;
      if (!Number.isInteger(historyYear) || historyYear === undefined || historyYear < 1 || historyYear >= taxYear
        || historyYears.has(historyYear) || !history.sourceReference?.trim()) {
        throw new Error("NOL history requires distinct actual earlier use years and source references");
      }
      historyYears.add(historyYear);
      const used = filedAmount(history.nolUsed, "historical NOL use");
      const reduced = filedAmount(history.attributeReduction, "historical attribute reduction");
      if (historyYear === year && !used.isZero()) throw new Error("NOL same-origin-year history may contain actual attribute reduction, never same-year NOL use");
      if (historyYear < year && (row.carrybackTreatment !== "completed" || reduced.gt(0))) {
        throw new Error("NOL prior-origin use requires actual completed carryback history");
      }
      if (historyYear < year && historyYear < year - (year >= 2018 && year <= 2020 ? 5 : 2)) {
        throw new Error("NOL historical carryback use is outside its supported statutory carryback period");
      }
      return used.plus(reduced);
    });
    if ((!changed && originalLoss.isZero()) || !originalLoss.minus(sum(...reductions)).eq(openingCarryforward)) {
      throw new Error("NOL original loss, prior uses, reductions and opening carry must reconcile");
    }
    const expiredBeforeYear = year < 2018 && taxYear > year + 20 ? openingCarryforward : d("0");
    audit.record("Section172 Carry Sources", row.sourceId, "Actual adjusted NOL carry balance", openingCarryforward,
      "Filed original loss less actual prior use and attribute reductions; no inferred source year or ownership",
      { "Loss year": String(year), "Original loss": originalLoss, "Prior reductions": sum(...reductions), "Expired before year": expiredBeforeYear });
    return { sourceId: row.sourceId, lossTaxYear: year, originKind: row.originKind, originalLoss, openingCarryforward, expiredBeforeYear };
  }).sort((a, b) => a.lossTaxYear - b.lossTaxYear);
  if (filingHistory.jointOwners !== undefined) {
    const byYear = new Map<number, NetOperatingLossVintageResult[]>();
    for (const row of vintages) byYear.set(row.lossTaxYear, [...(byYear.get(row.lossTaxYear) ?? []), row]);
    vintages = [...byYear.entries()].map(([year, rows]) => {
      const containsEbl = rows.some(row => row.originKind === 'excess_business_loss');
      if (containsEbl && rows.length === 1) return rows[0]!;
      const components = rows.map(row => {
        const owner = filingHistory.jointOwners!.find(item => item.sourceId === row.sourceId)!;
        return { sourceId: row.sourceId, ownerPersonId: owner.ownerPersonId, originalReturnSourceId: owner.originalReturnSourceId,
          ...(containsEbl ? { originKind: row.originKind } : {}),
          originalLoss: row.originalLoss, openingCarryforward: row.openingCarryforward, expiredBeforeYear: row.expiredBeforeYear };
      }).sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en-US'));
      const pooled = { sourceId: `joint-nol:${year}`, lossTaxYear: year, originKind: 'individual_nol' as const,
        originalLoss: sum(...rows.map(row => row.originalLoss)), openingCarryforward: sum(...rows.map(row => row.openingCarryforward)),
        expiredBeforeYear: sum(...rows.map(row => row.expiredBeforeYear)), jointPool: { components } };
      if (sourceIds.has(pooled.sourceId)) throw new Error('NOL original source identity conflicts with an internally derived joint pool');
      audit.record('Section172 Joint Carry Pool', pooled.sourceId, 'Actual incoming same-couple loss-year pool', pooled.openingCarryforward,
        containsEbl ? 'Verified incoming original kinds and owner balances by year; completed component use requires separately determined claim and absorption'
          : 'Sum of verified incoming owner balances by original year; current use and closing carry remain joint, without an owner allocation',
        { 'Loss year': String(year), 'Original owner components': String(components.length), 'Original owner loss total': pooled.originalLoss });
      return pooled;
    });
  }
  const available = (row: NetOperatingLossVintageResult) => row.openingCarryforward.minus(row.expiredBeforeYear);
  const pre2018 = sum(...vintages.filter(row => row.lossTaxYear < 2018).map(available));
  const post2017 = sum(...vintages.filter(row => row.lossTaxYear >= 2018).map(available));
  const base: NetOperatingLossResult = { sourceFactsVerified: true, calculationComplete: false,
    availableCarryforward: pre2018.plus(post2017), pre2018Carryforward: pre2018, post2017Carryforward: post2017, vintages, lines: audit.getLines() };
  if (!context) return base;
  const income = contextAmount(context.taxableIncomeWithoutNolQbiAndSection250, "limit income");
  const excess = zeroFloor(income.minus(pre2018));
  const post2017Limit = roundDollar(excess.times("0.8"));
  const post2017Deduction = Decimal.min(post2017, post2017Limit);
  const deduction = pre2018.plus(post2017Deduction);
  audit.record("Section172 Deduction Worksheet", "limit-base", "Income before172,199A and250 deductions", income,
    "Canonical income computation without these deductions; not the after-QBI taxable income");
  audit.record("Section172 Deduction Worksheet", "pre2018", "Pre2018 NOL deduction", pre2018, "Actual unexpired pre2018 carry; no80percent limitation");
  audit.record("Section172 Deduction Worksheet", "post2017", "Post2017 NOL deduction", post2017Deduction,
    "Smaller of actual post2017 carry or80percent of positive(limit income minuspre2018carry)", { "Limit base": income, "Pre2018 carry": pre2018, "Post2017 limit": post2017Limit });
  let postRemaining = post2017Deduction;
  let priorDeduction = d("0");
  for (const row of vintages) {
    row.earlierClaimedNolDeductions = priorDeduction;
    row.deduction = row.lossTaxYear < 2018 ? available(row) : Decimal.min(available(row), postRemaining);
    if (row.lossTaxYear >= 2018) postRemaining = postRemaining.minus(row.deduction);
    priorDeduction = priorDeduction.plus(row.deduction);
  }
  const claim = { ...base, pre2018Deduction: pre2018, post2017Deduction, deduction, lines: audit.getLines() };
  if (context.modifiedTaxableIncomeWithoutNolQbiAndSection250 !== undefined) {
    const modifiedBase = contextAmount(context.modifiedTaxableIncomeWithoutNolQbiAndSection250, "modified limit income");
    const modifiedLimit = roundDollar(zeroFloor(modifiedBase.minus(pre2018)).times("0.8"));
    let precedingPre = d("0");
    let precedingPost = d("0");
    for (const row of vintages) {
      row.earlierModifiedNolDeductions = precedingPre.plus(Decimal.min(precedingPost, modifiedLimit));
      if (row.lossTaxYear < 2018) precedingPre = precedingPre.plus(available(row));
      else precedingPost = precedingPost.plus(available(row));
    }
  }
  if (context.carryoverContexts === undefined) return claim;
  if (context.modifiedTaxableIncomeWithoutNolQbiAndSection250 === undefined) {
    throw new Error("NOL carryover requires the separately recomputed modified limit income");
  }
  const modifiedLimitIncome = contextAmount(context.modifiedTaxableIncomeWithoutNolQbiAndSection250, "modified limit income");
  const modifiedExcess = zeroFloor(modifiedLimitIncome.minus(pre2018));
  const modifiedPost2017Limit = roundDollar(modifiedExcess.times("0.8"));
  const reserve = roundDollar(modifiedExcess.times("0.2"));
  audit.record("Section172 Carryover Worksheet", "modified-limit-base", "Modified income before172,199A and250", modifiedLimitIncome,
    "Canonical refiguring under172(b)(2) and Reg1.172-5(a)(2)(ii); the percentage limit and reserve share this modified basis",
    { "Actual return limit base": income, "Modified post2017 limit": modifiedPost2017Limit, "Modified statutory reserve": reserve });
  const contexts = new Map<string, NonNullable<NetOperatingLossContext["carryoverContexts"]>[number]>();
  for (const item of context.carryoverContexts) {
    if (contexts.has(item.sourceId)) throw new Error("NOL modified-income contexts contain a duplicate source");
    contexts.set(item.sourceId, item);
  }
  const active = vintages.filter(row => available(row).gt(0));
  if (contexts.size !== active.length || active.some(row => !contexts.has(row.sourceId))) {
    throw new Error("NOL requires one actual modified-income context for each available vintage");
  }
  let precedingPre2018 = d("0");
  let precedingPost2017 = d("0");
  for (const row of vintages) {
    const item = contexts.get(row.sourceId);
    let absorbed = d("0");
    if (item) {
      const retained = contextAmount(item.priorNolDeductions, "earlier NOL deductions");
      const earlierModified = precedingPre2018.plus(Decimal.min(precedingPost2017, modifiedPost2017Limit));
      if (!earlierModified.eq(retained)) throw new Error("NOL modified-income context must retain the recomputed earlier permitted deductions");
      row.earlierModifiedNolDeductions = earlierModified;
      const modified = contextAmount(item.modifiedTaxableIncomeBeforeTwentyPercentReduction, "modified taxable income");
      absorbed = Decimal.min(available(row), zeroFloor(modified.minus(reserve)));
      audit.record("Section172 Carryover Worksheet", `${row.sourceId}:absorbed`, "Current modified-income absorption", absorbed,
        "Smaller of available source carry or positive(modified taxable income minus172(b)(2)(C)20percent reserve)",
        { "Modified income": modified, "Earlier NOL deductions": retained, "Statutory reserve": reserve, "Deduction claimed": row.deduction ?? d("0") });
    }
    const unused = available(row).minus(absorbed);
    const expiresAfterYear = row.lossTaxYear < 2018 && taxYear === row.lossTaxYear + 20;
    row.absorbed = absorbed;
    row.expired = row.expiredBeforeYear.plus(expiresAfterYear ? unused : d("0"));
    row.remainingCarryforward = expiresAfterYear ? d("0") : unused;
    if (!sum(row.absorbed, row.expired, row.remainingCarryforward).eq(row.openingCarryforward)) throw new Error("NOL closing source balance does not conserve opening carry");
    if (row.jointPool) row.jointPool = calculateJointNolComponents(row).jointPool;
    if (row.lossTaxYear < 2018) precedingPre2018 = precedingPre2018.plus(available(row));
    else precedingPost2017 = precedingPost2017.plus(available(row));
  }
  return { ...claim, calculationComplete: true, absorbed: sum(...vintages.map(row => row.absorbed ?? d("0"))),
    expired: sum(...vintages.map(row => row.expired ?? d("0"))), carryforward: sum(...vintages.map(row => row.remainingCarryforward ?? d("0"))), lines: audit.getLines() };
}

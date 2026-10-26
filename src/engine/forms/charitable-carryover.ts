/** Actual prior charitable categories. Spec: spec/federal/charitable-carryover-sources.yaml */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { CharitableCategory, CharitableContributionWorksheetInput } from "./charitable-contribution-worksheet.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { validateCharitableCarryoverSources, type CharitableCarryoverBalance } from "./charitable-carryover-source-validation.js";
import { allocateCharitablePrivateMedia } from "./charitable-private-media.js";
const ZERO = d("0");
type Medium = "cash" | "noncash";
export type { CharitableCarryoverBalance } from "./charitable-carryover-source-validation.js";
export interface CharitableCarryoverDetail {
  sourceId: string; taxYear: number; category: CharitableCategory; medium: Medium;
  amountAvailable: Decimal; treatedAsPaid: Decimal; amountUsed: Decimal; amountExpired: Decimal; amountRemaining: Decimal;
}
export interface CharitableCarryoverResult {
  currentCash: Decimal; currentNoncash: Decimal; priorDeduction: Decimal; priorCashDeduction: Decimal; priorNoncashDeduction: Decimal;
  priorTreatedAsPaid: Decimal; totalDeduction: Decimal; detail: CharitableCarryoverDetail[];
  carryforwards: CharitableCarryoverBalance[]; expired: Decimal; lines: CalculatedLine[];
}
/** Current amounts already reflect actual qualification and valuation, not prior contributions. */
export function calculateCharitableCarryover(input: TaxYearInput, context: {
  contributionBase: Decimal; current: CharitableContributionWorksheetInput["amounts"]; itemizes: boolean;
  /** Internal source-validated single-vintage NOL comparison, never a return input. */
  priorTreatmentLimit?: Decimal;
}): CharitableCarryoverResult {
  const records = validateCharitableCarryoverSources(input).map(row => ({ ...row, used: ZERO }));
  if (input.taxpayer.taxYear !== 2025) throw new Error("Charitable carryover 2026 floor/nonitemizer transition requires its separate source method");
  if (!context.contributionBase.isFinite() || Object.values(context.current).some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Current charitable amounts and contribution base must be finite with nonnegative contributions");
  }
  if (context.priorTreatmentLimit !== undefined && (records.length > 1 || !Decimal.isDecimal(context.priorTreatmentLimit)
    || !context.priorTreatmentLimit.isFinite() || context.priorTreatmentLimit.lt(0)
    || Object.values(context.current).some(value => !value.isZero()))) {
    throw new Error("Prior charitable comparison requires one original vintage, no current gifts and a nonnegative internal limit");
  }
  const taxYear = input.taxpayer.taxYear;
  const base = zeroFloor(context.contributionBase), fifty = base.times("0.50"), thirty = base.times("0.30"), twenty = base.times("0.20");
  const raw = context.current;
  const consume = (category: CharitableCategory, capacity: Decimal): Decimal => {
    let remaining = context.priorTreatmentLimit === undefined ? zeroFloor(capacity)
      : Decimal.min(zeroFloor(capacity), context.priorTreatmentLimit), used = ZERO;
    const eligible = records.filter(record => record.category === category && record.taxYear + 5 >= taxYear);
    // Source validation permits one row per actual year/category/medium. The
    // shared B cap applies to a year's group before FIFO advances to another year.
    for (const year of new Set(eligible.map(record => record.taxYear))) {
      const group = eligible.filter(record => record.taxYear === year);
      const groupUse = Decimal.min(sum(...group.map(row => row.amount)), remaining);
      const allocation = allocateCharitablePrivateMedia(
        sum(...group.filter(row => row.medium === "cash").map(row => row.amount)),
        sum(...group.filter(row => row.medium === "noncash").map(row => row.amount)), groupUse);
      group.forEach(row => { row.used = allocation[row.medium]; });
      remaining = remaining.minus(groupUse); used = used.plus(groupUse);
    }
    return used;
  };
  // Historical 2025 section170(G)(ii)/(iii): current G then G carry retain
  // their own 60% category; their aggregate allowance reduces A's capacity.
  // The amended 2026 G/A coordination has a separate effective-year method.
  const g = Decimal.min(raw.cashPublic, base.times("0.60"));
  const priorG = consume("cash_60", base.times("0.60").minus(g));
  const a = Decimal.min(raw.noncashPublic, zeroFloor(fifty.minus(g).minus(priorG)));
  const currentCForCarryCapacity = Decimal.min(raw.capitalGainPublic, thirty);
  const priorA = consume("noncash_50", fifty.minus(g).minus(priorG).minus(a).minus(currentCForCarryCapacity));
  const priorC = consume("capital_gain_30", Decimal.min(thirty.minus(currentCForCarryCapacity), fifty.minus(g).minus(priorG).minus(a).minus(priorA).minus(currentCForCarryCapacity)));
  // Section170(B)'s aggregate ceiling retains actual current public capital
  // contributions before C's30% cap, including when B is an older carry.
  const bCapacity = Decimal.min(thirty,
    zeroFloor(fifty.minus(raw.cashPublic).minus(raw.noncashPublic).minus(raw.capitalGainPublic).minus(priorG).minus(priorA).minus(priorC)));
  const b = Decimal.min(raw.cashPrivate.plus(raw.noncashPrivate), bCapacity);
  const c = Decimal.min(raw.capitalGainPublic, zeroFloor(thirty.minus(priorC)), zeroFloor(fifty.minus(g).minus(priorG).minus(a).minus(priorA).minus(b).minus(priorC)));
  const priorB = consume("other_30", bCapacity.minus(b));
  const dCapacity = Decimal.min(twenty, zeroFloor(thirty.minus(c).minus(priorC)), zeroFloor(thirty.minus(b).minus(priorB)), zeroFloor(fifty.minus(g).minus(priorG).minus(a).minus(priorA).minus(b).minus(priorB).minus(c).minus(priorC)));
  const privateCapital = Decimal.min(raw.capitalGainPrivate, dCapacity);
  consume("capital_gain_20", dCapacity.minus(privateCapital));
  const privateCash = allocateCharitablePrivateMedia(raw.cashPrivate, raw.noncashPrivate, b).cash;
  const currentCash = g.plus(privateCash), currentNoncash = sum(a, c, privateCapital, b.minus(privateCash));
  const detail = records.map(row => {
    const remainder = row.amount.minus(row.used), expires = row.taxYear + 5 <= taxYear;
    return { sourceId: row.sourceId, taxYear: row.taxYear, category: row.category, medium: row.medium, amountAvailable: row.amount,
      treatedAsPaid: row.used, amountUsed: context.itemizes ? row.used : ZERO, amountExpired: expires ? remainder : ZERO, amountRemaining: expires ? ZERO : remainder };
  });
  const carryforwards: CharitableCarryoverBalance[] = detail.filter(row => row.amountRemaining.gt(0)).map(row => ({ sourceId: row.sourceId, taxYear: row.taxYear, category: row.category, medium: row.medium, amount: row.amountRemaining }));
  const newAmounts: [CharitableCategory, Medium, Decimal][] = [
    ["cash_60", "cash", raw.cashPublic.minus(g)], ["noncash_50", "noncash", raw.noncashPublic.minus(a)],
    ["capital_gain_30", "noncash", raw.capitalGainPublic.minus(c)], ["other_30", "cash", raw.cashPrivate.minus(privateCash)],
    ["other_30", "noncash", raw.noncashPrivate.minus(b.minus(privateCash))], ["capital_gain_20", "noncash", raw.capitalGainPrivate.minus(privateCapital)],
  ];
  newAmounts.filter(([, , value]) => value.gt(0)).forEach(([category, medium, value]) => carryforwards.push({ sourceId: `current-${category}-${medium}`, taxYear, category, medium, amount: value }));
  const priorCashDeduction = sum(...detail.filter(row => row.medium === "cash").map(row => row.amountUsed));
  const priorNoncashDeduction = sum(...detail.filter(row => row.medium === "noncash").map(row => row.amountUsed));
  const priorDeduction = priorCashDeduction.plus(priorNoncashDeduction), priorTreatedAsPaid = sum(...detail.map(row => row.treatedAsPaid));
  const audit = new AuditTrail();
  if (raw.cashPrivate.plus(raw.noncashPrivate).gt(0) || records.some(row => row.category === "other_30")) {
    audit.record("Charitable Carryover", "other-capacity", "Shared current and prior other-contribution ceiling", bCapacity,
      "Section170(B): current public capital property remains unreduced by C's30% cap; current B precedes prior B", {
        "Actual current public capital property": raw.capitalGainPublic, "Current B used": b, "Prior B treated as paid": priorB,
      });
  }
  detail.forEach((row, index) => audit.record("Charitable Carryover", `prior-${index+1}`, "Actual prior charitable source reconciliation", row.amountUsed,
    "Original category and year; current-category priority, FIFO, fifth-year expiry and standard-year absorption", {
      opening: row.amountAvailable, treatedAsPaid: row.treatedAsPaid, expired: row.amountExpired, remaining: row.amountRemaining,
    }));
  const totalDeduction = context.itemizes ? sum(currentCash, currentNoncash, priorDeduction) : ZERO;
  audit.record("Charitable Carryover", "total", "Actual current and prior deduction before physical reporting", totalDeduction,
    "Current cash + current noncash + actual prior deduction; a standard year retains only carry absorption");
  return { currentCash: context.itemizes ? currentCash : ZERO, currentNoncash: context.itemizes ? currentNoncash : ZERO,
    priorDeduction, priorCashDeduction, priorNoncashDeduction, priorTreatedAsPaid, totalDeduction, detail,
    carryforwards, expired: sum(...detail.map(row => row.amountExpired)), lines: audit.getLines() };
}

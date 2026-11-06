/** Year-specific current-contribution limits. Spec: spec/federal/charitable-contribution-worksheet.yaml */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { allocateCharitablePrivateMedia } from "./charitable-private-media.js";
export type CharitableCategory = "cash_60" | "noncash_50" | "capital_gain_30" | "other_30" | "capital_gain_20";
export interface CharitableContributionWorksheetInput {
  taxYear: number;
  contributionBase: Decimal;
  amounts: { cashPublic: Decimal; noncashPublic: Decimal; capitalGainPublic: Decimal; cashPrivate: Decimal; noncashPrivate: Decimal; capitalGainPrivate: Decimal };
}
export interface CharitableContributionWorksheetResult {
  allowedBeforeFloor: Record<CharitableCategory, Decimal>;
  allowedAfterFloor: Record<CharitableCategory, Decimal>;
  floorDisallowed: Decimal;
  exactCashDeduction: Decimal;
  exactNonCashDeduction: Decimal;
  cashDeduction: Decimal;
  nonCashDeduction: Decimal;
  totalDeduction: Decimal;
  carryforwards: { taxYear: number; category: CharitableCategory; medium?: "cash" | "noncash"; amount: Decimal }[];
  lines: CalculatedLine[];
}
export function calculateCharitableContributionWorksheet(input: CharitableContributionWorksheetInput): CharitableContributionWorksheetResult {
  if (![2025, 2026].includes(input.taxYear)) throw new Error("Unsupported charitable worksheet tax year");
  if (!input.contributionBase.isFinite()) throw new Error("Contribution base must be finite");
  if (Object.values(input.amounts).some(value => !value.isFinite() || value.lt(0))) throw new Error("Contributions must be finite and nonnegative");
  const audit = new AuditTrail();
  const base = zeroFloor(input.contributionBase);
  const { cashPublic, noncashPublic, capitalGainPublic, cashPrivate, noncashPrivate, capitalGainPrivate } = input.amounts;
  const fifty = base.times("0.50");
  const thirty = base.times("0.30");
  const twenty = base.times("0.20");
  const g = min(cashPublic, base.times("0.60"));
  const a = min(noncashPublic, zeroFloor(fifty.minus(g)));
  const reserveC = min(capitalGainPublic, zeroFloor(fifty.minus(g).minus(a)));
  const cashAdjustment = min(g, base.times("0.10"));
  const sharedOtherCapacity = Decimal.min(thirty, zeroFloor(fifty.minus(g).minus(a).minus(reserveC).plus(cashAdjustment)));
  const b = input.taxYear === 2025
    ? Decimal.min(cashPrivate.plus(noncashPrivate), thirty, zeroFloor(fifty.minus(cashPublic).minus(noncashPublic).minus(capitalGainPublic)))
    : Decimal.min(cashPrivate.plus(noncashPrivate), sharedOtherCapacity);
  const c = input.taxYear === 2025
    ? Decimal.min(capitalGainPublic, thirty, zeroFloor(fifty.minus(cashPublic).minus(noncashPublic)))
    : Decimal.min(capitalGainPublic, thirty, zeroFloor(fifty.minus(g).minus(a).minus(b)));
  // D adds restrictions to the aggregate B ceiling; it cannot reuse consumed B headroom.
  const remainingOtherCapacity = zeroFloor(sharedOtherCapacity.minus(b));
  const privateCapital = Decimal.min(capitalGainPrivate, input.taxYear === 2026 ? remainingOtherCapacity : capitalGainPrivate, twenty, zeroFloor(thirty.minus(c)), zeroFloor(thirty.minus(b)), zeroFloor(fifty.minus(g).minus(a).minus(b).minus(c).plus(input.taxYear === 2026 ? cashAdjustment : 0)));
  const raw: Record<CharitableCategory, Decimal> = { cash_60: cashPublic, noncash_50: noncashPublic, capital_gain_30: capitalGainPublic, other_30: cashPrivate.plus(noncashPrivate), capital_gain_20: capitalGainPrivate };
  const allowedBeforeFloor = { cash_60: g, noncash_50: a, capital_gain_30: c, other_30: b, capital_gain_20: privateCapital };
  const allowedAfterFloor = { ...allowedBeforeFloor };
  const categories = Object.keys(raw) as CharitableCategory[];
  const hasPercentageExcess = categories.some(category => raw[category].gt(allowedBeforeFloor[category]));
  let remainingFloor = input.taxYear === 2026 ? base.times("0.005") : d("0");
  for (const category of ["capital_gain_20", "capital_gain_30", "other_30", "noncash_50", "cash_60"] as const) {
    const disallowed = min(allowedBeforeFloor[category], remainingFloor);
    allowedAfterFloor[category] = allowedBeforeFloor[category].minus(disallowed);
    remainingFloor = remainingFloor.minus(disallowed);
    audit.record("Charitable WS", category, "Contribution after applicable limits", allowedAfterFloor[category], input.taxYear === 2026 ? "Percentage limit followed by floor in D,C,B,A,G order" : "Final2025 Pub526 Worksheet2 category limit; no2026floor", { offered: raw[category], beforeFloor: allowedBeforeFloor[category], floorDisallowed: disallowed,
      ...(input.taxYear === 2026 && category === "capital_gain_20" ? { sharedOtherCapacity, otherGiftsAllowedFirst: b, remainingOtherCapacity } : {}) });
  }
  const floorDisallowed = sum(...Object.values(allowedBeforeFloor)).minus(sum(...Object.values(allowedAfterFloor)));
  const privateAllowed = allocateCharitablePrivateMedia(cashPrivate, noncashPrivate, allowedAfterFloor.other_30);
  const exactCashDeduction = allowedAfterFloor.cash_60.plus(privateAllowed.cash);
  const exactNonCashDeduction = sum(allowedAfterFloor.noncash_50, allowedAfterFloor.capital_gain_30, allowedAfterFloor.capital_gain_20, privateAllowed.noncash);
  const cashDeduction = roundDollar(exactCashDeduction);
  const nonCashDeduction = roundDollar(exactNonCashDeduction);
  const totalDeduction = cashDeduction.plus(nonCashDeduction);
  const carryforwards = categories.flatMap<CharitableContributionWorksheetResult["carryforwards"][number]>(category => {
    const percentageExcess = raw[category].minus(allowedBeforeFloor[category]);
    const eligibleFloor = hasPercentageExcess ? allowedBeforeFloor[category].minus(allowedAfterFloor[category]) : d("0");
    const amount = percentageExcess.plus(eligibleFloor);
    if (category === "other_30") {
      const carry = allocateCharitablePrivateMedia(cashPrivate, noncashPrivate, amount);
      return (["cash", "noncash"] as const).flatMap(medium => carry[medium].gt(0)
        ? [{ taxYear: input.taxYear, category, medium, amount: carry[medium] }] : []);
    }
    return amount.gt(0) ? [{ taxYear: input.taxYear, category, amount }] : [];
  });
  audit.record("Charitable WS", "total", "Charitable deduction after floor", totalDeduction, "Sum allowed categories after percentage limits and 0.5% floor");
  return { allowedBeforeFloor, allowedAfterFloor, floorDisallowed, exactCashDeduction, exactNonCashDeduction,
    cashDeduction, nonCashDeduction, totalDeduction, carryforwards, lines: audit.getLines() };
}

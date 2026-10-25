/** 2026 current-contribution limits. Spec: spec/federal/charitable-contribution-worksheet.yaml */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";
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
  cashDeduction: Decimal;
  nonCashDeduction: Decimal;
  totalDeduction: Decimal;
  carryforwards: { taxYear: number; category: CharitableCategory; amount: Decimal }[];
  lines: CalculatedLine[];
}
export function calculateCharitableContributionWorksheet(input: CharitableContributionWorksheetInput): CharitableContributionWorksheetResult {
  if (input.taxYear !== 2026) throw new Error("Unsupported charitable worksheet tax year");
  if (!input.contributionBase.isFinite()) throw new Error("Contribution base must be finite");
  if (Object.values(input.amounts).some(value => !value.isFinite() || value.lt(0))) throw new Error("Contributions must be finite and nonnegative");
  const audit = new AuditTrail();
  const base = zeroFloor(input.contributionBase);
  const { cashPublic, noncashPublic, capitalGainPublic, cashPrivate, noncashPrivate, capitalGainPrivate } = input.amounts;
  const fifty = roundDollar(base.times("0.50"));
  const thirty = roundDollar(base.times("0.30"));
  const twenty = roundDollar(base.times("0.20"));
  const g = min(cashPublic, roundDollar(base.times("0.60")));
  const a = min(noncashPublic, zeroFloor(fifty.minus(g)));
  const reserveC = min(capitalGainPublic, zeroFloor(fifty.minus(g).minus(a)));
  const cashAdjustment = min(g, roundDollar(base.times("0.10")));
  const b = Decimal.min(cashPrivate.plus(noncashPrivate), thirty, zeroFloor(fifty.minus(g).minus(a).minus(reserveC).plus(cashAdjustment)));
  const c = Decimal.min(capitalGainPublic, thirty, zeroFloor(fifty.minus(g).minus(a).minus(b)));
  const privateCapital = Decimal.min(capitalGainPrivate, twenty, zeroFloor(thirty.minus(c)), zeroFloor(thirty.minus(b)), zeroFloor(fifty.minus(g).minus(a).minus(b).minus(c).plus(cashAdjustment)));
  const raw: Record<CharitableCategory, Decimal> = { cash_60: cashPublic, noncash_50: noncashPublic, capital_gain_30: capitalGainPublic, other_30: cashPrivate.plus(noncashPrivate), capital_gain_20: capitalGainPrivate };
  const allowedBeforeFloor = { cash_60: g, noncash_50: a, capital_gain_30: c, other_30: b, capital_gain_20: privateCapital };
  const allowedAfterFloor = { ...allowedBeforeFloor };
  const categories = Object.keys(raw) as CharitableCategory[];
  const hasPercentageExcess = categories.some(category => raw[category].gt(allowedBeforeFloor[category]));
  let remainingFloor = roundDollar(base.times("0.005"));
  for (const category of ["capital_gain_20", "capital_gain_30", "other_30", "noncash_50", "cash_60"] as const) {
    const disallowed = min(allowedBeforeFloor[category], remainingFloor);
    allowedAfterFloor[category] = allowedBeforeFloor[category].minus(disallowed);
    remainingFloor = remainingFloor.minus(disallowed);
    audit.record("Charitable WS", category, "Contribution after percentage cap and 0.5% floor", allowedAfterFloor[category], "Percentage limit followed by floor in D,C,B,A,G order", { offered: raw[category], beforeFloor: allowedBeforeFloor[category], floorDisallowed: disallowed });
  }
  const floorDisallowed = sum(...Object.values(allowedBeforeFloor)).minus(sum(...Object.values(allowedAfterFloor)));
  const privateCashAllowed = min(cashPrivate, allowedAfterFloor.other_30);
  const cashDeduction = roundDollar(allowedAfterFloor.cash_60.plus(privateCashAllowed));
  const nonCashDeduction = roundDollar(sum(allowedAfterFloor.noncash_50, allowedAfterFloor.capital_gain_30, allowedAfterFloor.capital_gain_20, allowedAfterFloor.other_30.minus(privateCashAllowed)));
  const totalDeduction = cashDeduction.plus(nonCashDeduction);
  const carryforwards = categories.flatMap(category => {
    const percentageExcess = raw[category].minus(allowedBeforeFloor[category]);
    const eligibleFloor = hasPercentageExcess ? allowedBeforeFloor[category].minus(allowedAfterFloor[category]) : d("0");
    const amount = roundDollar(percentageExcess.plus(eligibleFloor));
    return amount.gt(0) ? [{ taxYear: input.taxYear, category, amount }] : [];
  });
  audit.record("Charitable WS", "total", "Charitable deduction after floor", totalDeduction, "Sum allowed categories after percentage limits and 0.5% floor");
  return { allowedBeforeFloor, allowedAfterFloor, floorDisallowed, cashDeduction, nonCashDeduction, totalDeduction, carryforwards, lines: audit.getLines() };
}

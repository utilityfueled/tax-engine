/** Exact source ratios; quotient approximations are display values only. */
import Decimal from "decimal.js";
import type { BondSourceRatio } from "@/engine/forms/savings-bond-reissue-sources.js";
import { roundEducationSourceAmounts } from "./annual-cash-qtp.js";

export function sumSavingsBondRatios(values: readonly BondSourceRatio[]): BondSourceRatio {
  const amounts = values.flatMap(value => [value.numerator, value.denominator]);
  if (amounts.some(value => !value.isFinite()) || values.some(value => value.denominator.lte(0)))
    throw new Error("Savings-bond reporting requires finite source ratios with positive denominators.");
  const digits = Math.max(1, ...amounts.map(value => value.precision(true) + value.decimalPlaces()));
  const D = Decimal.clone({ precision: Math.max(80, digits * (2 * values.length + 2) + 8) });
  let numerator = new D(0), denominator = new D(1);
  for (const value of values) {
    numerator = numerator.times(value.denominator).plus(new D(value.numerator).times(denominator));
    denominator = denominator.times(value.denominator);
  }
  return { numerator, denominator };
}
export function reportSavingsBondRatios(values: readonly BondSourceRatio[]): Decimal {
  return roundEducationSourceAmounts(values.map(value => ({ amount: new Decimal(0), ...value })));
}
/** Reduce only the display fraction; the retained originals remain untouched. */
export function displaySavingsBondRatio(value: BondSourceRatio): string {
  const exact = sumSavingsBondRatios([value]);
  const places = Math.max(exact.numerator.decimalPlaces(), exact.denominator.decimalPlaces());
  const scale = new Decimal(10).pow(places);
  let numerator = exact.numerator.times(scale), denominator = exact.denominator.times(scale);
  let a = numerator.abs(), b = denominator;
  while (!b.isZero()) { const remainder = a.mod(b); a = b; b = remainder; }
  if (!a.isZero()) { numerator = numerator.divToInt(a); denominator = denominator.divToInt(a); }
  return denominator.eq(1) ? numerator.toFixed() : `${numerator.toFixed()} / ${denominator.toFixed()} (exact)`;
}

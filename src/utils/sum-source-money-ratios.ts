import Decimal from 'decimal.js';

/** Internal original-source ratio, not a taxpayer allocation or rounded amount. */
export interface SourceMoneyRatio {
  amount: Decimal;
  numerator?: Decimal;
  denominator?: Decimal;
}

/** Add the exact source products at a common denominator before one division.
 * Monthly repeating quotients are not the annual premium source. Finite annual
 * results retain all source digits; repeating results use enough local digits
 * to preserve the rational half-dollar boundary. No shared context changes. */
export function sumSourceMoneyRatios(values: readonly SourceMoneyRatio[]): Decimal {
  const amounts = values.flatMap(value => [value.amount, value.numerator ?? new Decimal(1), value.denominator ?? new Decimal(1)]);
  if (amounts.some(value => !Decimal.isDecimal(value) || !value.isFinite())
    || values.some(value => value.denominator?.lte(0))) {
    throw new Error('Source ratios require finite amounts and positive denominators.');
  }
  const digits = Math.max(1, ...amounts.map(value => value.precision(true) + value.decimalPlaces()));
  const D = Decimal.clone({ precision: Math.max(80, digits * (3 * values.length + 3) + 16) });
  let numerator = new D(0);
  let denominator = new D(1);
  for (const value of values) {
    const nextDenominator = new D(value.denominator?.toFixed() ?? '1');
    const nextNumerator = new D(value.amount.toFixed()).times(value.numerator?.toFixed() ?? '1');
    numerator = numerator.times(nextDenominator).plus(nextNumerator.times(denominator));
    denominator = denominator.times(nextDenominator);
  }
  if (numerator.isZero()) return new Decimal(0);
  const scale = new D(10).pow(Math.max(numerator.decimalPlaces(), denominator.decimalPlaces()));
  numerator = numerator.times(scale);
  denominator = denominator.times(scale);
  let divisor = numerator.abs();
  let remainder = denominator;
  while (!remainder.isZero()) {
    const next = divisor.mod(remainder);
    divisor = remainder;
    remainder = next;
  }
  numerator = numerator.divToInt(divisor);
  denominator = denominator.divToInt(divisor);
  // A non-half rational is at least 1/(2*denominator) away from a half.
  // Retain more than numerator+denominator digits, including source tails.
  const quotientDigits = Math.max(40, numerator.precision(true) + denominator.precision(true) + 4);
  return new Decimal(numerator.div(denominator).toSignificantDigits(quotientDigits).toFixed());
}

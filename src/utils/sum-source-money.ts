import Decimal from 'decimal.js';

/** Exact finite source sums, including signed differences, before form rounding.
 * Precision covers every source integer/fraction digit and possible sum carry;
 * it is local to this operation and never changes the shared Decimal context. */
export function sumSourceMoney(...values: Decimal[]): Decimal {
  return sumSourceMoneyValues(values);
}

/** Array entry point for source ledgers that can exceed JavaScript's argument limit. */
export function sumSourceMoneyValues(values: readonly Decimal[]): Decimal {
  let integerDigits = 1;
  let fractionalDigits = 0;
  for (const value of values) {
    if (!value.isFinite()) throw new Error('Source money must be finite before exact aggregation.');
    const places = value.decimalPlaces();
    integerDigits = Math.max(integerDigits, value.precision(true) - places);
    fractionalDigits = Math.max(fractionalDigits, places);
  }
  const SourceDecimal = Decimal.clone({ precision: Math.max(40, integerDigits + fractionalDigits + String(values.length).length + 2) });
  const total = values.reduce((current, value) => current.plus(value.toFixed()), new SourceDecimal(0));
  // Construction preserves every digit without arithmetic rounding. Return the
  // shared value type so operation-local constructors do not escape in results.
  return new Decimal(total.toFixed());
}

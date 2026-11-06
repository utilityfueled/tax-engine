import Decimal from 'decimal.js';

/** Exact finite source sums, including signed differences, before form rounding.
 * Precision covers every source integer/fraction digit and possible sum carry;
 * it is local to this operation and never changes the shared Decimal context. */
export function sumSourceMoney(...values: Decimal[]): Decimal {
  if (values.some(value => !value.isFinite())) throw new Error('Source money must be finite before exact aggregation.');
  const integerDigits = Math.max(1, ...values.map(value => value.precision(true) - value.decimalPlaces()));
  const fractionalDigits = Math.max(0, ...values.map(value => value.decimalPlaces()));
  const SourceDecimal = Decimal.clone({ precision: Math.max(40, integerDigits + fractionalDigits + String(values.length).length + 2) });
  const total = values.reduce((current, value) => current.plus(value.toFixed()), new SourceDecimal(0));
  // Construction preserves every digit without arithmetic rounding. Return the
  // shared value type so operation-local constructors do not escape in results.
  return new Decimal(total.toFixed());
}

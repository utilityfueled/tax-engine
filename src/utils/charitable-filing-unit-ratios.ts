import Decimal from 'decimal.js';
import type { CharitableSourceRatio } from '@/engine/forms/charitable-filing-unit-history.js';

/** Aggregate the exact ownership sources before the ordinary engine projection. */
export function charitableFilingUnitAmount(values: readonly CharitableSourceRatio[]): Decimal {
  const operands = values.flatMap(value => [value.numerator, value.denominator]);
  if (operands.some(value => !/^\d+(\.\d+)?$/.test(value) || !new Decimal(value).isFinite())
    || values.some(value => new Decimal(value.denominator).lte(0))) throw new Error('Invalid internal charitable ownership ratio');
  const digits = Math.max(1, ...operands.map(value => value.replace('.', '').length));
  const D = Decimal.clone({ precision: Math.max(80, digits * (2 * values.length + 2) + 16) });
  let numerator = new D(0), denominator = new D(1);
  for (const value of values) {
    numerator = numerator.times(value.denominator).plus(new D(value.numerator).times(denominator));
    denominator = denominator.times(value.denominator);
  }
  // This is the existing calculation context, not a tax reporting round. Exact
  // fractions remain alongside the projection for source review and future use.
  return new Decimal(numerator.toFixed()).div(denominator.toFixed());
}

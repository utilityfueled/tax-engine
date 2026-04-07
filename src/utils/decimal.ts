/**
 * Decimal utilities for tax calculations.
 * All monetary math goes through these helpers to ensure precision.
 */

import Decimal from "decimal.js";

// Configure Decimal.js for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Parse a string or number to Decimal, defaulting to 0 */
export function d(value: string | number | Decimal | undefined | null): Decimal {
  if (value === undefined || value === null || value === "") return new Decimal(0);
  return new Decimal(value);
}

/** Round to nearest dollar (IRS standard rounding) */
export function roundDollar(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Sum an array of Decimals */
export function sum(...values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0));
}

/** Sum an array of decimal strings */
export function sumStrings(...values: (string | undefined)[]): Decimal {
  return values.reduce((acc, v) => acc.plus(d(v)), new Decimal(0));
}

/** Return the greater of two Decimals */
export function max(a: Decimal, b: Decimal): Decimal {
  return a.greaterThan(b) ? a : b;
}

/** Return the lesser of two Decimals */
export function min(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

/** Clamp a value between min and max */
export function clamp(value: Decimal, lower: Decimal, upper: Decimal): Decimal {
  return max(lower, min(value, upper));
}

/** Return 0 if negative, otherwise the value */
export function zeroFloor(value: Decimal): Decimal {
  return max(value, new Decimal(0));
}

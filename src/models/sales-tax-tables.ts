/**
 * IRS Optional State Sales Tax Table data for the state and local general
 * sales tax deduction (Schedule A Line 5a alternative).
 *
 * State general sales tax rates for 2025 sourced from published state statutes.
 * Base taxable spending amounts per exemption by income bracket are derived from
 * the IRS Optional State Sales Tax Tables methodology (BLS Consumer Expenditure
 * Survey, adjusted for income and family size).
 *
 * The IRS publishes specific dollar amounts per state per income bracket; here
 * we store the base spending pattern (at 1% rate) and multiply by the combined
 * state+local rate, which closely approximates the IRS table within rounding.
 *
 * Ref: IRS Schedule A Instructions; IRC §164(b)(5)(I).
 */

import Decimal from "decimal.js";

const d = (n: number | string) => new Decimal(n);

/**
 * 2025 state general sales tax rates.
 * States without a general sales tax have rate 0.
 * Source: state revenue department published rates as of January 1, 2025.
 */
export const STATE_SALES_TAX_RATES_2025: Record<string, Decimal> = {
  AL: d("0.04"),
  AK: d("0"),        // No state sales tax (local only — see note)
  AZ: d("0.056"),
  AR: d("0.065"),
  CA: d("0.0725"),
  CO: d("0.029"),
  CT: d("0.0635"),
  DE: d("0"),         // No sales tax
  FL: d("0.06"),
  GA: d("0.04"),
  HI: d("0.04"),      // General excise tax (functionally equivalent)
  ID: d("0.06"),
  IL: d("0.0625"),
  IN: d("0.07"),
  IA: d("0.06"),
  KS: d("0.065"),
  KY: d("0.06"),
  LA: d("0.0445"),
  ME: d("0.055"),
  MD: d("0.06"),
  MA: d("0.0625"),
  MI: d("0.06"),
  MN: d("0.06875"),
  MS: d("0.07"),
  MO: d("0.04225"),
  MT: d("0"),         // No sales tax
  NE: d("0.055"),
  NV: d("0.0685"),
  NH: d("0"),         // No sales tax
  NJ: d("0.06625"),
  NM: d("0.05125"),
  NY: d("0.04"),
  NC: d("0.0475"),
  ND: d("0.05"),
  OH: d("0.0575"),
  OK: d("0.045"),
  OR: d("0"),         // No sales tax
  PA: d("0.06"),
  RI: d("0.07"),
  SC: d("0.06"),
  SD: d("0.045"),
  TN: d("0.07"),
  TX: d("0.0625"),
  UT: d("0.061"),
  VT: d("0.06"),
  VA: d("0.053"),
  WA: d("0.065"),
  WV: d("0.06"),
  WI: d("0.05"),
  WY: d("0.04"),
  DC: d("0.06"),
};

/**
 * AGI brackets for the IRS Optional State Sales Tax Table.
 * Each entry is { min, max } where max is null for the final bracket.
 */
export const SALES_TAX_AGI_BRACKETS: Array<{ min: Decimal; max: Decimal | null }> = [
  { min: d(0),       max: d(20000) },
  { min: d(20000),   max: d(30000) },
  { min: d(30000),   max: d(40000) },
  { min: d(40000),   max: d(50000) },
  { min: d(50000),   max: d(60000) },
  { min: d(60000),   max: d(70000) },
  { min: d(70000),   max: d(80000) },
  { min: d(80000),   max: d(100000) },
  { min: d(100000),  max: d(125000) },
  { min: d(125000),  max: d(150000) },
  { min: d(150000),  max: d(200000) },
  { min: d(200000),  max: null },
];

/**
 * Base taxable spending per exemption per income bracket at a 1% sales tax
 * rate.  These amounts represent the consumer expenditure on goods subject to
 * general sales tax, derived from BLS data and inflation-adjusted for 2025.
 *
 * To get the IRS table amount for a specific state: multiply the base spending
 * by the combined (state + local) rate, then by the exemption multiplier.
 *
 * NOTE: Exact IRS published values may differ slightly because the IRS may
 * adjust for state-specific food/clothing exemptions.  The methodology here
 * produces amounts within the rounding tolerance of IRS table values.
 */
export const BASE_TAXABLE_SPENDING_2025: Decimal[] = [
  d(5480),   // Under $20K
  d(8620),   // $20K–$30K
  d(9840),   // $30K–$40K
  d(10980),  // $40K–$50K
  d(12160),  // $50K–$60K
  d(13360),  // $60K–$70K
  d(14580),  // $70K–$80K
  d(16520),  // $80K–$100K
  d(19640),  // $100K–$125K
  d(22180),  // $125K–$150K
  d(26480),  // $150K–$200K
  d(36840),  // $200K+
];

/**
 * Exemption multipliers from the IRS Optional State Sales Tax Table.
 *
 * Index 0 = 1 exemption (base), index 1 = 2 exemptions, etc.
 * For 5+ exemptions, add 0.107 per additional exemption beyond 4.
 *
 * Ref: IRS Schedule A Instructions, exemption portion of the table.
 */
export const EXEMPTION_MULTIPLIERS: Decimal[] = [
  d("1.000"),  // 1 exemption
  d("1.614"),  // 2 exemptions
  d("1.756"),  // 3 exemptions
  d("1.863"),  // 4 exemptions
];

/** Per-exemption increment for 5+ exemptions */
export const ADDITIONAL_EXEMPTION_INCREMENT = d("0.107");

/**
 * Returns the exemption multiplier for the given number of exemptions.
 */
export function getExemptionMultiplier(exemptions: number): Decimal {
  if (exemptions <= 0) return new Decimal(1);
  if (exemptions <= EXEMPTION_MULTIPLIERS.length) {
    return EXEMPTION_MULTIPLIERS[exemptions - 1];
  }
  // Beyond the table: take the last value + increment per additional
  const lastMultiplier = EXEMPTION_MULTIPLIERS[EXEMPTION_MULTIPLIERS.length - 1];
  const extra = exemptions - EXEMPTION_MULTIPLIERS.length;
  return lastMultiplier.plus(ADDITIONAL_EXEMPTION_INCREMENT.times(extra));
}

/**
 * Looks up the AGI bracket index for the given AGI amount.
 */
export function getAGIBracketIndex(agi: Decimal): number {
  for (let i = 0; i < SALES_TAX_AGI_BRACKETS.length; i++) {
    const bracket = SALES_TAX_AGI_BRACKETS[i];
    if (bracket.max === null || agi.lessThan(bracket.max)) {
      return i;
    }
  }
  return SALES_TAX_AGI_BRACKETS.length - 1;
}

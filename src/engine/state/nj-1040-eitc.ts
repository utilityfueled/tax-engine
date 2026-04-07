/**
 * New Jersey NJ-1040 Earned Income Tax Credit (NJEITC) computation.
 * Spec: spec/state/nj-1040-eitc.yaml
 *
 * The NJEITC is 40% of the federal EITC for tax year 2025. Part-year residents
 * prorate their federal EITC by months of NJ residency before applying the
 * 40% rate.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

/** NJ EITC percentage by tax year */
const NJ_EITC_RATES: Record<number, Decimal> = {
  2025: new Decimal("0.40"),
  2024: new Decimal("0.40"),
  2023: new Decimal("0.40"),
  2022: new Decimal("0.40"),
  2021: new Decimal("0.40"),
  2020: new Decimal("0.40"),
  2019: new Decimal("0.39"),
  2018: new Decimal("0.37"),
};

const MONTHS_IN_YEAR = new Decimal(12);
const NJ_CHILDLESS_AGE18_EXCEPTION_AMOUNTS: Record<number, Decimal> = {
  2025: new Decimal(260),
};

export interface NJ1040EITCInput {
  taxYear: number;
  /** Federal EITC amount from Form 1040 Line 27 */
  federalEITC: Decimal | string | number;
  /** Number of months the taxpayer was a NJ resident (15+ days counts as a month) */
  monthsOfResidency: number;
  /** Interview-confirmed eligibility for NJ's childless age-18 exception */
  qualifiesForChildlessAge18Exception?: boolean;
  /** Number of qualifying EIC children on the return */
  qualifyingEICChildrenCount?: number;
  /** True when the taxpayer or spouse was at least age 18 on Dec 31 */
  hasAdult18OrOlderTaxpayer?: boolean;
}

export interface NJ1040EITCResult {
  /** Federal EITC amount (input) */
  federalEITC: Decimal;
  /** Months of NJ residency (clamped 0-12) */
  monthsOfResidency: number;
  /** Federal EITC prorated for part-year residency */
  proratedFederalEITC: Decimal;
  /** NJ EITC rate for the tax year */
  njEITCRate: Decimal;
  /** NJ EITC amount (rounded to nearest dollar) */
  njEITC: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040EITC(input: NJ1040EITCInput): NJ1040EITCResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 EITC rules");

  const rate = NJ_EITC_RATES[input.taxYear];
  if (!rate) {
    throw new Error(`NJ EITC rate not available for tax year ${input.taxYear}`);
  }

  // Federal EITC (floored at zero — cannot be negative)
  const federalEITC = zeroFloor(d(input.federalEITC));

  audit.record(
    "NJ-1040",
    "federal-eitc",
    "Federal EITC amount",
    federalEITC,
    "Federal Earned Income Tax Credit from Form 1040 Line 27"
  );

  // Clamp months to 0-12
  const months = Math.max(0, Math.min(12, input.monthsOfResidency));

  const qualifiesForChildlessAge18Exception =
    input.qualifiesForChildlessAge18Exception === true &&
    (input.qualifyingEICChildrenCount ?? 0) === 0 &&
    input.hasAdult18OrOlderTaxpayer === true &&
    federalEITC.equals(0);
  const childlessAge18ExceptionAmount =
    NJ_CHILDLESS_AGE18_EXCEPTION_AMOUNTS[input.taxYear] ?? new Decimal(0);

  // Prorate federal EITC for part-year residents
  const proratedFederalEITC = months === 12
    ? federalEITC
    : federalEITC.dividedBy(MONTHS_IN_YEAR).times(months);

  audit.record(
    "NJ-1040",
    "prorated-federal-eitc",
    "Prorated federal EITC for NJ residency",
    proratedFederalEITC,
    months === 12
      ? "Full-year resident — no proration"
      : `Federal EITC / 12 × ${months} months of NJ residency`,
    {
      "Federal EITC": federalEITC,
      "Months of residency": months.toString(),
    }
  );

  let njEITC: Decimal;

  if (qualifiesForChildlessAge18Exception) {
    const proratedChildlessAge18ExceptionAmount = months === 12
      ? childlessAge18ExceptionAmount
      : childlessAge18ExceptionAmount.dividedBy(MONTHS_IN_YEAR).times(months);

    audit.record(
      "NJ-1040",
      "childless-age-exception",
      "NJ childless age-18 EITC exception amount",
      proratedChildlessAge18ExceptionAmount,
      months === 12
        ? "Fixed $260 NJEITC amount for eligible childless age-18+ filer"
        : "$260 / 12 × months of NJ residency",
      {
        "Base exception amount": childlessAge18ExceptionAmount,
        "Months of residency": months.toString(),
      }
    );

    njEITC = roundDollar(proratedChildlessAge18ExceptionAmount);
  } else {
    njEITC = roundDollar(proratedFederalEITC.times(rate));
  }

  audit.record(
    "NJ-1040",
    "nj-eitc",
    "New Jersey Earned Income Tax Credit",
    njEITC,
    qualifiesForChildlessAge18Exception
      ? "Childless age-18 exception amount, rounded to nearest dollar"
      : `Prorated federal EITC × ${rate.times(100)}%, rounded to nearest dollar`,
    qualifiesForChildlessAge18Exception
      ? {
          "Childless age-18 exception amount": childlessAge18ExceptionAmount,
        }
      : {
          "Prorated federal EITC": proratedFederalEITC,
          "NJ EITC rate": rate.toString(),
        }
  );

  return {
    federalEITC,
    monthsOfResidency: months,
    proratedFederalEITC,
    njEITCRate: rate,
    njEITC,
    lines: audit.getLines(),
  };
}

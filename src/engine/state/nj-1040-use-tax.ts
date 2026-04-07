/**
 * New Jersey NJ-1040 Use Tax computation (Line 51).
 * Spec: spec/state/nj-1040-use-tax.yaml
 *
 * Computes NJ Use Tax on out-of-state purchases where NJ sales tax was not
 * collected. Taxpayers may use the safe harbor lookup table or report the
 * actual amount.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

/** Safe harbor use tax table bracket */
interface UseTaxBracket {
  lowerBound: Decimal;
  upperBound: Decimal | null; // null = no upper limit
  amount: Decimal;
}

/** Safe harbor use tax tables by year */
const NJ_USE_TAX_SAFE_HARBOR: Record<number, UseTaxBracket[]> = {
  2025: [
    { lowerBound: new Decimal(0), upperBound: new Decimal(15000), amount: new Decimal(0) },
    { lowerBound: new Decimal(15000), upperBound: new Decimal(25000), amount: new Decimal(8) },
    { lowerBound: new Decimal(25000), upperBound: new Decimal(35000), amount: new Decimal(17) },
    { lowerBound: new Decimal(35000), upperBound: new Decimal(50000), amount: new Decimal(29) },
    { lowerBound: new Decimal(50000), upperBound: new Decimal(75000), amount: new Decimal(48) },
    { lowerBound: new Decimal(75000), upperBound: new Decimal(100000), amount: new Decimal(68) },
    { lowerBound: new Decimal(100000), upperBound: new Decimal(150000), amount: new Decimal(103) },
    { lowerBound: new Decimal(150000), upperBound: new Decimal(200000), amount: new Decimal(137) },
    { lowerBound: new Decimal(200000), upperBound: null, amount: new Decimal(166) },
  ],
};

export interface NJ1040UseTaxInput {
  taxYear: number;
  /** NJ gross income (Line 29) — used for safe harbor table lookup */
  njGrossIncome: Decimal | string | number;
  /** Whether the taxpayer elects the safe harbor table */
  useSafeHarbor?: boolean;
  /** Actual use tax amount if not using safe harbor */
  actualUseTax?: Decimal | string | number;
}

export interface NJ1040UseTaxResult {
  useTax: Decimal;
  usedSafeHarbor: boolean;
  lines: CalculatedLine[];
}

/**
 * Look up the safe harbor use tax amount from the table.
 */
function lookupSafeHarbor(njGrossIncome: Decimal, brackets: UseTaxBracket[]): Decimal {
  for (const bracket of brackets) {
    if (bracket.upperBound === null) {
      // Last bracket — income >= lowerBound
      if (njGrossIncome.greaterThanOrEqualTo(bracket.lowerBound)) {
        return bracket.amount;
      }
    } else if (
      njGrossIncome.greaterThanOrEqualTo(bracket.lowerBound) &&
      njGrossIncome.lessThan(bracket.upperBound)
    ) {
      return bracket.amount;
    }
  }
  return new Decimal(0);
}

export function calculateNJ1040UseTax(input: NJ1040UseTaxInput): NJ1040UseTaxResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 use tax rules");
  const njGrossIncome = d(input.njGrossIncome);

  const table = NJ_USE_TAX_SAFE_HARBOR[input.taxYear];
  if (!table) {
    throw new Error(`NJ-1040 use tax safe harbor table not available for ${input.taxYear}`);
  }

  let useTax: Decimal;
  let usedSafeHarbor: boolean;

  if (input.useSafeHarbor) {
    useTax = lookupSafeHarbor(njGrossIncome, table);
    usedSafeHarbor = true;

    audit.record(
      "NJ-1040",
      "51",
      "Use Tax (safe harbor table)",
      useTax,
      "Safe harbor amount based on NJ gross income bracket",
      { "NJ Gross Income": njGrossIncome }
    );
  } else if (input.actualUseTax !== undefined) {
    useTax = zeroFloor(d(input.actualUseTax));
    usedSafeHarbor = false;

    audit.record(
      "NJ-1040",
      "51",
      "Use Tax (actual amount)",
      useTax,
      "Actual use tax reported by taxpayer (floored at zero)",
      { "Reported amount": d(input.actualUseTax) }
    );
  } else {
    // No use tax applies
    useTax = new Decimal(0);
    usedSafeHarbor = false;

    audit.record(
      "NJ-1040",
      "51",
      "Use Tax",
      useTax,
      "No use tax reported"
    );
  }

  return {
    useTax,
    usedSafeHarbor,
    lines: audit.getLines(),
  };
}

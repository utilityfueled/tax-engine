/**
 * New Jersey NJ-1040 Schedule A — Credit for Income or Wage Tax Paid
 * to Other Jurisdictions.
 * Spec: spec/state/nj-1040-other-jurisdiction-credit.yaml
 *
 * NJ residents who pay income/wage tax to another state on income also
 * taxed by NJ may claim this nonrefundable credit (Line 44) to avoid
 * double taxation.
 *
 * Per jurisdiction:
 *   proportionalLimit = (incomeInJurisdiction / njGrossIncome) × njTax
 *   credit = min(taxPaid, proportionalLimit)
 *
 * Total credit = sum of per-jurisdiction credits, capped at NJ tax.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface OtherJurisdictionEntry {
  /** Name of the other state/jurisdiction (e.g. "NY", "PA") */
  jurisdiction: string;
  /** Income earned in / sourced to that jurisdiction */
  incomeInJurisdiction: Decimal;
  /** Income or wage tax actually paid to that jurisdiction */
  taxPaid: Decimal;
}

export interface NJ1040OtherJurisdictionCreditInput {
  taxYear: number;
  /** NJ gross income (Line 29) */
  njGrossIncome: Decimal;
  /** NJ tax (Line 43) */
  njTax: Decimal;
  /** List of other jurisdictions with income and tax paid */
  jurisdictions: OtherJurisdictionEntry[];
}

export interface JurisdictionCreditDetail {
  jurisdiction: string;
  incomeInJurisdiction: Decimal;
  taxPaid: Decimal;
  incomeRatio: Decimal;
  proportionalLimit: Decimal;
  credit: Decimal;
}

export interface NJ1040OtherJurisdictionCreditResult {
  jurisdictionCredits: JurisdictionCreditDetail[];
  totalCredit: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040OtherJurisdictionCredit(
  input: NJ1040OtherJurisdictionCreditInput
): NJ1040OtherJurisdictionCreditResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 other jurisdiction credit rules");

  const audit = new AuditTrail();
  const { njGrossIncome, njTax, jurisdictions } = input;

  // Guard: no credit if NJ gross income or NJ tax is zero
  if (njGrossIncome.isZero() || njGrossIncome.isNegative() || njTax.isZero() || njTax.isNegative()) {
    audit.record(
      "NJ-1040 Schedule A",
      "44",
      "Credit for taxes paid to other jurisdictions",
      new Decimal(0),
      "No credit — NJ gross income or NJ tax is zero",
      { "NJ gross income": njGrossIncome, "NJ tax": njTax }
    );
    return {
      jurisdictionCredits: [],
      totalCredit: new Decimal(0),
      lines: audit.getLines(),
    };
  }

  const jurisdictionCredits: JurisdictionCreditDetail[] = [];
  let runningTotal = new Decimal(0);

  for (const entry of jurisdictions) {
    const incomeInJurisdiction = zeroFloor(entry.incomeInJurisdiction);
    const taxPaid = zeroFloor(entry.taxPaid);

    // Income ratio: capped at 1.0
    const incomeRatio = incomeInJurisdiction.isZero()
      ? new Decimal(0)
      : Decimal.min(incomeInJurisdiction.dividedBy(njGrossIncome), new Decimal(1));

    // Proportional limit: ratio × NJ tax, rounded to nearest dollar
    const proportionalLimit = roundDollar(incomeRatio.times(njTax));

    // Credit = lesser of tax paid and proportional limit
    const credit = Decimal.min(taxPaid, proportionalLimit);

    jurisdictionCredits.push({
      jurisdiction: entry.jurisdiction,
      incomeInJurisdiction,
      taxPaid,
      incomeRatio,
      proportionalLimit,
      credit,
    });

    audit.record(
      "NJ-1040 Schedule A",
      `credit-${entry.jurisdiction}`,
      `Credit for taxes paid to ${entry.jurisdiction}`,
      credit,
      `min(tax paid to ${entry.jurisdiction}, proportional limit)`,
      {
        "Income in jurisdiction": incomeInJurisdiction,
        "Tax paid": taxPaid,
        "Income ratio": incomeRatio.toFixed(6),
        "Proportional limit": proportionalLimit,
      }
    );

    runningTotal = runningTotal.plus(credit);
  }

  // Total credit cannot exceed NJ tax
  const totalCredit = Decimal.min(runningTotal, njTax);

  audit.record(
    "NJ-1040 Schedule A",
    "44",
    "Total credit for taxes paid to other jurisdictions",
    totalCredit,
    "Sum of per-jurisdiction credits, capped at NJ tax (Line 43)",
    {
      "Sum of jurisdiction credits": runningTotal,
      "NJ tax (Line 43)": njTax,
    }
  );

  return {
    jurisdictionCredits,
    totalCredit,
    lines: audit.getLines(),
  };
}

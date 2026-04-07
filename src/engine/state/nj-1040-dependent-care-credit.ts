/**
 * New Jersey NJ-1040 Child and Dependent Care Credit computation.
 * Spec: spec/state/nj-1040-dependent-care-credit.yaml
 *
 * Provides a refundable credit equal to a percentage of the federal Form 2441
 * child and dependent care credit. The percentage depends on NJ taxable income
 * (Line 42). Part-year residents prorate by months of NJ residency.
 *
 * Refundable since tax year 2021 (P.L.2021, c.308). No dollar cap.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

interface CreditBracket {
  maxIncome: Decimal;
  percentage: Decimal;
}

/** Credit percentage brackets by tax year: ordered from lowest to highest income */
const NJ_DEPENDENT_CARE_BRACKETS: Record<number, CreditBracket[]> = {
  2025: [
    { maxIncome: new Decimal(30000), percentage: new Decimal("0.5") },
    { maxIncome: new Decimal(60000), percentage: new Decimal("0.4") },
    { maxIncome: new Decimal(90000), percentage: new Decimal("0.3") },
    { maxIncome: new Decimal(120000), percentage: new Decimal("0.2") },
    { maxIncome: new Decimal(150000), percentage: new Decimal("0.1") },
  ],
};

const MONTHS_IN_YEAR = new Decimal(12);

export interface NJ1040DependentCareCreditInput {
  taxYear: number;
  /** Federal child and dependent care credit from Form 2441 */
  federalDependentCareCredit: Decimal | string | number;
  /** NJ taxable income (Line 42) — used for bracket determination */
  njTaxableIncome: Decimal | string | number;
  /** Number of months the taxpayer was a NJ resident (15+ days counts as a month) */
  monthsOfResidency: number;
}

export interface NJ1040DependentCareCreditResult {
  /** Federal Form 2441 credit (input, floored at zero) */
  federalCredit: Decimal;
  /** NJ taxable income used for bracket determination */
  njTaxableIncome: Decimal;
  /** NJ credit percentage from income bracket (0 if over $150K) */
  njPercentage: Decimal;
  /** Credit before part-year proration (federal credit × NJ percentage) */
  creditBeforeProration: Decimal;
  /** Months of NJ residency (clamped 0-12) */
  monthsOfResidency: number;
  /** Final NJ Child and Dependent Care Credit (prorated and rounded) */
  njCredit: Decimal;
  lines: CalculatedLine[];
}

/**
 * Determine the NJ credit percentage based on NJ taxable income bracket.
 * Returns 0% if income exceeds $150,000.
 */
function getNJPercentage(
  taxableIncome: Decimal,
  brackets: CreditBracket[]
): Decimal {
  for (const bracket of brackets) {
    if (taxableIncome.lessThanOrEqualTo(bracket.maxIncome)) {
      return bracket.percentage;
    }
  }
  return new Decimal(0);
}

export function calculateNJ1040DependentCareCredit(
  input: NJ1040DependentCareCreditInput
): NJ1040DependentCareCreditResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 dependent care credit rules");

  const brackets = NJ_DEPENDENT_CARE_BRACKETS[input.taxYear];
  if (!brackets) {
    throw new Error(
      `NJ Child and Dependent Care Credit brackets not available for tax year ${input.taxYear}`
    );
  }

  // Federal credit (floored at zero)
  const federalCredit = zeroFloor(d(input.federalDependentCareCredit));

  audit.record(
    "NJ-1040",
    "64-federal-credit",
    "Federal child and dependent care credit (Form 2441)",
    federalCredit,
    "Federal Form 2441 credit amount (floored at zero)"
  );

  // NJ taxable income for bracket determination
  const njTaxableIncome = d(input.njTaxableIncome);

  // Determine NJ percentage from income bracket
  const njPercentage = getNJPercentage(njTaxableIncome, brackets);

  audit.record(
    "NJ-1040",
    "64-nj-percentage",
    "NJ credit percentage based on NJ taxable income",
    njPercentage,
    "≤$30K: 50%; ≤$60K: 40%; ≤$90K: 30%; ≤$120K: 20%; ≤$150K: 10%; >$150K: 0%",
    {
      "NJ taxable income": njTaxableIncome,
    }
  );

  // Credit before proration
  const creditBeforeProration = federalCredit.times(njPercentage);

  // Clamp months to 0-12
  const months = Math.max(0, Math.min(12, input.monthsOfResidency));

  // Apply part-year proration and round
  const njCredit =
    months === 12
      ? roundDollar(creditBeforeProration)
      : roundDollar(creditBeforeProration.dividedBy(MONTHS_IN_YEAR).times(months));

  audit.record(
    "NJ-1040",
    "64",
    "NJ Child and Dependent Care Credit",
    njCredit,
    months === 12
      ? "Federal credit × NJ percentage, rounded to nearest dollar"
      : `Federal credit × NJ percentage × (${months} / 12), rounded to nearest dollar`,
    {
      "Federal credit": federalCredit,
      "NJ percentage": njPercentage.times(100).toString() + "%",
      "Credit before proration": creditBeforeProration,
      "Months of residency": months.toString(),
    }
  );

  return {
    federalCredit,
    njTaxableIncome,
    njPercentage,
    creditBeforeProration,
    monthsOfResidency: months,
    njCredit,
    lines: audit.getLines(),
  };
}

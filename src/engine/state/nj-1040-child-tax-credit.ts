/**
 * New Jersey NJ-1040 Child Tax Credit computation.
 * Spec: spec/state/nj-1040-child-tax-credit.yaml
 *
 * Provides a refundable credit for qualifying children age 5 or younger.
 * Credit amount depends on NJ taxable income bracket. Part-year residents
 * prorate by months of NJ residency.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

interface CreditBracket {
  maxIncome: Decimal;
  creditPerChild: Decimal;
}

/** Credit brackets by tax year: ordered from lowest to highest income */
const NJ_CTC_BRACKETS: Record<number, CreditBracket[]> = {
  2025: [
    { maxIncome: new Decimal(30000), creditPerChild: new Decimal(1000) },
    { maxIncome: new Decimal(40000), creditPerChild: new Decimal(800) },
    { maxIncome: new Decimal(50000), creditPerChild: new Decimal(600) },
    { maxIncome: new Decimal(60000), creditPerChild: new Decimal(400) },
    { maxIncome: new Decimal(80000), creditPerChild: new Decimal(200) },
  ],
};

const MONTHS_IN_YEAR = new Decimal(12);

export interface NJ1040ChildTaxCreditInput {
  taxYear: number;
  /** NJ filing status */
  filingStatus?: FilingStatus;
  /** NJ taxable income (Line 42) */
  njTaxableIncome: Decimal | string | number;
  /** Number of qualifying children age 5 or younger by Dec 31 */
  qualifyingChildrenAge5OrUnder: number;
  /** Number of months the taxpayer was a NJ resident (15+ days counts as a month) */
  monthsOfResidency: number;
}

export interface NJ1040ChildTaxCreditResult {
  /** Filing status used for eligibility */
  filingStatus: FilingStatus;
  /** NJ taxable income used for bracket determination */
  njTaxableIncome: Decimal;
  /** Number of qualifying children */
  qualifyingChildren: number;
  /** Credit amount per qualifying child based on income bracket */
  creditPerChild: Decimal;
  /** Total credit before proration (creditPerChild × children) */
  totalCreditBeforeProration: Decimal;
  /** Months of NJ residency (clamped 0-12) */
  monthsOfResidency: number;
  /** Final NJ Child Tax Credit (prorated and rounded) */
  totalCredit: Decimal;
  lines: CalculatedLine[];
}

/**
 * Determine the credit per child based on NJ taxable income bracket.
 * Returns $0 if income exceeds $80,000.
 */
function getCreditPerChild(
  taxableIncome: Decimal,
  brackets: CreditBracket[]
): Decimal {
  for (const bracket of brackets) {
    if (taxableIncome.lessThanOrEqualTo(bracket.maxIncome)) {
      return bracket.creditPerChild;
    }
  }
  return new Decimal(0);
}

export function calculateNJ1040ChildTaxCredit(
  input: NJ1040ChildTaxCreditInput
): NJ1040ChildTaxCreditResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 child tax credit rules");

  const brackets = NJ_CTC_BRACKETS[input.taxYear];
  if (!brackets) {
    throw new Error(
      `NJ Child Tax Credit brackets not available for tax year ${input.taxYear}`
    );
  }

  const filingStatus = input.filingStatus ?? "single";
  const njTaxableIncome = d(input.njTaxableIncome);
  const qualifyingChildren = Math.max(0, input.qualifyingChildrenAge5OrUnder);
  const months = Math.max(0, Math.min(12, input.monthsOfResidency));
  const eligibleFilingStatus = filingStatus !== "married_filing_separately";

  audit.record(
    "NJ-1040",
    "eligibility",
    "NJ Child Tax Credit filing-status eligibility",
    eligibleFilingStatus ? new Decimal(1) : new Decimal(0),
    eligibleFilingStatus
      ? "Filing status is eligible for the NJ Child Tax Credit"
      : "Married filing separately is not eligible for the NJ Child Tax Credit",
    {
      "Filing status": filingStatus,
    }
  );

  // Determine credit per child from income bracket
  const creditPerChild = eligibleFilingStatus
    ? getCreditPerChild(njTaxableIncome, brackets)
    : new Decimal(0);

  audit.record(
    "NJ-1040",
    "credit-per-child",
    "NJ Child Tax Credit per qualifying child",
    creditPerChild,
    "Based on NJ taxable income bracket (≤$30K: $1,000; ≤$40K: $800; ≤$50K: $600; ≤$60K: $400; ≤$80K: $200; >$80K: $0)",
    {
      "NJ taxable income": njTaxableIncome,
    }
  );

  // Total credit before proration
  const totalCreditBeforeProration = creditPerChild.times(qualifyingChildren);

  audit.record(
    "NJ-1040",
    "total-credit-before-proration",
    "Total NJ Child Tax Credit before proration",
    totalCreditBeforeProration,
    "Credit per child × number of qualifying children",
    {
      "Credit per child": creditPerChild,
      "Qualifying children": qualifyingChildren.toString(),
    }
  );

  // Prorate for part-year residents
  const totalCredit =
    months === 12
      ? totalCreditBeforeProration
      : roundDollar(
          totalCreditBeforeProration.dividedBy(MONTHS_IN_YEAR).times(months)
        );

  audit.record(
    "NJ-1040",
    "nj-ctc",
    "New Jersey Child Tax Credit",
    totalCredit,
    months === 12
      ? "Full-year resident — no proration"
      : `Total credit × (${months} / 12), rounded to nearest dollar`,
    {
      "Total before proration": totalCreditBeforeProration,
      "Months of residency": months.toString(),
    }
  );

  return {
    filingStatus,
    njTaxableIncome,
    qualifyingChildren,
    creditPerChild,
    totalCreditBeforeProration,
    monthsOfResidency: months,
    totalCredit,
    lines: audit.getLines(),
  };
}

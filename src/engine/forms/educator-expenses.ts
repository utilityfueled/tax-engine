/** Schedule 1 line 11; spec/federal/educator-expense-limits.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";
const ZERO = new Decimal(0);

export function calculateEducatorExpensesDeduction(
  adjustments: TaxYearInput["adjustments"],
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"],
  taxYear: number
): {
  amount: Decimal;
  formula: string;
  inputs: Record<string, Decimal | string>;
} {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error(`Educator expense limit is not supported for tax year ${taxYear}`);
  // 2026 Rev. Proc. 2025-32 section4.12; 2025 Schedule1 line11.
  const perPersonLimit = new Decimal(taxYear === 2026 ? "350" : "300");
  const aggregateEducatorExpenses = zeroFloor(d(adjustments?.educatorExpenses));
  const primaryEducatorExpenses = zeroFloor(d(adjustments?.primaryEducatorExpenses));
  const spouseEducatorExpenses = zeroFloor(d(adjustments?.spouseEducatorExpenses));
  const hasSplitEducatorExpenses =
    primaryEducatorExpenses.greaterThan(0) || spouseEducatorExpenses.greaterThan(0);

  if (hasSplitEducatorExpenses) {
    const allowedPrimaryEducatorExpenses = min(primaryEducatorExpenses, perPersonLimit);
    const allowedSpouseEducatorExpenses = filingStatus === "married_filing_jointly"
      ? min(spouseEducatorExpenses, perPersonLimit)
      : ZERO;

    return {
      amount: allowedPrimaryEducatorExpenses.plus(allowedSpouseEducatorExpenses),
      formula: filingStatus === "married_filing_jointly"
        ? `min(primary educator expenses, $${perPersonLimit}) + min(spouse educator expenses, $${perPersonLimit})`
        : `min(primary educator expenses, $${perPersonLimit})`,
      inputs: {
        "Primary educator expenses entered": primaryEducatorExpenses,
        "Primary educator expenses allowed": allowedPrimaryEducatorExpenses,
        "Spouse educator expenses entered": spouseEducatorExpenses,
        "Spouse educator expenses allowed": allowedSpouseEducatorExpenses,
        "Ignored aggregate educator expenses fallback": aggregateEducatorExpenses,
      },
    };
  }

  return {
    amount: min(aggregateEducatorExpenses, perPersonLimit),
    formula: `min(${aggregateEducatorExpenses}, $${perPersonLimit})`,
    inputs: {
      "Aggregate educator expenses entered": aggregateEducatorExpenses,
    },
  };
}

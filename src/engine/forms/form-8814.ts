/**
 * Form 8814 — Parents' Election To Report Child's Interest and Dividends
 * Spec: spec/federal/form-8814.yaml
 *
 * IRC §1(g)(7): allows a parent to include a qualifying child's interest,
 * ordinary dividends, and capital gain distributions on the parent's return
 * instead of the child filing separately.
 *
 * Part I allocates the child's income above the $2,700 base proportionally
 * among qualified dividends, capital gain distributions, and ordinary-rate
 * income.  Part II computes a flat 10% tax on the first taxable tier
 * ($1,350–$2,700) of the child's income.
 */

import Decimal from "decimal.js";
import type { Form8814ChildInput } from "@/models/inputs.js";
import type { YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8814Result {
  /** Line 4: Total child income (1a + 2a + 3) */
  line4: Decimal;
  /** Line 6: Income above base amount */
  line6: Decimal;
  /** Line 9: Qualified dividends to report on parent's return */
  qualifiedDividendsToReport: Decimal;
  /** Line 10: Capital gain distributions to report on parent's return */
  capitalGainsToReport: Decimal;
  /** Line 12: Other interest/dividend income at ordinary rates → Schedule 1 Line 8z */
  otherIncomeToReport: Decimal;
  /** Line 15: Tax on first $2,700 tier → Form 1040 Line 16 */
  tax: Decimal;
  /** Child's line1b; retained for the dependent worksheet, not parent1040line2a */
  taxExemptInterest: Decimal;
  /** Whether the form applies (child income > amountNotTaxed and < maximum) */
  applies: boolean;
  /** Whether the child's income exceeds the maximum ($13,500) — cannot use Form 8814 */
  exceedsMaximum: boolean;
  /** Audit lines */
  lines: CalculatedLine[];
}

export interface AggregatedForm8814 {
  /** Total qualified dividends from all children → parent's Lines 3a and 3b */
  totalQualifiedDividends: Decimal;
  /** Total capital gain distributions from all children → Schedule D Line 13 */
  totalCapitalGains: Decimal;
  /** Total other income from all children → Schedule 1 Line 8z */
  totalOtherIncome: Decimal;
  /** Total tax from all children → Form 1040 Line 16 */
  totalTax: Decimal;
  /** Child tax-exempt interest retained separately for actual dependent/source worksheets */
  totalTaxExemptInterest: Decimal;
  /** Individual results per child */
  children: Form8814Result[];
  /** Audit lines */
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);

export function calculateForm8814(
  input: Form8814ChildInput,
  constants: YearConstants
): Form8814Result {
  const audit = new AuditTrail();
  const { baseAmount, amountNotTaxed, maximumChildIncome, taxRate } = constants.form8814;

  // ── Part I: Child's Interest and Dividends To Report on Your Return ──

  const line1a = d(input.taxableInterest);
  audit.record("Form 8814", "1a", "Child's taxable interest", line1a, "Forms 1099-INT, 1099-OID");

  const line1b = d(input.taxExemptInterest);
  audit.record("Form 8814", "1b", "Child's tax-exempt interest", line1b, "Informational, not included in Line 4");

  const line2a = d(input.ordinaryDividends);
  audit.record("Form 8814", "2a", "Child's ordinary dividends", line2a, "Forms 1099-DIV Box 1a");

  const line2b = d(input.qualifiedDividends);
  audit.record("Form 8814", "2b", "Child's qualified dividends", line2b, "Forms 1099-DIV Box 1b (for proportional allocation)");

  const line3 = d(input.capitalGainDistributions);
  audit.record("Form 8814", "3", "Child's capital gain distributions", line3, "Forms 1099-DIV Box 2a");

  // Line 4: Total
  const line4 = line1a.plus(line2a).plus(line3);
  audit.record("Form 8814", "4", "Total child income", line4, "Line 1a + Line 2a + Line 3", {
    "Line 1a": line1a,
    "Line 2a": line2a,
    "Line 3": line3,
  });

  // Check if child's income exceeds maximum
  if (line4.greaterThanOrEqualTo(maximumChildIncome)) {
    audit.record("Form 8814", "4-max", "Cannot use Form 8814", line4,
      `Child's income $${line4} >= $${maximumChildIncome} maximum — must file child's own return using Form 8615`);
    return {
      line4,
      line6: ZERO,
      qualifiedDividendsToReport: ZERO,
      capitalGainsToReport: ZERO,
      otherIncomeToReport: ZERO,
      tax: ZERO,
      taxExemptInterest: line1b,
      applies: false,
      exceedsMaximum: true,
      lines: audit.getLines(),
    };
  }

  // Line 5: Base amount
  audit.record("Form 8814", "5", "Base amount", baseAmount, `$${baseAmount} (2025)`);

  // Line 6: Income above base
  const line6 = zeroFloor(line4.minus(baseAmount));
  audit.record("Form 8814", "6", "Income above base amount", line6,
    line6.isZero() ? `Line 4 <= $${baseAmount}, no income to allocate to parent` : "Line 4 - Line 5");

  // Lines 7-12: Proportional allocation (only when Line 6 > 0)
  let qualifiedDividendsToReport = ZERO;
  let capitalGainsToReport = ZERO;
  let otherIncomeToReport = ZERO;

  if (line6.greaterThan(0) && line4.greaterThan(0)) {
    const hasPreferentialItems = line2b.greaterThan(0) || line3.greaterThan(0);

    if (hasPreferentialItems) {
      // Line 7: Qualified dividend ratio
      const line7 = line2b.dividedBy(line4).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
      audit.record("Form 8814", "7", "Qualified dividend ratio", line7, "Line 2b / Line 4; rounded to six decimal places");

      // Line 8: Capital gain distribution ratio
      const line8 = line3.dividedBy(line4).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
      audit.record("Form 8814", "8", "Capital gain distribution ratio", line8, "Line 3 / Line 4; rounded to six decimal places");

      // Line 9: Qualified dividends to report
      qualifiedDividendsToReport = roundDollar(line6.times(line7));
      audit.record("Form 8814", "9", "Qualified dividends to report on parent's return",
        qualifiedDividendsToReport, "Line 6 × Line 7 → parent's Form 1040 Lines 3a and 3b");

      // Line 10: Capital gain distributions to report
      capitalGainsToReport = roundDollar(line6.times(line8));
      audit.record("Form 8814", "10", "Capital gain distributions to report on parent's return",
        capitalGainsToReport, "Line 6 × Line 8 → parent's Schedule D Line 13");

      // Line 11: Sum of preferential-rate items
      const line11 = qualifiedDividendsToReport.plus(capitalGainsToReport);
      audit.record("Form 8814", "11", "Sum of preferential-rate items", line11, "Line 9 + Line 10");

      // Line 12: Other income at ordinary rates
      // Line12 has no zero-floor instruction. Separate whole-dollar transfers
      // can leave a negative rounding remainder, which must not create income.
      otherIncomeToReport = line6.minus(line11);
      audit.record("Form 8814", "12", "Other interest/dividend income at ordinary rates",
        otherIncomeToReport, "Line 6 - Line 11 → Schedule 1 Line 8z");
    } else {
      // No qualified dividends or capital gains — all excess is ordinary
      audit.record("Form 8814", "7-10", "No qualified dividends or capital gains",
        ZERO, "Lines 2b and 3 are both zero — skip Lines 7-10");
      otherIncomeToReport = line6;
      audit.record("Form 8814", "12", "Other interest/dividend income at ordinary rates",
        otherIncomeToReport, "Entire Line 6 is ordinary-rate income → Schedule 1 Line 8z");
    }
  }

  // ── Part II: Tax on the First $2,700 of Child's Income ──

  // Line 13: Amount not taxed
  audit.record("Form 8814", "13", "Amount not taxed", amountNotTaxed, `$${amountNotTaxed} (2025)`);

  // Line 14: Taxable base tier
  const line14 = zeroFloor(line4.minus(amountNotTaxed));
  audit.record("Form 8814", "14", "Taxable base tier", line14,
    line14.isZero() ? `Line 4 <= $${amountNotTaxed}, no tax due` : "max(0, Line 4 - Line 13)");

  // Line 15: Tax
  const maxTaxableTier = amountNotTaxed; // The second tier is the same size as the first
  const tax = line14.greaterThanOrEqualTo(maxTaxableTier)
    ? roundDollar(maxTaxableTier.times(taxRate))
    : roundDollar(line14.times(taxRate));
  audit.record("Form 8814", "15", "Tax on first tier of child's income", tax,
    line14.greaterThanOrEqualTo(maxTaxableTier)
      ? `$${maxTaxableTier} × ${taxRate.times(100)}% = $${tax} (maximum)`
      : `$${line14} × ${taxRate.times(100)}% = $${tax}`,
    {
      "Line 14": line14,
      "Tax rate": taxRate,
      "Maximum taxable tier": maxTaxableTier,
    }
  );

  const applies = line4.greaterThan(amountNotTaxed) && line4.lessThan(maximumChildIncome);

  return {
    line4,
    line6,
    qualifiedDividendsToReport,
    capitalGainsToReport,
    otherIncomeToReport,
    tax,
    taxExemptInterest: line1b,
    applies,
    exceedsMaximum: false,
    lines: audit.getLines(),
  };
}

export function aggregateForm8814Results(
  inputs: Form8814ChildInput[],
  constants: YearConstants
): AggregatedForm8814 {
  const audit = new AuditTrail();
  const children: Form8814Result[] = [];

  for (const input of inputs) {
    const result = calculateForm8814(input, constants);
    children.push(result);
    audit.merge(result.lines);
  }

  const applicable = children.filter((c) => c.applies);
  const totalQualifiedDividends = applicable.reduce((acc, c) => acc.plus(c.qualifiedDividendsToReport), ZERO);
  const totalCapitalGains = applicable.reduce((acc, c) => acc.plus(c.capitalGainsToReport), ZERO);
  const totalOtherIncome = applicable.reduce((acc, c) => acc.plus(c.otherIncomeToReport), ZERO);
  const totalTax = applicable.reduce((acc, c) => acc.plus(c.tax), ZERO);
  const totalTaxExemptInterest = children.reduce((acc, c) => acc.plus(c.taxExemptInterest), ZERO);

  if (children.length > 1) {
    audit.record("Form 8814", "agg", "Aggregated Form 8814 results", new Decimal(children.length),
      `${children.length} children, ${applicable.length} applicable`,
      {
        "Total qualified dividends": totalQualifiedDividends,
        "Total capital gains": totalCapitalGains,
        "Total other income (Schedule 1 Line 8z)": totalOtherIncome,
        "Total tax (Form 1040 Line 16)": totalTax,
        "Total tax-exempt interest": totalTaxExemptInterest,
      });
  }

  return {
    totalQualifiedDividends,
    totalCapitalGains,
    totalOtherIncome,
    totalTax,
    totalTaxExemptInterest,
    children,
    lines: audit.getLines(),
  };
}

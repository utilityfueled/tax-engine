/**
 * Taxable Refund Worksheet — Schedule 1, Line 1
 * Spec: spec/federal/taxable-refund-worksheet.yaml
 *
 * Determines how much of a prior-year state/local income tax refund is
 * taxable under the IRC §111 tax benefit rule, factoring in the $10K/$5K
 * SALT cap (IRC §164(b)(6)) interaction.
 *
 * Ref: IRS Schedule 1 Instructions, Worksheet 1; IRC §111; Pub 525.
 */

import Decimal from "decimal.js";
import type { TaxableRefundWorksheetInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const GENERAL_SALT_CAP = new Decimal(10000);
const MFS_SALT_CAP = new Decimal(5000);

function getSaltCap(worksheet: TaxableRefundWorksheetInput): Decimal {
  const year = worksheet.priorTaxYear;
  if (!Number.isInteger(year) || year < 2018 || year > 2026) {
    throw new Error("Taxable refund requires an explicitly supported origin tax year (2018–2026).");
  }
  const mfs = worksheet.priorYearFilingStatus === "married_filing_separately";
  if (year <= 2024) return mfs ? MFS_SALT_CAP : GENERAL_SALT_CAP;
  if (worksheet.priorYearSaltMagi === undefined) {
    throw new Error(`Historical SALT MAGI is required for origin tax year ${year}.`);
  }
  if (!d(worksheet.priorYearSaltMagi).isFinite()) throw new Error("Historical SALT MAGI must be finite.");
  const maximum = d(year === 2025 ? "40000" : "40400");
  const threshold = d(year === 2025 ? "500000" : "505000").dividedBy(mfs ? 2 : 1);
  const reduction = zeroFloor(d(worksheet.priorYearSaltMagi).minus(threshold)).times("0.30");
  return roundDollar(Decimal.max(GENERAL_SALT_CAP, maximum.minus(reduction)).dividedBy(mfs ? 2 : 1));
}

export interface TaxableRefundWorksheetResult {
  /** Line 1: Total state/local income tax refunds from 1099-G Box 2 */
  totalRefund: Decimal;
  /** Line 6: Excess of itemized over standard deduction */
  excessItemized: Decimal;
  /** Line 7: Tax benefit amount (min of refund, excess) */
  taxBenefitAmount: Decimal;
  /** Line 10: Excess of taxes paid over SALT cap */
  excessOverSaltCap: Decimal;
  /** Pub. 525 cap based on the alternative sales-tax deduction, when provided */
  alternativeSalesTaxCap: Decimal;
  /** Line 13: Final taxable refund amount */
  taxableRefund: Decimal;
  /** Whether the SALT cap adjustment was applied */
  saltCapApplied: boolean;
  /** Whether the alternative sales-tax cap reduced the provisional taxable refund */
  alternativeSalesTaxCapApplied: boolean;
  /** Audit trail */
  lines: CalculatedLine[];
}

export function calculateTaxableRefundWorksheet(
  form1099Gs: Array<{ stateLocalIncomeTaxRefund?: string; refundTaxYear?: number }>,
  worksheet: TaxableRefundWorksheetInput,
  receivedTaxYear?: number,
): TaxableRefundWorksheetResult {
  const audit = new AuditTrail();
  for (const field of ["priorYearItemizedTotal", "priorYearStandardDeduction", "priorYearStateLocalTaxesPaid", "priorYearPropertyTaxesPaid", "priorYearAlternativeGeneralSalesTaxDeduction"] as const) {
    if (worksheet[field] !== undefined && (!d(worksheet[field]).isFinite() || d(worksheet[field]).isNegative())) throw new Error("Historical deduction and payment amounts must be finite and cannot be negative.");
  }
  const saltCap = getSaltCap(worksheet);
  if (receivedTaxYear !== undefined && worksheet.priorTaxYear >= receivedTaxYear) {
    throw new Error("A taxable refund's origin tax year must be before its receipt year; same-year recoveries reduce the deduction.");
  }
  for (const form of form1099Gs) {
    if (d(form.stateLocalIncomeTaxRefund).isNegative()) throw new Error("Tax refunds cannot be negative.");
    if (d(form.stateLocalIncomeTaxRefund).greaterThan(0) && form.refundTaxYear !== undefined && form.refundTaxYear !== worksheet.priorTaxYear) {
      throw new Error("Form 1099-G refund tax year does not match the worksheet origin year; mixed-year recoveries require separate worksheets.");
    }
  }
  audit.record("Taxable Refund WS", "origin_year", "Tax deduction origin year", d(worksheet.priorTaxYear), `Historical SALT limit $${saltCap}; receipt year ${receivedTaxYear ?? "not provided"}`);

  // Line 1: Aggregate all 1099-G Box 2 amounts
  const totalRefund = sum(
    ...form1099Gs.map((f) => d(f.stateLocalIncomeTaxRefund))
  );
  audit.record("Taxable Refund WS", "1", "Total state/local income tax refunds",
    totalRefund,
    form1099Gs.length > 0
      ? `Sum of ${form1099Gs.length} Form 1099-G Box 2 amount(s)`
      : "No Form 1099-G Box 2 refunds reported");

  // Short-circuit: no refund → nothing taxable
  if (totalRefund.isZero()) {
    return buildZeroResult(audit, totalRefund, "No refund received");
  }

  // Line 2/5: Prior-year standard deduction
  const priorStandard = d(worksheet.priorYearStandardDeduction);
  audit.record("Taxable Refund WS", "2", "Prior-year standard deduction",
    priorStandard, "Prior-year Form 1040 Line 12a");

  // Line 3: Did the taxpayer itemize?
  if (!worksheet.priorYearItemized) {
    audit.record("Taxable Refund WS", "3", "Prior-year itemized?",
      ZERO, "No — took standard deduction; refund is not taxable");
    return buildZeroResult(audit, totalRefund, "Did not itemize in prior year");
  }
  if (worksheet.priorYearStateLocalTaxesPaid === undefined || worksheet.priorYearPropertyTaxesPaid === undefined) {
    throw new Error("Actual historical income and property taxes are required, including explicit zero when applicable.");
  }
  audit.record("Taxable Refund WS", "3", "Prior-year itemized?",
    new Decimal(1), "Yes — continue to Line 4");

  // Line 4: Prior-year total itemized deductions
  const priorItemized = d(worksheet.priorYearItemizedTotal);
  audit.record("Taxable Refund WS", "4", "Prior-year total itemized deductions",
    priorItemized, "Prior-year Schedule A Line 17");

  // Line 6: Excess of itemized over standard
  const excessItemized = zeroFloor(priorItemized.minus(priorStandard));
  audit.record("Taxable Refund WS", "6", "Excess of itemized over standard deduction",
    excessItemized,
    `${priorItemized} - ${priorStandard}`,
    {
      "Prior-year itemized": priorItemized,
      "Prior-year standard deduction": priorStandard,
    });

  if (excessItemized.isZero()) {
    return buildZeroResult(audit, totalRefund,
      "Itemized deductions did not exceed standard deduction — no tax benefit");
  }

  // Line 7: Tax benefit amount = min(refund, excess)
  const taxBenefitAmount = min(totalRefund, excessItemized);
  audit.record("Taxable Refund WS", "7", "Tax benefit amount",
    taxBenefitAmount,
    `min(refund ${totalRefund}, excess ${excessItemized})`);

  // Lines 8-13: SALT cap adjustment
  const priorTaxesPaid = d(worksheet.priorYearStateLocalTaxesPaid).plus(d(worksheet.priorYearPropertyTaxesPaid));
  if (priorTaxesPaid.isZero()) {
    // No SALT cap adjustment data — result is Line 7
    const uncappedResult = finalizeTaxableRefund(
      audit,
      {
        totalRefund,
        excessItemized,
        taxBenefitAmount,
        excessOverSaltCap: ZERO,
        saltCapApplied: false,
        provisionalTaxableRefund: taxBenefitAmount,
        worksheet,
        priorTaxesPaid,
        resultReason: "No SALT cap adjustment needed (prior-year state taxes paid not provided)",
      }
    );
    return uncappedResult;
  }

  // Line 8: Total state/local income taxes paid (before cap)
  audit.record("Taxable Refund WS", "8", "State/local income taxes paid (before cap)",
    priorTaxesPaid,
    "Total state/local income taxes actually paid in prior year");

  // Line 9: SALT cap
  audit.record("Taxable Refund WS", "9", "SALT deduction cap",
    saltCap,
    `Origin tax year ${worksheet.priorTaxYear}, filing status ${worksheet.priorYearFilingStatus}; IRC §164(b)(6)`);

  // Line 10: Excess over cap
  const excessOverCap = zeroFloor(priorTaxesPaid.minus(saltCap));
  audit.record("Taxable Refund WS", "10", "Excess of taxes paid over SALT cap",
    excessOverCap,
    `max(0, ${priorTaxesPaid} - ${saltCap})`);

  if (excessOverCap.isZero()) {
    // No excess over cap — taxable refund is Line 7
    const uncappedResult = finalizeTaxableRefund(
      audit,
      {
        totalRefund,
        excessItemized,
        taxBenefitAmount,
        excessOverSaltCap: ZERO,
        saltCapApplied: false,
        provisionalTaxableRefund: taxBenefitAmount,
        worksheet,
        priorTaxesPaid,
        resultReason: "State taxes paid did not exceed SALT cap — no cap adjustment needed",
      }
    );
    return uncappedResult;
  }

  // Line 11: Non-taxable portion from above-cap taxes
  const nonTaxableFromCap = min(totalRefund, excessOverCap);
  audit.record("Taxable Refund WS", "11", "Refund from above-cap taxes (not taxable)",
    nonTaxableFromCap,
    `min(refund ${totalRefund}, excess over cap ${excessOverCap})`);

  // Line 12: Refund that could have affected deduction
  const refundAffectingDeduction = totalRefund.minus(nonTaxableFromCap);
  audit.record("Taxable Refund WS", "12", "Refund that could have affected deduction",
    refundAffectingDeduction,
    `${totalRefund} - ${nonTaxableFromCap}`);

  // Line 13: Final taxable refund
  const provisionalTaxableRefund = min(taxBenefitAmount, refundAffectingDeduction);
  audit.record("Taxable Refund WS", "13", "Taxable refund (with SALT cap adjustment)",
    provisionalTaxableRefund,
    `min(tax benefit ${taxBenefitAmount}, affecting deduction ${refundAffectingDeduction})`,
    {
      "Tax benefit amount (Line 7)": taxBenefitAmount,
      "Refund affecting deduction (Line 12)": refundAffectingDeduction,
      "Non-taxable from cap (Line 11)": nonTaxableFromCap,
    });

  return finalizeTaxableRefund(
    audit,
    {
      totalRefund,
      excessItemized,
      taxBenefitAmount,
      excessOverSaltCap: excessOverCap,
      saltCapApplied: true,
      provisionalTaxableRefund,
      worksheet,
      priorTaxesPaid,
      resultReason: "SALT cap adjustment applied",
    }
  );
}

function buildZeroResult(
  audit: AuditTrail,
  totalRefund: Decimal,
  reason: string
): TaxableRefundWorksheetResult {
  audit.record("Taxable Refund WS", "result", "Taxable refund",
    ZERO, reason);
  return {
    totalRefund,
    excessItemized: ZERO,
    taxBenefitAmount: ZERO,
    excessOverSaltCap: ZERO,
    alternativeSalesTaxCap: ZERO,
    taxableRefund: ZERO,
    saltCapApplied: false,
    alternativeSalesTaxCapApplied: false,
    lines: audit.getLines(),
  };
}

function finalizeTaxableRefund(
  audit: AuditTrail,
  {
    totalRefund,
    excessItemized,
    taxBenefitAmount,
    excessOverSaltCap,
    saltCapApplied,
    provisionalTaxableRefund,
    worksheet,
    priorTaxesPaid,
    resultReason,
  }: {
    totalRefund: Decimal;
    excessItemized: Decimal;
    taxBenefitAmount: Decimal;
    excessOverSaltCap: Decimal;
    saltCapApplied: boolean;
    provisionalTaxableRefund: Decimal;
    worksheet: TaxableRefundWorksheetInput;
    priorTaxesPaid: Decimal;
    resultReason: string;
  }
): TaxableRefundWorksheetResult {
  const salesTaxAlternative = d(worksheet.priorYearAlternativeGeneralSalesTaxDeduction);
  let alternativeSalesTaxCap = ZERO;
  let alternativeSalesTaxCapApplied = false;
  let taxableRefund = provisionalTaxableRefund;

  if (salesTaxAlternative.greaterThan(0) && priorTaxesPaid.greaterThan(0)) {
    const saltCap = getSaltCap(worksheet);
    const chosenIncomeTaxDeduction = min(priorTaxesPaid, saltCap);
    const alternativeSalesTaxDeduction = min(salesTaxAlternative.plus(d(worksheet.priorYearPropertyTaxesPaid)), saltCap);
    alternativeSalesTaxCap = zeroFloor(
      chosenIncomeTaxDeduction.minus(alternativeSalesTaxDeduction)
    );
    audit.record(
      "Taxable Refund WS",
      "sales_tax_alt_cap",
      "Maximum taxable refund after alternative sales-tax comparison",
      alternativeSalesTaxCap,
      "max(0, chosen income-tax deduction - alternative sales-tax deduction)",
      {
        "Chosen income-tax deduction": chosenIncomeTaxDeduction,
        "Alternative sales-tax deduction": alternativeSalesTaxDeduction,
      }
    );

    if (alternativeSalesTaxCap.lessThan(taxableRefund)) {
      taxableRefund = alternativeSalesTaxCap;
      alternativeSalesTaxCapApplied = true;
    }
  }

  audit.record("Taxable Refund WS", "result", "Taxable refund",
    taxableRefund,
    alternativeSalesTaxCapApplied
      ? `${resultReason}; limited further by alternative sales-tax cap`
      : resultReason);

  return {
    totalRefund,
    excessItemized,
    taxBenefitAmount,
    excessOverSaltCap,
    alternativeSalesTaxCap,
    taxableRefund,
    saltCapApplied,
    alternativeSalesTaxCapApplied,
    lines: audit.getLines(),
  };
}

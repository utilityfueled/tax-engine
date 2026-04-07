/**
 * New York IT-201 Yonkers Tax Computation (Lines 55-57).
 * Implements the Yonkers resident surcharge, nonresident earnings tax,
 * and part-year resident proration.
 * Spec: spec/state/ny-it201-yonkers-tax.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export type YonkersResidencyStatus = "full_year" | "nonresident" | "part_year" | "none";

export interface NYYonkersConstants {
  /** Yonkers resident surcharge rate (e.g. 0.1675 = 16.75%) */
  residentSurchargeRate: Decimal;
  /** Yonkers nonresident earnings tax rate (e.g. 0.005 = 0.5%) */
  nonresidentEarningsRate: Decimal;
}

export interface NYIT201YonkersTaxInput {
  /** Total New York State taxes (IT-201 line 46) — worksheet line a for full-year residents. */
  totalNewYorkStateTaxes?: Decimal | string | number;
  /** Legacy alias retained for compatibility with earlier callers. */
  netNYStateTax?: Decimal | string | number;
  /** Yonkers residency status */
  yonkersResidencyStatus: YonkersResidencyStatus;
  /** For nonresidents: wages and net self-employment income earned in Yonkers */
  yonkersWages?: Decimal | string | number;
  /** For part-year residents: Form IT-360.1 line 73 income percentage (for example 0.4000) */
  yonkersResidentIncomePercentage?: Decimal | string | number;
  /** Worksheet line b */
  empireStateChildCredit?: Decimal | string | number;
  /** Worksheet line c */
  realPropertyTaxCredit?: Decimal | string | number;
  /** Worksheet line d */
  nysChildDependentCareCredit?: Decimal | string | number;
  /** Worksheet line e */
  nyEarnedIncomeCredit?: Decimal | string | number;
  /** Worksheet line f */
  nyNoncustodialParentEarnedIncomeCredit?: Decimal | string | number;
  /** Worksheet line g */
  collegeTuitionCreditAmount?: Decimal | string | number;
  /** Worksheet line h component */
  nycSchoolTaxCreditFixedAmount?: Decimal | string | number;
  /** Worksheet line h component */
  nycSchoolTaxCreditRateReductionAmount?: Decimal | string | number;
  /** Worksheet line i */
  it201attLine13RefundableCredits?: Decimal | string | number;
  /** Worksheet line k */
  starReconciliationAmount?: Decimal | string | number;
  taxYear: number;
}

export interface NYIT201YonkersTaxResult {
  yonkersResidencyStatus: YonkersResidencyStatus;
  /** Line 55: Full-year Yonkers resident income tax surcharge */
  yonkersResidentSurcharge: Decimal;
  /** Line 56: Yonkers nonresident earnings tax */
  yonkersNonresidentEarningsTax: Decimal;
  /** Line 57: Part-year Yonkers resident income tax surcharge */
  partYearYonkersSurcharge: Decimal;
  /** Total Yonkers taxes (sum of applicable line) */
  totalYonkersTax: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

const ZERO = new Decimal(0);

export const NY_YONKERS_CONSTANTS: Record<number, NYYonkersConstants> = {
  2025: {
    residentSurchargeRate: new Decimal("0.1675"),
    nonresidentEarningsRate: new Decimal("0.005"),
  },
};

function getYonkersResidentWorksheetBase(input: NYIT201YonkersTaxInput): {
  line46TotalNewYorkStateTaxes: Decimal;
  refundableCreditOffsets: Decimal;
  starReconciliationAmount: Decimal;
  worksheetBase: Decimal;
} {
  const line46TotalNewYorkStateTaxes = d(
    input.totalNewYorkStateTaxes ?? input.netNYStateTax
  );
  const refundableCreditOffsets = d(input.empireStateChildCredit)
    .plus(d(input.realPropertyTaxCredit))
    .plus(d(input.nysChildDependentCareCredit))
    .plus(d(input.nyEarnedIncomeCredit))
    .plus(d(input.nyNoncustodialParentEarnedIncomeCredit))
    .plus(d(input.collegeTuitionCreditAmount))
    .plus(d(input.nycSchoolTaxCreditFixedAmount))
    .plus(d(input.nycSchoolTaxCreditRateReductionAmount))
    .plus(d(input.it201attLine13RefundableCredits));
  const starReconciliationAmount = d(input.starReconciliationAmount);

  return {
    line46TotalNewYorkStateTaxes,
    refundableCreditOffsets,
    starReconciliationAmount,
    worksheetBase: zeroFloor(
      line46TotalNewYorkStateTaxes.minus(refundableCreditOffsets).plus(starReconciliationAmount)
    ),
  };
}

/* ---------- Main computation ---------- */

export function calculateNYIT201YonkersTax(
  input: NYIT201YonkersTaxInput
): NYIT201YonkersTaxResult {
  const constants = NY_YONKERS_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`Yonkers tax computation not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();

  let yonkersResidentSurcharge = ZERO;
  let yonkersNonresidentEarningsTax = ZERO;
  let partYearYonkersSurcharge = ZERO;

  switch (input.yonkersResidencyStatus) {
    case "full_year": {
      const worksheet = getYonkersResidentWorksheetBase(input);
      yonkersResidentSurcharge = roundDollar(
        worksheet.worksheetBase.times(constants.residentSurchargeRate)
      );
      audit.record("NY-IT201", "55", "Yonkers resident income tax surcharge",
        yonkersResidentSurcharge,
        "max(0, Line 46 - worksheet refundable-credit offsets + STAR reconciliation amount) × 16.75%", {
          "Total New York State taxes (line 46)": worksheet.line46TotalNewYorkStateTaxes.toString(),
          "Worksheet refundable-credit offsets": worksheet.refundableCreditOffsets.toString(),
          "STAR reconciliation amount": worksheet.starReconciliationAmount.toString(),
          "Worksheet base (line m)": worksheet.worksheetBase.toString(),
          "Surcharge rate": constants.residentSurchargeRate.toString(),
        });
      break;
    }

    case "nonresident": {
      // Line 56: Yonkers nonresident earnings tax = Yonkers wages × 0.5%
      const yonkersWages = zeroFloor(d(input.yonkersWages));
      yonkersNonresidentEarningsTax = roundDollar(
        yonkersWages.times(constants.nonresidentEarningsRate)
      );
      audit.record("NY-IT201", "56", "Yonkers nonresident earnings tax",
        yonkersNonresidentEarningsTax,
        "Yonkers-source wages × 0.5% (from Form Y-203)", {
          "Yonkers wages": yonkersWages.toString(),
          "Earnings tax rate": constants.nonresidentEarningsRate.toString(),
        });
      break;
    }

    case "part_year": {
      if (input.yonkersResidentIncomePercentage === undefined) {
        throw new Error(
          "Yonkers part-year resident tax requires yonkersResidentIncomePercentage from Form IT-360.1 line 73"
        );
      }

      const worksheet = getYonkersResidentWorksheetBase(input);
      const incomePercentage = d(input.yonkersResidentIncomePercentage);
      if (incomePercentage.lessThan(ZERO)) {
        throw new Error("Yonkers part-year resident income percentage cannot be negative");
      }
      const line65NetStateTax = zeroFloor(
        worksheet.line46TotalNewYorkStateTaxes.minus(worksheet.refundableCreditOffsets)
      );
      const line74ResidentPeriodNetStateTax = line65NetStateTax.times(incomePercentage);
      partYearYonkersSurcharge = roundDollar(
        line74ResidentPeriodNetStateTax.times(constants.residentSurchargeRate)
      );
      audit.record("NY-IT201", "57", "Part-year Yonkers resident income tax surcharge",
        partYearYonkersSurcharge,
        "max(0, IT-360.1 line 56 - line 64) × IT-360.1 line 73 income percentage × 16.75%", {
          "Total New York State taxes (IT-360.1 line 56)": worksheet.line46TotalNewYorkStateTaxes.toString(),
          "Refundable credits (IT-360.1 line 64)": worksheet.refundableCreditOffsets.toString(),
          "Net state tax (IT-360.1 line 65)": line65NetStateTax.toString(),
          "Income percentage (IT-360.1 line 73)": incomePercentage.toString(),
          "Resident-period net state tax (IT-360.1 line 74)": line74ResidentPeriodNetStateTax.toString(),
          "Yonkers resident tax rate (IT-360.1 line 76)": constants.residentSurchargeRate.toString(),
        });
      break;
    }

    case "none": {
      // No Yonkers connection — all lines zero
      audit.record("NY-IT201", "55", "Yonkers resident income tax surcharge", ZERO,
        "Not a Yonkers resident or worker");
      break;
    }
  }

  const totalYonkersTax = yonkersResidentSurcharge
    .plus(yonkersNonresidentEarningsTax)
    .plus(partYearYonkersSurcharge);

  return {
    yonkersResidencyStatus: input.yonkersResidencyStatus,
    yonkersResidentSurcharge,
    yonkersNonresidentEarningsTax,
    partYearYonkersSurcharge,
    totalYonkersTax,
    lines: audit.getLines(),
  };
}

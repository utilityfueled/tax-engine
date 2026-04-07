/**
 * New York IT-201 standard deduction, dependent exemptions, and taxable income.
 * Computes IT-201 lines 34-38.
 * Spec: spec/state/ny-it201-standard-deduction.yaml
 */

import Decimal from "decimal.js";
import {
  NY_IT201_RESIDENT_CONSTANTS,
  type FilingStatus,
  type NYIT201ResidentYearConstants,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

/* ---------- Types ---------- */

export type NYStandardDeductionYear = Pick<
  NYIT201ResidentYearConstants,
  "standardDeduction" | "singleDependentStandardDeduction" | "dependentExemption"
>;

export interface NYIT201DeductionInput {
  /** New York adjusted gross income (IT-201 line 33) */
  nyAgi: Decimal | string | number;
  filingStatus: FilingStatus;
  /** Whether this taxpayer can be claimed as a dependent on another return (item C) */
  canBeClaimedAsDependent?: boolean;
  /** For married filing separately, whether the spouse also itemizes on their New York return */
  spouseUsesItemizedDeduction?: boolean;
  /** Number of dependents listed on IT-201 item H */
  numberOfDependents?: number;
  /** NY itemized deduction from Form IT-196, line 49 (if itemizing) */
  nyItemizedDeduction?: Decimal | string | number;
  taxYear: number;
}

export interface NYIT201DeductionResult {
  nyAgi: Decimal;
  standardDeduction: Decimal;
  itemizedDeduction: Decimal;
  deductionUsed: "standard" | "itemized";
  deductionAmount: Decimal;
  agiMinusDeduction: Decimal;
  dependentExemption: Decimal;
  numberOfDependents: number;
  taxableIncome: Decimal;
  lines: CalculatedLine[];
}

/* ---------- Constants ---------- */

export const NY_DEDUCTION_CONSTANTS: Record<number, NYStandardDeductionYear> =
  Object.fromEntries(
    Object.entries(NY_IT201_RESIDENT_CONSTANTS).map(([year, constants]) => [
      Number(year),
      {
        standardDeduction: constants.standardDeduction,
        singleDependentStandardDeduction:
          constants.singleDependentStandardDeduction,
        dependentExemption: constants.dependentExemption,
      },
    ])
  ) as Record<number, NYStandardDeductionYear>;

/* ---------- Main computation ---------- */

export function calculateNYIT201Deduction(
  input: NYIT201DeductionInput
): NYIT201DeductionResult {
  const constants = NY_DEDUCTION_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`NY IT-201 deduction constants not available for tax year ${input.taxYear}`);
  }

  const nyAgi = d(input.nyAgi);
  const audit = new AuditTrail();

  // Line 34: Standard or itemized deduction
  let standardDeduction = constants.standardDeduction[input.filingStatus];
  if (input.filingStatus === "single" && input.canBeClaimedAsDependent) {
    standardDeduction = constants.singleDependentStandardDeduction;
  }

  const itemizedDeduction = d(input.nyItemizedDeduction);
  const deductionUsed = itemizedDeduction.greaterThan(standardDeduction) ? "itemized" as const : "standard" as const;
  if (
    input.filingStatus === "married_filing_separately"
    && deductionUsed === "itemized"
    && input.spouseUsesItemizedDeduction !== true
  ) {
    throw new Error(
      "NY IT-201 married filing separately returns may use an itemized deduction only if both spouses elect to itemize on their New York returns"
    );
  }

  const deductionAmount = deductionUsed === "itemized" ? itemizedDeduction : standardDeduction;

  audit.record("NY-IT201", "34", "Standard or itemized deduction", deductionAmount,
    `${deductionUsed === "standard" ? "NY standard deduction" : "NY itemized deduction (Form IT-196 line 49)"}`, {
      "Filing status": input.filingStatus,
      "Standard deduction": standardDeduction.toString(),
      "Itemized deduction": itemizedDeduction.toString(),
      "Deduction used": deductionUsed,
      "Spouse also itemizes": input.spouseUsesItemizedDeduction === true ? "Yes" : "No",
    });

  // Line 35: NY AGI minus deduction
  const agiMinusDeduction = nyAgi.minus(deductionAmount);
  audit.record("NY-IT201", "35", "NY AGI minus deduction", agiMinusDeduction,
    "Line 33 - Line 34", {
      "Line 33": nyAgi.toString(),
      "Line 34": deductionAmount.toString(),
    });

  // Line 36: Dependent exemption
  const numberOfDependents = input.numberOfDependents ?? 0;
  const dependentExemption = constants.dependentExemption.times(numberOfDependents);
  audit.record("NY-IT201", "36", "Dependent exemption amount", dependentExemption,
    "Number of dependents × $1,000", {
      "Number of dependents": numberOfDependents.toString(),
    });

  // Lines 37-38: Taxable income
  const taxableIncome = zeroFloor(agiMinusDeduction.minus(dependentExemption));
  audit.record("NY-IT201", "37-38", "New York taxable income", taxableIncome,
    "max(0, Line 35 - Line 36)", {
      "Line 35": agiMinusDeduction.toString(),
      "Line 36": dependentExemption.toString(),
    });

  return {
    nyAgi,
    standardDeduction,
    itemizedDeduction,
    deductionUsed,
    deductionAmount,
    agiMinusDeduction,
    dependentExemption,
    numberOfDependents,
    taxableIncome,
    lines: audit.getLines(),
  };
}

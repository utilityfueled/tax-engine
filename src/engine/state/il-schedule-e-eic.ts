/**
 * Illinois Schedule IL-E/EIC — Exemption and Earned Income Credit Schedule
 * Spec: spec/state/il-schedule-e-eic.yaml
 *
 * Computes:
 *   Step 2: Dependent count for IL-1040 Line 10d exemption
 *   Step 3: Illinois Earned Income Credit (20% of federal EIC for 2025)
 *   Step 4: Illinois Child Tax Credit (40% of IL EITC for Step 2 dependent children under 12)
 *
 * Required attachment when claiming dependent exemptions, IL EITC, or IL CTC.
 * For nonresidents/part-year: EITC and CTC are allocated by Schedule NR decimal.
 * A Step 3 qualifying child who is not also listed as a dependent does not
 * satisfy the Illinois Child Tax Credit eligibility test.
 */

import Decimal from "decimal.js";
import { roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_1040_CONSTANTS,
  IL_SCHEDULE_E_EIC_CONSTANTS as SHARED_IL_SCHEDULE_E_EIC_CONSTANTS,
  type IllinoisScheduleEEICConstants,
} from "@/models/constants.js";
import {
  calculateIllinoisExpandedEITCWorksheet,
  type IllinoisExpandedEITCWorksheetInput,
  type IllinoisExpandedEITCWorksheetResult,
} from "./il-expanded-eitc-worksheet.js";

export type ILScheduleEEICConstants = IllinoisScheduleEEICConstants;
export const IL_SCHEDULE_E_EIC_CONSTANTS = SHARED_IL_SCHEDULE_E_EIC_CONSTANTS;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Dependent information for Schedule IL-E/EIC Step 2.
 * Each dependent listed contributes to the dependent exemption count and
 * potentially qualifies the filer for the IL Child Tax Credit.
 */
export interface ILDependent {
  /** Dependent's relationship to taxpayer (e.g., "child", "stepchild", "foster child") */
  relationship: string;
  /** Whether the dependent is under age 12 as of December 31 of the tax year */
  isUnder12: boolean;
  /** Months the dependent lived in the taxpayer's home (1-12; for part-year, only IL months) */
  monthsInHome: number;
}

export type ILQualifyingChild = ILDependent;

export interface ScheduleEEICInput {
  taxYear: number;

  /** List of qualifying dependents */
  dependents: ILDependent[];

  /**
   * Step 3 qualifying children who are not listed as Step 2 dependents.
   * They can support Illinois EITC qualification but do not increase
   * the Line 10d dependent exemption count or create Illinois Child Tax Credit eligibility.
   */
  qualifyingChildren?: ILQualifyingChild[];

  /** Federal earned income credit (from federal Form 1040 / Schedule EIC) */
  federalEIC: Decimal;

  /**
   * Schedule IL-E/EITC Step 4, Line 6 override from the Illinois Expanded EITC
   * Worksheet, Line 23. Use when Illinois allows EITC beyond the federal amount.
   */
  expandedEITCWorksheetCredit?: Decimal;
  expandedEITCWorksheet?: IllinoisExpandedEITCWorksheetInput;

  /** Schedule NR allocation decimal (0-1.000); omit or set to 1 for full-year residents */
  allocationDecimal?: Decimal;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScheduleEEICResult {
  /** Supporting count from the Step 2 table */
  dependentCount: number;

  /** Step 2, Line 1: Dependent exemption allowance */
  dependentExemptionAllowance: Decimal;

  /** Whether the filer has at least one Step 2 dependent child under 12 */
  hasChildUnder12: boolean;

  /** Step 3, Line 2: Federal EIC amount */
  federalEIC: Decimal;

  /** Step 4, Line 6: Base credit amount used to compute Illinois EITC */
  eitcBaseCredit: Decimal;

  /** Optional calculated expanded-worksheet result used for Line 6 */
  expandedEITCWorksheet?: IllinoisExpandedEITCWorksheetResult;

  /** Step 4, Line 9: Illinois EITC (Line 6 base credit × 20% × allocation decimal) */
  ilEITC: Decimal;

  /** Step 4, Line 5: Illinois Child Tax Credit (IL EITC × 40%, if a Step 2 dependent child is under 12) */
  ilChildTaxCredit: Decimal;

  /** Audit trail */
  lines: CalculatedLine[];
}

function validateMonthsInHome(entries: ILDependent[], label: "dependent" | "qualifying child"): void {
  for (const [index, entry] of entries.entries()) {
    if (!Number.isInteger(entry.monthsInHome) || entry.monthsInHome < 0 || entry.monthsInHome > 12) {
      throw new Error(
        `Schedule IL-E/EIC ${label} ${index + 1} months in home must be a whole number from 0 through 12`,
      );
    }
  }
}

function validateAllocationDecimal(allocationDecimal: Decimal | undefined): void {
  if (!allocationDecimal) {
    return;
  }

  if (allocationDecimal.lessThan(0) || allocationDecimal.greaterThan(1)) {
    throw new Error("Schedule IL-E/EIC allocation decimal must be between 0 and 1 inclusive");
  }
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleEEIC(input: ScheduleEEICInput): ScheduleEEICResult {
  const c = IL_SCHEDULE_E_EIC_CONSTANTS[input.taxYear];
  const form1040Constants = IL_1040_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL Schedule IL-E/EIC constants not available for tax year ${input.taxYear}`);
  }
  if (!form1040Constants) {
    throw new Error(`IL-1040 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const FORM = "Schedule IL-E/EIC";
  const qualifyingChildren = input.qualifyingChildren ?? [];

  validateMonthsInHome(input.dependents, "dependent");
  validateMonthsInHome(qualifyingChildren, "qualifying child");
  validateAllocationDecimal(input.allocationDecimal);

  const expandedWorksheetResult = input.expandedEITCWorksheet
    ? calculateIllinoisExpandedEITCWorksheet(input.expandedEITCWorksheet)
    : undefined;
  if (expandedWorksheetResult) {
    audit.merge(expandedWorksheetResult.lines);
  }

  // ---- Step 2: Dependent Information ----
  const dependentCount = input.dependents.length;
  const dependentExemptionAllowance = form1040Constants.personalExemption.times(dependentCount);
  const hasDependentChildUnder12 = input.dependents.some((dep) => dep.isUnder12);
  const hasStep3ChildUnder12 = qualifyingChildren.some((child) => child.isUnder12);
  const hasChildUnder12 = hasDependentChildUnder12;

  audit.record(
    FORM,
    "1",
    "Dependent exemption allowance",
    dependentExemptionAllowance,
    "Count of qualifying dependents listed in Step 2 × $2,850",
    {
      dependentCount: new Decimal(dependentCount),
      exemptionPerDependent: form1040Constants.personalExemption,
    },
  );

  audit.record(
    FORM,
    "Step 3",
    "Qualifying children not listed as dependents",
    new Decimal(qualifyingChildren.length),
    "Count of Step 3 qualifying children listed separately from dependents",
    {
      qualifyingChildren: new Decimal(qualifyingChildren.length),
      hasStep3ChildUnder12: String(hasStep3ChildUnder12),
    },
  );

  // ---- Step 3: Illinois Earned Income Credit ----
  const allocDecimal = input.allocationDecimal ?? new Decimal(1);

  const line2 = audit.record(FORM, "2", "Federal earned income credit",
    input.federalEIC, "Federal Form 1040, Schedule EIC",
    { federalEIC: input.federalEIC });

  const line6 = audit.record(
    FORM,
    "6",
    "EITC base amount used for Illinois calculation",
    input.expandedEITCWorksheetCredit ?? expandedWorksheetResult?.line23 ?? line2,
    input.expandedEITCWorksheetCredit
      ? "Illinois Expanded EITC Worksheet, Line 23"
      : expandedWorksheetResult
        ? "Calculated Illinois Expanded EITC Worksheet, Line 23"
      : "Federal Form 1040 or 1040-SR, Line 27a",
    {
      federalEIC: line2,
      expandedEITCWorksheetCredit: input.expandedEITCWorksheetCredit ?? new Decimal(0),
      calculatedExpandedEITCWorksheetCredit: expandedWorksheetResult?.line23 ?? new Decimal(0),
    },
  );

  audit.record(FORM, "3a", "Illinois EITC rate", c.eitcRate,
    "20% for 2025", { rate: c.eitcRate });

  const ilEITC = roundDollar(line6.times(c.eitcRate).times(allocDecimal));
  audit.record(FORM, "3", "Illinois Earned Income Credit", ilEITC,
    allocDecimal.equals(1)
      ? "Line 6 × 20%"
      : "Line 6 × 20% × Schedule NR allocation decimal",
    { line6, eitcRate: c.eitcRate, allocationDecimal: allocDecimal });

  // ---- Step 4: Illinois Child Tax Credit ----
  audit.record(FORM, "4", "Illinois EITC from Line 3", ilEITC,
    "Line 3", { ilEITC });

  audit.record(FORM, "5a", "Illinois CTC rate", c.childTaxCreditRate,
    "40% for 2025", { rate: c.childTaxCreditRate });

  let ilChildTaxCredit = new Decimal(0);
  if (hasDependentChildUnder12 && ilEITC.greaterThan(0)) {
    ilChildTaxCredit = roundDollar(ilEITC.times(c.childTaxCreditRate));
  }
  audit.record(FORM, "5", "Illinois Child Tax Credit", ilChildTaxCredit,
    hasDependentChildUnder12
      ? "Line 4 × 40% (Step 2 dependent child under 12)"
      : "Not eligible (no Step 2 dependent child under 12)",
    {
      ilEITC,
      childTaxCreditRate: c.childTaxCreditRate,
      hasChildUnder12: String(hasChildUnder12),
      hasDependentChildUnder12: String(hasDependentChildUnder12),
      hasStep3ChildUnder12: String(hasStep3ChildUnder12),
    });

  return {
    dependentCount,
    dependentExemptionAllowance,
    hasChildUnder12,
    federalEIC: line2,
    eitcBaseCredit: line6,
    expandedEITCWorksheet: expandedWorksheetResult,
    ilEITC,
    ilChildTaxCredit,
    lines: audit.getLines(),
  };
}

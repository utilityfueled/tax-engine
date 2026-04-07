/**
 * New Jersey NJ-1040 medical expenses deduction computation.
 * Spec: spec/state/nj-1040-medical-expenses.yaml
 *
 * NJ allows a deduction for unreimbursed medical/dental expenses exceeding
 * 2% of NJ gross income. This is more generous than the federal 7.5% floor.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

const NJ_MEDICAL_EXPENSE_FLOOR_RATE = new Decimal("0.02");

export interface NJ1040MedicalExpensesInput {
  taxYear: number;
  /** NJ gross income (Line 29) */
  njGrossIncome: Decimal | string | number;
  /** Total medical and dental expenses paid during the tax year */
  totalMedicalExpenses?: Decimal | string | number;
  /** Insurance reimbursements received for medical expenses */
  insuranceReimbursements?: Decimal | string | number;
  /** Worksheet F line 4 qualified Archer MSA contributions */
  archerMSADeduction?: Decimal | string | number;
  /** Worksheet F line 5 self-employed health insurance deduction */
  selfEmployedHealthInsuranceDeduction?: Decimal | string | number;
}

export interface NJ1040MedicalExpensesResult {
  /** Total medical/dental expenses */
  totalExpenses: Decimal;
  /** Insurance reimbursements */
  reimbursements: Decimal;
  /** Unreimbursed expenses (total - reimbursements, floored at 0) */
  unreimbursedExpenses: Decimal;
  /** 2% of NJ gross income threshold */
  threshold: Decimal;
  /** Worksheet F line 4 qualified Archer MSA contributions */
  archerMSADeduction: Decimal;
  /** Worksheet F line 5 self-employed health insurance deduction */
  selfEmployedHealthInsuranceDeduction: Decimal;
  /** Deductible medical expenses (unreimbursed - threshold, floored at 0) */
  deduction: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040MedicalExpenses(
  input: NJ1040MedicalExpensesInput
): NJ1040MedicalExpensesResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 medical expense deduction rules");

  const audit = new AuditTrail();

  const njGrossIncome = d(input.njGrossIncome);
  const totalExpenses = d(input.totalMedicalExpenses);
  const reimbursements = d(input.insuranceReimbursements);
  const archerMSADeduction = zeroFloor(d(input.archerMSADeduction));
  const selfEmployedHealthInsuranceDeduction = zeroFloor(
    d(input.selfEmployedHealthInsuranceDeduction)
  );

  // Unreimbursed expenses (cannot be negative)
  const unreimbursedExpenses = zeroFloor(totalExpenses.minus(reimbursements));

  audit.record(
    "NJ-1040",
    "medical-total",
    "Total unreimbursed medical and dental expenses",
    unreimbursedExpenses,
    "Total medical expenses minus insurance reimbursements (floored at zero)",
    {
      "Total expenses": totalExpenses,
      "Reimbursements": reimbursements,
    }
  );

  // 2% threshold
  const threshold = njGrossIncome.times(NJ_MEDICAL_EXPENSE_FLOOR_RATE);

  audit.record(
    "NJ-1040",
    "threshold",
    "2% of NJ gross income threshold",
    threshold,
    "NJ gross income × 2%",
    {
      "NJ gross income": njGrossIncome,
      "Floor rate": "2%",
    }
  );

  audit.record(
    "NJ-1040",
    "worksheet-f-line-4",
    "Qualified Archer MSA contributions",
    archerMSADeduction,
    "Worksheet F line 4 carryforward from the supported federal Archer MSA deduction"
  );

  audit.record(
    "NJ-1040",
    "worksheet-f-line-5",
    "Self-employed health insurance deduction",
    selfEmployedHealthInsuranceDeduction,
    "Worksheet F line 5 carryforward from the supported federal self-employed health insurance deduction"
  );

  // Worksheet F line 31: excess medical expenses plus lines 4 and 5.
  const deduction = zeroFloor(unreimbursedExpenses.minus(threshold))
    .plus(archerMSADeduction)
    .plus(selfEmployedHealthInsuranceDeduction);

  audit.record(
    "NJ-1040",
    "deduction",
    "NJ medical expense deduction",
    deduction,
    "max(0, unreimbursed expenses - 2% threshold) + Worksheet F line 4 + Worksheet F line 5",
    {
      "Unreimbursed expenses": unreimbursedExpenses,
      "Threshold": threshold,
      "Worksheet F line 4": archerMSADeduction,
      "Worksheet F line 5": selfEmployedHealthInsuranceDeduction,
    }
  );

  return {
    totalExpenses,
    reimbursements,
    unreimbursedExpenses,
    threshold,
    archerMSADeduction,
    selfEmployedHealthInsuranceDeduction,
    deduction,
    lines: audit.getLines(),
  };
}

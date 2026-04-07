/**
 * New Jersey NJ-1040 line 36 Organ/Bone Marrow Donation Deduction.
 * Spec: spec/state/nj-1040-organ-donation-deduction.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, zeroFloor } from "@/utils/decimal.js";

const ORGAN_DONATION_DEDUCTION_CAP = new Decimal(10000);

export interface NJ1040OrganDonationDeductionInput {
  /** Combined eligible unreimbursed travel, lodging, and lost wages for the return */
  organDonationDeductionExpenses?: Decimal | string | number;
}

export interface NJ1040OrganDonationDeductionResult {
  eligibleExpenses: Decimal;
  deduction: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040OrganDonationDeduction(
  input: NJ1040OrganDonationDeductionInput
): NJ1040OrganDonationDeductionResult {
  const audit = new AuditTrail();

  const eligibleExpenses = zeroFloor(d(input.organDonationDeductionExpenses));
  const deduction = Decimal.min(eligibleExpenses, ORGAN_DONATION_DEDUCTION_CAP);

  audit.record(
    "NJ-1040",
    "eligible-expenses",
    "Qualified unreimbursed organ or bone marrow donation expenses",
    eligibleExpenses,
    "Eligible unreimbursed travel, lodging, and lost wages related to the donation (floored at zero)"
  );

  audit.record(
    "NJ-1040",
    "36",
    "Organ/Bone Marrow Donation Deduction",
    deduction,
    "min($10,000, eligible unreimbursed expenses)",
    {
      "Eligible expenses": eligibleExpenses,
      "Return cap": ORGAN_DONATION_DEDUCTION_CAP,
    }
  );

  return {
    eligibleExpenses,
    deduction,
    lines: audit.getLines(),
  };
}

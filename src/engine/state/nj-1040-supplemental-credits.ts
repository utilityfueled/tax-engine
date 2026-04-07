/**
 * New Jersey NJ-1040 supplemental nonrefundable credits (lines 46-49).
 * Spec: spec/state/nj-1040-supplemental-credits.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

const MONTHS_IN_YEAR = new Decimal(12);
const ORGAN_DONOR_CREDIT_RATE = new Decimal("0.25");
const ORGAN_DONOR_MAX_DAYS = new Decimal(30);

export interface NJ1040OrganDonorLeaveEventInput {
  paidLeaveCompensation?: Decimal | string | number;
  missedWorkDays: number;
}

export interface NJ1040SupplementalCreditsInput {
  taxYear: number;
  monthsOfResidency: number;
  shelteredWorkshopCurrentYearCredit?: Decimal | string | number;
  goldStarCounselingHours?: Decimal | string | number;
  goldStarTricareRate?: Decimal | string | number;
  organDonorLeaveEvents?: NJ1040OrganDonorLeaveEventInput[];
}

export interface NJ1040SupplementalCreditsResult {
  line46ShelteredWorkshopCredit: Decimal;
  line47GoldStarFamilyCounselingCredit: Decimal;
  line48OrganDonorEmployerCredit: Decimal;
  line49TotalCredits: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040SupplementalCredits(
  input: NJ1040SupplementalCreditsInput
): NJ1040SupplementalCreditsResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 supplemental credit rules");

  const audit = new AuditTrail();
  const months = Math.max(0, Math.min(12, input.monthsOfResidency));
  const shelteredWorkshopCurrentYearCredit = zeroFloor(
    d(input.shelteredWorkshopCurrentYearCredit)
  );
  const goldStarCounselingHours = zeroFloor(d(input.goldStarCounselingHours));
  const goldStarTricareRate = zeroFloor(d(input.goldStarTricareRate));

  const line46ShelteredWorkshopCredit = months === 12
    ? shelteredWorkshopCurrentYearCredit
    : shelteredWorkshopCurrentYearCredit.dividedBy(MONTHS_IN_YEAR).times(months);

  audit.record(
    "NJ-1040",
    "46",
    "Sheltered Workshop Tax Credit",
    line46ShelteredWorkshopCredit,
    months === 12
      ? "Current-year Form GIT-317 Part IV line 12 credit"
      : "Current-year Form GIT-317 Part IV line 12 credit / 12 × months of NJ residency",
    {
      "Current-year credit": shelteredWorkshopCurrentYearCredit,
      "Months of residency": months.toString(),
    }
  );

  const line47GoldStarFamilyCounselingCredit =
    goldStarCounselingHours.times(goldStarTricareRate);

  audit.record(
    "NJ-1040",
    "47",
    "Gold Star Family Counseling Credit",
    line47GoldStarFamilyCounselingCredit,
    "Qualifying counseling hours × TRICARE rate",
    {
      "Qualifying counseling hours": goldStarCounselingHours,
      "TRICARE rate": goldStarTricareRate,
    }
  );

  const line48OrganDonorEmployerCredit = (input.organDonorLeaveEvents ?? []).reduce(
    (total, event) => {
      const paidLeaveCompensation = zeroFloor(d(event.paidLeaveCompensation));
      const missedWorkDays = new Decimal(Math.max(0, event.missedWorkDays));
      if (paidLeaveCompensation.equals(0) || missedWorkDays.equals(0)) {
        return total;
      }

      const eligibleDays = Decimal.min(missedWorkDays, ORGAN_DONOR_MAX_DAYS);
      const eligibleCompensation = paidLeaveCompensation.times(
        eligibleDays.dividedBy(missedWorkDays)
      );

      return total.plus(eligibleCompensation.times(ORGAN_DONOR_CREDIT_RATE));
    },
    new Decimal(0)
  );

  audit.record(
    "NJ-1040",
    "48",
    "Credit for Employer of Organ/Bone Marrow Donor",
    line48OrganDonorEmployerCredit,
    "Sum of 25% of eligible paid leave compensation, capped at 30 days per donation",
    {
      "Supported donor-leave events": String((input.organDonorLeaveEvents ?? []).length),
      "Credit rate": ORGAN_DONOR_CREDIT_RATE.toString(),
      "Maximum days per donation": ORGAN_DONOR_MAX_DAYS.toString(),
    }
  );

  const line49TotalCredits = sum(
    line46ShelteredWorkshopCredit,
    line47GoldStarFamilyCounselingCredit,
    line48OrganDonorEmployerCredit
  );

  audit.record(
    "NJ-1040",
    "49",
    "Total supplemental nonrefundable credits",
    line49TotalCredits,
    "Line 46 + Line 47 + Line 48",
    {
      "Line 46": line46ShelteredWorkshopCredit,
      "Line 47": line47GoldStarFamilyCounselingCredit,
      "Line 48": line48OrganDonorEmployerCredit,
    }
  );

  return {
    line46ShelteredWorkshopCredit,
    line47GoldStarFamilyCounselingCredit,
    line48OrganDonorEmployerCredit,
    line49TotalCredits,
    lines: audit.getLines(),
  };
}

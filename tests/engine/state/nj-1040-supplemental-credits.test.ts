/**
 * Tests for NJ-1040 supplemental nonrefundable credits (lines 46-49).
 * Spec: spec/state/nj-1040-supplemental-credits.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040SupplementalCredits } from "@/engine/state/nj-1040-supplemental-credits.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 supplemental credits", () => {
  it("NJ-1040 supplemental credits - sheltered workshop credit is prorated for part-year residents", () => {
    const result = calculateNJ1040SupplementalCredits({
      taxYear: 2025,
      monthsOfResidency: 6,
      shelteredWorkshopCurrentYearCredit: 1200,
    });

    expect(result.line46ShelteredWorkshopCredit).toEqual(d(600));
  });

  it("NJ-1040 supplemental credits - Gold Star counseling credit equals hours times TRICARE rate", () => {
    const result = calculateNJ1040SupplementalCredits({
      taxYear: 2025,
      monthsOfResidency: 12,
      goldStarCounselingHours: 12.5,
      goldStarTricareRate: 68,
    });

    expect(result.line47GoldStarFamilyCounselingCredit).toEqual(d(850));
  });

  it("NJ-1040 supplemental credits - organ donor credit caps each donation at 30 days", () => {
    const result = calculateNJ1040SupplementalCredits({
      taxYear: 2025,
      monthsOfResidency: 12,
      organDonorLeaveEvents: [
        { paidLeaveCompensation: 4000, missedWorkDays: 20 },
        { paidLeaveCompensation: 9000, missedWorkDays: 45 },
      ],
    });

    expect(result.line48OrganDonorEmployerCredit).toEqual(d(2500));
  });

  it("NJ-1040 supplemental credits - line 49 sums all supported nonrefundable credits", () => {
    const result = calculateNJ1040SupplementalCredits({
      taxYear: 2025,
      monthsOfResidency: 12,
      shelteredWorkshopCurrentYearCredit: 1200,
      goldStarCounselingHours: 10,
      goldStarTricareRate: 50,
      organDonorLeaveEvents: [{ paidLeaveCompensation: 4000, missedWorkDays: 20 }],
    });

    expect(result.line49TotalCredits).toEqual(d(2700));
  });
});

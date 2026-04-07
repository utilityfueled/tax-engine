/**
 * Tests for New Jersey NJ-1040 Wounded Warrior Caregivers Credit.
 * Spec: spec/state/nj-1040-wounded-warrior-credit.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040WoundedWarriorCredit } from "@/engine/state/nj-1040-wounded-warrior-credit.js";

describe("NJ-1040 Wounded Warrior Caregivers Credit", () => {
  it("NJ-1040 WWC - single filer at $50,000 remains eligible", () => {
    const result = calculateNJ1040WoundedWarriorCredit({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 50000,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 500,
      onlyCaregiver: true,
    });

    expect(result.incomeLimit.toNumber()).toBe(50000);
    expect(result.eligible).toBe(true);
    expect(result.credit.toNumber()).toBe(500);
  });

  it("NJ-1040 WWC - disability compensation above $675 caps the base credit", () => {
    const result = calculateNJ1040WoundedWarriorCredit({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      njGrossIncome: 100000,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 1200,
      onlyCaregiver: true,
    });

    expect(result.baseCredit.toNumber()).toBe(675);
    expect(result.credit.toNumber()).toBe(675);
  });

  it("NJ-1040 WWC - multiple caregivers prorate the credit by care expense share", () => {
    const result = calculateNJ1040WoundedWarriorCredit({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 42000,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 675,
      onlyCaregiver: false,
      careExpensesSharePercent: 40,
    });

    expect(result.baseCredit.toNumber()).toBe(675);
    expect(result.credit.toNumber()).toBe(270);
  });

  it("NJ-1040 WWC - income over the filing-status limit produces no credit", () => {
    const result = calculateNJ1040WoundedWarriorCredit({
      filingStatus: "head_of_household",
      taxYear: 2025,
      njGrossIncome: 100001,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 500,
      onlyCaregiver: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("NJ-1040 WWC - missing care eligibility produces no credit", () => {
    const result = calculateNJ1040WoundedWarriorCredit({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 30000,
      providedCareToQualifyingServiceMember: false,
      serviceMemberFederalDisabilityCompensation: 500,
      onlyCaregiver: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.credit.toNumber()).toBe(0);
  });
});

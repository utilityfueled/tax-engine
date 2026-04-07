/**
 * Tests for New Jersey Form NJ-1040-HW.
 * Spec: spec/state/nj-1040-hw.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040HW } from "@/engine/state/nj-1040-hw.js";

describe("NJ-1040-HW", () => {
  it("NJ-1040-HW - single filer under the threshold can claim the property tax credit", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 9000,
      isFilingNJ1040: false,
      isHomeowner: true,
      propertyTaxesPaid: 4200,
      taxpayerAge65OrOlder: true,
    });

    expect(result.filingThreshold.toNumber()).toBe(10000);
    expect(result.hwEligible).toBe(true);
    expect(result.propertyTaxCreditEligible).toBe(true);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.woundedWarriorCredit.toNumber()).toBe(0);
    expect(result.totalCredits.toNumber()).toBe(50);
  });

  it("NJ-1040-HW - filing NJ-1040 makes the standalone application unavailable", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 8000,
      isFilingNJ1040: true,
      isTenant: true,
      rentPaid: 18000,
      taxpayerAge65OrOlder: true,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 675,
    });

    expect(result.hwEligible).toBe(false);
    expect(result.propertyTaxCreditEligible).toBe(false);
    expect(result.woundedWarriorCreditEligible).toBe(false);
    expect(result.totalCredits.toNumber()).toBe(0);
  });

  it("NJ-1040-HW - below-threshold filer without the age or disability condition gets no property tax credit", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 7000,
      isFilingNJ1040: false,
      isTenant: true,
      rentPaid: 18000,
    });

    expect(result.hwEligible).toBe(true);
    expect(result.propertyTaxCreditEligible).toBe(false);
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("NJ-1040-HW - part-year MFS same-home filer gets a prorated $13 property tax credit", () => {
    const result = calculateNJ1040HW({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      njGrossIncome: 10000,
      isFilingNJ1040: false,
      isHomeowner: true,
      propertyTaxesPaid: 6000,
      taxpayerBlindOrDisabled: true,
      sharedMainHomeWithSpouse: true,
      monthsOfResidency: 6,
    });

    expect(result.hwEligible).toBe(true);
    expect(result.propertyTaxCreditEligible).toBe(true);
    expect(result.propertyTaxCredit.toNumber()).toBe(13);
  });

  it("NJ-1040-HW - tax-exempt rental property blocks the property tax credit", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 9000,
      isFilingNJ1040: false,
      isTenant: true,
      rentPaid: 18000,
      taxpayerAge65OrOlder: true,
      rentedTaxExemptProperty: true,
    });

    expect(result.hwEligible).toBe(true);
    expect(result.propertyTaxCreditEligible).toBe(false);
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("NJ-1040-HW - below-threshold caregiver can claim the wounded warrior credit without the property tax credit", () => {
    const result = calculateNJ1040HW({
      filingStatus: "head_of_household",
      taxYear: 2025,
      njGrossIncome: 18000,
      isFilingNJ1040: false,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 500,
      onlyCaregiver: true,
    });

    expect(result.filingThreshold.toNumber()).toBe(20000);
    expect(result.hwEligible).toBe(true);
    expect(result.propertyTaxCreditEligible).toBe(false);
    expect(result.woundedWarriorCreditEligible).toBe(true);
    expect(result.woundedWarriorCredit.toNumber()).toBe(500);
    expect(result.totalCredits.toNumber()).toBe(500);
  });

  it("NJ-1040-HW - multiple caregivers prorate the wounded warrior credit on Part II", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 9500,
      isFilingNJ1040: false,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 675,
      onlyCaregiver: false,
      careExpensesSharePercent: 40,
    });

    expect(result.woundedWarriorCreditEligible).toBe(true);
    expect(result.woundedWarriorCredit.toNumber()).toBe(270);
    expect(result.totalCredits.toNumber()).toBe(270);
  });

  it("NJ-1040-HW - eligible filer can claim both credits on one application", () => {
    const result = calculateNJ1040HW({
      filingStatus: "single",
      taxYear: 2025,
      njGrossIncome: 8500,
      isFilingNJ1040: false,
      isTenant: true,
      rentPaid: 12000,
      taxpayerAge65OrOlder: true,
      providedCareToQualifyingServiceMember: true,
      serviceMemberFederalDisabilityCompensation: 700,
      onlyCaregiver: true,
    });

    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.woundedWarriorCredit.toNumber()).toBe(675);
    expect(result.totalCredits.toNumber()).toBe(725);
  });
});

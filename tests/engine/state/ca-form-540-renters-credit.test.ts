/**
 * Tests for California Form 540 nonrefundable renter's credit.
 * Spec: spec/state/ca-form-540-renters-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540RentersCredit } from "@/engine/state/ca-form-540-renters-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 renter's credit", () => {
  it("CA Form 540 renter's credit Line 1 - part-year residents do not qualify", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "single",
      californiaAgi: d(20000),
      residentEntireYear: false,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("not_full_year_california_resident");
    expect(result.line46RentersCredit.toNumber()).toBe(0);
  });

  it("CA Form 540 renter's credit Line 2 - single filers qualify at the AGI threshold", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "single",
      californiaAgi: d(53994),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 6,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.incomeLimit.toNumber()).toBe(53994);
    expect(result.line46RentersCredit.toNumber()).toBe(60);
  });

  it("CA Form 540 renter's credit Line 3 - five months of rent is not enough", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "head_of_household",
      californiaAgi: d(40000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 5,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("did_not_rent_for_half_year");
  });

  it("CA Form 540 renter's credit Line 4-5 - a dependent who lived with the claimant for most of the year does not qualify", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "single",
      californiaAgi: d(10000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: true,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: true,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("dependent_lived_with_claimant_more_than_half_year");
  });

  it("CA Form 540 renter's credit Line 6 - possessory interest tax keeps tax-exempt property eligible", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "qualifying_surviving_spouse",
      californiaAgi: d(70000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: true,
      paidPossessoryInterestTaxOnRentingProperty: true,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line46RentersCredit.toNumber()).toBe(120);
  });

  it("CA Form 540 renter's credit Line 7-10 - married filing jointly with one homeowner exemption and separate residences gets $60", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "married_filing_jointly",
      californiaAgi: d(80000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      spouseClaimedHomeownersPropertyTaxExemption: true,
      livedApartFromSpouseEntireYear: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line46RentersCredit.toNumber()).toBe(60);
  });

  it("CA Form 540 renter's credit Line 11 - married filing separately can elect the full $120 when both spouses qualify in the same rental", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "married_filing_separately",
      californiaAgi: d(30000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      marriedFilingSeparateSharedRentalWithSpouse: true,
      bothMarriedFilingSeparateTaxpayersQualified: true,
      marriedFilingSeparateCreditAllocation: "full",
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line46RentersCredit.toNumber()).toBe(120);
  });

  it("CA Form 540 renter's credit - invalid full allocation outside the shared qualifying MFS case is rejected", () => {
    expect(() =>
      calculateCAForm540RentersCredit({
        filingStatus: "married_filing_separately",
        californiaAgi: d(30000),
        residentEntireYear: true,
        monthsRentedPrincipalResidenceInCalifornia: 12,
        canBeClaimedAsDependent: false,
        livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
        rentedPropertyTaxExemptMoreThanHalfYear: false,
        taxpayerClaimedHomeownersPropertyTaxExemption: false,
        marriedFilingSeparateSharedRentalWithSpouse: false,
        bothMarriedFilingSeparateTaxpayersQualified: false,
        marriedFilingSeparateCreditAllocation: "full",
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 renter's credit full allocation is only allowed when both married-filing-separately spouses qualify in the same rental");
  });

  it("CA Form 540 renter's credit Line 46 - audit trail records the qualification path and final credit amount", () => {
    const result = calculateCAForm540RentersCredit({
      filingStatus: "married_filing_separately",
      californiaAgi: d(30000),
      residentEntireYear: true,
      monthsRentedPrincipalResidenceInCalifornia: 12,
      canBeClaimedAsDependent: false,
      livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
      rentedPropertyTaxExemptMoreThanHalfYear: false,
      taxpayerClaimedHomeownersPropertyTaxExemption: false,
      marriedFilingSeparateSharedRentalWithSpouse: true,
      bothMarriedFilingSeparateTaxpayersQualified: true,
      marriedFilingSeparateCreditAllocation: "half",
      taxYear: 2025,
    });

    const line2 = result.lines.find((line) => line.form === "CA-540-RC" && line.line === "2");
    const line46 = result.lines.find((line) => line.form === "CA-540" && line.line === "46");

    expect(line2?.inputs).toMatchObject({
      "California AGI": "30000",
      "Filing status": "married_filing_separately",
    });
    expect(line46?.value.toNumber()).toBe(60);
    expect(line46?.inputs).toMatchObject({
      "Qualification status": "qualified",
      "Credit amount rule": "married_filing_separately_half",
    });
  });
});

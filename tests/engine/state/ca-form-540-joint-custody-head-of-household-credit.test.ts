/**
 * Tests for California Form 540 Joint Custody Head of Household credit.
 * Spec: spec/state/ca-form-540-joint-custody-head-of-household-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540JointCustodyHeadOfHouseholdCredit } from "@/engine/state/ca-form-540-joint-custody-head-of-household-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 Joint Custody Head of Household credit", () => {
  it("CA Form 540 Joint Custody Head of Household credit Line 1 - the worksheet starts from Form 540 line 35 subtotal tax before credits", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 180,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.line1TaxBeforeCredits.toNumber()).toBe(2000);
  });

  it("CA Form 540 Joint Custody Head of Household credit Line 2 - the 2025 worksheet uses a 30% credit rate", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 180,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.line2Rate.toString()).toBe("0.3");
  });

  it("CA Form 540 Joint Custody Head of Household credit Line 3 - 146 qualifying days and line 35 tax above the cap still produce the capped $610 credit", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(3000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 146,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3Credit.toNumber()).toBe(610);
  });

  it("CA Form 540 Joint Custody Head of Household credit - 219 qualifying days still qualify", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(1000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 219,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3Credit.toNumber()).toBe(300);
  });

  it("CA Form 540 Joint Custody Head of Household credit - 145 qualifying days do not qualify", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(1000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 145,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("qualifying_day_range_not_met");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Joint Custody Head of Household credit - married filing separately qualifies only when the taxpayer lived apart for the entire year", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "married_filing_separately",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: false,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: true,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 180,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3Credit.toNumber()).toBe(600);
  });

  it("CA Form 540 Joint Custody Head of Household credit - married filing separately without living apart all year does not qualify", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "married_filing_separately",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: false,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 180,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: false,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("marital_status_requirement_not_met");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Joint Custody Head of Household credit - a married qualifying child without a dependent exemption credit disqualifies the credit", () => {
    const result = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      taxBeforeCredits: d(2000),
      filingStatus: "single",
      notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
      livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
      furnishedOverOneHalfHomeCost: true,
      qualifyingChildRelationshipMet: true,
      qualifyingChildLivedInHomeDays: 180,
      custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
      qualifyingChildMarriedOrRegisteredDomesticPartner: true,
      entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("dependent_exemption_requirement_not_met");
    expect(result.line3Credit.toNumber()).toBe(0);
  });

  it("CA Form 540 Joint Custody Head of Household credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540JointCustodyHeadOfHouseholdCredit({
        taxBeforeCredits: d(2000),
        filingStatus: "single",
        notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
        livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
        furnishedOverOneHalfHomeCost: true,
        qualifyingChildRelationshipMet: true,
        qualifyingChildLivedInHomeDays: 180,
        custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
        qualifyingChildMarriedOrRegisteredDomesticPartner: false,
        entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 Joint Custody Head of Household credit constants not available for 2024");
  });
});

/**
 * Tests for California Form 540 resident total tax assembly.
 * Spec: spec/state/ca-form-540-total-tax.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540ResidentTotalTax } from "@/engine/state/ca-form-540-total-tax.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 resident total tax", () => {
  it("CA Form 540 resident total tax Line 31 - taxable income at $100,000 stays on the tax-table path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.line31Source).toBe("tax_table");
    expect(result.line31Tax.toNumber()).toBe(5736);
  });

  it("CA Form 540 resident total tax Line 32 - low-income resident tax can be reduced to zero by exemption credits", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(50),
      filingStatus: "single",
      federalAgi: d(50),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.line31Tax.toNumber()).toBe(0);
    expect(result.line32ExemptionCredits.toNumber()).toBe(153);
  });

  it("CA Form 540 resident total tax Line 33 - low-income resident tax can be reduced to zero by exemption credits", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(50),
      filingStatus: "single",
      federalAgi: d(50),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.line31Tax.toNumber()).toBe(0);
    expect(result.line32ExemptionCredits.toNumber()).toBe(153);
    expect(result.line33TaxAfterExemptionCredits.toNumber()).toBe(0);
  });

  it("CA Form 540 resident total tax Line 35 - line 34 additional tax adds to line 33", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line34Tax: d(17),
      taxYear: 2025,
    });

    expect(result.line33TaxAfterExemptionCredits.toNumber()).toBe(5583);
    expect(result.line34Tax.toNumber()).toBe(17);
    expect(result.line35Tax.toNumber()).toBe(5600);
  });

  it("CA Form 540 resident total tax Line 47 - total credits add only the real Form 540 credit lines", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(10),
      line43Credit: d(40),
      line44Credit: d(50),
      line45Credit: d(60),
      line46Credit: d(70),
      taxYear: 2025,
    });

    expect(result.line47TotalCredits.toNumber()).toBe(230);
    expect(result.lines.some((line) => line.form === "CA-540" && line.line === "41")).toBe(false);
    expect(result.lines.some((line) => line.form === "CA-540" && line.line === "42")).toBe(false);
  });

  it("CA Form 540 resident total tax Line 47 - phantom line 41 and line 42 inputs are rejected", () => {
    const invalidInput = {
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line41Credit: d(20),
      line42Credit: d(30),
      taxYear: 2025,
    } as unknown as Parameters<typeof calculateCAForm540ResidentTotalTax>[0];

    expect(() => calculateCAForm540ResidentTotalTax(invalidInput)).toThrow(
      "CA Form 540 does not support resident credit inputs for nonexistent lines 41 or 42"
    );
  });

  it("CA Form 540 resident total tax Line 40 - child and dependent care worksheet input overrides the placeholder line 40 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(35000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40ChildAndDependentCareCreditInput: {
        qualifiedExpensesIncurredInCalifornia: d(4000),
        qualifyingPersonCount: 1,
        taxpayerEarnedIncome: d(50000),
      },
      taxYear: 2025,
    });

    const worksheetLine12 = result.lines.find((line) => line.form === "CA-3506" && line.line === "12");
    const residentLine40 = result.lines.find((line) => line.form === "CA-540" && line.line === "40");

    expect(result.line40Credit.toNumber()).toBe(375);
    expect(result.line47TotalCredits.toNumber()).toBe(375);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(5208);
    expect(worksheetLine12?.value.toNumber()).toBe(375);
    expect(residentLine40?.inputs).toMatchObject({
      "Computation path": "ca_form_540_child_and_dependent_care_credit",
      "Qualification status": "qualified",
    });
  });

  it("CA Form 540 resident total tax Line 43 - Senior Head of Household worksheet input overrides the placeholder line 43 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "head_of_household",
      federalAgi: d(90000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 1,
      dependentExemptionCount: 0,
      line40Credit: d(10),
      line43SeniorHeadOfHouseholdCreditInput: {
        agiForQualification: d(98652),
        age65OrOlderOnDecember31: true,
        qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
      },
      taxYear: 2025,
    });

    const worksheetLine3 = result.lines.find((line) => line.form === "CA-SHOH" && line.line === "3");
    const residentLine43 = result.lines.find((line) => line.form === "CA-540" && line.line === "43");

    expect(result.line43Credit.toNumber()).toBe(1860);
    expect(result.line47TotalCredits.toNumber()).toBe(1870);
    expect(worksheetLine3?.value.toNumber()).toBe(1860);
    expect(residentLine43?.inputs).toMatchObject({
      "Computation path": "ca_form_540_senior_head_of_household_credit",
      "Qualification status": "qualified",
      "Credit code": "163",
    });
  });

  it("CA Form 540 resident total tax Line 44 - Joint Custody Head of Household worksheet input overrides the placeholder line 44 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(10),
      line44JointCustodyHeadOfHouseholdCreditInput: {
        notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
        livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
        furnishedOverOneHalfHomeCost: true,
        qualifyingChildRelationshipMet: true,
        qualifyingChildLivedInHomeDays: 180,
        custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
        qualifyingChildMarriedOrRegisteredDomesticPartner: false,
        entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      },
      taxYear: 2025,
    });

    const worksheetLine3 = result.lines.find((line) => line.form === "CA-JCHH" && line.line === "3");
    const residentLine44 = result.lines.find((line) => line.form === "CA-540" && line.line === "44");

    expect(result.line44Credit.toNumber()).toBe(610);
    expect(result.line47TotalCredits.toNumber()).toBe(620);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(4963);
    expect(worksheetLine3?.value.toNumber()).toBe(610);
    expect(residentLine44?.inputs).toMatchObject({
      "Computation path": "ca_form_540_joint_custody_head_of_household_credit",
      "Qualification status": "qualified",
      "Credit code": "170",
    });
  });

  it("CA Form 540 resident total tax Line 45 - Dependent Parent worksheet input overrides the placeholder line 45 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "married_filing_separately",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      line40Credit: d(10),
      line45DependentParentCreditInput: {
        marriedOrRegisteredDomesticPartnerAtYearEnd: true,
        spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
        furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      },
      taxYear: 2025,
    });

    const worksheetLine3 = result.lines.find((line) => line.form === "CA-DPC" && line.line === "3");
    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");

    expect(result.line45Credit.toNumber()).toBe(610);
    expect(result.line47TotalCredits.toNumber()).toBe(620);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(4488);
    expect(worksheetLine3?.value.toNumber()).toBe(610);
    expect(residentLine45?.inputs).toMatchObject({
      "Computation path": "ca_form_540_dependent_parent_credit",
      "Qualification status": "qualified",
      "Credit code": "173",
    });
  });

  it("CA Form 540 resident total tax Line 45 - supported special-credit worksheets aggregate on the placeholder line 45 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "married_filing_separately",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      line40Credit: d(10),
      line45DependentParentCreditInput: {
        marriedOrRegisteredDomesticPartnerAtYearEnd: true,
        spouseOrRdpNotMemberOfHouseholdDuringLastSixMonths: true,
        furnishedOverOneHalfDependentParentHouseholdExpenses: true,
      },
      line45ChildAdoptionCostsCreditInput: {
        qualifiedAdoptionCosts: d(10000),
        adoptionDecreeFinalInTaxYear: true,
        childIsUsCitizenOrLegalResident: true,
        childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      },
      taxYear: 2025,
    });

    const adoptionWorksheetLine4 = result.lines.find((line) => line.form === "CA-197" && line.line === "4");
    const dependentParentWorksheetLine3 = result.lines.find((line) => line.form === "CA-DPC" && line.line === "3");
    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");

    expect(result.line45Credit.toNumber()).toBe(3110);
    expect(result.line47TotalCredits.toNumber()).toBe(3120);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(1988);
    expect(adoptionWorksheetLine4?.value.toNumber()).toBe(2500);
    expect(dependentParentWorksheetLine3?.value.toNumber()).toBe(610);
    expect(residentLine45?.inputs).toMatchObject({
      "Computation path": "ca_form_540_line_45_special_credit_sum",
      "Credit codes": "173,197",
    });
  });

  it("CA Form 540 resident total tax Line 45 - Schedule P ordering preserves Child Adoption Costs carryover when earlier credits exhaust net tax", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(5000),
      line44JointCustodyHeadOfHouseholdCreditInput: {
        notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
        livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
        furnishedOverOneHalfHomeCost: true,
        qualifyingChildRelationshipMet: true,
        qualifyingChildLivedInHomeDays: 180,
        custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
        qualifyingChildMarriedOrRegisteredDomesticPartner: false,
        entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
      },
      line45ChildAdoptionCostsCreditInput: {
        qualifiedAdoptionCosts: d(10000),
        adoptionDecreeFinalInTaxYear: true,
        childIsUsCitizenOrLegalResident: true,
        childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      },
      line46RentersCreditInput: {
        californiaAgi: d(53994),
        residentEntireYear: true,
        monthsRentedPrincipalResidenceInCalifornia: 12,
        canBeClaimedAsDependent: false,
        livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
        rentedPropertyTaxExemptMoreThanHalfYear: false,
        taxpayerClaimedHomeownersPropertyTaxExemption: false,
      },
      taxYear: 2025,
    });

    const residentLine44 = result.lines.find((line) => line.form === "CA-540" && line.line === "44");
    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");
    const residentLine46 = result.lines.find((line) => line.form === "CA-540" && line.line === "46");
    const schedulePLine16d = result.lines.find((line) => line.form === "CA-P" && line.line === "16d");

    expect(result.line35Tax.toNumber()).toBe(5583);
    expect(result.line40Credit.toNumber()).toBe(5000);
    expect(result.line44Credit.toNumber()).toBe(583);
    expect(result.line45Credit.toNumber()).toBe(0);
    expect(result.line46Credit.toNumber()).toBe(0);
    expect(result.line45SupportedCarryoverCredit.toNumber()).toBe(5000);
    expect(result.line47TotalCredits.toNumber()).toBe(5583);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(0);
    expect(schedulePLine16d?.value.toNumber()).toBe(5000);
    expect(residentLine44?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": "12",
    });
    expect(residentLine45?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Credit code 197 carryover": "5000",
      "Schedule P line": "16",
    });
    expect(residentLine46?.inputs).toMatchObject({
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": "15",
    });
  });

  it("CA Form 540 resident total tax Line 45 - Schedule P ordering routes supported Schedule S and FTB 3804-CR credits through resident line 45", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(5000),
      line45OtherStateTaxCreditAmount: d(300),
      line45PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");
    const schedulePLine20b = result.lines.find((line) => line.form === "CA-P" && line.line === "20b");
    const schedulePLine21b = result.lines.find((line) => line.form === "CA-P" && line.line === "21b");
    const schedulePLine21d = result.lines.find((line) => line.form === "CA-P" && line.line === "21d");

    expect(result.line35Tax.toNumber()).toBe(5583);
    expect(result.line40Credit.toNumber()).toBe(5000);
    expect(result.line45Credit.toNumber()).toBe(583);
    expect(result.line45PassThroughEntityElectiveTaxCarryover.toNumber()).toBe(117);
    expect(result.line47TotalCredits.toNumber()).toBe(5583);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(0);
    expect(schedulePLine20b?.value.toNumber()).toBe(300);
    expect(schedulePLine21b?.value.toNumber()).toBe(283);
    expect(schedulePLine21d?.value.toNumber()).toBe(117);
    expect(residentLine45?.inputs).toMatchObject({
      "Computation path": "ca_form_540_line_45_supported_credit_sum",
      "Credit codes": "187,242",
      "Credit code 187 used this year": "300",
      "Credit code 242 used this year": "283",
      "Credit code 242 carryover": "117",
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": "20,21",
    });
  });

  it("CA Form 540 resident total tax Line 45 - an upstream Schedule P line 19 balance limits code 187 before code 242", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(5000),
      line45SchedulePLine19RemainingNetTaxBeforeOtherStateTaxCredit: d(200),
      line45OtherStateTaxCreditAmount: d(300),
      line45PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");
    const schedulePLine20b = result.lines.find((line) => line.form === "CA-P" && line.line === "20b");
    const schedulePLine21b = result.lines.find((line) => line.form === "CA-P" && line.line === "21b");
    const schedulePLine21d = result.lines.find((line) => line.form === "CA-P" && line.line === "21d");

    expect(result.line45Credit.toNumber()).toBe(200);
    expect(result.line45PassThroughEntityElectiveTaxCarryover.toNumber()).toBe(400);
    expect(result.line47TotalCredits.toNumber()).toBe(5200);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(383);
    expect(schedulePLine20b?.value.toNumber()).toBe(200);
    expect(schedulePLine21b?.value.toNumber()).toBe(0);
    expect(schedulePLine21d?.value.toNumber()).toBe(400);
    expect(residentLine45?.inputs).toMatchObject({
      "Credit code 187 used this year": "200",
      "Credit code 242 used this year": "0",
      "Credit code 242 carryover": "400",
      "Schedule P line": "20,21",
    });
  });

  it("CA Form 540 resident total tax Line 45 - additional Schedule P B2 carryover credits flow through resident line 45 before code 187 and code 242", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(5000),
      line45SchedulePAdditionalCarryoverCredits: [
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: d(300),
        },
        {
          code: "235",
          name: "College Access Tax Credit",
          amount: d(400),
          electedRefundableAmount: d(20),
        },
      ],
      line45OtherStateTaxCreditAmount: d(200),
      line45PassThroughEntityElectiveTaxCreditAmount: d(300),
      taxYear: 2025,
    });

    const residentLine45 = result.lines.find((line) => line.form === "CA-540" && line.line === "45");
    const schedulePLine17b = result.lines.find((line) => line.form === "CA-P" && line.line === "17b");
    const schedulePLine18d = result.lines.find((line) => line.form === "CA-P" && line.line === "18d");
    const schedulePLine20b = result.lines.find((line) => line.form === "CA-P" && line.line === "20b");
    const schedulePLine21d = result.lines.find((line) => line.form === "CA-P" && line.line === "21d");

    expect(result.line45Credit.toNumber()).toBe(583);
    expect(result.line47TotalCredits.toNumber()).toBe(5583);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(0);
    expect(result.line45AdditionalCarryoverCredits).toHaveLength(2);
    expect(result.line45AdditionalCarryoverCredits[0].creditUsedThisYear.toNumber()).toBe(300);
    expect(result.line45AdditionalCarryoverCredits[0].carryover.toNumber()).toBe(0);
    expect(result.line45AdditionalCarryoverCredits[1].creditUsedThisYear.toNumber()).toBe(283);
    expect(result.line45AdditionalCarryoverCredits[1].carryover.toNumber()).toBe(97);
    expect(schedulePLine17b?.value.toNumber()).toBe(300);
    expect(schedulePLine18d?.value.toNumber()).toBe(97);
    expect(schedulePLine20b?.value.toNumber()).toBe(0);
    expect(schedulePLine21d?.value.toNumber()).toBe(300);
    expect(residentLine45?.inputs).toMatchObject({
      "Computation path": "ca_form_540_line_45_supported_credit_sum",
      "Credit codes": "233,235,187,242",
      "Credit code 233 used this year": "300",
      "Credit code 233 carryover": "0",
      "Credit code 235 used this year": "283",
      "Credit code 235 carryover": "97",
      "Credit code 187 used this year": "0",
      "Credit code 242 used this year": "0",
      "Credit code 242 carryover": "300",
      "Schedule P line": "17,18,20,21",
    });
  });

  it("CA Form 540 resident total tax Line 46 - renter's credit worksheet input overrides the placeholder line 46 path", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100000),
      filingStatus: "single",
      federalAgi: d(100000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(10),
      line46RentersCreditInput: {
        californiaAgi: d(53994),
        residentEntireYear: true,
        monthsRentedPrincipalResidenceInCalifornia: 12,
        canBeClaimedAsDependent: false,
        livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
        rentedPropertyTaxExemptMoreThanHalfYear: false,
        taxpayerClaimedHomeownersPropertyTaxExemption: false,
      },
      taxYear: 2025,
    });

    const rentersWorksheetLine11 = result.lines.find((line) => line.form === "CA-540-RC" && line.line === "11");
    const residentLine46 = result.lines.find((line) => line.form === "CA-540" && line.line === "46");

    expect(result.line40Credit.toNumber()).toBe(10);
    expect(result.line46Credit.toNumber()).toBe(60);
    expect(result.line47TotalCredits.toNumber()).toBe(70);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(5513);
    expect(rentersWorksheetLine11?.value.toNumber()).toBe(60);
    expect(residentLine46?.inputs).toMatchObject({
      "Qualification status": "qualified",
      "Credit amount rule": "single",
      "Computation path": "ca_form_540_renters_credit",
    });
  });

  it("CA Form 540 resident total tax Line 48 - nonrefundable credits cannot reduce tax below zero", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100001),
      filingStatus: "single",
      federalAgi: d(100001),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(4000),
      line45Credit: d(2000),
      taxYear: 2025,
    });

    expect(result.line31Source).toBe("tax_rate_schedule");
    expect(result.line35Tax.toNumber()).toBe(5586);
    expect(result.line47TotalCredits.toNumber()).toBe(6000);
    expect(result.line48TaxAfterCredits.toNumber()).toBe(0);
  });

  it("CA Form 540 resident total tax Line 62 - taxable income above $1,000,000 adds the Behavioral Health Services Tax", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(1200000),
      filingStatus: "single",
      federalAgi: d(1200000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.line31Tax.toNumber()).toBe(128437);
    expect(result.line32ExemptionCredits.toNumber()).toBe(0);
    expect(result.line62BehavioralHealthServicesTax.toNumber()).toBe(2000);
  });

  it("CA Form 540 resident total tax Line 64 - resident total tax adds lines 48, 61, 62, and 63", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(1200000),
      filingStatus: "single",
      federalAgi: d(1200000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line61AlternativeMinimumTax: d(111),
      line63OtherTaxes: d(22),
      taxYear: 2025,
    });

    expect(result.line48TaxAfterCredits.toNumber()).toBe(128437);
    expect(result.line61AlternativeMinimumTax.toNumber()).toBe(111);
    expect(result.line62BehavioralHealthServicesTax.toNumber()).toBe(2000);
    expect(result.line63OtherTaxes.toNumber()).toBe(22);
    expect(result.line64TotalTax.toNumber()).toBe(130570);
    expect(result.lines.map((line) => line.line)).toContain("64");
  });

  it("CA Form 540 resident total tax - negative upstream credits are rejected", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(100000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line40Credit: d(-1),
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 line 40 credit must be non-negative");
  });

  it("CA Form 540 resident total tax - line 40 does not accept both a worksheet payload and a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(35000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line40Credit: d(375),
        line40ChildAndDependentCareCreditInput: {
          qualifiedExpensesIncurredInCalifornia: d(4000),
          qualifyingPersonCount: 1,
          taxpayerEarnedIncome: d(50000),
        },
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540 line 40 cannot accept both a child and dependent care worksheet input and a direct credit amount"
    );
  });

  it("CA Form 540 resident total tax - line 43 does not accept both a Senior Head of Household payload and a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "head_of_household",
        federalAgi: d(90000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 1,
        dependentExemptionCount: 0,
        line43Credit: d(1860),
        line43SeniorHeadOfHouseholdCreditInput: {
          agiForQualification: d(98652),
          age65OrOlderOnDecember31: true,
          qualifiedAsHeadOfHouseholdInPriorTwoYearsWithQualifyingPersonDeath: true,
        },
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540 line 43 cannot accept both a Senior Head of Household worksheet input and a direct credit amount"
    );
  });

  it("CA Form 540 resident total tax - line 44 does not accept both a Joint Custody Head of Household payload and a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(100000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line44Credit: d(25),
        line44JointCustodyHeadOfHouseholdCreditInput: {
          notMarriedOrRegisteredDomesticPartnerAtYearEnd: true,
          livedApartFromSpouseOrRdpEntireYearIfMarriedOrRegisteredDomesticPartner: false,
          furnishedOverOneHalfHomeCost: true,
          qualifyingChildRelationshipMet: true,
          qualifyingChildLivedInHomeDays: 180,
          custodyAgreementProvidesMoreThanHalfYearInParentsHomes: true,
          qualifyingChildMarriedOrRegisteredDomesticPartner: false,
          entitledToDependentExemptionCreditIfChildMarriedOrRegisteredDomesticPartner: false,
        },
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540 line 44 cannot accept both a Joint Custody Head of Household worksheet input and a direct credit amount"
    );
  });

  it("CA Form 540 resident total tax - line 46 does not accept both a worksheet payload and a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(100000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line46Credit: d(60),
        line46RentersCreditInput: {
          californiaAgi: d(53994),
          residentEntireYear: true,
          monthsRentedPrincipalResidenceInCalifornia: 12,
          canBeClaimedAsDependent: false,
          livedWithPersonWhoCanClaimDependentMoreThanHalfYear: false,
          rentedPropertyTaxExemptMoreThanHalfYear: false,
          taxpayerClaimedHomeownersPropertyTaxExemption: false,
        },
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 line 46 cannot accept both a renter's credit worksheet input and a direct credit amount");
  });

  it("CA Form 540 resident total tax - line 45 does not accept both supported worksheet payloads and a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(100000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line45Credit: d(2500),
        line45ChildAdoptionCostsCreditInput: {
          qualifiedAdoptionCosts: d(10000),
          adoptionDecreeFinalInTaxYear: true,
          childIsUsCitizenOrLegalResident: true,
          childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
        },
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540 line 45 cannot accept both supported worksheet inputs and a direct credit amount"
    );
  });

  it("CA Form 540 resident total tax - line 45 does not accept supported Schedule S or FTB 3804-CR amounts with a direct credit amount", () => {
    expect(() =>
      calculateCAForm540ResidentTotalTax({
        taxableIncome: d(100000),
        filingStatus: "single",
        federalAgi: d(100000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        line45Credit: d(100),
        line45OtherStateTaxCreditAmount: d(200),
        taxYear: 2025,
      })
    ).toThrow(
      "CA Form 540 line 45 cannot accept both supported worksheet inputs and a direct credit amount"
    );
  });

  it("CA Form 540 resident total tax - audit trail records the resident Form 540 lines and the supporting worksheet provenance", () => {
    const result = calculateCAForm540ResidentTotalTax({
      taxableIncome: d(100001),
      filingStatus: "single",
      federalAgi: d(100001),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      line40Credit: d(100),
      line61AlternativeMinimumTax: d(10),
      taxYear: 2025,
    });

    const residentLine31 = result.lines.find((line) => line.form === "CA-540" && line.line === "31");
    const residentLine62 = result.lines.find((line) => line.form === "CA-540" && line.line === "62");
    const worksheetLine = result.lines.find((line) => line.form === "CA-BHST" && line.line === "1");

    expect(residentLine31?.inputs).toMatchObject({
      "Computation path": "tax_rate_schedule",
    });
    expect(residentLine62?.inputs).toMatchObject({
      "Computation path": "resident_behavioral_health_services_tax",
    });
    expect(worksheetLine?.inputs).toMatchObject({
      "Return type": "resident",
      "Source line": "Form 540 line 19",
    });
  });
});

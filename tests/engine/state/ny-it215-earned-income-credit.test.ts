/**
 * Tests for New York IT-215 resident NYS EIC and Worksheet C NYC earned income credit.
 * Spec: spec/state/ny-it215-earned-income-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT215,
  computeNYCIT215Rate,
} from "@/engine/state/ny-it215-earned-income-credit.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

describe("NY IT-215 Earned Income Credit", () => {
  describe("Resident line 11 through line 16", () => {
    it("Line 11 - NYS EIC uses the fixed 30% rate", () => {
      const result = calculateNYIT215({
        federalEic: 1000,
        nyAgi: 10000,
        nyStateTax: 1000,
        householdCredit: 45,
        residentCredit: 0,
        accumulationDistributionCredit: 0,
        isNYCResident: false,
        taxYear: 2025,
      });

      expect(result.nysEicRate.equals(d("0.30"))).toBe(true);
    });

    it("Line 12 - tentative NYS EIC rounds 30% of the federal credit", () => {
      const result = calculateNYIT215({
        federalEic: 3584,
        nyAgi: 10000,
        nyStateTax: 1000,
        householdCredit: 45,
        residentCredit: 0,
        accumulationDistributionCredit: 0,
        isNYCResident: false,
        taxYear: 2025,
      });

      expect(result.tentativeNYSEarnedIncomeCredit.equals(d(1075))).toBe(true);
    });

    it("Worksheet B line 5 - resident and accumulation credits cap the household-credit subtraction", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 25000,
        nyStateTax: 20,
        householdCredit: 25,
        residentCredit: 12,
        accumulationDistributionCredit: 6,
        isNYCResident: false,
        taxYear: 2025,
      });

      expect(result.worksheetBLine5TaxAfterResidentAndAccumulationCredits.equals(d(2))).toBe(true);
    });

    it("Line 15 - allowable household credit is limited by Worksheet B line 5", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 25000,
        nyStateTax: 20,
        householdCredit: 25,
        residentCredit: 12,
        accumulationDistributionCredit: 6,
        isNYCResident: false,
        taxYear: 2025,
      });

      expect(result.allowableHouseholdCredit.equals(d(2))).toBe(true);
    });

    it("Line 16 - allowable NYS EIC subtracts only the capped household-credit amount", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 25000,
        filingStatus: "single",
        nyStateTax: 20,
        householdCredit: 25,
        residentCredit: 12,
        accumulationDistributionCredit: 6,
        isNYCResident: false,
        taxYear: 2025,
      });

      expect(result.tentativeNYSEarnedIncomeCredit.equals(d(900))).toBe(true);
      expect(result.allowableNYSEarnedIncomeCredit.equals(d(898))).toBe(true);
    });

    it("Line 17 - joint federal NY-MFS filers claim only their chosen share of line 16", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 40000,
        filingStatus: "married_filing_separately",
        nyStateTax: 1500,
        householdCredit: 0,
        residentCredit: 0,
        accumulationDistributionCredit: 0,
        isNYCResident: false,
        jointFederalReturnForMfsAllocation: true,
        line17AllocatedNYSEic: 275,
        taxYear: 2025,
      });

      expect(result.line16CombinedNYSEarnedIncomeCredit.equals(d(900))).toBe(true);
      expect(result.line17ClaimedNYSEarnedIncomeCredit.equals(d(275))).toBe(true);
      expect(result.allowableNYSEarnedIncomeCredit.equals(d(275))).toBe(true);
    });
  });

  describe("Worksheet C line 2 - NYC EIC rate", () => {
    it("NYAGI under $5,000 uses the 30% rate", () => {
      expect(
        computeNYCIT215Rate({
          nyAgi: 4500,
          isNYCResident: true,
        }).equals(d("0.30"))
      ).toBe(true);
    });

    it("Worksheet C line 2 - NYAGI $6,250 phases the rate down to 27.5%", () => {
      expect(
        computeNYCIT215Rate({
          nyAgi: 6250,
          isNYCResident: true,
        }).equals(d("0.275"))
      ).toBe(true);
    });

    it("exactly $42,500 uses the 10% terminal rate", () => {
      expect(
        computeNYCIT215Rate({
          nyAgi: 42500,
          isNYCResident: true,
        }).equals(d("0.10"))
      ).toBe(true);
    });

    it("non-NYC resident gets a zero rate", () => {
      expect(
        computeNYCIT215Rate({
          nyAgi: 6250,
          isNYCResident: false,
        }).equals(d(0))
      ).toBe(true);
    });
  });

  describe("Worksheet C line 3 / line 27 / IT-201 line 70", () => {
    it("Worksheet C line 3 - NYC credit is federal EIC times the computed rate", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 6250,
        filingStatus: "single",
        nyStateTax: 0,
        householdCredit: 0,
        isNYCResident: true,
        taxYear: 2025,
      });

      expect(result.nycEicRate.equals(d("0.275"))).toBe(true);
      expect(result.allowableNYCEarnedIncomeCredit.equals(d(825))).toBe(true);
    });

    it("final credit is rounded to whole dollars", () => {
      const result = calculateNYIT215({
        federalEic: 3333,
        nyAgi: 6250,
        filingStatus: "single",
        nyStateTax: 0,
        householdCredit: 0,
        isNYCResident: true,
        taxYear: 2025,
      });

      expect(result.allowableNYCEarnedIncomeCredit.equals(d(917))).toBe(true);
    });

    it("zero federal EIC produces zero NYC credit", () => {
      const result = calculateNYIT215({
        federalEic: 0,
        nyAgi: 6250,
        filingStatus: "single",
        nyStateTax: 0,
        householdCredit: 0,
        isNYCResident: true,
        taxYear: 2025,
      });

      expect(result.allowableNYCEarnedIncomeCredit.equals(d(0))).toBe(true);
    });

    it("Worksheet C line 4 - joint federal NY-MFS NYC filers claim only their chosen share of line 3", () => {
      const result = calculateNYIT215({
        federalEic: 3000,
        nyAgi: 40000,
        filingStatus: "married_filing_separately",
        nyStateTax: 0,
        householdCredit: 0,
        isNYCResident: true,
        jointFederalReturnForMfsAllocation: true,
        line17AllocatedNYSEic: 450,
        worksheetCLine4AllocatedNYCEic: 150,
        taxYear: 2025,
      });

      expect(result.worksheetCLine3CombinedNYCEarnedIncomeCredit.equals(d(450))).toBe(true);
      expect(result.worksheetCLine4ClaimedNYCEarnedIncomeCredit.equals(d(150))).toBe(true);
      expect(result.allowableNYCEarnedIncomeCredit.equals(d(150))).toBe(true);
    });
  });
});

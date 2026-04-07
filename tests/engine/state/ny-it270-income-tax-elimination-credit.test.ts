/**
 * Tests for New York IT-270 NYC income tax elimination credit.
 * Spec: spec/state/ny-it270-income-tax-elimination-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT270,
  getNYIT270IncomeThreshold,
} from "@/engine/state/ny-it270-income-tax-elimination-credit.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

describe("NY IT-270 Income Tax Elimination Credit", () => {
  describe("Part 2 line 2 - threshold lookup", () => {
    it("MFJ with 9 dependents uses the 7+ threshold row", () => {
      expect(
        getNYIT270IncomeThreshold({
          filingStatus: "married_filing_jointly",
          numberOfDependents: 9,
          taxYear: 2025,
        }).equals(d(91902))
      ).toBe(true);
    });

    it("single with 9 dependents uses the 8+ threshold row", () => {
      expect(
        getNYIT270IncomeThreshold({
          filingStatus: "single",
          numberOfDependents: 9,
          taxYear: 2025,
        }).equals(d(88361))
      ).toBe(true);
    });
  });

  describe("Part 1 eligibility", () => {
    it("Part 1 line A - zero dependents disqualify the credit", () => {
      const result = calculateNYIT270({
        federalAgi: 30000,
        filingStatus: "single",
        numberOfDependents: 0,
        isNYCResident: true,
        nycTax: 400,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 0,
        nycEarnedIncomeCredit: 0,
        taxYear: 2025,
      });

      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });

    it("Part 1 line B - zero NYC tax disqualifies the credit", () => {
      const result = calculateNYIT270({
        federalAgi: 30000,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 0,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 0,
        nycEarnedIncomeCredit: 0,
        taxYear: 2025,
      });

      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });

    it("Part 1 line D - investment income above $10,000 disqualifies the credit", () => {
      const result = calculateNYIT270({
        federalAgi: 30000,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 400,
        investmentIncome: "10000.01",
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 0,
        nycEarnedIncomeCredit: 0,
        taxYear: 2025,
      });

      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });

    it("Part 1 line E - PTET credit claim disqualifies the credit", () => {
      const result = calculateNYIT270({
        federalAgi: 30000,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 400,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: true,
        nycChildDependentCareCredit: 0,
        nycEarnedIncomeCredit: 0,
        taxYear: 2025,
      });

      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });
  });

  describe("Part 2 lines 2 through 11", () => {
    it("Part 2 lines 6 through 11 - full credit eliminates the remaining NYC tax when income is at the threshold", () => {
      const result = calculateNYIT270({
        federalAgi: 31503,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 420,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 100,
        nycEarnedIncomeCredit: 20,
        taxYear: 2025,
      });

      expect(result.applicableIncomeThreshold.equals(d(31503))).toBe(true);
      expect(result.excessFederalAgiOverThreshold.equals(d(0))).toBe(true);
      expect(result.phaseDownPercentage.equals(d(1))).toBe(true);
      expect(result.otherRefundableNYCCredits.equals(d(120))).toBe(true);
      expect(result.remainingNYCTaxAfterCredits.equals(d(300))).toBe(true);
      expect(result.credit.equals(d(300))).toBe(true);
      expect(result.isEligible).toBe(true);
    });

    it("Part 2 lines 2 through 5 - AGI $2,500 above the threshold yields a 0.5000 phase-down ratio", () => {
      const result = calculateNYIT270({
        federalAgi: 34003,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 600,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 50,
        nycEarnedIncomeCredit: 50,
        taxYear: 2025,
      });

      expect(result.excessFederalAgiOverThreshold.equals(d(2500))).toBe(true);
      expect(result.remainingPhaseDownBand.equals(d(2500))).toBe(true);
      expect(result.phaseDownPercentage.equals(d("0.5"))).toBe(true);
      expect(result.remainingNYCTaxAfterCredits.equals(d(500))).toBe(true);
      expect(result.credit.equals(d(250))).toBe(true);
    });

    it("Part 2 lines 6 through 11 - other refundable NYC credits reduce the remaining tax before IT-270 applies", () => {
      const result = calculateNYIT270({
        federalAgi: 31503,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 650,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 125,
        nycEarnedIncomeCredit: 75,
        taxYear: 2025,
      });

      expect(result.otherRefundableNYCCredits.equals(d(200))).toBe(true);
      expect(result.remainingNYCTaxAfterCredits.equals(d(450))).toBe(true);
      expect(result.credit.equals(d(450))).toBe(true);
    });

    it("Part 2 line 10 - zero or negative remaining NYC tax yields no credit", () => {
      const result = calculateNYIT270({
        federalAgi: 31503,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 150,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 100,
        nycEarnedIncomeCredit: 75,
        taxYear: 2025,
      });

      expect(result.remainingNYCTaxAfterCredits.equals(d(-25))).toBe(true);
      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });

    it("more than $5,000 above the threshold disqualifies the credit", () => {
      const result = calculateNYIT270({
        federalAgi: 36504,
        filingStatus: "single",
        numberOfDependents: 1,
        isNYCResident: true,
        nycTax: 600,
        investmentIncome: 0,
        claimsPassThroughEntityTaxCredit: false,
        nycChildDependentCareCredit: 0,
        nycEarnedIncomeCredit: 0,
        taxYear: 2025,
      });

      expect(result.excessFederalAgiOverThreshold.equals(d(5001))).toBe(true);
      expect(result.isEligible).toBe(false);
      expect(result.credit.equals(d(0))).toBe(true);
    });
  });
});

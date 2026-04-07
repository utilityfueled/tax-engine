/**
 * Tests for New York IT-201 NYC Resident Tax Computation (lines 47-54).
 * Spec: spec/state/ny-it201-nyc-tax.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT201NYCTax,
  calculateNYIT201NYCMixedResidencyLine51,
  computeNYCHouseholdCredit,
  computeNYCRateScheduleTax,
  getNYCBracketGroup,
  NYC_TAX_RATE_SCHEDULES,
  type NYIT201NYCTaxInput,
} from "@/engine/state/ny-it201-nyc-tax.js";

const d = (value: string | number) => new Decimal(value);

function nycTax2025(overrides: Partial<NYIT201NYCTaxInput> = {}) {
  return calculateNYIT201NYCTax({
    nycTaxableIncome: 75000,
    federalAgi: 75000,
    filingStatus: "single",
    numberOfDependents: 0,
    isNYCResident: true,
    canBeClaimedAsDependent: false,
    taxYear: 2025,
    ...overrides,
  });
}

describe("NY IT-201 NYC Tax Computation", () => {
  describe("Bracket group mapping", () => {
    it("single maps to single_mfs", () => {
      expect(getNYCBracketGroup("single")).toBe("single_mfs");
    });

    it("married filing jointly maps to mfj_qss", () => {
      expect(getNYCBracketGroup("married_filing_jointly")).toBe("mfj_qss");
    });

    it("head of household maps to hoh", () => {
      expect(getNYCBracketGroup("head_of_household")).toBe("hoh");
    });
  });

  describe("Line 47 - NYC taxable income", () => {
    it("Line 47 - NYC taxable income carries through the supplied full-year resident amount", () => {
      const result = nycTax2025({ nycTaxableIncome: 81234 });
      expect(result.nycTaxableIncome.toString()).toBe("81234");
    });
  });

  describe("Line 47a - NYC resident tax", () => {
    const brackets2025 = NYC_TAX_RATE_SCHEDULES[2025].brackets;

    it("Line 47a - zero taxable income produces zero tax", () => {
      expect(computeNYCRateScheduleTax(d(0), brackets2025.single_mfs).toString()).toBe("0");
    });

    it("Line 47a - single filer $75,000 NYC tax rounded to $2,782", () => {
      const result = nycTax2025({ nycTaxableIncome: 75000 });
      expect(result.nycResidentTax.toString()).toBe("2782");
    });

    it("Line 47a - MFJ $100,000 NYC tax rounded to $3,651", () => {
      const result = nycTax2025({
        nycTaxableIncome: 100000,
        filingStatus: "married_filing_jointly",
      });
      expect(result.nycResidentTax.toString()).toBe("3651");
    });

    it("Line 47a - HoH $40,000 NYC tax rounded to $1,412", () => {
      const result = nycTax2025({
        nycTaxableIncome: 40000,
        filingStatus: "head_of_household",
      });
      expect(result.nycResidentTax.toString()).toBe("1412");
    });
  });

  describe("Line 48 - NYC household credit", () => {
    it("Line 48 - single filer federal AGI $10,000 gets $15 credit", () => {
      const credit = computeNYCHouseholdCredit({
        federalAgi: d(10000),
        filingStatus: "single",
        numberOfDependents: 0,
        canBeClaimedAsDependent: false,
        nycTax: d(308),
        taxYear: 2025,
      });
      expect(credit.toString()).toBe("15");
    });

    it("Line 48 - MFJ federal AGI $20,000 with household size 4 gets $60 credit", () => {
      const credit = computeNYCHouseholdCredit({
        federalAgi: d(20000),
        filingStatus: "married_filing_jointly",
        numberOfDependents: 2,
        canBeClaimedAsDependent: false,
        nycTax: d(700),
        taxYear: 2025,
      });
      expect(credit.toString()).toBe("60");
    });

    it("Line 48 - MFS combined-return override uses the official table 6", () => {
      const credit = computeNYCHouseholdCredit({
        federalAgi: d(9000),
        householdMembers: 5,
        householdCreditFederalAgiOverride: d(16000),
        filingStatus: "married_filing_separately",
        numberOfDependents: 0,
        canBeClaimedAsDependent: false,
        nycTax: d(800),
        taxYear: 2025,
      });
      expect(credit.toString()).toBe("63");
    });

    it("Line 48 - credit capped at NYC resident tax", () => {
      const credit = computeNYCHouseholdCredit({
        federalAgi: d(15000),
        filingStatus: "married_filing_jointly",
        numberOfDependents: 5,
        canBeClaimedAsDependent: false,
        nycTax: d(3),
        taxYear: 2025,
      });
      expect(credit.toString()).toBe("3");
    });
  });

  describe("Line 50 - part-year NYC resident tax", () => {
    it("Line 50 - full-year resident helper leaves part-year NYC tax at zero", () => {
      const result = nycTax2025();
      expect(result.partYearNYCTax.toString()).toBe("0");
    });

    it("Line 50 - part-year NYC resident tax flows from Form IT-360.1 passthrough", () => {
      const result = nycTax2025({
        isNYCResident: false,
        isPartYearNYCResident: true,
        partYearNYCTax: 612,
        otherNYCTaxes: 25,
        otherNYCCredits: 10,
      });

      expect(result.nycResidentTax.toString()).toBe("0");
      expect(result.nycHouseholdCredit.toString()).toBe("0");
      expect(result.partYearNYCTax.toString()).toBe("612");
      expect(result.otherNYCTaxes.toString()).toBe("25");
      expect(result.otherNYCCredits.toString()).toBe("10");
      expect(result.totalNYCTax.toString()).toBe("627");
      expect(result.isNYCResident).toBe(false);
    });

    it("Line 50 - part-year NYC resident path rejects missing Form IT-360.1 tax input", () => {
      expect(() =>
        nycTax2025({
          isNYCResident: false,
          isPartYearNYCResident: true,
          partYearNYCTax: undefined,
        })
      ).toThrow(
        "NYC part-year resident tax input requires partYearNYCTax from Form IT-360.1"
      );
    });
  });

  describe("Line 51 - other NYC taxes", () => {
    it("Line 51 - other NYC taxes pass through", () => {
      const result = nycTax2025({ otherNYCTaxes: 125 });
      expect(result.otherNYCTaxes.toString()).toBe("125");
    });

    it("Line 51 - defaults to zero when not provided", () => {
      const result = nycTax2025();
      expect(result.otherNYCTaxes.toString()).toBe("0");
    });

    it("Line 51 - mixed-residency worksheet computes the full-year city resident spouse tax and optional part-year spouse carryover", () => {
      const result = calculateNYIT201NYCMixedResidencyLine51({
        residentSpouseNYCTaxableIncome: 20000,
        combinedFederalAgi: 20000,
        combinedHouseholdMembers: 2,
        partYearResidentSpouseTax: 120,
        taxYear: 2025,
      });

      expect(result.residentSpouseNYCResidentTax.toString()).toBe("670");
      expect(result.residentSpouseNYCHouseholdCredit.toString()).toBe("15");
      expect(result.partYearResidentSpouseTax.toString()).toBe("120");
      expect(result.line51OtherNYCTaxes.toString()).toBe("775");
    });

    it("Line 51 - mixed-residency worksheet caps the household credit at the resident spouse tax", () => {
      const result = calculateNYIT201NYCMixedResidencyLine51({
        residentSpouseNYCTaxableIncome: 100,
        combinedFederalAgi: 15000,
        combinedHouseholdMembers: 7,
        taxYear: 2025,
      });

      expect(result.residentSpouseNYCResidentTax.toString()).toBe("3");
      expect(result.residentSpouseNYCHouseholdCredit.toString()).toBe("3");
      expect(result.line51OtherNYCTaxes.toString()).toBe("0");
    });

    it("Line 51 - mixed-residency worksheet requires the combined household-members total used by table 6", () => {
      expect(() =>
        calculateNYIT201NYCMixedResidencyLine51({
          residentSpouseNYCTaxableIncome: 20000,
          combinedFederalAgi: 20000,
          combinedHouseholdMembers: 1,
          taxYear: 2025,
        })
      ).toThrow(
        "NYC mixed-residency line 51 combined household members must be a whole number of at least 2"
      );
    });
  });

  describe("Line 53 - NYC nonrefundable credits", () => {
    it("Line 53 - NYC nonrefundable credits pass through", () => {
      const result = nycTax2025({ otherNYCCredits: 500 });
      expect(result.otherNYCCredits.toString()).toBe("500");
    });

    it("Line 53 - defaults to zero when not provided", () => {
      const result = nycTax2025();
      expect(result.otherNYCCredits.toString()).toBe("0");
    });
  });

  describe("Line 54 - total NYC tax", () => {
    it("Line 54 - total NYC tax for typical single filer equals line 47a minus line 48", () => {
      const result = nycTax2025({ nycTaxableIncome: 75000 });
      expect(result.netNYCTax.toString()).toBe("2782");
      expect(result.totalNYCTax.toString()).toBe("2782");
    });

    it("Line 54 - total NYC tax includes line 51 taxes and line 53 credits", () => {
      const result = nycTax2025({
        nycTaxableIncome: 75000,
        otherNYCTaxes: 125,
        otherNYCCredits: 50,
      });
      expect(result.totalNYCTax.toString()).toBe("2857");
    });

    it("Line 54 - line 53 NYC nonrefundable credits reduce the final total", () => {
      const result = nycTax2025({
        nycTaxableIncome: 75000,
        otherNYCCredits: 1000,
      });
      expect(result.totalNYCTax.toString()).toBe("1782");
    });

    it("Line 54 - household credit and line 53 credits cannot reduce tax below zero", () => {
      const result = nycTax2025({
        nycTaxableIncome: 100,
        federalAgi: 15000,
        filingStatus: "married_filing_jointly",
        numberOfDependents: 5,
        otherNYCCredits: 50,
      });
      expect(result.totalNYCTax.toString()).toBe("0");
    });

    it("Line 54 - low-income MFJ filer still keeps line 51 other NYC taxes after the household credit", () => {
      const result = nycTax2025({
        nycTaxableIncome: 20000,
        federalAgi: 20000,
        filingStatus: "married_filing_jointly",
        numberOfDependents: 2,
        otherNYCTaxes: 40,
      });
      expect(result.nycResidentTax.toString()).toBe("616");
      expect(result.nycHouseholdCredit.toString()).toBe("60");
      expect(result.totalNYCTax.toString()).toBe("596");
    });
  });

  describe("Non-resident handling", () => {
    it("non-NYC resident has zero tax on all NYC lines", () => {
      const result = nycTax2025({
        nycTaxableIncome: 200000,
        isNYCResident: false,
        otherNYCTaxes: 500,
        otherNYCCredits: 500,
      });

      expect(result.nycResidentTax.toString()).toBe("0");
      expect(result.nycHouseholdCredit.toString()).toBe("0");
      expect(result.partYearNYCTax.toString()).toBe("0");
      expect(result.otherNYCTaxes.toString()).toBe("0");
      expect(result.otherNYCCredits.toString()).toBe("0");
      expect(result.totalNYCTax.toString()).toBe("0");
      expect(result.isNYCResident).toBe(false);
    });
  });

  describe("Audit trail", () => {
    it("produces audit lines for the official 2025 NYC line map", () => {
      const result = nycTax2025({ otherNYCTaxes: 25, otherNYCCredits: 10 });
      const lineNumbers = result.lines.map((line) => line.line);

      expect(lineNumbers).toContain("47");
      expect(lineNumbers).toContain("47a");
      expect(lineNumbers).toContain("48");
      expect(lineNumbers).toContain("50");
      expect(lineNumbers).toContain("51");
      expect(lineNumbers).toContain("53");
      expect(lineNumbers).toContain("54");
      expect(lineNumbers).not.toContain("52");
    });
  });

  describe("Year validation", () => {
    it("throws for unsupported tax year", () => {
      expect(() => nycTax2025({ taxYear: 2020 })).toThrow(
        "NYC tax computation not available for tax year 2020"
      );
    });
  });
});

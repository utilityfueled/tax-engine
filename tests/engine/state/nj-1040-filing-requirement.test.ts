/**
 * Tests for New Jersey NJ-1040 filing requirement determination.
 * Spec: spec/state/nj-1040-filing-requirement.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  determineNJFilingRequirement,
  type NJFilingRequirementInput,
} from "@/engine/state/nj-1040-filing-requirement.js";

const d = (v: string | number) => new Decimal(v);

/** Helper: minimal input with defaults */
function filingInput(
  overrides: Partial<NJFilingRequirementInput> = {}
): NJFilingRequirementInput {
  return {
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  };
}

describe("NJ-1040 filing requirement", () => {
  // --- Filing thresholds by filing status ---

  describe("filing thresholds", () => {
    it("NJ filing requirement - single filer threshold is $10,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({ filingStatus: "single" })
      );
      expect(result.filingThreshold.toNumber()).toBe(10000);
    });

    it("NJ filing requirement - MFJ threshold is $20,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({ filingStatus: "married_filing_jointly" })
      );
      expect(result.filingThreshold.toNumber()).toBe(20000);
    });

    it("NJ filing requirement - MFS threshold is $10,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({ filingStatus: "married_filing_separately" })
      );
      expect(result.filingThreshold.toNumber()).toBe(10000);
    });

    it("NJ filing requirement - HOH threshold is $20,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({ filingStatus: "head_of_household" })
      );
      expect(result.filingThreshold.toNumber()).toBe(20000);
    });

    it("NJ filing requirement - QSS threshold is $20,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({ filingStatus: "qualifying_surviving_spouse" })
      );
      expect(result.filingThreshold.toNumber()).toBe(20000);
    });
  });

  // --- Income-based threshold boundary tests ---

  describe("income-based requirement", () => {
    it("NJ filing requirement - income exactly at threshold not required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 10000 })
      );
      expect(result.requiredByIncome).toBe(false);
    });

    it("NJ filing requirement - income $1 over threshold required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 10001 })
      );
      expect(result.requiredByIncome).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - income $1 below threshold not required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 9999 })
      );
      expect(result.requiredByIncome).toBe(false);
    });

    it("NJ filing requirement - zero income not required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 0 })
      );
      expect(result.requiredByIncome).toBe(false);
    });

    it("NJ filing requirement - MFJ at $20,000 threshold not required", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "married_filing_jointly",
          njGrossIncome: 20000,
        })
      );
      expect(result.requiredByIncome).toBe(false);
    });

    it("NJ filing requirement - MFJ at $20,001 required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "married_filing_jointly",
          njGrossIncome: 20001,
        })
      );
      expect(result.requiredByIncome).toBe(true);
    });

    it("NJ filing requirement - high income single clearly required", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 75000 })
      );
      expect(result.requiredByIncome).toBe(true);
      expect(result.filingRequired).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Withholding refund ---

  describe("withholding refund", () => {
    it("NJ filing requirement - must file to claim withholding refund", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 5000, njWithholding: 500 })
      );
      expect(result.requiredByIncome).toBe(false); // below threshold
      expect(result.requiredForRefund).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - no withholding no refund reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 5000, njWithholding: 0 })
      );
      expect(result.requiredForRefund).toBe(false);
    });

    it("NJ filing requirement - small withholding still triggers", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njWithholding: "0.01" })
      );
      expect(result.requiredForRefund).toBe(true);
    });

    it("NJ filing requirement - must file to claim estimated tax refund", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 5000, estimatedPayments: 250 })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForRefund).toBe(true);
      expect(result.filingRequired).toBe(true);
      expect(result.reasons.some((reason) => reason.includes("estimated"))).toBe(true);
    });
  });

  // --- EITC ---

  describe("EITC eligibility", () => {
    it("NJ filing requirement - must file to claim EITC", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 8000, federalEITC: 2000 })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForEITC).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - no federal EITC no NJ EITC reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ federalEITC: 0 })
      );
      expect(result.requiredForEITC).toBe(false);
    });

    it("NJ filing requirement - childless age-18 EITC exception still requires filing", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          federalEITC: 0,
          qualifiesForChildlessAge18Exception: true,
        })
      );
      expect(result.requiredForEITC).toBe(true);
      expect(result.filingRequired).toBe(true);
    });
  });

  // --- Child Tax Credit ---

  describe("child tax credit eligibility", () => {
    it("NJ filing requirement - must file to claim child tax credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 5000,
          qualifyingChildrenAge5OrUnder: 2,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForCTC).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - no qualifying children no CTC reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ qualifyingChildrenAge5OrUnder: 0 })
      );
      expect(result.requiredForCTC).toBe(false);
    });

    it("NJ filing requirement - married filing separately does not get a child tax credit filing reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "married_filing_separately",
          njGrossIncome: 5000,
          qualifyingChildrenAge5OrUnder: 2,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForCTC).toBe(false);
      expect(result.filingRequired).toBe(false);
    });
  });

  // --- Dependent care credit ---

  describe("dependent care credit eligibility", () => {
    it("NJ filing requirement - must file to claim dependent care credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 9000,
          federalDependentCareCredit: 450,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForDependentCareCredit).toBe(true);
      expect(result.filingRequired).toBe(true);
      expect(
        result.reasons.some((reason) =>
          reason.includes("Dependent Care Credit")
        )
      ).toBe(true);
    });

    it("NJ filing requirement - zero federal dependent care credit does not create a filing reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ federalDependentCareCredit: 0 })
      );
      expect(result.requiredForDependentCareCredit).toBe(false);
    });
  });

  // --- PTBAIT credit ---

  describe("PTBAIT credit", () => {
    it("NJ filing requirement - must file to claim PTBAIT credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 5000,
          passThroughBusinessAlternativeIncomeTaxCredit: 900,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForPTBAITCredit).toBe(true);
      expect(result.filingRequired).toBe(true);
    });
  });

  // --- Use tax ---

  describe("use tax", () => {
    it("NJ filing requirement - must file if use tax owed", () => {
      const result = determineNJFilingRequirement(
        filingInput({ useTaxOwed: 50 })
      );
      expect(result.requiredForUseTax).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - no use tax no filing reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ useTaxOwed: 0 })
      );
      expect(result.requiredForUseTax).toBe(false);
    });
  });

  // --- Shared responsibility payment ---

  describe("shared responsibility payment", () => {
    it("NJ filing requirement - must file if SRP applies", () => {
      const result = determineNJFilingRequirement(
        filingInput({ healthCoverageUncoveredMonths: 6 })
      );
      expect(result.requiredForSRP).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - fully covered no SRP reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ healthCoverageUncoveredMonths: 0 })
      );
      expect(result.requiredForSRP).toBe(false);
    });

    it("NJ filing requirement - short gap exemption does not by itself trigger filing", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          healthCoverageUncoveredMonths: 2,
          healthCoverageExemptAllUncoveredMonths: true,
        })
      );
      expect(result.requiredForSRP).toBe(false);
      expect(result.filingRequired).toBe(false);
    });
  });

  // --- Excess payroll contributions ---

  describe("excess payroll", () => {
    it("NJ filing requirement - must file to claim excess payroll credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({ totalUIWFSWFWithheld: "184.03" })
      );
      expect(result.requiredForExcessPayroll).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - payroll withholding under the annual maximum does not trigger filing", () => {
      const result = determineNJFilingRequirement(
        filingInput({ totalFLIWithheld: 50 })
      );
      expect(result.requiredForExcessPayroll).toBe(false);
    });

    it("NJ filing requirement - private-plan DI uses the override maximum", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          totalDIWithheld: 300,
          privatePlanMaxDI: 250,
        })
      );
      expect(result.requiredForExcessPayroll).toBe(true);
    });

    it("NJ filing requirement - no payroll withholding no excess reason", () => {
      const result = determineNJFilingRequirement(filingInput());
      expect(result.requiredForExcessPayroll).toBe(false);
    });
  });

  // --- Overall determination ---

  describe("overall determination", () => {
    it("NJ filing requirement - no triggers means not required", () => {
      const result = determineNJFilingRequirement(filingInput());
      expect(result.filingRequired).toBe(false);
      expect(result.recommendedForm).toBe("none");
      expect(result.nj1040hwTotalCredits.toNumber()).toBe(0);
      expect(result.reasons).toHaveLength(0);
    });

    it("NJ filing requirement - below-threshold senior homeowner is directed to NJ-1040-HW for the property tax credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 9000,
          isHomeowner: true,
          propertyTaxesPaid: 4000,
          taxpayerAge65OrOlder: true,
        })
      );

      expect(result.filingRequired).toBe(false);
      expect(result.recommendedForm).toBe("NJ-1040-HW");
      expect(result.nj1040hwTotalCredits.toNumber()).toBe(50);
      expect(result.reasons).toContain(
        "Eligible to use NJ-1040-HW to claim Property Tax Credit ($50)"
      );
    });

    it("NJ filing requirement - below-threshold caregiver is directed to NJ-1040-HW for the wounded warrior credit", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "head_of_household",
          njGrossIncome: 18000,
          providedCareToQualifyingServiceMember: true,
          serviceMemberFederalDisabilityCompensation: 500,
          onlyCaregiver: true,
        })
      );

      expect(result.filingRequired).toBe(false);
      expect(result.recommendedForm).toBe("NJ-1040-HW");
      expect(result.nj1040hwTotalCredits.toNumber()).toBe(500);
      expect(result.reasons).toContain(
        "Eligible to use NJ-1040-HW to claim Wounded Warrior Caregivers Credit ($500)"
      );
    });

    it("NJ filing requirement - NJ withholding keeps the recommendation on NJ-1040 instead of NJ-1040-HW", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 9000,
          njWithholding: 200,
          isHomeowner: true,
          propertyTaxesPaid: 4000,
          taxpayerAge65OrOlder: true,
        })
      );

      expect(result.filingRequired).toBe(true);
      expect(result.recommendedForm).toBe("NJ-1040");
      expect(result.nj1040hwTotalCredits.toNumber()).toBe(0);
    });

    it("NJ filing requirement - multiple reasons aggregated", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 50000,
          njWithholding: 3000,
          federalEITC: 1000,
          qualifyingChildrenAge5OrUnder: 1,
        })
      );
      expect(result.filingRequired).toBe(true);
      expect(result.requiredByIncome).toBe(true);
      expect(result.requiredForRefund).toBe(true);
      expect(result.requiredForEITC).toBe(true);
      expect(result.requiredForCTC).toBe(true);
      expect(result.reasons.length).toBe(4);
    });

    it("NJ filing requirement - below threshold but withholding triggers filing", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "married_filing_jointly",
          njGrossIncome: 15000,
          njWithholding: 1200,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForRefund).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - below threshold but EITC and CTC together", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 8000,
          federalEITC: 3000,
          qualifyingChildrenAge5OrUnder: 2,
        })
      );
      expect(result.filingRequired).toBe(true);
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForEITC).toBe(true);
      expect(result.requiredForCTC).toBe(true);
      expect(result.reasons.length).toBe(2);
    });

    it("NJ filing requirement - below threshold dependent care credit alone requires filing", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          njGrossIncome: 7000,
          federalDependentCareCredit: 300,
        })
      );
      expect(result.filingRequired).toBe(true);
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForDependentCareCredit).toBe(true);
      expect(result.recommendedForm).toBe("NJ-1040");
    });

    it("NJ filing requirement - only SRP trigger produces one reason", () => {
      const result = determineNJFilingRequirement(
        filingInput({ healthCoverageUncoveredMonths: 3 })
      );
      expect(result.filingRequired).toBe(true);
      expect(result.reasons.length).toBe(1);
      expect(result.reasons[0]).toContain("Shared responsibility");
    });

    it("NJ filing requirement - audit trail has expected lines", () => {
      const result = determineNJFilingRequirement(
        filingInput({ njGrossIncome: 50000 })
      );
      expect(result.lines.length).toBeGreaterThan(0);
      const lineIds = result.lines.map((l) => l.line);
      expect(lineIds).toContain("filing-threshold");
      expect(lineIds).toContain("filing-determination");
    });

    it("NJ filing requirement - throws for unsupported tax year", () => {
      expect(() =>
        determineNJFilingRequirement(filingInput({ taxYear: 2020 }))
      ).toThrow("NJ-1040 filing requirement rules not available for tax year 2020");
    });
  });

  // --- Filing status specific scenarios ---

  describe("filing status scenarios", () => {
    it("NJ filing requirement - MFS filer at $10,001 required", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "married_filing_separately",
          njGrossIncome: 10001,
        })
      );
      expect(result.requiredByIncome).toBe(true);
    });

    it("NJ filing requirement - HOH with income below $20K threshold and EITC", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "head_of_household",
          njGrossIncome: 15000,
          federalEITC: 5000,
        })
      );
      expect(result.requiredByIncome).toBe(false);
      expect(result.requiredForEITC).toBe(true);
      expect(result.filingRequired).toBe(true);
    });

    it("NJ filing requirement - HOH at $20,001 required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "head_of_household",
          njGrossIncome: 20001,
        })
      );
      expect(result.requiredByIncome).toBe(true);
    });

    it("NJ filing requirement - QSS with income just over $20,000", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "qualifying_surviving_spouse",
          njGrossIncome: "20000.01",
        })
      );
      expect(result.requiredByIncome).toBe(true);
    });

    it("NJ filing requirement - QSS at exactly $20,000 not required by income", () => {
      const result = determineNJFilingRequirement(
        filingInput({
          filingStatus: "qualifying_surviving_spouse",
          njGrossIncome: 20000,
        })
      );
      expect(result.requiredByIncome).toBe(false);
    });
  });
});

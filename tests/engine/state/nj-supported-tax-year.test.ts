/**
 * Tests for shared New Jersey resident engine tax-year validation.
 * Spec: spec/state/nj-supported-tax-years.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ2210 } from "@/engine/state/nj-2210.js";
import { calculateNJ1040CollegeAffordabilityDeduction } from "@/engine/state/nj-1040-college-affordability.js";
import { calculateNJ1040DependentCareCredit } from "@/engine/state/nj-1040-dependent-care-credit.js";
import { calculateNJ1040EITC } from "@/engine/state/nj-1040-eitc.js";
import { calculateNJ1040ExcessPayroll } from "@/engine/state/nj-1040-excess-payroll.js";
import { calculateNJ1040Exemptions } from "@/engine/state/nj-1040-exemptions.js";
import { determineNJFilingRequirement } from "@/engine/state/nj-1040-filing-requirement.js";
import { calculateNJ1040GrossIncome } from "@/engine/state/nj-1040-gross-income.js";
import { calculateNJ1040HealthCoverage } from "@/engine/state/nj-1040-health-coverage.js";
import { calculateNJ1040HW } from "@/engine/state/nj-1040-hw.js";
import { calculateNJ1040MedicalExpenses } from "@/engine/state/nj-1040-medical-expenses.js";
import { calculateNJ1040ChildTaxCredit } from "@/engine/state/nj-1040-child-tax-credit.js";
import { calculateNJ1040OtherJurisdictionCredit } from "@/engine/state/nj-1040-other-jurisdiction-credit.js";
import { calculateNJ1040OverpaymentAllocation } from "@/engine/state/nj-1040-overpayment-allocation.js";
import { calculateNJ1040PropertyTax } from "@/engine/state/nj-1040-property-tax.js";
import { calculateNJ1040PTBAITCredit } from "@/engine/state/nj-1040-ptbait-credit.js";
import { calculateNJ1040SupplementalCredits } from "@/engine/state/nj-1040-supplemental-credits.js";
import { calculateNJ1040TaxRate } from "@/engine/state/nj-1040-tax-rate.js";
import { calculateNJ1040UseTax } from "@/engine/state/nj-1040-use-tax.js";
import { calculateNJ1040WoundedWarriorCredit } from "@/engine/state/nj-1040-wounded-warrior-credit.js";
import { calculateNJ1040 } from "@/engine/state/nj-1040.js";

describe("NJ supported tax years", () => {
  it("NJ supported tax years - gross income rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040GrossIncome({
        filingStatus: "single",
        taxYear: 2024,
        wages: 50000,
      })
    ).toThrow("NJ-1040 gross income rules not available for tax year 2024");
  });

  it("NJ supported tax years - exemptions rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040Exemptions({
        filingStatus: "single",
        taxYear: 2024,
      })
    ).toThrow("NJ-1040 exemption amounts not available for tax year 2024");
  });

  it("NJ supported tax years - college affordability rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040CollegeAffordabilityDeduction({
        taxYear: 2024,
        njGrossIncome: 50000,
      })
    ).toThrow(
      "NJ-1040 college affordability deductions not available for tax year 2024"
    );
  });

  it("NJ supported tax years - medical expenses rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040MedicalExpenses({
        taxYear: 2024,
        njGrossIncome: 50000,
      })
    ).toThrow(
      "NJ-1040 medical expense deduction rules not available for tax year 2024"
    );
  });

  it("NJ supported tax years - property tax rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040PropertyTax({
        taxYear: 2024,
        filingStatus: "single",
        njGrossIncome: 50000,
        isHomeowner: true,
        propertyTaxesPaid: 3000,
      })
    ).toThrow("NJ-1040 property tax benefit rules not available for tax year 2024");
  });

  it("NJ supported tax years - NJ-1040-HW rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040HW({
        filingStatus: "single",
        taxYear: 2024,
        njGrossIncome: 9000,
      })
    ).toThrow("NJ-1040-HW rules not available for tax year 2024");
  });

  it("NJ supported tax years - other jurisdiction credit rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040OtherJurisdictionCredit({
        taxYear: 2024,
        njGrossIncome: new Decimal(100000),
        njTax: new Decimal(4000),
        jurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(50000),
            taxPaid: new Decimal(3000),
          },
        ],
      })
    ).toThrow(
      "NJ-1040 other jurisdiction credit rules not available for tax year 2024"
    );
  });

  it("NJ supported tax years - supplemental credits rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040SupplementalCredits({
        taxYear: 2024,
        monthsOfResidency: 12,
      })
    ).toThrow("NJ-1040 supplemental credit rules not available for tax year 2024");
  });

  it("NJ supported tax years - PTBAIT credit rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040PTBAITCredit({
        taxYear: 2024,
        totalCredit: 1000,
      })
    ).toThrow("NJ-1040 PTBAIT credit rules not available for tax year 2024");
  });

  it("NJ supported tax years - tax rate rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040TaxRate({
        taxYear: 2024,
        filingStatus: "single",
        taxableIncome: 50000,
      })
    ).toThrow("NJ-1040 tax rate rules not available for tax year 2024");
  });

  it("NJ supported tax years - EITC rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040EITC({
        taxYear: 2024,
        federalEITC: 1000,
        monthsOfResidency: 12,
      })
    ).toThrow("NJ-1040 EITC rules not available for tax year 2024");
  });

  it("NJ supported tax years - child tax credit rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040ChildTaxCredit({
        taxYear: 2024,
        filingStatus: "single",
        njTaxableIncome: 25000,
        qualifyingChildrenAge5OrUnder: 1,
        monthsOfResidency: 12,
      })
    ).toThrow("NJ-1040 child tax credit rules not available for tax year 2024");
  });

  it("NJ supported tax years - dependent care credit rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040DependentCareCredit({
        taxYear: 2024,
        federalDependentCareCredit: 500,
        njTaxableIncome: 25000,
        monthsOfResidency: 12,
      })
    ).toThrow(
      "NJ-1040 dependent care credit rules not available for tax year 2024"
    );
  });

  it("NJ supported tax years - health coverage rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040HealthCoverage({
        taxYear: 2024,
        filingStatus: "single",
        totalIncome: 50000,
        taxExemptInterest: 0,
        dependentIncome: 0,
        uninsuredAdults: 1,
        uninsuredChildren: 0,
        uncoveredMonths: 12,
      })
    ).toThrow("NJ-1040 health coverage rules not available for tax year 2024");
  });

  it("NJ supported tax years - use tax rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040UseTax({
        taxYear: 2024,
        njGrossIncome: 50000,
        useSafeHarbor: true,
      })
    ).toThrow("NJ-1040 use tax rules not available for tax year 2024");
  });

  it("NJ supported tax years - excess payroll rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040ExcessPayroll({
        taxYear: 2024,
        totalUIWFSWFWithheld: 500,
        totalDIWithheld: 100,
        totalFLIWithheld: 50,
      })
    ).toThrow("NJ-1040 excess payroll rules not available for tax year 2024");
  });

  it("NJ supported tax years - wounded warrior credit rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040WoundedWarriorCredit({
        taxYear: 2024,
        filingStatus: "single",
        njGrossIncome: 25000,
        providedCareToQualifyingServiceMember: true,
        serviceMemberFederalDisabilityCompensation: 675,
        onlyCaregiver: true,
      })
    ).toThrow(
      "NJ-1040 wounded warrior credit rules not available for tax year 2024"
    );
  });

  it("NJ supported tax years - filing requirement rejects unsupported years", () => {
    expect(() =>
      determineNJFilingRequirement({
        taxYear: 2024,
        filingStatus: "single",
        njGrossIncome: 5000,
      })
    ).toThrow("NJ-1040 filing requirement rules not available for tax year 2024");
  });

  it("NJ supported tax years - overpayment allocation rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040OverpaymentAllocation({
        taxYear: 2024,
        totalTaxDue: 500,
        totalPayments: 750,
      })
    ).toThrow(
      "NJ-1040 overpayment allocation rules not available for tax year 2024"
    );
  });

  it("NJ supported tax years - NJ-2210 rejects unsupported years", () => {
    expect(() =>
      calculateNJ2210({
        taxYear: 2024,
        totalTaxAfterCredits: 2000,
        totalWithholdingAndCredits: 500,
        estimatedPayments: 0,
      })
    ).toThrow("NJ-2210 rules not available for tax year 2024");
  });

  it("NJ supported tax years - resident return rejects unsupported years", () => {
    expect(() =>
      calculateNJ1040({
        filingStatus: "single",
        taxYear: 2024,
        monthsOfResidency: 12,
        wages: 50000,
      })
    ).toThrow("NJ-1040 resident return not available for tax year 2024");
  });
});

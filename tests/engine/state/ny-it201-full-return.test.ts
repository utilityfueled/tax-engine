/**
 * Tests for NY IT-201 Full-Year Resident Return Orchestrator.
 * Verifies end-to-end wiring of all sub-modules plus payments and refund.
 * Spec: spec/state/ny-it201-full-return.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYIT201FullReturn,
  type NYIT201FullReturnInput,
} from "@/engine/state/ny-it201-full-return.js";

/* ---------- Helpers ---------- */

function baseInput(overrides: Partial<NYIT201FullReturnInput> = {}): NYIT201FullReturnInput {
  return {
    federalAgi: 75000,
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  };
}

function d(v: number | string): Decimal {
  return new Decimal(v);
}

/* ---------- Basic wiring ---------- */

describe("NY IT-201 Full Return Orchestrator", () => {
  describe("End-to-end wiring", () => {
    it("basic single filer with only federal AGI produces correct NY AGI and tax", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      // NY AGI = federal AGI (no additions or subtractions)
      expect(result.additionsSubtractions.nyAgi.equals(d(75000))).toBe(true);

      // Standard deduction for single: $8,000
      expect(result.deduction.standardDeduction.equals(d(8000))).toBe(true);
      expect(result.deduction.deductionUsed).toBe("standard");

      // Taxable income = 75000 - 8000 = 67000
      expect(result.deduction.taxableIncome.equals(d(67000))).toBe(true);

      // Tax computation should produce non-zero tax
      expect(result.taxComputation.tax.greaterThan(d(0))).toBe(true);

      // Credits module should have received the computed tax
      expect(result.credits.nyStateTax.equals(result.taxComputation.tax)).toBe(true);
    });

    it("additions and subtractions flow through to NY AGI", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        outOfStateMuniBondInterest: 1000,
        taxableSocialSecurityBenefits: 5000,
      }));

      // NY AGI = 75000 + 1000 (addition) - 5000 (subtraction) = 71000
      expect(result.additionsSubtractions.nyAgi.equals(d(71000))).toBe(true);
    });

    it("itemized deduction used when greater than standard", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyItemizedDeduction: 15000,
      }));

      expect(result.deduction.deductionUsed).toBe("itemized");
      expect(result.deduction.deductionAmount.equals(d(15000))).toBe(true);

      // Taxable income = 75000 - 15000 = 60000
      expect(result.deduction.taxableIncome.equals(d(60000))).toBe(true);
    });

    it("dependent exemptions reduce taxable income", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        filingStatus: "married_filing_jointly",
        numberOfDependents: 3,
      }));

      // MFJ standard deduction: $16,050
      expect(result.deduction.standardDeduction.equals(d(16050))).toBe(true);
      // Dependent exemption: 3 × $1,000 = $3,000
      expect(result.deduction.dependentExemption.equals(d(3000))).toBe(true);
      // Taxable income = 75000 - 16050 - 3000 = 55950
      expect(result.deduction.taxableIncome.equals(d(55950))).toBe(true);
    });
  });

  /* ---------- Line 58: Total NYC + Yonkers ---------- */

  describe("Line 58 - total NYC and Yonkers taxes", () => {
    it("rejects unsupported full-year NYC plus Yonkers local-tax combination", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          isNYCResident: true,
          yonkersResidencyStatus: "full_year",
        }))
      ).toThrow(
        "NY IT-201 full return does not support combining full-year NYC resident tax with Yonkers local tax inputs; use IT-360.1 for city residency changes"
      );
    });

    it("NYC resident with no Yonkers: local taxes equal NYC tax", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
      }));

      expect(result.totalNYCTax.greaterThan(d(0))).toBe(true);
      expect(result.totalYonkersTax.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(result.totalNYCTax)).toBe(true);
    });

    it("Yonkers full-year resident with no NYC: local taxes equal Yonkers surcharge", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        yonkersResidencyStatus: "full_year",
      }));

      expect(result.totalNYCTax.equals(d(0))).toBe(true);
      expect(result.totalYonkersTax.greaterThan(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(result.totalYonkersTax)).toBe(true);
    });

    it("part-year Yonkers resident uses the IT-360.1 line 73 income percentage on line 57", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        yonkersResidencyStatus: "part_year",
        yonkersResidentIncomePercentage: "0.4",
      }));

      const expectedYonkersTax = result.totalNYStateTaxes
        .times(d("0.4"))
        .times(d("0.1675"))
        .toNearest(1);

      expect(result.yonkersTax.partYearYonkersSurcharge.equals(expectedYonkersTax)).toBe(true);
      expect(result.totalYonkersTax.equals(expectedYonkersTax)).toBe(true);
      expect(result.totalLocalTaxes.equals(expectedYonkersTax)).toBe(true);
    });

    it("rejects a negative part-year Yonkers income percentage", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          yonkersResidencyStatus: "part_year",
          yonkersResidentIncomePercentage: "-0.0001",
        }))
      ).toThrow("NY IT-201 part-year Yonkers input requires a non-negative income percentage");
    });

    it("rejects legacy Yonkers day-count proration inputs", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          yonkersResidencyStatus: "part_year",
          yonkersResidentIncomePercentage: "0.4",
          daysOfYonkersResidency: 120,
        }))
      ).toThrow(
        "NY IT-201 resident Yonkers part-year inputs use Form IT-360.1 line 73 income percentage; do not provide legacy day-count proration fields"
      );
    });

    it("rejects legacy standalone STAR and local refundable passthrough fields", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          starCredit: 0,
          nycYonkersRefundableCredits: 100,
        }))
      ).toThrow(
        "NY IT-201 2025 resident returns do not accept legacy standalone STAR credit passthroughs; use IT-119 for STAR reconciliation"
      );
    });

    it("Line 50 - part-year NYC tax passthrough increases total local taxes", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isPartYearNYCResident: true,
        partYearNYCTax: 612,
        partYearNYCTaxableIncome: 28000,
        partYearNYCSchoolCreditMonths: 8,
      }));

      expect(result.nycTax.partYearNYCTax.equals(d(612))).toBe(true);
      expect(result.totalNYCTax.equals(d(612))).toBe(true);
      expect(result.totalYonkersTax.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(612))).toBe(true);
    });

    it("MCTMT-only filer carries line 54e into the line 58 subtotal", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        mctmt: {
          zone1Earnings: 120000,
        },
      }));

      expect(result.mctmtResult!.totalMCTMT.equals(d(720))).toBe(true);
      expect(result.totalNYCTax.equals(d(0))).toBe(true);
      expect(result.totalYonkersTax.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(720))).toBe(true);
    });

    it("neither NYC nor Yonkers: local taxes are zero", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      expect(result.totalLocalTaxes.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Lines 61-62: Total tax carryforward ---------- */

  describe("Lines 61-62 - total tax carryforward", () => {
    it("Line 60 - IT-227 computed total overrides the voluntary contributions passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        voluntaryContributions: 999,
        it227: {
          contributions: [
            { lineNumber: 1, amount: 25 },
            { lineNumber: 5, amount: 2 },
            { lineNumber: 27, amount: 40 },
          ],
        },
      }));

      expect(result.it227Result).not.toBeNull();
      expect(result.voluntaryContributions.equals(d(67))).toBe(true);
      expect(result.totalTaxBeforeCreditsAndPayments.equals(
        result.totalNYStateTaxes.plus(result.totalLocalTaxes).plus(result.credits.salesUseTax).plus(d(67))
      )).toBe(true);
    });

    it("Line 61 - combined taxes include state, local, sales tax, and voluntary contributions", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        salesUseTax: 45,
        voluntaryContributions: 25,
      }));

      const expected = result.totalNYStateTaxes
        .plus(result.totalLocalTaxes)
        .plus(result.credits.salesUseTax)
        .plus(d(25));
      expect(result.totalTaxBeforeCreditsAndPayments.equals(expected)).toBe(true);
    });

    it("Line 61 - sales/use tax chart flows into total taxes", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 90000,
        salesUseTaxChart: {
          monthsOfPermanentPlaceOfAbode: 6,
        },
      }));

      expect(result.credits.salesUseTax.equals(d(9))).toBe(true);
      expect(result.totalNYStateTaxes.equals(result.credits.netNYStateTax)).toBe(true);
      expect(result.totalTaxBeforeCreditsAndPayments.equals(
        result.totalNYStateTaxes.plus(d(9))
      )).toBe(true);
    });

    it("Line 62 - carried total taxes match line 61", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      expect(result.totalTaxBeforeCreditsAndPayments.equals(
        result.totalNYStateTaxes
      )).toBe(true);
    });

    it("NYC resident: carried amount includes state and NYC", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
      }));

      const expected = result.totalNYStateTaxes.plus(result.totalNYCTax);
      expect(result.totalTaxBeforeCreditsAndPayments.equals(expected)).toBe(true);
    });

    it("part-year NYC line 50 flows into the carried total taxes amount", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isPartYearNYCResident: true,
        partYearNYCTax: 612,
        partYearNYCTaxableIncome: 28000,
        partYearNYCSchoolCreditMonths: 8,
      }));

      const expected = result.totalNYStateTaxes.plus(d(612));
      expect(result.totalTaxBeforeCreditsAndPayments.equals(expected)).toBe(true);
    });

    it("Line 59 - sales or use tax remains outside line 46 and line 58 subtotals", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        salesUseTax: 45,
      }));

      expect(result.credits.salesUseTax.equals(d(45))).toBe(true);
      expect(result.totalNYStateTaxes.equals(result.credits.totalNYStateTaxes)).toBe(true);
      expect(result.totalLocalTaxes.equals(d(0))).toBe(true);
      expect(result.totalTaxBeforeCreditsAndPayments.equals(
        result.totalNYStateTaxes.plus(d(45))
      )).toBe(true);
    });

    it("NYC + Yonkers should not both be nonzero (mutually exclusive residency)", () => {
      // A filer cannot be both NYC and Yonkers resident simultaneously
      // If NYC resident, Yonkers should be "none"
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
        yonkersResidencyStatus: "none",
      }));

      expect(result.totalNYCTax.greaterThan(d(0))).toBe(true);
      expect(result.totalYonkersTax.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Refundable credits ---------- */

  describe("Refundable credits (lines 63-71)", () => {
    it("Line 63 - ESCC uses 2025 age-band credit and AGI phaseout from IT-213", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 76499,
        qualifyingChildrenUnder4: 1,
        qualifyingChildrenAge4To16: 1,
      }));

      // IT-213: $1,000 + $330 base credit minus $17 phaseout = $1,313
      expect(result.empireStateChildCreditAmount.equals(d(1313))).toBe(true);
      expect(result.empireStateChildCredit).not.toBeNull();
    });

    it("Line 63 - no qualifying children means no ESCC", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      expect(result.empireStateChildCreditAmount.equals(d(0))).toBe(true);
      expect(result.empireStateChildCredit).toBeNull();
    });

    it("Line 64 - IT-216 combines NYS and NYC child care credits", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 20000,
        isNYCResident: true,
        it216: {
          qualifiedExpenses: 4000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 20000,
          qualifiedExpensesForChildrenUnder4: 4000,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.equals(d(1056))).toBe(true);
      expect(result.childDependentCareCredit!.nycCredit.equals(d(792))).toBe(true);
      expect(result.childDependentCareCreditAmount.equals(d(1848))).toBe(true);
    });

    it("Line 65 - household credit reduces the allowable NY EIC", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 25000,
        federalEic: 3000,
      }));

      // Base NY EIC = 30% × 3000 = 900; household credit at $25,000 single = $25
      expect(result.nyEarnedIncomeCredit.equals(d(875))).toBe(true);
      expect(result.nyNoncustodialParentEarnedIncomeCredit.equals(d(0))).toBe(true);
    });

    it("Line 65 - official IT-215 resident worksheet caps the household-credit subtraction after resident and accumulation credits", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 9000,
        federalEic: 3000,
        residentCredit: 33,
        it201attNonrefundableCredits: {
          accumulationDistributionCredit: 6,
        },
      }));

      expect(result.taxComputation.tax.equals(d(41))).toBe(true);
      expect(result.credits.householdCredit.equals(d(41))).toBe(true);
      expect(result.credits.residentCredit.equals(d(33))).toBe(true);
      expect(result.it201attNonrefundableCredits!.accumulationDistributionCredit.equals(d(6))).toBe(true);
      expect(result.nyEarnedIncomeCredit.equals(d(898))).toBe(true);
    });

    it("Line 65 - IT-215 joint federal NY-MFS allocation routes the claimed line 17 share to the return", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 40000,
        filingStatus: "married_filing_separately",
        federalEic: 3000,
        it215: {
          jointFederalReturnForMfsAllocation: true,
          line17AllocatedNYSEic: 275,
        },
      }));

      expect(result.credits.nyEarnedIncomeCredit.equals(d(275))).toBe(true);
      expect(result.nyEarnedIncomeCredit.equals(d(275))).toBe(true);
    });

    it("Line 65 - IT-209 keeps the credit on line 65 when the regular NYS EIC is greater", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 25000,
        federalEic: 3000,
        residentCredit: 15,
        it209: {
          ageAtYearEnd: 30,
          hasQualifyingNoncustodialChild: true,
          supportOrderInEffectHalfYear: true,
          paidRequiredChildSupport: true,
          hasValidSocialSecurityNumber: true,
          investmentIncome: 0,
          wagesSalariesTips: 25000,
        },
      }));

      expect(result.it209Result).not.toBeNull();
      expect(result.nyEarnedIncomeCredit.equals(d(875))).toBe(true);
      expect(result.nyNoncustodialParentEarnedIncomeCredit.equals(d(0))).toBe(true);
    });

    it("Line 66 - noncustodial parent EIC uses 2.5x multiplier", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 25000,
        federalEic: 1000,
        isNoncustodialParentEic: true,
      }));

      expect(result.nyEarnedIncomeCredit.equals(d(0))).toBe(true);
      expect(result.nyNoncustodialParentEarnedIncomeCredit.equals(d(2500))).toBe(true);
    });

    it("Line 66 - IT-209 sends the greater noncustodial credit to line 66", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 15000,
        it209: {
          ageAtYearEnd: 30,
          hasQualifyingNoncustodialChild: true,
          supportOrderInEffectHalfYear: true,
          paidRequiredChildSupport: true,
          hasValidSocialSecurityNumber: true,
          investmentIncome: 0,
          wagesSalariesTips: 15000,
        },
      }));

      expect(result.it209Result).not.toBeNull();
      expect(result.nyEarnedIncomeCredit.equals(d(0))).toBe(true);
      expect(result.nyNoncustodialParentEarnedIncomeCredit.equals(d(866))).toBe(true);
    });

    it("Line 67 - real property tax credit passes through", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        realPropertyTaxCredit: 375,
      }));

      expect(result.realPropertyTaxCredit.equals(d(375))).toBe(true);
    });

    it("Line 69 - NYC resident below threshold gets fixed school tax credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        isNYCResident: true,
      }));

      expect(result.nycSchoolTaxCreditFixedAmount.equals(d(63))).toBe(true);
    });

    it("Line 69a - NYC school tax rate reduction uses taxable income schedule", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        isNYCResident: true,
      }));

      // Single filer taxable income = $92,000 -> $21 + 0.228% × $80,000 = $203.40 -> $203
      expect(result.nycSchoolTaxCreditRateReductionAmount.equals(d(203))).toBe(true);
    });

    it("Line 47 - charitable gifts trust addback recomputes NYC taxable income and line 69a", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 10000,
        isNYCResident: true,
        it196: {
          charitableDeduction: 9000,
        },
        nycCharitableGiftsTrustContributionAddback: 3000,
      }));

      expect(result.deduction.deductionUsed).toBe("itemized");
      expect(result.deduction.taxableIncome.equals(d(1000))).toBe(true);
      expect(result.nycTax.nycTaxableIncome.equals(d(4000))).toBe(true);
      expect(result.nycTax.nycResidentTax.equals(d(123))).toBe(true);
      expect(result.nycSchoolTaxCreditRateReductionAmount.equals(d(7))).toBe(true);
    });

    it("Line 47 validation - charitable gifts trust addback requires the itemized deduction path", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          federalAgi: 75000,
          isNYCResident: true,
          nycCharitableGiftsTrustContributionAddback: 3000,
        }))
      ).toThrow(
        "NY IT-201 line 47 charitable gifts trust addback requires the NY itemized deduction path on line 34"
      );
    });

    it("Line 70 - NYC earned income credit passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nycEarnedIncomeCredit: 125,
      }));

      expect(result.nycEarnedIncomeCreditAmount.equals(d(125))).toBe(true);
    });

    it("Line 70 - IT-215 computes NYC earned income credit from federal EIC and NYAGI", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 6250,
        federalEic: 3000,
        isNYCResident: true,
        nycEarnedIncomeCredit: 125,
        it215: {},
      }));

      expect(result.nycEarnedIncomeCreditAmount.equals(d(825))).toBe(true);
    });

    it("Line 70 - IT-215 joint federal NY-MFS allocation routes the claimed Worksheet C line 4 share to the return", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 40000,
        filingStatus: "married_filing_separately",
        federalEic: 3000,
        isNYCResident: true,
        it215: {
          jointFederalReturnForMfsAllocation: true,
          line17AllocatedNYSEic: 275,
          worksheetCLine4AllocatedNYCEic: 150,
        },
      }));

      expect(result.nycEarnedIncomeCreditResult!.worksheetCLine3CombinedNYCEarnedIncomeCredit.equals(d(450))).toBe(true);
      expect(result.nycEarnedIncomeCreditAmount.equals(d(150))).toBe(true);
    });

    it("Line 70a - NYC income tax elimination credit passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nycIncomeTaxEliminationCredit: 88,
      }));

      expect(result.nycIncomeTaxEliminationCreditAmount.equals(d(88))).toBe(true);
    });

    it("Line 70a - IT-270 computes the NYC income tax elimination credit from line 54", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        federalAgi: 31503,
        isNYCResident: true,
        numberOfDependents: 1,
      }));

      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 31503,
        isNYCResident: true,
        numberOfDependents: 1,
        it270: {
          investmentIncome: 0,
          claimsPassThroughEntityTaxCredit: false,
        },
      }));

      expect(result.nycIncomeTaxEliminationCreditAmount.equals(probe.totalNYCTax)).toBe(true);
    });

    it("Line 70a - computed IT-270 credit overrides the passthrough amount", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        federalAgi: 34003,
        isNYCResident: true,
        numberOfDependents: 1,
      }));

      const expectedComputedCredit = probe.totalNYCTax
        .times(d("0.5"))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 34003,
        isNYCResident: true,
        numberOfDependents: 1,
        nycIncomeTaxEliminationCredit: 88,
        it270: {
          investmentIncome: 0,
          claimsPassThroughEntityTaxCredit: false,
        },
      }));

      expect(result.nycIncomeTaxEliminationCreditAmount.equals(expectedComputedCredit)).toBe(true);
    });

    it("Line 42 - IT-201-ATT nonrefundable state credits override the passthrough amount", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        otherNYStateCredits: 999,
        it201attNonrefundableCredits: {
          accumulationDistributionCredit: 18,
          otherNoncarryoverCreditEntries: [
            { code: "133", amount: 12 },
            { code: "170", amount: 8 },
          ],
          longTermCareInsuranceCredit: 40,
          investmentCredit: 25,
          solarEnergySystemEquipmentCredit: 15,
          otherCarryoverCreditEntries: [
            { code: "052", amount: 30 },
            { code: "054", amount: 20 },
          ],
        },
      }));

      expect(result.it201attNonrefundableCredits).not.toBeNull();
      expect(result.credits.otherNYStateCredits.equals(d(168))).toBe(true);
      expect(result.it201attNonrefundableCredits!.totalNYStateNonrefundableCredits.equals(d(168))).toBe(true);
    });

    it("Line 42 - structured IT-249 overrides the direct long-term care insurance credit passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 92000,
        otherNYStateCredits: 999,
        it249: {
          premiumsPaid: 6000,
          partnershipCreditShare: 150,
          sCorporationCreditShare: 25,
          fiduciaryCreditShare: 10,
          priorYearCarryover: 200,
        },
        it201attNonrefundableCredits: {
          accumulationDistributionCredit: 18,
          otherNoncarryoverCreditEntries: [
            { code: "133", amount: 12 },
            { code: "170", amount: 8 },
          ],
          longTermCareInsuranceCredit: 40,
          investmentCredit: 25,
          solarEnergySystemEquipmentCredit: 15,
          otherCarryoverCreditEntries: [
            { code: "052", amount: 30 },
            { code: "054", amount: 20 },
          ],
        },
      }));

      expect(result.it249Result).not.toBeNull();
      expect(result.it249Result!.creditUsedThisYear.equals(d(1585))).toBe(true);
      expect(result.it201attNonrefundableCredits).not.toBeNull();
      expect(result.it201attNonrefundableCredits!.longTermCareInsuranceCredit.equals(d(1585))).toBe(true);
      expect(result.credits.otherNYStateCredits.equals(d(1713))).toBe(true);
    });

    it("Line 53 - IT-201-ATT nonrefundable NYC credits override the passthrough amount", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
        otherNYCCredits: 999,
        it201attNonrefundableCredits: {
          nycResidentUbtCredit: 45,
          nycAccumulationDistributionCredit: 10,
          partYearNYCChildAndDependentCareCredit: 5,
        },
      }));

      expect(result.it201attNonrefundableCredits).not.toBeNull();
      expect(result.nycTax.otherNYCCredits.equals(d(60))).toBe(true);
      expect(result.it201attNonrefundableCredits!.totalNYCNonrefundableCredits.equals(d(60))).toBe(true);
    });

    it("Line 71 - other refundable credits still pass through when no IT-201-ATT inputs are provided", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        otherRefundableCredits: 500,
      }));

      expect(result.otherRefundableCredits.equals(d(500))).toBe(true);
    });

    it("Line 71 - IT-201-ATT refundable credits compute the line 18 total", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        otherRefundableCredits: 999,
        it201attRefundableCredits: {
          farmersSchoolTaxCredit: 120,
          otherRefundableCreditEntries: [
            { code: "114", amount: 80 },
            { code: "203", amount: 20 },
          ],
          nysClaimOfRightCredit: 15,
          nycClaimOfRightCredit: 10,
          yonkersClaimOfRightCredit: 5,
          mctmtClaimOfRightCredit: 3,
        },
      }));

      expect(result.it201attRefundableCredits).not.toBeNull();
      expect(result.otherRefundableCredits.equals(d(253))).toBe(true);
      expect(result.it201attRefundableCredits!.totalOtherRefundableCredits.equals(d(253))).toBe(true);
    });

    it("Line 71 - IT-217 computed credit overrides the manual farmers credit passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 250000,
        otherRefundableCredits: 999,
        it217: {
          meetsQualifiedPropertyRequirement: true,
          meetsEligibleFarmerIncomeTest: true,
          directQualifiedAgriculturalAcreage: 500,
          directEligibleSchoolTaxes: 10000,
        },
        it201attRefundableCredits: {
          farmersSchoolTaxCredit: 120,
          otherRefundableCreditEntries: [
            { code: "114", amount: 80 },
            { code: "203", amount: 20 },
          ],
          nysClaimOfRightCredit: 15,
          nycClaimOfRightCredit: 10,
          yonkersClaimOfRightCredit: 5,
          mctmtClaimOfRightCredit: 3,
        },
      }));

      expect(result.it217Result).not.toBeNull();
      expect(result.it217Result!.line19FarmersSchoolTaxCredit.equals(d(4250))).toBe(true);
      expect(result.it201attRefundableCredits).not.toBeNull();
      expect(result.it201attRefundableCredits!.farmersSchoolTaxCredit.equals(d(4250))).toBe(true);
      expect(result.otherRefundableCredits.equals(d(4383))).toBe(true);
    });

    it("Line 71 - IT-119 adds STAR reconciliation to refundable credits and the Yonkers worksheet", () => {
      const withoutIt119 = calculateNYIT201FullReturn(baseInput({
        yonkersResidencyStatus: "full_year",
        otherRefundableCredits: 40,
      }));
      const withIt119 = calculateNYIT201FullReturn(baseInput({
        yonkersResidencyStatus: "full_year",
        otherRefundableCredits: 40,
        it119: {
          receivedUnderpaymentNotice: true,
          properties: [
            { underpaymentAmount: 125 },
          ],
        },
      }));

      expect(withIt119.it119Result).not.toBeNull();
      expect(withIt119.otherRefundableCredits.equals(withoutIt119.otherRefundableCredits.plus(d(125)))).toBe(true);
      expect(withIt119.totalRefundableCredits.equals(withoutIt119.totalRefundableCredits.plus(d(125)))).toBe(true);
      expect(withIt119.totalYonkersTax.equals(withoutIt119.totalYonkersTax.plus(d(21)))).toBe(true);
    });

    it("Line 76 - total payments and refundable credits sum lines 63 through 75", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        realPropertyTaxCredit: 100,
        qualifyingChildren: 1,
        federalChildTaxCredit: 2000,
        otherRefundableCredits: 75,
        federalEic: 1500,
        nyStateTaxWithheld: 300,
        estimatedTaxPayments: 200,
      }));

      // ESCC: one legacy qualifyingChildren input maps to one child age 4 through 16 = $330
      // NY EIC: 30% × 1500 = 450
      const expectedRefundable = d(330).plus(450).plus(100).plus(75);
      expect(result.totalRefundableCredits.equals(expectedRefundable)).toBe(true);
      expect(result.totalPayments.equals(d(500))).toBe(true);
      expect(result.totalCreditsAndPayments.equals(expectedRefundable.plus(500))).toBe(true);
    });
  });

  /* ---------- Payments ---------- */

  describe("Payments (lines 72-75)", () => {
    it("Lines 72-75 - withholding and payment section", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 5000,
        nycTaxWithheld: 1000,
        yonkersTaxWithheld: 200,
        estimatedTaxPayments: 500,
        extensionPayment: 300,
      }));

      expect(result.nyStateTaxWithheld.equals(d(5000))).toBe(true);
      expect(result.nycTaxWithheld.equals(d(1000))).toBe(true);
      expect(result.yonkersTaxWithheld.equals(d(200))).toBe(true);
      expect(result.estimatedTaxPayments.equals(d(500))).toBe(true);
      expect(result.extensionPayment.equals(d(300))).toBe(true);
    });

    it("Line 75 - estimated tax and extension payments combine", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        estimatedTaxPayments: 1000,
        priorYearOverpaymentApplied: 400,
        extensionPayment: 250,
      }));

      expect(result.priorYearOverpaymentApplied.equals(d(400))).toBe(true);
      expect(result.totalEstimatedAndExtensionPayments.equals(d(1650))).toBe(true);
    });

    it("internal payment subtotal sums withholding and payment lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 3000,
        nycTaxWithheld: 500,
        estimatedTaxPayments: 1000,
      }));

      expect(result.totalPayments.equals(d(4500))).toBe(true);
    });

    it("structured withholding documents feed lines 72 through 74 and still allow direct additions", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        w2s: [
          {
            employer: { name: "Employer", ein: "12-3456789" },
            wages: "1000",
            federalWithheld: "100",
            box12CodeW: "0",
            box12CodeD: "0",
            box12CodeE: "0",
            box12CodeF: "0",
            box12CodeG: "0",
            box12CodeH: "0",
            box12CodeS: "0",
            box12CodeAA: "0",
            box12CodeBB: "0",
            box12CodeEE: "0",
            box12CodeT: "0",
            socialSecurityWages: "0",
            socialSecurityTips: "0",
            socialSecurityWithheld: "0",
            medicareWages: "0",
            medicareWithheld: "0",
            stateTaxWithheld: "1000",
            localTaxWithheld: "150",
            stateWages: "0",
            state: "NY",
            locality: "NYC",
          },
        ],
        form1099R: [
          {
            payer: "Plan",
            grossDistribution: "2000",
            taxableAmount: "2000",
            federalWithheld: "0",
            employeeContributions: "0",
            eligibleGovernmental457bPlan: false,
            eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0",
            rothConversionAmount: "0",
            rothContributionOrConversionMadeBefore2021: false,
            qualifiedRothDistribution: false,
            rothIraRolledOverAmount: "0",
            returnedContributionByDueDate: false,
            excessContributionReturnedWithoutEarnings: false,
            qualifiedCharitableDistribution: "0",
            retiredPublicSafetyOfficerInsurancePremiums: "0",
            separationFromServiceAfterAge55ExceptionApplies: false,
            qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false,
            qualifiedDomesticRelationsOrderExceptionApplies: false,
            terminalIllnessExceptionApplies: false,
            iraSepSimple: false,
            disabilityPensionBeforeMinimumRetirementAge: false,
            state: "New York",
            stateTaxWithheld: "50",
            localTaxWithheld: "10",
            locality: "Yonkers",
          },
        ],
        form1099G: [
          {
            payer: "NYS DOL",
            unemploymentCompensation: "0",
            federalWithheld: "0",
            stateWithheld: "75",
            state: "NY",
          },
        ],
        formW2G: [
          {
            payer: "Casino",
            reportableWinnings: "0",
            federalWithheld: "0",
            stateWithheld: "25",
            state: "New York",
          },
        ],
        nyStateTaxWithheld: 20,
        nycTaxWithheld: 5,
        yonkersTaxWithheld: 3,
        estimatedTaxPayments: 1000,
      }));

      expect(result.nyStateTaxWithheld.equals(d(1170))).toBe(true);
      expect(result.nycTaxWithheld.equals(d(155))).toBe(true);
      expect(result.yonkersTaxWithheld.equals(d(13))).toBe(true);
      expect(result.totalPayments.equals(d(2338))).toBe(true);
    });

    it("no payments: total payments is zero", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      expect(result.totalPayments.equals(d(0))).toBe(true);
    });
  });

  /* ---------- Refund / Balance Due ---------- */

  describe("Refund and balance due (lines 77-82)", () => {
    it("Line 77 - overpayment results in refund", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      // With $20k withheld on ~$3.5k tax, there's a large refund
      expect(result.overpayment.greaterThan(d(0))).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
      expect(result.overpaymentOrBalanceDue.greaterThan(d(0))).toBe(true);
    });

    it("Line 78 - refund available is reduced by line 79 estimated tax allocation", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        appliedToNextYearEstimatedTax: 1500,
      }));

      expect(result.overpayment.equals(probe.overpayment)).toBe(true);
      expect(result.appliedToNextYearEstimatedTax.equals(d(1500))).toBe(true);
      expect(result.amountAvailableForRefund.equals(probe.overpayment.minus(d(1500)))).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
    });

    it("Line 78a - NYS 529 deposit reduces the cash refund after line 79", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        appliedToNextYearEstimatedTax: 1500,
      }));

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        appliedToNextYearEstimatedTax: 1500,
        nys529AccountDeposit: 1200,
      }));

      expect(result.amountAvailableForRefund.equals(probe.amountAvailableForRefund)).toBe(true);
      expect(result.nys529AccountDeposit.equals(d(1200))).toBe(true);
      expect(result.cashRefundAfterNys529AccountDeposit.equals(probe.amountAvailableForRefund.minus(d(1200)))).toBe(true);
    });

    it("Line 78b - cash refund equals line 78 minus the NYS 529 deposit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      expect(result.nys529AccountDeposit.equals(d(0))).toBe(true);
      expect(result.cashRefundAfterNys529AccountDeposit.equals(result.amountAvailableForRefund)).toBe(true);
    });

    it("Line 79 - default next-year estimated tax application is zero", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      expect(result.appliedToNextYearEstimatedTax.equals(d(0))).toBe(true);
      expect(result.amountAvailableForRefund.equals(result.overpayment)).toBe(true);
    });

    it("Line 79 - overpayment can be applied to next-year estimated tax", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        appliedToNextYearEstimatedTax: 5000,
      }));

      expect(result.overpayment.greaterThan(d(5000))).toBe(true);
      expect(result.appliedToNextYearEstimatedTax.equals(d(5000))).toBe(true);
      expect(result.amountAvailableForRefund.equals(result.overpayment.minus(d(5000)))).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
    });

    it("line 79 cannot exceed the line 77 overpayment", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          nyStateTaxWithheld: 20000,
          appliedToNextYearEstimatedTax: 50000,
        }))
      ).toThrow("NY IT-201 line 79 applied estimated tax cannot exceed line 77 overpayment");
    });

    it("line 78a cannot exceed the line 78 amount available for refund", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          nyStateTaxWithheld: 20000,
          appliedToNextYearEstimatedTax: probe.overpayment.minus(d(1000)),
          nys529AccountDeposit: 1001,
        }))
      ).toThrow("NY IT-201 line 78a NYS 529 account deposit cannot exceed line 78 amount available for refund");
    });

    it("Line 80 - underpayment results in amount owed", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 200000,
      }));

      // No payments, substantial tax → balance due
      expect(result.amountOwed.greaterThan(d(0))).toBe(true);
      expect(result.overpayment.equals(d(0))).toBe(true);
      expect(result.overpaymentOrBalanceDue.lessThan(d(0))).toBe(true);
    });

    it("Line 81 - estimated tax penalty reduces overpayment before refund allocation", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        estimatedTaxPenalty: 400,
      }));

      expect(result.estimatedTaxPenalty.equals(d(400))).toBe(true);
      expect(result.overpayment.equals(probe.overpayment.minus(d(400)))).toBe(true);
      expect(result.amountAvailableForRefund.equals(result.overpayment)).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
    });

    it("Line 81 - penalty larger than a small overpayment becomes amount owed", () => {
      const probe = calculateNYIT201FullReturn(baseInput());

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: probe.totalTaxBeforeCreditsAndPayments.plus(d(100)),
        estimatedTaxPenalty: 250,
      }));

      expect(result.overpayment.equals(d(0))).toBe(true);
      expect(result.estimatedTaxPenalty.equals(d(250))).toBe(true);
      expect(result.amountOwed.equals(d(150))).toBe(true);
      expect(result.overpaymentOrBalanceDue.equals(d(-150))).toBe(true);
    });

    it("Line 82 - other penalties and interest increase amount owed without reducing line 77", () => {
      const probe = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
      }));

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 20000,
        otherPenaltiesAndInterest: 125,
      }));

      expect(result.otherPenaltiesAndInterest.equals(d(125))).toBe(true);
      expect(result.overpayment.equals(probe.overpayment)).toBe(true);
      expect(result.amountAvailableForRefund.equals(probe.overpayment)).toBe(true);
      expect(result.amountOwed.equals(d(125))).toBe(true);
      expect(result.overpaymentOrBalanceDue.equals(probe.overpayment.minus(d(125)))).toBe(true);
    });

    it("exact payment equals tax: zero refund and zero owed", () => {
      // First compute tax to know the exact amount
      const probe = calculateNYIT201FullReturn(baseInput());
      const exactTax = probe.totalTaxBeforeCreditsAndPayments;

      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: exactTax,
      }));

      expect(result.overpayment.equals(d(0))).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
    });

    it("refundable credits reduce balance due", () => {
      const probe = calculateNYIT201FullReturn(baseInput({ federalAgi: 100000 }));
      const taxWithout = probe.amountOwed;

      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        federalEic: 3000,
      }));

      // NY EIC remains refundable and should reduce balance due
      expect(result.amountOwed.lessThan(taxWithout)).toBe(true);
    });

    it("refundable credits can produce a refund even with no payments", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 15000,
        federalEic: 5000,
        qualifyingChildren: 2,
        federalChildTaxCredit: 4000,
      }));

      // Low income + large refundable credits → refund
      expect(result.overpayment.greaterThan(d(0))).toBe(true);
    });
  });

  /* ---------- Full scenario tests ---------- */

  describe("Full scenario: NYC resident with children", () => {
    it("NYC single filer with W-2 income and 1 child", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 65000,
        filingStatus: "single",
        taxYear: 2025,
        isNYCResident: true,
        numberOfDependents: 1,
        qualifyingChildren: 1,
        federalChildTaxCredit: 2000,
        nyStateTaxWithheld: 3500,
        nycTaxWithheld: 1200,
      });

      // Verify sub-modules wired correctly
      expect(result.additionsSubtractions.nyAgi.equals(d(65000))).toBe(true);
      expect(result.deduction.deductionUsed).toBe("standard");
      // Single SD = 8000, 1 dep × 1000 = 1000, TI = 65000 - 8000 - 1000 = 56000
      expect(result.deduction.taxableIncome.equals(d(56000))).toBe(true);

      // State tax should be non-zero
      expect(result.taxComputation.tax.greaterThan(d(0))).toBe(true);

      // NYC tax should be non-zero
      expect(result.totalNYCTax.greaterThan(d(0))).toBe(true);

      // ESCC: one child age 4 through 16 at $330 with no phaseout
      expect(result.empireStateChildCreditAmount.equals(d(330))).toBe(true);

      // Total payments = 3500 + 1200 = 4700
      expect(result.totalPayments.equals(d(4700))).toBe(true);

      // Should have a result (refund or owed)
      const netResult = result.overpayment.minus(result.amountOwed);
      expect(netResult.equals(result.overpaymentOrBalanceDue)).toBe(true);
    });
  });

  describe("Full scenario: MFJ couple with typical deductions", () => {
    it("MFJ with pension exclusion and SS benefits subtraction", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 120000,
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        numberOfDependents: 0,
        pensionExclusion: {
          nonGovernmentPensionIncome: 25000,
          isAge59AndHalf: true,
        },
        taxableSocialSecurityBenefits: 15000,
        nyStateTaxWithheld: 6000,
        estimatedTaxPayments: 2000,
      });

      // NY AGI = 120000 - 20000 (pension, capped) - 15000 (SS) = 85000
      expect(result.additionsSubtractions.nyAgi.equals(d(85000))).toBe(true);

      // MFJ standard deduction = 16050
      expect(result.deduction.standardDeduction.equals(d(16050))).toBe(true);
      // TI = 85000 - 16050 = 68950
      expect(result.deduction.taxableIncome.equals(d(68950))).toBe(true);

      // Total payments = 6000 + 2000 = 8000
      expect(result.totalPayments.equals(d(8000))).toBe(true);
    });
  });

  describe("Full scenario: Yonkers nonresident worker", () => {
    it("single Yonkers nonresident earning wages in Yonkers", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 50000,
        filingStatus: "single",
        taxYear: 2025,
        yonkersResidencyStatus: "nonresident",
        yonkersWages: 40000,
        nyStateTaxWithheld: 2500,
        yonkersTaxWithheld: 200,
      });

      // Yonkers nonresident earnings tax = 40000 × 0.5% = 200
      expect(result.yonkersTax.yonkersNonresidentEarningsTax.equals(d(200))).toBe(true);
      expect(result.totalYonkersTax.equals(d(200))).toBe(true);

      // No NYC tax
      expect(result.totalNYCTax.equals(d(0))).toBe(true);

      // Local taxes = Yonkers only
      expect(result.totalLocalTaxes.equals(d(200))).toBe(true);
    });
  });

  describe("Full scenario: low-income filer with refundable credits", () => {
    it("HoH with EIC and ESCC gets refund", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 20000,
        filingStatus: "head_of_household",
        taxYear: 2025,
        numberOfDependents: 2,
        qualifyingChildren: 2,
        federalChildTaxCredit: 4000,
        federalEic: 5000,
        nyStateTaxWithheld: 500,
      });

      // HoH standard deduction = $11,200
      expect(result.deduction.standardDeduction.equals(d(11200))).toBe(true);
      // 2 dependents × $1,000 = $2,000
      expect(result.deduction.dependentExemption.equals(d(2000))).toBe(true);
      // TI = 20000 - 11200 - 2000 = 6800
      expect(result.deduction.taxableIncome.equals(d(6800))).toBe(true);

      // ESCC: two children age 4 through 16 at $330 each = $660
      expect(result.empireStateChildCreditAmount.equals(d(660))).toBe(true);

      // Base NY EIC = $1,500; household credit at HoH $20,000 with 2 dependents = $90
      expect(result.nyEarnedIncomeCredit.equals(d(1410))).toBe(true);

      // With substantial refundable credits, should get a refund
      expect(result.overpayment.greaterThan(d(0))).toBe(true);
    });
  });

  describe("Full scenario: high-income filer with recapture", () => {
    it("single filer with AGI above recapture threshold", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 500000,
        filingStatus: "single",
        taxYear: 2025,
        nyStateTaxWithheld: 25000,
      });

      // AGI > $107,650 triggers recapture
      expect(result.taxComputation.computationMethod).not.toBe("rate_schedule");
      expect(result.taxComputation.recaptureAmount.greaterThan(d(0))).toBe(true);

      // Tax should be substantially higher than rate schedule alone
      expect(result.taxComputation.tax.greaterThan(d(20000))).toBe(true);
    });
  });

  describe("Full scenario: NYC + multiple credits", () => {
    it("NYC MFJ filer with property tax credit, EIC, and ESCC", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 40000,
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        isNYCResident: true,
        numberOfDependents: 2,
        qualifyingChildren: 2,
        federalChildTaxCredit: 4000,
        federalEic: 4000,
        realPropertyTaxCredit: 375,
        nyStateTaxWithheld: 1500,
        nycTaxWithheld: 600,
      });

      // MFJ SD = 16050, deps = 2000, TI = 40000 - 16050 - 2000 = 21950
      expect(result.deduction.taxableIncome.equals(d(21950))).toBe(true);

      // ESCC: two children age 4 through 16 at $330 each = $660
      expect(result.empireStateChildCreditAmount.equals(d(660))).toBe(true);

      // No household credit applies at this income, so NY EIC stays at 30% × 4000
      expect(result.nyEarnedIncomeCredit.equals(d(1200))).toBe(true);

      // Total refundable = ESCC 660 + NY EIC 1200 + property tax 375 + NYC school fixed 125 + NYC school rate reduction 38
      expect(result.totalRefundableCredits.equals(d(2398))).toBe(true);

      // Should get a refund with these credits
      expect(result.overpayment.greaterThan(d(0))).toBe(true);
    });
  });

  /* ---------- Audit trail ---------- */

  describe("Audit trail", () => {
    it("produces audit lines for orchestrator-specific computations", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
        nyStateTaxWithheld: 5000,
      }));

      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));

      // Check orchestrator-specific lines exist
      expect(lineMap.has("NY-IT201:58")).toBe(true); // Total local taxes
      expect(lineMap.has("NY-IT201:61")).toBe(true); // Total taxes
      expect(lineMap.has("NY-IT201:62")).toBe(true); // Carryforward total taxes
      expect(lineMap.has("NY-IT201:66")).toBe(true); // Total refundable credits
      expect(lineMap.has("NY-IT201:76")).toBe(true); // Total payments and refundable credits
      expect(lineMap.has("NY-IT201:77")).toBe(true); // Overpayment
      expect(lineMap.has("NY-IT201:78a")).toBe(true); // NYS 529 deposit
      expect(lineMap.has("NY-IT201:78b")).toBe(true); // Cash refund after NYS 529 deposit
      expect(lineMap.has("NY-IT201:80")).toBe(true); // Amount owed
    });

    it("includes sub-module audit lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
      }));

      const forms = new Set(result.lines.map(l => l.form));

      // Should include lines from sub-modules
      expect(forms.has("NY-IT201")).toBe(true);
    });

    it("audit lines include correct values for payments", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyStateTaxWithheld: 3000,
        estimatedTaxPayments: 1000,
      }));

      const line76 = result.lines.find(l => l.form === "NY-IT201" && l.line === "76");
      expect(line76).toBeDefined();
      expect(line76!.value.equals(d(4000))).toBe(true);
    });

    it("audit trail for line 61 references line 47 total state taxes as the upstream source", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        isNYCResident: true,
        salesUseTax: 45,
        voluntaryContributions: 25,
      }));

      const line61 = result.lines.find(l => l.form === "NY-IT201" && l.line === "61");
      expect(line61).toBeDefined();
      expect(line61!.formula).toBe("Line 46 + Line 58 + Line 59 + Line 60");
      expect(line61!.inputs).toHaveProperty("Total NY State taxes (line 46)");
      expect(line61!.inputs).toHaveProperty("Sales or use tax (line 59)");
    });

    it("audit trail for line 58 references NYC line 54 and includes MCTMT in the local-tax formula", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        isNYCResident: true,
        mctmt: { zone1Earnings: 120000 },
      }));

      const line58 = result.lines.find(l => l.form === "NY-IT201" && l.line === "58");
      expect(line58).toBeDefined();
      expect(line58!.formula).toBe("Line 54 + Line 54e + Line 55 + Line 56 + Line 57");
      expect(line58!.inputs).toHaveProperty("Total NYC tax (line 54)");
      expect(line58!.inputs).toHaveProperty("Total MCTMT (line 54e)");
    });
  });

  /* ---------- Edge cases ---------- */

  describe("Edge cases", () => {
    it("zero federal AGI produces zero tax and zero owed", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 0,
      }));

      expect(result.deduction.taxableIncome.equals(d(0))).toBe(true);
      expect(result.taxComputation.tax.equals(d(0))).toBe(true);
      expect(result.totalTaxBeforeCreditsAndPayments.equals(d(0))).toBe(true);
      expect(result.amountOwed.equals(d(0))).toBe(true);
    });

    it("negative taxable income floors to zero", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 5000,
      }));

      // AGI 5000 minus 8000 standard deduction → negative, floored to 0
      expect(result.deduction.taxableIncome.equals(d(0))).toBe(true);
      expect(result.taxComputation.tax.equals(d(0))).toBe(true);
    });

    it("all filing statuses produce valid results", () => {
      const statuses: Array<NYIT201FullReturnInput["filingStatus"]> = [
        "single",
        "married_filing_jointly",
        "married_filing_separately",
        "head_of_household",
        "qualifying_surviving_spouse",
      ];

      for (const filingStatus of statuses) {
        const result = calculateNYIT201FullReturn(baseInput({
          filingStatus,
          federalAgi: 80000,
        }));

        expect(result.taxComputation.tax.greaterThanOrEqualTo(d(0))).toBe(true);
        expect(result.totalTaxBeforeCreditsAndPayments.greaterThanOrEqualTo(d(0))).toBe(true);
      }
    });

    it("extremely high income uses flat 10.9% rate", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 30000000,
      }));

      expect(result.taxComputation.computationMethod).toBe("flat_rate");
    });

    it("default values: no NYC, no Yonkers, no credits, no payments", () => {
      const result = calculateNYIT201FullReturn(baseInput());

      expect(result.totalNYCTax.equals(d(0))).toBe(true);
      expect(result.totalYonkersTax.equals(d(0))).toBe(true);
      expect(result.totalRefundableCredits.equals(d(0))).toBe(true);
      expect(result.totalPayments.equals(d(0))).toBe(true);
      // All tax is owed since no payments
      expect(result.amountOwed.equals(result.totalTaxBeforeCreditsAndPayments)).toBe(true);
    });

    it("MFJ couple with both spouses having pension exclusion", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 160000,
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
        pensionExclusion: {
          nonGovernmentPensionIncome: 30000,
          isAge59AndHalf: true,
        },
        spousePensionExclusion: {
          nonGovernmentPensionIncome: 25000,
          isAge59AndHalf: true,
        },
        nyStateTaxWithheld: 8000,
      });

      // Each spouse capped at $20,000 exclusion
      // NY AGI = 160000 - 20000 - 20000 = 120000
      expect(result.additionsSubtractions.nyAgi.equals(d(120000))).toBe(true);
    });

    it("college tuition deduction flows through to NY AGI", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [
          { tuitionPaid: 12000 },
          { tuitionPaid: 8000 },
        ],
      }));

      // Each student capped at $10,000: 10000 + 8000 = 18000
      // NY AGI = 75000 - 18000 = 57000
      expect(result.additionsSubtractions.nyAgi.equals(d(57000))).toBe(true);
    });
  });

  /* ---------- Household credit integration ---------- */

  describe("Household credit integration", () => {
    it("low-AGI single filer gets household credit reducing state tax", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 10000,
      }));

      // Single federal AGI $10,000 uses table 1 → $45 household credit
      expect(result.credits.householdCredit.equals(d(45))).toBe(true);
    });

    it("low-AGI MFJ filer with dependents gets the table 2 credit capped by line 39 tax", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 20000,
        filingStatus: "married_filing_jointly",
        numberOfDependents: 2,
      }));

      // Table 2, $7,001-$20,000 row, household size 4 = $105, capped at the line 39 tax
      expect(result.credits.householdCredit.equals(Decimal.min(d(105), result.taxComputation.tax))).toBe(true);
    });

    it("high-AGI filer gets no household credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 75000,
      }));

      expect(result.credits.householdCredit.equals(d(0))).toBe(true);
    });
  });

  /* ---------- College tuition credit (IT-272) integration ---------- */

  describe("College tuition credit (IT-272) integration", () => {
    it("default preference is deduction: tuition reduces NY AGI", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
      }));

      // Deduction: NY AGI = 75000 - 10000 = 65000
      expect(result.additionsSubtractions.nyAgi.equals(d(65000))).toBe(true);
      expect(result.collegeTuitionCredit).toBeNull();
    });

    it("credit preference routes tuition to IT-272 instead of deduction", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
      }));

      // Credit mode: NY AGI stays 75000 (no deduction)
      expect(result.additionsSubtractions.nyAgi.equals(d(75000))).toBe(true);
      expect(result.collegeTuitionCredit).not.toBeNull();
      expect(result.collegeTuitionCredit!.computedCredit.equals(d(400))).toBe(true);
    });

    it("credit does not flow to other NY State credits (line 42)", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
      }));

      // IT-272 is refundable on IT-201 line 68, not a line 42 nonrefundable credit
      expect(result.credits.otherNYStateCredits.equals(d(0))).toBe(true);
    });

    it("other NY State credits remain separate from IT-272", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
        otherNYStateCredits: 200,
      }));

      // Only the direct line 42 passthrough should remain here
      expect(result.credits.otherNYStateCredits.equals(d(200))).toBe(true);
    });

    it("IT-272 does not inflate IT-201-ATT computed line 42 credits", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
        it201attNonrefundableCredits: {
          investmentCredit: 50,
        },
      }));

      expect(result.collegeTuitionCredit).not.toBeNull();
      expect(result.credits.otherNYStateCredits.equals(d(50))).toBe(true);
      expect(result.collegeTuitionCreditAmount.equals(d(400))).toBe(true);
    });

    it("IT-272 credit remains refundable for low-tax filer", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 9000,
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
      }));

      expect(result.taxComputation.tax.lessThan(d(400))).toBe(true);
      expect(result.collegeTuitionCredit).not.toBeNull();
      expect(result.collegeTuitionCredit!.credit.equals(d(400))).toBe(true);
      expect(result.totalRefundableCredits.greaterThanOrEqualTo(d(400))).toBe(true);
    });

    it("deduction is more beneficial for mid-income filer", () => {
      // Compare tax with deduction vs credit
      const withDeduction = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "deduction",
      }));

      const withCredit = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [{ tuitionPaid: 10000 }],
        collegeTuitionPreference: "credit",
      }));

      // At $75k AGI (6.85% marginal rate), deduction saves $685 vs $400 credit
      // So deduction should produce lower total tax
      expect(
        withDeduction.totalTaxBeforeCreditsAndPayments.lessThan(
          withCredit.totalTaxBeforeCreditsAndPayments
        )
      ).toBe(true);
    });

    it("no students with credit preference: no IT-272 computed", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionPreference: "credit",
      }));

      expect(result.collegeTuitionCredit).toBeNull();
    });

    it("multiple students with credit preference", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        collegeTuitionStudents: [
          { tuitionPaid: 10000 },
          { tuitionPaid: 8000 },
        ],
        collegeTuitionPreference: "credit",
      }));

      // (10000 + 8000) × 4% = 720
      expect(result.collegeTuitionCredit!.computedCredit.equals(d(720))).toBe(true);
    });
  });

  /* ---------- NYC school tax credit integration ---------- */

  describe("NYC school tax credit integration", () => {
    it("NYC resident below threshold gets $63 school tax credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        isNYCResident: true,
      }));

      // Single threshold is $250,000, AGI is $100k → eligible
      expect(result.nycSchoolTaxCreditFixedAmount.equals(d(63))).toBe(true);
    });

    it("NYC resident above threshold gets no school tax credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 300000,
        isNYCResident: true,
      }));

      // Single threshold is $250,000, AGI is $300k → not eligible
      // Note: school tax credit uses NYC taxable income, not AGI
      // TI = 300000 - 8000 = 292000 > 250000
      expect(result.nycSchoolTaxCreditFixedAmount.equals(d(0))).toBe(true);
    });

    it("part-year NYC resident uses the Table 2 proration amount on line 69", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        isPartYearNYCResident: true,
        partYearNYCTax: 612,
        partYearNYCTaxableIncome: 28000,
        partYearNYCSchoolCreditMonths: 8,
      }));

      expect(result.nycSchoolTaxCreditFixedAmount.equals(d(42))).toBe(true);
    });

    it("part-year NYC resident uses IT-360.1 line 47 taxable income on line 69a", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        isPartYearNYCResident: true,
        partYearNYCTax: 612,
        partYearNYCTaxableIncome: 28000,
        partYearNYCSchoolCreditMonths: 8,
      }));

      // Single filer part-year NYC taxable income = $28,000
      // $21 + 0.228% × ($28,000 - $12,000) = $57.48 -> $57
      expect(result.nycSchoolTaxCreditRateReductionAmount.equals(d(57))).toBe(true);
    });
  });

  /* ========== IT-214 Real Property Tax Credit integration ========== */

  describe("IT-214 Real Property Tax Credit integration", () => {
    it("IT-214 computes credit for qualifying low-income homeowner", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 10000,
        it214: {
          hasPersonAge65OrOlder: false,
          homeowner: { realPropertyTaxesPaid: 2000 },
        },
      }));

      // IT-214 should compute a credit
      expect(result.realPropertyTaxCreditResult).not.toBeNull();
      expect(result.realPropertyTaxCreditResult!.eligible).toBe(true);
      // Table B: $9,001-$14,000 → $60
      expect(result.realPropertyTaxCredit.toNumber()).toBe(60);
      // Should be included in total refundable credits
      expect(result.totalRefundableCredits.greaterThanOrEqualTo(d(60))).toBe(true);
    });

    it("IT-214 65+ homeowner gets higher credit than under 65", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 8000,
        it214: {
          hasPersonAge65OrOlder: true,
          homeowner: { realPropertyTaxesPaid: 3000 },
        },
      }));

      expect(result.realPropertyTaxCreditResult).not.toBeNull();
      expect(result.realPropertyTaxCreditResult!.eligible).toBe(true);
      // Table A: $7,001-$9,000 → $260
      expect(result.realPropertyTaxCredit.toNumber()).toBe(260);
    });

    it("IT-214 renter computes credit from rent", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 5000,
        it214: {
          hasPersonAge65OrOlder: false,
          renter: {
            totalRentPaid: 4800,
            rentIncludesCharges: "none",
            monthsRentPaid: 12,
          },
        },
      }));

      // Adjusted rent = $4,800, avg monthly $400 → OK
      // Line 14 = $4,800 × 25% = $1,200
      // Rate = 0.04, threshold = $200
      // $200 < $1,200 → eligible
      // Table B: $0-$5,000 → $75
      expect(result.realPropertyTaxCreditResult).not.toBeNull();
      expect(result.realPropertyTaxCreditResult!.eligible).toBe(true);
      expect(result.realPropertyTaxCredit.toNumber()).toBe(75);
    });

    it("IT-214 ineligible (FAGI too high) returns zero credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 50000,
        it214: {
          hasPersonAge65OrOlder: false,
          homeowner: { realPropertyTaxesPaid: 3000 },
        },
      }));

      expect(result.realPropertyTaxCreditResult).not.toBeNull();
      expect(result.realPropertyTaxCreditResult!.eligible).toBe(false);
      expect(result.realPropertyTaxCredit.toNumber()).toBe(0);
    });

    it("IT-214 passthrough still works without it214 input", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 50000,
        realPropertyTaxCredit: 200,
      }));

      expect(result.realPropertyTaxCreditResult).toBeNull();
      expect(result.realPropertyTaxCredit.toNumber()).toBe(200);
    });

    it("IT-214 credit flows into refund computation", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 2000,
        it214: {
          hasPersonAge65OrOlder: true,
          homeowner: { realPropertyTaxesPaid: 1000 },
        },
        nyStateTaxWithheld: 0,
      }));

      // $2,000 FAGI → very low tax, $375 IT-214 credit (Table A: $0-$3,000)
      expect(result.realPropertyTaxCredit.toNumber()).toBe(375);
      // Since IT-214 is refundable, it should contribute to overpayment
      expect(result.totalRefundableCredits.greaterThanOrEqualTo(d(375))).toBe(true);
    });
  });

  /* ---------- IT-196 Itemized Deduction Integration ---------- */

  describe("IT-196 itemized deduction integration", () => {
    it("married filing separately IT-196 itemized deduction requires spouse confirmation before the itemized path can be used", () => {
      expect(() =>
        calculateNYIT201FullReturn(baseInput({
          filingStatus: "married_filing_separately",
          federalAgi: 80000,
          it196: {
            taxesDeduction: 10000,
            interestDeduction: 8000,
            charitableDeduction: 5000,
            stateLocalIncomeTaxSubtraction: 5000,
          },
        }))
      ).toThrow(
        "NY IT-201 married filing separately returns may use an itemized deduction only if both spouses elect to itemize on their New York returns"
      );
    });

    it("IT-196 computed deduction replaces passthrough when it196 inputs provided", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        it196: {
          taxesDeduction: 10000,
          interestDeduction: 8000,
          charitableDeduction: 5000,
          stateLocalIncomeTaxSubtraction: 5000,
        },
      }));

      // IT-196: total = $23,000, subtraction = $5,000, line 45 = $18,000
      expect(result.itemizedDeductionResult).not.toBeNull();
      expect(result.itemizedDeductionResult!.nyItemizedDeduction.toNumber()).toBe(18000);
      // The computed deduction should be used in the deduction step
      // Standard deduction for single is $8,000, $18,000 > $8,000 → itemized wins
      expect(result.deduction.deductionAmount.toNumber()).toBe(18000);
    });

    it("IT-196 passthrough still works when it196 not provided", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        nyItemizedDeduction: 15000,
      }));

      expect(result.itemizedDeductionResult).toBeNull();
      // Standard deduction for single = $8,000, $15,000 > $8,000 → itemized
      expect(result.deduction.deductionAmount.toNumber()).toBe(15000);
    });

    it("IT-196 with Pease limitation computes correctly through full return", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 450000,
        it196: {
          taxesDeduction: 25000,
          interestDeduction: 15000,
          charitableDeduction: 10000,
          stateLocalIncomeTaxSubtraction: 12000,
        },
      }));

      expect(result.itemizedDeductionResult).not.toBeNull();
      expect(result.itemizedDeductionResult!.peaseLimitationApplied).toBe(true);
      // Pease: excess = $450K - $340.7K = $109,300
      // 3% of $109,300 = $3,279
      // Subject to limit = $50,000 (all)
      // 80% of $50,000 = $40,000
      // Reduction = min($3,279, $40,000) = $3,279
      expect(result.itemizedDeductionResult!.peaseReduction.toNumber()).toBe(3279);
    });

    it("IT-196 with high-income limitation reduces deduction", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 600000,
        it196: {
          taxesDeduction: 20000,
          interestDeduction: 10000,
          charitableDeduction: 8000,
          stateLocalIncomeTaxSubtraction: 10000,
        },
      }));

      expect(result.itemizedDeductionResult).not.toBeNull();
      // High-income: NYAGI $600K → 50% of line 45
      expect(result.itemizedDeductionResult!.highIncomeAdjustment.greaterThan(d(0))).toBe(true);
    });
  });

  /* ---------- IT-112-R integration ---------- */

  describe("IT-112-R integration", () => {
    it("computed resident credit for NJ commuter", () => {
      // NY resident earning $100K, $60K sourced to NJ, paid $3,000 NJ tax
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 60000,
            taxPaidByTaxpayer: 3000,
          }],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      expect(result.residentCreditResult!.finalCredit.greaterThan(d(0))).toBe(true);
      // The credit should equal the IT-112-R result
      expect(result.credits.residentCredit.equals(
        result.residentCreditResult!.finalCredit
      )).toBe(true);
      // Credit reduces total tax
      expect(result.credits.totalNYStateCredits.greaterThanOrEqualTo(
        result.residentCreditResult!.finalCredit
      )).toBe(true);
    });

    it("passthrough still works when it112r not provided", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        residentCredit: 2500,
      }));

      expect(result.residentCreditResult).toBeNull();
      expect(result.credits.residentCredit.equals(d(2500))).toBe(true);
    });

    it("computed credit is limited to proportionate NY tax", () => {
      // NJ tax paid ($8,000) exceeds proportionate NY tax on NJ income
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 30000,
            taxPaidByTaxpayer: 8000,
          }],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      const it112r = result.residentCreditResult!;
      // Credit should be limited to proportionate NY tax (not the full $8K NJ tax)
      expect(it112r.finalCredit.lessThan(d(8000))).toBe(true);
      // Income ratio: 30000/80000 = 0.375
      expect(it112r.jurisdictionResults[0].incomeRatio.equals(d("0.375"))).toBe(true);
    });

    it("IT-112-R limitation includes IT-201-ATT line 21 tax when provided", () => {
      const withoutAttTax = calculateNYIT201FullReturn(baseInput({
        federalAgi: 45000,
        it112r: {
          otherCreditsBeforeResident: 900,
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 45000,
            taxPaidByTaxpayer: 5000,
          }],
        },
      }));

      const withAttTax = calculateNYIT201FullReturn(baseInput({
        federalAgi: 45000,
        it112r: {
          otherTaxesBeforeCredits: 400,
          otherCreditsBeforeResident: 900,
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 45000,
            taxPaidByTaxpayer: 5000,
          }],
        },
      }));

      expect(withAttTax.residentCreditResult).not.toBeNull();
      expect(withAttTax.residentCreditResult!.taxDueBeforeCredits).toEqual(
        withoutAttTax.residentCreditResult!.taxDueBeforeCredits.plus(d(400))
      );
      expect(withAttTax.credits.residentCredit.greaterThan(
        withoutAttTax.credits.residentCredit
      )).toBe(true);
    });

    it("multiple jurisdictions sum credits", () => {
      // $120K income: $50K in NJ, $30K in CT
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 120000,
        it112r: {
          jurisdictions: [
            { stateCode: "NJ", sourcedIncome: 50000, taxPaidByTaxpayer: 2500 },
            { stateCode: "CT", sourcedIncome: 30000, taxPaidByTaxpayer: 1500 },
          ],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      const it112r = result.residentCreditResult!;
      expect(it112r.jurisdictionResults).toHaveLength(2);
      expect(it112r.jurisdictionResults[0].stateCode).toBe("NJ");
      expect(it112r.jurisdictionResults[1].stateCode).toBe("CT");
      // Total credit = sum of per-jurisdiction credits
      expect(it112r.totalCredit.equals(
        it112r.jurisdictionResults[0].allowableCredit.plus(
          it112r.jurisdictionResults[1].allowableCredit
        )
      )).toBe(true);
      // Final credit is limited to remaining tax
      expect(it112r.finalCredit.lessThanOrEqualTo(it112r.remainingTaxLiability)).toBe(true);
    });

    it("zero other-state tax results in zero credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 30000,
            taxPaidByTaxpayer: 0,
          }],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      expect(result.residentCreditResult!.finalCredit.equals(d(0))).toBe(true);
    });

    it("empty jurisdictions array falls back to passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        residentCredit: 1000,
        it112r: { jurisdictions: [] },
      }));

      // Empty jurisdictions → skips IT-112-R, uses passthrough
      expect(result.residentCreditResult).toBeNull();
      expect(result.credits.residentCredit.equals(d(1000))).toBe(true);
    });

    it("IT-112-R credit reduces amount owed", () => {
      // Compare return with and without resident credit
      const withoutCredit = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
      }));

      const withCredit = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 50000,
            taxPaidByTaxpayer: 2500,
          }],
        },
      }));

      // With credit, total state taxes should be lower
      expect(withCredit.totalNYStateTaxes.lessThan(
        withoutCredit.totalNYStateTaxes
      )).toBe(true);
    });

    it("IT-112-R with PTET paid by entity", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 60000,
            taxPaidByTaxpayer: 2000,
            ptetPaidByEntity: 1500,
          }],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      const jr = result.residentCreditResult!.jurisdictionResults[0];
      // Tax imposed = taxpayer + PTET = 2000 + 1500 = 3500
      expect(jr.taxImposed.equals(d(3500))).toBe(true);
    });

    it("IT-112-R audit trail merged into full return lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it112r: {
          jurisdictions: [{
            stateCode: "NJ",
            sourcedIncome: 50000,
            taxPaidByTaxpayer: 2000,
          }],
        },
      }));

      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));
      // IT-112-R lines should be present
      expect(lineMap.has("NY-IT112R:22A")).toBe(true);
      expect(lineMap.has("NY-IT112R:34")).toBe(true);
    });

    it("high-income NY resident with CT commute", () => {
      // $250K income, $150K sourced to CT, paid $9,500 CT tax
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 250000,
        it112r: {
          jurisdictions: [{
            stateCode: "CT",
            sourcedIncome: 150000,
            taxPaidByTaxpayer: 9500,
          }],
        },
      }));

      expect(result.residentCreditResult).not.toBeNull();
      const it112r = result.residentCreditResult!;
      // Income ratio: 150000/250000 = 0.6
      expect(it112r.jurisdictionResults[0].incomeRatio.equals(d("0.6"))).toBe(true);
      // Credit should be positive and reduce total tax
      expect(it112r.finalCredit.greaterThan(d(0))).toBe(true);
      expect(result.credits.residentCredit.equals(it112r.finalCredit)).toBe(true);
    });
  });

  /* ---------- MCTMT integration ---------- */

  describe("MCTMT integration", () => {
    it("NYC self-employed: MCTMT flows to line 58 instead of line 45", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        mctmt: {
          zone1Earnings: 120000,
        },
      }));

      expect(result.mctmtResult).not.toBeNull();
      // $120,000 × 0.0060 = $720
      expect(result.mctmtResult!.totalMCTMT.equals(d(720))).toBe(true);
      expect(result.credits.otherStateTaxes.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(720))).toBe(true);
    });

    it("MCTMT no longer inflates the line 45 other-state-tax passthrough", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        otherStateTaxes: 200,
        mctmt: {
          zone1Earnings: 100000,
        },
      }));

      expect(result.credits.otherStateTaxes.equals(d(200))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(600))).toBe(true);
    });

    it("no mctmt inputs: no MCTMT result, other taxes unchanged", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        otherStateTaxes: 300,
      }));

      expect(result.mctmtResult).toBeNull();
      expect(result.credits.otherStateTaxes.equals(d(300))).toBe(true);
    });

    it("MCTMT below threshold: zero tax, no effect on line 58", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        mctmt: {
          zone1Earnings: 40000, // Below $50K threshold
        },
      }));

      expect(result.mctmtResult).not.toBeNull();
      expect(result.mctmtResult!.totalMCTMT.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(0))).toBe(true);
    });

    it("MCTMT increases line 58 and amount owed without changing the line 46 state subtotal", () => {
      const withoutMCTMT = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
      }));

      const withMCTMT = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        mctmt: { zone1Earnings: 120000 },
      }));

      expect(withMCTMT.totalNYStateTaxes.equals(withoutMCTMT.totalNYStateTaxes)).toBe(true);
      expect(withMCTMT.totalLocalTaxes.greaterThan(withoutMCTMT.totalLocalTaxes)).toBe(true);
      // Difference should equal the MCTMT amount ($720)
      expect(
        withMCTMT.totalLocalTaxes.minus(withoutMCTMT.totalLocalTaxes).equals(d(720))
      ).toBe(true);
    });

    it("MFJ: both spouses with MCTMT in different zones", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 250000,
        filingStatus: "married_filing_jointly",
        mctmt: {
          zone1Earnings: 100000,       // Primary in NYC
          spouseZone2Earnings: 75000,  // Spouse in Westchester
        },
      }));

      expect(result.mctmtResult).not.toBeNull();
      // Primary Zone 1: $100K × 0.0060 = $600
      // Spouse Zone 2: $75K × 0.0034 = $255
      expect(result.mctmtResult!.totalMCTMT.equals(d(855))).toBe(true);
      expect(result.credits.otherStateTaxes.equals(d(0))).toBe(true);
      expect(result.totalLocalTaxes.equals(d(855))).toBe(true);
    });

    it("MCTMT audit trail merged into full return lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        mctmt: { zone1Earnings: 100000 },
      }));

      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));
      expect(lineMap.has("NY-MCTMT:54a")).toBe(true);
      expect(lineMap.has("NY-MCTMT:54c")).toBe(true);
      expect(lineMap.has("NY-MCTMT:54e")).toBe(true);
    });

    it("full scenario: NYC freelancer with MCTMT, EIC, and withholding", () => {
      const result = calculateNYIT201FullReturn({
        federalAgi: 60000,
        filingStatus: "single",
        taxYear: 2025,
        isNYCResident: true,
        mctmt: {
          zone1Earnings: 55000, // Just above threshold
        },
        federalEic: 500,
        nyStateTaxWithheld: 3000,
        nycTaxWithheld: 800,
      });

      // MCTMT: $55,000 × 0.0060 = $330
      expect(result.mctmtResult!.totalMCTMT.equals(d(330))).toBe(true);
      // NYC tax should also be present
      expect(result.totalNYCTax.greaterThan(d(0))).toBe(true);
      // EIC: 30% × $500 = $150
      expect(result.nyEarnedIncomeCredit.equals(d(150))).toBe(true);
    });
  });

  describe("IT-216 Child and Dependent Care Credit integration", () => {
    it("IT-216 NYS credit flows to line 64", () => {
      // Single, non-NYC, 1 child, FAGI=$42,000, expenses=$5,000
      // expenseLimit = $3,000 (1 person)
      // allowable = min(5000, 3000, 42000) = $3,000
      // federal decimal at FAGI $42,000 (≤ $43,000) = 0.21
      // federal-style credit = $3,000 × 0.21 = $630
      // NYS limitation at NY AGI $42,000 (flatMid: $40,001-$50,000) = 1.000
      // NYS credit = round($630 × 1.000) = $630
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 42000,
        },
      }));

      expect(result.childDependentCareCredit).not.toBeNull();
      expect(result.childDependentCareCredit!.nysCredit.equals(d(630))).toBe(true);
      // Line 64 reports the combined child care credit
      expect(result.childDependentCareCreditAmount.equals(d(630))).toBe(true);
      // No NYC credit for non-NYC resident
      expect(result.childDependentCareCredit!.nycCredit.equals(d(0))).toBe(true);
    });

    it("IT-216 NYC credit combines onto line 64 for NYC resident", () => {
      // NYC resident, single, 1 child under 4, FAGI=$20,000, expenses=$4,000
      // expenseLimit = $3,000
      // allowable = $3,000
      // federal decimal at FAGI $20,000 = 0.32
      // federal-style credit = $3,000 × 0.32 = $960
      // NYS limitation at NY AGI $20,000 (≤ $25,000) = 1.100
      // NYS credit = round($960 × 1.100) = $1,056
      // NYC: under-4 ratio = $4,000/$4,000 = 1.0000
      // NYC credit base = $1,056 × 1.0000 = $1,056
      // NYC limitation at FAGI $20,000 (≤ $25,000) = 0.750
      // NYC credit = round($1,056 × 0.750) = $792
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 20000,
        isNYCResident: true,
        it216: {
          qualifiedExpenses: 4000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 20000,
          qualifiedExpensesForChildrenUnder4: 4000,
        },
      }));

      expect(result.childDependentCareCredit).not.toBeNull();
      expect(result.childDependentCareCredit!.nysCredit.equals(d(1056))).toBe(true);
      expect(result.childDependentCareCredit!.nycCredit.equals(d(792))).toBe(true);

      expect(result.childDependentCareCreditAmount.equals(d(1848))).toBe(true);
    });

    it("non-NYC resident gets NYS credit only on line 64", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 20000,
        isNYCResident: false,
        it216: {
          qualifiedExpenses: 4000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 20000,
          qualifiedExpensesForChildrenUnder4: 4000,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.greaterThan(d(0))).toBe(true);
      expect(result.childDependentCareCredit!.nycCredit.equals(d(0))).toBe(true);
      expect(result.childDependentCareCreditAmount.equals(result.childDependentCareCredit!.nysCredit)).toBe(true);
    });

    it("passthrough childDependentCareCredit works without it216 inputs", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        childDependentCareCredit: 500,
      }));

      // No IT-216 computation
      expect(result.childDependentCareCredit).toBeNull();
      // Passthrough flows to line 64
      expect(result.childDependentCareCreditAmount.equals(d(500))).toBe(true);
    });

    it("IT-216 credit combined with other refundable credits on line 64", () => {
      // $630 IT-216 credit + $200 other refundable credits = $830 on line 64
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        otherRefundableCredits: 200,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 42000,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.equals(d(630))).toBe(true);
      expect(result.childDependentCareCreditAmount.equals(d(630))).toBe(true);
      expect(result.otherRefundableCredits.equals(d(200))).toBe(true);
    });

    it("MFJ with spouse earned income limits allowable expenses", () => {
      // MFJ: FAGI=$50,000, taxpayer=$50,000, spouse=$2,500, 1 child, expenses=$5,000
      // expenseLimit = $3,000
      // allowable = min(5000, 3000, 50000, 2500) = $2,500 (limited by spouse income)
      // federal decimal at FAGI $50,000 (> $43,000) = 0.20
      // federal-style credit = $2,500 × 0.20 = $500
      // NYS limitation at NY AGI $50,000 (≤ $50,000) = 1.000
      // NYS credit = round($500 × 1.000) = $500
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 50000,
        filingStatus: "married_filing_jointly",
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 50000,
          spouseEarnedIncome: 2500,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.equals(d(500))).toBe(true);
      expect(result.childDependentCareCredit!.allowableExpenses.equals(d(2500))).toBe(true);
    });

    it("high-income filer gets reduced NYS limitation decimal", () => {
      // FAGI=$160,000, 2 children, expenses=$8,000
      // expenseLimit = $6,000 (2+ persons)
      // allowable = $6,000
      // federal decimal at FAGI $160,000 = 0.20
      // federal-style credit = $6,000 × 0.20 = $1,200
      // NYS limitation at NY AGI $160,000 (> $150,000) = 0.200
      // NYS credit = round($1,200 × 0.200) = $240
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 160000,
        it216: {
          qualifiedExpenses: 8000,
          numberOfQualifyingPersons: 2,
          taxpayerEarnedIncome: 160000,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.equals(d(240))).toBe(true);
      expect(result.childDependentCareCreditAmount.equals(d(240))).toBe(true);
    });

    it("IT-216 credit reduces amount owed", () => {
      // Compare result with and without IT-216
      const withoutIT216 = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
      }));
      const withIT216 = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 42000,
        },
      }));

      const creditAmount = withIT216.childDependentCareCredit!.nysCredit;
      expect(creditAmount.greaterThan(d(0))).toBe(true);

      // Total refundable credits should be higher by the IT-216 amount
      expect(
        withIT216.totalRefundableCredits.minus(withoutIT216.totalRefundableCredits).equals(creditAmount)
      ).toBe(true);

      // Amount owed should decrease (or refund increase) by the credit amount
      expect(
        withIT216.overpaymentOrBalanceDue.minus(withoutIT216.overpaymentOrBalanceDue).equals(creditAmount)
      ).toBe(true);
    });

    it("IT-216 feeds correct NY AGI from additions/subtractions module", () => {
      // With a subtraction reducing NY AGI, the NYS limitation decimal may change
      // FAGI=$47,000, but SS benefits subtraction of $5,000 → NY AGI = $42,000
      // At NY AGI $42,000 (flatMid: $40,001-$50,000), NYS limitation = 1.000
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 47000,
        taxableSocialSecurityBenefits: 5000,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 47000,
        },
      }));

      // NY AGI should be $42,000 after SS subtraction
      expect(result.additionsSubtractions.nyAgi.equals(d(42000))).toBe(true);
      // NYS limitation at NY AGI $42,000 = 1.000
      expect(result.childDependentCareCredit!.nysLimitationDecimal.equals(d("1.000"))).toBe(true);
      // federal decimal at FAGI $47,000 (> $43,000) = 0.20
      // allowable = min(5000, 3000, 47000) = 3000
      // credit = round(3000 × 0.20 × 1.000) = $600
      expect(result.childDependentCareCredit!.nysCredit.equals(d(600))).toBe(true);
    });

    it("IT-216 audit trail merged into full return lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 42000,
        },
      }));

      const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));
      expect(lineMap.has("NY-IT216:5")).toBe(true);
      expect(lineMap.has("NY-IT216:8")).toBe(true);
      expect(lineMap.has("NY-IT216:10")).toBe(true);
      expect(lineMap.has("NY-IT216:12")).toBe(true);
      expect(lineMap.has("NY-IT216:13")).toBe(true);
      expect(lineMap.has("NY-IT216:14")).toBe(true);
    });

    it("IT-216 line 64 flows into the refundable credit subtotal", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        realPropertyTaxCredit: 50,
        federalEic: 200,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 1,
          taxpayerEarnedIncome: 42000,
        },
      }));

      const nysCredit = result.childDependentCareCredit!.nysCredit;
      const nyEic = result.nyEarnedIncomeCredit; // no household credit at this income, so 30% × $200 = $60

      // Refundable subtotal includes line 64 credit plus lines 65 and 67
      const expectedTotal = d(50).plus(nysCredit).plus(nyEic);
      expect(result.totalRefundableCredits.equals(expectedTotal)).toBe(true);
    });

    it("full scenario: NYC working parent with child care, EIC, and ESCC", () => {
      // NYC single parent: FAGI=$25,000, 2 children (1 under 4), EIC=$2,000
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 25000,
        filingStatus: "head_of_household",
        isNYCResident: true,
        numberOfDependents: 2,
        qualifyingChildrenUnder4: 1,
        qualifyingChildrenAge4To16: 1,
        federalEic: 2000,
        nyStateTaxWithheld: 500,
        nycTaxWithheld: 100,
        it216: {
          qualifiedExpenses: 8000,
          numberOfQualifyingPersons: 2,
          taxpayerEarnedIncome: 25000,
          qualifiedExpensesForChildrenUnder4: 4000,
        },
      }));

      // IT-216 computed
      expect(result.childDependentCareCredit).not.toBeNull();
      const nysCredit = result.childDependentCareCredit!.nysCredit;
      const nycCredit = result.childDependentCareCredit!.nycCredit;
      expect(nysCredit.greaterThan(d(0))).toBe(true);
      expect(nycCredit.greaterThan(d(0))).toBe(true);

      // IT-213 computed
      expect(result.empireStateChildCredit).not.toBeNull();
      expect(result.empireStateChildCreditAmount.equals(d(1330))).toBe(true);

      // Base NY EIC = $600; household credit at HoH $25,000 with 2 dependents = $70
      expect(result.nyEarnedIncomeCredit.equals(d(530))).toBe(true);

      // All refundable credits contribute to total
      expect(result.totalRefundableCredits.greaterThan(d(0))).toBe(true);

      // With withholding, should get a refund (low income, multiple refundable credits)
      expect(result.overpayment.greaterThan(d(0))).toBe(true);
    });

    it("zero qualifying persons produces no IT-216 credit", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 42000,
        it216: {
          qualifiedExpenses: 5000,
          numberOfQualifyingPersons: 0,
          taxpayerEarnedIncome: 42000,
        },
      }));

      expect(result.childDependentCareCredit!.nysCredit.equals(d(0))).toBe(true);
      expect(result.otherRefundableCredits.equals(d(0))).toBe(true);
    });
  });

  describe("IT-225 New York State Modifications integration", () => {
    it("IT-225 QBI addback flows to line 23 (other additions)", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it225: {
          federalQbiDeduction: 20000,
        },
      }));

      expect(result.it225Result).not.toBeNull();
      expect(result.it225Result!.qbiDeductionAddback.equals(d(20000))).toBe(true);
      // NY AGI should be federal AGI + QBI addback = 120000
      expect(result.additionsSubtractions.nyAgi.equals(d(120000))).toBe(true);
      expect(result.additionsSubtractions.line23.equals(d(20000))).toBe(true);
    });

    it("IT-225 529 deduction flows to line 31 (other subtractions)", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        it225: {
          ny529Contributions: 4000,
        },
      }));

      expect(result.it225Result).not.toBeNull();
      expect(result.it225Result!.ny529Deduction.equals(d(4000))).toBe(true);
      // NY AGI should be federal AGI - 529 deduction = 76000
      expect(result.additionsSubtractions.nyAgi.equals(d(76000))).toBe(true);
      expect(result.additionsSubtractions.line31.equals(d(4000))).toBe(true);
    });

    it("IT-225 replaces otherAdditions/otherSubtractions passthroughs", () => {
      // When it225 inputs are provided, they replace the passthrough values
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 90000,
        otherAdditions: 999, // should be ignored
        otherSubtractions: 888, // should be ignored
        it225: {
          federalQbiDeduction: 15000,
          ny529Contributions: 3000,
        },
      }));

      // IT-225 computed values should be used, not passthroughs
      expect(result.additionsSubtractions.line23.equals(d(15000))).toBe(true);
      expect(result.additionsSubtractions.line31.equals(d(3000))).toBe(true);
      expect(result.additionsSubtractions.nyAgi.equals(d(102000))).toBe(true);
    });

    it("no it225 inputs: uses otherAdditions/otherSubtractions passthroughs", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 90000,
        otherAdditions: 5000,
        otherSubtractions: 2000,
      }));

      expect(result.it225Result).toBeNull();
      expect(result.additionsSubtractions.line23.equals(d(5000))).toBe(true);
      expect(result.additionsSubtractions.line31.equals(d(2000))).toBe(true);
      expect(result.additionsSubtractions.nyAgi.equals(d(93000))).toBe(true);
    });

    it("IT-225 bonus depreciation addback with NY depreciation subtraction", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        it225: {
          federalBonusDepreciation: 50000,
          nyDepreciationForBonusAssets: 7143,
        },
      }));

      expect(result.it225Result!.bonusDepreciationAddback.equals(d(50000))).toBe(true);
      expect(result.it225Result!.nyDepreciationSubtraction.equals(d(7143))).toBe(true);
      expect(result.it225Result!.totalAdditions.equals(d(50000))).toBe(true);
      expect(result.it225Result!.totalSubtractions.equals(d(7143))).toBe(true);
      // NY AGI = 150000 + 50000 - 7143 = 192857
      expect(result.additionsSubtractions.nyAgi.equals(d(192857))).toBe(true);
    });

    it("MFJ with both spouses contributing to NY 529 plans", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 200000,
        filingStatus: "married_filing_jointly",
        it225: {
          ny529Contributions: 5000,
          spouseNy529Contributions: 5000,
        },
      }));

      expect(result.it225Result!.ny529Deduction.equals(d(10000))).toBe(true);
      // NY AGI = 200000 - 10000 = 190000
      expect(result.additionsSubtractions.nyAgi.equals(d(190000))).toBe(true);
    });

    it("IT-225 LTC premium deduction for standard deduction filer", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 70000,
        it225: {
          ltcPremiumsPaid: 6000,
          // Standard deduction filer: nothing deducted federally
        },
      }));

      // 20% × 6000 = 1200
      expect(result.it225Result!.ltcPremiumDeduction.equals(d(1200))).toBe(true);
      expect(result.additionsSubtractions.nyAgi.equals(d(68800))).toBe(true);
    });

    it("IT-225 combined with other IT-201 additions and subtractions", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        outOfStateMuniBondInterest: 500, // line 20
        taxableSocialSecurityBenefits: 3000, // line 27
        it225: {
          federalQbiDeduction: 10000, // line 23 via IT-225
          ny529Contributions: 5000, // line 31 via IT-225
        },
      }));

      // Additions: 500 (muni) + 10000 (QBI via IT-225) = 10500
      expect(result.additionsSubtractions.totalAdditions.equals(d(10500))).toBe(true);
      // Subtractions: 3000 (SS) + 5000 (529 via IT-225) = 8000
      expect(result.additionsSubtractions.totalSubtractions.equals(d(8000))).toBe(true);
      // NY AGI: 100000 + 10500 - 8000 = 102500
      expect(result.additionsSubtractions.nyAgi.equals(d(102500))).toBe(true);
    });

    it("IT-225 affects downstream tax computation", () => {
      // QBI addback increases NY AGI → increases taxable income → increases tax
      const withoutQbi = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
      }));
      const withQbi = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it225: {
          federalQbiDeduction: 20000,
        },
      }));

      // Tax should be higher with QBI addback (higher taxable income)
      expect(withQbi.taxComputation.tax.greaterThan(withoutQbi.taxComputation.tax)).toBe(true);
      // Amount owed should be higher
      expect(withQbi.amountOwed.greaterThan(withoutQbi.amountOwed)).toBe(true);
    });

    it("IT-225 529 deduction reduces amount owed", () => {
      const without529 = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
      }));
      const with529 = calculateNYIT201FullReturn(baseInput({
        federalAgi: 80000,
        it225: {
          ny529Contributions: 5000,
        },
      }));

      // Amount owed should be lower with 529 deduction
      expect(with529.amountOwed.lessThan(without529.amountOwed)).toBe(true);
    });

    it("IT-225 audit trail merged into full return lines", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it225: {
          federalQbiDeduction: 20000,
          ny529Contributions: 5000,
        },
      }));

      const lineIds = result.lines.map((l) => `${l.form}:${l.line}`);
      expect(lineIds).toContain("NY-IT225:A-201");
      expect(lineIds).toContain("NY-IT225:S-201");
      expect(lineIds).toContain("NY-IT225:9");
      expect(lineIds).toContain("NY-IT225:18");
    });

    it("full scenario: self-employed NYC filer with QBI, 529, and LTC", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 150000,
        filingStatus: "married_filing_jointly",
        isNYCResident: true,
        numberOfDependents: 2,
        nyStateTaxWithheld: 8000,
        nycTaxWithheld: 3000,
        it225: {
          federalQbiDeduction: 25000,
          ny529Contributions: 5000,
          spouseNy529Contributions: 5000,
          ltcPremiumsPaid: 4000,
        },
      }));

      // QBI addback: 25000
      // 529 deduction: 10000 (5000 + 5000)
      // LTC deduction: 20% × 4000 = 800
      expect(result.it225Result!.totalAdditions.equals(d(25000))).toBe(true);
      expect(result.it225Result!.totalSubtractions.equals(d(10800))).toBe(true);

      // NY AGI = 150000 + 25000 - 10800 = 164200
      expect(result.additionsSubtractions.nyAgi.equals(d(164200))).toBe(true);

      // Should have state and NYC tax
      expect(result.taxComputation.tax.greaterThan(d(0))).toBe(true);
      expect(result.totalNYCTax.greaterThan(d(0))).toBe(true);

      // Payments should reduce balance
      expect(result.totalPayments.equals(d(11000))).toBe(true);
    });

    it("IT-225 with other IT-225 passthroughs for unsupported modifications", () => {
      const result = calculateNYIT201FullReturn(baseInput({
        federalAgi: 100000,
        it225: {
          federalQbiDeduction: 10000,
          otherIT225Additions: 2000,
          ny529Contributions: 3000,
          otherIT225Subtractions: 1500,
        },
      }));

      // Total additions: 10000 (QBI) + 2000 (other) = 12000
      expect(result.it225Result!.totalAdditions.equals(d(12000))).toBe(true);
      // Total subtractions: 3000 (529) + 1500 (other) = 4500
      expect(result.it225Result!.totalSubtractions.equals(d(4500))).toBe(true);
      // NY AGI = 100000 + 12000 - 4500 = 107500
      expect(result.additionsSubtractions.nyAgi.equals(d(107500))).toBe(true);
    });
  });
});

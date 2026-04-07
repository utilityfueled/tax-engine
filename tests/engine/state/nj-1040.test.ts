/**
 * Tests for New Jersey NJ-1040 resident return orchestrator.
 * Spec: spec/state/nj-1040.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040, type NJ1040Input } from "@/engine/state/nj-1040.js";
import type { OtherJurisdictionEntry } from "@/engine/state/nj-1040-other-jurisdiction-credit.js";

const d = (value: string | number) => new Decimal(value);

/** Helper: minimal single filer input */
function singleFiler(overrides: Partial<NJ1040Input> = {}): NJ1040Input {
  return {
    filingStatus: "single",
    taxYear: 2025,
    monthsOfResidency: 12,
    ...overrides,
  };
}

/** Helper: minimal MFJ filer input */
function mfjFiler(overrides: Partial<NJ1040Input> = {}): NJ1040Input {
  return {
    filingStatus: "married_filing_jointly",
    taxYear: 2025,
    monthsOfResidency: 12,
    ...overrides,
  };
}

describe("NJ-1040 orchestrator", () => {
  // --- Basic return flow ---

  it("NJ-1040 orchestrator - single filer with wages only", () => {
    const result = calculateNJ1040(singleFiler({ wages: 75000 }));
    expect(result.njGrossIncome.toNumber()).toBe(75000);
    // Taxable income = 75000 - 1000 (self exemption) = 74000
    expect(result.totalExemptions.toNumber()).toBe(1000);
    expect(result.njTaxableIncome.toNumber()).toBe(74000);
    expect(result.njTax.greaterThan(0)).toBe(true);
  });

  it("NJ-1040 orchestrator - zero income produces zero tax", () => {
    const result = calculateNJ1040(singleFiler());
    expect(result.njGrossIncome.toNumber()).toBe(0);
    expect(result.njTaxableIncome.toNumber()).toBe(0);
    expect(result.njTax.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - MFJ gets self and spouse exemptions", () => {
    const result = calculateNJ1040(mfjFiler({ wages: 100000 }));
    // MFJ: $1000 self + $1000 spouse = $2000
    expect(result.totalExemptions.toNumber()).toBe(2000);
    expect(result.njTaxableIncome.toNumber()).toBe(98000);
  });

  it("NJ-1040 orchestrator - spouse veteran exemption applies on a joint return", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 100000,
        spouseIsVeteran: true,
      })
    );
    // MFJ: $1,000 self + $1,000 spouse + $6,000 spouse veteran = $8,000
    expect(result.totalExemptions.toNumber()).toBe(8000);
    expect(result.njTaxableIncome.toNumber()).toBe(92000);
  });

  // --- Exemptions reduce taxable income ---

  it("NJ-1040 orchestrator - exemptions reduce taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        taxpayerAge65OrOlder: true,
        isVeteran: true,
        dependentCount: 2,
      })
    );
    // Exemptions: $1000 self + $1000 age65 + $6000 veteran + $3000 (2×$1500) = $11,000
    expect(result.totalExemptions.toNumber()).toBe(11000);
    expect(result.njTaxableIncome.toNumber()).toBe(39000);
  });

  // --- Alimony paid deduction (Line 32) ---

  it("NJ-1040 orchestrator - alimony paid reduces taxable income without changing gross income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        alimonyPaid: 12000,
      })
    );
    expect(result.njGrossIncome.toNumber()).toBe(80000);
    // Taxable income = $80,000 - $1,000 (exemption) - $12,000 (line 32) = $67,000
    expect(result.njTaxableIncome.toNumber()).toBe(67000);
  });

  it("NJ-1040 orchestrator - alimony paid with pension exclusion and other deductions", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 60000,
        pensionIncome: 40000,
        alimonyPaid: 10000,
        qualifiesForPensionExclusion: true,
        spouseAge65OrOlder: true,
        isHomeowner: true,
        propertyTaxesPaid: 8000,
      })
    );
    // Total NJ income = $100,000
    // Pension exclusion: totalNJIncome $100K < $150K threshold
    //   min($40K, $100K) = $40,000
    // NJ gross income = $100,000 - $40,000 = $60,000
    expect(result.njGrossIncome.toNumber()).toBe(60000);
    // Exemptions: $1,000 self + $1,000 spouse + $1,000 spouse 65+ = $3,000
    // Property tax deduction: $8,000; alimony deduction: $10,000
    // Taxable income = $60,000 - $3,000 - $10,000 - $8,000 = $39,000
    expect(result.njTaxableIncome.toNumber()).toBe(39000);
  });

  it("NJ-1040 orchestrator - alimony paid reduces tax owed", () => {
    const withoutAlimony = calculateNJ1040(singleFiler({ wages: 80000 }));
    const withAlimony = calculateNJ1040(
      singleFiler({ wages: 80000, alimonyPaid: 15000 })
    );
    expect(withAlimony.njGrossIncome.eq(withoutAlimony.njGrossIncome)).toBe(true);
    expect(withAlimony.njTax.lessThan(withoutAlimony.njTax)).toBe(true);
  });

  it("NJ-1040 orchestrator - other retirement income exclusion can zero out gross income", () => {
    const result = calculateNJ1040(
      singleFiler({
        taxableInterest: 12108,
        dividends: 2981,
        netGainsFromProperty: 9500,
        pensionIncome: 8000,
        rentalIncome: 14000,
        gamblingWinnings: 22142,
        qualifiesForPensionExclusion: true,
        qualifiesForOtherRetirementExclusion: true,
        qualifiesForSpecialRetirementExclusion: true,
      })
    );
    expect(result.njGrossIncome.toNumber()).toBe(0);
    expect(result.njTaxableIncome.toNumber()).toBe(0);
    expect(result.njTax.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - college affordability deductions reduce taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 150000,
        njbestContributions: 12000,
        njclassLoanPayments: 3000,
        tuitionPaidToNjInstitution: 10000,
      })
    );

    expect(result.njGrossIncome.toNumber()).toBe(150000);
    expect(result.totalExemptions.toNumber()).toBe(1000);
    expect(result.collegeAffordabilityDeduction.toNumber()).toBe(22500);
    expect(result.njTaxableIncome.toNumber()).toBe(126500);
  });

  // --- Property tax deduction ---

  it("NJ-1040 orchestrator - property tax deduction reduces taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        isHomeowner: true,
        propertyTaxesPaid: 8000,
      })
    );
    // Taxable income = 75000 - 1000 (exemptions) - 8000 (property tax) = 66000
    expect(result.propertyTaxDeduction.toNumber()).toBe(8000);
    expect(result.njTaxableIncome.toNumber()).toBe(66000);
  });

  it("NJ-1040 orchestrator - mixed homeowner and tenant year combines both property tax components", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        isHomeowner: true,
        isTenant: true,
        propertyTaxesPaid: 4000,
        rentPaid: 10000,
      })
    );
    expect(result.propertyTaxDeduction.toNumber()).toBe(5800);
    // Taxable income = 75,000 - 1,000 exemptions - 5,800 property tax deduction
    expect(result.njTaxableIncome.toNumber()).toBe(68200);
  });

  it("NJ-1040 orchestrator - automatically selects the property tax credit when it produces a better refund", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 10100,
        njWithholding: 130,
        isHomeowner: true,
        propertyTaxesPaid: 500,
      })
    );
    expect(result.propertyTaxDeduction.toNumber()).toBe(0);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(128);
    expect(result.refund.toNumber()).toBe(52);
  });

  it("NJ-1040 orchestrator - property tax deduction caps at $15,000", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 200000,
        isHomeowner: true,
        propertyTaxesPaid: 25000,
      })
    );
    expect(result.propertyTaxDeduction.toNumber()).toBe(15000);
    // Taxable income = 200000 - 1000 - 15000 = 184000
    expect(result.njTaxableIncome.toNumber()).toBe(184000);
  });

  it("NJ-1040 orchestrator - tenant property tax deduction is 18% of rent", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 60000,
        isTenant: true,
        rentPaid: 24000,
      })
    );
    // 18% of $24,000 = $4,320
    expect(result.propertyTaxDeduction.toNumber()).toBe(4320);
    // Taxable income = 60000 - 1000 - 4320 = 54680
    expect(result.njTaxableIncome.toNumber()).toBe(54680);
  });

  // --- Property tax credit ---

  it("NJ-1040 orchestrator - property tax credit is refundable and produces refund when tax is lower", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 10100,
        njWithholding: 130,
        isHomeowner: true,
        propertyTaxesPaid: 500,
        electPropertyTaxCredit: true,
      })
    );
    // Electing credit: no deduction, but refundable $50 credit on line 56.
    // Taxable income = 10,100 - 1,000 = 9,100; the published tax table yields $128.
    expect(result.propertyTaxDeduction.toNumber()).toBe(0);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.njTaxableIncome.toNumber()).toBe(9100);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(128);
    expect(result.totalPayments.toNumber()).toBe(180);
    expect(result.refund.toNumber()).toBe(52);
  });

  it("NJ-1040 orchestrator - property tax credit does not reduce tax after nonrefundable credits", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 10100,
        njWithholding: 130,
        isHomeowner: true,
        propertyTaxesPaid: 500,
        electPropertyTaxCredit: true,
      })
    );
    expect(result.njTaxableIncome.toNumber()).toBe(9100);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(128);
  });

  it("NJ-1040 orchestrator - overpayment carryforward and charitable contributions adjust the final refund", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 10100,
        njWithholding: 130,
        isHomeowner: true,
        propertyTaxesPaid: 500,
        electPropertyTaxCredit: true,
        creditOverpaymentToNextYear: 20,
        endangeredWildlifeFundContribution: 10,
      })
    );
    expect(result.line67AmountOwed.toNumber()).toBe(0);
    expect(result.line68Overpayment.toNumber()).toBe(52);
    expect(result.line78TotalAdjustments.toNumber()).toBe(30);
    expect(result.balanceDue.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(22);
  });

  it("NJ-1040 orchestrator - below-threshold non-senior filer gets no property tax benefit", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 9000,
        isHomeowner: true,
        propertyTaxesPaid: 5000,
      })
    );
    expect(result.propertyTaxDeduction.toNumber()).toBe(0);
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.njTaxableIncome.toNumber()).toBe(8000);
  });

  it("NJ-1040 orchestrator - tax-exempt rental property yields no property tax deduction or credit", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 60000,
        isTenant: true,
        rentPaid: 18000,
        rentedTaxExemptProperty: true,
      })
    );
    expect(result.propertyTaxDeduction.toNumber()).toBe(0);
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.njTaxableIncome.toNumber()).toBe(59000);
  });

  it("NJ-1040 orchestrator - PTBAIT credit increases total payments and refund", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 3000,
        passThroughBusinessAlternativeIncomeTaxCredit: 900,
      })
    );

    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(28);
    expect(result.passThroughBusinessAlternativeIncomeTaxCredit.toNumber()).toBe(900);
    expect(result.totalPayments.toNumber()).toBe(900);
    expect(result.refund.toNumber()).toBe(872);
  });

  it("NJ-1040 orchestrator - total payments include PTBAIT credit", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        njWithholding: 400,
        estimatedPayments: 100,
        passThroughBusinessAlternativeIncomeTaxCredit: 250,
      })
    );

    expect(result.passThroughBusinessAlternativeIncomeTaxCredit.toNumber()).toBe(250);
    expect(result.totalPayments.toNumber()).toBe(750);
  });

  it("NJ-1040 orchestrator - wounded warrior credit is refundable", () => {
    const result = calculateNJ1040(
      singleFiler({
        providedCareToQualifyingServiceMember: true,
        serviceMemberFederalDisabilityCompensation: 500,
        onlyCaregiver: true,
      })
    );

    expect(result.woundedWarriorCredit.toNumber()).toBe(500);
    expect(result.totalRefundableCredits.toNumber()).toBe(500);
    expect(result.refund.toNumber()).toBe(500);
  });

  it("NJ-1040 orchestrator - wounded warrior credit respects multiple caregiver share", () => {
    const result = calculateNJ1040(
      singleFiler({
        providedCareToQualifyingServiceMember: true,
        serviceMemberFederalDisabilityCompensation: 675,
        onlyCaregiver: false,
        careExpensesSharePercent: 25,
      })
    );

    expect(result.woundedWarriorCredit.toNumber()).toBe(169);
    expect(result.refund.toNumber()).toBe(169);
  });

  // --- Medical expense deduction ---

  it("NJ-1040 orchestrator - medical deduction applied", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        totalMedicalExpenses: 5000,
      })
    );
    // Threshold: 2% of $50,000 = $1,000
    // Deduction: $5,000 - $1,000 = $4,000
    expect(result.medicalDeduction.toNumber()).toBe(4000);
    // Taxable income = 50000 - 1000 (exemptions) - 4000 (medical) = 45000
    expect(result.njTaxableIncome.toNumber()).toBe(45000);
  });

  it("NJ-1040 orchestrator - line 33 qualified conservation contribution reduces taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        qualifiedConservationContribution: 6000,
      })
    );

    expect(result.njGrossIncome.toNumber()).toBe(50000);
    expect(result.njTaxableIncome.toNumber()).toBe(43000);
  });

  it("NJ-1040 orchestrator - line 34 health enterprise zone deduction reduces taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        healthEnterpriseZoneDeduction: 2500,
      })
    );

    expect(result.njGrossIncome.toNumber()).toBe(50000);
    expect(result.njTaxableIncome.toNumber()).toBe(46500);
  });

  it("NJ-1040 orchestrator - line 35 alternative business calculation adjustment reduces taxable income", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        alternativeBusinessCalculationAdjustment: 3200,
      })
    );

    expect(result.njGrossIncome.toNumber()).toBe(50000);
    expect(result.njTaxableIncome.toNumber()).toBe(45800);
  });

  it("NJ-1040 orchestrator - line 33 through line 35 deductions combine on line 39 before property tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        qualifiedConservationContribution: 4000,
        healthEnterpriseZoneDeduction: 1500,
        alternativeBusinessCalculationAdjustment: 2500,
        isHomeowner: true,
        propertyTaxesPaid: 3000,
      })
    );

    expect(result.njGrossIncome.toNumber()).toBe(50000);
    expect(result.njTaxableIncome.toNumber()).toBe(38000);
  });

  it("NJ-1040 orchestrator - organ donation deduction reduces taxable income before property tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        organDonationDeductionExpenses: 7200,
      })
    );

    expect(result.organDonationDeduction.toNumber()).toBe(7200);
    expect(result.njTaxableIncome.toNumber()).toBe(41800);
  });

  it("NJ-1040 orchestrator - medical deduction with reimbursements", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        totalMedicalExpenses: 5000,
        insuranceReimbursements: 2000,
      })
    );
    // Unreimbursed: $5,000 - $2,000 = $3,000
    // Threshold: 2% of $50,000 = $1,000
    // Deduction: $3,000 - $1,000 = $2,000
    expect(result.medicalDeduction.toNumber()).toBe(2000);
  });

  it("NJ-1040 orchestrator - Worksheet F Archer MSA and self-employed health insurance increase the medical deduction", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        totalMedicalExpenses: 1500,
        archerMSADeduction: 600,
        selfEmployedHealthInsuranceDeduction: 1200,
      })
    );

    // Threshold: 2% of $50,000 = $1,000
    // Medical excess: $1,500 - $1,000 = $500
    // Worksheet F line 4 + line 5: $600 + $1,200 = $1,800
    // Total deduction: $2,300
    expect(result.medicalDeduction.toNumber()).toBe(2300);
    expect(result.njGrossIncome.toNumber()).toBe(50000);
    expect(result.njTaxableIncome.toNumber()).toBe(46700);
  });

  // --- Taxable income floor ---

  it("NJ-1040 orchestrator - taxable income floors at zero", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 500,
        isVeteran: true, // $6,000 veteran exemption alone > income
      })
    );
    // Exemptions ($7,000) > gross income ($500) → taxable income = $0
    expect(result.njTaxableIncome.toNumber()).toBe(0);
    expect(result.njTax.toNumber()).toBe(0);
  });

  // --- Tax computed from rate table ---

  it("NJ-1040 orchestrator - tax computed from rate table", () => {
    const result = calculateNJ1040(singleFiler({ wages: 51000 }));
    // Taxable income = 51000 - 1000 = 50000
    // Taxable income is under $100,000, so NJ uses the published tax table.
    // The $50,000 row corresponds to midpoint $50,025, which rounds to $1,271.
    expect(result.njTaxableIncome.toNumber()).toBe(50000);
    expect(result.njTax.toNumber()).toBe(1271);
  });

  it("NJ-1040 orchestrator - MFJ tax uses Table B", () => {
    const result = calculateNJ1040(mfjFiler({ wages: 72000 }));
    // Taxable income = 72000 - 2000 = 70000
    // Taxable income is under $100,000, so NJ uses the published Table B tax table.
    // The $70,000 row corresponds to midpoint $70,025, which rounds to $1,296.
    expect(result.njTaxableIncome.toNumber()).toBe(70000);
    expect(result.njTax.toNumber()).toBe(1296);
  });

  // --- EITC (refundable) ---

  it("NJ-1040 orchestrator - EITC is refundable", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        federalEITC: 3000,
      })
    );
    // NJ EITC = 40% of $3,000 = $1,200
    expect(result.njEITC.toNumber()).toBe(1200);
    expect(result.totalRefundableCredits.greaterThan(0)).toBe(true);
  });

  it("NJ-1040 orchestrator - EITC prorated for part-year resident", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        federalEITC: 3000,
        monthsOfResidency: 6,
      })
    );
    // Prorated federal EITC = $3000/12×6 = $1500
    // NJ EITC = 40% of $1500 = $600
    expect(result.njEITC.toNumber()).toBe(600);
  });

  it("NJ-1040 orchestrator - childless age-18 EITC exception is refundable when federal EITC is zero", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 1000,
        qualifiesForChildlessAge18Exception: true,
        qualifyingEICChildrenCount: 0,
        hasAdult18OrOlderTaxpayer: true,
      })
    );
    expect(result.njEITC.toNumber()).toBe(260);
    expect(result.refund.toNumber()).toBe(260);
    expect(result.filingRequirement.requiredForEITC).toBe(true);
  });

  // --- Child Tax Credit (refundable) ---

  it("NJ-1040 orchestrator - child tax credit applied", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 25000,
        qualifyingChildrenAge5OrUnder: 2,
      })
    );
    // Taxable income = 25000 - 1000 = 24000 → ≤ $30,000 bracket → $1000/child
    expect(result.njChildTaxCredit.toNumber()).toBe(2000);
  });

  it("NJ-1040 orchestrator - child tax credit uses taxable income brackets", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 45000,
        qualifyingChildrenAge5OrUnder: 1,
      })
    );
    // Taxable income = 45000 - 1000 = 44000 → $40,001-$50,000 bracket → $600/child
    expect(result.njChildTaxCredit.toNumber()).toBe(600);
  });

  it("NJ-1040 orchestrator - married filing separately is ineligible for the child tax credit", () => {
    const result = calculateNJ1040({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
      monthsOfResidency: 12,
      wages: 25000,
      qualifyingChildrenAge5OrUnder: 2,
    });
    expect(result.njTaxableIncome.toNumber()).toBe(24000);
    expect(result.njChildTaxCredit.toNumber()).toBe(0);
  });

  // --- Refundable credits produce refund ---

  it("NJ-1040 orchestrator - refundable credits produce refund with no withholding", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 15000,
        federalEITC: 5000,
        qualifyingChildrenAge5OrUnder: 1,
      })
    );
    // NJ EITC = 40% of $5000 = $2000
    // Taxable income = 15000 - 1000 = 14000 → ≤ $30,000 → CTC $1000
    // Tax on $14,000 at 1.4% = $196
    // Tax after nonrefundable = $196
    // Total refundable credits = $2000 + $1000 = $3000
    // Total payments (credits only) = $3000
    // Refund = $3000 - $196 = $2804
    expect(result.njEITC.toNumber()).toBe(2000);
    expect(result.njChildTaxCredit.toNumber()).toBe(1000);
    expect(result.refund.toNumber()).toBe(2804);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  // --- Withholding and estimated payments ---

  it("NJ-1040 orchestrator - total payments include withholding and credits", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        njWithholding: 3000,
        estimatedPayments: 500,
      })
    );
    // Total payments = $3000 + $500 + refundable credits
    expect(result.totalPayments.toNumber()).toBeGreaterThanOrEqual(3500);
  });

  it("NJ-1040 orchestrator - total payments include refundable property tax credit", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 25000,
        isHomeowner: true,
        propertyTaxesPaid: 4000,
        electPropertyTaxCredit: true,
        njWithholding: 100,
      })
    );
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.totalPayments.toNumber()).toBe(150);
  });

  it("NJ-1040 orchestrator - total payments include line 57 carryforward totals", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 40000,
        estimatedPayments: 1800,
      })
    );

    // Taxable income = $40,000 - $1,000 = $39,000; the 2025 Table A tax is $683.
    expect(result.totalPayments.toNumber()).toBe(1800);
    expect(result.refund.toNumber()).toBe(1117);
  });

  it("NJ-1040 orchestrator - withholding exceeding tax produces refund", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 30000,
        njWithholding: 2000,
      })
    );
    // Taxable income = 30000 - 1000 = 29000
    // Tax on $29000 (Table A): 1.4%×20000 + 1.75%×9000 = 280 + 157.50 = $438 (rounded)
    expect(result.njTax.toNumber()).toBe(438);
    // Refund = 2000 - 438 = 1562
    expect(result.refund.toNumber()).toBe(1562);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - balance due when tax exceeds payments", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        njWithholding: 1000,
      })
    );
    // Tax will be significant, withholding is low → balance due
    expect(result.balanceDue.greaterThan(0)).toBe(true);
    expect(result.refund.toNumber()).toBe(0);
  });

  // --- Refundable credits sum ---

  it("NJ-1040 orchestrator - refundable credits sum", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        federalEITC: 2000,
        qualifyingChildrenAge5OrUnder: 1,
      })
    );
    // EITC = 40% of $2000 = $800
    // CTC: taxable income = 20000 - 1000 = 19000 ≤ $30,000 → $1000
    expect(result.njEITC.toNumber()).toBe(800);
    expect(result.njChildTaxCredit.toNumber()).toBe(1000);
    expect(result.totalRefundableCredits.toNumber()).toBe(1800);
  });

  // --- Combined deductions and credits ---

  it("NJ-1040 orchestrator - full return with all deductions and credits", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 80000,
        taxableInterest: 500,
        isHomeowner: true,
        propertyTaxesPaid: 10000,
        totalMedicalExpenses: 8000,
        dependentCount: 2,
        collegeDependentCount: 1,
        federalEITC: 1000,
        qualifyingChildrenAge5OrUnder: 1,
        njWithholding: 3000,
      })
    );
    // NJ Gross Income = 80000 + 500 = 80500
    expect(result.njGrossIncome.toNumber()).toBe(80500);

    // Exemptions: $1000 self + $1000 spouse + $3000 (2 deps) + $1000 (1 college) = $6000
    expect(result.totalExemptions.toNumber()).toBe(6000);

    // Property tax deduction: $10,000
    expect(result.propertyTaxDeduction.toNumber()).toBe(10000);

    // Medical deduction: $8000 - 2% of $80500 = $8000 - $1610 = $6390
    expect(result.medicalDeduction.toNumber()).toBe(6390);

    // Taxable income = 80500 - 6000 - 10000 - 6390 = 58110
    expect(result.njTaxableIncome.toNumber()).toBe(58110);

    // Tax from Table B (MFJ)
    expect(result.njTax.greaterThan(0)).toBe(true);

    // EITC = 40% of $1000 = $400
    expect(result.njEITC.toNumber()).toBe(400);

    // CTC: taxable income $58,110 → $50,001-$60,000 bracket → $400/child
    expect(result.njChildTaxCredit.toNumber()).toBe(400);

    // Result should have audit trail
    expect(result.lines.length).toBeGreaterThan(0);
  });

  // --- Pension exclusion flows through ---

  it("NJ-1040 orchestrator - pension exclusion reduces gross income", () => {
    const result = calculateNJ1040(
      singleFiler({
        pensionIncome: 50000,
        qualifiesForPensionExclusion: true,
        taxpayerAge65OrOlder: true,
      })
    );
    // Pension exclusion: min($50,000 pension, $75,000 max) = $50,000
    // NJ Gross Income = 50000 - 50000 = 0
    expect(result.njGrossIncome.toNumber()).toBe(0);
    expect(result.njTaxableIncome.toNumber()).toBe(0);
    expect(result.njTax.toNumber()).toBe(0);
  });

  // --- Audit trail ---

  it("NJ-1040 orchestrator - produces audit trail lines", () => {
    const result = calculateNJ1040(singleFiler({ wages: 50000 }));
    expect(result.lines.length).toBeGreaterThan(0);
    // Should include lines from the orchestrator itself
    const orchestratorLines = result.lines.filter((l) => l.form === "NJ-1040");
    expect(orchestratorLines.length).toBeGreaterThan(0);
    expect(orchestratorLines.map((line) => line.line)).toEqual(
      expect.arrayContaining(["42", "43", "44", "45"])
    );
  });

  // --- Edge cases ---

  it("NJ-1040 orchestrator - all income categories flow through", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        taxableInterest: 1000,
        dividends: 500,
        businessIncome: 10000,
        netGainsFromProperty: 5000,
        partnershipIncome: 3000,
        sCorpIncome: 2000,
        rentalIncome: 1500,
        gamblingWinnings: 1000,
        alimonyReceived: 500,
        otherIncome: 200,
      })
    );
    // Total = 50000+1000+500+10000+5000+3000+2000+1500+1000+500+200 = 74700
    expect(result.njGrossIncome.toNumber()).toBe(74700);
  });

  it("NJ-1040 orchestrator - estimated payments apply", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        estimatedPayments: 10000,
      })
    );
    // Estimated payments should be part of total payments
    expect(result.totalPayments.greaterThanOrEqualTo(10000)).toBe(true);
  });

  it("NJ-1040 orchestrator - zero balance when tax equals payments", () => {
    // We'll compute the tax first, then set withholding to match
    const probe = calculateNJ1040(singleFiler({ wages: 30000 }));
    const exactTax = probe.taxAfterNonrefundableCredits;

    const result = calculateNJ1040(
      singleFiler({
        wages: 30000,
        njWithholding: exactTax,
      })
    );
    expect(result.balanceDue.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - property tax credit not available when income exceeds $250,000", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 300000,
        isHomeowner: true,
        propertyTaxesPaid: 10000,
        electPropertyTaxCredit: true,
      })
    );
    // Credit not eligible at $300K income, even if elected
    expect(result.propertyTaxCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - CTC zero when taxable income exceeds $80,000", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        qualifyingChildrenAge5OrUnder: 2,
      })
    );
    // Taxable income = 100000 - 1000 = 99000 > $80,000 → $0 CTC
    expect(result.njChildTaxCredit.toNumber()).toBe(0);
  });

  // --- Dependent Care Credit (refundable) ---

  it("NJ-1040 orchestrator - dependent care credit applied at 50% bracket", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 25000,
        federalDependentCareCredit: 2000,
      })
    );
    // Taxable income = 25000 - 1000 = 24000 → ≤ $30,000 bracket → 50%
    // NJ dependent care credit = $2,000 × 50% = $1,000
    expect(result.njDependentCareCredit.toNumber()).toBe(1000);
    expect(result.totalRefundableCredits.greaterThanOrEqualTo(1000)).toBe(true);
  });

  it("NJ-1040 orchestrator - dependent care credit at 40% bracket", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 55000,
        federalDependentCareCredit: 1500,
      })
    );
    // Taxable income = 55000 - 1000 = 54000 → $30,001-$60,000 bracket → 40%
    // NJ credit = $1,500 × 40% = $600
    expect(result.njDependentCareCredit.toNumber()).toBe(600);
  });

  it("NJ-1040 orchestrator - dependent care credit zero when no federal credit", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
      })
    );
    expect(result.njDependentCareCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - dependent care credit zero when income over $150K", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 200000,
        federalDependentCareCredit: 2000,
      })
    );
    // Taxable income = 200000 - 1000 = 199000 > $150,000 → 0%
    expect(result.njDependentCareCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - dependent care credit is refundable", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        federalDependentCareCredit: 2000,
      })
    );
    // Taxable income = 20000 - 1000 = 19000 → 50% bracket
    // NJ credit = $2,000 × 50% = $1,000
    // Tax on $19,000 at 1.4% = $266
    // Refund = payments ($1,000 credit) - $266 tax = $734
    expect(result.njDependentCareCredit.toNumber()).toBe(1000);
    expect(result.refund.toNumber()).toBe(734);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - dependent care credit combined with all other credits", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 40000,
        federalEITC: 3000,
        federalDependentCareCredit: 1200,
        qualifyingChildrenAge5OrUnder: 1,
        dependentCount: 2,
      })
    );
    // NJ Gross Income = $40,000
    // Exemptions: $1000 self + $1000 spouse + $3000 (2 deps) = $5,000
    // Taxable income = 40000 - 5000 = 35000
    // NJ EITC = 40% of $3,000 = $1,200
    // NJ CTC: $35,000 → $30,001-$40,000 bracket → $800/child × 1 = $800
    // NJ DCC: $35,000 → $30,001-$60,000 bracket → 40% of $1,200 = $480
    expect(result.njEITC.toNumber()).toBe(1200);
    expect(result.njChildTaxCredit.toNumber()).toBe(800);
    expect(result.njDependentCareCredit.toNumber()).toBe(480);
    expect(result.totalRefundableCredits.toNumber()).toBe(2480);
  });

  it("NJ-1040 orchestrator - dependent care credit prorated for part-year resident", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 25000,
        federalDependentCareCredit: 2000,
        monthsOfResidency: 6,
      })
    );
    // Taxable income = 25000 - 1000 = 24000 → 50%
    // NJ credit = $2,000 × 50% × (6/12) = $500
    expect(result.njDependentCareCredit.toNumber()).toBe(500);
  });

  // --- Other Jurisdiction Credit (Schedule A, Line 40) ---

  it("NJ-1040 orchestrator - other jurisdiction credit reduces tax", () => {
    // NJ resident working in NY with $100K wages
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(100000),
            taxPaid: new Decimal(5000),
          },
        ],
      })
    );
    // Taxable income = 100000 - 1000 = 99000
    // NJ tax on $99K (Table A): 280 + 262.50 + 175 + 552.50 + 2362.20 + 6.02×9000
    // All income in NY → ratio = 1.0 → limit = NJ tax
    // Credit = min(5000, NJ tax) → capped at NJ tax if 5000 > NJ tax
    expect(result.otherJurisdictionCredit.greaterThan(0)).toBe(true);
    // Tax after nonrefundable should be reduced
    expect(result.taxAfterNonrefundableCredits.lessThan(result.njTax)).toBe(true);
  });

  it("NJ-1040 orchestrator - other jurisdiction credit cannot exceed NJ tax", () => {
    // NY tax exceeds NJ tax → credit capped at NJ tax
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(50000),
            taxPaid: new Decimal(10000),
          },
        ],
      })
    );
    // NJ taxable = 50000 - 1000 = 49000; NJ tax = ~$1215
    // All income in NY, ratio = 1.0
    // Credit = min(10000, NJ tax) = NJ tax
    expect(result.otherJurisdictionCredit.toNumber()).toBe(result.njTax.toNumber());
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - other jurisdiction credit proportional when partial income", () => {
    // $80K of $100K earned in NY
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        taxableInterest: 20000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(80000),
            taxPaid: new Decimal(4000),
          },
        ],
      })
    );
    // NJ gross income = 100000
    // Income ratio = 80000/100000 = 0.8
    // Proportional limit = 0.8 × NJ tax
    // Credit = min(4000, 0.8 × NJ tax)
    const njTax = result.njTax;
    const expectedLimit = njTax.times("0.8").toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const expectedCredit = Decimal.min(new Decimal(4000), expectedLimit);
    expect(result.otherJurisdictionCredit.toNumber()).toBe(expectedCredit.toNumber());
  });

  it("NJ-1040 orchestrator - no other jurisdictions means zero credit", () => {
    const result = calculateNJ1040(singleFiler({ wages: 75000 }));
    expect(result.otherJurisdictionCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - supplemental nonrefundable credits reduce income tax before use tax", () => {
    const baseline = calculateNJ1040(singleFiler({ wages: 50000 }));
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        shelteredWorkshopCurrentYearCredit: 200,
        goldStarCounselingHours: 2,
        goldStarTricareRate: 50,
        organDonorLeaveEvents: [{ paidLeaveCompensation: 800, missedWorkDays: 8 }],
      })
    );

    expect(result.supplementalNonrefundableCredits.toNumber()).toBe(500);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(
      baseline.taxAfterNonrefundableCredits.minus(500).toNumber()
    );
    expect(result.balanceDue.lessThan(baseline.balanceDue)).toBe(true);
  });

  it("NJ-1040 orchestrator - supplemental nonrefundable credits do not reduce use tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 1100,
        useSafeHarbor: true,
        shelteredWorkshopCurrentYearCredit: 500,
      })
    );

    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(
      result.useTax.toNumber()
    );
    expect(result.balanceDue.toNumber()).toBe(result.useTax.toNumber());
  });

  it("NJ-1040 orchestrator - totalTax reflects the post-credit page-2 tax flow", () => {
    const baseline = calculateNJ1040(singleFiler({ wages: 50000 }));
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        shelteredWorkshopCurrentYearCredit: 200,
        goldStarCounselingHours: 2,
        goldStarTricareRate: 50,
        organDonorLeaveEvents: [{ paidLeaveCompensation: 800, missedWorkDays: 8 }],
      })
    );

    expect(result.supplementalNonrefundableCredits.toNumber()).toBe(500);
    expect(result.totalTax.toNumber()).toBe(
      result.taxAfterNonrefundableCredits.toNumber()
    );
    expect(result.totalTax.toNumber()).toBe(
      baseline.totalTax.minus(500).toNumber()
    );
  });

  it("NJ-1040 orchestrator - NYC commuter full return with OJC and refundable credits", () => {
    // NJ resident, NYC commuter: $120K wages in NY, also has $2K NJ interest
    // Plus federal EITC (low for this income) and withholding
    const result = calculateNJ1040(
      singleFiler({
        wages: 120000,
        taxableInterest: 2000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(120000),
            taxPaid: new Decimal(6000),
          },
        ],
        njWithholding: 1000,
      })
    );
    // NJ gross income = 122000
    // Income ratio = 120000/122000 ≈ 0.9836
    // OJC reduces NJ tax significantly
    expect(result.njGrossIncome.toNumber()).toBe(122000);
    expect(result.otherJurisdictionCredit.greaterThan(0)).toBe(true);
    // Total payments include withholding
    expect(result.totalPayments.greaterThanOrEqualTo(1000)).toBe(true);
  });

  it("NJ-1040 orchestrator - OJC with property tax credit both apply", () => {
    // OJC reduces income tax; refundable property tax credit is paid separately
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        otherJurisdictions: [
          {
            jurisdiction: "PA",
            incomeInJurisdiction: new Decimal(20000),
            taxPaid: new Decimal(600),
          },
        ],
        isHomeowner: true,
        propertyTaxesPaid: 5000,
        electPropertyTaxCredit: true,
      })
    );
    // Property tax credit elected → no deduction, but $50 credit
    // OJC: ratio = 20000/80000 = 0.25 → limit = 0.25 × NJ tax
    // Credit = min(600, proportional limit)
    expect(result.propertyTaxDeduction.toNumber()).toBe(0);
    expect(result.otherJurisdictionCredit.greaterThan(0)).toBe(true);
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    // Tax after nonrefundable excludes the refundable property tax credit
    const expectedTaxAfter = result.njTax.minus(result.otherJurisdictionCredit);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(
      Math.max(0, expectedTaxAfter.toNumber())
    );
    expect(result.totalPayments.toNumber()).toBe(50);
  });

  it("NJ-1040 orchestrator - OJC wipes out tax but refundable property tax credit still pays out", () => {
    // All income earned in NY, NY tax > NJ tax → OJC = NJ tax, but property tax credit remains refundable
    const result = calculateNJ1040(
      singleFiler({
        wages: 60000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(60000),
            taxPaid: new Decimal(10000),
          },
        ],
        isHomeowner: true,
        propertyTaxesPaid: 5000,
        electPropertyTaxCredit: true,
      })
    );
    // OJC = NJ tax (capped) → remaining tax = 0, but the line 56 credit still refunds
    expect(result.otherJurisdictionCredit.toNumber()).toBe(result.njTax.toNumber());
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(50);
  });

  it("NJ-1040 orchestrator - multiple other jurisdictions in orchestrator", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        businessIncome: 20000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(80000),
            taxPaid: new Decimal(4000),
          },
          {
            jurisdiction: "CT",
            incomeInJurisdiction: new Decimal(20000),
            taxPaid: new Decimal(1000),
          },
        ],
      })
    );
    // NJ gross income = 100000
    // Both credits computed independently then summed
    expect(result.otherJurisdictionCredit.greaterThan(0)).toBe(true);
    // Credit should be less than or equal to NJ tax
    expect(
      result.otherJurisdictionCredit.lessThanOrEqualTo(result.njTax)
    ).toBe(true);
  });

  it("NJ-1040 orchestrator - OJC with refundable credits still produces correct refund", () => {
    // Low income, NY credit wipes out tax, EITC still produces refund
    const result = calculateNJ1040(
      singleFiler({
        wages: 20000,
        federalEITC: 3000,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(20000),
            taxPaid: new Decimal(1000),
          },
        ],
      })
    );
    // NJ EITC = 40% of $3000 = $1200 (refundable)
    // OJC wipes out NJ tax → tax after nonrefundable = 0
    // Refund = refundable credits (at least $1200)
    expect(result.njEITC.toNumber()).toBe(1200);
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(0);
    expect(result.refund.greaterThanOrEqualTo(1200)).toBe(true);
  });

  it("NJ-1040 orchestrator - OJC applies against income tax only, not use tax or SRP", () => {
    // Filer with OJC + use tax + SRP: credit reduces income tax only
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        useSafeHarbor: true,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 12,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(80000),
            taxPaid: new Decimal(50000), // Very high to ensure OJC = njTax
          },
        ],
      })
    );
    // OJC should be capped at njTax (Line 39 income tax), NOT at totalTax
    expect(result.otherJurisdictionCredit.toNumber()).toBe(result.njTax.toNumber());
    // Use tax and SRP remain: they are NOT reduced by OJC
    expect(result.useTax.greaterThan(0)).toBe(true);
    expect(result.sharedResponsibilityPayment.greaterThan(0)).toBe(true);
    // Tax after nonrefundable = 0 (income tax) + use tax + SRP
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(
      result.useTax.plus(result.sharedResponsibilityPayment).toNumber()
    );
  });

  it("NJ-1040 orchestrator - OJC proportional limit uses income tax not total tax", () => {
    // Partial OJC with use tax: proportional limit should use njTax only
    const result = calculateNJ1040(
      singleFiler({
        wages: 60000,
        taxableInterest: 20000,
        useSafeHarbor: true,
        otherJurisdictions: [
          {
            jurisdiction: "PA",
            incomeInJurisdiction: new Decimal(20000),
            taxPaid: new Decimal(10000), // High enough to be capped by proportional limit
          },
        ],
      })
    );
    // NJ gross income = 80000
    // Income ratio = 20000/80000 = 0.25
    // Proportional limit = 0.25 × njTax (income tax only)
    const expectedLimit = result.njTax
      .times("0.25")
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const expectedCredit = Decimal.min(new Decimal(10000), expectedLimit);
    expect(result.otherJurisdictionCredit.toNumber()).toBe(expectedCredit.toNumber());
    // Use tax should still be present in taxAfterNonrefundableCredits
    const incomeTaxAfterCredits = Math.max(
      0,
      result.njTax.minus(result.otherJurisdictionCredit).toNumber()
    );
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(
      incomeTaxAfterCredits + result.useTax.toNumber()
    );
  });

  it("NJ-1040 orchestrator - OJC wipes out income tax but use tax remains in balance due", () => {
    // All income in NY, OJC = njTax, but use tax still produces balance due
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        useSafeHarbor: true,
        otherJurisdictions: [
          {
            jurisdiction: "NY",
            incomeInJurisdiction: new Decimal(75000),
            taxPaid: new Decimal(50000),
          },
        ],
      })
    );
    // OJC wipes out income tax
    expect(result.otherJurisdictionCredit.toNumber()).toBe(result.njTax.toNumber());
    // Use tax: $68 for $75K (safe harbor)
    expect(result.useTax.toNumber()).toBe(68);
    // Tax after nonrefundable = 0 (income tax) + $68 (use tax) = $68
    expect(result.taxAfterNonrefundableCredits.toNumber()).toBe(68);
    // Balance due = $68 (no withholding to cover it)
    expect(result.balanceDue.toNumber()).toBe(68);
  });

  // --- Health Insurance Mandate (Shared Responsibility Payment) ---

  it("NJ-1040 orchestrator - no SRP when fully covered", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 50000, healthCoverageUncoveredMonths: 0 })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber());
  });

  it("NJ-1040 orchestrator - SRP added to total tax for uninsured filer", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 12,
      })
    );
    // Income-based: 2.5% × ($50,000 - $10,000) = $1,000
    // Flat: $695
    // SRP = max($695, $1,000) = $1,000
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1000);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber() + 1000);
  });

  it("NJ-1040 orchestrator - SRP increases balance due", () => {
    // Compute tax without SRP first
    const withoutSRP = calculateNJ1040(singleFiler({ wages: 75000 }));

    const withSRP = calculateNJ1040(
      singleFiler({
        wages: 75000,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 12,
      })
    );
    // SRP should increase balance due
    expect(withSRP.balanceDue.greaterThan(withoutSRP.balanceDue)).toBe(true);
    expect(withSRP.sharedResponsibilityPayment.greaterThan(0)).toBe(true);
  });

  it("NJ-1040 orchestrator - short gap exemption means no SRP", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 2,
      })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber());
  });

  it("NJ-1040 orchestrator - SRP prorated for partial year gap", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 6,
      })
    );
    // Annual SRP = $1,000 (income-based)
    // Prorated: $1,000 × 6/12 = $500
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(500);
  });

  it("NJ-1040 orchestrator - SRP with family and credits", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 80000,
        healthCoverageAdults: 2,
        healthCoverageChildren: 2,
        healthCoverageUncoveredMonths: 12,
        federalEITC: 1000,
        njWithholding: 3000,
      })
    );
    // Flat: $695×2 + $347.50×2 = $2,085 (at cap)
    // Income: 2.5% × ($80,000 - $20,000) = $1,500
    // SRP = max($2,085, $1,500) = $2,085
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(2085);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber() + 2085);
    // EITC still applies as refundable
    expect(result.njEITC.toNumber()).toBe(400);
  });

  it("NJ-1040 orchestrator - SRP household income uses total income before exclusions plus tax-exempt and dependent income", () => {
    const result = calculateNJ1040(
      singleFiler({
        pensionIncome: 100000,
        qualifiesForPensionExclusion: true,
        taxExemptInterest: 8000,
        healthCoverageDependentIncome: 7000,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 12,
      })
    );
    // Worksheet L household income = $100,000 total income + $8,000 tax-exempt interest + $7,000 dependent income
    // Income-based SRP = 2.5% × ($115,000 - $10,000) = $2,625
    expect(result.njGrossIncome.toNumber()).toBe(25000);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(2625);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber() + 2625);
  });

  it("NJ-1040 orchestrator - SRP defaults to zero when health coverage fields omitted", () => {
    const result = calculateNJ1040(singleFiler({ wages: 75000 }));
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(result.njTax.toNumber());
  });

  // --- Use Tax (Line 38b) ---

  it("NJ-1040 orchestrator - use tax safe harbor adds to total tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        useSafeHarbor: true,
      })
    );
    // NJ gross income $75,000 → safe harbor bracket $75,000-$100,000 → $68
    expect(result.useTax.toNumber()).toBe(68);
    expect(result.totalTax.toNumber()).toBe(result.njTax.plus(68).toNumber());
  });

  it("NJ-1040 orchestrator - use tax actual amount adds to total tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        actualUseTax: 200,
      })
    );
    expect(result.useTax.toNumber()).toBe(200);
    expect(result.totalTax.toNumber()).toBe(result.njTax.plus(200).toNumber());
  });

  it("NJ-1040 orchestrator - no use tax when not elected and no actual amount", () => {
    const result = calculateNJ1040(singleFiler({ wages: 50000 }));
    expect(result.useTax.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - use tax increases balance due", () => {
    const without = calculateNJ1040(singleFiler({ wages: 100000 }));
    const withUseTax = calculateNJ1040(
      singleFiler({ wages: 100000, useSafeHarbor: true })
    );
    // Safe harbor for $100K gross income → $100,000-$150,000 bracket → $103
    expect(withUseTax.useTax.toNumber()).toBe(103);
    // Balance due increases by at least $103 (use tax also increases underpayment penalty)
    expect(
      withUseTax.balanceDue.greaterThanOrEqualTo(without.balanceDue.plus(103))
    ).toBe(true);
  });

  it("NJ-1040 orchestrator - use tax with SRP both add to total tax", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 75000,
        useSafeHarbor: true,
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 12,
      })
    );
    // Use tax: $68 (safe harbor for $75K)
    // SRP: income-based = 2.5% × ($75,000 - $10,000) = $1,625; flat = $695 → max = $1,625
    expect(result.useTax.toNumber()).toBe(68);
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(1625);
    expect(result.totalTax.toNumber()).toBe(
      result.njTax.plus(68).plus(1625).toNumber()
    );
  });

  it("NJ-1040 orchestrator - safe harbor $0 for income under $15,000", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 10000,
        useSafeHarbor: true,
      })
    );
    expect(result.useTax.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - safe harbor highest bracket for $200K+", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 300000,
        useSafeHarbor: true,
      })
    );
    expect(result.useTax.toNumber()).toBe(166);
  });

  // --- Excess Payroll Contributions Credit ---

  it("NJ-1040 orchestrator - excess payroll lines 59 through 61 map each category separately", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        njWithholding: 2000,
        totalUIWFSWFWithheld: "368.04", // line 59 excess = 184.02
        totalDIWithheld: "500", // line 60 excess = 119.58
        totalFLIWithheld: "1091.64", // line 61 excess = 545.82
      })
    );

    expect(result.excessUIWFSWFCredit.toNumber()).toBe(184.02);
    expect(result.excessDICredit.toNumber()).toBe(119.58);
    expect(result.excessFLICredit.toNumber()).toBe(545.82);
    expect(result.excessPayrollCredit.toNumber()).toBe(849.42);
    expect(result.totalPayments.toNumber()).toBe(2849.42);
  });

  it("NJ-1040 orchestrator - excess payroll credit adds to payments", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        // Two employers each withheld $184.02 in UI/WF/SWF → total $368.04
        totalUIWFSWFWithheld: "368.04",
        njWithholding: 2000,
      })
    );
    // Excess: $368.04 - $184.02 = $184.02
    expect(result.excessPayrollCredit.toNumber()).toBe(184.02);
    // Total payments = $2000 withholding + $184.02 excess payroll + refundable credits
    expect(
      result.totalPayments.greaterThanOrEqualTo(d("2184.02"))
    ).toBe(true);
  });

  it("NJ-1040 orchestrator - excess FLI credit adds to payments", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 80000,
        totalFLIWithheld: "1091.64", // Two employers each withheld $545.82
      })
    );
    // Excess FLI: $1,091.64 - $545.82 = $545.82
    expect(result.excessPayrollCredit.toNumber()).toBe(545.82);
  });

  it("NJ-1040 orchestrator - no excess payroll when within limits", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 40000,
        totalUIWFSWFWithheld: "100", // Under maximum
        totalFLIWithheld: "50", // Under maximum
      })
    );
    expect(result.excessPayrollCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - no excess payroll when fields omitted", () => {
    const result = calculateNJ1040(singleFiler({ wages: 50000 }));
    expect(result.excessPayrollCredit.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - excess payroll credit increases refund", () => {
    const probe = calculateNJ1040(singleFiler({ wages: 50000 }));
    const taxOwed = probe.taxAfterNonrefundableCredits;

    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        njWithholding: taxOwed, // Covers exact tax
        totalUIWFSWFWithheld: "368.04", // Excess = $184.02
      })
    );
    // Refund = excess payroll credit since tax is fully covered
    expect(result.excessPayrollCredit.toNumber()).toBe(184.02);
    expect(result.refund.toNumber()).toBe(184.02);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - combined excess payroll categories", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        totalUIWFSWFWithheld: "368.04", // Excess: $184.02
        totalFLIWithheld: "1091.64", // Excess: $545.82
        totalDIWithheld: "500", // Excess: $119.58
      })
    );
    // Total excess = $184.02 + $119.58 + $545.82 = $849.42
    expect(result.excessPayrollCredit.toNumber()).toBe(849.42);
  });

  // --- Full return with use tax and excess payroll ---

  it("NJ-1040 orchestrator - full return with use tax, excess payroll, and all features", () => {
    const result = calculateNJ1040(
      mfjFiler({
        wages: 120000,
        taxableInterest: 2000,
        isHomeowner: true,
        propertyTaxesPaid: 12000,
        totalMedicalExpenses: 6000,
        dependentCount: 2,
        federalEITC: 500,
        qualifyingChildrenAge5OrUnder: 1,
        federalDependentCareCredit: 1000,
        useSafeHarbor: true,
        totalUIWFSWFWithheld: "368.04",
        totalFLIWithheld: "1091.64",
        njWithholding: 4000,
        estimatedPayments: 500,
      })
    );
    // NJ gross income = $122,000
    expect(result.njGrossIncome.toNumber()).toBe(122000);
    // Use tax: safe harbor for $122K → $100K-$150K bracket → $103
    expect(result.useTax.toNumber()).toBe(103);
    // Excess payroll: UI excess $184.02 + FLI excess $545.82 = $729.84
    expect(result.excessPayrollCredit.toNumber()).toBe(729.84);
    // Total tax includes use tax
    expect(result.totalTax.toNumber()).toBe(result.njTax.plus(103).toNumber());
    // Total payments includes excess payroll
    expect(
      result.totalPayments.greaterThan(
        d(4000 + 500).plus(result.totalRefundableCredits)
      )
    ).toBe(true);
    // Audit trail should be comprehensive
    expect(result.lines.length).toBeGreaterThan(15);
  });

  // --- Underpayment Penalty (NJ-2210) ---

  it("NJ-1040 orchestrator - no penalty when withholding covers tax", () => {
    const probe = calculateNJ1040(singleFiler({ wages: 50000 }));
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        njWithholding: probe.taxAfterNonrefundableCredits,
      })
    );
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - no penalty when tax minus withholding under $400", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 30000,
        njWithholding: 200,
      })
    );
    // Tax on $29,000 = $438; $438 - $200 = $238 ≤ $400 → no penalty
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - property tax credit and NJ EITC count toward NJ-2210 line 2", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 35000,
        njWithholding: 100,
        federalEITC: 1000,
        isTenant: true,
        rentPaid: 12000,
        electPropertyTaxCredit: true,
        qualifyingEICChildrenCount: 1,
        hasAdult18OrOlderTaxpayer: true,
      })
    );
    expect(result.propertyTaxCredit.toNumber()).toBe(50);
    expect(result.njEITC.toNumber()).toBe(400);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - penalty applies when no withholding on significant income", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 100000 })
    );
    // Tax on $99K ≈ $4,414; no withholding → penalty applies
    expect(result.underpaymentPenalty.greaterThan(0)).toBe(true);
    // Balance due = tax + penalty
    expect(result.balanceDue.toNumber()).toBe(
      result.taxAfterNonrefundableCredits.plus(result.underpaymentPenalty).toNumber()
    );
  });

  it("NJ-1040 orchestrator - penalty increases balance due", () => {
    // Compare balance due with and without penalty context (via prior year safe harbor)
    const withPenalty = calculateNJ1040(
      singleFiler({ wages: 80000 })
    );
    const withSafeHarbor = calculateNJ1040(
      singleFiler({
        wages: 80000,
        priorYearTax: 0,
        priorYearReturnFiled: true,
      })
    );
    // Prior year tax = $0 → required payment = $0 → no penalty
    expect(withSafeHarbor.underpaymentPenalty.toNumber()).toBe(0);
    // Without safe harbor, penalty should exist
    expect(withPenalty.underpaymentPenalty.greaterThan(0)).toBe(true);
    // Balance due with penalty > without
    expect(withPenalty.balanceDue.greaterThan(withSafeHarbor.balanceDue)).toBe(true);
  });

  it("NJ-1040 orchestrator - penalty with prior year safe harbor exception", () => {
    // Prior year tax $2000 → required = min(80% current, $2000)
    // Withholding $2000 ≥ $2000 → no penalty
    const result = calculateNJ1040(
      singleFiler({
        wages: 100000,
        njWithholding: 2000,
        priorYearTax: 2000,
        priorYearReturnFiled: true,
      })
    );
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - penalty does not reduce refund below zero", () => {
    // Withholding > tax → refund; penalty is $0 since withholding covers tax
    const result = calculateNJ1040(
      singleFiler({
        wages: 50000,
        njWithholding: 5000,
      })
    );
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
    expect(result.refund.greaterThan(0)).toBe(true);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("NJ-1040 orchestrator - penalty in audit trail", () => {
    const result = calculateNJ1040(singleFiler({ wages: 100000 }));
    const penaltyLine = result.lines.find(
      (l) => l.form === "NJ-1040" && l.line === "underpayment-penalty"
    );
    expect(penaltyLine).toBeDefined();
    expect(penaltyLine!.value.greaterThan(0)).toBe(true);
  });

  it("NJ-1040 orchestrator - line 52 mirrors the NJ-2210 underpayment penalty", () => {
    const result = calculateNJ1040(singleFiler({ wages: 100000 }));

    expect(result.line52UnderpaymentInterest.toNumber()).toBe(
      result.underpaymentPenalty.toNumber()
    );

    const line52 = result.lines.find(
      (l) => l.form === "NJ-1040" && l.line === "52"
    );
    expect(line52?.value.toNumber()).toBe(
      result.underpaymentPenalty.toNumber()
    );
  });

  it("NJ-1040 orchestrator - line 54 total tax due adds the line 52 underpayment interest", () => {
    const result = calculateNJ1040(singleFiler({ wages: 100000 }));

    expect(result.line54TotalTaxDue.toNumber()).toBe(
      result.taxAfterNonrefundableCredits.plus(result.line52UnderpaymentInterest).toNumber()
    );

    const line54 = result.lines.find(
      (l) => l.form === "NJ-1040" && l.line === "54"
    );
    expect(line54?.value.toNumber()).toBe(result.line54TotalTaxDue.toNumber());
  });

  it("NJ-1040 orchestrator - penalty with estimated payments reducing underpayment", () => {
    const noEstimated = calculateNJ1040(
      singleFiler({ wages: 100000 })
    );
    const withEstimated = calculateNJ1040(
      singleFiler({
        wages: 100000,
        estimatedPayments: 2000,
      })
    );
    // Estimated payments reduce the underpayment, thus reducing the penalty
    expect(withEstimated.underpaymentPenalty.lessThan(noEstimated.underpaymentPenalty)).toBe(true);
    // Balance due also lower
    expect(withEstimated.balanceDue.lessThan(noEstimated.balanceDue)).toBe(true);
  });

  // --- Filing requirement integration ---

  it("NJ-1040 orchestrator - filing requirement included in result", () => {
    const result = calculateNJ1040(singleFiler({ wages: 50000 }));
    expect(result.filingRequirement).toBeDefined();
    expect(result.filingRequirement.filingRequired).toBe(true);
    expect(result.filingRequirement.requiredByIncome).toBe(true);
  });

  it("NJ-1040 orchestrator - filing not required for zero income", () => {
    const result = calculateNJ1040(singleFiler());
    expect(result.filingRequirement.filingRequired).toBe(false);
    expect(result.filingRequirement.requiredByIncome).toBe(false);
    expect(result.filingRequirement.recommendedForm).toBe("none");
  });

  it("NJ-1040 orchestrator - below-threshold senior homeowner is pointed to NJ-1040-HW", () => {
    const result = calculateNJ1040(
      singleFiler({
        wages: 5000,
        isHomeowner: true,
        propertyTaxesPaid: 4000,
        taxpayerAge65OrOlder: true,
      })
    );

    expect(result.filingRequirement.filingRequired).toBe(false);
    expect(result.filingRequirement.recommendedForm).toBe("NJ-1040-HW");
    expect(result.filingRequirement.nj1040hwTotalCredits.toNumber()).toBe(50);
  });

  it("NJ-1040 orchestrator - filing required for withholding even below threshold", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 5000, njWithholding: 200 })
    );
    expect(result.filingRequirement.requiredByIncome).toBe(false);
    expect(result.filingRequirement.requiredForRefund).toBe(true);
    expect(result.filingRequirement.filingRequired).toBe(true);
  });

  it("NJ-1040 orchestrator - filing required for estimated payments even below threshold", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 5000, estimatedPayments: 200 })
    );
    expect(result.filingRequirement.requiredByIncome).toBe(false);
    expect(result.filingRequirement.requiredForRefund).toBe(true);
    expect(result.filingRequirement.filingRequired).toBe(true);
  });

  it("NJ-1040 orchestrator - filing required when EITC eligible", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 8000, federalEITC: 2000 })
    );
    expect(result.filingRequirement.requiredForEITC).toBe(true);
    expect(result.filingRequirement.filingRequired).toBe(true);
  });

  it("NJ-1040 orchestrator - filing required when dependent care credit is refundable below threshold", () => {
    const result = calculateNJ1040(
      singleFiler({ wages: 9000, federalDependentCareCredit: 450 })
    );
    expect(result.filingRequirement.requiredByIncome).toBe(false);
    expect(result.filingRequirement.requiredForDependentCareCredit).toBe(true);
    expect(result.filingRequirement.filingRequired).toBe(true);
  });

  it("NJ-1040 orchestrator - filing required when business income exceeds threshold", () => {
    const result = calculateNJ1040(singleFiler({ businessIncome: 15000 }));
    expect(result.filingRequirement.requiredByIncome).toBe(true);
    expect(result.filingRequirement.filingRequired).toBe(true);
  });

  it("NJ-1040 orchestrator - filing threshold reflects filing status", () => {
    const single = calculateNJ1040(singleFiler());
    const mfj = calculateNJ1040(mfjFiler());
    expect(single.filingRequirement.filingThreshold.toNumber()).toBe(10000);
    expect(mfj.filingRequirement.filingThreshold.toNumber()).toBe(20000);
  });

  it("NJ-1040 orchestrator - short gap exemption does not mark filing required by SRP alone", () => {
    const result = calculateNJ1040(
      singleFiler({
        healthCoverageAdults: 1,
        healthCoverageUncoveredMonths: 2,
      })
    );
    expect(result.sharedResponsibilityPayment.toNumber()).toBe(0);
    expect(result.filingRequirement.requiredForSRP).toBe(false);
    expect(result.filingRequirement.filingRequired).toBe(false);
  });
});

/**
 * Integration tests for Ohio Resident Return orchestrator.
 *
 * These tests exercise the full flow: Schedule of Adjustments → IT 1040 →
 * Schedule of Credits → final return. Each scenario verifies that the three
 * modules wire together correctly and produce the expected end-to-end result.
 */

import { describe, expect, it } from "vitest";
import {
  calculateOhioResidentReturn,
  type OhioResidentReturnInput,
} from "@/engine/state/oh-return.js";

function makeInput(
  overrides: Partial<OhioResidentReturnInput> = {},
): OhioResidentReturnInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    federalAgi: 50000,
    exemptions: 1,
    ...overrides,
  };
}

describe("Ohio Resident Return — Orchestrator", () => {
  // -------------------------------------------------------------------------
  // Basic wiring: adjustments flow into IT 1040
  // -------------------------------------------------------------------------

  it("adjustments additions and deductions flow to IT 1040 lines 2a/2b", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        nonOhioStateLocalInterest: 1500,
        taxableSocialSecurity: 5000,
      }),
    );
    expect(result.scheduleOfAdjustments.line14_totalAdditions.toNumber()).toBe(1500);
    expect(result.scheduleOfAdjustments.line36_totalDeductions.toNumber()).toBe(5000);
    expect(result.it1040.line2a_additions.toNumber()).toBe(1500);
    expect(result.it1040.line2b_deductions.toNumber()).toBe(5000);
    // Ohio AGI = 80000 + 1500 - 5000 = 76500
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(76500);
  });

  it("business income deduction flows from adjustments to IT 1040 MAGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 100000,
        qualifyingBusinessIncome: 100000,
        exemptions: 1,
      }),
    );
    // Business deduction = min(100000, 250000) = 100000
    expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toNumber()).toBe(100000);
    // IT 1040 line 2b includes the deduction
    expect(result.it1040.line2b_deductions.toNumber()).toBe(100000);
    // Ohio AGI = 100000 - 100000 = 0
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(0);
    // MAGI = Ohio AGI + business income deduction = 0 + 100000 = 100000
    expect(result.it1040.magi.toNumber()).toBe(100000);
  });

  it("2025 pregnancy resource center and Ohio educator deductions reduce Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 1000, contributionDate: "2025-10-15" },
        ],
        ohioEducatorExpenses: [
          { educatorId: "teacher-1", amount: 450 },
        ],
        ohioWithholding: 1000,
      }),
    );

    expect(result.scheduleOfAdjustments.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(750);
    expect(result.scheduleOfAdjustments.line39_educatorExpensesDeduction.toNumber()).toBe(300);
    expect(result.scheduleOfAdjustments.line47_totalDeductions.toNumber()).toBe(1050);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(48950);
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(913);
    expect(result.it1040.line26_refund.toNumber()).toBe(87);
  });

  it("pregnancy resource center deduction ignores dated contributions outside the statutory window", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 500, contributionDate: "2025-09-29" },
          { contributorId: "taxpayer", amount: 600, contributionDate: "2025-10-01" },
          { contributorId: "taxpayer", amount: 400, contributionDate: "2026-01-01" },
        ],
      }),
    );

    expect(result.scheduleOfAdjustments.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(600);
    expect(result.scheduleOfAdjustments.line47_totalDeductions.toNumber()).toBe(600);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(49400);
  });

  it("Ohio Homebuyer Plus deduction flows through Schedule of Adjustments into Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        homebuyerPlusAccounts: [
          { contributorId: "taxpayer", accountId: "acct-1", amount: 6200 },
        ],
        ohioWithholding: 1000,
      }),
    );

    expect(result.scheduleOfAdjustments.line24_homebuyerPlusDeduction.toNumber()).toBe(5000);
    expect(result.scheduleOfAdjustments.line47_totalDeductions.toNumber()).toBe(5000);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(45000);
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(804);
    expect(result.it1040.line26_refund.toNumber()).toBe(196);
  });

  it("taxable business income excess flows from adjustments to IT 1040 line 6", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 400000,
        qualifyingBusinessIncome: 350000,
        exemptions: 1,
      }),
    );
    // Biz deduction = 250000, excess = 100000
    expect(result.scheduleOfAdjustments.taxableBusinessIncome.toNumber()).toBe(100000);
    expect(result.it1040.line6_taxableBusinessIncome.toNumber()).toBe(100000);
    // Business tax = 100000 × 3% = 3000
    expect(result.it1040.line8b_businessTax.toNumber()).toBe(3000);
  });

  // -------------------------------------------------------------------------
  // Credits flow into IT 1040
  // -------------------------------------------------------------------------

  it("nonrefundable credits from Schedule of Credits flow to IT 1040 line 9", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 75000,
        exemptions: 1,
        retirementIncome: 10000,
        isSenior: true,
      }),
    );
    // MAGI = 75000, exemption = $2,150, MAGI less exemptions = 72850
    // Retirement credit: $200 (retirement income $10K, MAGI less exemptions < $100K)
    // Senior credit: $50 (age 65+, MAGI less exemptions < $100K)
    // Total first batch = $250
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(200);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
    expect(result.scheduleOfCredits.line10_totalFirstBatch.toNumber()).toBe(250);
    // Credits flow to IT 1040 line 9
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(250);
  });

  it("grape production qualifying property cost flows through Schedule of Credits line 26", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 75000,
        exemptions: 1,
        grapeProductionQualifyingPropertyCost: 12345,
      }),
    );

    expect(result.scheduleOfCredits.line26_grapeProductionCredit.toNumber()).toBe(1235);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(1235);
  });

  it("joint filing credit and earned income credit flow through", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 45000,
        exemptions: 4, // 2 spouses + 2 kids
        federalEarnedIncomeCredit: 3000,
        bothSpousesHaveQualifyingIncome: true,
      }),
    );
    // MAGI = 45000, exemption = $2,150 × 4 = $8,600
    // MAGI less exemptions = 45000 - 8600 = 36400
    // EIC: 30% × 3000 = $900
    // Joint filing: MAGI less exemptions $36,400 → 15% tier (> $25,000)
    // line11 = tax after first batch; then 15% of line11, capped at $650
    expect(result.scheduleOfCredits.line13_earnedIncomeCredit.toNumber()).toBe(900);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(
      result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber(),
    );
  });

  it("home school expenses credit flows through Schedule of Credits line 14", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        homeSchoolExpenses: 400,
        homeSchoolQualifyingStudents: 1,
      }),
    );

    expect(result.scheduleOfCredits.line14_homeSchoolExpensesCredit.toNumber()).toBe(250);
    expect(result.scheduleOfCredits.line36_totalSecondBatch.toNumber()).toBe(250);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(250);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(692);
  });

  it("education credits flow through Schedule of Credits lines 15 and 16", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 110000,
        exemptions: 1,
        scholarshipDonations: 900,
        noncharteredSchoolTuition: 2000,
      }),
    );

    expect(result.scheduleOfCredits.line15_scholarshipDonationCredit.toNumber()).toBe(750);
    expect(result.scheduleOfCredits.line16_noncharteredSchoolTuitionCredit.toNumber()).toBe(1500);
    expect(result.scheduleOfCredits.line36_totalSecondBatch.toNumber()).toBe(2250);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(2250);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(397);
  });

  // -------------------------------------------------------------------------
  // Single filer W-2 earner end-to-end
  // -------------------------------------------------------------------------

  it("single filer $50,000 W-2 income with withholding gets refund", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        ohioWithholding: 1200,
      }),
    );
    // No adjustments → Ohio AGI = $50,000
    // MAGI = $50,000 → $2,150 exemption
    // Taxable = $47,850
    // Tax = $342 + 2.75% × ($47,850 - $26,050) = $342 + $599.50 = $941.50 → $942
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(942);
    expect(result.it1040.line13_totalLiability.toNumber()).toBe(942);
    // Withholding $1,200 > liability $942 → overpayment = $258
    expect(result.it1040.line23_overpayment.toNumber()).toBe(258);
    expect(result.it1040.line26_refund.toNumber()).toBe(258);
  });

  it("single filer $75,000 W-2 income owes balance", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 75000,
        exemptions: 1,
        ohioWithholding: 1000,
      }),
    );
    // Tax = $342 + 2.75% × ($72,850 - $26,050) = $342 + $1,287 = $1,629
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1629);
    // Withholding $1,000 < liability $1,629 → tax due = $629
    expect(result.it1040.line20_taxDue.toNumber()).toBe(629);
    expect(result.it1040.line22_totalAmountDue.toNumber()).toBe(629);
    expect(result.it1040.line26_refund.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // MFJ family end-to-end
  // -------------------------------------------------------------------------

  it("MFJ couple $120K income with kids, joint filing credit, EIC", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 120000,
        exemptions: 4,
        federalEarnedIncomeCredit: 0, // too high income for federal EIC
        bothSpousesHaveQualifyingIncome: true,
        ohioWithholding: 3000,
      }),
    );
    // MAGI = 120000, $1,900 × 4 = $7,600 exemptions
    // Taxable = $112,400
    // Tax = $2,394.32 + 3.125% × $12,400 = $2,394.32 + $387.50 = $2,781.82 → $2,782
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(2782);
    // Joint filing credit: MAGI less exemptions = 120000 - 7600 = 112400
    // 112400 > $75,000 → 5% tier, 5% × line11
    // First batch credits: no retirement/senior/exemption (MAGI too high)
    // line11 = $2,782
    // Joint filing: 5% × $2,782 = $139.10 → $139
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(139);
    // Total credits = $139
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(139);
    // Liability after credits = $2,782 - $139 = $2,643
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(2643);
    // Withholding $3,000 > $2,643 → overpayment = $357
    expect(result.it1040.line23_overpayment.toNumber()).toBe(357);
    expect(result.it1040.line26_refund.toNumber()).toBe(357);
  });

  it("MFJ low income family with EIC, credits wipe out tax", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 30000,
        exemptions: 5, // 2 spouses + 3 kids
        federalEarnedIncomeCredit: 6000,
        bothSpousesHaveQualifyingIncome: true,
        ohioWithholding: 500,
      }),
    );
    // MAGI = 30000 ≤ 40000 → $2,400 × 5 = $12,000 exemptions
    // Taxable = max(0, 30000 - 12000) = 18000
    // $18,000 ≤ $26,050 → tax = $0
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
    // All credits are 0 against $0 tax
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(0);
    // Liability = $0, withholding $500 → refund $500
    expect(result.it1040.line23_overpayment.toNumber()).toBe(500);
    expect(result.it1040.line26_refund.toNumber()).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Retiree scenario
  // -------------------------------------------------------------------------

  it("single retiree with Social Security, retirement income, and credits", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 45000,
        exemptions: 1,
        taxableSocialSecurity: 12000,
        retirementIncome: 15000,
        isSenior: true,
        ohioWithholding: 600,
      }),
    );
    // Schedule of Adjustments: deductions = $12,000 (Social Security)
    expect(result.scheduleOfAdjustments.line17_socialSecurityDeduction.toNumber()).toBe(12000);
    expect(result.scheduleOfAdjustments.line36_totalDeductions.toNumber()).toBe(12000);
    // Ohio AGI = 45000 - 12000 = 33000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(33000);
    // MAGI = 33000 (no business deduction) ≤ 40000 → $2,400 exemption
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(2400);
    // Taxable = 33000 - 2400 = 30600
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(30600);
    // Tax = $342 + 2.75% × (30600 - 26050) = $342 + 2.75% × 4550
    //      = $342 + $125.125 = $467.125 → $467
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(467);
    // Credits: MAGI less exemptions = 33000 - 2400 = 30600
    // Retirement credit: $200 (retirement income $15K, MAGI less exemptions < $100K)
    // Senior credit: $50 (MAGI less exemptions < $100K)
    // Exemption credit: $0 (MAGI less exemptions $30,600 >= $30,000)
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(200);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
    expect(result.scheduleOfCredits.line9_exemptionCredit.toNumber()).toBe(0);
    // Total nonrefundable credits = $250
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(250);
    // Liability after credits = $467 - $250 = $217
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(217);
    // Withholding $600 > $217 → overpayment = $383
    expect(result.it1040.line23_overpayment.toNumber()).toBe(383);
    expect(result.it1040.line26_refund.toNumber()).toBe(383);
  });

  // -------------------------------------------------------------------------
  // Business owner scenario
  // -------------------------------------------------------------------------

  it("single business owner $350K income, business split, credits, payments", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 350000,
        qualifyingBusinessIncome: 350000,
        exemptions: 1,
        ohioWithholding: 5000,
        estimatedPayments: 3000,
      }),
    );
    // Business deduction = $250,000, taxable excess = $100,000
    expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toNumber()).toBe(250000);
    expect(result.scheduleOfAdjustments.taxableBusinessIncome.toNumber()).toBe(100000);
    // Ohio AGI = 350000 - 250000 = 100000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(100000);
    // MAGI = 100000 + 250000 = 350000 → $1,900 exemption
    expect(result.it1040.magi.toNumber()).toBe(350000);
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(1900);
    // Taxable = 100000 - 1900 = 98100
    // Line 6 is capped at line 5, so all taxable income is treated as business income.
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(98100);
    expect(result.it1040.line6_taxableBusinessIncome.toNumber()).toBe(98100);
    expect(result.it1040.line7_taxableNonbusinessIncome.toNumber()).toBe(0);
    // Nonbusiness tax = $0
    // Business tax = 98100 × 3% = $2,943
    expect(result.it1040.line8a_nonbusinessTax.toNumber()).toBe(0);
    expect(result.it1040.line8b_businessTax.toNumber()).toBe(2943);
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(2943);
    // Withholding $5,000 + estimated $3,000 = $8,000 > $2,943 → overpayment
    expect(result.it1040.line17_totalPayments.toNumber()).toBe(8000);
  });

  // -------------------------------------------------------------------------
  // 529 contributions
  // -------------------------------------------------------------------------

  it("MFJ family with Ohio 529 contributions", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 90000,
        exemptions: 4,
        ohio529Contributions: [
          { beneficiaryId: "child1", amount: 4000 },
          { beneficiaryId: "child2", amount: 3000 },
        ],
        ohioWithholding: 2500,
      }),
    );
    // 529 deduction = $4,000 + $3,000 = $7,000
    expect(result.scheduleOfAdjustments.line22_ohio529Deduction.toNumber()).toBe(7000);
    // Ohio AGI = 90000 - 7000 = 83000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(83000);
    // MAGI = 83000 (no business deduction) → $1,900 × 4 = $7,600 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(7600);
    // Taxable = 83000 - 7600 = 75400
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(75400);
  });

  it("STABLE contributions flow through Schedule of Adjustments into Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        stableContributions: [
          { beneficiaryId: "beneficiary-1", amount: 4500 },
          { beneficiaryId: "beneficiary-2", amount: 1200 },
        ],
        stableCarryforwards: [
          { beneficiaryId: "beneficiary-2", amount: 3500 },
        ],
      }),
    );

    expect(result.scheduleOfAdjustments.line20_stableDeduction.toNumber()).toBe(8000);
    expect(result.scheduleOfAdjustments.line36_totalDeductions.toNumber()).toBe(8000);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(52000);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(49850);
  });

  it("medical savings account worksheet flows through Schedule of Adjustments into Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        medicalSavingsAccountTaxpayerContributions: 7000,
        medicalSavingsAccountEarnings: 250,
        medicalSavingsAccountNonmedicalWithdrawals: 1200,
      }),
    );

    expect(result.scheduleOfAdjustments.line45_medicalSavingsAccountDeduction.toNumber()).toBe(5053);
    expect(result.scheduleOfAdjustments.line6_medicalSavingsAccountAddBack.toNumber()).toBe(0);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(44947);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(42797);
  });

  it("medical and health care expense worksheet flows through Schedule of Adjustments into Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility: 1200,
        medicalLongTermCareInsurancePremiums: 300,
        medicalInsurancePremiumsDuringMedicareOrEmployerEligibility: 1000,
        medicalCareExpenses: 5000,
      }),
    );

    expect(result.scheduleOfAdjustments.line44_medicalHealthCareExpensesDeduction.toNumber()).toBe(3750);
    expect(result.scheduleOfAdjustments.line47_totalDeductions.toNumber()).toBe(3750);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(46250);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(44100);
  });

  it("qualified organ donor expenses flow through Schedule of Adjustments into Ohio AGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        qualifiedOrganDonorExpenses: [
          { donorId: "taxpayer", amount: 12000 },
        ],
      }),
    );

    expect(result.scheduleOfAdjustments.line46_qualifiedOrganDonorExpenses.toNumber()).toBe(10000);
    expect(result.scheduleOfAdjustments.line47_totalDeductions.toNumber()).toBe(10000);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(40000);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(37600);
  });

  // -------------------------------------------------------------------------
  // Campaign contribution credit
  // -------------------------------------------------------------------------

  it("MFJ filer with campaign contributions gets credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 80000,
        exemptions: 2,
        campaignContributions: 75,
        ohioWithholding: 2000,
      }),
    );
    // Campaign credit: MFJ max $100, contributions $75 → $75
    expect(result.scheduleOfCredits.line8_campaignContributionCredit.toNumber()).toBe(75);
  });

  // -------------------------------------------------------------------------
  // Credits capped at tax liability
  // -------------------------------------------------------------------------

  it("credits cannot exceed tax liability", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 28000,
        exemptions: 1,
        retirementIncome: 15000,
        isSenior: true,
        federalEarnedIncomeCredit: 5000,
      }),
    );
    // MAGI ≤ 40000 → $2,400 exemption
    // Taxable = 28000 - 2400 = 25600 ≤ $26,050 → tax = $0
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
    // All credits capped at $0
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // MFS business owner
  // -------------------------------------------------------------------------

  it("MFS business owner gets half the business income deduction threshold", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_separately",
        federalAgi: 200000,
        qualifyingBusinessIncome: 200000,
        exemptions: 1,
      }),
    );
    // MFS threshold = $125,000
    expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toNumber()).toBe(125000);
    expect(result.scheduleOfAdjustments.taxableBusinessIncome.toNumber()).toBe(75000);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(73100);
    expect(result.it1040.line6_taxableBusinessIncome.toNumber()).toBe(73100);
  });

  // -------------------------------------------------------------------------
  // Carryforward and donations
  // -------------------------------------------------------------------------

  it("overpayment split between carryforward, donations, and refund", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        ohioWithholding: 1800,
        creditCarryforward: 200,
        donations: 100,
      }),
    );
    // Tax = $942, withholding $1,800 → overpayment = $858
    expect(result.it1040.line23_overpayment.toNumber()).toBe(858);
    expect(result.it1040.line24_creditCarryforward.toNumber()).toBe(200);
    expect(result.it1040.line25_donations.toNumber()).toBe(100);
    // Refund = $858 - $200 - $100 = $558
    expect(result.it1040.line26_refund.toNumber()).toBe(558);
  });

  // -------------------------------------------------------------------------
  // High income — zero exemptions
  // -------------------------------------------------------------------------

  it("high income $750K+ gets zero exemptions", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 800000,
        exemptions: 4,
        ohioWithholding: 25000,
      }),
    );
    // MAGI = 800000 ≥ 750000 → $0 exemptions
    expect(result.it1040.line4_exemptions.toNumber()).toBe(0);
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(800000);
  });

  // -------------------------------------------------------------------------
  // Military retiree
  // -------------------------------------------------------------------------

  it("military retiree with deductions and credits", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 80000,
        exemptions: 2,
        uniformedServicesRetirement: 30000,
        taxableSocialSecurity: 8000,
        isSenior: true,
        retirementIncome: 5000, // non-military retirement income
        ohioWithholding: 1000,
      }),
    );
    // Deductions: $30,000 (uniformed) + $8,000 (SS) = $38,000
    expect(result.scheduleOfAdjustments.line36_totalDeductions.toNumber()).toBe(38000);
    // Ohio AGI = 80000 - 38000 = 42000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(42000);
    // MAGI = 42000 → $2,150 × 2 = $4,300 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(4300);
    // Taxable = 42000 - 4300 = 37700
    // Tax = $342 + 2.75% × (37700 - 26050) = $342 + $320.375 = $662.375 → $662
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(662);
    // Credits: retirement $80 ($5K in $3,001-$5,000 tier), senior $50
    // MAGI less exemptions = 42000 - 4300 = 37700 (< 100000)
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(80);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Displaced worker credit
  // -------------------------------------------------------------------------

  it("displaced worker training credit flows through the orchestrator", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        displacedWorkerExpenses: 1200,
        ohioWithholding: 1500,
      }),
    );
    // 50% × $1,200 = $600, capped at $500
    expect(result.scheduleOfCredits.line7_displacedWorkerCredit.toNumber()).toBe(500);
    // Verify credit reduces tax
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBeGreaterThanOrEqual(500);
  });

  it("displaced worker worksheet inputs flow through the orchestrator", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 60000,
        exemptions: 2,
        displacedWorkerRecipients: [
          { expenses: 1200, priorYearCredit: 0 },
          { expenses: 800, priorYearCredit: 0 },
        ],
        ohioWithholding: 1500,
      }),
    );

    expect(result.scheduleOfCredits.line7_displacedWorkerCredit.toNumber()).toBe(900);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(900);
  });

  // -------------------------------------------------------------------------
  // Resident credit for taxes paid to another state
  // -------------------------------------------------------------------------

  it("resident credit pass-through for taxes paid to another state", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 100000,
        exemptions: 1,
        residentCredit: 800,
        ohioWithholding: 2000,
      }),
    );
    // Resident credit appears in nonrefundable credits
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(800);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(800);
    // Pass-through: residentCredit result is null (not computed)
    expect(result.residentCredit).toBeNull();
  });

  it("computed resident credit from otherStateTaxes flows to Schedule of Credits", () => {
    // Ohio resident with noncompensation income taxed by KY.
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 65000,
        exemptions: 1,
        ohioWithholding: 1500,
        otherStateTaxes: [
          { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 65000, taxPaid: 2600 },
        ],
      }),
    );
    // Ohio AGI = $65,000, MAGI = $65,000, exemption = $2,150
    // Taxable = $62,850
    // Tax = $342 + 2.75% × ($62,850 - $26,050) = $342 + $1,012 = $1,354
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1354);
    // Resident credit: fraction = 65000/65000 = 1.0
    // Ohio tax portion = 1.0 × $1,354 = $1,354
    // KY tax paid = $2,600
    // Credit = min($1,354, $2,600) = $1,354
    expect(result.residentCredit).not.toBeNull();
    expect(result.residentCredit!.totalResidentCredit.toNumber()).toBe(1354);
    // Credit flows to Schedule of Credits → IT 1040
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(1354);
    // Tax after credits = $0
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  it("computed resident credit partial income in another state", () => {
    // Ohio resident, $30K of $80K of noncompensation income taxed by PA
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        ohioWithholding: 2000,
        otherStateTaxes: [
          { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 921 },
        ],
      }),
    );
    // Ohio AGI = $80,000, MAGI = $80,000, exemption $2,150
    // Taxable = $77,850
    // Tax = $342 + 2.75% × ($77,850 - $26,050) = $342 + $1,424.50 = $1,766.50 → $1,767
    // Wait, let me recalculate: $77,850 - $26,050 = $51,800
    // $51,800 × 0.0275 = $1,424.50
    // $342 + $1,424.50 = $1,766.50 → rounds to $1,767
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1767);
    // Fraction: 30000/80000 = 0.375
    // Ohio portion: 0.375 × $1,767 = $662.625 → $663
    // Credit: min($663, $921) = $663
    expect(result.residentCredit).not.toBeNull();
    expect(result.residentCredit!.stateDetails[0]!.credit.toNumber()).toBe(663);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(663);
  });

  it("pass-through residentCredit overrides otherStateTaxes computation", () => {
    // When residentCredit is explicitly provided, otherStateTaxes is ignored
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        residentCredit: 500,
        otherStateTaxes: [
          { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 80000, taxPaid: 3200 },
        ],
      }),
    );
    // Pass-through takes precedence — computed credit is null
    expect(result.residentCredit).toBeNull();
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(500);
  });

  it("resident credit audit trail in combined lines", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        otherStateTaxes: [
          { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 921 },
        ],
      }),
    );
    const forms = new Set(result.lines.map((l) => l.form));
    expect(forms.has("OH-RESIDENT-CREDIT")).toBe(true);
  });

  it("resident credit is limited by tax remaining after earlier credits", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 75000,
        exemptions: 1,
        retirementIncome: 10000,
        isSenior: true,
        otherStateTaxes: [
          { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 75000, taxPaid: 5000 },
        ],
      }),
    );

    // Tax before credits = $1,629, first-batch credits = $250, so only $1,379 remains for line 39.
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1629);
    expect(result.scheduleOfCredits.line10_totalFirstBatch.toNumber()).toBe(250);
    expect(result.scheduleOfCredits.line37_taxLessAllCredits.toNumber()).toBe(1379);
    expect(result.scheduleOfCredits.line39_residentCredit.toNumber()).toBe(1379);
    expect(result.residentCredit).not.toBeNull();
    expect(result.residentCredit!.totalResidentCredit.toNumber()).toBe(1379);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(1629);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Combined audit trail
  // -------------------------------------------------------------------------

  it("combined audit trail includes lines from all three modules", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        nonOhioStateLocalInterest: 500,
      }),
    );
    const forms = new Set(result.lines.map((l) => l.form));
    expect(forms.has("OH-SCHEDULE-ADJ")).toBe(true);
    expect(forms.has("OH-SCHEDULE-CREDITS")).toBe(true);
    expect(forms.has("OH-IT-1040")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Edge case: zero income
  // -------------------------------------------------------------------------

  it("zero income produces zero tax and zero liability", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 0,
        exemptions: 1,
      }),
    );
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
    expect(result.it1040.line13_totalLiability.toNumber()).toBe(0);
    expect(result.it1040.line20_taxDue.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Edge case: negative Ohio AGI
  // -------------------------------------------------------------------------

  it("large deductions produce negative Ohio AGI but zero taxable income", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 20000,
        exemptions: 1,
        taxableSocialSecurity: 25000, // more than federal AGI
      }),
    );
    // Ohio AGI = 20000 - 25000 = -5000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(-5000);
    // Taxable income floors at 0
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(0);
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Exemption credit edge: MAGI less exemptions just below $30,000
  // -------------------------------------------------------------------------

  it("exemption credit available when MAGI less exemptions just under $30,000", () => {
    // We need MAGI - exemptions < 30000
    // MAGI ≤ 40000 → $2,400 per exemption, 2 exemptions → $4,800
    // Need MAGI - 4800 < 30000 → MAGI < 34800
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 34000,
        exemptions: 2,
      }),
    );
    // MAGI = 34000, exemptions = $2,400 × 2 = $4,800
    // MAGI less exemptions = 34000 - 4800 = 29200 < 30000 ✓
    expect(result.scheduleOfCredits.line9_exemptionCredit.toNumber()).toBe(40); // $20 × 2
  });

  it("line-specific second-batch credits flow through Schedule of Credits and IT 1040", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 85000,
        exemptions: 1,
        workBasedLearningExperienceCredit: 125,
        nonrefundableHistoricPreservationCredit: 250,
        ohioLowIncomeHousingCredit: 75,
      }),
    );

    expect(result.scheduleOfCredits.line17_workBasedLearningExperienceCredit.toNumber()).toBe(125);
    expect(result.scheduleOfCredits.line33_nonrefundableHistoricPreservationCredit.toNumber()).toBe(250);
    expect(result.scheduleOfCredits.line34_ohioLowIncomeHousingCredit.toNumber()).toBe(75);
    expect(result.scheduleOfCredits.line36_totalSecondBatch.toNumber()).toBe(450);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(450);
  });

  // -------------------------------------------------------------------------
  // Full complex scenario
  // -------------------------------------------------------------------------

  it("complex MFJ return: adjustments, credits, withholding, overpayment", () => {
    const result = calculateOhioResidentReturn({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 95000,
      exemptions: 4, // 2 + 2 kids
      nonOhioStateLocalInterest: 800,
      taxableSocialSecurity: 0,
      federalInterestExemptFromOhio: 1200,
      ohio529Contributions: [
        { beneficiaryId: "child1", amount: 4000 },
        { beneficiaryId: "child2", amount: 4000 },
      ],
      retirementIncome: 0,
      isSenior: false,
      federalEarnedIncomeCredit: 0,
      bothSpousesHaveQualifyingIncome: true,
      campaignContributions: 60,
      ohioWithholding: 2800,
    });

    // Additions: $800 (non-Ohio interest)
    expect(result.scheduleOfAdjustments.line14_totalAdditions.toNumber()).toBe(800);
    // Deductions: $1,200 (fed interest) + $8,000 (529) = $9,200
    expect(result.scheduleOfAdjustments.line22_ohio529Deduction.toNumber()).toBe(8000);
    expect(result.scheduleOfAdjustments.line36_totalDeductions.toNumber()).toBe(9200);

    // Ohio AGI = 95000 + 800 - 9200 = 86600
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(86600);
    // MAGI = 86600 → $1,900 × 4 = $7,600 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(7600);
    // Taxable = 86600 - 7600 = 79000
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(79000);
    // Tax = $342 + 2.75% × (79000 - 26050) = $342 + $1,456.125 = $1,798.125 → $1,798
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1798);

    // Credits:
    // Campaign: MFJ max $100, $60 contributed → $60
    expect(result.scheduleOfCredits.line8_campaignContributionCredit.toNumber()).toBe(60);
    // No retirement/senior/exemption credits (MAGI less exemptions = 79000 > 30000)
    // First batch = $60
    // Line 11 = $1,798 - $60 = $1,738
    expect(result.scheduleOfCredits.line11_taxLessFirstBatch.toNumber()).toBe(1738);
    // Joint filing: MAGI less exemptions = 79000 → 5% tier (> 75000)
    // 5% × $1,738 = $86.90 → $87
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(87);
    // Total credits = $60 + $87 = $147
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(147);

    // Tax after credits = $1,798 - $147 = $1,651
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(1651);
    // Withholding $2,800 > $1,651 → overpayment = $1,149
    expect(result.it1040.line23_overpayment.toNumber()).toBe(1149);
    expect(result.it1040.line26_refund.toNumber()).toBe(1149);
  });

  // -------------------------------------------------------------------------
  // SD 100 integration
  // -------------------------------------------------------------------------

  it("sd100 is null when no school districts provided", () => {
    const result = calculateOhioResidentReturn(
      makeInput({ federalAgi: 50000, exemptions: 1 }),
    );
    expect(result.sd100).toBeNull();
  });

  it("sd100 is null when schoolDistricts is empty array", () => {
    const result = calculateOhioResidentReturn(
      makeInput({ federalAgi: 50000, exemptions: 1, schoolDistricts: [] }),
    );
    expect(result.sd100).toBeNull();
  });

  it("W-2 earner in traditional school district — SD 100 wired from IT 1040 values", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        ohioWithholding: 1200,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
        sdWithholding: 500,
      }),
    );
    // IT 1040: Ohio AGI = $60,000, MAGI = $60,000 → $2,150 exemption
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(60000);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(2150);

    // SD 100 should use IT 1040 values
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line1_ohioAgi.toNumber()).toBe(60000);
    expect(result.sd100!.line4_exemptions.toNumber()).toBe(2150);
    // MAGI = 60000 (no business deduction), MAGI-exemptions = 57850
    expect(result.sd100!.line3_magi.toNumber()).toBe(60000);
    expect(result.sd100!.line5_magiLessExemptions.toNumber()).toBe(57850);
    // Traditional tax: 57850 × 1.5% = 867.75 → 868
    expect(result.sd100!.line6_traditionalTax.toNumber()).toBe(868);
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(868);
    // SD payments: withholding $500 < $868 → tax due $368
    expect(result.sd100!.line16_taxDue.toNumber()).toBe(368);
  });

  it("MFJ earner in earned income school district with SD withholding and refund", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 80000,
        exemptions: 4,
        ohioWithholding: 2500,
        schoolDistricts: [
          {
            districtNumber: "0404",
            taxType: "earned_income" as const,
            rate: "0.0125",
            wages: 75000,
            netSelfEmployment: 0,
          },
        ],
        sdWithholding: 1100,
      }),
    );
    // IT 1040: Ohio AGI = 80000
    // MAGI = 80000 ≤ $80,000 → $2,150 × 4 = $8,600 exemptions
    expect(result.it1040.line4_exemptions.toNumber()).toBe(8600);

    // SD 100: MAGI = 80000, earned = min(75000, 80000) = 75000
    // Tax = 75000 × 1.25% = 937.50 → 938
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line7_earnedIncomeTax.toNumber()).toBe(938);
    // Withholding $1,100 > $938 → overpayment $162
    expect(result.sd100!.line19_overpayment.toNumber()).toBe(162);
    expect(result.sd100!.line21_refund.toNumber()).toBe(162);
  });

  it("business owner — business income deduction flows to SD 100 MAGI", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 350000,
        qualifyingBusinessIncome: 350000,
        exemptions: 1,
        ohioWithholding: 5000,
        estimatedPayments: 3000,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
      }),
    );
    // Business deduction = $250,000, Ohio AGI = 100000
    // MAGI for SD 100 = Ohio AGI + business deduction = 100000 + 250000 = 350000
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line1_ohioAgi.toNumber()).toBe(100000);
    expect(result.sd100!.line2_businessIncomeDeduction.toNumber()).toBe(250000);
    expect(result.sd100!.line3_magi.toNumber()).toBe(350000);
    // Exemptions: MAGI $350,000 → $1,900
    expect(result.sd100!.line4_exemptions.toNumber()).toBe(1900);
    // MAGI - exemptions = 348100
    expect(result.sd100!.line5_magiLessExemptions.toNumber()).toBe(348100);
    // Tax = 348100 × 1.5% = 5221.50 → 5222
    expect(result.sd100!.districtDetails[0]!.grossTax.toNumber()).toBe(5222);
  });

  it("senior in traditional school district gets $50 SD credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        isSenior: true,
        retirementIncome: 10000,
        schoolDistricts: [
          {
            districtNumber: "3122",
            taxType: "traditional" as const,
            rate: "0.0125",
          },
        ],
        sdWithholding: 700,
      }),
    );
    expect(result.sd100).not.toBeNull();
    // Senior credit applies to SD 100
    expect(result.sd100!.districtDetails[0]!.seniorCredit.toNumber()).toBe(50);
    // Also verify IT 1040 senior + retirement credits
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(200);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
  });

  it("SD 100 with payments: carryforward and late interest", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        ohioWithholding: 1200,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
        sdWithholding: 1000,
        sdCreditCarryforward: 50,
      }),
    );
    expect(result.sd100).not.toBeNull();
    // Tax = 868 (from earlier test), withholding $1,000
    // Overpayment = 1000 - 868 = 132
    expect(result.sd100!.line19_overpayment.toNumber()).toBe(132);
    // Carryforward $50 out of $132
    expect(result.sd100!.line20_creditCarryforward.toNumber()).toBe(50);
    // Refund = 132 - 50 = 82
    expect(result.sd100!.line21_refund.toNumber()).toBe(82);
  });

  // -------------------------------------------------------------------------
  // IT/SD 2210 integration — underpayment penalty auto-computation
  // -------------------------------------------------------------------------

  it("itsd2210 is null when computeUnderpaymentPenalty is false (default)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({ federalAgi: 60000, exemptions: 1, ohioWithholding: 500 }),
    );
    expect(result.itsd2210).toBeNull();
  });

  it("itsd2210 result is returned when computeUnderpaymentPenalty is true", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        ohioWithholding: 200,
        computeUnderpaymentPenalty: true,
        priorYearTaxLiability: 0,
      }),
    );
    // Should compute and return itsd2210
    expect(result.itsd2210).not.toBeNull();
    expect(result.itsd2210!.line17_totalPenalty).toBeDefined();
    // Penalty should flow to IT 1040 line 11
    expect(result.it1040.line11_underpaymentPenalty.toNumber()).toBe(
      result.itsd2210!.line17_totalPenalty.toNumber(),
    );
  });

  it("itsd2210 penalty is zero when safe harbor C met (liability - withholding <= $500)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 28000,
        exemptions: 1,
        ohioWithholding: 0,
        computeUnderpaymentPenalty: true,
      }),
    );
    // Taxable = 28000 - 2400 = 25600 ≤ $26,050 → tax = $0
    // Liability - withholding = $0 ≤ $500 → safe harbor C
    expect(result.itsd2210).not.toBeNull();
    expect(result.itsd2210!.line17_totalPenalty.toNumber()).toBe(0);
    expect(result.it1040.line11_underpaymentPenalty.toNumber()).toBe(0);
  });

  it("itsd2210 penalty is zero when safe harbor B met (paid >= 100% prior year)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        ohioWithholding: 1500,
        computeUnderpaymentPenalty: true,
        priorYearTaxLiability: 1400,
        priorYearTimelyFiled: true,
      }),
    );
    // Tax = $1,767, withholding $1,500
    // Withholding $1,500 >= 100% × $1,400 prior year → safe harbor B
    expect(result.itsd2210).not.toBeNull();
    expect(result.itsd2210!.line17_totalPenalty.toNumber()).toBe(0);
  });

  it("itsd2210 audit trail included in combined lines", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        ohioWithholding: 200,
        computeUnderpaymentPenalty: true,
        priorYearTaxLiability: 0,
      }),
    );
    const forms = new Set(result.lines.map((l) => l.form));
    expect(forms.has("OH-IT/SD-2210")).toBe(true);
  });

  it("pass-through underpaymentPenalty skips itsd2210 computation", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 1,
        ohioWithholding: 200,
        underpaymentPenalty: 50,
        computeUnderpaymentPenalty: true,
      }),
    );
    // When underpaymentPenalty is explicitly set, itsd2210 is not computed
    expect(result.itsd2210).toBeNull();
    expect(result.it1040.line11_underpaymentPenalty.toNumber()).toBe(50);
  });

  // -------------------------------------------------------------------------
  // HOH filing status end-to-end
  // -------------------------------------------------------------------------

  it("HOH filer $65K income — standard computation, no joint filing credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "head_of_household",
        federalAgi: 65000,
        exemptions: 2, // taxpayer + 1 dependent
        federalEarnedIncomeCredit: 1000,
        bothSpousesHaveQualifyingIncome: false,
        ohioWithholding: 1200,
      }),
    );
    // MAGI = 65000 → $2,150 × 2 = $4,300 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(4300);
    // Taxable = 65000 - 4300 = 60700
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(60700);
    // Tax = $342 + 2.75% × (60700 - 26050) = $342 + $952.875 = $1,294.875 → $1,295
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1295);
    // Joint filing credit = $0 (HOH, not MFJ)
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(0);
    // EIC: 30% × $1,000 = $300
    expect(result.scheduleOfCredits.line13_earnedIncomeCredit.toNumber()).toBe(300);
    // Total credits = $300
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(300);
    // Tax after credits = $1,295 - $300 = $995
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(995);
    // Withholding $1,200 > $995 → overpayment $205
    expect(result.it1040.line23_overpayment.toNumber()).toBe(205);
  });

  it("explicit spouse qualifying income controls joint filing credit eligibility", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 70000,
        exemptions: 2,
        bothSpousesHaveQualifyingIncome: true,
        primaryQualifyingIncome: 1200,
        spouseQualifyingIncome: 300,
      }),
    );

    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(0);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(0);
  });

  it("HOH filer with business income, retirement, and senior status", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "head_of_household",
        federalAgi: 120000,
        exemptions: 3,
        qualifyingBusinessIncome: 50000,
        retirementIncome: 8000,
        isSenior: true,
        ohioWithholding: 2500,
      }),
    );
    // Business deduction = $50,000 (under $250K threshold — same for HOH as single)
    expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toNumber()).toBe(50000);
    expect(result.scheduleOfAdjustments.taxableBusinessIncome.toNumber()).toBe(0);
    // Ohio AGI = 120000 - 50000 = 70000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(70000);
    // MAGI = 70000 + 50000 = 120000 → $1,900 × 3 = $5,700 exemption
    expect(result.it1040.magi.toNumber()).toBe(120000);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(5700);
    // Taxable = 70000 - 5700 = 64300, no business excess (all within deduction)
    // All nonbusiness: $342 + 2.75% × (64300 - 26050) = $342 + $1,051.875 = $1,393.875 → $1,394
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1394);
    // MAGI less exemptions = 120000 - 5700 = 114300 (< $100K? No, > $100K)
    // Retirement credit: $0 (MAGI less exemptions ≥ $100K)
    // Senior credit: $0 (MAGI less exemptions ≥ $100K)
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(0);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(0);
    // Joint filing credit = $0 (HOH)
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // QSS filing status end-to-end
  // -------------------------------------------------------------------------

  it("QSS filer $55K income — treated like single, no joint filing credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "qualifying_surviving_spouse",
        federalAgi: 55000,
        exemptions: 2, // taxpayer + 1 dependent
        ohioWithholding: 1100,
      }),
    );
    // MAGI = 55000 → $2,150 × 2 = $4,300 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(4300);
    // Taxable = 55000 - 4300 = 50700
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(50700);
    // Tax = $342 + 2.75% × (50700 - 26050) = $342 + $677.875 = $1,019.875 → $1,020
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1020);
    // Joint filing credit = $0 (QSS, not MFJ)
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(0);
    // Withholding $1,100 > $1,020 → overpayment $80
    expect(result.it1040.line23_overpayment.toNumber()).toBe(80);
    expect(result.it1040.line26_refund.toNumber()).toBe(80);
  });

  it("QSS filer with school district and retirement credits", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "qualifying_surviving_spouse",
        federalAgi: 40000,
        exemptions: 2,
        retirementIncome: 6000,
        isSenior: true,
        ohioWithholding: 500,
        schoolDistricts: [
          {
            districtNumber: "3122",
            taxType: "traditional" as const,
            rate: "0.0125",
          },
        ],
        sdWithholding: 400,
      }),
    );
    // MAGI = 40000 ≤ 40000 → $2,400 × 2 = $4,800 exemption
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(2400);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(4800);
    // Taxable = 40000 - 4800 = 35200
    // Tax = $342 + 2.75% × (35200 - 26050) = $342 + $251.625 = $593.625 → $594
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(594);
    // MAGI less exemptions = 40000 - 4800 = 35200
    // Retirement credit: $130 ($6K → tier $5,001-$8,000, < $100K)
    // Senior credit: $50 (< $100K)
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(130);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
    // Credits = $180
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(180);
    // Tax after credits = $594 - $180 = $414
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(414);
    // SD 100: MAGI - exemptions = 35200, tax = 35200 × 1.25% = 440
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(390); // 440 - 50 senior
  });

  // -------------------------------------------------------------------------
  // MAGI boundary tests — exactly $750,000
  // -------------------------------------------------------------------------

  it("MAGI exactly $750,000 — zero exemptions, zero MAGI-dependent credits", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 750000,
        exemptions: 4,
        retirementIncome: 20000,
        isSenior: true,
        federalEarnedIncomeCredit: 0,
        bothSpousesHaveQualifyingIncome: true,
        ohioWithholding: 25000,
      }),
    );
    // MAGI = $750,000 ≥ $750,000 → $0 per exemption
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(0);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(0);
    // Taxable = $750,000
    // Tax = $2,394.32 + 3.125% × (750000 - 100000) = $2,394.32 + $20,312.50 = $22,706.82 → $22,707
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(22707);
    // MAGI less exemptions = $750,000
    // Retirement credit: $0 (MAGI less exemptions ≥ $100,000)
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(0);
    // Senior credit: $0 (MAGI less exemptions ≥ $100,000)
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(0);
    // Exemption credit: $0 (MAGI less exemptions ≥ $30,000)
    expect(result.scheduleOfCredits.line9_exemptionCredit.toNumber()).toBe(0);
    // Joint filing credit: $0 (MAGI less exemptions ≥ $750,000)
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  it("MAGI $749,999 — gets exemptions and joint filing credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 749999,
        exemptions: 2,
        bothSpousesHaveQualifyingIncome: true,
        ohioWithholding: 25000,
      }),
    );
    // MAGI = $749,999 < $750,000 → $1,900 per exemption
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(1900);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(3800);
    // MAGI less exemptions = 749999 - 3800 = 746199
    // Joint filing credit: MAGI less exemptions < $750,000 → eligible, 5% tier (> $75,000)
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Credit cap — stacked credits exceed tax
  // -------------------------------------------------------------------------

  it("resident credit + other credits exceeding tax are capped at tax", () => {
    // Scenario: low tax, big resident credit → credits capped at tax
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 30000,
        exemptions: 1,
        retirementIncome: 10000,
        isSenior: true,
        ohioWithholding: 500,
        otherStateTaxes: [
          { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 2000 },
        ],
      }),
    );
    // MAGI ≤ 40000 → $2,400 exemption
    // Taxable = 30000 - 2400 = 27600
    // Tax = $342 + 2.75% × (27600 - 26050) = $342 + $42.625 = $384.625 → $385
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(385);
    // First-batch credits use $270 of the $385 tax ($200 retirement + $50 senior + $20 exemption),
    // so only $115 remains for line 39.
    // Resident credit: fraction = 30000/30000 = 1.0, Ohio portion = $115
    // KY paid $2,000, credit = min($115, $2,000) = $115
    expect(result.residentCredit).not.toBeNull();
    expect(result.residentCredit!.totalResidentCredit.toNumber()).toBe(115);
    // $270 of first-batch credits plus $115 of resident credit fully absorb the $385 tax.
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(385);
    // Tax after credits = $0
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  it("MFJ joint filing + EIC + resident credit stacking capped at tax", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 35000,
        exemptions: 4,
        federalEarnedIncomeCredit: 5000,
        bothSpousesHaveQualifyingIncome: true,
        ohioWithholding: 800,
        otherStateTaxes: [
          { stateCode: "IN", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 600 },
        ],
      }),
    );
    // MAGI ≤ 40000 → $2,400 × 4 = $9,600 exemption
    // Taxable = max(0, 35000 - 9600) = 25400 ≤ $26,050 → tax = $0
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
    // All credits capped at $0 (even though large EIC + resident credit)
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(0);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  it("lump sum distribution worksheet credit flows through and suppresses senior credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 30000,
        exemptions: 1,
        isSenior: true,
        lumpSumDistributionRecipientAges: [70],
      }),
    );

    expect(result.it1040.line8c_totalTax.toNumber()).toBe(385);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(0);
    expect(result.scheduleOfCredits.line5_lumpSumDistributionCredit.toNumber()).toBe(800);
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(385);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  it("lump sum retirement worksheet credit flows through and suppresses retirement income credit", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 30000,
        exemptions: 1,
        retirementIncome: 10000,
        lumpSumRetirementRecipients: [{ age: 65, retirementIncome: 40000 }],
      }),
    );

    expect(result.it1040.line8c_totalTax.toNumber()).toBe(385);
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(0);
    expect(result.scheduleOfCredits.line3_lumpSumRetirementCredit.toNumber()).toBe(1000);
    expect(
      result.scheduleOfCredits.lumpSumRetirementWorksheet?.line10_futureYearCredit.toNumber(),
    ).toBe(32.36842105263158);
    expect(result.scheduleOfCredits.line40_totalNonrefundableCredits.toNumber()).toBe(385);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Exemption credit boundary — MAGI less exemptions exactly $30,000
  // -------------------------------------------------------------------------

  it("exemption credit is zero when MAGI less exemptions exactly $30,000", () => {
    // Need MAGI - exemptions = 30000 exactly
    // Use single filer: MAGI ≤ 40000 → $2,400 exemption
    // MAGI - 2400 = 30000 → MAGI = 32400
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 32400,
        exemptions: 1,
      }),
    );
    // MAGI = 32400, exemption = $2,400
    // MAGI less exemptions = 30000
    // Spec says exemption credit requires MAGI less exemptions < $30,000
    expect(result.scheduleOfCredits.line9_exemptionCredit.toNumber()).toBe(0);
  });

  it("exemption credit is $20 when MAGI less exemptions is $29,999", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 32399,
        exemptions: 1,
      }),
    );
    // MAGI = 32399, exemption = $2,400
    // MAGI less exemptions = 29999 < 30000 ✓
    expect(result.scheduleOfCredits.line9_exemptionCredit.toNumber()).toBe(20);
  });

  // -------------------------------------------------------------------------
  // Negative Ohio AGI flowing through credits and SD 100
  // -------------------------------------------------------------------------

  it("negative Ohio AGI produces zero credits and zero SD tax", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 10000,
        exemptions: 2,
        taxableSocialSecurity: 20000,
        retirementIncome: 5000,
        isSenior: true,
        schoolDistricts: [
          {
            districtNumber: "3122",
            taxType: "traditional" as const,
            rate: "0.0125",
          },
        ],
      }),
    );
    // Ohio AGI = 10000 - 20000 = -10000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(-10000);
    // Tax = $0
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(0);
    // All credits = $0 (nothing to offset)
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(0);
    // SD 100: MAGI = -10000, MAGI - exemptions ≤ 0 → SD tax = $0
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(0);
  });

  it("SD 100 audit trail included in combined lines", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
      }),
    );
    const forms = new Set(result.lines.map((l) => l.form));
    expect(forms.has("OH-SCHEDULE-ADJ")).toBe(true);
    expect(forms.has("OH-SCHEDULE-CREDITS")).toBe(true);
    expect(forms.has("OH-IT-1040")).toBe(true);
    expect(forms.has("OH-SD-100")).toBe(true);
  });

  it("part-year resident in two school districts", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 80000,
        exemptions: 2,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
            residencyFactor: "0.5",
          },
          {
            districtNumber: "0404",
            taxType: "earned_income" as const,
            rate: "0.0125",
            wages: 75000,
            netSelfEmployment: 0,
            residencyFactor: "0.5",
          },
        ],
        sdWithholding: 800,
      }),
    );
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.districtDetails).toHaveLength(2);
    // Traditional district: MAGI-exemptions = 80000 - 4300 = 75700, prorated = 37850
    // Tax = 37850 × 1.5% = 567.75 → 568
    expect(result.sd100!.districtDetails[0]!.taxAfterCredits.toNumber()).toBe(568);
    // Earned income district: wages = 75000, MAGI = 80000 prorated = 40000
    // Earned = min(75000, 40000) = 40000, tax = 40000 × 1.25% = 500
    expect(result.sd100!.districtDetails[1]!.taxAfterCredits.toNumber()).toBe(500);
    // Total SD = 568 + 500 = 1068
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(1068);
  });

  it("full return with IT 1040 + SD 100: complete Ohio filing", () => {
    const result = calculateOhioResidentReturn({
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      federalAgi: 95000,
      exemptions: 4,
      // Adjustments
      nonOhioStateLocalInterest: 800,
      federalInterestExemptFromOhio: 1200,
      ohio529Contributions: [
        { beneficiaryId: "child1", amount: 4000 },
        { beneficiaryId: "child2", amount: 4000 },
      ],
      // Credits
      bothSpousesHaveQualifyingIncome: true,
      campaignContributions: 60,
      // IT 1040 payments
      ohioWithholding: 2800,
      // School district
      schoolDistricts: [
        {
          districtNumber: "3122",
          taxType: "traditional" as const,
          rate: "0.0125",
        },
      ],
      sdWithholding: 1200,
    });

    // IT 1040 results (from existing complex test):
    // Ohio AGI = 95000 + 800 - 9200 = 86600
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(86600);
    // Tax = $1,798, credits = $147, liability = $1,651
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1798);
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(147);
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(1651);
    // IT 1040 refund = $2,800 - $1,651 = $1,149
    expect(result.it1040.line26_refund.toNumber()).toBe(1149);

    // SD 100 results:
    // Ohio AGI = 86600, MAGI = 86600 (no business deduction)
    // Exemptions = $1,900 × 4 = $7,600
    // MAGI - exemptions = 86600 - 7600 = 79000
    // Traditional tax = 79000 × 1.25% = 987.50 → 988
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line3_magi.toNumber()).toBe(86600);
    expect(result.sd100!.line5_magiLessExemptions.toNumber()).toBe(79000);
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(988);
    // SD withholding $1,200 > $988 → overpayment $212
    expect(result.sd100!.line19_overpayment.toNumber()).toBe(212);
    expect(result.sd100!.line21_refund.toNumber()).toBe(212);
  });

  // -------------------------------------------------------------------------
  // 2024 tax year backward compatibility
  // -------------------------------------------------------------------------

  it("2024 single filer $50K — uses 2024 brackets ($360.69 base, 2.75% rate)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        taxYear: 2024,
        federalAgi: 50000,
        exemptions: 1,
        ohioWithholding: 1200,
      }),
    );
    // MAGI = 50000 ≤ 80000 → $2,150 exemption
    expect(result.it1040.line4_exemptions.toNumber()).toBe(2150);
    // Taxable = 50000 - 2150 = 47850
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(47850);
    // 2024 tax = $360.69 + 2.75% × (47850 - 26050) = $360.69 + $599.50 = $960.19 → $960
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(960);
    // Withholding $1,200 > $960 → refund $240
    expect(result.it1040.line23_overpayment.toNumber()).toBe(240);
    expect(result.it1040.line26_refund.toNumber()).toBe(240);
  });

  it("2024 single filer $150K — uses 2024 top rate (3.50% vs 3.125%)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        taxYear: 2024,
        federalAgi: 150000,
        exemptions: 1,
        ohioWithholding: 4500,
      }),
    );
    // MAGI = 150000 → $1,900 exemption
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(1900);
    // Taxable = 150000 - 1900 = 148100
    expect(result.it1040.line5_ohioTaxableIncome.toNumber()).toBe(148100);
    // 2024: $2,394.32 + 3.50% × (148100 - 100000) = $2,394.32 + $1,683.50 = $4,077.82 → $4,078
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(4078);
    // Compare: 2025 would be $2,394.32 + 3.125% × $48,100 = $3,897
    // So 2024 tax is $181 higher than 2025 for same income
  });

  it("2024 MFJ with credits — full flow through all modules at 2024 rates", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        taxYear: 2024,
        filingStatus: "married_filing_jointly",
        federalAgi: 85000,
        exemptions: 3,
        retirementIncome: 5000,
        isSenior: true,
        bothSpousesHaveQualifyingIncome: true,
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 3000 }],
        ohioWithholding: 2000,
      }),
    );
    // Deductions: 529 = $3,000
    expect(result.scheduleOfAdjustments.line22_ohio529Deduction.toNumber()).toBe(3000);
    // Ohio AGI = 85000 - 3000 = 82000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(82000);
    // MAGI = 82000 > $80,000 → $1,900 per exemption × 3 = $5,700
    expect(result.it1040.exemptionAmountPerPerson.toNumber()).toBe(1900);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(5700);
    // Taxable = 82000 - 5700 = 76300
    // 2024 tax = $360.69 + 2.75% × (76300 - 26050) = $360.69 + $1,381.875 = $1,742.565 → $1,743
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1743);
    // MAGI less exemptions = 82000 - 5700 = 76300
    // Retirement credit: $80 ($5K tier, MAGI less exemptions < $100K), Senior: $50
    expect(result.scheduleOfCredits.line2_retirementIncomeCredit.toNumber()).toBe(80);
    expect(result.scheduleOfCredits.line4_seniorCitizenCredit.toNumber()).toBe(50);
    // First batch = $130, line11 = $1,743 - $130 = $1,613
    // Joint filing: MAGI less exemptions = 76300, > $75K → 5%
    // 5% × $1,613 = $80.65 → $81
    expect(result.scheduleOfCredits.line12_jointFilingCredit.toNumber()).toBe(81);
    // Total credits = $130 + $81 = $211
    expect(result.it1040.line9_nonrefundableCredits.toNumber()).toBe(211);
    // Tax after credits = $1,743 - $211 = $1,532
    expect(result.it1040.line10_taxAfterCredits.toNumber()).toBe(1532);
  });

  it("Ohio resident return applies prior-year 529 carryforward through Schedule of Adjustments", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 1000 }],
        ohio529Carryforwards: [{ beneficiaryId: "child1", amount: 2500 }],
      }),
    );

    expect(result.scheduleOfAdjustments.line22_ohio529Deduction.toNumber()).toBe(3500);
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(46500);
  });

  // -------------------------------------------------------------------------
  // Use tax and late payment interest
  // -------------------------------------------------------------------------

  it("use tax and late payment interest add to total liability", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 60000,
        exemptions: 1,
        useTax: 150,
        latePaymentInterest: 25,
        ohioWithholding: 1000,
      }),
    );
    // MAGI = 60000, exemption $2,150, taxable = 57850
    // Tax = $342 + 2.75% × (57850 - 26050) = $342 + $874.50 = $1,216.50 → $1,217
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1217);
    // Total liability = tax + penalty($0) + use tax($150) = $1,367
    expect(result.it1040.line12_useTax.toNumber()).toBe(150);
    expect(result.it1040.line13_totalLiability.toNumber()).toBe(1367);
    // Net payments = withholding $1,000 - amended $0 = $1,000
    // Tax due = $1,367 - $1,000 = $367
    expect(result.it1040.line20_taxDue.toNumber()).toBe(367);
    // Late interest adds to amount due
    expect(result.it1040.line21_latePaymentInterest.toNumber()).toBe(25);
    expect(result.it1040.line22_totalAmountDue.toNumber()).toBe(392);
    // No overpayment, no refund
    expect(result.it1040.line23_overpayment.toNumber()).toBe(0);
    expect(result.it1040.line26_refund.toNumber()).toBe(0);
  });

  it("amended prior overpayment increases net payments", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 50000,
        exemptions: 1,
        ohioWithholding: 500,
        amendedPriorOverpayment: 300,
      }),
    );
    // Tax = $942 (from earlier tests)
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(942);
    // Line 17 = withholding $500, Line 18 = amended $300
    // Line 19 = Line 17 - Line 18 = $500 - $300 = $200
    // (Amended prior overpayment is subtracted — it was already paid/refunded)
    expect(result.it1040.line18_amendedPriorOverpayment.toNumber()).toBe(300);
    expect(result.it1040.line19_netPayments.toNumber()).toBe(200);
    // Tax due = $942 - $200 = $742
    expect(result.it1040.line20_taxDue.toNumber()).toBe(742);
  });

  it("refundable credits reduce tax due even below zero", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 35000,
        exemptions: 1,
        ohioWithholding: 0,
        refundableCredits: 500,
      }),
    );
    // MAGI ≤ 40000 → $2,400 exemption, taxable = 32600
    // Tax = $342 + 2.75% × (32600 - 26050) = $342 + $180.125 = $522.125 → $522
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(522);
    // Payments: withholding $0 + estimated $0 + refundable $500 = $500
    expect(result.it1040.line16_refundableCredits.toNumber()).toBe(500);
    expect(result.it1040.line17_totalPayments.toNumber()).toBe(500);
    // Tax due = $522 - $500 = $22
    expect(result.it1040.line20_taxDue.toNumber()).toBe(22);
  });

  it("refundables from Schedule of Credits flow to IT 1040 line 16", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 35000,
        exemptions: 1,
        ohioWithholding: 0,
        passThroughEntityCredit: 400,
        refundableJobCreationCredit: 150,
      }),
    );
    expect(result.scheduleOfCredits.line43_passThroughEntityCredit.toNumber()).toBe(400);
    expect(result.scheduleOfCredits.line42_refundableJobCreationCredit.toNumber()).toBe(150);
    expect(result.scheduleOfCredits.line47_totalRefundableCredits.toNumber()).toBe(550);
    expect(result.it1040.line16_refundableCredits.toNumber()).toBe(550);
    expect(result.it1040.line23_overpayment.toNumber()).toBe(28);
    expect(result.it1040.line26_refund.toNumber()).toBe(28);
  });

  // -------------------------------------------------------------------------
  // Underpayment penalty with quarterly estimated payments
  // -------------------------------------------------------------------------

  it("underpayment penalty auto-computed with quarterly estimated payments", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 100000,
        exemptions: 1,
        ohioWithholding: 500,
        estimatedPayments: 800,
        computeUnderpaymentPenalty: true,
        priorYearTaxLiability: 0,
        estimatedPaymentSchedule: [
          { date: "2025-04-15", amount: 200 },
          { date: "2025-06-16", amount: 200 },
          { date: "2025-09-15", amount: 200 },
          { date: "2026-01-15", amount: 200 },
        ],
      }),
    );
    // IT/SD 2210 should be computed
    expect(result.itsd2210).not.toBeNull();
    // Penalty flows to IT 1040
    expect(result.it1040.line11_underpaymentPenalty.toNumber()).toBe(
      result.itsd2210!.line17_totalPenalty.toNumber(),
    );
    // Penalty should be > 0 (large underpayment, no safe harbor)
    expect(result.itsd2210!.line17_totalPenalty.toNumber()).toBeGreaterThan(0);
    // Penalty adds to total liability
    expect(result.it1040.line13_totalLiability.toNumber()).toBeGreaterThan(
      result.it1040.line10_taxAfterCredits.toNumber(),
    );
  });

  it("SD 100 underpayment penalty auto-computed when requested", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 70000,
        exemptions: 1,
        computeUnderpaymentPenalty: true,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
        sdWithholding: 200,
        sdEstimatedPayments: 100,
        sdPriorYearTaxLiability: 0,
        sdPriorYearTimelyFiled: false,
      }),
    );

    expect(result.sdItsd2210).not.toBeNull();
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line9_underpaymentPenalty.toNumber()).toBe(
      result.sdItsd2210!.line17_totalPenalty.toNumber(),
    );
    expect(result.sd100!.line9_underpaymentPenalty.toNumber()).toBeGreaterThan(0);
  });

  it("SD 100 pass-through underpayment penalty skips school district IT/SD 2210 computation", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 70000,
        exemptions: 1,
        computeUnderpaymentPenalty: true,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
        sdWithholding: 200,
        sdUnderpaymentPenalty: 15,
      }),
    );

    expect(result.sdItsd2210).toBeNull();
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line9_underpaymentPenalty.toNumber()).toBe(15);
  });

  // -------------------------------------------------------------------------
  // SD 100 with use tax, interest, and penalty flowing through
  // -------------------------------------------------------------------------

  it("SD 100 with underpayment penalty and late interest", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        federalAgi: 70000,
        exemptions: 1,
        ohioWithholding: 1500,
        schoolDistricts: [
          {
            districtNumber: "5509",
            taxType: "traditional" as const,
            rate: "0.015",
          },
        ],
        sdWithholding: 200,
        sdUnderpaymentPenalty: 15,
        sdLatePaymentInterest: 10,
      }),
    );
    expect(result.sd100).not.toBeNull();
    // MAGI = 70000, exemption $2,150, MAGI - exemptions = 67850
    // Tax = 67850 × 1.5% = 1017.75 → 1018
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(1018);
    // Penalty on line 9
    expect(result.sd100!.line9_underpaymentPenalty.toNumber()).toBe(15);
    // Total SD liability = 1018 + 15 = 1033
    expect(result.sd100!.line10_totalLiability.toNumber()).toBe(1033);
    // SD withholding $200, tax due = $1,033 - $200 = $833
    expect(result.sd100!.line16_taxDue.toNumber()).toBe(833);
    // Late interest
    expect(result.sd100!.line17_latePaymentInterest.toNumber()).toBe(10);
    // Total amount due = $833 + $10 = $843
    expect(result.sd100!.line18_totalAmountDue.toNumber()).toBe(843);
  });

  // -------------------------------------------------------------------------
  // 2024 with school district — verify SD uses 2024 exemptions
  // -------------------------------------------------------------------------

  it("2024 tax year with school district uses 2024 bracket rates", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        taxYear: 2024,
        federalAgi: 60000,
        exemptions: 1,
        ohioWithholding: 1200,
        schoolDistricts: [
          {
            districtNumber: "3122",
            taxType: "traditional" as const,
            rate: "0.0125",
          },
        ],
        sdWithholding: 800,
      }),
    );
    // IT 1040: 2024 rates
    // Taxable = 60000 - 2150 = 57850
    // 2024: $360.69 + 2.75% × (57850 - 26050) = $360.69 + $874.50 = $1,235.19 → $1,235
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(1235);
    // SD 100: MAGI - exemptions = 57850
    // Tax = 57850 × 1.25% = 723.125 → 723
    expect(result.sd100).not.toBeNull();
    expect(result.sd100!.line8_totalTaxAfterCredits.toNumber()).toBe(723);
    // SD withholding $800 > $723 → overpayment $77
    expect(result.sd100!.line19_overpayment.toNumber()).toBe(77);
  });

  // -------------------------------------------------------------------------
  // Multiple credits stacking in 2024
  // -------------------------------------------------------------------------

  it("2024 MFJ with business income uses 2024 top rate (3.50%)", () => {
    const result = calculateOhioResidentReturn(
      makeInput({
        taxYear: 2024,
        filingStatus: "married_filing_jointly",
        federalAgi: 400000,
        qualifyingBusinessIncome: 300000,
        exemptions: 2,
        ohioWithholding: 5000,
        estimatedPayments: 3000,
      }),
    );
    // Business deduction = $250,000, excess = $50,000
    expect(result.scheduleOfAdjustments.line15_businessIncomeDeduction.toNumber()).toBe(250000);
    expect(result.scheduleOfAdjustments.taxableBusinessIncome.toNumber()).toBe(50000);
    // Ohio AGI = 400000 - 250000 = 150000
    expect(result.it1040.line3_ohioAgi.toNumber()).toBe(150000);
    // MAGI = 150000 + 250000 = 400000 → $1,900 × 2 = $3,800 exemptions
    expect(result.it1040.magi.toNumber()).toBe(400000);
    expect(result.it1040.line4_exemptions.toNumber()).toBe(3800);
    // Taxable = 150000 - 3800 = 146200
    // Business income = 50000, nonbusiness = 146200 - 50000 = 96200
    expect(result.it1040.line6_taxableBusinessIncome.toNumber()).toBe(50000);
    expect(result.it1040.line7_taxableNonbusinessIncome.toNumber()).toBe(96200);
    // 2024 nonbusiness: $360.69 + 2.75% × (96200 - 26050) = $360.69 + $1,929.125 = $2,289.815 → $2,290
    expect(result.it1040.line8a_nonbusinessTax.toNumber()).toBe(2290);
    // Business: 50000 × 3% = $1,500
    expect(result.it1040.line8b_businessTax.toNumber()).toBe(1500);
    // Total = $3,790
    expect(result.it1040.line8c_totalTax.toNumber()).toBe(3790);
  });
});

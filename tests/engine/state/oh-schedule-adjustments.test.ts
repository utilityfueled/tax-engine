/**
 * Tests for Ohio Schedule of Adjustments — Additions and Deductions.
 * Spec: spec/state/oh-schedule-adjustments.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateOhioScheduleOfAdjustments,
  type OhioScheduleOfAdjustmentsInput,
} from "@/engine/state/oh-schedule-adjustments.js";

/** Helper to create a minimal input, overriding specific fields. */
function makeInput(
  overrides: Partial<OhioScheduleOfAdjustmentsInput> = {}
): OhioScheduleOfAdjustmentsInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    ...overrides,
  };
}

describe("Ohio Schedule of Adjustments", () => {
  // =========================================================================
  // ADDITIONS
  // =========================================================================

  // -------------------------------------------------------------------------
  // Line 1 — Non-Ohio state/local government interest
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 1 - non-Ohio state/local government interest", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ nonOhioStateLocalInterest: 1500 })
    );
    expect(result.line1_nonOhioStateLocalInterest.toNumber()).toBe(1500);
  });

  it("OH Schedule of Adjustments Line 1 - defaults to zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line1_nonOhioStateLocalInterest.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 2 — Employee benefit plan distributions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 2 - employee benefit plan distributions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ employeeBenefitPlanDistributions: 2000 })
    );
    expect(result.line2_employeeBenefitPlanDistributions.toNumber()).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // Line 3 — Lump sum credits from prior year
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 3 - lump sum credits from prior year", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ lumpSumCreditsFromPriorYear: 500 })
    );
    expect(result.line3_lumpSumCreditsFromPriorYear.toNumber()).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Line 4 — Section 168(k) depreciation add-back
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 4 - depreciation add-back", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ depreciationAddBack: 10000 })
    );
    expect(result.line4_depreciationAddBack.toNumber()).toBe(10000);
  });

  // -------------------------------------------------------------------------
  // Line 5 — PTE add-back
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 5 - PTE add-back", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ pteAddBack: 5000 })
    );
    expect(result.line5_pteAddBack.toNumber()).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // Line 6 — Medical savings account add-back
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 6 - medical savings account nonmedical withdrawals", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        medicalSavingsAccountTaxpayerContributions: 5000,
        medicalSavingsAccountEarnings: 200,
        medicalSavingsAccountNonmedicalWithdrawals: 7000,
      })
    );

    expect(result.line6_medicalSavingsAccountAddBack.toNumber()).toBe(1800);
    expect(result.line45_medicalSavingsAccountDeduction.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Lines 7-13 — Other additions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Lines 7-13 - other additions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ otherAdditions: 750 })
    );
    expect(result.line6to13_otherAdditions.toNumber()).toBe(750);
  });

  // -------------------------------------------------------------------------
  // Line 14 — Total additions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 14 - total additions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        nonOhioStateLocalInterest: 1000,
        employeeBenefitPlanDistributions: 500,
        lumpSumCreditsFromPriorYear: 200,
        depreciationAddBack: 3000,
        pteAddBack: 1500,
        otherAdditions: 300,
      })
    );
    // 1000 + 500 + 200 + 3000 + 1500 + 300 = 6500
    expect(result.line14_totalAdditions.toNumber()).toBe(6500);
  });

  it("OH Schedule of Adjustments Line 14 - total additions with no inputs is zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line14_totalAdditions.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments Line 14 - single addition flows through", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ nonOhioStateLocalInterest: 2500 })
    );
    expect(result.line14_totalAdditions.toNumber()).toBe(2500);
  });

  // =========================================================================
  // DEDUCTIONS
  // =========================================================================

  // -------------------------------------------------------------------------
  // Line 15 — Business income deduction
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 15 - business income deduction", () => {
    // Canonical: $100K business income → deduction = $100K (below threshold)
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 100000 })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(100000);
  });

  it("OH Schedule of Adjustments Line 15 - business income deduction capped at $250,000", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 400000 })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
  });

  it("OH Schedule of Adjustments Line 15 - business income deduction exactly $250,000", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 250000 })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
  });

  it("OH Schedule of Adjustments Line 15 - MFS business income deduction capped at $125,000", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_separately",
        qualifyingBusinessIncome: 200000,
      })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(125000);
  });

  it("OH Schedule of Adjustments Line 15 - MFS business income deduction at $125,000", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_separately",
        qualifyingBusinessIncome: 125000,
      })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(125000);
  });

  it("OH Schedule of Adjustments Line 15 - negative business income results in $0 deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: -5000 })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments Line 15 - zero business income results in $0 deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments Line 15 - MFJ gets full $250,000 threshold", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        qualifyingBusinessIncome: 300000,
      })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
  });

  it("OH Schedule of Adjustments Line 15 - $1 above threshold still capped", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 250001 })
    );
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
  });

  // -------------------------------------------------------------------------
  // Line 20 — STABLE contributions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 20 - STABLE contributions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        stableContributions: [
          { beneficiaryId: "beneficiary-1", amount: 4500 },
          { beneficiaryId: "beneficiary-2", amount: 1500 },
        ],
        stableCarryforwards: [
          { beneficiaryId: "beneficiary-2", amount: 3000 },
          { beneficiaryId: "beneficiary-3", amount: 2500 },
        ],
      })
    );

    expect(result.line20_stableDeduction.toNumber()).toBe(10500);
  });

  // -------------------------------------------------------------------------
  // Line 26 — Federal interest exempt from Ohio
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 26 - federal interest exempt from Ohio", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ federalInterestExemptFromOhio: 3000 })
    );
    expect(result.line26_federalInterestExempt.toNumber()).toBe(3000);
    expect(result.line16_federalInterestExempt.toNumber()).toBe(3000);
  });

  it("OH Schedule of Adjustments Line 26 - defaults to zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line26_federalInterestExempt.toNumber()).toBe(0);
    expect(result.line16_federalInterestExempt.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 27 — Taxable Social Security deduction
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 27 - Social Security deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ taxableSocialSecurity: 12000 })
    );
    expect(result.line27_socialSecurityDeduction.toNumber()).toBe(12000);
    expect(result.line17_socialSecurityDeduction.toNumber()).toBe(12000);
  });

  it("OH Schedule of Adjustments Line 27 - Social Security defaults to zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line27_socialSecurityDeduction.toNumber()).toBe(0);
    expect(result.line17_socialSecurityDeduction.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments Line 27 - large Social Security deduction", () => {
    // Retiree with $30,000 taxable Social Security
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ taxableSocialSecurity: 30000 })
    );
    expect(result.line27_socialSecurityDeduction.toNumber()).toBe(30000);
    expect(result.line17_socialSecurityDeduction.toNumber()).toBe(30000);
  });

  // -------------------------------------------------------------------------
  // Line 28 — State/municipal tax refund deduction
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 28 - state tax refund deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ stateMunicipalTaxRefunds: 800 })
    );
    expect(result.line28_stateTaxRefundDeduction.toNumber()).toBe(800);
    expect(result.line18_stateTaxRefundDeduction.toNumber()).toBe(800);
  });

  // -------------------------------------------------------------------------
  // Line 32 — Military pay
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 32 - military pay deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ militaryPayOutsideOhio: 5000 })
    );
    expect(result.line32_militaryPayDeduction.toNumber()).toBe(5000);
    expect(result.line19_militaryPayDeduction.toNumber()).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // Line 34 — Uniformed services retirement
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 34 - uniformed services retirement", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ uniformedServicesRetirement: 24000 })
    );
    expect(result.line34_uniformedServicesRetirement.toNumber()).toBe(24000);
    expect(result.line20_uniformedServicesRetirement.toNumber()).toBe(24000);
  });

  // -------------------------------------------------------------------------
  // Lines 42-43 — Disability and survivorship
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Lines 42-43 - disability and survivorship benefits", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ disabilitySurvivorshipBenefits: 6000 })
    );
    expect(result.line42to43_disabilitySurvivorshipBenefits.toNumber()).toBe(6000);
    expect(result.line21_disabilitySurvivorshipBenefits.toNumber()).toBe(6000);
  });

  // -------------------------------------------------------------------------
  // Line 37 — Ohio 529 contributions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 37 - Ohio 529 contributions", () => {
    // Single beneficiary, $3,000 contribution
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 3000 }],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(3000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(3000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 capped at $4,000 per beneficiary", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 6000 }],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(4000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(4000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 multiple beneficiaries", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [
          { beneficiaryId: "child1", amount: 4000 },
          { beneficiaryId: "child2", amount: 3000 },
          { beneficiaryId: "child3", amount: 5000 }, // capped at $4,000
        ],
      })
    );
    // $4,000 + $3,000 + $4,000 = $11,000
    expect(result.line37_ohio529Deduction.toNumber()).toBe(11000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(11000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 exactly $4,000 per beneficiary", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [
          { beneficiaryId: "child1", amount: 4000 },
          { beneficiaryId: "child2", amount: 4000 },
        ],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(8000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(8000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 no contributions defaults to zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line37_ohio529Deduction.toNumber()).toBe(0);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 aggregates same beneficiary", () => {
    // Multiple contributions to the same beneficiary should be aggregated
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [
          { beneficiaryId: "child1", amount: 2000 },
          { beneficiaryId: "child1", amount: 3000 }, // total $5,000 → capped at $4,000
        ],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(4000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(4000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 prior-year carryforward is deductible", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Carryforwards: [{ beneficiaryId: "child1", amount: 2500 }],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(2500);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(2500);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 carryforward plus current-year contribution still caps per beneficiary", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 3000 }],
        ohio529Carryforwards: [{ beneficiaryId: "child1", amount: 2000 }],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(4000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(4000);
  });

  it("OH Schedule of Adjustments Line 37 - Ohio 529 carryforward stays with the same beneficiary", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 3500 }],
        ohio529Carryforwards: [{ beneficiaryId: "child2", amount: 1500 }],
      })
    );
    expect(result.line37_ohio529Deduction.toNumber()).toBe(5000);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // Line 38 — College grants used to pay room and board
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 38 - college grants used to pay room and board", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        collegeGrantRoomAndBoardEntries: [
          {
            recipientId: "student-1",
            grantType: "federal_pell_grant",
            amountIncludedInFederalAgi: 1800,
            qualifyingRoomAndBoardExpenses: 2200,
          },
          {
            recipientId: "student-2",
            grantType: "ohio_college_opportunity_grant",
            amountIncludedInFederalAgi: 600,
            qualifyingRoomAndBoardExpenses: 450,
          },
        ],
      }),
    );

    expect(result.line38_collegeGrantRoomAndBoardDeduction.toNumber()).toBe(2250);
  });

  it("OH Schedule of Adjustments Line 38 - only the overlap between included AGI and room and board is deductible", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        collegeGrantRoomAndBoardEntries: [
          {
            recipientId: "student-1",
            grantType: "federal_pell_grant",
            amountIncludedInFederalAgi: 0,
            qualifyingRoomAndBoardExpenses: 1000,
          },
          {
            recipientId: "student-2",
            grantType: "ohio_college_opportunity_grant",
            amountIncludedInFederalAgi: 900,
            qualifyingRoomAndBoardExpenses: 1200,
          },
        ],
      }),
    );

    expect(result.line38_collegeGrantRoomAndBoardDeduction.toNumber()).toBe(900);
  });

  // -------------------------------------------------------------------------
  // Line 24 — Ohio Homebuyer Plus accounts
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 24 - Ohio Homebuyer Plus accounts", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        homebuyerPlusAccounts: [
          { contributorId: "taxpayer", accountId: "acct-1", amount: 6000 },
          { contributorId: "taxpayer", accountId: "acct-1", amount: 500 },
          { contributorId: "spouse", accountId: "acct-1", amount: 5200 },
          { contributorId: "taxpayer", accountId: "acct-2", amount: 1800 },
        ],
      })
    );

    expect(result.line24_homebuyerPlusDeduction.toNumber()).toBe(11800);
  });

  // -------------------------------------------------------------------------
  // Line 25 — Pregnancy resource center contributions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 25 - pregnancy resource center contributions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 500, contributionDate: "2025-10-15" },
        ],
      })
    );
    expect(result.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(500);
  });

  it("OH Schedule of Adjustments Line 25 - pregnancy resource center contributions cap at $750 per contributor", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 900, contributionDate: "2025-10-15" },
          { contributorId: "spouse", amount: 800, contributionDate: "2025-11-01" },
        ],
      })
    );
    expect(result.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(1500);
  });

  it("OH Schedule of Adjustments Line 25 - dated contributions outside the 2025 window are excluded", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 400, contributionDate: "2025-09-29" },
          { contributorId: "taxpayer", amount: 300, contributionDate: "2025-09-30" },
          { contributorId: "taxpayer", amount: 350, contributionDate: "2025-12-31" },
          { contributorId: "taxpayer", amount: 500, contributionDate: "2026-01-01" },
        ],
      })
    );

    expect(result.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(650);
  });

  it("OH Schedule of Adjustments Line 25 - undated contributions are excluded", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 700 },
          { contributorId: "taxpayer", amount: 200, contributionDate: "2025-10-15" },
        ],
      })
    );

    expect(result.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(200);
  });

  it("OH Schedule of Adjustments Line 25 - 2024 does not allow the pregnancy resource center deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        taxYear: 2024,
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 700, contributionDate: "2025-10-15" },
        ],
      })
    );

    expect(result.line25_pregnancyResourceCenterDeduction.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 39 — Ohio educator expenses
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 39 - Ohio educator expenses", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        ohioEducatorExpenses: [{ educatorId: "teacher-1", amount: 250 }],
      })
    );
    expect(result.line39_educatorExpensesDeduction.toNumber()).toBe(250);
  });

  it("OH Schedule of Adjustments Line 39 - Ohio educator expenses cap at $300 per educator", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        ohioEducatorExpenses: [
          { educatorId: "teacher-1", amount: 150 },
          { educatorId: "teacher-1", amount: 250 },
          { educatorId: "teacher-2", amount: 500 },
        ],
      })
    );
    expect(result.line39_educatorExpensesDeduction.toNumber()).toBe(600);
  });

  // -------------------------------------------------------------------------
  // Line 40 — Rural Practice Incentive Program repayments
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 40 - rural practice incentive repayments", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ ruralPracticeIncentiveRepayments: 12000 }),
    );

    expect(result.line40_ruralPracticeIncentiveRepayments.toNumber()).toBe(12000);
  });

  // -------------------------------------------------------------------------
  // Line 41 — Grant payments for students who are adopted
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 41 - adopted student grant payments", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ adoptedStudentGrantPayments: 2500 }),
    );

    expect(result.line41_adoptedStudentGrantPayments.toNumber()).toBe(2500);
  });

  // -------------------------------------------------------------------------
  // Line 44 — Medical and health care expenses
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 44 - medical and health care expenses", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        federalAgi: 50000,
        medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility: 1200,
        medicalLongTermCareInsurancePremiums: 300,
        medicalInsurancePremiumsDuringMedicareOrEmployerEligibility: 1000,
        medicalCareExpenses: 5000,
      }),
    );

    expect(result.line44_medicalHealthCareExpensesDeduction.toNumber()).toBe(3750);
    expect(result.line47_totalDeductions.toNumber()).toBe(3750);
  });

  it("OH Schedule of Adjustments Line 44 - medical worksheet treats negative federal AGI as zero", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        federalAgi: -500,
        medicalInsurancePremiumsDuringMedicareOrEmployerEligibility: 800,
        medicalCareExpenses: 200,
      }),
    );

    expect(result.line44_medicalHealthCareExpensesDeduction.toNumber()).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // Line 45 — Medical savings account deduction
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 45 - medical savings account deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        medicalSavingsAccountTaxpayerContributions: 7000,
        medicalSavingsAccountSpouseContributions: 8000,
        medicalSavingsAccountEarnings: 300,
        medicalSavingsAccountNonmedicalWithdrawals: 1000,
      })
    );

    expect(result.line6_medicalSavingsAccountAddBack.toNumber()).toBe(0);
    expect(result.line45_medicalSavingsAccountDeduction.toNumber()).toBe(11306);
  });

  it("OH Schedule of Adjustments Line 46 - qualified organ donor expenses", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        qualifiedOrganDonorExpenses: [
          { donorId: "taxpayer", amount: 6200 },
          { donorId: "taxpayer", amount: 5100 },
          { donorId: "spouse", amount: 9800 },
        ],
      }),
    );

    expect(result.line45_qualifiedOrganDonorExpenses.toNumber()).toBe(0);
    expect(result.line46_qualifiedOrganDonorExpenses.toNumber()).toBe(19800);
    expect(result.line47_totalDeductions.toNumber()).toBe(19800);
  });

  // -------------------------------------------------------------------------
  // Lines 23-35 — Other deductions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Lines 23-35 - other deductions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ otherDeductions: 1500 })
    );
    expect(result.line23to35_otherDeductions.toNumber()).toBe(1500);
  });

  // -------------------------------------------------------------------------
  // Line 47 — Total deductions
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments Line 47 - total deductions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        qualifyingBusinessIncome: 100000,
        homebuyerPlusAccounts: [
          { contributorId: "taxpayer", accountId: "acct-1", amount: 5200 },
        ],
        pregnancyResourceCenterContributions: [
          { contributorId: "taxpayer", amount: 1200, contributionDate: "2025-10-15" },
        ],
        federalInterestExemptFromOhio: 2000,
        taxableSocialSecurity: 15000,
        stateMunicipalTaxRefunds: 500,
        collegeGrantRoomAndBoardEntries: [
          {
            recipientId: "student-1",
            grantType: "federal_pell_grant",
            amountIncludedInFederalAgi: 1000,
            qualifyingRoomAndBoardExpenses: 800,
          },
        ],
        ruralPracticeIncentiveRepayments: 3000,
        adoptedStudentGrantPayments: 2500,
        militaryPayOutsideOhio: 0,
        uniformedServicesRetirement: 0,
        ohio529Contributions: [{ beneficiaryId: "child1", amount: 4000 }],
        ohioEducatorExpenses: [{ educatorId: "teacher-1", amount: 450 }],
        medicalSavingsAccountTaxpayerContributions: 7000,
        medicalSavingsAccountEarnings: 250,
        medicalSavingsAccountNonmedicalWithdrawals: 1200,
        otherDeductions: 200,
      })
    );
    expect(result.line47_totalDeductions.toNumber()).toBe(139103);
  });

  it("OH Schedule of Adjustments Line 47 - total deductions with no inputs is zero", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.line47_totalDeductions.toNumber()).toBe(0);
  });

  // =========================================================================
  // End-to-end scenarios
  // =========================================================================

  it("OH Schedule of Adjustments - W-2 wage earner with Social Security", () => {
    // Retiree with part-time W-2 income and Social Security
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "single",
        taxableSocialSecurity: 18000,
        federalInterestExemptFromOhio: 500,
      })
    );
    expect(result.line14_totalAdditions.toNumber()).toBe(0);
    expect(result.line36_totalDeductions.toNumber()).toBe(18500);
  });

  it("OH Schedule of Adjustments - business owner with $300K income", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "single",
        qualifyingBusinessIncome: 300000,
        depreciationAddBack: 5000,
      })
    );
    // Additions: $5,000 depreciation add-back
    // Deductions: $250,000 business income deduction
    expect(result.line14_totalAdditions.toNumber()).toBe(5000);
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
    expect(result.line36_totalDeductions.toNumber()).toBe(250000);
  });

  it("OH Schedule of Adjustments - MFJ family with 529 and Social Security", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        nonOhioStateLocalInterest: 300,
        taxableSocialSecurity: 8000,
        ohio529Contributions: [
          { beneficiaryId: "child1", amount: 4000 },
          { beneficiaryId: "child2", amount: 2500 },
        ],
      })
    );
    // Additions: $300
    // Deductions: $0 (no business) + $0 (no fed interest) + $8,000 (SS) + $6,500 (529) = $14,500
    expect(result.line14_totalAdditions.toNumber()).toBe(300);
    expect(result.line22_ohio529Deduction.toNumber()).toBe(6500);
    expect(result.line36_totalDeductions.toNumber()).toBe(14500);
  });

  it("OH Schedule of Adjustments - STABLE deduction flows into total deductions", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        stableContributions: [
          { beneficiaryId: "beneficiary-1", amount: 3800 },
          { beneficiaryId: "beneficiary-2", amount: 4500 },
        ],
        taxableSocialSecurity: 2000,
      })
    );

    expect(result.line20_stableDeduction.toNumber()).toBe(7800);
    expect(result.line36_totalDeductions.toNumber()).toBe(9800);
  });

  it("OH Schedule of Adjustments - MFS business owner", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_separately",
        qualifyingBusinessIncome: 200000,
        nonOhioStateLocalInterest: 1000,
        taxableSocialSecurity: 5000,
      })
    );
    // Additions: $1,000
    // Business deduction: min($200,000, $125,000) = $125,000
    // Deductions: $125,000 + $5,000 = $130,000
    expect(result.line14_totalAdditions.toNumber()).toBe(1000);
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(125000);
    expect(result.line36_totalDeductions.toNumber()).toBe(130000);
  });

  it("OH Schedule of Adjustments - military retiree", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_jointly",
        uniformedServicesRetirement: 36000,
        taxableSocialSecurity: 10000,
        federalInterestExemptFromOhio: 1200,
      })
    );
    // No additions
    // Deductions: $36,000 + $10,000 + $1,200 = $47,200
    expect(result.line14_totalAdditions.toNumber()).toBe(0);
    expect(result.line36_totalDeductions.toNumber()).toBe(47200);
  });

  // -------------------------------------------------------------------------
  // Taxable business income output (excess over deduction)
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments - taxable business income is excess over deduction", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 350000 })
    );
    // Deduction = $250,000, excess = $100,000
    expect(result.line15_businessIncomeDeduction.toNumber()).toBe(250000);
    expect(result.taxableBusinessIncome.toNumber()).toBe(100000);
  });

  it("OH Schedule of Adjustments - taxable business income zero when below threshold", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({ qualifyingBusinessIncome: 100000 })
    );
    expect(result.taxableBusinessIncome.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments - taxable business income zero when no business income", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    expect(result.taxableBusinessIncome.toNumber()).toBe(0);
  });

  it("OH Schedule of Adjustments - MFS taxable business income", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        filingStatus: "married_filing_separately",
        qualifyingBusinessIncome: 200000,
      })
    );
    // Deduction = $125,000, excess = $75,000
    expect(result.taxableBusinessIncome.toNumber()).toBe(75000);
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments - audit trail records key lines", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput());
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("6");
    expect(lineNumbers).toContain("14");
    expect(lineNumbers).toContain("15");
    expect(lineNumbers).toContain("20");
    expect(lineNumbers).toContain("27");
    expect(lineNumbers).toContain("37");
    expect(lineNumbers).toContain("45");
    expect(lineNumbers).toContain("47");
    expect(result.lines.every((l) => l.form === "OH-SCHEDULE-ADJ")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("OH Schedule of Adjustments - unsupported tax year throws", () => {
    expect(() =>
      calculateOhioScheduleOfAdjustments(makeInput({ taxYear: 2023 }))
    ).toThrow("Ohio Schedule of Adjustments constants not available for tax year 2023");
  });

  it("OH Schedule of Adjustments - 2024 tax year is supported", () => {
    const result = calculateOhioScheduleOfAdjustments(makeInput({ taxYear: 2024 }));
    expect(result.line14_totalAdditions).toBeDefined();
    expect(result.line36_totalDeductions).toBeDefined();
  });

  it("OH Schedule of Adjustments - 2024 medical savings account cap is supported", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        taxYear: 2024,
        medicalSavingsAccountTaxpayerContributions: 6000,
      })
    );

    expect(result.line44_medicalSavingsAccountDeduction.toNumber()).toBe(5846);
    expect(result.line45_medicalSavingsAccountDeduction.toNumber()).toBe(5846);
  });

  it("OH Schedule of Adjustments Line 43 - 2024 medical and health care expenses use the prior line number", () => {
    const result = calculateOhioScheduleOfAdjustments(
      makeInput({
        taxYear: 2024,
        federalAgi: 40000,
        medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility: 500,
        medicalInsurancePremiumsDuringMedicareOrEmployerEligibility: 1000,
        medicalCareExpenses: 4000,
      }),
    );

    expect(result.line43_medicalHealthCareExpensesDeduction.toNumber()).toBe(2500);
    expect(result.line47_totalDeductions.toNumber()).toBe(2500);
  });
});

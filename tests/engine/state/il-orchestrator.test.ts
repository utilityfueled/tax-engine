/**
 * Tests for Illinois State Return Orchestrator — Federal-to-State Bridge
 * Spec: spec/state/il-orchestrator.yaml
 *
 * Verifies that calculateIllinoisReturn correctly maps federal TaxReturnResult
 * to IL-1040 inputs and produces the expected IL return.
 *
 * Source: Illinois Department of Revenue, 2025 IL-1040 Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateIllinoisReturn, type ILStateInput } from "@/engine/state/il-orchestrator.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

/** Minimal TaxReturnResult for testing — only fields used by the orchestrator */
function makeFederal(overrides: Partial<TaxReturnResult> = {}): TaxReturnResult {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalWages: d(75000),
    totalInterest: ZERO,
    taxExemptInterest: ZERO,
    totalDividends: ZERO,
    qualifiedDividends: ZERO,
    iraDistributionsGross: ZERO,
    iraDistributionsTaxable: ZERO,
    pensionDistributionsGross: ZERO,
    pensionDistributionsTaxable: ZERO,
    socialSecurityBenefitsGross: ZERO,
    socialSecurityBenefitsTaxable: ZERO,
    capitalGainLoss: ZERO,
    otherIncome: ZERO,
    nolDeduction: ZERO,
    totalIncome: d(75000),
    adjustmentsToIncome: ZERO,
    agi: d(75000),
    standardDeduction: d(15000),
    itemizedDeductions: ZERO,
    deductionUsed: "standard",
    deductionAmount: d(15000),
    taxableIncome: d(60000),
    ordinaryTax: d(8000),
    capitalGainsTax: ZERO,
    totalTaxBeforeCredits: d(8000),
    childTaxCredit: ZERO,
    foreignTaxCredit: ZERO,
    otherCredits: ZERO,
    totalCredits: ZERO,
    earnedIncomeCredit: ZERO,
    amt: ZERO,
    selfEmploymentTax: ZERO,
    additionalMedicareTax: ZERO,
    niitTax: ZERO,
    estimatedTaxPenalty: ZERO,
    totalAdditionalTaxes: ZERO,
    totalTax: d(8000),
    totalPayments: d(8000),
    totalWithholding: d(8000),
    estimatedTaxPayments: ZERO,
    amountOwed: ZERO,
    refund: ZERO,
    carryforwards: {
      capitalLoss: ZERO,
      shortTermCapitalLoss: ZERO,
      longTermCapitalLoss: ZERO,
      suspendedPassiveLosses: [],
      suspendedPTPLosses: [],
      foreignTaxCreditCarryforward: ZERO,
      foreignTaxCreditCarryforwardByCategory: {},
      qbiLossCarryforward: ZERO,
      investmentInterestExpense: ZERO,
      minimumTaxCredit: ZERO,
      charitableContributions: ZERO,
      charitableContributionsByYear: [],
      excessBusinessLossNOL: ZERO,
      nolCarryforward: ZERO,
      generalBusinessCredit: ZERO,
      suspendedBusinessInterest: [],
      partnerBasis: [],
      excessContributions: {
        traditionalIRA: ZERO,
        rothIRA: ZERO,
        coverdellESA: ZERO,
        archerMSA: ZERO,
        hsa: ZERO,
        able: ZERO,
      },
    },
    allLines: [],
    ...overrides,
  };
}

/** Minimal IL-specific inputs */
function makeILInput(overrides: Partial<ILStateInput> = {}): ILStateInput {
  const input: ILStateInput = {
    claimedAsDependent: false,
    age65OrOlderCount: 0,
    blindCount: 0,
    dependentCount: 0,
    hasChildUnder12: false,
    ...overrides,
  };

  if (input.scheduleICR?.propertyTaxPaid.greaterThan(0) && input.scheduleICR.propertyTaxProperties === undefined) {
    return {
      ...input,
      scheduleICR: {
        ...input.scheduleICR,
        propertyTaxProperties: [
          {
            county: "Sangamon",
            propertyNumber: "14-22-100-001",
          },
        ],
      },
    };
  }

  return input;
}

function makeScheduleEEIC(
  federalEIC: Decimal,
  dependentCount = 0,
  hasChildUnder12 = false,
) {
  return {
    taxYear: 2025,
    dependents: Array.from({ length: dependentCount }, (_, index) => ({
      relationship: "child",
      isUnder12: hasChildUnder12 && index === 0,
      monthsInHome: 12,
    })),
    federalEIC,
  };
}

describe("Illinois State Return Orchestrator", () => {
  // ==================== Federal → IL Mapping ====================

  it("IL orchestrator maps federal AGI to IL-1040 Line 1", () => {
    const federal = makeFederal({ agi: d(85000) });
    const result = calculateIllinoisReturn(federal, makeILInput());
    expect(result.federalAGI.toNumber()).toBe(85000);
  });

  it("IL orchestrator maps federal EIC to IL EITC", () => {
    const federal = makeFederal({
      agi: d(25000),
      earnedIncomeCredit: d(3000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      hasChildUnder12: true,
      dependentCount: 1,
      scheduleEEIC: makeScheduleEEIC(d(3000), 1, true),
    }));
    // IL EITC = 3000 × 20% = 600
    expect(result.ilEITC.toNumber()).toBe(600);
    // IL CTC = 600 × 40% = 240
    expect(result.ilChildTaxCredit.toNumber()).toBe(240);
  });

  it("IL orchestrator maps tax-exempt interest to IL-1040 Line 2", () => {
    const federal = makeFederal({
      taxExemptInterest: d(1500),
    });
    const result = calculateIllinoisReturn(federal, makeILInput());
    expect(result.taxExemptInterest.toNumber()).toBe(1500);
    // Total income = 75000 + 1500 + 0
    expect(result.totalIncome.toNumber()).toBe(76500);
  });

  it("IL orchestrator maps federal Form 1040 Line 2a output from calculateFederalTax to IL-1040 Line 2", () => {
    const federal = calculateFederalTax({
      ...simpleW2Fixture,
      form1099Int: [
        { privateActivityBondInterest: "0",
          payer: "Illinois Muni Fund",
          interestIncome: "0",
          federalWithheld: "0",
          earlyWithdrawalPenalty: "0",
          usSavingsBondInterest: "0",
          taxExemptInterest: "1500",
        },
      ],
    });

    const result = calculateIllinoisReturn(federal, makeILInput());

    expect(federal.taxExemptInterest.toNumber()).toBe(1500);
    expect(result.taxExemptInterest.toNumber()).toBe(1500);
    expect(result.totalIncome.toNumber()).toBe(86500);
  });

  it("IL orchestrator maps Illinois-exempt municipal bond interest into Schedule M Line 34", () => {
    const federal = makeFederal({
      agi: d(60000),
      taxExemptInterest: d(1000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      illinoisExemptTaxExemptInterest: d(400),
    }));

    expect(result.taxExemptInterest.toNumber()).toBe(1000);
    expect(result.scheduleM?.totalSubtractions.toNumber()).toBe(400);
    expect(result.baseIncome.toNumber()).toBe(60600);
  });

  it("IL orchestrator maps K-1 retirement payments into Schedule M Line 14 instead of IL-1040 Line 5", () => {
    const federal = makeFederal({
      agi: d(70000),
      socialSecurityBenefitsTaxable: d(12000),
      iraDistributionsTaxable: d(3000),
      pensionDistributionsTaxable: d(5000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      k1RetirementPaymentsSubtraction: d(4000),
    }));

    expect(result.retirementIncomeSubtraction.toNumber()).toBe(20000);
    expect(result.scheduleM?.lines.find((line) => line.line === "14")?.value.toNumber()).toBe(4000);
    expect(result.scheduleM?.totalSubtractions.toNumber()).toBe(4000);
    expect(result.baseIncome.toNumber()).toBe(46000);
  });

  it("IL orchestrator adds Illinois-exempt municipal bond interest to an existing Schedule M Line 34 amount", () => {
    const federal = makeFederal({
      agi: d(90000),
      taxExemptInterest: d(1200),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      illinoisExemptTaxExemptInterest: d(200),
      scheduleM: {
        taxYear: 2025,
        filingStatus: "single",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: ZERO,
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: d(300),
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: d(150),
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
    }));

    expect(result.scheduleM?.totalSubtractions.toNumber()).toBe(650);
    expect(result.baseIncome.toNumber()).toBe(90550);
  });

  it("IL orchestrator auto-computes retirement income subtraction", () => {
    // SS taxable = 12000, IRA = 8000, pension = 5000 → total = 25000
    const federal = makeFederal({
      agi: d(60000),
      socialSecurityBenefitsTaxable: d(12000),
      iraDistributionsTaxable: d(8000),
      pensionDistributionsTaxable: d(5000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput());
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(25000);
    // Base income = 60000 - 25000 = 35000
    expect(result.baseIncome.toNumber()).toBe(35000);
  });

  it("IL orchestrator maps taxable federal savings bond interest from Form 8815 into Schedule M Line 22 when Line 22 is not provided", () => {
    const federal = makeFederal({
      agi: d(60000),
      totalIncome: d(60000),
      taxableIncome: d(45000),
      form8815: {
        qualifiedExpenses: d(7500),
        totalProceeds: d(15000),
        totalInterest: d(3000),
        expenseRatio: d("0.5"),
        excludableBeforePhaseOut: d(1500),
        modifiedAGI: d(60000),
        phaseOutThreshold: d(99500),
        phaseOutRange: d(15000),
        excludableSavingsBondInterest: d(1500),
        lines: [],
      },
    });

    const result = calculateIllinoisReturn(federal, makeILInput());

    expect(result.scheduleM?.lines.find((line) => line.line === "22")?.value.toNumber()).toBe(1500);
    expect(result.scheduleM?.totalSubtractions.toNumber()).toBe(1500);
    expect(result.baseIncome.toNumber()).toBe(58500);
  });

  it("IL orchestrator preserves an explicit non-zero Schedule M Line 22 amount instead of auto-adding Form 8815 savings bond interest", () => {
    const federal = makeFederal({
      agi: d(60000),
      totalIncome: d(60000),
      taxableIncome: d(45000),
      form8815: {
        qualifiedExpenses: d(7500),
        totalProceeds: d(15000),
        totalInterest: d(3000),
        expenseRatio: d("0.5"),
        excludableBeforePhaseOut: d(1500),
        modifiedAGI: d(60000),
        phaseOutThreshold: d(99500),
        phaseOutRange: d(15000),
        excludableSavingsBondInterest: d(1500),
        lines: [],
      },
    });

    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleM: {
        taxYear: 2025,
        filingStatus: "single",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: ZERO,
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: d(200),
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: ZERO,
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
    }));

    expect(result.scheduleM?.lines.find((line) => line.line === "22")?.value.toNumber()).toBe(200);
    expect(result.scheduleM?.totalSubtractions.toNumber()).toBe(200);
    expect(result.baseIncome.toNumber()).toBe(59800);
  });

  it("IL orchestrator adds additional retirement income to auto-computed amount", () => {
    const federal = makeFederal({
      agi: d(80000),
      socialSecurityBenefitsTaxable: d(10000),
      iraDistributionsTaxable: ZERO,
      pensionDistributionsTaxable: d(5000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      additionalRetirementIncome: d(3000),
    }));
    // Auto: 10000 + 0 + 5000 = 15000, additional: 3000, total: 18000
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(18000);
  });

  it("IL orchestrator passes filing status through", () => {
    const federal = makeFederal({ filingStatus: "married_filing_jointly" });
    const result = calculateIllinoisReturn(federal, makeILInput());
    // MFJ gets $5,700 personal exemption
    expect(result.personalExemption.toNumber()).toBe(5700);
  });

  it("IL orchestrator defaults optional inputs to zero", () => {
    const federal = makeFederal();
    const result = calculateIllinoisReturn(federal, makeILInput());
    // All optional amounts should be zero
    expect(result.householdEmploymentTax.toNumber()).toBe(0);
    expect(result.useTax.toNumber()).toBe(0);
    expect(result.compassionateUseSurcharge.toNumber()).toBe(0);
    expect(result.ilWithholding.toNumber()).toBe(0);
    expect(result.passThroughWithholding.toNumber()).toBe(0);
    expect(result.ilRefundSubtraction.toNumber()).toBe(0);
    expect(result.schedule1299CCredit.toNumber()).toBe(0);
  });

  it("IL orchestrator passes Schedule IL-WIT records through to IL-1040 Line 25", () => {
    const federal = makeFederal();
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(999),
      scheduleILWIT: {
        records: [
          {
            taxpayer: "primary",
            formType: "W-2",
            payerId: "11-1111111",
            federalAmount: d(50000),
            illinoisAmount: d(50000),
            illinoisWithheld: d(350),
          },
          {
            taxpayer: "primary",
            formType: "1099-DA",
            payerId: "22-2222222",
            federalAmount: d(2000),
            illinoisAmount: d(2000),
            illinoisWithheld: d(50),
          },
        ],
      },
    }));

    expect(result.ilWithholding.toNumber()).toBe(400);
    expect(result.scheduleILWIT?.totalWithholding.toNumber()).toBe(400);
  });

  // ==================== E2E Scenarios ====================

  it("W-2 employee single filer — simple wage income", () => {
    // AGI = 75000 from wages, no retirement income, no additions/subtractions
    // Base = 75000, exempt = 2850, net = 72150
    // Tax = 72150 × 0.0495 = 3571.425 → 3571
    // Withholding = 3700 → overpayment = 129
    const federal = makeFederal({ agi: d(75000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(3700),
    }));
    expect(result.baseIncome.toNumber()).toBe(75000);
    expect(result.netIncome.toNumber()).toBe(72150);
    expect(result.incomeTax.toNumber()).toBe(3571);
    expect(result.overpayment.toNumber()).toBe(129);
  });

  it("MFJ retired couple with Social Security and pension", () => {
    // AGI = 65000 (includes SS taxable 15000, pension taxable 20000)
    // Retirement subtraction = 15000 + 0 + 20000 = 35000
    // Total income = 65000 (AGI) + 0 + 0 = 65000
    // Total subtractions = 35000 + 0 + 0 = 35000
    // Base income = 65000 - 35000 = 30000
    // Exemptions: 5700 (MFJ) + 2000 (both 65+) = 7700
    // Net = 30000 - 7700 = 22300
    // Tax = 22300 × 0.0495 = 1103.85 → 1104
    // Property tax credit = 10000 × 5% = 500
    // Tax after credits = 1104 - 500 = 604
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(65000),
      socialSecurityBenefitsTaxable: d(15000),
      pensionDistributionsTaxable: d(20000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 2,
      ilWithholding: d(700),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(10000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(35000);
    expect(result.baseIncome.toNumber()).toBe(30000);
    expect(result.totalExemptions.toNumber()).toBe(7700);
    expect(result.netIncome.toNumber()).toBe(22300);
    expect(result.incomeTax.toNumber()).toBe(1104);
    expect(result.scheduleICRCredit.toNumber()).toBe(500);
    expect(result.taxAfterCredits.toNumber()).toBe(604);
    expect(result.overpayment.toNumber()).toBe(96);
  });

  it("Family with EITC, child tax credit, and K-12 education", () => {
    // HoH, AGI = 30000, federal EIC = 5000, 2 dependents, 1 child under 12
    // Base = 30000, exempt = 2850 + 5700 (2 deps) = 8550
    // Net = 30000 - 8550 = 21450
    // Tax = 21450 × 0.0495 = 1061.775 → 1062
    // Schedule ICR: education = (1500 - 250) × 25% = 312.50 → 313
    // Tax after credits = 1062 - 313 = 749
    // IL EITC = 5000 × 20% = 1000
    // IL CTC = 1000 × 40% = 400
    // Withholding = 1500
    // Total payments = 1500 + 1000 + 400 = 2900
    // Overpayment = 2900 - 749 = 2151
    const federal = makeFederal({
      filingStatus: "head_of_household",
      agi: d(30000),
      earnedIncomeCredit: d(5000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(5000), 2, true),
      ilWithholding: d(1500),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: ZERO,
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(1500),
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    expect(result.incomeTax.toNumber()).toBe(1062);
    expect(result.scheduleICRCredit.toNumber()).toBe(313);
    expect(result.taxAfterCredits.toNumber()).toBe(749);
    expect(result.ilEITC.toNumber()).toBe(1000);
    expect(result.ilChildTaxCredit.toNumber()).toBe(400);
    expect(result.overpayment.toNumber()).toBe(2151);
  });

  it("Multi-state worker with Schedule CR and Schedule M", () => {
    // Single, AGI = 120000, earned 40000 in Indiana
    // Schedule M: US govt interest = 3000, IL 529 = 8000
    // Retirement = 0
    // Total income = 120000 + 0 + 0 (Schedule M additions = 0) = 120000
    // Subtractions = 0 (retirement) + 0 (refund) + 11000 (Schedule M: 8000 + 3000) = 11000
    // Base = 120000 - 11000 = 109000
    // Exempt = 2850, net = 106150
    // Tax = 106150 × 0.0495 = 5254.425 → 5254
    // Schedule CR: decimal = 40000/109000 = 0.3670
    // IL tax on non-IL = 0.3670 × 5254 = 1928.218 → 1928
    // IN tax paid = 1300 → credit = 1300
    // Tax after credits = 5254 - 1300 = 3954
    const federal = makeFederal({
      agi: d(120000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(4500),
      scheduleM: {
        taxYear: 2025,
        filingStatus: "single",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: d(8000),
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: d(3000),
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: ZERO,
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(109000), // Must match base income
        nonIllinoisBaseIncome: d(40000),
        taxPaidToOtherStates: d(1300),
      },
    }));
    expect(result.scheduleM).toBeDefined();
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(8000);
    expect(result.baseIncome.toNumber()).toBe(109000);
    expect(result.incomeTax.toNumber()).toBe(5254);
    expect(result.scheduleCR).toBeDefined();
    expect(result.scheduleCR!.credit.toNumber()).toBe(1300);
    expect(result.taxAfterCredits.toNumber()).toBe(3954);
    expect(result.overpayment.toNumber()).toBe(546);
  });

  it("High-income MFJ with AGI over exemption threshold", () => {
    // MFJ, AGI = 550000 → all exemptions denied (> $500K)
    // Net = 550000, tax = 550000 × 0.0495 = 27225
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(550000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 1,
      dependentCount: 3,
      scheduleEEIC: makeScheduleEEIC(ZERO, 3),
      ilWithholding: d(27000),
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(550000);
    expect(result.incomeTax.toNumber()).toBe(27225);
    expect(result.taxDue.toNumber()).toBe(225);
  });

  it("IRA distribution retirement subtraction with property tax credit", () => {
    // Single retiree, AGI = 45000, IRA taxable = 20000, pension = 10000
    // Retirement subtraction = 0 + 20000 + 10000 = 30000
    // Base = 45000 - 30000 = 15000
    // Exempt = 2850 + 1000 (65+) = 3850
    // Net = 15000 - 3850 = 11150
    // Tax = 11150 × 0.0495 = 551.925 → 552
    // Property credit = 7000 × 5% = 350
    // Tax after credits = 552 - 350 = 202
    const federal = makeFederal({
      agi: d(45000),
      iraDistributionsTaxable: d(20000),
      pensionDistributionsTaxable: d(10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 1,
      ilWithholding: d(250),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(7000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(30000);
    expect(result.baseIncome.toNumber()).toBe(15000);
    expect(result.totalExemptions.toNumber()).toBe(3850);
    expect(result.incomeTax.toNumber()).toBe(552);
    expect(result.scheduleICRCredit.toNumber()).toBe(350);
    expect(result.taxAfterCredits.toNumber()).toBe(202);
    expect(result.overpayment.toNumber()).toBe(48);
  });

  it("MFS filer with IL refund subtraction and use tax", () => {
    const federal = makeFederal({
      filingStatus: "married_filing_separately",
      agi: d(55000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilRefundSubtraction: d(400),
      useTax: d(75),
      ilWithholding: d(2500),
    }));
    // Base = 55000 - 400 = 54600
    // Exempt = 2850, net = 51750
    // Tax = 51750 × 0.0495 = 2561.625 → 2562
    // Total tax = 2562 + 75 = 2637
    expect(result.baseIncome.toNumber()).toBe(54600);
    expect(result.incomeTax.toNumber()).toBe(2562);
    expect(result.totalTax.toNumber()).toBe(2637);
    expect(result.taxDue.toNumber()).toBe(137);
  });

  it("Zero income produces zero tax", () => {
    const federal = makeFederal({ agi: ZERO });
    const result = calculateIllinoisReturn(federal, makeILInput());
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.taxDue.toNumber()).toBe(0);
    expect(result.overpayment.toNumber()).toBe(0);
  });

  it("IL-2210 penalty flows through orchestrator", () => {
    const federal = makeFederal({ agi: d(100000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.il2210).toBeDefined();
    expect(result.il2210!.penaltyRequired).toBe(true);
    expect(result.underpaymentPenalty.greaterThan(0)).toBe(true);
    expect(result.totalTax.toNumber()).toBe(
      result.taxAfterCredits
        .plus(result.householdEmploymentTax)
        .plus(result.useTax)
        .plus(result.compassionateUseSurcharge)
        .toNumber(),
    );
    expect(result.taxDue.greaterThan(result.preliminaryTaxDue)).toBe(true);
  });

  it("IL orchestrator passes IL-2210 farmer exemption through", () => {
    const federal = makeFederal({ agi: d(100000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
        qualifiesAsFarmer: true,
      },
    }));

    expect(result.il2210).toBeDefined();
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("Pass-through withholding and PTE credit flow through", () => {
    const federal = makeFederal({ agi: d(75000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      passThroughWithholding: d(500),
      passThroughEntityTaxCredit: d(200),
      ilWithholding: d(3000),
    }));
    // Total payments = 3000 + 0 + 500 + 200 + 0 + 0 = 3700
    expect(result.passThroughWithholding.toNumber()).toBe(500);
    expect(result.passThroughEntityTaxCredit.toNumber()).toBe(200);
    expect(result.totalPayments.toNumber()).toBe(3700);
    expect(result.overpayment.toNumber()).toBe(129);
  });

  it("QSS filing status maps correctly", () => {
    const federal = makeFederal({
      filingStatus: "qualifying_surviving_spouse",
      agi: d(90000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 1,
      scheduleEEIC: makeScheduleEEIC(ZERO, 1),
    }));
    // QSS gets $2,850 personal exemption + $2,850 dependent
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.dependentExemption.toNumber()).toBe(2850);
  });

  it("Comprehensive family scenario — all schedules", () => {
    // MFJ, AGI = 95000, SS taxable = 5000, pension = 8000
    // Tax-exempt interest = 600
    // Federal EIC = 2000, 2 dependents, 1 child under 12
    // Schedule M: 529 = 12000, US govt interest = 1500
    // Schedule ICR: property tax = 6000, education = 1000
    // IL withholding = 4000, estimated = 500
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(95000),
      taxExemptInterest: d(600),
      socialSecurityBenefitsTaxable: d(5000),
      pensionDistributionsTaxable: d(8000),
      earnedIncomeCredit: d(2000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(2000), 2, true),
      ilWithholding: d(4000),
      estimatedPayments: d(500),
      scheduleM: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: d(12000),
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: d(1500),
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: ZERO,
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(1000),
        volunteerEmergencyWorkerCount: 0,
      },
    }));

    // Total income = 95000 + 600 + 0 (Schedule M additions = 0) = 95600
    expect(result.totalIncome.toNumber()).toBe(95600);

    // Subtractions = 13000 (retirement: 5000+8000) + 0 (refund) + 13500 (Schedule M: 12000+1500)
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(13000);
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(12000);
    expect(result.otherSubtractions.toNumber()).toBe(13500);
    expect(result.totalSubtractions.toNumber()).toBe(26500);

    // Base = 95600 - 26500 = 69100
    expect(result.baseIncome.toNumber()).toBe(69100);

    // Exemptions: 5700 (MFJ) + 5700 (2 deps) = 11400
    expect(result.totalExemptions.toNumber()).toBe(11400);

    // Net = 69100 - 11400 = 57700
    expect(result.netIncome.toNumber()).toBe(57700);

    // Tax = 57700 × 0.0495 = 2856.15 → 2856
    expect(result.incomeTax.toNumber()).toBe(2856);

    // Schedule ICR: property = 6000 × 5% = 300, education = (1000-250)×25% = 187.50 → 188
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(300);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(188);
    expect(result.scheduleICRCredit.toNumber()).toBe(488);

    // Tax after credits = 2856 - 488 = 2368
    expect(result.taxAfterCredits.toNumber()).toBe(2368);

    // IL EITC = 2000 × 20% = 400
    // IL CTC = 400 × 40% = 160
    expect(result.ilEITC.toNumber()).toBe(400);
    expect(result.ilChildTaxCredit.toNumber()).toBe(160);

    // Total payments = 4000 + 500 + 0 + 0 + 400 + 160 = 5060
    expect(result.totalPayments.toNumber()).toBe(5060);

    // Overpayment = 5060 - 2368 = 2692
    expect(result.overpayment.toNumber()).toBe(2692);
  });

  it("Negative federal AGI produces zero IL tax", () => {
    const federal = makeFederal({
      agi: d(-10000),
      totalIncome: d(-10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput());
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Very high income with all optional taxes", () => {
    const federal = makeFederal({
      filingStatus: "single",
      agi: d(500000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      householdEmploymentTax: d(300),
      useTax: d(150),
      compassionateUseSurcharge: d(200),
      ilWithholding: d(24000),
    }));
    // AGI > $250K → no exemptions
    expect(result.totalExemptions.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(500000);
    // Tax = 500000 × 0.0495 = 24750
    expect(result.incomeTax.toNumber()).toBe(24750);
    // Total tax = 24750 + 300 + 150 + 200 = 25400
    expect(result.totalTax.toNumber()).toBe(25400);
    // Due = 25400 - 24000 = 1400
    expect(result.taxDue.toNumber()).toBe(1400);
  });

  it("Audit trail includes all forms when schedules are provided", () => {
    const federal = makeFederal({ agi: d(75000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(5000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("IL-1040")).toBe(true);
    expect(forms.has("Schedule ICR")).toBe(true);
  });

  it("Orchestrator with Schedule IL-E/EIC computes EITC and CTC via module", () => {
    const federal = makeFederal({
      agi: d(25000),
      earnedIncomeCredit: d(4000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
          { relationship: "child", isUnder12: false, monthsInHome: 12 },
        ],
        federalEIC: d(4000),
      },
    }));
    // IL EITC = 4000 × 20% = 800
    expect(result.ilEITC.toNumber()).toBe(800);
    // IL CTC = 800 × 40% = 320 (child under 12 via schedule)
    expect(result.ilChildTaxCredit.toNumber()).toBe(320);
    // Schedule result is attached
    expect(result.scheduleEEIC).toBeDefined();
    expect(result.scheduleEEIC!.dependentCount).toBe(2);
    expect(result.scheduleEEIC!.hasChildUnder12).toBe(true);
    // Dependent exemption auto-derived from schedule: 2 × $2,850 = $5,700
    expect(result.dependentExemption.toNumber()).toBe(5700);
    // Audit trail includes Schedule IL-E/EIC
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("Schedule IL-E/EIC")).toBe(true);
  });

  it("Orchestrator auto-derives dependent count and hasChildUnder12 from Schedule E-EIC", () => {
    // No explicit dependentCount or hasChildUnder12 — derived from scheduleEEIC
    const federal = makeFederal({
      agi: d(40000),
      earnedIncomeCredit: d(3000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
          { relationship: "child", isUnder12: false, monthsInHome: 12 },
          { relationship: "stepchild", isUnder12: true, monthsInHome: 12 },
        ],
        federalEIC: d(3000),
      },
    }));
    // Dependent exemption auto-derived: 3 deps × $2,850 = $8,550
    expect(result.dependentExemption.toNumber()).toBe(8550);
    // Personal = $2,850, total = $2,850 + $8,550 = $11,400
    expect(result.totalExemptions.toNumber()).toBe(11400);
    // hasChildUnder12 auto-derived → CTC should be computed
    expect(result.ilChildTaxCredit.greaterThan(0)).toBe(true);
    // IL EITC = 3000 × 20% = 600, CTC = 600 × 40% = 240
    expect(result.ilEITC.toNumber()).toBe(600);
    expect(result.ilChildTaxCredit.toNumber()).toBe(240);
  });

  it("Orchestrator explicit dependentCount is overridden when scheduleEEIC provided", () => {
    const federal = makeFederal({
      agi: d(50000),
      earnedIncomeCredit: ZERO,
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 5, // Will be overridden by schedule's 1 dependent
      hasChildUnder12: false, // Will be overridden by schedule
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
        ],
        federalEIC: ZERO,
      },
    }));
    // Schedule has 1 dependent, not 5
    expect(result.dependentExemption.toNumber()).toBe(2850);
    expect(result.totalExemptions.toNumber()).toBe(5700); // 2850 personal + 2850 dep
  });

  it("Orchestrator does not derive Illinois child tax credit eligibility from Step 3-only qualifying children", () => {
    const federal = makeFederal({
      agi: d(25000),
      earnedIncomeCredit: d(3000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2, // Overridden by schedule's zero dependents
      hasChildUnder12: true, // Overridden by schedule
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [],
        qualifyingChildren: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
        ],
        federalEIC: d(3000),
      },
    }));

    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.scheduleEEIC?.dependentCount).toBe(0);
    expect(result.scheduleEEIC?.hasChildUnder12).toBe(false);
    expect(result.ilEITC.toNumber()).toBe(600);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("Orchestrator requires Schedule IL-E/EIC for dependent exemptions and IL EITC claims", () => {
    const federal = makeFederal({
      agi: d(50000),
      earnedIncomeCredit: d(2000),
    });
    expect(() => calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
    }))).toThrow(
      "IL-1040 Schedule IL-E/EIC is required when claiming dependent exemptions on Line 10d",
    );
  });

  it("Orchestrator with Use Tax Worksheet computes use tax from purchases", () => {
    const federal = makeFederal({
      agi: d(60000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(60000),
        generalMerchandisePurchases: d(800),
        qualifyingFoodDrugMedicalPurchases: d(200),
        salesTaxPaidToOtherStates: d(10),
      },
    }));
    // General: 800 × 0.0625 = 50, Qualifying: 200 × 0.01 = 2
    // Net: 50 + 2 - 10 = 42
    expect(result.useTax.toNumber()).toBe(42);
    expect(result.useTaxWorksheet).toBeDefined();
    expect(result.useTaxWorksheet!.tableAmount.toNumber()).toBe(31); // AGI 60K
    expect(result.useTaxWorksheet!.requiresST44).toBe(false);
  });

  it("Orchestrator use tax worksheet overrides raw useTax when both provided", () => {
    const federal = makeFederal({
      agi: d(80000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      useTax: d(999), // Raw input — should be ignored when worksheet provided
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(80000),
        generalMerchandisePurchases: d(400),
        qualifyingFoodDrugMedicalPurchases: ZERO,
        salesTaxPaidToOtherStates: ZERO,
      },
    }));
    // General: 400 × 0.0625 = 25
    expect(result.useTax.toNumber()).toBe(25);
  });

  it("Orchestrator MFJ use tax worksheet with ST-44 threshold", () => {
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(100000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        federalAGI: d(100000),
        generalMerchandisePurchases: d(15000),
        qualifyingFoodDrugMedicalPurchases: ZERO,
        salesTaxPaidToOtherStates: ZERO,
      },
    }));
    // General: 15000 × 0.0625 = 937.50 → 938
    expect(result.useTax.toNumber()).toBe(938);
    expect(result.useTaxWorksheet!.requiresST44).toBe(false); // Under $1,200 MFJ threshold
  });
});

// ===========================================================================
// Schedule NR Integration Through Orchestrator
// ===========================================================================

describe("Orchestrator Schedule NR — Nonresident / Part-Year", () => {
  // Helpers for dual-column amounts
  function zeroDC() { return { columnA: ZERO, columnB: ZERO }; }
  function dc(a: number, b: number) { return { columnA: d(a), columnB: d(b) }; }

  function makeNRSchedule(overrides: Record<string, unknown> = {}) {
    const base = {
      taxYear: 2025,
      residencyType: "nonresident" as const,
      income: {
        wages: zeroDC(), interest: zeroDC(), dividends: zeroDC(),
        taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
        capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
        pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
        unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
      },
      adjustments: {
        educatorExpenses: zeroDC(), certainBusinessExpenses: zeroDC(),
        hsaDeduction: zeroDC(), movingExpenses: zeroDC(), seTaxDeduction: zeroDC(),
        sepSimpleDeduction: zeroDC(), seHealthInsurance: zeroDC(),
        earlyWithdrawalPenalty: zeroDC(), alimonyPaid: zeroDC(),
        iraDeduction: zeroDC(), studentLoanInterest: zeroDC(),
        archerMSA: zeroDC(), otherAdjustments: zeroDC(),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
        retirementSubtraction: zeroDC(), ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
    };
    return { ...base, ...overrides };
  }

  it("Orchestrator Schedule NR — nonresident basic flow", () => {
    // Nonresident: $90K total wages, $45K IL → alloc = 0.500
    // No retirement, no additions/subtractions
    // Full base = 90000, exempt = 2850
    // NR: IL base = 45000, alloc = 45000/90000 = 0.500
    //     allocated exempt = 2850 × 0.500 = 1425
    //     IL net = 45000 - 1425 = 43575
    //     IL tax = 43575 × 0.0495 = 2157 (rounded)
    const federal = makeFederal({ agi: d(90000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(2200),
      scheduleNR: makeNRSchedule({
        income: {
          wages: dc(90000, 45000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR).toBeDefined();
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.5);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(45000);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(1425);
    expect(result.netIncome.toNumber()).toBe(43575);
    expect(result.incomeTax.toNumber()).toBe(2157);
    expect(result.overpayment.toNumber()).toBe(43); // 2200 - 2157
  });

  it("Orchestrator NR — part-year resident with mixed income", () => {
    // Part-year: $80K wages ($60K IL), $10K interest ($5K IL business)
    // Federal AGI = 90000
    // Full base = 90000, NR IL base = 65000
    // alloc = 65000 / 90000 = 0.722
    // alloc exempt = 2850 × 0.722 = 2058 (rounded)
    // IL net = 65000 - 2058 = 62942
    // IL tax = 62942 × 0.0495 = 3116 (rounded)
    const federal = makeFederal({
      agi: d(90000),
      totalInterest: d(10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(3000),
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(80000, 60000), interest: dc(10000, 5000), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.722);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(65000);
    expect(result.netIncome.toNumber()).toBe(62942);
    expect(result.incomeTax.toNumber()).toBe(3116);
    expect(result.taxDue.toNumber()).toBe(116); // 3116 - 3000
  });

  it("Orchestrator NR — retirement auto-mapping with nonresident (Column B = $0)", () => {
    // Nonresident with pension: federal has $15K pension taxable, $10K SS taxable
    // Orchestrator auto-computes retirement subtraction = 15000 + 10000 = 25000
    // Full base = 60000 - 25000 = 35000
    // NR: wages $35K (all non-IL), pension $15K (NR Column B = $0), SS $10K (NR Column B = $0)
    // NR IL base = 0 (all income from other states and retirement)
    // alloc = 0/35000 = 0, IL tax = 0
    const federal = makeFederal({
      agi: d(60000),
      pensionDistributionsTaxable: d(15000),
      socialSecurityBenefitsTaxable: d(10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleNR: makeNRSchedule({
        income: {
          wages: dc(35000, 0), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: dc(15000, 0), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: dc(10000, 0), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
          retirementSubtraction: dc(25000, 0), // Non-IL retirement, Column B = $0
          ilRefundSubtraction: zeroDC(), otherSubtractions: zeroDC(),
        },
      }),
    }));

    // Retirement subtraction auto-mapped from federal
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(25000);
    // Full base = 60000 - 25000 = 35000
    expect(result.baseIncome.toNumber()).toBe(35000);
    // NR: no IL income → zero tax
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Orchestrator NR — part-year with retirement partially in IL", () => {
    // Part-year resident who received pension while living in IL
    // Federal: AGI = $70K, pension taxable = $20K, SS taxable = $5K
    // Auto retirement subtraction = 20000 + 5000 = 25000
    // Full base = 70000 - 25000 = 45000
    // NR: wages dc(45000, 30000), pension dc(20000, 10000), SS dc(5000, 2000)
    // NR retirement subtraction: dc(25000, 12000) — $12K received while IL resident
    // NR total income: A = 70000, B = 42000
    // NR subtractions: A = 25000, B = 12000
    // NR base income B = 42000 - 12000 = 30000
    // alloc = 30000 / 45000 = 0.667
    const federal = makeFederal({
      agi: d(70000),
      pensionDistributionsTaxable: d(20000),
      socialSecurityBenefitsTaxable: d(5000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(1500),
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(45000, 30000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: dc(20000, 10000), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: dc(5000, 2000), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
          retirementSubtraction: dc(25000, 12000),
          ilRefundSubtraction: zeroDC(), otherSubtractions: zeroDC(),
        },
      }),
    }));

    expect(result.retirementIncomeSubtraction.toNumber()).toBe(25000);
    expect(result.baseIncome.toNumber()).toBe(45000);
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.667);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(30000);
    // alloc exempt = 2850 × 0.667 = 1901 (rounded)
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(1901);
    // IL net = 30000 - 1901 = 28099
    expect(result.netIncome.toNumber()).toBe(28099);
    // IL tax = 28099 × 0.0495 = 1391 (rounded)
    expect(result.incomeTax.toNumber()).toBe(1391);
  });

  it("Orchestrator NR — EITC and CTC allocated by NR decimal", () => {
    // Part-year: $28K wages ($14K IL) → 50% allocation
    // Federal EIC = $4000, 1 dependent child under 12
    // IL EITC = 4000 × 20% × 0.500 = 400
    // IL CTC = 400 × 40% = 160
    const federal = makeFederal({
      agi: d(28000),
      earnedIncomeCredit: d(4000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 1,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(4000), 1, true),
      ilWithholding: d(500),
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(28000, 14000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.allocationDecimal!.toNumber()).toBe(0.5);
    expect(result.ilEITC.toNumber()).toBe(400);
    expect(result.ilChildTaxCredit.toNumber()).toBe(160);
    // Total payments = 500 + 400 + 160 = 1060
    expect(result.totalPayments.toNumber()).toBe(1060);
  });

  it("Orchestrator NR — Schedule E-EIC + NR allocates credits correctly", () => {
    // Part-year with Schedule E-EIC providing dependents
    // $30K AGI, $18K IL wages → 60% allocation
    // Federal EIC = $3500, 2 dependents (1 under 12)
    // IL EITC = 3500 × 20% × 0.600 = 420
    // IL CTC = 420 × 40% = 168
    const federal = makeFederal({
      agi: d(30000),
      earnedIncomeCredit: d(3500),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 7 },
          { relationship: "child", isUnder12: false, monthsInHome: 7 },
        ],
        federalEIC: d(3500),
      },
      ilWithholding: d(800),
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(30000, 18000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.allocationDecimal!.toNumber()).toBe(0.6);
    // Dependent count from Schedule E-EIC
    expect(result.scheduleEEIC).toBeDefined();
    expect(result.scheduleEEIC!.dependentCount).toBe(2);
    expect(result.dependentExemption.toNumber()).toBe(5700); // 2 × $2,850
    // IL EITC = 3500 × 0.20 × 0.600 = 420
    expect(result.ilEITC.toNumber()).toBe(420);
    // IL CTC = 420 × 0.40 = 168
    expect(result.ilChildTaxCredit.toNumber()).toBe(168);
    // Audit trail has both Schedule NR and Schedule IL-E/EIC
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("Schedule NR")).toBe(true);
    expect(forms.has("Schedule IL-E/EIC")).toBe(true);
  });

  it("Orchestrator NR — explicit nonresident returns only keep the volunteer Schedule ICR credit", () => {
    // Nonresident: $100K total, $70K IL → alloc = 0.700
    // Full base = 100000, exempt = 2850
    // NR IL base = 70000, alloc exempt = 2850 × 0.700 = 1995
    // IL net = 70000 - 1995 = 68005
    // IL tax = 68005 × 0.0495 = 3366 (rounded)
    // Property tax and education credits are not allowed for explicit nonresidents.
    // Volunteer credit = 500, so tax after credits = 3366 - 500 = 2866.
    const federal = makeFederal({ agi: d(100000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(3000),
      scheduleNR: makeNRSchedule({
        income: {
          wages: dc(100000, 70000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(8000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(2000),
        volunteerEmergencyWorkerCount: 1,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));

    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.7);
    expect(result.incomeTax.toNumber()).toBe(3366);
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.volunteerCredit.toNumber()).toBe(500);
    expect(result.scheduleICRCredit.toNumber()).toBe(500);
    expect(result.taxAfterCredits.toNumber()).toBe(2866);
    expect(result.taxDue.toNumber()).toBe(0); // 3000 withholding > 2866
    expect(result.overpayment.toNumber()).toBe(134); // 3000 - 2866
  });

  it("Orchestrator NR — Schedule M subtractions flow through NR computation", () => {
    // Part-year: $80K wages (all IL), $5K US govt interest subtraction
    // Schedule M subtractions = 5000
    // Full base = 80000 - 5000 = 75000
    // NR: all income in IL (alloc = 1.0)
    const federal = makeFederal({ agi: d(80000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(3500),
      scheduleM: {
        taxYear: 2025,
        filingStatus: "single",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: ZERO,
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: d(5000),
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: ZERO,
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(80000, 80000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
          retirementSubtraction: zeroDC(), ilRefundSubtraction: zeroDC(),
          otherSubtractions: dc(5000, 5000), // US govt interest subtracted in both columns
        },
      }),
    }));

    // Full base = 80000 - 5000 = 75000 (Schedule M subtraction)
    expect(result.baseIncome.toNumber()).toBe(75000);
    // NR: all in IL → alloc = 1.000
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(1);
    // With alloc = 1.0, NR net = 75000 - 2850 = 72150
    expect(result.netIncome.toNumber()).toBe(72150);
    // Tax = 72150 × 0.0495 = 3571 (rounded)
    expect(result.incomeTax.toNumber()).toBe(3571);
  });

  it("Orchestrator NR — MFJ nonresident with dependents keeps volunteer credit but not property tax credit", () => {
    // MFJ nonresident: $150K total ($80K IL wages)
    // 2 dependents, 65+, property tax, both spouses with volunteer certificates
    // Full base = 150000
    // Exempt = 5700 (MFJ) + 1000 (65+) + 5700 (2 deps) = 12400
    // NR IL base = 80000, alloc = 80000/150000 = 0.533
    // alloc exempt = 12400 × 0.533 = 6609 (rounded)
    // IL net = 80000 - 6609 = 73391
    // IL tax = 73391 × 0.0495 = 3633 (rounded)
    // Property credit is unavailable to explicit nonresidents.
    // Volunteer credit = 1000, so tax after credits = 3633 - 1000 = 2633.
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(150000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 1,
      dependentCount: 2,
      scheduleEEIC: makeScheduleEEIC(ZERO, 2),
      ilWithholding: d(3200),
      scheduleNR: makeNRSchedule({
        income: {
          wages: dc(150000, 80000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(12000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 2,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-2001", "VEW-2002"],
      },
    }));

    expect(result.totalExemptions.toNumber()).toBe(12400);
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.533);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(6609);
    expect(result.netIncome.toNumber()).toBe(73391);
    expect(result.incomeTax.toNumber()).toBe(3633);
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.volunteerCredit.toNumber()).toBe(1000);
    expect(result.scheduleICRCredit.toNumber()).toBe(1000);
    expect(result.taxAfterCredits.toNumber()).toBe(2633);
  });

  it("Orchestrator NR — nonresident with zero IL income produces zero tax", () => {
    // Nonresident working entirely outside IL
    const federal = makeFederal({ agi: d(75000) });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleNR: makeNRSchedule({
        income: {
          wages: dc(75000, 0), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Orchestrator NR — 100% IL income allocation equals full resident computation", () => {
    // Part-year who earned ALL income while in IL → alloc = 1.000
    // Should produce same tax as a full-year resident
    const federal = makeFederal({ agi: d(60000) });

    // Full resident computation (no NR)
    const resident = calculateIllinoisReturn(federal, makeILInput());

    // NR with 100% IL
    const nonresident = calculateIllinoisReturn(federal, makeILInput({
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(60000, 60000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(nonresident.scheduleNR!.allocationDecimal.toNumber()).toBe(1);
    // With 100% allocation, NR tax should equal full resident tax
    expect(nonresident.incomeTax.toNumber()).toBe(resident.incomeTax.toNumber());
    expect(nonresident.netIncome.toNumber()).toBe(resident.netIncome.toNumber());
  });

  it("Orchestrator NR — comprehensive multi-schedule scenario", () => {
    // Part-year MFJ: $120K AGI ($80K IL wages, $20K non-IL rental, $10K pension, $10K interest)
    // Federal: pension taxable = $10K, no SS
    // Retirement auto-mapped = 10000
    // Full base = 120000 - 10000 (retirement) - 8000 (529 via Schedule M) = 102000
    // NR: IL base = 80000 + 5000 (IL interest) - 8000 (529 sub IL) = 77000
    //     alloc = 77000 / 102000 = 0.755
    // Exemptions: 5700 (MFJ) + 5700 (2 deps) = 11400
    //     alloc exempt = 11400 × 0.755 = 8607
    // IL net = 77000 - 8607 = 68393
    // IL tax = 68393 × 0.0495 = 3385 (rounded)
    // Schedule ICR: property = 6000 × 5% = 300
    // IL EITC = 2500 × 0.20 × 0.755 = 378 (rounded)
    // IL CTC = 378 × 0.40 = 151 (rounded)
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(120000),
      pensionDistributionsTaxable: d(10000),
      earnedIncomeCredit: d(2500),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(2500), 2, true),
      ilWithholding: d(3500),
      scheduleM: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: ZERO,
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: d(8000),
        distributiveShareSubtractions: ZERO,
        restorationClaimOfRight: ZERO,
        jobTrainingContributions: ZERO,
        federalCreditRelatedExpenses: ZERO,
        medicalDebtRelief: ZERO,
        ilDepreciationSubtraction: ZERO,
        ableContributions: ZERO,
        militaryPay: ZERO,
        usGovernmentInterest: ZERO,
        recoveryOfItemsDeducted: ZERO,
        ridesharing: ZERO,
        lifeInsurancePayment: ZERO,
        lloydsIncome: ZERO,
        funeralTrustIncome: ZERO,
        healthCareProviderLoanRepayment: ZERO,
        naziPersecutionReparations: ZERO,
        ilBondInterest: ZERO,
        nonUSGovernmentBondInterest: ZERO,
        childUSGovernmentInterest: ZERO,
        railroadIncome: ZERO,
        unjustImprisonmentCompensation: ZERO,
        plan529DistributionsForCredits: ZERO,
        cannabisDisallowedDeductions: ZERO,
        fertilityFraudAward: ZERO,
      },
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          wages: dc(80000, 80000), interest: dc(10000, 5000), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: dc(10000, 0), rentalAndPartnership: dc(20000, 0), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
          retirementSubtraction: dc(10000, 0), // Pension not IL source
          ilRefundSubtraction: zeroDC(),
          otherSubtractions: dc(8000, 8000), // 529 subtracted in both columns
        },
      }),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));

    // Verify retirement auto-mapping
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(10000);
    // Full base = 120000 - 10000 - 8000 = 102000
    expect(result.baseIncome.toNumber()).toBe(102000);
    // NR produces allocated results
    expect(result.scheduleNR).toBeDefined();
    expect(result.scheduleICR).toBeDefined();
    expect(result.scheduleM).toBeDefined();

    // All schedule audit trails are present
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("IL-1040")).toBe(true);
    expect(forms.has("Schedule NR")).toBe(true);
    expect(forms.has("Schedule M")).toBe(true);
    expect(forms.has("Schedule ICR")).toBe(true);

    // EITC and CTC allocated by NR decimal
    expect(result.ilEITC.greaterThan(0)).toBe(true);
    expect(result.ilChildTaxCredit.greaterThan(0)).toBe(true);
    expect(result.ilEITC.lessThan(d(500))).toBe(true); // < full 2500×20% = 500
    expect(result.ilChildTaxCredit.lessThan(d(200))).toBe(true); // < full 500×40% = 200
  });
});

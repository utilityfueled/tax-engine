/**
 * Illinois IL-1040 Edge Cases — Boundary Conditions and Interaction Effects
 *
 * Tests complex interactions between IL schedules, filing-status variations,
 * threshold boundaries, and realistic multi-source income scenarios.
 *
 * Source: Illinois Department of Revenue, 2025 IL-1040 Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateIL1040, type IL1040Input } from "@/engine/state/il-1040.js";
import { calculateIllinoisReturn, type ILStateInput } from "@/engine/state/il-orchestrator.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { ScheduleMInput } from "@/engine/state/il-schedule-m.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<IL1040Input> = {}): IL1040Input {
  const input: IL1040Input = {
    taxYear: 2025,
    filingStatus: "single",
    federalAGI: d(75000),
    federalEIC: ZERO,
    taxExemptInterest: ZERO,
    otherAdditions: ZERO,
    retirementIncomeSubtraction: ZERO,
    ilRefundSubtraction: ZERO,
    otherSubtractions: ZERO,
    claimedAsDependent: false,
    age65OrOlderCount: 0,
    blindCount: 0,
    dependentCount: 0,
    investmentCreditRecapture: ZERO,
    otherStateCredit: ZERO,
    schedule1299CCredit: ZERO,
    householdEmploymentTax: ZERO,
    useTax: ZERO,
    compassionateUseSurcharge: ZERO,
    ilWithholding: ZERO,
    estimatedPayments: ZERO,
    passThroughWithholding: ZERO,
    passThroughEntityTaxCredit: ZERO,
    hasChildUnder12: false,
    ...overrides,
  };

  const effectiveScheduleICR = input.scheduleICR?.propertyTaxPaid.greaterThan(0)
    && input.scheduleICR.propertyTaxProperties === undefined
    ? {
        ...input.scheduleICR,
        propertyTaxProperties: [
          {
            county: "Sangamon",
            propertyNumber: "14-22-100-001",
          },
        ],
      }
    : input.scheduleICR;

  if (input.scheduleEEIC) {
    return {
      ...input,
      scheduleICR: effectiveScheduleICR,
    };
  }

  const autoDependentCount = Math.max(input.dependentCount, input.hasChildUnder12 ? 1 : 0);
  if (autoDependentCount === 0 && input.federalEIC.isZero()) {
    return {
      ...input,
      scheduleICR: effectiveScheduleICR,
    };
  }

  return {
    ...input,
    scheduleICR: effectiveScheduleICR,
    scheduleEEIC: makeScheduleEEIC(input.federalEIC, autoDependentCount, input.hasChildUnder12),
  };
}

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

const zeroScheduleM: ScheduleMInput = {
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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IL Edge Cases — Exemption AGI Thresholds", () => {
  it("Single AGI exactly $250,000 — exemptions preserved", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(250000),
      age65OrOlderCount: 1,
      blindCount: 1,
      dependentCount: 2,
    }));
    // $250K is NOT > $250K, so exemptions are allowed
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.age65Exemption.toNumber()).toBe(1000);
    expect(result.blindExemption.toNumber()).toBe(1000);
    expect(result.dependentExemption.toNumber()).toBe(5700);
    expect(result.totalExemptions.toNumber()).toBe(10550);
  });

  it("Single AGI $250,001 — all exemptions denied", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(250001),
      age65OrOlderCount: 1,
      blindCount: 1,
      dependentCount: 2,
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
    // Net income = base income (all 250001 since no subtractions)
    expect(result.netIncome.toNumber()).toBe(250001);
  });

  it("MFJ AGI exactly $500,000 — exemptions preserved", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(500000),
      age65OrOlderCount: 2,
      dependentCount: 3,
    }));
    // $5,700 (MFJ personal) + $2,000 (both 65+) + $8,550 (3 deps × $2,850) = $16,250
    expect(result.totalExemptions.toNumber()).toBe(16250);
  });

  it("MFJ AGI $500,001 — all exemptions denied", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(500001),
      age65OrOlderCount: 2,
      dependentCount: 3,
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
  });

  it("HoH AGI exactly $250,000 — uses 'other' threshold, exemptions preserved", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "head_of_household",
      federalAGI: d(250000),
      dependentCount: 1,
    }));
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.dependentExemption.toNumber()).toBe(2850);
  });

  it("MFS AGI $250,001 — exemptions denied", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_separately",
      federalAGI: d(250001),
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
  });

  it("Exemption threshold applies to federal AGI, not base income", () => {
    // AGI = 260000, but subtractions reduce base income below threshold
    // Exemption check uses AGI (Line 1), not base income (Line 9)
    const result = calculateIL1040(makeInput({
      federalAGI: d(260000),
      retirementIncomeSubtraction: d(100000),
    }));
    // Base = 160000, but AGI > $250K → no exemptions
    expect(result.baseIncome.toNumber()).toBe(160000);
    expect(result.totalExemptions.toNumber()).toBe(0);
  });
});

describe("IL Edge Cases — Dependent Exemption Boundaries", () => {
  it("Single claimed as dependent, base income exactly $2,850 — gets $2,850", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(2850),
      claimedAsDependent: true,
    }));
    expect(result.personalExemption.toNumber()).toBe(2850);
    // Net income = base - exemption = 2850 - 2850 = 0
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });

  it("Single claimed as dependent, base income $2,851 — gets $0", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(2851),
      claimedAsDependent: true,
    }));
    expect(result.personalExemption.toNumber()).toBe(0);
    // Net income = 2851 - 0 = 2851
    expect(result.netIncome.toNumber()).toBe(2851);
    // Tax = 2851 × 0.0495 = 141.1245 → 141
    expect(result.incomeTax.toNumber()).toBe(141);
  });

  it("MFJ one claimed, base income exactly $2,850 — gets $5,700", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(2850),
      claimedAsDependent: true,
      spouseClaimedAsDependent: false,
    }));
    expect(result.personalExemption.toNumber()).toBe(5700);
  });

  it("MFJ one claimed, base income $2,851 — drops to $2,850", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(2851),
      claimedAsDependent: true,
      spouseClaimedAsDependent: false,
    }));
    expect(result.personalExemption.toNumber()).toBe(2850);
  });

  it("MFJ both claimed, base income exactly $5,700 — gets $5,700", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(5700),
      claimedAsDependent: true,
      spouseClaimedAsDependent: true,
    }));
    expect(result.personalExemption.toNumber()).toBe(5700);
    expect(result.netIncome.toNumber()).toBe(0);
  });

  it("MFJ both claimed, base income $5,701 — gets $0", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(5701),
      claimedAsDependent: true,
      spouseClaimedAsDependent: true,
    }));
    expect(result.personalExemption.toNumber()).toBe(0);
  });

  it("Claimed as dependent + high AGI — AGI threshold also denies exemptions", () => {
    // Both conditions deny: claimed as dependent with high base income AND AGI > threshold
    const result = calculateIL1040(makeInput({
      federalAGI: d(300000),
      claimedAsDependent: true,
    }));
    expect(result.personalExemption.toNumber()).toBe(0);
    expect(result.totalExemptions.toNumber()).toBe(0);
  });
});

describe("IL Edge Cases — Zero and Near-Zero Income", () => {
  it("Zero income produces zero tax and zero refund (no credits)", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: ZERO,
    }));
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.overpayment.toNumber()).toBe(0);
    expect(result.taxDue.toNumber()).toBe(0);
  });

  it("Zero income with EITC produces refund from refundable credits only", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: ZERO,
      federalEIC: d(5000),
      hasChildUnder12: true,
      dependentCount: 1,
    }));
    // Tax = 0
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
    // IL EITC = 5000 × 20% = 1000
    expect(result.ilEITC.toNumber()).toBe(1000);
    // IL CTC = 1000 × 40% = 400
    expect(result.ilChildTaxCredit.toNumber()).toBe(400);
    // Total payments/credits = 1000 + 400 = 1400
    // Overpayment = 1400 - 0 = 1400
    expect(result.overpayment.toNumber()).toBe(1400);
  });

  it("Income of $1 — tax rounds to zero", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(1),
    }));
    // Base = 1, exempt = 2850, net = 0
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });

  it("Negative AGI with subtractions — base income still floors at zero", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(-50000),
      retirementIncomeSubtraction: d(10000),
    }));
    // Total income = -50000, total subtractions = 10000
    // Base = max(-50000 - 10000, 0) = 0
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });

  it("Very small positive base income after subtractions", () => {
    // AGI = 30000, retirement = 29999
    // Base = 1, exempt = 2850 → net = 0
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      retirementIncomeSubtraction: d(29999),
    }));
    expect(result.baseIncome.toNumber()).toBe(1);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });
});

describe("IL Edge Cases — Refundable Credits Exceed Tax", () => {
  it("Large EITC produces refund even with no withholding", () => {
    // AGI = 20000, federal EIC = 6000, 2 dependents, child under 12
    // Base = 20000, exempt = 2850 + 5700 = 8550
    // Net = 11450, tax = 11450 × 0.0495 = 566.775 → 567
    // IL EITC = 6000 × 0.20 = 1200
    // IL CTC = 1200 × 0.40 = 480
    // Total payments = 0 + 1200 + 480 = 1680
    // Overpayment = 1680 - 567 = 1113
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      federalEIC: d(6000),
      dependentCount: 2,
      hasChildUnder12: true,
    }));
    expect(result.incomeTax.toNumber()).toBe(567);
    expect(result.ilEITC.toNumber()).toBe(1200);
    expect(result.ilChildTaxCredit.toNumber()).toBe(480);
    expect(result.overpayment.toNumber()).toBe(1113);
  });

  it("IL CTC requires BOTH IL EITC > 0 AND child under 12", () => {
    // Has child under 12 but no federal EIC → no IL EITC → no IL CTC
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      federalEIC: ZERO,
      hasChildUnder12: true,
      dependentCount: 1,
    }));
    expect(result.ilEITC.toNumber()).toBe(0);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("IL EITC > 0 but no child under 12 — no IL CTC", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      federalEIC: d(3000),
      hasChildUnder12: false,
      dependentCount: 1,
    }));
    expect(result.ilEITC.toNumber()).toBe(600);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("Withholding + EITC + CTC together produce large refund", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(5000),
      hasChildUnder12: true,
      dependentCount: 2,
      ilWithholding: d(1200),
      estimatedPayments: d(300),
    }));
    // IL EITC = 1000, IL CTC = 400
    // Total payments = 1200 + 300 + 0 + 0 + 1000 + 400 = 2900
    // Tax = (25000 - 2850 - 5700) × 0.0495 = 16450 × 0.0495 = 814.275 → 814
    expect(result.incomeTax.toNumber()).toBe(814);
    expect(result.totalPayments.toNumber()).toBe(2900);
    expect(result.overpayment.toNumber()).toBe(2086);
  });
});

describe("IL Edge Cases — Credit Interactions", () => {
  it("Nonrefundable credits cannot exceed income tax", () => {
    // Small tax, large credits
    const result = calculateIL1040(makeInput({
      federalAGI: d(5000),
      otherStateCredit: d(1000),
      schedule1299CCredit: d(500),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(10000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(5000),
        volunteerEmergencyWorkerCount: 1,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));
    // Base = 5000, exempt = 2850, net = 2150
    // Tax = 2150 × 0.0495 = 106.425 → 106
    // Credits sum would be > 106, but capped at 106
    expect(result.incomeTax.toNumber()).toBe(106);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(106);
    expect(result.taxAfterCredits.toNumber()).toBe(0);
  });

  it("Schedule ICR credits applied in order: property → education → volunteer", () => {
    // Tax = 500
    // Property credit = 300 → remaining = 200
    // Education credit = 150 → remaining = 50
    // Volunteer credit = 500 → capped at 50
    const result = calculateIL1040(makeInput({
      federalAGI: d(15000),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),           // → 300 credit
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(850),        // → (850-250)×25% = 150
        volunteerEmergencyWorkerCount: 1,    // → 500, but capped
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));
    // Base = 15000, exempt = 2850, net = 12150
    // Tax = 12150 × 0.0495 = 601.425 → 601
    const icr = result.scheduleICR!;
    expect(icr.propertyTaxCredit.toNumber()).toBe(300);
    expect(icr.educationCredit.toNumber()).toBe(150);
    expect(icr.volunteerCredit.toNumber()).toBe(151); // remaining tax after 300+150 = 151
    expect(icr.totalCredit.toNumber()).toBe(601);
    expect(result.taxAfterCredits.toNumber()).toBe(0);
  });

  it("High-AGI denies property and education credits but allows volunteer", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(260000),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(10000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(3000),
        volunteerEmergencyWorkerCount: 1,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));
    const icr = result.scheduleICR!;
    // Property and education denied at AGI > $250K single
    expect(icr.propertyTaxCredit.toNumber()).toBe(0);
    expect(icr.educationCredit.toNumber()).toBe(0);
    // Volunteer has no AGI limit
    expect(icr.volunteerCredit.toNumber()).toBe(500);
  });

  it("Schedule CR + Schedule ICR combined — CR reduces remaining for ICR", () => {
    // Tax = 4809, CR credit = 1200, remaining for ICR = 3609
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(100000),
        nonIllinoisBaseIncome: d(30000),
        taxPaidToOtherStates: d(1200),
      },
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(8000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    // Tax = 97150 × 0.0495 = 4808.925 → 4809
    expect(result.incomeTax.toNumber()).toBe(4809);
    // CR credit = 1200
    expect(result.otherStateCredit.toNumber()).toBe(1200);
    // ICR: remaining after CR = 4809 - 1200 = 3609
    // Property = 8000 × 5% = 400, fits within 3609
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(400);
    // Total nonrefundable = 1200 + 400 = 1600
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1600);
    expect(result.taxAfterCredits.toNumber()).toBe(3209);
  });
});

describe("IL Edge Cases — Schedule CR Boundary Conditions", () => {
  it("100% non-Illinois income — CR decimal = 1.0, credit limited to tax paid", () => {
    // All income from another state
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(80000),
        nonIllinoisBaseIncome: d(80000),
        taxPaidToOtherStates: d(2000),
      },
    }));
    expect(result.scheduleCR!.crDecimal.toNumber()).toBe(1);
    // IL tax = 3819, IL tax on non-IL = 1.0 × 3819 = 3819
    // Credit = min(2000, 3819) = 2000
    expect(result.scheduleCR!.credit.toNumber()).toBe(2000);
  });

  it("Non-IL income > total base income — CR decimal capped at 1.0", () => {
    // This shouldn't normally happen, but test the cap
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(80000),
        nonIllinoisBaseIncome: d(90000), // More than total
        taxPaidToOtherStates: d(5000),
      },
    }));
    // Decimal should be capped at 1.0
    expect(result.scheduleCR!.crDecimal.toNumber()).toBeLessThanOrEqual(1);
  });

  it("Zero base income — CR decimal = 0, no credit", () => {
    // Base income is zero (losses wiped it out)
    const result = calculateIL1040(makeInput({
      federalAGI: d(10000),
      retirementIncomeSubtraction: d(10000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: ZERO,
        nonIllinoisBaseIncome: d(5000),
        taxPaidToOtherStates: d(500),
      },
    }));
    // No base income → no allocation possible
    expect(result.scheduleCR!.crDecimal.toNumber()).toBe(0);
    expect(result.scheduleCR!.credit.toNumber()).toBe(0);
  });

  it("Very small non-IL portion — tiny credit", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(100000),
        nonIllinoisBaseIncome: d(100),
        taxPaidToOtherStates: d(50),
      },
    }));
    // CR decimal = 100/100000 = 0.001
    // IL tax on non-IL = 0.001 × 4809 = 4.809 → 5
    // Credit = min(50, 5) = 5
    expect(result.scheduleCR!.credit.toNumber()).toBe(5);
  });
});

describe("IL Edge Cases — Retirement Income Full Subtraction", () => {
  it("Fully retired, all income is retirement — zero IL tax", () => {
    // AGI = 40000 (all from SS + pension), retirement subtraction = 40000
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(40000),
      retirementIncomeSubtraction: d(40000),
      age65OrOlderCount: 2,
    }));
    expect(result.totalSubtractions.toNumber()).toBe(40000);
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });

  it("Retirement subtraction exceeds AGI — base income floors at zero", () => {
    // AGI = 30000, retirement = 35000 (possible with addition items)
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      retirementIncomeSubtraction: d(35000),
    }));
    expect(result.baseIncome.toNumber()).toBe(0);
  });

  it("Retirement subtraction + 529 + US govt interest eliminates base income", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(50000),
      retirementIncomeSubtraction: d(30000),
      scheduleM: {
        ...zeroScheduleM,
        filingStatus: "married_filing_jointly",
        il529Contributions: d(15000),
        usGovernmentInterest: d(10000),
      },
    }));
    // Total income = 50000 + 0 + 0 = 50000
    // Subtractions = 30000 + 0 + 25000 (15K 529 + 10K USgov) = 55000
    // Base = max(50000 - 55000, 0) = 0
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
  });
});

describe("IL Edge Cases — Other Taxes", () => {
  it("Other taxes apply even when credits eliminate income tax", () => {
    // Very low income → tax = 0, but use tax and household employment tax still apply
    const result = calculateIL1040(makeInput({
      federalAGI: d(3000),
      householdEmploymentTax: d(400),
      useTax: d(150),
      compassionateUseSurcharge: d(100),
    }));
    // Base = 3000, exempt = 2850, net = 150
    // Tax = 150 × 0.0495 = 7.425 → 7
    // Total tax = 7 + 400 + 150 + 100 = 657
    expect(result.incomeTax.toNumber()).toBe(7);
    expect(result.totalTax.toNumber()).toBe(657);
  });

  it("Use tax only scenario — no income tax but owes use tax", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(2000),
      useTax: d(75),
    }));
    // Net = 0 (2000 - 2850 = 0), tax = 0, total tax = 75
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(75);
    expect(result.taxDue.toNumber()).toBe(75);
  });
});

describe("IL Edge Cases — IL-2210 Penalty Interactions", () => {
  it("IL-2210 net tax under $1,000 — no penalty required", () => {
    // AGI = 20000, tax after credits = 850, EITC = 0
    // Net tax for penalty = 850, which is < $1000
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      dependentCount: 1, // Extra exemption reduces tax
      il2210: {
        priorYearTax: d(2000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    // Base = 20000, exempt = 2850 + 2850 = 5700, net = 14300
    // Tax = 14300 × 0.0495 = 707.85 → 708
    expect(result.incomeTax.toNumber()).toBe(708);
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 net tax under $500 for MFS — no penalty required", () => {
    // MFS has lower threshold of $500
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_separately",
      federalAGI: d(12000),
      il2210: {
        priorYearTax: d(2000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    // Base = 12000, exempt = 2850, net = 9150
    // Tax = 9150 × 0.0495 = 452.925 → 453
    expect(result.incomeTax.toNumber()).toBe(453);
    expect(result.il2210!.penaltyRequired).toBe(false);
  });

  it("EITC reduces net tax for IL-2210 calculation", () => {
    // AGI = 30000, federal EIC = 3000, 1 dep
    // Tax = (30000 - 2850 - 2850) × 0.0495 = 24300 × 0.0495 = 1202.85 → 1203
    // IL EITC = 600, net tax for IL-2210 = 1203 - 600 = 603 < $1000 → no penalty
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      federalEIC: d(3000),
      dependentCount: 1,
      il2210: {
        priorYearTax: d(1500),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("Withholding sufficient to avoid penalty even without estimated payments", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      ilWithholding: d(5000), // More than 90% of current-year tax
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });
});

describe("IL Edge Cases — Orchestrator Complex Scenarios", () => {
  it("Military family with overseas pay subtraction", () => {
    // HoH, AGI = 55000, includes military pay of 12000
    // Schedule M: military pay = 12000
    // 2 dependents, 1 child under 12, federal EIC = 2500
    const federal = makeFederal({
      filingStatus: "head_of_household",
      agi: d(55000),
      earnedIncomeCredit: d(2500),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(2500), 2, true),
      ilWithholding: d(2000),
      scheduleM: {
        ...zeroScheduleM,
        filingStatus: "head_of_household",
        militaryPay: d(12000),
      },
    }));
    // Total income = 55000, subtractions = 0 (retirement) + 0 (refund) + 12000 (Schedule M military)
    // Base = 55000 - 12000 = 43000
    expect(result.baseIncome.toNumber()).toBe(43000);
    // Exempt = 2850 + 5700 = 8550, net = 34450
    expect(result.netIncome.toNumber()).toBe(34450);
    // Tax = 34450 × 0.0495 = 1705.275 → 1705
    expect(result.incomeTax.toNumber()).toBe(1705);
    // IL EITC = 2500 × 0.20 = 500
    expect(result.ilEITC.toNumber()).toBe(500);
    // IL CTC = 500 × 0.40 = 200
    expect(result.ilChildTaxCredit.toNumber()).toBe(200);
    // Total payments = 2000 + 500 + 200 = 2700
    // Overpayment = 2700 - 1705 = 995
    expect(result.overpayment.toNumber()).toBe(995);
  });

  it("Self-employed with pass-through entities and PTE credit", () => {
    // Single, AGI = 150000
    // K-1 distributive additions = 5000, subtractions = 2000
    // Pass-through withholding = 2000, PTE credit = 3000
    const federal = makeFederal({
      agi: d(150000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(5000),
      passThroughWithholding: d(2000),
      passThroughEntityTaxCredit: d(3000),
      scheduleM: {
        ...zeroScheduleM,
        distributiveShareAdditions: d(5000),
        distributiveShareSubtractions: d(2000),
      },
    }));
    // Total income = 150000 + 0 + 5000 = 155000
    expect(result.totalIncome.toNumber()).toBe(155000);
    // Subtractions = 0 + 0 + 2000 = 2000
    expect(result.totalSubtractions.toNumber()).toBe(2000);
    // Base = 153000, exempt = 2850, net = 150150
    expect(result.netIncome.toNumber()).toBe(150150);
    // Tax = 150150 × 0.0495 = 7432.425 → 7432
    expect(result.incomeTax.toNumber()).toBe(7432);
    // Total payments = 5000 + 0 + 2000 + 3000 + 0 + 0 = 10000
    expect(result.totalPayments.toNumber()).toBe(10000);
    expect(result.overpayment.toNumber()).toBe(2568);
  });

  it("Orchestrator auto-computes retirement from all three federal sources", () => {
    // SS taxable = 12000, IRA taxable = 5000, pension taxable = 8000
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(60000),
      socialSecurityBenefitsTaxable: d(12000),
      iraDistributionsTaxable: d(5000),
      pensionDistributionsTaxable: d(8000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 2,
    }));
    // Retirement subtraction = 12000 + 5000 + 8000 = 25000
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(25000);
    // Base = 60000 - 25000 = 35000
    expect(result.baseIncome.toNumber()).toBe(35000);
  });

  it("Orchestrator with additional retirement on top of auto-computed", () => {
    // Government pension of 10000 not captured by federal 3 lines
    const federal = makeFederal({
      agi: d(80000),
      socialSecurityBenefitsTaxable: d(5000),
      pensionDistributionsTaxable: d(10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      additionalRetirementIncome: d(10000),
    }));
    // Auto = 5000 + 0 + 10000 = 15000, additional = 10000, total = 25000
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(25000);
  });
});

describe("IL Edge Cases — Rounding", () => {
  it("Tax rounds to nearest dollar (banker's rounding)", () => {
    // Find a net income that produces a .50 tax amount to test rounding
    // Net income = 50505 → 50505 × 0.0495 = 2499.9975 → 2500
    const result = calculateIL1040(makeInput({
      federalAGI: d(53355),
    }));
    // Base = 53355, exempt = 2850, net = 50505
    // Tax = 50505 × 0.0495 = 2499.9975 → 2500
    expect(result.netIncome.toNumber()).toBe(50505);
    expect(result.incomeTax.toNumber()).toBe(2500);
  });

  it("IL EITC rounds to nearest dollar", () => {
    // Federal EIC = 3333 → IL EITC = 3333 × 0.20 = 666.60 → 667
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      federalEIC: d(3333),
    }));
    expect(result.ilEITC.toNumber()).toBe(667);
  });

  it("IL CTC rounds to nearest dollar", () => {
    // Federal EIC = 3333 → IL EITC = 667 → IL CTC = 667 × 0.40 = 266.80 → 267
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      federalEIC: d(3333),
      hasChildUnder12: true,
    }));
    expect(result.ilChildTaxCredit.toNumber()).toBe(267);
  });
});

describe("IL Edge Cases — Filing Status Variations", () => {
  it("All five filing statuses produce correct personal exemption", () => {
    const statuses: Array<{ fs: IL1040Input["filingStatus"]; expected: number }> = [
      { fs: "single", expected: 2850 },
      { fs: "married_filing_jointly", expected: 5700 },
      { fs: "married_filing_separately", expected: 2850 },
      { fs: "head_of_household", expected: 2850 },
      { fs: "qualifying_surviving_spouse", expected: 2850 },
    ];
    for (const { fs, expected } of statuses) {
      const result = calculateIL1040(makeInput({ filingStatus: fs }));
      expect(result.personalExemption.toNumber()).toBe(expected);
    }
  });

  it("MFS and single have same exemption thresholds and amounts", () => {
    const single = calculateIL1040(makeInput({
      filingStatus: "single",
      federalAGI: d(100000),
      dependentCount: 1,
    }));
    const mfs = calculateIL1040(makeInput({
      filingStatus: "married_filing_separately",
      federalAGI: d(100000),
      dependentCount: 1,
    }));
    expect(single.totalExemptions.toNumber()).toBe(mfs.totalExemptions.toNumber());
    expect(single.incomeTax.toNumber()).toBe(mfs.incomeTax.toNumber());
  });

  it("QSS with dependents — personal exemption plus dependent exemptions", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(80000),
      dependentCount: 2,
    }));
    // QSS: $2,850 personal + $5,700 (2 deps) = $8,550
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.dependentExemption.toNumber()).toBe(5700);
    expect(result.totalExemptions.toNumber()).toBe(8550);
  });
});

describe("IL Edge Cases — Schedule M 529 and ABLE Interaction", () => {
  it("529 and ABLE both at single caps — $10K each", () => {
    const result = calculateIL1040(makeInput({
      scheduleM: {
        ...zeroScheduleM,
        il529Contributions: d(15000),
        ableContributions: d(12000),
      },
    }));
    // 529 capped at 10000, ABLE capped at 10000
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(10000);
    expect(result.scheduleM!.ableSubtraction.toNumber()).toBe(10000);
    expect(result.otherSubtractions.toNumber()).toBe(20000);
  });

  it("529 and ABLE both at MFJ caps — $20K each", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      scheduleM: {
        ...zeroScheduleM,
        filingStatus: "married_filing_jointly",
        il529Contributions: d(25000),
        ableContributions: d(22000),
      },
    }));
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(20000);
    expect(result.scheduleM!.ableSubtraction.toNumber()).toBe(20000);
    expect(result.otherSubtractions.toNumber()).toBe(40000);
  });

  it("Schedule M additions and subtractions net — only Line 3 and Line 7 flow", () => {
    const result = calculateIL1040(makeInput({
      scheduleM: {
        ...zeroScheduleM,
        nonIL529Earnings: d(2000),         // Addition
        distributiveShareAdditions: d(500), // Addition
        il529Contributions: d(5000),       // Subtraction
        usGovernmentInterest: d(1000),     // Subtraction
      },
    }));
    // Additions = 2000 + 500 = 2500
    expect(result.otherAdditions.toNumber()).toBe(2500);
    // Subtractions = 5000 + 1000 = 6000
    expect(result.otherSubtractions.toNumber()).toBe(6000);
    // Total income = 75000 + 0 + 2500 = 77500
    expect(result.totalIncome.toNumber()).toBe(77500);
    // Base = 77500 - 6000 = 71500
    expect(result.baseIncome.toNumber()).toBe(71500);
  });
});

describe("IL Edge Cases — Comprehensive Realistic Scenarios", () => {
  it("Dual-income MFJ family — wages + retirement + property + education + EITC", () => {
    // MFJ, AGI = 55000, SS taxable = 3000, pension = 5000
    // Property tax = 6000, K-12 education = 1500
    // Federal EIC = 3000, 2 dependents, 1 child under 12
    // IL withholding = 2000, 529 = 8000
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(55000),
      socialSecurityBenefitsTaxable: d(3000),
      pensionDistributionsTaxable: d(5000),
      earnedIncomeCredit: d(3000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      dependentCount: 2,
      hasChildUnder12: true,
      scheduleEEIC: makeScheduleEEIC(d(3000), 2, true),
      ilWithholding: d(2000),
      scheduleM: {
        ...zeroScheduleM,
        filingStatus: "married_filing_jointly",
        il529Contributions: d(8000),
      },
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(1500),
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    // Retirement = 3000 + 0 + 5000 = 8000
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(8000);
    // Total income = 55000 + 0 + 0 = 55000
    // Subtractions = 8000 + 0 + 8000 (529) = 16000
    // Base = 55000 - 16000 = 39000
    expect(result.baseIncome.toNumber()).toBe(39000);
    // Exemptions = 5700 (MFJ) + 5700 (2 deps) = 11400
    expect(result.totalExemptions.toNumber()).toBe(11400);
    // Net = 39000 - 11400 = 27600
    expect(result.netIncome.toNumber()).toBe(27600);
    // Tax = 27600 × 0.0495 = 1366.2 → 1366
    expect(result.incomeTax.toNumber()).toBe(1366);
    // Property credit = 6000 × 5% = 300
    // Education = (1500-250) × 25% = 312.50 → 313
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(300);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(313);
    // Tax after credits = 1366 - 613 = 753
    expect(result.taxAfterCredits.toNumber()).toBe(753);
    // IL EITC = 3000 × 0.20 = 600
    // IL CTC = 600 × 0.40 = 240
    expect(result.ilEITC.toNumber()).toBe(600);
    expect(result.ilChildTaxCredit.toNumber()).toBe(240);
    // Total payments = 2000 + 0 + 0 + 0 + 600 + 240 = 2840
    expect(result.totalPayments.toNumber()).toBe(2840);
    // Overpayment = 2840 - 753 = 2087
    expect(result.overpayment.toNumber()).toBe(2087);
  });

  it("High-income multi-state professional — no exemptions, Schedule CR", () => {
    // Single, AGI = 350000, earned 100000 in MO
    // Schedule M: US govt interest = 5000
    // No exemptions (AGI > $250K)
    const federal = makeFederal({
      agi: d(350000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(16000),
      estimatedPayments: d(2000),
      scheduleM: {
        ...zeroScheduleM,
        usGovernmentInterest: d(5000),
      },
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(345000), // 350000 - 5000
        nonIllinoisBaseIncome: d(100000),
        taxPaidToOtherStates: d(4900),
      },
    }));
    // Total income = 350000, subtractions = 5000 (US govt), base = 345000
    expect(result.baseIncome.toNumber()).toBe(345000);
    // No exemptions (AGI > $250K)
    expect(result.totalExemptions.toNumber()).toBe(0);
    // Net = 345000, tax = 345000 × 0.0495 = 17077.50 → 17078
    expect(result.netIncome.toNumber()).toBe(345000);
    expect(result.incomeTax.toNumber()).toBe(17078);
    // CR decimal = 100000/345000 = 0.2899 (4 decimal places)
    // IL tax on non-IL = 0.2899 × 17078 = 4951.5222 → 4952
    // Credit = min(4900, 4952) = 4900
    expect(result.otherStateCredit.toNumber()).toBe(4900);
    // Tax after credits = 17078 - 4900 = 12178
    expect(result.taxAfterCredits.toNumber()).toBe(12178);
    // Total payments = 16000 + 2000 = 18000
    // Overpayment = 18000 - 12178 = 5822
    expect(result.overpayment.toNumber()).toBe(5822);
  });

  it("Recently retired single — mixed income in first year of retirement", () => {
    // Single, AGI = 85000: wages 50000, SS 10000 taxable, pension 15000, IRA 10000
    // Age 65+, property tax = 9000
    // IL withholding from wages = 2000, estimated payments = 500
    const federal = makeFederal({
      agi: d(85000),
      socialSecurityBenefitsTaxable: d(10000),
      pensionDistributionsTaxable: d(15000),
      iraDistributionsTaxable: d(10000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      age65OrOlderCount: 1,
      ilWithholding: d(2000),
      estimatedPayments: d(500),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(9000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    // Retirement = 10000 + 10000 + 15000 = 35000
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(35000);
    // Base = 85000 - 35000 = 50000
    expect(result.baseIncome.toNumber()).toBe(50000);
    // Exempt = 2850 + 1000 (65+) = 3850
    expect(result.totalExemptions.toNumber()).toBe(3850);
    // Net = 50000 - 3850 = 46150
    expect(result.netIncome.toNumber()).toBe(46150);
    // Tax = 46150 × 0.0495 = 2284.425 → 2284
    expect(result.incomeTax.toNumber()).toBe(2284);
    // Property credit = 9000 × 5% = 450
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(450);
    // Tax after credits = 2284 - 450 = 1834
    expect(result.taxAfterCredits.toNumber()).toBe(1834);
    // Payments = 2000 + 500 = 2500
    // Overpayment = 2500 - 1834 = 666
    expect(result.overpayment.toNumber()).toBe(666);
  });

  it("Large family MFJ — 5 dependents, 65+ couple, blind, max exemptions", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 5,
      age65OrOlderCount: 2,
      blindCount: 1,
    }));
    // Personal = 5700, age65 = 2000, blind = 1000, dep = 14250 (5 × 2850)
    // Total = 5700 + 2000 + 1000 + 14250 = 22950
    expect(result.totalExemptions.toNumber()).toBe(22950);
    // Net = 200000 - 22950 = 177050
    expect(result.netIncome.toNumber()).toBe(177050);
    // Tax = 177050 × 0.0495 = 8763.975 → 8764
    expect(result.incomeTax.toNumber()).toBe(8764);
  });

  it("Dependent college student — claimed as dependent, minimal income", () => {
    // AGI = 4000 from summer job, claimed as dependent
    const result = calculateIL1040(makeInput({
      federalAGI: d(4000),
      claimedAsDependent: true,
      ilWithholding: d(200),
    }));
    // Base = 4000, claimed as dependent with base > $2,850 → exemption = $0
    expect(result.personalExemption.toNumber()).toBe(0);
    // Net = 4000, tax = 4000 × 0.0495 = 198
    expect(result.netIncome.toNumber()).toBe(4000);
    expect(result.incomeTax.toNumber()).toBe(198);
    // Overpayment = 200 - 198 = 2
    expect(result.overpayment.toNumber()).toBe(2);
  });

  it("Volunteer firefighter couple — volunteer credit with no AGI limit", () => {
    // MFJ, AGI = 600000, both are volunteer emergency workers
    // All other credits denied due to high AGI, but volunteer has no AGI limit
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(600000),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(15000),      // Denied (AGI > $500K MFJ)
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(3000),   // Denied (AGI > $500K MFJ)
        volunteerEmergencyWorkerCount: 2, // $1,000, no AGI limit
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-2001", "VEW-2002"],
      },
    }));
    // No exemptions (AGI > $500K)
    expect(result.totalExemptions.toNumber()).toBe(0);
    // Net = 600000, tax = 600000 × 0.0495 = 29700
    expect(result.incomeTax.toNumber()).toBe(29700);
    // ICR: property = 0, education = 0, volunteer = 1000
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.volunteerCredit.toNumber()).toBe(1000);
    expect(result.scheduleICRCredit.toNumber()).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// NR + IL-2210 Integration and All-Schedule Combinations
// ---------------------------------------------------------------------------

describe("IL Edge Cases — NR + IL-2210 Penalty Integration", () => {
  // NR schedule helper for edge case tests
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

  it("Nonresident + IL-2210 penalty — underpayment on NR-reduced tax", () => {
    // Single nonresident: $100K total wages, $50K IL wages
    // No retirement, no additions/subtractions, no credits
    // IL withholding = $500 (vastly underpaid), prior year tax = $2,800
    //
    // NR: allocationDecimal = 50000/100000 = 0.500
    //     allocatedExemptions = round(2850 × 0.500) = $1,425
    //     ilNetIncome = 50000 - 1425 = $48,575
    //     ilTax = round(48575 × 0.0495) = $2,404
    //
    // IL-2210: netTax = $2,404 > $1,000 → penalty applies
    //   90% current year = round(2404 × 0.9) = $2,164
    //   requiredAnnual = min(2164, 2800) = $2,164
    //   requiredInstallment = round(2164/4) = $541
    //   quarterlyWithholding = round(500/4) = $125
    //   Q1-4 underpayment = 541-125 = $416 each
    //   Penalty = $29 + $24 + $17 + $7 = $77
    const federal = makeFederal({
      agi: d(100000),
      totalWages: d(100000),
      totalIncome: d(100000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(500),
      scheduleNR: makeNRSchedule({
        income: {
          ...makeNRSchedule().income,
          wages: dc(100000, 50000),
        },
      }),
      il2210: {
        priorYearTax: d(2800),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO] as [Decimal, Decimal, Decimal, Decimal],
      },
    }));

    // NR allocation
    expect(result.scheduleNR).toBeDefined();
    expect(result.allocationDecimal!.toNumber()).toBe(0.5);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(50000);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(1425);
    expect(result.netIncome.toNumber()).toBe(48575);
    expect(result.incomeTax.toNumber()).toBe(2404);

    // IL-2210 penalty
    expect(result.il2210).toBeDefined();
    expect(result.il2210!.penaltyRequired).toBe(true);
    expect(result.il2210!.netTax.toNumber()).toBe(2404);
    expect(result.il2210!.requiredAnnualPayment.toNumber()).toBe(2164);
    expect(result.il2210!.requiredInstallment.toNumber()).toBe(541);
    expect(result.il2210!.quarters[0].underpayment.toNumber()).toBe(416);
    expect(result.il2210!.quarters[0].quarterPenalty.toNumber()).toBe(29);
    expect(result.il2210!.quarters[1].quarterPenalty.toNumber()).toBe(24);
    expect(result.il2210!.quarters[2].quarterPenalty.toNumber()).toBe(17);
    expect(result.il2210!.quarters[3].quarterPenalty.toNumber()).toBe(7);
    expect(result.underpaymentPenalty.toNumber()).toBe(77);

    // Total tax and balance due
    expect(result.totalTax.toNumber()).toBe(2404);
    expect(result.totalPayments.toNumber()).toBe(500);
    expect(result.taxDue.toNumber()).toBe(1981);
  });

  it("Nonresident with EITC — NR-allocated credits reduce net tax below $1K penalty threshold", () => {
    // Single nonresident, AGI = $35K, IL wages = $20K
    // Federal EIC = $2,000, has child under 12
    //
    // NR: alloc = 20000/35000 = 0.571
    //     allocatedExemptions = round(2850 × 0.571) = $1,627
    //     ilNetIncome = 20000 - 1627 = $18,373
    //     ilTax = round(18373 × 0.0495) = $909
    //
    // IL EITC = round(2000 × 0.20 × 0.571) = round(228.4) = $228
    // IL CTC = round(228 × 0.40) = round(91.2) = $91
    //
    // IL-2210: netTax = 909 - (228+91) = 590 < $1,000 → NO penalty
    const federal = makeFederal({
      agi: d(35000),
      totalWages: d(35000),
      totalIncome: d(35000),
      earnedIncomeCredit: d(2000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      scheduleEEIC: makeScheduleEEIC(d(2000)),
      ilWithholding: d(500),
      scheduleNR: makeNRSchedule({
        income: {
          ...makeNRSchedule().income,
          wages: dc(35000, 20000),
        },
      }),
      il2210: {
        priorYearTax: d(2000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO] as [Decimal, Decimal, Decimal, Decimal],
      },
    }));

    // NR allocation
    expect(result.allocationDecimal!.toNumber()).toBe(0.571);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(20000);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(1627);
    expect(result.netIncome.toNumber()).toBe(18373);
    expect(result.incomeTax.toNumber()).toBe(909);

    // Refundable credits allocated by NR decimal
    expect(result.ilEITC.toNumber()).toBe(228);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);

    // IL-2210: net tax below threshold → no penalty
    expect(result.il2210).toBeDefined();
    expect(result.il2210!.netTax.toNumber()).toBe(681); // 909 - 228
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);

    // Balance due
    expect(result.totalTax.toNumber()).toBe(909); // no penalty
    expect(result.totalPayments.toNumber()).toBe(728);
    expect(result.taxDue.toNumber()).toBe(181);
  });

  it("Part-year MFJ all schedules — NR + M + ICR + E-EIC + Use Tax + IL-2210", () => {
    // Part-year MFJ: AGI = $90K (wages $60K IL + $15K non-IL, SS $5K, pension $10K)
    // Tax-exempt interest = $300, federal EIC = $2,000
    // 2 dependents (1 under 12), via Schedule E-EIC
    // Schedule M: 529 = $6K, US govt interest = $1K → subs = $7K
    // Schedule NR: wages A=$75K B=$60K, pensions A=$10K B=$0, SS A=$5K B=$0
    //   tax-exempt A=$300 B=$300, retirement A=$15K B=$0, otherSub A=$7K B=$7K
    // Schedule ICR: property = $4K, education = $800
    // Use Tax Worksheet: general merchandise = $400, qualifying = $100
    // IL-2210: prior year = $1,500, withholding = $500, no estimated
    //
    // IL-1040:
    //   Line 1: $90,000, Line 2: $300, Line 3: $0, Line 4: $90,300
    //   Line 5: $15,000, Line 7: $7,000, Line 8: $22,000
    //   Line 9: $68,300
    //   Exemptions: 5700+0+0+5700 = $11,400
    //
    // NR: ilBase = 60300-7000 = $53,300, fullBase = $68,300
    //   alloc = 53300/68300 = 0.780
    //   allocExempt = round(11400×0.780) = $8,892
    //   ilNet = 53300-8892 = $44,408
    //   ilTax = round(44408×0.0495) = $2,198
    //
    // ICR: property 4000×5%=$200, education (800-250)×25%=$138, total=$338
    // Tax after credits: 2198-338 = $1,860
    //
    // Use Tax: 400×6.25%=$25 + 100×1%=$1 = $26
    //
    // E-EIC: IL EITC = round(2000×0.20×0.780)=$312
    //        IL CTC = round(312×0.40)=$125
    //
    // IL-2210: totalTax input = 1860+0+26+0 = $1,886
    //   netTax = 1886-(312+125) = $1,449 > $1K → penalty
    //   90% = round(1449×0.9)=$1,304, prior=$1,500
    //   required = min(1304,1500) = $1,304
    //   installment = round(1304/4) = $326
    //   quarterlyW = round(500/4) = $125
    //   Q1-4 underpayment = 201 each
    //   Penalty: $14+$12+$8+$3 = $37
    //
    // Total tax: 1860+26+37 = $1,923
    // Total payments: 500+312+125 = $937
    // Tax due: $986
    const federal = makeFederal({
      filingStatus: "married_filing_jointly",
      agi: d(90000),
      totalWages: d(75000),
      taxExemptInterest: d(300),
      socialSecurityBenefitsTaxable: d(5000),
      pensionDistributionsTaxable: d(10000),
      earnedIncomeCredit: d(2000),
    });
    const result = calculateIllinoisReturn(federal, makeILInput({
      ilWithholding: d(500),
      scheduleM: {
        ...zeroScheduleM,
        filingStatus: "married_filing_jointly",
        il529Contributions: d(6000),
        usGovernmentInterest: d(1000),
      },
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(4000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(800),
        volunteerEmergencyWorkerCount: 0,
      },
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 6 },
          { relationship: "child", isUnder12: false, monthsInHome: 6 },
        ],
        federalEIC: d(2000),
      },
      scheduleNR: makeNRSchedule({
        residencyType: "part_year",
        income: {
          ...makeNRSchedule().income,
          wages: dc(75000, 60000),
          pensions: dc(10000, 0),
          socialSecurity: dc(5000, 0),
        },
        additionsSubtractions: {
          taxExemptInterest: dc(300, 300),
          otherAdditions: zeroDC(),
          retirementSubtraction: dc(15000, 0),
          ilRefundSubtraction: zeroDC(),
          otherSubtractions: dc(7000, 7000),
        },
      }),
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        federalAGI: d(90000),
        generalMerchandisePurchases: d(400),
        qualifyingFoodDrugMedicalPurchases: d(100),
        salesTaxPaidToOtherStates: ZERO,
      },
      il2210: {
        priorYearTax: d(1500),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO] as [Decimal, Decimal, Decimal, Decimal],
      },
    }));

    // All sub-schedules computed
    expect(result.scheduleM).toBeDefined();
    expect(result.scheduleNR).toBeDefined();
    expect(result.scheduleICR).toBeDefined();
    expect(result.scheduleEEIC).toBeDefined();
    expect(result.useTaxWorksheet).toBeDefined();
    expect(result.il2210).toBeDefined();

    // IL-1040 income lines
    expect(result.federalAGI.toNumber()).toBe(90000);
    expect(result.taxExemptInterest.toNumber()).toBe(300);
    expect(result.otherAdditions.toNumber()).toBe(0);
    expect(result.totalIncome.toNumber()).toBe(90300);

    // Subtractions
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(15000);
    expect(result.otherSubtractions.toNumber()).toBe(7000);
    expect(result.totalSubtractions.toNumber()).toBe(22000);
    expect(result.baseIncome.toNumber()).toBe(68300);

    // Exemptions
    expect(result.personalExemption.toNumber()).toBe(5700);
    expect(result.dependentExemption.toNumber()).toBe(5700);
    expect(result.totalExemptions.toNumber()).toBe(11400);

    // NR allocation
    expect(result.allocationDecimal!.toNumber()).toBe(0.780);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(53300);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(8892);
    expect(result.netIncome.toNumber()).toBe(44408);
    expect(result.incomeTax.toNumber()).toBe(2198);

    // ICR credits
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(200);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(138);
    expect(result.scheduleICRCredit.toNumber()).toBe(338);
    expect(result.taxAfterCredits.toNumber()).toBe(1860);

    // Use tax
    expect(result.useTaxWorksheet!.generalMerchandiseTax.toNumber()).toBe(25);
    expect(result.useTaxWorksheet!.qualifyingItemsTax.toNumber()).toBe(1);
    expect(result.useTax.toNumber()).toBe(26);

    // E-EIC refundable credits (NR-allocated)
    expect(result.ilEITC.toNumber()).toBe(312);
    expect(result.ilChildTaxCredit.toNumber()).toBe(125);

    // IL-2210 penalty
    expect(result.il2210!.netTax.toNumber()).toBe(1449);
    expect(result.il2210!.penaltyRequired).toBe(true);
    expect(result.il2210!.requiredAnnualPayment.toNumber()).toBe(1304);
    expect(result.il2210!.requiredInstallment.toNumber()).toBe(326);
    expect(result.il2210!.quarters[0].underpayment.toNumber()).toBe(201);
    expect(result.underpaymentPenalty.toNumber()).toBe(37);

    // Final: total tax and balance due
    expect(result.totalTax.toNumber()).toBe(1886); // 1860 + 26
    expect(result.totalPayments.toNumber()).toBe(937); // 500 + 312 + 125
    expect(result.taxDue.toNumber()).toBe(986);

    // Audit trail includes all 7 forms
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("IL-1040")).toBe(true);
    expect(forms.has("Schedule NR")).toBe(true);
    expect(forms.has("Schedule M")).toBe(true);
    expect(forms.has("Schedule ICR")).toBe(true);
    expect(forms.has("Schedule IL-E/EIC")).toBe(true);
    expect(forms.has("UT Worksheet")).toBe(true);
    expect(forms.has("IL-2210")).toBe(true);
  });
});

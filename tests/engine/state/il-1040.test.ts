/**
 * Tests for Illinois IL-1040 Individual Income Tax Return
 * Spec: spec/state/il-1040.yaml
 *
 * 2025: 4.95% flat rate, $2,850 personal exemption, $1,000 additional for 65+/blind
 * IL EITC = 20% of federal EIC, IL CTC = 40% of IL EITC (child under 12)
 * Source: Illinois Department of Revenue, 2025 IL-1040 Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateIL1040, computePersonalExemption, IL_CONSTANTS, type IL1040Input } from "@/engine/state/il-1040.js";


const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

/** Default minimal input for a single filer with $75,000 AGI */
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
    voluntaryCharitableDonations: ZERO,
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
    scheduleEEIC: {
      taxYear: input.taxYear,
      dependents: Array.from({ length: autoDependentCount }, (_, index) => ({
        relationship: "child",
        isUnder12: input.hasChildUnder12 && index === 0,
        monthsInHome: 12,
      })),
      federalEIC: input.federalEIC,
    },
  };
}

describe("Illinois IL-1040", () => {
  // ==================== Step 2: Income ====================

  it("IL-1040 Line 1 - federal AGI flows through", () => {
    const result = calculateIL1040(makeInput({ federalAGI: d(85000) }));
    expect(result.federalAGI.toNumber()).toBe(85000);
  });

  it("IL-1040 Line 2 - tax-exempt interest added", () => {
    const result = calculateIL1040(makeInput({ taxExemptInterest: d(1200) }));
    expect(result.taxExemptInterest.toNumber()).toBe(1200);
    // Total income = 75000 + 1200 + 0
    expect(result.totalIncome.toNumber()).toBe(76200);
  });

  it("IL-1040 Line 3 - other additions", () => {
    const result = calculateIL1040(makeInput({ otherAdditions: d(3000) }));
    expect(result.otherAdditions.toNumber()).toBe(3000);
    expect(result.totalIncome.toNumber()).toBe(78000);
  });

  it("IL-1040 Line 4 - total income", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(75000),
      taxExemptInterest: d(500),
      otherAdditions: d(1500),
    }));
    expect(result.totalIncome.toNumber()).toBe(77000);
  });

  // ==================== Step 3: Base Income ====================

  it("IL-1040 Line 5 - retirement income subtraction", () => {
    const result = calculateIL1040(makeInput({ retirementIncomeSubtraction: d(20000) }));
    expect(result.retirementIncomeSubtraction.toNumber()).toBe(20000);
    expect(result.totalSubtractions.toNumber()).toBe(20000);
  });

  it("IL-1040 Line 6 - IL refund subtraction", () => {
    const result = calculateIL1040(makeInput({ ilRefundSubtraction: d(800) }));
    expect(result.ilRefundSubtraction.toNumber()).toBe(800);
  });

  it("IL-1040 Line 7 - other subtractions", () => {
    const result = calculateIL1040(makeInput({ otherSubtractions: d(5000) }));
    expect(result.otherSubtractions.toNumber()).toBe(5000);
  });

  it("IL-1040 Line 8 - total subtractions", () => {
    const result = calculateIL1040(makeInput({
      retirementIncomeSubtraction: d(15000),
      ilRefundSubtraction: d(500),
      otherSubtractions: d(2000),
    }));
    expect(result.totalSubtractions.toNumber()).toBe(17500);
  });

  it("IL-1040 Line 9 - base income floors at zero", () => {
    // AGI = 5000, subtractions = 10000 → base income = 0
    const result = calculateIL1040(makeInput({
      federalAGI: d(5000),
      retirementIncomeSubtraction: d(10000),
    }));
    expect(result.baseIncome.toNumber()).toBe(0);
  });

  it("IL-1040 Line 9 - base income normal calculation", () => {
    // AGI = 75000, subtractions = 20000 → total income = 75000, base = 55000
    const result = calculateIL1040(makeInput({
      retirementIncomeSubtraction: d(20000),
    }));
    expect(result.baseIncome.toNumber()).toBe(55000);
  });

  // ==================== Step 4: Exemptions ====================

  describe("Personal Exemption (Line 10a)", () => {
    it("IL-1040 Line 10a - single not claimed as dependent gets $2,850", () => {
      const result = calculateIL1040(makeInput());
      expect(result.personalExemption.toNumber()).toBe(2850);
    });

    it("IL-1040 Line 10a - MFJ not claimed gets $5,700", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
      }));
      expect(result.personalExemption.toNumber()).toBe(5700);
    });

    it("IL-1040 Line 10a - single claimed as dependent with base income <= $2,850 gets $2,850", () => {
      const result = calculateIL1040(makeInput({
        federalAGI: d(2000),
        claimedAsDependent: true,
      }));
      expect(result.personalExemption.toNumber()).toBe(2850);
    });

    it("IL-1040 Line 10a - single claimed as dependent with base income > $2,850 gets $0", () => {
      const result = calculateIL1040(makeInput({
        federalAGI: d(10000),
        claimedAsDependent: true,
      }));
      expect(result.personalExemption.toNumber()).toBe(0);
    });

    it("IL-1040 Line 10a - AGI > $250,000 single denies all exemptions", () => {
      const result = calculateIL1040(makeInput({
        federalAGI: d(260000),
      }));
      expect(result.personalExemption.toNumber()).toBe(0);
      expect(result.totalExemptions.toNumber()).toBe(0);
    });

    it("IL-1040 Line 10a - AGI exactly $250,000 single still gets exemptions", () => {
      const result = calculateIL1040(makeInput({
        federalAGI: d(250000),
      }));
      expect(result.personalExemption.toNumber()).toBe(2850);
    });

    it("IL-1040 Line 10a - MFJ AGI > $500,000 denies all exemptions", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(510000),
      }));
      expect(result.personalExemption.toNumber()).toBe(0);
      expect(result.totalExemptions.toNumber()).toBe(0);
    });

    it("IL-1040 Line 10a - MFJ AGI exactly $500,000 still gets exemptions", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(500000),
      }));
      expect(result.personalExemption.toNumber()).toBe(5700);
    });

    it("IL-1040 Line 10a - HoH not claimed gets $2,850", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "head_of_household",
      }));
      expect(result.personalExemption.toNumber()).toBe(2850);
    });

    it("IL-1040 Line 10a - MFJ one spouse claimed, base income <= $2,850", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(2000),
        claimedAsDependent: true,
        spouseClaimedAsDependent: false,
      }));
      expect(result.personalExemption.toNumber()).toBe(5700);
    });

    it("IL-1040 Line 10a - MFJ one spouse claimed, base income > $2,850", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(50000),
        claimedAsDependent: true,
        spouseClaimedAsDependent: false,
      }));
      expect(result.personalExemption.toNumber()).toBe(2850);
    });

    it("IL-1040 Line 10a - MFJ both claimed, base income <= $5,700", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(5000),
        claimedAsDependent: true,
        spouseClaimedAsDependent: true,
      }));
      expect(result.personalExemption.toNumber()).toBe(5700);
    });

    it("IL-1040 Line 10a - MFJ both claimed, base income > $5,700", () => {
      const result = calculateIL1040(makeInput({
        filingStatus: "married_filing_jointly",
        federalAGI: d(50000),
        claimedAsDependent: true,
        spouseClaimedAsDependent: true,
      }));
      expect(result.personalExemption.toNumber()).toBe(0);
    });
  });

  it("IL-1040 Line 10b - age 65 exemption", () => {
    const result = calculateIL1040(makeInput({ age65OrOlderCount: 1 }));
    expect(result.age65Exemption.toNumber()).toBe(1000);
  });

  it("IL-1040 Line 10b - non-joint returns reject more than one age 65 exemption", () => {
    expect(() =>
      calculateIL1040(makeInput({
        filingStatus: "single",
        age65OrOlderCount: 2,
      }))
    ).toThrow("IL-1040 Line 10b age 65 count cannot exceed 1 unless filing jointly");
  });

  it("IL-1040 Line 10b - age 65 exemption both spouses MFJ", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      age65OrOlderCount: 2,
    }));
    expect(result.age65Exemption.toNumber()).toBe(2000);
  });

  it("IL-1040 Line 10c - blind exemption", () => {
    const result = calculateIL1040(makeInput({ blindCount: 1 }));
    expect(result.blindExemption.toNumber()).toBe(1000);
  });

  it("IL-1040 Line 10c - non-joint returns reject more than one blind exemption", () => {
    expect(() =>
      calculateIL1040(makeInput({
        filingStatus: "head_of_household",
        blindCount: 2,
      }))
    ).toThrow("IL-1040 Line 10c blind count cannot exceed 1 unless filing jointly");
  });

  it("IL-1040 Line 10d - dependent exemptions", () => {
    const result = calculateIL1040(makeInput({ dependentCount: 3 }));
    expect(result.dependentExemption.toNumber()).toBe(8550); // 3 × $2,850
    expect(result.scheduleEEIC?.dependentExemptionAllowance.toNumber()).toBe(8550);
  });

  it("IL-1040 Line 10 - total exemptions", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      age65OrOlderCount: 1,
      blindCount: 0,
      dependentCount: 2,
    }));
    // $5,700 + $1,000 + $0 + $5,700 = $12,400
    expect(result.totalExemptions.toNumber()).toBe(12400);
  });

  it("IL-1040 Line 10 - high AGI denies age/blind/dependent exemptions too", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(260000),
      age65OrOlderCount: 1,
      blindCount: 1,
      dependentCount: 2,
    }));
    expect(result.age65Exemption.toNumber()).toBe(0);
    expect(result.blindExemption.toNumber()).toBe(0);
    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.totalExemptions.toNumber()).toBe(0);
  });

  // ==================== Step 5: Net Income and Tax ====================

  it("IL-1040 Line 11 - net income", () => {
    // AGI 75000, base = 75000, exemptions = 2850, net = 72150
    const result = calculateIL1040(makeInput());
    expect(result.netIncome.toNumber()).toBe(72150);
  });

  it("IL-1040 Line 11 - net income floors at zero", () => {
    // AGI 2000, base = 2000, exemption = 2850, net = 0
    const result = calculateIL1040(makeInput({ federalAGI: d(2000) }));
    expect(result.netIncome.toNumber()).toBe(0);
  });

  it("IL-1040 Line 12 - flat rate tax", () => {
    // Net income = 72150, tax = 72150 × 0.0495 = 3571.425 → rounds to 3571
    const result = calculateIL1040(makeInput());
    expect(result.incomeTax.toNumber()).toBe(3571);
  });

  it("IL-1040 Line 12 - flat rate tax on larger income", () => {
    // AGI = 150000, base = 150000, exempt = 2850, net = 147150
    // Tax = 147150 × 0.0495 = 7283.925 → rounds to 7284
    const result = calculateIL1040(makeInput({ federalAGI: d(150000) }));
    expect(result.incomeTax.toNumber()).toBe(7284);
  });

  it("IL-1040 Line 13 - investment credit recapture flows through", () => {
    const result = calculateIL1040(makeInput({ investmentCreditRecapture: d(125) }));
    expect(result.investmentCreditRecapture.toNumber()).toBe(125);
  });

  it("IL-1040 Line 14 - income tax includes recapture", () => {
    const result = calculateIL1040(makeInput({ investmentCreditRecapture: d(500) }));
    // Tax = 3571 + 500 = 4071
    expect(result.totalIncomeTax.toNumber()).toBe(4071);
  });

  // ==================== Step 6: Nonrefundable Credits ====================

  it("IL-1040 Line 15 - other state credit", () => {
    const result = calculateIL1040(makeInput({ otherStateCredit: d(1000) }));
    expect(result.otherStateCredit.toNumber()).toBe(1000);
  });

  it("IL-1040 Line 16 - Schedule ICR credits", () => {
    const result = calculateIL1040(makeInput({
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    // Property tax credit = 6000 × 5% = 300
    expect(result.scheduleICRCredit.toNumber()).toBe(300);
  });

  it("IL-1040 Line 17 - 1299-C credit", () => {
    const result = calculateIL1040(makeInput({ schedule1299CCredit: d(200) }));
    expect(result.schedule1299CCredit.toNumber()).toBe(200);
  });

  it("IL-1040 Line 17 - attached Schedule 1299-C overrides the raw credit input", () => {
    const result = calculateIL1040(makeInput({
      schedule1299CCredit: d(999),
      schedule1299C: {
        taxYear: 2025,
        credits: [
          {
            yearsLeftToCarry: 0,
            carryforwardPeriodYears: 0,
            creditCode: "2200",
            creditYearEnding: "2025-12",
            creditEarnedOrCarried: d(200),
          },
        ],
      },
    }));

    expect(result.schedule1299CCredit.toNumber()).toBe(200);
    expect(result.schedule1299C?.credit.toNumber()).toBe(200);
  });

  it("IL-1040 Line 18 - total nonrefundable credits capped at income tax", () => {
    // Tax = 3571, credits = 1000 + 300 + 5000 = 6300 → capped at 3571
    const result = calculateIL1040(makeInput({
      otherStateCredit: d(1000),
      schedule1299CCredit: d(5000),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(6000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    expect(result.totalNonrefundableCredits.toNumber()).toBe(3571);
    expect(result.taxAfterCredits.toNumber()).toBe(0);
  });

  // ==================== Step 7: Other Taxes ====================

  it("IL-1040 Line 19 - tax after credits", () => {
    const result = calculateIL1040(makeInput({ otherStateCredit: d(500) }));
    // Tax 3571 - 500 = 3071
    expect(result.taxAfterCredits.toNumber()).toBe(3071);
  });

  it("IL-1040 Line 20 - household employment tax", () => {
    const result = calculateIL1040(makeInput({ householdEmploymentTax: d(200) }));
    expect(result.householdEmploymentTax.toNumber()).toBe(200);
  });

  it("IL-1040 Line 21 - use tax", () => {
    const result = calculateIL1040(makeInput({ useTax: d(50) }));
    expect(result.useTax.toNumber()).toBe(50);
  });

  it("IL-1040 Line 22 - surcharges", () => {
    const result = calculateIL1040(makeInput({ compassionateUseSurcharge: d(100) }));
    expect(result.compassionateUseSurcharge.toNumber()).toBe(100);
  });

  it("IL-1040 Line 23 - total tax excludes the IL-2210 penalty", () => {
    // AGI = 75000, tax = 3571, no withholding, no estimated payments
    // IL-2210: net tax = 3571, required = min(90%×3571, prior 3000) = min(3214, 3000) = 3000
    // Each quarter: required = 750, payment = 0, underpayment = 750
    // Penalty = 750 × (0.07/365) × (365+304+212+90) = 750 × 0.00019178 × 971 ≈ 140
    const result = calculateIL1040(makeInput({
      il2210: {
        priorYearTax: d(3000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.underpaymentPenalty.greaterThan(0)).toBe(true);
    expect(result.il2210).toBeDefined();
    expect(result.il2210!.penaltyRequired).toBe(true);
    expect(result.totalTax.toNumber()).toBe(result.taxAfterCredits.toNumber());
  });

  it("IL-1040 Line 24 - carries forward page 1 total tax", () => {
    const result = calculateIL1040(makeInput({
      householdEmploymentTax: d(200),
      useTax: d(50),
      compassionateUseSurcharge: d(100),
    }));
    expect(result.totalTax.toNumber()).toBe(3921);
    expect(result.lines.find((line) => line.line === "23")?.value.toNumber()).toBe(3921);
    expect(result.lines.find((line) => line.line === "24")?.value.toNumber()).toBe(3921);
  });

  it("IL-1040 Line 34 - no penalty when IL-2210 not provided", () => {
    const result = calculateIL1040(makeInput());
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
    expect(result.il2210).toBeUndefined();
  });

  it("IL-1040 Line 34 - no penalty when withholding covers tax", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(4000), // More than enough for $3571 tax
      il2210: {
        priorYearTax: d(3000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
    expect(result.il2210!.penaltyRequired).toBe(false);
  });

  it("IL-1040 Line 34 - underpayment penalty from IL-2210 does not change Line 24 total tax", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.underpaymentPenalty.greaterThan(0)).toBe(true);
    expect(result.totalTax.toNumber()).toBe(result.lines.find((line) => line.line === "24")!.value.toNumber());
    expect(result.taxDue.toNumber()).toBe(
      result.preliminaryTaxDue.plus(result.underpaymentPenalty).toNumber(),
    );
  });

  it("IL-1040 Line 23 - total tax includes other taxes but not penalty", () => {
    const result = calculateIL1040(makeInput({
      householdEmploymentTax: d(200),
      useTax: d(50),
      compassionateUseSurcharge: d(100),
    }));
    // Tax after credits = 3571, + 200 + 50 + 100 = 3921
    expect(result.totalTax.toNumber()).toBe(3921);
  });

  // ==================== Step 8: Payments and Refundable Credits ====================

  it("IL-1040 Line 25 - IL withholding", () => {
    const result = calculateIL1040(makeInput({ ilWithholding: d(4000) }));
    expect(result.ilWithholding.toNumber()).toBe(4000);
  });

  it("IL-1040 Line 25 - Schedule IL-WIT Line 11 overrides direct withholding input", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(4000),
      scheduleILWIT: {
        records: [
          {
            taxpayer: "primary",
            formType: "W-2",
            payerId: "11-1111111",
            federalAmount: d(50000),
            illinoisAmount: d(50000),
            illinoisWithheld: d(300),
          },
          {
            taxpayer: "primary",
            formType: "1099-NEC",
            payerId: "22-2222222",
            federalAmount: d(6000),
            illinoisAmount: d(6000),
            illinoisWithheld: d(125),
          },
        ],
      },
    }));

    expect(result.ilWithholding.toNumber()).toBe(425);
    expect(result.totalPayments.toNumber()).toBe(425);
    expect(result.scheduleILWIT?.totalWithholding.toNumber()).toBe(425);
  });

  it("IL-1040 Line 26 - estimated payments", () => {
    const result = calculateIL1040(makeInput({ estimatedPayments: d(2000) }));
    expect(result.estimatedPayments.toNumber()).toBe(2000);
  });

  it("IL-1040 Line 29 - IL EITC is 20% of federal EIC", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
    }));
    // IL EITC = 3000 × 20% = 600
    expect(result.ilEITC.toNumber()).toBe(600);
  });

  it("IL-1040 Line 29 - IL EITC rounds to nearest dollar", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      federalEIC: d(3333),
    }));
    // IL EITC = 3333 × 0.20 = 666.60 → rounds to 667
    expect(result.ilEITC.toNumber()).toBe(667);
  });

  it("IL-1040 Line 29 - IL EITC uses expanded worksheet amount when Schedule IL-E/EITC provides one", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(20000),
      federalEIC: ZERO,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: true, monthsInHome: 12 }],
        federalEIC: ZERO,
        expandedEITCWorksheetCredit: d(1520),
      },
    }));
    // Expanded worksheet Line 23 = 1520, IL EITC = 304
    expect(result.ilEITC.toNumber()).toBe(304);
  });

  it("IL-1040 Line 30 - IL child tax credit is 40% of IL EITC", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      hasChildUnder12: true,
    }));
    // IL EITC = 600, CTC = 600 × 40% = 240
    expect(result.ilChildTaxCredit.toNumber()).toBe(240);
  });

  it("IL-1040 Line 30 - no IL CTC without child under 12", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      hasChildUnder12: false,
    }));
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("IL-1040 Line 30 - no IL CTC if IL EITC is zero", () => {
    const result = calculateIL1040(makeInput({
      federalEIC: ZERO,
      hasChildUnder12: true,
    }));
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("IL-1040 Line 27 - pass-through withholding", () => {
    const result = calculateIL1040(makeInput({ passThroughWithholding: d(3500) }));
    expect(result.passThroughWithholding.toNumber()).toBe(3500);
    expect(result.totalPayments.greaterThanOrEqualTo(d(3500))).toBe(true);
  });

  it("IL-1040 Line 28 - pass-through entity tax credit", () => {
    const result = calculateIL1040(makeInput({ passThroughEntityTaxCredit: d(2200) }));
    expect(result.passThroughEntityTaxCredit.toNumber()).toBe(2200);
    expect(result.totalPayments.greaterThanOrEqualTo(d(2200))).toBe(true);
  });

  it("IL-1040 Line 31 - total payments", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(2000),
      estimatedPayments: d(500),
      passThroughWithholding: d(100),
      passThroughEntityTaxCredit: d(50),
      federalEIC: d(1000),
      hasChildUnder12: true,
    }));
    // IL EITC = 200, CTC = 80
    // Total = 2000 + 500 + 100 + 50 + 200 + 80 = 2930
    expect(result.totalPayments.toNumber()).toBe(2930);
  });

  // ==================== Step 9: Total ====================

  it("IL-1040 Line 32 - overpayment when payments exceed tax", () => {
    const result = calculateIL1040(makeInput({ ilWithholding: d(5000) }));
    // Tax = 3571, payments = 5000, preliminary overpayment = 1429
    expect(result.preliminaryOverpayment.toNumber()).toBe(1429);
    expect(result.overpayment.toNumber()).toBe(1429);
    expect(result.taxDue.toNumber()).toBe(0);
  });

  it("IL-1040 Line 33 - tax due when tax exceeds payments", () => {
    const result = calculateIL1040(makeInput({ ilWithholding: d(2000) }));
    // Tax = 3571, payments = 2000, preliminary due = 1571
    expect(result.preliminaryTaxDue.toNumber()).toBe(1571);
    expect(result.taxDue.toNumber()).toBe(1571);
    expect(result.overpayment.toNumber()).toBe(0);
  });

  it("IL-1040 Line 33 - zero owed when payments equal tax", () => {
    const result = calculateIL1040(makeInput({ ilWithholding: d(3571) }));
    expect(result.preliminaryTaxDue.toNumber()).toBe(0);
    expect(result.preliminaryOverpayment.toNumber()).toBe(0);
    expect(result.taxDue.toNumber()).toBe(0);
    expect(result.overpayment.toNumber()).toBe(0);
  });

  // ==================== Step 10 and Step 11 ====================

  it("IL-1040 Line 35 - Schedule G Line 2 overrides the direct donation input", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      scheduleG: {
        taxYear: 2025,
        wildlifePreservationFund: d(25),
        alzheimersFund: d(10),
        assistanceToHomelessFund: ZERO,
        diabetesResearchFund: ZERO,
        hungerReliefFund: d(5),
        ronaldMcDonaldHouseCharitiesFund: ZERO,
      },
    }));

    expect(result.scheduleG?.totalDonations.toNumber()).toBe(40);
    expect(result.voluntaryCharitableDonations.toNumber()).toBe(40);
    expect(result.totalPenaltyAndDonations.toNumber()).toBe(40);
    expect(result.preliminaryOverpayment.toNumber()).toBe(1429);
    expect(result.overpayment.toNumber()).toBe(1389);
  });

  it("IL-1040 Line 36 - total penalty and donations adds Lines 34 and 35", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      il2210: {
        priorYearTax: d(3000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.totalPenaltyAndDonations.toNumber()).toBe(
      result.underpaymentPenalty.plus(result.voluntaryCharitableDonations).toNumber(),
    );
  });

  it("IL-1040 Line 37 - overpayment is reduced by penalty and donations", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
    }));
    expect(result.preliminaryOverpayment.toNumber()).toBe(1429);
    expect(result.overpayment.toNumber()).toBe(1329);
  });

  it("IL-1040 Line 38 - defaults to refunding the full remaining overpayment", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
    }));
    expect(result.refund.toNumber()).toBe(1329);
    expect(result.creditCarryforward.toNumber()).toBe(0);
    expect(result.refundMethod).toBe("paper_check");
  });

  it("IL-1040 Line 38 - refunds below $1 are reduced to zero and carried forward", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d("3571.75"),
    }));

    expect(result.preliminaryOverpayment.toNumber()).toBe(0.75);
    expect(result.overpayment.toNumber()).toBe(0.75);
    expect(result.refund.toNumber()).toBe(0);
    expect(result.creditCarryforward.toNumber()).toBe(0.75);
    expect(result.refundMethod).toBeUndefined();
  });

  it("IL-1040 Line 39 - refund method defaults to paper check when a refund is issued", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
    }));
    expect(result.refund.toNumber()).toBe(1329);
    expect(result.refundMethod).toBe("paper_check");
  });

  it("IL-1040 Line 39 - standard direct deposit stores normalized routing and account details", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
      directDeposit: {
        routingNumber: "07-1000130",
        accountType: "checking",
        accountNumber: "1234-5678-9012",
      },
    }));

    expect(result.refund.toNumber()).toBe(500);
    expect(result.refundMethod).toBe("direct_deposit");
    expect(result.directDeposit).toEqual({
      routingNumber: "071000130",
      accountType: "checking",
      accountNumber: "123456789012",
      destination: "checking_or_savings",
    });
  });

  it("IL-1040 Line 39 - direct deposit requires banking details", () => {
    expect(() => calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
    }))).toThrow("IL-1040 Line 39 direct deposit requires routing number, account type, and account number");
  });

  it("IL-1040 Line 39 - first-year Illinois filers cannot elect direct deposit", () => {
    expect(() => calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
      firstYearIllinoisReturn: true,
      directDeposit: {
        routingNumber: "071000130",
        accountType: "checking",
        accountNumber: "123456789012",
      },
    }))).toThrow("IL-1040 first-year filers must receive refunds by paper check");
  });

  it("IL-1040 Line 39 - Bright Start college account validation uses the published routing and account format", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
      directDeposit: {
        routingNumber: "011001234",
        accountType: "checking",
        accountNumber: "82212345678901",
      },
    }));

    expect(result.directDeposit).toEqual({
      routingNumber: "011001234",
      accountType: "checking",
      accountNumber: "82212345678901",
      destination: "bright_start",
    });
  });

  it("IL-1040 Line 39 - Bright Directions college account validation uses the published routing and account format", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
      directDeposit: {
        routingNumber: "104910795",
        accountType: "savings",
        accountNumber: "529123456789",
      },
    }));

    expect(result.directDeposit).toEqual({
      routingNumber: "104910795",
      accountType: "savings",
      accountNumber: "529123456789",
      destination: "bright_directions",
    });
  });

  it("IL-1040 Line 40 - remaining overpayment is credited forward", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(5000),
      voluntaryCharitableDonations: d(100),
      refundAmountRequested: d(500),
      refundMethod: "direct_deposit",
      directDeposit: {
        routingNumber: "071000130",
        accountType: "checking",
        accountNumber: "123456789012",
      },
    }));
    expect(result.overpayment.toNumber()).toBe(1329);
    expect(result.refund.toNumber()).toBe(500);
    expect(result.creditCarryforward.toNumber()).toBe(829);
    expect(result.refundMethod).toBe("direct_deposit");
  });

  it("IL-1040 Line 41 - amount owed includes penalty and donations after Step 9", () => {
    const result = calculateIL1040(makeInput({
      ilWithholding: d(3600),
      voluntaryCharitableDonations: d(50),
    }));
    expect(result.preliminaryOverpayment.toNumber()).toBe(29);
    expect(result.totalPenaltyAndDonations.toNumber()).toBe(50);
    expect(result.overpayment.toNumber()).toBe(0);
    expect(result.taxDue.toNumber()).toBe(21);
  });

  it("IL-1040 Line 42 - health insurance checkbox carries uninsured household selections", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      spouseClaimedAsDependent: false,
      healthInsuranceCheckbox: {
        selfUninsured: true,
        spouseUninsured: true,
        dependentsUninsured: false,
      },
    }));

    expect(result.healthInsuranceCheckbox).toEqual({
      selfUninsured: true,
      spouseUninsured: true,
      dependentsUninsured: false,
      authorized: true,
    });
    expect(result.lines.find((line) => line.form === "IL-1040" && line.line === "42")?.value.toNumber()).toBe(1);
  });

  it("IL-1040 Line 42 - spouse checkbox is only allowed for married filing jointly", () => {
    expect(() => calculateIL1040(makeInput({
      healthInsuranceCheckbox: {
        selfUninsured: false,
        spouseUninsured: true,
        dependentsUninsured: false,
      },
    }))).toThrow("IL-1040 Line 42 spouse checkbox is only allowed for married filing jointly");
  });

  // ==================== Integration / E2E ====================

  it("Single filer $75,000 AGI — basic computation", () => {
    // AGI = 75000, no additions/subtractions
    // Base = 75000, exempt = 2850, net = 72150
    // Tax = 72150 × 0.0495 = 3571.425 → 3571
    // No credits, no other taxes
    // Withholding = 3000 → due = 571
    const result = calculateIL1040(makeInput({ ilWithholding: d(3000) }));
    expect(result.baseIncome.toNumber()).toBe(75000);
    expect(result.netIncome.toNumber()).toBe(72150);
    expect(result.incomeTax.toNumber()).toBe(3571);
    expect(result.totalTax.toNumber()).toBe(3571);
    expect(result.taxDue.toNumber()).toBe(571);
  });

  it("MFJ filer $120,000 AGI with dependents and retirement subtraction", () => {
    // AGI = 120000, retirement subtraction = 15000
    // Total income = 120000, subtractions = 15000, base = 105000
    // Exemptions: 5700 (MFJ) + 0 + 0 + 5700 (2 deps) = 11400
    // Net = 105000 - 11400 = 93600
    // Tax = 93600 × 0.0495 = 4633.2 → 4633
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      retirementIncomeSubtraction: d(15000),
      dependentCount: 2,
      ilWithholding: d(5000),
    }));
    expect(result.baseIncome.toNumber()).toBe(105000);
    expect(result.totalExemptions.toNumber()).toBe(11400);
    expect(result.netIncome.toNumber()).toBe(93600);
    expect(result.incomeTax.toNumber()).toBe(4633);
    expect(result.overpayment.toNumber()).toBe(367);
  });

  it("Low-income filer with EITC and child tax credit", () => {
    // AGI = 25000, federal EIC = 4000, 1 dependent
    // Base = 25000, exempt = 2850 (personal) + 2850 (1 dep) = 5700
    // Net = 25000 - 5700 = 19300
    // Tax = 19300 × 0.0495 = 955.35 → 955
    // IL EITC = 4000 × 0.20 = 800
    // IL CTC = 800 × 0.40 = 320
    // Withholding = 1000
    // Total payments = 1000 + 800 + 320 = 2120
    // Overpayment = 2120 - 955 = 1165
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(4000),
      hasChildUnder12: true,
      dependentCount: 1,
      ilWithholding: d(1000),
    }));
    expect(result.incomeTax.toNumber()).toBe(955);
    expect(result.ilEITC.toNumber()).toBe(800);
    expect(result.ilChildTaxCredit.toNumber()).toBe(320);
    expect(result.totalPayments.toNumber()).toBe(2120);
    expect(result.overpayment.toNumber()).toBe(1165);
  });

  it("Retired couple with Social Security and property tax credit", () => {
    // MFJ, AGI = 60000, SS subtraction = 25000, property tax = 8000
    // Total income = 60000, subtractions = 25000, base = 35000
    // Exemptions: 5700 (MFJ) + 2000 (both 65+) = 7700
    // Net = 35000 - 7700 = 27300
    // Tax = 27300 × 0.0495 = 1351.35 → 1351
    // Property tax credit = 8000 × 0.05 = 400
    // Tax after credits = 1351 - 400 = 951
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(60000),
      retirementIncomeSubtraction: d(25000),
      age65OrOlderCount: 2,
      ilWithholding: d(500),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(8000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 0,
      },
    }));
    expect(result.baseIncome.toNumber()).toBe(35000);
    expect(result.totalExemptions.toNumber()).toBe(7700);
    expect(result.netIncome.toNumber()).toBe(27300);
    expect(result.incomeTax.toNumber()).toBe(1351);
    expect(result.scheduleICRCredit.toNumber()).toBe(400);
    expect(result.taxAfterCredits.toNumber()).toBe(951);
    expect(result.taxDue.toNumber()).toBe(451);
  });

  it("High-income filer loses all exemptions", () => {
    // Single, AGI = 300000
    // All exemptions denied (> $250K)
    // Net = 300000, tax = 300000 × 0.0495 = 14850
    const result = calculateIL1040(makeInput({
      federalAGI: d(300000),
      age65OrOlderCount: 1,
      dependentCount: 2,
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(300000);
    expect(result.incomeTax.toNumber()).toBe(14850);
  });

  it("IL-1040 Line 24 - total tax with penalty from IL-2210", () => {
    // AGI = 100000, no credits, tax after credits = 4809
    // IL-2210: net tax = 4809, 90% = 4328, prior year = 4000
    // Required = min(4328, 4000) = 4000, quarterly = 1000
    // No withholding, Q1 est = 500, Q2-Q4 = 0
    // Q1: avail = 500, under = 500; Q2: avail = 0, under = 1000; Q3: same; Q4: same
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [d(500), ZERO, ZERO, ZERO],
      },
    }));
    expect(result.il2210).toBeDefined();
    expect(result.il2210!.penaltyRequired).toBe(true);
    expect(result.underpaymentPenalty.greaterThan(0)).toBe(true);
    // Total tax excludes the Step 10 penalty
    const expectedTotal = result.taxAfterCredits
      .plus(result.householdEmploymentTax)
      .plus(result.useTax)
      .plus(result.compassionateUseSurcharge);
    expect(result.totalTax.toNumber()).toBe(expectedTotal.toNumber());
    expect(result.taxDue.toNumber()).toBe(
      result.preliminaryTaxDue.plus(result.underpaymentPenalty).toNumber(),
    );
  });

  it("IL-1040 penalty increases tax due", () => {
    // With penalty, final amount owed should be higher even though Line 24 total tax is unchanged
    const withoutPenalty = calculateIL1040(makeInput({ federalAGI: d(100000) }));
    const withPenalty = calculateIL1040(makeInput({
      federalAGI: d(100000),
      il2210: {
        priorYearTax: d(4000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(withPenalty.totalTax.toNumber()).toBe(withoutPenalty.totalTax.toNumber());
    expect(withPenalty.taxDue.greaterThan(withoutPenalty.taxDue)).toBe(true);
  });

  it("IL-1040 IL-2210 audit trail merged into result", () => {
    const result = calculateIL1040(makeInput({
      il2210: {
        priorYearTax: d(3000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    const il2210Lines = result.lines.filter(l => l.form === "IL-2210");
    expect(il2210Lines.length).toBeGreaterThan(0);
    // Should have quarterly lines
    const quarterLines = il2210Lines.filter(l => l.line.startsWith("Q"));
    expect(quarterLines.length).toBe(4);
  });

  it("IL-1040 with EITC reduces IL-2210 net tax correctly", () => {
    // Low income with EITC — net tax for penalty = totalTax - refundable credits
    // AGI = 25000, federal EIC = 3000, 1 dependent
    // Tax = 955 (from previous test), IL EITC = 600, IL CTC = 0 (no child under 12)
    // Net tax for IL-2210 = 955 - 600 = 355 < $1000 → no penalty
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      dependentCount: 1,
      il2210: {
        priorYearTax: d(1000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));
    expect(result.il2210!.penaltyRequired).toBe(false);
    expect(result.underpaymentPenalty.toNumber()).toBe(0);
  });

  it("IL-1040 Line 34 - farmer exemption forces IL-2210 penalty to zero", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
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
    expect(result.taxDue.toNumber()).toBe(result.preliminaryTaxDue.toNumber());
  });

  it("Negative federal AGI — base income floors at zero, no tax", () => {
    // AGI = -5000 (business losses), no additions
    // Total income = -5000, subtractions = 0, base = max(-5000, 0) = 0
    const result = calculateIL1040(makeInput({
      federalAGI: d(-5000),
    }));
    expect(result.totalIncome.toNumber()).toBe(-5000);
    expect(result.baseIncome.toNumber()).toBe(0);
    expect(result.netIncome.toNumber()).toBe(0);
    expect(result.incomeTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Negative AGI with additions produces positive base income", () => {
    // AGI = -2000, tax-exempt interest = 5000
    // Total income = -2000 + 5000 = 3000, base = 3000
    const result = calculateIL1040(makeInput({
      federalAGI: d(-2000),
      taxExemptInterest: d(5000),
    }));
    expect(result.totalIncome.toNumber()).toBe(3000);
    expect(result.baseIncome.toNumber()).toBe(3000);
    expect(result.netIncome.toNumber()).toBe(150); // 3000 - 2850
    expect(result.incomeTax.toNumber()).toBe(7); // 150 × 0.0495 = 7.425 → 7
  });

  it("QSS AGI at $250K threshold — exemptions preserved", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(250000),
      dependentCount: 1,
    }));
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.dependentExemption.toNumber()).toBe(2850);
    expect(result.totalExemptions.toNumber()).toBe(5700);
  });

  it("QSS AGI above $250K threshold — exemptions denied", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(250001),
      dependentCount: 1,
    }));
    expect(result.totalExemptions.toNumber()).toBe(0);
  });

  it("MFS AGI at $250K threshold — exemptions preserved", () => {
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_separately",
      federalAGI: d(250000),
    }));
    expect(result.personalExemption.toNumber()).toBe(2850);
  });

  it("All schedules combined — IL-2210 + Schedule M + Schedule ICR + Schedule CR", () => {
    // MFJ, AGI = 150000
    // Schedule M: 529 = 15000, US govt interest = 3000, non-IL 529 earnings = 1000
    // Total income = 150000 + 0 + 1000 = 151000
    // Subtractions = 0 (retirement) + 0 (refund) + 18000 (529+USgov) = 18000
    // Base = 151000 - 18000 = 133000
    // Exempt = 5700 (MFJ) + 5700 (2 deps) = 11400
    // Net = 133000 - 11400 = 121600
    // Tax = 121600 × 0.0495 = 6019.2 → 6019
    // Schedule CR: ratio = 30000/133000 = 0.2256, IL tax on non-IL = 0.2256 × 6019 = 1357.49 → 1357
    // Tax paid = 1000 → credit = 1000
    // Schedule ICR: property = 12000 × 5% = 600, education = (2000-250)×25% = 437.50 → 438
    // ICR remaining after CR: 6019 - 1000 = 5019, property credit = 600, remaining = 4419, education = 438
    // Total ICR = 600 + 438 = 1038
    // Total nonrefundable = min(1000 + 1038, 6019) = 2038
    // Tax after credits = 6019 - 2038 = 3981
    // IL-2210: total tax = 3981, no other taxes, EITC = 0
    // Net tax = 3981, 90% = 3583, prior = 3500, required = 3500
    // No withholding, Q1-Q4 = 0 → per quarter = 875
    // Penalty applies
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
      federalAGI: d(150000),
      federalEIC: ZERO,
      dependentCount: 2,
      scheduleM: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: d(1000),
        ilDepreciationAddition: ZERO,
        recapture529OutOfState: ZERO,
        recapture529Nonqualified: ZERO,
        studentAssistanceCreditRecapture: ZERO,
        otherAdditions: ZERO,
        il529Contributions: d(15000),
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
        totalBaseIncome: d(133000),
        nonIllinoisBaseIncome: d(30000),
        taxPaidToOtherStates: d(1000),
      },
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(12000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(2000),
        volunteerEmergencyWorkerCount: 0,
      },
      il2210: {
        priorYearTax: d(3500),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));

    // Verify all schedules contributed
    expect(result.scheduleM).toBeDefined();
    expect(result.scheduleCR).toBeDefined();
    expect(result.scheduleICR).toBeDefined();
    expect(result.il2210).toBeDefined();

    // Verify base computation
    expect(result.totalIncome.toNumber()).toBe(151000);
    expect(result.baseIncome.toNumber()).toBe(133000);
    expect(result.netIncome.toNumber()).toBe(121600);
    expect(result.incomeTax.toNumber()).toBe(6019);

    // Verify credits
    expect(result.otherStateCredit.toNumber()).toBe(1000);
    expect(result.scheduleICRCredit.greaterThan(0)).toBe(true);
    expect(result.taxAfterCredits.lessThan(result.totalIncomeTax)).toBe(true);

    // Verify IL-2210 penalty
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

    // Verify audit trail contains all forms
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("IL-1040")).toBe(true);
    expect(forms.has("Schedule M")).toBe(true);
    expect(forms.has("Schedule ICR")).toBe(true);
    expect(forms.has("Schedule CR")).toBe(true);
    expect(forms.has("IL-2210")).toBe(true);
  });

  it("Audit trail contains all IL-1040 lines", () => {
    const result = calculateIL1040(makeInput());
    const il1040Lines = result.lines.filter(l => l.form === "IL-1040");
    // Should have lines 1-33 (not all numbers, but at least the key ones)
    const lineNumbers = il1040Lines.map(l => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("12");
    expect(lineNumbers).toContain("24");
    expect(lineNumbers).toContain("33");
  });

  // ==================== Schedule M Integration ====================

  it("Schedule M - additions flow to Line 3 and subtractions to Line 7", () => {
    // AGI = 75000
    // Schedule M: non-IL 529 earnings = 1000 (addition), US gov interest = 2000 (subtraction)
    // Line 3 = 1000 (from Schedule M total additions)
    // Line 7 = 2000 (from Schedule M total subtractions)
    // Total income = 75000 + 0 + 1000 = 76000
    // Total subtractions = 0 + 0 + 2000 = 2000
    // Base income = 76000 - 2000 = 74000
    const result = calculateIL1040(makeInput({
      scheduleM: {
        taxYear: 2025,
        filingStatus: "single",
        childTaxExemptInterest: ZERO,
        distributiveShareAdditions: ZERO,
        lloydsLoss: ZERO,
        nonIL529Earnings: d(1000),
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
        usGovernmentInterest: d(2000),
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
    expect(result.otherAdditions.toNumber()).toBe(1000);
    expect(result.otherSubtractions.toNumber()).toBe(2000);
    expect(result.totalIncome.toNumber()).toBe(76000);
    expect(result.baseIncome.toNumber()).toBe(74000);
    expect(result.scheduleM).toBeDefined();
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(0);
  });

  it("Schedule M - 529 contribution cap flows through correctly", () => {
    // MFJ with $25K 529 contributions → capped at $20K
    const result = calculateIL1040(makeInput({
      filingStatus: "married_filing_jointly",
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
        il529Contributions: d(25000),
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
    }));
    // $25K capped at $20K → Line 7 = 20000
    expect(result.scheduleM!.il529Subtraction.toNumber()).toBe(20000);
    expect(result.otherSubtractions.toNumber()).toBe(20000);
    // Base income: 75000 - 20000 = 55000
    expect(result.baseIncome.toNumber()).toBe(55000);
  });

  // ==================== Schedule CR Integration ====================

  it("Schedule CR - credit flows to Line 15 and reduces tax", () => {
    // AGI = 100000, non-IL = 30000
    // Base = 100000, exempt = 2850, net = 97150
    // Tax = 97150 × 0.0495 = 4808.925 → 4809
    // CR decimal = 30000 / 100000 = 0.3000
    // IL tax on non-IL = 0.3 × 4809 = 1442.7 → 1443
    // Tax paid to IN = 1200 → credit = 1200 (tax paid lower)
    // Tax after credits = 4809 - 1200 = 3609
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      ilWithholding: d(4000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(100000),
        nonIllinoisBaseIncome: d(30000),
        taxPaidToOtherStates: d(1200),
      },
    }));
    expect(result.otherStateCredit.toNumber()).toBe(1200);
    expect(result.scheduleCR).toBeDefined();
    expect(result.scheduleCR!.crDecimal.toNumber()).toBe(0.3);
    expect(result.scheduleCR!.credit.toNumber()).toBe(1200);
    expect(result.taxAfterCredits.toNumber()).toBe(3609);
    expect(result.taxDue.toNumber()).toBe(0);
    expect(result.overpayment.toNumber()).toBe(391);
  });

  it("Schedule CR - credit limited to IL tax on non-IL income", () => {
    // AGI = 80000, non-IL = 20000
    // Base = 80000, exempt = 2850, net = 77150
    // Tax = 77150 × 0.0495 = 3818.925 → 3819
    // CR decimal = 20000 / 80000 = 0.2500
    // IL tax on non-IL = 0.25 × 3819 = 954.75 → 955
    // Tax paid to other state = 1500 → credit = 955 (IL attributable lower)
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(80000),
        nonIllinoisBaseIncome: d(20000),
        taxPaidToOtherStates: d(1500),
      },
    }));
    expect(result.scheduleCR!.credit.toNumber()).toBe(955);
    expect(result.otherStateCredit.toNumber()).toBe(955);
  });

  it("Schedule CR - overrides otherStateCredit when provided", () => {
    // If both scheduleCR and otherStateCredit are provided, scheduleCR wins
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      otherStateCredit: d(9999), // Should be overridden
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(100000),
        nonIllinoisBaseIncome: d(25000),
        taxPaidToOtherStates: d(500),
      },
    }));
    // CR decimal = 0.25, IL tax on non-IL = 0.25 × 4809 = 1202.25 → 1202
    // Credit = min(500, 1202) = 500
    expect(result.otherStateCredit.toNumber()).toBe(500);
  });

  it("IL-1040 Line 15 - attached Schedule CR uses the current return base income for Schedule CR Line 42a", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      otherSubtractions: d(20000),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(999999),
        nonIllinoisBaseIncome: d(30000),
        taxPaidToOtherStates: d(5000),
      },
    }));

    expect(result.baseIncome.toNumber()).toBe(80000);
    expect(result.scheduleCR!.totalBaseIncome.toNumber()).toBe(80000);
    expect(result.scheduleCR!.crDecimal.toNumber()).toBe(0.375);
    expect(result.scheduleCR!.credit.toNumber()).toBe(1432);
    expect(result.otherStateCredit.toNumber()).toBe(1432);
  });
});

describe("computePersonalExemption", () => {
  const c = IL_CONSTANTS[2025];

  it("Single not dependent: $2,850", () => {
    expect(computePersonalExemption("single", false, false, d(50000), c).toNumber()).toBe(2850);
  });

  it("Single dependent, low income: $2,850", () => {
    expect(computePersonalExemption("single", true, false, d(2000), c).toNumber()).toBe(2850);
  });

  it("Single dependent, high income: $0", () => {
    expect(computePersonalExemption("single", true, false, d(5000), c).toNumber()).toBe(0);
  });

  it("MFJ neither dependent: $5,700", () => {
    expect(computePersonalExemption("married_filing_jointly", false, false, d(50000), c).toNumber()).toBe(5700);
  });

  it("MFJ one claimed, base <= $2,850: $5,700", () => {
    expect(computePersonalExemption("married_filing_jointly", true, false, d(2000), c).toNumber()).toBe(5700);
  });

  it("MFJ one claimed, base > $2,850: $2,850", () => {
    expect(computePersonalExemption("married_filing_jointly", true, false, d(10000), c).toNumber()).toBe(2850);
  });

  it("MFJ both claimed, base <= $5,700: $5,700", () => {
    expect(computePersonalExemption("married_filing_jointly", true, true, d(5000), c).toNumber()).toBe(5700);
  });

  it("MFJ both claimed, base > $5,700: $0", () => {
    expect(computePersonalExemption("married_filing_jointly", true, true, d(10000), c).toNumber()).toBe(0);
  });

  it("HoH not dependent: $2,850", () => {
    expect(computePersonalExemption("head_of_household", false, false, d(50000), c).toNumber()).toBe(2850);
  });

  it("MFS not dependent: $2,850", () => {
    expect(computePersonalExemption("married_filing_separately", false, false, d(50000), c).toNumber()).toBe(2850);
  });

  it("QSS not dependent: $2,850", () => {
    expect(computePersonalExemption("qualifying_surviving_spouse", false, false, d(50000), c).toNumber()).toBe(2850);
  });

  it("Boundary: single dependent, base income exactly $2,850: $2,850", () => {
    expect(computePersonalExemption("single", true, false, d(2850), c).toNumber()).toBe(2850);
  });

  it("Boundary: single dependent, base income $2,851: $0", () => {
    expect(computePersonalExemption("single", true, false, d(2851), c).toNumber()).toBe(0);
  });

  it("Boundary: MFJ both claimed, base income exactly $5,700: $5,700", () => {
    expect(computePersonalExemption("married_filing_jointly", true, true, d(5700), c).toNumber()).toBe(5700);
  });

  it("Boundary: MFJ both claimed, base income $5,701: $0", () => {
    expect(computePersonalExemption("married_filing_jointly", true, true, d(5701), c).toNumber()).toBe(0);
  });
});

// ===========================================================================
// Schedule NR Integration Through IL-1040
// ===========================================================================

describe("IL-1040 Schedule NR Integration — Nonresident / Part-Year", () => {
  // Helper: minimal Schedule NR input
  function zeroDC() { return { columnA: ZERO, columnB: ZERO }; }
  function dc(a: number, b: number) { return { columnA: d(a), columnB: d(b) }; }

  function makeNRInput(overrides: Record<string, unknown> = {}) {
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

  it("Schedule NR overrides Lines 11 and 12 with NR-computed values", () => {
    // Nonresident earned $100K total, $40K in IL (wages)
    // Full base income (as if resident) = 100000, full exempt = 2850
    // Standard: Line 11 = 100000 - 2850 = 97150, Line 12 = 97150 × 4.95% = 4809
    // NR: IL base = 40000, alloc decimal = 40000/100000 = 0.400
    //     allocated exempt = 2850 × 0.400 = 1140
    //     IL net income = 40000 - 1140 = 38860
    //     IL tax = 38860 × 4.95% = 1924 (rounded)
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(100000, 40000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    // NR overrides Lines 11 and 12
    expect(result.scheduleNR).toBeDefined();
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.4);
    expect(result.netIncome.toNumber()).toBe(38860);
    expect(result.incomeTax.toNumber()).toBe(1924);
    // Verify allocation decimal is stored
    expect(result.allocationDecimal!.toNumber()).toBe(0.4);
  });

  it("NR allocation decimal allocates EITC for nonresidents", () => {
    // Nonresident: $30K total, $15K IL wages → 50% allocation
    // Federal EIC = 5000
    // IL EITC (full resident) = 5000 × 20% = 1000
    // Allocated EITC = 1000 × 0.500 = 500
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      federalEIC: d(5000),
      dependentCount: 1,
      hasChildUnder12: true,
      scheduleNR: makeNRInput({
        income: {
          wages: dc(30000, 15000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.allocationDecimal!.toNumber()).toBe(0.5);
    expect(result.ilEITC.toNumber()).toBe(500);
  });

  it("NR allocation decimal allocates Child Tax Credit for nonresidents", () => {
    // Same scenario as EITC test: 50% allocation
    // IL EITC = 500 (allocated), IL CTC = 500 × 40% = 200
    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      federalEIC: d(5000),
      dependentCount: 1,
      hasChildUnder12: true,
      scheduleNR: makeNRInput({
        income: {
          wages: dc(30000, 15000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.ilChildTaxCredit.toNumber()).toBe(200);
  });

  it("NR with no IL income produces zero allocation and zero tax", () => {
    // Nonresident with all income from other states
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      federalEIC: d(3000),
      hasChildUnder12: true,
      scheduleNR: makeNRInput({
        income: {
          wages: dc(80000, 0), interest: zeroDC(), dividends: zeroDC(),
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
    expect(result.ilEITC.toNumber()).toBe(0);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("Part-year resident with mixed income sources", () => {
    // Part-year: $60K wages (all IL while resident), $10K interest ($2K IL business interest)
    // Column A: 70K, Column B: 62K
    // Full base income = 70000, exempt = 2850
    // NR: IL base income = 62000, alloc = 62000/70000 = 0.886
    //     allocated exempt = 2850 × 0.886 = 2525 (rounded)
    //     IL net income = 62000 - 2525 = 59475
    //     IL tax = 59475 × 0.0495 = 2944 (rounded)
    const result = calculateIL1040(makeInput({
      federalAGI: d(70000),
      scheduleNR: makeNRInput({
        residencyType: "part_year",
        income: {
          wages: dc(60000, 60000), interest: dc(10000, 2000), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR).toBeDefined();
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.886);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(62000);
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(2525);
    expect(result.netIncome.toNumber()).toBe(59475);
    expect(result.incomeTax.toNumber()).toBe(2944);
  });

  it("NR with Schedule ICR — nonresident returns only keep the volunteer credit", () => {
    // Nonresident: $80K total, $50K IL → 62.5% allocation
    // Full base = 80000, exempt = 2850
    // NR base = 50000, alloc = 50000/80000 = 0.625
    // alloc exempt = 2850 × 0.625 = 1781
    // IL net = 50000 - 1781 = 48219
    // IL tax = 48219 × 0.0495 = 2387 (rounded)
    // Property tax and education credits are not allowed for explicit nonresidents.
    // Volunteer credit = 500, so tax after credits = 2387 - 500 = 1887.
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(80000, 50000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(5000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: d(2000),
        volunteerEmergencyWorkerCount: 1,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));

    expect(result.incomeTax.toNumber()).toBe(2387);
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.educationCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.volunteerCredit.toNumber()).toBe(500);
    expect(result.scheduleICRCredit.toNumber()).toBe(500);
    expect(result.taxAfterCredits.toNumber()).toBe(1887);
  });

  it("NR with Schedule CR — other state credit on NR-computed tax", () => {
    // Part-year: $120K total, $90K IL → alloc 0.750
    // Full base = 120000, exempt = 2850
    // NR base = 90000, alloc = 90000/120000 = 0.750
    // alloc exempt = 2850 × 0.750 = 2138 (rounded)
    // IL net = 90000 - 2138 = 87862 (rounded: 87863? let's compute)
    // Wait, 2850 × 0.750 = 2137.50 → rounds to 2138
    // IL net = 90000 - 2138 = 87862
    // IL tax = 87862 × 0.0495 = 4349.169 → 4349
    // Schedule CR: non-IL base = 30000, total base = 120000, decimal = 0.2500
    // IL tax on non-IL = 0.2500 × 4349 = 1087 (rounded)
    // Tax paid to other states = 900 → credit = 900 (< 1087)
    const result = calculateIL1040(makeInput({
      federalAGI: d(120000),
      scheduleNR: makeNRInput({
        residencyType: "part_year",
        income: {
          wages: dc(120000, 90000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      scheduleCR: {
        taxYear: 2025,
        totalBaseIncome: d(120000),
        nonIllinoisBaseIncome: d(30000),
        taxPaidToOtherStates: d(900),
      },
    }));

    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.75);
    expect(result.scheduleCR).toBeDefined();
    expect(result.scheduleCR!.credit.toNumber()).toBe(900);
    // Tax after NR + CR
    expect(result.otherStateCredit.toNumber()).toBe(900);
  });

  it("NR nonrefundable credits capped at NR-computed Line 14", () => {
    // Nonresident with small IL income → small tax, but large credits
    // $50K total, $5K IL → alloc = 0.100
    // NR base = 5000, alloc exempt = 2850 × 0.100 = 285
    // IL net = 5000 - 285 = 4715
    // IL tax = 4715 × 0.0495 = 233 (rounded)
    // Property tax credit is unavailable to explicit nonresidents, but the
    // volunteer credit still applies and is capped at Line 14.
    // Total nonrefundable credits capped at 233
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(50000, 5000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(10000),
        propertyTaxBusinessDeduction: ZERO,
        k12EducationExpenses: ZERO,
        volunteerEmergencyWorkerCount: 1,
        volunteerEmergencyWorkerCertificateNumbers: ["VEW-1001"],
      },
    }));

    expect(result.incomeTax.toNumber()).toBe(233);
    expect(result.scheduleICR!.propertyTaxCredit.toNumber()).toBe(0);
    expect(result.scheduleICR!.volunteerCredit.toNumber()).toBe(233);
    // Credits should be capped at income tax
    expect(result.totalNonrefundableCredits.toNumber()).toBe(233);
    expect(result.taxAfterCredits.toNumber()).toBe(0);
  });

  it("NR + EITC + CTC produces refund despite low IL tax", () => {
    // Part-year: $25K total, $20K IL → alloc = 0.800
    // Full base = 25000, exempt = 2850 + 2850 (1 dep) = 5700
    // NR base = 20000, alloc = 20000/25000 = 0.800
    // alloc exempt = 5700 × 0.800 = 4560
    // IL net = 20000 - 4560 = 15440
    // IL tax = 15440 × 0.0495 = 764 (rounded)
    // Federal EIC = 4000, IL EITC = 4000 × 20% × 0.800 = 640
    // IL CTC = 640 × 40% = 256
    // IL withholding = 500
    // Total payments = 500 + 640 + 256 = 1396
    // Overpayment = 1396 - 764 = 632
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(4000),
      dependentCount: 1,
      hasChildUnder12: true,
      ilWithholding: d(500),
      scheduleNR: makeNRInput({
        residencyType: "part_year",
        income: {
          wages: dc(25000, 20000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.allocationDecimal!.toNumber()).toBe(0.8);
    expect(result.ilEITC.toNumber()).toBe(640);
    expect(result.ilChildTaxCredit.toNumber()).toBe(256);
    expect(result.incomeTax.toNumber()).toBe(764);
    expect(result.overpayment.toNumber()).toBe(632);
  });

  it("NR with Schedule M subtractions — reduces full base income", () => {
    // Part-year: $60K total wages (all IL), $5K US govt interest subtraction
    // Schedule M subtractions = 5000
    // Full base = 60000 - 5000 = 55000
    // NR income: wages dc(60000, 60000), subtractions dc(5000, 5000)
    // NR: IL base = 60000 - 5000 = 55000
    // alloc = 55000/55000 = 1.000
    const result = calculateIL1040(makeInput({
      federalAGI: d(60000),
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
      scheduleNR: makeNRInput({
        residencyType: "part_year",
        income: {
          wages: dc(60000, 60000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(),
          otherAdditions: zeroDC(),
          retirementSubtraction: zeroDC(),
          ilRefundSubtraction: zeroDC(),
          otherSubtractions: dc(5000, 5000),
        },
      }),
    }));

    expect(result.baseIncome.toNumber()).toBe(55000);
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(1);
    // With alloc = 1.000, NR net income = full base - full exemptions
    expect(result.scheduleNR!.allocatedExemptions.toNumber()).toBe(2850);
    expect(result.netIncome.toNumber()).toBe(52150);
  });

  it("NR with IL-2210 penalty — penalty based on NR-computed tax", () => {
    // Nonresident: $80K total, $40K IL → alloc = 0.500
    // NR tax = about $1929 (see first NR test for similar)
    // Prior year tax = $3000, no estimated payments → penalty
    const result = calculateIL1040(makeInput({
      federalAGI: d(80000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(80000, 40000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
      il2210: {
        priorYearTax: d(3000),
        priorYearReturnFiled: true,
        estimatedPaymentsByQuarter: [ZERO, ZERO, ZERO, ZERO],
      },
    }));

    // Should have penalty since no withholding and no estimated payments
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

  it("Without scheduleNR, Lines 11/12 use standard computation", () => {
    // Same income but WITHOUT Schedule NR — should use standard formula
    const result = calculateIL1040(makeInput({
      federalAGI: d(100000),
    }));

    // Standard: Line 11 = 100000 - 2850 = 97150
    // Line 12 = 97150 × 4.95% = 4809
    expect(result.netIncome.toNumber()).toBe(97150);
    expect(result.incomeTax.toNumber()).toBe(4809);
    expect(result.allocationDecimal).toBeUndefined();
    expect(result.scheduleNR).toBeUndefined();
  });

  it("NR allocation decimal of 1.000 when IL income equals total", () => {
    // Part-year who lived in IL all year and earned all income there
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      scheduleNR: makeNRInput({
        residencyType: "part_year",
        income: {
          wages: dc(50000, 50000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.allocationDecimal!.toNumber()).toBe(1);
    // With alloc = 1.000, NR result should match standard computation
    expect(result.netIncome.toNumber()).toBe(47150); // 50000 - 2850
    expect(result.incomeTax.toNumber()).toBe(2334); // 47150 × 0.0495 = 2334.925 → 2334
  });

  it("NR multiple income types — wages + business + rental", () => {
    // Nonresident: $100K wages (60K IL), $20K business (all IL), $10K rental ($0 IL)
    // Column A total = 130K, Column B total = 80K
    // Full base = 130000, NR base = 80000, alloc = 80000/130000 = 0.615
    const result = calculateIL1040(makeInput({
      federalAGI: d(130000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(100000, 60000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: dc(20000, 20000),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: dc(10000, 0), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR!.totalIncomeA.toNumber()).toBe(130000);
    expect(result.scheduleNR!.totalIncomeB.toNumber()).toBe(80000);
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.615);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(80000);
  });

  it("NR with adjustments — SE deduction allocated via ISE decimal", () => {
    // Nonresident: $50K wages (all IL) + $30K business ($20K IL)
    // SE tax deduction: Column A = 4000, Column B = 2667 (ISE = 20K/30K = 0.667)
    // Total income: A = 80000, B = 70000
    // Total adjustments: A = 4000, B = 2667
    // AGI: A = 76000, B = 67333
    // Full base = 76000 (no additions/subtractions)
    // NR base = 67333, alloc = 67333/76000 = 0.886
    const result = calculateIL1040(makeInput({
      federalAGI: d(76000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(50000, 50000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: dc(30000, 20000),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: zeroDC(), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        adjustments: {
          educatorExpenses: zeroDC(), certainBusinessExpenses: zeroDC(),
          hsaDeduction: zeroDC(), movingExpenses: zeroDC(),
          seTaxDeduction: dc(4000, 2667),
          sepSimpleDeduction: zeroDC(), seHealthInsurance: zeroDC(),
          earlyWithdrawalPenalty: zeroDC(), alimonyPaid: zeroDC(),
          iraDeduction: zeroDC(), studentLoanInterest: zeroDC(),
          archerMSA: zeroDC(), otherAdjustments: zeroDC(),
        },
      }),
    }));

    expect(result.scheduleNR!.agiA.toNumber()).toBe(76000);
    expect(result.scheduleNR!.agiB.toNumber()).toBe(67333);
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(67333);
  });

  it("NR retirement subtraction — nonresident gets $0 in Column B", () => {
    // Nonresident with pension: Column A has $15K retirement, Column B = $0
    // This means NR doesn't subtract retirement (nonresidents don't owe IL tax on retirement)
    const result = calculateIL1040(makeInput({
      federalAGI: d(55000),
      retirementIncomeSubtraction: d(15000),
      scheduleNR: makeNRInput({
        income: {
          wages: dc(40000, 20000), interest: zeroDC(), dividends: zeroDC(),
          taxableRefunds: zeroDC(), alimony: zeroDC(), businessIncome: zeroDC(),
          capitalGains: zeroDC(), otherGains: zeroDC(), iraDistributions: zeroDC(),
          pensions: dc(15000, 0), rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(),
          otherAdditions: zeroDC(),
          retirementSubtraction: dc(15000, 0),
          ilRefundSubtraction: zeroDC(),
          otherSubtractions: zeroDC(),
        },
      }),
    }));

    // Full base income = 55000 - 15000 (retirement) = 40000
    expect(result.baseIncome.toNumber()).toBe(40000);
    // NR: IL base = 20000 (wages only, no retirement subtraction in Column B)
    expect(result.scheduleNR!.ilBaseIncome.toNumber()).toBe(20000);
    // Allocation = 20000 / 40000 = 0.500
    expect(result.scheduleNR!.allocationDecimal.toNumber()).toBe(0.5);
  });

  // ==================== Schedule IL-E/EIC Integration ====================

  it("IL-1040 with Schedule IL-E/EIC computes EITC via module", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      hasChildUnder12: false, // Ignored when scheduleEEIC provided
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: true, monthsInHome: 12 }],
        federalEIC: d(3000),
      },
    }));
    // IL EITC = 3000 × 20% = 600
    expect(result.ilEITC.toNumber()).toBe(600);
    // CTC = 600 × 40% = 240 (child under 12 from schedule)
    expect(result.ilChildTaxCredit.toNumber()).toBe(240);
    // Schedule result is attached
    expect(result.scheduleEEIC).toBeDefined();
    expect(result.scheduleEEIC!.dependentCount).toBe(1);
  });

  it("IL-1040 with Schedule IL-E/EIC uses expanded worksheet credit for Illinois-only EITC", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(22000),
      federalEIC: ZERO,
      ilWithholding: d(100),
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: true, monthsInHome: 12 }],
        federalEIC: ZERO,
        expandedEITCWorksheetCredit: d(1520),
      },
    }));
    // Base tax: (22000 - 2850 - 2850) × 4.95% = 807.3 → 807
    // IL EITC = 304, CTC = 122, total payments = 100 + 304 + 122 = 526
    expect(result.incomeTax.toNumber()).toBe(807);
    expect(result.ilEITC.toNumber()).toBe(304);
    expect(result.ilChildTaxCredit.toNumber()).toBe(122);
    expect(result.totalPayments.toNumber()).toBe(526);
    expect(result.taxDue.toNumber()).toBe(281);
  });

  it("IL-1040 with Schedule IL-E/EIC without child under 12", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      hasChildUnder12: true, // Ignored when scheduleEEIC provided
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: false, monthsInHome: 12 }],
        federalEIC: d(3000),
      },
    }));
    // IL EITC = 600 (still computed)
    expect(result.ilEITC.toNumber()).toBe(600);
    // CTC = 0 (no child under 12 per schedule, overrides hasChildUnder12 flag)
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("IL-1040 Line 30 - Schedule IL-E/EITC qualifying child does not produce CTC without dependent exemption", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(25000),
      federalEIC: d(3000),
      dependentCount: 4, // Ignored when scheduleEEIC provided
      hasChildUnder12: false, // Ignored when scheduleEEIC provided
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [],
        qualifyingChildren: [{ relationship: "child", isUnder12: true, monthsInHome: 12 }],
        federalEIC: d(3000),
      },
    }));

    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.scheduleEEIC?.dependentCount).toBe(0);
    expect(result.scheduleEEIC?.hasChildUnder12).toBe(false);
    expect(result.ilEITC.toNumber()).toBe(600);
    expect(result.ilChildTaxCredit.toNumber()).toBe(0);
  });

  it("IL-1040 Schedule IL-E/EIC audit trail is merged", () => {
    const result = calculateIL1040(makeInput({
      federalEIC: d(2000),
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: true, monthsInHome: 12 }],
        federalEIC: d(2000),
      },
    }));
    // Should contain Schedule IL-E/EIC lines in the audit
    const scheduleLines = result.lines.filter(l => l.form === "Schedule IL-E/EIC");
    expect(scheduleLines.length).toBeGreaterThan(0);
  });

  it("IL-1040 requires Schedule IL-E/EIC to claim Illinois EITC or child tax credit", () => {
    expect(() => calculateIL1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAGI: d(25000),
      federalEIC: d(3000),
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
      hasChildUnder12: true,
      voluntaryCharitableDonations: ZERO,
    })).toThrow(
      "IL-1040 Schedule IL-E/EIC is required when claiming Illinois EITC or Child Tax Credit on Lines 29 or 30",
    );
  });

  it("IL-1040 Schedule IL-E/EIC with NR allocation", () => {
    const zeroDC = () => ({ columnA: ZERO, columnB: ZERO });
    const dc = (a: number, b: number) => ({ columnA: d(a), columnB: d(b) });

    const result = calculateIL1040(makeInput({
      federalAGI: d(30000),
      federalEIC: d(4000),
      dependentCount: 1,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [{ relationship: "child", isUnder12: true, monthsInHome: 6 }],
        federalEIC: d(4000),
        // allocationDecimal will be set by NR schedule → piped through IL-1040
      },
      scheduleNR: {
        taxYear: 2025,
        residencyType: "part_year",
        income: {
          wages: dc(30000, 15000),
          interest: zeroDC(), dividends: zeroDC(), taxableRefunds: zeroDC(),
          alimony: zeroDC(), businessIncome: zeroDC(), capitalGains: zeroDC(),
          otherGains: zeroDC(), iraDistributions: zeroDC(), pensions: zeroDC(),
          rentalAndPartnership: zeroDC(), farmIncome: zeroDC(),
          unemployment: zeroDC(), socialSecurity: zeroDC(), otherIncome: zeroDC(),
        },
        adjustments: {
          educatorExpenses: zeroDC(), certainBusinessExpenses: zeroDC(),
          hsaDeduction: zeroDC(), movingExpenses: zeroDC(), seTaxDeduction: zeroDC(),
          sepSimpleDeduction: zeroDC(), seHealthInsurance: zeroDC(),
          earlyWithdrawalPenalty: zeroDC(), alimonyPaid: zeroDC(), iraDeduction: zeroDC(),
          studentLoanInterest: zeroDC(), archerMSA: zeroDC(), otherAdjustments: zeroDC(),
        },
        additionsSubtractions: {
          taxExemptInterest: zeroDC(), otherAdditions: zeroDC(),
          retirementSubtraction: zeroDC(), ilRefundSubtraction: zeroDC(),
          otherSubtractions: zeroDC(),
        },
      },
    }));

    // NR: IL base = 15000, full base = 30000 - 2850 exemptions ignored for base calc
    // Full base income = 30000 (AGI with no additions/subtractions)
    // NR IL base = 15000
    // Allocation = 15000 / 30000 = 0.500
    expect(result.allocationDecimal!.toNumber()).toBe(0.5);
    // IL EITC = 4000 × 0.20 × 0.500 = 400
    expect(result.ilEITC.toNumber()).toBe(400);
    // IL CTC = 400 × 0.40 = 160
    expect(result.ilChildTaxCredit.toNumber()).toBe(160);
  });

  it("IL-1040 Schedule IL-E/EIC auto-derives dependent count for Line 10d exemptions", () => {
    // dependentCount=0 (default), but scheduleEEIC has 3 dependents → Line 10d uses 3
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      federalEIC: d(2000),
      dependentCount: 0, // Explicit zero — should be overridden by schedule
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
          { relationship: "child", isUnder12: false, monthsInHome: 12 },
          { relationship: "stepchild", isUnder12: true, monthsInHome: 12 },
        ],
        federalEIC: d(2000),
      },
    }));
    // Dependent exemption = 3 × $2,850 = $8,550
    expect(result.dependentExemption.toNumber()).toBe(8550);
    expect(result.scheduleEEIC?.dependentExemptionAllowance.toNumber()).toBe(8550);
    // Personal (single) = $2,850, total = $2,850 + $8,550 = $11,400
    expect(result.totalExemptions.toNumber()).toBe(11400);
    // Net = 50000 - 11400 = 38600
    expect(result.netIncome.toNumber()).toBe(38600);
  });

  it("IL-1040 Schedule IL-E/EIC with zero dependents overrides nonzero dependentCount", () => {
    // dependentCount=5 (explicitly wrong), but scheduleEEIC has 0 dependents → uses 0
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      dependentCount: 5, // Should be overridden
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [],
        federalEIC: ZERO,
      },
    }));
    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.personalExemption.toNumber()).toBe(2850);
    expect(result.totalExemptions.toNumber()).toBe(2850);
  });

  it("IL-1040 requires Schedule IL-E/EIC to claim dependent exemptions on Line 10d", () => {
    expect(() => calculateIL1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAGI: d(50000),
      federalEIC: ZERO,
      taxExemptInterest: ZERO,
      otherAdditions: ZERO,
      retirementIncomeSubtraction: ZERO,
      ilRefundSubtraction: ZERO,
      otherSubtractions: ZERO,
      claimedAsDependent: false,
      age65OrOlderCount: 0,
      blindCount: 0,
      dependentCount: 2,
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
      voluntaryCharitableDonations: ZERO,
    })).toThrow(
      "IL-1040 Schedule IL-E/EIC is required when claiming dependent exemptions on Line 10d",
    );
  });

  it("IL-1040 Schedule IL-E/EIC dependent count + AGI threshold — exemptions denied despite dependents", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(260000), // Over $250K → all exemptions denied
      federalEIC: ZERO,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          { relationship: "child", isUnder12: true, monthsInHome: 12 },
        ],
        federalEIC: ZERO,
      },
    }));
    // All exemptions denied at high AGI, even with dependents from schedule
    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.totalExemptions.toNumber()).toBe(0);
  });
});

// ===========================================================================
// Use Tax Worksheet Integration
// ===========================================================================

describe("IL-1040 Use Tax Worksheet Integration", () => {
  it("IL-1040 Line 21 uses worksheet net use tax when useTaxWorksheet provided", () => {
    const result = calculateIL1040(makeInput({
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(75000),
        generalMerchandisePurchases: d(1000),
        qualifyingFoodDrugMedicalPurchases: ZERO,
        salesTaxPaidToOtherStates: ZERO,
      },
    }));
    // General: 1000 × 0.0625 = 62.50 → 63
    expect(result.useTax.toNumber()).toBe(63);
    expect(result.useTaxWorksheet).toBeDefined();
    expect(result.useTaxWorksheet!.generalMerchandiseTax.toNumber()).toBe(63);
    expect(result.useTaxWorksheet!.tableAmount.toNumber()).toBe(31); // AGI 75K → $31
  });

  it("IL-1040 Line 21 - worksheet use tax above the ST-44 threshold is reported as zero", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(50000),
        generalMerchandisePurchases: d(9600),
        qualifyingFoodDrugMedicalPurchases: ZERO,
        salesTaxPaidToOtherStates: ZERO,
      },
    }));

    expect(result.useTaxWorksheet).toBeDefined();
    expect(result.useTaxWorksheet!.netUseTax.toNumber()).toBe(600);
    expect(result.useTaxWorksheet!.requiresST44).toBe(true);
    expect(result.useTax.toNumber()).toBe(0);
    expect(result.totalTax.toNumber()).toBe(2334);
  });

  it("IL-1040 Line 21 falls back to raw useTax input when no worksheet", () => {
    const result = calculateIL1040(makeInput({
      useTax: d(50),
    }));
    expect(result.useTax.toNumber()).toBe(50);
    expect(result.useTaxWorksheet).toBeUndefined();
  });

  it("IL-1040 use tax worksheet flows into total tax", () => {
    const result = calculateIL1040(makeInput({
      federalAGI: d(50000),
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(50000),
        generalMerchandisePurchases: d(2000),
        qualifyingFoodDrugMedicalPurchases: d(500),
        salesTaxPaidToOtherStates: d(20),
      },
    }));
    // General: 2000 × 0.0625 = 125, Qualifying: 500 × 0.01 = 5
    // Net: 125 + 5 - 20 = 110
    expect(result.useTax.toNumber()).toBe(110);
    // Tax = (50000 - 2850) × 0.0495 = 47150 × 0.0495 = 2333.925 → 2334
    expect(result.incomeTax.toNumber()).toBe(2334);
    // Total tax = 2334 + 0 + 110 + 0 + 0 = 2444
    expect(result.totalTax.toNumber()).toBe(2444);
  });

  it("IL-1040 use tax worksheet audit trail includes UT Worksheet entries", () => {
    const result = calculateIL1040(makeInput({
      useTaxWorksheet: {
        taxYear: 2025,
        filingStatus: "single",
        federalAGI: d(75000),
        generalMerchandisePurchases: d(500),
        qualifyingFoodDrugMedicalPurchases: ZERO,
        salesTaxPaidToOtherStates: ZERO,
      },
    }));
    const forms = new Set(result.lines.map(l => l.form));
    expect(forms.has("UT Worksheet")).toBe(true);
    expect(forms.has("IL-1040")).toBe(true);
  });
});

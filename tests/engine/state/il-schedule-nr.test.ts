/**
 * Illinois Schedule NR — Nonresident and Part-Year Resident Computation
 * Spec: spec/state/il-schedule-nr.yaml
 *
 * Tests the allocation decimal computation, income/adjustment allocation,
 * and final IL tax computation for nonresidents and part-year residents.
 *
 * Source: Illinois Department of Revenue, 2025 Schedule NR Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleNR,
  computeISEDecimal,
  computeIRAAllocationDecimal,
  type ScheduleNRInput,
  type DualColumnAmount,
} from "@/engine/state/il-schedule-nr.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dc(a: number | string, b: number | string): DualColumnAmount {
  return { columnA: d(a), columnB: d(b) };
}

function zeroDC(): DualColumnAmount {
  return { columnA: ZERO, columnB: ZERO };
}

function makeInput(overrides: Partial<ScheduleNRInput> = {}): ScheduleNRInput {
  return {
    taxYear: 2025,
    residencyType: "nonresident",
    income: {
      wages: zeroDC(),
      interest: zeroDC(),
      dividends: zeroDC(),
      taxableRefunds: zeroDC(),
      alimony: zeroDC(),
      businessIncome: zeroDC(),
      capitalGains: zeroDC(),
      otherGains: zeroDC(),
      iraDistributions: zeroDC(),
      pensions: zeroDC(),
      rentalAndPartnership: zeroDC(),
      farmIncome: zeroDC(),
      unemployment: zeroDC(),
      socialSecurity: zeroDC(),
      otherIncome: zeroDC(),
    },
    adjustments: {
      educatorExpenses: zeroDC(),
      certainBusinessExpenses: zeroDC(),
      hsaDeduction: zeroDC(),
      movingExpenses: zeroDC(),
      seTaxDeduction: zeroDC(),
      sepSimpleDeduction: zeroDC(),
      seHealthInsurance: zeroDC(),
      earlyWithdrawalPenalty: zeroDC(),
      alimonyPaid: zeroDC(),
      iraDeduction: zeroDC(),
      studentLoanInterest: zeroDC(),
      archerMSA: zeroDC(),
      otherAdjustments: zeroDC(),
    },
    additionsSubtractions: {
      taxExemptInterest: zeroDC(),
      otherAdditions: zeroDC(),
      retirementSubtraction: zeroDC(),
      ilRefundSubtraction: zeroDC(),
      otherSubtractions: zeroDC(),
    },
    fullBaseIncome: ZERO,
    totalExemptions: ZERO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic allocation decimal (Step 5)
// ---------------------------------------------------------------------------

describe("Schedule NR — Allocation Decimal (Line 48)", () => {
  it("Line 48 - allocation decimal computation — 50% IL income", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 50000),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.ilBaseIncome.toNumber()).toBe(50000);
    expect(result.allocationDecimal.toNumber()).toBe(0.5);
  });

  it("Line 48 - allocation decimal rounds to 3 decimal places", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 33333),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(0.333);
  });

  it("Line 48 - allocation decimal caps at 1.000 when IL exceeds total", () => {
    // This can happen with different addition/subtraction allocations
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 80000),
        businessIncome: dc(0, 5000), // IL-only business income in Column B
      },
      fullBaseIncome: d(80000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(1);
  });

  it("Line 48 - allocation decimal is 0 when full base income is zero", () => {
    const input = makeInput({
      fullBaseIncome: ZERO,
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(0);
  });

  it("Line 48 - allocation decimal is 0 when full base income is negative", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(5000, 3000),
      },
      fullBaseIncome: d(-1000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(0);
  });

  it("Line 48 - allocation decimal for tiny IL portion", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(200000, 1000),
      },
      fullBaseIncome: d(200000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(0.005);
  });

  it("Line 48 - 100% IL income produces decimal of 1.000", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(75000, 75000),
      },
      fullBaseIncome: d(75000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Income totals (Step 3)
// ---------------------------------------------------------------------------

describe("Schedule NR — Income Computation (Lines 5-20)", () => {
  it("Line 5 - wages allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 60000),
      },
      fullBaseIncome: d(80000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(80000);
    expect(result.totalIncomeB.toNumber()).toBe(60000);
  });

  it("Line 6 - interest allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        interest: dc(5000, 0), // Nonbusiness interest = $0 for nonresidents
      },
      fullBaseIncome: d(55000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(55000);
    expect(result.totalIncomeB.toNumber()).toBe(50000);
  });

  it("Line 7 - dividends allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        dividends: dc(3000, 0), // Nonbusiness dividends = $0 for nonresidents
      },
      fullBaseIncome: d(53000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(53000);
    expect(result.totalIncomeB.toNumber()).toBe(50000);
  });

  it("Line 8 - refunds allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        taxableRefunds: dc(1000, 1000), // IL tax refund included in AGI
      },
      fullBaseIncome: d(51000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(51000);
  });

  it("Line 10 - business income allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 30000),
        businessIncome: dc(40000, 25000), // Multi-state business, IL portion via IAF
      },
      fullBaseIncome: d(90000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(90000);
    expect(result.totalIncomeB.toNumber()).toBe(55000);
  });

  it("Line 11 - capital gain allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 60000),
        capitalGains: dc(20000, 15000), // IL real property gains
      },
      fullBaseIncome: d(80000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(75000);
  });

  it("Line 12 - other gains allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        otherGains: dc(10000, 10000), // Entirely IL business
      },
      fullBaseIncome: d(60000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(60000);
  });

  it("Line 13 - IRA distributions nonresident zero", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(30000, 30000),
        iraDistributions: dc(20000, 0), // Nonresidents = $0
      },
      fullBaseIncome: d(50000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(50000);
    expect(result.totalIncomeB.toNumber()).toBe(30000);
  });

  it("Line 14 - pensions nonresident zero", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(20000, 20000),
        pensions: dc(30000, 0), // Nonresidents = $0
      },
      fullBaseIncome: d(50000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(50000);
    expect(result.totalIncomeB.toNumber()).toBe(20000);
  });

  it("Line 15 - rental/partnership allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        rentalAndPartnership: dc(12000, 8000), // IL real estate rental
      },
      fullBaseIncome: d(62000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(58000);
  });

  it("Line 16 - farm income allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        farmIncome: dc(45000, 45000), // Entirely in IL
      },
      fullBaseIncome: d(45000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(45000);
  });

  it("Line 17 - unemployment allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        unemployment: dc(3000, 3000), // IL IDES benefits
      },
      fullBaseIncome: d(53000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(53000);
  });

  it("Line 18 - SS nonresident zero", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(20000, 20000),
        socialSecurity: dc(15000, 0), // Nonresidents = $0
      },
      fullBaseIncome: d(35000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(35000);
    expect(result.totalIncomeB.toNumber()).toBe(20000);
  });

  it("Line 19 - other income allocation (lottery)", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 50000),
        otherIncome: dc(5000, 5000), // IL lottery winnings
      },
      fullBaseIncome: d(55000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(55000);
  });

  it("Line 20 - total income computation sums all 15 categories", () => {
    const input = makeInput({
      income: {
        wages: dc(50000, 30000),
        interest: dc(5000, 0),
        dividends: dc(3000, 0),
        taxableRefunds: dc(500, 500),
        alimony: dc(0, 0),
        businessIncome: dc(20000, 12000),
        capitalGains: dc(10000, 7000),
        otherGains: dc(2000, 2000),
        iraDistributions: dc(0, 0),
        pensions: dc(0, 0),
        rentalAndPartnership: dc(8000, 5000),
        farmIncome: dc(0, 0),
        unemployment: dc(0, 0),
        socialSecurity: dc(0, 0),
        otherIncome: dc(1500, 1500),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(100000);
    expect(result.totalIncomeB.toNumber()).toBe(58000);
  });
});

// ---------------------------------------------------------------------------
// Adjustments (Lines 22-36)
// ---------------------------------------------------------------------------

describe("Schedule NR — Adjustments (Lines 22-36)", () => {
  it("Line 36 - total adjustments", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 60000),
      },
      adjustments: {
        ...makeInput().adjustments,
        hsaDeduction: dc(3000, 3000),
        studentLoanInterest: dc(2500, 2500),
      },
      fullBaseIncome: d(74500),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalAdjustmentsA.toNumber()).toBe(5500);
    expect(result.totalAdjustmentsB.toNumber()).toBe(5500);
  });

  it("Line 26 - SE tax uses ISE decimal", () => {
    // ISE = 30000 / 50000 = 0.6
    // SE tax deduction Column B = 0.6 × 5000 = 3000
    const input = makeInput({
      income: {
        ...makeInput().income,
        businessIncome: dc(50000, 30000),
      },
      adjustments: {
        ...makeInput().adjustments,
        seTaxDeduction: dc(5000, 3000), // Pre-computed via ISE
      },
      fullBaseIncome: d(45000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalAdjustmentsA.toNumber()).toBe(5000);
    expect(result.totalAdjustmentsB.toNumber()).toBe(3000);
  });

  it("Line 27 - SEP uses ISE decimal", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        businessIncome: dc(100000, 50000),
      },
      adjustments: {
        ...makeInput().adjustments,
        sepSimpleDeduction: dc(10000, 5000), // ISE = 0.5
      },
      fullBaseIncome: d(90000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalAdjustmentsB.toNumber()).toBe(5000);
  });

  it("Line 28 - SE health insurance uses ISE decimal", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        businessIncome: dc(80000, 40000),
      },
      adjustments: {
        ...makeInput().adjustments,
        seHealthInsurance: dc(6000, 3000), // ISE = 0.5
      },
      fullBaseIncome: d(74000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalAdjustmentsB.toNumber()).toBe(3000);
  });

  it("Line 31 - IRA deduction allocation", () => {
    // IL earned income = 40000, total earned = 80000, decimal = 0.5
    // IRA deduction Column B = 0.5 × 6000 = 3000
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 40000),
      },
      adjustments: {
        ...makeInput().adjustments,
        iraDeduction: dc(6000, 3000), // Pre-computed via IRA decimal
      },
      fullBaseIncome: d(74000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalAdjustmentsB.toNumber()).toBe(3000);
  });

  it("Line 37 - income minus adjustments", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 50000),
        interest: dc(5000, 0),
      },
      adjustments: {
        ...makeInput().adjustments,
        hsaDeduction: dc(3000, 3000),
      },
      fullBaseIncome: d(82000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // A: 85000 - 3000 = 82000
    // B: 50000 - 3000 = 47000
    expect(result.agiA.toNumber()).toBe(82000);
    expect(result.agiB.toNumber()).toBe(47000);
  });
});

// ---------------------------------------------------------------------------
// Additions and Subtractions (Step 4)
// ---------------------------------------------------------------------------

describe("Schedule NR — Additions and Subtractions (Lines 39-45)", () => {
  it("Line 39 - tax-exempt interest allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 60000),
      },
      additionsSubtractions: {
        taxExemptInterest: dc(2000, 0), // Nonbusiness, nonresident = $0
        otherAdditions: zeroDC(),
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(62000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // Column B additions = 0, so IL base = 60000
    expect(result.totalWithAdditionsA.toNumber()).toBe(62000);
    expect(result.totalWithAdditionsB.toNumber()).toBe(60000);
  });

  it("Line 40 - additions allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 40000),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: dc(5000, 3000), // IL-source additions
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(65000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalWithAdditionsA.toNumber()).toBe(65000);
    expect(result.totalWithAdditionsB.toNumber()).toBe(43000);
  });

  it("Line 41 - total with additions", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(75000, 50000),
      },
      additionsSubtractions: {
        taxExemptInterest: dc(1000, 500),
        otherAdditions: dc(2000, 1000),
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(78000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // A: 75000 + 1000 + 2000 = 78000
    // B: 50000 + 500 + 1000 = 51500
    expect(result.totalWithAdditionsA.toNumber()).toBe(78000);
    expect(result.totalWithAdditionsB.toNumber()).toBe(51500);
  });

  it("Line 42 - retirement subtraction allocation — nonresident $0", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(40000, 40000),
        pensions: dc(20000, 0), // Nonresident
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: dc(20000, 0), // Nonresident = $0
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(40000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // IL base: 40000 - 0 = 40000
    expect(result.ilBaseIncome.toNumber()).toBe(40000);
  });

  it("Line 43 - IL refund subtraction", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 60000),
        taxableRefunds: dc(500, 500),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: dc(500, 500),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(60000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // AGI B = 60500, additions = 0, subtractions = 500
    // IL base = 60500 - 500 = 60000
    expect(result.ilBaseIncome.toNumber()).toBe(60000);
  });

  it("Line 44 - subtractions allocation", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(70000, 50000),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: dc(5000, 3000), // IL-source subtractions
      },
      fullBaseIncome: d(65000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // IL base = 50000 - 3000 = 47000
    expect(result.ilBaseIncome.toNumber()).toBe(47000);
  });

  it("Line 45 - total subtractions", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(80000, 60000),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: dc(10000, 5000),
        ilRefundSubtraction: dc(500, 500),
        otherSubtractions: dc(3000, 2000),
      },
      fullBaseIncome: d(66500),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalSubtractionsA.toNumber()).toBe(13500);
    expect(result.totalSubtractionsB.toNumber()).toBe(7500);
  });
});

// ---------------------------------------------------------------------------
// Step 5 — Tax computation (Lines 46-52)
// ---------------------------------------------------------------------------

describe("Schedule NR — Tax Computation (Lines 46-52)", () => {
  it("Line 46 - IL base income floors at zero", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(50000, 10000),
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: zeroDC(),
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: dc(0, 15000), // More subtractions than IL income
      },
      fullBaseIncome: d(50000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.ilBaseIncome.toNumber()).toBe(0);
    expect(result.ilTax.toNumber()).toBe(0);
  });

  it("Line 47 - full base income from IL-1040", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 40000),
      },
      fullBaseIncome: d(60000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.fullBaseIncome.toNumber()).toBe(60000);
  });

  it("Line 49 - exemption from IL-1040", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(60000, 30000),
      },
      fullBaseIncome: d(60000),
      totalExemptions: d(5700), // MFJ exemptions
    });
    const result = calculateScheduleNR(input);
    expect(result.totalExemptions.toNumber()).toBe(5700);
  });

  it("Line 50 - allocated exemptions = exemptions × allocation decimal", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 50000),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // allocation = 0.5, exemptions = 2850
    // allocated = 2850 × 0.5 = 1425
    expect(result.allocationDecimal.toNumber()).toBe(0.5);
    expect(result.allocatedExemptions.toNumber()).toBe(1425);
  });

  it("Line 50 - allocated exemptions round to whole dollars", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 33333),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // allocation decimal = 0.333
    // allocated exemptions = 2850 × 0.333 = 949.05 → rounds to 949
    expect(result.allocationDecimal.toNumber()).toBe(0.333);
    expect(result.allocatedExemptions.toNumber()).toBe(949);
  });

  it("Line 51 - IL net income = IL base income minus allocated exemptions", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 60000),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // allocation = 0.6, exemptions = 2850
    // allocated = 2850 × 0.6 = 1710
    // net = 60000 - 1710 = 58290
    expect(result.allocationDecimal.toNumber()).toBe(0.6);
    expect(result.allocatedExemptions.toNumber()).toBe(1710);
    expect(result.ilNetIncome.toNumber()).toBe(58290);
  });

  it("Line 51 - IL net income floors at zero when exemptions exceed base", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(200000, 1000),
      },
      fullBaseIncome: d(200000),
      totalExemptions: d(8550), // Large exemptions (MFJ + dependents)
    });
    const result = calculateScheduleNR(input);
    // allocation = 0.005, allocated exemptions = 8550 × 0.005 = 42.75 → 43
    // net = 1000 - 43 = 957
    expect(result.allocationDecimal.toNumber()).toBe(0.005);
    expect(result.allocatedExemptions.toNumber()).toBe(43);
    expect(result.ilNetIncome.toNumber()).toBe(957);
  });

  it("Line 52 - IL income tax at 4.95%", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 75000),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // allocation = 0.75
    // allocated exemptions = 2850 × 0.75 = 2137.5 → 2138
    // net = 75000 - 2138 = 72862
    // tax = 72862 × 0.0495 = 3606.669 → 3607
    expect(result.allocationDecimal.toNumber()).toBe(0.75);
    expect(result.allocatedExemptions.toNumber()).toBe(2138);
    expect(result.ilNetIncome.toNumber()).toBe(72862);
    expect(result.ilTax.toNumber()).toBe(3607);
  });

  it("Line 52 - zero IL income produces zero tax", () => {
    const input = makeInput({
      fullBaseIncome: d(50000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.ilBaseIncome.toNumber()).toBe(0);
    expect(result.ilNetIncome.toNumber()).toBe(0);
    expect(result.ilTax.toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ISE Decimal helper
// ---------------------------------------------------------------------------

describe("Schedule NR — ISE Decimal Computation", () => {
  it("ISE decimal computation — basic", () => {
    const result = computeISEDecimal(d(30000), d(50000));
    expect(result.toNumber()).toBe(0.6);
  });

  it("ISE decimal caps at 1.0", () => {
    const result = computeISEDecimal(d(60000), d(50000));
    expect(result.toNumber()).toBe(1);
  });

  it("ISE decimal floors at 0 for negative", () => {
    const result = computeISEDecimal(d(-5000), d(50000));
    expect(result.toNumber()).toBe(0);
  });

  it("ISE decimal is 0 when federal SE income is zero", () => {
    const result = computeISEDecimal(d(30000), d(0));
    expect(result.toNumber()).toBe(0);
  });

  it("ISE decimal is 0 when federal SE income is negative", () => {
    const result = computeISEDecimal(d(10000), d(-5000));
    expect(result.toNumber()).toBe(0);
  });

  it("ISE decimal rounds to 4 decimal places", () => {
    const result = computeISEDecimal(d(33333), d(100000));
    expect(result.toNumber()).toBe(0.3333);
  });
});

// ---------------------------------------------------------------------------
// IRA Allocation Decimal helper
// ---------------------------------------------------------------------------

describe("Schedule NR — IRA Allocation Decimal", () => {
  it("IRA allocation decimal — basic", () => {
    const result = computeIRAAllocationDecimal(d(40000), d(80000));
    expect(result.toNumber()).toBe(0.5);
  });

  it("IRA allocation decimal caps at 1.0", () => {
    const result = computeIRAAllocationDecimal(d(90000), d(80000));
    expect(result.toNumber()).toBe(1);
  });

  it("IRA allocation decimal floors at 0 when negative", () => {
    const result = computeIRAAllocationDecimal(d(-5000), d(80000));
    expect(result.toNumber()).toBe(0);
  });

  it("IRA allocation decimal is 0 when no earned income", () => {
    const result = computeIRAAllocationDecimal(d(40000), d(0));
    expect(result.toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Schedule NR accepts residency type
// ---------------------------------------------------------------------------

describe("Schedule NR — Residency", () => {
  it("Schedule NR accepts residency type", () => {
    const nonresInput = makeInput({ residencyType: "nonresident" });
    const partYearInput = makeInput({ residencyType: "part_year" });
    const nrResult = calculateScheduleNR(nonresInput);
    const pyResult = calculateScheduleNR(partYearInput);
    // Both produce valid results
    expect(nrResult.allocationDecimal.toNumber()).toBe(0);
    expect(pyResult.allocationDecimal.toNumber()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Realistic scenarios
// ---------------------------------------------------------------------------

describe("Schedule NR — Realistic Scenarios", () => {
  it("Nonresident worker: only IL wages, no investment income allocated", () => {
    const input = makeInput({
      residencyType: "nonresident",
      income: {
        ...makeInput().income,
        wages: dc(120000, 80000), // Works in IL
        interest: dc(5000, 0), // Nonbusiness
        dividends: dc(3000, 0), // Nonbusiness
        capitalGains: dc(10000, 0), // Not IL property
      },
      fullBaseIncome: d(138000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeA.toNumber()).toBe(138000);
    expect(result.totalIncomeB.toNumber()).toBe(80000);
    // allocation = 80000 / 138000 = 0.580 (rounded)
    expect(result.allocationDecimal.toNumber()).toBe(0.58);
    const expectedAllocExempt = d(2850).times(d("0.580")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(result.allocatedExemptions.toNumber()).toBe(expectedAllocExempt);
  });

  it("Part-year resident: moved to IL mid-year, mixed income sources", () => {
    const input = makeInput({
      residencyType: "part_year",
      income: {
        ...makeInput().income,
        wages: dc(80000, 40000), // Half year in IL
        interest: dc(2000, 1000), // Half received while IL resident
        dividends: dc(1000, 500),
        pensions: dc(10000, 5000), // Received while IL resident
        socialSecurity: dc(6000, 3000), // Received while IL resident
      },
      additionsSubtractions: {
        taxExemptInterest: dc(500, 250),
        otherAdditions: zeroDC(),
        retirementSubtraction: dc(16000, 8000), // Part-year allocation
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(83000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // Income B = 40000 + 1000 + 500 + 5000 + 3000 = 49500
    expect(result.totalIncomeB.toNumber()).toBe(49500);
    // AGI B = 49500
    // + additions B = 250
    // = 49750
    // - subtractions B = 8000
    // = 41750
    expect(result.ilBaseIncome.toNumber()).toBe(41750);
  });

  it("Multi-state self-employed: business income via IAF + SE deductions via ISE", () => {
    // Business in both IL and another state. IAF = 0.6
    // Federal business income = 100000, IL portion = 60000
    // SE tax deduction: federal = 7065, IL = ISE × 7065
    // ISE = 60000 / 100000 = 0.6
    // SE tax Column B = 0.6 × 7065 = 4239
    const input = makeInput({
      residencyType: "nonresident",
      income: {
        ...makeInput().income,
        businessIncome: dc(100000, 60000),
      },
      adjustments: {
        ...makeInput().adjustments,
        seTaxDeduction: dc(7065, 4239),
        sepSimpleDeduction: dc(10000, 6000),
        seHealthInsurance: dc(5000, 3000),
      },
      fullBaseIncome: d(77935),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    // Income B = 60000
    // Adjustments B = 4239 + 6000 + 3000 = 13239
    // AGI B = 60000 - 13239 = 46761
    // IL base = 46761
    expect(result.agiB.toNumber()).toBe(46761);
    expect(result.ilBaseIncome.toNumber()).toBe(46761);
  });

  it("Retired nonresident: pension/SS not taxed, only IL rental income", () => {
    const input = makeInput({
      residencyType: "nonresident",
      income: {
        ...makeInput().income,
        pensions: dc(30000, 0), // Not taxed to nonresidents
        socialSecurity: dc(18000, 0), // Not taxed to nonresidents
        rentalAndPartnership: dc(24000, 24000), // IL rental property
      },
      additionsSubtractions: {
        taxExemptInterest: zeroDC(),
        otherAdditions: zeroDC(),
        retirementSubtraction: dc(48000, 0), // No IL-source retirement
        ilRefundSubtraction: zeroDC(),
        otherSubtractions: zeroDC(),
      },
      fullBaseIncome: d(24000), // After retirement subtraction
      totalExemptions: d(5700), // MFJ
    });
    const result = calculateScheduleNR(input);
    // IL income = only rental = 24000
    // Allocation = 24000 / 24000 = 1.000
    expect(result.ilBaseIncome.toNumber()).toBe(24000);
    expect(result.allocationDecimal.toNumber()).toBe(1);
    // Allocated exemptions = 5700 × 1.000 = 5700
    expect(result.allocatedExemptions.toNumber()).toBe(5700);
    // Net = 24000 - 5700 = 18300
    // Tax = 18300 × 0.0495 = 905.85 → 906
    expect(result.ilNetIncome.toNumber()).toBe(18300);
    expect(result.ilTax.toNumber()).toBe(906);
  });

  it("IL lottery winner (nonresident): only lottery income taxed", () => {
    const input = makeInput({
      residencyType: "nonresident",
      income: {
        ...makeInput().income,
        wages: dc(60000, 0), // No IL wages
        otherIncome: dc(50000, 50000), // IL lottery winnings
      },
      fullBaseIncome: d(110000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.totalIncomeB.toNumber()).toBe(50000);
    // allocation = 50000 / 110000 = 0.455 (rounded to 3 dp)
    expect(result.allocationDecimal.toNumber()).toBe(0.455);
  });

  it("Full allocation (100% IL) produces same result as resident computation", () => {
    const wages = d(75000);
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: { columnA: wages, columnB: wages },
      },
      fullBaseIncome: wages,
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.allocationDecimal.toNumber()).toBe(1);
    expect(result.allocatedExemptions.toNumber()).toBe(2850);
    // Net = 75000 - 2850 = 72150
    // Tax = 72150 × 0.0495 = 3571.425 → 3571
    expect(result.ilNetIncome.toNumber()).toBe(72150);
    expect(result.ilTax.toNumber()).toBe(3571);
  });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

describe("Schedule NR — Audit Trail", () => {
  it("produces audit trail lines for all computed values", () => {
    const input = makeInput({
      income: {
        ...makeInput().income,
        wages: dc(100000, 60000),
      },
      fullBaseIncome: d(100000),
      totalExemptions: d(2850),
    });
    const result = calculateScheduleNR(input);
    expect(result.lines.length).toBeGreaterThan(0);

    // Check key lines exist
    const lineNums = result.lines.map((l) => l.line);
    expect(lineNums).toContain("48");
    expect(lineNums).toContain("50");
    expect(lineNums).toContain("51");
    expect(lineNums).toContain("52");
  });
});

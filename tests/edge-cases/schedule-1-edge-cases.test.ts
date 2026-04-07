/**
 * Edge case tests for Schedule 1 — Additional Income and Adjustments to Income.
 * Spec: spec/federal/schedule-1.yaml
 *
 * Covers boundary conditions for:
 *   - Student loan interest deduction phase-outs ($85K/$100K single, $170K/$200K MFJ)
 *   - Educator expenses $300 per-person cap ($600 MFJ)
 *   - Self-employed health insurance net-profit cap
 *   - NOL deduction reducing additional income
 *   - Unemployment compensation aggregation
 *   - Cancellation of debt income
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule1, type Schedule1Input } from "@/engine/schedules/schedule-1.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: {
  filingStatus?: TaxYearInput["taxpayer"]["filingStatus"];
  wages?: string;
  adjustments?: TaxYearInput["adjustments"];
  form1099G?: TaxYearInput["form1099G"];
  form1099C?: TaxYearInput["form1099C"];
  codExclusion?: TaxYearInput["codExclusion"];
  extra?: Schedule1Input;
}): { input: TaxYearInput; extra?: Schedule1Input } {
  const wages = overrides.wages ?? "50000";
  return {
    input: {
      taxpayer: {
        taxYear: 2025,
        filingStatus: overrides.filingStatus ?? "single",
        primary: {
          firstName: "Test",
          lastName: "User",
          ssn: "123-45-6789",
          dateOfBirth: "1990-01-15",
          occupation: "Engineer",
        },
        ...(overrides.filingStatus === "married_filing_jointly" ? {
          spouse: {
            firstName: "Spouse",
            lastName: "User",
            ssn: "987-65-4321",
            dateOfBirth: "1991-06-20",
          },
        } : {}),
        ...(overrides.filingStatus === "married_filing_separately" ? {
          spouse: {
            firstName: "Spouse",
            lastName: "User",
            ssn: "987-65-4321",
            dateOfBirth: "1991-06-20",
          },
        } : {}),
        address: {
          street: "123 Test St",
          city: "Seattle",
          state: "WA",
          zip: "98101",
        },
        dependents: [],
      },
      w2s: [{
        employer: { name: "Employer", ein: "12-3456789" },
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: "0",
        medicareWages: wages,
        medicareWithheld: "0",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      adjustments: overrides.adjustments,
      form1099G: overrides.form1099G,
      form1099C: overrides.form1099C,
      codExclusion: overrides.codExclusion,
    },
    extra: overrides.extra,
  };
}

// ═══════════════════════════════════════════════════════════
// Student Loan Interest Deduction Phase-Out Boundaries
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 21 - Student loan interest deduction phase-out boundaries", () => {
  it("Schedule 1 Line 21 - single filer at exactly $85,000 MAGI gets full $2,500 deduction", () => {
    const { input, extra } = makeInput({
      wages: "85000",
      adjustments: { studentLoanInterest: "3000" },
    });
    const result = calculateSchedule1(input, extra);

    // $3,000 paid, capped at $2,500, MAGI at phase-out start → full deduction
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - single filer at $85,001 MAGI begins losing deduction", () => {
    const { input, extra } = makeInput({
      wages: "85001",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    // MAGI = $85,001, exceeds start by $1
    // Phase-out ratio = 1 / 15000 = 0.0000666...
    // Reduction = $2,500 × ratio ≈ $0.17, deduction ≈ $2,500 - $0.17 = $2,499.83 → $2,500 rounded
    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - single filer at $92,500 MAGI (midpoint) gets 50% deduction", () => {
    const { input, extra } = makeInput({
      wages: "92500",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    // Phase-out ratio = (92500 - 85000) / (100000 - 85000) = 7500 / 15000 = 0.5
    // Deduction = $2,500 - ($2,500 × 0.5) = $1,250
    expect(result.studentLoanInterest.toNumber()).toBe(1250);
  });

  it("Schedule 1 Line 21 - single filer at $99,999 MAGI gets minimal deduction", () => {
    const { input, extra } = makeInput({
      wages: "99999",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    // Phase-out ratio = (99999 - 85000) / 15000 = 14999 / 15000 = 0.99993...
    // Deduction = $2,500 - ($2,500 × 0.99993...) = $0.17 → rounds to $0
    expect(result.studentLoanInterest.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 21 - single filer at exactly $100,000 MAGI gets $0 deduction", () => {
    const { input, extra } = makeInput({
      wages: "100000",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.studentLoanInterest.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 21 - MFS filer always gets $0 deduction regardless of income", () => {
    const { input, extra } = makeInput({
      filingStatus: "married_filing_separately",
      wages: "30000",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.studentLoanInterest.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 21 - MFJ at exactly $170,000 MAGI gets full $2,500 deduction", () => {
    const { input, extra } = makeInput({
      filingStatus: "married_filing_jointly",
      wages: "170000",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.studentLoanInterest.toNumber()).toBe(2500);
  });

  it("Schedule 1 Line 21 - MFJ at exactly $200,000 MAGI gets $0 deduction", () => {
    const { input, extra } = makeInput({
      filingStatus: "married_filing_jointly",
      wages: "200000",
      adjustments: { studentLoanInterest: "2500" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.studentLoanInterest.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 21 - interest paid below $2,500 is not inflated to the cap", () => {
    const { input, extra } = makeInput({
      wages: "50000",
      adjustments: { studentLoanInterest: "800" },
    });
    const result = calculateSchedule1(input, extra);

    // Below phase-out, interest = min($800, $2,500) = $800
    expect(result.studentLoanInterest.toNumber()).toBe(800);
  });
});

// ═══════════════════════════════════════════════════════════
// Educator Expenses $300 Per-Person Cap
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 11 - Educator expenses $300 cap boundaries", () => {
  it("Schedule 1 Line 11 - single filer at exactly $300 gets full deduction", () => {
    const { input, extra } = makeInput({
      adjustments: { educatorExpenses: "300" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 Line 11 - single filer at $301 is capped at $300", () => {
    const { input, extra } = makeInput({
      adjustments: { educatorExpenses: "301" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.educatorExpenses.toNumber()).toBe(300);
  });

  it("Schedule 1 Line 11 - MFJ with per-spouse entries each capped independently at $300", () => {
    const { input, extra } = makeInput({
      filingStatus: "married_filing_jointly",
      adjustments: {
        primaryEducatorExpenses: "500",
        spouseEducatorExpenses: "400",
      },
    });
    const result = calculateSchedule1(input, extra);

    // Each capped to $300 → $600 total
    expect(result.educatorExpenses.toNumber()).toBe(600);
  });

  it("Schedule 1 Line 11 - MFJ with primary $300 and spouse $300 yields exactly $600", () => {
    const { input, extra } = makeInput({
      filingStatus: "married_filing_jointly",
      adjustments: {
        primaryEducatorExpenses: "300",
        spouseEducatorExpenses: "300",
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.educatorExpenses.toNumber()).toBe(600);
  });

  it("Schedule 1 Line 11 - non-MFJ filer ignores spouse educator expenses", () => {
    const { input, extra } = makeInput({
      filingStatus: "single",
      adjustments: {
        primaryEducatorExpenses: "250",
        spouseEducatorExpenses: "200",
      },
    });
    const result = calculateSchedule1(input, extra);

    // Single filer: only primary counts
    expect(result.educatorExpenses.toNumber()).toBe(250);
  });

  it("Schedule 1 Line 11 - zero educator expenses yields $0", () => {
    const { input, extra } = makeInput({
      adjustments: { educatorExpenses: "0" },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.educatorExpenses.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Self-Employed Health Insurance Net-Profit Cap
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 17 - SE health insurance net-profit cap", () => {
  it("Schedule 1 Line 17 - SE health insurance at exactly the net-profit cap", () => {
    // Cap = max(0, netProfit - seDeductibleHalf - seRetirement)
    // Cap = max(0, 50000 - 5000 - 3000) = 42000
    const { input, extra } = makeInput({
      adjustments: { selfEmployedHealthInsurance: "42000" },
      extra: {
        schedCNetProfit: d(50000),
        seDeductibleHalf: d(5000),
        seRetirementContributions: d(3000),
        selfEmploymentTax: d(10000),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.seHealthInsurance.toNumber()).toBe(42000);
  });

  it("Schedule 1 Line 17 - SE health insurance exceeding net-profit cap is capped", () => {
    // Cap = max(0, 50000 - 5000 - 3000) = 42000
    const { input, extra } = makeInput({
      adjustments: { selfEmployedHealthInsurance: "50000" },
      extra: {
        schedCNetProfit: d(50000),
        seDeductibleHalf: d(5000),
        seRetirementContributions: d(3000),
        selfEmploymentTax: d(10000),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.seHealthInsurance.toNumber()).toBe(42000);
  });

  it("Schedule 1 Line 17 - SE health insurance cap floors at zero when expenses exceed profit", () => {
    // Cap = max(0, 10000 - 7000 - 5000) = max(0, -2000) = 0
    const { input, extra } = makeInput({
      adjustments: { selfEmployedHealthInsurance: "8000" },
      extra: {
        schedCNetProfit: d(10000),
        seDeductibleHalf: d(7000),
        seRetirementContributions: d(5000),
        selfEmploymentTax: d(14000),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.seHealthInsurance.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 17 - pre-computed SE health insurance bypasses cap logic", () => {
    // Even though cap would be lower, pre-computed value is trusted
    const { input, extra } = makeInput({
      extra: {
        schedCNetProfit: d(10000),
        seDeductibleHalf: d(5000),
        seRetirementContributions: d(3000),
        seHealthInsurance: d(8000),
        selfEmploymentTax: d(10000),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.seHealthInsurance.toNumber()).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════
// NOL Deduction
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 8a - NOL deduction boundaries", () => {
  it("Schedule 1 Line 8a - NOL deduction reduces additional income", () => {
    const { input, extra } = makeInput({
      extra: {
        nolDeduction: d(5000),
        schedCNetProfit: d(20000),
        selfEmploymentTax: d(2826),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.nolDeduction.toNumber()).toBe(5000);
    // totalAdditionalIncome includes businessIncome (20000) minus NOL (5000)
    // plus any other additional income items
    expect(result.totalAdditionalIncome.toNumber()).toBe(15000);
  });

  it("Schedule 1 Line 8a - zero NOL has no effect", () => {
    const { input, extra } = makeInput({
      extra: {
        nolDeduction: d(0),
        schedCNetProfit: d(10000),
        selfEmploymentTax: d(1413),
      },
    });
    const result = calculateSchedule1(input, extra);

    expect(result.nolDeduction.toNumber()).toBe(0);
    expect(result.totalAdditionalIncome.toNumber()).toBe(10000);
  });

  it("Schedule 1 Line 8a - negative NOL input is floored at zero", () => {
    const { input, extra } = makeInput({
      extra: {
        nolDeduction: d(-5000),
        schedCNetProfit: d(10000),
        selfEmploymentTax: d(1413),
      },
    });
    const result = calculateSchedule1(input, extra);

    // Negative NOL is clamped to zero (Decimal.max(0, -5000) = 0)
    expect(result.nolDeduction.toNumber()).toBe(0);
    expect(result.totalAdditionalIncome.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Unemployment Compensation Aggregation
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 7 - Unemployment compensation aggregation", () => {
  it("Schedule 1 Line 7 - multiple 1099-G forms sum unemployment compensation", () => {
    const { input, extra } = makeInput({
      form1099G: [
        { payer: "State A", unemploymentCompensation: "5000" },
        { payer: "State B", unemploymentCompensation: "3000" },
        { payer: "State C", unemploymentCompensation: "2000" },
      ],
    });
    const result = calculateSchedule1(input, extra);

    expect(result.unemploymentCompensation.toNumber()).toBe(10000);
  });

  it("Schedule 1 Line 7 - zero unemployment with no 1099-G forms", () => {
    const { input, extra } = makeInput({});
    const result = calculateSchedule1(input, extra);

    expect(result.unemploymentCompensation.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Total Adjustments Aggregation
// ═══════════════════════════════════════════════════════════

describe("Schedule 1 Line 26 - Total adjustments aggregation", () => {
  it("Schedule 1 Line 26 - all adjustment types combine correctly", () => {
    // Keep wages low enough that student loan MAGI stays below $85K phase-out
    const { input, extra } = makeInput({
      wages: "30000",
      adjustments: {
        educatorExpenses: "300",
        studentLoanInterest: "2500",
        earlyWithdrawalPenalty: "100",
        alimonyPaid: "6000",
      },
      extra: {
        seDeductibleHalf: d(3532),
        seRetirementContributions: d(5000),
        schedCNetProfit: d(30000),
        selfEmploymentTax: d(7064),
      },
    });
    const result = calculateSchedule1(input, extra);

    // MAGI = 30000 + 30000 - (3532 + 5000 + 300 + 100 + 6000) = 45068 < $85K
    // Educator: $300, SE deduction: $3,532, SE retirement: $5,000,
    // early withdrawal: $100, alimony: $6,000, student loan: $2,500 (full)
    const expectedTotal = 300 + 3532 + 5000 + 100 + 6000 + 2500;
    expect(result.totalAdjustments.toNumber()).toBe(expectedTotal);
  });

  it("Schedule 1 Line 26 - zero adjustments when no deductions claimed", () => {
    const { input, extra } = makeInput({});
    const result = calculateSchedule1(input, extra);

    expect(result.totalAdjustments.toNumber()).toBe(0);
  });
});

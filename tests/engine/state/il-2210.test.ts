/**
 * Tests for Illinois IL-2210 — Computation of Penalties for Individuals
 * Spec: spec/state/il-2210.yaml
 *
 * 2025: 7% underpayment penalty rate, $1,000 threshold ($500 MFS),
 * 90% current year / 100% prior year safe harbor.
 * Quarterly due dates: Apr 15, Jun 15, Sep 15, Jan 15.
 * Source: Illinois Department of Revenue, 2025 IL-2210 Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateIL2210,
  IL_2210_CONSTANTS,
  type IL2210Input,
  type IL2210Result,
} from "@/engine/state/il-2210.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);
const Q_ZERO: [Decimal, Decimal, Decimal, Decimal] = [ZERO, ZERO, ZERO, ZERO];

function makeInput(overrides: Partial<IL2210Input> = {}): IL2210Input {
  return {
    taxYear: 2025,
    filingStatus: "single",
    totalTax: d(5000),
    ilEITC: ZERO,
    ilChildTaxCredit: ZERO,
    priorYearTax: d(4500),
    priorYearReturnFiled: true,
    ilWithholding: ZERO,
    estimatedPayments: Q_ZERO,
    ...overrides,
  };
}

const annualizedBackLoadedIncome = {
  annualizedInstallmentMethod: {
    periods: [
      {
        baseIncome: d(5000),
        exemptions: ZERO,
        surcharges: ZERO,
        credits: ZERO,
      },
      {
        baseIncome: d(15000),
        exemptions: ZERO,
        surcharges: ZERO,
        credits: ZERO,
      },
      {
        baseIncome: d(30000),
        exemptions: ZERO,
        surcharges: ZERO,
        credits: ZERO,
      },
      {
        baseIncome: d(101010),
        exemptions: ZERO,
        surcharges: ZERO,
        credits: ZERO,
      },
    ],
  },
} as Partial<IL2210Input>;

describe("Illinois IL-2210", () => {
  // ==================== Step 1: Required Annual Payment ====================

  it("IL-2210 Line 1 - total tax flows through", () => {
    const result = calculateIL2210(makeInput({ totalTax: d(7500) }));
    expect(result.totalTax.toNumber()).toBe(7500);
  });

  it("IL-2210 Line 2 - refundable credits", () => {
    const result = calculateIL2210(makeInput({
      ilEITC: d(600),
      ilChildTaxCredit: d(240),
    }));
    expect(result.refundableCredits.toNumber()).toBe(840);
  });

  it("IL-2210 Line 3 - net tax liability", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(5000),
      ilEITC: d(600),
    }));
    expect(result.netTax.toNumber()).toBe(4400);
  });

  it("IL-2210 Line 3 - net tax floors at zero", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(500),
      ilEITC: d(800),
    }));
    expect(result.netTax.toNumber()).toBe(0);
  });

  it("IL-2210 Line 4 - 90 percent of current year tax", () => {
    const result = calculateIL2210(makeInput({ totalTax: d(5000) }));
    // 5000 × 0.90 = 4500
    expect(result.currentYearRequired.toNumber()).toBe(4500);
  });

  it("IL-2210 Line 5 - prior year tax", () => {
    const result = calculateIL2210(makeInput({ priorYearTax: d(3800) }));
    expect(result.priorYearTax.toNumber()).toBe(3800);
  });

  it("IL-2210 Line 5 - uses Line 4 when no prior year return", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(5000),
      priorYearReturnFiled: false,
    }));
    // Line 4 = 5000 × 0.90 = 4500, Line 5 should also be 4500
    expect(result.priorYearTax.toNumber()).toBe(4500);
  });

  it("IL-2210 Line 6 - required annual payment is min of Line 4 and Line 5", () => {
    // Line 4 = 5000 × 0.90 = 4500, Line 5 = 4000 → min = 4000
    const result = calculateIL2210(makeInput({
      totalTax: d(5000),
      priorYearTax: d(4000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(4000);
  });

  it("IL-2210 Line 6 - required payment uses 90% current when lower", () => {
    // Line 4 = 3000 × 0.90 = 2700, Line 5 = 5000 → min = 2700
    const result = calculateIL2210(makeInput({
      totalTax: d(3000),
      priorYearTax: d(5000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(2700);
  });

  it("IL-2210 Line 7 - IL withholding", () => {
    const result = calculateIL2210(makeInput({ ilWithholding: d(3000) }));
    expect(result.ilWithholding.toNumber()).toBe(3000);
  });

  it("IL-2210 Line 8 - estimated tax required", () => {
    // Required annual = min(4500, 4500) = 4500, withholding = 2000
    // Estimated required = 4500 - 2000 = 2500
    const result = calculateIL2210(makeInput({ ilWithholding: d(2000) }));
    expect(result.estimatedTaxRequired.toNumber()).toBe(2500);
  });

  it("IL-2210 Line 8 - estimated tax floors at zero", () => {
    const result = calculateIL2210(makeInput({ ilWithholding: d(6000) }));
    expect(result.estimatedTaxRequired.toNumber()).toBe(0);
  });

  // ==================== Step 2: Penalty Required ====================

  it("IL-2210 no penalty when net tax below threshold", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(900),
      priorYearTax: d(800),
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 no penalty when net tax exactly at threshold ($1,000 single)", () => {
    // Net tax = 1000 → at threshold, penalty IS required (>= $1,000)
    const result = calculateIL2210(makeInput({
      totalTax: d(1000),
      priorYearTax: d(900),
    }));
    expect(result.penaltyRequired).toBe(true);
  });

  it("IL-2210 no penalty when net tax $999 (just below threshold)", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(999),
      priorYearTax: d(900),
    }));
    expect(result.penaltyRequired).toBe(false);
  });

  it("IL-2210 MFS threshold is $500", () => {
    const result = calculateIL2210(makeInput({
      filingStatus: "married_filing_separately",
      totalTax: d(499),
      priorYearTax: d(400),
    }));
    expect(result.penaltyRequired).toBe(false);
  });

  it("IL-2210 MFS penalty required at $500", () => {
    const result = calculateIL2210(makeInput({
      filingStatus: "married_filing_separately",
      totalTax: d(500),
      priorYearTax: d(2000),
    }));
    expect(result.penaltyRequired).toBe(true);
  });

  it("IL-2210 no penalty when withholding covers required payment", () => {
    // Required = min(4500, 4500) = 4500, withholding = 5000
    const result = calculateIL2210(makeInput({
      ilWithholding: d(5000),
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.penaltyExemptReason).toContain("Withholding covers");
  });

  it("IL-2210 penalty required when withholding insufficient", () => {
    const result = calculateIL2210(makeInput({
      ilWithholding: d(1000),
    }));
    expect(result.penaltyRequired).toBe(true);
  });

  it("IL-2210 no penalty when taxpayer qualifies as a farmer", () => {
    const result = calculateIL2210(makeInput({
      qualifiesAsFarmer: true,
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.penaltyExemptReason).toContain("farmer");
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 no penalty when taxpayer or spouse is age 65+ and permanently in a nursing home", () => {
    const result = calculateIL2210(makeInput({
      is65OrOlderAndPermanentlyInNursingHome: true,
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.penaltyExemptReason).toContain("nursing home");
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 no penalty when taxpayer was not required to file the prior-year IL-1040", () => {
    const result = calculateIL2210(makeInput({
      notRequiredToFilePriorYearReturn: true,
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.penaltyExemptReason).toContain("not required to file");
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  // ==================== Step 3: Quarterly Computation ====================

  it("IL-2210 Line 9 - quarterly installment amount", () => {
    // Required annual = min(4500, 4500) = 4500, per quarter = 1125
    const result = calculateIL2210(makeInput());
    expect(result.requiredInstallment.toNumber()).toBe(1125);
  });

  it("IL-2210 Line 9 - quarterly installment rounds", () => {
    // Required annual = min(3000 × 0.9, 2000) = min(2700, 2000) = 2000
    // Per quarter = 500
    const result = calculateIL2210(makeInput({
      totalTax: d(3000),
      priorYearTax: d(2000),
    }));
    expect(result.requiredInstallment.toNumber()).toBe(500);
  });

  it("IL-2210 quarterly underpayment computation - no payments", () => {
    // No withholding, no estimated payments
    // Required = 4500, per quarter = 1125
    // Each quarter: underpayment = 1125
    const result = calculateIL2210(makeInput());
    expect(result.quarters).toHaveLength(4);
    expect(result.quarters[0].underpayment.toNumber()).toBe(1125);
    expect(result.quarters[1].underpayment.toNumber()).toBe(1125);
    expect(result.quarters[2].underpayment.toNumber()).toBe(1125);
    expect(result.quarters[3].underpayment.toNumber()).toBe(1125);
  });

  it("IL-2210 quarterly computation with withholding only", () => {
    // Withholding = 2000, allocated 500/quarter
    // Required = 4500, per quarter = 1125
    // Each quarter: underpayment = 1125 - 500 = 625
    const result = calculateIL2210(makeInput({ ilWithholding: d(2000) }));
    expect(result.quarters[0].underpayment.toNumber()).toBe(625);
    expect(result.quarters[1].underpayment.toNumber()).toBe(625);
    expect(result.quarters[2].underpayment.toNumber()).toBe(625);
    expect(result.quarters[3].underpayment.toNumber()).toBe(625);
  });

  it("IL-2210 quarterly computation with estimated payments", () => {
    // No withholding, estimated payments: Q1=1200, Q2=1200, Q3=1200, Q4=1200
    // Required per quarter = 1125
    // Q1: paid 1200, required 1125, overpayment carry = 75
    // Q2: required 1125 - 75 carry = 1050, paid 1200, carry = 150
    // Q3: required 1125 - 150 carry = 975, paid 1200, carry = 225
    // Q4: required 1125 - 225 carry = 900, paid 1200, carry = 300
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(1200), d(1200), d(1200), d(1200)],
    }));
    expect(result.quarters[0].underpayment.toNumber()).toBe(0);
    expect(result.quarters[0].overpaymentCarry.toNumber()).toBe(75);
    expect(result.quarters[1].underpayment.toNumber()).toBe(0);
    expect(result.quarters[2].underpayment.toNumber()).toBe(0);
    expect(result.quarters[3].underpayment.toNumber()).toBe(0);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 quarterly computation with partial payments", () => {
    // No withholding, estimated: Q1=500, Q2=500, Q3=500, Q4=500
    // Required per quarter = 1125
    // Q1: paid 500, required 1125, underpayment = 625
    // Q2: paid 500, required 1125, underpayment = 625
    // Q3: paid 500, required 1125, underpayment = 625
    // Q4: paid 500, required 1125, underpayment = 625
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(500), d(500), d(500), d(500)],
    }));
    expect(result.quarters[0].underpayment.toNumber()).toBe(625);
    expect(result.quarters[1].underpayment.toNumber()).toBe(625);
    expect(result.quarters[2].underpayment.toNumber()).toBe(625);
    expect(result.quarters[3].underpayment.toNumber()).toBe(625);
  });

  it("IL-2210 overpayment carries forward across quarters", () => {
    // No withholding, estimated: Q1=2000, Q2=0, Q3=0, Q4=0
    // Required per quarter = 1125
    // Q1: paid 2000, required 1125, carry = 875
    // Q2: required 1125 - 875 = 250, paid 0, underpayment = 250
    // Q3: required 1125, paid 0, underpayment = 1125
    // Q4: required 1125, paid 0, underpayment = 1125
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(2000), ZERO, ZERO, ZERO],
    }));
    expect(result.quarters[0].underpayment.toNumber()).toBe(0);
    expect(result.quarters[0].overpaymentCarry.toNumber()).toBe(875);
    expect(result.quarters[1].underpayment.toNumber()).toBe(250);
    expect(result.quarters[2].underpayment.toNumber()).toBe(1125);
    expect(result.quarters[3].underpayment.toNumber()).toBe(1125);
  });

  it("IL-2210 large Q1 overpayment covers multiple quarters", () => {
    // No withholding, estimated: Q1=4500, Q2=0, Q3=0, Q4=0
    // Required per quarter = 1125
    // Q1: paid 4500, required 1125, carry = 3375
    // Q2: required 1125 - 3375 carry → required 0, carry = 2250
    // Q3: required 1125 - 2250 carry → required 0, carry = 1125
    // Q4: required 1125 - 1125 carry → required 0, carry = 0
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(4500), ZERO, ZERO, ZERO],
    }));
    for (const q of result.quarters) {
      expect(q.underpayment.toNumber()).toBe(0);
    }
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 Line 9b - annualized worksheet required installments replace equal quarterly installments", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(5556),
      priorYearTax: d(4500),
      estimatedPayments: [d(223), d(579), d(702), d(2996)],
      ...annualizedBackLoadedIncome,
    }));

    expect(result.requiredAnnualPayment.toNumber()).toBe(4500);
    expect(result.requiredInstallment.toNumber()).toBe(1125);
    expect(result.quarters.map((quarter) => quarter.requiredInstallment.toNumber())).toEqual([
      223,
      579,
      702,
      2996,
    ]);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 Step 6 Line 39 through Line 56 - annualized worksheet carries prior excess regular installments forward", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(5556),
      priorYearTax: d(4500),
      ...annualizedBackLoadedIncome,
    }));

    const annualizedWorksheet = (result as IL2210Result & {
      annualizedWorksheet?: {
        columns: Array<{
          annualizationFactor: Decimal;
          applicablePercentage: Decimal;
          priorExcessRegularInstallments: Decimal;
          regularInstallmentCap: Decimal;
          excessRegularInstallment: Decimal;
          requiredInstallment: Decimal;
        }>;
      };
    }).annualizedWorksheet;

    expect(annualizedWorksheet?.columns.map((column) => column.annualizationFactor.toNumber())).toEqual([
      4,
      2.4,
      1.5,
      1,
    ]);
    expect(annualizedWorksheet?.columns.map((column) => column.applicablePercentage.toNumber())).toEqual([
      0.225,
      0.45,
      0.675,
      0.9,
    ]);
    expect(annualizedWorksheet?.columns[1].priorExcessRegularInstallments.toNumber()).toBe(902);
    expect(annualizedWorksheet?.columns[2].priorExcessRegularInstallments.toNumber()).toBe(1448);
    expect(annualizedWorksheet?.columns[3].regularInstallmentCap.toNumber()).toBe(2996);
    expect(annualizedWorksheet?.columns.map((column) => column.excessRegularInstallment.toNumber())).toEqual([
      902,
      1448,
      1871,
      0,
    ]);
    expect(annualizedWorksheet?.columns.map((column) => column.requiredInstallment.toNumber())).toEqual([
      223,
      579,
      702,
      2996,
    ]);
  });

  it("IL-2210 Step 6 Line 46 - 2025 restored Illinois Child Tax Credit is excluded before June and included afterward", () => {
    const result = calculateIL2210({
      ...makeInput({
        totalTax: d(4000),
        priorYearTax: d(6000),
      }),
      annualizedInstallmentMethod: {
        periods: [
          {
            baseIncome: d(20000),
            exemptions: ZERO,
            surcharges: ZERO,
            credits: d(50),
            ilChildTaxCredit: d(40),
          },
          {
            baseIncome: d(20000),
            exemptions: ZERO,
            surcharges: ZERO,
            credits: d(50),
            ilChildTaxCredit: d(40),
          },
          {
            baseIncome: d(20000),
            exemptions: ZERO,
            surcharges: ZERO,
            credits: d(50),
            ilChildTaxCredit: d(40),
          },
          {
            baseIncome: d(20000),
            exemptions: ZERO,
            surcharges: ZERO,
            credits: d(50),
            ilChildTaxCredit: d(40),
          },
        ],
      },
    });

    const annualizedWorksheet = result.annualizedWorksheet;

    expect(annualizedWorksheet?.columns.map((column) => column.credits.toNumber())).toEqual([
      50,
      50,
      90,
      90,
    ]);
    expect(annualizedWorksheet?.columns.map((column) => column.netTaxAfterCredits.toNumber())).toEqual([
      3910,
      2326,
      1395,
      900,
    ]);
  });

  // ==================== Penalty Computation ====================

  it("IL-2210 penalty computation with underpayment", () => {
    // No withholding, no estimated payments
    // Required per quarter = 1125
    // All quarters underpaid by 1125
    // Daily rate = 0.07 / 365 = 0.00019178...
    // Q1: 1125 × 0.07/365 × 365 = 1125 × 0.07 = 78.75 → 79
    // Q2: 1125 × 0.07/365 × 304 = 1125 × 0.07 × 304/365 = 65.59... → 66
    // Q3: 1125 × 0.07/365 × 212 = 1125 × 0.07 × 212/365 = 45.74... → 46
    // Q4: 1125 × 0.07/365 × 90 = 1125 × 0.07 × 90/365 = 19.42... → 19
    // Total = 79 + 66 + 46 + 19 = 210
    const result = calculateIL2210(makeInput());
    expect(result.quarters[0].quarterPenalty.toNumber()).toBe(79);
    expect(result.quarters[1].quarterPenalty.toNumber()).toBe(66);
    expect(result.quarters[2].quarterPenalty.toNumber()).toBe(46);
    expect(result.quarters[3].quarterPenalty.toNumber()).toBe(19);
    expect(result.totalPenalty.toNumber()).toBe(210);
  });

  it("IL-2210 penalty only on underpaid quarters", () => {
    // Estimated: Q1=1125, Q2=1125, Q3=0, Q4=0
    // Q1 and Q2 fully paid → no penalty
    // Q3 and Q4 underpaid by 1125 each
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(1125), d(1125), ZERO, ZERO],
    }));
    expect(result.quarters[0].quarterPenalty.toNumber()).toBe(0);
    expect(result.quarters[1].quarterPenalty.toNumber()).toBe(0);
    expect(result.quarters[2].quarterPenalty.toNumber()).toBeGreaterThan(0);
    expect(result.quarters[3].quarterPenalty.toNumber()).toBeGreaterThan(0);
  });

  it("IL-2210 penalty zero when no underpayment", () => {
    // Full estimated payments: 1125 per quarter
    const result = calculateIL2210(makeInput({
      estimatedPayments: [d(1125), d(1125), d(1125), d(1125)],
    }));
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 penalty zero when exempt (below threshold)", () => {
    const result = calculateIL2210(makeInput({
      totalTax: d(800),
      priorYearTax: d(700),
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  // ==================== Filing Status Scenarios ====================

  it("IL-2210 MFJ uses $1,000 threshold", () => {
    const result = calculateIL2210(makeInput({
      filingStatus: "married_filing_jointly",
      totalTax: d(999),
      priorYearTax: d(500),
    }));
    expect(result.penaltyRequired).toBe(false);
  });

  it("IL-2210 HoH uses $1,000 threshold", () => {
    const result = calculateIL2210(makeInput({
      filingStatus: "head_of_household",
      totalTax: d(1500),
      priorYearTax: d(1200),
    }));
    expect(result.penaltyRequired).toBe(true);
  });

  // ==================== Integration / E2E Scenarios ====================

  it("W-2 employee with adequate withholding — no penalty", () => {
    // Tax = 4800, withholding = 4500, prior year = 4200
    // Net tax = 4800, required = min(4320, 4200) = 4200
    // Withholding 4500 > 4200 → no penalty
    const result = calculateIL2210(makeInput({
      totalTax: d(4800),
      priorYearTax: d(4200),
      ilWithholding: d(4500),
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("Self-employed with quarterly estimated payments", () => {
    // Tax = 8000, prior year = 6000
    // Required = min(7200, 6000) = 6000
    // Per quarter = 1500
    // Estimated: Q1=1500, Q2=1500, Q3=1500, Q4=1500
    // All quarters met → penalty = 0
    const result = calculateIL2210(makeInput({
      totalTax: d(8000),
      priorYearTax: d(6000),
      estimatedPayments: [d(1500), d(1500), d(1500), d(1500)],
    }));
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("Self-employed who started paying late", () => {
    // Tax = 8000, prior year = 6000
    // Required = 6000, per quarter = 1500
    // Estimated: Q1=0, Q2=0, Q3=3000, Q4=3000
    // Q1: underpayment = 1500
    // Q2: underpayment = 1500
    // Q3: paid 3000, required 1500, carry = 1500
    // Q4: required 1500 - 1500 carry = 0, paid 3000, carry = 3000
    const result = calculateIL2210(makeInput({
      totalTax: d(8000),
      priorYearTax: d(6000),
      estimatedPayments: [ZERO, ZERO, d(3000), d(3000)],
    }));
    expect(result.quarters[0].underpayment.toNumber()).toBe(1500);
    expect(result.quarters[1].underpayment.toNumber()).toBe(1500);
    expect(result.quarters[2].underpayment.toNumber()).toBe(0);
    expect(result.quarters[3].underpayment.toNumber()).toBe(0);
    // Q1 penalty: 1500 × 0.07/365 × 365 = 105
    // Q2 penalty: 1500 × 0.07/365 × 304 = 87.45... → 87
    expect(result.quarters[0].quarterPenalty.toNumber()).toBe(105);
    expect(result.quarters[1].quarterPenalty.toNumber()).toBe(87);
    expect(result.totalPenalty.toNumber()).toBe(192);
  });

  it("New filer (no prior year return) uses 90% current year", () => {
    // Tax = 5000, no prior return
    // Required = min(4500, 4500) = 4500 (Line 5 = Line 4 when no prior return)
    const result = calculateIL2210(makeInput({
      totalTax: d(5000),
      priorYearReturnFiled: false,
    }));
    expect(result.priorYearTax.toNumber()).toBe(4500);
    expect(result.requiredAnnualPayment.toNumber()).toBe(4500);
  });

  it("Prior year tax much higher than current year", () => {
    // Tax = 3000, prior year = 10000
    // Required = min(2700, 10000) = 2700
    // If paid nothing: per quarter = 675
    const result = calculateIL2210(makeInput({
      totalTax: d(3000),
      priorYearTax: d(10000),
    }));
    expect(result.requiredAnnualPayment.toNumber()).toBe(2700);
    expect(result.requiredInstallment.toNumber()).toBe(675);
  });

  it("Mix of withholding and estimated payments", () => {
    // Tax = 6000, prior year = 5000
    // Required = min(5400, 5000) = 5000
    // Withholding = 2000 → 500/quarter
    // Estimated: Q1=800, Q2=800, Q3=800, Q4=800
    // Per quarter = 1250
    // Each quarter: paid = 500 + 800 = 1300, required = 1250
    // All covered with $50 overpayment each quarter
    const result = calculateIL2210(makeInput({
      totalTax: d(6000),
      priorYearTax: d(5000),
      ilWithholding: d(2000),
      estimatedPayments: [d(800), d(800), d(800), d(800)],
    }));
    for (const q of result.quarters) {
      expect(q.underpayment.toNumber()).toBe(0);
    }
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("Low-income with refundable credits eliminating tax", () => {
    // Tax = 800, EITC = 600, CTC = 240
    // Net tax = 800 - 840 = 0 (floored) → below $1,000
    const result = calculateIL2210(makeInput({
      totalTax: d(800),
      ilEITC: d(600),
      ilChildTaxCredit: d(240),
      priorYearTax: d(300),
    }));
    expect(result.netTax.toNumber()).toBe(0);
    expect(result.penaltyRequired).toBe(false);
  });

  // ==================== Edge Cases ====================

  it("IL-2210 zero tax — no penalty", () => {
    const result = calculateIL2210(makeInput({
      totalTax: ZERO,
      priorYearTax: ZERO,
    }));
    expect(result.penaltyRequired).toBe(false);
    expect(result.totalPenalty.toNumber()).toBe(0);
  });

  it("IL-2210 penalty days correct per quarter", () => {
    const c = IL_2210_CONSTANTS[2025];
    expect(c.penaltyDays[0]).toBe(365); // Q1: Apr 15 → Apr 15
    expect(c.penaltyDays[1]).toBe(304); // Q2: Jun 15 → Apr 15
    expect(c.penaltyDays[2]).toBe(212); // Q3: Sep 15 → Apr 15
    expect(c.penaltyDays[3]).toBe(90);  // Q4: Jan 15 → Apr 15
  });

  it("IL-2210 penalty rate is 7% for 2025", () => {
    const c = IL_2210_CONSTANTS[2025];
    expect(c.penaltyRate.toNumber()).toBe(0.07);
  });

  it("IL-2210 audit trail contains key lines", () => {
    const result = calculateIL2210(makeInput());
    const lineNumbers = result.lines.map(l => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("3");
    expect(lineNumbers).toContain("6");
    expect(lineNumbers).toContain("8");
    expect(lineNumbers).toContain("9");
    expect(lineNumbers).toContain("Q1");
    expect(lineNumbers).toContain("Q4");
    expect(lineNumbers).toContain("penalty");
  });

  it("IL-2210 unsupported tax year throws", () => {
    expect(() => calculateIL2210(makeInput({ taxYear: 2020 }))).toThrow();
  });
});

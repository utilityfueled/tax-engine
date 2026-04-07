/**
 * Tests for Pennsylvania Form PA-40 — Personal Income Tax Return
 * Spec: spec/state/pa-40.yaml
 *
 * PA flat 3.07% income tax on 8 classes of income.
 * Net losses in one class cannot offset income in another class.
 * No standard deduction, no progressive brackets.
 * Source: PA Department of Revenue, PA-40 Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePA40,
  calculatePA40AllowedOtherCredits,
  type PA40Input,
} from "@/engine/state/pa-40.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

/** Helper to build a PA40Input with defaults */
function makeInput(overrides: Partial<PA40Input> = {}): PA40Input {
  return {
    taxYear: 2025,
    compensation: ZERO,
    unreimbursedExpenses: ZERO,
    interest: ZERO,
    dividends: ZERO,
    netBusinessIncome: ZERO,
    netGainOrLoss: ZERO,
    netRentalIncome: ZERO,
    estateTrustIncome: ZERO,
    gamblingIncome: ZERO,
    otherDeductions: ZERO,
    taxForgivenessEligibilityIncome: ZERO,
    useTax: ZERO,
    stateWithholding: ZERO,
    creditFromPriorYear: ZERO,
    extensionPayment: ZERO,
    estimatedPayments: ZERO,
    nonresidentTaxWithheld: ZERO,
    refundableCredits: ZERO,
    taxForgivenessCredit: ZERO,
    residentCredit: ZERO,
    otherCredits: ZERO,
    underpaymentPenalty: ZERO,
    lateFilingOrPaymentPenalty: ZERO,
    latePaymentInterest: ZERO,
    ...overrides,
  };
}

describe("Pennsylvania PA-40 Personal Income Tax Return", () => {
  // =================================================================
  // Part A — Income Classes
  // =================================================================

  describe("Part A — Income Classes", () => {
    it("PA-40 Line 1a - compensation from W-2 wages", () => {
      const result = calculatePA40(makeInput({ compensation: d(75000) }));
      expect(result.compensation.toNumber()).toBe(75000);
      expect(result.netCompensation.toNumber()).toBe(75000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(75000);
      // $75,000 × 3.07% = $2,302.50 → $2,303
      expect(result.taxLiability.toNumber()).toBe(2303);
    });

    it("PA-40 Line 1b - unreimbursed expenses reduce compensation", () => {
      const result = calculatePA40(makeInput({
        compensation: d(75000),
        unreimbursedExpenses: d(5000),
      }));
      expect(result.netCompensation.toNumber()).toBe(70000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(70000);
      // $70,000 × 3.07% = $2,149
      expect(result.taxLiability.toNumber()).toBe(2149);
    });

    it("PA-40 Line 1b - unreimbursed expenses cannot make compensation negative", () => {
      const result = calculatePA40(makeInput({
        compensation: d(3000),
        unreimbursedExpenses: d(5000),
      }));
      expect(result.netCompensation.toNumber()).toBe(0);
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 2 - interest income", () => {
      const result = calculatePA40(makeInput({ interest: d(1500) }));
      expect(result.interest.toNumber()).toBe(1500);
      expect(result.totalPATaxableIncome.toNumber()).toBe(1500);
      // $1,500 × 3.07% = $46.05 → $46
      expect(result.taxLiability.toNumber()).toBe(46);
    });

    it("PA-40 Line 3 - dividend income", () => {
      const result = calculatePA40(makeInput({ dividends: d(2000) }));
      expect(result.dividends.toNumber()).toBe(2000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(2000);
      // $2,000 × 3.07% = $61.40 → $61
      expect(result.taxLiability.toNumber()).toBe(61);
    });

    it("PA-40 Line 4 - business income", () => {
      const result = calculatePA40(makeInput({ netBusinessIncome: d(50000) }));
      expect(result.netBusinessIncome.toNumber()).toBe(50000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(50000);
      // $50,000 × 3.07% = $1,535
      expect(result.taxLiability.toNumber()).toBe(1535);
    });

    it("PA-40 Line 4 - business loss does not contribute to total (clamped to 0)", () => {
      const result = calculatePA40(makeInput({ netBusinessIncome: d(-10000) }));
      expect(result.netBusinessIncome.toNumber()).toBe(-10000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 5 - net gains/losses", () => {
      const result = calculatePA40(makeInput({ netGainOrLoss: d(25000) }));
      expect(result.netGainOrLoss.toNumber()).toBe(25000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(25000);
      // $25,000 × 3.07% = $767.50 → $768
      expect(result.taxLiability.toNumber()).toBe(768);
    });

    it("PA-40 Line 5 - net capital loss does not contribute to total", () => {
      const result = calculatePA40(makeInput({ netGainOrLoss: d(-15000) }));
      expect(result.netGainOrLoss.toNumber()).toBe(-15000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 6 - rental income", () => {
      const result = calculatePA40(makeInput({ netRentalIncome: d(12000) }));
      expect(result.netRentalIncome.toNumber()).toBe(12000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(12000);
      // $12,000 × 3.07% = $368.40 → $368
      expect(result.taxLiability.toNumber()).toBe(368);
    });

    it("PA-40 Line 6 - net rental loss does not contribute to total", () => {
      const result = calculatePA40(makeInput({ netRentalIncome: d(-8000) }));
      expect(result.netRentalIncome.toNumber()).toBe(-8000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 7 - estate/trust income", () => {
      const result = calculatePA40(makeInput({ estateTrustIncome: d(5000) }));
      expect(result.estateTrustIncome.toNumber()).toBe(5000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(5000);
      // $5,000 × 3.07% = $153.50 → $154
      expect(result.taxLiability.toNumber()).toBe(154);
    });

    it("PA-40 Line 8 - gambling income", () => {
      const result = calculatePA40(makeInput({ gamblingIncome: d(10000) }));
      expect(result.gamblingIncome.toNumber()).toBe(10000);
      expect(result.totalPATaxableIncome.toNumber()).toBe(10000);
      // $10,000 × 3.07% = $307
      expect(result.taxLiability.toNumber()).toBe(307);
    });
  });

  // =================================================================
  // Line 9 — Total PA Taxable Income (Loss Limitation)
  // =================================================================

  describe("Line 9 — Loss Limitation", () => {
    it("PA-40 Line 9 - total PA taxable income with loss limitation", () => {
      // Wages $50,000 + business loss -$10,000 → only wages count
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        netBusinessIncome: d(-10000),
      }));
      expect(result.totalPATaxableIncome.toNumber()).toBe(50000);
      // $50,000 × 3.07% = $1,535
      expect(result.taxLiability.toNumber()).toBe(1535);
    });

    it("PA-40 Line 9 - multiple positive classes sum together", () => {
      const result = calculatePA40(makeInput({
        compensation: d(60000),
        interest: d(2000),
        dividends: d(3000),
        netBusinessIncome: d(15000),
      }));
      expect(result.totalPATaxableIncome.toNumber()).toBe(80000);
      // $80,000 × 3.07% = $2,456
      expect(result.taxLiability.toNumber()).toBe(2456);
    });

    it("PA-40 Line 9 - losses in multiple classes all clamped to zero", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        netBusinessIncome: d(-20000),
        netGainOrLoss: d(-15000),
        netRentalIncome: d(-5000),
      }));
      // Only wages count — all losses clamped
      expect(result.totalPATaxableIncome.toNumber()).toBe(50000);
      expect(result.taxLiability.toNumber()).toBe(1535);
    });

    it("PA-40 Line 9 - all classes negative produces zero total income", () => {
      const result = calculatePA40(makeInput({
        netBusinessIncome: d(-20000),
        netGainOrLoss: d(-15000),
        netRentalIncome: d(-5000),
      }));
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 9 - all 8 classes populated with positive income", () => {
      const result = calculatePA40(makeInput({
        compensation: d(60000),
        interest: d(1000),
        dividends: d(2000),
        netBusinessIncome: d(10000),
        netGainOrLoss: d(5000),
        netRentalIncome: d(3000),
        estateTrustIncome: d(2000),
        gamblingIncome: d(500),
      }));
      // Total: 60000 + 1000 + 2000 + 10000 + 5000 + 3000 + 2000 + 500 = 83,500
      expect(result.totalPATaxableIncome.toNumber()).toBe(83500);
      // $83,500 × 3.07% = $2,563.45 → $2,563
      expect(result.taxLiability.toNumber()).toBe(2563);
    });

    it("PA-40 Line 9 - mixed positive and negative classes: only positives sum", () => {
      const result = calculatePA40(makeInput({
        compensation: d(80000),
        interest: d(500),
        dividends: d(1200),
        netBusinessIncome: d(-25000),
        netGainOrLoss: d(10000),
        netRentalIncome: d(-8000),
        estateTrustIncome: d(3000),
        gamblingIncome: d(2000),
      }));
      // Positive classes: 80000 + 500 + 1200 + 10000 + 3000 + 2000 = 96,700
      // Negative classes (-25000, -8000) clamped to 0
      expect(result.totalPATaxableIncome.toNumber()).toBe(96700);
      // $96,700 × 3.07% = $2,968.69 → $2,969
      expect(result.taxLiability.toNumber()).toBe(2969);
    });

    it("PA-40 Line 9 - zero income across all classes", () => {
      const result = calculatePA40(makeInput({}));
      expect(result.totalPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Line 10/11 — Other Deductions
  // =================================================================

  describe("Line 10/11 — Other Deductions", () => {
    it("PA-40 Line 10 - other deductions reduce total taxable income", () => {
      const result = calculatePA40(makeInput({
        compensation: d(60000),
        otherDeductions: d(5000),
      }));
      expect(result.totalPATaxableIncome.toNumber()).toBe(60000);
      expect(result.otherDeductions.toNumber()).toBe(5000);
      expect(result.adjustedPATaxableIncome.toNumber()).toBe(55000);
      // $55,000 × 3.07% = $1,688.50 → $1,689
      expect(result.taxLiability.toNumber()).toBe(1689);
    });

    it("PA-40 Line 11 - adjusted taxable income cannot go below zero", () => {
      const result = calculatePA40(makeInput({
        compensation: d(3000),
        otherDeductions: d(5000),
      }));
      expect(result.totalPATaxableIncome.toNumber()).toBe(3000);
      expect(result.adjustedPATaxableIncome.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Line 12 — Tax Liability (3.07%)
  // =================================================================

  describe("Line 12 — Tax Liability", () => {
    it("PA-40 Line 12 - tax liability at 3.07%", () => {
      const result = calculatePA40(makeInput({ compensation: d(100000) }));
      // $100,000 × 3.07% = $3,070 exactly
      expect(result.taxLiability.toNumber()).toBe(3070);
    });

    it("PA-40 Line 12 - same rate for all income levels (flat tax)", () => {
      const result = calculatePA40(makeInput({ compensation: d(1000000) }));
      // $1,000,000 × 3.07% = $30,700 exactly
      expect(result.taxLiability.toNumber()).toBe(30700);
    });

    it("PA-40 Line 12 - rounding: $50,000 × 3.07% = $1,535 exactly", () => {
      const result = calculatePA40(makeInput({ compensation: d(50000) }));
      expect(result.taxLiability.toNumber()).toBe(1535);
    });

    it("PA-40 Line 12 - rounding: $33,333 × 3.07% = $1,023.32 → $1,023", () => {
      const result = calculatePA40(makeInput({ compensation: d(33333) }));
      // $33,333 × 0.0307 = $1,023.3231 → rounds to $1,023
      expect(result.taxLiability.toNumber()).toBe(1023);
    });

    it("PA-40 Line 12 - rounding: $1 × 3.07% = $0.0307 → $0", () => {
      const result = calculatePA40(makeInput({ compensation: d(1) }));
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 Line 12 - rounding: $17 × 3.07% = $0.5219 → $1 (rounds up)", () => {
      const result = calculatePA40(makeInput({ compensation: d(17) }));
      // $17 × 0.0307 = $0.5219 → rounds to $1
      expect(result.taxLiability.toNumber()).toBe(1);
    });

    it("PA-40 Line 12 - minimum income to owe $1: $17 (first dollar of tax)", () => {
      // $16 × 0.0307 = $0.4912 → $0
      const result16 = calculatePA40(makeInput({ compensation: d(16) }));
      expect(result16.taxLiability.toNumber()).toBe(0);

      // $17 × 0.0307 = $0.5219 → $1
      const result17 = calculatePA40(makeInput({ compensation: d(17) }));
      expect(result17.taxLiability.toNumber()).toBe(1);
    });
  });

  // =================================================================
  // Payments and Credits
  // =================================================================

  describe("Payments and Credits", () => {
    it("PA-40 Line 13 - state withholding", () => {
      const result = calculatePA40(makeInput({
        compensation: d(75000),
        stateWithholding: d(2303),
      }));
      expect(result.stateWithholding.toNumber()).toBe(2303);
      expect(result.totalPayments.toNumber()).toBe(2303);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 Line 14 - credit from prior year", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        creditFromPriorYear: d(500),
      }));
      expect(result.creditFromPriorYear.toNumber()).toBe(500);
      expect(result.totalPayments.toNumber()).toBe(500);
    });

    it("PA-40 Line 17 - nonresident tax withheld increases total payments", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        nonresidentTaxWithheld: d(200),
      }));

      expect(result.nonresidentTaxWithheld.toNumber()).toBe(200);
      expect(result.totalPayments.toNumber()).toBe(200);
    });

    it("PA-40 - total payments include all payment sources", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
        creditFromPriorYear: d(200),
        extensionPayment: d(100),
        estimatedPayments: d(300),
        nonresidentTaxWithheld: d(200),
        refundableCredits: d(250),
      }));
      expect(result.totalPayments.toNumber()).toBe(2050);
    });

    it("PA-40 Line 24 - total payments and credits include withholding payments and supported credits", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
        creditFromPriorYear: d(200),
        estimatedPayments: d(300),
        extensionPayment: d(100),
        nonresidentTaxWithheld: d(200),
        refundableCredits: d(250),
        taxForgivenessCredit: d(100),
        residentCredit: d(75),
        otherCredits: d(50),
      }));

      expect(result.totalEstimatedPaymentsAndCredits.toNumber()).toBe(800);
      expect(result.totalPayments.toNumber()).toBe(2050);
      expect(result.totalCredits.toNumber()).toBe(225);
      expect(result.totalPaymentsAndCredits.toNumber()).toBe(2275);
    });

    it("PA-40 refundable credits increase total payments and refund", () => {
      const result = calculatePA40(makeInput({
        compensation: d(10000),
        refundableCredits: d(500),
      }));

      // Tax: $10,000 × 3.07% = $307
      // Refundable credits are carried with payments, not capped by tax.
      expect(result.taxLiability.toNumber()).toBe(307);
      expect(result.netTaxLiability.toNumber()).toBe(307);
      expect(result.totalPayments.toNumber()).toBe(500);
      expect(result.overpayment.toNumber()).toBe(193);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("PA-40 Line 20 - tax forgiveness eligibility income flows from Schedule SP", () => {
      const result = calculatePA40(makeInput({
        compensation: d(5000),
        taxForgivenessEligibilityIncome: d(9000),
      }));

      expect(result.taxForgivenessEligibilityIncome.toNumber()).toBe(9000);
    });

    it("PA-40 Line 21 - tax forgiveness credit reduces tax owed", () => {
      const result = calculatePA40(makeInput({
        compensation: d(20000),
        taxForgivenessCredit: d(614), // Full forgiveness of $20K × 3.07% = $614
      }));
      expect(result.taxLiability.toNumber()).toBe(614);
      expect(result.taxForgivenessCredit.toNumber()).toBe(614);
      expect(result.totalCredits.toNumber()).toBe(614);
      expect(result.netTaxLiability.toNumber()).toBe(0);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 Line 22 - resident credit from Schedule G-L", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        residentCredit: d(1500),
      }));
      // Tax: $100,000 × 3.07% = $3,070
      expect(result.taxLiability.toNumber()).toBe(3070);
      expect(result.residentCredit.toNumber()).toBe(1500);
      expect(result.totalCredits.toNumber()).toBe(1500);
      expect(result.netTaxLiability.toNumber()).toBe(1570);
    });

    it("PA-40 Line 23 - other credits from Schedule OC, Schedule DC, and related PA credit schedules", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        otherCredits: d(1250),
      }));
      expect(result.otherCredits.toNumber()).toBe(1250);
      expect(result.totalCredits.toNumber()).toBe(1250);
      // Tax: $1,535; net: $1,535 - $1,250 = $285
      expect(result.netTaxLiability.toNumber()).toBe(285);
    });

    it("PA-40 Line 23 - refundable line 23 credits can exceed remaining liability and create an overpayment", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        taxForgivenessCredit: d(300),
        residentCredit: d(1000),
        otherCredits: d(500),
      }));

      // Tax: $1,535; Line 23 amount is treated as already allowed by the upstream schedule.
      expect(result.taxLiability.toNumber()).toBe(1535);
      expect(result.otherCredits.toNumber()).toBe(500);
      expect(result.totalCredits.toNumber()).toBe(1800);
      expect(result.netTaxLiability.toNumber()).toBe(0);
      expect(result.totalPaymentsAndCredits.toNumber()).toBe(1800);
      expect(result.netOverpayment.toNumber()).toBe(265);
    });

    it("PA-40 restricted-credit helper caps Schedule OC credits to remaining liability after resident credit and tax forgiveness", () => {
      const allowedCredits = calculatePA40AllowedOtherCredits({
        taxLiability: d(1535),
        taxForgivenessCredit: d(300),
        residentCredit: d(1000),
        otherCredits: d(500),
      });

      expect(allowedCredits.toNumber()).toBe(235);
    });

    it("PA-40 Line 22a - total credits sum", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        taxForgivenessCredit: d(500),
        residentCredit: d(1000),
        otherCredits: d(300),
      }));
      // Tax: $3,070; credits: 500 + 1000 + 300 = 1800
      expect(result.totalCredits.toNumber()).toBe(1800);
      expect(result.netTaxLiability.toNumber()).toBe(1270);
    });

    it("PA-40 Line 23a - net tax liability after credits", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        taxForgivenessCredit: d(1000),
      }));
      // Tax: $1,535; credit: $1,000; net: $535
      expect(result.netTaxLiability.toNumber()).toBe(535);
    });

    it("PA-40 Line 23a - net tax liability floors at zero when credits exceed tax", () => {
      const result = calculatePA40(makeInput({
        compensation: d(5000),
        taxForgivenessCredit: d(154), // Full forgiveness
        residentCredit: d(100), // Extra credits
      }));
      // Tax: $154; credits: 154 + 100 = $254; net: $0 (floored)
      expect(result.taxLiability.toNumber()).toBe(154);
      expect(result.totalCredits.toNumber()).toBe(254);
      expect(result.netTaxLiability.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Refund / Balance Due
  // =================================================================

  describe("Refund / Balance Due", () => {
    it("PA-40 - overpayment when payments exceed net tax", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(2000),
      }));
      // Tax: $1,535; no credits; net tax: $1,535
      // Overpayment: $2,000 - $1,535 = $465
      expect(result.taxLiability.toNumber()).toBe(1535);
      expect(result.netTaxLiability.toNumber()).toBe(1535);
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("PA-40 - balance due when net tax exceeds payments", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
      }));
      // Net tax: $1,535; Withholding: $1,000
      // Amount owed: $1,535 - $1,000 = $535
      expect(result.netTaxLiability.toNumber()).toBe(1535);
      expect(result.amountOwed.toNumber()).toBe(535);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 - exact payment produces zero owed and zero refund", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        stateWithholding: d(3070),
      }));
      expect(result.netTaxLiability.toNumber()).toBe(3070);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 - no income, no payments: zero across the board", () => {
      const result = calculatePA40(makeInput({}));
      expect(result.taxLiability.toNumber()).toBe(0);
      expect(result.netTaxLiability.toNumber()).toBe(0);
      expect(result.totalPayments.toNumber()).toBe(0);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 - overpayment with tax forgiveness credit zeroing net tax", () => {
      const result = calculatePA40(makeInput({
        compensation: d(20000),
        stateWithholding: d(614),
        taxForgivenessCredit: d(614),
      }));
      // Tax: $614; credits: $614; net tax: $0
      // Tax forgiveness reduces tax but does not itself create a refundable payment.
      expect(result.taxLiability.toNumber()).toBe(614);
      expect(result.netTaxLiability.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(614);
      expect(result.amountOwed.toNumber()).toBe(0);
    });

    it("PA-40 - resident credit reduces net tax, payment covers remainder", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        residentCredit: d(2000),
        stateWithholding: d(1070),
      }));
      // Tax: $3,070; credit: $2,000; net tax: $1,070
      // The resident credit reduces tax liability but is not itself refundable.
      expect(result.netTaxLiability.toNumber()).toBe(1070);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 - combined credits and payments create overpayment", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        taxForgivenessCredit: d(500),
        residentCredit: d(200),
        stateWithholding: d(1535),
      }));
      // Tax: $1,535; credits: $700; net tax: $835
      // Only withholding is on the payment side; the credits reduce net tax.
      expect(result.netTaxLiability.toNumber()).toBe(835);
      expect(result.overpayment.toNumber()).toBe(700);
      expect(result.amountOwed.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Realistic Scenarios
  // =================================================================

  describe("Realistic Scenarios", () => {
    it("PA-40 - typical W-2 employee: wages $85,000, withholding $2,610", () => {
      const result = calculatePA40(makeInput({
        compensation: d(85000),
        interest: d(250),
        stateWithholding: d(2610),
      }));
      // Total PA taxable: $85,250
      // Tax: $85,250 × 3.07% = $2,617.18 → $2,617
      expect(result.totalPATaxableIncome.toNumber()).toBe(85250);
      expect(result.taxLiability.toNumber()).toBe(2617);
      // Owes: $2,617 - $2,610 = $7
      expect(result.amountOwed.toNumber()).toBe(7);
      expect(result.overpayment.toNumber()).toBe(0);
    });

    it("PA-40 - self-employed with wages and business income", () => {
      const result = calculatePA40(makeInput({
        compensation: d(40000),
        netBusinessIncome: d(35000),
        interest: d(800),
        dividends: d(1200),
        stateWithholding: d(1228),
        estimatedPayments: d(1075),
      }));
      // Total PA taxable: 40000 + 35000 + 800 + 1200 = 77,000
      // Tax: $77,000 × 3.07% = $2,363.90 → $2,364
      expect(result.totalPATaxableIncome.toNumber()).toBe(77000);
      expect(result.taxLiability.toNumber()).toBe(2364);
      // Payments: $1,228 + $1,075 = $2,303
      expect(result.totalPayments.toNumber()).toBe(2303);
      // Owes: $2,364 - $2,303 = $61
      expect(result.amountOwed.toNumber()).toBe(61);
    });

    it("PA-40 - investor with multiple income types and a rental loss", () => {
      const result = calculatePA40(makeInput({
        compensation: d(60000),
        interest: d(3000),
        dividends: d(5000),
        netGainOrLoss: d(15000),
        netRentalIncome: d(-12000),
        stateWithholding: d(1842),
        estimatedPayments: d(700),
      }));
      // Positive classes: 60000 + 3000 + 5000 + 15000 = 83,000
      // Rental loss clamped to 0
      expect(result.totalPATaxableIncome.toNumber()).toBe(83000);
      // Tax: $83,000 × 3.07% = $2,548.10 → $2,548
      expect(result.taxLiability.toNumber()).toBe(2548);
      // Payments: $1,842 + $700 = $2,542
      expect(result.totalPayments.toNumber()).toBe(2542);
      // Owes: $2,548 - $2,542 = $6
      expect(result.amountOwed.toNumber()).toBe(6);
    });

    it("PA-40 - high-income earner: $500,000 compensation", () => {
      const result = calculatePA40(makeInput({
        compensation: d(500000),
        interest: d(10000),
        dividends: d(25000),
        netGainOrLoss: d(50000),
        stateWithholding: d(15350),
        estimatedPayments: d(2600),
      }));
      // Total: 500000 + 10000 + 25000 + 50000 = 585,000
      expect(result.totalPATaxableIncome.toNumber()).toBe(585000);
      // Tax: $585,000 × 3.07% = $17,959.50 → $17,960
      expect(result.taxLiability.toNumber()).toBe(17960);
      // Payments: $15,350 + $2,600 = $17,950
      expect(result.totalPayments.toNumber()).toBe(17950);
      // Owes: $17,960 - $17,950 = $10
      expect(result.amountOwed.toNumber()).toBe(10);
    });
  });

  // =================================================================
  // Use Tax / Settlement Lines (25–29)
  // =================================================================

  describe("Use Tax / Settlement Lines", () => {
    it("PA-40 Line 25 - use tax increases total tax due", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(120),
      }));
      expect(result.useTax.toNumber()).toBe(120);
      // Income tax: $50,000 × 3.07% = $1,535
      expect(result.taxLiability.toNumber()).toBe(1535);
      // Total PA tax = $1,535 + $120 = $1,655
      expect(result.totalPATax.toNumber()).toBe(1655);
    });

    it("PA-40 helper total PA tax equals income tax when no use tax", () => {
      const result = calculatePA40(makeInput({
        compensation: d(75000),
      }));
      expect(result.useTax.toNumber()).toBe(0);
      expect(result.taxLiability.toNumber()).toBe(2303);
      expect(result.totalPATax.toNumber()).toBe(2303);
    });

    it("PA-40 Line 26 - tax due includes use tax before penalties", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(150),
        stateWithholding: d(1000),
      }));

      // Income tax: $1,535; use tax: $150; line 24 settlement base still short by $685
      expect(result.taxDue.toNumber()).toBe(685);
      // Legacy amountOwed helper still excludes use tax.
      expect(result.amountOwed.toNumber()).toBe(535);
    });

    it("PA-40 - use tax flows to total amount due (balance due scenario)", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(200),
        stateWithholding: d(1535),
      }));
      // Income tax: $1,535; withholding covers income tax exactly
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.overpayment.toNumber()).toBe(0);
      // Use tax adds to total amount due
      expect(result.totalAmountDue.toNumber()).toBe(200);
      expect(result.taxDue.toNumber()).toBe(200);
    });

    it("PA-40 - use tax reduces refund in overpayment scenario", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(100),
        stateWithholding: d(2000),
      }));
      // Income tax: $1,535; withholding: $2,000
      // Overpayment: $465 (before use tax)
      expect(result.overpayment.toNumber()).toBe(465);
      // Use tax absorbs part of overpayment: $465 - $100 = $365 net refund
      // Total amount due: $0 (overpayment covers use tax)
      expect(result.totalAmountDue.toNumber()).toBe(0);
      expect(result.netOverpayment.toNumber()).toBe(365);
    });

    it("PA-40 - use tax exceeds overpayment: taxpayer owes the difference", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(600),
        stateWithholding: d(2000),
      }));
      // Income tax: $1,535; withholding: $2,000; overpayment: $465
      // Use tax $600 > overpayment $465 → owes $135
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.totalAmountDue.toNumber()).toBe(135);
      expect(result.netOverpayment.toNumber()).toBe(0);
    });

    it("PA-40 - use tax combined with balance due", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(150),
        stateWithholding: d(1000),
      }));
      // Income tax: $1,535; withholding: $1,000; owed: $535
      expect(result.amountOwed.toNumber()).toBe(535);
      // Total due = $535 + $150 use tax = $685
      expect(result.totalAmountDue.toNumber()).toBe(685);
      expect(result.taxDue.toNumber()).toBe(685);
    });
  });

  // =================================================================
  // Penalty and Interest (Lines 27–29)
  // =================================================================

  describe("Penalty and Interest", () => {
    it("PA-40 Line 27 - penalties and interest combine REV-1630 with late filing and payment charges", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        underpaymentPenalty: d(45),
        lateFilingOrPaymentPenalty: d(10),
        latePaymentInterest: d(5),
      }));

      expect(result.penaltiesAndInterest.toNumber()).toBe(60);
    });

    it("PA-40 Line 27 - underpayment penalty added to amount owed", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        stateWithholding: d(2000),
        underpaymentPenalty: d(45),
      }));
      // Income tax: $3,070; withholding: $2,000; owed: $1,070
      expect(result.amountOwed.toNumber()).toBe(1070);
      expect(result.underpaymentPenalty.toNumber()).toBe(45);
      // Total due = $1,070 + $45 = $1,115
      expect(result.totalAmountDue.toNumber()).toBe(1115);
    });

    it("PA-40 Line 27 - late filing or payment penalty", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
        lateFilingOrPaymentPenalty: d(25),
      }));
      // Income tax: $1,535; withholding: $1,000; owed: $535
      expect(result.amountOwed.toNumber()).toBe(535);
      expect(result.lateFilingOrPaymentPenalty.toNumber()).toBe(25);
      // Total due = $535 + $25 = $560
      expect(result.totalAmountDue.toNumber()).toBe(560);
    });

    it("PA-40 Line 27 - late payment interest", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
        latePaymentInterest: d(25),
      }));
      // Income tax: $1,535; withholding: $1,000; owed: $535
      expect(result.amountOwed.toNumber()).toBe(535);
      expect(result.latePaymentInterest.toNumber()).toBe(25);
      // Total due = $535 + $25 = $560
      expect(result.totalAmountDue.toNumber()).toBe(560);
    });

    it("PA-40 Line 28 - total amount due with all additions", () => {
      const result = calculatePA40(makeInput({
        compensation: d(100000),
        useTax: d(200),
        stateWithholding: d(2000),
        underpaymentPenalty: d(50),
        lateFilingOrPaymentPenalty: d(40),
        latePaymentInterest: d(30),
      }));
      // Income tax: $3,070; withholding: $2,000; owed: $1,070
      expect(result.amountOwed.toNumber()).toBe(1070);
      // Total due = $1,070 + $200 + $50 + $40 + $30 = $1,390
      expect(result.totalAmountDue.toNumber()).toBe(1390);
    });

    it("PA-40 - penalty reduces overpayment but taxpayer still gets refund", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(2000),
        underpaymentPenalty: d(100),
      }));
      // Income tax: $1,535; withholding: $2,000; overpayment: $465
      // Penalty $100 < overpayment $465 → refund reduced, no amount due
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.totalAmountDue.toNumber()).toBe(0);
    });

    it("PA-40 - penalty exceeds overpayment: taxpayer owes the difference", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(2000),
        underpaymentPenalty: d(500),
      }));
      // Income tax: $1,535; withholding: $2,000; overpayment: $465
      // Penalty $500 > overpayment $465 → owes $35
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.totalAmountDue.toNumber()).toBe(35);
    });

    it("PA-40 - all additions combined with overpayment", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(100),
        stateWithholding: d(2000),
        underpaymentPenalty: d(50),
        latePaymentInterest: d(20),
      }));
      // Overpayment: $465; additions: $100 + $50 + $20 = $170
      // $465 - $170 = $295 net refund → total due = $0
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.totalAmountDue.toNumber()).toBe(0);
    });

    it("PA-40 - all additions combined exceed overpayment", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(200),
        stateWithholding: d(2000),
        underpaymentPenalty: d(200),
        latePaymentInterest: d(100),
      }));
      // Overpayment: $465; additions: $200 + $200 + $100 = $500
      // $500 - $465 = $35 → total due = $35
      expect(result.overpayment.toNumber()).toBe(465);
      expect(result.totalAmountDue.toNumber()).toBe(35);
    });

    it("PA-40 Line 28 - no additions: total due equals amount owed", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        stateWithholding: d(1000),
      }));
      expect(result.amountOwed.toNumber()).toBe(535);
      expect(result.totalAmountDue.toNumber()).toBe(535);
    });

    it("PA-40 Line 28 - zero income with additions: total due equals additions", () => {
      const result = calculatePA40(makeInput({
        useTax: d(50),
        underpaymentPenalty: d(10),
        latePaymentInterest: d(5),
      }));
      expect(result.taxLiability.toNumber()).toBe(0);
      expect(result.amountOwed.toNumber()).toBe(0);
      expect(result.totalAmountDue.toNumber()).toBe(65);
    });

    it("PA-40 Line 28 - no income, no additions: total due is $0", () => {
      const result = calculatePA40(makeInput({}));
      expect(result.totalAmountDue.toNumber()).toBe(0);
    });

    it("PA-40 Line 29 - overpayment is net of use tax and penalties", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        useTax: d(100),
        stateWithholding: d(2000),
        underpaymentPenalty: d(50),
        latePaymentInterest: d(20),
      }));

      // Pre-additions helper overpayment remains $465.
      expect(result.overpayment.toNumber()).toBe(465);
      // Printed line 29 nets out use tax and line 27 additions: 465 - 170 = 295.
      expect(result.netOverpayment.toNumber()).toBe(295);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA-40 - very large income ($10M) still flat 3.07%", () => {
      const result = calculatePA40(makeInput({ compensation: d(10000000) }));
      // $10,000,000 × 3.07% = $307,000
      expect(result.taxLiability.toNumber()).toBe(307000);
    });

    it("PA-40 - single dollar of income", () => {
      const result = calculatePA40(makeInput({ interest: d(1) }));
      // $1 × 3.07% = $0.0307 → $0
      expect(result.taxLiability.toNumber()).toBe(0);
    });

    it("PA-40 - $100 income: $100 × 3.07% = $3.07 → $3", () => {
      const result = calculatePA40(makeInput({ compensation: d(100) }));
      expect(result.taxLiability.toNumber()).toBe(3);
    });

    it("PA-40 - loss in every class except one", () => {
      const result = calculatePA40(makeInput({
        compensation: d(40000),
        netBusinessIncome: d(-50000),
        netGainOrLoss: d(-30000),
        netRentalIncome: d(-20000),
      }));
      // Only compensation counts: $40,000
      expect(result.totalPATaxableIncome.toNumber()).toBe(40000);
      // $40,000 × 3.07% = $1,228
      expect(result.taxLiability.toNumber()).toBe(1228);
    });

    it("PA-40 - PA dividends not distinguished: qualified dividends taxed same as ordinary", () => {
      // PA taxes ALL dividends at 3.07% — no preferential qualified dividend rate
      const result = calculatePA40(makeInput({ dividends: d(50000) }));
      // $50,000 × 3.07% = $1,535
      expect(result.taxLiability.toNumber()).toBe(1535);
    });

    it("PA-40 - gambling winnings taxed at flat rate (no loss offset)", () => {
      // PA gambling winnings cannot be offset by gambling losses
      const result = calculatePA40(makeInput({
        gamblingIncome: d(25000),
      }));
      // $25,000 × 3.07% = $767.50 → $768
      expect(result.taxLiability.toNumber()).toBe(768);
    });

    it("PA-40 - rounding boundary: $0.50 rounds up", () => {
      // Need amount × 0.0307 = exactly $X.50
      // $10,000 × 0.0307 = $307.00 — exact, no rounding needed
      // $16,287 × 0.0307 = $500.0109 → $500
      // Let's use $16,287
      const result = calculatePA40(makeInput({ compensation: d(16287) }));
      expect(result.taxLiability.toNumber()).toBe(500);
    });
  });

  // =================================================================
  // Tax Year Support
  // =================================================================

  describe("Tax Year", () => {
    it("PA-40 - 2024 tax year uses same 3.07% rate", () => {
      const result = calculatePA40(makeInput({
        taxYear: 2024,
        compensation: d(100000),
      }));
      expect(result.taxLiability.toNumber()).toBe(3070);
    });

    it("PA-40 - throws for unsupported tax year", () => {
      expect(() => calculatePA40(makeInput({ taxYear: 2020 }))).toThrow(
        "PA constants not available for tax year 2020"
      );
    });
  });

  // =================================================================
  // Audit Trail
  // =================================================================

  describe("Audit Trail", () => {
    it("PA-40 - audit trail records all income class lines", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        interest: d(1000),
      }));
      const lines = result.lines;
      const lineNumbers = lines.map((l) => l.line);

      expect(lineNumbers).toContain("1a");
      expect(lineNumbers).toContain("1b");
      expect(lineNumbers).toContain("1c");
      expect(lineNumbers).toContain("2");
      expect(lineNumbers).toContain("3");
      expect(lineNumbers).toContain("4");
      expect(lineNumbers).toContain("5");
      expect(lineNumbers).toContain("6");
      expect(lineNumbers).toContain("7");
      expect(lineNumbers).toContain("8");
      expect(lineNumbers).toContain("9");
      expect(lineNumbers).toContain("10");
      expect(lineNumbers).toContain("11");
      expect(lineNumbers).toContain("12");
      expect(lineNumbers).toContain("13");
      expect(lineNumbers).toContain("14");
      expect(lineNumbers).toContain("15");
      expect(lineNumbers).toContain("16");
      expect(lineNumbers).toContain("17");
      expect(lineNumbers).toContain("18");
      expect(lineNumbers).toContain("18a");
      expect(lineNumbers).toContain("20");
      expect(lineNumbers).toContain("21");
      expect(lineNumbers).toContain("22");
      expect(lineNumbers).toContain("23");
      expect(lineNumbers).toContain("22a");
      expect(lineNumbers).toContain("23a");
      expect(lineNumbers).toContain("24");
      expect(lineNumbers).toContain("25");
      expect(lineNumbers).toContain("26");
      expect(lineNumbers).toContain("27");
      expect(lineNumbers).toContain("28");
      expect(lineNumbers).toContain("29");
    });

    it("PA-40 - printed settlement lines match official 2025 numbering", () => {
      const result = calculatePA40(makeInput({
        compensation: d(50000),
        taxForgivenessEligibilityIncome: d(7500),
        stateWithholding: d(2000),
        taxForgivenessCredit: d(100),
        useTax: d(50),
        underpaymentPenalty: d(10),
      }));

      const getLineValue = (lineNum: string) =>
        result.lines.find((l) => l.line === lineNum)?.value.toNumber();

      expect(getLineValue("20")).toBe(7500);
      expect(getLineValue("24")).toBe(result.totalPaymentsAndCredits.toNumber());
      expect(getLineValue("25")).toBe(50);
      expect(getLineValue("26")).toBe(result.taxDue.toNumber());
      expect(getLineValue("27")).toBe(result.penaltiesAndInterest.toNumber());
      expect(getLineValue("28")).toBe(result.totalAmountDue.toNumber());
      expect(getLineValue("29")).toBe(result.netOverpayment.toNumber());
    });

    it("PA-40 - all audit trail entries have form 'PA-40'", () => {
      const result = calculatePA40(makeInput({ compensation: d(50000) }));
      for (const line of result.lines) {
        expect(line.form).toBe("PA-40");
      }
    });

    it("PA-40 - audit trail line values match result values", () => {
      const result = calculatePA40(makeInput({
        compensation: d(75000),
        interest: d(2000),
        stateWithholding: d(2365),
      }));

      const getLineValue = (lineNum: string) =>
        result.lines.find((l) => l.line === lineNum)?.value.toNumber();

      expect(getLineValue("1a")).toBe(75000);
      expect(getLineValue("2")).toBe(2000);
      expect(getLineValue("9")).toBe(77000);
      // Tax: $77,000 × 3.07% = $2,363.90 → $2,364
      expect(getLineValue("12")).toBe(2364);
      expect(getLineValue("13")).toBe(2365);
      expect(getLineValue("24")).toBe(2365);
      expect(getLineValue("26")).toBe(0);
      expect(getLineValue("29")).toBe(1);
    });
  });
});

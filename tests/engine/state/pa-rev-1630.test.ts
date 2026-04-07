/**
 * Tests for Pennsylvania REV-1630 — Underpayment of Estimated Tax by Individuals
 * Spec: spec/state/pa-rev-1630.yaml
 *
 * Computes interest penalty for insufficient quarterly estimated tax payments.
 * Source: PA Department of Revenue, 2025 REV-1630 Form and Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateREV1630,
  type REV1630Input,
  PA_REV1630_CONSTANTS,
} from "@/engine/state/pa-rev-1630.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

/** Build a default REV-1630 input with overrides */
function makeInput(overrides: Partial<REV1630Input> = {}): REV1630Input {
  return {
    taxYear: 2025,
    taxLiability: d(3000),
    withholdingAndCredits: ZERO,
    quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
    ...overrides,
  };
}

describe("Pennsylvania REV-1630 Underpayment of Estimated Tax", () => {
  // =========================================================================
  // Section I — Threshold Tests
  // =========================================================================

  describe("Threshold Tests", () => {
    it("REV-1630 threshold test - no penalty when net tax < $338", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(500),
        withholdingAndCredits: d(200),
        // Net tax = $500 - $200 = $300 < $338
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.netTaxOwed).toEqual(d(300));
      expect(result.totalInterest).toEqual(ZERO);
      expect(result.exemptReason).toContain("$300");
      expect(result.exemptReason).toContain("$338");
    });

    it("REV-1630 threshold test - no penalty when net tax is exactly $337", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(537),
        withholdingAndCredits: d(200),
        // Net tax = $537 - $200 = $337 < $338
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 threshold test - penalty applies when net tax is exactly $338", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(538),
        withholdingAndCredits: d(200),
        // Net tax = $538 - $200 = $338 >= $338
      }));

      // Penalty required (may calculate to actual interest)
      expect(result.netTaxOwed).toEqual(d(338));
      // Penalty is required unless other exceptions apply
      expect(result.penaltyRequired).toBe(true);
    });

    it("REV-1630 threshold test - no penalty when withholding covers all tax", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: d(5000),
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.netTaxOwed).toEqual(ZERO);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 threshold test - no penalty when withholding covers 90%", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(1000),
        withholdingAndCredits: d(900),
        // Net tax = $100 < $338 → no penalty
      }));

      expect(result.penaltyRequired).toBe(false);
    });

    it("REV-1630 threshold test - 2024 uses $292 threshold", () => {
      const result = calculateREV1630(makeInput({
        taxYear: 2024,
        taxLiability: d(400),
        withholdingAndCredits: d(150),
        // Net tax = $250 < $292
      }));

      expect(result.penaltyRequired).toBe(false);
    });

    it("REV-1630 no penalty when withholding/credits cover 90% of tax", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(10000),
        withholdingAndCredits: d(9500),
        // Net tax = $500 >= $338 → threshold met
        // But Line 1b = $9000, Line 2 = $9500 → underpayment base = $0
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.exemptReason).toContain("90%");
    });
  });

  // =========================================================================
  // Prior Year 100% Tax Forgiveness Exemption
  // =========================================================================

  describe("Prior Year 100% Tax Forgiveness", () => {
    it("REV-1630 exempt when prior year had 100% tax forgiveness", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: ZERO,
        priorYear100PercentForgiveness: true,
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.exemptReason).toContain("100% Tax Forgiveness");
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 not exempt when priorYear100PercentForgiveness is false", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: ZERO,
        priorYear100PercentForgiveness: false,
      }));

      expect(result.penaltyRequired).toBe(true);
    });
  });

  // =========================================================================
  // Section I — Lines 1a–5
  // =========================================================================

  describe("Section I - Core Calculation", () => {
    it("REV-1630 Section I Line 1a - tax liability", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: ZERO,
      }));

      expect(result.taxLiability).toEqual(d(3599));
    });

    it("REV-1630 Section I Line 1b - 90% of tax", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: ZERO,
      }));

      // 3599 × 0.90 = 3239.1 → $3,239
      expect(result.ninetyPercentTax).toEqual(d(3239));
    });

    it("REV-1630 Section I Line 2 - withholding and credits", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: d(1344),
      }));

      expect(result.withholdingAndCredits).toEqual(d(1344));
    });

    it("REV-1630 Section I Line 4 - underpayment base", () => {
      // Tax = $3,599, 90% = $3,239
      // Withholding = $1,344
      // Underpayment base = $3,239 - $1,344 = $1,895
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
      }));

      expect(result.underpaymentBase).toEqual(d(1895));
    });

    it("REV-1630 Section I Line 5 - required installment", () => {
      // Underpayment base = $1,895 → required installment = $1,895 / 4 = $473.75 → $474
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
      }));

      expect(result.quarters[0].requiredInstallment).toEqual(d(474));
      expect(result.quarters[1].requiredInstallment).toEqual(d(474));
      expect(result.quarters[2].requiredInstallment).toEqual(d(474));
      expect(result.quarters[3].requiredInstallment).toEqual(d(474));
    });
  });

  // =========================================================================
  // Section I — Lines 6–10 (Quarterly Underpayment)
  // =========================================================================

  describe("Section I - Quarterly Underpayment", () => {
    it("REV-1630 Section I Lines 6-10 - quarterly underpayment with no payments", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      // Required installment = $474 per quarter
      // No payments → full underpayment each quarter
      for (const q of result.quarters) {
        expect(q.underpayment).toEqual(d(474));
        expect(q.overpayment).toEqual(ZERO);
      }
    });

    it("REV-1630 Section I Lines 6-10 - quarterly underpayment with equal payments", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [d(474), d(474), d(474), d(474)],
      }));

      // Required $474, paid $474 → no underpayment
      for (const q of result.quarters) {
        expect(q.underpayment).toEqual(ZERO);
        expect(q.overpayment).toEqual(ZERO);
      }
      expect(result.penaltyRequired).toBe(false);
    });

    it("REV-1630 Section I Lines 6-10 - partial payments create underpayments", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [d(200), d(200), d(200), d(200)],
      }));

      // Required $474, paid $200 → underpayment $274 each quarter
      for (const q of result.quarters) {
        expect(q.underpayment).toEqual(d(274));
        expect(q.overpayment).toEqual(ZERO);
      }
    });

    it("REV-1630 overpayment carries forward to next quarter", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        // 90% = $1,800, underpayment base = $1,800, required = $450
        quarterlyEstimatedPayments: [d(900), ZERO, d(450), ZERO],
      }));

      // Q1: required $450, paid $900 → overpayment $450
      expect(result.quarters[0].underpayment).toEqual(ZERO);
      expect(result.quarters[0].overpayment).toEqual(d(450));

      // Q2: required $450, paid $0 + carryover $450 = $450 → exact, no underpayment
      expect(result.quarters[1].carryoverFromPrior).toEqual(d(450));
      expect(result.quarters[1].underpayment).toEqual(ZERO);
      expect(result.quarters[1].overpayment).toEqual(ZERO);

      // Q3: required $450, paid $450 → exact
      expect(result.quarters[2].underpayment).toEqual(ZERO);

      // Q4: required $450, paid $0 → underpayment $450
      expect(result.quarters[3].underpayment).toEqual(d(450));
    });

    it("REV-1630 large Q1 overpayment covers multiple subsequent quarters", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        // 90% = $1,800, required = $450
        quarterlyEstimatedPayments: [d(1800), ZERO, ZERO, ZERO],
      }));

      // Q1: paid $1,800, required $450 → overpayment $1,350
      expect(result.quarters[0].overpayment).toEqual(d(1350));

      // Q2: carryover $1,350, required $450 → overpayment $900
      expect(result.quarters[1].carryoverFromPrior).toEqual(d(1350));
      expect(result.quarters[1].overpayment).toEqual(d(900));

      // Q3: carryover $900, required $450 → overpayment $450
      expect(result.quarters[2].carryoverFromPrior).toEqual(d(900));
      expect(result.quarters[2].overpayment).toEqual(d(450));

      // Q4: carryover $450, required $450 → exact
      expect(result.quarters[3].carryoverFromPrior).toEqual(d(450));
      expect(result.quarters[3].underpayment).toEqual(ZERO);

      // No penalty
      expect(result.penaltyRequired).toBe(false);
    });

    it("REV-1630 all estimated paid in Q4 leaves Q1-Q3 underpaid", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        // 90% = $1,800, required = $450
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, d(1800)],
      }));

      // Q1-Q3: no payments → underpayment $450 each
      expect(result.quarters[0].underpayment).toEqual(d(450));
      expect(result.quarters[1].underpayment).toEqual(d(450));
      expect(result.quarters[2].underpayment).toEqual(d(450));

      // Q4: paid $1,800, required $450 → overpayment $1,350
      expect(result.quarters[3].underpayment).toEqual(ZERO);
      expect(result.quarters[3].overpayment).toEqual(d(1350));
    });
  });

  // =========================================================================
  // Section II — Exception 1 (Prior Year Safe Harbor)
  // =========================================================================

  describe("Exception 1 - Prior Year Safe Harbor", () => {
    it("REV-1630 Exception 1 - prior year safe harbor met for all quarters", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: d(1000),
        // Required installment = ($4,500 - $1,000) / 4 = $875
        quarterlyEstimatedPayments: [d(500), d(500), d(500), d(500)],
        // Prior year: income $50,000 → tax at 3.07% = $1,535
        // Cumulative: Q1 = $250 (whd) + $500 = $750
        //             Q2 = $750 + $250 + $500 = $1,500
        //             Q3 = $1,500 + $250 + $500 = $2,250 ≥ $1,535
        // Exception met from Q3 onward
        priorYearPATaxableIncome: d(50000),
      }));

      // Q1: cumulative $750 < $1,535 → exception NOT met
      expect(result.quarters[0].exception1Met).toBe(false);

      // Q2: cumulative $1,500 < $1,535 → exception NOT met
      expect(result.quarters[1].exception1Met).toBe(false);

      // Q3: cumulative $2,250 ≥ $1,535 → exception MET
      expect(result.quarters[2].exception1Met).toBe(true);

      // Q4: cumulative $3,000 ≥ $1,535 → exception MET
      expect(result.quarters[3].exception1Met).toBe(true);

      // Interest only on Q1 and Q2
      expect(result.quarters[2].interest).toEqual(ZERO);
      expect(result.quarters[3].interest).toEqual(ZERO);
    });

    it("REV-1630 Exception 1 - prior year zero income", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
        priorYearPATaxableIncome: ZERO,
      }));

      // Prior year tax = $0 → exception always met
      for (const q of result.quarters) {
        expect(q.exception1Met).toBe(true);
        expect(q.interest).toEqual(ZERO);
      }
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 Exception 1 - with prior year tax forgiveness credit", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: d(500),
        quarterlyEstimatedPayments: [d(100), d(100), d(100), d(100)],
        // Prior year: income $20,000, tax = $614, forgiveness = $400
        // Net prior year tax at current rate = $614 - $400 = $214
        priorYearPATaxableIncome: d(20000),
        priorYearTaxForgivenessCredit: d(400),
      }));

      expect(result.priorYearTaxAtCurrentRate).toEqual(d(214));

      // Cumulative: Q1 = $125 (whd) + $100 = $225 ≥ $214 → met
      expect(result.quarters[0].exception1Met).toBe(true);
    });

    it("REV-1630 Exception 1 - not available when prior year income not provided", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
        // No priorYearPATaxableIncome provided
      }));

      for (const q of result.quarters) {
        expect(q.exception1Met).toBe(false);
      }
      // Should have actual interest
      expect(result.totalInterest.gt(ZERO)).toBe(true);
    });
  });

  // =========================================================================
  // Section III — Interest Calculation
  // =========================================================================

  describe("Section III - Interest Calculation", () => {
    it("REV-1630 Section III - interest calculation matches form example", () => {
      // Form example: Tax = $3,599, withholding/credits = $1,344
      // 90% = $3,239, underpayment base = $1,895, required = $474
      // No estimated payments → $474 underpayment each quarter
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      // Q1: 260 days × 0.000192 × $474 = $23.67 → $24
      //     105 days × 0.000192 × $474 = $9.56 → $10
      //     Total Q1 = $34
      expect(result.quarters[0].interest).toEqual(d(34));

      // Q2: 198 days × 0.000192 × $474 = $18.03 → $18
      //     105 days × 0.000192 × $474 = $9.56 → $10
      //     Total Q2 = $28
      expect(result.quarters[1].interest).toEqual(d(28));

      // Q3: 107 days × 0.000192 × $474 = $9.74 → $10
      //     105 days × 0.000192 × $474 = $9.56 → $10
      //     Total Q3 = $20
      expect(result.quarters[2].interest).toEqual(d(20));

      // Q4: 90 days × 0.000192 × $474 = $8.19 → $8
      //     Total Q4 = $8
      expect(result.quarters[3].interest).toEqual(d(8));

      // Total: $34 + $28 + $20 + $8 = $90
      expect(result.totalInterest).toEqual(d(90));
    });

    it("REV-1630 Section III - total interest penalty", () => {
      // Simple case: $2,000 tax, no withholding, no payments
      // 90% = $1,800, required = $450 per quarter
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      // Q1: 260 × 0.000192 × 450 = $22.46 → $22
      //     105 × 0.000192 × 450 = $9.07 → $9
      // Q2: 198 × 0.000192 × 450 = $17.11 → $17
      //     105 × 0.000192 × 450 = $9.07 → $9
      // Q3: 107 × 0.000192 × 450 = $9.24 → $9
      //     105 × 0.000192 × 450 = $9.07 → $9
      // Q4: 90 × 0.000192 × 450 = $7.78 → $8
      // Total = $22+$9 + $17+$9 + $9+$9 + $8 = $83
      expect(result.totalInterest).toEqual(d(83));
    });

    it("REV-1630 Section III - zero interest when all quarters paid on time", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [d(450), d(450), d(450), d(450)],
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 Section III - interest only on underpaid quarters", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        // Pay Q1 and Q2 on time, miss Q3 and Q4
        quarterlyEstimatedPayments: [d(450), d(450), ZERO, ZERO],
      }));

      // Q1 and Q2: no underpayment → no interest
      expect(result.quarters[0].interest).toEqual(ZERO);
      expect(result.quarters[1].interest).toEqual(ZERO);

      // Q3: underpayment $450
      expect(result.quarters[2].underpayment).toEqual(d(450));
      expect(result.quarters[2].interest.gt(ZERO)).toBe(true);

      // Q4: underpayment $450
      expect(result.quarters[3].underpayment).toEqual(d(450));
      expect(result.quarters[3].interest.gt(ZERO)).toBe(true);
    });

    it("REV-1630 Section III - 2024 uses different daily rate", () => {
      // 2024 rate: 0.000219/day (vs 2025: 0.000192/day)
      const result2024 = calculateREV1630(makeInput({
        taxYear: 2024,
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      const result2025 = calculateREV1630(makeInput({
        taxYear: 2025,
        taxLiability: d(2000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      // 2024 has a higher rate, so interest should be higher
      expect(result2024.totalInterest.gt(result2025.totalInterest)).toBe(true);
    });

    it("REV-1630 Section III - Q4 uses next year rate only", () => {
      // Q4 interest is computed entirely in the next year (Jan 15 → Apr 15)
      const result = calculateREV1630(makeInput({
        taxLiability: d(1000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [d(225), d(225), d(225), ZERO],
      }));

      // Only Q4 has underpayment ($225)
      expect(result.quarters[0].underpayment).toEqual(ZERO);
      expect(result.quarters[1].underpayment).toEqual(ZERO);
      expect(result.quarters[2].underpayment).toEqual(ZERO);
      expect(result.quarters[3].underpayment).toEqual(d(225));

      // Q4 interest: 90 days × 0.000192 × $225 = $3.89 → $4
      expect(result.quarters[3].interest).toEqual(d(4));
      expect(result.totalInterest).toEqual(d(4));
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("Edge Cases", () => {
    it("REV-1630 zero tax liability produces no penalty", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: ZERO,
        withholdingAndCredits: ZERO,
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 very large tax with no payments produces proportional penalty", () => {
      // $100,000 tax, no withholding, no payments
      // 90% = $90,000, required = $22,500 per quarter
      const result = calculateREV1630(makeInput({
        taxLiability: d(100000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      expect(result.penaltyRequired).toBe(true);
      // Q1: 260 × 0.000192 × 22500 = $1,123.20 → $1,123
      //     105 × 0.000192 × 22500 = $453.60 → $454
      // Total should be substantial
      expect(result.totalInterest.gt(d(3000))).toBe(true);
    });

    it("REV-1630 tax liability below threshold with high withholding", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(10000),
        withholdingAndCredits: d(9700),
        // Net tax = $300 < $338
      }));

      expect(result.penaltyRequired).toBe(false);
    });

    it("REV-1630 overpayment in Q1 eliminates all subsequent underpayments", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(4000),
        withholdingAndCredits: ZERO,
        // 90% = $3,600, required = $900
        quarterlyEstimatedPayments: [d(3600), ZERO, ZERO, ZERO],
      }));

      // All paid in Q1 → no underpayment in any quarter
      expect(result.penaltyRequired).toBe(false);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 handles uneven payment distribution", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(4000),
        withholdingAndCredits: ZERO,
        // 90% = $3,600, required = $900
        quarterlyEstimatedPayments: [d(500), d(1000), d(200), d(1900)],
      }));

      // Q1: paid $500, required $900 → underpayment $400
      expect(result.quarters[0].underpayment).toEqual(d(400));

      // Q2: paid $1,000, required $900 → overpayment $100
      expect(result.quarters[1].underpayment).toEqual(ZERO);
      expect(result.quarters[1].overpayment).toEqual(d(100));

      // Q3: paid $200 + carryover $100 = $300, required $900 → underpayment $600
      expect(result.quarters[2].carryoverFromPrior).toEqual(d(100));
      expect(result.quarters[2].underpayment).toEqual(d(600));

      // Q4: paid $1,900, required $900 → overpayment $1,000
      expect(result.quarters[3].underpayment).toEqual(ZERO);
    });

    it("REV-1630 throws for unsupported tax year", () => {
      expect(() => calculateREV1630(makeInput({
        taxYear: 2020,
      }))).toThrow("constants not available");
    });

    it("REV-1630 exception 1 eliminates interest even with underpayment", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
        // Prior year income $0 → prior year tax = $0
        priorYearPATaxableIncome: ZERO,
      }));

      // All quarters underpaid but exception 1 met → no interest
      expect(result.quarters[0].underpayment.gt(ZERO)).toBe(true);
      expect(result.quarters[0].exception1Met).toBe(true);
      expect(result.totalInterest).toEqual(ZERO);
    });
  });

  // =========================================================================
  // Integration / End-to-End
  // =========================================================================

  describe("End-to-End Scenarios", () => {
    it("REV-1630 e2e: form example - $3,599 tax, $1,344 withholding, no payments", () => {
      // Matches the example on the REV-1630 instructions page 4
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      expect(result.penaltyRequired).toBe(true);
      expect(result.underpaymentBase).toEqual(d(1895));
      expect(result.quarters[0].requiredInstallment).toEqual(d(474));
      expect(result.totalInterest).toEqual(d(90));
    });

    it("REV-1630 e2e: self-employed with quarterly payments covering 90%", () => {
      // Tax = $10,000, no withholding
      // 90% = $9,000, required = $2,250 per quarter
      const result = calculateREV1630(makeInput({
        taxLiability: d(10000),
        withholdingAndCredits: ZERO,
        quarterlyEstimatedPayments: [d(2250), d(2250), d(2250), d(2250)],
      }));

      expect(result.penaltyRequired).toBe(false);
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 e2e: W-2 employee with insufficient withholding", () => {
      // Tax = $5,000, withholding = $3,500
      // Net tax = $1,500 > $338 → threshold met
      // 90% = $4,500, underpayment base = $4,500 - $3,500 = $1,000
      // Required = $250 per quarter
      // No estimated payments
      const result = calculateREV1630(makeInput({
        taxLiability: d(5000),
        withholdingAndCredits: d(3500),
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      expect(result.penaltyRequired).toBe(true);
      expect(result.underpaymentBase).toEqual(d(1000));
      expect(result.quarters[0].requiredInstallment).toEqual(d(250));

      // Q1: 260 × 0.000192 × 250 = $12.48 → $12
      //     105 × 0.000192 × 250 = $5.04 → $5
      expect(result.quarters[0].interest).toEqual(d(17));

      // Total interest should be reasonable
      expect(result.totalInterest.gt(ZERO)).toBe(true);
      expect(result.totalInterest.lt(d(100))).toBe(true);
    });

    it("REV-1630 e2e: investor with prior year safe harbor", () => {
      // Current year: big capital gain → $15,000 tax
      // Prior year: normal income → $5,000 taxable → $154 tax at 3.07%
      const result = calculateREV1630(makeInput({
        taxLiability: d(15000),
        withholdingAndCredits: d(2000),
        quarterlyEstimatedPayments: [d(100), d(100), d(100), d(100)],
        priorYearPATaxableIncome: d(5000),
      }));

      // Prior year tax = $5,000 × 0.0307 = $153.50 → $154
      expect(result.priorYearTaxAtCurrentRate).toEqual(d(154));

      // Quarterly withholding share = $2,000 / 4 = $500
      // Q1 cumulative: $500 + $100 = $600 ≥ $154 → exception met
      expect(result.quarters[0].exception1Met).toBe(true);
      expect(result.quarters[1].exception1Met).toBe(true);
      expect(result.quarters[2].exception1Met).toBe(true);
      expect(result.quarters[3].exception1Met).toBe(true);

      // All quarters excepted → no interest
      expect(result.totalInterest).toEqual(ZERO);
    });

    it("REV-1630 e2e: mixed scenario with some exceptions and some penalties", () => {
      // Tax = $8,000, withholding = $500
      // 90% = $7,200, underpayment base = $6,700, required = $1,675
      // Prior year income = $100,000 → tax = $3,070
      const result = calculateREV1630(makeInput({
        taxLiability: d(8000),
        withholdingAndCredits: d(500),
        quarterlyEstimatedPayments: [d(1000), d(1000), ZERO, ZERO],
        priorYearPATaxableIncome: d(100000),
      }));

      // Quarterly withholding share = $500/4 = $125
      // Q1 cumulative: $125 + $1,000 = $1,125 < $3,070 → NOT met
      // Q2 cumulative: $1,125 + $125 + $1,000 = $2,250 < $3,070 → NOT met
      // Q3 cumulative: $2,250 + $125 + $0 = $2,375 < $3,070 → NOT met
      // Q4 cumulative: $2,375 + $125 + $0 = $2,500 < $3,070 → NOT met
      expect(result.quarters[0].exception1Met).toBe(false);
      expect(result.quarters[3].exception1Met).toBe(false);

      // Q1: required $1,675, paid $1,000 → underpayment $675
      expect(result.quarters[0].underpayment).toEqual(d(675));

      // Q2: required $1,675, paid $1,000 → underpayment $675
      expect(result.quarters[1].underpayment).toEqual(d(675));

      // Q3: required $1,675, paid $0 → underpayment $1,675
      expect(result.quarters[2].underpayment).toEqual(d(1675));

      // Q4: required $1,675, paid $0 → underpayment $1,675
      expect(result.quarters[3].underpayment).toEqual(d(1675));

      expect(result.totalInterest.gt(ZERO)).toBe(true);
    });

    it("REV-1630 e2e: penalty with exception 1 partially met", () => {
      // Tax = $6,000, withholding = $1,000
      // 90% = $5,400, underpayment base = $4,400, required = $1,100
      // Prior year: $30,000 → tax = $921
      const result = calculateREV1630(makeInput({
        taxLiability: d(6000),
        withholdingAndCredits: d(1000),
        quarterlyEstimatedPayments: [d(200), d(200), d(200), d(200)],
        priorYearPATaxableIncome: d(30000),
      }));

      // Prior year tax at 3.07% = $30,000 × 0.0307 = $921
      expect(result.priorYearTaxAtCurrentRate).toEqual(d(921));

      // Quarterly withholding share = $1,000 / 4 = $250
      // Q1: $250 + $200 = $450 < $921 → NOT met
      // Q2: $450 + $250 + $200 = $900 < $921 → NOT met
      // Q3: $900 + $250 + $200 = $1,350 ≥ $921 → MET
      // Q4: cumulative ≥ $921 → MET
      expect(result.quarters[0].exception1Met).toBe(false);
      expect(result.quarters[1].exception1Met).toBe(false);
      expect(result.quarters[2].exception1Met).toBe(true);
      expect(result.quarters[3].exception1Met).toBe(true);

      // Interest only on Q1 and Q2
      expect(result.quarters[0].interest.gt(ZERO)).toBe(true);
      expect(result.quarters[1].interest.gt(ZERO)).toBe(true);
      expect(result.quarters[2].interest).toEqual(ZERO);
      expect(result.quarters[3].interest).toEqual(ZERO);
    });
  });

  // =========================================================================
  // Constants Validation
  // =========================================================================

  describe("Constants", () => {
    it("REV-1630 2025 constants are correctly defined", () => {
      const c = PA_REV1630_CONSTANTS[2025];
      expect(c.minimumTaxThreshold).toEqual(d(338));
      expect(c.dailyRate).toEqual(d("0.000192"));
      expect(c.nextYearDailyRate).toEqual(d("0.000192"));
      expect(c.daysToYearEnd).toEqual([260, 198, 107]);
      expect(c.daysQ4ToFiling).toBe(90);
      expect(c.daysYearEndToFiling).toBe(105);
    });

    it("REV-1630 2024 constants use higher daily rate", () => {
      const c = PA_REV1630_CONSTANTS[2024];
      expect(c.minimumTaxThreshold).toEqual(d(292));
      expect(c.dailyRate).toEqual(d("0.000219"));
      expect(c.nextYearDailyRate).toEqual(d("0.000192"));
    });

    it("REV-1630 day counts sum correctly for TY2025", () => {
      const c = PA_REV1630_CONSTANTS[2025];
      // Q1 total days: 260 + 105 = 365
      expect(c.daysToYearEnd[0] + c.daysYearEndToFiling).toBe(365);
      // Q2 total days: 198 + 105 = 303
      expect(c.daysToYearEnd[1] + c.daysYearEndToFiling).toBe(303);
      // Q3 total days: 107 + 105 = 212
      expect(c.daysToYearEnd[2] + c.daysYearEndToFiling).toBe(212);
    });
  });

  // =========================================================================
  // Audit Trail
  // =========================================================================

  describe("Audit Trail", () => {
    it("REV-1630 produces audit trail lines", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(3599),
        withholdingAndCredits: d(1344),
        quarterlyEstimatedPayments: [ZERO, ZERO, ZERO, ZERO],
      }));

      expect(result.lines.length).toBeGreaterThan(0);
      const lineNumbers = result.lines.map(l => l.line);
      expect(lineNumbers).toContain("1a");
      expect(lineNumbers).toContain("1b");
      expect(lineNumbers).toContain("16");
    });

    it("REV-1630 exempt result still has audit trail", () => {
      const result = calculateREV1630(makeInput({
        taxLiability: d(100),
        withholdingAndCredits: ZERO,
      }));

      expect(result.lines.length).toBeGreaterThan(0);
    });
  });
});

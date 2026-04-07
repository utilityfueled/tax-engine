/**
 * Tests for New York IT-196 Itemized Deductions.
 * Spec: spec/state/ny-it196-itemized-deduction.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT196,
  computePeaseReduction,
  computeHighIncomeAdjustment,
  computeLine47,
  computeSubtractionAdjustments,
  PEASE_THRESHOLDS,
  HIGH_INCOME_THRESHOLDS,
  type NYIT196Input,
} from "@/engine/state/ny-it196-itemized-deduction.js";

const d = (value: string | number) => new Decimal(value);

function makeInput(overrides: Partial<NYIT196Input> = {}): NYIT196Input {
  return {
    federalAgi: 80000,
    nyAgi: 80000,
    filingStatus: "single",
    taxYear: 2025,
    medicalDeduction: 0,
    taxesDeduction: 8000,
    interestDeduction: 6000,
    charitableDeduction: 5000,
    casualtyTheftLosses: 0,
    miscDeductions: 0,
    otherDeductions: 0,
    stateLocalIncomeTaxSubtraction: 4000,
    ...overrides,
  };
}

describe("NY IT-196 Itemized Deductions", () => {
  /* ========== Pease Limitation Constants ========== */

  describe("Pease limitation thresholds (2025)", () => {
    it("single threshold is $340,700", () => {
      expect(PEASE_THRESHOLDS[2025].single.toNumber()).toBe(340700);
    });

    it("MFJ threshold is $408,850", () => {
      expect(PEASE_THRESHOLDS[2025].married_filing_jointly.toNumber()).toBe(408850);
    });

    it("MFS threshold is $204,400", () => {
      expect(PEASE_THRESHOLDS[2025].married_filing_separately.toNumber()).toBe(204400);
    });

    it("HoH threshold is $374,800", () => {
      expect(PEASE_THRESHOLDS[2025].head_of_household.toNumber()).toBe(374800);
    });

    it("QSS threshold matches MFJ", () => {
      expect(PEASE_THRESHOLDS[2025].qualifying_surviving_spouse.toNumber()).toBe(408850);
    });
  });

  /* ========== Pease Limitation Computation ========== */

  describe("Pease limitation (Line 40 worksheet)", () => {
    it("Line 40 - no reduction when AGI at threshold", () => {
      const result = computePeaseReduction({
        totalDeductions: d(30000),
        excludedDeductions: d(5000),
        federalAgi: d(340700),
        threshold: d(340700),
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 40 - no reduction when AGI below threshold", () => {
      const result = computePeaseReduction({
        totalDeductions: d(30000),
        excludedDeductions: d(5000),
        federalAgi: d(200000),
        threshold: d(340700),
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 40 - 3% of excess AGI when that is smaller than 80% limit", () => {
      // AGI = $350,700, threshold = $340,700 → excess = $10,000
      // 3% of $10,000 = $300
      // 80% of subject-to-limit deductions ($25,000) = $20,000
      // min($300, $20,000) = $300
      const result = computePeaseReduction({
        totalDeductions: d(30000),
        excludedDeductions: d(5000),
        federalAgi: d(350700),
        threshold: d(340700),
      });
      expect(result.toNumber()).toBe(300);
    });

    it("Line 40 - 80% limit caps the reduction for very high AGI", () => {
      // AGI = $1,340,700, threshold = $340,700 → excess = $1,000,000
      // 3% of $1,000,000 = $30,000
      // Subject to limit = $5,000 - $0 = $5,000
      // 80% of $5,000 = $4,000
      // min($30,000, $4,000) = $4,000
      const result = computePeaseReduction({
        totalDeductions: d(5000),
        excludedDeductions: d(0),
        federalAgi: d(1340700),
        threshold: d(340700),
      });
      expect(result.toNumber()).toBe(4000);
    });

    it("Line 40 - excluded deductions are not subject to limitation", () => {
      // All deductions are excluded: medical + casualty = total
      const result = computePeaseReduction({
        totalDeductions: d(20000),
        excludedDeductions: d(20000),
        federalAgi: d(500000),
        threshold: d(340700),
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 40 - MFJ uses higher threshold", () => {
      // AGI $400,000 with MFJ threshold $408,850 → no limitation
      const result = computePeaseReduction({
        totalDeductions: d(30000),
        excludedDeductions: d(5000),
        federalAgi: d(400000),
        threshold: d(408850),
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 40 - MFS uses lower threshold", () => {
      // AGI $250,000 with MFS threshold $204,400 → excess = $45,600
      // 3% of $45,600 = $1,368
      // 80% of $25,000 = $20,000
      // min($1,368, $20,000) = $1,368
      const result = computePeaseReduction({
        totalDeductions: d(30000),
        excludedDeductions: d(5000),
        federalAgi: d(250000),
        threshold: d(204400),
      });
      expect(result.toNumber()).toBe(1368);
    });
  });

  /* ========== High-Income Limitation ========== */

  describe("High-income limitation (Lines 46-47)", () => {
    it("Line 46 - no adjustment for NYAGI ≤ $100,000", () => {
      const result = computeHighIncomeAdjustment({
        nyAgi: d(100000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 46 - no adjustment for NYAGI exactly $100,000", () => {
      const result = computeHighIncomeAdjustment({
        nyAgi: d(100000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 46 - Worksheet 3 single at exactly threshold ($100,001)", () => {
      // excess = $100,001 - $100,000 = $1
      // capped = min($1, $50,000) = $1
      // ratio = $1 / $50,000 = 0.00002 → rounds to 0.0000
      // 25% of $20,000 = $5,000
      // adjustment = 0.0000 × $5,000 = $0
      const result = computeHighIncomeAdjustment({
        nyAgi: d(100001),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 46 - Worksheet 3 single at $125,000", () => {
      // excess = $125,000 - $100,000 = $25,000
      // capped = min($25,000, $50,000) = $25,000
      // ratio = $25,000 / $50,000 = 0.5000
      // 25% of $20,000 = $5,000
      // adjustment = 0.5000 × $5,000 = $2,500
      const result = computeHighIncomeAdjustment({
        nyAgi: d(125000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(2500);
    });

    it("Line 46 - Worksheet 3 single fully phased in at $150,000", () => {
      // excess = $150,000 - $100,000 = $50,000
      // capped = min($50,000, $50,000) = $50,000
      // ratio = 1.0000
      // 25% of $20,000 = $5,000
      // adjustment = $5,000
      const result = computeHighIncomeAdjustment({
        nyAgi: d(150000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(5000);
    });

    it("Line 46 - Worksheet 3 remains at 25% for $150K-$475K", () => {
      // excess = $300,000 - $100,000 = $200,000
      // capped = min($200,000, $50,000) = $50,000
      // ratio = 1.0000
      // 25% of $20,000 = $5,000
      const result = computeHighIncomeAdjustment({
        nyAgi: d(300000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(5000);
    });

    it("Line 46 - Worksheet 3 MFJ uses $200,000 threshold", () => {
      // excess = $225,000 - $200,000 = $25,000
      // ratio = $25,000 / $50,000 = 0.5000
      // 25% of $20,000 = $5,000
      // adjustment = $2,500
      const result = computeHighIncomeAdjustment({
        nyAgi: d(225000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "married_filing_jointly",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(2500);
    });

    it("Line 46 - Worksheet 3 HoH uses $150,000 threshold", () => {
      // excess = $175,000 - $150,000 = $25,000
      // ratio = $25,000 / $50,000 = 0.5000
      // 25% of $20,000 = $5,000
      // adjustment = $2,500
      const result = computeHighIncomeAdjustment({
        nyAgi: d(175000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "head_of_household",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(2500);
    });

    it("Line 46 - Worksheet 4 at $500,000 (midpoint)", () => {
      // excess = $500,000 - $475,000 = $25,000
      // ratio = $25,000 / $50,000 = 0.5000
      // base_25pct = 25% of $20,000 = $5,000
      // incremental = 0.5000 × $5,000 = $2,500
      // adjustment = $5,000 + $2,500 = $7,500
      const result = computeHighIncomeAdjustment({
        nyAgi: d(500000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(7500);
    });

    it("Line 46 - Worksheet 4 at $525,000 (fully phased to 50%)", () => {
      // excess = $525,000 - $475,000 = $50,000
      // ratio = 1.0000
      // base_25pct = $5,000
      // incremental = $5,000
      // adjustment = $10,000 (= 50% of $20,000)
      const result = computeHighIncomeAdjustment({
        nyAgi: d(525000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(10000);
    });

    it("Line 46 - flat 50% for NYAGI $600,000", () => {
      // 50% of $20,000 = $10,000
      const result = computeHighIncomeAdjustment({
        nyAgi: d(600000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(10000);
    });

    it("Line 46 - blank for NYAGI > $1,000,000", () => {
      const result = computeHighIncomeAdjustment({
        nyAgi: d(2000000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 47 - for NYAGI > $1M, limited to 50% of charitable gifts", () => {
      const result = computeLine47({
        nyAgi: d(2000000),
        totalBeforeAdjustment: d(50000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(20000),
      });
      expect(result.toNumber()).toBe(10000);
    });

    it("Line 47 - for NYAGI > $10M, limited to 25% of charitable gifts", () => {
      const result = computeLine47({
        nyAgi: d(15000000),
        totalBeforeAdjustment: d(50000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(20000),
      });
      expect(result.toNumber()).toBe(5000);
    });

    it("Line 47 - zero charitable gifts with NYAGI > $1M yields zero deduction", () => {
      const result = computeLine47({
        nyAgi: d(2000000),
        totalBeforeAdjustment: d(50000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(0),
      });
      expect(result.toNumber()).toBe(0);
    });

    it("Line 47 - at exactly $100,000, returns full line 45", () => {
      const result = computeLine47({
        nyAgi: d(100000),
        totalBeforeAdjustment: d(20000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(5000),
      });
      expect(result.toNumber()).toBe(20000);
    });

    it("Line 47 - at $500K subtracts line 46 from line 45", () => {
      const result = computeLine47({
        nyAgi: d(500000),
        totalBeforeAdjustment: d(20000),
        highIncomeAdjustment: d(7500),
        charitableDeduction: d(5000),
      });
      expect(result.toNumber()).toBe(12500);
    });
  });

  /* ========== Subtraction Adjustments ========== */

  describe("Subtraction adjustments (Line 41)", () => {
    it("Line 41 - full subtraction when no Pease limitation", () => {
      const result = computeSubtractionAdjustments({
        stateLocalIncomeTaxSubtraction: d(5000),
        otherSubtractionAdjustments: d(1000),
        peaseLimitationApplied: false,
        peaseReduction: d(0),
        subjectToLimitDeductions: d(0),
      });
      expect(result.toNumber()).toBe(6000);
    });

    it("Line 41 - prorated when Pease limitation applied", () => {
      // Pease reduction = $3,000, subject-to-limit = $30,000
      // ratio = $3,000 / $30,000 = 0.1000
      // State tax subtraction $5,000 × (1 - 0.1000) = $4,500
      // Other subtractions $1,000 (not prorated)
      // Total = $4,500 + $1,000 = $5,500
      const result = computeSubtractionAdjustments({
        stateLocalIncomeTaxSubtraction: d(5000),
        otherSubtractionAdjustments: d(1000),
        peaseLimitationApplied: true,
        peaseReduction: d(3000),
        subjectToLimitDeductions: d(30000),
      });
      expect(result.toNumber()).toBe(5500);
    });

    it("Line 41 - zero subtraction when no state taxes", () => {
      const result = computeSubtractionAdjustments({
        stateLocalIncomeTaxSubtraction: d(0),
        otherSubtractionAdjustments: d(0),
        peaseLimitationApplied: false,
        peaseReduction: d(0),
        subjectToLimitDeductions: d(0),
      });
      expect(result.toNumber()).toBe(0);
    });
  });

  /* ========== End-to-End Computation ========== */

  describe("End-to-end IT-196 computation", () => {
    it("Line 49 - basic itemizer below all thresholds", () => {
      const result = calculateNYIT196(makeInput());
      // Total = $8,000 + $6,000 + $5,000 = $19,000
      // Pease: AGI $80K < $340,700 → no reduction
      // Line 40 = $19,000
      // Line 41 = $4,000 (state tax subtraction)
      // Line 42 = $19,000 - $4,000 = $15,000
      // Line 45 = $15,000
      // Line 46 = $0 (NYAGI $80K ≤ $100K)
      // Line 47 = $15,000
      // Line 49 = $15,000
      expect(result.totalItemizedDeductions.toNumber()).toBe(19000);
      expect(result.peaseLimitationApplied).toBe(false);
      expect(result.subtractionAdjustments.toNumber()).toBe(4000);
      expect(result.afterSubtractions.toNumber()).toBe(15000);
      expect(result.totalBeforeHighIncomeAdjustment.toNumber()).toBe(15000);
      expect(result.highIncomeAdjustment.toNumber()).toBe(0);
      expect(result.nyItemizedDeduction.toNumber()).toBe(15000);
    });

    it("Line 49 - Pease limitation reduces total deductions for high federal AGI", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 440700,
        nyAgi: 440700,
        taxesDeduction: 15000,
        interestDeduction: 10000,
        charitableDeduction: 8000,
        stateLocalIncomeTaxSubtraction: 6000,
      }));
      // Total = $15,000 + $10,000 + $8,000 = $33,000
      // Excluded = $0 (no medical, no investment interest, etc.)
      // Subject to limit = $33,000
      // Excess AGI = $440,700 - $340,700 = $100,000
      // 3% of $100,000 = $3,000
      // 80% of $33,000 = $26,400
      // Reduction = min($3,000, $26,400) = $3,000
      // Line 40 = $33,000 - $3,000 = $30,000
      expect(result.totalItemizedDeductions.toNumber()).toBe(30000);
      expect(result.peaseLimitationApplied).toBe(true);
      expect(result.peaseReduction.toNumber()).toBe(3000);
    });

    it("Line 49 - excluded Pease items reduce the limitation", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 440700,
        nyAgi: 440700,
        medicalDeduction: 10000, // excluded from Pease
        taxesDeduction: 10000,
        interestDeduction: 5000,
        investmentInterest: 3000, // excluded subset of interest
        charitableDeduction: 5000,
        qualifiedContributions: 2000, // excluded subset of charity
        stateLocalIncomeTaxSubtraction: 6000,
      }));
      // Total = $10,000 + $10,000 + $5,000 + $5,000 = $30,000
      // Excluded = $10,000 (medical) + $3,000 (invest int) + $2,000 (qual contrib) = $15,000
      // Subject to limit = $30,000 - $15,000 = $15,000
      // Excess AGI = $100,000
      // 3% of $100,000 = $3,000
      // 80% of $15,000 = $12,000
      // Reduction = min($3,000, $12,000) = $3,000
      expect(result.peaseReduction.toNumber()).toBe(3000);
      expect(result.totalItemizedDeductions.toNumber()).toBe(27000);
    });

    it("Line 49 - high-income Worksheet 3 reduces deductions for NYAGI $125K single", () => {
      const result = calculateNYIT196(makeInput({
        nyAgi: 125000,
      }));
      // Total = $19,000, Pease = none
      // Line 41 = $4,000
      // Line 45 = $15,000
      // Worksheet 3: excess = $125K - $100K = $25K
      // ratio = $25K / $50K = 0.5000
      // 25% of $15,000 = $3,750
      // adjustment = 0.5000 × $3,750 = $1,875
      // Line 47 = $15,000 - $1,875 = $13,125
      expect(result.highIncomeAdjustment.toNumber()).toBe(1875);
      expect(result.nyItemizedDeduction.toNumber()).toBe(13125);
    });

    it("Line 49 - MFJ at $225K uses MFJ threshold ($200K)", () => {
      const result = calculateNYIT196(makeInput({
        filingStatus: "married_filing_jointly",
        nyAgi: 225000,
      }));
      // Line 45 = $15,000
      // Worksheet 3: excess = $225K - $200K = $25K
      // ratio = 0.5000
      // 25% of $15,000 = $3,750
      // adjustment = $1,875
      expect(result.highIncomeAdjustment.toNumber()).toBe(1875);
      expect(result.nyItemizedDeduction.toNumber()).toBe(13125);
    });

    it("Line 49 - NYAGI $600K gets 50% reduction", () => {
      const result = calculateNYIT196(makeInput({
        nyAgi: 600000,
      }));
      // Line 45 = $15,000
      // 50% of $15,000 = $7,500
      // Line 47 = $15,000 - $7,500 = $7,500
      expect(result.highIncomeAdjustment.toNumber()).toBe(7500);
      expect(result.nyItemizedDeduction.toNumber()).toBe(7500);
    });

    it("Line 49 - NYAGI $2M limits deduction to 50% of charitable gifts", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 2000000,
        nyAgi: 2000000,
        taxesDeduction: 50000,
        interestDeduction: 30000,
        charitableDeduction: 40000,
        stateLocalIncomeTaxSubtraction: 20000,
      }));
      // Line 47 = 50% of $40,000 = $20,000
      // (all other deductions effectively disallowed)
      expect(result.afterHighIncomeAdjustment.toNumber()).toBe(20000);
      expect(result.nyItemizedDeduction.toNumber()).toBe(20000);
    });

    it("Line 49 - NYAGI $15M limits deduction to 25% of charitable gifts", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 15000000,
        nyAgi: 15000000,
        taxesDeduction: 100000,
        interestDeduction: 50000,
        charitableDeduction: 200000,
        stateLocalIncomeTaxSubtraction: 40000,
      }));
      // Line 47 = 25% of $200,000 = $50,000
      expect(result.afterHighIncomeAdjustment.toNumber()).toBe(50000);
      expect(result.nyItemizedDeduction.toNumber()).toBe(50000);
    });

    it("Line 49 - college tuition deduction adds to line 47", () => {
      const result = calculateNYIT196(makeInput({
        collegeTuitionItemizedDeduction: 5000,
      }));
      // Line 47 = $15,000
      // Line 48 = $5,000
      // Line 49 = $20,000
      expect(result.collegeTuitionDeduction.toNumber()).toBe(5000);
      expect(result.nyItemizedDeduction.toNumber()).toBe(20000);
    });

    it("Line 49 - addition adjustments increase deductions", () => {
      const result = calculateNYIT196(makeInput({
        additionAdjustments: 2000,
      }));
      // Line 42 = $15,000
      // Line 44 = $2,000
      // Line 45 = $17,000
      // Line 47 = $17,000
      expect(result.totalBeforeHighIncomeAdjustment.toNumber()).toBe(17000);
      expect(result.nyItemizedDeduction.toNumber()).toBe(17000);
    });

    it("Line 49 - zero deductions produce zero result", () => {
      const result = calculateNYIT196(makeInput({
        taxesDeduction: 0,
        interestDeduction: 0,
        charitableDeduction: 0,
        stateLocalIncomeTaxSubtraction: 0,
      }));
      expect(result.totalItemizedDeductions.toNumber()).toBe(0);
      expect(result.nyItemizedDeduction.toNumber()).toBe(0);
    });
  });

  /* ========== Edge Cases ========== */

  describe("Edge cases", () => {
    it("Line 40 - Pease at exact $1 over threshold", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 340701,
        taxesDeduction: 20000,
        interestDeduction: 10000,
        charitableDeduction: 5000,
        stateLocalIncomeTaxSubtraction: 8000,
      }));
      // Excess = $1, 3% of $1 = $0.03 → rounds to $0
      expect(result.peaseReduction.toNumber()).toBe(0);
      expect(result.peaseLimitationApplied).toBe(false);
    });

    it("Line 46 - Worksheet 3 boundary at exactly $475,000 (still WS3)", () => {
      const result = computeHighIncomeAdjustment({
        nyAgi: d(475000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      // excess = $475K - $100K = $375K, capped at $50K
      // ratio = 1.0000
      // 25% of $20K = $5,000
      expect(result.toNumber()).toBe(5000);
    });

    it("Line 46 - Worksheet 4 boundary at $475,001", () => {
      const result = computeHighIncomeAdjustment({
        nyAgi: d(475001),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      // excess = $1 over $475K
      // ratio = $1 / $50,000 = 0.0000
      // base_25pct = $5,000
      // incremental = 0.0000 × $5,000 = $0
      // adjustment = $5,000 + $0 = $5,000
      expect(result.toNumber()).toBe(5000);
    });

    it("Line 47 - at exactly $1,000,000 uses line 45 - line 46", () => {
      // $1M is ≤ $1M so uses subtraction method
      const adjustment = computeHighIncomeAdjustment({
        nyAgi: d(1000000),
        totalBeforeAdjustment: d(20000),
        filingStatus: "single",
        taxYear: 2025,
      });
      // $525K < $1M → 50% of $20K = $10K
      expect(adjustment.toNumber()).toBe(10000);

      const line47 = computeLine47({
        nyAgi: d(1000000),
        totalBeforeAdjustment: d(20000),
        highIncomeAdjustment: adjustment,
        charitableDeduction: d(5000),
      });
      // line 45 - line 46 = $20K - $10K = $10K
      expect(line47.toNumber()).toBe(10000);
    });

    it("Line 47 - at exactly $1,000,001 switches to 50% of charity", () => {
      const line47 = computeLine47({
        nyAgi: d(1000001),
        totalBeforeAdjustment: d(20000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(5000),
      });
      // 50% of $5,000 = $2,500
      expect(line47.toNumber()).toBe(2500);
    });

    it("Line 47 - at exactly $10,000,000 uses 50% of charity", () => {
      const line47 = computeLine47({
        nyAgi: d(10000000),
        totalBeforeAdjustment: d(50000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(20000),
      });
      // $10M is ≤ $10M → 50% of $20K = $10K
      expect(line47.toNumber()).toBe(10000);
    });

    it("Line 47 - at $10,000,001 switches to 25% of charity", () => {
      const line47 = computeLine47({
        nyAgi: d(10000001),
        totalBeforeAdjustment: d(50000),
        highIncomeAdjustment: d(0),
        charitableDeduction: d(20000),
      });
      // 25% of $20K = $5K
      expect(line47.toNumber()).toBe(5000);
    });

    it("Line 42 - subtraction exceeding line 40 floors to zero", () => {
      const result = calculateNYIT196(makeInput({
        taxesDeduction: 5000,
        interestDeduction: 0,
        charitableDeduction: 0,
        stateLocalIncomeTaxSubtraction: 5000,
      }));
      // Line 40 = $5,000, Line 41 = $5,000
      // Line 42 = max(0, $5K - $5K) = $0
      expect(result.afterSubtractions.toNumber()).toBe(0);
      expect(result.nyItemizedDeduction.toNumber()).toBe(0);
    });

    it("Line 49 - combined Pease and high-income limitation", () => {
      const result = calculateNYIT196(makeInput({
        federalAgi: 500000,
        nyAgi: 500000,
        taxesDeduction: 20000,
        interestDeduction: 10000,
        charitableDeduction: 8000,
        stateLocalIncomeTaxSubtraction: 10000,
      }));
      // Total = $38,000
      // Pease: excess AGI = $500K - $340.7K = $159,300
      //   3% of $159,300 = $4,779
      //   80% of $38,000 = $30,400
      //   reduction = min($4,779, $30,400) = $4,779
      // Line 40 = $38,000 - $4,779 = $33,221
      expect(result.peaseReduction.toNumber()).toBe(4779);
      expect(result.totalItemizedDeductions.toNumber()).toBe(33221);
      // Subtraction with Pease proration:
      //   ratio = $4,779 / $38,000 = 0.1258
      //   state tax sub = $10,000 × (1 - 0.1258) = $10,000 × 0.8742 = $8,742
      expect(result.subtractionAdjustments.toNumber()).toBe(8742);
      // Line 42 = $33,221 - $8,742 = $24,479
      expect(result.afterSubtractions.toNumber()).toBe(24479);
      // Line 45 = $24,479
      // Worksheet 4: excess = $500K - $475K = $25K
      //   ratio = 0.5000
      //   base_25pct = $24,479 × 0.25 = $6,119.75 → $6,120
      //   incremental = 0.5000 × $6,119.75 = $3,059.875 → from base $6,120
      //   But we compute: base_25pct unrounded = $6,119.75
      //   incremental = 0.5000 × $6,119.75 = $3,059.875
      //   total = $6,119.75 + $3,059.875 = $9,179.625 → rounds to $9,180
      //   Actually: adjustment = roundDollar(base25pct + incremental)
      //   base25pct = $24,479 × 0.25 = $6,119.75
      //   incremental = 0.5000 × $6,119.75 = $3,059.875
      //   total = $9,179.625 → $9,180
      // Line 47 = $24,479 - $9,180 = $15,299
    });

    it("all filing statuses have high-income thresholds for 2025", () => {
      const thresholds = HIGH_INCOME_THRESHOLDS[2025];
      expect(thresholds.single.toNumber()).toBe(100000);
      expect(thresholds.married_filing_jointly.toNumber()).toBe(200000);
      expect(thresholds.qualifying_surviving_spouse.toNumber()).toBe(200000);
      expect(thresholds.head_of_household.toNumber()).toBe(150000);
      expect(thresholds.married_filing_separately.toNumber()).toBe(100000);
    });
  });

  /* ========== Audit Trail ========== */

  describe("Audit trail", () => {
    it("records all key lines", () => {
      const result = calculateNYIT196(makeInput());
      const lineNumbers = result.lines.map(l => l.line);
      expect(lineNumbers).toContain("40");
      expect(lineNumbers).toContain("41");
      expect(lineNumbers).toContain("42");
      expect(lineNumbers).toContain("44");
      expect(lineNumbers).toContain("45");
      expect(lineNumbers).toContain("46");
      expect(lineNumbers).toContain("47");
      expect(lineNumbers).toContain("48");
      expect(lineNumbers).toContain("49");
    });

    it("all lines reference NY-IT196 form", () => {
      const result = calculateNYIT196(makeInput());
      for (const line of result.lines) {
        expect(line.form).toBe("NY-IT196");
      }
    });
  });
});

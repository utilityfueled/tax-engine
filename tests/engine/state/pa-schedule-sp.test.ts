/**
 * Tests for Pennsylvania Schedule SP — Special Tax Forgiveness
 * Spec: spec/state/pa-schedule-sp.yaml
 *
 * PA Tax Forgiveness provides a 0%–100% reduction of PA-40 tax liability
 * based on eligibility income, filing category, and number of dependents.
 * Source: PA Department of Revenue, Schedule SP Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleSP,
  type ScheduleSPInput,
  getForgivenessPercentage,
  getBaseThreshold,
} from "@/engine/state/pa-schedule-sp.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = new Decimal(0);

/** Helper to build a ScheduleSPInput with defaults */
function makeInput(overrides: Partial<ScheduleSPInput> = {}): ScheduleSPInput {
  return {
    taxYear: 2025,
    filingCategory: "unmarried",
    dependents: 0,
    paTaxableIncome: ZERO,
    nontaxableIncome: ZERO,
    taxLiability: ZERO,
    taxPaidToOtherStates: ZERO,
    ...overrides,
  };
}

describe("Pennsylvania Schedule SP — Special Tax Forgiveness", () => {
  // =================================================================
  // Part A — Eligibility Income
  // =================================================================

  describe("Part A — Eligibility Income", () => {
    it("PA Schedule SP Line A-1 - PA taxable income from PA-40", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        taxLiability: d(154),
      }));
      expect(result.paTaxableIncome.toNumber()).toBe(5000);
    });

    it("PA Schedule SP Line A-2 - nontaxable income additions", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(3000),
        nontaxableIncome: d(2000),
        taxLiability: d(92),
      }));
      expect(result.nontaxableIncome.toNumber()).toBe(2000);
    });

    it("PA Schedule SP Line A-3 - total eligibility income", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(4000),
        nontaxableIncome: d(1500),
        taxLiability: d(123),
      }));
      expect(result.eligibilityIncome.toNumber()).toBe(5500);
    });

    it("PA Schedule SP Line A-3 - additional spouse eligibility income increases total eligibility income", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(4000),
        nontaxableIncome: d(1500),
        additionalEligibilityIncome: d(10000),
        taxLiability: d(123),
      }));

      expect(result.eligibilityIncome.toNumber()).toBe(15500);
    });

    it("PA Schedule SP Line A-3 - eligibility income floors at zero", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: ZERO,
        nontaxableIncome: ZERO,
        taxLiability: ZERO,
      }));
      expect(result.eligibilityIncome.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Part B — Forgiveness Percentage Lookup
  // =================================================================

  describe("Part B — Forgiveness Percentage (Unmarried, 0 dependents)", () => {
    // Base threshold: $6,500
    // Steps: $250 each, 10% decrease per step
    // Range: $6,500 (100%) → $8,750 (10%), >$8,750 (0%)

    it("PA Schedule SP forgiveness percentage lookup - zero income gets 100%", () => {
      expect(getForgivenessPercentage(d(0), "unmarried", 0, 2025).toNumber()).toBe(100);
    });

    it("PA Schedule SP forgiveness percentage lookup - at base threshold gets 100%", () => {
      expect(getForgivenessPercentage(d(6500), "unmarried", 0, 2025).toNumber()).toBe(100);
    });

    it("PA Schedule SP forgiveness percentage lookup - $1 over base gets 90%", () => {
      expect(getForgivenessPercentage(d(6501), "unmarried", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $6,750 gets 90%", () => {
      expect(getForgivenessPercentage(d(6750), "unmarried", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $7,000 gets 80%", () => {
      expect(getForgivenessPercentage(d(7000), "unmarried", 0, 2025).toNumber()).toBe(80);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $7,250 gets 70%", () => {
      expect(getForgivenessPercentage(d(7250), "unmarried", 0, 2025).toNumber()).toBe(70);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $7,500 gets 60%", () => {
      expect(getForgivenessPercentage(d(7500), "unmarried", 0, 2025).toNumber()).toBe(60);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $7,750 gets 50%", () => {
      expect(getForgivenessPercentage(d(7750), "unmarried", 0, 2025).toNumber()).toBe(50);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $8,000 gets 40%", () => {
      expect(getForgivenessPercentage(d(8000), "unmarried", 0, 2025).toNumber()).toBe(40);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $8,250 gets 30%", () => {
      expect(getForgivenessPercentage(d(8250), "unmarried", 0, 2025).toNumber()).toBe(30);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $8,500 gets 20%", () => {
      expect(getForgivenessPercentage(d(8500), "unmarried", 0, 2025).toNumber()).toBe(20);
    });

    it("PA Schedule SP forgiveness percentage lookup - at $8,750 gets 10%", () => {
      expect(getForgivenessPercentage(d(8750), "unmarried", 0, 2025).toNumber()).toBe(10);
    });

    it("PA Schedule SP forgiveness percentage lookup - above $8,750 gets 0%", () => {
      expect(getForgivenessPercentage(d(8751), "unmarried", 0, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP forgiveness percentage lookup - well above threshold gets 0%", () => {
      expect(getForgivenessPercentage(d(50000), "unmarried", 0, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent claimant gate - dependent without a qualifying household gets 0%", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(4000),
        taxLiability: d(123),
        isClaimedAsDependentOnAnotherFederalReturn: true,
      }));

      expect(result.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent claimant gate - qualifying household preserves the normal lookup", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(4000),
        taxLiability: d(123),
        isClaimedAsDependentOnAnotherFederalReturn: true,
        claimingHouseholdQualifiesForTaxForgiveness: true,
      }));

      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(123);
    });
  });

  describe("Part B — Forgiveness Percentage (Married, 0 dependents)", () => {
    // Base threshold: $13,000
    // Steps: $250 each

    it("PA Schedule SP - married at $13,000 gets 100%", () => {
      expect(getForgivenessPercentage(d(13000), "married", 0, 2025).toNumber()).toBe(100);
    });

    it("PA Schedule SP - married at $13,001 gets 90%", () => {
      expect(getForgivenessPercentage(d(13001), "married", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP - married at $13,250 gets 90%", () => {
      expect(getForgivenessPercentage(d(13250), "married", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP - married at $14,000 gets 60%", () => {
      expect(getForgivenessPercentage(d(14000), "married", 0, 2025).toNumber()).toBe(60);
    });

    it("PA Schedule SP - married at $15,250 gets 10%", () => {
      expect(getForgivenessPercentage(d(15250), "married", 0, 2025).toNumber()).toBe(10);
    });

    it("PA Schedule SP - married above $15,250 gets 0%", () => {
      expect(getForgivenessPercentage(d(15251), "married", 0, 2025).toNumber()).toBe(0);
    });
  });

  describe("Part B — Dependent Count Affects Thresholds", () => {
    it("PA Schedule SP dependent count affects thresholds - unmarried, 1 dep: base $16,000", () => {
      // $16,000 base for 100%
      expect(getForgivenessPercentage(d(16000), "unmarried", 1, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(16001), "unmarried", 1, 2025).toNumber()).toBe(90);
      // Max: $18,250 for 10%, >$18,250 for 0%
      expect(getForgivenessPercentage(d(18250), "unmarried", 1, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(18251), "unmarried", 1, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - unmarried, 2 deps: base $25,500", () => {
      expect(getForgivenessPercentage(d(25500), "unmarried", 2, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(25501), "unmarried", 2, 2025).toNumber()).toBe(90);
      expect(getForgivenessPercentage(d(27750), "unmarried", 2, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(27751), "unmarried", 2, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - unmarried, 3 deps: base $35,000", () => {
      expect(getForgivenessPercentage(d(35000), "unmarried", 3, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(37250), "unmarried", 3, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(37251), "unmarried", 3, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - unmarried, 4 deps: base $44,500", () => {
      expect(getForgivenessPercentage(d(44500), "unmarried", 4, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(46750), "unmarried", 4, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(46751), "unmarried", 4, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - married, 1 dep: base $22,500", () => {
      expect(getForgivenessPercentage(d(22500), "married", 1, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(22501), "married", 1, 2025).toNumber()).toBe(90);
      expect(getForgivenessPercentage(d(24750), "married", 1, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(24751), "married", 1, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - married, 2 deps: base $32,000", () => {
      expect(getForgivenessPercentage(d(32000), "married", 2, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(34250), "married", 2, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(34251), "married", 2, 2025).toNumber()).toBe(0);
    });

    it("PA Schedule SP dependent count affects thresholds - married, 3 deps: base $41,500", () => {
      expect(getForgivenessPercentage(d(41500), "married", 3, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(43750), "married", 3, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(43751), "married", 3, 2025).toNumber()).toBe(0);
    });
  });

  describe("PA Schedule SP base threshold computation", () => {
    it("PA Schedule SP base threshold computation - unmarried, 0 deps: $6,500", () => {
      expect(getBaseThreshold("unmarried", 0, 2025).toNumber()).toBe(6500);
    });

    it("PA Schedule SP Line B-2 - negative dependent counts are invalid", () => {
      expect(() => getBaseThreshold("unmarried", -1, 2025)).toThrow(
        "PA Schedule SP dependent count must be a whole number of at least 0",
      );
    });

    it("PA Schedule SP Line B-2 - fractional dependent counts are invalid", () => {
      expect(() => getForgivenessPercentage(d(6500), "married", 1.5, 2025)).toThrow(
        "PA Schedule SP dependent count must be a whole number of at least 0",
      );
    });

    it("PA Schedule SP Line B-2 - calculateScheduleSP rejects invalid dependent counts", () => {
      expect(() => calculateScheduleSP(makeInput({
        dependents: -2,
        paTaxableIncome: d(5000),
        taxLiability: d(154),
      }))).toThrow("PA Schedule SP dependent count must be a whole number of at least 0");
    });

    it("PA Schedule SP base threshold computation - unmarried, 1 dep: $16,000", () => {
      expect(getBaseThreshold("unmarried", 1, 2025).toNumber()).toBe(16000);
    });

    it("PA Schedule SP base threshold computation - unmarried, 2 deps: $25,500", () => {
      expect(getBaseThreshold("unmarried", 2, 2025).toNumber()).toBe(25500);
    });

    it("PA Schedule SP base threshold computation - married, 0 deps: $13,000", () => {
      expect(getBaseThreshold("married", 0, 2025).toNumber()).toBe(13000);
    });

    it("PA Schedule SP base threshold computation - married, 1 dep: $22,500", () => {
      expect(getBaseThreshold("married", 1, 2025).toNumber()).toBe(22500);
    });

    it("PA Schedule SP base threshold computation - married, 2 deps: $32,000", () => {
      expect(getBaseThreshold("married", 2, 2025).toNumber()).toBe(32000);
    });

    it("PA Schedule SP base threshold computation - high dependent count (10 deps)", () => {
      // 10 deps, unmarried: $6,500 + 10 × $9,500 = $101,500
      expect(getBaseThreshold("unmarried", 10, 2025).toNumber()).toBe(101500);
      // 10 deps, married: $13,000 + 10 × $9,500 = $108,000
      expect(getBaseThreshold("married", 10, 2025).toNumber()).toBe(108000);
    });
  });

  // =================================================================
  // Part C — Credit Computation
  // =================================================================

  describe("Part C — Credit Computation", () => {
    it("PA Schedule SP credit equals tax liability times forgiveness percentage - 100% forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        taxLiability: d(154), // $5,000 × 3.07% = $153.50 → $154
      }));
      // $5,000 eligibility income, unmarried, 0 deps → 100% forgiveness
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(154);
    });

    it("PA Schedule SP subtracts tax paid to other states before computing forgiveness credit", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        taxLiability: d(154),
        taxPaidToOtherStates: d(100),
      }));

      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxPaidToOtherStates.toNumber()).toBe(100);
      expect(result.taxLiabilityAfterOtherStateTaxes.toNumber()).toBe(54);
      expect(result.taxForgivenessCredit.toNumber()).toBe(54);
    });

    it("PA Schedule SP credit equals tax liability times forgiveness percentage - 0% forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(50000),
        taxLiability: d(1535),
      }));
      // $50,000 eligibility income, unmarried, 0 deps → 0% forgiveness
      expect(result.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("PA Schedule SP credit equals tax liability times forgiveness percentage - partial forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(7500),
        taxLiability: d(230), // $7,500 × 3.07% = $230.25 → $230
        taxPaidToOtherStates: d(80),
      }));
      // $7,500 eligibility income, unmarried, 0 deps → 60% forgiveness
      expect(result.forgivenessPercentage.toNumber()).toBe(60);
      // ($230 - $80) × 60% = $90
      expect(result.taxLiabilityAfterOtherStateTaxes.toNumber()).toBe(150);
      expect(result.taxForgivenessCredit.toNumber()).toBe(90);
    });

    it("PA Schedule SP credit - 50% forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(7750),
        taxLiability: d(238), // $7,750 × 3.07% = $237.93 → $238
      }));
      // $7,750 eligibility income, unmarried, 0 deps → 50% forgiveness
      expect(result.forgivenessPercentage.toNumber()).toBe(50);
      // $238 × 50% = $119
      expect(result.taxForgivenessCredit.toNumber()).toBe(119);
    });

    it("PA Schedule SP credit - 10% forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(8750),
        taxLiability: d(269), // $8,750 × 3.07% = $268.63 → $269
      }));
      // $8,750 eligibility income, unmarried, 0 deps → 10% forgiveness
      expect(result.forgivenessPercentage.toNumber()).toBe(10);
      // $269 × 10% = $26.9 → $27
      expect(result.taxForgivenessCredit.toNumber()).toBe(27);
    });

    it("PA Schedule SP credit - zero tax liability means zero credit regardless of forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(1000),
        taxLiability: ZERO,
      }));
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Filing Category Selection
  // =================================================================

  describe("PA Schedule SP filing category selection", () => {
    it("PA Schedule SP filing category selection - unmarried uses Table 1 thresholds", () => {
      const result = calculateScheduleSP(makeInput({
        filingCategory: "unmarried",
        paTaxableIncome: d(6500),
        taxLiability: d(200),
      }));
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
    });

    it("PA Schedule SP filing category selection - married uses Table 2 thresholds", () => {
      // $6,500 income: unmarried → 100%, married → 100% (both below their thresholds)
      // $6,501 income: unmarried → 90%, married → 100% (married threshold is $13,000)
      const resultMarried = calculateScheduleSP(makeInput({
        filingCategory: "married",
        paTaxableIncome: d(6501),
        taxLiability: d(200),
      }));
      expect(resultMarried.forgivenessPercentage.toNumber()).toBe(100);

      const resultUnmarried = calculateScheduleSP(makeInput({
        filingCategory: "unmarried",
        paTaxableIncome: d(6501),
        taxLiability: d(200),
      }));
      expect(resultUnmarried.forgivenessPercentage.toNumber()).toBe(90);
    });
  });

  // =================================================================
  // Nontaxable Income Affects Eligibility
  // =================================================================

  describe("Nontaxable Income Affects Eligibility", () => {
    it("PA Schedule SP - nontaxable income pushes eligibility above forgiveness thresholds", () => {
      // PA taxable income alone: $5,000 → 100% forgiveness for unmarried
      // But $5,000 nontaxable → eligibility = $10,000 → 0% forgiveness
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        nontaxableIncome: d(5000),
        taxLiability: d(154),
      }));
      expect(result.eligibilityIncome.toNumber()).toBe(10000);
      expect(result.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("PA Schedule SP - nontaxable income moves filer to partial forgiveness", () => {
      // PA taxable: $5,000 → would be 100%
      // Nontaxable: $2,500 → eligibility = $7,500 → 60% forgiveness
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        nontaxableIncome: d(2500),
        taxLiability: d(154),
      }));
      expect(result.eligibilityIncome.toNumber()).toBe(7500);
      expect(result.forgivenessPercentage.toNumber()).toBe(60);
      // $154 × 60% = $92.40 → $92
      expect(result.taxForgivenessCredit.toNumber()).toBe(92);
    });
  });

  // =================================================================
  // Realistic Scenarios
  // =================================================================

  describe("Realistic Scenarios", () => {
    it("PA Schedule SP - single minimum-wage worker: full forgiveness", () => {
      // ~$5,000 annual income, no dependents
      const result = calculateScheduleSP(makeInput({
        filingCategory: "unmarried",
        dependents: 0,
        paTaxableIncome: d(5000),
        taxLiability: d(154),
      }));
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(154);
    });

    it("PA Schedule SP - single parent with 2 kids, modest income: full forgiveness", () => {
      // $20,000 income, 2 dependents → base $25,500
      const result = calculateScheduleSP(makeInput({
        filingCategory: "unmarried",
        dependents: 2,
        paTaxableIncome: d(20000),
        taxLiability: d(614),
      }));
      // $20,000 < $25,500 base → 100%
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(614);
    });

    it("PA Schedule SP - married couple, 3 kids, at partial forgiveness", () => {
      // Married, 3 deps: base = $13,000 + 3 × $9,500 = $41,500
      // Income: $42,000 = base + $500 → 80% forgiveness
      const result = calculateScheduleSP(makeInput({
        filingCategory: "married",
        dependents: 3,
        paTaxableIncome: d(42000),
        taxLiability: d(1289), // $42,000 × 3.07% = $1,289.40 → $1,289
      }));
      expect(result.forgivenessPercentage.toNumber()).toBe(80);
      // $1,289 × 80% = $1,031.20 → $1,031
      expect(result.taxForgivenessCredit.toNumber()).toBe(1031);
    });

    it("PA Schedule SP - married couple, no kids, income above threshold: no forgiveness", () => {
      const result = calculateScheduleSP(makeInput({
        filingCategory: "married",
        dependents: 0,
        paTaxableIncome: d(60000),
        taxLiability: d(1842),
      }));
      expect(result.forgivenessPercentage.toNumber()).toBe(0);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("PA Schedule SP - income with other includable nontaxable income", () => {
      // PA taxable: $4,000, other Schedule SP-includable nontaxable income: $12,000
      // Eligibility: $16,000 → for unmarried, 0 deps: way above $8,750 → 0%
      // But with 1 dependent: base = $16,000, $16,000 ≤ $16,000 → 100%
      const result = calculateScheduleSP(makeInput({
        filingCategory: "unmarried",
        dependents: 1,
        paTaxableIncome: d(4000),
        nontaxableIncome: d(12000),
        taxLiability: d(123),
      }));
      expect(result.eligibilityIncome.toNumber()).toBe(16000);
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(123);
    });
  });

  // =================================================================
  // Edge Cases
  // =================================================================

  describe("Edge Cases", () => {
    it("PA Schedule SP - boundary: exactly at step boundary gets higher percentage", () => {
      // $6,750 is the upper limit for 90%
      expect(getForgivenessPercentage(d(6750), "unmarried", 0, 2025).toNumber()).toBe(90);
      // $6,751 is in the 80% bracket
      expect(getForgivenessPercentage(d(6751), "unmarried", 0, 2025).toNumber()).toBe(80);
    });

    it("PA Schedule SP - boundary: exactly $1 below step boundary", () => {
      // $6,749 is still in 90% bracket
      expect(getForgivenessPercentage(d(6749), "unmarried", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP - cents in eligibility income (rounded comparison)", () => {
      // $6,500.50 should still be in the 90% bracket (exceeds $6,500)
      expect(getForgivenessPercentage(d("6500.50"), "unmarried", 0, 2025).toNumber()).toBe(90);
    });

    it("PA Schedule SP - zero income, zero tax: credit is $0 (but 100% forgiveness)", () => {
      const result = calculateScheduleSP(makeInput({}));
      expect(result.forgivenessPercentage.toNumber()).toBe(100);
      expect(result.taxForgivenessCredit.toNumber()).toBe(0);
    });

    it("PA Schedule SP - many dependents greatly increases threshold", () => {
      // Unmarried, 9 dependents: $6,500 + 9 × $9,500 = $92,000 base
      expect(getBaseThreshold("unmarried", 9, 2025).toNumber()).toBe(92000);
      expect(getForgivenessPercentage(d(92000), "unmarried", 9, 2025).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(94250), "unmarried", 9, 2025).toNumber()).toBe(10);
      expect(getForgivenessPercentage(d(94251), "unmarried", 9, 2025).toNumber()).toBe(0);
    });
  });

  // =================================================================
  // Tax Year
  // =================================================================

  describe("Tax Year", () => {
    it("PA Schedule SP - 2024 tax year uses same thresholds", () => {
      expect(getForgivenessPercentage(d(6500), "unmarried", 0, 2024).toNumber()).toBe(100);
      expect(getForgivenessPercentage(d(13000), "married", 0, 2024).toNumber()).toBe(100);
    });

    it("PA Schedule SP - throws for unsupported tax year", () => {
      expect(() =>
        calculateScheduleSP(makeInput({ taxYear: 2020 }))
      ).toThrow("PA Schedule SP constants not available for tax year 2020");
    });
  });

  // =================================================================
  // Audit Trail
  // =================================================================

  describe("Audit Trail", () => {
    it("PA Schedule SP - audit trail records all key lines", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        nontaxableIncome: d(1000),
        taxLiability: d(154),
      }));
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("A-1");
      expect(lineNumbers).toContain("A-2");
      expect(lineNumbers).toContain("A-3");
      expect(lineNumbers).toContain("B-3");
      expect(lineNumbers).toContain("B-4");
      expect(lineNumbers).toContain("C-1");
      expect(lineNumbers).toContain("C-2");
    });

    it("PA Schedule SP - all audit trail entries have form 'PA-Schedule-SP'", () => {
      const result = calculateScheduleSP(makeInput({
        paTaxableIncome: d(5000),
        taxLiability: d(154),
      }));
      for (const line of result.lines) {
        expect(line.form).toBe("PA-Schedule-SP");
      }
    });

    it("PA Schedule SP Line A-2 audit trail describes only Schedule SP-includable nontaxable income", () => {
      const result = calculateScheduleSP(makeInput({
        nontaxableIncome: d(1000),
      }));

      const lineA2 = result.lines.find((line) => line.line === "A-2");
      expect(lineA2).toBeDefined();
      expect(lineA2?.formula).toContain("Schedule SP-includable nontaxable income");
      expect(lineA2?.formula).not.toContain("Social Security");
    });
  });
});

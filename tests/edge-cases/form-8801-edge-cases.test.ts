/**
 * Edge case tests for Form 8801 — Credit for Prior Year Minimum Tax
 * Spec: spec/federal/form-8801.yaml
 *
 * Tests boundary conditions for AMT exemption phase-outs, 26%/28% rate
 * brackets, credit limitations, Part III capital gains rate thresholds,
 * and filing status interactions.
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import type { Form8801Input } from "@/engine/forms/form-8801.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: Partial<Form8801Input> = {}): Form8801Input {
  const input: Form8801Input = {
    priorYearFilingStatus: "single",
    priorYearTaxableIncome: d(200000),
    priorYearExclusionItemAdjustments: d(10000),
    priorYearAMT: d(5000),
    priorYearRegularTax: d(35000),
    unusedMinimumTaxCreditCarryforward: d(0),
    currentYearRegularTaxBeforeCredits: d(40000),
    currentYearTMT: d(35000),
    ...overrides,
  };
  // These synthetic sources have no investment-interest election or Form2555.
  // Complete their regular-tax worksheet from the declared fixture income, never AMT base.
  const qd = input.priorYearQualifiedDividends ?? d(0);
  const gain = input.priorYearNetLTCG ?? d(0);
  const special = input.priorYearUnrecapturedSection1250Gain ?? d(0);
  const collectibles = input.priorYearCollectiblesGain ?? d(0);
  if (qd.plus(gain).gt(0) && input.priorYearCapitalGainsWorksheet === undefined) {
    const total = qd.plus(gain);
    const preferential = total.minus(Decimal.min(gain, special.plus(collectibles)));
    const ordinaryZero = Decimal.max(0, input.priorYearTaxableIncome.minus(preferential));
    const ordinaryBase = Decimal.max(0, input.priorYearTaxableIncome.minus(total));
    const ordinaryRateLimit = ["married_filing_jointly", "qualifying_surviving_spouse"].includes(input.priorYearFilingStatus) ? d(383900) : d(191950);
    input.priorYearCapitalGainsWorksheet = special.gt(0) || collectibles.gt(0) ? {
      method: "schedule_d", preferentialIncome: preferential, section1250Gain: special,
      scheduleDTaxWorksheetLine10: total, ordinaryIncomeForZeroRate: ordinaryZero,
      ordinaryIncomeForFifteenRate: Decimal.max(ordinaryBase, Decimal.min(ordinaryZero, ordinaryRateLimit, input.priorYearTaxableIncome)),
    } : {
      method: "qualified_dividends", preferentialIncome: total,
      ordinaryIncomeForZeroRate: ordinaryZero, ordinaryIncomeForFifteenRate: ordinaryZero,
    };
  }
  return input;
}

describe("Form 8801 edge cases", () => {
  // ── Exemption phase-out threshold boundaries ──────────────

  describe("exemption phase-out threshold boundaries", () => {
    it("Form 8801 Line 9 - single filer $1 below phase-out threshold retains full exemption", () => {
      // Exclusion-only AMTI = 609,349 (just below $609,350 threshold)
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(599349),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(85700);
    });

    it("Form 8801 Line 9 - single filer exactly at phase-out threshold retains full exemption", () => {
      // Exclusion-only AMTI = 609,350 (exactly at threshold, excess = 0)
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(599350),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(85700);
    });

    it("Form 8801 Line 9 - single filer $1 above phase-out threshold loses $0.25 of exemption", () => {
      // Exclusion-only AMTI = 609,351 → excess = $1 → reduction = $0.25 → rounds to $0
      // Exemption: 85,700 - 0 = 85,700
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(599351),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(85700);
    });

    it("Form 8801 Line 9 - single filer $4 above phase-out threshold loses $1 of exemption", () => {
      // Exclusion-only AMTI = 609,354 → excess = $4 → reduction = $1
      // Exemption: 85,700 - 1 = 85,699
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(599354),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(85699);
    });

    it("Form 8801 Line 9 - single filer at exact exemption elimination point gets zero exemption", () => {
      // Exemption fully eliminates when reduction >= 85,700
      // 85,700 / 0.25 = 342,800 excess needed
      // Threshold + 342,800 = 609,350 + 342,800 = 952,150
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(942150),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(0);
    });

    it("Form 8801 Line 9 - single filer $1 below exemption elimination point gets $0 or $1 exemption", () => {
      // AMTI = 952,149 → excess = 342,799 → reduction = 85,699.75 → rounds to 85,700
      // Exemption: max(0, 85,700 - 85,700) = 0
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(942149),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBeLessThanOrEqual(1);
    });

    it("Form 8801 Line 9 - MFJ filer $1 above phase-out threshold ($1,218,701)", () => {
      // MFJ phase-out threshold = 1,218,700; exemption = 133,300
      // Exclusion-only AMTI = 1,218,701 → excess = $1 → reduction = $0.25 → rounds to $0
      const result = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_jointly",
        priorYearTaxableIncome: d(1208701),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(133300);
    });

    it("Form 8801 Line 9 - MFS filer at exact phase-out threshold ($609,350)", () => {
      // MFS phase-out threshold = 609,350; exemption = 66,650
      const result = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_separately",
        priorYearTaxableIncome: d(599350),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(66650);
    });

    it("Form 8801 Line 9 - MFS exemption eliminates at lower AMTI than single due to lower exemption", () => {
      // MFS exemption = 66,650; elimination at threshold + 4×66,650 = 609,350 + 266,600 = 875,950
      const result = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_separately",
        priorYearTaxableIncome: d(865950),
        priorYearExclusionItemAdjustments: d(10000),
      }));
      expect(result.exemption.toNumber()).toBe(0);
    });
  });

  // ── 26%/28% rate bracket boundaries ────────────────────────

  describe("26%/28% AMT rate bracket boundaries", () => {
    it("Form 8801 Line 11 - AMT base exactly at $232,600 (26% bracket limit, single)", () => {
      // All at 26%: 232,600 × 0.26 = 60,476
      // Set up AMTI so that after exemption the base = 232,600
      // With full exemption: AMTI = 232,600 + 85,700 = 318,300
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(308300),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0), // ensure TMT > regular tax for testing
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(232600);
      expect(result.exclusionOnlyTMT.toNumber()).toBe(60476);
    });

    it("Form 8801 Line 11 - AMT base $1 above $232,600 crosses into 28% bracket", () => {
      // 232,600 × 0.26 = 60,476 + 1 × 0.28 = 0.28 → rounds to 0
      // TMT = 60,476 + 0 = 60,476 (single dollar at 28% rounds to 0)
      // Actually: roundDollar(1 × 0.28) = roundDollar(0.28) = 0
      // So TMT = 60,476 + 0 = 60,476
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(308301),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(232601);
      // 26% portion: roundDollar(232,600 × 0.26) = 60,476
      // 28% portion: roundDollar(1 × 0.28) = 0
      expect(result.exclusionOnlyTMT.toNumber()).toBe(60476);
    });

    it("Form 8801 Line 11 - AMT base $100 above bracket shows 28% marginal rate", () => {
      // 232,600 × 0.26 = 60,476 + 100 × 0.28 = 28
      // TMT = 60,476 + 28 = 60,504
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(308400),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(232700);
      expect(result.exclusionOnlyTMT.toNumber()).toBe(60504);
    });

    it("Form 8801 Line 11 - MFS uses $116,300 bracket limit", () => {
      // MFS: 116,300 × 0.26 = 30,238
      // Set AMTI = 116,300 + 66,650 (MFS exemption) = 182,950
      const result = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_separately",
        priorYearTaxableIncome: d(172950),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(116300);
      expect(result.exclusionOnlyTMT.toNumber()).toBe(30238);
    });

    it("Form 8801 Line 11 - MFS $100 above bracket limit pays 28% on excess", () => {
      const result = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_separately",
        priorYearTaxableIncome: d(173050),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(116400);
      // 116,300 × 0.26 = 30,238 + 100 × 0.28 = 28 → 30,266
      expect(result.exclusionOnlyTMT.toNumber()).toBe(30266);
    });
  });

  // ── Credit limitation boundaries ───────────────────────────

  describe("credit limitation boundaries", () => {
    it("Form 8801 Line 24 - limitation is exactly $1 when regular tax exceeds TMT by $1", () => {
      const result = calculateForm8801(makeInput({
        currentYearRegularTaxBeforeCredits: d(35001),
        currentYearTMT: d(35000),
        priorYearAMT: d(10000),
        priorYearRegularTax: d(50000), // high enough so net exclusion min tax = 0
        priorYearExclusionItemAdjustments: d(0), // no exclusion items → all AMT is deferral
      }));
      expect(result.currentYearLimitation.toNumber()).toBe(1);
      expect(result.creditAllowed.toNumber()).toBe(1);
    });

    it("Form 8801 Line 24 - limitation is exactly $0 when regular tax equals TMT", () => {
      const result = calculateForm8801(makeInput({
        currentYearRegularTaxBeforeCredits: d(35000),
        currentYearTMT: d(35000),
        priorYearAMT: d(10000),
      }));
      expect(result.currentYearLimitation.toNumber()).toBe(0);
      expect(result.creditAllowed.toNumber()).toBe(0);
    });

    it("Form 8801 Line 25 - credit exactly equals limitation (no carryforward)", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(5000),
        priorYearRegularTax: d(35000), // net min tax = 0, so credit = 5000
        priorYearExclusionItemAdjustments: d(0),
        currentYearRegularTaxBeforeCredits: d(40000),
        currentYearTMT: d(35000), // limitation = 5000
      }));
      expect(result.totalAvailableCredit.toNumber()).toBe(5000);
      expect(result.currentYearLimitation.toNumber()).toBe(5000);
      expect(result.creditAllowed.toNumber()).toBe(5000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });

    it("Form 8801 Line 25 - credit exceeds limitation by $1, remainder carries forward", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(5001),
        priorYearRegularTax: d(35000),
        priorYearExclusionItemAdjustments: d(0),
        currentYearRegularTaxBeforeCredits: d(40000),
        currentYearTMT: d(35000), // limitation = 5000
      }));
      expect(result.totalAvailableCredit.toNumber()).toBe(5001);
      expect(result.currentYearLimitation.toNumber()).toBe(5000);
      expect(result.creditAllowed.toNumber()).toBe(5000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(1);
    });

    it("Form 8801 Line 26 - large carryforward when TMT exceeds regular tax (no credit usable)", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(20000),
        priorYearRegularTax: d(35000),
        priorYearExclusionItemAdjustments: d(0),
        unusedMinimumTaxCreditCarryforward: d(15000),
        currentYearRegularTaxBeforeCredits: d(30000),
        currentYearTMT: d(40000), // TMT > regular tax → limitation = 0
      }));
      expect(result.totalAvailableCredit.toNumber()).toBe(35000); // 20000 + 15000
      expect(result.currentYearLimitation.toNumber()).toBe(0);
      expect(result.creditAllowed.toNumber()).toBe(0);
      expect(result.carryforwardToNextYear.toNumber()).toBe(35000);
    });
  });


  describe("Part III capital gains rate boundaries", () => {
    it("Form 8801 Part III - preferential income exactly fills 0% bracket (zero TMT on CG portion)", () => {
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(100000),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(100000),
        priorYearNetLTCG: d(0),
      }));
      expect(result.exclusionOnlyTMT.toNumber()).toBe(0);
    });

    it("Form 8801 Part III - preferential income crosses 0%/15% boundary", () => {
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(145700),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(100000),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(60000);
      expect(result.exclusionOnlyTMT.toNumber()).toBe(8801);
    });

    it("Form 8801 Part III - preferential income stacked above ordinary portion shifts bracket", () => {
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(155700),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(30000),
      }));
      expect(result.amtBaseOnExclusions.toNumber()).toBe(80000);
      expect(result.exclusionOnlyTMT.toNumber()).toBe(17500);
    });

    it("Form 8801 Part III - section 1250 gain at 25% rate is lower than 26% AMT rate", () => {
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(375700),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(0),
        priorYearNetLTCG: d(400000),
        priorYearUnrecapturedSection1250Gain: d(50000),
      }));
      expect(result.exclusionOnlyTMT.lessThan(d(79348))).toBe(true);
    });

    it("Form 8801 Part III - collectibles gain at 28% rate does not reduce TMT for that portion", () => {
      const result = calculateForm8801(makeInput({
        priorYearTaxableIncome: d(400000),
        priorYearExclusionItemAdjustments: d(10000),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(0),
        priorYearNetLTCG: d(500000),
        priorYearCollectiblesGain: d(500000),
      }));
      const flatTMT = (() => {
        const base = result.amtBaseOnExclusions;
        const at26 = Decimal.min(base, d(232600)).times(d("0.26")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        const at28 = Decimal.max(d(0), base.minus(d(232600))).times(d("0.28")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        return at26.plus(at28);
      })();
      expect(result.exclusionOnlyTMT.eq(flatTMT)).toBe(true);
    });

    it("Form 8801 Part III - MFJ uses MFJ capital gains thresholds", () => {
      const single = calculateForm8801(makeInput({
        priorYearFilingStatus: "single",
        priorYearTaxableIncome: d(100000),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(50000),
      }));
      const mfj = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_jointly",
        priorYearTaxableIncome: d(100000),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(50000),
      }));
      expect(single.exclusionOnlyTMT.toNumber()).toBe(2145);
      expect(mfj.exclusionOnlyTMT.toNumber()).toBe(0);
    });
  });

  // ── Net minimum tax on exclusion items boundaries ─────────

  describe("net minimum tax on exclusion items", () => {
    it("Form 8801 Line 13 - exactly zero when exclusion TMT equals regular tax", () => {
      // Set regular tax = exclusion TMT
      // With AMTI = 210,000, exemption = 85,700, base = 124,300
      // TMT = 124,300 × 0.26 = 32,318
      const result = calculateForm8801(makeInput({
        priorYearRegularTax: d(32318),
      }));
      expect(result.exclusionOnlyTMT.toNumber()).toBe(32318);
      expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(0);
    });

    it("Form 8801 Line 16 - all AMT is deferral when net exclusion min tax is zero", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(8000),
        priorYearRegularTax: d(50000), // regular tax > exclusion TMT → net exclusion = 0
      }));
      expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(0);
      // All $8,000 AMT is attributed to deferral items
      expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(8000);
    });

    it("Form 8801 Line 18 - a negative exclusion adjustment cannot create credit", () => {
      // Make exclusion TMT much higher than regular tax
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(5000),
        priorYearTaxableIncome: d(300000),
        priorYearExclusionItemAdjustments: d(400000),
        priorYearRegularTax: d(40000),
      }));
      // Exclusion-only AMTI = 700,000, very high → large exclusion TMT
      // Net exclusion min tax likely exceeds prior year AMT
      expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(-128698);
      expect(result.creditAllowed.toNumber()).toBe(0);
    });
  });

  // ── Filing status interactions ──────────────────────────────

  describe("filing status interactions", () => {
    it("Form 8801 - QSS uses identical constants to MFJ", () => {
      const mfj = calculateForm8801(makeInput({
        priorYearFilingStatus: "married_filing_jointly",
      }));
      const qss = calculateForm8801(makeInput({
        priorYearFilingStatus: "qualifying_surviving_spouse",
      }));
      expect(mfj.exemption.toNumber()).toBe(qss.exemption.toNumber());
      expect(mfj.amtBaseOnExclusions.toNumber()).toBe(qss.amtBaseOnExclusions.toNumber());
      expect(mfj.exclusionOnlyTMT.toNumber()).toBe(qss.exclusionOnlyTMT.toNumber());
      expect(mfj.creditAllowed.toNumber()).toBe(qss.creditAllowed.toNumber());
    });

    it("Form 8801 - HOH uses single exemption but its own CG thresholds", () => {
      const single = calculateForm8801(makeInput({
        priorYearFilingStatus: "single",
      }));
      const hoh = calculateForm8801(makeInput({
        priorYearFilingStatus: "head_of_household",
      }));
      // Same exemption
      expect(hoh.exemption.toNumber()).toBe(single.exemption.toNumber());
      // Same AMT base and TMT (since no CG involved)
      expect(hoh.exclusionOnlyTMT.toNumber()).toBe(single.exclusionOnlyTMT.toNumber());
    });

    it("Form 8801 - HOH uses different 0% CG threshold than single in Part III", () => {
      const single = calculateForm8801(makeInput({
        priorYearFilingStatus: "single",
        priorYearTaxableIncome: d(140700),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(100000),
      }));
      const hoh = calculateForm8801(makeInput({
        priorYearFilingStatus: "head_of_household",
        priorYearTaxableIncome: d(140700),
        priorYearExclusionItemAdjustments: d(0),
        priorYearRegularTax: d(0),
        priorYearQualifiedDividends: d(100000),
      }));
      expect(single.exclusionOnlyTMT.toNumber()).toBe(7301);
      expect(hoh.exclusionOnlyTMT.toNumber()).toBe(4905);
    });
  });

  // ── Zero and extreme values ────────────────────────────────

  describe("zero and extreme values", () => {
    it("Form 8801 - zero prior year AMT with zero carryforward yields zero credit", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(0),
        unusedMinimumTaxCreditCarryforward: d(0),
      }));
      expect(result.totalAvailableCredit.toNumber()).toBe(0);
      expect(result.creditAllowed.toNumber()).toBe(0);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });

    it("Form 8801 - very large carryforward is fully usable against sufficient limitation", () => {
      const result = calculateForm8801(makeInput({
        priorYearAMT: d(0),
        unusedMinimumTaxCreditCarryforward: d(100000),
        currentYearRegularTaxBeforeCredits: d(200000),
        currentYearTMT: d(50000),
      }));
      expect(result.totalAvailableCredit.toNumber()).toBe(100000);
      expect(result.currentYearLimitation.toNumber()).toBe(150000);
      expect(result.creditAllowed.toNumber()).toBe(100000);
      expect(result.carryforwardToNextYear.toNumber()).toBe(0);
    });

    it("Form 8801 - zero exclusion items means all AMT is from deferral (maximum credit)", () => {
      const result = calculateForm8801(makeInput({
        priorYearExclusionItemAdjustments: d(0),
        priorYearAMT: d(15000),
        priorYearRegularTax: d(40000),
      }));
      // Exclusion-only AMTI = taxable income = 200,000
      // Exemption = 85,700 (below threshold)
      // AMT base = 114,300
      // TMT = 114,300 × 0.26 = 29,718
      // Net exclusion min tax = max(0, 29,718 - 40,000) = 0
      // Min tax credit = 15,000 - 0 = 15,000 (full AMT)
      expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(0);
      expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(15000);
    });
  });
});

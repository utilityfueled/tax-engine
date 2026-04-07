/**
 * Form 8801 — Credit for Prior Year Minimum Tax
 * Spec: spec/federal/form-8801.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8801 } from "@/engine/forms/form-8801.js";
import type { Form8801Input } from "@/engine/forms/form-8801.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: Partial<Form8801Input> = {}): Form8801Input {
  // Default: single filer with $10,000 SALT add-back as only exclusion item,
  // $5,000 depreciation adjustment as deferral item.
  // Prior year taxable income = $200,000
  // Exclusion-only AMTI = 200,000 + 10,000 = $210,000
  return {
    priorYearFilingStatus: "single",
    priorYearTaxableIncome: d(200000),
    priorYearExclusionItemAdjustments: d(10000), // SALT add-back
    priorYearAMT: d(500),
    priorYearRegularTax: d(35000),
    unusedMinimumTaxCreditCarryforward: d(0),
    currentYearRegularTaxBeforeCredits: d(40000),
    currentYearTMT: d(35000),
    ...overrides,
  };
}

describe("Form 8801", () => {
  // ── Part I: Net Minimum Tax on Exclusion Items ─────────

  it("Part I Line 3 - exclusion-only AMTI equals taxable income plus exclusion items", () => {
    const result = calculateForm8801(makeInput());
    // TI 200,000 + exclusion 10,000 = 210,000
    expect(result.exclusionOnlyAMTI.toNumber()).toBe(210000);
  });

  it("Part I Line 3 - exclusion-only AMTI when no exclusion items equals taxable income", () => {
    const result = calculateForm8801(makeInput({
      priorYearExclusionItemAdjustments: d(0),
    }));
    expect(result.exclusionOnlyAMTI.toNumber()).toBe(200000);
  });

  it("Part I Line 3 - exclusion-only AMTI includes all exclusion items", () => {
    const result = calculateForm8801(makeInput({
      priorYearExclusionItemAdjustments: d(25000),
    }));
    expect(result.exclusionOnlyAMTI.toNumber()).toBe(225000);
  });

  // ── Part I Lines 5-9: Exemption ──────────────────────────

  it("Part I Line 9 - full exemption for single filer below phase-out", () => {
    // Exclusion-only AMTI = 210,000, well below 609,350 phase-out threshold
    const result = calculateForm8801(makeInput());
    expect(result.exemption.toNumber()).toBe(85700); // 2024 single exemption
  });

  it("Part I Line 9 - exemption phases out at 25 cents per dollar over threshold", () => {
    // Exclusion-only AMTI = 300,000 + 400,000 = 700,000 for single filer
    // Excess over threshold: 700,000 - 609,350 = 90,650
    // Reduction: 90,650 × 0.25 = 22,662.50 → rounds to 22,663
    // Exemption: 85,700 - 22,663 = 63,037
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(300000),
      priorYearExclusionItemAdjustments: d(400000),
    }));
    expect(result.exemption.toNumber()).toBe(63037);
  });

  it("Part I Line 9 - exemption fully phases out for very high AMTI", () => {
    // Exclusion-only AMTI = 500,000 + 500,000 = 1,000,000 for single filer
    // Excess: 1,000,000 - 609,350 = 390,650
    // Reduction: 390,650 × 0.25 = 97,662.50 → rounds to 97,663
    // Exemption: max(0, 85,700 - 97,663) = 0
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(500000),
      priorYearExclusionItemAdjustments: d(500000),
    }));
    expect(result.exemption.toNumber()).toBe(0);
  });

  it("Part I Line 9 - MFJ uses higher exemption and threshold", () => {
    // MFJ exemption = 133,300; phase-out threshold = 1,218,700
    // Exclusion-only AMTI = 490,000 + 10,000 = 500,000 → well below threshold
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "married_filing_jointly",
      priorYearTaxableIncome: d(490000),
      priorYearExclusionItemAdjustments: d(10000),
    }));
    expect(result.exemption.toNumber()).toBe(133300);
  });

  it("Part I Line 9 - MFS uses lowest exemption and threshold", () => {
    // MFS exemption = 66,650; phase-out threshold = 609,350
    // Exclusion-only AMTI = 210,000 → below threshold
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "married_filing_separately",
    }));
    expect(result.exemption.toNumber()).toBe(66650);
  });

  // ── Part I Lines 10-11: TMT on exclusion items ──────────

  it("Part I Line 11 - TMT uses 26 percent rate below breakpoint", () => {
    // Exclusion-only AMTI = 210,000; exemption = 85,700
    // AMT base = 210,000 - 85,700 = 124,300
    // All within 26% bracket ($232,600 for single)
    // TMT = 124,300 × 0.26 = 32,318
    const result = calculateForm8801(makeInput());
    expect(result.exclusionOnlyTMT.toNumber()).toBe(32318);
  });

  it("Part I Line 11 - TMT uses 26 percent and 28 percent rates with prior year breakpoint", () => {
    // Single filer, exclusion-only AMTI = 100,000 + 400,000 = 500,000, exemption = 85,700
    // AMT base = 500,000 - 85,700 = 414,300
    // 26% on first $232,600 = 60,476
    // 28% on 414,300 - 232,600 = 181,700 → 50,876
    // TMT = 60,476 + 50,876 = 111,352
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(100000),
      priorYearExclusionItemAdjustments: d(400000),
    }));
    expect(result.exclusionOnlyTMT.toNumber()).toBe(111352);
  });

  it("Part I Line 11 - MFS uses lower 26/28 breakpoint", () => {
    // MFS filer, exclusion-only AMTI = 200,000 + 200,000 = 400,000
    // Exemption = 66,650 (below phase-out at 609,350)
    // AMT base = 400,000 - 66,650 = 333,350
    // 26% on first $116,300 = 30,238
    // 28% on 333,350 - 116,300 = 217,050 → 60,774
    // TMT = 30,238 + 60,774 = 91,012
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "married_filing_separately",
      priorYearTaxableIncome: d(200000),
      priorYearExclusionItemAdjustments: d(200000),
    }));
    expect(result.exclusionOnlyTMT.toNumber()).toBe(91012);
  });

  // ── Part I Line 12-13: Net minimum tax on exclusion items ─

  it("Part I Line 13 - net minimum tax on exclusion items is TMT minus regular tax floored at zero", () => {
    // TMT on exclusion items = 32,318; regular tax = 35,000
    // Net = max(0, 32,318 - 35,000) = 0
    const result = calculateForm8801(makeInput());
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(0);
  });

  it("Part I Line 13 - net minimum tax positive when exclusion TMT exceeds regular tax", () => {
    const result = calculateForm8801(makeInput({
      priorYearRegularTax: d(20000),
    }));
    // TMT = 32,318; regular tax = 20,000
    // Net = max(0, 32,318 - 20,000) = 12,318
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(12318);
  });

  // ── Part II: Minimum Tax Credit and Carryforward ──────────

  it("Part II Line 16 - minimum tax credit equals prior year AMT minus net exclusion-item AMT", () => {
    // Prior year AMT = 500; net min tax on exclusion items = 0
    // Credit from prior year = max(0, 500 - 0) = 500
    const result = calculateForm8801(makeInput());
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(500);
  });

  it("Part II Line 16 - minimum tax credit is zero when all AMT was from exclusion items", () => {
    // Prior year AMT = 500; net min tax on exclusion items = 12,318
    // Credit = max(0, 500 - 12,318) = 0
    const result = calculateForm8801(makeInput({
      priorYearRegularTax: d(20000),
      priorYearAMT: d(500),
    }));
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(0);
  });

  it("Part II Line 18 - carryforward adds to current-year available credit", () => {
    const result = calculateForm8801(makeInput({
      unusedMinimumTaxCreditCarryforward: d(3000),
    }));
    // Credit from prior year = 500; carryforward = 3,000
    // Total available = 500 + 3,000 = 3,500
    expect(result.totalAvailableCredit.toNumber()).toBe(3500);
  });

  it("Part II Line 24 - current year limitation is regular tax minus TMT", () => {
    // Regular tax = 40,000; TMT = 35,000
    // Limitation = max(0, 40,000 - 35,000) = 5,000
    const result = calculateForm8801(makeInput());
    expect(result.currentYearLimitation.toNumber()).toBe(5000);
  });

  it("Part II Line 24 - limitation is zero when TMT exceeds regular tax", () => {
    const result = calculateForm8801(makeInput({
      currentYearRegularTaxBeforeCredits: d(30000),
      currentYearTMT: d(35000),
    }));
    expect(result.currentYearLimitation.toNumber()).toBe(0);
  });

  it("Part II Line 25 - credit is limited to current year limitation", () => {
    // Available credit = 500; limitation = 5,000 → credit = 500
    const result = calculateForm8801(makeInput());
    expect(result.creditAllowed.toNumber()).toBe(500);
  });

  it("Part II Line 25 - credit limited when available exceeds limitation", () => {
    const result = calculateForm8801(makeInput({
      unusedMinimumTaxCreditCarryforward: d(10000),
      currentYearRegularTaxBeforeCredits: d(40000),
      currentYearTMT: d(37000),
    }));
    // Available = 500 + 10,000 = 10,500
    // Limitation = 40,000 - 37,000 = 3,000
    // Credit = min(10,500, 3,000) = 3,000
    expect(result.creditAllowed.toNumber()).toBe(3000);
  });

  it("Part II Line 26 - unused credit carries forward to next year", () => {
    const result = calculateForm8801(makeInput({
      unusedMinimumTaxCreditCarryforward: d(10000),
      currentYearRegularTaxBeforeCredits: d(40000),
      currentYearTMT: d(37000),
    }));
    // Available = 10,500; credit used = 3,000
    // Carryforward = 10,500 - 3,000 = 7,500
    expect(result.carryforwardToNextYear.toNumber()).toBe(7500);
  });

  it("Part II Line 26 - no carryforward when full credit is used", () => {
    const result = calculateForm8801(makeInput({
      unusedMinimumTaxCreditCarryforward: d(0),
      currentYearRegularTaxBeforeCredits: d(50000),
      currentYearTMT: d(30000),
    }));
    // Available = 500; limitation = 20,000
    // Credit = 500; carryforward = 0
    expect(result.creditAllowed.toNumber()).toBe(500);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  // ── Integration scenarios ────────────────────────────────

  it("ISO exercise scenario - deferral-heavy AMT generates full credit when exclusion AMT is zero", () => {
    // Prior year: standard-deduction filer who exercised ISOs.
    // TI 150,000; no exclusion items (standard deduction, no SALT add-back).
    // ISO caused AMT deferral, but exclusion-only AMTI = just TI = 150,000.
    // Exemption = 85,700 (below phase-out); AMT base = 150,000 - 85,700 = 64,300
    // TMT = 64,300 × 0.26 = 16,718
    // Regular tax = 25,000; net min tax on exclusion = max(0, 16,718 - 25,000) = 0
    // Prior year AMT = 8,000
    // Credit from prior year = max(0, 8,000 - 0) = 8,000
    // Current year: regular tax = 30,000; TMT = 22,000
    // Limitation = 8,000; credit = min(8,000, 8,000) = 8,000
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "single",
      priorYearTaxableIncome: d(150000),
      priorYearExclusionItemAdjustments: d(0),
      priorYearAMT: d(8000),
      priorYearRegularTax: d(25000),
      unusedMinimumTaxCreditCarryforward: d(0),
      currentYearRegularTaxBeforeCredits: d(30000),
      currentYearTMT: d(22000),
    }));
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(8000);
    expect(result.creditAllowed.toNumber()).toBe(8000);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  it("Mixed exclusion/deferral scenario - only deferral portion generates credit", () => {
    // TI = 300,000; SALT exclusion = 10,000
    // Exclusion-only AMTI = 300,000 + 10,000 = 310,000
    // Exemption = 85,700 (below phase-out at 609,350)
    // AMT base = 310,000 - 85,700 = 224,300
    // TMT = 224,300 × 0.26 = 58,318
    // Regular tax = 55,000; net min tax on exclusion = max(0, 58,318 - 55,000) = 3,318
    // Prior year AMT = 7,000
    // Credit from prior year = max(0, 7,000 - 3,318) = 3,682
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "single",
      priorYearTaxableIncome: d(300000),
      priorYearExclusionItemAdjustments: d(10000),
      priorYearAMT: d(7000),
      priorYearRegularTax: d(55000),
      unusedMinimumTaxCreditCarryforward: d(0),
      currentYearRegularTaxBeforeCredits: d(60000),
      currentYearTMT: d(50000),
    }));
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(3318);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(3682);
    expect(result.currentYearLimitation.toNumber()).toBe(10000);
    expect(result.creditAllowed.toNumber()).toBe(3682);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  it("Multi-year carryforward scenario - prior year credit plus carryforward partially used", () => {
    // Prior year AMT = 2,000 all from deferral → credit = 2,000
    // Carryforward from earlier years = 5,000
    // Total available = 7,000
    // Current year limitation = 4,000
    // Credit used = 4,000; carryforward = 3,000
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "single",
      priorYearTaxableIncome: d(200000),
      priorYearExclusionItemAdjustments: d(0),
      priorYearAMT: d(2000),
      priorYearRegularTax: d(35000),
      unusedMinimumTaxCreditCarryforward: d(5000),
      currentYearRegularTaxBeforeCredits: d(39000),
      currentYearTMT: d(35000),
    }));
    expect(result.totalAvailableCredit.toNumber()).toBe(7000);
    expect(result.currentYearLimitation.toNumber()).toBe(4000);
    expect(result.creditAllowed.toNumber()).toBe(4000);
    expect(result.carryforwardToNextYear.toNumber()).toBe(3000);
  });

  it("Zero AMT scenario - no prior year AMT means no credit", () => {
    const result = calculateForm8801(makeInput({
      priorYearAMT: d(0),
      unusedMinimumTaxCreditCarryforward: d(0),
    }));
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(0);
    expect(result.totalAvailableCredit.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  it("Carryforward-only scenario - no prior year AMT but carryforward exists", () => {
    const result = calculateForm8801(makeInput({
      priorYearAMT: d(0),
      unusedMinimumTaxCreditCarryforward: d(8000),
      currentYearRegularTaxBeforeCredits: d(50000),
      currentYearTMT: d(45000),
    }));
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(0);
    expect(result.totalAvailableCredit.toNumber()).toBe(8000);
    expect(result.currentYearLimitation.toNumber()).toBe(5000);
    expect(result.creditAllowed.toNumber()).toBe(5000);
    expect(result.carryforwardToNextYear.toNumber()).toBe(3000);
  });

  it("MFJ high-income scenario with partial exemption phase-out", () => {
    // MFJ filer, TI = 1,200,000, exclusion items = 100,000
    // Exclusion-only AMTI = 1,200,000 + 100,000 = 1,300,000
    // Phase-out threshold = 1,218,700; exemption = 133,300
    // Excess = 1,300,000 - 1,218,700 = 81,300
    // Reduction = 81,300 × 0.25 = 20,325
    // Exemption = 133,300 - 20,325 = 112,975
    // AMT base = 1,300,000 - 112,975 = 1,187,025
    // 26% on 232,600 = 60,476; 28% on 954,425 = 267,239
    // TMT = 327,715
    // Regular tax = 300,000; net min tax on exclusion = 327,715 - 300,000 = 27,715
    // Prior year AMT = 40,000
    // Credit = 40,000 - 27,715 = 12,285
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "married_filing_jointly",
      priorYearTaxableIncome: d(1200000),
      priorYearExclusionItemAdjustments: d(100000),
      priorYearAMT: d(40000),
      priorYearRegularTax: d(300000),
      unusedMinimumTaxCreditCarryforward: d(0),
      currentYearRegularTaxBeforeCredits: d(320000),
      currentYearTMT: d(300000),
    }));
    expect(result.exemption.toNumber()).toBe(112975);
    expect(result.exclusionOnlyTMT.toNumber()).toBe(327715);
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(27715);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(12285);
    expect(result.creditAllowed.toNumber()).toBe(12285);
  });

  it("QSS filing status uses MFJ constants", () => {
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "qualifying_surviving_spouse",
      priorYearTaxableIncome: d(200000),
      priorYearExclusionItemAdjustments: d(10000),
    }));
    // QSS exemption = 133,300 (same as MFJ)
    expect(result.exemption.toNumber()).toBe(133300);
  });

  it("HOH filing status uses single constants", () => {
    const result = calculateForm8801(makeInput({
      priorYearFilingStatus: "head_of_household",
    }));
    expect(result.exemption.toNumber()).toBe(85700);
  });

  // ── Part III: Capital Gains Rate Recomputation ──────────

  it("Part III - capital gains rates produce lower TMT when prior year had qualified dividends", () => {
    // Single filer, exclusion-only AMTI = 200,000 + 10,000 = 210,000
    // Exemption = 85,700; AMT base = 124,300
    // Flat TMT (Line 11) = 124,300 × 0.26 = 32,318
    //
    // Part III with $30,000 prior year qualified dividends:
    //   Preferential = min(124,300, 30,000 + 0) = 30,000
    //   Ordinary = 124,300 - 30,000 = 94,300
    //   Ordinary TMT = 94,300 × 0.26 = 24,518
    //   Preferential TMT: stack from ordinary portion = 0 (below 47,025 threshold)
    //     → 0% room = 47,025 - 0 = 47,025; all 30,000 at 0% → $0
    //     Wait — the ordinary portion (94,300) IS the base of the stack.
    //     Stack = 94,300 (ordinary) then preferential on top:
    //     0% threshold = 47,025; stack is at 94,300 > 47,025 → no room at 0%
    //     15% threshold = 518,900; room at 15% = 518,900 - 94,300 = 424,600
    //     30,000 at 15% = 4,500
    //   Total Part III TMT = 24,518 + 4,500 = 29,018
    //   lesser of 32,318 and 29,018 = 29,018
    //
    // Without Part III: net min tax on exclusion = max(0, 32,318 - 35,000) = 0
    // With Part III: net min tax on exclusion = max(0, 29,018 - 35,000) = 0
    // No difference in this case because regular tax exceeds both TMTs.
    // Let's use a scenario where it matters.

    // Better scenario: regular tax = 28,000 (lower than flat TMT)
    // Without Part III: net min tax = max(0, 32,318 - 28,000) = 4,318
    // With Part III: net min tax = max(0, 29,018 - 28,000) = 1,018
    // Prior year AMT = 10,000
    // Without Part III: credit = 10,000 - 4,318 = 5,682
    // With Part III: credit = 10,000 - 1,018 = 8,982
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(200000),
      priorYearExclusionItemAdjustments: d(10000),
      priorYearAMT: d(10000),
      priorYearRegularTax: d(28000),
      priorYearQualifiedDividends: d(30000),
      currentYearRegularTaxBeforeCredits: d(40000),
      currentYearTMT: d(30000),
    }));
    // Part III should produce lower TMT → higher credit
    expect(result.exclusionOnlyTMT.toNumber()).toBe(29018);
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(1018);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(8982);
  });

  it("Part III - no change when no prior year capital gains or qualified dividends", () => {
    // Without Part III inputs, Line 11 (flat rates) should be unchanged
    const result = calculateForm8801(makeInput({
      priorYearAMT: d(10000),
      priorYearRegularTax: d(28000),
    }));
    // Flat TMT = 32,318
    expect(result.exclusionOnlyTMT.toNumber()).toBe(32318);
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(4318);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(5682);
  });

  it("Part III - AMT base entirely within 0% bracket produces zero TMT on preferential income", () => {
    // Single filer, TI = 30,000, exclusion items = 5,000
    // Exclusion-only AMTI = 35,000; exemption = 85,700 → AMT base = 0
    // TMT = 0 regardless of Part III (AMT base is zero)
    // Let's make AMT base small enough to be within 0% CG bracket
    //
    // TI = 80,000, exclusion = 15,000, AMTI = 95,000, exemption = 85,700
    // AMT base = 9,300
    // Flat TMT = 9,300 × 0.26 = 2,418
    //
    // Part III with $9,300 qualified dividends (all preferential):
    //   Ordinary = 0; preferential = 9,300
    //   Stack starts at 0. 0% threshold = 47,025.
    //   All 9,300 at 0% → $0
    //   Part III TMT = 0
    //   lesser of 2,418 and 0 = 0
    //
    // Regular tax = 10,000
    // Without Part III: net min tax = max(0, 2,418 - 10,000) = 0
    // With Part III: net min tax = max(0, 0 - 10,000) = 0
    // Same result (regular tax dominates), but let's test with lower regular tax
    //
    // Regular tax = 1,000
    // Without Part III: net min tax = max(0, 2,418 - 1,000) = 1,418
    // With Part III: net min tax = max(0, 0 - 1,000) = 0
    // AMT = 3,000
    // Without: credit = 3,000 - 1,418 = 1,582
    // With: credit = 3,000 - 0 = 3,000
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(80000),
      priorYearExclusionItemAdjustments: d(15000),
      priorYearAMT: d(3000),
      priorYearRegularTax: d(1000),
      priorYearQualifiedDividends: d(9300),
      currentYearRegularTaxBeforeCredits: d(20000),
      currentYearTMT: d(15000),
    }));
    expect(result.exclusionOnlyTMT.toNumber()).toBe(0);
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(0);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(3000);
  });

  it("Part III - unrecaptured section 1250 gain uses 25% max rate", () => {
    // Single, TI = 200,000, exclusion = 10,000
    // AMTI = 210,000; exemption = 85,700; AMT base = 124,300
    // Flat TMT = 32,318
    //
    // Part III with $20,000 LTCG of which $15,000 is §1250:
    //   Preferential = min(124,300, 0 + 20,000) = 20,000
    //   Ordinary = 104,300
    //   Ordinary TMT = 104,300 × 0.26 = 27,118
    //   Preferential stack: base at 104,300
    //     0% room = 47,025 - 104,300 = negative → 0
    //     15% room = 518,900 - 104,300 = 414,600
    //     All preferential above 15%? No, 104,300 < 518,900
    //     So all 20,000 at 15% = 3,000
    //     Wait — but §1250 has 25% max rate. The 15% rate is LOWER than 25%,
    //     so the 15% rate applies (max rate is a ceiling, not a floor).
    //   Total Part III TMT = 27,118 + 3,000 = 30,118
    //   lesser of 32,318 and 30,118 = 30,118
    //
    // Let's test with income high enough that §1250 hits the above-15% zone:
    // TI = 500,000, exclusion = 100,000
    // AMTI = 600,000; exemption phase-out: excess = 600,000 - 609,350 = 0 (below)
    // Exemption = 85,700; AMT base = 514,300
    // Flat TMT: 26% on 232,600 = 60,476; 28% on 281,700 = 78,876 → total = 139,352
    //
    // Part III with $50,000 LTCG ($30,000 is §1250):
    //   Preferential = min(514,300, 50,000) = 50,000
    //   Ordinary = 464,300
    //   Ordinary TMT: 26% on 232,600 = 60,476; 28% on 231,700 = 64,876 → 125,352
    //   Preferential stack: base at 464,300
    //     0%: 47,025 < 464,300 → 0
    //     15%: 518,900 - 464,300 = 54,600 room. 50,000 at 15% = 7,500
    //     All within 15% bracket since 50,000 < 54,600
    //   Total Part III TMT = 125,352 + 7,500 = 132,852
    //   lesser of 139,352 and 132,852 = 132,852
    //
    // But §1250 hasn't hit the 25% zone. Let me push income higher:
    // TI = 500,000, exclusion = 50,000 → AMTI = 550,000
    // Exemption = 85,700; AMT base = 464,300
    // Same as above. The 15% threshold is 518,900 for single.
    // Need ordinary portion > 518,900 for §1250 to hit 25% zone.
    //
    // Let's use: TI = 500,000, exclusion = 200,000 → AMTI = 700,000
    // Phase-out: 700,000 - 609,350 = 90,650; reduction = 22,663
    // Exemption = 85,700 - 22,663 = 63,037
    // AMT base = 700,000 - 63,037 = 636,963
    // Flat TMT: 26% on 232,600 = 60,476; 28% on 404,363 = 113,222 → 173,698
    //
    // Part III with $40,000 LTCG ($25,000 §1250):
    //   Preferential = min(636,963, 40,000) = 40,000
    //   Ordinary = 596,963
    //   Ordinary TMT: 26% on 232,600 = 60,476; 28% on 364,363 = 102,022 → 162,498
    //   Preferential stack: base at 596,963
    //     0%: 47,025 < 596,963 → 0
    //     15%: 518,900 < 596,963 → 0 room at 15%
    //     Above 15%: all 40,000 above threshold
    //       28% collectibles: 0
    //       25% §1250: min(25,000, 40,000) = 25,000 at 25% = 6,250
    //       20%: 40,000 - 25,000 = 15,000 at 20% = 3,000
    //   Total Part III TMT = 162,498 + 6,250 + 3,000 = 171,748
    //   lesser of 173,698 and 171,748 = 171,748
    //
    // Regular tax = 160,000
    // Without Part III: net min tax = max(0, 173,698 - 160,000) = 13,698
    // With Part III: net min tax = max(0, 171,748 - 160,000) = 11,748
    // AMT = 20,000
    // Without: credit = 20,000 - 13,698 = 6,302
    // With: credit = 20,000 - 11,748 = 8,252
    const result = calculateForm8801(makeInput({
      priorYearTaxableIncome: d(500000),
      priorYearExclusionItemAdjustments: d(200000),
      priorYearAMT: d(20000),
      priorYearRegularTax: d(160000),
      priorYearNetLTCG: d(40000),
      priorYearUnrecapturedSection1250Gain: d(25000),
      currentYearRegularTaxBeforeCredits: d(180000),
      currentYearTMT: d(165000),
    }));
    expect(result.exclusionOnlyTMT.toNumber()).toBe(171748);
    expect(result.netMinTaxOnExclusionItems.toNumber()).toBe(11748);
    expect(result.minTaxCreditFromPriorYear.toNumber()).toBe(8252);
  });

  it("Part III - Part III TMT never exceeds flat TMT (lesser-of check)", () => {
    // Edge case: extremely small preferential amount where the CG rate
    // computation happens to be >= flat rate (should not increase TMT).
    // This is guaranteed by the min() check, but worth testing.
    const result = calculateForm8801(makeInput({
      priorYearAMT: d(10000),
      priorYearRegularTax: d(28000),
      priorYearQualifiedDividends: d(100), // tiny amount
    }));
    // Flat TMT = 32,318
    // Part III TMT must be <= 32,318
    expect(result.exclusionOnlyTMT.toNumber()).toBeLessThanOrEqual(32318);
  });

  it("Part III - combined qualified dividends and LTCG both reduce TMT", () => {
    // Single, TI = 200,000, exclusion = 10,000
    // AMT base = 124,300; Flat TMT = 32,318
    //
    // Part III with $20,000 QD + $10,000 LTCG = $30,000 preferential:
    //   Same as first Part III test → TMT = 29,018
    const result = calculateForm8801(makeInput({
      priorYearAMT: d(10000),
      priorYearRegularTax: d(28000),
      priorYearQualifiedDividends: d(20000),
      priorYearNetLTCG: d(10000),
      currentYearRegularTaxBeforeCredits: d(40000),
      currentYearTMT: d(30000),
    }));
    expect(result.exclusionOnlyTMT.toNumber()).toBe(29018);
  });

  // ── Audit trail ──────────────────────────────────────────

  it("produces audit trail lines for all key calculations", () => {
    const result = calculateForm8801(makeInput());
    expect(result.lines.length).toBeGreaterThan(0);
    const lineIds = result.lines.map(l => l.line);
    expect(lineIds).toContain("3");  // Exclusion-only AMTI
    expect(lineIds).toContain("9");  // Exemption
    expect(lineIds).toContain("11"); // TMT on exclusion items
    expect(lineIds).toContain("13"); // Net min tax on exclusion items
    expect(lineIds).toContain("16"); // Min tax credit from prior year
    expect(lineIds).toContain("25"); // Credit allowed
    expect(lineIds).toContain("26"); // Carryforward
  });
});

/**
 * Edge case tests for Form 8615 — Tax for Certain Children Who Have Unearned Income (Kiddie Tax).
 * Spec: spec/federal/form-8615.yaml
 *
 * Tests boundary conditions for:
 * - Threshold boundaries ($2,700 non-itemizing, $1,350 itemizing)
 * - Parent bracket boundary crossings
 * - Sibling allocation edge cases
 * - QDCG absorption between Lines 5 and 6
 * - Line 18 max(tentative, child's own rate) selection
 * - Zero and extreme values
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8615 } from "@/engine/forms/form-8615.js";
import type { Form8615Input } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { calculateTaxFromBrackets, calculateCapitalGainsTax } from "@/utils/tax-math.js";

const constants = getConstants(2025);

function makeInput(overrides: Partial<Form8615Input> = {}): Form8615Input {
  return {
    childUnearnedIncome: "5000",
    childItemizesDeductions: false,
    childQualifiedDividends: "0",
    childNetLTCG: "0",
    parentTaxableIncome: "150000",
    parentFilingStatus: "married_filing_jointly",
    parentQualifiedDividends: "0",
    parentNetLTCG: "0",
    parentSection1250Gain: "0",
    parentCollectiblesGain: "0",
    otherChildrenNetUnearnedIncome: "0",
    ...overrides,
  };
}

describe("Form 8615 edge cases — threshold boundaries", () => {
  it("Form 8615 Line 3 - $2,700 unearned income exactly at non-itemizing threshold yields zero net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2700" }),
      new Decimal(2700),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.netUnearnedIncome.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8615 Line 3 - $2,699 unearned income $1 below non-itemizing threshold yields zero net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2699" }),
      new Decimal(2699),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.netUnearnedIncome.toNumber()).toBe(0);
  });

  it("Form 8615 Line 3 - $2,701 unearned income $1 above non-itemizing threshold yields $1 net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });

  it("Form 8615 Line 3 - $1,350 unearned income at itemizing threshold yields zero net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "1350", childItemizesDeductions: true }),
      new Decimal(1350),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.netUnearnedIncome.toNumber()).toBe(0);
  });

  it("Form 8615 Line 3 - $1,349 unearned income $1 below itemizing threshold yields zero net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "1349", childItemizesDeductions: true }),
      new Decimal(1349),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.netUnearnedIncome.toNumber()).toBe(0);
  });

  it("Form 8615 Line 3 - $1,351 unearned income $1 above itemizing threshold yields $1 net", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "1351", childItemizesDeductions: true }),
      new Decimal(1351),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });
});

describe("Form 8615 edge cases — parent bracket boundary crossing", () => {
  // MFJ 22% bracket ends at $206,700, 24% starts there
  it("Form 8615 Line 13 - child's income pushes parent from 22% to 24% bracket (MFJ at $206,700)", () => {
    // Parent at exactly $206,700 (top of 22% bracket for MFJ)
    // Child's net unearned = 5000 - 2700 = 2300
    // Combined = 206700 + 2300 = 209000 → crosses into 24% bracket
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "206700",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    // Tax on 209000 - Tax on 206700: first $0 at 24% (since 206700 is exact boundary), then 2300 at 24%
    const taxOnCombined = calculateTaxFromBrackets(new Decimal(209000), constants.taxBrackets.married_filing_jointly);
    const taxOnParent = calculateTaxFromBrackets(new Decimal(206700), constants.taxBrackets.married_filing_jointly);
    const expected = taxOnCombined.minus(taxOnParent);
    expect(result.allocableParentalTax.toNumber()).toBe(expected.toNumber());
    // At 24%, allocable tax should be 2300 * 0.24 = 552
    expect(result.allocableParentalTax.toNumber()).toBe(552);
  });

  it("Form 8615 Line 13 - child's income stays within parent's bracket (MFJ at $100,000 in 22%)", () => {
    // Parent at $100,000 MFJ → 22% bracket (96,950 - 206,700)
    // Net unearned = 2300, combined = 102,300 → still in 22%
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "100000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );
    // Allocable tax should be 2300 * 0.22 = 506
    expect(result.allocableParentalTax.toNumber()).toBe(506);
  });

  // Single 12% bracket ends at $48,475, 22% starts there
  it("Form 8615 Line 13 - child's income pushes single parent from 12% to 22% bracket", () => {
    // Parent at exactly $48,475 (top of 12% bracket for single)
    // Net unearned = 5000 - 2700 = 2300
    // Combined = 50,775 → 2300 all in 22% bracket
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "48475",
        parentFilingStatus: "single",
      }),
      new Decimal(5000),
      "single",
      constants
    );
    // All 2300 at 22% = 506
    expect(result.allocableParentalTax.toNumber()).toBe(506);
  });

  it("Form 8615 Line 13 - child's income straddles two brackets for single parent", () => {
    // Parent at $47,475 single → $1,000 below 22% boundary ($48,475)
    // Net unearned = 2300, combined = 49,775
    // First $1,000 at 12%, remaining $1,300 at 22%
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "47475",
        parentFilingStatus: "single",
      }),
      new Decimal(5000),
      "single",
      constants
    );
    // $1000 * 0.12 + $1300 * 0.22 = 120 + 286 = 406
    expect(result.allocableParentalTax.toNumber()).toBe(406);
  });
});

describe("Form 8615 edge cases — parent with zero or very low income", () => {
  it("Form 8615 Line 13 - parent with zero taxable income means child's income taxed from bottom bracket", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "0",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );
    // Net unearned = 2300, combined = 0 + 2300 = 2300
    // Published2025 MFJ2300–2325 table row=231.
    // Tax on 0 MFJ = 0
    // Allocable = 231
    expect(result.allocableParentalTax.toNumber()).toBe(231);
  });

  it("Form 8615 Line 18 - low-income parent can cause child's own rate to exceed tentative tax", () => {
    // Parent: $0 MFJ → 10% bracket
    // Child: $50,000 unearned income, taxable = $50,000
    // Net unearned = 50000 - 2700 = 47300
    // Published MFJ47300–47350 row5202; parent zero tax gives5202allocable.
    // Line 5 = min(47300, 50000) = 47300
    // Line 6 = 50000 - 47300 = 2700
    // Line15 uses single2700–2725 row271; line16=5202+271=5473.
    // Line17 uses single50000–50050 row5920, so line18=max(5473,5920)=5920.
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "50000",
        parentTaxableIncome: "0",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(50000),
      "single",
      constants
    );
    expect(result.tax.toNumber()).toBe(result.taxAtChildOwnRate.toNumber());
    expect(result.tax.toString()).toBe("5920");
    expect(result.taxAtChildOwnRate.greaterThan(result.tentativeTax)).toBe(true);
  });
});

describe("Form 8615 edge cases — sibling allocation", () => {
  it("Form 8615 Lines 8-14 - two siblings with equal net unearned income split allocable tax 50/50", () => {
    // This child: net unearned = 5000 - 2700 = 2300
    // Other sibling: also 2300
    // Total Line 9 = 4600
    // This child's share = allocable_tax * (2300 / 4600) = 50%
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
        otherChildrenNetUnearnedIncome: "2300",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    // Line 9 = 2300 + 2300 = 4600
    // At $200K single parent (24% bracket): allocable = 4600 * 0.24 = 1104
    const taxOnCombined = calculateTaxFromBrackets(new Decimal(204600), constants.taxBrackets.single);
    const taxOnParent = calculateTaxFromBrackets(new Decimal(200000), constants.taxBrackets.single);
    const allocable = taxOnCombined.minus(taxOnParent);
    const expectedShare = allocable.dividedBy(2).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.childShareOfParentalTax.toNumber()).toBe(expectedShare.toNumber());
  });

  it("Form 8615 Lines 8-14 - three siblings with different amounts allocate proportionally", () => {
    // This child: net unearned = 10000 - 2700 = 7300
    // Other siblings combined: 12700
    // Total = 7300 + 12700 = 20000
    // This child's share = allocable * (7300 / 20000) = 36.5%
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "300000",
        parentFilingStatus: "single",
        otherChildrenNetUnearnedIncome: "12700",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    const line9 = new Decimal(7300 + 12700); // 20000
    const taxOnCombined = calculateTaxFromBrackets(new Decimal(320000), constants.taxBrackets.single);
    const taxOnParent = calculateTaxFromBrackets(new Decimal(300000), constants.taxBrackets.single);
    const allocable = taxOnCombined.minus(taxOnParent);
    const expectedShare = allocable.times(7300).dividedBy(20000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.childShareOfParentalTax.toNumber()).toBe(expectedShare.toNumber());
    expect(result.childShareOfParentalTax.lessThan(result.allocableParentalTax)).toBe(true);
  });

  it("Form 8615 Line 14 - siblings whose combined income crosses a bracket boundary", () => {
    // Parent at $206,000 MFJ (22% bracket, $700 below 24% boundary at $206,700)
    // This child: net unearned = 7300
    // Other siblings: 3000
    // Total = 10300
    // Combined = 206000 + 10300 = 216300 → crosses from 22% to 24%
    // First $700 at 22%, remaining $9600 at 24%
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "206000",
        parentFilingStatus: "married_filing_jointly",
        otherChildrenNetUnearnedIncome: "3000",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    const taxOnCombined = calculateTaxFromBrackets(new Decimal(216300), constants.taxBrackets.married_filing_jointly);
    const taxOnParent = calculateTaxFromBrackets(new Decimal(206000), constants.taxBrackets.married_filing_jointly);
    const expectedAllocable = taxOnCombined.minus(taxOnParent);
    expect(result.allocableParentalTax.toNumber()).toBe(expectedAllocable.toNumber());
    // $700 * 0.22 + $9600 * 0.24 = 154 + 2304 = 2458
    expect(result.allocableParentalTax.toNumber()).toBe(2458);
  });
});

describe("Form 8615 edge cases — QDCG absorption between Lines 5 and 6", () => {
  it("Form 8615 Line 15 - child QD exactly equals Line 5 so no QD flows to Line 6", () => {
    // Child: $5000 unearned (all QD), taxable = $5000
    // Net unearned = 5000 - 2700 = 2300
    // Line 5 = 2300
    // QD absorbed by Line 5 = min(2300, 2300) = 2300 (QD = net unearned portion)
    // Wait: childQualifiedDividends = 2300, childUnearnedIncome = 5000
    // QD absorbed by Line 5 = min(2300, 2300) = 2300 → all absorbed
    // QD on Line 6 = 0
    // Line 6 = 5000 - 2300 = 2700
    // Line15 uses the published single2700–2725 table row271.
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        childQualifiedDividends: "2300",
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(2700);
    expect(result.taxOnChildRateIncome.toNumber()).toBe(271);
  });

  it("Form 8615 Line 15 - child has only LTCG (no QD), partially absorbed by Line 5", () => {
    // Child: $10000 unearned, $6000 LTCG, taxable = $10000
    // Net unearned = 10000 - 2700 = 7300
    // Line 5 = 7300
    // QD absorbed = 0 (no QD)
    // Remaining Line 5 = 7300
    // LTCG absorbed = min(6000, 7300) = 6000
    // LTCG on Line 6 = 0
    // Line 6 = 10000 - 7300 = 2700
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        childQualifiedDividends: "0",
        childNetLTCG: "6000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(2700);
    // All LTCG is absorbed; published single2700–2725 table row271.
    expect(result.taxOnChildRateIncome.toNumber()).toBe(271);
  });

  it("Form 8615 Line 15 - large child QD overflows Line 5 into Line 6 for QDCG treatment", () => {
    // Child: $10000 unearned, $8000 QD, taxable = $12000
    // Net unearned = 10000 - 2700 = 7300
    // Line 5 = min(7300, 12000) = 7300
    // QD absorbed by Line 5 = min(8000, 7300) = 7300
    // QD on Line 6 = 8000 - 7300 = 700
    // Line 6 = 12000 - 7300 = 4700
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        childQualifiedDividends: "8000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(12000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(4700);
    // Line 6 has $700 QD → QDCG treatment
    const expectedLine15 = calculateCapitalGainsTax(
      new Decimal(4700), new Decimal(700), new Decimal(0), "single", constants
    );
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.tax.toNumber());
  });

  it("Form 8615 Line 15 - both QD and LTCG overflow Line 5 into Line 6", () => {
    // Child: $5000 unearned, $3000 QD, $3000 LTCG, taxable = $8000
    // Net unearned = 5000 - 2700 = 2300
    // Line 5 = min(2300, 8000) = 2300
    // QD absorbed by Line 5 = min(3000, 2300) = 2300
    // QD on Line 6 = 3000 - 2300 = 700
    // Remaining Line 5 after QD = 0
    // LTCG absorbed = min(3000, 0) = 0
    // LTCG on Line 6 = 3000
    // Line 6 = 8000 - 2300 = 5700
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        childQualifiedDividends: "3000",
        childNetLTCG: "3000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(8000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(5700);
    // Line 6 has $700 QD + $3000 LTCG → QDCG treatment
    const expectedLine15 = calculateCapitalGainsTax(
      new Decimal(5700), new Decimal(700), new Decimal(3000), "single", constants
    );
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.tax.toNumber());
  });
});

describe("Form 8615 edge cases — Line 5 cap and Line 6 zero scenarios", () => {
  it("Form 8615 Line 5 - net unearned income exceeds child's taxable income so Line 5 equals taxable", () => {
    // Unearned = $10,000, taxable = $3,000
    // Net unearned = 10000 - 2700 = 7300
    // Line 5 = min(7300, 3000) = 3000
    // Line 6 = 3000 - 3000 = 0
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "10000" }),
      new Decimal(3000),
      "single",
      constants
    );
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(3000);
    expect(result.childRateIncome.toNumber()).toBe(0);
    expect(result.taxOnChildRateIncome.toNumber()).toBe(0);
  });

  it("Form 8615 Line 5 - net unearned income equals child's taxable income exactly", () => {
    // Unearned = $5,000, taxable = $2,300
    // Net unearned = 5000 - 2700 = 2300
    // Line 5 = min(2300, 2300) = 2300
    // Line 6 = 0
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(2300),
      "single",
      constants
    );
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(2300);
    expect(result.childRateIncome.toNumber()).toBe(0);
    expect(result.taxOnChildRateIncome.toNumber()).toBe(0);
  });
});

describe("Form 8615 edge cases — extreme values", () => {
  it("Form 8615 - very large unearned income ($500,000 trust distribution)", () => {
    // Child: $500,000 unearned income from trust
    // Net unearned = 500000 - 2700 = 497300
    // Parent at $400,000 single (32% bracket, crosses to 35% at $250,525)
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "500000",
        parentTaxableIncome: "400000",
        parentFilingStatus: "single",
      }),
      new Decimal(500000),
      "single",
      constants
    );

    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(497300);
    // Combined = 400000 + 497300 = 897300 → well into 37% bracket ($626,350+)
    expect(result.tax.greaterThan(0)).toBe(true);
    // Verify the allocable tax uses the correct combined bracket computation
    const taxOnCombined = calculateTaxFromBrackets(new Decimal(897300), constants.taxBrackets.single);
    const taxOnParent = calculateTaxFromBrackets(new Decimal(400000), constants.taxBrackets.single);
    expect(result.allocableParentalTax.toNumber()).toBe(taxOnCombined.minus(taxOnParent).toNumber());
  });

  it("Form 8615 - parent in 37% bracket ($800,000 single) with child's income entirely at 37%", () => {
    // Parent at $800,000 single → 37% bracket (starts at $626,350)
    // Net unearned = 10000 - 2700 = 7300
    // Combined = 807300 → still in 37%
    // Allocable = 7300 * 0.37 = 2701
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "800000",
        parentFilingStatus: "single",
      }),
      new Decimal(10000),
      "single",
      constants
    );
    expect(result.allocableParentalTax.toNumber()).toBe(2701);
  });
});

describe("Form 8615 edge cases — parent filing status variations", () => {
  it("Form 8615 - qualifying surviving spouse parent uses MFJ brackets", () => {
    const resultQSS = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "qualifying_surviving_spouse",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const resultMFJ = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    // QSS uses same brackets as MFJ
    expect(resultQSS.allocableParentalTax.toNumber()).toBe(resultMFJ.allocableParentalTax.toNumber());
  });

  it("Form 8615 - MFS parent uses MFS brackets (same as single for 2025)", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_separately",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const combined = new Decimal(152300);
    const expectedTax = calculateTaxFromBrackets(combined, constants.taxBrackets.married_filing_separately);
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.value.toNumber()).toBe(expectedTax.toNumber());
  });
});

describe("Form 8615 edge cases — parent with collectibles and section 1250 gain", () => {
  it("Form 8615 Lines 11-12 - parent with collectibles gain uses QDCG computation", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "5000",
        parentNetLTCG: "10000",
        parentSection1250Gain: "3000",
        parentCollectiblesGain: "2000",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    // Verify QDCG computation is used
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.formula).toContain("QDCG");

    // Verify with direct calculation
    const combined = new Decimal(207300); // 200000 + 7300
    const taxCombined = calculateCapitalGainsTax(
      combined, new Decimal(5000), new Decimal(10000),
      "married_filing_jointly", constants,
      { section1250Gain: new Decimal(3000), collectiblesGain: new Decimal(2000) }
    );
    expect(line11?.value.toNumber()).toBe(taxCombined.tax.toNumber());
  });
});

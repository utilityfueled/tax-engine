/**
 * Tests for Form 8615 — Tax for Certain Children Who Have Unearned Income (Kiddie Tax).
 * Spec: spec/federal/form-8615.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8615 } from "@/engine/forms/form-8615.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput, Form8615Input } from "@/models/inputs.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
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

function makeFederalInput(form8615Overrides?: Partial<Form8615Input>, extraInput: Record<string, unknown> = {}): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "single",
      primary: {
        firstName: "Child",
        lastName: "Taxpayer",
        ssn: "999-88-7777",
        dateOfBirth: "2010-03-15",
      },
      address: { street: "123 Main St", city: "Anytown", state: "TX", zip: "75001" },
      dependents: [],
    },
    w2s: [],
    form1099Int: [{ payer: "Bank", interestIncome: "5000" }],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    form1099G: [],
    formW2G: [],
    form1098: [],
    form1095A: [],
    scheduleK1: [],
    donations: [],
    rentalProperties: [],
    savingsBondRedemptions: [],
    form8615: {
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
      ...form8615Overrides,
    },
    ...extraInput,
  } as TaxYearInput;
}

describe("Form 8615 — Tax for Certain Children Who Have Unearned Income", () => {
  // ─── Applicability ─────────────────────────────────────────

  it("Form 8615 applicability - unearned income at or below $2,700 does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2700" }),
      new Decimal(2700),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8615 applicability - unearned income of $2,701 triggers the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });

  it("Form 8615 applicability - zero unearned income does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "0" }),
      new Decimal(0),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
  });

  // ─── Line-by-Line ─────────────────────────────────────────

  it("Form 8615 Line 1 - child's unearned income flows from input", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8000),
      "single",
      constants
    );
    const line1 = result.lines.find(l => l.form === "8615" && l.line === "1");
    expect(line1?.value.toNumber()).toBe(8000);
  });

  it("Form 8615 Line 2 - non-itemizing child uses $2,700 threshold", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000", childItemizesDeductions: false }),
      new Decimal(5000),
      "single",
      constants
    );
    const line2 = result.lines.find(l => l.form === "8615" && l.line === "2");
    expect(line2?.value.toNumber()).toBe(2700);
  });

  it("Form 8615 Line 2 - itemizing child uses $1,350 threshold", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000", childItemizesDeductions: true }),
      new Decimal(5000),
      "single",
      constants
    );
    const line2 = result.lines.find(l => l.form === "8615" && l.line === "2");
    expect(line2?.value.toNumber()).toBe(1350);
    // Net unearned income is higher with the lower threshold
    expect(result.netUnearnedIncome.toNumber()).toBe(3650);
  });

  it("Form 8615 Line 3 - net unearned income is unearned minus threshold", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(5000),
      "single",
      constants
    );
    // 5000 - 2700 = 2300
    expect(result.netUnearnedIncome.toNumber()).toBe(2300);
  });

  it("Form 8615 Line 4 - child's taxable income from Form 1040", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(3650),
      "single",
      constants
    );
    const line4 = result.lines.find(l => l.form === "8615" && l.line === "4");
    expect(line4?.value.toNumber()).toBe(3650);
  });

  it("Form 8615 Line 5 - net unearned income capped at child's taxable income", () => {
    // Unearned income is $5000, threshold is $2700, so net = $2300
    // But child's taxable income is only $1500 (after deductions)
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(1500),
      "single",
      constants
    );
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(1500);
  });

  it("Form 8615 Line 6 - remainder taxed at child's own rate", () => {
    // Child has $8000 unearned income, $2000 earned income, taxable = $8650
    // Net unearned = 8000 - 2700 = 5300
    // Line 5 = min(5300, 8650) = 5300
    // Line 6 = 8650 - 5300 = 3350
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8650),
      "single",
      constants
    );
    expect(result.childRateIncome.toNumber()).toBe(3350);
  });

  it("Form 8615 Line 7 - parent's taxable income from input", () => {
    const result = calculateForm8615(
      makeInput({ parentTaxableIncome: "200000" }),
      new Decimal(5000),
      "single",
      constants
    );
    const line7 = result.lines.find(l => l.form === "8615" && l.line === "7");
    expect(line7?.value.toNumber()).toBe(200000);
  });

  it("Form 8615 Line 8 - zero when no siblings file Form 8615", () => {
    const result = calculateForm8615(
      makeInput({ otherChildrenNetUnearnedIncome: "0" }),
      new Decimal(5000),
      "single",
      constants
    );
    const line8 = result.lines.find(l => l.form === "8615" && l.line === "8");
    expect(line8?.value.toNumber()).toBe(0);
  });

  // ─── Parent Rate Computation ─────────────────────────────

  it("Form 8615 Line 11 - tax on combined income uses parent's rates", () => {
    // Parent has $150,000 taxable income, MFJ
    // Child's net unearned = 5000 - 2700 = 2300
    // Combined = 150000 + 2300 = 152300
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const expectedLine11 = calculateTaxFromBrackets(
      new Decimal(152300),
      constants.taxBrackets.married_filing_jointly
    );
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.value.toNumber()).toBe(expectedLine11.toNumber());
  });

  it("Form 8615 Line 12 - tax on parent's income alone", () => {
    const result = calculateForm8615(
      makeInput({
        parentTaxableIncome: "150000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const expectedLine12 = calculateTaxFromBrackets(
      new Decimal(150000),
      constants.taxBrackets.married_filing_jointly
    );
    const line12 = result.lines.find(l => l.form === "8615" && l.line === "12");
    expect(line12?.value.toNumber()).toBe(expectedLine12.toNumber());
  });

  it("Form 8615 Line 13 - allocable parental tax is the marginal increase", () => {
    const input = makeInput({
      childUnearnedIncome: "5000",
      parentTaxableIncome: "150000",
      parentFilingStatus: "married_filing_jointly",
    });
    const result = calculateForm8615(input, new Decimal(5000), "single", constants);

    // At $150,000 MFJ, the parent is in the 22% bracket (96,950 - 206,700)
    // Net unearned = 2300, so allocable tax should be roughly 2300 * 22% = 506
    const taxOnCombined = calculateTaxFromBrackets(
      new Decimal(152300), constants.taxBrackets.married_filing_jointly
    );
    const taxOnParent = calculateTaxFromBrackets(
      new Decimal(150000), constants.taxBrackets.married_filing_jointly
    );
    expect(result.allocableParentalTax.toNumber()).toBe(
      taxOnCombined.minus(taxOnParent).toNumber()
    );
  });

  it("Form 8615 Line 14 - single child gets full allocable parental tax", () => {
    const result = calculateForm8615(
      makeInput({ otherChildrenNetUnearnedIncome: "0" }),
      new Decimal(5000),
      "single",
      constants
    );
    expect(result.childShareOfParentalTax.toNumber()).toBe(
      result.allocableParentalTax.toNumber()
    );
  });

  it("Form 8615 Line 15 - tax on child's remaining income at child's rate", () => {
    // Child: $8000 unearned, taxable = $8650
    // Net unearned = 5300, line 5 = 5300, line 6 = 3350
    // Published2025 single3350–3400 row338.
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "8000" }),
      new Decimal(8650),
      "single",
      constants
    );
    const expectedLine15 = new Decimal(338); // Published table, not exact3350*10percent.
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.toNumber());
  });

  it("Form 8615 Line 17 - tax at child's own rate on full taxable income", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(5000),
      "single",
      constants
    );
    const expectedLine17 = new Decimal(503); // Published5000–5050 single row.
    expect(result.taxAtChildOwnRate.toNumber()).toBe(expectedLine17.toNumber());
  });

  it("Form 8615 Line 18 - final tax is the greater of tentative and child-rate tax", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(10000),
      "single",
      constants
    );
    expect(result.tax.toNumber()).toBe(
      Math.max(result.tentativeTax.toNumber(), result.taxAtChildOwnRate.toNumber())
    );
    // Parent's rate is higher, so tentative tax should win
    expect(result.tax.toNumber()).toBe(result.tentativeTax.toNumber());
  });

  it("Form 8615 Line 18 - child's own rate applies when higher than parent's", () => {
    // Parent has very low income ($5000 MFJ) → 10% bracket
    // Child has high income → taxes at child's single rate may be higher
    // if the child's full-rate tax exceeds the tentative tax
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "50000",
        parentTaxableIncome: "5000",
        parentFilingStatus: "married_filing_jointly",
      }),
      new Decimal(50000),
      "single",
      constants
    );
    // At MFJ $5000, parent is in 10% bracket. Net unearned = 47300.
    // Combined = 52300 → still mostly 10% bracket.
    // Child at single rate on $50000 → spans 10% and 12% brackets.
    // Line 17 (child's own rate) could match or exceed line 16.
    expect(result.tax.toNumber()).toBe(
      Math.max(result.tentativeTax.toNumber(), result.taxAtChildOwnRate.toNumber())
    );
  });

  // ─── Sibling Allocation ────────────────────────────────────

  it("Form 8615 Lines 8-14 - allocates parental tax among siblings", () => {
    // This child: net unearned = 5000 - 2700 = 2300
    // Other siblings: 3000 of net unearned
    // Total Line 9 = 2300 + 3000 = 5300
    // This child's share = allocable_tax * (2300 / 5300)
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
        otherChildrenNetUnearnedIncome: "3000",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const line8 = result.lines.find(l => l.form === "8615" && l.line === "8");
    expect(line8?.value.toNumber()).toBe(3000);

    // Verify proportional allocation
    const expectedShare = result.allocableParentalTax
      .times(new Decimal(2300))
      .dividedBy(new Decimal(5300));
    expect(result.childShareOfParentalTax.toNumber()).toBe(
      expectedShare.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    );
    expect(result.childShareOfParentalTax.toNumber()).toBeLessThan(
      result.allocableParentalTax.toNumber()
    );
  });

  // ─── QDCG Interaction ─────────────────────────────────────

  it("Form 8615 Lines 11-12 - parent with QDCG uses preferential rate computation", () => {
    // Parent with $10,000 qualified dividends at MFJ
    const input = makeInput({
      childUnearnedIncome: "5000",
      parentTaxableIncome: "100000",
      parentFilingStatus: "married_filing_jointly",
      parentQualifiedDividends: "10000",
      parentNetLTCG: "0",
    });
    const result = calculateForm8615(input, new Decimal(5000), "single", constants);

    // Tax on combined should use QDCG
    const netUnearned = new Decimal(2300);
    const combined = new Decimal(102300);
    const taxCombined = calculateCapitalGainsTax(
      combined, new Decimal(10000), new Decimal(0), "married_filing_jointly", constants
    );
    const taxParent = calculateCapitalGainsTax(
      new Decimal(100000), new Decimal(10000), new Decimal(0), "married_filing_jointly", constants
    );

    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.value.toNumber()).toBe(taxCombined.tax.toNumber());
    const line12 = result.lines.find(l => l.form === "8615" && l.line === "12");
    expect(line12?.value.toNumber()).toBe(taxParent.tax.toNumber());
  });

  it("Form 8615 Line 15 - child's qualified dividends exceeding Line 5 get QDCG treatment", () => {
    // Child has $10,000 QD (all unearned), net unearned = 10000 - 2700 = 7300
    // Child's taxable income = $12000 (includes some earned)
    // Line 5 = min(7300, 12000) = 7300
    // Line 6 = 12000 - 7300 = 4700
    // QD absorbed by Line 5 = min(10000, 7300) = 7300
    // QD on Line 6 = 10000 - 7300 = 2700
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        childQualifiedDividends: "10000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(12000),
      "single",
      constants
    );

    // Line 6 = 4700, with QD = 2700
    expect(result.childRateIncome.toNumber()).toBe(4700);
    // Tax on line 6 should use QDCG (2700 QD at 0% rate for low income)
    const expectedLine15 = calculateCapitalGainsTax(
      new Decimal(4700), new Decimal(2700), new Decimal(0), "single", constants
    );
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.tax.toNumber());
  });

  it("Form 8615 Line 17 - child's QDCG applies to full taxable income at child's rate", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        childQualifiedDividends: "3000",
        childNetLTCG: "1000",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const expectedLine17 = calculateCapitalGainsTax(
      new Decimal(5000), new Decimal(3000), new Decimal(1000), "single", constants
    );
    expect(result.taxAtChildOwnRate.toNumber()).toBe(expectedLine17.tax.toNumber());
  });

  // ─── Filing Status Variations ─────────────────────────────

  it("Form 8615 - single parent uses single tax brackets", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "100000",
        parentFilingStatus: "single",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const combined = new Decimal(102300);
    const expectedTax = calculateTaxFromBrackets(combined, constants.taxBrackets.single);
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.value.toNumber()).toBe(expectedTax.toNumber());
  });

  it("Form 8615 - head of household parent uses HoH tax brackets", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "5000",
        parentTaxableIncome: "100000",
        parentFilingStatus: "head_of_household",
      }),
      new Decimal(5000),
      "single",
      constants
    );

    const combined = new Decimal(102300);
    const expectedTax = calculateTaxFromBrackets(combined, constants.taxBrackets.head_of_household);
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.value.toNumber()).toBe(expectedTax.toNumber());
  });

  // ─── Edge Cases ────────────────────────────────────────────

  it("Form 8615 - net unearned income of $1 produces a valid computation", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "2701" }),
      new Decimal(2701),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
    expect(result.tax.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("Form 8615 - itemizing child with $1,351 unearned income triggers the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "1351", childItemizesDeductions: true }),
      new Decimal(1351),
      "single",
      constants
    );
    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(1);
  });

  it("Form 8615 - itemizing child with $1,350 unearned income does not trigger the form", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "1350", childItemizesDeductions: true }),
      new Decimal(1350),
      "single",
      constants
    );
    expect(result.applies).toBe(false);
  });

  it("Form 8615 - child's taxable income of zero produces zero tax even with high unearned income", () => {
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "10000" }),
      new Decimal(0),
      "single",
      constants
    );
    // Net unearned = 7300, but capped at taxable income = 0
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("Form 8615 - parent in highest bracket produces maximum marginal rate on child's income", () => {
    // Parent at $800,000 single = 37% bracket
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

    // Net unearned = 7300, entirely in parent's 37% bracket
    // Allocable parental tax ≈ 7300 * 0.37 = 2701
    expect(result.allocableParentalTax.toNumber()).toBe(2701);
  });

  it("Form 8615 - line 6 of zero produces zero line 15 tax", () => {
    // All child's taxable income is net unearned income
    // Unearned = 5000, taxable = 2300 (5000 - 2700 standard deduction)
    // Net unearned = 5000 - 2700 = 2300 = taxable, so line 5 = 2300, line 6 = 0
    const result = calculateForm8615(
      makeInput({ childUnearnedIncome: "5000" }),
      new Decimal(2300),
      "single",
      constants
    );
    expect(result.childRateIncome.toNumber()).toBe(0);
    expect(result.taxOnChildRateIncome.toNumber()).toBe(0);
  });

  it("Form 8615 - high-income parent with LTCG and section 1250 gain", () => {
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "10000",
        parentTaxableIncome: "300000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "20000",
        parentNetLTCG: "30000",
        parentSection1250Gain: "5000",
      }),
      new Decimal(10000),
      "single",
      constants
    );

    // Verify QDCG is used for parent computation
    const line11 = result.lines.find(l => l.form === "8615" && l.line === "11");
    expect(line11?.formula).toContain("QDCG");

    // The tax should be higher than without QDCG because the children's unearned
    // income stacks on top, potentially pushing ordinary income into higher brackets
    expect(result.applies).toBe(true);
    expect(result.tax.greaterThan(0)).toBe(true);
  });

  it("Form 8615 - child with LTCG allocated between Lines 5 and 6", () => {
    // Child: $15000 unearned, QD = $8000, LTCG = $5000
    // Taxable = $15000
    // Net unearned = 15000 - 2700 = 12300
    // Line 5 = min(12300, 15000) = 12300
    // QD absorbed by line 5 = min(8000, 12300) = 8000
    // Remaining line 5 after QD = 12300 - 8000 = 4300
    // LTCG absorbed = min(5000, 4300) = 4300
    // LTCG on line 6 = 5000 - 4300 = 700
    // Line 6 = 15000 - 12300 = 2700
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "15000",
        childQualifiedDividends: "8000",
        childNetLTCG: "5000",
        parentTaxableIncome: "200000",
        parentFilingStatus: "single",
      }),
      new Decimal(15000),
      "single",
      constants
    );

    expect(result.childRateIncome.toNumber()).toBe(2700);
    // Line 15 should use QDCG with the LTCG overflow
    const expectedLine15 = calculateCapitalGainsTax(
      new Decimal(2700), new Decimal(0), new Decimal(700), "single", constants
    );
    expect(result.taxOnChildRateIncome.toNumber()).toBe(expectedLine15.tax.toNumber());
  });

  // ─── Integration with federal.ts ──────────────────────────

  it("Form 8615 - federal orchestrator uses Form 8615 tax when input is provided", () => {
    // Child needs enough income to exceed the $15,000 standard deduction
    const result = calculateFederalTax(makeFederalInput({
      childUnearnedIncome: "25000",
      parentTaxableIncome: "200000",
      parentFilingStatus: "single",
    }, {
      form1099Int: [{ payer: "Trust Fund", interestIncome: "25000" }],
    }));

    expect(result.form8615).toBeDefined();
    expect(result.form8615!.applies).toBe(true);
    // The income tax (line 16) should come from Form 8615
    const form8615Tax = result.form8615!.tax;
    expect(form8615Tax.greaterThan(0)).toBe(true);
  });

  it("Form 8615 - audit trail includes Form 8615 lines", () => {
    const result = calculateFederalTax(makeFederalInput({
      childUnearnedIncome: "25000",
      parentTaxableIncome: "200000",
      parentFilingStatus: "single",
    }, {
      form1099Int: [{ payer: "Trust Fund", interestIncome: "25000" }],
    }));

    const form8615Lines = result.allLines.filter(l => l.form === "8615");
    expect(form8615Lines.length).toBeGreaterThan(0);
    const line18 = form8615Lines.find(l => l.line === "18");
    expect(line18).toBeDefined();
  });

  // ─── Comprehensive Scenario ────────────────────────────────

  it("Form 8615 - realistic scenario: 16-year-old with trust income, parents in 24% bracket", () => {
    // Child: $20,000 interest + $5,000 QD from trust, plus $3,000 summer job
    // Total income = $28,000, unearned = $25,000
    // Standard deduction = max($1,350, $3,000 + $450) = $3,450
    // Taxable income = $28,000 - $3,450 = $24,550
    // Net unearned = $25,000 - $2,700 = $22,300
    // Line 5 = min($22,300, $24,550) = $22,300
    // Line 6 = $24,550 - $22,300 = $2,250
    // Parent: $350,000 MFJ taxable → in 24% bracket
    const result = calculateForm8615(
      makeInput({
        childUnearnedIncome: "25000",
        childQualifiedDividends: "5000",
        parentTaxableIncome: "350000",
        parentFilingStatus: "married_filing_jointly",
        parentQualifiedDividends: "15000",
        parentNetLTCG: "10000",
      }),
      new Decimal(24550),
      "single",
      constants
    );

    expect(result.applies).toBe(true);
    expect(result.netUnearnedIncome.toNumber()).toBe(22300);
    expect(result.netUnearnedAtParentRate.toNumber()).toBe(22300);
    expect(result.childRateIncome.toNumber()).toBe(2250);

    // The child pays significantly more than their own-rate tax
    expect(result.tentativeTax.greaterThan(result.taxAtChildOwnRate)).toBe(true);
    expect(result.tax.toNumber()).toBe(result.tentativeTax.toNumber());

    // Audit trail is complete
    const allLineNumbers = result.lines.map(l => l.line);
    for (const expected of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"]) {
      expect(allLineNumbers).toContain(expected);
    }
  });
});

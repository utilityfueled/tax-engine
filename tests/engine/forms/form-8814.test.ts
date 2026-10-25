/**
 * Tests for Form 8814 — Parents' Election To Report Child's Interest and Dividends.
 * Spec: spec/federal/form-8814.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8814, aggregateForm8814Results } from "@/engine/forms/form-8814.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput, Form8814ChildInput } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { syntheticChildElection } from "../../fixtures/form-8814-election.js";

const constants = getConstants(2025);

function makeChildInput(overrides: Partial<Form8814ChildInput> = {}): Form8814ChildInput {
  return {
    taxableInterest: "3000",
    taxExemptInterest: "0",
    ordinaryDividends: "2000",
    qualifiedDividends: "1500",
    capitalGainDistributions: "500",
    ...overrides,
  };
}

function makeParentFederalInput(
  form8814Children: Partial<Form8814ChildInput>[] = [{}],
  extraInput: Record<string, unknown> = {}
): TaxYearInput {
  return {
    taxpayer: {
      taxYear: 2025,
      filingStatus: "married_filing_jointly",
      primary: {
        firstName: "Parent",
        lastName: "Taxpayer",
        ssn: "111-22-3333",
        dateOfBirth: "1980-06-15",
      },
      spouse: {
        firstName: "Spouse",
        lastName: "Taxpayer",
        ssn: "444-55-6666",
        dateOfBirth: "1982-09-20",
      },
      address: { street: "456 Oak Ave", city: "Suburbia", state: "TX", zip: "75002" },
      dependents: [
        {
          firstName: "Child",
          lastName: "Taxpayer",
          ssn: "777-88-9999",
          relationship: "Son",
          dateOfBirth: "2012-04-10",
          monthsLivedWithYou: 12,
        },
      ],
    },
    w2s: [{ employer: "Acme Corp", wages: "120000", federalWithheld: "18000" }],
    form1099Int: [],
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
    form8814: form8814Children.map((c, index) => makeChildInput({
      electionFacts: { ...syntheticChildElection(2025, String(index + 1).padStart(2, "0")), parentSituation: "joint_with_other_parent", child: { firstName: "Child", lastName: "Taxpayer", ssn: index === 0 ? "777-88-9999" : `777-88-99${String(index).padStart(2, "0")}`, dateOfBirth: "2012-04-10" } }, ...c,
    })),
    ...extraInput,
  } as unknown as TaxYearInput;
}

describe("Form 8814 — Parents' Election To Report Child's Interest and Dividends", () => {
  describe("Part I: Income allocation", () => {
    it("Form 8814 Line 4 - total child income sums interest, dividends, and capital gains", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1000", ordinaryDividends: "2000", capitalGainDistributions: "500" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(3500));
    });

    it("Form 8814 Line 6 - income above $2,700 base", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "4000", ordinaryDividends: "1000", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(5000));
      expect(result.line6).toEqual(new Decimal(2300)); // 5000 - 2700
    });

    it("Form 8814 Line 6 - zero when total income <= $2,700", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1500", ordinaryDividends: "1000", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(2500));
      expect(result.line6).toEqual(new Decimal(0));
    });

    it("Form 8814 Line 9 - qualified dividends allocated proportionally", () => {
      // Child: $3,000 interest + $2,000 ord div ($1,500 qual) + $500 cap gains = $5,500 total
      // Line 6 = 5500 - 2700 = 2800 above base
      // Line 7 = 1500/5500 = 0.2727
      // Line 9 = 2800 × 0.2727 = 763 (rounded)
      const result = calculateForm8814(makeChildInput(), constants);
      expect(result.line4).toEqual(new Decimal(5500));
      expect(result.line6).toEqual(new Decimal(2800));
      const expectedRatio = new Decimal(1500).dividedBy(5500).toDecimalPlaces(4, Decimal.ROUND_DOWN);
      const expectedQualDiv = new Decimal(2800).times(expectedRatio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.qualifiedDividendsToReport).toEqual(expectedQualDiv);
    });

    it("Form 8814 Line 10 - capital gain distributions allocated proportionally", () => {
      const result = calculateForm8814(makeChildInput(), constants);
      const expectedRatio = new Decimal(500).dividedBy(5500).toDecimalPlaces(4, Decimal.ROUND_DOWN);
      const expectedCapGains = new Decimal(2800).times(expectedRatio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.capitalGainsToReport).toEqual(expectedCapGains);
    });

    it("Form 8814 Line 12 - other income is remainder after preferential items", () => {
      const result = calculateForm8814(makeChildInput(), constants);
      const expectedOther = result.line6.minus(result.qualifiedDividendsToReport).minus(result.capitalGainsToReport);
      expect(result.otherIncomeToReport).toEqual(expectedOther);
      // Total allocated should equal line 6
      const totalAllocated = result.qualifiedDividendsToReport.plus(result.capitalGainsToReport).plus(result.otherIncomeToReport);
      expect(totalAllocated).toEqual(result.line6);
    });

    it("Form 8814 Line 12 - all income is ordinary when no qualified dividends or capital gains", () => {
      const result = calculateForm8814(
        makeChildInput({ qualifiedDividends: "0", capitalGainDistributions: "0", taxableInterest: "4000", ordinaryDividends: "1000" }),
        constants
      );
      expect(result.line6).toEqual(new Decimal(2300)); // 5000 - 2700
      expect(result.qualifiedDividendsToReport).toEqual(new Decimal(0));
      expect(result.capitalGainsToReport).toEqual(new Decimal(0));
      expect(result.otherIncomeToReport).toEqual(new Decimal(2300));
    });

    it("Form 8814 cannot be used when child income >= $13,500", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "10000", ordinaryDividends: "3000", capitalGainDistributions: "500" }),
        constants
      );
      expect(result.exceedsMaximum).toBe(true);
      expect(result.applies).toBe(false);
      expect(result.tax).toEqual(new Decimal(0));
    });

    it("Form 8814 applies when child income is exactly $13,499", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "12999", ordinaryDividends: "500", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.exceedsMaximum).toBe(false);
      expect(result.applies).toBe(true);
    });

    it("Form 8814 does not apply when child income <= $1,350", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1000", ordinaryDividends: "300", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(1300));
      expect(result.applies).toBe(false);
    });

    it("Form 8814 tax-exempt interest tracked but not in Line 4", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "3000", taxExemptInterest: "500" }),
        constants
      );
      expect(result.taxExemptInterest).toEqual(new Decimal(500));
      // Line 4 should NOT include tax-exempt interest
      expect(result.line4).toEqual(new Decimal(5500)); // 3000 + 2000 + 500 (cap gains), NOT + 500 (tax-exempt)
    });
  });

  describe("Part II: Tax computation", () => {
    it("Form 8814 Line 15 - maximum tax $135 when taxable base >= $1,350", () => {
      // Child income $5,500 → Line 14 = 5500 - 1350 = 4150 ≥ 1350 → tax = $135
      const result = calculateForm8814(makeChildInput(), constants);
      expect(result.tax).toEqual(new Decimal(135));
    });

    it("Form 8814 Line 15 - tax = Line 14 × 10% when taxable base < $1,350", () => {
      // Child income $2,000 → Line 14 = 2000 - 1350 = 650 < 1350 → tax = 650 × 10% = $65
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "2000", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.tax).toEqual(new Decimal(65));
    });

    it("Form 8814 Line 15 - zero tax when child income <= $1,350", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1000", ordinaryDividends: "350", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(1350));
      expect(result.tax).toEqual(new Decimal(0));
    });

    it("Form 8814 Line 15 - tax at exactly $2,700 income is $135", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "2700", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(2700));
      // Line 14 = 2700 - 1350 = 1350 ≥ 1350 → max tax
      expect(result.tax).toEqual(new Decimal(135));
    });

    it("Form 8814 Line 15 - tax at $1,800 income is $45", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1800", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      // Line 14 = 1800 - 1350 = 450 < 1350 → tax = 450 × 10% = $45
      expect(result.tax).toEqual(new Decimal(45));
    });

    it("Form 8814 Line 15 - tax at $1,351 income is $0 (rounds down)", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1351", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        constants
      );
      // Line 14 = 1351 - 1350 = 1 → tax = 1 × 10% = $0.10 rounds to $0
      expect(result.tax).toEqual(new Decimal(0));
    });
  });

  describe("Multiple children aggregation", () => {
    it("aggregates Line 12 and Line 15 across multiple children", () => {
      const result = aggregateForm8814Results([
        makeChildInput({ taxableInterest: "4000", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        makeChildInput({ taxableInterest: "3000", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
      ], constants);

      // Child 1: $4000 → Line 6 = 1300, Line 12 = 1300, Line 15 = $135
      // Child 2: $3000 → Line 6 = 300, Line 12 = 300, Line 15 = $135
      expect(result.totalOtherIncome).toEqual(new Decimal(1600));
      expect(result.totalTax).toEqual(new Decimal(270)); // 135 + 135
      expect(result.children).toHaveLength(2);
    });

    it("aggregates qualified dividends and capital gains across children", () => {
      const result = aggregateForm8814Results([
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "5000", qualifiedDividends: "4000", capitalGainDistributions: "1000" }),
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "3000", qualifiedDividends: "2000", capitalGainDistributions: "500" }),
      ], constants);

      expect(result.totalQualifiedDividends.greaterThan(0)).toBe(true);
      expect(result.totalCapitalGains.greaterThan(0)).toBe(true);
    });

    it("skips children who exceed the maximum income", () => {
      const result = aggregateForm8814Results([
        makeChildInput({ taxableInterest: "14000", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        makeChildInput({ taxableInterest: "4000", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
      ], constants);

      // First child exceeds maximum, should not contribute
      // Second child: Line 6 = 1300, Line 12 = 1300, Line 15 = $135
      expect(result.totalOtherIncome).toEqual(new Decimal(1300));
      expect(result.totalTax).toEqual(new Decimal(135));
    });

    it("aggregates tax-exempt interest from all children including those exceeding maximum", () => {
      const result = aggregateForm8814Results([
        makeChildInput({ taxableInterest: "14000", taxExemptInterest: "200", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
        makeChildInput({ taxableInterest: "3000", taxExemptInterest: "100", ordinaryDividends: "0", capitalGainDistributions: "0", qualifiedDividends: "0" }),
      ], constants);

      // Tax-exempt interest is tracked for all children
      expect(result.totalTaxExemptInterest).toEqual(new Decimal(300));
    });
  });

  describe("Federal orchestrator integration", () => {
    it("Form 8814 qualified dividends flow to parent's 1040 Lines 3a and 3b", () => {
      const result = calculateFederalTax(makeParentFederalInput([{
        taxableInterest: "0",
        ordinaryDividends: "6000",
        qualifiedDividends: "6000",
        capitalGainDistributions: "0",
      }]));

      // Child: $6000 total, Line 6 = 3300 above base
      // All dividends are qualified: ratio = 6000/6000 = 1.0
      // Line 9 = 3300 (all qualified)
      // Parent qualified dividends should include Form 8814 Line 9
      expect(result.qualifiedDividends.greaterThan(0)).toBe(true);
      // Parent total dividends should also include Form 8814 Line 9
      expect(result.totalDividends.greaterThan(0)).toBe(true);
    });

    it("Form 8814 capital gains flow to parent's capital gain/loss (Line 7)", () => {
      const result = calculateFederalTax(makeParentFederalInput([{
        taxableInterest: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "6000",
      }]));

      // Child: $6000 total, all capital gains, Line 6 = 3300
      // Line 10 = 3300 (all capital gains)
      expect(result.capitalGainLoss.greaterThan(0)).toBe(true);
    });

    it("Form 8814 other income flows to total income via Schedule 1 Line 8z", () => {
      const resultWith = calculateFederalTax(makeParentFederalInput([{
        taxableInterest: "5000",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      }]));
      const resultWithout = calculateFederalTax(makeParentFederalInput([], {}));

      // Child interest-only: Line 6 = 2300 → all goes to Line 12 other income
      // Total income should be higher with Form 8814
      expect(resultWith.totalIncome.greaterThan(resultWithout.totalIncome)).toBe(true);
    });

    it("Form 8814 Line 15 tax adds to income tax on Line 16", () => {
      const resultWith = calculateFederalTax(makeParentFederalInput([{
        taxableInterest: "5000",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
      }]));
      const resultWithout = calculateFederalTax(makeParentFederalInput([], {}));

      // The total tax with Form 8814 should include the $135 Form 8814 Line 15 tax
      // PLUS the marginal tax on the additional income
      expect(resultWith.totalTax.greaterThan(resultWithout.totalTax)).toBe(true);
    });

    it("Form 8814 child exempt interest stays separate from the parent's Line 2a", () => {
      const result = calculateFederalTax(makeParentFederalInput([{
        taxableInterest: "3000",
        taxExemptInterest: "500",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        capitalGainDistributions: "0",
        amtSources: {
          taxYear: 2025, allStatementsConfirmed: true, otherwiseAllowableDeduction: "0",
          statements: [{ sourceId: "synthetic-child-exempt-interest", form: "1099-INT", taxExemptInterest: "500", specifiedPrivateActivityBondInterest: "0" }],
        },
      }]));

      // Find the Line 2a audit entry
      const line2a = result.allLines.find(
        (l) => l.form === "1040" && l.line === "2a"
      );
      expect(line2a?.value).toEqual(new Decimal(0));
      expect(result.form8814?.totalTaxExemptInterest).toEqual(new Decimal(500));
    });

    it("Form 8814 result is included in return result", () => {
      const result = calculateFederalTax(makeParentFederalInput());
      expect(result.form8814).toBeDefined();
      expect(result.form8814!.children).toHaveLength(1);
    });

    it("no Form 8814 result when no children specified", () => {
      const result = calculateFederalTax(makeParentFederalInput([]));
      expect(result.form8814).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("child with exactly $2,700 income - no income allocated to parent but tax of $135", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "2700", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(2700));
      expect(result.line6).toEqual(new Decimal(0)); // No income above base
      expect(result.qualifiedDividendsToReport).toEqual(new Decimal(0));
      expect(result.capitalGainsToReport).toEqual(new Decimal(0));
      expect(result.otherIncomeToReport).toEqual(new Decimal(0));
      // But tax is still $135 on the $1,350-$2,700 bracket
      expect(result.tax).toEqual(new Decimal(135));
      expect(result.applies).toBe(true);
    });

    it("child with exactly $1,350 income - no tax and does not apply", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "1350", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(1350));
      expect(result.tax).toEqual(new Decimal(0));
      expect(result.applies).toBe(false);
    });

    it("child with exactly $13,500 income - exceeds maximum", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "13500", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.exceedsMaximum).toBe(true);
      expect(result.applies).toBe(false);
    });

    it("child with $0 income", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.line4).toEqual(new Decimal(0));
      expect(result.tax).toEqual(new Decimal(0));
      expect(result.applies).toBe(false);
    });

    it("100% qualified dividends child - all excess is qualified", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "5000", qualifiedDividends: "5000", capitalGainDistributions: "0" }),
        constants
      );
      // Line 6 = 5000 - 2700 = 2300
      // Line 7 = 5000/5000 = 1.0
      // Line 9 = 2300 × 1.0 = 2300 (all qualified)
      expect(result.qualifiedDividendsToReport).toEqual(new Decimal(2300));
      expect(result.capitalGainsToReport).toEqual(new Decimal(0));
      expect(result.otherIncomeToReport).toEqual(new Decimal(0));
    });

    it("100% capital gains child - all excess is capital gains", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "5000" }),
        constants
      );
      // Line 6 = 5000 - 2700 = 2300
      // Line 8 = 5000/5000 = 1.0
      // Line 10 = 2300 × 1.0 = 2300
      expect(result.capitalGainsToReport).toEqual(new Decimal(2300));
      expect(result.qualifiedDividendsToReport).toEqual(new Decimal(0));
      expect(result.otherIncomeToReport).toEqual(new Decimal(0));
    });

    it("proportional allocation preserves total equal to Line 6", () => {
      // Test with various mixes
      const inputs: Partial<Form8814ChildInput>[] = [
        { taxableInterest: "3000", ordinaryDividends: "4000", qualifiedDividends: "2000", capitalGainDistributions: "1000" },
        { taxableInterest: "1000", ordinaryDividends: "6000", qualifiedDividends: "5500", capitalGainDistributions: "3000" },
        { taxableInterest: "5000", ordinaryDividends: "1000", qualifiedDividends: "500", capitalGainDistributions: "200" },
      ];

      for (const inp of inputs) {
        const result = calculateForm8814(makeChildInput(inp), constants);
        if (result.line6.greaterThan(0)) {
          const total = result.qualifiedDividendsToReport.plus(result.capitalGainsToReport).plus(result.otherIncomeToReport);
          expect(total).toEqual(result.line6);
        }
      }
    });

    it("income just above $2,700 base allocates small amount", () => {
      const result = calculateForm8814(
        makeChildInput({ taxableInterest: "0", ordinaryDividends: "2701", qualifiedDividends: "2701", capitalGainDistributions: "0" }),
        constants
      );
      expect(result.line6).toEqual(new Decimal(1)); // Only $1 above base
      // With ratio 1.0 for qualified dividends: Line 9 = $1
      expect(result.qualifiedDividendsToReport).toEqual(new Decimal(1));
    });
  });
});

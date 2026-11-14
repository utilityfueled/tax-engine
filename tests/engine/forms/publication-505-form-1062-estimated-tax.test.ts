// Spec: spec/federal/publication-505-form-1062-estimated-tax.yaml.
import { describe, expect, it } from "vitest";
import { calculatePublication505Form1062Adjustment } from "@/engine/forms/publication-505-form-1062-estimated-tax.js";
import { qualifiedFarmlandSale } from "../../fixtures/form-1062-direct-sale.js";

type AdjustmentInput = Parameters<typeof calculatePublication505Form1062Adjustment>[0];

const noCredits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
const source = {
  calendarYearConfirmed: true,
  saleSourceId: "synthetic-farmland-01",
  form1062: {
    taxYear: 2026, electionConfirmed: true, sale: qualifiedFarmlandSale, taxableIncome: "86516",
    withGain: { regularIncomeTax: "9886", additions: "268", credits: noCredits },
    withoutGain: { taxableIncome: "30000", regularIncomeTax: "3104", additions: "0", credits: noCredits },
  },
  incomeRecognition: {
    taxYear: 2026,
    saleSourceId: "synthetic-farmland-01",
    sourceFactsConfirmed: true,
    cumulativeIncomeIncludesGain: {
      "2026-03-31": false, "2026-05-31": false, "2026-08-31": false, "2026-12-31": true,
    },
  },
} satisfies AdjustmentInput;

function inclusion(march: boolean, may: boolean, august: boolean, december: boolean) {
  return { "2026-03-31": march, "2026-05-31": may, "2026-08-31": august, "2026-12-31": december };
}

function income(march: string, may: string, august: string, december: string) {
  return { "2026-03-31": march, "2026-05-31": may, "2026-08-31": august, "2026-12-31": december };
}

function columnAdjustments(result: ReturnType<typeof calculatePublication505Form1062Adjustment>) {
  return result.worksheet29Line20Additions.map(({ amount }) => amount.toFixed());
}

const { sale: oneSale, ...annualFacts } = source.form1062;
const aggregateSource = {
  calendarYearConfirmed: true,
  form1062: { ...annualFacts, taxableIncome: "143032", sales: [
    { sourceId: "confirmed-farmland-a", scheduleA: { ...oneSale, saleDate: "2026-04-01" } },
    { sourceId: "confirmed-farmland-b", scheduleA: { ...oneSale, saleDate: "2026-05-31" } },
  ], independentlyReportedElectedGain: "113032" },
  incomeRecognitionBySale: [
    { taxYear: 2026, sourceFactsConfirmed: true, saleSourceId: "confirmed-farmland-b", cumulativeRecognizedGain: income("0", "56516.00", "56516.00", "56516.00") },
    { taxYear: 2026, sourceFactsConfirmed: true, saleSourceId: "confirmed-farmland-a", cumulativeRecognizedGain: income("0.00", "56516", "56516", "56516") },
  ],
} as const satisfies AdjustmentInput;

describe("2026 Publication 505 section 1062 adjustment", () => {
  it("adds exactly 75 percent of full-year liability to Worksheet 2-1 line 11b", () => {
    const result = calculatePublication505Form1062Adjustment(source);
    expect(result.worksheet21Line11bAddition.toFixed()).toBe("5287.5");
    expect(columnAdjustments(result)).toEqual(["0", "0", "0", "5287.5"]);
    expect(result.lines.map(({ form, line, value }) => [form, line, value.toFixed()])).toEqual([
      ["Pub. 505 Worksheet 2-1", "11b", "5287.5"],
      ["Pub. 505 Worksheet 2-9", "20a", "0"],
      ["Pub. 505 Worksheet 2-9", "20b", "0"],
      ["Pub. 505 Worksheet 2-9", "20c", "0"],
      ["Pub. 505 Worksheet 2-9", "20d", "5287.5"],
    ]);
    expect(JSON.stringify(result)).not.toContain(source.saleSourceId);
  });

  it("keeps fractional cents and an actual zero liability", () => {
    for (const [tax, expected] of [["2836.01", "0.0075"], ["2836", "0"]]) {
      const result = calculatePublication505Form1062Adjustment({
        ...source, form1062: { ...source.form1062, withGain: { ...source.form1062.withGain, regularIncomeTax: tax } },
      });
      expect(result.worksheet21Line11bAddition.toFixed()).toBe(expected);
      expect(columnAdjustments(result)).toEqual(["0", "0", "0", expected]);
    }
  });

  it("reuses the exact ATS-based reduction in every confirmed period without annualizing", () => {
    // IRS TY2026 ATS Scenario 13 supplies the partnership allocation and annual
    // tax figures. Inclusion flags below are separate synthetic source facts.
    const partnershipSale = {
      ...qualifiedFarmlandSale,
      transactionType: "partnership_sale",
      saleDate: "2026-03-31", // A synthetic sale date allows testing all four possible first inclusion periods.
      grossProceeds: undefined, sellingExpenses: undefined, unadjustedBasis: undefined, adjustedBasis: undefined,
      partnerAllocation: {
        sourceForm: "1065", sourceBox: "20", sourceCode: "ZZ", sourceTaxYear: 2026,
        section1062StatementConfirmed: true, entityScheduleAMatched: true, taxpayerAndEntityMatched: true,
        allocatedGain: "56516",
      },
    } as const;
    const form1062 = {
      ...source.form1062, sale: partnershipSale, taxableIncome: "144468",
      withGain: { regularIncomeTax: "16896", additions: "1413", credits: noCredits },
      withoutGain: { taxableIncome: "87952", regularIncomeTax: "3275", additions: "1413", credits: noCredits },
    };
    for (const [flags, amounts] of [
      [inclusion(true, true, true, true), ["10215.75", "10215.75", "10215.75", "10215.75"]],
      [inclusion(false, true, true, true), ["0", "10215.75", "10215.75", "10215.75"]],
      [inclusion(false, false, true, true), ["0", "0", "10215.75", "10215.75"]],
      [inclusion(false, false, false, true), ["0", "0", "0", "10215.75"]],
    ] as const) {
      const result = calculatePublication505Form1062Adjustment({
        ...source, form1062, incomeRecognition: { ...source.incomeRecognition, cumulativeIncomeIncludesGain: flags },
      });
      expect(result.worksheet21Line11bAddition.toFixed()).toBe("10215.75");
      expect(result.worksheet29Line20Additions.map(({ periodEnd }) => periodEnd)).toEqual([
        "2026-03-31", "2026-05-31", "2026-08-31", "2026-12-31",
      ]);
      expect(columnAdjustments(result)).toEqual(amounts);
    }
  });

  it("requires explicit known inclusion for all four cumulative periods", () => {
    const complete = source.incomeRecognition.cumulativeIncomeIncludesGain;
    for (const flags of [
      undefined, null, [],
      { ...complete, "2026-03-31": undefined }, { ...complete, "2026-08-31": "false" },
      { ...complete, "2026-06-30": false },
      inclusion(false, false, false, false), inclusion(true, false, false, true), inclusion(false, true, false, true),
      inclusion(false, false, true, true), // The direct-sale source is dated October 1.
    ]) {
      expect(() => calculatePublication505Form1062Adjustment({
        ...source, incomeRecognition: { ...source.incomeRecognition, cumulativeIncomeIncludesGain: flags },
      } as unknown as AdjustmentInput)).toThrow(/four.*cumulative periods/iu);
    }
  });

  it("requires one validated 2026 election and the same sale's income record", () => {
    const { sale, ...annualFacts } = source.form1062;
    for (const change of [
      { calendarYearConfirmed: false }, { saleSourceId: "\n" },
      { incomeRecognition: undefined },
      { incomeRecognition: { ...source.incomeRecognition, saleSourceId: "other-farm" } },
      { incomeRecognition: { ...source.incomeRecognition, taxYear: 2025 } },
      { incomeRecognition: { ...source.incomeRecognition, sourceFactsConfirmed: false } },
      { form1062: { ...source.form1062, taxYear: 2025 } },
      { form1062: { ...source.form1062, electionConfirmed: false } },
      { form1062: { ...source.form1062, sale: { ...sale, taxYear: 2025 } } },
      { form1062: { ...source.form1062, sale: { ...sale, covenantIncluded: false } } },
      { form1062: { ...source.form1062, withoutGain: { ...source.form1062.withoutGain, taxableIncome: "30000.01" } } },
      { form1062: { ...annualFacts, taxableIncome: "143032", sales: [{ sourceId: "farm1", scheduleA: sale }, { sourceId: "farm2", scheduleA: sale }], independentlyReportedElectedGain: "113032" } },
      { form1062: { ...source.form1062, sales: [] } },
    ]) {
      expect(() => calculatePublication505Form1062Adjustment({ ...source, ...change } as unknown as AdjustmentInput))
        .toThrow(/(?:Publication 505|Form 1062)/u);
    }
  });

  it("uses the aggregate annual liability once when all elected sales enter the same column", () => {
    // Form 1062 instructions lines 7 and 14: $56,516 + $56,516, with one annual
    // tax difference of $9,886 + $268 − $3,104, so line 11b adds $5,287.50 once.
    const result = calculatePublication505Form1062Adjustment(aggregateSource);
    expect(result.worksheet21Line11bAddition.toFixed()).toBe("5287.5");
    expect(columnAdjustments(result)).toEqual(["0", "5287.5", "5287.5", "5287.5"]);
    expect(JSON.stringify(result)).not.toContain("confirmed-farmland");
    const cent = calculatePublication505Form1062Adjustment({ ...aggregateSource, form1062: {
      ...aggregateSource.form1062, withGain: { ...aggregateSource.form1062.withGain, regularIncomeTax: "2836.01" },
    } });
    expect(columnAdjustments(cent)).toEqual(["0", "0.0075", "0.0075", "0.0075"]);
  });

  it("rejects staggered recognition and incomplete or unbound original records", () => {
    const [first, second] = aggregateSource.incomeRecognitionBySale;
    const staggered = { ...second, cumulativeRecognizedGain: income("0", "0", "56516", "56516") };
    const staggeredSource = { ...aggregateSource, incomeRecognitionBySale: [first, staggered] };
    expect(() => calculatePublication505Form1062Adjustment(staggeredSource))
      .toThrow(/same cumulative income columns/u);

    for (const incomeRecognitionBySale of [
      [first], [first, first], [first, second, second], [first, { ...second, saleSourceId: "unbound" }],
      [first, { ...second, sourceFactsConfirmed: false }], [first, { ...second, taxYear: 2025 }],
      [first, { ...second, cumulativeRecognizedGain: income("56516", "56516", "56516", "56516") }],
    ]) {
      const invalidSource = { ...aggregateSource, incomeRecognitionBySale };
      expect(() => calculatePublication505Form1062Adjustment(invalidSource))
        .toThrow(/(?:same original sale|all four cumulative periods|each elected sale)/u);
    }
    const conflicting = { ...aggregateSource, incomeRecognition: source.incomeRecognition, saleSourceId: source.saleSourceId };
    expect(() => calculatePublication505Form1062Adjustment(conflicting as unknown as AdjustmentInput))
      .toThrow(/either one original or records for all elected sales/u);
  });

  it("rejects a partial amount even when both sales are partly recognized in the same column", () => {
    for (const invalidMay of ["0.01", "56515.99", "56516.01", "56516.000", "-1", "56516\n", true, 56516, undefined]) {
      const changed = { ...aggregateSource, incomeRecognitionBySale: aggregateSource.incomeRecognitionBySale.map(record => ({
        ...record, cumulativeRecognizedGain: { ...record.cumulativeRecognizedGain, "2026-05-31": invalidMay },
      })) };
      expect(() => calculatePublication505Form1062Adjustment(changed as unknown as AdjustmentInput)).toThrow(/zero or full recognized gain/u);
    }
  });
});

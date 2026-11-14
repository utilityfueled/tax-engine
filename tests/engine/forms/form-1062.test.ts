import { describe, expect, it } from "vitest";
import { calculateForm1062, type Form1062Input } from "@/engine/forms/form-1062.js";
import type { Form1062ScheduleAInput } from "@/engine/forms/form-1062-schedule-a.js";
import { qualifiedFarmlandSale } from "../../fixtures/form-1062-direct-sale.js";

// See spec/federal/form-1062.yaml. Tax determinations are synthetic.
const noCredits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
const source = {
  taxYear: 2026, sale: qualifiedFarmlandSale, electionConfirmed: true, taxableIncome: "86516",
  withGain: { regularIncomeTax: "9886", additions: "268", credits: noCredits },
  withoutGain: { taxableIncome: "30000", regularIncomeTax: "3104", additions: "0", credits: noCredits },
} as const satisfies Form1062Input;

const { sale: firstSale, ...multipleSaleFacts } = source;
const secondSale = {
  ...firstSale,
  transactionType: "s_corporation_sale",
  grossProceeds: undefined, sellingExpenses: undefined, unadjustedBasis: undefined, adjustedBasis: undefined,
  independentlyReportedGain: "20000.02",
  shareholderAllocation: {
    sourceForm: "1120-S", sourceBox: "17", sourceCode: "ZZ", sourceTaxYear: 2026,
    section1062StatementConfirmed: true, entityScheduleAMatched: true, taxpayerAndEntityMatched: true,
    allocatedGain: "20000.02",
  },
} satisfies Form1062ScheduleAInput;
const multipleSales = {
  ...multipleSaleFacts,
  taxableIncome: "106516.02",
  sales: [{ sourceId: "synthetic-farmland-01", scheduleA: firstSale }, { sourceId: "synthetic-farmland-02", scheduleA: secondSale }],
  independentlyReportedElectedGain: "76516.02",
} satisfies Form1062Input;

function lineValues(input: Form1062Input, lines: string[]) {
  const result = calculateForm1062(input);
  return lines.map(line => result.lines.find(row => row.line === line)?.value.toFixed());
}

describe("2026 Form 1062 worksheet", () => {
  it("calculates every numeric line for a synthetic qualified direct sale", () => {
    const result = calculateForm1062(source);
    expect(result.lines.map(row => [row.line, row.value.toFixed()])).toEqual([
      ["1", "9886"], ["2", "268"], ["3", "10154"], ["4a", "0"], ["4b", "0"], ["4c", "0"],
      ["4d", "0"], ["4z", "0"], ["5", "10154"], ["6", "86516"], ["7", "56516"], ["8", "30000"],
      ["9", "3104"], ["10", "0"], ["11", "3104"], ["12a", "0"], ["12b", "0"], ["12c", "0"],
      ["12d", "0"], ["12z", "0"], ["13", "3104"], ["14", "7050"], ["15", "1762.5"],
    ]);
    expect(result.applicableNetTaxLiability.toFixed()).toBe("7050");
    expect(result.firstInstallmentWholeDollars.toFixed()).toBe("1763");
    expect(result.deferredTax.toFixed()).toBe("5287.5");
    expect(result.scheduleACount).toBe(1);
  });

  it("counts separate elected sales and aggregates their exact gains before one tax comparison", () => {
    const result = calculateForm1062(multipleSales);
    expect(result.scheduleACount).toBe(2);
    expect(lineValues(multipleSales, ["6", "7", "8", "14", "15"]))
      .toEqual(["106516.02", "76516.02", "30000", "7050", "1762.5"]);
    expect(JSON.stringify(result.lines)).not.toContain("synthetic-farmland-");
    expect(result.lines.filter(row => row.line === "7")).toHaveLength(1);
  });

  it("keeps same-date and same-gain originals separate and rejects a repeated original", () => {
    const twoSameGain = {
      ...multipleSales,
      sales: [multipleSales.sales[0], { sourceId: "synthetic-farmland-03", scheduleA: { ...firstSale } }],
      taxableIncome: "143032", independentlyReportedElectedGain: "113032",
    };
    expect(lineValues(twoSameGain, ["7", "8"])).toEqual(["113032", "30000"]);
    expect(() => calculateForm1062({ ...twoSameGain, sales: [multipleSales.sales[0], { ...multipleSales.sales[1], sourceId: multipleSales.sales[0].sourceId }] }))
      .toThrow(/duplicate original sale/u);
  });

  it("rejects an incomplete, contradictory, or unreconciled set of elected sales", () => {
    for (const change of [
      { sales: [] }, { sales: [multipleSales.sales[0]] }, { sales: null }, { sale: firstSale }, { independentlyReportedElectedGain: undefined },
      { independentlyReportedElectedGain: "76516.01" },
      { withoutGain: { ...source.withoutGain, taxableIncome: "30000.01" } },
      { sales: [multipleSales.sales[0], { ...multipleSales.sales[1], sourceId: " " }] },
      { sales: [multipleSales.sales[0], { ...multipleSales.sales[1], sourceId: `${multipleSales.sales[0].sourceId}\n` }] },
      { sales: [multipleSales.sales[0], { ...multipleSales.sales[1], scheduleA: undefined }] },
      { sales: [multipleSales.sales[0], { ...multipleSales.sales[1], scheduleA: { ...secondSale, covenantIncluded: false } }] },
      { sales: [multipleSales.sales[0], { ...multipleSales.sales[1], scheduleA: { ...secondSale, wholePropertyQualifies: false } }] },
    ]) expect(() => calculateForm1062({ ...multipleSales, ...change } as unknown as Form1062Input)).toThrow(/Form 1062/u);
  });

  it("replays each credit group and limits the redetermined credit total", () => {
    const input = {
      ...source,
      withGain: { ...source.withGain, credits: { foreignTax: "250.01", nonrefundablePersonal: "10.02", generalBusiness: "30.03", otherApplicable: "75.04" } },
      withoutGain: { ...source.withoutGain, additions: "25.12", credits: { foreignTax: "3000.01", nonrefundablePersonal: "20.02", generalBusiness: "40.03", otherApplicable: "100.04" } },
    };
    expect(lineValues(input, ["4a", "4b", "4c", "4d", "4z", "5", "10", "11", "12a", "12b", "12c", "12d", "12z", "13", "14"]))
      .toEqual(["250.01", "10.02", "30.03", "75.04", "365.1", "9788.9", "25.12", "3129.12", "3000.01", "20.02", "40.03", "100.04", "3129.12", "0", "9788.9"]);
  });

  it("floors comparison taxable income and applicable liability separately", () => {
    const entireGain = { ...source, taxableIncome: "56515.99", withoutGain: { ...source.withoutGain, taxableIncome: "0", regularIncomeTax: "0" } };
    expect(lineValues(entireGain, ["6", "7", "8", "13", "14"]))
      .toEqual(["56515.99", "56516", "0", "0", "10154"]);
    for (const regularIncomeTax of ["10154", "10154.01"]) {
      const negativeOrZero = { ...source, withoutGain: { ...source.withoutGain, regularIncomeTax } };
      expect(lineValues(negativeOrZero, ["13", "14", "15"])).toEqual([regularIncomeTax, "0", "0"]);
    }
  });

  it("conserves the exact first installment and potential estimate exclusion", () => {
    const result = calculateForm1062({ ...source, withGain: { ...source.withGain, regularIncomeTax: "2836.01" } });
    expect(result.applicableNetTaxLiability.toFixed()).toBe("0.01");
    expect(result.firstInstallment.toFixed()).toBe("0.0025");
    expect(result.firstInstallmentWholeDollars.toFixed()).toBe("0");
    expect(result.deferredTax.toFixed()).toBe("0.0075");
    expect(result.firstInstallment.times(4).eq(result.applicableNetTaxLiability)).toBe(true);
  });

  it("rejects an incomplete or unreconciled election and tax determination", () => {
    for (const change of [
      { taxYear: 2025 }, { sale: undefined }, { sale: { ...qualifiedFarmlandSale, transactionType: "exchange" } },
      { sale: { ...qualifiedFarmlandSale, covenantIncluded: false } }, { electionConfirmed: false },
      { sale: { ...qualifiedFarmlandSale, independentlyReportedGain: "0" } },
      { taxableIncome: "" }, { taxableIncome: "1000000000000" },
      { withoutGain: { ...source.withoutGain, taxableIncome: "29999.99" } },
      { withoutGain: { ...source.withoutGain, additions: "-0.01" } },
      { withoutGain: { ...source.withoutGain, credits: { ...noCredits, generalBusiness: "0.001" } } },
      { withGain: { ...source.withGain, credits: { ...noCredits, foreignTax: "10154.01" } } },
    ]) expect(() => calculateForm1062({ ...source, ...change } as Form1062Input)).toThrow(/Form 1062/u);
  });
});

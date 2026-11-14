import { describe, expect, it } from "vitest";
import { calculateForm1062, type Form1062Input } from "@/engine/forms/form-1062.js";
import { calculateForm1062ScheduleA, type Form1062ScheduleAInput } from "@/engine/forms/form-1062-schedule-a.js";
import { qualifiedFarmlandSale } from "../../fixtures/form-1062-direct-sale.js";

// See spec/federal/form-1062-schedule-a.yaml.
const atsPartnershipAllocation = {
  taxYear: 2026,
  transactionType: "partnership_sale",
  saleDate: "2026-10-01",
  qualifyingFarmUseConfirmed: true,
  unitedStatesRealPropertyConfirmed: true,
  activeFarmerBuyerConfirmed: true,
  enforceableTenYearCovenantConfirmed: true,
  covenantIncluded: true,
  wholePropertyQualifies: true,
  allGainRecognizedThisYear: true,
  partnerAllocation: {
    sourceForm: "1065",
    sourceBox: "20",
    sourceCode: "ZZ",
    sourceTaxYear: 2026,
    section1062StatementConfirmed: true,
    entityScheduleAMatched: true,
    taxpayerAndEntityMatched: true,
    allocatedGain: "56516",
  },
  independentlyReportedGain: "56516",
} as const satisfies Form1062ScheduleAInput;

const shareholderAllocation = {
  ...atsPartnershipAllocation,
  transactionType: "s_corporation_sale",
  partnerAllocation: undefined,
  shareholderAllocation: {
    ...atsPartnershipAllocation.partnerAllocation,
    sourceForm: "1120-S",
    sourceBox: "17",
    allocatedGain: "25000.25",
  },
  independentlyReportedGain: "25000.25",
} as const satisfies Form1062ScheduleAInput;

describe("Schedule A (Form 1062)", () => {
  it("transfers a confirmed shareholder statement to line 13 alone", () => {
    const sale = shareholderAllocation;
    const schedule = calculateForm1062ScheduleA(sale);
    expect(schedule.lines.map(row => [row.line, row.value.toFixed(), row.inputs])).toEqual([["13", "25000.25", {}]]);
    expect(schedule.lines[0].formula).toMatch(/Form 1120-S K-1 box 17/u);
    const credits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
    const form = calculateForm1062({ taxYear: 2026, sale, electionConfirmed: true, taxableIncome: "40000.50",
      withGain: { regularIncomeTax: "5000", additions: "0", credits },
      withoutGain: { taxableIncome: "15000.25", regularIncomeTax: "1500", additions: "0", credits } });
    expect(form.lines.find(row => row.line === "7")?.value.toFixed()).toBe("25000.25");
    expect(form.firstInstallmentWholeDollars.toFixed()).toBe("875");
  });

  it("rejects mismatched shareholder statements and entity amounts", () => {
    const original = shareholderAllocation.shareholderAllocation;
    for (const unsupported of [
      { shareholderAllocation: undefined },
      { shareholderAllocation: { ...original, sourceForm: "1065" } },
      { shareholderAllocation: { ...original, sourceBox: "20" } },
      { shareholderAllocation: { ...original, sourceCode: "AA" } },
      { shareholderAllocation: { ...original, sourceTaxYear: 2025 } },
      { shareholderAllocation: { ...original, section1062StatementConfirmed: false } },
      { shareholderAllocation: { ...original, taxpayerAndEntityMatched: undefined } },
      { shareholderAllocation: { ...original, entityScheduleAMatched: false } },
      { shareholderAllocation: { ...original, allocatedGain: "25000.24" } },
      { partnerAllocation: atsPartnershipAllocation.partnerAllocation },
      { grossProceeds: "300000" }, { adjustedBasis: "100000" }, { sellingExpenses: "0" },
      { unadjustedBasis: "100000" }, { covenantIncluded: false },
    ]) {
      expect(() => calculateForm1062ScheduleA({ ...shareholderAllocation, ...unsupported } as unknown as Form1062ScheduleAInput))
        .toThrow(/Form 1062.*(?:matched Form 1120-S|reconciles|every qualification)/u);
    }
  });

  it("transfers the IRS ATS scenario 13 partnership gain with lines 9 through 12 blank", () => {
    // IRS ATS scenario 13, pages 30–31. The source confirmations are synthetic.
    const schedule = calculateForm1062ScheduleA(atsPartnershipAllocation);
    expect(schedule.lines.map(row => [row.line, row.value.toFixed()])).toEqual([["13", "56516"]]);
    const credits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
    const result = calculateForm1062({
      taxYear: 2026, sale: atsPartnershipAllocation, electionConfirmed: true, taxableIncome: "144468",
      withGain: { regularIncomeTax: "16896", additions: "1413", credits },
      withoutGain: { taxableIncome: "87952", regularIncomeTax: "3275", additions: "1413", credits },
    });
    const values = new Map(result.lines.map(row => [row.line, row.value.toFixed()]));
    expect(["5", "7", "8", "13", "14", "15"].map(line => values.get(line)))
      .toEqual(["18309", "56516", "87952", "4688", "13621", "3405.25"]);
    expect(result.firstInstallmentWholeDollars.toFixed()).toBe("3405");
    expect(result.deferredTax.toFixed()).toBe("10215.75");
    expect(schedule.lines.every(row => Object.keys(row.inputs).length === 0)).toBe(true);
  });

  it("rejects missing or incompatible partnership source records", () => {
    const original = atsPartnershipAllocation.partnerAllocation;
    for (const partnerAllocation of [
      undefined,
      { ...original, sourceForm: "1120-S" },
      { ...original, sourceBox: "17" },
      { ...original, sourceCode: "Other" },
      { ...original, sourceTaxYear: 2025 },
      { ...original, section1062StatementConfirmed: false },
      { ...original, entityScheduleAMatched: undefined },
      { ...original, taxpayerAndEntityMatched: false },
      { ...original, allocatedGain: "56516.01" },
    ]) {
      expect(() => calculateForm1062ScheduleA({ ...atsPartnershipAllocation, partnerAllocation } as Form1062ScheduleAInput))
        .toThrow(/Form 1062/u);
    }
    for (const changes of [
      { grossProceeds: "500000" }, { sellingExpenses: "0" }, { unadjustedBasis: "443484" }, { adjustedBasis: "443484" },
      { independentlyReportedGain: "56515.99" }, { covenantIncluded: false }, { wholePropertyQualifies: false },
    ]) {
      expect(() => calculateForm1062ScheduleA({ ...atsPartnershipAllocation, ...changes } as Form1062ScheduleAInput))
        .toThrow(/Form 1062/u);
    }
    expect(() => calculateForm1062ScheduleA({
      ...qualifiedFarmlandSale, partnerAllocation: original,
    } as unknown as Form1062ScheduleAInput)).toThrow(/Form 1062/u);
    expect(() => calculateForm1062ScheduleA({
      ...atsPartnershipAllocation, shareholderAllocation: shareholderAllocation.shareholderAllocation,
    } as unknown as Form1062ScheduleAInput)).toThrow(/matched Form 1065/u);
  });

  it("transfers only the reconciled direct-sale gain to Form 1062", () => {
    const result = calculateForm1062ScheduleA(qualifiedFarmlandSale);
    expect(result.lines.map(row => [row.line, row.value.toFixed()])).toEqual([
      ["9", "500000"], ["10", "500000"], ["11", "443484"], ["12", "443484"], ["13", "56516"],
    ]);
    const credits = { foreignTax: "0", nonrefundablePersonal: "0", generalBusiness: "0", otherApplicable: "0" };
    const input = { taxYear: 2026, sale: qualifiedFarmlandSale, electionConfirmed: true, taxableIncome: "86516",
      withGain: { regularIncomeTax: "9886", additions: "268", credits },
      withoutGain: { taxableIncome: "30000", regularIncomeTax: "3104", additions: "0", credits } } satisfies Form1062Input;
    const form = calculateForm1062(input);
    expect(form.lines.find(row => row.line === "7")?.value.toFixed()).toBe("56516");
    expect(form.applicableNetTaxLiability.toFixed()).toBe("7050");
    expect(form.firstInstallmentWholeDollars.toFixed()).toBe("1763");
    expect(() => calculateForm1062({
      ...input, sale: { ...qualifiedFarmlandSale, independentlyReportedGain: "56515.99" },
    })).toThrow(/Form 1062.*reconcile/u);
  });

  it("deducts actual selling expenses and preserves the supplied basis amounts", () => {
    const result = calculateForm1062ScheduleA({ ...qualifiedFarmlandSale, grossProceeds: "501000.01",
      sellingExpenses: "1000.02", unadjustedBasis: "443484", adjustedBasis: "440000.98", independentlyReportedGain: "59999.01" });
    expect(result.lines.map(row => row.value.toFixed())).toEqual(["501000.01", "499999.99", "443484", "440000.98", "59999.01"]);
    expect(result.recognizedGain.toFixed()).toBe("59999.01");
    expect(result.lines.every(row => Object.keys(row.inputs).length === 0)).toBe(true);
  });

  it("rejects incomplete qualifications and incompatible sale originals", () => {
    for (const change of [
      { taxYear: 2025 }, { transactionType: "installment_sale" }, { saleDate: "2026-02-29" }, { saleDate: "2027-01-01" },
      { qualifyingFarmUseConfirmed: false }, { unitedStatesRealPropertyConfirmed: undefined }, { activeFarmerBuyerConfirmed: undefined },
      { enforceableTenYearCovenantConfirmed: false }, { covenantIncluded: false }, { wholePropertyQualifies: false },
      { allGainRecognizedThisYear: false }, { sellingExpenses: "" }, { sellingExpenses: "500000.01" },
      { adjustedBasis: "500000", independentlyReportedGain: "0" }, { adjustedBasis: "500000.01" },
      { adjustedBasis: "443484.001" }, { independentlyReportedGain: "56516.01" }, { unadjustedBasis: undefined },
    ]) expect(() => calculateForm1062ScheduleA({ ...qualifiedFarmlandSale, ...change } as Form1062ScheduleAInput)).toThrow(/Form 1062/u);
  });
});

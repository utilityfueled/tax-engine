import { describe, expect, it } from "vitest";
import { calculateForm1062, type Form1062Input } from "@/engine/forms/form-1062.js";
import { calculateForm1062ScheduleA, type Form1062ScheduleAInput } from "@/engine/forms/form-1062-schedule-a.js";
import { qualifiedFarmlandSale } from "../../fixtures/form-1062-direct-sale.js";

// See spec/federal/form-1062-schedule-a.yaml.
describe("Schedule A (Form 1062) direct sale", () => {
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

// Spec: spec/federal/guided-minimum-tax-credit.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildMinimumTaxCreditInput, emptyMinimumTaxCredit, minimumTaxCreditFactErrors, type MinimumTaxCreditData } from "@/lib/guided-minimum-tax-credit";
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";

function source(): MinimumTaxCreditData {
  return { ...structuredClone(emptyMinimumTaxCredit), sourceTaxYear: "2025", priorYear: "2024", sourceReference: "Actual prior6251 and8801 worksheets",
    sourceFactsConfirmed: true, allSourcesIncluded: true, sameTaxpayersAsPriorYear: true, primaryName: "Jordan Example", primaryTaxIdLast4: "3333",
    priorYearFilingStatus: "single", priorYearForm6251Line1And2e: "50000", priorYearExclusionItemAdjustments: "14600", priorYearMinimumTaxCreditNOLDeduction: "0",
    priorYearMinimumTaxForeignTaxCredit: "0", priorYearForm6251Line10: "4000", priorYearAMT: "1000", unusedMinimumTaxCreditCarryforward: "200",
    priorYearUnallowedQualifiedElectricVehicleCredit: "0", priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false };
}
const build = (data: MinimumTaxCreditData) => buildMinimumTaxCreditInput(data, 2025, "single", completePersonalInfo);
function stateWith(data = source()) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", socialSecurityWages: "50000", medicareWages: "50000", federalWithheld: "6000" }] };
  state.sectionData.credits = { ...structuredClone(emptyCreditsData), minimumTaxCredit: data };
  return state;
}
it("binds actual prior-year sources and taxpayer continuity", () => {
  expect(buildMinimumTaxCreditInput(undefined, 2025, "single", completePersonalInfo)).toBeUndefined();
  expect(build(source())).toMatchObject({ priorYear: 2024, priorYearFilingStatus: "single", sourceFactsComplete: true, sourceFactsConfirmed: true });
  for (const patch of [{ sourceTaxYear: "2026" }, { priorYear: "2023" }, { primaryTaxIdLast4: "4444" }, { primaryName: "Someone Else" },
    { sameTaxpayersAsPriorYear: false }, { sameTaxpayersAsPriorYear: null }, { allSourcesIncluded: null }, { sourceReference: "" }, { priorYearFilingStatus: "mfj" }]) {
    expect(() => build({ ...source(), ...patch } as MinimumTaxCreditData)).toThrow();
  }
  const joint = { ...source(), priorYearFilingStatus: "mfj" as const, spouseName: "Taylor Example", spouseTaxIdLast4: "4444" };
  expect(buildMinimumTaxCreditInput(joint, 2025, "mfj", completePersonalInfo)?.priorYearFilingStatus).toBe("married_filing_jointly");
  expect(() => buildMinimumTaxCreditInput({ ...joint, spouseTaxIdLast4: "" }, 2025, "mfj", completePersonalInfo)).toThrow(/spouse|identity/i);
});
it("preserves signed original amounts and rejects missing defaults", () => {
  const actual = { ...source(), priorYearForm6251Line1And2e: "-9007199254740993.03", priorYearExclusionItemAdjustments: "-0.01", unusedMinimumTaxCreditCarryforward: "0" };
  expect(build(actual)).toMatchObject({ priorYearForm6251Line1And2e: "-9007199254740993.03", priorYearExclusionItemAdjustments: "-0.01", unusedMinimumTaxCreditCarryforward: "0", priorYearMinimumTaxForeignTaxCredit: "0" });
  for (const key of ["priorYearForm6251Line1And2e", "priorYearExclusionItemAdjustments", "priorYearAMT", "unusedMinimumTaxCreditCarryforward", "priorYearMinimumTaxCreditNOLDeduction", "priorYearMinimumTaxForeignTaxCredit", "priorYearForm6251Line10", "priorYearUnallowedQualifiedElectricVehicleCredit"] as const) {
    expect(Object.keys(minimumTaxCreditFactErrors({ ...source(), [key]: "" }, 2025, "single", completePersonalInfo))).not.toHaveLength(0);
  }
  for (const value of ["NaN", "Infinity", "-1"]) expect(() => build({ ...source(), priorYearAMT: value })).toThrow();
  expect(build(source())?.priorYearTaxableIncome).toBeUndefined();
  expect(build(source())?.priorYearRegularTax).toBeUndefined();
});
it("retains and validates actual special worksheet branches", () => {
  const data = source(); data.priorYearCapitalGainsRequired = true;
  expect(() => build(data)).toThrow(/capital|worksheet/i);
  data.capitalGainsWorksheet = { method: "schedule_d", preferentialIncome: "20000.25", ordinaryIncomeForZeroRate: "180000", ordinaryIncomeForFifteenRate: "160000", section1250Gain: "30000", scheduleDTaxWorksheetLine10: "40000" };
  expect(build(data)?.priorYearCapitalGainsWorksheet?.preferentialIncome).toBe("20000.25");
  data.priorYearFiledForm2555 = true;
  expect(() => build(data)).toThrow(/foreign|exclu|amount/i);
  data.foreignEarnedIncome = { form2555Lines45And50: "120000", disallowedDeductions: "20000", capitalGainAdjustmentsConfirmed: true };
  expect(build(data)?.priorYearForeignEarnedIncome).toEqual(data.foreignEarnedIncome);
  data.priorYearFiledForm1040NR = true; data.priorYearNetUSRealPropertyGain = "0";
  expect(build(data)?.priorYearNetUSRealPropertyGain).toBe("0");
  expect(build({ ...data, priorYearFiledForm1040NR: false })?.priorYearNetUSRealPropertyGain).toBe("0");
  data.priorYearNetUSRealPropertyGain = "1000";
  for (const patch of [{ priorYearCapitalGainsRequired: false }, { priorYearFiledForm2555: false }, { priorYearFiledForm1040NR: false }]) expect(() => build({ ...data, ...patch })).toThrow(/reconcil|contradict|applicab/i);
  data.capitalGainsWorksheet.method = "qualified_dividends";
  expect(() => build(data)).toThrow(/worksheet|ordinary|Schedule D/i);
  data.capitalGainsWorksheet = { method: "qualified_dividends", preferentialIncome: "20000", ordinaryIncomeForZeroRate: "100000", ordinaryIncomeForFifteenRate: "100000", section1250Gain: "", scheduleDTaxWorksheetLine10: "" };
  expect(build(data)?.priorYearCapitalGainsWorksheet?.section1250Gain).toBeUndefined();
  data.foreignEarnedIncome.capitalGainAdjustmentsConfirmed = false;
  expect(() => build(data)).toThrow(/capital.*adjust/i);
});
it("calculates the actual credit and retained carryforward canonically", () => {
  const state = stateWith(); expect(validateSection(state, "credits").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state); expect(input?.form8801).toBeDefined();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.form8801?.sourceFactsVerified).toBe(true);
  expect(result.form8801?.creditAllowed.toFixed()).toBe("1200");
  expect(result.form8801?.carryforwardToNextYear.toFixed()).toBe("0");
  expect(result.totalTax.toFixed()).toBe("2675");
  state.sectionData.credits = { ...state.sectionData.credits, minimumTaxCredit: { ...source(), unusedMinimumTaxCreditCarryforward: "5000" } };
  const carried = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(carried.form8801?.creditAllowed.toFixed()).toBe("3875");
  expect(carried.form8801?.carryforwardToNextYear.toFixed()).toBe("2125");
  expect(carried.totalTax.toFixed()).toBe("0");
});
it("revokes confirmation without erasing the original worksheet", () => {
  const state = stateWith();
  const changed = updateSectionData(state, "personal-info", { ...state.sectionData["personal-info"], firstName: "Changed" });
  expect(changed.sectionData.credits?.minimumTaxCredit?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.credits?.minimumTaxCredit?.primaryName).toBe("Jordan Example");
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(state, "credits", { ...state.sectionData.credits, minimumTaxCredit: { ...source(), sourceFactsConfirmed: true } });
  expect(confirmed.sectionData.credits?.minimumTaxCredit?.sourceFactsConfirmed).toBe(true);
});

/** Spec: spec/federal/form-8801.yaml, original-source-presence. */
import { expect, it } from "vitest";
import { Form8801Schema } from "@/models/inputs.js";
const legacy = { priorYearFilingStatus: "single", priorYearTaxableIncome: "200000", priorYearRegularTax: "35000" };
it("preserves unknown actual worksheet facts and original-source completeness", () => {
  const unknown = Form8801Schema.parse(legacy);
  expect(unknown.sourceFactsComplete).toBe(false);
  expect(unknown.priorYearMinimumTaxForeignTaxCredit).toBeUndefined();
  expect(unknown.priorYearFiledForm2555).toBeUndefined();
  expect(unknown.priorYearCapitalGainsRequired).toBeUndefined();
  expect(Form8801Schema.parse(unknown).sourceFactsComplete).toBe(false);
  expect(Form8801Schema.parse({ ...legacy, sourceFactsComplete: true }).sourceFactsComplete).toBe(false);
  const complete = Form8801Schema.parse({ ...legacy, priorYearAMT: "0", priorYearExclusionItemAdjustments: "0", unusedMinimumTaxCreditCarryforward: "0", priorYear: 2025, sourceFactsConfirmed: true, priorYearForm6251Line1And2e: "210000", priorYearMinimumTaxCreditNOLDeduction: "0", priorYearMinimumTaxForeignTaxCredit: "0", priorYearForm6251Line10: "35000", priorYearUnallowedQualifiedElectricVehicleCredit: "0", priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false });
  expect(complete.sourceFactsComplete).toBe(true);
  expect(complete.priorYearMinimumTaxForeignTaxCredit).toBe("0");
  expect(complete.priorYearFiledForm2555).toBe(false);
  expect(complete.priorYear).toBe(2025);
  const actualOnly = Form8801Schema.parse({ ...complete, priorYearTaxableIncome: undefined, priorYearRegularTax: undefined });
  expect(actualOnly.priorYearTaxableIncome).toBeUndefined();
  expect(actualOnly.priorYearRegularTax).toBeUndefined();
  expect(actualOnly.sourceFactsComplete).toBe(true);
});
it("retains actual partial capital and foreign worksheet sources without manufacturing amounts", () => {
  const facts = Form8801Schema.parse({ ...legacy, priorYearCapitalGainsWorksheet: { method: "schedule_d", preferentialIncome: "15000", ordinaryIncomeForZeroRate: "45000", ordinaryIncomeForFifteenRate: "35000" }, priorYearForeignEarnedIncome: { form2555Lines45And50: "200000", disallowedDeductions: "10000", capitalGainAdjustmentsConfirmed: false } });
  expect(facts.priorYearCapitalGainsWorksheet?.preferentialIncome).toBe("15000");
  expect(facts.priorYearCapitalGainsWorksheet?.section1250Gain).toBeUndefined();
  expect(facts.priorYearForeignEarnedIncome?.capitalGainAdjustmentsConfirmed).toBe(false);
  expect(() => Form8801Schema.parse({ ...legacy, priorYearMinimumTaxForeignTaxCredit: "NaN" })).toThrow();
  expect(() => Form8801Schema.parse({ ...legacy, priorYearCapitalGainsWorksheet: { method: "estimated" } })).toThrow();
});

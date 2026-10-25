// Spec: spec/federal/premium-tax-credit-return.yaml.
import { expect, it } from "vitest";
import { calculatePremiumTaxCreditReturn } from "@/engine/forms/premium-tax-credit-return.js";
import { d } from "@/utils/decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form8962: {
  taxFamilySize: 1, fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "0",
  householdFactsConfirmed: true, canBeClaimedAsDependent: false, belowPovertyException: "none",
  coverageFactsConfirmed: true, allocationRequired: false, alternativeMarriageCalculationElected: false,
  selfEmployedHealthInsuranceCoordinationRequired: false, lawfulPresenceReconciliationRequired: false,
  qsehraAffected: false, monthlyReconciliation: [],
} });
it("reconciles actual return components and preserves signed taxpayer income", () => {
  const params = { input, agi: d(-10000), taxExemptInterest: d(1000), foreignIncomeReduction: d(3000),
    foreignHousingDeduction: d(500), socialSecurityBenefitsGross: d(2000), socialSecurityBenefitsTaxable: d(300) };
  const result = calculatePremiumTaxCreditReturn(params);
  expect(result.modifiedAGI.toFixed()).toBe("0");
  expect(result.lines.find(row => row.form === "Form 8962" && row.line === "2a")?.value.toFixed()).toBe("-3800");
  expect(result.lines.find(row => row.form === "Form8962 Worksheet1-1" && row.line === "3")?.value.toFixed()).toBe("3500");
  const facts = input.form8962;
  if (!facts) throw new Error("Synthetic actual facts missing");
  expect(() => calculatePremiumTaxCreditReturn({ ...params, input: { ...input, form8962: { ...facts, taxpayerModifiedAGI: "0" } } })).toThrow(/modified.*income|MAGI|reconcile/i);
  expect(calculatePremiumTaxCreditReturn({ ...params, input: { ...input, form8962: { ...facts, taxpayerModifiedAGI: "-3800", requiredFilingDependentsModifiedAGI: "5000" } } }).modifiedAGI.toFixed()).toBe("1200");
  expect(() => calculatePremiumTaxCreditReturn({ ...params, taxExemptInterest: d(-1) })).toThrow(/nonnegative|invalid/i);
  expect(() => calculatePremiumTaxCreditReturn({ ...params, agi: d(Infinity) })).toThrow(/finite|invalid/i);
});

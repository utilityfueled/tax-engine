// Spec: spec/federal/guided-input.yaml, retirement-ira-checkbox
import { expect, it } from "vitest";
import { buildRetirementInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRetirementEntry } from "@/lib/guided-interview-flow";
import { Form1099RSchema, TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { startCompleteInterview } from "./complete-facts";

it("retains the actual IRA checkbox through schema validation and IRA income routing", () => {
  const source = { ...emptyRetirementEntry, payer: "Actual IRA custodian", grossDistribution: "25000", taxableAmount: "25000", federalWithheld: "3000", distributionCode: "7", isIraSepSimple: true };
  expect(Form1099RSchema.parse(buildRetirementInputs([source])[0]).iraSepSimple).toBe(true);
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.sectionData["personal-info"]!.dateOfBirth = "1950-01-01";
  state.sectionData["income-retirement"] = { entries: [source] };
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(result.iraDistributionsTaxable.toFixed()).toBe("25000");
  expect(result.pensionDistributionsTaxable.toFixed()).toBe("0");
});

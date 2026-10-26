// Spec: spec/federal/marketplace-health-owners.yaml.
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildSectionRoute, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { healthInsuranceSourceOptions } from "@/lib/guided-health-insurance-facts";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedMarketplaceHealthOwnersState } from "../fixtures/guided-marketplace-health-owners";

it("calculates two actual owners from the saved guide without an allowance override", () => {
  const state = guidedMarketplaceHealthOwnersState(), before = JSON.stringify(state);
  expect(buildSectionRoute(state.segmentation).map(row => row.id)).toContain("adjustments");
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(validateSection(state, "credits").status).toBe("complete");
  const options = healthInsuranceSourceOptions(state.sectionData["income-self-employment"], state.sectionData["income-w2"]?.entries);
  expect(options.map(row => [row.sourceId, row.accountHolder])).toEqual([["scheduleC", "primary"], ["formW2:0", "spouse"]]);
  const built = buildTaxInputFromGuidedData(state);
  expect(built).not.toBeNull();
  expect(built?.form7206?.plans?.map(plan => [plan.accountHolder, plan.businessSourceId, plan.marketplacePolicySourceIds])).toEqual([["primary", "scheduleC", ["form1095A:0"]], ["spouse", "formW2:0", ["form1095A:1"]]]);
  expect(built?.adjustments?.selfEmployedHealthInsurance ?? "0").toBe("0");
  const result = calculateFederalTax(TaxYearInputSchema.parse(built));
  // Actual W2 already includes shareholder premiums; no wage addback here.
  // 50000-2119-9000=38881; 190%/.016 =>622, Step2=7778.
  // 9000-7778=1222. Final46659 at228%/.0312 =>1456, PTC6944.
  expect(result.totalIncome.toFixed()).toBe("50000");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("7778");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1222");
  expect(result.agi.toFixed()).toBe("46659");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("6944");
  const qbi = result.allLines.find(row => row.form === "QBI Source Deductions" && row.line === "scheduleC");
  expect(qbi?.inputs["SE health insurance"].toString()).toBe("815");
  expect(result.allLines.filter(row => row.form === "Form 8962" && row.line === "24")).toHaveLength(1);
  expect(JSON.stringify(state)).toBe(before);
  const unknown = guidedMarketplaceHealthOwnersState();
  if (!unknown.sectionData.adjustments?.healthInsuranceFacts?.plans[1]) throw new Error("Missing spouse plan");
  unknown.sectionData.adjustments.healthInsuranceFacts.plans[1].moreThanTwoPercentShareholder = null;
  expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
  const wrongOwner = guidedMarketplaceHealthOwnersState();
  if (!wrongOwner.sectionData["income-w2"]?.entries[0]) throw new Error("Missing spouse W2");
  wrongOwner.sectionData["income-w2"].entries[0].accountHolder = "primary";
  expect(buildTaxInputFromGuidedData(wrongOwner)).toBeNull();
  const wages = state.sectionData["income-w2"];
  if (!wages) throw new Error("Missing actual wages");
  const changed = updateSectionData(state, "income-w2", { entries: wages.entries.map(row => ({ ...row, wages: "20000.01" })) });
  expect(changed.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
});

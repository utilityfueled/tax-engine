// Spec: spec/federal/guided-input.yaml#ira-actual-compensation-sources
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeIraSources, startCompleteInterview } from "./complete-facts";

function stateWith(ira = completeIraSources) { const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null }); state.sectionData.adjustments = { ...emptyAdjustmentData, iraContributions: ira }; return state; }
it("forwards actual compensation Roth and plan contributions without wage proxies", () => {
  const state = stateWith();
  expect(buildTaxInputFromGuidedData(state)?.iraDeductionWorksheet).toMatchObject({ primaryContributions: "1000.10", primaryIsActiveParticipant: false, primaryCompensation: "5000.20", primaryRothContributions: "0", primarySection501c18Contributions: "0", sourceFactsConfirmed: true });
  state.sectionData.adjustments!.iraContributions = { ...completeIraSources, primaryCompensation: "9007199254740993.01" };
  expect(buildTaxInputFromGuidedData(state)?.iraDeductionWorksheet?.primaryCompensation).toBe("9007199254740993.01");
  state.sectionData.adjustments!.iraContributions = { ...completeIraSources, primaryContributions: "0", primaryCompensation: "0" };
  expect(buildTaxInputFromGuidedData(state)?.iraDeductionWorksheet).toMatchObject({ primaryContributions: "0", primaryCompensation: "0" });
});
it("keeps legacy and edited IRA source facts incomplete including explicit false confirmation", () => {
  for (const [field, value] of [["primaryCompensation", ""], ["primaryRothContributions", ""], ["primarySection501c18Contributions", "-1"], ["contributionTaxYear", "2024"], ["contributionTimingConfirmed", false], ["specialContributionRulesRequired", true], ["sourceFactsConfirmed", false]]) {
    const state = stateWith({ ...completeIraSources, [field as string]: value });
    expect(buildTaxInputFromGuidedData(state), field as string).toBeNull();
    expect(validateSection(state, "adjustments").status).toBe("partial");
  }
});
it("requires separate joint compensation and contribution facts without allocating a spouse's income", () => {
  const state = stateWith(); state.segmentation.filingStatus = "mfj";
  state.sectionData["personal-info"]!.spouse = { firstName: "Alex", lastName: "Example", ssn: "444-55-6666", dateOfBirth: "1980-01-01", usResidencyMonths: "12" };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const ira = { ...completeIraSources, primaryCompensation: "0", spouseCompensation: "30000", primaryContributions: "7000", spouseContributions: "6500", spouseRothContributions: "500", spouseSection501c18Contributions: "0", spouseIsActiveParticipant: false };
  state.sectionData.adjustments!.iraContributions = ira;
  expect(buildTaxInputFromGuidedData(state)?.iraDeductionWorksheet).toMatchObject({ primaryCompensation: "0", spouseCompensation: "30000", spouseContributions: "6500", spouseRothContributions: "500", spouseSection501c18Contributions: "0", spouseIsActiveParticipant: false });
});
it("uses the actual January first birth date for IRA catch-up eligibility", () => {
  const state = stateWith({ ...completeIraSources, primaryContributions: "8000", primaryCompensation: "10000" }); state.sectionData["personal-info"]!.dateOfBirth = "1976-01-01";
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.iraDeductionWorksheet).not.toHaveProperty("primaryAge50OrOlder");
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).iraDeductionWorksheet?.primary.contributionLimit.toFixed()).toBe("8000");
});
it("requires renewed source confirmation after payroll or business facts change", () => {
  const state = stateWith();
  for (const section of ["income-w2", "income-self-employment", "income-retirement"]) {
    const changed = updateSectionData(state, section, { entries: [] });
    expect(changed.sectionData.adjustments?.iraContributions?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
});

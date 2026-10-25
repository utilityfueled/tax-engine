// Spec: spec/federal/guided-input.yaml, adjustment-source-facts / household-employee-facts
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, emptyOtherTaxesData, validateSection } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";
import { adjustmentFactErrors, householdFactErrors } from "@/lib/guided-adjustment-facts";

function stateWith(section: "adjustments" | "other-taxes", data: unknown) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, sectionData: { ...state.sectionData, [section]: data } };
}

describe("actual adjustment and employee facts", () => {
  it("does not silently drop legacy IRA or alimony amounts", () => {
    for (const field of ["iraDeduction", "alimonyPaid"] as const) {
      const state = stateWith("adjustments", { ...emptyAdjustmentData, [field]: "100" });
      expect(validateSection(state, "adjustments").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
  });
  it("uses actual IRA contributions and preserves false coverage facts", () => {
    const data = { ...emptyAdjustmentData, iraDeduction: "100", iraContributions: { primaryContributions: "6000.10", primaryIsActiveParticipant: false, spouseContributions: "", spouseIsActiveParticipant: null } };
    const state = stateWith("adjustments", data);
    expect(buildTaxInputFromGuidedData(state)?.iraDeductionWorksheet).toMatchObject({ primaryContributions: "6000.10", primaryIsActiveParticipant: false, primaryAge50OrOlder: false });
    expect(buildTaxInputFromGuidedData(state)?.adjustments ?? {}).not.toHaveProperty("iraDeduction");
    expect(buildTaxInputFromGuidedData(stateWith("adjustments", { ...data, iraContributions: { ...data.iraContributions, primaryIsActiveParticipant: null } }))).toBeNull();
  });
  it("distinguishes grandfathered eligible alimony from new-rule payments", () => {
    const qualification = { instrumentDate: "2017-06-01", post2018ModificationAppliesNewRules: false, paidInCash: true, notDesignatedNondeductible: true, notChildSupport: true, noJointReturnWithRecipient: true, householdRequirementMet: true, noPaymentsAfterRecipientDeath: true, recipientSsn: "222-33-4444" };
    const data = { ...emptyAdjustmentData, alimonyPaid: "1234.56", alimonyQualification: qualification };
    expect(buildTaxInputFromGuidedData(stateWith("adjustments", data))?.adjustments).toMatchObject({ alimonyPaid: "1234.56", alimonyRecipientSSN: "222-33-4444" });
    for (const change of [{ instrumentDate: "2019-01-01" }, { post2018ModificationAppliesNewRules: true }, { noPaymentsAfterRecipientDeath: false }]) {
      expect(buildTaxInputFromGuidedData(stateWith("adjustments", { ...data, alimonyQualification: { ...qualification, ...change } }))?.adjustments?.alimonyPaid).toBe("0");
    }
    expect(buildTaxInputFromGuidedData(stateWith("adjustments", { ...data, alimonyQualification: { ...qualification, recipientSsn: "" } }))).toBeNull();
  });
  it("requires each household employee and actual FUTA facts", () => {
    const legacy = stateWith("other-taxes", { ...emptyOtherTaxesData, householdEmploymentWages: "3000.03" });
    expect(validateSection(legacy, "other-taxes").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
    const employee = { name: "Actual Employee", cashWages: "1000.01", federalIncomeTaxWithheld: "0", isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false };
    const data = { ...emptyOtherTaxesData, householdEmploymentWages: "3000.03", householdEmployees: [employee, { ...employee, name: "Second Employee", cashWages: "2000.02" }], futaApplies: false, futaSectionA: null };
    const result = buildTaxInputFromGuidedData(stateWith("other-taxes", data));
    expect(result?.scheduleH).toMatchObject({ employees: [employee, { ...employee, name: "Second Employee", cashWages: "2000.02" }], futaApplies: false });
    expect(buildTaxInputFromGuidedData(stateWith("other-taxes", { ...data, futaApplies: undefined }))).toBeNull();
  });
  it("rejects malformed amounts and unknown joint-return coverage without throwing", () => {
    expect(adjustmentFactErrors({ ...emptyAdjustmentData, iraDeduction: "-", alimonyPaid: "-1" })).toHaveProperty("iraDeduction");
    const iraContributions = { primaryContributions: "100", primaryIsActiveParticipant: false, spouseContributions: "0", spouseIsActiveParticipant: null };
    expect(adjustmentFactErrors({ ...emptyAdjustmentData, iraContributions }, "mfj")).toHaveProperty("spouseIsActiveParticipant");
    expect(adjustmentFactErrors({ ...emptyAdjustmentData, iraContributions: { ...iraContributions, spouseContributions: "100" } }, "single")).toHaveProperty("spouseContributions");
    expect(householdFactErrors({ ...emptyOtherTaxesData, householdEmploymentWages: "-" })).toHaveProperty("householdEmploymentWages");
  });
  it("requires actual FUTA Section B amounts and checks wage reconciliation", () => {
    const employee = { name: "Actual Employee", cashWages: "100", federalIncomeTaxWithheld: "0", isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false };
    const data = { ...emptyOtherTaxesData, householdEmployees: [employee], futaApplies: true, futaSectionA: false, stateUnemploymentContributions: "", stateUnemploymentContributionsPaidLate: "", futaCreditReduction: "", futaStatePeriods: [{ state: "OH", periodStart: "2025-01-01", periodEnd: "2025-12-31", taxableWages: "100", hasAssignedExperienceRate: true, experienceRatePercent: "3", contributionsPaidTimely: "0" }] };
    expect(householdFactErrors(data)).toHaveProperty("stateUnemploymentContributionsPaidLate");
    expect(householdFactErrors({ ...data, stateUnemploymentContributions: "0", stateUnemploymentContributionsPaidLate: "0", futaCreditReduction: "0" })).toEqual({});
    expect(householdFactErrors({ ...data, stateUnemploymentContributions: "0", stateUnemploymentContributionsPaidLate: "0", futaCreditReduction: "0", householdEmploymentWages: "101" })).toHaveProperty("householdEmploymentWages");
    expect(householdFactErrors({ ...data, householdEmployees: [{ ...employee, federalIncomeTaxWithheld: "101" }] })).toHaveProperty("employee-0-federalIncomeTaxWithheld");
  });
});

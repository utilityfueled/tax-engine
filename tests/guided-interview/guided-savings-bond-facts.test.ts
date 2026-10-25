// Spec: spec/federal/guided-savings-bond-sources.yaml
import { describe, expect, it } from "vitest";
import { actualSavingsBondData } from "../fixtures/guided-savings-bond";
import { buildSavingsBondInputs, savingsBondFactErrors } from "@/lib/guided-savings-bond-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildForm8815ReferenceSummary } from "@/pdf/fill-form-8815.js";
import { completeInterestSource, completePersonalInfo, completeDependent, startCompleteInterview } from "./complete-facts";


const interest = [{ ...completeInterestSource, interestIncome: "100", usSavingsBondInterest: "2000" }];
function stateWithBonds() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
  state.sectionData["income-investments"] = { interestEntries: structuredClone(interest), dividendEntries: [], brokerageEntries: [] };
  state.sectionData.credits = { ...emptyCreditsData, ...state.sectionData.credits, savingsBondEducation: actualSavingsBondData() };
  return state;
}

describe("actual guided savings-bond sources", () => {
  it("preserves and validates actual joint income ownership records", () => {
    const data = actualSavingsBondData();
    Object.assign(data.redemptions[0], { registeredOwner: "taxpayer_and_spouse", ageTestOwner: "taxpayer",
      incomeOwnershipTaxpayerPurchaseFunds: "6,000", incomeOwnershipSpousePurchaseFunds: "2,000",
      incomeOwnershipTaxpayerPriorYearInterestReported: "100", incomeOwnershipSpousePriorYearInterestReported: "400",
      incomeOwnershipCommunityProperty: false, incomeOwnershipUnchangedSinceIssueConfirmed: true,
      incomeOwnershipSourceFactsConfirmed: true, incomeOwnershipSourceReference: "Actual original records" });
    const result = buildSavingsBondInputs(data, 2025, "mfj", interest, completePersonalInfo);
    expect(result.savingsBondRedemptions?.[0].incomeOwnership).toEqual({ taxpayerPurchaseFunds: "6000", spousePurchaseFunds: "2000", taxpayerPriorYearInterestReported: "100", spousePriorYearInterestReported: "400", communityProperty: false, ownershipUnchangedSinceIssueConfirmed: true, sourceFactsConfirmed: true, sourceReference: "Actual original records" });
    data.redemptions[0].incomeOwnershipSourceFactsConfirmed = false;
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, completePersonalInfo)).toThrow(/confirmed|source/i);
    data.redemptions[0].incomeOwnershipSourceFactsConfirmed = true;
    data.redemptions[0].incomeOwnershipSpousePurchaseFunds = "2001";
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, completePersonalInfo)).toThrow(/purchase|principal/i);
    data.redemptions[0].incomeOwnershipSpousePurchaseFunds = "";
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, completePersonalInfo)).toThrow(/actual|complete/i);
  });
  it("preserves unknown bond sources and exact entered amounts", () => {
    expect(buildSavingsBondInputs(undefined, 2025, "single", interest, completePersonalInfo)).toEqual({});
    expect(savingsBondFactErrors({ taxYear: "2025" }, 2025, "single", interest, completePersonalInfo)).toHaveProperty("savingsBondEducation");
    const data = actualSavingsBondData();
    data.redemptions[0].proceeds = "9,007,199,254,740,993.03";
    data.redemptions[0].faceValue = "18014398509481986";
    data.redemptions[0].priorYearInterestReported = "0";
    data.priorYearInterestIncludedInCurrentStatements = "0";
    data.royaltyInterestAdjustment = "-0.01";
    const nextYear = actualSavingsBondData(); nextYear.taxYear = "2026";
    nextYear.redemptions[0].redemptionDate = "2026-06-15"; nextYear.educationExpenses[0].paidTaxYear = "2026";
    expect(buildSavingsBondInputs(nextYear, 2026, "single", interest, completePersonalInfo).form8815?.educationExpenses?.[0].paidTaxYear).toBe(2026);
    const actual = buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo);
    expect(actual.savingsBondRedemptions?.[0].proceeds).toBe("9007199254740993.03");
    expect(actual.form8815?.royaltyInterestAdjustment).toBe("-0.01");
    data.redemptions[0].ownershipConfirmed = false;
    expect(buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo).savingsBondRedemptions?.[0].ownershipConfirmed).toBe(false);
    data.redemptions[0].priorYearInterestReported = "";
    expect(() => buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo)).toThrow(/actual|complete/i);
  });
  it("rejects incomplete or contradictory bond and statement records", () => {
    const mutations: Array<(data: ReturnType<typeof actualSavingsBondData>) => void> = [
      data => { data.sourceFactsConfirmed = false; }, data => { data.royaltyInterestAdjustment = ""; },
      data => { data.redemptions[0].issueDate = "2020-01-02"; }, data => { data.redemptions[0].redemptionDate = "2025-02-30"; },
      data => { data.redemptions[0].faceValue = "20001"; }, data => { data.redemptions[0].priorYearInterestReported = "2001"; },
      data => { data.redemptions[0].proceeds = "-1"; }, data => { data.redemptions.push({ ...data.redemptions[0] }); },
      data => { data.redemptions[0].qualifiedExpenses = "1"; }, data => { data.redemptions[0].interest = "1501"; },
      data => { data.educationExpenses[0].paidTaxYear = "2024"; }, data => { data.educationExpenses[0].amountPaid = "-1"; },
      data => { data.educationExpenses[0].educationCreditExpenses = "10001"; }, data => { data.educationExpenses[0].coordinationConfirmed = false; },
      data => { data.priorYearInterestIncludedInCurrentStatements = "501"; }, data => { data.currentStatementReconciliationConfirmed = null; },
    ];
    for (const mutate of mutations) { const data = actualSavingsBondData(); mutate(data); expect(savingsBondFactErrors(data, 2025, "single", interest, completePersonalInfo)).toHaveProperty("savingsBondEducation"); }
    expect(savingsBondFactErrors(actualSavingsBondData(), 2026, "single", interest, completePersonalInfo)).toHaveProperty("savingsBondEducation");
    expect(savingsBondFactErrors(actualSavingsBondData(), 2025, "single", [], completePersonalInfo)).toHaveProperty("savingsBondEducation");
    expect(savingsBondFactErrors(actualSavingsBondData(), 2025, "single", [{ ...interest[0], usSavingsBondInterest: "1999.99" }], completePersonalInfo)).toHaveProperty("savingsBondEducation");
    const data = actualSavingsBondData(); data.educationExpenses[0].qualificationConfirmed = false;
    expect(buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo).form8815?.educationExpenses?.[0].qualificationConfirmed).toBe(false);
  });
  it("forwards actual savings-bond sources through the guided return", () => {
    const state = stateWithBonds();
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.form1099Int[0].usSavingsBondInterest).toBe("2000");
    expect(input?.savingsBondRedemptions[0]).toMatchObject({ sourceId: "bond-a", proceeds: "10000", faceValue: "16000", priorYearInterestReported: "500", sourceFactsComplete: true });
    if (!input) throw new Error("Synthetic complete sources must reach calculation");
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    // $10,000 proceeds - $8,000 principal - $500 previously reported = $1,500.
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1500");
    expect(result.scheduleB?.previouslyReportedSavingsBondInterest.toFixed()).toBe("500");
    expect(result.totalInterest.toFixed()).toBe("100");
    expect(result.agi.toFixed()).toBe("100");
    if (!result.form8815) throw new Error("Missing source result");
    const summary = buildForm8815ReferenceSummary(input.savingsBondRedemptions ?? [], result.form8815);
    expect(summary.redemptions[0]).toMatchObject({ proceeds: "10000", principal: "8000", interest: "1500" });
    expect(summary.lines.find(line => line.line === "14")?.value).toBe("1500");
    expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
  });
  it("requires the same bond facts for section completion and calculation", () => {
    const state = stateWithBonds();
    expect(validateSection(state, "credits").status).toBe("complete");
    const saved = state.sectionData.credits?.savingsBondEducation?.redemptions?.[0];
    if (!saved) throw new Error("Missing synthetic bond");
    saved.ownerDateOfBirth = "";
    expect(validateSection(state, "credits").status).not.toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("rejects bond owner and beneficiary identities that contradict the household", () => {
    const data = actualSavingsBondData();
    data.redemptions[0].ownerDateOfBirth = "1980-01-01";
    expect(() => buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo)).toThrow(/owner.*birth|birth.*owner/i);
    data.redemptions[0].ownerDateOfBirth = "1990-02-15";
    data.educationExpenses[0].relationship = "dependent"; data.educationExpenses[0].dependentClaimed = true;
    expect(() => buildSavingsBondInputs(data, 2025, "single", interest, completePersonalInfo)).toThrow(/dependent|beneficiary/i);
    data.educationExpenses[0].beneficiaryName = "Alex Example"; data.educationExpenses[0].beneficiaryTaxId = "333-44-5555";
    const personal = { ...completePersonalInfo, dependentCount: "1", dependents: [completeDependent] };
    expect(() => buildSavingsBondInputs(data, 2025, "single", interest, personal)).not.toThrow();
    data.redemptions[0].registeredOwner = "taxpayer_and_spouse";
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, personal)).toThrow(/age.test owner/i);
    data.redemptions[0].ageTestOwner = "spouse";
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, personal)).toThrow(/owner.*birth|birth.*owner/i);
    data.redemptions[0].ownerDateOfBirth = "1992-09-10";
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, personal)).not.toThrow();
    expect(() => buildSavingsBondInputs(data, 2025, "mfj", interest, undefined)).toThrow(/household|personal/i);
  });
  it("invalidates bond coordination after substantive source edits", () => {
    const state = stateWithBonds();
    const changed = updateSectionData(state, "income-investments", { ...state.sectionData["income-investments"], interestEntries: [{ ...interest[0], usSavingsBondInterest: "3000" }] });
    expect(changed.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData.credits?.savingsBondEducation?.redemptions).toEqual(state.sectionData.credits?.savingsBondEducation?.redemptions);
    const confirmed = updateSectionData(state, "credits", { ...state.sectionData.credits, savingsBondEducation: { ...actualSavingsBondData(), sourceFactsConfirmed: false } });
    expect(confirmed.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBe(false);
    const educationChanged = updateSectionData(state, "credits", { ...state.sectionData.credits, education: { ...state.sectionData.credits?.education, llcExpenses: "1" } });
    expect(educationChanged.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBeNull();
    const coordinated = stateWithBonds();
    if (!coordinated.sectionData.credits) throw new Error("Missing synthetic credits");
    coordinated.sectionData.credits.educationDistributions = { taxYear: "2025", sourceFactsConfirmed: true, forms: [] };
    const editedBond = actualSavingsBondData(); editedBond.redemptions[0].priorYearInterestReported = "400";
    const reset = updateSectionData(coordinated, "credits", { ...coordinated.sectionData.credits, savingsBondEducation: editedBond });
    expect(reset.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    const confirmationOnly = updateSectionData(coordinated, "credits", { ...coordinated.sectionData.credits, savingsBondEducation: { ...actualSavingsBondData(), sourceFactsConfirmed: false } });
    expect(confirmationOnly.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
  });
});

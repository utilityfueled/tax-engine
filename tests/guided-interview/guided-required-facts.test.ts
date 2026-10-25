// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { buildDonationsInput, buildEducationInput, buildEstimatedPaymentsInput, buildForm1098Inputs, buildRetirementInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, emptyDeductionData, emptyEducationStudent, emptyRetirementEntry, validateSection, loadGuidedFlowState } from "@/lib/guided-interview-flow";
import { completePersonalInfo, startCompleteInterview, completeAocEligibility, completeEducationClaimant, completeMortgageSource } from "./complete-facts";

const mortgage = { ...completeMortgageSource, lender: "Actual Bank", mortgageInterest: "123.45", outstandingPrincipal: "0", originationDate: "2016-06-05" };
const donation = { organization: "Actual Charity", type: "cash" as const, amount: "12.34", date: "2025-02-28", costBasis: "", isLongTermCapitalGain: null, isPrivateFoundation: false };
const retirement = { ...emptyRetirementEntry, payer: "Actual Plan", grossDistribution: "1000", taxableAmount: "0", distributionCode: "7" };
const stateWith = (section: string, data: unknown) => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, sectionData: { ...state.sectionData, [section]: data } };
};

describe("required guided source facts", () => {
  it("does not manufacture mortgage or donation details from legacy totals", () => {
    expect(() => buildForm1098Inputs({ ...emptyDeductionData, method: "itemized", mortgageInterest: "100" })).toThrow(/mortgage/i);
    expect(() => buildDonationsInput({ ...emptyDeductionData, method: "itemized", charitableContributions: "100" })).toThrow(/donation/i);
    expect(buildTaxInputFromGuidedData(stateWith("deductions", { ...emptyDeductionData, method: "itemized", mortgageInterest: "100" }))).toBeNull();
  });
  it("preserves actual mortgage principal and donation classification", () => {
    const data = { ...emptyDeductionData, method: "itemized" as const, mortgageInterest: "123.45", mortgageEntries: [mortgage], charitableContributions: "12.34", donationEntries: [donation] };
    expect(buildForm1098Inputs(data)).toEqual([{ lender: "Actual Bank", mortgageInterestReceived: "123.45", outstandingMortgagePrincipal: "0", mortgageOriginationDate: "2016-06-05", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTax: "0" }]);
    expect(buildDonationsInput(data)[0]).toMatchObject({ organization: "Actual Charity", type: "cash", amount: "12.34", dateOfDonation: "2025-02-28", isPrivateFoundation: false });
    expect(() => buildForm1098Inputs({ ...data, mortgageEntries: [{ ...mortgage, outstandingPrincipal: "" }] })).toThrow(/principal/i);
    expect(() => buildDonationsInput({ ...data, donationEntries: [{ ...donation, type: "property", costBasis: "" }] })).toThrow(/basis|classification/i);
  });
  it("rejects impossible and conflicting source dates", () => {
    for (const date of ["", "2025-02-29", "2026-02-28"]) {
      const state = stateWith("deductions", { ...emptyDeductionData, method: "itemized", charitableContributions: "12.34", donationEntries: [{ ...donation, date }] });
      expect(validateSection(state, "deductions").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
    expect(() => buildEstimatedPaymentsInput({ estimatedPayments: [{ amount: "100", date: "" }], otherPayments: "" })).toThrow(/date/i);
    expect(buildEstimatedPaymentsInput({ estimatedPayments: [{ amount: "0", date: "2026-01-15" }], otherPayments: "" })).toEqual([{ amount: "0", date: "2026-01-15", type: "federal" }]);
    expect(buildTaxInputFromGuidedData(stateWith("payments", { estimatedPayments: [{ amount: "100", date: "2024-01-15" }], otherPayments: "" }))).toBeNull();
  });
  it("does not default retirement codes or taxable amounts", () => {
    expect(emptyRetirementEntry.distributionCode).toBe("");
    expect(() => buildRetirementInputs([{ ...retirement, distributionCode: "" }])).toThrow(/code/i);
    expect(buildRetirementInputs([retirement])[0].taxableAmount).toBe("0");
    expect(buildRetirementInputs([{ ...retirement, taxableAmount: "" }])[0].taxableAmount).toBeUndefined();
    expect(buildTaxInputFromGuidedData(stateWith("income-retirement", { entries: [{ ...retirement, taxableAmount: "" }] }))).toBeNull();
  });
  it("requires explicit education history and preserves zero", () => {
    expect(emptyEducationStudent.priorYearsClaimed).toBe("");
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, llcExpenses: "", refundableAocEligible: false, aocStudents: [{ ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "" }] } };
    expect(() => buildEducationInput(credits)).toThrow(/prior|history/i);
    expect(buildTaxInputFromGuidedData(stateWith("credits", credits))).toBeNull();
    expect(buildEducationInput({ ...credits, education: { ...credits.education, aocStudents: [{ ...credits.education.aocStudents[0], priorYearsClaimed: "0" }] } })?.aocStudents[0].priorYearsClaimed).toBe(0);
  });
  it("rejects duplicate family tax IDs and malformed ZIP or state", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
    for (const data of [
      { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse!, ssn: completePersonalInfo.ssn } },
      { ...completePersonalInfo, zip: "bad" },
      { ...completePersonalInfo, state: "ZZ" },
    ]) expect(buildTaxInputFromGuidedData({ ...state, sectionData: { "personal-info": data } })).toBeNull();
  });
  it("requires reconfirmation of legacy prefilled facts without changing their values", () => {
    const original = stateWith("income-retirement", { entries: [retirement] });
    const legacy = { ...original, factsVersion: undefined };
    const loaded = loadGuidedFlowState({ getItem: () => JSON.stringify(legacy) } as unknown as Storage, "legacy");
    expect(loaded?.taxYear).toBe(2025);
    expect(loaded?.sectionData["income-retirement"]?.entries[0].distributionCode).toBe("7");
    expect(validateSection(loaded!, "income-retirement").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(loaded!)).toBeNull();
  });
  it("preserves explicit residency and all education eligibility answers", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData["personal-info"] = { ...completePersonalInfo, usResidencyMonths: "0", spouse: { ...completePersonalInfo.spouse!, usResidencyMonths: "0" } };
    const taxpayer = buildTaxInputFromGuidedData(state)?.taxpayer;
    expect(taxpayer?.primary.usResidencyMonths).toBe(0);
    expect(taxpayer?.spouse?.usResidencyMonths).toBe(0);
    expect(taxpayer?.stateResidency).toBe("full-year");
    const eligibility = { completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false };
    const student = { ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "0", ...eligibility };
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, llcExpenses: "", refundableAocEligible: false, aocStudents: [student] } };
    expect(buildEducationInput(credits)).toMatchObject({ refundableAocEligible: false, aocStudents: [{ ...eligibility }] });
    const missingSupport = stateWith("credits", { ...credits, education: { ...credits.education, refundableAocEligible: undefined, refundableAocFacts: undefined } });
    missingSupport.sectionData["personal-info"] = { ...completePersonalInfo, dateOfBirth: "2005-02-01" };
    expect(buildTaxInputFromGuidedData(missingSupport)).toBeNull();
  });
});

describe("2026 eligibility facts", () => {
  it("does not turn a 2026 Lifetime Learning aggregate into an eligible student", () => {
    const state = { ...stateWith("credits", { ...emptyCreditsData, education: { ...emptyCreditsData.education, llcExpenses: "1000", primarySsnEligible: true } }), taxYear: 2026 };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(buildTaxInputFromGuidedData({ ...state, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, education: { ...emptyCreditsData.education, llcExpenses: "0" } } } })).not.toBeNull();
  });
  it("requires actual 2026 charity and education eligibility facts", () => {
    const gift = { ...donation, date: "2026-02-28" };
    const deductions = { ...emptyDeductionData, donationEntries: [gift] };
    const state = { ...stateWith("deductions", deductions), taxYear: 2026 };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    const eligible = { ...gift, qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, qualifiedAppreciatedStock: false };
    const result = buildTaxInputFromGuidedData({ ...state, sectionData: { ...state.sectionData, deductions: { ...deductions, donationEntries: [eligible] } } });
    expect(result?.donations[0]).toMatchObject({ qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, qualifiedAppreciatedStock: false });
    const student = { ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "0", studentSsnEligible: false, institutionEin: "12-3456789" };
    const credits = { ...emptyCreditsData, education: { ...completeEducationClaimant, aocStudents: [student], llcExpenses: "", refundableAocEligible: false, primarySsnEligible: false } };
    const educationState = { ...stateWith("credits", credits), taxYear: 2026 };
    educationState.sectionData["personal-info"] = { ...completePersonalInfo, employmentValidSsnIssuedByDueDate: false };
    expect(buildTaxInputFromGuidedData(educationState)?.educationExpenses).toMatchObject({ primarySsnEligible: false, aocStudents: [{ studentSsnEligible: false, institutionEin: "12-3456789" }] });
    expect(buildTaxInputFromGuidedData({ ...educationState, sectionData: { ...educationState.sectionData, credits: { ...credits, education: { ...credits.education, primarySsnEligible: undefined } } } })).toBeNull();
  });
});

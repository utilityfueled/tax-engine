// Spec: spec/federal/form-2441.yaml actual-care-source-records and guided-part-ii-return-year.
import { describe, expect, it } from "vitest";
import { buildDependentCareInput } from "@/lib/guided-interview-bridge";
import { careFactErrors } from "@/lib/guided-credit-facts";
import {
  emptyCreditsData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear,
  startInterview, updateSectionData, validateSection, type GuidedFlowState,
} from "@/lib/guided-interview-flow";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { DependentCareSchema } from "@/models/inputs.js";
import { completeCareSource } from "./care-source-fixture";
import {
  completeDependent, completeInterestSource, completePersonalInfo, completeW2Entry, startCompleteInterview,
} from "./complete-facts";

function withCurrentInterestFacts(state: GuidedFlowState, year: number) {
  const personal = updateSectionData(state, "personal-info", {
    ...structuredClone(completePersonalInfo), dependentCount: "1", dependents: [{ ...completeDependent }],
  });
  return updateSectionData(personal, "income-investments", {
    interestEntries: [{ ...completeInterestSource, payer: `Bank for ${year}`, sourceTaxYear: String(year), interestIncome: "60000" }],
    dividendEntries: [], brokerageEntries: [],
  });
}

function reopen(state: GuidedFlowState) {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  } as Storage;
  expect(saveGuidedFlowState(storage, "form-2441-return-year", state)).toBe(true);
  const restored = loadGuidedFlowState(storage, "form-2441-return-year");
  if (!restored) throw new Error("Expected the guided care draft to reopen");
  return restored;
}

describe("actual care source facts", () => {
  it("preserves actual care source records and prior-year credit", () => {
    const source = completeCareSource({ priorYearExpenseCredit: "17.25" });
    const result = buildDependentCareInput({ ...emptyCreditsData, dependentCare: source });
    expect(result).toMatchObject({ expenses: "5000.01", qualifyingIndividuals: 2, priorYearExpenseCredit: "17.25",
      sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false,
      providers: source.providers, qualifyingPersons: source.qualifyingPersons });
    expect(DependentCareSchema.parse(result)).toMatchObject({ providers: source.providers, qualifyingPersons: source.qualifyingPersons });
  });
  it("requires a new Part II confirmation after original earned-income sources change", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
    const original = { ...completeW2Entry, sourceTaxYear: "2025", box12CodeQ: "500.12" };
    state.sectionData["income-w2"] = { entries: [original], combatPayElection: { primary: false } };
    const care = completeCareSource({ primaryEarnedIncome: "30500.12" });
    state.sectionData.credits = { ...emptyCreditsData, dependentCare: care };

    const eic = updateSectionData(state, "income-w2", { entries: [original], combatPayElection: { primary: true } });
    expect(eic.sectionData.credits?.dependentCare.sourceFactsConfirmed).toBe(true);

    for (const edit of [{ box12CodeQ: "500.13" }, { sourceTaxYear: "2026" }, { wages: "30001" }]) {
      const changed = updateSectionData(state, "income-w2", { entries: [{ ...original, ...edit }] });
      const updatedCare = changed.sectionData.credits?.dependentCare;
      expect(updatedCare).toEqual({ ...care, sourceFactsConfirmed: null });
      if (!updatedCare) throw new Error("The previously entered care worksheet was lost");
      expect(careFactErrors(updatedCare, "single")).toHaveProperty("careSourceFacts");
    }
    const business = updateSectionData(state, "income-self-employment", { grossReceipts: "240.01" });
    expect(business.sectionData.credits?.dependentCare).toEqual({ ...care, sourceFactsConfirmed: null });
    expect(state.sectionData.credits.dependentCare.sourceFactsConfirmed).toBe(true);
  });
  it("requires reconfirmation before a Worksheet A credit can reach a different return year", () => {
    const care = completeCareSource({
      expenses: "0", qualifyingIndividuals: "1", primaryEarnedIncome: "0", priorYearExpenseCredit: "200",
      providers: completeCareSource().providers?.map(provider => ({ ...provider, amountPaid: "1000" })),
      qualifyingPersons: [{
        firstName: completeDependent.firstName, lastName: completeDependent.lastName, identifierType: "tax_id",
        taxId: completeDependent.ssn, over12Disabled: false, qualifiedExpenses: "0", qualifyingPersonConfirmed: true,
      }],
    });
    const draft = startInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null }, null);
    const withCare = updateSectionData(draft, "credits", { ...emptyCreditsData, dependentCare: care });
    const assigned = withCurrentInterestFacts(setInterviewTaxYear(withCare, 2026), 2026);
    const original = reopen(updateSectionData(assigned, "review", { qof2026Disclosure: false }));
    expect(setInterviewTaxYear(original, 2026)).toBe(original);
    expect(computeGuidedPreviewEvaluation(original).input?.dependentCare?.priorYearExpenseCredit).toBe("200");

    const switched = reopen(withCurrentInterestFacts(setInterviewTaxYear(original, 2025), 2025));
    expect(computeGuidedPreviewEvaluation(switched).input?.dependentCare?.priorYearExpenseCredit).toBeUndefined();
    expect(validateSection(switched, "credits").fieldErrors).toHaveProperty("careSourceFacts");
    expect(switched.sectionData.credits?.dependentCare).toEqual({ ...care, sourceFactsConfirmed: null });
    expect(setInterviewTaxYear(original, null).sectionData.credits?.dependentCare).toEqual({ ...care, sourceFactsConfirmed: null });

    const corrected = updateSectionData(switched, "credits", {
      ...emptyCreditsData, dependentCare: { ...care, priorYearExpenseCredit: "0", sourceFactsConfirmed: null },
    });
    expect(computeGuidedPreviewEvaluation(corrected).input).toBeNull();
    const confirmed = reopen(updateSectionData(corrected, "credits", {
      ...emptyCreditsData, dependentCare: { ...care, priorYearExpenseCredit: "0", sourceFactsConfirmed: true },
    }));
    const result = computeGuidedPreviewEvaluation(confirmed);
    expect(result.input?.dependentCare?.priorYearExpenseCredit).toBe("0");
    expect(result.preview.metrics?.totalTax).toBe("2875");

    const withVerified2025Credit = updateSectionData(switched, "credits", { ...emptyCreditsData, dependentCare: care });
    expect(computeGuidedPreviewEvaluation(withVerified2025Credit).preview.metrics?.totalTax).toBe("2675");
  });
  it("requires source records and explicit zero answers without mutating old saved care facts", () => {
    const legacy = { expenses: "5000", qualifyingIndividuals: "2", primaryEarnedIncome: "30000", excludedDependentCareBenefits: "0", eligibilityConfirmed: true };
    const before = JSON.stringify(legacy);
    expect(Object.keys(careFactErrors(legacy, "single"))).toEqual(expect.arrayContaining(["careProviders", "carePersons", "care-priorYearExpenseCredit", "careSourceFacts"]));
    expect(() => buildDependentCareInput({ ...emptyCreditsData, dependentCare: legacy })).toThrow();
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("keeps a prior-only claim and negative earned income while preserving zero person expense", () => {
    const source = completeCareSource({ expenses: "0", priorYearExpenseCredit: "100.25", primaryEarnedIncome: "-0.75",
      qualifyingPersons: completeCareSource().qualifyingPersons?.map(person => ({ ...person, qualifiedExpenses: "0" })) });
    expect(careFactErrors(source, "mfj")).toEqual({});
    const result = buildDependentCareInput({ ...emptyCreditsData, dependentCare: source });
    expect(result).toMatchObject({ expenses: "0", priorYearExpenseCredit: "100.25", primaryEarnedIncome: "-0.75" });
    expect(result?.qualifyingPersons?.[1].qualifiedExpenses).toBe("0");
  });
  it("rejects unreconciled person expenses counts and impossible provider payment totals", () => {
    for (const source of [
      completeCareSource({ qualifyingIndividuals: "1" }),
      completeCareSource({ expenses: "5000.02" }),
      completeCareSource({ providers: completeCareSource().providers?.map(provider => ({ ...provider, amountPaid: "4999.99" })) }),
      completeCareSource({ receivedBenefits: false, excludedDependentCareBenefits: "1" }),
    ]) expect(Object.keys(careFactErrors(source, "mfj")).length).toBeGreaterThan(0);
  });
  it("requires actual provider identification and household status and person eligibility", () => {
    for (const source of [
      completeCareSource({ providers: [{ ...completeCareSource().providers![0], taxId: "", householdEmployee: undefined }] }),
      completeCareSource({ qualifyingPersons: [{ ...completeCareSource().qualifyingPersons![0], qualifyingPersonConfirmed: undefined }] }),
      completeCareSource({ providers: [{ ...completeCareSource().providers![0], identifierType: "withheld", dueDiligenceStatement: "" }] }),
    ]) expect(Object.keys(careFactErrors(source, "single")).length).toBeGreaterThan(0);
    expect(careFactErrors(completeCareSource({ providers: [{ ...completeCareSource().providers![0], identifierType: "tax_exempt", taxId: "" }] }), "mfj")).toEqual({});
  });
});

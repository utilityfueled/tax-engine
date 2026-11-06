// Spec: spec/federal/form-2441.yaml actual-care-source-records.
import { describe, expect, it } from "vitest";
import { buildDependentCareInput } from "@/lib/guided-interview-bridge";
import { careFactErrors } from "@/lib/guided-credit-facts";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import { DependentCareSchema } from "@/models/inputs.js";
import { completeCareSource } from "./care-source-fixture";

describe("actual care source facts", () => {
  it("preserves actual care source records and prior-year credit", () => {
    const source = completeCareSource({ priorYearExpenseCredit: "17.25" });
    const result = buildDependentCareInput({ ...emptyCreditsData, dependentCare: source });
    expect(result).toMatchObject({ expenses: "5000.01", qualifyingIndividuals: 2, priorYearExpenseCredit: "17.25",
      sourceFactsConfirmed: true, receivedBenefits: false, usesDeemedIncome: false,
      providers: source.providers, qualifyingPersons: source.qualifyingPersons });
    expect(DependentCareSchema.parse(result)).toMatchObject({ providers: source.providers, qualifyingPersons: source.qualifyingPersons });
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

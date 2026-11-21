import { calculateFederalTax } from "@/engine/federal.js";
import { buildDependentCareInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { careFactErrors } from "@/lib/guided-credit-facts";
import type { CareBenefitsData } from "@/lib/guided-dependent-care-benefits";
import { emptyCreditsData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, validateSection, type DependentCareData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { describe, expect, it } from "vitest";
import { completeCareSource } from "./care-source-fixture";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

const livingApart = {
  spouseLivedApartLast6Months: true,
  paidOverHalfHomeCost: true,
  qualifyingPersonMainHomeOverHalfYear: true,
};

function interview(careOverrides: Partial<DependentCareData> = {}, box10 = "0") {
  const state = startCompleteInterview({ filingStatus: "mfs", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "40000", box10DependentCareBenefits: box10,
    socialSecurityWages: "40000", socialSecurityWithheld: "2480", medicareWages: "40000", medicareWithheld: "580" }] };
  const care = completeCareSource();
  const provider = care.providers?.[0];
  const person = care.qualifyingPersons?.[0];
  if (!provider || !person) throw new Error("Missing synthetic care sources");
  state.sectionData.credits = { ...emptyCreditsData, dependentCare: {
    ...care, expenses: "3900", qualifyingIndividuals: "1", primaryEarnedIncome: "40000", spouseEarnedIncome: undefined,
    providers: [{ ...provider, amountPaid: "3900" }],
    qualifyingPersons: [{ ...person, qualifiedExpenses: "3900" }],
    mfsLivingApart: livingApart, ...careOverrides,
  } };
  return state;
}

describe("guided Form 2441 Part II for separately filing spouses", () => {
  it("2025 guided MFS no-benefit facts reach Form 2441 Part II", () => {
    const state = interview();
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.dependentCare).toMatchObject({ mfsLivingApart: livingApart, receivedBenefits: false, excludedDependentCareBenefits: "0" });
    expect(input?.dependentCareBenefits).toBeUndefined();
    expect(validateSection(state, "credits").status).toBe("complete");
    const federal = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(federal.form2441?.credit.toFixed()).toBe("660");
    expect(federal.form2441?.lines.find(line => line.line === "A")?.value.toFixed()).toBe("1");
  });

  it("holds each unknown or false answer and preserves both through draft storage", () => {
    for (const field of Object.keys(livingApart) as (keyof typeof livingApart)[]) {
      for (const answer of [undefined, null, false]) {
        const state = interview({ mfsLivingApart: { ...livingApart, [field]: answer } });
        let saved: string | null = null;
        const storage = { setItem: (_key: string, value: string) => { saved = value; }, getItem: () => saved, removeItem: () => {} } as unknown as Storage;
        expect(saveGuidedFlowState(storage, { storageKey: "synthetic-mfs-care" }, state)).toBe(true);
        const restored = loadGuidedFlowState(storage, { storageKey: "synthetic-mfs-care" });
        if (!restored) throw new Error("The saved care facts could not be reopened");
        expect(restored.sectionData.credits?.dependentCare.mfsLivingApart?.[field]).toBe(answer);
        expect(careFactErrors(restored.sectionData.credits?.dependentCare, "mfs", { year: 2025 })).toHaveProperty("careMfsLivingApart");
        expect(buildTaxInputFromGuidedData(restored)).toBeNull();
      }
    }
  });

  it("requires eligibility and a no-benefit answer backed by explicit zeros", () => {
    for (const patch of [{ receivedBenefits: undefined }, { receivedBenefits: true }, { excludedDependentCareBenefits: "" },
      { excludedDependentCareBenefits: "1" }, { eligibilityConfirmed: false }]) {
      expect(buildTaxInputFromGuidedData(interview(patch))).toBeNull();
    }
    for (const box10 of ["", "1"]) {
      const state = interview({}, box10);
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
      expect(() => buildDependentCareInput(state.sectionData.credits, "mfs", 2025, [{
        kind: "employee", owner: "primary", label: "Synthetic employer", sourceId: "w2:0", reportedBenefits: box10,
      }])).toThrow(/Box 10/);
    }
    const state = setInterviewTaxYear(interview(), 2026);
    expect(careFactErrors(state.sectionData.credits?.dependentCare, "mfs", { year: 2026 })).toHaveProperty("careFilingStatus");
  });

  it("preserves actual Part III and rejects contradictory Part II facts", () => {
    const state = interview({ mfsLivingApart: undefined, receivedBenefits: true, excludedDependentCareBenefits: undefined }, "1000");
    const credits = state.sectionData.credits;
    if (!credits) throw new Error("Missing synthetic credit section");
    const care = credits.dependentCare;
    const benefits: CareBenefitsData = {
      sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true, providers: care.providers, usesDeemedIncome: false,
      employeeBenefits: [{ sourceId: "w2:0", owner: "primary", benefitsReported: "1000", alreadyIncludedInWages: "0",
        priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" }],
      selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "5000", qualifiedExpensesIncurred: "3900",
      primaryEarnedIncome: "40000", spouseEarnedIncome: "0", earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: "1",
      qualifiedExpensesPaidForCredit: "2900", creditExpenseCoordinationConfirmed: true, ...livingApart,
    };
    const benefitCare = { ...care, qualifyingPersons: care.qualifyingPersons?.map(person => ({ ...person, qualifiedExpenses: "2900" })) };
    state.sectionData.credits = { ...credits, dependentCare: benefitCare, dependentCareBenefits: benefits };
    const withBenefits = buildTaxInputFromGuidedData(state);
    expect(withBenefits?.dependentCare?.mfsLivingApart).toBeUndefined();
    expect(withBenefits?.dependentCareBenefits).toMatchObject(livingApart);
    expect(calculateFederalTax(TaxYearInputSchema.parse(withBenefits)).form2441?.credit.gt(0)).toBe(true);

    state.sectionData.credits.dependentCare = { ...benefitCare, mfsLivingApart: livingApart };
    expect(buildTaxInputFromGuidedData(state)?.dependentCare?.mfsLivingApart).toEqual(livingApart);
    state.sectionData.credits.dependentCare.mfsLivingApart = { ...livingApart, spouseLivedApartLast6Months: false };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
});

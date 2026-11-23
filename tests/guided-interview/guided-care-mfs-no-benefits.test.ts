import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2441 } from "@/engine/forms/form-2441.js";
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

function interview(careOverrides: Partial<DependentCareData> = {}, box10 = "0", taxYear = 2025) {
  const state = startCompleteInterview({ filingStatus: "mfs", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.taxYear = taxYear;
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing synthetic personal facts");
  personal.livedWithSpouseAtAnyTimeDuringYear = false;
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: String(taxYear), wages: "40000", box10DependentCareBenefits: box10,
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

function reopen(state: ReturnType<typeof interview>) {
  let saved: string | null = null;
  const storage = { setItem: (_key: string, value: string) => { saved = value; }, getItem: () => saved, removeItem: () => {} } as unknown as Storage;
  expect(saveGuidedFlowState(storage, { storageKey: "synthetic-mfs-care" }, state)).toBe(true);
  const restored = loadGuidedFlowState(storage, { storageKey: "synthetic-mfs-care" });
  if (!restored) throw new Error("The saved care facts could not be reopened");
  return restored;
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

  it("2026 guided MFS no-benefit facts reach Form 2441 Part II after reopening", () => {
    const state = reopen(interview({}, "0", 2026));
    expect(validateSection(state, "credits").status).toBe("complete");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    const care = input.dependentCare;
    expect(care).toMatchObject({ mfsLivingApart: livingApart, receivedBenefits: false, excludedDependentCareBenefits: "0" });
    expect(input.dependentCareBenefits).toBeUndefined();
    if (!care || care.primaryEarnedIncome === undefined || care.excludedDependentCareBenefits === undefined || care.priorYearExpenseCredit === undefined) {
      throw new Error("Missing projected Form 2441 amounts");
    }
    const form = calculateForm2441({
      taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
      mfsLivingApart: care.mfsLivingApart, receivedBenefits: care.receivedBenefits, eligibilityConfirmed: care.eligibilityConfirmed,
      careExpenses: new Decimal(care.expenses), qualifyingIndividuals: care.qualifyingIndividuals,
      earnedIncome: new Decimal(care.primaryEarnedIncome), agi: new Decimal("40000"), taxLiabilityLimit: new Decimal("2000"),
      excludedDependentCareBenefits: new Decimal(care.excludedDependentCareBenefits), priorYearExpenseCredit: new Decimal(care.priorYearExpenseCredit),
    });
    expect(form.credit.toFixed()).toBe("1110");
    expect(form.lines.find(line => line.line === "A")?.value.toFixed()).toBe("1");
    expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete/);
  });

  it.each([2025, 2026])("holds each unknown or false %d answer and preserves both through draft storage", year => {
    for (const field of Object.keys(livingApart) as (keyof typeof livingApart)[]) {
      for (const answer of [undefined, null, false]) {
        const restored = reopen(interview({ mfsLivingApart: { ...livingApart, [field]: answer } }, "0", year));
        expect(restored.sectionData.credits?.dependentCare.mfsLivingApart?.[field]).toBe(answer);
        expect(careFactErrors(restored.sectionData.credits?.dependentCare, "mfs", { year })).toHaveProperty("careMfsLivingApart");
        expect(buildTaxInputFromGuidedData(restored)).toBeNull();
      }
    }
  });

  it.each([2025, 2026])("requires %d eligibility and a no-benefit answer backed by explicit zeros", year => {
    for (const patch of [{ receivedBenefits: undefined }, { receivedBenefits: true }, { excludedDependentCareBenefits: "" },
      { excludedDependentCareBenefits: "1" }, { eligibilityConfirmed: false }]) {
      expect(buildTaxInputFromGuidedData(interview(patch, "0", year))).toBeNull();
    }
    for (const box10 of ["", "1"]) {
      const state = interview({}, box10, year);
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
      expect(() => buildDependentCareInput(state.sectionData.credits, "mfs", year, [{
        kind: "employee", owner: "primary", label: "Synthetic employer", sourceId: "w2:0", reportedBenefits: box10,
      }])).toThrow(/Box 10/);
    }
  });

  it("retains the living-apart facts but requires reconfirmation after changing to 2026", () => {
    const state = reopen(setInterviewTaxYear(interview(), 2026));
    const care = state.sectionData.credits?.dependentCare;
    expect(care?.mfsLivingApart).toEqual(livingApart);
    expect(care?.sourceFactsConfirmed).toBeNull();
    expect(careFactErrors(care, "mfs", { year: 2026 })).toEqual({
      careSourceFacts: expect.stringMatching(/confirm.*for this tax year/i),
    });
  });

  it("requires selected-year care confirmation after affirming the facts while the year is blank", () => {
    const state = setInterviewTaxYear(interview(), null);
    const care = state.sectionData.credits?.dependentCare;
    if (!care) throw new Error("The care source was not retained");
    care.sourceFactsConfirmed = true;
    const restored = reopen(setInterviewTaxYear(reopen(state), 2026));
    expect(restored.sectionData.credits?.dependentCare.mfsLivingApart).toEqual(livingApart);
    expect(restored.sectionData.credits?.dependentCare.sourceFactsConfirmed).toBeNull();
    expect(careFactErrors(restored.sectionData.credits?.dependentCare, "mfs", { year: 2026 })).toHaveProperty("careSourceFacts");
    expect(buildTaxInputFromGuidedData(restored)).toBeNull();
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

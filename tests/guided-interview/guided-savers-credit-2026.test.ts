/** Spec: spec/federal/guided-savers-credit-2026.yaml. */
import assert from "node:assert/strict";
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, emptyCreditsData, getGuidedSectionRoute, setInterviewTaxYear, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildGuidedSaversCredit, type GuidedSaversCreditContext, type GuidedSaversCreditData } from "@/lib/guided-savers-credit";
import { TaxYearInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { simpleW2Fixture } from "../fixtures/simple-w2";
import { completeIraSources, completeW2Entry, startCompleteInterview } from "./complete-facts";

// Use the existing staged test preview. The actual constants retain their annual guard.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const context = {
  taxYear: 2026, filingStatus: "single", personal: {
    dateOfBirth: "1990-01-15", standardDeductionFacts: { primaryCanBeClaimedAsDependent: false },
  },
  iraContributions: {
    contributionTaxYear: "2026", contributionTimingConfirmed: true, specialContributionRulesRequired: false,
    sourceFactsConfirmed: true, primaryRothContributions: "2,000", primaryContributions: "0", primarySection501c18Contributions: "0",
    primaryCompensation: "30,000",
  },
  wageEntries: [], retirementEntries: [],
} satisfies GuidedSaversCreditContext;

const draft: GuidedSaversCreditData = {
  taxYear: "2026", sourceFactsConfirmed: true, ordinaryScopeConfirmed: true,
  contribution: { accountHolder: "primary", sourceReference: "trustee record R26", amount: "2000.00" },
  qualifyingStudentMonths: "0", dependentDeductionAllowedToAnotherTaxpayer: false,
  testingPeriod: { dueDate: "2027-04-15", distributionsConfirmed: true, distributions: [] },
};

it("projects through the guided return and reconfirms after source changes", () => {
  const base = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  base.taxYear = 2026;
  const before = getGuidedSectionRoute(base);
  expect(before.map(section => section.id)).not.toContain("adjustments");
  base.currentSectionIndex = before.findIndex(section => section.id === "credits");
  const state = updateSectionData(base, "credits", { ...emptyCreditsData, saversCredit: structuredClone(draft) });
  const after = getGuidedSectionRoute(state);
  expect(after.map(section => section.id)).toContain("adjustments");
  expect(after[state.currentSectionIndex]?.id).toBe("credits");
  const wages = { entries: [{ ...completeW2Entry, wages: "30000", federalWithheld: "2000", socialSecurityWages: "30000", socialSecurityWithheld: "1860", medicareWages: "30000", medicareWithheld: "435" }] };
  state.sectionData["income-w2"] = wages;
  state.sectionData.adjustments = { ...emptyAdjustmentData, iraContributions: { ...completeIraSources, ...context.iraContributions } };
  state.sectionData.credits = { ...emptyCreditsData, saversCredit: structuredClone(draft) };

  expect(validateSection(state, "credits").status).toBe("complete");
  const guided = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(guided.form8880?.primaryIraContributions).toBe("2000");
  expect(calculateFederalTax(guided).schedule3?.retirementSavingsCredit.toFixed()).toBe("200");

  const edited = updateSectionData(state, "income-w2", { entries: [{ ...wages.entries[0], box12CodeD: "10" }] });
  expect(edited.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  expect(validateSection(edited, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const scrolledBack = setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026);
  expect(scrolledBack.sectionData.credits?.saversCredit).toMatchObject({ contribution: draft.contribution, sourceFactsConfirmed: null });

  const changedCredit = updateSectionData(state, "credits", { ...emptyCreditsData, saversCredit: { ...draft, qualifyingStudentMonths: "1" } });
  expect(changedCredit.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  const rechecked = updateSectionData(changedCredit, "credits", { ...emptyCreditsData, saversCredit: { ...draft, qualifyingStudentMonths: "1" } });
  expect(validateSection(rechecked, "credits").status).toBe("complete");

  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  const malformed = { ...state, sectionData: { ...state.sectionData, "personal-info": { ...personal, childTaxCredit: { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "abc" } } } };
  expect(validateSection(malformed, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(malformed)).toBeNull();

  const education = updateSectionData(state, "credits", { ...emptyCreditsData, saversCredit: draft,
    education: { ...emptyCreditsData.education, possessionIncomeExclusion: "500" } });
  expect(education.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  const conflicting = updateSectionData(education, "credits", { ...emptyCreditsData, saversCredit: draft,
    education: { ...emptyCreditsData.education, possessionIncomeExclusion: "500" } });
  expect(validateSection(conflicting, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(conflicting)).toBeNull();
});

function calculate(data: GuidedSaversCreditData, agi = "30000", dateOfBirth = "1990-01-15") {
  const form8880 = buildGuidedSaversCredit(data, {
    ...context, personal: { ...context.personal, dateOfBirth },
    iraContributions: { ...context.iraContributions, primaryCompensation: agi },
  });
  const wage = simpleW2Fixture.w2s[0];
  assert.ok(wage);
  return calculateFederalTax(TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth } },
    w2s: [{ ...wage, taxYear: 2026, wages: agi, socialSecurityWages: agi, medicareWages: agi,
      socialSecurityWithheld: d(agi).times("0.062").toFixed(2), medicareWithheld: d(agi).times("0.0145").toFixed(2) }],
    iraDeductionWorksheet: {
      sourceFactsConfirmed: true, primaryContributions: "0", primaryCompensation: agi,
      primaryIsActiveParticipant: false, primaryRothContributions: "2000", primarySection501c18Contributions: "0",
    },
    form8880,
  }));
}

it("transfers the ordinary Roth contribution into Form 8880 and Schedule 3", async () => {
  const actual = await vi.importActual<typeof import("@/models/constants.js")>("@/models/constants.js");
  expect(() => actual.getConstants(2026)).toThrow(/incomplete/);
  const result = calculate(draft);
  expect(result.form8880?.line1a.toFixed()).toBe("2000");
  expect(result.form8880?.line2a.toFixed()).toBe("0");
  expect(result.form8880?.line4a.toFixed()).toBe("0");
  expect(result.form8880?.line9.toFixed()).toBe("0.1");
  expect(result.form8880?.line12.toFixed()).toBe("200");
  expect(result.schedule3?.retirementSavingsCredit.toFixed()).toBe("200");
});

it("sums distinct actual testing-period distributions without rounding cents", () => {
  const first = { sourceReference: "IRA 2024 transaction", accountHolder: "primary" as const, receivedDate: "2024-01-01", amount: "100.51" };
  const second = { sourceReference: "Plan 2027 transaction", accountHolder: "primary" as const, receivedDate: "2027-04-14", amount: "150.40" };
  const tested = { ...draft, testingPeriod: { ...draft.testingPeriod, distributions: [first, second] } };
  expect(calculate(tested).form8880?.line4a.toFixed()).toBe("250.91");
  expect(calculate(tested).form8880?.line12.toFixed()).toBe("175");
  for (const changed of [
    [first, { ...second, sourceReference: " IRA 2024 TRANSACTION " }],
    [{ ...first, receivedDate: "2023-12-31" }],
    [{ ...first, receivedDate: "2026-03-01" }],
    [{ ...second, receivedDate: "2027-04-15" }],
    [{ ...first, accountHolder: "spouse" as const }],
    [{ ...first, amount: "" }],
  ]) {
    expect(() => buildGuidedSaversCredit({ ...tested, testingPeriod: { ...tested.testingPeriod, distributions: changed } }, context)).toThrow(/distribution/i);
  }
});

it("requires complete and consistent return-year proof", () => {
  expect(buildGuidedSaversCredit(undefined, context)).toBeUndefined();
  for (const changed of [
    { taxYear: "2025" }, { sourceFactsConfirmed: null }, { ordinaryScopeConfirmed: false },
    { contribution: { ...draft.contribution, amount: "2000.01" } },
    { contribution: { ...draft.contribution, sourceReference: "" } },
    { contribution: { ...draft.contribution, accountHolder: "spouse" as const } },
    { qualifyingStudentMonths: "" }, { qualifyingStudentMonths: "13" },
    { dependentDeductionAllowedToAnotherTaxpayer: null }, { dependentDeductionAllowedToAnotherTaxpayer: true },
    { testingPeriod: { ...draft.testingPeriod, dueDate: "" } },
    { testingPeriod: { ...draft.testingPeriod, distributionsConfirmed: null } },
  ]) expect(() => buildGuidedSaversCredit({ ...draft, ...changed }, context)).toThrow();
  for (const changed of [
    { taxYear: 2025 }, { filingStatus: "mfj" as const }, { iraContributions: undefined },
    { iraContributions: { ...context.iraContributions, primaryRothContributions: "2000.01" } },
    { iraContributions: { ...context.iraContributions, primaryContributions: "1" } },
    { iraContributions: { ...context.iraContributions, primaryCompensation: "1999.99" } },
    { iraContributions: { ...context.iraContributions, contributionTimingConfirmed: false } },
    { iraContributions: { ...context.iraContributions, specialContributionRulesRequired: true } },
    { personal: { ...context.personal, dateOfBirth: "1990-02-30" } },
    { hasConflictingIncomeExclusions: true },
    { wageEntries: [{ box12CodeD: "1" }] }, { retirementEntries: [{ grossDistribution: "1" }] },
  ]) expect(() => buildGuidedSaversCredit(draft, { ...context, ...changed })).toThrow();
});

it("uses actual student months, birth date and AGI for the statutory boundaries", () => {
  expect(calculate({ ...draft, qualifyingStudentMonths: "4" }).form8880?.line12.toFixed()).toBe("200");
  expect(calculate({ ...draft, qualifyingStudentMonths: "5" }).form8880?.line12.toFixed()).toBe("0");
  expect(calculate(draft, "30000", "2009-01-01").form8880?.line12.toFixed()).toBe("200");
  expect(calculate(draft, "30000", "2009-01-02").form8880?.line12.toFixed()).toBe("0");
  expect(calculate(draft, "40250").form8880?.line12.toFixed()).toBe("200");
  expect(calculate(draft, "40251").form8880?.line12.toFixed()).toBe("0");
});

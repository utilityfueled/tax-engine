// Spec: spec/federal/guided-input.yaml, filer-return-year
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  getVisitedSectionStatus, goToNextSection, loadGuidedFlowState, saveGuidedFlowState,
  setInterviewTaxYear, startInterview, updateSectionData, validateSection,
  type GuidedFlowState, type PersonalInfoData, type SegmentationAnswers,
} from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

const segmentation: SegmentationAnswers = {
  filingStatus: "mfs", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "OH",
};
const spouse = completePersonalInfo.spouse;
if (!spouse) throw new Error("Expected complete spouse identity");
const facts2025: PersonalInfoData = {
  ...completePersonalInfo,
  usResidencyMonths: "6",
  stateResidency: "part-year",
  livedWithSpouseAtAnyTimeDuringYear: false,
  employmentValidSsnIssuedByDueDate: false,
  tinIssuedByDueDate: false,
  spouse: { ...spouse, usResidencyMonths: "0", employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
};

function draft(year: number | null): GuidedFlowState {
  return goToNextSection(updateSectionData(startInterview(segmentation, year), "personal-info", facts2025));
}

function withWages(state: GuidedFlowState, sourceYear: number): GuidedFlowState {
  return updateSectionData(state, "income-w2", { entries: [{
    ...completeW2Entry, sourceTaxYear: String(sourceYear), wages: "45000", federalWithheld: "4000",
  }] });
}

function reopen(state: GuidedFlowState): GuidedFlowState {
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  expect(saveGuidedFlowState(storage, "filer-year", state)).toBe(true);
  const restored = loadGuidedFlowState(storage, "filer-year");
  if (!restored) throw new Error("Expected the guided draft to reopen");
  return restored;
}

function expectUnknownAnnualFacts(state: GuidedFlowState) {
  expect(state.segmentation.stateCode).toBe("OH");
  expect(state.sectionData["personal-info"]).toMatchObject({
    firstName: facts2025.firstName, lastName: facts2025.lastName, ssn: facts2025.ssn,
    dateOfBirth: facts2025.dateOfBirth, addressLine1: facts2025.addressLine1,
    city: facts2025.city, state: facts2025.state, zip: facts2025.zip,
    usResidencyMonths: "", stateResidency: null,
    spouse: { firstName: spouse.firstName, lastName: spouse.lastName, ssn: spouse.ssn, dateOfBirth: spouse.dateOfBirth, usResidencyMonths: "" },
  });
  const personal = state.sectionData["personal-info"];
  expect(personal?.livedWithSpouseAtAnyTimeDuringYear).toBeUndefined();
  for (const filer of [personal, personal?.spouse]) {
    expect(filer?.employmentValidSsnIssuedByDueDate).toBeUndefined();
    expect(filer?.tinIssuedByDueDate).toBeUndefined();
  }
}

it("requires fresh filer and spouse facts for the selected return year through a saved round trip", () => {
  const original = withWages(draft(2025), 2025);
  expect(setInterviewTaxYear(original, 2025)).toBe(original);
  const sameYear = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(original)));
  expect(sameYear.taxpayer).toMatchObject({
    taxYear: 2025, stateResidency: "part-year", livedWithSpouseAtAnyTimeDuringYear: false,
    primary: { usResidencyMonths: 6, employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
    spouse: { usResidencyMonths: 0, employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
  });

  const selected = withWages(setInterviewTaxYear(original, 2026), 2026);
  const switchedBack = withWages(setInterviewTaxYear(reopen(selected), 2025), 2025);
  for (const state of [selected, reopen(selected), reopen(switchedBack)]) {
    expect(validateSection(state, "income-w2").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, "personal-info")).toMatchObject({
      status: "partial",
      fieldErrors: {
        usResidencyMonths: expect.any(String), spouseResidency: expect.any(String),
        stateResidency: expect.any(String), livedWithSpouse: expect.any(String),
      },
    });
    expect(getVisitedSectionStatus(state, "personal-info")).toBe("needs-review");
    expectUnknownAnnualFacts(state);
  }
  expect(original.sectionData["personal-info"]).toEqual(facts2025);

  const confirmed = updateSectionData(reopen(selected), "personal-info", {
    ...facts2025, usResidencyMonths: "0", stateResidency: "nonresident",
    spouse: { ...spouse, usResidencyMonths: "0", employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
  });
  const current = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(confirmed)));
  expect(current.taxpayer).toMatchObject({
    taxYear: 2026, stateResidency: "nonresident", livedWithSpouseAtAnyTimeDuringYear: false,
    primary: { usResidencyMonths: 0, employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
    spouse: { usResidencyMonths: 0, employmentValidSsnIssuedByDueDate: false, tinIssuedByDueDate: false },
  });
  expectUnknownAnnualFacts(reopen(setInterviewTaxYear(confirmed, 2025)));
});

it("reconfirms existing filer facts after clearing or first assigning the return year", () => {
  const blank = startInterview(segmentation);
  expect(setInterviewTaxYear(blank, 2026).sectionData["personal-info"]).toBeUndefined();
  const answeredOnlyIdentity: PersonalInfoData = {
    ...facts2025, usResidencyMonths: "", stateResidency: null,
    livedWithSpouseAtAnyTimeDuringYear: undefined, employmentValidSsnIssuedByDueDate: undefined,
    tinIssuedByDueDate: undefined, spouse: {
      ...spouse, usResidencyMonths: "", employmentValidSsnIssuedByDueDate: undefined, tinIssuedByDueDate: undefined,
    },
  };
  const identityDraft = updateSectionData(blank, "personal-info", answeredOnlyIdentity);
  expect(setInterviewTaxYear(identityDraft, 2026).sectionData["personal-info"]).toBe(answeredOnlyIdentity);
  const partial = updateSectionData(identityDraft, "personal-info", { ...answeredOnlyIdentity, tinIssuedByDueDate: false });
  expectUnknownAnnualFacts(setInterviewTaxYear(partial, 2026));

  const unbound = reopen(draft(null));
  expect(unbound.sectionData["personal-info"]).toEqual(facts2025);
  const cleared = reopen(setInterviewTaxYear(withWages(draft(2025), 2025), null));
  expect(cleared.taxYear).toBeNull();
  expectUnknownAnnualFacts(cleared);

  for (const state of [unbound, cleared]) {
    const selected = reopen(withWages(setInterviewTaxYear(state, 2026), 2026));
    expect(validateSection(selected, "income-w2").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(selected)).toBeNull();
    expectUnknownAnnualFacts(selected);
  }
});

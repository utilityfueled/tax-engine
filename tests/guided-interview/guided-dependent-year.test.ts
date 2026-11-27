// Spec: spec/federal/guided-input.yaml, dependent-return-year
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyDependentEntry, getVisitedSectionStatus, goToNextSection, loadGuidedFlowState, saveGuidedFlowState,
  setInterviewTaxYear, startInterview, updateSectionData, validateSection,
  type DependentEntryData, type GuidedFlowState, type SegmentationAnswers,
} from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculateChildCreditEligibility } from "@/engine/forms/child-credit-eligibility";
import { completeDependent, completePersonalInfo, completeW2Entry } from "./complete-facts";

const segmentation: SegmentationAnswers = { filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null };
const annualUnknown = {
  monthsLivedWithYou: "", qualifiesForCTC: null, qualifiesForODC: null, qualifiesForEIC: null,
  ctcSsnEligible: null, odcTinEligible: null,
};

function withDependent(state: GuidedFlowState, dependent: DependentEntryData): GuidedFlowState {
  return withDependents(state, [dependent]);
}

function withDependents(state: GuidedFlowState, dependents: DependentEntryData[]): GuidedFlowState {
  return updateSectionData(state, "personal-info", {
    ...completePersonalInfo, dependentCount: String(dependents.length), dependents,
  });
}

function withWages(state: GuidedFlowState, sourceYear: number): GuidedFlowState {
  return updateSectionData(state, "income-w2", { entries: [{
    ...completeW2Entry, sourceTaxYear: String(sourceYear), wages: "55000", federalWithheld: "5000",
  }] });
}

function draft(year: number | null): GuidedFlowState {
  return goToNextSection(withDependent(startInterview(segmentation, year), { ...completeDependent }));
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
  expect(saveGuidedFlowState(storage, "dependent-year", state)).toBe(true);
  const restored = loadGuidedFlowState(storage, "dependent-year");
  if (!restored) throw new Error("Expected the guided draft to reopen");
  return restored;
}

it("requires fresh dependent facts after a tax-year change and saved reopen", () => {
  for (const [originalYear, selectedYear] of [[2025, 2026], [2026, 2025]] as const) {
    const original = withWages(draft(originalYear), originalYear);
    expect(setInterviewTaxYear(original, originalYear)).toBe(original);
    const unchanged = reopen(original);
    expect(unchanged.sectionData["personal-info"]?.dependents).toEqual([completeDependent]);
    const originalInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(unchanged));
    expect(originalInput.taxpayer.dependents[0]).toMatchObject({ monthsLivedWithYou: 12, qualifiesForCTC: true });

    const changed = withWages(setInterviewTaxYear(original, selectedYear), selectedYear);
    for (const state of [changed, reopen(changed)]) {
      expect(state.taxYear).toBe(selectedYear);
      expect(validateSection(state, "income-w2").status).toBe("complete");
      expect(validateSection(state, "personal-info").status).toBe("partial");
      expect(getVisitedSectionStatus(state, "personal-info")).toBe("needs-review");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
      expect(state.sectionData["personal-info"]).toMatchObject({
        dependentCount: "1", dependents: [{ ...completeDependent, ...annualUnknown }],
      });
    }
    expect(original.sectionData["personal-info"]?.dependents).toEqual([completeDependent]);

    const retained = { ...completeDependent, ...annualUnknown };
    for (const [credit, errorKey] of [["qualifiesForCTC", "ctcSsn"], ["qualifiesForODC", "odcTin"]] as const) {
      const pending = withDependent(reopen(changed), {
        ...retained, monthsLivedWithYou: "12", qualifiesForCTC: false, qualifiesForODC: false,
        qualifiesForEIC: false, [credit]: true,
      });
      expect(validateSection(pending, "personal-info").fieldErrors).toHaveProperty(`dependent-0-${errorKey}`);
      expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    }

    const confirmed = withDependent(reopen(changed), {
      ...retained, monthsLivedWithYou: "0", qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false,
    });
    expect(validateSection(confirmed, "personal-info").status).toBe("complete");
    const retargeted = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(confirmed));
    expect(retargeted.taxpayer.taxYear).toBe(selectedYear);
    expect(retargeted.taxpayer.dependents[0]).toMatchObject({
      dateOfBirth: completeDependent.dateOfBirth, relationship: "child", monthsLivedWithYou: 0,
      qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false,
    });
  }
});

it("requires reconfirmation when assigning a year to an unbound saved dependent draft", () => {
  const newDraft = startInterview(segmentation);
  expect(setInterviewTaxYear(newDraft, 2026).sectionData["personal-info"]).toBe(newDraft.sectionData["personal-info"]);

  const legacy = reopen(draft(null));
  expect(legacy.sectionData["personal-info"]?.dependents).toEqual([completeDependent]);
  const selected = withWages(setInterviewTaxYear(legacy, 2026), 2026);
  expect(validateSection(selected, "personal-info").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(selected)).toBeNull();
  expect(reopen(selected).sectionData["personal-info"]?.dependents).toEqual([{ ...completeDependent, ...annualUnknown }]);

  const cleared = reopen(setInterviewTaxYear(withWages(draft(2025), 2025), null));
  expect(cleared.sectionData["personal-info"]?.dependents).toEqual([{ ...completeDependent, ...annualUnknown }]);
  expect(buildTaxInputFromGuidedData(withWages(setInterviewTaxYear(cleared, 2026), 2026))).toBeNull();
});

const otherDependent = { ...completeDependent, firstName: "Casey", ssn: "444-55-6666" };

it("requires fresh 2026 annual facts after editing an established dependent identity", () => {
  const base = withWages(withDependents(startInterview(segmentation, 2026), [completeDependent, otherDependent]), 2026);
  expect(calculateChildCreditEligibility(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(base))).qualifyingChildren).toBe(2);

  for (const edit of [{ ssn: "555-66-7777" }, { firstName: "Different" }, { dateOfBirth: "2016-11-02" }]) {
    const edited = { ...completeDependent, ...edit };
    const changed = reopen(withDependents(reopen(base), [edited, { ...otherDependent }]));
    expect(validateSection(changed, "personal-info").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    expect(changed.sectionData["personal-info"]?.dependents).toEqual([
      { ...edited, ...annualUnknown, ...("ssn" in edit ? { relationship: "" } : {}) }, otherDependent,
    ]);

    const confirmed = withDependents(changed, [{ ...edited, monthsLivedWithYou: "0", qualifiesForCTC: false,
      qualifiesForODC: false, qualifiesForEIC: false, ctcSsnEligible: null, odcTinEligible: null }, otherDependent]);
    expect(calculateChildCreditEligibility(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(confirmed))).qualifyingChildren).toBe(1);
  }
});

it("preserves unchanged 2026 dependents across formatting, reindexing and initial identification", () => {
  const base = withWages(withDependents(startInterview(segmentation, 2026), [completeDependent, otherDependent]), 2026);
  const formatted = { ...completeDependent, firstName: " ALEX ", ssn: "333445555" };
  for (const retained of [[{ ...otherDependent }, formatted], [{ ...otherDependent }], [{ ...otherDependent }, completeDependent]]) {
    const state = reopen(withDependents(reopen(base), retained));
    expect(validateSection(state, "personal-info").status).toBe("complete");
    expect(state.sectionData["personal-info"]?.dependents).toEqual(retained);
  }

  const initial = withWages(draft(2026), 2026);
  const partlyEntered = withDependents(startInterview(segmentation, 2026), [{ ...completeDependent, ssn: "" }]);
  expect(withDependent(partlyEntered, completeDependent).sectionData["personal-info"]?.dependents).toEqual(initial.sectionData["personal-info"]?.dependents);
});

it("preserves existing 2025 dependent identity edit behavior", () => {
  const base = withWages(draft(2025), 2025);
  const edited = { ...completeDependent, firstName: "Different", ssn: "555-66-7777", dateOfBirth: "2016-11-02" };
  const changed = reopen(withDependent(base, edited));
  expect(validateSection(changed, "personal-info").status).toBe("complete");
  expect(changed.sectionData["personal-info"]?.dependents).toEqual([edited]);
});

it("does not carry original facts or relationship into a moved 2026 replacement", () => {
  const base = withWages(withDependents(startInterview(segmentation, 2026), [completeDependent, otherDependent]), 2026);
  const edited = { ...completeDependent, ssn: "555-66-7777" };
  const state = reopen(withDependents(reopen(base), [{ ...otherDependent }, edited]));
  expect(validateSection(state, "personal-info").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(state.sectionData["personal-info"]?.dependents).toEqual([otherDependent, { ...edited, ...annualUnknown, relationship: "" }]);
  const independentlyEntered = { ...edited, relationship: "stepchild" } as const;
  expect(withDependents(base, [otherDependent, independentlyEntered]).sectionData["personal-info"]?.dependents)
    .toEqual([otherDependent, { ...independentlyEntered, ...annualUnknown }]);
  expect(withDependents(base, [otherDependent, { ...emptyDependentEntry }]).sectionData["personal-info"]?.dependents)
    .toEqual([otherDependent, emptyDependentEntry]);
  const partial = withDependents(base, [otherDependent, { ...edited, ssn: "555" }]);
  const held = partial.sectionData["personal-info"]?.dependents?.[1];
  if (!held) throw new Error("Expected the partly edited dependent");
  expect(held).toEqual({ ...edited, ssn: "555", ...annualUnknown, relationship: "" });
  const completedTin = withDependents(partial, [otherDependent, { ...held, ssn: edited.ssn, relationship: "child" }]);
  expect(completedTin.sectionData["personal-info"]?.dependents?.[1]).toEqual({ ...edited, ...annualUnknown });
});

it("clears the copied relationship during a partial 2026 identity edit", () => {
  const base = withWages(draft(2026), 2026);
  const blankName = { ...completeDependent, firstName: "" };
  const partial = reopen(withDependent(base, blankName));
  const initialEdit = partial.sectionData["personal-info"]?.dependents?.[0];
  if (!initialEdit) throw new Error("Expected the edited dependent");
  const nextTin = { ...initialEdit, ssn: "555-66-7777" };
  const newName = { ...nextTin, firstName: "Different" };
  const changed = reopen(withDependent(withDependent(partial, nextTin), newName));
  expect(initialEdit.relationship).toBe("");
  expect(changed.sectionData["personal-info"]?.dependents).toEqual([{ ...newName, ...annualUnknown, relationship: "" }]);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  expect(withDependent(base, { ...blankName, relationship: "stepchild" }).sectionData["personal-info"]?.dependents)
    .toEqual([{ ...blankName, ...annualUnknown, relationship: "stepchild" }]);
});

it("holds a new TIN entered over a documented original blank EIC identifier", () => {
  const child = { ...completeDependent, ssn: "", qualifiesForCTC: false, qualifiesForODC: false };
  const state = withDependent(startInterview({ ...segmentation, filingStatus: "mfs" }, 2026), child);
  const person = state.sectionData["personal-info"];
  if (!person) throw new Error("Expected saved original person");
  const { firstName, lastName, dateOfBirth, relationship, monthsLivedWithYou } = child;
  person.eicSeparatedSpouseSources = { sourceTaxYear: "2026", sourceFactsConfirmed: true, children: [{
    sourceId: "dependent:0", validSsnIssuedByDueDate: false,
    original: { firstName, lastName, dateOfBirth, relationship, monthsLivedWithYou, ssn: "" },
  }] };
  const replacement = { ...child, ssn: "555-66-7777" };
  const updated = updateSectionData(reopen(state), "personal-info", { ...person, dependents: [replacement] });
  expect(updated.sectionData["personal-info"]?.dependents).toEqual([{ ...replacement, ...annualUnknown, relationship: "" }]);
  expect(buildTaxInputFromGuidedData(reopen(updated))).toBeNull();
});

it("rechecks 2026 composite eligibility after a same-person relationship or residence edit", () => {
  const base = withWages(draft(2026), 2026);
  for (const edit of [{ monthsLivedWithYou: "0" }, { relationship: "stepchild" as const }]) {
    const changedDependent = { ...completeDependent, ...edit };
    const state = reopen(withDependent(base, changedDependent));
    expect(validateSection(state, "personal-info").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(state.sectionData["personal-info"]?.dependents).toEqual([{
      ...changedDependent, qualifiesForCTC: null, qualifiesForODC: null, qualifiesForEIC: null,
    }]);
    expect(buildTaxInputFromGuidedData(withDependent(state, { ...changedDependent, qualifiesForCTC: false }))).not.toBeNull();
    const legacy = withWages(draft(2025), 2025);
    expect(withDependent(legacy, changedDependent).sectionData["personal-info"]?.dependents).toEqual([changedDependent]);
  }
  const incomplete = withDependent(startInterview(segmentation, 2026), { ...completeDependent, monthsLivedWithYou: "", relationship: "" });
  expect(withDependent(incomplete, completeDependent).sectionData["personal-info"]?.dependents).toEqual([completeDependent]);
});

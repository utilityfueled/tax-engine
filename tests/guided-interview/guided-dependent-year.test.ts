// Spec: spec/federal/guided-input.yaml, dependent-return-year
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  getVisitedSectionStatus, goToNextSection, loadGuidedFlowState, saveGuidedFlowState,
  setInterviewTaxYear, startInterview, updateSectionData, validateSection,
  type DependentEntryData, type GuidedFlowState, type SegmentationAnswers,
} from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeDependent, completePersonalInfo, completeW2Entry } from "./complete-facts";

const segmentation: SegmentationAnswers = { filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null };
const annualUnknown = {
  monthsLivedWithYou: "", qualifiesForCTC: null, qualifiesForODC: null, qualifiesForEIC: null,
  ctcSsnEligible: null, odcTinEligible: null,
};

function withDependent(state: GuidedFlowState, dependent: DependentEntryData): GuidedFlowState {
  return updateSectionData(state, "personal-info", {
    ...completePersonalInfo, dependentCount: "1", dependents: [dependent],
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

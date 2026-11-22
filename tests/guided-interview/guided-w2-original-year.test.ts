// Spec: spec/federal/guided-input.yaml, w2-original-return-year
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  emptyW2Entry, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear,
  startInterview, updateSectionData, validateSection,
  type GuidedFlowState, type W2EntryData,
} from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

const wageStatement = { ...completeW2Entry, wages: "55000.05", federalWithheld: "5000.01" };

function withPersonal(state: GuidedFlowState): GuidedFlowState {
  return updateSectionData(state, "personal-info", structuredClone(completePersonalInfo));
}

function withWages(state: GuidedFlowState, ...entries: W2EntryData[]): GuidedFlowState {
  return updateSectionData(state, "income-w2", { entries });
}

function draft(year: number | null, ...entries: W2EntryData[]): GuidedFlowState {
  return withWages(withPersonal(startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null }, year)), ...entries);
}

function reopen(state: GuidedFlowState): GuidedFlowState {
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  expect(saveGuidedFlowState(storage, "w2-source-year", state)).toBe(true);
  const result = loadGuidedFlowState(storage, "w2-source-year");
  if (!result) throw new Error("Expected the guided draft to reopen");
  return result;
}

it("holds retained undated W-2 wages after switching a confirmed year and reopening", () => {
  for (const [oldYear, newYear] of [[2025, 2026], [2026, 2025]]) {
    const original = reopen(draft(oldYear, wageStatement, emptyW2Entry));
    expect(setInterviewTaxYear(original, oldYear)).toBe(original);
    expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(original)).w2s[0].taxYear).toBeUndefined();

    const changed = withPersonal(reopen(setInterviewTaxYear(original, newYear)));
    const entries = changed.sectionData["income-w2"]?.entries ?? [];
    expect(entries[0]).toMatchObject(wageStatement);
    expect(entries[0].sourceTaxYear).toBeUndefined();
    expect(entries[1]).toEqual(emptyW2Entry);
    expect(validateSection(changed, "income-w2").status).toBe("partial");
    expect(validateSection(changed, "income-w2").fieldErrors).toHaveProperty("w2-0-sourceTaxYear");
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();

    for (const sourceTaxYear of [String(oldYear), "26", ""]) {
      const pending = withWages(changed, { ...entries[0], sourceTaxYear });
      expect(buildTaxInputFromGuidedData(pending)).toBeNull();
    }
    const confirmed = withWages(changed, { ...entries[0], sourceTaxYear: String(newYear) }, emptyW2Entry);
    expect(validateSection(confirmed, "income-w2").status).toBe("complete");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(confirmed)));
    expect(input.w2s).toHaveLength(1);
    expect(input.w2s[0]).toMatchObject({ taxYear: newYear, wages: "55000.05", federalWithheld: "5000.01" });

    const throughPlaceholder = setInterviewTaxYear(reopen(setInterviewTaxYear(original, null)), newYear);
    expect(buildTaxInputFromGuidedData(withPersonal(throughPlaceholder))).toBeNull();
    const replacement = withWages(changed, { ...completeW2Entry, wages: "28000", federalWithheld: "1100" });
    expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(replacement)).w2s[0].wages).toBe("28000");
  }
});

it("preserves explicit W-2 original years and unbound legacy rows", () => {
  const past = { ...wageStatement, sourceTaxYear: "2025" };
  const current = { ...wageStatement, sourceTaxYear: "2026" };
  const old = withPersonal(setInterviewTaxYear(draft(2025, past), 2026));
  const retained = old.sectionData["income-w2"]?.entries[0];
  expect(retained).toMatchObject(past);
  expect(buildTaxInputFromGuidedData(old)).toBeNull();
  if (!retained) throw new Error("Expected the original W-2 to be retained");
  const cleared = withWages(old, { ...retained, sourceTaxYear: "" });
  expect(buildTaxInputFromGuidedData(cleared)).toBeNull();

  const matched = withPersonal(setInterviewTaxYear(draft(2025, current), 2026));
  expect(matched.sectionData["income-w2"]?.entries).toMatchObject([current]);
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(matched)).w2s[0].taxYear).toBe(2026);

  const legacy = withPersonal(setInterviewTaxYear(reopen(draft(null, wageStatement)), 2026));
  expect(legacy.sectionData["income-w2"]?.entries).toEqual([wageStatement]);
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(legacy)).w2s[0].taxYear).toBeUndefined();
});

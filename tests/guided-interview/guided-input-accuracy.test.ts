// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { buildDependents, buildScheduleCInput, buildScheduleAInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { startCompleteInterview, completePersonalInfo } from "./complete-facts";
import { emptyDependentEntry, emptyNecEntry, emptyDeductionData, initialFlowState,
  loadGuidedFlowState, getGuidedFlowStorageKey } from "@/lib/guided-interview-flow";

describe("guided input fact fidelity", () => {
  it("aggregates cents and large monetary values exactly", () => {
    expect(buildScheduleCInput([{ ...emptyNecEntry, nonemployeeCompensation: "0.10" }], "0.20", undefined)?.grossReceipts).toBe("0.3");
    expect(buildScheduleCInput([{ ...emptyNecEntry, nonemployeeCompensation: "90071992547409.91" }], "0.09", undefined)?.grossReceipts).toBe("90071992547410");
    expect(buildScheduleAInput({ ...emptyDeductionData, method: "itemized", stateLocalTaxes: "0.10", realEstateTaxes: "0.20" })).toEqual({ additionalStateLocalIncomeTaxes: "0.1", realEstateTaxes: "0.20" });
    expect(() => buildScheduleCInput([{ ...emptyNecEntry, nonemployeeCompensation: "Infinity" }], "", undefined)).toThrow();
    expect(() => buildScheduleCInput([], "1,2,3", undefined)).toThrow();
    expect(buildScheduleCInput([], "-0.20", undefined)?.grossReceipts).toBe("-0.2");
  });

  it("rejects a dependent count without actual dependent facts", () => {
    expect(() => buildDependents("1")).toThrow(/dependent/i);
    expect(() => buildDependents("1", [{ ...emptyDependentEntry }])).toThrow();
  });

  it("preserves zero residency months and explicit eligibility answers", () => {
    const actual = { ...emptyDependentEntry, firstName: "Alex", lastName: "Example",
      ssn: "111-22-3333", dateOfBirth: "2010-05-01", monthsLivedWithYou: "0",
      relationship: "child" as const, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
    expect(buildDependents("1", [actual])[0].monthsLivedWithYou).toBe(0);
    expect(() => buildDependents("1", [{ ...actual, dateOfBirth: "" }])).toThrow();
    expect(() => buildDependents("1", [{ ...actual, monthsLivedWithYou: "" }])).toThrow();
  });

  it("requires confirmation for a legacy interview without a year", () => {
    const { taxYear: _year, ...legacy } = initialFlowState;
    const storage = { getItem: (key: string) => key === getGuidedFlowStorageKey("legacy") ? JSON.stringify(legacy) : null } as Storage;
    const loaded = loadGuidedFlowState(storage, "legacy");
    expect(loaded?.taxYear).toBeNull();
    expect(computeGuidedPreview(loaded)).toBeNull();
  });

  it("carries the selected year without making an incomplete year calculable", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2026 })?.taxpayer.taxYear).toBe(2026);
    expect(computeGuidedPreview({ ...state, taxYear: 2026 })).toBeNull();
    expect(buildTaxInputFromGuidedData({ ...state, taxYear: null })).toBeNull();
    const storage = { getItem: () => JSON.stringify({ ...state, taxYear: 2026 }) } as unknown as Storage;
    expect(loadGuidedFlowState(storage, "future")?.taxYear).toBe(2026);
  });

  it("requires actual primary and spouse facts before previewing", () => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
    expect(buildTaxInputFromGuidedData(state)?.taxpayer.spouse?.dateOfBirth).toBe("1992-09-10");
    for (const facts of [
      { ...completePersonalInfo, dateOfBirth: "" },
      { ...completePersonalInfo, dateOfBirth: "2025-02-29" },
      { ...completePersonalInfo, dateOfBirth: "2026-01-01" },
      { ...completePersonalInfo, spouse: undefined },
      { ...completePersonalInfo, usResidencyMonths: "" },
    ]) {
      expect(computeGuidedPreview({ ...state, sectionData: { "personal-info": facts } })).toBeNull();
    }
    expect(computeGuidedPreview(state)).not.toBeNull();
  });
});

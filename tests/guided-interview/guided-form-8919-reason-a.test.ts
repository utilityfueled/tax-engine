import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { getGuidedSectionRoute, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateForm8919 } from "@/engine/forms/form-8919";
import { getConstants } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { d } from "@/utils/decimal";
import { startCompleteInterview } from "./complete-facts";
import { actualTipW2 } from "./guided-tip-income-fixtures";

const original = {
  taxYear: "2026", firmName: "Example Services", employerEin: "65-4321098",
  determinationDate: "2025-10-15", wages: "1,000.25", confirmed: true,
};

function interview() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["additional-deductions"], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-w2"] = { entries: [{ ...actualTipW2, sourceTaxYear: "2026", socialSecurityWages: "183,500", socialSecurityTips: "0" }] };
  state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original } };
  return state;
}

function wageStatement(state: ReturnType<typeof interview>) {
  const entry = state.sectionData["income-w2"]?.entries[0];
  assert.ok(entry);
  return entry;
}

it("projects confirmed source wages to the real payroll calculation", () => {
  const state = interview();
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form8919).toEqual({ accountHolder: "primary", wagesNotReportedOnW2: "1000.25" });
  assert.ok(input?.form8919);
  const result = calculateForm8919(input.form8919, FEDERAL_2026_CONSTANTS, { socialSecurityWagesAndTipsAlreadyReported: d(input.w2s[0]?.socialSecurityWages) });
  expect(result.line8.toFixed()).toBe("183500");
  expect(result.line10.toFixed()).toBe("1000");
  expect(result.line13.toFixed()).toBe("77");
  expect(() => getConstants(2026)).toThrow(/incomplete/);
});

it("rejects incomplete or overlapping wage evidence", () => {
  for (const changes of [{ taxYear: "2025" }, { wages: "0" }, { confirmed: false }, { determinationDate: "2026-02-30" }, { determinationDate: "2099-01-01" }]) {
    const state = interview();
    state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original, ...changes } };
    expect(validateSection(state, "additional-deductions").status).not.toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  for (const changes of [{ employerEin: original.employerEin }, { employerEin: "" }, { socialSecurityTips: "" }, { sourceTaxYear: undefined }]) {
    const state = interview();
    const entry = wageStatement(state);
    state.sectionData["income-w2"] = { entries: [{ ...entry, ...changes }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  const state = interview();
  const entry = wageStatement(state);
  const changed = updateSectionData(state, "income-w2", { entries: [{ ...entry, socialSecurityWages: "183499" }] });
  expect(changed.sectionData["additional-deductions"]?.form8919ReasonA).toEqual({ ...original, confirmed: false });
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it("retains a saved draft in the route and holds changed scope", () => {
  const state = interview();
  state.segmentation.lifeEvents = [];
  expect(getGuidedSectionRoute(state).map(section => section.id)).toContain("additional-deductions");
  expect(buildTaxInputFromGuidedData(state)?.form8919).toBeDefined();
  for (const segmentation of [{ ...state.segmentation, filingStatus: "mfj" as const }, { ...state.segmentation, stateCode: "OH" }]) {
    expect(buildTaxInputFromGuidedData({ ...state, segmentation })).toBeNull();
  }
  expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2025 })).toBeNull();
});

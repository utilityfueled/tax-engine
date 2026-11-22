// Spec: spec/federal/form-5329-guided-code1-ira-2026.yaml.
import assert from "node:assert/strict";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import type { RetirementEntryData } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedFirstHomeWorksheet } from "../fixtures/guided-first-home";
import { completeRetirementSource, startCompleteInterview } from "./complete-facts";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

beforeEach(() => vi.setSystemTime(new Date(2026, 7, 1, 12)));
afterEach(() => vi.useRealTimers());

const ownerBirthDate = "1967-02-01";
const receipt = { singlePaymentConfirmed: true, ownerBirthDate, distributionDate: "2026-07-31" };
const original: RetirementEntryData = {
  ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "1", isIraSepSimple: true,
  grossDistribution: "6000", taxableAmount: "6000", code1IraAgeSource: receipt,
};

function project(entries: RetirementEntryData[]) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  personal.dateOfBirth = ownerBirthDate;
  state.sectionData["income-retirement"] = { entries };
  return buildTaxInputFromGuidedData(state);
}

it("projects the 2026 IRA receipt and applies the exact age boundary through Form 5329", () => {
  for (const [distributionDate, exception, partI] of [
    ["2026-07-31", undefined, ["6000", "0", "6000", "600"]],
    ["2026-08-01", "12", ["6000", "6000", "0", "0"]],
  ] as const) {
    const projected = project([{ ...original, code1IraAgeSource: { ...receipt, distributionDate } }]);
    expect(projected?.form1099R[0]).toMatchObject({ distributionCode: "1", distributionDate, taxYear: 2026 });
    expect(projected?.form5329FirstHomeSource).toBeUndefined();
    const result = calculateFederalTax(TaxYearInputSchema.parse(projected));
    expect(result.iraDistributionsTaxable.toFixed()).toBe("6000");
    const form = result.form5329;
    assert.ok(form);
    expect(form.line2ExceptionNumber).toBe(exception);
    expect([form.line1, form.line2, form.line3, form.line4].map(amount => amount.toFixed())).toEqual(partI);
  }
});

it("holds an invalid or stale 2026 receipt and preserves the separate first-home boundary", () => {
  expect(project([original])).not.toBeNull();
  for (const change of [
    { distributionDate: "2025-07-31" }, { distributionDate: "2026-02-30" },
    { distributionDate: undefined }, { ownerBirthDate: "1967-02-02" }, { singlePaymentConfirmed: false },
  ]) {
    expect(project([{ ...original, code1IraAgeSource: { ...receipt, ...change } }])).toBeNull();
  }
  expect(project([{ ...original, additionalWorksheetRequired: true }])).toBeNull();
  expect(project([{ ...original, trumpAccount: true }])).toBeNull();
  expect(project([{ ...original, excessContributionEarnings: "1" }])).toBeNull();
  expect(project([original, { ...completeRetirementSource, sourceTaxYear: "2026", accountReference: "separate" }])).toBeNull();
  expect(project([{ ...original, code1IraFirstHomeSource: guidedFirstHomeWorksheet }])).toBeNull();
});

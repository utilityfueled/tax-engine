// Spec: spec/federal/guided-input.yaml, w2-duplicate-current-original.
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { validateSection, type W2EntryData } from "@/lib/guided-interview-flow";
import { w2FactErrors } from "@/lib/guided-w2-facts";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeW2Entry, startCompleteInterview } from "./complete-facts";

const original = {
  ...completeW2Entry, sourceTaxYear: "2026", wages: "50000", federalWithheld: "5000",
  socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725",
};
const reentered = {
  ...original, employerName: " synthetic   employer ", employerEin: "123456789", accountHolder: "" as const,
  wages: "50,000.00", federalWithheld: "5,000.00", allocatedTips: "0.00", box12CodeD: "0",
};

function reopenedInterview(entries: W2EntryData[], filingStatus: "single" | "mfj" = "single", year = 2026) {
  const state = startCompleteInterview({ filingStatus, incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.taxYear = year;
  state.sectionData["income-w2"] = { entries };
  return JSON.parse(JSON.stringify(state)) as typeof state;
}

it("holds indistinguishable 2026 W-2 entries after reopening the interview", () => {
  const state = reopenedInterview([original, reentered]);
  expect(validateSection(state, "income-w2").status).toBe("partial");
  const errors = w2FactErrors(state.sectionData["income-w2"]?.entries, "single", 2026);
  expect(Object.values(errors)).toEqual([expect.stringMatching(/same federal W-2 facts/u)]);
  expect(JSON.stringify(errors)).not.toMatch(/Synthetic Employer|123456789|50000|5000/u);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("preserves distinct same-employer originals, joint recipients and 2025 entry behavior", () => {
  const differentWages = { ...original, wages: "3000", federalWithheld: "300" };
  const differentBox12 = { ...original, box12CodeD: "200.25" };
  const spouse = { ...reentered, accountHolder: "spouse" as const };
  const priorYear = [original, reentered].map(entry => ({ ...entry, sourceTaxYear: "2025" }));
  for (const state of [
    reopenedInterview([original, differentWages]),
    reopenedInterview([original, differentBox12]),
    reopenedInterview([original, spouse], "mfj"),
    reopenedInterview(priorYear, "single", 2025),
  ]) {
    expect(validateSection(state, "income-w2").status).toBe("complete");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    expect(input.w2s).toHaveLength(2);
  }
});

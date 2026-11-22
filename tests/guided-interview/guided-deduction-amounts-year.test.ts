import { expect, it } from "vitest";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import {
  emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear,
  startInterview, updateSectionData, validateSection,
  type DeductionData, type GuidedFlowState,
} from "@/lib/guided-interview-flow";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

function currentYearFacts(state: GuidedFlowState, year: number) {
  state = updateSectionData(state, "personal-info", structuredClone(completePersonalInfo));
  state = updateSectionData(state, "income-w2", { entries: [{
    ...completeW2Entry, employerName: `Wage source ${year}`, sourceTaxYear: String(year),
    wages: "60000", federalWithheld: "8000",
  }] });
  return year === 2026 ? updateSectionData(state, "review", { qof2026Disclosure: false }) : state;
}

function draft(year: number | null, amounts: Partial<DeductionData>) {
  const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null }, year);
  return updateSectionData(year === null ? state : currentYearFacts(state, year), "deductions", { ...emptyDeductionData, ...amounts });
}

function reopen(state: GuidedFlowState) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
  expect(saveGuidedFlowState(storage, "annual-deductions", state)).toBe(true);
  const loaded = loadGuidedFlowState(storage, "annual-deductions");
  if (!loaded) throw new Error("Expected the guided deductions draft to reopen");
  return loaded;
}

function updateDeductions(state: GuidedFlowState, patch: Partial<DeductionData>) {
  return updateSectionData(state, "deductions", { ...emptyDeductionData, ...state.sectionData.deductions, ...patch });
}

it("holds manual gambling winnings across return-year changes", () => {
  const original = reopen(draft(2026, { gamblingWinnings: "10000.25" }));
  expect(validateSection(original, "deductions").status).toBe("complete");
  expect(setInterviewTaxYear(original, 2026)).toBe(original);
  const switched = currentYearFacts(reopen(setInterviewTaxYear(original, 2025)), 2025);
  expect(switched.sectionData.deductions?.gamblingWinnings).toBe("10000.25");
  expect(computeGuidedPreviewEvaluation(switched).input).toBeNull();
  expect(validateSection(switched, "deductions").fieldErrors).toHaveProperty("manualWinningsTaxYear");

  const confirmed = reopen(updateDeductions(switched, { manualWinningsTaxYear: 2025 }));
  expect(validateSection(confirmed, "deductions").status).toBe("complete");
  const formatted = updateDeductions(confirmed, { gamblingWinnings: "10,000.25" });
  expect(computeGuidedPreviewEvaluation(formatted).preview.metrics).toMatchObject({ agi: "70000.25", totalTax: "6855" });

  const switchedBack = currentYearFacts(reopen(setInterviewTaxYear(confirmed, 2026)), 2026);
  expect(computeGuidedPreviewEvaluation(switchedBack).input).toBeNull();
  expect(updateDeductions(switchedBack, { manualWinningsTaxYear: 2026 }).sectionData.deductions?.gamblingWinnings).toBe("10000.25");
});

it("holds direct itemized amounts when itemizing after a year change", () => {
  const original = draft(2026, { method: "standard", medicalExpenses: "25000" });
  const switched = currentYearFacts(reopen(setInterviewTaxYear(original, 2025)), 2025);
  expect(computeGuidedPreviewEvaluation(switched).preview.metrics?.totalTax).toBe("5075");

  const itemizing = updateDeductions(switched, { method: "itemized" });
  expect(itemizing.sectionData.deductions?.medicalExpenses).toBe("25000");
  expect(computeGuidedPreviewEvaluation(itemizing).input).toBeNull();
  expect(validateSection(itemizing, "deductions").fieldErrors).toHaveProperty("directItemizedAmountsTaxYear");

  const confirmed = reopen(updateDeductions(itemizing, { directItemizedAmountsTaxYear: 2025 }));
  expect(computeGuidedPreviewEvaluation(confirmed).preview.metrics?.totalTax).toBe("4505");
});

it("holds the direct withholding allocation across return years", () => {
  const original = draft(2026, { method: "itemized", nonW2IncomeTaxesDeductedElsewhere: "1000" });
  const switched = currentYearFacts(reopen(setInterviewTaxYear(original, 2025)), 2025);
  expect(switched.sectionData.deductions?.nonW2IncomeTaxesDeductedElsewhere).toBe("1000");
  expect(validateSection(switched, "deductions").fieldErrors).toHaveProperty("directItemizedAmountsTaxYear");
  expect(computeGuidedPreviewEvaluation(switched).input).toBeNull();
});

it("preserves first assignment and renews confirmation after editing retained amounts", () => {
  const first = currentYearFacts(setInterviewTaxYear(draft(null, { gamblingWinnings: "0" }), 2025), 2025);
  expect(computeGuidedPreviewEvaluation(first).preview.metrics?.totalTax).toBe("5075");

  const cleared = reopen(setInterviewTaxYear(first, null));
  const pending = currentYearFacts(setInterviewTaxYear(cleared, 2025), 2025);
  expect(validateSection(pending, "deductions").fieldErrors).toHaveProperty("manualWinningsTaxYear");
  const confirmed = updateDeductions(pending, { manualWinningsTaxYear: 2025 });
  const edited = reopen(updateDeductions(confirmed, { gamblingWinnings: "0.25" }));
  expect(validateSection(edited, "deductions").fieldErrors).toHaveProperty("manualWinningsTaxYear");
  expect(computeGuidedPreviewEvaluation(edited).input).toBeNull();
  expect(computeGuidedPreviewEvaluation(updateDeductions(edited, { gamblingWinnings: "" })).preview.metrics?.totalTax).toBe("5075");
});

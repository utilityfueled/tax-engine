// Spec: spec/federal/guided-input.yaml, deduction-categories and state-payment-sources
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildScheduleAInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { emptyDeductionData, emptyStateReturnData, validateSection, type StateReturnData } from "@/lib/guided-interview-flow";
import { SectionDeductions } from "@/components/guided-interview/section-deductions";
import { startCompleteInterview } from "./complete-facts";

function stateWith(data: StateReturnData) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
  return { ...state, sectionData: { ...state.sectionData, deductions: { ...emptyDeductionData, method: "itemized" as const }, "state-return": data } };
}

describe("classified deduction and state facts", () => {
  it("preserves tax and investment categories instead of combining unrelated deductions", () => {
    expect(buildScheduleAInput({ ...emptyDeductionData, method: "itemized", medicalExpenses: "0", stateLocalTaxes: "0.10", realEstateTaxes: "0.20", personalPropertyTaxes: "0.03", otherItemized: "8", investmentInterestExpense: "3", gamblingWinnings: "10", gamblingLosses: "5" })).toEqual({ medicalExpenses: "0", additionalStateLocalIncomeTaxes: "0.1", realEstateTaxes: "0.20", personalPropertyTaxes: "0.03", investmentInterestExpense: "3", gamblingWinnings: "10", gamblingLosses: "5" });
    expect(buildScheduleAInput({ ...emptyDeductionData, gamblingWinnings: "0" })).toEqual({ gamblingWinnings: "0" });
    expect(buildScheduleAInput({ ...emptyDeductionData, gamblingWinnings: "10", gamblingLosses: "5" })).toEqual({ gamblingWinnings: "10" });
  });

  it("blocks ambiguous or unsupported saved deductions and malformed edits", () => {
    const base = stateWith(emptyStateReturnData);
    for (const deduction of [
      { otherItemized: "20" },
      { otherItemized: "20", investmentInterestExpense: "10", gamblingLosses: "5", gamblingWinnings: "10" },
      { casualtyLosses: "20" },
      { gamblingLosses: "20" },
      { mortgageInterest: "-" },
      { medicalExpenses: "-1" },
    ]) {
      const state = { ...base, sectionData: { ...base.sectionData, deductions: { ...emptyDeductionData, method: "itemized" as const, ...deduction } } };
      expect(validateSection(state, "deductions").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
    expect(() => renderToStaticMarkup(createElement(SectionDeductions, { data: { ...emptyDeductionData, method: "itemized", mortgageInterest: "-" }, filingStatus: "single", taxYear: 2025, onDataChange: () => {} }))).not.toThrow();
  });

  it("forwards dated state estimates and classified withholding with exact zero-preserving amounts", () => {
    const state = stateWith({ ...emptyStateReturnData, additionalStateWithholding: "0.30", additionalStateWithholdingEntries: [
      { payer: "Example Pension", documentType: "1099-R", state: "OH", taxYear: "2025", amount: "0.1" },
      { payer: "Example Bank", documentType: "1099-INT", state: "OH", taxYear: "2025", amount: "0.2" },
      { payer: "Example Brokerage", documentType: "1099-DIV", state: "OH", taxYear: "2025", amount: "0" },
    ], stateEstimatedPayments: [{ state: "OH", date: "2025-09-15", amount: "0" }, { state: "OH", date: "2026-01-15", amount: "9007199254740993.01" }] });
    expect(validateSection(state, "state-return").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.scheduleA?.additionalStateLocalIncomeTaxes).toBe("0.3");
    expect(buildTaxInputFromGuidedData(state)?.adjustments?.estimatedTaxPayments).toEqual([{ type: "state", state: "OH", date: "2025-09-15", amount: "0" }, { type: "state", state: "OH", date: "2026-01-15", amount: "9007199254740993.01" }]);
  });

  it("blocks unknown, contradictory and unclassified state source facts", () => {
    for (const data of [
      { ...emptyStateReturnData, additionalStateWithholding: "100" },
      { ...emptyStateReturnData, stateEstimatedPayments: [{ date: "2025-04-15", amount: "100" }] },
      { ...emptyStateReturnData, stateEstimatedPayments: [{ state: "OH", date: "2025-02-30", amount: "100" }] },
      { ...emptyStateReturnData, stateEstimatedPayments: [{ state: "PA", date: "2025-04-15", amount: "100" }] },
      { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: "Pension", documentType: "1099-R", state: "OH", taxYear: "2024", amount: "100" }] },
      { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: "", documentType: "1099-R", state: "OH", taxYear: "2025", amount: "0" }] },
    ]) {
      const state = stateWith(data);
      expect(validateSection(state, "state-return").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
      expect(computeGuidedPreview(state)).toBeNull();
    }
  });
});

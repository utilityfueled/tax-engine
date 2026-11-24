// Spec: spec/federal/guided-input.yaml, deduction-categories and state-payment-sources
import { describe, expect, it } from "vitest";
import { explicitlyConfirmFullYearOhioNavigationFixture } from "../fixtures/guided-ohio-source-navigation.js";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildScheduleAInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { emptyDeductionData, emptyStateReturnData, setInterviewTaxYear, startInterview, updateSectionData, validateSection, type StateReturnData } from "@/lib/guided-interview-flow";
import { SectionDeductions } from "@/components/guided-interview/section-deductions";
import { SectionReview } from "@/components/guided-interview/section-review";
import { calculateStateTaxPaymentsInYear } from "@/engine/forms/state-tax-payment-year";
import { TaxYearInputSchema } from "@/models/inputs";
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";

function stateWith(data: StateReturnData) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
  return { ...state, sectionData: { ...state.sectionData, deductions: { ...emptyDeductionData, method: "itemized" as const }, "state-return": data } };
}

function illinoisReturn(taxYear: number, draft = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "IL" }, taxYear)) {
  const person = updateSectionData(draft, "personal-info", { ...completePersonalInfo, state: "IL", city: "Chicago", zip: "60601" });
  return updateSectionData(person, "income-w2", { entries: [{ ...completeW2Entry, sourceTaxYear: String(taxYear),
    wages: "60000", federalWithheld: "6000", medicareWages: "60000", medicareWithheld: "870",
    socialSecurityWages: "60000", socialSecurityWithheld: "3720" }] });
}

describe("classified deduction and state facts", () => {
  it("holds a retained estimate instead of crediting the wrong generic state return year", () => {
    const payment = { state: "IL", date: "2026-09-15", amount: "1000" };
    const prior = updateSectionData(illinoisReturn(2026), "state-return", { ...emptyStateReturnData, stateEstimatedPayments: [payment] });

    const changed = illinoisReturn(2025, setInterviewTaxYear(prior, 2025));
    expect(changed.sectionData["state-return"]?.stateEstimatedPayments).toEqual([payment]);
    expect(computeGuidedPreview(changed)?.state).toBeUndefined();
    expect(validateSection(changed, "state-return").fieldErrors?.["payment-0-application-year"]).toEqual(expect.stringMatching(/tax year/i));
    const review = renderToStaticMarkup(createElement(SectionReview, { state: changed, preview: null, onJumpToSection: () => {} }));
    expect(review).toContain("Confirm the applied tax year and payment details in State Return.");
    expect(review).not.toContain("State estimated payments (1)");

    const removed = updateSectionData(changed, "state-return", emptyStateReturnData);
    expect(computeGuidedPreview(removed)?.state).toMatchObject({ stateAmountOwed: "2829", stateWithholding: "0" });

    const previouslyConfirmed = updateSectionData(prior, "state-return", { ...emptyStateReturnData,
      stateEstimatedPayments: [{ ...payment, application: { taxYear: "2026", confirmed: true } }] });
    const changedConfirmed = illinoisReturn(2025, setInterviewTaxYear(previouslyConfirmed, 2025));
    expect(changedConfirmed.sectionData["state-return"]).toEqual(previouslyConfirmed.sectionData["state-return"]);
    expect(computeGuidedPreview(changedConfirmed)?.state).toMatchObject({ stateAmountOwed: "2829", stateWithholding: "0" });
    expect(validateSection(changedConfirmed, "state-return").status).toBe("complete");
    const confirmedReview = renderToStaticMarkup(createElement(SectionReview, { state: changedConfirmed, preview: null, onJumpToSection: () => {} }));
    expect(confirmedReview).toContain("Payments applied to another tax year are excluded from this state total.");
    expect(confirmedReview).not.toContain("State estimated payments (1)");
  });

  it("requires a recorded generic state application year and preserves confirmed cross-calendar payments and zero", () => {
    const legacy = { state: "IL", date: "2025-09-15", amount: "0" };
    const unconfirmed = updateSectionData(illinoisReturn(2025), "state-return", { ...emptyStateReturnData, stateEstimatedPayments: [legacy] });
    expect(validateSection(unconfirmed, "state-return").fieldErrors?.["payment-0-application-year"]).toEqual(expect.stringMatching(/tax year/i));
    expect(buildTaxInputFromGuidedData(unconfirmed)).toBeNull();

    const application = { taxYear: "2025", confirmed: true };
    const january = { state: "IL", date: "2026-01-15", amount: "1000.25", application };
    const confirmed = updateSectionData(unconfirmed, "state-return", { ...emptyStateReturnData, stateEstimatedPayments: [{ ...legacy, application }, january] });
    expect(validateSection(confirmed, "state-return").status).toBe("complete");
    expect(computeGuidedPreview(confirmed)?.state).toMatchObject({ stateAmountOwed: "1828.75", stateWithholding: "1000.25" });
    const cashYearInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(confirmed));
    expect(cashYearInput.adjustments?.estimatedTaxPayments).toEqual([
      { ...legacy, type: "state", application: { taxYear: 2025, confirmed: true } },
      { ...january, type: "state", application: { taxYear: 2025, confirmed: true } },
    ]);
    expect(calculateStateTaxPaymentsInYear(cashYearInput).toFixed()).toBe("0");
    const paidInYear = updateSectionData(confirmed, "state-return", { ...emptyStateReturnData,
      stateEstimatedPayments: [{ ...legacy, application: { taxYear: "2024", confirmed: true }, amount: "30.25" }, january] });
    expect(calculateStateTaxPaymentsInYear(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(paidInYear))).toFixed()).toBe("30.25");
    expect(computeGuidedPreview(paidInYear)?.state).toMatchObject({ stateAmountOwed: "1828.75", stateWithholding: "1000.25" });
  });

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
    explicitlyConfirmFullYearOhioNavigationFixture(state);
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

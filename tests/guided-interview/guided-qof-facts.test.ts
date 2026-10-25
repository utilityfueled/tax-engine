// Spec: spec/federal/qof-disposition-facts.yaml.
import { expect, it } from "vitest";
import { buildGuidedQofFacts } from "@/lib/guided-qof-facts";
import { initialFlowState, updateSectionData, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

it("preserves actual QOF facts and revokes changed investment confirmation", () => {
  const facts = { sourceTaxYear: "2025", sourceReference: "Original brokerage and investment statements", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false };
  expect(buildGuidedQofFacts(undefined, 2025)).toBeUndefined();
  expect(buildGuidedQofFacts(facts, 2025)).toMatchObject({ sourceTaxYear: 2025, disposedOfQofInvestment: false });
  for (const patch of [{ sourceTaxYear: "" }, { sourceTaxYear: "2026" }, { disposedOfQofInvestment: null }, { sourceFactsConfirmed: null }, { disposedOfQofInvestment: true }]) {
    expect(() => buildGuidedQofFacts({ ...facts, ...patch }, 2025)).toThrow(/QOF|year|unknown|confirm/);
  }
  const investment = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: facts };
  const state: GuidedFlowState = { ...initialFlowState, phase: "interview", taxYear: 2025,
    segmentation: { filingStatus: "single", incomeTypes: ["w2-wages", "investments"], lifeEvents: [], stateCode: null },
    sectionData: { "personal-info": completePersonalInfo, "income-w2": { entries: [{ ...completeW2Entry, wages: "50000" }] }, "income-investments": investment } };
  expect(buildTaxInputFromGuidedData(state)?.qofDispositionFacts).toMatchObject({ sourceTaxYear: 2025, disposedOfQofInvestment: false });
  const positiveState = { ...state, sectionData: { ...state.sectionData, "income-investments": { ...investment, qofDispositionFacts: { ...facts, disposedOfQofInvestment: true } } } };
  expect(buildTaxInputFromGuidedData(positiveState)).toBeNull();
  expect(positiveState.sectionData["income-investments"].qofDispositionFacts.disposedOfQofInvestment).toBe(true);
  const confirmed = updateSectionData(state, "income-investments", { ...investment, qofDispositionFacts: { ...facts, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData["income-investments"]?.qofDispositionFacts?.sourceFactsConfirmed).toBe(true);
  const changed = updateSectionData(state, "income-investments", { ...investment, qofDispositionFacts: { ...facts, sourceReference: "Corrected original statement" } });
  expect(changed.sectionData["income-investments"]?.qofDispositionFacts).toMatchObject({ sourceFactsConfirmed: null, disposedOfQofInvestment: false, sourceReference: "Corrected original statement" });
  const household = updateSectionData(state, "personal-info", { ...completePersonalInfo, lastName: "Changed" });
  expect(household.sectionData["income-investments"]?.qofDispositionFacts?.sourceFactsConfirmed).toBeNull();
});

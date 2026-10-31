// Spec: spec/federal/qof-disposition-facts.yaml.
import { expect, it } from "vitest";
import { buildGuidedQofFacts, emptyQofInvestment, type QofDispositionData } from "@/lib/guided-qof-facts";
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

it("builds complete inclusion rows and keeps unknown answers unknown", () => {
  // Spec: spec/federal/qof-deferred-gain-inclusion.yaml guide.
  const row = { ...emptyQofInvestment, sourceId: "qof-1", sourceReference: "Fictional QOF records", sourceFactsConfirmed: true, qofEin: "98-7654321", description: "Fictional 25% interest",
    investmentDate: "2021-06-30", interestType: "corporation", gainCharacter: "long_term", originalDeferredGain: "100,000", remainingDeferredGain: "100,000", event: "december_31_2026",
    eventDate: "2026-12-31", entireInvestment: true, fairMarketValue: "0" };
  const facts: QofDispositionData = { sourceTaxYear: "2026", sourceReference: "Fictional complete records", sourceFactsConfirmed: true, allInvestmentsReviewed: true,
    disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: true, investments: [row] };
  const built = buildGuidedQofFacts(facts, 2026)!;
  expect(built.investments![0]).toMatchObject({ remainingDeferredGain: "100000", fairMarketValue: "0", entireInvestment: true });
  expect(built.investments![0]).not.toHaveProperty("proceeds");
  for (const patch of [{ remainingDeferredGain: "" }, { fairMarketValue: "" }, { investmentDate: "" }, { sourceFactsConfirmed: null }, { entireInvestment: null }, { gainCharacter: "" }]) {
    expect(() => buildGuidedQofFacts({ ...facts, investments: [{ ...row, ...patch }] }, 2026), JSON.stringify(patch)).toThrow(/QOF/);
  }
  expect(() => buildGuidedQofFacts({ ...facts, deferredGainHeldAtYearEnd: null }, 2026)).toThrow(/year-end/);
  expect(() => buildGuidedQofFacts({ ...facts, investments: [] }, 2026)).toThrow(/year-end/);
  expect(buildGuidedQofFacts({ ...facts, deferredGainHeldAtYearEnd: false, investments: [] }, 2026)).toMatchObject({ deferredGainHeldAtYearEnd: false });
});

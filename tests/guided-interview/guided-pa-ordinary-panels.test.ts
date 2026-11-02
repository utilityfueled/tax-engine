/** Spec: spec/state/guided-pa-ordinary-panels.yaml. Literal facts precede product. */
import { expect, it } from "vitest";
import * as flow from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import type { TaxYearInput } from "@/models/inputs.js";
import { guidedPAOrdinaryPanelFixture, paPanelStatuses, required, type PAOrdinaryPanelData } from "../fixtures/guided-pa-ordinary-panels";
import { paCompletionOriginalRecordFixture } from "../fixtures/pa-ordinary-return-completion";
function sourceInput(state: flow.GuidedFlowState): TaxYearInput | null {
  const method = (flow as unknown as { buildGuidedPAOrdinarySourceInput?: (state: flow.GuidedFlowState) => TaxYearInput | null }).buildGuidedPAOrdinarySourceInput;
  expect(typeof method).toBe("function"); return required(method)(state);
}
function data(state: flow.GuidedFlowState): PAOrdinaryPanelData { return required(state.sectionData["state-return"]); }
it("PA ordinary source context is available before ordinary confirmation for all three residencies", () => {
  for (const status of paPanelStatuses) {
    const f = guidedPAOrdinaryPanelFixture(status); delete f.data.paOrdinaryReturnFacts; delete f.data.paOrdinaryReturnCompletionSources;
    const before = structuredClone(f.state), actual = sourceInput(f.state);
    expect(actual).toEqual(f.sourceInput); expect(actual?.w2s[0]?.wages).toBe("50000"); expect(actual?.form1099Int[0]?.interestIncome).toBe("120");
    expect(actual).not.toHaveProperty("paOrdinaryReturnFacts"); expect(actual).not.toHaveProperty("paOrdinaryReturnCompletionSources"); expect(f.state).toEqual(before);
    f.data.paResidencySources = { ...required(f.data.paResidencySources), sourceFactsConfirmed: null };
    expect(sourceInput(f.state)).toBeNull(); expect(buildTaxInputFromGuidedData(f.state)).not.toBeNull();
  }
});
it("PA state navigation requires both current complete ordinary packets", () => {
  for (const status of paPanelStatuses) for (const missing of ["paResidencySources", "paOrdinaryReturnFacts", "paOrdinaryReturnCompletionSources"] as const) {
    const f = guidedPAOrdinaryPanelFixture(status); delete f.data[missing];
    expect(flow.validateSection(f.state, "state-return").status, `${status}/${missing}`).toBe("partial");
  }
});
it.each(paPanelStatuses)("PA state navigation replays current actual sources", status => {
  const f = guidedPAOrdinaryPanelFixture(status), before = structuredClone(f.state);
  expect(flow.validateSection(f.state, "state-return").status).toBe("complete"); expect(f.state).toEqual(before);
  f.sources.sourceFactsConfirmed = null; expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
});
it.each(["factsOwner", "factsYear", "completionOwner", "completionYear", "originalSnapshot", "unknownCompletion", "unknownFacts"] as const)("PA navigation blocks stale or unknown %s", kind => {
  const f = guidedPAOrdinaryPanelFixture();
  if (kind === "factsOwner") f.facts.owner.originalTaxpayer = { firstName: "Changed", lastName: "Owner", ssn: "900-00-0000" };
  if (kind === "factsYear") f.facts.sourceTaxYear = 2024;
  if (kind === "completionOwner") f.sources.owner.ssn = "900-00-0000";
  if (kind === "completionYear") f.sources.sourceTaxYear = 2024;
  if (kind === "originalSnapshot") f.sources.originalFederalSources = {};
  if (kind === "unknownCompletion") f.sources.care.status = "unknown";
  if (kind === "unknownFacts") f.facts.payments.allPaymentsIncludedConfirmed = null;
  expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
});
it("PA source edits invalidate confirmation while preserving all original records", () => {
  for (const section of ["personal-info", "income-w2", "payments"] as const) {
    const f = guidedPAOrdinaryPanelFixture(); const next = section === "personal-info" ? { ...required(f.state.sectionData[section]), lastName: "Edited" } : section === "income-w2" ? { entries: required(f.state.sectionData[section]).entries.map(w => ({ ...w, employerName: "Same-money original changed" })) } : { ...flow.emptyPaymentData, ...f.state.sectionData[section], estimatedPayments: [{ date: "2025-04-15", amount: "25" }] };
    const updated = flow.updateSectionData(f.state, section, next), actual = data(updated);
    expect(actual.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(actual.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
    expect(actual.paOrdinaryReturnFacts?.originalFederalSources).toEqual(f.facts.originalFederalSources); expect(actual.paOrdinaryReturnCompletionSources?.otherStateTaxes).toEqual(f.sources.otherStateTaxes);
    expect(flow.validateSection(updated, "state-return").status).toBe("partial");
  }
});
it("PA direct source edits clear affected headers without erasing positive records", () => {
  const f = guidedPAOrdinaryPanelFixture(); f.sources.care.status = "actual_expenses"; f.sources.care.originalCarePayments = [paCompletionOriginalRecordFixture("care_payment")];
  const care = { ...f.sources, sourceReference: "Edited source reference" };
  const updated = flow.updateSectionData(f.state, "state-return", { ...f.data, paOrdinaryReturnCompletionSources: care });
  expect(data(updated).paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull(); expect(data(updated).paOrdinaryReturnCompletionSources?.care.originalCarePayments).toEqual(f.sources.care.originalCarePayments);
  const changedResidency = { ...required(f.data.paResidencySources), sourceReference: "Changed actual PA source" };
  const changed = data(flow.updateSectionData(f.state, "state-return", { ...f.data, paResidencySources: changedResidency }));
  expect(changed.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(changed.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  const ledger = data(flow.updateSectionData(f.state, "state-return", { ...f.data, stateEstimatedPayments: [{ state: "PA", date: "2025-04-15", amount: "25" }] }));
  expect(ledger.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(ledger.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
});
it("PA unchanged saves and explicit confirmation metadata preserve source records", () => {
  const f = guidedPAOrdinaryPanelFixture(); const unchanged = flow.updateSectionData(f.state, "state-return", structuredClone(f.data));
  expect(data(unchanged)).toEqual(f.data); expect(flow.validateSection(unchanged, "state-return").status).toBe("complete");
  const stored = JSON.parse(JSON.stringify(f.state)) as flow.GuidedFlowState;
  expect(flow.validateSection(stored, "state-return").status).toBe("complete"); expect(data(stored)).toEqual(f.data);
  const draft = structuredClone(f.state); required(data(draft).paOrdinaryReturnFacts).sourceFactsConfirmed = null;
  expect(data(flow.updateSectionData(draft, "state-return", f.data)).paOrdinaryReturnFacts?.sourceFactsConfirmed).toBe(true);
});
it("PA source context never invents missing federal facts and leaves Ohio flow unchanged", () => {
  const f = guidedPAOrdinaryPanelFixture(); required(f.state.sectionData["personal-info"]).ssn = "";
  expect(sourceInput(f.state)).toBeNull(); expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
  const other = guidedPAOrdinaryPanelFixture().state; other.segmentation.stateCode = "OH"; expect(sourceInput(other)).toBeNull();
});

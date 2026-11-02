// @vitest-environment jsdom
/** Spec: state/guided-pa-ordinary-panels.yaml; real structured panels and shell/storage. */
import React, { useState } from "react";
import { expect, it } from "vitest";
import * as flow from "@/lib/guided-interview-flow";
import type { TaxYearInput } from "@/models/inputs.js";
import { SectionStateReturn } from "@/components/guided-interview/section-state-return";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { mountGuidedPanel } from "./guided-panel-dom";
import { guidedPAOrdinaryPanelFixture, required, type PAOrdinaryPanelData } from "../../fixtures/guided-pa-ordinary-panels";
import { stateOriginalsReviewWorkspace } from "../../fixtures/guided-state-originals";
function ordinaryContext(state: flow.GuidedFlowState) { const fn = (flow as unknown as { buildGuidedPAOrdinarySourceInput?: (state: flow.GuidedFlowState) => TaxYearInput | null }).buildGuidedPAOrdinarySourceInput; return fn ? fn(state) : null; }
it("PA state panel exposes and explicitly confirms actual ordinary and completion sources", async () => {
  const f = guidedPAOrdinaryPanelFixture("part_year"); f.facts.sourceFactsConfirmed = null; f.sources.sourceFactsConfirmed = null; let latest = f.state;
  function Harness() { const [state, setState] = useState(f.state); return <SectionStateReturn {...{ ordinaryOriginalInput: ordinaryContext(state) }} originalInput={f.federalOriginal} stateCode="PA" taxYear={2025} filingStatus="single" data={state.sectionData["state-return"]} guidedPreview={null} onDataChange={next => { latest = flow.updateSectionData(state, "state-return", next); setState(latest); }} />; }
  const dom = await mountGuidedPanel(<Harness />); try {
    expect(dom.container.textContent).toContain("Actual Pennsylvania return records"); expect(dom.container.textContent).toContain("Actual Pennsylvania completion records"); expect(dom.container.querySelector("textarea")).toBeNull();
    await dom.click("Confirm all actual PA return sources after the last edit"); await dom.click("Confirm actual PA completion sources after the last edit");
    const data = required(latest.sectionData["state-return"]) as PAOrdinaryPanelData;
    expect(data.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBe(true); expect(data.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBe(true);
    expect(data.paOrdinaryReturnFacts?.originalFederalSources).toEqual(f.facts.originalFederalSources); expect(data.paOrdinaryReturnCompletionSources?.owner.ssn).toBe("900-70-0311");
    expect(flow.validateSection(latest, "state-return").status).toBe("complete");
    await dom.change("PA completion original source reference", "Edited private record"); expect((required(latest.sectionData["state-return"]) as PAOrdinaryPanelData).paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
    expect(flow.validateSection(latest, "state-return").status).toBe("partial");
  } finally { await dom.dispose(); }
});
it("PA state panel starts both packets unknown and requires actual originals", async () => {
  let data: PAOrdinaryPanelData = { stateEstimatedPayments: [], additionalStateWithholding: "" };
  function Harness() { const [current, setCurrent] = useState(data); return <SectionStateReturn {...{ ordinaryOriginalInput: null }} originalInput={null} stateCode="PA" taxYear={2025} data={current} guidedPreview={null} onDataChange={next => { data = next; setCurrent(next); }} />; }
  const dom = await mountGuidedPanel(<Harness />); try {
    await dom.click("Add Pennsylvania return facts"); await dom.click("Add Pennsylvania completion sources");
    expect(data.paOrdinaryReturnFacts?.sourceTaxYear).toBeNull(); expect(data.paOrdinaryReturnCompletionSources?.sourceTaxYear).toBeNull();
    expect(data.paOrdinaryReturnCompletionSources?.care.status).toBe("unknown");
    await dom.click("Confirm all actual PA return sources after the last edit"); await dom.click("Confirm actual PA completion sources after the last edit");
    expect(data.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(data.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  } finally { await dom.dispose(); }
});
it("PA shell saved reopening passes source-only current originals into actual confirmation", async () => {
  const f = guidedPAOrdinaryPanelFixture("nonresident"), workspace = stateOriginalsReviewWorkspace(); workspace.id = "pa-ordinary-panel-shell";
  f.facts.sourceFactsConfirmed = null; f.sources.sourceFactsConfirmed = null;
  flow.saveGuidedFlowState(window.localStorage, workspace.id, f.state);
  const oldWindowScrollTo = window.scrollTo; window.scrollTo = () => {};
  const oldScrollTo = HTMLElement.prototype.scrollTo; HTMLElement.prototype.scrollTo = () => {};
  const oldRequest = window.requestAnimationFrame; window.requestAnimationFrame = callback => window.setTimeout(() => callback(0), 0);
  const dom = await mountGuidedPanel(<GuidedInterviewShell workspace={workspace} onExitGuided={() => {}} resumeSectionId="state-return" />);
  try {
    expect(dom.container.textContent).toContain("Actual Pennsylvania return records");
    await dom.click("Confirm all actual PA return sources after the last edit"); await dom.click("Confirm actual PA completion sources after the last edit");
    const saved = required(flow.loadGuidedFlowState(window.localStorage, workspace.id)), data = required(saved.sectionData["state-return"]) as PAOrdinaryPanelData;
    expect(data.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBe(true); expect(data.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBe(true);
    expect(data.paOrdinaryReturnFacts?.originalFederalSources).toEqual(f.facts.originalFederalSources); expect(data.paOrdinaryReturnCompletionSources?.owner.ssn).toBe("900-70-0311");
  } finally { await dom.dispose(); window.localStorage.clear(); HTMLElement.prototype.scrollTo = oldScrollTo; window.requestAnimationFrame = oldRequest; window.scrollTo = oldWindowScrollTo; }
});

it.each(["PA", "OH"] as const)("PA and OH legacy ledgers remain reviewable without generic amount entry", async stateCode => {
  let latest: PAOrdinaryPanelData = { stateEstimatedPayments: [{ state: stateCode, date: "2025-04-15", amount: "25.01" }], additionalStateWithholding: "27.03", additionalStateWithholdingEntries: [{ payer: "Saved private payer", documentType: "1099-INT", state: stateCode, taxYear: "2025", amount: "26.02" }] };
  const before = structuredClone(latest);
  function Harness() { const [data, setData] = useState(latest); return <SectionStateReturn stateCode={stateCode} taxYear={2025} originalInput={null} data={data} guidedPreview={null} onDataChange={next => { latest = next; setData(next); }} />; }
  const dom = await mountGuidedPanel(<Harness />); try {
    const labels = [...dom.container.querySelectorAll("button")].map(b => b.textContent?.trim());
    expect(labels).not.toContain("+ Add withholding source"); expect(labels).not.toContain("+ Add State Estimated Payment");
    for (const label of ["State withholding on this form", "Saved additional withholding total to reconcile", "Amount"]) expect([...dom.container.querySelectorAll(".guided-field-label")].some(el => el.textContent === label)).toBe(false);
    for (const value of ["Saved private payer", "2025-04-15", "25.01", "26.02", "27.03"]) expect(dom.container.textContent).toContain(value);
    expect(latest).toEqual(before);
    await dom.click("Remove saved state estimated payment 1"); expect(latest.stateEstimatedPayments).toEqual([]);
    await dom.click("Remove saved additional withholding source 1"); expect(latest.additionalStateWithholdingEntries).toEqual([]);
    await dom.click("Remove saved additional withholding total"); expect(latest.additionalStateWithholding).toBe("");
  } finally { await dom.dispose(); }
});

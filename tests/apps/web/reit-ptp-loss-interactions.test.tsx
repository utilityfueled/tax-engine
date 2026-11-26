// @vitest-environment jsdom
// Spec: spec/federal/guided-reit-ptp-loss.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionAdjustments } from "@/components/guided-interview/section-adjustments";
import { clearGuidedReitPtpLossSelection, startInterview, updateSectionData, type AdjustmentData } from "@/lib/guided-interview-flow";

it("collects a filed zero and revokes confirmation on amount changes", async () => {
  const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: AdjustmentData | undefined;
  function Harness() {
    const [state, setState] = useState(() => startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["reit-ptp-loss-carryforward"], stateCode: null }, 2026));
    return <SectionAdjustments data={state.sectionData.adjustments} filingStatus="single" taxYear={2026} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false}
      onClearReitPtpLossSelection={state.segmentation.lifeEvents.includes("reit-ptp-loss-carryforward") ? () => setState(clearGuidedReitPtpLossSelection(state)) : undefined}
      onDataChange={data => {
        const next = updateSectionData(state, "adjustments", data);
        latest = next.sectionData.adjustments;
        setState(next);
      }} />;
  }
  function button(label: string) {
    const match = [...container.querySelectorAll("button")].find(row => row.textContent === label);
    if (!match) throw new Error(`Missing ${label}`);
    return match;
  }
  function field(label: string) {
    const match = [...container.querySelectorAll("label")].find(row => row.querySelector("span")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!match) throw new Error(`Missing ${label}`);
    return match;
  }
  async function change(label: string, value: string) {
    const control = field(label);
    const select = control instanceof HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing value setter");
    await act(async () => {
      setter.call(control, value);
      control.dispatchEvent(new Event(select ? "change" : "input", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => button("Add prior-year REIT and PTP loss carryforward").click());
    expect(latest?.reitPtpLossSource).toEqual({});
    expect(field("Filed carryforward amount").value).toBe("");
    await change("Filed REIT and PTP form", "form_8995");
    expect(container.textContent).toContain("Form 8995 line 17");
    await change("Filed REIT and PTP form", "form_8995_a");
    expect(container.textContent).toContain("Form 8995-A Part IV line 40");
    await change("Filed carryforward amount", "0");
    await act(async () => field("I checked these entries against my filed form").click());
    expect(latest?.reitPtpLossSource).toMatchObject({ amount: "0", sourceFactsConfirmed: true });
    await change("Filed carryforward amount", "25.50");
    expect(latest?.reitPtpLossSource).toMatchObject({ amount: "25.50", sourceFactsConfirmed: null });
    await act(async () => button("Remove prior-year REIT and PTP loss source").click());
    expect(latest?.reitPtpLossSource).toBeUndefined();
    const correction = "I don't have a prior-year REIT or PTP loss carryforward";
    await act(async () => button(correction).click());
    expect(container.textContent).not.toContain(correction);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
  }
});

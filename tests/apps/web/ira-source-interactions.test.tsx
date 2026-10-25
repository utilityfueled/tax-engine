// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, ira-actual-compensation-sources
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { IraSourceDetails } from "@/components/guided-interview/ira-source-details";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, type AdjustmentData, type FilingStatus } from "@/lib/guided-interview-flow";
import { completeIraSources, startCompleteInterview } from "../../guided-interview/complete-facts";

const confirmation = "Have you checked all IRA compensation and contribution sources after the last edit?";
async function render(initial: AdjustmentData, filingStatus: FilingStatus, run: (context: { latest: () => AdjustmentData; change: (label: string, value: string) => Promise<void>; click: (label: string) => Promise<void>; status: (value: FilingStatus) => Promise<void> }) => Promise<void>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let latest = initial; let setStatus: (value: FilingStatus) => void = () => {};
  function Harness() { const [data, setData] = useState(initial); const [status, updateStatus] = useState(filingStatus); setStatus = updateStatus; return <IraSourceDetails data={data} filingStatus={status} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing button: ${label}`); await act(async () => button.click()); }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, change, click, status: async value => { await act(async () => setStatus(value)); } }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}

it("collects paid IRA source facts without promoting a legacy deduction or blank compensation", async () => {
  await render({ ...emptyAdjustmentData, iraDeduction: "100" }, "single", async ({ latest, change, click }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    const input = () => { state.sectionData.adjustments = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull(); await click("Add IRA contribution facts");
    expect(latest().iraContributions?.primaryCompensation).toBeUndefined(); expect(input()).toBeNull();
    for (const [label, value] of [
      ["Actual tax year designated for these IRA contributions", "2025"], ["Taxpayer traditional IRA contributions for this tax year", "1000.10"], ["Taxpayer actual eligible IRA compensation", "9007199254740993.01"], ["Taxpayer Roth IRA contributions for this tax year", "0"], ["Taxpayer section 501(c)(18) contributions", "0"], ["Taxpayer covered by an employer retirement plan at any time during this tax year", "false"], ["Were these actual contributions timely made for the designated tax year?", "true"], ["Do rollover, recharacterization, returned or excess contributions still need a separate source worksheet?", "false"], [confirmation, "true"],
    ]) await change(label, value);
    expect(input()?.iraDeductionWorksheet).toMatchObject({ primaryContributions: "1000.10", primaryCompensation: "9007199254740993.01", primaryRothContributions: "0", primarySection501c18Contributions: "0", primaryIsActiveParticipant: false });
    await change("Taxpayer actual eligible IRA compensation", ""); expect(latest().iraContributions?.sourceFactsConfirmed).toBeNull(); await change(confirmation, "true"); expect(input()).toBeNull();
    await change("Taxpayer actual eligible IRA compensation", "0"); await change("Taxpayer traditional IRA contributions for this tax year", "0"); await change(confirmation, "true"); expect(input()?.iraDeductionWorksheet?.primaryCompensation).toBe("0");
    await change("Actual tax year designated for these IRA contributions", "2026"); await change(confirmation, "true"); expect(input()).toBeNull(); expect(latest().iraContributions?.contributionTaxYear).toBe("2026");
    await click("Remove IRA contribution facts"); expect(latest().iraContributions).toBeUndefined(); expect(latest().iraDeduction).toBe(""); expect(input()).not.toBeNull();
  });
});

it("keeps each joint IRA source distinct and preserves spouse amounts after filing status changes", async () => {
  await render({ ...emptyAdjustmentData, iraContributions: { ...completeIraSources } }, "mfj", async ({ latest, change, status }) => {
    const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: [], lifeEvents: [], stateCode: null });
    const input = () => { state.sectionData.adjustments = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull();
    for (const [label, value] of [
      ["Spouse covered by an employer retirement plan at any time during this tax year", "false"], ["Spouse traditional IRA contributions for this tax year", "500.10"], ["Spouse actual eligible IRA compensation", "30000.20"], ["Spouse Roth IRA contributions for this tax year", "0"], ["Spouse section 501(c)(18) contributions", "0"], [confirmation, "true"],
    ]) await change(label, value);
    expect(input()?.iraDeductionWorksheet).toMatchObject({ spouseContributions: "500.10", spouseCompensation: "30000.20", spouseRothContributions: "0", spouseSection501c18Contributions: "0", spouseIsActiveParticipant: false });
    state.segmentation.filingStatus = "single"; await status("single"); expect(input()).toBeNull(); expect(latest().iraContributions?.spouseCompensation).toBe("30000.20");
    for (const label of ["Spouse traditional IRA contributions for this tax year", "Spouse actual eligible IRA compensation", "Spouse Roth IRA contributions for this tax year", "Spouse section 501(c)(18) contributions"]) await change(label, "0");
    await change(confirmation, "true"); expect(input()?.iraDeductionWorksheet).not.toHaveProperty("spouseCompensation");
    await change("Do rollover, recharacterization, returned or excess contributions still need a separate source worksheet?", "true"); await change(confirmation, "true"); expect(input()).toBeNull(); expect(latest().iraContributions?.specialContributionRulesRequired).toBe(true);
  });
});

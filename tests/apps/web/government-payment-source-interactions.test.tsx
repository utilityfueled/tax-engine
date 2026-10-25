// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, government-payment-source-records
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionUnemployment } from "@/components/guided-interview/section-unemployment";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, type UnemploymentData } from "@/lib/guided-interview-flow";
import { completeUnemploymentSource, startCompleteInterview } from "../../guided-interview/complete-facts";

async function render(initial: UnemploymentData, run: (context: { latest: () => UnemploymentData; change: (label: string, value: string) => Promise<void>; click: (label: string) => Promise<void> }) => Promise<void>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let latest = initial;
  function Harness() { const [data, setData] = useState(initial); return <SectionUnemployment data={data} onDataChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.getAttribute("aria-label") === label || entry.textContent === label); if (!button) throw new Error(`Missing button: ${label}`); await act(async () => button.click()); }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, change, click }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
const confirmation = "Have you checked this government-payment source after the last edit?";

it("collects actual government sources from a legacy aggregate without replacing unknown withholding", async () => {
  await render({ compensation: "1000.10", federalWithheld: "" }, async ({ latest, change, click }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: null });
    const input = () => { state.sectionData["income-unemployment"] = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull(); expect(latest().entries).toBeUndefined();
    for (const [label, value] of [
      ["Actual government payer", "Actual State Agency"], ["Government payer TIN", "12-3456789"], ["Government statement reference (local label or last four account digits)", "actual-source"], ["Government statement calendar year", "2025"], ["Actual Form 1099-G revision", "2024-03"],
      ["Actual government-payment recipient", "primary"], ["Last four digits of the government-payment recipient ID", "3333"], ["Actual payment program", "government-unemployment"], ["Do these payments actually belong to this recipient?", "true"], ["Federal tax withheld (1099-G Box 4)", "0"],
      ["State or local tax refund, credit or offset (Box 2)", "0"], ["RTAA payments (Box 5)", "0"], ["Taxable grants (Box 6)", "0"], ["Agriculture payments (Box 7)", "0"], ["Market gain (Box 9)", "0"],
      ["Actual repayment this year of this year's unemployment benefits", "0"], ["Actual repayment this year of earlier-year benefits", "0"], ["Actual unrecovered nondeductible program contributions before these benefits", "0"], ["Is Box 8 checked for a trade or business refund?", "false"],
      ["Government source state reporting", "none"], ["Is another government-payment taxability or repayment worksheet still needed?", "false"], [confirmation, "true"],
    ]) await change(label, value);
    expect(input()?.form1099G?.[0]).toMatchObject({ payer: "Actual State Agency", unemploymentCompensation: "1000.10", federalWithheld: "0" });
    await change("Federal tax withheld (1099-G Box 4)", "");
    expect(latest().entries?.[0]?.sourceFactsConfirmed).toBeNull(); await change(confirmation, "true"); expect(input()).toBeNull();
    await change("Federal tax withheld (1099-G Box 4)", "0"); await change("Unemployment compensation (1099-G Box 1)", "9007199254740993.01"); await change(confirmation, "true");
    expect(input()?.form1099G?.[0]?.unemploymentCompensation).toBe("9007199254740993.01");
    await click("Add government statement"); expect(latest().entries?.[1]?.accountHolder).toBeUndefined();
    await click("Remove government statement 2"); expect(latest().entries).toHaveLength(1);
    await change("Actual repayment this year of this year's unemployment benefits", "0.10"); await change(confirmation, "true");
    expect(input()).toBeNull(); expect(latest().entries?.[0]?.currentYearRepaid).toBe("0.10");
  });
});

it("keeps source state and 2026 family benefits distinct and rechecks changed classifications", async () => {
  await render({ compensation: "0", federalWithheld: "0", entries: [{ ...completeUnemploymentSource }] }, async ({ latest, change }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: "PA" });
    state.taxYear = 2026; state.sectionData["personal-info"]!.state = "PA";
    state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: "0" };
    const input = () => { state.sectionData["income-unemployment"] = latest(); return buildTaxInputFromGuidedData(state); };
    await change("Government statement calendar year", "2026"); await change("Actual Form 1099-G revision", "2026-12"); await change(confirmation, "true"); expect(input()).toBeNull();
    await change("Family leave benefits (2026 Box 10)", "0"); await change("Government source state reporting", "single"); await change("Actual state on the government statement", "NY"); await change("State payer identification number, when reported", "actual-state-id"); await change("Government source state withholding (Box 12)", "0.10"); await change(confirmation, "true");
    expect(input()?.form1099G?.[0]).toMatchObject({ state: "NY", stateWithheld: "0.10" });
    await change("Family leave benefits (2026 Box 10)", "100.20"); await change(confirmation, "true"); expect(input()).toBeNull();
    await change("Actual tax year of the Box 2 refund, when any", "2024"); await change("State or local tax refund, credit or offset (Box 2)", "1.20");
    expect(latest().entries?.[0]).toMatchObject({ refundTaxYear: "2024", stateOrLocalTaxRefund: "1.20", familyLeaveBenefits: "100.20", sourceFactsConfirmed: null });
    await change("Actual payment program", "private-or-union"); await change("Do these payments actually belong to this recipient?", "false"); await change("Is Box 8 checked for a trade or business refund?", "true"); await change("Is another government-payment taxability or repayment worksheet still needed?", "true");
    expect(latest().entries?.[0]).toMatchObject({ programType: "private-or-union", actualReceiptConfirmed: false, tradeOrBusinessRefund: true, additionalWorksheetRequired: true });
    expect(input()).toBeNull();
  });
});

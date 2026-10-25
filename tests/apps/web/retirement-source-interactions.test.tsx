// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, retirement-source-records
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionRetirementIncome } from "@/components/guided-interview/section-retirement-income";
import { buildRetirementInputs } from "@/lib/guided-interview-bridge";
import { emptyRetirementEntry, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { completeRetirementSource } from "../../guided-interview/complete-facts";

async function render(initial: RetirementEntryData[], run: (context: { latest: () => RetirementEntryData[]; container: HTMLDivElement; change: (label: string, value: string) => Promise<void> }) => Promise<void>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let latest = initial;
  function Harness() { const [entries, setEntries] = useState(initial); return <SectionRetirementIncome entries={entries} onEntriesChange={next => { latest = next; setEntries(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, container, change }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
const confirm = "Have you checked all retirement source and taxability facts after the last edit?";

it("collects an actual ordinary retirement record without defaulting the checkbox, taxability or source zeros", async () => {
  await render([{ ...emptyRetirementEntry }], async ({ latest, container, change }) => {
    expect(latest()[0]?.isIraSepSimple).toBeNull();
    expect(container.querySelectorAll('select')).toSatisfy((controls: NodeListOf<HTMLSelectElement>) => [...controls].every(control => control.value === ""));
    for (const [label, value] of [
      ["Payer name (Box — top)", "Actual Plan"], ["Gross distribution (Box 1)", "1000.30"], ["Taxable amount (Box 2a)", "1000.10"], ["Federal tax withheld (Box 4)", "0"], ["Distribution code (Box 7)", "7"],
      ["Retirement statement tax year", "2026"], ["Payer TIN shown on the retirement form", "12-3456789"], ["Retirement account reference (last four digits or local statement label)", "plan-a"], ["Actual retirement distribution recipient", "spouse"],
      ["IRA / SEP / SIMPLE checkbox (Box 7b)", "false"], ["Is taxable amount not determined checked in Box 2b?", "false"], ["Have you established the actual taxable amount from the source and applicable basis records?", "true"],
      ["Employee contributions / insurance premiums (Box 5)", "0.20"], ["Capital gain included in Box 2a (Box 3)", "0"], ["Net unrealized appreciation (Box 6)", "0"], ["Other source amount (Box 8 / 2026 Box 8a)", "0"], ["Amount allocable to in-plan Roth rollover within five years (Box 10)", "0"],
      ["Is this an eligible governmental section 457(b) distribution?", "false"], ["Is this a U.S. military pension or survivor benefit?", "false"], ["Is this a qualified joint-and-survivor annuity benefit?", "false"],
      ["Is the Trump account checkbox in Box 7c checked?", "false"], ["Earnings on excess contributions (Box 7d)", "0"], ["Actual state reporting on this retirement form", "none"], ["Actual local reporting on this retirement form", "none"],
      ["Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?", "false"], [confirm, "true"],
    ]) await change(label, value);
    expect(buildRetirementInputs(latest(), "mfj", 2026)[0]).toMatchObject({ payer: "Actual Plan", accountHolder: "spouse", grossDistribution: "1000.30", taxableAmount: "1000.10", employeeContributions: "0.20", federalWithheld: "0", iraSepSimple: false });
    await change("Taxable amount (Box 2a)", "");
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "mfj", 2026)[0]?.taxableAmount).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Add another 1099-R retirement distribution form"]')!.click());
    expect(latest()[1]?.isIraSepSimple).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove 1099-R #2"]')!.click());
    expect(latest()).toHaveLength(1);
  });
});

it("preserves actual state and local withholding and reopens changed special-distribution facts", async () => {
  await render([{ ...completeRetirementSource, isIraSepSimple: false, requiresIraConfirmation: true }], async ({ latest, change }) => {
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/IRA checkbox/);
    await change("IRA / SEP / SIMPLE checkbox (Box 7)", "true");
    await change("Do actual owner records establish zero nondeductible IRA basis?", "true");
    await change("Actual state reporting on this retirement form", "single");
    await change("Retirement source state (two-letter code)", "PA");
    await change("Retirement state tax withheld (Box 14)", "0.10");
    await change("Retirement state distribution (Box 16)", "1000");
    await change("Actual local reporting on this retirement form", "single");
    await change("Retirement source locality (Box 18)", "Actual locality");
    await change("Retirement local tax withheld (Box 17)", "0.20");
    await change("Retirement local distribution (Box 19)", "1000");
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025)[0]).toMatchObject({ iraSepSimple: true, state: "PA", stateWithheld: "0.10", localTaxWithheld: "0.20", locality: "Actual locality" });
    await change("Distribution code (Box 7)", "G");
    await change("Do actual records confirm the completed direct rollover and its destination?", "true");
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/conversion/);
    await change("Taxable amount (Box 2a)", "0"); await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025)[0]?.taxableAmount).toBe("0");
    await change("Actual state reporting on this retirement form", "none"); await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/saved state/);
    expect(latest()[0]?.stateWithheld).toBe("0.10");
    await change("Distribution code (Box 7)", "J"); await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/special worksheet/);
    expect(latest()[0]?.distributionCode).toBe("J");
  });
});

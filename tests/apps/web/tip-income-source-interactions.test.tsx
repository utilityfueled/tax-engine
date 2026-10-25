// @vitest-environment jsdom
// Spec: spec/federal/guided-tip-income.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { TipIncomeSourceDetails } from "@/components/guided-interview/tip-income-source-details";
import type { TipIncomeAccountData } from "@/lib/guided-tip-income-facts";
it("collects actual tip records and revokes confirmation on source edits", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: TipIncomeAccountData[] | undefined;
  function Harness() { const [data, setData] = useState<TipIncomeAccountData[]>(); return <TipIncomeSourceDetails accounts={data} w2Sources={[{ sourceId: "formW2:0", accountHolder: "primary", employerName: "Blue Ocean", employerEin: "12-3456789" }]} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add tip-income owner");
    expect(latest?.[0]).toMatchObject({ accountHolder: "", allEmployersIncluded: null, noncashTipsNotIncludedInWages: "", employers: [] });
    for (const [label, value] of [["Owner", "primary"], ["Source tax year", "2025"], ["Source reference", "Actual diary and payroll"], ["All employers are included", "true"], ["Actual reporting-year treatment checked", "true"], ["Railroad compensation", "0"], ["Noncash tips not in wages", "0"]]) await change(`Tip owner 1: ${label}`, value!);
    await click("Tip owner 1: Add employer"); expect(latest?.[0]?.employers[0]?.allocatedTips).toBe("");
    for (const [label, value] of [["Source label", "restaurant"], ["Actual employer name", "Blue Ocean"], ["Actual employer EIN", "12-3456789"], ["Cash and charge tips received", "9007199254740993.01"], ["Tips reported to employer", "7000"], ["Allocated tips", "0"], ["Adequate records support actual unreported tips", "true"], ["Employer is covered by railroad retirement", "false"], ["Medicare-only government unreported tips", "0"], ["Reported tips outside Box 7", "0"], ["Box 7 tips outside the annual reported total", "0"]]) await change(`Tip owner 1 employer 1: ${label}`, value!);
    await click("Tip owner 1 employer 1: Add W-2 source"); await change("Tip owner 1 employer 1: W-2 source 1", "formW2:0");
    await click("Tip owner 1 employer 1: Add month below $20"); await change("Tip owner 1 employer 1 month 1: Month", "6"); await change("Tip owner 1 employer 1 month 1: Total cash and charge tips", "18"); await change("Tip owner 1 employer 1 month 1: Tips reported to employer", "0");
    await change("Tip owner 1: Tip sources checked after the last edit", "true");
    expect(latest?.[0]?.sourceFactsConfirmed).toBe(true); expect(latest?.[0]?.employers[0]?.cashAndChargeTipsReceived).toBe("9007199254740993.01"); expect(latest?.[0]?.employers[0]?.railroadRetirementCovered).toBe(false);
    await change("Tip owner 1 employer 1: Allocated tips", ""); expect(latest?.[0]?.sourceFactsConfirmed).toBeNull(); expect(latest?.[0]?.employers[0]?.allocatedTips).toBe("");
    await change("Tip owner 1 employer 1: Medicare-only government exception qualification checked", "false");
    await change("Tip owner 1 employer 1: Reporting-year reconciliation reference", "Actual December reporting statement");
    await click("Tip owner 1 employer 1 month 1: Remove month"); await click("Tip owner 1 employer 1: Remove W-2 source 1"); expect(latest?.[0]?.employers[0]?.smallTipMonths).toEqual([]); expect(latest?.[0]?.employers[0]?.w2SourceIds).toEqual([]);
    await click("Tip owner 1 employer 1: Remove employer"); expect(latest?.[0]?.employers).toEqual([]); await click("Tip owner 1: Remove owner"); expect(latest).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

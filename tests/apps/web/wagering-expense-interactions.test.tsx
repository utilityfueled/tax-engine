// @vitest-environment jsdom
// Spec: spec/federal/guided-wagering-expenses.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionDeductions } from "@/components/guided-interview/section-deductions";
import { emptyDeductionData, type DeductionData } from "@/lib/guided-interview-flow";

it("edits original wagering expenses without defaults or duplicate totals", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div"); document.body.appendChild(element); const root = createRoot(element);
  let latest: DeductionData = { ...emptyDeductionData, method: "itemized", gamblingWinnings: "100", gamblingLosses: "0.20", otherItemized: "0.30" };
  function Harness() {
    const [data, setData] = useState(latest);
    return <SectionDeductions filingStatus="single" taxYear={2025} data={data} onDataChange={next => { latest = next; setData(next); }} />;
  }
  const expense = () => [...element.querySelectorAll("label")].find(node => node.textContent?.startsWith("Otherwise deductible wagering expenses"))?.querySelector("input") as HTMLInputElement;
  async function change(value: string) {
    const input = expense(); expect(input).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing DOM input setter");
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(expense().value).toBe(""); expect(latest.gamblingExpenses).toBeUndefined();
    await change("0.10"); expect(latest.gamblingExpenses).toBe("0.10");
    expect(element.querySelector(".guided-deduction-comparison")?.textContent).toContain("$0.30");
    const standard = element.querySelector<HTMLInputElement>('input[value="standard"]');
    if (!standard) throw new Error("Missing standard deduction choice");
    await act(async () => standard.click()); expect(latest.gamblingExpenses).toBe("0.10"); expect(expense()).toBeUndefined();
    const itemized = element.querySelector<HTMLInputElement>('input[value="itemized"]');
    if (!itemized) throw new Error("Missing itemized deduction choice");
    await act(async () => itemized.click());
    expect(expense().value).toBe("0.10");
    await change("0"); expect(latest.gamblingExpenses).toBe("0");
    await change(""); expect(latest.gamblingExpenses).toBe("");
    expect(element.textContent).toContain("amounts deducted elsewhere");
  } finally { await act(async () => root.unmount()); element.remove(); }
});

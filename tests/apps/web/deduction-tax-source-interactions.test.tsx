// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, nonw2-tax-allocation
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionDeductions } from "@/components/guided-interview/section-deductions";
import { buildScheduleAInput } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, type DeductionData } from "@/lib/guided-interview-flow";

it("keeps actual cross-schedule withholding distinct from unknown across deduction elections", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData, method: "standard" };
  function Harness() {
    const [data, setData] = useState(latest);
    return <SectionDeductions data={data} filingStatus="single" taxYear={2026} onDataChange={next => { latest = next; setData(next); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const label = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === "Non-W-2 withholding already deducted on other schedules");
    const input = label?.querySelector("input");
    expect(input).toBeTruthy();
    expect(input!.value).toBe("");
    expect(buildScheduleAInput(latest)).toBeUndefined();
    for (const value of ["9007199254740993.01", "0", ""]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(latest.nonW2IncomeTaxesDeductedElsewhere).toBe(value);
      expect(buildScheduleAInput(latest)?.nonW2IncomeTaxesDeductedElsewhere).toBe(value || undefined);
    }
    await act(async () => container.querySelector<HTMLInputElement>('input[value="itemized"]')!.click());
    expect(latest.method).toBe("itemized");
    expect(latest.nonW2IncomeTaxesDeductedElsewhere).toBe("");
    expect(container.textContent).toContain("do not add it again");
  } finally {
    await act(async () => root.unmount()); container.remove();
  }
});

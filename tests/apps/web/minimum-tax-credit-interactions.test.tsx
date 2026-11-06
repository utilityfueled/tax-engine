// @vitest-environment jsdom
// Spec: spec/federal/guided-minimum-tax-credit.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MinimumTaxCreditDetails } from "@/components/guided-interview/minimum-tax-credit-details";
import type { MinimumTaxCreditData } from "@/lib/guided-minimum-tax-credit";

it("collects prior-return worksheets without inventing facts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
  let latest: MinimumTaxCreditData | undefined;
  function Harness() { const [data, setData] = useState<MinimumTaxCreditData>(); return <MinimumTaxCreditDetails data={data} onChange={value => { latest = value; setData(value); }} />; }
  const control = (label: string) => {
    const field = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing ${label}`); return field;
  };
  async function change(label: string, value: string) {
    const field = control(label);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("Missing value setter"); setter.call(field, value);
      field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add prior minimum-tax worksheet");
    expect(latest?.priorYear).toBe(""); expect(latest?.priorYearAMT).toBe(""); expect(latest?.sameTaxpayersAsPriorYear).toBeNull();
    await change("Form 8801 worksheet year", "2025"); await change("Actual prior-return source year", "2024"); await change("Prior minimum-tax source reference", "Actual2024 worksheets");
    await change("Prior minimum-tax filing status", "mfj"); await change("Taxpayer name on prior sources", "Jordan Example"); await change("Taxpayer prior-source tax ID last four", "3333");
    await change("Spouse name on prior sources", "Taylor Example"); await change("Spouse prior-source tax ID last four", "4444");
    await change("Prior Form 6251 income line plus line 2e", "-9007199254740993.03"); expect(latest?.priorYearForm6251Line1And2e).toBe("-9007199254740993.03");
    expect(control("Prior Form 6251 income line plus line 2e").getAttribute("aria-invalid")).toBeNull();
    await change("Prior Form 6251 line 11 AMT", "0"); expect(latest?.priorYearAMT).toBe("0");
    await change("Prior Form 1040-NR applies", "true"); await change("Prior net U.S. real-property gain", "0");
    await change("Prior capital-gain worksheet is required", "true"); await change("Prior capital worksheet method", "schedule_d");
    await change("Prior worksheet preferential income", "100.25"); await change("Prior Schedule D section 1250 gain", "0");
    await change("Prior capital worksheet method", "qualified_dividends"); expect(latest?.capitalGainsWorksheet.section1250Gain).toBe("0");
    await change("Prior capital-gain worksheet is required", "false"); expect(latest?.capitalGainsWorksheet.preferentialIncome).toBe("100.25");
    await click("Clear prior capital worksheet details"); expect(latest?.capitalGainsWorksheet.preferentialIncome).toBe("");
    await change("Prior Form 2555 exclusion or housing deduction applies", "true"); await change("Prior Form 2555 lines 45 and 50", "5000.01");
    await change("Foreign-income capital-gain worksheet adjustments checked", "false"); expect(latest?.foreignEarnedIncome.capitalGainAdjustmentsConfirmed).toBe(false);
    await change("Foreign-income capital-gain worksheet adjustments checked", ""); expect(latest?.foreignEarnedIncome.capitalGainAdjustmentsConfirmed).toBeNull();
    await change("All applicable prior minimum-tax sources are included", "true"); await change("Minimum-tax-credit sources checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await click("Clear prior foreign worksheet details"); expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.foreignEarnedIncome.form2555Lines45And50).toBe("");
    await change("Prior Form 6251 line 11 AMT", ""); expect(latest?.priorYearAMT).toBe("");
    await click("Remove prior minimum-tax worksheet"); expect(latest).toBeUndefined(); expect(network).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); network.mockRestore(); }
});

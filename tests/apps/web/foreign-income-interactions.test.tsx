// @vitest-environment jsdom
// Spec: spec/federal/guided-foreign-income.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ForeignIncomeDetails } from "@/components/guided-interview/foreign-income-details";
import type { ForeignIncomeData } from "@/lib/guided-foreign-income";

it("collects actual foreign sources and qualification without defaults", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
  let latest: ForeignIncomeData | undefined;
  function Harness() { const [data, setData] = useState<ForeignIncomeData>(); return <ForeignIncomeDetails data={data} sources={[{ sourceId: "formW2:0", label: "Actual original W2" }]} onChange={value => { latest = value; setData(value); }} />; }
  const control = (label: string) => { const field = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!field) throw new Error(`Missing ${label}`); return field; };
  async function change(label: string, value: string) { const field = control(label); await act(async () => { const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set; if (!setter) throw new Error("Missing setter"); setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add foreign-income worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.qualifiedHousingExpenses).toBe(""); expect(latest?.taxHomeConfirmed).toBeNull();
    await change("Foreign-income worksheet year", "2025"); await change("Foreign-income taxpayer", "primary");
    await change("Foreign tax-home start", "2025-01-01"); await change("Foreign qualification method", "physical_presence");
    await click("Add full foreign-day period"); await change("Foreign-day country 1", "United Kingdom"); await change("First full foreign day 1", "2025-01-01");
    await change("Foreign tax-home test met", "false"); expect(latest?.taxHomeConfirmed).toBe(false);
    await change("Foreign tax-home test met", ""); expect(latest?.taxHomeConfirmed).toBeNull();
    await change("Actual locations meet the foreign-country definition", "false"); expect(latest?.foreignCountriesQualify).toBe(false);
    await change("Actual locations meet the foreign-country definition", ""); expect(latest?.foreignCountriesQualify).toBeNull();
    await change("Foreign tax-home country", "Cuba"); await change("Actual Cuba travel complied with U.S. restrictions", "false"); expect(latest?.cubaTravelPermittedConfirmed).toBe(false);
    await change("Foreign tax-home country", "United Kingdom"); expect(latest?.cubaTravelPermittedConfirmed).toBe(false);
    await change("Foreign wages and salary", "9007199254740993.03"); expect(latest?.partIV.wages).toBe("9007199254740993.03");
    await change("Section 119 meals and lodging", "0"); expect(latest?.partIV.section119MealsAndLodging).toBe("0");
    await click("Add original foreign-income source"); await change("Existing return source 1", "formW2:0");
    expect(latest?.sources[0].sourceId).toBe("formW2:0"); expect(latest?.sources[0].sourceTaxYear).toBe("");
    await change("Foreign source year 1", "2025"); await change("Current foreign receipts 1", "123.45");
    await change("Prior services received this year 1", "0");
    await change("Foreign sources checked after the last edit", "true"); expect(latest?.sourceFactsConfirmed).toBe(true);
    await change("Current foreign receipts 1", "123.46"); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Claim foreign housing exclusion or deduction", "true"); await change("Actual qualified foreign housing costs", "30000.25");
    await click("Add housing location period"); await change("Housing notice year 1", "2025"); await change("Housing notice location 1", "default"); await change("Housing location qualifying days 1", "365");
    expect(latest?.housingLocationPeriods[0]).toMatchObject({ noticeTaxYear: "2025", locationId: "default", days: "365" });
    await change("Actual prior housing carryover", "10.20"); await change("Prior housing carryover source year", "2024");
    await change("Foreign qualification method", "bona_fide_residence"); expect(latest?.fullForeignPeriods).toHaveLength(1);
    await click("Remove full foreign-day period 1"); expect(latest?.fullForeignPeriods).toEqual([]);
    await click("Remove housing location period 1"); await click("Remove foreign-income source 1");
    await change("Foreign wages and salary", ""); expect(latest?.partIV.wages).toBe("");
    await click("Remove foreign-income worksheet"); expect(latest).toBeUndefined(); expect(network).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); network.mockRestore(); }
});

it("reopens a partial saved adjustment section with unknown legacy amounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { SectionAdjustments } = await import("@/components/guided-interview/section-adjustments");
  const { emptyForeignIncome } = await import("@/lib/guided-foreign-income");
  const source = { ...structuredClone(emptyForeignIncome), sourceReference: "Original saved worksheet", sourceFactsConfirmed: true };
  const saved = { foreignIncome: source } as import("@/lib/guided-interview-flow").AdjustmentData;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: import("@/lib/guided-interview-flow").AdjustmentData | undefined;
  try {
    await act(async () => root.render(<SectionAdjustments data={saved} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false} onDataChange={value => { latest = value; }} />));
    const input = [...container.querySelectorAll("label")].find(label => label.querySelector(".guided-field-label")?.textContent === "Foreign-income source reference")?.querySelector("input");
    if (!input) throw new Error("Missing saved source input");
    expect(input.value).toBe("Original saved worksheet");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Rechecked original worksheet");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest?.foreignIncome).toMatchObject({ sourceReference: "Rechecked original worksheet", sourceFactsConfirmed: null });
    expect(latest?.studentLoanInterest).toBe(""); expect(latest?.selfEmployedHealthInsurance).toBe(""); expect(latest?.hsaDeduction).toBe("");
    expect(saved).toEqual({ foreignIncome: source });
  } finally { await act(async () => root.unmount()); container.remove(); }
});

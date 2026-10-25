// @vitest-environment jsdom
// Spec: spec/state/guided-ohio-interest.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { OhioInterestDetails } from "@/components/guided-interview/ohio-interest-details";
import { ohioInterestFactErrors, type OhioInterestAllocation } from "@/lib/guided-ohio-interest-facts";

it("collects actual Ohio issuer allocation without defaulting missing amounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: OhioInterestAllocation | undefined;
  function Harness() { const [data, setData] = useState<OhioInterestAllocation>(); return <OhioInterestDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing control ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error(`Missing setter ${label}`);
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />));
    await click("Add Ohio interest allocation");
    expect(latest?.nonOhioStateLocalInterest).toBe(""); expect(latest?.sourceFactsConfirmed).toBeNull();
    for (const [label, value] of [["Ohio interest source tax year", "2026"], ["Ohio issuer allocation source reference", "Actual synthetic statement"], ["Federal tax-exempt interest total from source records", "9007199254740993.03"], ["Other states' and local governments' obligations", "9007199254740993.01"], ["Ohio and Ohio local-government obligations", "0.02"], ["Federal or territory obligations also exempt from Ohio tax", "0"], ["Federal or territory obligations taxable by Ohio", "0"], ["Ohio issuer classifications checked after the last source edit", "true"]]) await change(label, value);
    expect(ohioInterestFactErrors(latest, 2026, true)).toEqual({});
    expect(latest?.nonOhioStateLocalInterest).toBe("9007199254740993.01");
    await change("Federal or territory obligations taxable by Ohio", "");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Ohio issuer classifications checked after the last source edit", "true");
    expect(Object.keys(ohioInterestFactErrors(latest, 2026, true))).toContain("ohio-interest-federalInterestTaxableByOhio");
    await click("Remove Ohio interest allocation"); expect(latest).toBeUndefined();
    expect(Object.keys(ohioInterestFactErrors(latest, 2026, true))).toContain("ohioInterestAllocation");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

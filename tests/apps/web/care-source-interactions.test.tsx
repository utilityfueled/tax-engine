// @vitest-environment jsdom
// Spec: spec/federal/form-2441.yaml actual-care-source-records.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CareSourceDetails } from "@/components/guided-interview/care-source-details";
import { careFactErrors } from "@/lib/guided-credit-facts";
import { emptyDependentCareData, type DependentCareData } from "@/lib/guided-interview-flow";
import { completeCareSource } from "../../guided-interview/care-source-fixture";

let container: HTMLDivElement, root: Root, latest: DependentCareData;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) {
  const item = [...container.querySelectorAll("label")].find(node => node.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  if (!item) throw new Error(`Missing ${label}`); return item;
}
async function change(label: string, value: string) {
  const input = control(label);
  await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(item => item.textContent === label);
  if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
}
async function render(initial: DependentCareData) {
  latest = structuredClone(initial);
  function Harness() { const [data, setData] = useState(latest); return <CareSourceDetails data={data} onChange={value => { latest = value; setData(value); }} />; }
  await act(async () => root.render(<Harness />));
}
describe("care provider and person interactions", () => {
  it("adds unknown records and removes only the selected source", async () => {
    await render(emptyDependentCareData);
    await click("Add care provider"); await click("Add qualifying person");
    expect(control("Provider 1 identification status").value).toBe("");
    expect(control("Was provider 1 your household employee?").value).toBe("");
    expect(control("Amount paid to provider 1").value).toBe("");
    expect(control("Qualifying person 1 identification status").value).toBe("");
    await change("Provider 1 name", "Actual Center");
    await click("Add care provider"); await click("Remove provider 2");
    expect(latest.providers?.map(provider => provider.name)).toEqual(["Actual Center"]);
    await click("Remove qualifying person 1"); expect(latest.qualifyingPersons).toEqual([]);
  });
  it("preserves exact cents and explicit zero and invalidates stale source confirmation", async () => {
    await render(completeCareSource());
    await change("Amount paid to provider 1", "9007199254740993.27");
    expect(latest.providers?.[0].amountPaid).toBe("9007199254740993.27");
    expect(latest.sourceFactsConfirmed).toBe(false);
    await change("Prior-year care expense worksheet credit", "0");
    await change("Have you checked these provider and qualifying-person details against your actual records?", "true");
    expect(careFactErrors(latest, "mfj")).toEqual({});
    expect(control("Qualified expenses for person 2").value).toBe("0");
    await change("Was provider 1 your household employee?", "");
    expect(latest.providers?.[0].householdEmployee).toBeNull();
    expect(careFactErrors(latest, "mfj")).toHaveProperty("care-provider-0-employee");
  });
  it("collects documented missing-provider identification without substituting an ID", async () => {
    await render(completeCareSource());
    await change("Provider 1 identification status", "withheld");
    await change("Provider 1 documented efforts to obtain information", "Requested Form W-10 twice; provider declined.");
    await change("Have you checked these provider and qualifying-person details against your actual records?", "true");
    expect(latest.providers?.[0].identifierType).toBe("withheld");
    expect(careFactErrors(latest, "mfj")).toEqual({});
  });
});

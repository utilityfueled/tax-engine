// @vitest-environment jsdom
// Spec: spec/federal/guided-education-distributions.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EducationDistributionDetails } from "@/components/guided-interview/education-distribution-details";
import type { EducationDistributionData } from "@/lib/guided-education-distributions";

it("collects actual education distribution records and invalidates edited facts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: EducationDistributionData | undefined;
  function Harness() { const [data, setData] = useState<EducationDistributionData>(); return <EducationDistributionDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click("Add education distribution records");
    expect(latest?.forms).toBeUndefined(); expect(latest?.sourceFactsConfirmed).toBeUndefined();
    await click("Add beneficiary"); await change("Beneficiary name", "Actual Student");
    await click("Add statement");
    expect(latest?.forms?.[0]?.fields.isTrusteeToTrustee).toBeUndefined();
    await change("Box 1 gross distribution", "9007199254740993.03");
    await change("Box 4a checked", "false");
    await change("Transfer or recontribution treatment", "none");
    await change("Optional Box 7 distribution code", "2");
    await change("Tax year designated for the returned contribution", "2025");
    await change("Custodian's net income attributable to returned principal (signed)", "-20.01");
    await change("Actual custodian net-income calculation checked", "false");
    expect(latest?.forms?.[0]?.fields.returnedContributionTaxYear).toBe("2025");
    expect(latest?.forms?.[0]?.fields.returnedContributionNetIncome).toBe("-20.01");
    expect(latest?.forms?.[0]?.fields.returnedContributionNetIncomeConfirmed).toBe(false);
    expect(latest?.forms?.[0]?.fields.returnedContributionPrincipal).toBeUndefined();
    await change("Statement facts checked against the actual source", "true");
    await change("All education sources and allocations checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change("Box 1 gross distribution", "9007199254740993.04");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.forms?.[0]?.fields.sourceFactsConfirmed).toBeNull();
    expect(latest?.forms?.[0]?.fields.grossDistribution).toBe("9007199254740993.04");
    expect(latest?.forms?.[0]?.fields.isTrusteeToTrustee).toBe(false);
    await click("Confirm no loan borrowers"); expect(latest?.loanBorrowers).toEqual([]);
    await click("Remove education distribution records"); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

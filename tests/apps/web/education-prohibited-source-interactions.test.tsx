// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-prohibited-source.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EducationDistributionDetails } from "@/components/guided-interview/education-distribution-details";
import type { EducationDistributionData } from "@/lib/guided-education-distributions";

it("retains prohibited source facts and explains the unresolved calculation", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: EducationDistributionData | undefined;
  function Harness() {
    const [data, setData] = useState<EducationDistributionData>({ forms: [{ fields: { sourceId: "actual-source", distributionCode: "6", accountType: "coverdell_esa" }, transfer: { kind: "none" } }] });
    return <EducationDistributionDetails data={data} onChange={next => { latest = next; if (next) setData(next); }} />;
  }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toContain("Code 6 tax treatment is not yet supported");
    await change("Actual prohibited transaction type", "account_disqualification");
    await change("Account value on January 1 of the transaction year", "9007199254740993.03");
    await change("Actual basis associated with the deemed distribution", "0");
    await change("Prohibited transaction source records checked", "true");
    await change("Statement facts checked against the actual source", "true");
    await change("All education sources and allocations checked after the last edit", "true");
    expect(latest?.forms?.[0]?.fields.prohibitedTransactionJanuary1Value).toBe("9007199254740993.03");
    expect(latest?.forms?.[0]?.fields.prohibitedTransactionBasis).toBe("0");
    expect(latest?.forms?.[0]?.fields.prohibitedTransactionPledgedAmount).toBeUndefined();
    await change("Actual prohibited transaction date", "2026-06-01");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.forms?.[0]?.fields.sourceFactsConfirmed).toBeNull();
    expect(container.textContent).toContain("Code 6 tax treatment is not yet supported");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

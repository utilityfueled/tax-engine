// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PAResidencyDetails } from "@/components/guided-interview/pa-residency-details";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources.js";
import type { PAResidencySources } from "@/models/pa-residency.js";
// Spec: spec/state/pa-residency-sources.yaml guide-ui.

it("PA residency UI - preserves unknown facts and invalidates edited confirmations", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { input, sources } = paOrdinaryResidencyFixture("part_year");
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: PAResidencySources | undefined;
  function Harness() {
    const [data, setData] = useState<PAResidencySources>();
    return <PAResidencyDetails originalInput={input} data={data} onChange={next => { latest = next; setData(next); }} />;
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === text);
    if (!button) throw new Error(`Missing actual control ${text}`);
    await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await click("Add Pennsylvania residency sources");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.sourceTaxYear).toBeNull();
    expect(latest?.sourceReference).toBe("");
    expect(latest?.wages).toEqual([]);
    expect(container.textContent).toContain("Actual payroll and bank records");
    await act(async () => root.render(<PAResidencyDetails originalInput={input} data={sources} onChange={next => { latest = next; }} />));
    const label = [...container.querySelectorAll("label")].find(l => l.querySelector(".guided-field-label")?.textContent === "PA original source reference");
    const field = label?.querySelector("input"); if (!field) throw new Error("Missing source-reference input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing native setter");
    await act(async () => { setter.call(field, "changed actual original reference"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.wages[0].payroll).toEqual(sources.wages[0].payroll);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

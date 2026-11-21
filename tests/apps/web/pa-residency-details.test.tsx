// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PAResidencyDetails } from "@/components/guided-interview/pa-residency-details";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources.js";
import { pa2026OutboundNonresidentFixture } from "../../fixtures/pa-2026-ordinary-draft.js";
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

it("PA residency UI collects original outbound residence evidence without assuming answers", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { input } = pa2026OutboundNonresidentFixture();
  const saved: PAResidencySources = structuredClone(input.paResidencySources);
  saved.residency.outsidePAPermanentAbodePeriods = [{ from: "2026-01-01", through: "2026-12-31" }];
  delete saved.residency.outboundTaxResidencePeriods;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest = saved;
  function Harness() {
    const [data, setData] = useState(saved);
    return <PAResidencyDetails originalInput={input} data={data} onChange={next => { if (next) { latest = next; setData(next); } }} />;
  }
  function control<T extends HTMLInputElement | HTMLSelectElement>(name: string, selector: string): T {
    const label = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === name);
    const field = label?.querySelector<T>(selector);
    if (!field) throw new Error(`Missing source control ${name}`);
    return field;
  }
  try {
    await act(async () => root.render(<Harness />));
    const abode = control<HTMLInputElement>("Outside-PA permanent home 1 actual state code", "input");
    const ref = control<HTMLInputElement>("Outside-PA permanent home 1 original reference", "input");
    expect(abode.value).toBe("");
    expect(ref.value).toBe("");
    const second = "Income-tax residency period 2";
    const answer = control<HTMLSelectElement>(`${second}: Owner had no income-tax residence in any reciprocal state`, "select");
    expect(answer.value).toBe("");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing native input setter");
    for (const [field, value] of [[abode, "NY"], [ref, "Fictional year-round signed lease"]] as const) {
      await act(async () => { setter.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    await act(async () => { answer.value = "true"; answer.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.residency.outsidePAPermanentAbodePeriods[0]).toMatchObject({ state: "NY", sourceReference: "Fictional year-round signed lease" });
    expect(latest.residency.outboundTaxResidencePeriods).toEqual([
      { from: "", through: "", sourceReference: "", noReciprocalStateIncomeTaxResidenceConfirmed: null },
      { from: "", through: "", sourceReference: "", noReciprocalStateIncomeTaxResidenceConfirmed: true },
    ]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

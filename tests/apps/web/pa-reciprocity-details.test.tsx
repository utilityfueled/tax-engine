// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PAReciprocityDetails } from "@/components/guided-interview/pa-reciprocity-details";
import { paReciprocityFixture } from "../../fixtures/pa-reciprocity.js";
import type { PAReciprocitySources } from "@/models/pa-reciprocity.js";
import type { PAResidencySources } from "@/models/pa-residency.js";
// Spec: spec/state/pa-reciprocity.yaml guide-controls.
it("PA reciprocal UI - retains unknown source facts and invalidates proof edits", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const f = paReciprocityFixture(); const element = document.createElement("div"); document.body.appendChild(element); const root = createRoot(element);
  let latest: { residencySources: PAResidencySources; reciprocitySources?: PAReciprocitySources } | undefined;
  function Harness() {
    const [data, setData] = useState<PAReciprocitySources>(); const [ordinary, setOrdinary] = useState<PAResidencySources>(f.residencySources);
    return <PAReciprocityDetails originalInput={f.input} residencySources={ordinary} data={data} onChange={next => { latest = next; setOrdinary(next.residencySources); setData(next.reciprocitySources); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const button = [...element.querySelectorAll("button")].find(b => b.textContent === "Add reciprocal employee sources");
    if (!button) throw new Error("Missing actual Add control");
    await act(async () => button.click());
    expect(latest?.reciprocitySources?.sourceTaxYear).toBeNull();
    expect(latest?.reciprocitySources?.sourceFactsConfirmed).toBeNull();
    expect(latest?.reciprocitySources?.originals).toEqual([]);
    expect(latest?.reciprocitySources?.segments).toEqual([]);
    await act(async () => root.render(<PAReciprocityDetails originalInput={f.input} residencySources={f.residencySources} data={f.reciprocalSources} onChange={next => { latest = next; }} />));
    const label = [...element.querySelectorAll("label")].find(l => l.querySelector(".guided-field-label")?.textContent === "Reciprocal employee source reference");
    const input = label?.querySelector("input"); if (!input) throw new Error("Missing actual source-reference field");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; if (!setter) throw new Error("Missing native setter");
    await act(async () => { setter.call(input, "changed actual legal source"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(latest?.reciprocitySources?.sourceFactsConfirmed).toBeNull();
    expect(latest?.residencySources.sourceFactsConfirmed).toBeNull();
    expect(latest?.residencySources.wages).toEqual(f.residencySources.wages);
    expect(element.textContent).toContain("Positive withholding is not required");
  } finally { await act(async () => root.unmount()); element.remove(); }
});

it("PA reciprocal UI - explicitly reconfirms both packets and removes proof without losing payroll", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const f = paReciprocityFixture(); const element = document.createElement("div"); document.body.appendChild(element); const root = createRoot(element);
  let latest: { residencySources: PAResidencySources; reciprocitySources?: PAReciprocitySources } | undefined;
  function Harness() {
    const [data, setData] = useState<PAReciprocitySources | undefined>(f.reciprocalSources);
    const [ordinary, setOrdinary] = useState<PAResidencySources>(f.residencySources);
    return <PAReciprocityDetails originalInput={f.input} residencySources={ordinary} data={data} onChange={next => { latest = next; setOrdinary(next.residencySources); setData(next.reciprocitySources); }} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const label = [...element.querySelectorAll("label")].find(l => l.querySelector(".guided-field-label")?.textContent === "Reciprocal employee source reference");
    const input = label?.querySelector("input"); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!input || !setter) throw new Error("Missing native source field");
    await act(async () => { setter.call(input, "actual-rechecked-legal-source"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(latest?.reciprocitySources?.sourceFactsConfirmed).toBeNull(); expect(latest?.residencySources.sourceFactsConfirmed).toBeNull();
    const confirm = [...element.querySelectorAll("button")].find(b => b.textContent === "Confirm both actual PA and reciprocal source packets");
    if (!confirm) throw new Error("Missing explicit actual confirmation action");
    await act(async () => confirm.click());
    expect(latest?.reciprocitySources?.sourceFactsConfirmed).toBe(true); expect(latest?.residencySources.sourceFactsConfirmed).toBe(true);
    expect(latest?.reciprocitySources?.originals[0].originalW2).toEqual(f.input.w2s[0]);
    const remove = [...element.querySelectorAll("button")].find(b => b.textContent === "Remove reciprocal employee sources");
    if (!remove) throw new Error("Missing proof removal action");
    await act(async () => remove.click());
    expect(latest?.reciprocitySources).toBeUndefined(); expect(latest?.residencySources.sourceFactsConfirmed).toBeNull();
    expect(latest?.residencySources.wages).toEqual(f.residencySources.wages);
  } finally { await act(async () => root.unmount()); element.remove(); }
});

// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { W2StateLocalDetails } from "@/components/guided-interview/w2-state-local-details";
import type { W2StateLocalSources } from "@/models/w2-state-local.js";
import { w2StateLocalFixture } from "../../fixtures/w2-state-local.js";
// Spec: spec/federal/w2-state-local.yaml guide-controls.
it("W2 state local UI - retains unknown source facts and invalidates actual edits", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const f = w2StateLocalFixture(), element = document.createElement("div"); document.body.appendChild(element); const root = createRoot(element);
  let latest: W2StateLocalSources | undefined;
  function Harness() { const [data, setData] = useState<W2StateLocalSources>(); return <W2StateLocalDetails originalInput={f.input} originalIndex={0} data={data} onChange={next => { latest = next; setData(next); }} />; }
  try {
    await act(async () => root.render(<Harness />));
    const add = [...element.querySelectorAll("button")].find(b => b.textContent === "Add actual W-2 state and local sources"); if (!add) throw new Error("Missing actual Add control");
    await act(async () => add.click()); expect(latest?.sourceTaxYear).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.stateRows).toEqual([]);
    await act(async () => root.render(<W2StateLocalDetails originalInput={f.input} originalIndex={0} data={f.sources} onChange={next => { latest = next; }} />));
    const label = [...element.querySelectorAll("label")].find(l => l.querySelector(".guided-field-label")?.textContent === "W-2 state and local original reference"), input = label?.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; if (!input || !setter) throw new Error("Missing actual original source field");
    await act(async () => { setter.call(input, "edited-actual-source-reference"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.stateRows).toEqual(f.sources.stateRows); expect(latest?.localRows).toEqual(f.sources.localRows);
    expect(element.textContent).toContain("State wages may overlap");
  } finally { await act(async () => root.unmount()); element.remove(); }
});

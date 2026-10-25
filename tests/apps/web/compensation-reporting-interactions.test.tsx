// @vitest-environment jsdom
// Spec: spec/federal/guided-schedule-1-a.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { CompensationReportingFields, type CompensationReportingData } from "@/components/guided-interview/compensation-reporting-fields";
it("collects original compensation reporting without copying the selected year", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: CompensationReportingData = {};
  function Harness() { const [data, setData] = useState<CompensationReportingData>({}); return <CompensationReportingFields data={data} kind="w2" onChange={patch => { latest = { ...latest, ...patch }; setData(latest); }} />; }
  async function change(label: string, value: string) { const input = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector("input"); if (!input) throw new Error(label); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />)); expect(latest).toEqual({});
    await change("Original W-2 tax year", "2026"); await change("Box 12 code TP: Reported cash tips", "9007199254740993.01"); await change("Box 12 code TT: Reported qualified overtime", "0"); await change("Box 14b: Reported tipped occupation codes", "102, 106");
    expect(latest).toEqual({ sourceTaxYear: "2026", box12CodeTP: "9007199254740993.01", box12CodeTT: "0", treasuryTippedOccupationCodes: ["102", "106"] });
    await change("Box 12 code TT: Reported qualified overtime", ""); await change("Box 14b: Reported tipped occupation codes", ""); expect(latest.box12CodeTT).toBe(""); expect(latest.treasuryTippedOccupationCodes).toBeUndefined();
    const button = [...container.querySelectorAll("button")].find(row => row.textContent === "Confirm no tipped occupation code reported"); await act(async () => button!.click()); expect(latest.treasuryTippedOccupationCodes).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

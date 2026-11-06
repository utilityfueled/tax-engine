// @vitest-environment jsdom
// Spec: spec/federal/guided-hsa-distributions.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { HsaDistributionDetails } from "@/components/guided-interview/hsa-distribution-details";
import { buildHsaDistributionInputs, hsaDistributionFactErrors, type HsaDistributionSource } from "@/lib/guided-hsa-distribution-facts";

async function render(run: (context: { latest: () => HsaDistributionSource[]; change: (label: string, value: string) => Promise<void>; click: (label: string) => Promise<void> }) => Promise<void>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: HsaDistributionSource[] = [];
  function Harness() { const [records, setRecords] = useState<HsaDistributionSource[]>([]); return <HsaDistributionDetails records={records} labelPrefix="HSA 1" onChange={next => { latest = next; setRecords(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing control ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, change, click }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}

it("collects distribution sources from unknown controls and preserves exact amounts and confirmation", async () => {
  await render(async ({ latest, change, click }) => {
    await click("HSA 1: Add Form 1099-SA source");
    expect(latest()[0]?.accountOwner).toBe(""); expect(latest()[0]?.grossDistribution).toBe("");
    const source = "HSA 1, source 1";
    const event = `${source}, distribution 1`;
    for (const [label, value] of [["Actual statement tax year", "2025"], ["Actual recipient", "primary"], ["Payer name", "Actual bank"], ["Payer TIN", "12-3456789"], ["Account reference", "ending-1234"], ["Box 5 account type", "hsa"], ["Box 3 distribution code", "1"], ["Box 1 gross distribution", "9007199254740993.01"], ["Box 2 excess-contribution earnings", "0"], ["This was a trustee-to-trustee transfer", "false"]]) await change(`${source}: ${label}`, value);
    await click(`${source}: Add dated distribution`);
    for (const [label, value] of [["Actual distribution date", "2025-04-01"], ["Gross amount", "9007199254740993.01"], ["Medical costs assigned to this distribution", "0"], ["Amount rolled into another HSA", "0"]]) await change(`${event}: ${label}`, value);
    await change(`${source}: Source and allocations checked after the last edit`, "true");
    const input = () => buildHsaDistributionInputs(latest(), "primary", 2025, "1990-02-15");
    expect(input().form1099SA[0]?.grossDistribution).toBe("9007199254740993.01");
    await change(`${source}: Box 2 excess-contribution earnings`, ""); expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    await change(`${source}: Source and allocations checked after the last edit`, "true"); expect(() => input()).toThrow(/Box 2/);
    await change(`${source}: Box 2 excess-contribution earnings`, "0"); await change(`${source}: Source and allocations checked after the last edit`, "true"); expect(input().form1099SA[0]?.earningsOnExcessContributions).toBe("0");
    await change(`${source}: Actual recipient`, "spouse"); expect(Object.keys(hsaDistributionFactErrors(latest(), "primary", 2025, "1990-02-15")).length).toBeGreaterThan(0); expect(latest()[0]?.grossDistribution).toBe("9007199254740993.01");
    await click(`${source}: Remove source`); expect(latest()).toEqual([]);
  });
});

it("records medical and rollover qualification without replacing false facts or unsupported codes", async () => {
  await render(async ({ latest, change, click }) => {
    await click("HSA 1: Add Form 1099-SA source"); const source = "HSA 1, source 1"; const event = `${source}, distribution 1`;
    for (const [label, value] of [["Actual statement tax year", "2025"], ["Actual recipient", "primary"], ["Payer name", "Actual bank"], ["Payer TIN", "12-3456789"], ["Account reference", "ending-1234"], ["Box 5 account type", "hsa"], ["Box 3 distribution code", "1"], ["Box 1 gross distribution", "300"], ["Box 2 excess-contribution earnings", "0"], ["This was a trustee-to-trustee transfer", "false"]]) await change(`${source}: ${label}`, value);
    await click(`${source}: Add dated distribution`);
    for (const [label, value] of [["Actual distribution date", "2025-06-01"], ["Gross amount", "300"], ["Medical costs assigned to this distribution", "100.10"], ["The cost is a qualified HSA medical expense", "true"], ["The expense was for an eligible HSA beneficiary", "true"], ["The expense was incurred after the HSA was established", "true"], ["The expense was not reimbursed elsewhere", "false"], ["The expense was not deducted on Schedule A", "true"], ["Amount rolled into another HSA", "100"], ["Actual receiving HSA deposit date", "2025-07-31"], ["The receiving HSA has the same owner", "true"], ["No other HSA rollover in the preceding twelve months", "true"]]) await change(`${event}: ${label}`, value);
    await change(`${source}: Source and allocations checked after the last edit`, "true");
    const input = () => buildHsaDistributionInputs(latest(), "primary", 2025, "1960-06-01");
    expect(input().form8889).toMatchObject({ qualifiedMedicalExpenses: "0", rolloverDistributions: "100", distributionsAfterAge65: "200" });
    expect(latest()[0]?.events[0]?.medicalExpenses).toBe("100.10");
    await change(`${event}: The expense was not reimbursed elsewhere`, "true"); await change(`${source}: Source and allocations checked after the last edit`, "true"); expect(input().form8889.distributionsAfterAge65).toBe("99.9");
    await change(`${event}: Actual receiving HSA deposit date`, "2025-08-01"); await change(`${source}: Source and allocations checked after the last edit`, "true"); expect(input().form8889.rolloverDistributions).toBe("0");
    await change(`${source}: Box 3 distribution code`, "2"); await change(`${source}: Source and allocations checked after the last edit`, "true"); expect(() => input()).toThrow(/Contribution returns/); expect(latest()[0]?.distributionCode).toBe("2");
    await click(`${event}: Remove dated distribution`); expect(latest()[0]?.events).toEqual([]); expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
  });
});

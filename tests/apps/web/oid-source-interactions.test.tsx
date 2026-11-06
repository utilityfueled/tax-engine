// @vitest-environment jsdom
// Spec: spec/federal/guided-oid-sources.yaml.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OidSourceCards } from "@/components/guided-interview/oid-source-details";
import { oidFactErrors, type OidEntryData } from "@/lib/guided-oid-facts";
import { actualOid } from "../../fixtures/guided-oid";
let container: HTMLDivElement, root: Root, latest: OidEntryData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function change(label: string, value: string) {
  const control = [...container.querySelectorAll("label")].find(node => node.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  if (!control) throw new Error(`Missing ${label}`);
  await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
describe("actual OID input interactions", () => {
  it("collects actual OID worksheets and clears stale confirmation after edits", async () => {
    latest = [structuredClone(actualOid)];
    function Harness() { const [entries, setEntries] = useState(latest); return <OidSourceCards entries={entries} stateCode="PA" onChange={next => { latest = next; setEntries(next); }} />; }
    await act(async () => root.render(<Harness />));
    await change("Box 1 original issue discount", "9007199254740993.01");
    expect(latest[0].originalIssueDiscount).toBe("9007199254740993.01");
    expect(latest[0].sourceFactsConfirmed).toBeNull(); expect(latest[0].recipientAmountsConfirmed).toBeNull();
    await change("Box 4 federal tax withheld", ""); expect(oidFactErrors(latest, "single", 2025, "PA")).toHaveProperty("oid-0-federalWithheld");
    await change("Box 4 federal tax withheld", "0");
    await change("Does a recipient adjustment worksheet apply?", "true");
    await change("Recipient worksheet reference", "Actual recipient worksheet");
    for (const field of ["oid", "periodic interest", "acquisition premium", "bond premium", "market discount"]) await change(`Recipient adjustment: ${field}`, field === "oid" ? "-0.01" : "0");
    await change("Actual number of state rows", "single");
    await change("State row 1 — state", "PA"); await change("State row 1 — payer ID", "actual-pa-id"); await change("State row 1 — withholding", "0.10");
    await change("PA source worksheet reference", "Actual PA worksheet"); await change("PA treatment of this obligation", "taxable");
    await change("Is this a stripped bond or coupon for PA?", "false");
    await change("Premium already netted on the source statement", "0"); await change("Actual PA bond premium amortization", "0");
    await change("Have you reviewed these PA source facts?", "true");
    await change("Are recipient amounts reconciled for holding period, basis and ownership?", "true");
    await change("Have you reviewed all actual OID source facts?", "true");
    expect(oidFactErrors(latest, "single", 2025, "PA")).toEqual({});
    await change("Box 1 original issue discount", "100"); expect(latest[0].paFacts?.factsConfirmed).toBeNull();
    await click("Add 1099-OID"); expect(latest).toHaveLength(2); expect(latest[1]).toEqual({});
    await click("Remove 1099-OID #2"); expect(latest).toHaveLength(1);
  });
});

// @vitest-environment jsdom
// Spec: spec/state/pa-rental-classification.yaml, guided.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SectionRentalIncome } from "@/components/guided-interview/section-rental-income";
import { rentalFactErrors } from "@/lib/guided-rental-facts";
import { buildRentalPropertyInputs } from "@/lib/guided-interview-bridge";
import type { RentalPropertyEntryData } from "@/lib/guided-interview-flow";
import { completeRentalSource } from "../../guided-interview/complete-facts";
import { actualPAWorksheet } from "../../fixtures/pa-rental-worksheet";
let container: HTMLDivElement, root: Root, latest: RentalPropertyEntryData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!element) throw new Error(`Missing ${label}`); return element; }
async function change(label: string, value: string) { const field = control(label); await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }

it("collects PA classification facts without defaults and invalidates confirmation", async () => {
  latest = [{ ...structuredClone(completeRentalSource), paClassification: undefined,
    paIncomeExpenses: { ...actualPAWorksheet({ grossRents: "0", advertising: "0", autoTravel: "0", repairs: "0", depreciation: "0" }), taxYear: "2025" } }];
  function Harness() { const [data, setData] = useState(latest); return <SectionRentalIncome stateCode="PA" entries={data} onEntriesChange={next => { latest = next; setData(next); }} />; }
  await act(async () => root.render(<Harness />));
  expect(control("Actual average customer-use period in days").value).toBe("");
  expect(rentalFactErrors(latest, "single", 2025, "PA")).toHaveProperty("rental-0-pa-classification");
  await change("Actual average customer-use period in days", "7");
  await change("PA rental activity source or worksheet reference", "Actual bookings and activity records");
  for (const [label, answer] of [
    ["Was this activity offered commercially to the public?", "true"],
    ["Was the activity regular and continuous?", "true"],
    ["Was use limited to defined business hours?", "false"],
    ["Did making the property available involve significant operating expenses?", "false"],
    ["Was this leasing activity incidental to a real estate sales business?", "false"],
    ["Was the property rented to a related party or your own business?", "false"],
    ["Was this a dealer property held for sale to customers?", "false"],
  ]) await change(label, answer);
  await change("Have you checked these PA activity facts against the source records?", "true");
  await change("Have you checked the PA income and expense worksheet after the latest edits?", "true");
  await change("Have you checked the actual property, ownership, use, income and expense facts after the latest edits?", "true");
  expect(rentalFactErrors(latest, "single", 2025, "PA")).toEqual({});
  expect(buildRentalPropertyInputs(latest)[0]).toMatchObject({ rentalDays: 300, paClassification: { averageCustomerUseDays: "7", forProfit: true, significantServices: false, factsConfirmed: true, relatedPartyRental: false } });
  await change("Actual average customer-use period in days", "30.01");
  expect(latest[0].paClassification?.factsConfirmed).toBeNull();
  expect(latest[0].sourceFactsConfirmed).toBeNull();
  expect(buildRentalPropertyInputs(latest)[0].paClassification?.averageCustomerUseDays).toBe("30.01");
  await change("Actual average customer-use period in days", "");
  expect(buildRentalPropertyInputs(latest)[0].paClassification?.averageCustomerUseDays).toBeUndefined();
  expect(rentalFactErrors(latest, "single", 2025, "PA")).toHaveProperty("rental-0-pa-average");
});

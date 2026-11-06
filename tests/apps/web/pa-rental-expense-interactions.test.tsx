// @vitest-environment jsdom
// Spec: spec/state/pa-schedule-e.yaml, guided-pa-property-worksheet.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SectionRentalIncome } from "@/components/guided-interview/section-rental-income";
import { rentalFactErrors } from "@/lib/guided-rental-facts";
import { buildRentalPropertyInputs } from "@/lib/guided-interview-bridge";
import type { RentalPropertyEntryData } from "@/lib/guided-interview-flow";
import { completeRentalSource } from "../../guided-interview/complete-facts";
let container: HTMLDivElement, root: Root, latest: RentalPropertyEntryData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!element) throw new Error(`Missing ${label}`); return element; }
async function change(label: string, value: string) { const field = control(label); await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }

it("collects actual PA income and expenses without copying federal values", async () => {
  latest = [{ ...structuredClone(completeRentalSource), rents: "12000", depreciation: "1500" }];
  function Harness() { const [data, setData] = useState(latest); return <SectionRentalIncome stateCode="PA" entries={data} onEntriesChange={next => { latest = next; setData(next); }} />; }
  await act(async () => root.render(<Harness />));
  expect(control("PA gross rents").value).toBe("");
  expect(control("PA depreciation").value).toBe("");
  expect(rentalFactErrors(latest, "single", 2025, "PA")).toHaveProperty("rental-0-pa-worksheet");
  await change("PA worksheet tax year", "2025");
  await change("PA income and expense source reference", "Actual separate PA source ledger");
  for (const label of ["PA gross rents", "PA advertising", "PA auto and travel", "PA cleaning and maintenance", "PA commissions", "PA insurance", "PA legal and professional fees", "PA management fees", "PA mortgage interest", "PA other interest", "PA repairs", "PA supplies", "PA taxes", "PA utilities", "PA depreciation", "PA other expenses"]) await change(label, label === "PA depreciation" ? "700.25" : "0");
  await change("PA depreciation worksheet reference", "Actual PA basis and straight-line worksheet");
  for (const label of ["Are these PA amounts before ownership allocation?", "Do these expenses exclude all personal-use costs?", "Were the PA deduction rules applied to these source amounts?", "Have you checked the PA income and expense worksheet after the latest edits?"]) await change(label, "true");
  await change("Have you checked the actual property, ownership, use, income and expense facts after the latest edits?", "true");
  expect(buildRentalPropertyInputs(latest)[0]).toMatchObject({ rents: "12000", depreciation: "1500", paIncomeExpenses: { taxYear: 2025, grossRents: "0", depreciation: "700.25", repairs: "0", factsConfirmed: true } });
  expect(Object.keys(rentalFactErrors(latest, "single", 2025, "PA")).filter(key => key.includes("pa-worksheet"))).toEqual([]);
  await change("PA repairs", "");
  expect(buildRentalPropertyInputs(latest)[0].paIncomeExpenses?.repairs).toBeUndefined();
  expect(latest[0].paIncomeExpenses?.factsConfirmed).toBeNull();
  expect(latest[0].sourceFactsConfirmed).toBeNull();
  expect(rentalFactErrors(latest, "single", 2025, "PA")).toHaveProperty("rental-0-pa-worksheet-repairs");
});

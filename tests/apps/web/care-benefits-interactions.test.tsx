// @vitest-environment jsdom
// Spec: spec/federal/form-2441-benefits.yaml#guided-benefit-controls
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CareBenefitsDetails } from "@/components/guided-interview/care-benefits-details";
import { careBenefitsFactErrors, type CareBenefitsData, type CareBenefitSource } from "@/lib/guided-dependent-care-benefits";
import type { FilingStatus } from "@/lib/guided-interview-flow";

let container: HTMLDivElement, root: Root, latest: CareBenefitsData | undefined;
const sources: CareBenefitSource[] = [{ sourceId: "w2:0", label: "Actual Employer", kind: "employee", owner: "primary", reportedBenefits: "1000.25" }, { sourceId: "scheduleC", label: "Actual Business", kind: "business", owner: "primary", schedule: "schedule-c", reportedEmployeeBenefitPrograms: "2000" }];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) {
  const item = [...container.querySelectorAll("label")].find(node => node.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  if (!item) throw new Error(`Missing ${label}`); return item;
}
async function change(label: string, value: string) {
  const input = control(label);
  await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(initial?: CareBenefitsData, filingStatus: FilingStatus = "single") {
  latest = structuredClone(initial);
  function Harness() { const [data, setData] = useState(latest); return <CareBenefitsDetails data={data} taxYear={2026} filingStatus={filingStatus} sources={sources} onChange={value => { latest = value; setData(value); }} />; }
  await act(async () => root.render(<Harness />));
}
const confirmSource = "Have you checked all benefit source and provider facts after the last edit?";
const confirmIncome = "Have you checked both actual earned-income worksheets after the last edit?";
const confirmExpenses = "Have you reconciled expenses and benefits without using the same expense twice?";

describe("care benefit source interactions", () => {
  it("collects the actual surviving-spouse election and retains separate signed income", async () => {
    await render({}, "mfj");
    expect(control("Did your spouse die during this tax year?").value).toBe("");
    await change("Did your spouse die during this tax year?", "true");
    expect(control("Are you choosing to use the deceased spouse's earned income for the benefit limit?").value).toBe("");
    await change("Are you choosing to use the deceased spouse's earned income for the benefit limit?", "false");
    await change("Spouse's actual Part III earned income", "-125.75");
    expect(latest).toMatchObject({ spouseDiedDuringYear: true, useDeceasedSpouseEarnedIncome: false, spouseEarnedIncome: "-125.75" });
    await change(confirmIncome, "true"); await change(confirmExpenses, "true"); await change(confirmSource, "true");
    await change("Did your spouse die during this tax year?", "");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(Object.keys(careBenefitsFactErrors(latest, 2026, "mfj", [])).length).toBeGreaterThan(0);
  });

  it("keeps added benefit records blank and clears confirmations after source edits", async () => {
    await render(); await click("Add dependent-care benefits");
    expect(latest).toEqual({});
    await click("Add employee benefit source");
    expect(latest?.employeeBenefits).toEqual([{}]);
    expect(control("Employee benefit recipient 1").value).toBe("");
    expect(control("Reported W-2 Box 10 benefits — source 1").value).toBe("");
    await change("Employee benefit source 1", "w2:0");
    expect(latest?.employeeBenefits?.[0]).toMatchObject({ sourceId: "w2:0", owner: "primary" });
    expect(latest?.employeeBenefits?.[0]?.benefitsReported).toBeUndefined();
    await change("Reported W-2 Box 10 benefits — source 1", "1000.25");
    await change(confirmIncome, "true"); await change(confirmExpenses, "true"); await change(confirmSource, "true");
    await change("Benefits already included in W-2 Box 1 wages — source 1", "0.25");
    expect(latest).toMatchObject({ sourceFactsConfirmed: null, earnedIncomeWorksheetConfirmed: null, creditExpenseCoordinationConfirmed: null });
    expect(latest?.employeeBenefits?.[0]?.alreadyIncludedInWages).toBe("0.25");
    await click("Add employee benefit source"); await click("Remove employee benefit source 2");
    expect(latest?.employeeBenefits).toHaveLength(1);
    await change("Employee benefit source 1", ""); expect(latest?.employeeBenefits?.[0]?.owner).toBeUndefined();
    expect(Object.keys(careBenefitsFactErrors(latest, 2026, "single", sources)).length).toBeGreaterThan(0);
  });
  it("records explicit empty sources and known ineligibility without inventing providers", async () => {
    await render({});
    await click("Confirm no employee benefits"); await click("Confirm no business plan benefits"); await click("Confirm no business deduction allocations"); await click("Confirm no care providers or incurred expenses");
    for (const [label, value] of [["Do the dependent-care benefit exclusion eligibility requirements apply?", "false"], ["Actual plan exclusion limit", "7500"], ["Qualified care expenses incurred during the tax year", "0"], ["Your actual Part III earned income", "-10.25"], ["Do the Part III earned-income worksheets use student or incapacity deemed income?", "false"], ["Actual number of qualifying people for Part III", "0"], ["Actual net expenses paid for the current-year care credit", "0"], [confirmIncome, "true"], [confirmExpenses, "true"], [confirmSource, "true"]]) await change(label, value);
    expect(careBenefitsFactErrors(latest, 2026, "single", [])).toEqual({});
    expect(latest).toMatchObject({ employeeBenefits: [], selfEmployedBenefits: [], deductionAllocations: [], providers: [], primaryEarnedIncome: "-10.25", exclusionEligibilityConfirmed: false });
    await change("Actual plan exclusion limit", ""); await change(confirmIncome, "true"); await change(confirmExpenses, "true"); await change(confirmSource, "true");
    expect(Object.keys(careBenefitsFactErrors(latest, 2026, "single", [])).length).toBeGreaterThan(0);
    await click("Remove dependent-care benefit details"); expect(latest).toBeUndefined();
  });
  it("binds business allocations and exposes actual separated-spouse answers", async () => {
    await render({}, "mfs"); await click("Add business benefit source"); await change("Business benefit source 1", "scheduleC");
    expect(latest?.selfEmployedBenefits?.[0]).toMatchObject({ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c" });
    await change("Care benefits already deducted in this activity's expenses — activity 1", "2000");
    await click("Add business deduction allocation"); await change("Deduction activity 1", "scheduleC");
    expect(latest?.deductionAllocations?.[0]?.amount).toBeUndefined();
    await change("Allowed deduction allocated to activity 1", "2000");
    await change("Did your spouse live apart from you throughout the last six months of the year?", "true");
    await change("Did you pay over half the cost of keeping up your home?", "true");
    await change("Was your home the qualifying person's main home for over half the year?", "false");
    expect(latest).toMatchObject({ spouseLivedApartLast6Months: true, paidOverHalfHomeCost: true, qualifyingPersonMainHomeOverHalfYear: false });
    await click("Add care provider"); await change("Provider 1 name", "Actual Provider"); expect(latest?.providers?.[0]?.householdEmployee).toBeUndefined();
    await click("Remove provider 1"); await click("Remove deduction allocation 1"); await click("Remove business benefit source 1");
    expect(latest).toMatchObject({ providers: [], deductionAllocations: [], selfEmployedBenefits: [] });
  });
});

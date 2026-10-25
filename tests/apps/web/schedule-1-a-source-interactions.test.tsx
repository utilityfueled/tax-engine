// @vitest-environment jsdom
// Spec: spec/federal/guided-schedule-1-a.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Schedule1ASourceDetails } from "@/components/guided-interview/schedule-1-a-source-details";
import type { Schedule1AData } from "@/lib/guided-schedule-1-a-facts";
it("collects actual additional deduction records and preserves unknown answers", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: Schedule1AData | undefined;
  function Harness() { const [data, setData] = useState<Schedule1AData>(); return <Schedule1ASourceDetails data={data} compensationSources={[{ sourceId: "formW2:0", kind: "w2", accountHolder: "primary", name: "Actual restaurant" }, { sourceId: "form1099Nec:0", kind: "nec", accountHolder: "primary", name: "Actual client" }]} businessOwner="primary" businessName="Actual service" onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add additional deduction worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.allSourcesIncluded).toBeNull();
    for (const [label, value] of [["Source tax year", "2025"], ["Source reference", "Actual records"], ["Excluded Puerto Rico income", "0"], ["Form 4563 exclusion", "0"], ["All claimed sources are included", "true"]]) await change(`Additional deductions: ${label}`, value!);
    await click("Add employee tip deduction"); await change("Employee tips 1: Owner", "primary"); await change("Employee tips 1: Employer", "Actual restaurant"); await change("Employee tips 1: Occupation code", "102"); await change("Employee tips 1: Listed tipped occupation", "true"); await change("Employee tips 1: Voluntary cash or charge tips", "true"); await change("Employee tips 1: Lawful activity", "true"); await change("Employee tips 1: Service-business rule or current-year transition met", "false");
    await click("Employee tips 1: Add W-2 source"); await change("Employee tips 1: W-2 source 1", "formW2:0"); await change("Employee tips 1: Reporting method", "form4070"); await change("Employee tips 1: Reporting reference", "Actual monthly reports"); await change("Employee tips 1: Employer-reported total on statement", "7000.10"); await change("Employee tips 1: Qualified employer-reported tips", "7000.10"); await change("Employee tips 1: Form 4137 employer source label", "restaurant"); await change("Employee tips 1: Qualified total Form 4137 column 1(c)", "7018.10");
    expect(latest?.employeeTips[0]?.meetsSstbRuleOrTransition).toBe(false);
    await change("Employee tips 1: Reporting method", "form4137"); expect(latest?.employeeTips[0]?.reportingMethod).toBe("form4137");
    expect(container.textContent).not.toContain("Employee tips 1: Employer-reported total on statement");
    await click("Add business tip deduction"); await change("Business tips 1: Owner", "primary"); await change("Business tips 1: Business", "scheduleC"); await click("Business tips 1: Add reported tip source"); await change("Business tips 1: Reported source 1", "form1099Nec:0"); await change("Business tips 1: Qualified tips in source 1", "200.01");
    await click("Add overtime deduction"); await change("Overtime 1: Owner", "primary"); await change("Overtime 1: Compensation source", "formW2:0"); await change("Overtime 1: Qualified FLSA premium", "1000.10"); await change("Overtime 1: Payroll compensation excluded from Box 1", "0"); await change("Overtime 1: Premium required by FLSA", "false"); await change("Overtime 1: Reporting reference", "Actual premium statement");
    await click("Add vehicle loan interest"); await change("Vehicle loan 1: Owner", "primary");
    for (const [label, value] of [["Lender", "Actual lender"], ["Loan account reference", "loan-1"], ["Source tax year", "2025"], ["Source reference", "Actual loan statement"], ["VIN", "1HGCM82633A004352"], ["Acquired date", "2025-01-01"], ["Loan origination date", "2025-01-01"], ["Interest paid", "9007199254740993.01"], ["Interest already deducted elsewhere", "0"], ["Nonqualifying interest", "0"], ["Vehicle type", "car"], ["Gross vehicle weight rating in pounds", "4000"]]) await change(`Vehicle loan 1: ${label}`, value!);
    for (const label of ["Borrower qualification confirmed", "First lien", "Original use begins with borrower", "Final assembly in the United States", "Purchased for personal use"]) await change(`Vehicle loan 1: ${label}`, "true");
    for (const label of ["Related-party loan", "Lease", "Fleet purchase", "Salvage or scrap", "Refinanced loan"]) await change(`Vehicle loan 1: ${label}`, "false");
    await click("Add senior deduction owner"); await change("Senior deduction 1: Owner", "primary");
    await change("Additional deductions: Sources checked after the last edit", "true"); expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.vehicleLoans[0]?.interestPaid).toBe("9007199254740993.01");
    await change("Vehicle loan 1: Interest already deducted elsewhere", ""); expect(latest?.vehicleLoans[0]?.businessInterestDeducted).toBe(""); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Overtime 1: Premium required by FLSA", ""); expect(latest?.overtime[0]?.requiredByFlsa).toBeNull();
    await click("Employee tips 1: Remove W-2 source 1"); await click("Employee tips 1: Remove employee tips"); await click("Business tips 1: Remove reported source 1"); await click("Business tips 1: Remove business tips"); await click("Overtime 1: Remove overtime"); await click("Vehicle loan 1: Remove vehicle loan"); await click("Senior deduction 1: Remove owner");
    expect(latest).toMatchObject({ employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [] });
    await click("Remove additional deduction worksheet"); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

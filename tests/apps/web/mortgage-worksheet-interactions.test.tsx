// @vitest-environment jsdom
// Spec: spec/federal/guided-mortgage-worksheet.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DeductionSourceDetails } from "@/components/guided-interview/deduction-source-details";
import { emptyDeductionData, type DeductionData } from "@/lib/guided-interview-flow";

it("collects actual mortgage worksheet facts and invalidates changed sources", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData, method: "itemized" };
  function Harness() { const [data, setData] = useState(latest); return <DeductionSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add mortgage");
    expect(latest.mortgageEntries?.[0]?.balanceMethod).toBeUndefined();
    expect(latest.mortgageWorksheet?.allHomeDebtIncluded).toBeUndefined();
    await change("Home-debt worksheet tax year", "2025");
    await change("Annual home-debt record reference", "Actual annual loan statements");
    await change("Are all debts on the main and selected second home included?", "true");
    await change("Did you receive a refund or recovery of mortgage interest deducted in an earlier year?", "false");
    await change("Have you confirmed the complete annual home-debt worksheet after the last change?", "true");
    await change("Balance method for the home-debt worksheet", "highest_balance");
    expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
    await change("Maximum actual loan balance at any time during the tax year", "9007199254740993.01");
    await change("Annual balance history or lender-average source reference", "Actual complete balance history");
    await change("Actual Box 1 interest paid by taxpayers on this return", "0");
    await change("Actual Box 1 interest paid by other returns", "0");
    await change("Box 6 points allocable to this return, including qualifying seller-paid points", "0");
    expect(latest.mortgageEntries?.[0]).toMatchObject({ maximumBalanceDuringYear: "9007199254740993.01", interestPaidByReturnAmount: "0", interestPaidByOthers: "0", pointsPaidByReturnAmount: "0" });
    expect(latest.mortgageEntries?.[0]?.sameYearInterestRefund).toBeUndefined();
    await change("Have you confirmed the complete annual home-debt worksheet after the last change?", "true");
    await change("Have you checked all mortgage source and qualification facts after the last edit?", "true");
    expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBe(true);
    await change("Balance method for the home-debt worksheet", "lender_average");
    await change("Actual lender-provided annual average loan balance", "600000.10");
    expect(latest.mortgageEntries?.[0]).toMatchObject({ sourceFactsConfirmed: null, lenderAverageBalance: "600000.10" });
    await change("Mortgage origination date (Box 3)", "2017-12-16");
    await change("Does the actual pre-December 15, 2017 binding-contract transition apply?", "false");
    expect(latest.mortgageEntries?.[0]?.bindingContractApplies).toBe(false);
    await click("Remove mortgage #1"); expect(latest.mortgageEntries).toEqual([]); expect(latest.mortgageWorksheet?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

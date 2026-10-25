// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, mortgage-source-qualification
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DeductionSourceDetails } from "@/components/guided-interview/deduction-source-details";
import { buildForm1098Inputs } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, emptyMortgageEntry, type DeductionData } from "@/lib/guided-interview-flow";
import { completeMortgageSource, completeMortgageWorksheet } from "../../guided-interview/complete-facts";

it("requires renewed mortgage confirmation and preserves actual insurance allocation without copying Box 5", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData, method: "itemized", mortgageInterest: "100", mortgageWorksheet: { ...completeMortgageWorksheet, sourceTaxYear: "2026" }, mortgageEntries: [{ ...completeMortgageSource, sourceTaxYear: "2026" }] };
  function Harness() { const [data, setData] = useState(latest); return <DeductionSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  const control = (label: string) => {
    const result = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!result) throw new Error(`Missing control: ${label}`);
    return result;
  };
  async function change(label: string, value: string) {
    const element = control(label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  const confirm = "Have you checked all mortgage source and qualification facts after the last edit?";
  const confirmWorksheet = "Have you confirmed the complete annual home-debt worksheet after the last change?";
  try {
    await act(async () => root.render(<Harness />));
    await change("Outstanding mortgage principal (Box 2)", "9007199254740993.01");
    expect(control(confirm).value).toBe("");
    expect(latest.mortgageEntries![0]!.outstandingPrincipal).toBe("9007199254740993.01");
    await change("Maximum actual loan balance at any time during the tax year", "9007199254740993.01");
    await change(confirm, "true");
    expect(() => buildForm1098Inputs(latest, 2026, "single")).toThrow(/bound|worksheet/i);
    await change(confirmWorksheet, "true");
    expect(buildForm1098Inputs(latest, 2026, "single")[0]?.outstandingMortgagePrincipal).toBe("9007199254740993.01");
    await change("Outstanding mortgage principal (Box 2)", "250000");
    await change("Maximum actual loan balance at any time during the tax year", "250000");
    await change("Mortgage insurance premiums reported (Box 5)", "1200");
    await change("Do current or prepaid mortgage insurance premiums need evaluation for this year?", "true");
    expect(control("Actual insurance premiums allocable to this tax year").value).toBe("");
    for (const [label, value] of [
      ["Mortgage insurance contract issue date", "2020-01-01"], ["Mortgage insurance allocation tax year", "2026"],
      ["Is the insurance provided by VA, FHA, RHS or qualifying private mortgage insurance?", "true"],
      ["Is the insurance for qualifying acquisition debt?", "true"], ["Is the insured debt on a qualified residence?", "false"],
      ["Actual insurance premiums allocable to this tax year", "0.10"], [confirm, "true"],
    ]) await change(label, value);
    await change(confirmWorksheet, "true");
    expect(buildForm1098Inputs(latest, 2026, "single")[0]).toMatchObject({ mortgageInsurancePremiums: "1200", mortgageInsuranceQualification: { qualifiedResidence: false, premiumsAllocableToYear: "0.1" } });
    await change("Actual insurance premiums allocable to this tax year", "0"); await change(confirm, "true"); await change(confirmWorksheet, "true");
    expect(buildForm1098Inputs(latest, 2026, "single")[0]?.mortgageInsuranceQualification?.premiumsAllocableToYear).toBe("0");
    await change("Actual insurance premiums allocable to this tax year", ""); await change(confirm, "true"); await change(confirmWorksheet, "true");
    expect(() => buildForm1098Inputs(latest, 2026, "single")).toThrow(/allocable/i);
    await change("Home mortgage interest", "");
    expect(latest.mortgageInterest).toBe("");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Add mortgage")!.click());
    expect(latest.mortgageEntries?.[1]?.sourceTaxYear).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("collects ordinary purchase-loan and points facts from blank controls and blocks a changed loan classification", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let latest: DeductionData = { ...emptyDeductionData, method: "itemized", mortgageEntries: [{ ...emptyMortgageEntry }] };
  function Harness() { const [data, setData] = useState(latest); return <DeductionSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(() => buildForm1098Inputs(latest, 2026, "single")).toThrow();
    for (const [label, value] of [
      ["Mortgage lender", "Actual Purchase Lender"], ["Home mortgage interest", "100.10"], ["Outstanding mortgage principal (Box 2)", "250000"], ["Mortgage origination date (Box 3)", "2026-02-03"],
      ["Mortgage statement tax year", "2026"], ["Loan account reference (last four digits or local statement label)", "first-statement"], ["Borrowers whose payments this return claims", "primary"], ["Address or description of the home securing the loan", "1 Actual Road, Columbus OH 43215"], ["Actual home use", "main-home"], ["Actual loan type", "original"], ["Actual use of all loan proceeds", "acquisition"], ["Maximum actual loan balance at any time during the tax year", "250000"],
      ["Is the debt legally secured by this qualified home?", "true"], ["Do the borrowers claiming the deduction have an ownership interest in this home?", "true"], ["Do borrower and lender intend and require repayment?", "true"], ["Was the claimed interest share actually paid by taxpayers on this return?", "true"], ["Does the interest exclude prepaid amounts allocable to a later year?", "true"], ["Was any part of this home or debt used for rental or business purposes?", "false"], ["Do you have a mortgage credit certificate for this loan?", "false"], ["Do cooperative, construction, ground-rent, changing-home or other special mortgage rules apply?", "false"],
      ["Balance method for the home-debt worksheet", "highest_balance"], ["Annual balance history or lender-average source reference", "Actual lender balance history"],
      ["Actual Box 1 interest paid by taxpayers on this return", "100.10"], ["Actual Box 1 interest paid by other returns", "0"], ["Interest from this return's share deducted on another schedule", "0"], ["Refund of this year's interest paid by this return", "0"], ["Other ineligible interest in this return's paid share", "0"], ["Box 6 points allocable to this return, including qualifying seller-paid points", "20.20"], ["Box 6 points allocable to another return", "0"], ["Service fees or other noninterest amounts in this return's points share", "0"],
      ["Prior-year interest refund (Box 4)", "0"], ["Mortgage insurance premiums reported (Box 5)", "0"], ["Purchase points reported (Box 6)", "20.20"],
      ["Actual points deduction method", "current_year"], ["Actual points payment date", "2026-02-03"], ["Actual main-home purpose for these points", "purchase"],
      ["Were the points for a loan secured by your main home?", "true"], ["Is paying points an established business practice in the area?", "true"], ["Were the points no more than the amount generally charged in the area?", "true"], ["Do you use the cash method of accounting?", "true"], ["Were the points separate from service fees normally stated separately?", "true"], ["Did your funds not borrowed from the lender or broker, plus seller-paid points, cover the points?", "true"], ["Was this loan used to buy or build your main home?", "true"], ["Were the points figured as a percentage of mortgage principal?", "true"], ["Does the settlement statement clearly identify these points?", "true"], ["Do you elect to deduct these qualifying points in full this year?", "true"],
      ["Qualified real estate taxes actually disbursed by this mortgage account", "0.30"], ["Are these actual qualified tax disbursements, with no escrow deposits or duplicate deductions?", "true"], ["Do current or prepaid mortgage insurance premiums need evaluation for this year?", "false"], ["Have you checked all mortgage source and qualification facts after the last edit?", "true"],
      ["Home-debt worksheet tax year", "2026"], ["Annual home-debt record reference", "Actual closing and annual statements"], ["Are all debts on the main and selected second home included?", "true"], ["Did you receive a refund or recovery of mortgage interest deducted in an earlier year?", "false"], ["Have you confirmed the complete annual home-debt worksheet after the last change?", "true"],
    ]) await change(label, value);
    expect(buildForm1098Inputs(latest, 2026, "single")[0]).toMatchObject({ lender: "Actual Purchase Lender", mortgageInterestReceived: "100.1", pointsPaid: "20.2", propertyTax: "0.3" });
    await change("Actual loan type", "refinance");
    expect(latest.mortgageEntries![0]).toMatchObject({ loanType: "refinance", sourceFactsConfirmed: null });
    expect(() => buildForm1098Inputs(latest, 2026, "single")).toThrow(/refinanc/i);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

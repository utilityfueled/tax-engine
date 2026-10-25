// @vitest-environment jsdom
// Spec: spec/federal/guided-savings-bond-sources.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SavingsBondSourceDetails } from "@/components/guided-interview/savings-bond-source-details";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, validateSection } from "@/lib/guided-interview-flow";
import { completeInterestSource, startCompleteInterview } from "../../guided-interview/complete-facts";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import type { SavingsBondEducationData } from "@/lib/guided-savings-bond-facts";

it("collects joint purchase records and invalidates ownership confirmation", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: SavingsBondEducationData | undefined;
  function Harness() { const [data, setData] = useState<SavingsBondEducationData>({ redemptions: [{ sourceId: "joint", registeredOwner: "taxpayer_and_spouse" }] }); return <SavingsBondSourceDetails data={data} onChange={next => { latest = next; setData(next ?? {}); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await change("Your actual funds used to purchase this joint bond", "6000");
    expect(latest?.redemptions?.[0].incomeOwnershipCommunityProperty).toBeUndefined();
    await change("Spouse's actual funds used to purchase this joint bond", "2000");
    await change("This bond's interest previously reported by you", "100");
    await change("This bond's interest previously reported by spouse", "400");
    await change("This joint bond is community property", "false");
    await change("Income ownership has remained unchanged since issue", "true");
    await change("Purchase and prior-reporting record reference", "Original purchase records");
    await change("Joint income ownership records checked after the last edit", "true");
    await change("All bond and education sources checked after the last edit", "true");
    expect(latest?.redemptions?.[0]).toMatchObject({ incomeOwnershipTaxpayerPurchaseFunds: "6000", incomeOwnershipSpousePriorYearInterestReported: "400", incomeOwnershipSourceFactsConfirmed: true, incomeOwnershipCommunityProperty: false });
    await change("Your actual funds used to purchase this joint bond", "6000.01");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.redemptions?.[0].incomeOwnershipSourceFactsConfirmed).toBeNull();
    await change("Registered bond owner", "taxpayer");
    expect(latest?.redemptions?.[0].incomeOwnershipTaxpayerPurchaseFunds).toBeUndefined();
    expect(container.textContent).not.toContain("Your actual funds used to purchase this joint bond");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("collects actual bond and expense facts without assuming answers", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: SavingsBondEducationData | undefined;
  function Harness() { const [data, setData] = useState<SavingsBondEducationData>(); return <SavingsBondSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click("Add savings-bond education records");
    expect(latest?.redemptions).toBeUndefined(); expect(latest?.educationExpenses).toBeUndefined();
    await click("Add bond redemption");
    expect(latest?.redemptions?.[0].proceeds).toBeUndefined(); expect(latest?.redemptions?.[0].ownershipConfirmed).toBeUndefined();
    await change("Actual bond type", "paper_ee");
    await change("Registered bond owner", "taxpayer_and_spouse");
    expect(latest?.redemptions?.[0].ageTestOwner).toBeUndefined();
    await change("Actual registered owner used for the age-at-issue test", "spouse");
    expect(latest?.redemptions?.[0].ageTestOwner).toBe("spouse");
    await change("Registered bond owner", "taxpayer");
    expect(latest?.redemptions?.[0].ageTestOwner).toBeUndefined();
    await change("Total redemption proceeds (principal and interest)", "9007199254740993.03");
    await change("Bond registration satisfies the Form 8815 ownership requirements", "false");
    await click("Add bond education expense");
    await change("Education beneficiary name", "Actual Beneficiary");
    await change("Beneficiary tax ID as entered in household information", "333-44-5555");
    await change("Beneficiary's relationship to this return", "dependent");
    await change("This dependent is claimed on this return", "false");
    await change("Signed change in AGI from the pre-exclusion royalty interest deduction", "-125.01");
    await change("All bond and education sources checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change("Actual face value", "18014398509481986");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.redemptions?.[0]).toMatchObject({ proceeds: "9007199254740993.03", ownershipConfirmed: false });
    expect(latest?.educationExpenses?.[0]).toMatchObject({ beneficiaryName: "Actual Beneficiary", beneficiaryTaxId: "333-44-5555", dependentClaimed: false });
    expect(latest?.royaltyInterestAdjustment).toBe("-125.01");
    expect(latest?.priorYearInterestIncludedInCurrentStatements).toBeUndefined();
    await click("Remove bond education expense 1"); expect(latest?.educationExpenses).toEqual([]);
    await click("Remove savings-bond education records"); expect(latest).toBeUndefined();
    await click("Add savings-bond education records"); await click("Confirm no bond redemptions"); await click("Confirm no bond education expenses");
    expect(latest?.redemptions).toEqual([]); expect(latest?.educationExpenses).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("completes a new bond through visible controls and the guided bridge", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: SavingsBondEducationData | undefined;
  function Harness() { const [data, setData] = useState<SavingsBondEducationData>(); return <SavingsBondSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
  state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, interestIncome: "100", usSavingsBondInterest: "2000" }], dividendEntries: [], brokerageEntries: [] };
  try {
    await act(async () => root.render(<Harness />));
    await click("Add savings-bond education records"); await click("Add bond redemption"); await click("Add bond education expense");
    const actualAnswers: Record<string, string> = {
      "Savings-bond source tax year": "2025", "Actual bond type": "paper_ee",
      "Assigned issue date (first day of the issue month)": "2020-01-01", "Actual redemption date": "2025-06-15",
      "Registered bond owner": "taxpayer", "Registered owner's actual birth date": "1990-02-15",
      "Bond registration satisfies the Form 8815 ownership requirements": "true",
      "Total redemption proceeds (principal and interest)": "10000", "Actual face value": "16000", "This bond's interest reported in earlier years": "500",
      "Education beneficiary name": "Jordan Example", "Beneficiary tax ID as entered in household information": "111-22-3333",
      "Beneficiary's relationship to this return": "taxpayer", "Eligible institution or plan name": "Synthetic College", "Institution or plan address": "1 College Rd",
      "Actual expense type": "tuition_and_required_fees", "Expense paid tax year": "2025", "Actual expense or contribution paid": "10000",
      "This expense satisfies the Form 8815 qualification rules": "true", "Tax-free benefits paid directly to the institution for this expense": "0",
      "This expense used for an education credit": "0", "This expense used for a tax-free 529 or Coverdell distribution": "0",
      "Other tax-free educational benefits received by the beneficiary for this expense": "0", "This expense reconciles with all credits, distributions and assistance": "true",
      "Previously reported bond interest included in current Form 1099-INT Box 3": "500", "Actual American Samoa income exclusion for Form 8815 MAGI": "0",
      "Actual Puerto Rico income exclusion for Form 8815 MAGI": "0", "Signed change in AGI from the pre-exclusion royalty interest deduction": "0",
      "Current Form 1099-INT interest reconciled with actual bond reporting history": "true", "All bond and education sources checked after the last edit": "true",
    };
    for (const [label, answer] of Object.entries(actualAnswers)) await change(label, answer);
    expect(latest?.redemptions?.[0].sourceFactsComplete).toBeUndefined();
    state.sectionData.credits = { ...emptyCreditsData, ...state.sectionData.credits, savingsBondEducation: latest };
    expect(validateSection(state, "credits").status).toBe("complete");
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.savingsBondRedemptions[0].sourceFactsComplete).toBe(true);
    if (!input) throw new Error("Actual visible sources must reach calculation");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).form8815?.excludableSavingsBondInterest.toFixed()).toBe("1500");
    await change("Actual face value", "16002");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    state.sectionData.credits = { ...state.sectionData.credits, savingsBondEducation: latest };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(latest?.redemptions?.[0].faceValue).toBe("16002");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

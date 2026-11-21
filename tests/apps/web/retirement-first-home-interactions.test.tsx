// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionRetirementIncome } from "@/components/guided-interview/section-retirement-income";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyRetirementEntry, getGuidedFlowStorageKey, loadGuidedFlowState, saveGuidedFlowState, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview } from "../../guided-interview/complete-facts";
import { guidedFirstHomeBirthDate, guidedFirstHomeRetirement, guidedFirstHomeWorksheet } from "../../fixtures/guided-first-home";

function draft(entries: RetirementEntryData[]) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.sectionData["personal-info"]!.dateOfBirth = guidedFirstHomeBirthDate;
  state.sectionData["income-retirement"] = { entries };
  return state;
}

const firstHomeEntry = { ...guidedFirstHomeRetirement, code1IraFirstHomeSource: guidedFirstHomeWorksheet };

// Spec: spec/federal/form-5329-first-home-guided.yaml, 09-guided-source.
it("collects and restores the actual first-home worksheet with no missing or inferred facts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  let entries: RetirementEntryData[] = [guidedFirstHomeRetirement];
  function Harness() {
    const [value, setValue] = useState(entries);
    return <SectionRetirementIncome entries={value} filingStatus="single" taxYear={2025}
      primaryDateOfBirth={guidedFirstHomeBirthDate} onEntriesChange={next => { entries = next; setValue(next); }} />;
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find(element => element.textContent === label);
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    expect(element, label).toBeDefined();
    const prototype = element!.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element!.dispatchEvent(new Event(element!.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }

  const key = "guided-first-home-regression";
  const confirm = "Have you checked all retirement source and taxability facts after the last edit?";
  const otherWorksheet = "Is another retirement worksheet needed beyond this first-home IRA worksheet?";
  const prior = "Prior lifetime qualifying first-home IRA distributions";
  const project = () => buildTaxInputFromGuidedData(draft(entries));
  try {
    await act(async () => root.render(<Harness />));
    expect(project()?.form5329FirstHomeSource).toBeUndefined();
    await click("Enter a first-home IRA worksheet");
    expect(project()).toBeNull();
    for (const label of [
      "Did you complete the purchase of your own main home?",
      "Were you unmarried on the binding contract date and without a main-home ownership interest during the two years ending on that date?",
      "Do your tax records establish that no former section 1034 suspension applies?",
      "Do your records confirm that none of this IRA distribution was rolled over?",
      "Did you make one purchase-price payment using funds from this specific IRA payment?",
    ]) await change(label, "true");
    await change("Binding home purchase contract date", "2025-10-20");
    await change("Actual purchase-price payment date", "2026-01-13");
    await change("Purchase price paid from this IRA distribution", "6500");
    await change(otherWorksheet, "false");
    await change(confirm, "true");
    expect(project()).toBeNull();
    await change(prior, "0");
    expect(entries[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(project()?.form5329FirstHomeSource?.priorQualifiedFirstTimeHomebuyerDistributions).toBe("0");
    await change(prior, "4000");
    await change(otherWorksheet, "true");
    await change(confirm, "true");
    expect(project()).toBeNull();
    await change(otherWorksheet, "false");
    await change(confirm, "true");
    expect(saveGuidedFlowState(sessionStorage, key, draft(entries))).toBe(true);
    const saved = loadGuidedFlowState(sessionStorage, key)!;
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved));
    expect(input.form5329FirstHomeSource).toMatchObject({ owner: "primary", distributionReceivedDate: "2025-09-15", priorQualifiedFirstTimeHomebuyerDistributions: "4000", qualifiedPayment: { date: "2026-01-13", amount: "6500" } });
    expect(input.form1099R?.[0]?.distributionDate).toBe("2025-09-15");
    const partI = calculateFederalTax(input).form5329;
    expect([partI?.line2ExceptionNumber, partI?.line2.toFixed(), partI?.line4.toFixed()]).toEqual(["09", "6000", "100"]);

    await change("Retirement account reference (last four digits or local statement label)", "revised-ira");
    expect(container.textContent).toContain("Reconcile the saved first-home IRA worksheet");
    await change(confirm, "true");
    expect(project()).toBeNull();
    await click("Remove first-home IRA worksheet");
    await change(confirm, "true");
    expect(project()).toBeNull();
    await change("Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?", "false");
    await change(confirm, "true");
    expect(project()?.form5329FirstHomeSource).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    sessionStorage.removeItem(getGuidedFlowStorageKey(key));
  }
});

// Spec: spec/federal/form-5329-first-home-guided.yaml, 09-guided-holds.
it("holds stale, mixed, late or unsupported guided first-home facts", () => {
  const project = (entry: RetirementEntryData) => buildTaxInputFromGuidedData(draft([entry]));
  expect(project(firstHomeEntry)?.form5329FirstHomeSource?.qualifiedPayment.date).toBe("2026-01-13");
  const holds = [
    { paymentDate: "2026-01-14" }, { paymentDate: "2025-10-19" }, { paymentDate: "2025-02-30" },
    { paymentAmount: "7000.01" }, { paymentAmount: "0" }, { paymentAmount: "6500.001" },
    { priorQualifiedDistributions: "" }, { priorQualifiedDistributions: "-1" },
    { ownHomePurchaseCompleted: false }, { unmarriedWithoutMainHomeInterest: false },
    { noFormerSection1034Suspension: null }, { distributionWasNotRolledOver: false }, { paidPurchasePriceFromDistribution: false },
  ];
  for (const change of holds) expect(project({ ...firstHomeEntry, code1IraFirstHomeSource: { ...guidedFirstHomeWorksheet, ...change } })).toBeNull();
  for (const change of [
    { additionalWorksheetRequired: true }, { sourceFactsConfirmed: false }, { accountHolder: "" as const },
    { trumpAccount: true }, { excessContributionEarnings: "1" }, { directRolloverConfirmed: true },
    { payerTin: "12-3456788" }, { accountReference: "another" }, { grossDistribution: "7200", taxableAmount: "7200" },
    { code1IraAgeSource: { ...guidedFirstHomeRetirement.code1IraAgeSource, distributionDate: "2025-09-16" } },
  ]) expect(project({ ...firstHomeEntry, ...change })).toBeNull();

  expect(buildTaxInputFromGuidedData(draft([firstHomeEntry, { ...guidedFirstHomeRetirement, accountReference: "second" }]))).toBeNull();
  expect(buildTaxInputFromGuidedData(draft([firstHomeEntry, emptyRetirementEntry]))?.form5329FirstHomeSource).toBeDefined();
  const nextYear = draft([firstHomeEntry]); nextYear.taxYear = 2026;
  expect(buildTaxInputFromGuidedData(nextYear)).toBeNull();
  const older = draft([firstHomeEntry]); older.sectionData["personal-info"]!.dateOfBirth = "1960-07-15";
  older.sectionData["income-retirement"]!.entries[0] = { ...firstHomeEntry, code1IraAgeSource: { ...guidedFirstHomeRetirement.code1IraAgeSource, ownerBirthDate: "1960-07-15" } };
  expect(buildTaxInputFromGuidedData(older)).toBeNull();
});

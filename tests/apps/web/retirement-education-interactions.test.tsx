// @vitest-environment jsdom
// Spec: spec/federal/form-5329-education-guided-2026.yaml, 08-guided-source.
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionRetirementIncome } from "@/components/guided-interview/section-retirement-income";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { getGuidedFlowStorageKey, loadGuidedFlowState, saveGuidedFlowState, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { guidedIraEducationOwnerFingerprint } from "@/lib/guided-retirement-education";
import { guidedFirstHomeBirthDate, guidedFirstHomeRetirement } from "../../fixtures/guided-first-home";
import { completePersonalInfo, startCompleteInterview } from "../../guided-interview/complete-facts";

it("requires a complete matched tuition worksheet and reopens it with exact source values", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const storageKey = "guided-ira-education-regression";
  let entries: RetirementEntryData[] = [{
    ...guidedFirstHomeRetirement, sourceTaxYear: "2026",
    code1IraAgeSource: { ...guidedFirstHomeRetirement.code1IraAgeSource, distributionDate: "2026-01-05" },
  }];
  function Harness() {
    const [value, setValue] = useState(entries);
    return <SectionRetirementIncome entries={value} filingStatus="single" taxYear={2026}
      primaryDateOfBirth={guidedFirstHomeBirthDate} primaryOwnerFingerprint={guidedIraEducationOwnerFingerprint(completePersonalInfo)}
      onEntriesChange={next => { entries = next; setValue(next); }} />;
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find(element => element.textContent === label);
    assert.ok(button, label);
    await act(async () => button.click());
  }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    assert.ok(element, label);
    const isSelect = element instanceof HTMLSelectElement;
    const prototype = isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      assert.ok(setter);
      setter.call(element, value);
      element.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true }));
    });
  }
  function draft() {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    const personal = state.sectionData["personal-info"];
    assert.ok(personal);
    personal.dateOfBirth = guidedFirstHomeBirthDate;
    state.sectionData["income-retirement"] = { entries };
    return state;
  }
  const confirm = "Have you checked all retirement source and taxability facts after the last edit?";
  try {
    await act(async () => root.render(<Harness />));
    await click("Enter a college tuition IRA worksheet");
    expect(container.textContent).not.toContain("Enter a first-home IRA worksheet");
    for (const [label, value] of [
      ["Eligible college name", "Example College"],
      ["Student account reference on the college bill", "Ref-13"],
      ["Student account reference on the payment receipt", "Ref-13"],
      ["Actual tuition payment date", "2026-01-02"],
      ["Required tuition charged on the college bill", "1,000.15"],
      ["Tuition actually paid on the matching receipt", "1000.15"],
      ["Do IRA records confirm an ordinary traditional IRA withdrawal with no rollover?", "true"],
      ["Did you pay this required tuition for your own enrollment at an eligible college?", "true"],
      ["Was any of this tuition refunded or reimbursed?", "false"],
      ["Did Coverdell ESA or 529 funds cover any of this tuition?", "false"],
      ["Did anyone allocate this tuition to an education credit?", "false"],
      ["Is another retirement worksheet needed beyond this college tuition IRA worksheet?", "false"],
      [confirm, "true"],
    ]) await change(label, value);
    expect(buildTaxInputFromGuidedData(draft())).toBeNull();
    await change("Tax-free assistance applied to this tuition", "0");
    expect(entries[0].sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(saveGuidedFlowState(sessionStorage, storageKey, draft())).toBe(true);
    const saved = loadGuidedFlowState(sessionStorage, storageKey);
    assert.ok(saved);
    expect(buildTaxInputFromGuidedData(saved)?.form5329?.qualifiedHigherEducationExpenseExceptionAmount).toBe("1000.15");
    await change("Student account reference on the payment receipt", "other-13");
    await change(confirm, "true");
    expect(buildTaxInputFromGuidedData(draft())).toBeNull();
    await click("Remove college tuition IRA worksheet");
    expect(entries[0].additionalWorksheetRequired).toBeNull();
    expect(container.textContent).toContain("Enter a first-home IRA worksheet");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    sessionStorage.removeItem(getGuidedFlowStorageKey(storageKey));
  }
});

// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, standard-deduction-source-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SectionPersonalInfo } from "@/components/guided-interview/section-personal-info";
import { emptyPersonalInfo, updateSectionData, type PersonalInfoData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("offers one standard-deduction answer per fact in the full personal section", async () => {
  let latest: PersonalInfoData = { ...emptyPersonalInfo, firstName: "Synthetic" };
  function Harness() {
    const [data, setData] = useState(latest);
    return <SectionPersonalInfo data={data} filingStatus="single" onDataChange={next => { latest = next; setData(next); }} />;
  }
  await act(async () => root.render(<Harness />));
  expect([...container.querySelectorAll("legend")].filter(element => element.textContent === "Standard deduction eligibility")).toHaveLength(1);
  const controls = [...container.querySelectorAll("label")].filter(element => element.querySelector(".guided-field-label")?.textContent === "Were you blind under the IRS standard-deduction definition?");
  expect(controls).toHaveLength(1);
  const select = controls[0].querySelector("select");
  if (!select) throw new Error("Missing blindness answer");
  expect(select.value).toBe("");
  await act(async () => { select.value = "false"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(latest).toMatchObject({ firstName: "Synthetic", standardDeductionFacts: { primaryBlind: false } });
  await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(latest.standardDeductionFacts?.primaryBlind).toBeNull();
});

it("records the two short-period dates and confirms them against the selected return", async () => {
  let latest = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  function Harness() {
    const [state, setState] = useState(latest);
    return <SectionPersonalInfo data={state.sectionData["personal-info"]} filingStatus="single" taxYear={state.taxYear} onDataChange={next => {
      latest = updateSectionData(state, "personal-info", next);
      setState(latest);
    }} />;
  }
  const control = (label: string) => [...container.querySelectorAll("label")]
    .find(element => element.querySelector(".guided-field-label")?.textContent === label)
    ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  async function answer(label: string, value: string) {
    const field = control(label);
    if (!field) throw new Error(`Missing field: ${label}`);
    const isSelect = field instanceof HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(field, value);
      field.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true }));
    });
  }
  const startLabel = "Short period start date";
  const endLabel = "Short period end date";
  const confirmationLabel = "Do the dates match this taxpayer’s prior return and the approval or applicable automatic approval procedure, with both accounting years using regular month ends?";
  await act(async () => root.render(<Harness />));
  expect(control(startLabel)).toBeUndefined();
  await answer("Is this a short tax year because of an accounting-period change?", "true");
  await answer(startLabel, "2025-11-01");
  expect(control(confirmationLabel)).toBeUndefined();
  await answer(endLabel, "2026-03-31");
  await answer("Source reference", "Local approval file");
  await answer(confirmationLabel, "true");
  const period = () => latest.sectionData["personal-info"]?.standardDeductionFacts?.shortAccountingPeriod;
  expect(period()).toEqual({ startsOn: "2025-11-01", endsOn: "2026-03-31", sourceReference: "Local approval file", sourceFactsConfirmed: true });
  expect(container.textContent).toContain("5 whole months");
  await answer(endLabel, "2026-02-28");
  expect(period()).toMatchObject({ endsOn: "2026-02-28", sourceFactsConfirmed: null });
  expect(control(confirmationLabel)?.value).toBe("");
});

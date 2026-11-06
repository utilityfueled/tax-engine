// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, standard-deduction-source-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SectionPersonalInfo } from "@/components/guided-interview/section-personal-info";
import { emptyPersonalInfo, type PersonalInfoData } from "@/lib/guided-interview-flow";

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

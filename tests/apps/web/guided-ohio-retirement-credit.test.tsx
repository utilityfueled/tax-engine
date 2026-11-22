// @vitest-environment jsdom
// Spec: spec/state/guided-ohio-retirement-credit.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionStateReturn } from "@/components/guided-interview/section-state-return";
import type { StateReturnData } from "@/lib/guided-interview-flow";
import { Form1099RSchema } from "@/models/inputs";
import { guidedOhioNavigationFixture } from "../../fixtures/guided-ohio-source-navigation";

it("enters confirms edits and removes Ohio retirement facts in the state section", async () => {
  const fixture = guidedOhioNavigationFixture("full_year_resident");
  const originalInput = {
    ...fixture.original,
    form1099R: [Form1099RSchema.parse({ taxYear: 2025, payer: "Synthetic pension payer", payerTin: "12-3456789",
      accountHolder: "primary", accountReference: "synthetic-retirement-account", grossDistribution: "6000", taxableAmount: "6000",
      distributionCode: "1", taxableAmountNotDetermined: false, iraSepSimple: false })],
  };
  let latest = fixture.data;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Harness({ input, taxYear = 2025 }: { input: typeof originalInput | null; taxYear?: number }) {
    const [data, setData] = useState<StateReturnData>(fixture.data);
    return <SectionStateReturn stateCode="OH" data={data} guidedPreview={null} originalInput={input} taxYear={taxYear}
      filingStatus="single" onDataChange={next => { latest = next; setData(next); }} />;
  }
  async function click(name: string) {
    const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === name);
    if (!button) throw new Error(`Missing button ${name}`);
    await act(async () => button.click());
  }
  async function change(name: string, value: string) {
    const label = [...container.querySelectorAll("label")].find(candidate => candidate.querySelector(".guided-field-label")?.textContent === name);
    const input = label?.querySelector("input, select");
    if (!input) throw new Error(`Missing field ${name}`);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    await act(async () => {
      setter?.call(input, value);
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  try {
    await act(async () => root.render(<Harness input={originalInput} />));
    await click("Add Ohio retirement payment facts");
    await change("Ohio retirement payment source reference", "Synthetic early withdrawal advice");
    await change("Was the entire distribution an early withdrawal before retirement?", "true");
    await change("I checked the payment circumstances against the current Form 1099-R and my source records", "true");
    expect(latest.ohioRetirementCredit).toMatchObject({ withdrawnBeforeRetirement: true, sourceFactsConfirmed: true });

    await change("Ohio retirement payment source reference", "Updated synthetic early withdrawal advice");
    expect(latest.ohioRetirementCredit?.sourceFactsConfirmed).toBeNull();
    await change("I checked the payment circumstances against the current Form 1099-R and my source records", "true");
    expect(latest.ohioRetirementCredit?.sourceFactsConfirmed).toBe(true);
    await act(async () => root.render(<Harness input={null} />));
    expect(container.textContent).toContain("The saved payment facts need the original Form 1099-R for this return.");
    await act(async () => root.render(<Harness input={null} taxYear={2026} />));
    expect(container.textContent).toContain("These saved payment facts apply to the 2025 Ohio return.");
    await click("Remove Ohio retirement payment facts");
    expect(latest.ohioRetirementCredit).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

// @vitest-environment jsdom
// Spec: spec/federal/marketplace-health-owners.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { HealthInsuranceSourceDetails } from "@/components/guided-interview/health-insurance-source-details";
import { healthInsuranceSourceOptions, type HealthInsuranceData } from "@/lib/guided-health-insurance-facts";
import { marketplacePolicyOptions } from "@/lib/guided-marketplace-health-facts";
import { guidedMarketplaceHealthOwnersState } from "../../fixtures/guided-marketplace-health-owners";

it("keeps both owners reachable and invalidates confirmation after source edits", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const state = guidedMarketplaceHealthOwnersState();
  const facts = state.sectionData.adjustments?.healthInsuranceFacts;
  if (!facts) throw new Error("Missing actual plans");
  const actualFacts = facts;
  let latest = actualFacts;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  function Harness() {
    const [data, setData] = useState<HealthInsuranceData>(actualFacts);
    return <HealthInsuranceSourceDetails data={data} sources={healthInsuranceSourceOptions(state.sectionData["income-self-employment"], state.sectionData["income-w2"]?.entries)} marketplacePolicies={marketplacePolicyOptions(state.sectionData.credits?.premiumTaxCredit?.policies)} onChange={next => { latest = next; setData(next); }} />;
  }
  function control(label: string) {
    const result = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!result) throw new Error(`Missing ${label}`); return result;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(control("Plan 1 policy 1: Original Marketplace policy").value).toBe("form1095A:0");
    expect(control("Plan 2 policy 1: Original Marketplace policy").value).toBe("form1095A:1");
    expect(container.textContent).toContain("Actual Spouse Corporation");
    const field = control("Plan 2 payment 1: Actual advance premium tax credit");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "0.01000000000000000001");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.plans[1]?.payments[0]?.advancePremiumTaxCredit).toBe("0.01000000000000000001");
    expect(latest.plans[0]?.payments[0]?.advancePremiumTaxCredit).toBe("0");
    expect(latest.plans[1]?.accountHolder).toBe("spouse");
    expect(latest.plans[1]?.moreThanTwoPercentShareholder).toBe(true);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

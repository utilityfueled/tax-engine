// @vitest-environment jsdom
// Spec: spec/federal/guided-marketplace-health.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HealthInsuranceSourceDetails } from "@/components/guided-interview/health-insurance-source-details";
import type { HealthInsuranceData } from "@/lib/guided-health-insurance-facts";
import { marketplacePolicyOptions } from "@/lib/guided-marketplace-health-facts";
import { guidedMarketplaceHealthFacts, guidedMarketplaceCoverageFacts } from "../../fixtures/guided-marketplace-health";

it("collects policy links and actual advances without creating eligibility", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
  let latest = guidedMarketplaceHealthFacts(); const first = latest.plans[0]!;
  first.marketplacePolicySourceIds = []; first.allCoveredPersonsInCoverageFamilyConfirmed = undefined;
  first.months = first.months.slice(0, 1); first.payments = first.payments.slice(0, 1);
  first.payments[0]!.advancePremiumTaxCredit = first.payments[0]!.personAmounts[0]!.advancePremiumTaxCredit = undefined;
  function Harness() {
    const [data, setData] = useState<HealthInsuranceData>(latest);
    return <HealthInsuranceSourceDetails data={data} sources={[{ sourceId: "scheduleC", accountHolder: "primary", kind: "self_employed", label: "Actual design business" }]} marketplacePolicies={marketplacePolicyOptions(guidedMarketplaceCoverageFacts().policies)} onChange={value => { latest = value; setData(value); }} />;
  }
  const control = (label: string) => {
    const field = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing ${label}`); return field;
  };
  async function change(label: string, value: string) {
    const field = control(label);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />));
    expect(control("Plan 1 payment 1: Actual advance premium tax credit").value).toBe("");
    expect(control("Plan 1 payment 1 share 1: Actual person advance premium tax credit").value).toBe("");
    await click("Plan 1: Add Marketplace policy link"); expect(latest.plans[0]?.marketplacePolicySourceIds).toEqual([""]);
    await change("Plan 1 policy 1: Original Marketplace policy", "form1095A:0");
    expect(latest.plans[0]?.marketplacePolicySourceIds).toEqual(["form1095A:0"]);
    expect(latest.plans[0]?.payments[0]?.advancePremiumTaxCredit).toBeUndefined();
    expect(latest.plans[0]?.allCoveredPersonsInCoverageFamilyConfirmed).toBeUndefined();
    await change("Plan 1: All covered people belong to the actual PTC coverage family", "false");
    expect(latest.plans[0]?.allCoveredPersonsInCoverageFamilyConfirmed).toBe(false);
    await change("Plan 1 payment 1: Actual advance premium tax credit", "9007199254740993.01");
    await change("Plan 1 payment 1 share 1: Actual person advance premium tax credit", "0");
    expect(latest.plans[0]?.payments[0]?.advancePremiumTaxCredit).toBe("9007199254740993.01");
    expect(latest.plans[0]?.payments[0]?.personAmounts[0]?.advancePremiumTaxCredit).toBe("0");
    await change("Plan 1 month 1: Eligible for any subsidized employer coverage in this month", "true");
    expect(control("Plan 1 month 1: Actual employer-offer PTC exception").value).toBe("");
    expect(control("Plan 1 month 1: Enrolled in employer coverage").value).toBe("");
    await change("Plan 1 month 1: Actual employer-offer PTC exception", "does_not_provide_minimum_value");
    await change("Plan 1 month 1: Enrolled in employer coverage", "false");
    await change("Plan 1 month 1: Employer-offer and enrollment source reference", "Actual employer offer reviewed");
    expect(latest.plans[0]?.months[0]).toMatchObject({ employerSubsidizedPlanEligible: true, employerOfferPtcException: "does_not_provide_minimum_value", employerCoverageEnrolled: false });
    await change("Health insurance sources checked after the last edit", "true");
    await change("Plan 1 payment 1 share 1: Actual person advance premium tax credit", "");
    expect(latest.sourceFactsConfirmed).toBeNull(); expect(latest.plans[0]?.payments[0]?.personAmounts[0]?.advancePremiumTaxCredit).toBe("");
    await change("Plan 1: All covered people belong to the actual PTC coverage family", "");
    expect(latest.plans[0]?.allCoveredPersonsInCoverageFamilyConfirmed).toBeNull();
    await click("Plan 1 policy 1: Remove link"); expect(latest.plans[0]?.marketplacePolicySourceIds).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); fetchSpy.mockRestore(); }
});

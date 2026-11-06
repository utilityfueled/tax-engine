// @vitest-environment jsdom
// Spec: spec/federal/guided-health-insurance.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HealthInsuranceSourceDetails } from "@/components/guided-interview/health-insurance-source-details";
import { buildHealthInsuranceInput, type HealthInsuranceData } from "@/lib/guided-health-insurance-facts";
import { SectionReview } from "@/components/guided-interview/section-review";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { emptyHealthInsuranceFacts, emptyHealthInsurancePlan, emptyHealthInsurancePayment } from "@/lib/guided-health-insurance-facts";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

it("collects actual health plan payments without inferred amounts or eligibility", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: HealthInsuranceData | undefined;
  function Harness() { const [data, setData] = useState<HealthInsuranceData>(); return <HealthInsuranceSourceDetails data={data} sources={[{ sourceId: "scheduleC", accountHolder: "primary", kind: "self_employed", label: "Actual design business" }, { sourceId: "formW2:0", accountHolder: "spouse", kind: "s_corporation", label: "Actual corporation" }]} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add health insurance worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.allPlansIncluded).toBeNull(); expect(latest?.plans).toEqual([]);
    await change("Health insurance source tax year", "2025"); await change("Health insurance source reference", "Actual paid policy and eligibility records"); await change("All health plans and payments are included", "true");
    await click("Add covered person");
    for (const [label, value] of [["Person label", "person-1"], ["Actual name", "Jordan Example"], ["Household role", "primary"], ["Attained age at year end", "35"]]) await change(`Person 1: ${label}`, value!);
    await click("Add health plan"); expect(latest?.plans[0]?.accountHolder).toBe(""); expect(latest?.plans[0]?.marketplaceCoverage).toBeNull();
    for (const [label, value] of [["Plan label", "plan-1"], ["Policy reference", "Actual policy 123"], ["Business or shareholder employer", "scheduleC"], ["Insurance type", "medical"], ["Policy is in the name of", "individual"], ["Plan is established under this business", "true"], ["Insurance qualification checked", "true"], ["Marketplace coverage", "false"], ["Premium tax credit or advance credit is involved", "false"], ["Clergy special rules apply", "false"]]) await change(`Plan 1: ${label}`, value!);
    expect(latest?.plans[0]?.accountHolder).toBe("primary"); expect(latest?.plans[0]?.premiumsIncludedInOwnerIncome).toBeNull();
    await click("Plan 1: Add covered person"); await change("Plan 1 person 1: Covered person", "person-1"); await change("Plan 1 person 1: Relationship to business owner", "self");
    await click("Plan 1: Add coverage month"); await change("Plan 1 month 1: Month", "1"); await change("Plan 1 month 1: Eligible for any subsidized employer coverage in this month", "false");
    await click("Plan 1: Add premium payment"); expect(latest?.plans[0]?.payments[0]?.otherPersonPaid).toBe("");
    for (const [label, value] of [["Payment source label", "paid-1"], ["Actual payment date", "2025-01-15"], ["Coverage tax year", "2025"], ["Coverage month", "1"], ["Original premium", "9007199254740993.01"], ["Owner or business paid share", "9007199254740993.01"], ["Other person's paid share", "0"]]) await change(`Plan 1 payment 1: ${label}`, value!);
    await click("Plan 1 payment 1: Add person and payer share");
    for (const [label, value] of [["Covered person", "person-1"], ["Actual payer", "owner_after_tax"], ["Paid premium share", "9007199254740993.01"], ["Excluded public-safety-officer payments", "0"], ["Other separate tax-free funding", "0"]]) await change(`Plan 1 payment 1 share 1: ${label}`, value!);
    await change("Health insurance sources checked after the last edit", "true");
    expect(buildHealthInsuranceInput(latest, "single", 2025)?.plans?.[0]?.payments?.[0]?.ownerOrBusinessPaid).toBe("9007199254740993.01");
    await change("Plan 1 payment 1: Other person's paid share", ""); expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Health insurance sources checked after the last edit", "true"); expect(() => buildHealthInsuranceInput(latest, "single", 2025)).toThrow();
    await change("Plan 1 payment 1: Other person's paid share", "0"); await change("Plan 1 month 1: Eligible for any subsidized employer coverage in this month", "true"); await change("Health insurance sources checked after the last edit", "true");
    expect(buildHealthInsuranceInput(latest, "single", 2025)?.plans?.[0]?.months?.[0]?.employerSubsidizedPlanEligible).toBe(true);
    await change("Plan 1: Business or shareholder employer", "formW2:0"); expect(latest?.plans[0]?.accountHolder).toBe("spouse"); expect(latest?.plans[0]?.businessKind).toBe("s_corporation"); expect(latest?.plans[0]?.moreThanTwoPercentShareholder).toBeNull();
    await change("Plan 1: More than two percent shareholder", "false"); await change("Plan 1: Business paid premiums are included in the owner's income", "false");
    await change("Plan 1 payment 1 share 1: Actual payer", "business_paid_or_reimbursed"); await change("Plan 1 payment 1 share 1: Public-safety-officer taxpayer", "spouse");
    await change("Plan 1 person 1: Relationship to business owner", "dependent"); await change("Plan 1 person 1: Dependent qualifies under the health insurance rules", "false");
    await click("Add long-term-care business allocation"); await change("LTC allocation 1: Covered person", "person-1"); await change("LTC allocation 1: Business or shareholder employer", "formW2:0"); await change("LTC allocation 1: Allowed premium allocation", "0"); expect(latest?.longTermCareAllocations[0]?.accountHolder).toBe("spouse");
    await click("LTC allocation 1: Remove allocation"); await click("Plan 1 payment 1 share 1: Remove share"); await click("Plan 1 payment 1: Remove payment"); await click("Plan 1 month 1: Remove month"); await click("Plan 1 person 1: Remove covered person"); await click("Plan 1: Remove plan"); await click("Person 1: Remove person");
    expect(latest?.plans).toEqual([]); expect(latest?.persons).toEqual([]); expect(latest?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("keeps unknown premium sources visible before deduction limits", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["self-employed-health-insurance"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: { ...emptyHealthInsuranceFacts, plans: [{ ...emptyHealthInsurancePlan, payments: [{ ...emptyHealthInsurancePayment }, { ...emptyHealthInsurancePayment, ownerOrBusinessPaid: "0" }] }] } };
  const markup = renderToStaticMarkup(<SectionReview state={state} onEditSection={() => {}} />);
  expect(markup).toContain("Health insurance sources need confirmation"); expect(markup).toContain("unknown owner"); expect(markup).toContain("Unknown"); expect(markup).toContain("$0"); expect(markup).toContain("business income limits");
});

it("collects business deduction allocations without implied amounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: HealthInsuranceData | undefined;
  function Harness() { const [data, setData] = useState<HealthInsuranceData>({ ...emptyHealthInsuranceFacts, sourceFactsConfirmed: true });
    return <HealthInsuranceSourceDetails data={data} sources={[{ sourceId: "scheduleC", accountHolder: "primary", kind: "self_employed", label: "Actual business" }]} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click("Add business deduction attribution");
    expect(latest?.incomeDeductions).toMatchObject({ sourceReference: "", sourceFactsConfirmed: null, allocations: [], otherForeignExclusion: "" });
    await change("Business deduction attribution source reference", "Actual income deduction worksheet");
    await change("Foreign exclusion not attributable to these businesses", "0");
    await click("Add business deduction allocation");
    expect(latest?.incomeDeductions?.allocations[0]?.retirementDeduction).toBe("");
    await change("Income allocation 1: Business or shareholder employer", "scheduleC");
    await change("Income allocation 1: Allowed retirement deduction", "123.45"); await change("Income allocation 1: Allowed foreign exclusion", "0");
    await change("Business deduction attribution checked after the last edit", "true"); await change("Health insurance sources checked after the last edit", "true");
    expect(latest?.incomeDeductions?.allocations[0]).toEqual({ businessSourceId: "scheduleC", accountHolder: "primary", retirementDeduction: "123.45", foreignExclusion: "0" });
    expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.incomeDeductions?.sourceFactsConfirmed).toBe(true);
    await change("Income allocation 1: Allowed retirement deduction", "");
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.incomeDeductions?.sourceFactsConfirmed).toBeNull();
    expect(latest?.incomeDeductions?.allocations[0]?.retirementDeduction).toBe("");
    await click("Income allocation 1: Remove allocation"); expect(latest?.incomeDeductions?.allocations).toEqual([]);
    await click("Remove business deduction attribution"); expect(latest?.incomeDeductions).toBeUndefined(); expect(latest?.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

// @vitest-environment jsdom
// Spec: spec/federal/guided-premium-tax-credit.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PremiumTaxCreditSourceDetails } from "@/components/guided-interview/premium-tax-credit-source-details";
import { emptyPremiumTaxCreditFacts, type PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";

it("collects actual policy and coverage answers without inferred amounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: PremiumTaxCreditData | undefined;
  function Harness() { const [data, setData] = useState<PremiumTaxCreditData>(); return <PremiumTaxCreditSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!control) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click("Add Marketplace coverage worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.canBeClaimedAsDependent).toBeNull(); expect(latest?.policies).toEqual([]);
    await change("Marketplace worksheet tax year", "2025"); await change("Marketplace worksheet reference", "Actual statements and eligibility worksheet");
    await change("All original Marketplace policies are included", "true"); await change("Actual tax family size", "1"); await change("Poverty guideline region", "alaska");
    await change("Required-filing dependents' modified AGI", "0"); await change("You or your joint-return spouse can be claimed as a dependent", "false");
    await change("Below-poverty exception", "marketplace_estimate"); await change("Marketplace estimated income met the eligibility range", "false");
    await change("You gave the Marketplace incorrect information knowingly or with reckless disregard for the facts", "false");
    expect(latest?.marketplaceIncorrectInformationWithDisregard).toBe(false);
    await change("Married-filing-separately exception established", "false"); await change("Household eligibility worksheet checked", "true");
    for (const label of ["Shared policy allocation is required", "Alternative marriage calculation elected", "Self-employed health insurance coordination is required", "Lawful-presence premium allocation is required"]) await change(label, "false");
    await change("QSEHRA affects this coverage", "true"); await change("Monthly coverage worksheet checked", "true");
    await click("Add original Marketplace policy"); expect(latest?.policies[0]?.taxYear).toBe("");
    for (const [label,value] of [["Statement tax year","2025"],["Marketplace name","Actual Marketplace"],["Policy number","policy-actual"]]) await change(`Policy 1: ${label}`,value!);
    await click("Policy 1: Add original month"); expect(latest?.policies[0]?.monthlyPremiums[0]?.advancePremiumTaxCredit).toBe("");
    for (const [label,value] of [["Month","1"],["Original enrollment premium","9007199254740993.01"],["Original SLCSP premium","500"],["Original advance credit","0"]]) await change(`Policy 1 month 1: ${label}`,value!);
    await click("Add household coverage month"); expect(latest?.monthlyReconciliation[0]?.coverageEligible).toBeNull();
    for (const [label,value] of [["Month","1"],["Eligible enrollment premium","500"],["Corrected household SLCSP premium","550.25"],["Reconciled advance credit","0"],["Coverage is eligible for the credit","false"],["Income-based special enrollment applies","false"],["QSEHRA is affordable","false"],["QSEHRA permitted benefit","0"]]) await change(`Coverage month 1: ${label}`,value!);
    await change("Marketplace sources checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true); expect(latest?.policies[0]?.monthlyPremiums[0]?.enrolleePremium).toBe("9007199254740993.01");
    expect(latest?.policies[0]?.statementStatus).toBeUndefined();
    await change("Policy 1: Form 1095-A boxes", "corrected");
    expect(latest?.policies[0]?.statementStatus).toBe("corrected");
    expect(latest?.sourceFactsConfirmed).toBeNull();
    await change("Policy 1: Form 1095-A boxes", "voided");
    expect(latest?.policies[0]?.statementStatus).toBe("voided");
    await change("Policy 1: Form 1095-A boxes", "");
    expect(latest?.policies[0]?.statementStatus).toBeUndefined();
    expect(latest?.monthlyReconciliation[0]).toMatchObject({ coverageEligible: false, advancePremiumTaxCredit: "0", qsehraMonthlyPermittedBenefit: "0" });
    await change("Policy 1 month 1: Original advance credit", ""); expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.policies[0]?.monthlyPremiums[0]?.advancePremiumTaxCredit).toBe("");
    await change("Coverage month 1: Coverage is eligible for the credit", ""); expect(latest?.monthlyReconciliation[0]?.coverageEligible).toBeNull();
    await click("Policy 1 month 1: Remove original month"); await click("Policy 1: Remove policy"); await click("Coverage month 1: Remove month");
    expect(latest?.policies).toEqual([]); expect(latest?.monthlyReconciliation).toEqual([]);
    await click("Remove Marketplace coverage worksheet"); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("collects zero-reported enrollment premium payment independently", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const reported = { month: "1", enrolleePremium: "0", slcsp: "0", advancePremiumTaxCredit: "0" };
  const initial: PremiumTaxCreditData = { ...emptyPremiumTaxCreditFacts, sourceTaxYear: "2026", sourceFactsConfirmed: true,
    allocationRequired: false, alternativeMarriageCalculationElected: false,
    lawfulPresenceReconciliationRequired: false, selfEmployedHealthInsuranceCoordinationRequired: false, qsehraAffected: false,
    policies: [{ taxYear: "2026", marketplace: "Synthetic Marketplace", policyNumber: "Synthetic-1", monthlyPremiums: [reported, { ...reported, month: "2", enrolleePremium: "500" }] }],
    monthlyReconciliation: [{ ...reported, enrolleePremium: "600.25", slcsp: "600", coverageEligible: true, incomeBasedSepEnrollment: false }],
  };
  let latest: PremiumTaxCreditData | undefined;
  function Harness() {
    const [data, setData] = useState<PremiumTaxCreditData | undefined>(initial);
    return <PremiumTaxCreditSourceDetails taxYear={2026} data={data} onChange={next => { latest = next; setData(next); }} />;
  }
  const control = (label: string) => [...container.querySelectorAll("label")]
    .find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector("input, select");
  const timelyLabel = "Coverage month 1: You paid the premium by the unextended return due date";
  const amountLabel = "Coverage month 1: Premium amount you paid";
  async function change(label: string, value: string) {
    const field = control(label);
    if (!field) throw new Error(`Missing ${label}`);
    const select = field instanceof HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error(`Missing value setter for ${label}`);
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(select ? "change" : "input", { bubbles: true })); });
  }
  async function enterPayment() {
    expect((control(timelyLabel) as HTMLSelectElement | undefined)?.value).toBe("");
    await change(timelyLabel, "true");
    expect((control(amountLabel) as HTMLInputElement | undefined)?.value).toBe("");
    await change(amountLabel, "600.25");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toEqual({ amountPaid: "600.25", paidByUnextendedReturnDueDate: true });
  }
  try {
    await act(async () => root.render(<Harness />));
    await enterPayment();
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.policies[0]?.monthlyPremiums[0]).toEqual(reported);

    await change("Policy 1 month 2: Original enrollment premium", "501");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment?.amountPaid).toBe("600.25");
    await change("Policy 1: Policy number", "Synthetic-Replacement");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toBeUndefined();
    await enterPayment();
    await change("Policy 1: Statement tax year", "2025");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toBeUndefined();
    await change("Policy 1: Statement tax year", "2026");
    await enterPayment();
    await change("Marketplace worksheet tax year", "2025");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toBeUndefined();
    await change("Marketplace worksheet tax year", "2026");
    await enterPayment();
    await change("Policy 1 month 1: Original enrollment premium", "600.25");
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toBeUndefined();
    expect(control(timelyLabel)).toBeUndefined();
    await change("Policy 1 month 1: Original enrollment premium", "0");
    await enterPayment();
    const remove = [...container.querySelectorAll("button")].find(button => button.textContent === "Policy 1 month 1: Remove original month");
    if (!remove) throw new Error("Missing matching original month control");
    await act(async () => remove.click());
    expect(latest?.monthlyReconciliation[0]?.zeroReportedPremiumPayment).toBeUndefined();
    expect(control(timelyLabel)).toBeUndefined();
    expect(latest?.monthlyReconciliation[0]).toMatchObject({ coverageEligible: true, incomeBasedSepEnrollment: false, enrolleePremium: "600.25" });
  } finally { await act(async () => root.unmount()); container.remove(); }
});

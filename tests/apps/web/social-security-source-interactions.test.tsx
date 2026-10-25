// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, social-security-source-records
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionSocialSecurity } from "@/components/guided-interview/section-social-security";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import type { SocialSecurityData } from "@/lib/guided-interview-flow";
import { completeSocialSecuritySource, completeSocialSecurityTreatment, completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";

async function render(initial: SocialSecurityData, run: (context: { latest: () => SocialSecurityData; container: HTMLDivElement; change: (label: string, value: string) => Promise<void>; click: (text: string) => Promise<void> }) => Promise<void>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let latest = initial;
  function Harness() { const [data, setData] = useState(initial); return <SectionSocialSecurity data={data} onDataChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  async function click(text: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === text)!.click()); }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, container, change, click }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
const confirm = "Have you checked current-year benefit treatment and exclusion facts after the last edit?";
const confirmSource = "Have you checked this benefit source after the last edit?";

it("keeps legacy benefit values unconfirmed and collects actual source facts including a zero withholding", async () => {
  await render({ netBenefits: "1000.10", federalWithheld: "" }, async ({ latest, container, change, click }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security"], lifeEvents: [], stateCode: null });
    const input = () => { state.sectionData["income-social-security"] = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull();
    expect(latest().entries).toBeUndefined();
    for (const [label, value] of [
      ["Actual benefit statement type", "ssa-1099"], ["Benefit statement tax year", "2025"], ["Benefit statement reference (local label or last four account digits)", "actual-ssa"],
      ["Legal beneficiary name shown on the statement", "Jordan Example"], ["Last four digits of the beneficiary taxpayer ID", "3333"], ["Whose legal benefits are reported?", "primary"],
      ["Gross benefits paid (Box 3)", "1000.30"], ["Benefits repaid (Box 4)", "0.20"], ["Federal withholding (SSA-1099 Box 6)", "0"], ["Does this statement include benefits paid for earlier tax years?", "false"], [confirmSource, "true"],
      ["Do ordinary U.S. citizen or resident benefit rules apply to these taxpayers?", "true"], ["Actual Puerto Rico income excluded for the benefit worksheet", "0"], ["Actual American Samoa income excluded for the benefit worksheet", "0"], [confirm, "true"],
    ]) await change(label, value);
    expect(input()?.formSSA1099?.[0]).toEqual({ recipient: "Jordan Example", netBenefits: "1000.10", federalWithheld: "0" });
    await change("Federal withholding (SSA-1099 Box 6)", "");
    expect(latest().sourceFactsConfirmed).toBeNull(); expect(latest().entries?.[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirmSource, "true"); await change(confirm, "true"); expect(input()).toBeNull();
    await click("Add benefit statement");
    expect(latest().entries?.[1]?.beneficiaryRole).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove benefit statement 2"]')!.click());
    expect(latest().entries).toHaveLength(1);
    await change("Gross benefits paid (Box 3)", "0"); await change("Benefits repaid (Box 4)", "12.34"); await change("Signed net benefits (Box 5)", "-12.34");
    expect(latest().entries?.[0]?.netBenefits).toBe("-12.34");
    expect(input()).toBeNull();
  });
});

it("collects the actual lump-sum election history and changes the independently calculated taxable benefit", async () => {
  const initial = { ...completeSocialSecurityTreatment, netBenefits: "11000", federalWithheld: "0", entries: [{ ...completeSocialSecuritySource, benefitsPaid: "11000", netBenefits: "11000", priorYearBenefits: true, priorYearBenefitsAmount: "2000" }] };
  await render(initial, async ({ latest, change, click }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["social-security", "w2-wages"], lifeEvents: [], stateCode: null });
    state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "25500" }] };
    const input = () => { state.sectionData["income-social-security"] = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull();
    await change("Treatment of benefits paid for earlier years", "current-year"); await change(confirm, "true");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input())).socialSecurityBenefitsTaxable.toFixed()).toBe("3000");
    await change("Treatment of benefits paid for earlier years", "election");
    await change("Actual current-year total Publication 915 exclusion addbacks", "0"); await click("Add earlier-year worksheet");
    for (const [label, value] of [
      ["Actual earlier tax year", "2024"], ["Filing status on the actual earlier return", "single"], ["Net benefits originally received in the earlier year", "0"], ["Benefits paid this year that belong to this earlier year", "2000"],
      ["Actual adjusted gross income on the earlier return", "23000"], ["Actual tax-exempt interest in the earlier year", "0"], ["Actual earlier-year Publication 915 exclusion and adjustment worksheet total", "0"], ["Taxable benefits actually reported on the earlier return", "0"],
      ["Have you checked the actual earlier return and benefit allocation after the last edit?", "true"], [confirm, "true"],
    ]) await change(label, value);
    expect(calculateFederalTax(TaxYearInputSchema.parse(input())).socialSecurityBenefitsTaxable.toFixed()).toBe("2500");
    await change("Filing status on the actual earlier return", "mfs");
    await change("Did you live with your spouse at any time in that earlier year?", "false");
    expect(latest().earlierYears?.[0]?.sourceFactsConfirmed).toBeNull();
    await change("Treatment of benefits paid for earlier years", "current-year"); await change(confirm, "true");
    expect(input()).toBeNull();
    await click("Remove earlier-year worksheet"); await change(confirm, "true");
    expect(input()?.socialSecurityLumpSumElection).toBeUndefined();
  });
});

// @vitest-environment jsdom
// Spec: spec/federal/guided-hsa-timely-excess-correction.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { SectionAdjustments } from "@/components/guided-interview/section-adjustments";
import { emptyAdjustmentData, updateSectionData } from "@/lib/guided-interview-flow";
import { correctionTextFields, correctionMoneyFields, correctionBooleanFields } from "@/lib/guided-hsa-excess-correction-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { completeHsaSources, completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 11, 31, 12)); });
afterEach(() => vi.useRealTimers());
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing synthetic source"); return value; }
it("collects actual correction originals and invalidates source and owner confirmations on edits", async () => {
  const element = document.createElement("div"); document.body.append(element); const root = createRoot(element);
  let latest = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: ["hsa-contributions"], stateCode: null }); latest.taxYear = 2026;
  latest.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "85000", medicareWages: "85000", socialSecurityWages: "85000", federalWithheld: "15000" }] };
  latest.sectionData.adjustments = { ...emptyAdjustmentData, hsaAccounts: [{ ...structuredClone(completeHsaSources), contributionTaxYear: "2026", priorYearSourceTaxYear: "2025", contributionsMade: "4400" }] };
  function Harness() { const [state, setState] = useState(latest); return <SectionAdjustments data={state.sectionData.adjustments} hasSelfEmployment={false} hasStudentLoans={false} hasHsa={true} taxYear={2026} filingStatus="single" onDataChange={next => { latest = updateSectionData(state, "adjustments", next); setState(latest); }} />; }
  const account = () => required(latest.sectionData.adjustments?.hsaAccounts?.[0]); const source = () => required(account().distributions?.[0]);
  async function click(text: string) { const button = [...element.querySelectorAll("button")].find(node => node.textContent === text); if (!button) throw new Error(`Missing ${text}`); await act(async () => button.click()); }
  async function change(text: string, value: string) {
    const field = [...element.querySelectorAll("label")].find(label => label.querySelector("span")?.textContent?.endsWith(text)); const input = field?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!input) throw new Error(`Missing ${text}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await change("Any HSA distributions during this year", "true"); await change("Any returned contributions or correction relief requiring a worksheet", "true");
    await click("HSA 1: Add Form 1099-SA source"); expect(source().sourceFactsConfirmed).toBeNull(); expect(source().excessCorrection).toBeUndefined();
    for (const [label, value] of [["Actual statement tax year", "2026"], ["Actual recipient", "primary"], ["Payer name", "Synthetic trustee"], ["Payer TIN", "12-3456789"], ["Account reference", "HSA-1234"], ["Box 5 account type", "hsa"], ["Box 3 distribution code", "2"], ["Box 1 gross distribution", "625"], ["Box 2 excess-contribution earnings", "25"], ["This was a trustee-to-trustee transfer", "false"], ["Original statement reference", "Synthetic posted return"], ["Original statement recipient full SSN", "111-22-3333"]]) await change(label, value);
    const originals = { contributionReference: "Synthetic contribution original", returnReference: "Synthetic posted return", recipientFirstName: "Jordan", recipientLastName: "Example", recipientSsn: "111-22-3333", payerTin: "12-3456789", accountReference: "HSA-1234", contributionTaxYear: "2026", contributionDate: "2026-02-01", returnReceivedDate: "2026-12-15", contributionAmount: "5000", returnedPrincipal: "600", postedGross: "625", postedEarnings: "25" };
    for (const [field, label] of [...correctionTextFields, ...correctionMoneyFields]) await change(label, originals[field]);
    for (const [field, label] of correctionBooleanFields) { expect(source().excessCorrection?.[field]).toBeUndefined(); await change(label, "true"); }
    await click("HSA 1, source 1: Add dated distribution");
    for (const [label, value] of [["Actual distribution date", "2026-12-15"], ["Gross amount", "625"], ["Medical costs assigned to this distribution", "0"], ["Amount rolled into another HSA", "0"]]) await change(label, value);
    expect(source().excessCorrection).toEqual({ ...originals, ...Object.fromEntries(correctionBooleanFields.map(([field]) => [field, true])) });
    expect(source().sourceFactsConfirmed).toBeNull(); expect(account().sourceFactsConfirmed).toBeNull(); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change("Source and allocations checked after the last edit", "true"); await change("All HSA source facts checked after the last edit", "true");
    expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(latest))); expect(result.totalIncome.toString()).toBe("85025"); expect(result.form8889ByOwner?.primary?.line2.toString()).toBe("4400");
    await change("Posted attributable earnings received, including known zero", ""); expect(source().excessCorrection?.postedEarnings).toBe(""); expect(source().sourceFactsConfirmed).toBeNull(); expect(account().sourceFactsConfirmed).toBeNull();
    await change("Source and allocations checked after the last edit", "true"); await change("All HSA source facts checked after the last edit", "true"); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change("Posted attributable earnings received, including known zero", "25"); await change("Source and allocations checked after the last edit", "true"); await change("All HSA source facts checked after the last edit", "true"); expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    await change("Original statement reference", "A separately changed same-amount original");
    expect(source().sourceFactsConfirmed).toBeNull(); expect(account().sourceFactsConfirmed).toBeNull();
    await change("Source and allocations checked after the last edit", "true"); await change("All HSA source facts checked after the last edit", "true"); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change("Original statement reference", originals.returnReference); await change("Source and allocations checked after the last edit", "true"); await change("All HSA source facts checked after the last edit", "true"); expect(buildTaxInputFromGuidedData(latest)).not.toBeNull();
    await change("Box 3 distribution code", "1"); expect(source().excessCorrection?.contributionReference).toBe(originals.contributionReference); expect(element.textContent).toContain("Saved correction originals remain"); expect(buildTaxInputFromGuidedData(latest)).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});

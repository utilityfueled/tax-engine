/** @vitest-environment jsdom */
/** Spec: spec/federal/guided-savings-bond-reissues.yaml visible-controls. */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SavingsBondSourceDetails } from "@/components/guided-interview/savings-bond-source-details";
import { guidedSavingsBondReissueState } from "../../fixtures/guided-savings-bond-reissues.js";
import { bondReissueIdentityFields, bondReissueGroupFields, bondReissueSuccessorFields, bondReissueStatementFields } from "@/lib/guided-savings-bond-reissues";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";

it("completes actual reissue and statement records through visible controls", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const initial = guidedSavingsBondReissueState(), saved = structuredClone(initial.sectionData.credits?.savingsBondEducation?.reissueSources);
  if (!saved?.groups?.[0] || !saved.statements?.[0] || !initial.sectionData.credits?.savingsBondEducation) throw new Error("Missing fictional originals");
  delete initial.sectionData.credits.savingsBondEducation.reissueSources;
  for (const row of initial.sectionData.credits.savingsBondEducation.redemptions ?? []) delete row.reissueSourceId;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest = initial;
  function Harness() {
    const [state, setState] = useState(initial);
    return <SavingsBondSourceDetails data={state.sectionData.credits?.savingsBondEducation} onChange={savingsBondEducation => {
      latest = updateSectionData(state, "credits", { ...state.sectionData.credits, savingsBondEducation }); setState(latest);
    }} />;
  }
  const fieldset = (legend: string) => {
    const found = [...container.querySelectorAll("fieldset")].find(row => row.querySelector(":scope > legend")?.textContent === legend);
    if (!found) throw new Error(`Missing actual fieldset ${legend}`); return found;
  };
  async function change(label: string, value: string, scope: Element = container) {
    const field = [...scope.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing actual field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing browser field setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string, scope: Element = container) {
    const button = [...scope.querySelectorAll("button")].find(row => row.textContent === label);
    if (!button) throw new Error(`Missing actual button ${label}`); await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await click("Add original bond reissue history");
    expect(latest.sectionData.credits?.savingsBondEducation?.reissueSources).toEqual({});
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    await change("Reissue history return tax year", "2025");
    await change("Complete reissue history record reference", "Fictional complete record");
    for (const [owner, legend] of [["primary", "Your original owner identity"], ["spouse", "Spouse original owner identity"]] as const) {
      const original = saved[owner]; if (!original) throw new Error("Missing original owner");
      for (const field of bondReissueIdentityFields) await change(field.label, String(original[field.key as keyof typeof original]), fieldset(legend));
    }
    await click("Add original reissue group");
    const group = saved.groups[0];
    for (const field of bondReissueGroupFields) await change(field.label, String(group[field.key as keyof typeof group]), fieldset("Original reissue group 1"));
    for (const [index, original] of (group.successors ?? []).entries()) {
      await click("Add successor bond", fieldset("Original reissue group 1"));
      for (const field of bondReissueSuccessorFields) await change(field.label, String(original[field.key as keyof typeof original]), fieldset(`Successor bond ${index + 1}`));
      await change("Matching current redemption record", original.redemptionSourceId ?? "", fieldset(`Successor bond ${index + 1}`));
    }
    await click("Add original reissue interest statement");
    await change("Form 1099-INT number in investment income (first is 1)", "1");
    const statement = saved.statements[0];
    for (const field of bondReissueStatementFields) await change(field.label, String(statement[field.key as keyof typeof statement]), fieldset("Reissue interest statement 1"));
    for (const checkbox of fieldset("Redemptions included in this statement").querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) await act(async () => checkbox.click());
    await click("Add current transfer to statement");
    const groupId = latest.sectionData.credits?.savingsBondEducation?.reissueSources?.groups?.[0].sourceId;
    if (!groupId) throw new Error("Missing actual selected group");
    await change("Original reissue group for this current transfer", groupId);
    await change("Original owner recognizing this transfer interest", "primary");
    await change("Original reissue history checked after the last edit", "true");
    await change("Current Form 1099-INT interest reconciled with actual bond reporting history", "true");
    await change("All bond and education sources checked after the last edit", "true");
    const input = buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(latest)));
    expect(input).not.toBeNull(); if (!input) throw new Error("Actual source controls did not complete");
    expect(input.savingsBondRedemptions?.map(row => row.priorYearInterestReported)).toEqual([undefined, undefined]);
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect([result.form8815?.excludableSavingsBondInterest, result.totalInterest, result.agi].map(value => value?.toFixed())).toEqual(["400", "100", "80100"]);
    await change("Interest you reported before reissue", "");
    expect(latest.sectionData.credits?.savingsBondEducation).toMatchObject({ sourceFactsConfirmed: null, currentStatementReconciliationConfirmed: null, reissueSources: { sourceFactsConfirmed: null } });
    expect(buildTaxInputFromGuidedData(latest)).toBeNull();
    expect(latest.sectionData.credits?.savingsBondEducation?.reissueSources?.groups?.[0].communityProperty).toBe(false);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

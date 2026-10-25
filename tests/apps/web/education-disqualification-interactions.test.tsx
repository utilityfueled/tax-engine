// @vitest-environment jsdom
// Spec: spec/federal/form-1099-q-disqualification.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EducationDistributionDetails } from "@/components/guided-interview/education-distribution-details";
import { buildEducationDistributionInputs, type EducationDistributionData, type EducationSourceRecord } from "@/lib/guided-education-distributions";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { disqualifiedEducationSource } from "../../fixtures/education-disqualification-source.js";

it("collects actual zero expense and later-activity facts before calculating", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const { transfer: _transfer, ...source } = disqualifiedEducationSource({ prohibitedTransactionQualifiedEducationExpenses: undefined, prohibitedTransactionNoPostDisqualificationActivityConfirmed: undefined, prohibitedTransactionPostDisqualificationSourceReference: undefined });
  const initial: EducationDistributionData = { taxYear: "2026", sourceFactsConfirmed: true, allDistributionsReconciled: true,
    forms: [{ fields: { ...source, taxYear: "2026" } as EducationSourceRecord, transfer: { kind: "none" } }],
    beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "0" }], expenses: [], allocations: [], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [] };
  let latest = initial;
  function Harness() {
    const [data, setData] = useState(initial);
    return <EducationDistributionDetails data={data} onChange={next => { if (next) { latest = next; setData(next); } }} />;
  }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing field ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(() => buildEducationDistributionInputs(latest, 2026, "single")).toThrow(/actual.*qualified education expenses/i);
    await change("Beneficiary's total qualified education expenses, including eligible 529 contributions", "0");
    await change("Full-year records confirm no income, gains or losses after January 1", "true");
    await change("Source record for the full-year account activity review", "actual-zero-activity-record");
    await change("Statement facts checked against the actual source", "true");
    await change("All education sources and allocations checked after the last edit", "true");
    const input = buildEducationDistributionInputs(latest, 2026, "single");
    expect(input.form1099Q?.[0]?.prohibitedTransactionQualifiedEducationExpenses).toBe("0");
    expect(calculateForm1099Q(input.form1099Q ?? [], input.qualifiedEducationExpenses, { taxYear: 2026 }).taxableEarnings.toFixed()).toBe("300");
    await change("Beneficiary's total qualified education expenses, including eligible 529 contributions", "1");
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.forms?.[0]?.fields.sourceFactsConfirmed).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

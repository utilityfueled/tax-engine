// @vitest-environment jsdom
// Spec: spec/federal/educator-expense-sources.yaml
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EducatorSourceDetails } from "@/components/guided-interview/educator-source-details";
import { buildEducatorSources, type EducatorSourceData } from "@/lib/guided-educator-facts";
import { SectionReview } from "@/components/guided-interview/section-review";
import { startCompleteInterview } from "../../guided-interview/complete-facts";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { emptyEducatorSource, emptyEducatorExpense } from "@/lib/guided-educator-facts";

it("collects educator source facts without manufacturing zero or confirmation", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest: EducatorSourceData[] = [];
  function Harness() { const [sources, setSources] = useState<EducatorSourceData[]>([]); return <EducatorSourceDetails sources={sources} taxYear={2026} onChange={next => { latest = next; setSources(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing control ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); expect(container.textContent).toContain("$350");
    await click("Add educator worksheet"); expect(latest[0]?.accountHolder).toBe(""); expect(latest[0]?.reimbursementsNotInWages).toBe("");
    for (const [label, value] of [["Actual educator", "primary"], ["Tax year of paid expenses", "2026"], ["Actual school year (YYYY-YYYY)", "2025-2026"], ["Reimbursements outside W-2 wages for these expenses", "0"], ["Excludable savings-bond interest from Form 8815", "0"], ["Nontaxable QTP amount from the educator worksheet", "0"], ["Nontaxable Coverdell earnings", "0"]]) await change(`Educator 1: ${label}`, value);
    await click("Educator 1: Add school");
    for (const [label, value] of [["School name", "Actual school"], ["Actual role", "teacher"], ["The school provides K-12 education under state law", "true"], ["Actual nonoverlapping hours in this school year", "900"]]) await change(`Educator 1, school 1: ${label}`, value);
    await click("Educator 1: Add paid expense");
    for (const [label, value] of [["Receipt or source reference", "receipt-1"], ["Actual payment date", "2026-03-01"], ["Expense description", "Classroom materials"], ["Expense category", "classroom"], ["Actual paid cost", "9007199254740993.01"], ["Ordinary and necessary for this educator's work", "true"], ["The expense meets the stated qualifying use", "true"], ["These are supplies for health or physical education", "false"], ["This cost was deducted or used for another tax benefit", "false"]]) await change(`Educator 1, expense 1: ${label}`, value);
    await change("Educator 1: Sources checked after the last edit", "true");
    expect(buildEducatorSources(latest, "single", 2026)?.[0]?.expenses?.[0]?.amount).toBe("9007199254740993.01");
    await change("Educator 1: Reimbursements outside W-2 wages for these expenses", ""); expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    await change("Educator 1: Sources checked after the last edit", "true"); expect(() => buildEducatorSources(latest, "single", 2026)).toThrow();
    await change("Educator 1: Reimbursements outside W-2 wages for these expenses", "0");
    await change("Educator 1, school 1: The school provides K-12 education under state law", "false"); await change("Educator 1: Sources checked after the last edit", "true"); expect(buildEducatorSources(latest, "single", 2026)?.[0]?.schools?.[0]?.schoolEligible).toBe(false);
    await click("Educator 1, expense 1: Remove expense"); expect(latest[0]?.expenses).toEqual([]); expect(latest[0]?.sourceFactsConfirmed).toBeNull();
    await click("Educator 1, school 1: Remove school"); expect(latest[0]?.schools).toEqual([]);
    await click("Educator 1: Remove worksheet"); expect(latest).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("shows saved educator costs and unknown amounts separately from the deduction", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["educator-expenses"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, educatorExpenseSources: [{ ...emptyEducatorSource, expenses: [{ ...emptyEducatorExpense, amount: "0" }, { ...emptyEducatorExpense, amount: "" }] }] };
  const html = renderToStaticMarkup(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />);
  expect(html).toContain("Educator 1 unknown owner: expense 1 before qualification");
  expect(html).toContain("Educator sources need confirmation");
  expect(html).toContain("Unknown"); expect(html).toContain("$0");
});

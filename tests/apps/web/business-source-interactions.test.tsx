// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, business-source-records
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { SectionReview } from "@/components/guided-interview/section-review";
import { businessFactErrors } from "@/lib/guided-business-facts";
import { buildNecInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import type { SelfEmploymentSectionData } from "@/lib/guided-interview-flow";
import { completeBusinessSection, completeNecSource, startCompleteInterview } from "../../guided-interview/complete-facts";
import type { ReturnWorkspaceRecord, WorkspaceStructuredFactMachineValue1099NecSummary } from "@tax-engine/contracts";

let container: HTMLDivElement, root: Root, latest: SelfEmploymentSectionData;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function control(label: string) { const element = [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!element) throw new Error(`Missing ${label}`); return element; }
async function change(label: string, value: string) { const input = control(label); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
async function render(workspace: ReturnWorkspaceRecord = createWorkspaceRecord("business-source")) {
  latest = structuredClone({ ...completeBusinessSection, necEntries: [completeNecSource] });
  function Harness() { const [data, setData] = useState(latest); return <SectionSelfEmployment workspace={workspace} {...data} bankStatementAnalyses={data.bankStatementAnalyses ?? []} incomeDocumentAnalyses={data.incomeDocumentAnalyses ?? []} onSectionChange={next => { latest = next; setData(next); }} />; }
  await act(async () => root.render(<Harness />));
}
const receiptConfirmation = "Have you reconciled receipts with all source forms and excluded duplicate income from the manual total?";
const expenseConfirmation = "Have you checked every expense amount, business use and deduction qualification against the records?";

describe("actual business source input interactions", () => {
  it("copies only supplied attached-source identity and leaves missing withholding unknown", async () => {
    const source: WorkspaceStructuredFactMachineValue1099NecSummary = { entryKind: "1099-nec-summary", payer: "Attached source client", payerTin: "23-4567890", accountHolder: "primary", nonemployeeCompensation: "0", federalWithheld: "", stateTaxReporting: "single", state: "PA", stateIncome: "0", stateWithheld: "0" };
    const workspace = createWorkspaceRecord("attached-business-source");
    workspace.documents = [{ id: "source-nec", name: "source.pdf", taxYear: 2025, size: 1, uploadedAt: "2026-01-01T00:00:00Z", kind: "1099-nec", coverage: "partially-supported", label: "Actual source", notes: "Synthetic test source", matchedFixtureId: null, seededFactIds: [] }];
    workspace.structuredFacts = [{ id: "source-nec-fact", factId: "nonemployee-compensation", label: "Actual NEC", kind: "document-detected", sourceType: "upload", value: "Source amounts", confidence: "high", sourceDocumentIds: ["source-nec"], questionId: null, updatedAt: "2026-01-01T00:00:00Z", machineValue: source }];
    await render(workspace);
    expect(container.textContent).toContain("Federal withholding is unknown");
    await click("Use attached document");
    expect(latest.necEntries[1]).toMatchObject({ payerTin: "23-4567890", accountHolder: "primary", state: "PA", stateIncome: "0", stateWithheld: "0", federalWithheld: "" });
    expect(buildNecInputs(latest.necEntries)[1].federalWithheld).toBeUndefined();
    expect(latest.businessFacts?.incomeReconciled).toBeNull();
    expect(container.textContent).toContain("Already copied");
  });
  it("keeps source owner and state amounts explicit while retaining exact zero and unknown", async () => {
    await render();
    await change("Box 1 — Nonemployee compensation", "9007199254740993.01");
    expect(latest.businessFacts?.incomeReconciled).toBeNull();
    expect(buildNecInputs(latest.necEntries)[0].nonemployeeCompensation).toBe("9007199254740993.01");
    await change("Box 4 — Federal income tax withheld", ""); expect(buildNecInputs(latest.necEntries)[0].federalWithheld).toBeUndefined();
    await change("Box 4 — Federal income tax withheld", "0");
    await change("Actual 1099-NEC recipient", "spouse"); expect(businessFactErrors(latest, "mfj")).toHaveProperty("nec-0-owner");
    await change("Actual 1099-NEC recipient", "primary");
    await change("State reporting on this 1099-NEC", "single"); await change("Box 6 actual source state", "pa"); await change("Box 5 state income tax withheld", "0"); await change("Box 7 state income", "0");
    await change(receiptConfirmation, "true");
    expect(businessFactErrors(latest, "single")).toEqual({});
    expect(buildNecInputs(latest.necEntries)[0]).toMatchObject({ state: "PA", stateIncome: "0", stateWithheld: "0" });
    await click("+ Add another 1099-NEC"); expect(latest.necEntries).toHaveLength(2); await click("Remove"); expect(latest.necEntries).toHaveLength(1);
  });
  it("preserves business identity and requires source review after amount edits", async () => {
    await render();
    await change("Actual business activity", "Actual software design");
    await change("Business name, if different from your name", "Actual Design");
    await change("Six-digit principal business activity code", "541511");
    await change("Business EIN, if issued", "23-4567890");
    await change("Actual accounting method", "accrual");
    await change("Income not reported on a 1099-NEC", "0.30");
    await change("Returns and allowances", "0.10"); await change("Actual cost of goods sold from your inventory worksheet", "0.20");
    await change("Schedule C line 6 other income", "0");
    await change("Contract labor", "0"); await change("Depreciation and section 179 from the actual worksheet", "0"); await change("Legal and professional services", "0");
    await change("Qualified W-2 wages paid for the QBI limit", "0"); await change("Qualified property UBIA for the QBI limit", "0"); await change("Prior-year unallowed business losses", "0");
    await change("Is this a specified service trade or business for section 199A?", "false");
    await change(receiptConfirmation, "true"); await change(expenseConfirmation, "true");
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null }); state.sectionData["income-self-employment"] = latest;
    expect(buildTaxInputFromGuidedData(state)?.scheduleC).toMatchObject({ businessName: "Actual Design", businessCode: "541511", ein: "23-4567890", accountingMethod: "accrual", grossReceipts: "0.3", returnsAndAllowances: "0.10", costOfGoodsSold: "0.20", isSST: false });
    await change("Do all amounts in this section belong to this one business and owner?", "false"); expect(businessFactErrors(latest, "single")).toHaveProperty("singleBusinessConfirmed");
    await change("Business owner", "joint"); expect(businessFactErrors(latest, "mfj")).toHaveProperty("businessOwner");
  });
  it("separates expense source amounts from deductible tax amounts and preserves unknown eligibility", async () => {
    await render();
    for (const label of ["Advertising", "Car & truck expenses", "Insurance (business)", "Office expense", "Supplies", "Travel", "Meals", "Utilities", "Other expenses"]) await change(label, "0.10");
    expect(latest.businessFacts?.expensesReconciled).toBeNull();
    await change("Are the meal amounts eligible business meals subject to the ordinary 50% limit?", ""); expect(businessFactErrors(latest, "single")).toHaveProperty("mealsEligibilityConfirmed");
    await change("Are the meal amounts eligible business meals subject to the ordinary 50% limit?", "true");
    await change("Does the car and truck amount come from your actual deductible vehicle worksheet?", "true");
    await change("Description of other deductible business expenses", "Qualified source cost");
    await change(expenseConfirmation, "true");
    expect(businessFactErrors(latest, "single")).toEqual({});
    expect(container.textContent).toContain("Entered expense amounts before tax limits");
    expect(container.textContent).not.toContain("Net Profit");
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null }); state.sectionData["income-self-employment"] = latest;
    await act(async () => root.render(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />));
    const row = [...container.querySelectorAll(".guided-review-row")].find(item => item.querySelector(".guided-review-label")?.textContent === "Entered expenses before tax limits");
    expect(row?.querySelector(".guided-review-value")?.textContent).toBe("$0.90");
  });
});

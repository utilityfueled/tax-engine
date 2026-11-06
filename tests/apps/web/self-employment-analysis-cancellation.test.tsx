// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, business-analysis-cancellation
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { emptyNecEntry, emptyScheduleCExpenses, type SelfEmploymentSectionData, type SelfEmploymentIncomeDocumentAnalysis, type ScheduleCBankStatementAnalysis } from "@/lib/guided-interview-flow";
import { analyzeSelfEmploymentIncomeDocuments, analyzeBusinessExpenseStatements } from "@/lib/business-expense-analysis";
import { getCachedWorkspaceDocumentFile, hasCachedWorkspaceDocumentFile } from "@/lib/workspace-document-file-cache";

vi.mock("@/lib/business-expense-analysis", async original => ({ ...await original<typeof import("@/lib/business-expense-analysis")>(), analyzeSelfEmploymentIncomeDocuments: vi.fn(), analyzeBusinessExpenseStatements: vi.fn() }));
vi.mock("@/lib/workspace-document-file-cache", () => ({ getCachedWorkspaceDocumentFile: vi.fn(), hasCachedWorkspaceDocumentFile: vi.fn(async () => false) }));
let root: Root, container: HTMLDivElement, mounted: boolean;
const sampleIncome: SelfEmploymentIncomeDocumentAnalysis = { id: "income", fileName: "income.pdf", label: "Income", uploadedAt: "2026-01-01T00:00:00Z", payer: "Client", documentPeriod: "2026", summary: "Synthetic", suggestions: [] };
const sampleExpenses: ScheduleCBankStatementAnalysis = { id: "expenses", fileName: "bank.pdf", label: "Bank", uploadedAt: "2026-01-01T00:00:00Z", statementPeriod: "2026", summary: "Synthetic", suggestions: [] };
function deferred<T>() { let resolve!: (result: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function button(label: string) { const result = [...container.querySelectorAll("button")].find(el => el.textContent?.trim() === label); if (!result) throw new Error(`Missing ${label}`); return result; }
async function click(label: string) { await act(async () => button(label).click()); }
async function consent() { const input = container.querySelector<HTMLInputElement>('input[aria-label="Allow AI review of selected business documents"]'); if (!input) throw new Error("Missing consent"); await act(async () => input.click()); }
async function upload(kind: "income" | "expense") { const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[kind === "income" ? 0 : 1]; Object.defineProperty(input, "files", { configurable: true, value: [new File(["synthetic"], "source.pdf", { type: "application/pdf" })] }); await act(async () => input.dispatchEvent(new Event("change", { bubbles: true }))); }
function props(workspace = createWorkspaceRecord("one")) { return { workspace, necEntries: [emptyNecEntry], manualGrossReceipts: "", expenses: emptyScheduleCExpenses, bankStatementAnalyses: [], incomeDocumentAnalyses: [], onSectionChange: vi.fn() }; }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(false); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); mounted = true; });
afterEach(async () => { if (mounted) await act(async () => root.unmount()); container.remove(); });

describe("business analysis lifecycle", () => {
  it("requires opt-in and discards a cancelled late income response", async () => {
    const pending = deferred<SelfEmploymentIncomeDocumentAnalysis[]>(); vi.mocked(analyzeSelfEmploymentIncomeDocuments).mockReturnValue(pending.promise); const input = props();
    await act(async () => root.render(<SectionSelfEmployment {...input} />));
    expect(button("Upload paystubs or invoices").disabled).toBe(true);
    await upload("income"); expect(analyzeSelfEmploymentIncomeDocuments).not.toHaveBeenCalled();
    await consent(); await upload("income");
    const signal = vi.mocked(analyzeSelfEmploymentIncomeDocuments).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    await click("Cancel income review"); expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve([sampleIncome]));
    expect(input.onSectionChange).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Reviewed 1 income");
  });
  it("aborts expense review on return change and resets consent", async () => {
    const pending = deferred<ScheduleCBankStatementAnalysis[]>(); vi.mocked(analyzeBusinessExpenseStatements).mockReturnValue(pending.promise); const first = props();
    await act(async () => root.render(<SectionSelfEmployment {...first} />)); await consent(); await upload("expense");
    const signal = vi.mocked(analyzeBusinessExpenseStatements).mock.calls[0][1]?.signal;
    const second = props(createWorkspaceRecord("two"));
    await act(async () => root.render(<SectionSelfEmployment {...second} />));
    expect(signal?.aborted).toBe(true); expect(button("Upload bank statements").disabled).toBe(true);
    await act(async () => pending.resolve([sampleExpenses]));
    expect(first.onSectionChange).not.toHaveBeenCalled(); expect(second.onSectionChange).not.toHaveBeenCalled();
  });
  it("keeps a new expense request active after a cancelled request fails late", async () => {
    const first = deferred<ScheduleCBankStatementAnalysis[]>(), second = deferred<ScheduleCBankStatementAnalysis[]>();
    vi.mocked(analyzeBusinessExpenseStatements).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const input = props(); await act(async () => root.render(<SectionSelfEmployment {...input} />)); await consent(); await upload("expense");
    await click("Cancel expense review"); await upload("expense");
    await act(async () => first.reject(new Error("Old failure")));
    expect(container.textContent).not.toContain("Old failure"); expect(button("Cancel expense review")).toBeTruthy();
    await act(async () => second.resolve([sampleExpenses]));
    expect(input.onSectionChange).toHaveBeenCalledOnce();
    expect(input.onSectionChange.mock.calls[0][0].bankStatementAnalyses[0]).toMatchObject({ fileName: "bank.pdf" });
    expect(button("Upload bank statements").disabled).toBe(false);
  });
  it("shows a current failure and permits a deliberate retry without changing tax facts", async () => {
    vi.mocked(analyzeSelfEmploymentIncomeDocuments).mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValueOnce([sampleIncome]);
    const input = props(); await act(async () => root.render(<SectionSelfEmployment {...input} />)); await consent(); await upload("income");
    expect(container.textContent).toContain("Service unavailable"); expect(input.onSectionChange).not.toHaveBeenCalled();
    await upload("income"); expect(input.onSectionChange).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Reviewed 1 income document");
  });
  it("prevents provider dispatch after an attached-file cache read is cancelled", async () => {
    const pending = deferred<File | null>(); vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(true); vi.mocked(getCachedWorkspaceDocumentFile).mockReturnValue(pending.promise);
    const input = props(); input.workspace.documents = [{ id: "invoice", name: "invoice.pdf", label: "Invoice", size: 1, uploadedAt: "2026-01-01T00:00:00Z", kind: "unknown", coverage: "reviewed", notes: "", matchedFixtureId: null, seededFactIds: [] }];
    await act(async () => root.render(<SectionSelfEmployment {...input} />)); await consent(); await click("Review selected attached docs"); await consent();
    await act(async () => pending.resolve(new File(["synthetic"], "invoice.pdf")));
    expect(analyzeSelfEmploymentIncomeDocuments).not.toHaveBeenCalled(); expect(input.onSectionChange).not.toHaveBeenCalled();
  });
  it("keeps in-flight manual edits and aborts a later request on unmount", async () => {
    const pending = deferred<SelfEmploymentIncomeDocumentAnalysis[]>(); vi.mocked(analyzeSelfEmploymentIncomeDocuments).mockReturnValue(pending.promise);
    let latest: SelfEmploymentSectionData = { necEntries: [emptyNecEntry], manualGrossReceipts: "", expenses: emptyScheduleCExpenses };
    const source = createWorkspaceRecord("one");
    function Harness() { const [data, setData] = useState(latest); return <SectionSelfEmployment {...props(source)} {...data} manualGrossReceipts={data.manualGrossReceipts ?? ""} onSectionChange={next => { latest = next; setData(next); }} />; }
    await act(async () => root.render(<Harness />)); await consent(); await upload("income");
    const control = [...container.querySelectorAll("label")].find(el => el.textContent?.includes("Income not reported on a 1099-NEC"))?.querySelector("input"); if (!control) throw new Error("Missing receipts");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, "9007199254740993.01"); control.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => pending.resolve([sampleIncome]));
    expect(latest.manualGrossReceipts).toBe("9007199254740993.01"); expect(latest.incomeDocumentAnalyses).toHaveLength(1);
    const later = deferred<ScheduleCBankStatementAnalysis[]>(); vi.mocked(analyzeBusinessExpenseStatements).mockReturnValue(later.promise); await upload("expense");
    const signal = vi.mocked(analyzeBusinessExpenseStatements).mock.calls[0][1]?.signal;
    await act(async () => root.unmount()); mounted = false; expect(signal?.aborted).toBe(true);
    await act(async () => later.resolve([sampleExpenses])); expect(latest.bankStatementAnalyses).toEqual([]);
  });
});

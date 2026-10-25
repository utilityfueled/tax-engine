// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, sparse-document-facts
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord, WorkspaceStructuredFactMachineValue } from "@tax-engine/contracts";
import { SectionW2Income } from "@/components/guided-interview/section-w2-income";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { emptyNecEntry, emptyScheduleCExpenses, emptyW2Entry, type SelfEmploymentSectionData, type W2EntryData } from "@/lib/guided-interview-flow";
import { createWorkspaceRecord } from "@/lib/workspace-storage";

vi.mock("@/lib/workspace-document-file-cache", async (original) => ({ ...await original<typeof import("@/lib/workspace-document-file-cache")>(), hasCachedWorkspaceDocumentFile: vi.fn(async () => false) }));

let container: HTMLDivElement;
let root: Root;
function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === label);
  if (!match) throw new Error(`Missing button ${label}`);
  return match;
}
function control<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const match = [...container.querySelectorAll("label")].find((entry) => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<T>("input, select");
  if (!match) throw new Error(`Missing control ${label}`);
  return match;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
function workspace(machineValue: WorkspaceStructuredFactMachineValue): ReturnWorkspaceRecord {
  const record = createWorkspaceRecord("synthetic-source-ui");
  const isW2 = machineValue.entryKind === "w2-summary";
  record.documents = [{ id: "actual-source", name: "source.pdf", size: 1, uploadedAt: "2026-01-01T00:00:00Z", taxYear: 2025, kind: isW2 ? "w2" : "1099-nec", coverage: "partially-supported", label: "Actual source", notes: "Synthetic test source", matchedFixtureId: null, seededFactIds: [] }];
  record.structuredFacts = [{ id: "actual-source-fact", factId: isW2 ? "wages" : "nonemployee-compensation", label: "Actual source values", kind: "document-detected", value: "Synthetic", machineValue, sourceType: "upload", confidence: "high", sourceDocumentIds: ["actual-source"], questionId: null, updatedAt: "2026-01-01T00:00:00Z" }];
  return record;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe("guided source input interactions", () => {
  it("copies explicit zero W-2 boxes for confirmation while leaving an absent box unanswered", async () => {
    let latest: W2EntryData[] = [];
    const source = workspace({ entryKind: "w2-summary", employerName: "Actual Employer", employerEin: "12-3456789", wages: "0", federalWithheld: "0", socialSecurityWages: "0", medicareWages: "0", medicareWithheld: "0" });
    function Harness() {
      const [entries, setEntries] = useState([emptyW2Entry]);
      return <SectionW2Income workspace={source} entries={entries} onEntriesChange={(next) => { latest = next; setEntries(next); }} />;
    }
    await act(async () => root.render(<Harness />));
    await click(button("Review uploaded W-2 suggestions"));
    await click(button("Insert detected values"));
    expect(latest[0]).toMatchObject({ employerName: "Actual Employer", wages: "0", federalWithheld: "0", socialSecurityWages: "0", socialSecurityWithheld: "", medicareWages: "0", medicareWithheld: "0" });
    expect(latest[0].aiSuggestedFields?.federalWithheld?.status).toBe("pending-confirmation");
    expect(latest[0].aiSuggestedFields?.socialSecurityWithheld).toBeUndefined();
    const confirmAll = [...container.querySelectorAll("button")].find((entry) => /^Confirm all \d+ highlighted document-detected values$/.test(entry.textContent?.trim() ?? ""));
    if (!confirmAll) throw new Error("Missing source confirmation control");
    await click(confirmAll);
    expect(latest[0].aiSuggestedFields?.federalWithheld?.status).toBe("confirmed");
    await change(control("Box 2 — Federal income tax withheld"), "0.01");
    expect(latest[0].federalWithheld).toBe("0.01");
    expect(latest[0].aiSuggestedFields?.federalWithheld).toBeUndefined();
  });

  it("copies known zero NEC withholding and preserves business answers through edits and removal", async () => {
    let latest: SelfEmploymentSectionData = { necEntries: [emptyNecEntry], manualGrossReceipts: "", expenses: emptyScheduleCExpenses };
    const source = workspace({ entryKind: "1099-nec-summary", payer: "Actual Client", nonemployeeCompensation: "1000.10", federalWithheld: "0" });
    function Harness() {
      const [data, setData] = useState(latest);
      return <SectionSelfEmployment workspace={source} {...data} manualGrossReceipts={data.manualGrossReceipts ?? ""} bankStatementAnalyses={[]} incomeDocumentAnalyses={[]} onSectionChange={(next) => { latest = next; setData(next); }} />;
    }
    await act(async () => root.render(<Harness />));
    await click(button("Use attached document"));
    expect(latest.necEntries[0]).toMatchObject({ payerName: "Actual Client", nonemployeeCompensation: "1000.10", federalWithheld: "0" });
    await change(control("Did you materially participate in this business under the section 469 rules?"), "false");
    await change(control("Income not reported on a 1099-NEC"), "9007199254740993.01");
    expect(latest.manualGrossReceipts).toBe("9007199254740993.01");
    expect(latest.qbiMateriallyParticipated).toBe(false);
    await change(control("Did you materially participate in this business under the section 469 rules?"), "");
    expect(latest.qbiMateriallyParticipated).toBeNull();
    await change(control("Supplies"), "0.10");
    await change(control("Office expense"), "0.20");
    expect(latest.expenses).toMatchObject({ supplies: "0.10", officeExpense: "0.20" });
    await click(button("+ Add another 1099-NEC"));
    expect(latest.necEntries).toHaveLength(2);
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove 1099-NEC #2"]');
    if (!remove) throw new Error("Missing remove control");
    await click(remove);
    expect(latest.necEntries).toHaveLength(1);
    expect(latest.necEntries[0].federalWithheld).toBe("0");
  });

  it("keeps absent NEC withholding unanswered when actual compensation is zero", async () => {
    let latest: SelfEmploymentSectionData = { necEntries: [emptyNecEntry], manualGrossReceipts: "", expenses: emptyScheduleCExpenses };
    const source = workspace({ entryKind: "1099-nec-summary", payer: "Actual Client", nonemployeeCompensation: "0", federalWithheld: "" });
    function Harness() {
      const [data, setData] = useState(latest);
      return <SectionSelfEmployment workspace={source} {...data} manualGrossReceipts={data.manualGrossReceipts ?? ""} bankStatementAnalyses={[]} incomeDocumentAnalyses={[]} onSectionChange={(next) => { latest = next; setData(next); }} />;
    }
    await act(async () => root.render(<Harness />));
    await click(button("Use attached document"));
    expect(latest.necEntries[0]).toMatchObject({ nonemployeeCompensation: "0", federalWithheld: "" });
  });
});

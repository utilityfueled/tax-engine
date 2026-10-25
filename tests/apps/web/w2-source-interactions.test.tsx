// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml#w2-owner-and-source-state
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionW2Income } from "@/components/guided-interview/section-w2-income";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { emptyW2Entry } from "@/lib/guided-interview-flow";
import { w2FactErrors } from "@/lib/guided-w2-facts";
import { buildW2Inputs } from "@/lib/guided-interview-bridge";
import { getCachedWorkspaceDocumentFile, hasCachedWorkspaceDocumentFile } from "@/lib/workspace-document-file-cache";
import { detectUploadedDocumentFromFile } from "@/lib/uploaded-document-detection";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";

vi.mock("@/lib/workspace-document-file-cache", () => ({ getCachedWorkspaceDocumentFile: vi.fn(), hasCachedWorkspaceDocumentFile: vi.fn(async () => false) }));
vi.mock("@/lib/uploaded-document-detection", async original => ({ ...await original<typeof import("@/lib/uploaded-document-detection")>(), detectUploadedDocumentFromFile: vi.fn() }));
let root: Root, container: HTMLDivElement;
function control(label: string) { const result = [...container.querySelectorAll("label")].find(el => el.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!result) throw new Error(`Missing ${label}`); return result; }
async function change(label: string, value: string) { const element = control(label); await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(element, value); element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
function button(label: string | RegExp) { const result = [...container.querySelectorAll("button")].find(el => typeof label === "string" ? el.textContent?.trim() === label : label.test(el.textContent?.trim() ?? "")); if (!result) throw new Error(`Missing button ${label}`); return result; }
async function click(label: string | RegExp) { await act(async () => button(label).click()); }
async function upload(files: File[]) { const input = container.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, "files", { configurable: true, value: files }); await act(async () => input.dispatchEvent(new Event("change", { bubbles: true }))); }
function workspaceWithSource(): ReturnWorkspaceRecord {
  const workspace = createWorkspaceRecord("source");
  workspace.documents = [{ id: "source", name: "actual-wages.pdf", label: "Actual Employer W-2", notes: "Synthetic actual-source test", taxYear: 2025, kind: "w2", coverage: "supported", size: 1, uploadedAt: "2026-01-01T00:00:00Z", matchedFixtureId: null, seededFactIds: ["wages"] }];
  workspace.structuredFacts = [{ id: "wages", factId: "wages", label: "Wages", kind: "document-detected", sourceType: "upload", confidence: "high", sourceDocumentIds: ["source"], value: "Source values", updatedAt: workspace.updatedAt, questionId: null, machineValue: { entryKind: "w2-summary", employerName: "Actual Employer", employerEin: "12-3456789", accountHolder: "spouse", wages: "1000", federalWithheld: "0", socialSecurityWages: "1000", socialSecurityTips: "0", box10DependentCareBenefits: "0", socialSecurityWithheld: "62", medicareWages: "1000", medicareWithheld: "14.50", stateTaxReporting: "single", state: "NY", stateWages: "1000", stateWithheld: "0" } }];
  return workspace;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(false); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("W-2 source entry interactions", () => {
  it("keeps blank and zero distinct through every payroll field and actual state selection", async () => {
    let latest = [emptyW2Entry]; const workspace = createWorkspaceRecord("manual");
    function Harness() { const [entries, setEntries] = useState(latest); return <SectionW2Income workspace={workspace} entries={entries} onEntriesChange={next => { latest = next; setEntries(next); }} />; }
    await act(async () => root.render(<Harness />));
    for (const [label, value] of [["W-2 recipient", "primary"], ["Employer name", "Actual Employer"], ["Employer EIN (Box b)", "12-3456789"], ["Box 1 — Wages, tips, other comp", "9007199254740993.01"], ["Box 2 — Federal income tax withheld", "0"], ["Box 3 — Social Security wages", "0"], ["Box 4 — SS tax withheld", "0"], ["Box 5 — Medicare wages", "0"], ["Box 6 — Medicare tax withheld", "0"], ["Box 7 — Social Security tips", "0"], ["Box 10 — Dependent-care benefits", "0"], ["State reporting on this W-2", "single"], ["Box 15 — State", "ny"], ["Box 16 — State wages", "0"], ["Box 17 — State tax withheld", "0"]]) await change(label, value);
    expect(w2FactErrors(latest, "mfj")).toEqual({});
    expect(buildW2Inputs(latest)[0]).toMatchObject({ wages: "9007199254740993.01", accountHolder: "primary", state: "NY", stateTaxWithheld: "0" });
    await change("Box 6 — Medicare tax withheld", ""); expect(w2FactErrors(latest, "mfj")).toHaveProperty("w2-0-medicareWithheld");
    await change("Box 6 — Medicare tax withheld", "0");
    await change("Box 7 — Social Security tips", ""); expect(buildW2Inputs(latest)[0].socialSecurityTips).toBeUndefined(); expect(w2FactErrors(latest, "mfj")).toHaveProperty("w2-0-socialSecurityTips");
    await change("Box 7 — Social Security tips", "0.10"); expect(buildW2Inputs(latest)[0].socialSecurityTips).toBe("0.10");
    await change("Box 7 — Social Security tips", "0");
    await change("State reporting on this W-2", "multiple"); expect(w2FactErrors(latest, "mfj")).toHaveProperty("w2-0-stateTaxReporting");
    await change("State reporting on this W-2", "none"); expect(w2FactErrors(latest, "mfj")).toHaveProperty("w2-0-state");
    await change("Box 15 — State", ""); expect(w2FactErrors(latest, "mfj")).toEqual({});
    await click("+ Add another W-2"); expect(latest).toHaveLength(2);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label^="Remove W-2 #2"]')!.click());
    expect(latest).toHaveLength(1); expect(latest[0].wages).toBe("9007199254740993.01");
  });
  it("requires confirmation of extracted owner and source state and clears provenance on manual correction", async () => {
    let latest = [emptyW2Entry]; const workspace = workspaceWithSource();
    function Harness() { const [entries, setEntries] = useState(latest); return <SectionW2Income workspace={workspace} entries={entries} onEntriesChange={next => { latest = next; setEntries(next); }} />; }
    await act(async () => root.render(<Harness />)); await click("Review uploaded W-2 suggestions"); await click("Insert detected values");
    expect(latest[0].accountHolder).toBe("spouse"); expect(latest[0].aiSuggestedFields?.accountHolder?.status).toBe("pending-confirmation");
    expect(latest[0].aiSuggestedFields?.socialSecurityTips?.status).toBe("pending-confirmation");
    expect(latest[0].box10DependentCareBenefits).toBe("0");
    expect(latest[0].aiSuggestedFields?.box10DependentCareBenefits?.status).toBe("pending-confirmation");
    expect(latest[0].aiSuggestedFields?.state?.status).toBe("pending-confirmation"); expect(buildW2Inputs(latest)).toEqual([]);
    const ownerLabel = control("W-2 recipient").closest("label")!;
    await act(async () => ownerLabel.querySelector("button")!.click()); expect(latest[0].aiSuggestedFields?.accountHolder?.status).toBe("confirmed");
    await change("Box 15 — State", "NJ"); expect(latest[0].aiSuggestedFields?.state).toBeUndefined();
    const benefitField = control("Box 10 — Dependent-care benefits").closest("label")!;
    await act(async () => benefitField.querySelector("button")!.click());
    expect(latest[0].aiSuggestedFields?.box10DependentCareBenefits?.status).toBe("confirmed");
    await change("Box 10 — Dependent-care benefits", "9007199254740993.01");
    expect(latest[0].box10DependentCareBenefits).toBe("9007199254740993.01");
    expect(latest[0].aiSuggestedFields?.box10DependentCareBenefits).toBeUndefined();
    await change("Box 10 — Dependent-care benefits", ""); expect(w2FactErrors(latest, "mfj")).toHaveProperty("w2-0-box10DependentCareBenefits");
    await change("Box 10 — Dependent-care benefits", "0");
    await click(/^Confirm all /); await change("State reporting on this W-2", "single");
    expect(w2FactErrors(latest, "mfj")).toEqual({}); expect(buildW2Inputs(latest)[0]).toMatchObject({ accountHolder: "spouse", state: "NJ" });
    await click("Review uploaded W-2 suggestions"); await click("Hide W-2 suggestions");
    await change("W-2 recipient", "primary"); expect(latest[0].aiSuggestedFields?.accountHolder).toBeUndefined();
  });
  it("shows an upload failure and lets the user retry without publishing any tax facts", async () => {
    const onUploadDocuments = vi.fn().mockRejectedValueOnce(new Error("Local import failed")).mockResolvedValueOnce(""); const onEntriesChange = vi.fn();
    await act(async () => root.render(<SectionW2Income workspace={createWorkspaceRecord("upload")} entries={[]} onEntriesChange={onEntriesChange} onUploadDocuments={onUploadDocuments} />));
    await click("Upload W-2 PDF"); await upload([]); expect(onUploadDocuments).not.toHaveBeenCalled();
    await upload([new File(["synthetic"], "test.pdf", { type: "application/pdf" })]); expect(container.textContent).toContain("Local import failed");
    await upload([new File(["synthetic"], "test.pdf", { type: "application/pdf" })]); expect(container.textContent).toContain("1 W-2 PDF uploaded.");
    expect(onEntriesChange).not.toHaveBeenCalled(); expect(container.textContent).toContain("No W-2 values are ready yet");
  });
  it("reports missing and unparsed cached PDFs without inventing source values", async () => {
    const workspace = workspaceWithSource(); workspace.structuredFacts = [];
    vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(true); vi.mocked(getCachedWorkspaceDocumentFile).mockResolvedValueOnce(null).mockResolvedValueOnce(new File(["synthetic"], "actual-wages.pdf")); vi.mocked(detectUploadedDocumentFromFile).mockResolvedValue(null);
    const onEntriesChange = vi.fn(); await act(async () => root.render(<SectionW2Income workspace={workspace} entries={[]} onEntriesChange={onEntriesChange} />));
    await click("Try selected attached PDFs"); expect(container.textContent).toMatch(/missing|unavailable|re-upload/i); expect(detectUploadedDocumentFromFile).not.toHaveBeenCalled();
    await click("Try selected attached PDFs"); expect(container.textContent).toContain("No W-2 values were detected"); expect(onEntriesChange).not.toHaveBeenCalled();
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!; await act(async () => checkbox.click()); expect(button("Try selected attached PDFs").disabled).toBe(true); await act(async () => checkbox.click()); expect(button("Try selected attached PDFs").disabled).toBe(false);
  });
  it("discards a late local detection when the user switches returns", async () => {
    const source = workspaceWithSource(); const machineValue = source.structuredFacts[0].machineValue!; source.structuredFacts = [];
    let resolve!: (value: Awaited<ReturnType<typeof detectUploadedDocumentFromFile>>) => void;
    vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(true); vi.mocked(getCachedWorkspaceDocumentFile).mockResolvedValue(new File(["synthetic"], "source.pdf"));
    vi.mocked(detectUploadedDocumentFromFile).mockReturnValue(new Promise(yes => { resolve = yes; }));
    await act(async () => root.render(<SectionW2Income workspace={source} entries={[]} onEntriesChange={vi.fn()} />)); await click("Try selected attached PDFs");
    await act(async () => root.render(<SectionW2Income workspace={createWorkspaceRecord("second")} entries={[]} onEntriesChange={vi.fn()} />));
    await act(async () => resolve({ kind: "w2", taxYear: 2025, coverage: "supported", label: "Prior return employer", notes: "Synthetic", seededFactIds: ["wages"], detectedFacts: [{ idSuffix: "wages", factId: "wages", label: "Wages", value: "Source", confidence: "high", machineValue }] }));
    expect(button("No W-2 suggestions yet").disabled).toBe(true);
    expect(container.textContent).not.toContain("Detected W-2 values");
  });
  it("cancels a cached-file read before starting detection and permits a fresh retry", async () => {
    const source = workspaceWithSource(); source.structuredFacts = [];
    let resolve!: (value: File | null) => void;
    vi.mocked(hasCachedWorkspaceDocumentFile).mockResolvedValue(true); vi.mocked(getCachedWorkspaceDocumentFile).mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockRejectedValueOnce(new Error("Local storage unavailable"));
    await act(async () => root.render(<SectionW2Income workspace={source} entries={[]} onEntriesChange={vi.fn()} />));
    await click("Try selected attached PDFs"); await click("Cancel W-2 detection");
    await act(async () => resolve(new File(["synthetic"], "source.pdf")));
    expect(detectUploadedDocumentFromFile).not.toHaveBeenCalled(); expect(container.textContent).toContain("Local W-2 detection cancelled.");
    await click("Try selected attached PDFs"); expect(container.textContent).toContain("Local storage unavailable"); expect(button("Try selected attached PDFs").disabled).toBe(false);
  });
});

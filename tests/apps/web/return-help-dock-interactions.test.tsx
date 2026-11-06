// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { ReturnHelpDock } from "@/components/return-help-dock";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { writeWorkspaceAiOptOut } from "@/lib/workspace-ai-preferences";
import { requestTaxCalculationExplanation } from "@/lib/transient-tax-explanation-request";
import { simpleW2Fixture } from "../../fixtures/simple-w2";
import { ProviderWorkspaceRequestError, requestProviderWorkspaceHelp } from "@/lib/provider-workspace-request";

vi.mock("@/lib/provider-workspace-request", async (original) => ({
  ...await original<typeof import("@/lib/provider-workspace-request")>(),
  requestProviderWorkspaceHelp: vi.fn(),
}));

vi.mock("@/lib/transient-tax-explanation-request", () => ({ requestTaxCalculationExplanation: vi.fn() }));
const explanation = vi.mocked(requestTaxCalculationExplanation);

let container: HTMLDivElement;
let root: Root;
let workspace: ReturnWorkspaceRecord;
let props: React.ComponentProps<typeof ReturnHelpDock>;
const provider = vi.mocked(requestProviderWorkspaceHelp);

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected rendered element or provider request.");
  return value;
}
function query<T extends Element = HTMLElement>(selector: string): T { return required(container.querySelector<T>(selector)); }
function text() { return container.textContent ?? ""; }
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent === label || element.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function render(overrides: Partial<typeof props> = {}) {
  props = { ...props, ...overrides };
  await act(async () => { root.render(<ReturnHelpDock {...props} />); });
}
async function ask(question: string) {
  const input = query<HTMLInputElement>('input[type="text"]');
  await act(async () => {
    required(required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")).set).call(input, question);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { query("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function answer(answer = "Check your confirmed records.", budget?: number) {
  return {
    request: {} as Parameters<typeof provider.mockResolvedValue>[0]["request"],
    response: { requestId: "synthetic", provider: "openai-responses" as const, answer, totalDocuments: 0, pendingQuestionCount: 0, readyForRecompute: false, redactionCount: 0,
      ...(budget === undefined ? {} : { budget: { totalRemainingCents: budget } }),
    },
  } as Awaited<ReturnType<typeof requestProviderWorkspaceHelp>>;
}
function documentRecord(id: string, date: string) {
  return { id, name: `${id}.pdf`, label: `Document ${id}`, uploadedAt: date, kind: "w-2", coverage: "supported", matchedFixtureId: null, notes: [], seededFactIds: [], sizeBytes: 10 } as ReturnWorkspaceRecord["documents"][number];
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  localStorage.clear();
  provider.mockResolvedValue(answer());
  explanation.mockResolvedValue(answer());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  workspace = createWorkspaceRecord(`ui-${crypto.randomUUID()}`);
  props = { workspace, mode: "workspace", deploymentMode: "self-host" };
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

describe("return helper privacy and user interactions", () => {
  it("requires a separate confirmation before uploading complete calculation facts", async () => {
    const getTaxExplanationInput = vi.fn().mockReturnValue(simpleW2Fixture);
    await render({ getTaxExplanationInput }); await click(button("Need help?"));
    const consent = query<HTMLInputElement>('input[aria-label="Explain my confirmed calculation"]');
    expect(consent.checked).toBe(false); expect(consent.disabled).toBe(true);
    await ask("Explain AGI."); expect(getTaxExplanationInput).not.toHaveBeenCalled(); expect(explanation).not.toHaveBeenCalled();
    await click(query<HTMLInputElement>('input[type="checkbox"]'));
    await ask("Ordinary help."); expect(provider).toHaveBeenCalledOnce(); expect(getTaxExplanationInput).not.toHaveBeenCalled();
    await click(consent); await ask("Explain the entered calculation.");
    expect(getTaxExplanationInput).toHaveBeenCalledOnce();
    expect(explanation).toHaveBeenCalledWith(workspace, "Explain the entered calculation.", simpleW2Fixture, expect.objectContaining({ confirmed: true, optedOut: false, signal: expect.any(AbortSignal) }));
    expect(text()).toContain("Complete taxpayer facts are sent to this server only for this calculation");
    await render({ workspace: { ...workspace, updatedAt: "2026-10-25T13:00:00Z" } });
    expect(query<HTMLInputElement>('input[aria-label="Explain my confirmed calculation"]').checked).toBe(false);
  });

  it("keeps invalid confirmed facts local and cancels pending explanations on opt-out", async () => {
    writeWorkspaceAiOptOut(workspace.id, false);
    const getTaxExplanationInput = vi.fn().mockReturnValue(null);
    await render({ getTaxExplanationInput }); await click(button("Need help?"));
    await click(query<HTMLInputElement>('input[aria-label="Explain my confirmed calculation"]'));
    await ask("Explain the calculation.");
    expect(explanation).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
    expect(text()).toContain("Complete and confirm the taxpayer facts first.");
    getTaxExplanationInput.mockReturnValue(simpleW2Fixture);
    const waiting = deferred<Awaited<ReturnType<typeof requestTaxCalculationExplanation>>>();
    explanation.mockReturnValue(waiting.promise); await ask("Explain the corrected calculation.");
    const signal = required(required(explanation.mock.calls[0])[3].signal);
    await click(query<HTMLInputElement>('input[type="checkbox"]'));
    expect(signal.aborted).toBe(true);
    await act(async () => waiting.resolve(answer("STALE PRIVATE CALCULATION")));
    expect(text()).not.toContain("STALE PRIVATE CALCULATION");
  });
  it("starts in local-only mode and answers without external processing", async () => {
    const onOpenGuided = vi.fn();
    await render({ onOpenGuided });
    expect(container.querySelector("section")).toBeNull();
    await click(button("Need help?"));
    expect(query<HTMLInputElement>('input[type="checkbox"]').checked).toBe(true);
    await ask("   ");
    expect(provider).not.toHaveBeenCalled();
    await ask("How should I start this return?");
    expect(provider).not.toHaveBeenCalled();
    expect(text()).toContain("How should I start this return?");
    await click(button("Start guided interview"));
    expect(onOpenGuided).toHaveBeenCalledOnce();
    await click(button("Close"));
    expect(container.querySelector("section")).toBeNull();
  });

  it("uses explicit opt-in, selected documents and exact cent budget display", async () => {
    workspace.documents = [documentRecord("older", "2025-01-01"), documentRecord("newer", "2025-02-01")];
    provider.mockResolvedValue(answer("A &lt;script&gt; stays text &amp; safe.", 101));
    await render({ mode: "guided", currentSectionId: "income-w2", currentSectionLabel: "W-2 wages" });
    await click(button("Need help?"));
    expect(text()).toContain("Context: W-2 wages");
    const chips = [...container.querySelectorAll<HTMLButtonElement>(".return-help-document-chip")];
    expect(chips.map(x => x.textContent)).toEqual([expect.stringContaining("newer"), expect.stringContaining("older")]);
    await click(required(chips[1]));
    await click(query<HTMLInputElement>('input[type="checkbox"]'));
    await click(button("How do I use my W-2 here?"));
    expect(provider).toHaveBeenCalledWith(workspace, "How do I use my W-2 here?", expect.objectContaining({ selectedDocumentIds: ["newer"], workspaceStorageModeOverride: "local-browser", optedOut: false }));
    expect(text()).toContain("Remaining AI budget: $1.01.");
    expect(text()).toContain("A <script> stays text & safe.");
    expect(container.querySelector("script")).toBeNull();
    await click(button("Collapse document context"));
    expect(text()).toContain("1 document selected for AI context.");
    await click(button("Expand document context"));
    expect(container.querySelectorAll(".return-help-document-chip")).toHaveLength(2);
  });

  it("preserves an explicit document exclusion when documents are added or deleted", async () => {
    workspace.documents = [documentRecord("one", "2025-01-01"), documentRecord("two", "2025-01-02")];
    writeWorkspaceAiOptOut(workspace.id, false);
    await render();
    await click(button("Need help?"));
    await click(query<HTMLButtonElement>(".return-help-document-chip"));
    await render({ workspace: { ...workspace, documents: [documentRecord("two", "2025-01-02"), documentRecord("three", "2025-01-03")] } });
    await ask("Use only the selected document.");
    expect(provider).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ selectedDocumentIds: ["three"] }));
  });

  it.each(["cancel", "opt-out", "workspace-change", "unmount"])("aborts on %s and discards a late provider answer", async (action) => {
    writeWorkspaceAiOptOut(workspace.id, false);
    const waiting = deferred<Awaited<ReturnType<typeof requestProviderWorkspaceHelp>>>();
    provider.mockReturnValue(waiting.promise);
    await render();
    await click(button("Need help?"));
    await ask("Explain this amount.");
    const signal = required(required(required(provider.mock.calls[0])[2]).signal);
    expect(signal.aborted).toBe(false);
    if (action === "cancel") await click(button("Cancel request"));
    if (action === "opt-out") await click(query<HTMLInputElement>('input[type="checkbox"]'));
    if (action === "workspace-change") await render({ workspace: createWorkspaceRecord("other-workspace") });
    if (action === "unmount") await act(async () => { root.render(null); });
    expect(signal.aborted).toBe(true);
    await act(async () => { waiting.resolve(answer("STALE PRIVATE ANSWER")); });
    expect(text()).not.toContain("STALE PRIVATE ANSWER");
    if (action === "opt-out") {
      await ask("Use local help now.");
      expect(provider).toHaveBeenCalledOnce();
    }
  });

  it("keeps local-only processing when persisting an opt-in fails", async () => {
    await render();
    await click(button("Need help?"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await click(query<HTMLInputElement>('input[type="checkbox"]'));
    expect(query<HTMLInputElement>('input[type="checkbox"]').checked).toBe(true);
    await ask("What next?");
    expect(provider).not.toHaveBeenCalled();
  });

  it.each([
    ["auth_required", "Sign in", "/account?mode=sign-in"],
    ["paid_plan_required", "View plans", "/billing"],
    ["ai_budget_exhausted", "Open billing", "/billing"],
  ])("offers a relevant recovery action for %s", async (code, label, href) => {
    writeWorkspaceAiOptOut(workspace.id, false);
    provider.mockRejectedValue(new ProviderWorkspaceRequestError(403, { error: "synthetic", code }));
    await render({ deploymentMode: "hosted" });
    await click(button("Need help?"));
    await ask("Help with my return.");
    const link = query<HTMLAnchorElement>("a");
    expect(link.textContent).toBe(label);
    expect(link.getAttribute("href")).toBe(href);
    expect(button("Ask the AI helper").disabled).toBe(false);
    expect(required(provider.mock.calls[0])[2]).not.toHaveProperty("workspaceStorageModeOverride");
  });

  it("limits conversation context to the latest six messages", async () => {
    writeWorkspaceAiOptOut(workspace.id, false);
    await render();
    await click(button("Need help?"));
    for (let i = 1; i <= 5; i++) await ask(`Question ${i}`);
    const history = required(required(required(required(provider.mock.calls[4])[2]).assistantContext).conversation);
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: "user", text: "Question 2" });
    expect(history[5]).toEqual({ role: "assistant", text: "Check your confirmed records." });
  });

  it.each([true, false])("handles document upload completion and failure without leaving the control busy (%s)", async (succeeds) => {
    const upload = vi.fn().mockImplementation(async () => { if (!succeeds) throw new Error("Unsupported file."); return "Document added for review."; });
    await render({ onUploadDocuments: upload });
    await click(button("Need help?"));
    const input = query<HTMLInputElement>('input[type="file"]');
    const file = new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(upload).toHaveBeenCalledWith([file]);
    expect(text()).toContain(succeeds ? "Document added for review." : "Unsupported file.");
    expect(button("Upload docs").disabled).toBe(false);
    expect(input.value).toBe("");
  });
});

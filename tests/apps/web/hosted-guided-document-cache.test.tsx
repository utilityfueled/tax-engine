// @vitest-environment jsdom
// Spec: spec/federal/hosted-document-cache-owner.yaml
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { SectionW2Income } from "@/components/guided-interview/section-w2-income";
import { analyzeSelfEmploymentIncomeDocuments } from "@/lib/business-expense-analysis";
import { emptyScheduleCExpenses } from "@/lib/guided-interview-flow";
import { toHostedDocumentId } from "@/lib/hosted-document-identity";
import * as browserState from "@/lib/hosted-workspace-browser-state";
import { detectUploadedDocumentFromFile } from "@/lib/uploaded-document-detection";
import { cacheWorkspaceDocumentFiles, getCachedWorkspaceDocumentFile } from "@/lib/workspace-document-file-cache";
import { createWorkspaceRecord } from "@/lib/workspace-storage";

vi.mock("@/lib/business-expense-analysis", async (original) => ({
  ...await original<typeof import("@/lib/business-expense-analysis")>(),
  analyzeSelfEmploymentIncomeDocuments: vi.fn(async () => []),
}));
vi.mock("@/lib/uploaded-document-detection", async (original) => ({
  ...await original<typeof import("@/lib/uploaded-document-detection")>(),
  detectUploadedDocumentFromFile: vi.fn(async () => { throw new Error("Synthetic parser stop"); }),
}));
vi.mock("@/lib/workspace-document-file-cache", async (original) => {
  const cache = await original<typeof import("@/lib/workspace-document-file-cache")>();
  return { ...cache, getCachedWorkspaceDocumentFile: vi.fn(cache.getCachedWorkspaceDocumentFile) };
});

let container: HTMLDivElement;
let root: Root;

function scope(owner: string, workspaceId: string) {
  return `tax-engine.hosted-document-cache.v1:${JSON.stringify([owner, workspaceId])}`;
}

function fixture(workspaceId: string) {
  const workspace = createWorkspaceRecord(workspaceId);
  const documentId = toHostedDocumentId(workspaceId, "original-1");
  workspace.documents.push({
    id: documentId, name: "invoice.pdf", label: "Attached invoice", size: 1,
    uploadedAt: "2026-01-01T00:00:00Z", kind: "unknown", coverage: "reviewed",
    notes: "", matchedFixtureId: null, seededFactIds: [],
  });
  const firstKey = scope("owner-a", workspaceId);
  const secondKey = scope("owner-b", workspaceId);
  const firstFile = new File(["A"], "first-owner.pdf", { type: "application/pdf" });
  const secondFile = new File(["B"], "second-owner.pdf", { type: "application/pdf" });
  const historicalFile = new File(["old"], "historical.pdf", { type: "application/pdf" });
  const seed = () => Promise.all([
    cacheWorkspaceDocumentFiles(firstKey, [{ documentId, file: firstFile }]),
    cacheWorkspaceDocumentFiles(secondKey, [{ documentId, file: secondFile }]),
    cacheWorkspaceDocumentFiles(workspaceId, [{ documentId, file: historicalFile }]),
  ]);
  return { workspace, documentId, firstKey, secondKey, seed };
}

function findButton(label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
}

async function press(label: string) {
  const button = findButton(label);
  if (!button) throw new Error(`Missing ${label}`);
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("hosted guided document cache", () => {
  it("isolates W-2 originals between hosted owners while preserving explicit local review", async () => {
    const { workspace, documentId, firstKey, secondKey, seed } = fixture("w2-owner-cache");
    await seed();
    const props = { workspace, entries: [], onEntriesChange: vi.fn() };
    const render = (cacheId?: string | null, storageMode: typeof workspace.storageMode = "hosted-postgres") => act(async () => root.render(
      <SectionW2Income {...props} workspace={{ ...workspace, storageMode }} documentCacheWorkspaceId={cacheId} />,
    ));

    await render(firstKey);
    await press("Try selected attached PDFs");
    expect(getCachedWorkspaceDocumentFile).toHaveBeenLastCalledWith(firstKey, documentId);
    expect(vi.mocked(detectUploadedDocumentFromFile).mock.lastCall?.[0].name).toBe("first-owner.pdf");

    await render(null);
    expect(findButton("Try selected attached PDFs")).toBeUndefined();
    expect(container.textContent).not.toContain("Synthetic parser stop");

    await render(secondKey);
    await press("Try selected attached PDFs");
    expect(getCachedWorkspaceDocumentFile).toHaveBeenLastCalledWith(secondKey, documentId);
    expect(vi.mocked(detectUploadedDocumentFromFile).mock.lastCall?.[0].name).toBe("second-owner.pdf");

    await render();
    expect(findButton("Try selected attached PDFs")).toBeUndefined();

    await render(undefined, "local-browser");
    await press("Try selected attached PDFs");
    expect(getCachedWorkspaceDocumentFile).toHaveBeenLastCalledWith(workspace.id, documentId);
    expect(vi.mocked(detectUploadedDocumentFromFile).mock.lastCall?.[0].name).toBe("historical.pdf");
  });

  it("drops an in-flight business original when the hosted owner changes", async () => {
    const { workspace, documentId, firstKey, secondKey, seed } = fixture("business-owner-cache");
    await seed();
    let finishOriginal!: (file: File) => void;
    vi.mocked(getCachedWorkspaceDocumentFile).mockReturnValueOnce(new Promise((resolve) => { finishOriginal = resolve; }));
    const props = { workspace: { ...workspace, storageMode: "hosted-postgres" as const }, necEntries: [], manualGrossReceipts: "", expenses: emptyScheduleCExpenses,
      bankStatementAnalyses: [], incomeDocumentAnalyses: [], onSectionChange: vi.fn() };
    const render = (cacheId?: string | null, ownerScopeKey?: string | null) => act(async () => root.render(
      <SectionSelfEmployment {...props} documentCacheWorkspaceId={cacheId} documentAnalysisOwnerScopeKey={ownerScopeKey} />,
    ));
    const consent = () => container.querySelector<HTMLInputElement>('input[aria-label="Allow AI review of selected business documents"]');

    await render(firstKey, "hosted-owner:owner-a");
    await act(async () => consent()?.click());
    await press("Review selected attached docs");
    await render(secondKey, "hosted-owner:owner-b");
    await act(async () => finishOriginal(new File(["A"], "first-owner.pdf")));
    expect(analyzeSelfEmploymentIncomeDocuments).not.toHaveBeenCalled();
    expect(props.onSectionChange).not.toHaveBeenCalled();
    expect(getCachedWorkspaceDocumentFile).toHaveBeenLastCalledWith(firstKey, documentId);
    expect(consent()?.checked).toBe(false);

    await act(async () => consent()?.click());
    await press("Review selected attached docs");
    expect(getCachedWorkspaceDocumentFile).toHaveBeenLastCalledWith(secondKey, documentId);
    expect(vi.mocked(analyzeSelfEmploymentIncomeDocuments).mock.lastCall?.[0][0].name).toBe("second-owner.pdf");
    expect(vi.mocked(analyzeSelfEmploymentIncomeDocuments).mock.lastCall?.[1]?.expectedHostedOwnerScopeKey).toBe("hosted-owner:owner-b");

    await render(null);
    expect(findButton("Review selected attached docs")).toBeUndefined();
    expect(findButton("Upload paystubs or invoices")?.disabled).toBe(true);
    await render();
    expect(findButton("Review selected attached docs")).toBeUndefined();
  });

  it("keeps owner and workspace keys distinct from hosted document aliases", () => {
    const firstKey = browserState.hostedDocumentCacheId("owner:a", "ws");
    const secondKey = browserState.hostedDocumentCacheId("owner", "a:ws");
    expect(firstKey).toBe(scope("owner:a", "ws"));
    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toBe("ws");
    const documentId = toHostedDocumentId("ws", "original-1");
    expect(toHostedDocumentId(firstKey, documentId)).toBe(documentId);
    expect(toHostedDocumentId(secondKey, documentId)).toBe(documentId);
  });
});

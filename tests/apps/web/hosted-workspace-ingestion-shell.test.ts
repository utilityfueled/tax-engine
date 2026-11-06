import { seededFactDefinitions } from "@tax-engine/contracts";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { describe, expect, it, vi } from "vitest";
import { initialFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { sanitizeWorkspaceForHostedStorage } from "../../../apps/web/src/lib/hosted-privacy";
import { savePersistedWorkspace } from "../../../apps/web/src/lib/workspace-persistence";
import { reconcileWorkspaceGuidedState } from "../../../apps/web/src/lib/workspace-guided-state";
import { createWorkspaceRecord, getFutureYearSampleUploadMessage, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";

// spec: spec/federal/hosted-workspace-ingestion-shell.yaml
const wagesPrompt = "Confirm whether every W-2 is final and whether any boxes require follow-up questions.";
const withholdingPrompt = "Confirm federal and state withholding amounts from each wage statement.";
const privateText = "PRIVATE Casey Sample SSN 123-45-6789 wages98765.43";
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Expected fixture entry");
  return item;
}
function empty() {
  return createWorkspaceRecord("hosted-ingestion-42", { now: "2026-11-04T12:00:00.000Z", storageMode: "hosted-postgres" });
}
function ingested(workspace = empty()) {
  const selected = reconcileWorkspaceGuidedState(workspace, { ...initialFlowState, taxYear: 2025 });
  // Exact metadata of the retained official sample; ingestion does not consume bytes.
  return ingestFilesIntoWorkspace(selected, [{ name: "irs-w2-2025.pdf", size: 1_343_180 }]);
}
function fetchShell() {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as { workspace: ReturnWorkspaceRecord };
    return Response.json({ availability: "ready", ownerScope: { ownerId: "synthetic-owner-42", ownerLabel: null, scopeKey: "hosted-owner:synthetic-owner-42" }, workspace: payload.workspace, workspaces: [] });
  });
}

describe("actual hosted ingestion shell compatibility", () => {
  it("preserves a newly created empty hosted shell", () => {
    const workspace = empty();
    expect(sanitizeWorkspaceForHostedStorage(workspace).seededReturn.interviewQueue).toEqual([]);
    expect(workspace.returnSummary.targetTaxYear).toBeNull();
  });

  it("persists the actual sample W2 pipeline after explicit 2026 to 2025 selection", () => {
    const gated = reconcileWorkspaceGuidedState(empty(), { ...initialFlowState, taxYear: 2026 });
    expect(gated.returnSummary.targetTaxYear).toBe(2026);
    expect(gated.returnSummary.blockers.some(b => b.id === "unsupported-tax-year")).toBe(true);
    expect(getFutureYearSampleUploadMessage([{ name: "irs-w2-2026.pdf", size: 1 }])).toMatch(/can't drive a 2025 return/);
    const workspace = ingested(gated);
    expect(workspace.returnSummary.targetTaxYear).toBe(2025);
    expect(workspace.seededReturn.interviewQueue).toEqual([wagesPrompt, withholdingPrompt]);
    expect(workspace.seededReturn.nextQuestionId).toBe("wages");
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(shell.seededReturn.interviewQueue).toEqual([wagesPrompt, withholdingPrompt]);
    expect(first(shell.documents)).toMatchObject({ kind: "w2", taxYear: 2025, matchedFixtureId: "irs-w2-2025", seededFactIds: ["wages", "withholding"] });
    expect(shell.enginePreview).toBeNull();
  });

  it("sends the real ingested shell and returns the unchanged local record", async () => {
    const workspace = ingested();
    first(workspace.seededReturn.facts).answerText = privateText;
    first(workspace.seededReturn.interviewQuestions).answerText = privateText;
    workspace.seededReturn.reviewNotes.push(privateText);
    const before = JSON.stringify(workspace);
    const fetchFn = fetchShell();
    const result = await savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn });
    expect(fetchFn).toHaveBeenCalledOnce();
    const call = first(fetchFn.mock.calls);
    const body = String(call[1]?.body);
    for (const value of [privateText, "Casey Sample", "123-45-6789", "98765.43"]) expect(body).not.toContain(value);
    const sent = JSON.parse(body) as { workspace: ReturnWorkspaceRecord };
    expect(sent.workspace.seededReturn.interviewQueue).toEqual([wagesPrompt, withholdingPrompt]);
    expect(first(sent.workspace.seededReturn.facts).answerText).toBeNull();
    expect(first(sent.workspace.seededReturn.interviewQuestions).sourceDocumentIds).toEqual([]);
    expect(result.workspace).toBe(workspace);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it("accepts every fixed canonical prompt without accepting supplied private text", () => {
    const workspace = empty();
    workspace.seededReturn.interviewQueue = seededFactDefinitions.map(fact => fact.prompt);
    const before = JSON.stringify(workspace);
    expect(sanitizeWorkspaceForHostedStorage(workspace).seededReturn.interviewQueue).toEqual(seededFactDefinitions.map(fact => fact.prompt));
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it("preserves existing fact ID shell queue values exactly", () => {
    const workspace = empty();
    workspace.seededReturn.interviewQueue = seededFactDefinitions.map(fact => fact.id);
    expect(sanitizeWorkspaceForHostedStorage(workspace).seededReturn.interviewQueue).toEqual(workspace.seededReturn.interviewQueue);
  });

  it.each([privateText, `${wagesPrompt} ${privateText}`, wagesPrompt.toLowerCase(), "unknown-question-id"])("rejects private or modified queue content before fetch: %s", async value => {
    const workspace = empty();
    workspace.seededReturn.interviewQueue = [value];
    const fetchFn = fetchShell();
    await expect(savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn })).rejects.toThrow("Server configuration error: hosted persistence rejected invalid workspace shell metadata.");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(workspace.seededReturn.interviewQueue).toEqual([value]);
  });

  it.each(["fact", "question", "next"] as const)("rejects an unknown fact identity in %s", position => {
    const workspace = ingested();
    workspace.seededReturn.interviewQueue = [];
    if (position === "fact") Object.assign(first(workspace.seededReturn.facts), { id: "unknown-private-fact" });
    if (position === "question") Object.assign(first(workspace.seededReturn.interviewQuestions), { factId: "unknown-private-fact" });
    if (position === "next") Object.assign(workspace.seededReturn, { nextQuestionId: "unknown-private-fact" });
    expect(() => sanitizeWorkspaceForHostedStorage(workspace)).toThrow(/invalid workspace shell metadata/);
  });

  it("preserves unknown source year and absent detected facts without guessing", () => {
    const workspace = ingestFilesIntoWorkspace(empty(), [{ name: "unclassified-upload.pdf", size: 7 }]);
    expect(first(workspace.documents).taxYear).toBeNull();
    expect(workspace.seededReturn.facts).toEqual([]);
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    expect(first(shell.documents).taxYear).toBeNull();
    expect(shell.seededReturn.facts).toEqual([]);
    expect(shell.seededReturn.interviewQueue).toEqual([]);
  });

  it("retains queue bounds and opaque document ID restrictions", () => {
    const excessive = empty();
    excessive.seededReturn.interviewQueue = Array.from({ length: 101 }, () => "wages");
    expect(() => sanitizeWorkspaceForHostedStorage(excessive)).toThrow(/invalid workspace shell metadata/);
    const workspace = ingested();
    workspace.seededReturn.interviewQueue = [];
    first(workspace.documents).id = "Casey private W2.pdf";
    expect(() => sanitizeWorkspaceForHostedStorage(workspace)).toThrow(/invalid workspace shell metadata/);
  });
});

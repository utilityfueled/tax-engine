import { describe, expect, it, vi } from "vitest";
import type { WorkspaceAuditEventKind } from "@tax-engine/contracts";
import { createWorkspaceRecord } from "../../../apps/web/src/lib/workspace-storage";
import { isWorkspaceShellPersistable, sanitizeWorkspaceForHostedStorage } from "../../../apps/web/src/lib/hosted-privacy";
import { savePersistedWorkspace } from "../../../apps/web/src/lib/workspace-persistence";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

function privateWorkspace() {
  const workspace = createWorkspaceRecord("opaque-workspace-42", { now: "2026-10-24T12:00:00.000Z" });
  workspace.documents = [{ id: "doc-42", taxYear: null, name: "Casey Sample private W2.pdf", size: 100,
    uploadedAt: workspace.createdAt, blobStorageKey: "private/raw/Casey-Sample", kind: "w2", coverage: "supported",
    label: "Casey Sample", notes: "private source data", matchedFixtureId: null, seededFactIds: ["wages"],
    detectedFacts: [{ idSuffix: "wages", factId: "wages", label: "Casey Sample", value: "98765.43", confidence: "high" }] }];
  workspace.seededReturn.facts = [{ id: "wages", label: "Casey Sample", status: "answered", answeredAt: workspace.updatedAt,
    answerText: "SSN 123-45-6789 and wages 98765.43", sourceDocumentIds: ["doc-42"] }];
  workspace.seededReturn.interviewQuestions = [{ id: "wages", factId: "wages", prompt: "Confirm Casey Sample's wages",
    status: "answered", answeredAt: workspace.updatedAt, answerText: "98765.43", sourceDocumentIds: ["doc-42"] }];
  workspace.seededReturn.reviewNotes = ["Casey Sample has private facts"];
  required(workspace.checklist[0]).label = "Casey Sample";
  required(workspace.auditTrail[0]).message = "Casey Sample created this return";
  required(workspace.auditTrail[0]).answerText = "98765.43";
  required(workspace.auditTrail[0]).documentIds = ["doc-42"];
  return workspace;
}

describe("hosted workspace shell privacy", () => {
  it("drops private filenames, free text and unknown properties without changing the local record", () => {
    const workspace = privateWorkspace();
    Object.assign(workspace, { taxpayerName: "Casey Sample", futurePrivateField: "98765.43" });
    Object.assign(required(workspace.documents[0]), { rawText: "Casey Sample 98765.43" });
    const before = JSON.stringify(workspace);
    const shell = sanitizeWorkspaceForHostedStorage(workspace);
    const serialized = JSON.stringify(shell);
    for (const privateValue of ["Casey Sample", "98765.43", "123-45-6789", "private/raw", "futurePrivateField", "rawText"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(shell.documents[0]).toMatchObject({ id: "doc-42", taxYear: null, name: "Document 1", label: "Form W-2", blobStorageKey: null, detectedFacts: null });
    expect(shell.seededReturn.facts[0]).toMatchObject({ status: "answered", answeredAt: workspace.updatedAt, answerText: null, sourceDocumentIds: [] });
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it.each<WorkspaceAuditEventKind>(["workspace-created", "documents-ingested", "document-removed", "document-year-confirmed", "workspace-cleared", "interview-answered", "interview-reopened"])(
    "keeps only a fixed event message for %s", (kind) => {
      const workspace = privateWorkspace();
      required(workspace.auditTrail[0]).kind = kind;
      const event = required(sanitizeWorkspaceForHostedStorage(workspace).auditTrail[0]);
      expect(event.message).not.toContain("Casey");
      expect(event.message.length).toBeGreaterThan(0);
      expect(event.documentIds).toEqual([]);
      expect(event.answerText).toBeNull();
    },
  );

  it.each(["name-instead-of-size", -1, Infinity, NaN])("rejects invalid typed metadata before persistence: %s", (size) => {
    const workspace = privateWorkspace();
    Object.assign(required(workspace.documents[0]), { size });
    expect(isWorkspaceShellPersistable(workspace)).toBe(false);
    expect(() => sanitizeWorkspaceForHostedStorage(workspace)).toThrow(/workspace shell/i);
  });

  it("rejects identifiers smuggled into opaque metadata", () => {
    const workspace = privateWorkspace();
    required(workspace.documents[0]).id = "123-45-6789";
    expect(isWorkspaceShellPersistable(workspace)).toBe(false);
  });

  it.each(["unknown", "w2"] as const)("preserves explicit unknown or missing years without inferring one for %s", (kind) => {
    const workspace = privateWorkspace();
    required(workspace.documents[0]).kind = kind;
    delete required(workspace.documents[0]).taxYear;
    expect(sanitizeWorkspaceForHostedStorage(workspace).documents[0]).not.toHaveProperty("taxYear");
    required(workspace.documents[0]).taxYear = 2026;
    expect(sanitizeWorkspaceForHostedStorage(workspace).documents[0]?.taxYear).toBe(2026);
    expect(isWorkspaceShellPersistable(workspace)).toBe(true);
  });

  it("rejects malformed metadata without echoing values or starting a network request", async () => {
    const workspace = privateWorkspace();
    Object.assign(workspace.returnSummary, { totalFactCount: "Casey Sample" });
    const fetchFn = vi.fn();
    await expect(savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn })).rejects.toThrow("hosted persistence rejected invalid workspace shell metadata");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends only the shell to hosted storage and returns the full local record", async () => {
    const workspace = privateWorkspace();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const serialized = String(init?.body);
      expect(serialized).not.toContain("Casey Sample");
      expect(serialized).not.toContain("98765.43");
      expect(serialized).not.toContain("123-45-6789");
      return Response.json({ availability: "ready", ownerScope: { ownerId: "owner-42", ownerLabel: null, scopeKey: "hosted-owner:owner-42" }, workspace: JSON.parse(serialized).workspace, workspaces: [] });
    });
    const result = await savePersistedWorkspace({ deploymentMode: "hosted", workspace, fetchFn });
    expect(result.workspace).toBe(workspace);
    expect(result.workspace.seededReturn.facts[0]?.answerText).toContain("98765.43");
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

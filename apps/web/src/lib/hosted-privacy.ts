import type {
  ReturnWorkspaceRecord,
  WorkspaceAuditEventRecord,
  WorkspaceChecklistItem,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary,
  WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";

function sanitizeWorkspaceDocument(document: WorkspaceDocumentRecord): WorkspaceDocumentRecord {
  return {
    ...document,
    blobStorageKey: null,
    notes: document.coverage === "supported"
      ? "Processed transiently for AI assistance. Raw files are not stored on the server."
      : "Stored as metadata only. Raw files are not stored on the server.",
    detectedFacts: null
  };
}

function sanitizeAuditEventMessage(kind: WorkspaceAuditEventRecord["kind"]) {
  switch (kind) {
    case "workspace-created":
      return "Workspace created.";
    case "documents-ingested":
      return "Documents processed for this device session.";
    case "document-removed":
      return "Document removed from the local session.";
    case "document-year-confirmed":
      return "Document tax year updated.";
    case "workspace-cleared":
      return "Workspace cleared.";
    case "interview-answered":
      return "Interview progress updated on this device.";
    case "interview-reopened":
      return "Interview question reopened.";
  }
}

function sanitizeAuditTrail(auditTrail: ReturnWorkspaceRecord["auditTrail"]): ReturnWorkspaceRecord["auditTrail"] {
  return auditTrail.map((event) => ({
    ...event,
    message: sanitizeAuditEventMessage(event.kind),
    documentIds: [],
    answerText: null
  }));
}

function sanitizeChecklist(checklist: WorkspaceChecklistItem[]): WorkspaceChecklistItem[] {
  return checklist.map((item) => ({ ...item }));
}

function sanitizeReturnSummary(summary: WorkspaceReturnSummary): WorkspaceReturnSummary {
  return {
    ...summary,
    blockers: [],
    items: []
  };
}

function sanitizeStructuredFacts(_facts: WorkspaceStructuredFactRecord[]): WorkspaceStructuredFactRecord[] {
  return [];
}

export function sanitizeWorkspaceForHostedStorage(
  workspace: ReturnWorkspaceRecord
): ReturnWorkspaceRecord {
  const sanitized: ReturnWorkspaceRecord = {
    ...workspace,
    storageMode: "hosted-postgres",
    documents: workspace.documents.map((document) => sanitizeWorkspaceDocument(document)),
    seededReturn: {
      ...workspace.seededReturn,
      facts: workspace.seededReturn.facts.map((fact) => ({
        ...fact,
        answeredAt: fact.answeredAt,
        answerText: null,
        sourceDocumentIds: []
      })),
      interviewQuestions: workspace.seededReturn.interviewQuestions.map((question) => ({
        ...question,
        answeredAt: question.answeredAt,
        answerText: null,
        sourceDocumentIds: []
      })),
      reviewNotes: []
    },
    structuredFacts: sanitizeStructuredFacts(workspace.structuredFacts),
    returnSummary: sanitizeReturnSummary(workspace.returnSummary),
    enginePreview: null,
    checklist: sanitizeChecklist(workspace.checklist),
    auditTrail: sanitizeAuditTrail(workspace.auditTrail)
  };

  if (containsUnsafeDirectIdentifier(sanitized)) {
    throw new Error(
      "Server configuration error: hosted persistence rejected a workspace shell containing direct identifiers."
    );
  }

  return sanitized;
}

export function isWorkspaceShellPersistable(workspace: ReturnWorkspaceRecord) {
  try {
    sanitizeWorkspaceForHostedStorage(workspace);
    return true;
  } catch {
    return false;
  }
}

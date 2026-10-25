import {
  defaultChecklist,
  officialSampleDocumentFixtures,
  seededFactDefinitions,
  supportMatrix,
  type ReturnWorkspaceRecord,
  type WorkspaceAuditEventRecord
} from "@tax-engine/contracts";
import { z } from "zod";
import { containsUnsafeDirectIdentifier } from "./provider-request-privacy";

const opaqueId = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.:-]+$/);
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const year = z.number().int().min(1900).max(2200);
const factId = z.enum(seededFactDefinitions.map((fact) => fact.id));
const answerMetadata = { status: z.enum(["pending", "answered"]), answeredAt: timestamp.nullable() };

// Strip unknown keys at every level. A denylist cannot protect new private
// fields added to the local workspace by later versions or an untrusted client.
const shellMetadataSchema = z.object({
  id: opaqueId,
  createdAt: timestamp,
  updatedAt: timestamp,
  documents: z.array(z.object({
    id: opaqueId, taxYear: year.nullable().optional(), size: count, uploadedAt: timestamp,
    kind: z.enum([...supportMatrix.map((entry) => entry.kind), "unknown"]),
    coverage: z.enum(["supported", "partially-supported", "needs-review", "planned", "unsupported", "reviewed"]),
    matchedFixtureId: z.enum(officialSampleDocumentFixtures.map((fixture) => fixture.id)).nullable(),
    seededFactIds: z.array(factId).max(100),
  })).max(500),
  summary: z.object({ totalDocuments: count, officialFixtureMatches: count, supportedDocuments: count,
    pendingReviewDocuments: count, interviewQuestionsRemaining: count }),
  seededReturn: z.object({
    status: z.enum(["empty", "ready-for-interview", "needs-review"]),
    taxYearHints: z.array(year).max(100),
    facts: z.array(z.object({ id: factId, ...answerMetadata })).max(100),
    interviewQuestions: z.array(z.object({ id: factId, factId, ...answerMetadata })).max(100),
    interviewQueue: z.array(factId).max(100), nextQuestionId: factId.nullable(),
  }),
  returnSummary: z.object({ status: z.enum(["empty", "awaiting-interview", "needs-review", "ready-to-recompute"]),
    targetTaxYear: year.nullable(), taxYearState: z.enum(["missing", "single", "multiple"]),
    answeredFactCount: count, totalFactCount: count, readyItemCount: count, itemCount: count }),
  guidedCompletion: z.object({ completedSectionCount: count, totalSectionCount: count,
    skippedSectionCount: count, needsReviewSectionCount: count }).nullable().optional(),
  checklist: z.array(z.object({ id: z.enum(defaultChecklist.map((item) => item.id)),
    status: z.enum(["ready", "needs-input", "blocked"]) })).max(100),
  auditTrail: z.array(z.object({ id: opaqueId, occurredAt: timestamp,
    kind: z.enum(["workspace-created", "documents-ingested", "document-removed", "document-year-confirmed", "workspace-cleared", "interview-answered", "interview-reopened"]),
    questionId: factId.nullable() })).max(10000),
});

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

export function sanitizeWorkspaceForHostedStorage(
  workspace: ReturnWorkspaceRecord
): ReturnWorkspaceRecord {
  const parsed = shellMetadataSchema.safeParse(workspace);
  if (!parsed.success) {
    // Do not echo validation values: even a nominally numeric field can carry
    // private text in an HTTP request or an old local record.
    throw new Error("Server configuration error: hosted persistence rejected invalid workspace shell metadata.");
  }
  const metadata = parsed.data;
  const sanitized: ReturnWorkspaceRecord = {
    ...metadata,
    storageMode: "hosted-postgres",
    documents: metadata.documents.map((document, index) => ({
      ...document, name: `Document ${index + 1}`, blobStorageKey: null,
      label: supportMatrix.find((entry) => entry.kind === document.kind)?.label ?? "Unclassified document",
      notes: "Stored as metadata only. Raw files are not stored on the server.", detectedFacts: null,
    })),
    seededReturn: {
      ...metadata.seededReturn,
      facts: metadata.seededReturn.facts.map((fact) => ({
        ...fact,
        label: seededFactDefinitions.find((definition) => definition.id === fact.id)?.label ?? "Interview item",
        answerText: null,
        sourceDocumentIds: []
      })),
      interviewQuestions: metadata.seededReturn.interviewQuestions.map((question) => ({
        ...question,
        prompt: seededFactDefinitions.find((definition) => definition.id === question.factId)?.prompt ?? "Review this interview item.",
        answerText: null,
        sourceDocumentIds: []
      })),
      reviewNotes: []
    },
    structuredFacts: [],
    returnSummary: { ...metadata.returnSummary, blockers: [], items: [] },
    enginePreview: null,
    checklist: metadata.checklist.map((item) => ({ ...item,
      label: defaultChecklist.find((definition) => definition.id === item.id)?.label ?? "Review progress" })),
    auditTrail: metadata.auditTrail.map((event) => ({ ...event,
      message: sanitizeAuditEventMessage(event.kind), documentIds: [], answerText: null }))
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

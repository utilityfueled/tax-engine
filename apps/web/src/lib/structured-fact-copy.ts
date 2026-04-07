import type {
  SeededReturnFactRecord,
  WorkspaceStructuredFactRecord,
} from "@tax-engine/contracts";

function sharesReviewedSourceDocument(
  structuredFact: Pick<WorkspaceStructuredFactRecord, "sourceDocumentIds">,
  answeredFact: Pick<SeededReturnFactRecord, "sourceDocumentIds">
) {
  if (structuredFact.sourceDocumentIds.length === 0 || answeredFact.sourceDocumentIds.length === 0) {
    return true;
  }

  return structuredFact.sourceDocumentIds.some((documentId) =>
    answeredFact.sourceDocumentIds.includes(documentId)
  );
}

export function hasAnsweredReviewForStructuredFact(
  structuredFact: Pick<WorkspaceStructuredFactRecord, "factId" | "sourceDocumentIds">,
  seededFacts: ReadonlyArray<Pick<SeededReturnFactRecord, "id" | "status" | "sourceDocumentIds">>
) {
  return seededFacts.some((seededFact) =>
    seededFact.id === structuredFact.factId
    && seededFact.status === "answered"
    && sharesReviewedSourceDocument(structuredFact, seededFact)
  );
}

export function formatStructuredFactConfidence(
  structuredFact: Pick<WorkspaceStructuredFactRecord, "sourceType" | "confidence" | "factId" | "sourceDocumentIds">,
  seededFacts: ReadonlyArray<Pick<SeededReturnFactRecord, "id" | "status" | "sourceDocumentIds">>
) {
  if (
    structuredFact.sourceType === "upload"
    && structuredFact.confidence === "low"
    && hasAnsweredReviewForStructuredFact(structuredFact, seededFacts)
  ) {
    return "reviewed with your answer";
  }

  return structuredFact.confidence === "high"
    ? "high confidence"
    : structuredFact.confidence === "low"
      ? "needs review"
      : structuredFact.confidence;
}

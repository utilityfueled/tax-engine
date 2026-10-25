import {
  seededFactDefinitions,
  type SeededReturnSummary,
  type WorkspaceDocumentRecord,
  type WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";
import { buildFixtureStructuredFacts } from "./workspace-fixture-facts";

const factOrder = new Map(
  seededFactDefinitions.map((definition, index) => [definition.id, index])
);

const structuredFactKindOrder = new Map<WorkspaceStructuredFactRecord["kind"], number>([
  ["document-detected", 0],
  ["fixture-derived", 1],
  ["interview-answer", 2]
]);

function getLatestUploadedAt(
  sourceDocumentIds: string[],
  documentsById: Map<string, WorkspaceDocumentRecord>
) {
  return sourceDocumentIds
    .map((documentId) => documentsById.get(documentId)?.uploadedAt ?? null)
    .filter((value): value is string => value !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function buildUploadStructuredFacts(
  document: WorkspaceDocumentRecord,
  supportedFactIds: Set<SeededReturnSummary["facts"][number]["id"]>
) {
  return (document.detectedFacts ?? []).flatMap((fact) => {
    if (!supportedFactIds.has(fact.factId)) {
      return [];
    }

    return [{
      id: `${fact.factId}:${document.id}:${fact.idSuffix}`,
      factId: fact.factId,
      label: fact.label,
      kind: "document-detected",
      value: fact.value,
      sourceType: "upload",
      confidence: fact.confidence,
      sourceDocumentIds: [document.id],
      questionId: null,
      updatedAt: document.uploadedAt,
      ...(fact.machineValue ? { machineValue: fact.machineValue } : {})
    } satisfies WorkspaceStructuredFactRecord];
  });
}

export function buildWorkspaceStructuredFacts(
  documents: WorkspaceDocumentRecord[],
  seededReturn: SeededReturnSummary
): WorkspaceStructuredFactRecord[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const interviewQuestionsById = new Map(
    seededReturn.interviewQuestions.map((question) => [question.id, question])
  );
  const supportedFactIds = new Set(seededReturn.facts.map((fact) => fact.id));
  const structuredFacts: WorkspaceStructuredFactRecord[] = [];

  for (const fact of seededReturn.facts) {
    structuredFacts.push({
      id: `${fact.id}:document-detected`,
      factId: fact.id,
      label: fact.label,
      kind: "document-detected",
      value: `Detected from ${fact.sourceDocumentIds.length} uploaded document(s).`,
      sourceType: "upload",
      confidence: "low",
      sourceDocumentIds: fact.sourceDocumentIds,
      questionId: null,
      updatedAt: getLatestUploadedAt(fact.sourceDocumentIds, documentsById)
    });

    const answeredQuestion = interviewQuestionsById.get(fact.id);

    if (answeredQuestion?.status !== "answered" || !answeredQuestion.answerText) {
      continue;
    }

    structuredFacts.push({
      id: `${fact.id}:interview-answer`,
      factId: fact.id,
      label: fact.label,
      kind: "interview-answer",
      value: answeredQuestion.answerText,
      sourceType: "user-answer",
      confidence: "high",
      sourceDocumentIds: answeredQuestion.sourceDocumentIds,
      questionId: answeredQuestion.id,
      updatedAt: answeredQuestion.answeredAt
    });
  }

  for (const document of documents) {
    structuredFacts.push(...buildUploadStructuredFacts(document, supportedFactIds));
    // Repeated sample files still need distinct evidence identities. Otherwise
    // audit references collapse two inputs into one indistinguishable fact.
    const repeatedFixture = documents.filter((entry) => entry.matchedFixtureId === document.matchedFixtureId).length > 1;
    structuredFacts.push(...buildFixtureStructuredFacts(document, supportedFactIds, repeatedFixture));
  }

  return structuredFacts.sort((left, right) => {
    const factDelta = (factOrder.get(left.factId) ?? 0) - (factOrder.get(right.factId) ?? 0);

    if (factDelta !== 0) {
      return factDelta;
    }

    const kindDelta = (structuredFactKindOrder.get(left.kind) ?? 0) - (structuredFactKindOrder.get(right.kind) ?? 0);

    if (kindDelta !== 0) {
      return kindDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

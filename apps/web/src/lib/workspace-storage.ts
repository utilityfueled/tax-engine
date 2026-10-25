import {
  defaultChecklist,
  latestEngineTargetYear,
  officialSampleDocumentFixtures,
  seededFactDefinitions,
  supportMatrix,
  type InterviewQuestionRecord,
  type ReturnWorkspaceRecord,
  type SeededFactId,
  type SeededReturnFactRecord,
  type SeededReturnSummary,
  type SupportedDocumentKind,
  type WorkspaceAuditEventKind,
  type WorkspaceAuditEventRecord,
  type WorkspaceChecklistItem,
  type WorkspaceDocumentDetectedFactRecord,
  type WorkspaceDocumentRecord,
  type WorkspaceDocumentKind,
  type WorkspaceGuidedCompletion,
  type WorkspaceReturnSummary
} from "@tax-engine/contracts";
import {
  buildWorkspaceEnginePreview,
  buildWorkspaceReturnSummary,
  buildWorkspaceStructuredFacts
} from "@tax-engine/engine";
import {
  clearGuidedFlowState,
  summarizeFlowCompletion,
  type GuidedFlowState
} from "./guided-interview-flow";

// The preview helper is cached so refresh calls can avoid repeating the
// dynamic import work when a caller explicitly asks for a recomputed preview.
let cachedBuildPreview: typeof import("@tax-engine/engine/src/workspace-engine-preview").buildWorkspaceEnginePreview | null = null;
async function lazyBuildWorkspaceEnginePreview(
  ...args: Parameters<typeof import("@tax-engine/engine/src/workspace-engine-preview").buildWorkspaceEnginePreview>
) {
  if (!cachedBuildPreview) {
    const mod = await import("@tax-engine/engine/src/workspace-engine-preview");
    cachedBuildPreview = mod.buildWorkspaceEnginePreview;
  }

  return cachedBuildPreview(...args);
}

interface StorageShape {
  workspaces: Record<string, ReturnWorkspaceRecord>;
}

interface FixtureMatch {
  id: string;
  label: string;
  kind: SupportedDocumentKind;
  aliases: string[];
  taxYearHint: number | null;
}

interface UploadableFile {
  name: string;
  size: number;
  detectedDocument?: {
    taxYear?: number | null;
    kind: WorkspaceDocumentRecord["kind"];
    coverage: WorkspaceDocumentRecord["coverage"];
    label: string;
    notes: string;
    seededFactIds: SeededFactId[];
    detectedFacts?: WorkspaceDocumentRecord["detectedFacts"];
  } | null;
}

interface FutureYearSampleUpload {
  fileName: string;
  fixture: FixtureMatch;
}

interface StoredInterviewQuestionLike {
  id?: unknown;
  factId?: unknown;
  prompt?: unknown;
  status?: unknown;
  answeredAt?: unknown;
  answerText?: unknown;
  sourceDocumentIds?: unknown;
}

interface StoredSeededReturnFactLike {
  id?: unknown;
  label?: unknown;
  status?: unknown;
  answeredAt?: unknown;
  answerText?: unknown;
  sourceDocumentIds?: unknown;
}

interface StoredAuditTrailEventLike {
  id?: unknown;
  occurredAt?: unknown;
  kind?: unknown;
  message?: unknown;
  documentIds?: unknown;
  questionId?: unknown;
  answerText?: unknown;
}

interface StoredGuidedCompletionLike {
  completedSectionCount?: unknown;
  totalSectionCount?: unknown;
  skippedSectionCount?: unknown;
  needsReviewSectionCount?: unknown;
}

export const WORKSPACE_STORAGE_KEY = "tax-engine.return-workspaces.v1";
const STORAGE_KEY = WORKSPACE_STORAGE_KEY;

/** Invalidate derived records after a recovery import or another storage writer. */
export function invalidateWorkspaceStorageCache(storage: Storage) {
  storageCache.delete(storage);
}

// In-memory cache keyed by Storage instance. Avoids re-parsing the full JSON
// blob (+ hydrating every workspace) on every read within the same page
// lifecycle.  All writes go through saveStorage() which keeps the cache in
// sync.  WeakMap ensures the cache is GC'd when the Storage reference is.
const storageCache = new WeakMap<object, StorageShape>();

export const seededFactLabels: Record<SeededFactId, string> = {
  ...Object.fromEntries(
    seededFactDefinitions.map((definition) => [definition.id, definition.label])
  ) as Record<SeededFactId, string>
};

const seededFactOrder = seededFactDefinitions.map((definition) => definition.id);

const interviewPromptByFact: Record<SeededFactId, string> = {
  ...Object.fromEntries(
    seededFactDefinitions.map((definition) => [definition.id, definition.prompt])
  ) as Record<SeededFactId, string>
};

const officialFixtureCatalog: FixtureMatch[] = officialSampleDocumentFixtures.map((fixture) => ({
  id: fixture.id,
  label: fixture.title,
  kind: fixture.kind,
  aliases: fixture.aliases,
  taxYearHint: fixture.taxYearHint
}));

const supportByKind = new Map(supportMatrix.map((entry) => [entry.kind, entry]));
const supportedDocumentKinds = new Set<WorkspaceDocumentKind>([
  ...supportMatrix.map((entry) => entry.kind),
  "unknown"
]);
const workspaceCoverageStatuses = new Set<WorkspaceDocumentRecord["coverage"]>([
  "supported",
  "reviewed",
  "partially-supported",
  "needs-review",
  "planned",
  "unsupported"
]);
const supportedFixtureIds = new Set(["irs-1099-nec-2025"]);

const workspaceAuditEventKinds: WorkspaceAuditEventKind[] = [
  "workspace-created",
  "documents-ingested",
  "document-removed",
  "document-year-confirmed",
  "workspace-cleared",
  "interview-answered",
  "interview-reopened"
];

function isPendingReviewCoverage(coverage: WorkspaceDocumentRecord["coverage"]) {
  return coverage === "partially-supported"
    || coverage === "planned"
    || coverage === "needs-review"
    || coverage === "unsupported";
}

function normalizeFixtureValue(value: string) {
  return value.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function tokensContainAlias(nameTokens: string[], alias: string) {
  const aliasTokens = normalizeFixtureValue(alias).split(" ").filter(Boolean);

  if (aliasTokens.length === 0 || aliasTokens.length > nameTokens.length) {
    return false;
  }

  for (let start = 0; start <= nameTokens.length - aliasTokens.length; start += 1) {
    let matches = true;

    for (let index = 0; index < aliasTokens.length; index += 1) {
      if (nameTokens[start + index] !== aliasTokens[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function loadStorage(storage: Storage): StorageShape {
  const cached = storageCache.get(storage);
  if (cached) return cached;

  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    const empty: StorageShape = { workspaces: {} };
    storageCache.set(storage, empty);
    return empty;
  }

  try {
    const parsed = JSON.parse(raw) as StorageShape;

    if (!parsed.workspaces || typeof parsed.workspaces !== "object") {
      const empty: StorageShape = { workspaces: {} };
      storageCache.set(storage, empty);
      return empty;
    }

    const workspaces = Object.fromEntries(
      Object.entries(parsed.workspaces).map(([workspaceId, workspace]) => [
        workspaceId,
        hydrateWorkspaceRecord(workspaceId, workspace)
      ])
    );

    const result: StorageShape = { workspaces };
    storageCache.set(storage, result);
    return result;
  } catch {
    const empty: StorageShape = { workspaces: {} };
    storageCache.set(storage, empty);
    return empty;
  }
}

function saveStorage(storage: Storage, data: StorageShape) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageCache.set(storage, data);
  } catch (error) {
    // Callers may have mutated a cached record before the durable write failed.
    storageCache.delete(storage);
    throw error;
  }
}

function createChecklist(
  totalDocuments: number,
  pendingReviewDocuments: number,
  interviewQuestionsRemaining: number
) {
  return defaultChecklist.map((item) => {
    if (item.id === "documents") {
      return { ...item, status: totalDocuments > 0 ? "ready" : "needs-input" } as const;
    }

    if (item.id === "coverage") {
      return {
        ...item,
        status: totalDocuments === 0 ? "needs-input" : pendingReviewDocuments === 0 ? "ready" : "blocked"
      } as const;
    }

    if (item.id === "interview") {
      return {
        ...item,
        status: totalDocuments === 0
          ? "blocked"
          : interviewQuestionsRemaining > 0
            ? "needs-input"
            : pendingReviewDocuments > 0
              ? "blocked"
              : "ready"
      } as const;
    }

    if (item.id === "review") {
      return {
        ...item,
        status: totalDocuments > 0
          && pendingReviewDocuments === 0
          && interviewQuestionsRemaining === 0
          ? "ready"
          : "blocked"
      } as const;
    }

    return item;
  });
}

function normalizeGuidedCompletion(value: unknown): WorkspaceGuidedCompletion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const guidedCompletion = value as StoredGuidedCompletionLike;
  const completedSectionCount = guidedCompletion.completedSectionCount;
  const totalSectionCount = guidedCompletion.totalSectionCount;
  const skippedSectionCount = guidedCompletion.skippedSectionCount;
  const needsReviewSectionCount = guidedCompletion.needsReviewSectionCount;

  if (
    typeof completedSectionCount !== "number"
    || typeof totalSectionCount !== "number"
    || typeof skippedSectionCount !== "number"
    || typeof needsReviewSectionCount !== "number"
    || !Number.isInteger(completedSectionCount)
    || !Number.isInteger(totalSectionCount)
    || !Number.isInteger(skippedSectionCount)
    || !Number.isInteger(needsReviewSectionCount)
    || completedSectionCount < 0
    || totalSectionCount < 0
    || skippedSectionCount < 0
    || needsReviewSectionCount < 0
  ) {
    return null;
  }

  const pendingSectionCount = skippedSectionCount + needsReviewSectionCount;

  if (pendingSectionCount === 0) {
    return null;
  }

  return {
    completedSectionCount,
    totalSectionCount,
    skippedSectionCount,
    needsReviewSectionCount
  };
}

function normalizeDetectedFacts(value: unknown): WorkspaceDocumentDetectedFactRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const fact = item as WorkspaceDocumentDetectedFactRecord;

    if (
      typeof fact.idSuffix !== "string"
      || !seededFactOrder.includes(fact.factId)
      || typeof fact.label !== "string"
      || typeof fact.value !== "string"
      || (fact.confidence !== "low" && fact.confidence !== "high")
    ) {
      return [];
    }

    return [{
      idSuffix: fact.idSuffix,
      factId: fact.factId,
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
      ...(fact.machineValue ? { machineValue: fact.machineValue } : {})
    }];
  });
}

function buildGuidedCompletion(flowState: GuidedFlowState | null | undefined): WorkspaceGuidedCompletion | null {
  if (!flowState || flowState.phase !== "complete") {
    return null;
  }

  const completion = summarizeFlowCompletion(flowState);
  const pendingSectionCount = completion.skippedSections + completion.needsReviewSections;

  if (pendingSectionCount === 0) {
    return null;
  }

  return {
    completedSectionCount: completion.completedSections,
    totalSectionCount: completion.totalSections,
    skippedSectionCount: completion.skippedSections,
    needsReviewSectionCount: completion.needsReviewSections
  };
}

function buildGuidedCompletionBlocker(
  guidedCompletion: WorkspaceGuidedCompletion,
  documents: WorkspaceDocumentRecord[]
) {
  const pendingSectionCount = guidedCompletion.skippedSectionCount + guidedCompletion.needsReviewSectionCount;

  if (pendingSectionCount === 0) {
    return null;
  }

  return {
    id: "needs-answer:guided-follow-up",
    message: pendingSectionCount === 1
      ? "1 guided section was skipped or still needs review before this return is ready."
      : `${pendingSectionCount} guided sections were skipped or still need review before this return is ready.`,
    relatedFactIds: [],
    sourceDocumentIds: documents
      .filter((document) => document.id.startsWith("guided:"))
      .map((document) => document.id)
  } satisfies WorkspaceReturnSummary["blockers"][number];
}

function applyGuidedCompletionStatus(
  documents: WorkspaceDocumentRecord[],
  summary: ReturnWorkspaceRecord["summary"],
  checklist: WorkspaceChecklistItem[],
  returnSummary: WorkspaceReturnSummary,
  guidedCompletion: WorkspaceGuidedCompletion | null
) {
  const guidedCompletionBlocker = guidedCompletion
    ? buildGuidedCompletionBlocker(guidedCompletion, documents)
    : null;

  if (!guidedCompletionBlocker || !guidedCompletion) {
    return {
      summary,
      checklist,
      returnSummary
    };
  }

  const pendingSectionCount = guidedCompletion.skippedSectionCount + guidedCompletion.needsReviewSectionCount;
  const blockers = [
    ...returnSummary.blockers.filter((blocker) => blocker.id !== guidedCompletionBlocker.id),
    guidedCompletionBlocker
  ];

  return {
    summary: {
      ...summary,
      interviewQuestionsRemaining: Math.max(summary.interviewQuestionsRemaining, pendingSectionCount)
    },
    checklist: checklist.map((item) => {
      if (item.id === "interview") {
        return {
          ...item,
          status: "needs-input" as const
        };
      }

      if (item.id === "review") {
        return {
          ...item,
          status: "blocked" as const
        };
      }

      return item;
    }),
    returnSummary: {
      ...returnSummary,
      status: returnSummary.status === "ready-to-recompute" ? "awaiting-interview" : returnSummary.status,
      blockers
    }
  };
}

function computeSummary(documents: WorkspaceDocumentRecord[], seededReturn: SeededReturnSummary) {
  const totalDocuments = documents.length;
  const officialFixtureMatches = documents.filter((document) => document.matchedFixtureId).length;
  const supportedDocuments = documents.filter((document) => document.coverage === "supported").length;
  const pendingReviewDocuments = documents.filter((document) => isPendingReviewCoverage(document.coverage)).length;
  const interviewQuestionsRemaining = seededReturn.interviewQueue.length;

  return {
    totalDocuments,
    officialFixtureMatches,
    supportedDocuments,
    pendingReviewDocuments,
    interviewQuestionsRemaining
  };
}

function extractTaxYearHints(document: WorkspaceDocumentRecord) {
  if (document.taxYear !== undefined) {
    return Number.isInteger(document.taxYear) && document.taxYear !== null
      && document.taxYear >= 1900 && document.taxYear <= 2100 ? [document.taxYear] : [];
  }
  const matchedFixture = document.matchedFixtureId
    ? officialFixtureCatalog.find((fixture) => fixture.id === document.matchedFixtureId) ?? null
    : null;

  if (matchedFixture?.taxYearHint !== null && matchedFixture?.taxYearHint !== undefined) {
    return [matchedFixture.taxYearHint];
  }

  // A legacy filename is not evidence of the form's tax year. Keep it unknown
  // until source text or the taxpayer establishes it explicitly.
  return [];
}

function normalizeDocumentIdentityValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildDocumentDeduplicationKey(document: WorkspaceDocumentRecord) {
  if (document.matchedFixtureId) {
    return `fixture:${document.id}`;
  }

  return [
    "upload",
    document.kind,
    normalizeDocumentIdentityValue(document.name),
    String(document.size),
  ].join(":");
}

function scoreDocumentQuality(document: WorkspaceDocumentRecord) {
  const coverageScore = document.coverage === "supported"
    ? 100
    : document.coverage === "reviewed"
      ? 60
    : document.coverage === "partially-supported"
      ? 75
      : document.coverage === "needs-review"
        ? 50
        : document.coverage === "planned"
          ? 25
          : 0;
  const detectedFactsScore = (document.detectedFacts ?? []).reduce((score, fact) => {
    const machineValueScore = fact.machineValue && typeof fact.machineValue === "object"
      ? Object.keys(fact.machineValue).length
      : 0;

    return score + 10 + machineValueScore;
  }, 0);

  return coverageScore + detectedFactsScore;
}

function preferDocument(candidate: WorkspaceDocumentRecord, current: WorkspaceDocumentRecord) {
  const candidateScore = scoreDocumentQuality(candidate);
  const currentScore = scoreDocumentQuality(current);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  return candidate.uploadedAt >= current.uploadedAt ? candidate : current;
}

function deduplicateDocuments(documents: WorkspaceDocumentRecord[]) {
  const documentsByKey = new Map<string, WorkspaceDocumentRecord>();
  const keyOrder: string[] = [];

  for (const document of documents) {
    const key = buildDocumentDeduplicationKey(document);
    const existing = documentsByKey.get(key);

    if (!existing) {
      keyOrder.push(key);
      documentsByKey.set(key, document);
      continue;
    }

    documentsByKey.set(key, preferDocument(document, existing));
  }

  return keyOrder
    .map((key) => documentsByKey.get(key))
    .filter((document): document is WorkspaceDocumentRecord => Boolean(document));
}

function summarizeSeededReturn(
  documents: WorkspaceDocumentRecord[],
  previousQuestions: InterviewQuestionRecord[] = []
): SeededReturnSummary {
  if (documents.length === 0) {
    return {
      status: "empty",
      taxYearHints: [],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: null,
      reviewNotes: []
    };
  }

  const factSourceMap = new Map<SeededFactId, Set<string>>();
  const previousQuestionsById = new Map(
    previousQuestions.map((question) => [question.id, question])
  );
  const taxYearHints = new Set<number>();
  const reviewNotes = new Set<string>();

  for (const document of documents) {
    for (const factId of document.seededFactIds) {
      const sources = factSourceMap.get(factId) ?? new Set<string>();
      sources.add(document.id);
      factSourceMap.set(factId, sources);
    }

    for (const taxYear of extractTaxYearHints(document)) {
      taxYearHints.add(taxYear);
    }

    if (isPendingReviewCoverage(document.coverage)) {
      reviewNotes.add(`${document.label} still needs manual review before facts can be trusted.`);
    }

    if (document.kind === "unknown" && isPendingReviewCoverage(document.coverage)) {
      reviewNotes.add("Unknown uploads stay metadata-only until a parser or manual mapping is added.");
    }
  }

  const facts = Array.from(factSourceMap.entries())
    .map(([id, sourceDocumentIds]) => {
      const previousQuestion = previousQuestionsById.get(id);

      return {
        id,
        label: seededFactLabels[id],
        status: previousQuestion?.status === "answered" ? "answered" : "pending",
        answeredAt: previousQuestion?.status === "answered"
          ? previousQuestion.answeredAt ?? null
          : null,
        answerText: previousQuestion?.status === "answered"
          ? previousQuestion.answerText ?? null
          : null,
        sourceDocumentIds: Array.from(sourceDocumentIds).sort()
      } satisfies SeededReturnFactRecord;
    })
    .sort((left, right) => seededFactOrder.indexOf(left.id) - seededFactOrder.indexOf(right.id));

  const interviewQuestions = createInterviewQuestions(facts);
  const interviewQueue = interviewQuestions
    .filter((question) => question.status === "pending")
    .map((question) => question.prompt);

  return {
    status: reviewNotes.size > 0 ? "needs-review" : "ready-for-interview",
    taxYearHints: Array.from(taxYearHints).sort((left, right) => right - left),
    facts,
    interviewQuestions,
    interviewQueue,
    nextQuestionId: interviewQuestions.find((question) => question.status === "pending")?.id ?? null,
    reviewNotes: Array.from(reviewNotes)
  };
}

export function createWorkspaceRecord(
  id: string,
  {
    now = new Date().toISOString(),
    storageMode = "local-browser",
    createdMessage = "Return created."
  }: {
    now?: string;
    storageMode?: ReturnWorkspaceRecord["storageMode"];
    createdMessage?: string;
  } = {}
): ReturnWorkspaceRecord {
  const seededReturn = summarizeSeededReturn([]);
  const structuredFacts = buildWorkspaceStructuredFacts([], seededReturn);
  const returnSummary = buildWorkspaceReturnSummary([], seededReturn);
  // Empty workspace always yields a null engine preview — skip the heavy import.
  const enginePreview = null;
  const summary = computeSummary([], seededReturn);
  const auditTrail = appendAuditTrailEvent([], {
    occurredAt: now,
    kind: "workspace-created",
    message: createdMessage,
    documentIds: [],
    questionId: null,
    answerText: null
  });

  return {
    id,
    createdAt: now,
    updatedAt: now,
    storageMode,
    documents: [],
    summary,
    seededReturn,
    structuredFacts,
    returnSummary,
    enginePreview,
    guidedCompletion: null,
    checklist: createChecklist(
      summary.totalDocuments,
      summary.pendingReviewDocuments,
      summary.interviewQuestionsRemaining
    ),
    auditTrail
  };
}

function createWorkspace(id: string, now = new Date().toISOString()): ReturnWorkspaceRecord {
  return createWorkspaceRecord(id, {
    now
  });
}

function createInterviewQuestions(
  facts: SeededReturnFactRecord[],
  previousQuestions: InterviewQuestionRecord[] = []
) {
  const previousQuestionsById = new Map(
    previousQuestions.map((question) => [question.id, question])
  );

  return facts.map((fact) => {
    const previousQuestion = previousQuestionsById.get(fact.id);

    return {
      id: fact.id,
      factId: fact.id,
      prompt: interviewPromptByFact[fact.id],
      status: previousQuestion?.status === "answered" ? "answered" : "pending",
      answeredAt: previousQuestion?.status === "answered" ? previousQuestion.answeredAt ?? null : null,
      answerText: previousQuestion?.status === "answered" ? previousQuestion.answerText ?? null : null,
      sourceDocumentIds: fact.sourceDocumentIds
    } satisfies InterviewQuestionRecord;
  });
}

function normalizeInterviewQuestions(value: unknown): InterviewQuestionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const question = item as StoredInterviewQuestionLike;
    const id = question.id;
    const factId = question.factId;
    const prompt = question.prompt;
    const status = question.status;
    const answeredAt = question.answeredAt;
    const answerText = question.answerText;
    const sourceDocumentIds = question.sourceDocumentIds;

    if (
      !seededFactOrder.includes(id as SeededFactId)
      || !seededFactOrder.includes(factId as SeededFactId)
      || typeof prompt !== "string"
      || (status !== "pending" && status !== "answered")
      || (answeredAt !== null && typeof answeredAt !== "string")
      || (answerText !== undefined && answerText !== null && typeof answerText !== "string")
      || !Array.isArray(sourceDocumentIds)
      || sourceDocumentIds.some((entry) => typeof entry !== "string")
    ) {
      return [];
    }

    return [{
      id: id as SeededFactId,
      factId: factId as SeededFactId,
      prompt,
      status,
      answeredAt,
      answerText: typeof answerText === "string" ? answerText : null,
      sourceDocumentIds: sourceDocumentIds as string[]
    }];
  });
}

function normalizeSeededReturnFacts(value: unknown): SeededReturnFactRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const fact = item as StoredSeededReturnFactLike;
    const id = fact.id;
    const label = fact.label;
    const status = fact.status;
    const answeredAt = fact.answeredAt;
    const answerText = fact.answerText;
    const sourceDocumentIds = fact.sourceDocumentIds;

    if (
      !seededFactOrder.includes(id as SeededFactId)
      || typeof label !== "string"
      || (status !== "pending" && status !== "answered")
      || (answeredAt !== null && answeredAt !== undefined && typeof answeredAt !== "string")
      || (answerText !== null && answerText !== undefined && typeof answerText !== "string")
      || !Array.isArray(sourceDocumentIds)
      || sourceDocumentIds.some((entry) => typeof entry !== "string")
    ) {
      return [];
    }

    return [{
      id: id as SeededFactId,
      label,
      status,
      answeredAt: status === "answered" ? answeredAt ?? null : null,
      answerText: status === "answered" && typeof answerText === "string" ? answerText : null,
      sourceDocumentIds: sourceDocumentIds as string[]
    }];
  });
}

function getHydrationPreviousQuestions(
  seededReturn: Partial<SeededReturnSummary> | undefined
): InterviewQuestionRecord[] {
  const storedQuestionsById = new Map(
    normalizeInterviewQuestions(seededReturn?.interviewQuestions).map((question) => [question.id, question])
  );
  const storedFactsById = new Map(
    normalizeSeededReturnFacts(seededReturn?.facts).map((fact) => [fact.id, fact])
  );

  return seededFactOrder.flatMap((factId) => {
    const question = storedQuestionsById.get(factId);

    if (question) {
      return [question];
    }

    const fact = storedFactsById.get(factId);

    if (!fact) {
      return [];
    }

    return [{
      id: fact.id,
      factId: fact.id,
      prompt: interviewPromptByFact[fact.id],
      status: fact.status,
      answeredAt: fact.status === "answered" ? fact.answeredAt : null,
      answerText: fact.status === "answered" ? fact.answerText : null,
      sourceDocumentIds: fact.sourceDocumentIds
    }];
  });
}

function buildUniqueDocumentId(baseId: string, usedIds: Set<string>) {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let duplicateIndex = 2;

  while (usedIds.has(`${baseId}#${duplicateIndex}`)) {
    duplicateIndex += 1;
  }

  const uniqueId = `${baseId}#${duplicateIndex}`;
  usedIds.add(uniqueId);
  return uniqueId;
}

function ensureUniqueDocumentIds(documents: WorkspaceDocumentRecord[]) {
  const usedIds = new Set<string>();

  return documents.map((document) => {
    const nextId = buildUniqueDocumentId(document.id, usedIds);

    return nextId === document.id ? document : { ...document, id: nextId };
  });
}

function normalizeStoredDocument(document: WorkspaceDocumentRecord): WorkspaceDocumentRecord {
  if (document.coverage === "unsupported" && document.notes.includes("Next step:")) {
    return {
      ...document,
      coverage: "reviewed"
    };
  }

  return document;
}

function appendAuditTrailEvent(
  auditTrail: WorkspaceAuditEventRecord[],
  event: Omit<WorkspaceAuditEventRecord, "id">
) {
  return [
    ...auditTrail,
    {
      id: `${event.kind}:${auditTrail.length + 1}`,
      ...event
    }
  ];
}

function normalizeAuditTrail(value: unknown): WorkspaceAuditEventRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const event = item as StoredAuditTrailEventLike;
    const id = event.id;
    const occurredAt = event.occurredAt;
    const kind = event.kind;
    const message = event.message;
    const documentIds = event.documentIds;
    const questionId = event.questionId;
    const answerText = event.answerText;

    if (
      typeof id !== "string"
      || typeof occurredAt !== "string"
      || !workspaceAuditEventKinds.includes(kind as WorkspaceAuditEventKind)
      || typeof message !== "string"
      || !Array.isArray(documentIds)
      || documentIds.some((entry) => typeof entry !== "string")
      || (questionId !== null && questionId !== undefined && !seededFactOrder.includes(questionId as SeededFactId))
      || (answerText !== null && answerText !== undefined && typeof answerText !== "string")
    ) {
      return [];
    }

    return [{
      id,
      occurredAt,
      kind: kind as WorkspaceAuditEventKind,
      message,
      documentIds: documentIds as string[],
      questionId: questionId === null || questionId === undefined ? null : questionId as SeededFactId,
      answerText: typeof answerText === "string" ? answerText : null
    }];
  });
}

function buildSeededReturn(
  documents: WorkspaceDocumentRecord[],
  previousQuestions: InterviewQuestionRecord[] = []
): SeededReturnSummary {
  const baseSummary = summarizeSeededReturn(documents, previousQuestions);
  const interviewQuestions = createInterviewQuestions(baseSummary.facts, previousQuestions);
  const interviewQueue = interviewQuestions
    .filter((question) => question.status === "pending")
    .map((question) => question.prompt);

  return {
    ...baseSummary,
    facts: baseSummary.facts.map((fact) => {
      const question = interviewQuestions.find((entry) => entry.id === fact.id);

      return {
        ...fact,
        status: question?.status ?? fact.status,
        answeredAt: question?.status === "answered" ? question.answeredAt : null,
        answerText: question?.status === "answered" ? question.answerText : null
      } satisfies SeededReturnFactRecord;
    }),
    interviewQuestions,
    interviewQueue,
    nextQuestionId: interviewQuestions.find((question) => question.status === "pending")?.id ?? null
  };
}

function buildWorkspace(
  id: string,
  documents: WorkspaceDocumentRecord[],
  createdAt: string,
  previousQuestions: InterviewQuestionRecord[] = [],
  updatedAt = new Date().toISOString(),
  auditTrail: WorkspaceAuditEventRecord[] = [],
  storageMode: ReturnWorkspaceRecord["storageMode"] = "local-browser",
  guidedCompletion: WorkspaceGuidedCompletion | null = null
): ReturnWorkspaceRecord {
  const normalizedDocuments = deduplicateDocuments(documents.map(normalizeStoredDocument));
  const seededReturn = buildSeededReturn(normalizedDocuments, previousQuestions);
  const structuredFacts = buildWorkspaceStructuredFacts(normalizedDocuments, seededReturn);
  const rawReturnSummary = buildWorkspaceReturnSummary(normalizedDocuments, seededReturn);
  const enginePreview = buildWorkspaceEnginePreview(normalizedDocuments, rawReturnSummary, structuredFacts);
  const rawSummary = computeSummary(normalizedDocuments, seededReturn);
  const rawChecklist = createChecklist(
    rawSummary.totalDocuments,
    rawSummary.pendingReviewDocuments,
    rawSummary.interviewQuestionsRemaining
  );
  const {
    summary,
    checklist,
    returnSummary
  } = applyGuidedCompletionStatus(
    normalizedDocuments,
    rawSummary,
    rawChecklist,
    rawReturnSummary,
    guidedCompletion
  );

  return {
    id,
    createdAt,
    updatedAt,
    storageMode,
    documents: normalizedDocuments,
    summary,
    seededReturn,
    structuredFacts,
    returnSummary,
    enginePreview,
    guidedCompletion,
    checklist,
    auditTrail
  };
}

function hydrateWorkspaceRecord(workspaceId: string, workspace: ReturnWorkspaceRecord): ReturnWorkspaceRecord {
  const documents = ensureUniqueDocumentIds(
    Array.isArray(workspace.documents)
      ? workspace.documents.flatMap((document) => {
          if (!document || typeof document !== "object") {
            return [];
          }

          const normalized = document as WorkspaceDocumentRecord;

          if (
            typeof normalized.id !== "string"
            || typeof normalized.name !== "string"
            || typeof normalized.size !== "number"
            || typeof normalized.uploadedAt !== "string"
            || !supportedDocumentKinds.has(normalized.kind)
            || !workspaceCoverageStatuses.has(normalized.coverage)
            || typeof normalized.label !== "string"
            || typeof normalized.notes !== "string"
            || (normalized.matchedFixtureId !== null && typeof normalized.matchedFixtureId !== "string")
            || !Array.isArray(normalized.seededFactIds)
          ) {
            return [];
          }

          return [{
            ...normalized,
            ...(normalized.taxYear === undefined ? {} : {
              taxYear: typeof normalized.taxYear === "number" && Number.isInteger(normalized.taxYear)
                && normalized.taxYear >= 1900 && normalized.taxYear <= 2100 ? normalized.taxYear : null,
            }),
            blobStorageKey: typeof normalized.blobStorageKey === "string" ? normalized.blobStorageKey : null,
            seededFactIds: normalized.seededFactIds.filter((factId): factId is SeededFactId => seededFactOrder.includes(factId)),
            detectedFacts: normalizeDetectedFacts(normalized.detectedFacts)
          }];
        })
      : []
  );
  const createdAt = typeof workspace.createdAt === "string"
    ? workspace.createdAt
    : typeof workspace.updatedAt === "string"
      ? workspace.updatedAt
      : new Date(0).toISOString();
  const updatedAt = typeof workspace.updatedAt === "string" ? workspace.updatedAt : createdAt;
  const previousQuestions = getHydrationPreviousQuestions(workspace.seededReturn);
  const auditTrail = normalizeAuditTrail(workspace.auditTrail);
  const storageMode = workspace.storageMode === "hosted-postgres"
    ? "hosted-postgres"
    : "local-browser";
  const guidedCompletion = normalizeGuidedCompletion(workspace.guidedCompletion);

  const hydrated = buildWorkspace(
    workspaceId,
    documents,
    createdAt,
    previousQuestions,
    updatedAt,
    auditTrail,
    storageMode,
    guidedCompletion
  );
  const savedYear = workspace.returnSummary?.targetTaxYear;
  if (hydrated.returnSummary.targetTaxYear === null && Number.isInteger(savedYear)
    && savedYear !== null && savedYear >= 1900 && savedYear <= 2100
    && documents.some((document) => document.taxYear === undefined)) {
    // Preserve the saved return selection separately from unknown source facts.
    // taxYearState remains unknown, so this does not authorize calculation.
    return { ...hydrated, returnSummary: { ...hydrated.returnSummary, targetTaxYear: savedYear } };
  }
  return hydrated;
}

function matchFixture(fileName: string): FixtureMatch | null {
  const nameTokens = normalizeFixtureValue(fileName).split(" ").filter(Boolean);

  return officialFixtureCatalog.find((entry) => entry.aliases.some((alias) => tokensContainAlias(nameTokens, alias))) ?? null;
}

function getFutureYearSampleUploads(files: UploadableFile[]): FutureYearSampleUpload[] {
  return files.flatMap((file) => {
    const fixture = matchFixture(file.name);

    if (!fixture || fixture.taxYearHint === null || fixture.taxYearHint <= latestEngineTargetYear) {
      return [];
    }

    return [{
      fileName: file.name,
      fixture
    }];
  });
}

export function getFutureYearSampleUploadMessage(files: UploadableFile[]) {
  const futureYearSampleUploads = getFutureYearSampleUploads(files);

  if (futureYearSampleUploads.length === 0) {
    return null;
  }

  if (futureYearSampleUploads.length === 1) {
    const blockedUpload = futureYearSampleUploads[0];

    return `${blockedUpload.fixture.label} is an official sample document for tax year ${blockedUpload.fixture.taxYearHint}, so it can't drive a ${latestEngineTargetYear} return yet. Upload a ${latestEngineTargetYear} tax document instead.`;
  }

  return `${futureYearSampleUploads.length} official sample documents are for tax years after ${latestEngineTargetYear}, so they can't drive this return yet. Remove them and upload ${latestEngineTargetYear} tax documents instead.`;
}

function classifyUploadedDocument(file: UploadableFile, usedIds: Set<string>): WorkspaceDocumentRecord {
  const matchedFixture = matchFixture(file.name);

  if (matchedFixture) {
    const supportEntry = supportByKind.get(matchedFixture.kind);
    const seededFactIds = getSeededFactIds(matchedFixture.kind);
    const baseId = `${matchedFixture.id}:${file.name}:${file.size}`;
    const coverage = supportedFixtureIds.has(matchedFixture.id)
      ? "supported"
      : supportEntry?.coverage ?? "planned";

    return {
      id: buildUniqueDocumentId(baseId, usedIds),
      taxYear: matchedFixture.taxYearHint,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      kind: matchedFixture.kind,
      coverage,
      label: matchedFixture.label,
      notes: supportEntry?.notes ?? "Official IRS training material loaded into your tax return.",
      matchedFixtureId: matchedFixture.id,
      seededFactIds,
      detectedFacts: []
    };
  }

  if (file.detectedDocument) {
    const baseId = `${file.detectedDocument.kind}:${file.name}:${file.size}`;

    return {
      id: buildUniqueDocumentId(baseId, usedIds),
      taxYear: file.detectedDocument.taxYear ?? null,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      kind: file.detectedDocument.kind,
      coverage: file.detectedDocument.coverage,
      label: file.detectedDocument.label,
      notes: file.detectedDocument.notes,
      matchedFixtureId: null,
      seededFactIds: file.detectedDocument.seededFactIds,
      detectedFacts: normalizeDetectedFacts(file.detectedDocument.detectedFacts)
    };
  }

  const baseId = `unknown:${file.name}:${file.size}`;

  return {
    id: buildUniqueDocumentId(baseId, usedIds),
    taxYear: null,
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    kind: "unknown",
    coverage: "unsupported",
    label: "Unclassified upload",
    notes: "This document type is not yet supported. We currently handle a small set of official IRS forms.",
    matchedFixtureId: null,
    seededFactIds: [],
    detectedFacts: []
  };
}

function getSeededFactIds(kind: WorkspaceDocumentKind): SeededFactId[] {
  switch (kind) {
    case "w2":
      return ["wages", "withholding"];
    case "1099-int":
      return ["taxable-interest"];
    case "1099-g":
      return ["government-payments-review"];
    case "1099-div":
      return ["ordinary-dividends", "qualified-dividends", "capital-gain-distributions"];
    case "1098-e":
      return ["student-loan-interest-review"];
    case "1095-a":
      return ["premium-tax-credit-review"];
    case "1099-r":
      return ["retirement-distribution-review"];
    case "ssa-1099":
      return ["social-security-benefits-review"];
    case "1099-sa":
      return ["hsa-distribution-review"];
    case "1099-nec":
      return ["nonemployee-compensation", "schedule-c-expense-review"];
    case "1099-b":
      return ["broker-proceeds", "cost-basis-review"];
    default:
      return [];
  }
}

export function ensureWorkspace(storage: Storage, workspaceId: string) {
  const data = loadStorage(storage);
  const existing = data.workspaces[workspaceId];

  if (existing) {
    return existing;
  }

  const workspace = createWorkspace(workspaceId);
  data.workspaces[workspaceId] = workspace;
  saveStorage(storage, data);
  return workspace;
}

export function getWorkspace(storage: Storage, workspaceId: string) {
  const data = loadStorage(storage);

  return data.workspaces[workspaceId] ?? null;
}

export function listWorkspaces(storage: Storage) {
  const data = loadStorage(storage);

  return Object.values(data.workspaces).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function ingestFilesIntoWorkspace(
  workspace: ReturnWorkspaceRecord,
  files: UploadableFile[]
) {
  const usedIds = new Set(workspace.documents.map((document) => document.id));
  const appendedDocuments = files.map((file) => classifyUploadedDocument(file, usedIds));
  const nextDocuments = [
    ...workspace.documents,
    ...appendedDocuments
  ];
  const occurredAt = new Date().toISOString();
  const persistenceLabel = workspace.storageMode === "hosted-postgres"
    ? "your account"
    : "local browser storage";
  const auditTrail = appendAuditTrailEvent(workspace.auditTrail, {
    occurredAt,
    kind: "documents-ingested",
    message: `Stored ${appendedDocuments.length} document(s) in ${persistenceLabel}.`,
    documentIds: appendedDocuments.map((document) => document.id),
    questionId: null,
    answerText: null
  });
  return buildWorkspace(
    workspace.id,
    nextDocuments,
    workspace.createdAt,
    workspace.seededReturn.interviewQuestions,
    occurredAt,
    auditTrail,
    workspace.storageMode,
    workspace.guidedCompletion ?? null
  );
}

export function ingestFiles(storage: Storage, workspaceId: string, files: UploadableFile[]) {
  const data = loadStorage(storage);
  const current = data.workspaces[workspaceId] ?? createWorkspace(workspaceId);
  const nextWorkspace = ingestFilesIntoWorkspace(current, files);

  data.workspaces[workspaceId] = nextWorkspace;
  saveStorage(storage, data);
  return nextWorkspace;
}

export function removeDocumentFromWorkspace(
  workspace: ReturnWorkspaceRecord,
  documentId: string
) {
  const removedDocument = workspace.documents.find((document) => document.id === documentId);
  const nextDocuments = workspace.documents.filter((document) => document.id !== documentId);

  if (!removedDocument || nextDocuments.length === workspace.documents.length) {
    return workspace;
  }

  const occurredAt = new Date().toISOString();
  const workspaceLabel = workspace.storageMode === "hosted-postgres"
    ? "your account"
    : "your device";
  const auditTrail = appendAuditTrailEvent(workspace.auditTrail, {
    occurredAt,
    kind: "document-removed",
    message: `Removed ${removedDocument.label} from the ${workspaceLabel}.`,
    documentIds: [removedDocument.id],
    questionId: null,
    answerText: null
  });

  return buildWorkspace(
    workspace.id,
    nextDocuments,
    workspace.createdAt,
    workspace.seededReturn.interviewQuestions,
    occurredAt,
    auditTrail,
    workspace.storageMode,
    workspace.guidedCompletion ?? null
  );
}

export function removeDocument(storage: Storage, workspaceId: string, documentId: string) {
  const data = loadStorage(storage);
  const current = data.workspaces[workspaceId] ?? createWorkspace(workspaceId);
  const nextWorkspace = removeDocumentFromWorkspace(current, documentId);

  data.workspaces[workspaceId] = nextWorkspace;
  saveStorage(storage, data);
  return nextWorkspace;
}

export function confirmWorkspaceDocumentTaxYear(
  workspace: ReturnWorkspaceRecord,
  documentId: string,
  taxYear: number | null
): ReturnWorkspaceRecord {
  if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < 1900 || taxYear > 2100)) {
    throw new Error("Enter the actual four-digit document year.");
  }
  const document = workspace.documents.find((entry) => entry.id === documentId);
  if (!document) throw new Error("The source document is no longer available.");
  const fixtureYear = officialFixtureCatalog.find((entry) => entry.id === document.matchedFixtureId)?.taxYearHint;
  if (fixtureYear != null && taxYear !== fixtureYear) throw new Error("An official sample's year cannot be changed.");
  if (document.taxYear === taxYear) return workspace;
  const occurredAt = new Date().toISOString();
  const questions = workspace.seededReturn.interviewQuestions.map((question) =>
    question.sourceDocumentIds.includes(documentId)
      ? { ...question, status: "pending" as const, answerText: null, answeredAt: null }
      : question
  );
  const auditTrail = appendAuditTrailEvent(workspace.auditTrail, {
    occurredAt,
    kind: "document-year-confirmed",
    message: taxYear === null ? `Marked ${document.label} tax year as unknown.` : `Confirmed ${document.label} tax year as ${taxYear}.`,
    documentIds: [documentId], questionId: null, answerText: null,
  });
  return buildWorkspace(workspace.id,
    workspace.documents.map((entry) => entry.id === documentId ? { ...entry, taxYear } : entry),
    workspace.createdAt, questions, occurredAt, auditTrail, workspace.storageMode,
    workspace.guidedCompletion ?? null);
}

export function clearWorkspaceRecord(workspace: ReturnWorkspaceRecord) {
  const occurredAt = new Date().toISOString();
  const resetLabel = workspace.storageMode === "hosted-postgres"
    ? "Reset return on server"
    : "Reset local return";
  const auditTrail = appendAuditTrailEvent(workspace.auditTrail, {
    occurredAt,
    kind: "workspace-cleared",
    message: `${resetLabel} and removed ${workspace.documents.length} document(s).`,
    documentIds: workspace.documents.map((document) => document.id),
    questionId: null,
    answerText: null
  });
  return buildWorkspace(
    workspace.id,
    [],
    workspace.createdAt,
    [],
    occurredAt,
    auditTrail,
    workspace.storageMode,
    null
  );
}

export function clearWorkspace(storage: Storage, workspaceId: string) {
  const data = loadStorage(storage);
  const current = data.workspaces[workspaceId] ?? createWorkspace(workspaceId);
  const nextWorkspace = clearWorkspaceRecord(current);

  data.workspaces[workspaceId] = nextWorkspace;
  saveStorage(storage, data);
  return nextWorkspace;
}

function updateInterviewQuestionStateInWorkspace(
  workspace: ReturnWorkspaceRecord,
  questionId: SeededFactId,
  status: InterviewQuestionRecord["status"],
  answerText?: string
) {
  if (!workspace.seededReturn.interviewQuestions.some((question) => question.id === questionId)) {
    return workspace;
  }

  const normalizedAnswerText = typeof answerText === "string" ? answerText.trim() : null;

  if (status === "answered" && !normalizedAnswerText) {
    return workspace;
  }

  const targetQuestion = workspace.seededReturn.interviewQuestions.find((question) => question.id === questionId);

  if (!targetQuestion) {
    return workspace;
  }

  const nextQuestions = workspace.seededReturn.interviewQuestions.map((question) => {
    if (question.id !== questionId) {
      return question;
    }

    return {
      ...question,
      status,
      answeredAt: status === "answered" ? new Date().toISOString() : null,
      answerText: status === "answered" ? normalizedAnswerText : null
    };
  });
  const occurredAt = new Date().toISOString();
  const auditTrail = appendAuditTrailEvent(workspace.auditTrail, {
    occurredAt,
    kind: status === "answered" ? "interview-answered" : "interview-reopened",
    message: `${status === "answered" ? "Saved answer" : "Reopened question"} for ${seededFactLabels[questionId]}.`,
    documentIds: targetQuestion.sourceDocumentIds,
    questionId,
    answerText: status === "answered" ? normalizedAnswerText : null
  });
  return buildWorkspace(
    workspace.id,
    workspace.documents,
    workspace.createdAt,
    nextQuestions,
    occurredAt,
    auditTrail,
    workspace.storageMode,
    workspace.guidedCompletion ?? null
  );
}

function updateInterviewQuestionState(
  storage: Storage,
  workspaceId: string,
  questionId: SeededFactId,
  status: InterviewQuestionRecord["status"],
  answerText?: string
) {
  const data = loadStorage(storage);
  const current = data.workspaces[workspaceId] ?? createWorkspace(workspaceId);
  const nextWorkspace = updateInterviewQuestionStateInWorkspace(
    current,
    questionId,
    status,
    answerText
  );

  data.workspaces[workspaceId] = nextWorkspace;
  saveStorage(storage, data);
  return nextWorkspace;
}

export function answerWorkspaceInterviewQuestion(
  workspace: ReturnWorkspaceRecord,
  questionId: SeededFactId,
  answerText: string
) {
  return updateInterviewQuestionStateInWorkspace(workspace, questionId, "answered", answerText);
}

export function answerInterviewQuestion(
  storage: Storage,
  workspaceId: string,
  questionId: SeededFactId,
  answerText: string
) {
  return updateInterviewQuestionState(storage, workspaceId, questionId, "answered", answerText);
}

export function reopenWorkspaceInterviewQuestion(
  workspace: ReturnWorkspaceRecord,
  questionId: SeededFactId
) {
  return updateInterviewQuestionStateInWorkspace(workspace, questionId, "pending");
}

export function reopenInterviewQuestion(storage: Storage, workspaceId: string, questionId: SeededFactId) {
  return updateInterviewQuestionState(storage, workspaceId, questionId, "pending");
}

export function saveWorkspaceSnapshot(storage: Storage, workspace: ReturnWorkspaceRecord) {
  const data = loadStorage(storage);
  const nextWorkspace = hydrateWorkspaceRecord(workspace.id, {
    ...workspace,
    storageMode: "local-browser"
  });

  data.workspaces[nextWorkspace.id] = nextWorkspace;
  saveStorage(storage, data);
  return nextWorkspace;
}

/**
 * Sync guided interview data into a workspace by injecting synthetic documents
 * and auto-answering the corresponding seeded facts. This bridges the guided
 * interview's section data model into the workspace's document/fact model so
 * that switching to power-user mode shows the guided data.
 *
 * Guided documents replace any prior guided-prefixed documents but preserve
 * documents uploaded through the normal file ingestion path.
 */
export function syncGuidedFlowToWorkspace(
  workspace: ReturnWorkspaceRecord,
  syntheticDocuments: WorkspaceDocumentRecord[],
  factAnswers: { factId: string; answerText: string }[],
  guidedFlowState?: GuidedFlowState | null
): ReturnWorkspaceRecord {
  // Remove prior guided synthetic documents, keep user-uploaded ones
  const userDocuments = workspace.documents.filter(
    (document) => !document.id.startsWith("guided:")
  );
  const nextDocuments = [...userDocuments, ...syntheticDocuments];

  // Build previous questions: keep any already-answered non-guided questions,
  // then add guided fact answers on top
  const guidedFactIds = new Set(factAnswers.map((a) => a.factId));
  const previousQuestions = workspace.seededReturn.interviewQuestions
    .filter((question) => !guidedFactIds.has(question.id));

  // Build the workspace with the merged documents + previous answers
  const occurredAt = new Date().toISOString();
  const guidedCompletion = guidedFlowState === undefined
    ? workspace.guidedCompletion ?? null
    : buildGuidedCompletion(guidedFlowState);
  const interimWorkspace = buildWorkspace(
    workspace.id,
    nextDocuments,
    workspace.createdAt,
    previousQuestions,
    occurredAt,
    workspace.auditTrail,
    workspace.storageMode,
    guidedCompletion
  );

  // Now apply guided fact answers as interview answers
  let result = interimWorkspace;
  for (const { factId, answerText } of factAnswers) {
    if (result.seededReturn.interviewQuestions.some((q) => q.id === factId)) {
      result = answerWorkspaceInterviewQuestion(
        result,
        factId as SeededFactId,
        answerText
      );
    }
  }

  return result;
}

export function deleteWorkspace(storage: Storage, workspaceId: string) {
  const data = loadStorage(storage);
  clearGuidedFlowState(storage, workspaceId);
  storage.removeItem(`tax-engine:guided-mode:${workspaceId}`);

  if (!data.workspaces[workspaceId]) {
    return listWorkspaces(storage);
  }

  delete data.workspaces[workspaceId];
  saveStorage(storage, data);
  return Object.values(data.workspaces).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

/**
 * Lazily compute the engine preview for a workspace. The tax engine is loaded
 * on-demand via dynamic import so it doesn't bloat the initial client bundle.
 * Returns a new workspace record with the engine preview filled in, or the
 * original workspace unchanged if the preview is not applicable.
 */
export async function refreshWorkspaceEnginePreview(
  workspace: ReturnWorkspaceRecord,
  taxpayer?: import("@/models/inputs").Taxpayer
): Promise<ReturnWorkspaceRecord> {
  const enginePreview = await lazyBuildWorkspaceEnginePreview(
    workspace.documents,
    workspace.returnSummary,
    workspace.structuredFacts,
    taxpayer
  );
  if (enginePreview === workspace.enginePreview) return workspace;
  return { ...workspace, enginePreview };
}

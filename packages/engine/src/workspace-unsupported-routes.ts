import type {
  ReturnWorkspaceRecord,
  SeededFactId,
  WorkspaceReturnSummaryItem,
  WorkspaceUnsupportedRoute,
  WorkspaceReturnSummaryBlocker
} from "@tax-engine/contracts";

function isPendingReviewCoverage(coverage: ReturnWorkspaceRecord["documents"][number]["coverage"]) {
  return coverage === "partially-supported"
    || coverage === "planned"
    || coverage === "needs-review"
    || coverage === "unsupported";
}

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values));
}

function collectFactIds(
  blockers: WorkspaceReturnSummaryBlocker[],
  additionalFactIds: SeededFactId[] = []
) {
  return dedupe([
    ...blockers.flatMap((blocker) => blocker.relatedFactIds),
    ...additionalFactIds
  ]);
}

function collectDocumentIds(
  blockers: WorkspaceReturnSummaryBlocker[],
  additionalDocumentIds: string[] = []
) {
  return dedupe([
    ...blockers.flatMap((blocker) => blocker.sourceDocumentIds),
    ...additionalDocumentIds
  ]);
}

function collectReasons(
  blockers: WorkspaceReturnSummaryBlocker[],
  additionalReasons: string[] = []
) {
  return dedupe([
    ...blockers.map((blocker) => blocker.message),
    ...additionalReasons
  ]);
}

function collectItemFactIds(items: WorkspaceReturnSummaryItem[]) {
  return dedupe(items.flatMap((item) => item.relatedFactIds));
}

function collectItemDocumentIds(items: WorkspaceReturnSummaryItem[]) {
  return dedupe(items.flatMap((item) => item.sourceDocumentIds));
}

function isUnsupportedRouteRelevant(workspace: ReturnWorkspaceRecord) {
  if (workspace.documents.length === 0) {
    return false;
  }

  return workspace.returnSummary.status === "needs-review"
    || workspace.documents.some((document) => isPendingReviewCoverage(document.coverage))
    || workspace.returnSummary.blockers.some((blocker) => !blocker.id.startsWith("needs-answer:"));
}

export function buildWorkspaceUnsupportedRoutes(
  workspace: ReturnWorkspaceRecord
): WorkspaceUnsupportedRoute[] {
  if (!isUnsupportedRouteRelevant(workspace)) {
    return [];
  }

  const pendingQuestions = workspace.seededReturn.interviewQuestions.filter(
    (question) => question.status === "pending"
  );
  const answerBlockers = workspace.returnSummary.blockers.filter((blocker) =>
    blocker.id.startsWith("needs-answer:")
  );
  const reviewBlockers = workspace.returnSummary.blockers.filter((blocker) =>
    !blocker.id.startsWith("needs-answer:")
  );
  const unsupportedDocuments = workspace.documents.filter((document) => isPendingReviewCoverage(document.coverage));
  const workspaceItemFactIds = collectItemFactIds(workspace.returnSummary.items);
  const workspaceItemDocumentIds = collectItemDocumentIds(workspace.returnSummary.items);
  const routes: WorkspaceUnsupportedRoute[] = [];

  if (pendingQuestions.length > 0 || answerBlockers.length > 0) {
    routes.push({
      id: "continue-interview",
      urgency: "now",
      title: "Answer remaining questions",
      description: pendingQuestions.length > 0
        ? `You have ${pendingQuestions.length} unanswered question${pendingQuestions.length === 1 ? "" : "s"} that may affect your return.`
        : "Finish answering the remaining questions so your return is as complete as possible.",
      blockerIds: dedupe(answerBlockers.map((blocker) => blocker.id)),
      relatedFactIds: collectFactIds(answerBlockers, pendingQuestions.map((question) => question.factId)),
      sourceDocumentIds: collectDocumentIds(
        answerBlockers,
        pendingQuestions.flatMap((question) => question.sourceDocumentIds)
      ),
      reasons: collectReasons(
        answerBlockers,
        pendingQuestions.map((question) => question.prompt)
      )
    });
  }

  const filingPackReasons = collectReasons(
    [...answerBlockers, ...reviewBlockers],
    unsupportedDocuments.map((document) => `${document.label} is marked ${document.coverage}.`)
  );
  const filingPackRelatedFactIds = collectFactIds([...answerBlockers, ...reviewBlockers]);
  const filingPackSourceDocumentIds = collectDocumentIds(
    [...answerBlockers, ...reviewBlockers],
    unsupportedDocuments.map((document) => document.id)
  );
  const filingPackNeedsWorkspaceTrace = filingPackRelatedFactIds.length === 0
    && filingPackSourceDocumentIds.length === 0;
  const filingPackReady = workspace.returnSummary.status === "ready-to-recompute";

  if (filingPackReasons.length > 0 && workspace.documents.length > 0) {
    routes.push({
      id: "review-filing-pack",
      urgency: pendingQuestions.length > 0 ? "next" : "now",
      title: filingPackReady ? "Download your completed return" : "Download your draft return packet",
      description: pendingQuestions.length > 0
        ? "Re-download your draft packet after making changes so the notes and action items stay up to date."
        : filingPackReady
          ? "Download your completed return — any items still needing attention are noted in the export."
          : "Download your draft return packet. Any items still needing attention are noted in the export.",
      blockerIds: dedupe([
        ...answerBlockers.map((blocker) => blocker.id),
        ...reviewBlockers.map((blocker) => blocker.id)
      ]),
      relatedFactIds: filingPackNeedsWorkspaceTrace
        ? workspaceItemFactIds
        : filingPackRelatedFactIds,
      sourceDocumentIds: filingPackNeedsWorkspaceTrace
        ? workspaceItemDocumentIds
        : filingPackSourceDocumentIds,
      reasons: filingPackReasons
    });
  }

  const partnerReviewRelatedFactIds = collectFactIds(reviewBlockers);
  const partnerReviewSourceDocumentIds = collectDocumentIds(
    reviewBlockers,
    unsupportedDocuments.map((document) => document.id)
  );
  const partnerReviewNeedsWorkspaceTrace = partnerReviewRelatedFactIds.length === 0
    && partnerReviewSourceDocumentIds.length === 0;

  if (reviewBlockers.length > 0 || unsupportedDocuments.length > 0) {
    routes.push({
      id: "partner-review-later",
      urgency: "later",
      title: "Consider a professional review",
      description: "Download a summary you can share with a tax professional. This app does not contact, assign, or engage a reviewer for you.",
      blockerIds: dedupe(reviewBlockers.map((blocker) => blocker.id)),
      relatedFactIds: partnerReviewNeedsWorkspaceTrace
        ? workspaceItemFactIds
        : partnerReviewRelatedFactIds,
      sourceDocumentIds: partnerReviewNeedsWorkspaceTrace
        ? workspaceItemDocumentIds
        : partnerReviewSourceDocumentIds,
      reasons: collectReasons(
        reviewBlockers,
        unsupportedDocuments.map((document) => `${document.label} is marked ${document.coverage}.`)
      )
    });
  }

  return routes;
}

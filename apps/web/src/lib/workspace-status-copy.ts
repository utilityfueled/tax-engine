import {
  isSupportedEngineTaxYear,
  latestEngineTargetYear,
  type WorkspaceGuidedCompletion,
  type WorkspaceDocumentRecord,
  type ReturnWorkspaceRecord,
  type WorkspaceReturnSummary,
  type WorkspaceUnsupportedRoute
} from "@tax-engine/contracts";
import {
  buildSectionRoute,
  isSegmentationComplete,
  summarizeFlowCompletion,
  type GuidedFlowState
} from "./guided-interview-flow";

export interface GuidedSetupProgressSummary {
  statusLabel: string;
  progressLabel: string;
  helperText: string;
}

export interface GuidedCompletionStatusSummary {
  statusLabel: string;
  progressLabel: string;
  helperText: string;
}

export interface PendingInterviewQuestionsSummary {
  count: number;
  progressLabel: string;
  helperText: string;
}

export function canPresentCompletedReturnDownload({
  returnSummary,
  guidedFlowState,
  pendingInterviewQuestionCount,
  guidedReviewIssueCount,
  hasEnginePreview
}: {
  returnSummary: WorkspaceReturnSummary;
  guidedFlowState: GuidedFlowState | null;
  pendingInterviewQuestionCount: number;
  guidedReviewIssueCount: number;
  hasEnginePreview: boolean;
}) {
  if (pendingInterviewQuestionCount > 0 || guidedReviewIssueCount > 0) {
    return false;
  }

  if (returnSummary.targetTaxYear === null
    || !isSupportedEngineTaxYear(returnSummary.targetTaxYear)
    || returnSummary.taxYearState !== "single"
    || returnSummary.blockers.some(blocker => blocker.id === "unsupported-tax-year" || blocker.id.startsWith("guided:"))) {
    return false;
  }

  if (returnSummary.status === "ready-to-recompute" || hasEnginePreview) {
    return true;
  }

  return guidedFlowState?.phase === "complete";
}

export function hasBlockingWorkspaceActions(
  unsupportedRoutes: ReadonlyArray<Pick<WorkspaceUnsupportedRoute, "id">>,
  {
    pendingInterviewQuestionCount,
    guidedReviewIssueCount
  }: {
    pendingInterviewQuestionCount: number;
    guidedReviewIssueCount: number;
  }
) {
  if (pendingInterviewQuestionCount > 0 || guidedReviewIssueCount > 0) {
    return true;
  }

  return unsupportedRoutes.some((route) => route.id === "continue-interview");
}

function getUnsupportedTaxYearBlocker(returnSummary: WorkspaceReturnSummary) {
  return returnSummary.blockers.find((blocker) => blocker.id === "unsupported-tax-year") ?? null;
}

export function hasUnsupportedTaxYear(returnSummary: WorkspaceReturnSummary) {
  return getUnsupportedTaxYearBlocker(returnSummary) !== null;
}

export function formatWorkspaceTaxYearSummary(returnSummary: WorkspaceReturnSummary) {
  const targetTaxYear = returnSummary.targetTaxYear;

  if (targetTaxYear === null) {
    return "not set yet";
  }

  if (hasUnsupportedTaxYear(returnSummary)) {
    return `${targetTaxYear} not supported yet`;
  }

  return String(targetTaxYear);
}

export function formatUnsupportedTaxYearNotice(returnSummary: WorkspaceReturnSummary) {
  return getUnsupportedTaxYearBlocker(returnSummary)?.message ?? null;
}

export function formatWorkspaceCalculationStatus(
  supportedDocumentCount: number,
  returnSummary: WorkspaceReturnSummary
) {
  if (!hasUnsupportedTaxYear(returnSummary) || returnSummary.targetTaxYear === null) {
    return `${supportedDocumentCount} document${supportedDocumentCount === 1 ? "" : "s"} ready for calculation`;
  }

  return [
    `${supportedDocumentCount} document${supportedDocumentCount === 1 ? " matches" : "s match"} supported forms`,
    `but tax year ${returnSummary.targetTaxYear} cannot be calculated yet.`,
    `Latest supported year: ${latestEngineTargetYear}.`
  ].join(" ");
}

export function formatDocumentCoverageLabel(
  coverage: string,
  returnSummary: WorkspaceReturnSummary
) {
  if (coverage === "reviewed") {
    return "reviewed";
  }

  if (coverage === "supported" && hasUnsupportedTaxYear(returnSummary)) {
    return "supported form";
  }

  return coverage.replace(/-/g, " ");
}

export function formatDocumentCoverageNote(
  coverage: string,
  returnSummary: WorkspaceReturnSummary
) {
  if (coverage === "reviewed") {
    return "This upload has been reviewed and no longer blocks final return generation.";
  }

  if (coverage !== "supported" || !hasUnsupportedTaxYear(returnSummary) || returnSummary.targetTaxYear === null) {
    return null;
  }

  return `This form is supported, but tax year ${returnSummary.targetTaxYear} cannot drive the engine yet. Latest supported year: ${latestEngineTargetYear}.`;
}

export function summarizeGuidedSetupProgress(
  guidedFlowState: GuidedFlowState | null
): GuidedSetupProgressSummary | null {
  if (!guidedFlowState) {
    return null;
  }

  const visitedSectionCount = guidedFlowState.completedSections.length;
  const completion = summarizeFlowCompletion(guidedFlowState);
  const completedSectionCount = completion.completedSections;
  const pendingReviewCount = completion.skippedSections + completion.needsReviewSections;
  const hasSavedProgress = isSegmentationComplete(guidedFlowState.segmentation)
    || visitedSectionCount > 0
    || guidedFlowState.phase === "complete";

  if (!hasSavedProgress) {
    return null;
  }

  const routedSections = buildSectionRoute(guidedFlowState.segmentation);
  const currentSection = guidedFlowState.phase === "interview"
    ? routedSections[guidedFlowState.currentSectionIndex] ?? null
    : null;

  const progressLabel = guidedFlowState.phase === "complete" && completion.totalSections > 0
    ? `${completedSectionCount} of ${completion.totalSections} guided sections complete`
    : completedSectionCount > 0
      ? `${completedSectionCount} guided section${completedSectionCount === 1 ? "" : "s"} saved`
      : "Guided setup saved";

  const helperText = guidedFlowState.phase === "complete"
    ? pendingReviewCount > 0
      ? pendingReviewCount === 1
        ? "Your guided interview is saved, but 1 section was skipped or still needs review."
        : `Your guided interview is saved, but ${pendingReviewCount} sections were skipped or still need review.`
      : "Your guided interview answers are saved and ready for review."
    : currentSection
      ? `Your guided interview is ready to resume at ${currentSection.label}.`
      : "Your guided interview setup is saved and ready to resume.";

  return {
    statusLabel: "Guided setup saved",
    progressLabel,
    helperText
  };
}

export function summarizeWorkspaceGuidedCompletion(
  guidedCompletion: WorkspaceGuidedCompletion | null | undefined
): GuidedCompletionStatusSummary | null {
  if (!guidedCompletion) {
    return null;
  }

  const classifiedPending = guidedCompletion.skippedSectionCount + guidedCompletion.needsReviewSectionCount;
  const unvisited = Number.isInteger(guidedCompletion.totalSectionCount) && Number.isInteger(guidedCompletion.completedSectionCount)
    ? Math.max(0, guidedCompletion.totalSectionCount - guidedCompletion.completedSectionCount - classifiedPending)
    : 0;
  const pendingReviewCount = classifiedPending + unvisited;

  if (pendingReviewCount === 0) {
    return null;
  }

  return {
    statusLabel: "Needs review",
    progressLabel: pendingReviewCount === 1
      ? "1 guided section still needs review"
      : `${pendingReviewCount} guided sections still need review`,
    helperText: unvisited > 0
      ? `Your guided interview answers are saved, but ${pendingReviewCount} section${pendingReviewCount === 1 ? " is" : "s are"} incomplete or still need${pendingReviewCount === 1 ? "s" : ""} review before this return is ready.`
      : pendingReviewCount === 1
      ? "Your guided interview answers are synced, but 1 section was skipped or still needs review before this return is ready."
      : `Your guided interview answers are synced, but ${pendingReviewCount} sections were skipped or still need review before this return is ready.`
  };
}

export function summarizePendingInterviewQuestions(
  interviewQuestions: ReadonlyArray<
    Pick<ReturnWorkspaceRecord["seededReturn"]["interviewQuestions"][number], "status">
  >
): PendingInterviewQuestionsSummary | null {
  const count = interviewQuestions.filter((question) => question.status === "pending").length;

  if (count === 0) {
    return null;
  }

  return {
    count,
    progressLabel: count === 1 ? "1 question remaining" : `${count} questions remaining`,
    helperText: count === 1
      ? "One return question still needs your answer before we can generate the final return."
      : `${count} return questions still need your answers before we can generate the final return.`,
  };
}

export function isGuidedSyntheticDocument(
  document: Pick<WorkspaceDocumentRecord, "id">
) {
  return document.id.startsWith("guided:");
}

export function countUploadedDocuments(
  documents: ReadonlyArray<Pick<WorkspaceDocumentRecord, "id">>
) {
  return documents.filter((document) => !isGuidedSyntheticDocument(document)).length;
}

export function countGuidedSyntheticDocuments(
  documents: ReadonlyArray<Pick<WorkspaceDocumentRecord, "id">>
) {
  return documents.filter((document) => isGuidedSyntheticDocument(document)).length;
}

export function countUploadedSupportedDocuments(
  documents: ReadonlyArray<Pick<WorkspaceDocumentRecord, "id" | "coverage">>
) {
  return documents.filter((document) =>
    !isGuidedSyntheticDocument(document) && document.coverage === "supported"
  ).length;
}

export function isUntouchedWorkspaceShell(workspace: ReturnWorkspaceRecord) {
  return workspace.summary.totalDocuments === 0
    && workspace.seededReturn.status === "empty"
    && workspace.auditTrail.length === 1
    && workspace.auditTrail[0]?.kind === "workspace-created";
}

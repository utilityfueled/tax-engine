import { isSupportedEngineTaxYear, latestEngineTargetYear, officialSampleDocumentFixtures, type ReturnWorkspaceRecord, type WorkspaceReturnSummaryBlocker } from "@tax-engine/contracts";
import { isSegmentationComplete, summarizeFlowCompletion, type GuidedFlowState } from "./guided-interview-flow";

function validYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100;
}

/** Display/readiness metadata derived from existing local facts, never new source facts. */
export function reconcileWorkspaceGuidedState(workspace: ReturnWorkspaceRecord, flow: GuidedFlowState | null | undefined): ReturnWorkspaceRecord {
  if (!flow) return workspace;
  let completion: ReturnType<typeof summarizeFlowCompletion>;
  try { completion = summarizeFlowCompletion(flow); } catch { return workspace; }
  const guidedYear = validYear(flow.taxYear) ? flow.taxYear : null;
  const originalDocuments = workspace.documents.filter(document => !document.id.startsWith("guided:"));
  const documentYears = originalDocuments.map(document => {
    if (document.taxYear !== undefined) return validYear(document.taxYear) ? document.taxYear : null;
    const fixture = officialSampleDocumentFixtures.find(entry => entry.id === document.matchedFixtureId);
    return validYear(fixture?.taxYearHint) ? fixture.taxYearHint : null;
  });
  const knownYears = [...new Set(documentYears.filter(validYear))];
  const conflict = knownYears.length > 1 || (guidedYear !== null && knownYears.some(year => year !== guidedYear));
  const unknownSourceYear = documentYears.some(year => year === null);
  const targetTaxYear = guidedYear ?? (knownYears.length === 1 ? knownYears[0]! : null);
  const yearKnown = guidedYear !== null && !conflict && !unknownSourceYear;
  const yearSupported = targetTaxYear !== null && isSupportedEngineTaxYear(targetTaxYear);
  const pending = completion.totalSections - completion.completedSections;
  const complete = flow.phase === "complete" && isSegmentationComplete(flow.segmentation)
    && completion.totalSections > 0 && pending === 0;
  const blocker = (id: string, message: string): WorkspaceReturnSummaryBlocker => ({ id, message, relatedFactIds: [], sourceDocumentIds: [] });
  const blockers = workspace.returnSummary.blockers.filter(entry => !entry.id.startsWith("guided:") && entry.id !== "needs-answer:guided-follow-up"
    && entry.id !== "unsupported-tax-year" && !(originalDocuments.length === 0 && entry.id === "missing-tax-year"));
  if (guidedYear === null) blockers.push(blocker("guided:missing-tax-year", "Select the actual tax year in the saved guided interview; an omitted year is still unknown."));
  if (conflict) blockers.push(blocker("guided:conflicting-source-years", "The guided return year conflicts with original document years. Reconcile the sources before calculating."));
  if (unknownSourceYear) blockers.push(blocker("guided:unknown-document-year", "An original document's tax year is unknown. The guided year does not supply its source year."));
  if (targetTaxYear !== null && !yearSupported) blockers.push(blocker("unsupported-tax-year", `Tax year ${targetTaxYear} is not available for deterministic recompute yet. Latest supported engine year: ${latestEngineTargetYear}.`));
  if (!complete) blockers.push(blocker("guided:incomplete-facts", pending > 0 ? `${pending} guided section${pending === 1 ? "" : "s"} still need${pending === 1 ? "s" : ""} completion or review.` : "Finish the guided interview before reviewing the return."));
  const sourceBlockers = blockers.filter(entry => entry.id !== "guided:incomplete-facts");
  const ready = complete && yearKnown && yearSupported && blockers.length === 0;
  const status = ready ? "ready-to-recompute" : sourceBlockers.length ? "needs-review" : "awaiting-interview";
  const guidedOnly = originalDocuments.length === 0;
  return {
    ...workspace,
    summary: { ...workspace.summary, interviewQuestionsRemaining: Math.max(workspace.seededReturn.interviewQuestions.filter(question => question.status === "pending").length, pending) },
    returnSummary: { ...workspace.returnSummary, targetTaxYear, taxYearState: conflict ? "multiple" : yearKnown ? "single" : "missing", status, blockers },
    // The stored preview has no digest tying it to these saved guided facts.
    // The guided preview can be recomputed from the actual local interview.
    enginePreview: null,
    guidedCompletion: flow.phase === "complete" ? { completedSectionCount: completion.completedSections, totalSectionCount: completion.totalSections,
      skippedSectionCount: completion.skippedSections, needsReviewSectionCount: completion.needsReviewSections } : null,
    checklist: workspace.checklist.map(item => {
      if (item.id === "documents" && guidedOnly) return { ...item, label: "Guided facts saved", status: "ready" };
      if (item.id === "coverage" && guidedOnly) return { ...item, label: "Check tax year and source facts", status: yearKnown && yearSupported ? "ready" : "blocked" };
      if (item.id === "interview") return { ...item, label: guidedOnly ? "Complete guided questions" : item.label, status: complete ? "ready" : "needs-input" };
      if (item.id === "review") return { ...item, status: ready ? "ready" : "blocked" };
      return item;
    }),
  };
}
